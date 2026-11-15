import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSiteService } from './geo-site.service';
import { GeoSitePageService } from './geo-site-page.service';
import {
  assertElementTree,
  clipText,
  type GeoSiteElement,
  toText,
} from './geo-site.shared';

/**
 * 站点模板库：把画布上做好的一页或选中的一个区块另存下来，跨页面复用。
 *
 * 三条口径：
 * 1) 归属只认站点——模板挂在 siteId 下，任何读写都先 requireSite，跨站取模板一律 403；
 * 2) 内容仍是元素树——存前和页面一样过 assertElementTree，套用后由页面保存再校验一次，
 *    白名单之外的类型/样式在落库那一刻就被拒，不会等到公开页才发现；
 * 3) 套用不产生新页面——PAGE 模板整页替换、BLOCK 模板按位置插入，最终都走
 *    GeoSitePageService.saveContent，首页双写 geo_sites.content 的老规矩不会被绕过。
 */

export type GeoSiteTemplateKind = 'BLOCK' | 'PAGE';

const KIND_LABELS: Record<GeoSiteTemplateKind, string> = {
  BLOCK: '区块',
  PAGE: '整页',
};

/** 单站模板数上限：模板只是复制粘贴的便利，不该变成第二个内容库。 */
const MAX_TEMPLATES_PER_SITE = 100;

type TemplateRow = {
  id: number;
  siteId: number;
  kind: string;
  name: string;
  note: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type GeoSiteTemplateView = {
  id: number;
  siteId: number;
  kind: string;
  kindLabel: string;
  name: string;
  note: string;
  elementCount: number;
  updatedAt: string;
};

function treeLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function viewOf(row: TemplateRow): GeoSiteTemplateView {
  const kind = row.kind === 'PAGE' ? 'PAGE' : 'BLOCK';
  return {
    id: row.id,
    siteId: row.siteId,
    kind,
    kindLabel: KIND_LABELS[kind],
    name: row.name,
    note: row.note,
    elementCount: treeLength(row.content),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeKind(value: unknown): GeoSiteTemplateKind {
  return toText(value).toUpperCase() === 'PAGE' ? 'PAGE' : 'BLOCK';
}

export class GeoSiteTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: GeoSiteService,
    private readonly pages: GeoSitePageService,
  ) {}

  /* ---------------------------- 读 ---------------------------- */

  async list(user: CurrentUser, siteId: number, kind?: string) {
    const site = await this.sites.requireSite(user, Number(siteId));
    const where: Record<string, unknown> = { siteId: site.id };
    if (kind) where.kind = normalizeKind(kind);
    const rows = (await this.prisma.geoSiteTemplate.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { id: 'desc' }],
      take: MAX_TEMPLATES_PER_SITE,
    })) as TemplateRow[];
    return rows.map(viewOf);
  }

  /** 详情带整棵元素树：套用前的预览与「另存为新名」都要读它。 */
  async detail(user: CurrentUser, id: number) {
    const row = await this.requireTemplate(user, Number(id));
    return { ...viewOf(row), content: assertElementTree(row.content) };
  }

  /* ---------------------------- 写 ---------------------------- */

  async save(
    user: CurrentUser,
    body: {
      siteId: number;
      id?: number;
      kind?: string;
      name: string;
      note?: string;
      content: unknown[];
    },
  ) {
    const site = await this.sites.requireSite(user, Number(body.siteId));
    const name = clipText(body.name, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写模板名称');
    // 与页面同一道白名单：非法类型或样式在这里就拒掉，别把脏树存进模板库
    const tree = assertElementTree(body.content ?? []);
    if (!tree.length)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '模板内容为空，先做好区块再另存',
      );
    const kind = normalizeKind(body.kind);
    const note = clipText(body.note ?? '', 200);
    const id = Number(body.id ?? 0);
    if (id > 0) {
      const row = await this.requireTemplate(user, id);
      if (row.siteId !== site.id)
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '该模板不属于当前站点',
        );
      const updated = (await this.prisma.geoSiteTemplate.update({
        where: { id: row.id },
        data: { kind, name, note, content: toJsonInput(tree) },
      })) as TemplateRow;
      return viewOf(updated);
    }
    const count = await this.prisma.geoSiteTemplate.count({
      where: { siteId: site.id },
    });
    if (count >= MAX_TEMPLATES_PER_SITE)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `本站模板已达 ${MAX_TEMPLATES_PER_SITE} 个，先清理不再用的区块模板`,
      );
    const created = (await this.prisma.geoSiteTemplate.create({
      data: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        kind,
        name,
        note,
        content: toJsonInput(tree),
      },
    })) as TemplateRow;
    return viewOf(created);
  }

  /**
   * 套用到页面：replace 整页替换（PAGE 模板），append / prepend 只在顶层插入（BLOCK 模板）。
   * 返回页面详情，编辑器直接用它刷新画布，省一次列表往返。
   */
  async apply(
    user: CurrentUser,
    body: { templateId: number; pageId: number; mode?: string },
  ) {
    const template = await this.requireTemplate(user, Number(body.templateId));
    const tree = assertElementTree(template.content);
    const mode = ['replace', 'append', 'prepend'].includes(String(body.mode))
      ? String(body.mode)
      : template.kind === 'PAGE'
        ? 'replace'
        : 'append';
    const page = await this.pages.detail(user, Number(body.pageId));
    if (page.siteId !== template.siteId)
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '模板与页面不在同一个站点，请另存到目标站点后再套用',
      );
    const current = Array.isArray(page.content)
      ? (page.content as GeoSiteElement[])
      : [];
    const content =
      mode === 'replace'
        ? tree
        : mode === 'prepend'
          ? [...tree, ...current]
          : [...current, ...tree];
    return this.pages.saveContent(user, { id: page.id, content });
  }

  async remove(user: CurrentUser, body: { id: number }) {
    const row = await this.requireTemplate(user, Number(body.id));
    await this.prisma.geoSiteTemplate.delete({ where: { id: row.id } });
    // okResult 契约要求 message 必填：漏了它响应体会过不了 schema 校验，删除成功也照样回 500
    return { ok: true, message: '模板已删除' };
  }

  /* ---------------------------- 内部 ---------------------------- */

  private async requireTemplate(user: CurrentUser, id: number) {
    const row = (await this.prisma.geoSiteTemplate.findUnique({
      where: { id },
    })) as TemplateRow | null;
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '模板不存在或已删除');
    // 归属判定复用站点闸：模板自己不再存一套企业字段，避免两处口径漂移
    await this.sites.requireSite(user, row.siteId);
    return row;
  }
}
