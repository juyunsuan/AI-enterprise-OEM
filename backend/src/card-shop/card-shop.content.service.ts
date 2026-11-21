import {
  type CardShopContent,
  type CardShopContentSaveBody,
  type CardShopPublicBootstrap,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { CardShopSiteService } from './card-shop.site.service';
import type { CardShopSiteContext } from './card-shop.site-context';
import {
  clip,
  contentKind,
  imageList,
  intIn,
  iso,
  pageArgs,
  safeLink,
  sanitizeRichText,
} from './card-shop.shared';

/** 单站点内容条数上限：公告/资讯是给买家看的，几百条已经翻不完，多只会拖慢 bootstrap。 */
const CONTENT_QUOTA = 500;

type ContentRow = {
  id: number;
  siteId: number;
  kind: string;
  title: string;
  summary: string;
  coverImage: string;
  images: unknown;
  content: string;
  link: string;
  popAuto: boolean;
  sort: number;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 站点内容：公告（首页公告栏 / 自动弹出）、资讯、单页（关于我们 / 帮助）。
 *
 * 正文是店主自己写的 HTML，入库前统一过 `sanitizeRichText`——小程序 `rich-text` 与后台预览
 * 都直接吃这段字符串，脚本、事件属性、`javascript:` 链接必须在写库前就没掉，而不是指望渲染端。
 */
export class CardShopContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
  ) {}

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopContent>> {
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = { siteId };
    const kind = query.kind;
    if (kind === 'NOTICE' || kind === 'ARTICLE' || kind === 'PAGE') {
      where.kind = kind;
    }
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { summary: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cardShopContent.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopContent.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as ContentRow[]).map(toContent),
      total,
      page,
      pageSize,
    );
  }

  async detail(
    user: CurrentUser,
    siteId: number,
    id: number,
  ): Promise<CardShopContent> {
    await this.sites.requireSite(user, siteId);
    const row = await this.prisma.cardShopContent.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在');
    return toContent(row);
  }

  async save(
    user: CurrentUser,
    body: CardShopContentSaveBody,
  ): Promise<CardShopContent> {
    const site = await this.sites.requireSite(user, body.siteId);
    const title = clip(body.title, 200).trim();
    if (!title) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '标题不能为空');
    }
    const data = {
      kind: contentKind(body.kind),
      title,
      summary: clip(body.summary, 300).trim(),
      coverImage: imageList([body.coverImage], 1)[0] ?? '',
      images: imageList(body.images, 9),
      content: sanitizeRichText(body.content),
      link: safeLink(body.link),
      popAuto: body.popAuto === true,
      sort: intIn(body.sort, 0, 9999, 0),
      status: body.status !== false,
    };
    const id = Number(body.id || 0);
    if (id > 0) {
      const row = await this.prisma.cardShopContent.findFirst({
        where: { id, siteId: site.siteId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在');
      await this.prisma.cardShopContent.update({ where: { id }, data });
      const saved = await this.prisma.cardShopContent.findUnique({
        where: { id },
      });
      return toContent(saved as unknown as ContentRow);
    }
    const existing = await this.prisma.cardShopContent.count({
      where: { siteId: site.siteId },
    });
    if (existing >= CONTENT_QUOTA) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `单个站点最多 ${CONTENT_QUOTA} 条内容，请先清理不再展示的公告与资讯`,
      );
    }
    const created = await this.prisma.cardShopContent.create({
      data: { siteId: site.siteId, ...data },
    });
    return toContent(created);
  }

  async remove(user: CurrentUser, siteId: number, id: number) {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.cardShopContent.findFirst({
      where: { id: Number(id), siteId: site.siteId },
      select: { id: true, title: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在');
    await this.prisma.cardShopContent.delete({ where: { id: row.id } });
    return { ok: true, message: `已删除「${row.title}」` };
  }

  // ---------- C 端只读（bootstrap 与内容页共用，只给启用的行）----------

  /**
   * 首页要展示的内容：公告取前 N 条，轮播位复用「带封面图的公告」——
   * 少一个表少一处口径分叉，店主只需要维护「公告」这一种带封面的内容。
   * 形状直接对齐 bootstrap 契约，公开路由不再二次映射。
   */
  async publicView(
    siteId: number,
    noticeLimit = 5,
  ): Promise<{
    notices: CardShopPublicBootstrap['notices'];
    banners: CardShopPublicBootstrap['banners'];
  }> {
    const rows = (await this.prisma.cardShopContent.findMany({
      where: { siteId, status: true, kind: 'NOTICE' },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: 50,
    })) as unknown as ContentRow[];
    const limit = Math.max(1, Math.min(noticeLimit, 20));
    const notices = rows.slice(0, limit).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      popAuto: row.popAuto,
    }));
    const banners = rows
      .filter((row) => row.coverImage)
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        title: row.title,
        image: row.coverImage,
        link: row.link,
      }));
    return { notices, banners };
  }

  /**
   * 买家侧内容清单（资讯页 / 单页页签用）。
   * 站点关掉「资讯与单页」时整块功能关闭，给一句能看懂的话而不是空列表。
   */
  async publicList(
    site: CardShopSiteContext,
    kind: string,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopContent>> {
    if (site.toggles.article === false) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '该商店未开启资讯与单页功能',
      );
    }
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = {
      siteId: site.siteId,
      status: true,
    };
    if (kind === 'ARTICLE' || kind === 'PAGE' || kind === 'NOTICE')
      where.kind = kind;
    const rows = (await this.prisma.cardShopContent.findMany({
      where,
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: pageSize,
    })) as unknown as ContentRow[];
    const total = await this.prisma.cardShopContent.count({ where });
    return pageOf(rows.map(toContent), total, page, pageSize);
  }

  /** 买家看单条内容：按站点 + id 双条件，未启用的一律当不存在。 */
  async publicDetail(
    siteId: number,
    id: number,
  ): Promise<CardShopContent | null> {
    const row = await this.prisma.cardShopContent.findFirst({
      where: { id: Number(id), siteId, status: true },
    });
    return row ? toContent(row) : null;
  }
}

function toContent(row: ContentRow): CardShopContent {
  return {
    id: row.id,
    siteId: row.siteId,
    kind: contentKind(row.kind),
    title: row.title,
    summary: row.summary,
    coverImage: row.coverImage,
    images: imageList(row.images, 9),
    content: row.content,
    link: row.link,
    popAuto: row.popAuto,
    sort: row.sort,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
