import {
  DH_ARTICLE_CONTENT_TYPES,
  DH_ARTICLE_TYPES,
  DH_WRITE_KINDS,
  type DhAiRecordRow,
  type DhArticleInput,
  type DhArticleRow,
  type DhFeedbackRow,
  type DhPosterInput,
  type DhPosterRow,
  type DhSwiperInput,
  type DhSwiperRow,
  type DhWriteTopicInput,
  type DhWriteTopicRow,
} from '@enterprise/contracts';
import { aiChat } from '../ai/ai-gateway';
import type { CurrentUser } from '../auth/current-user';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { clip, siteConfigOf } from './dh.shared';
import type { DhMemberService } from './dh.member.service';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;
type MemberRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanMember']['findUnique']>>
>;

/** JSON 数组列：只保留字符串项，坏形状一律按空数组处理。 */
function stringList(value: unknown, max = 9): string[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    )
    .map((item) => item.trim().slice(0, 500))
    .slice(0, max);
}

function inEnum<T extends readonly string[]>(
  values: T,
  value: string,
): T[number] {
  for (const item of values) {
    if (item === value) return item;
  }
  return values[0];
}

/**
 * 数字人内容位：AI 文案模板、图文栏目、轮播、海报、意见反馈。
 *
 * 这些内容全部是「站点方自己维护、端上直接展示」的运营物料：
 * - 平台全局模板（siteId=0）只读，站点可复制成自己的再改；
 * - 栏目 type 固定五类，与小程序「我的/系统」页入口一一对应；
 * - 海报只存版式坐标，图片合成在端上 canvas 完成（服务端不装图形库）。
 */
export class DhContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly member: DhMemberService,
  ) {}

  // ================= AI 写作模板 =================

  async writeTopics(user: CurrentUser, kind: string) {
    const site = await this.member.siteOfOwner(user.userId);
    const filter = inEnum(DH_WRITE_KINDS, kind);
    const rows = await this.prisma.digitalHumanWriteTopic.findMany({
      where: { siteId: { in: [0, site.id] }, kind: filter },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => this.topicRow(row));
  }

  async saveWriteTopic(user: CurrentUser, body: DhWriteTopicInput) {
    const site = await this.member.siteOfOwner(user.userId);
    if (body.id) {
      const row = await this.prisma.digitalHumanWriteTopic.findFirst({
        where: { id: body.id, siteId: site.id },
      });
      if (!row) {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          '模板不存在（平台内置模板只读，请另存为本站模板后再改）',
        );
      }
      const updated = await this.prisma.digitalHumanWriteTopic.update({
        where: { id: row.id },
        data: this.topicData(body),
      });
      return this.topicRow(updated);
    }
    const created = await this.prisma.digitalHumanWriteTopic.create({
      data: { siteId: site.id, ...this.topicData(body) },
    });
    return this.topicRow(created);
  }

  async removeWriteTopic(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanWriteTopic.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '模板不存在或为平台内置模板',
      );
    }
    await this.prisma.digitalHumanWriteTopic.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async aiRecords(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanAiRecord.count({ where }),
      this.prisma.digitalHumanAiRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    const list: DhAiRecordRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: nameOf.get(row.memberId) || '',
      topicId: row.topicId,
      prompt: row.prompt,
      response: row.response,
      wordCount: row.wordCount,
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /** C 端 AI 写文案：按模板拼提示词，调用本站模型底层，记录留痕。 */
  async aiWrite(
    site: SiteRow,
    member: MemberRow,
    body: Record<string, unknown>,
  ) {
    const config = siteConfigOf(site);
    if (config.toggles.aiWrite === false) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放 AI 文案');
    }
    const prompt = clip(text(body.prompt), 1000);
    if (!prompt) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先说说要写什么');
    }
    const words = Math.min(
      2000,
      Math.max(50, Math.round(Number(body.words) || 300)),
    );
    const topicId = Math.max(0, Math.round(Number(body.topicId) || 0));
    const topic = topicId
      ? await this.prisma.digitalHumanWriteTopic.findFirst({
          where: {
            id: topicId,
            siteId: { in: [0, site.id] },
            kind: 'write_model',
            enabled: true,
          },
        })
      : null;
    const template = topic?.content
      ? topic.content
          .replace(/\[PROMPT\]/g, prompt)
          .replace(/\[WORDS\]/g, String(words))
      : `请围绕下面的要求写一篇中文口播文案，约 ${words} 字，口语化、有开场钩子、结尾带引导，不要标题、不要 Markdown：\n${prompt}`;
    const output = await aiChat(this.prisma, {
      userId: site.userId,
      messages: [
        {
          role: 'system',
          content:
            '你是短视频口播文案写手。只输出正文，不要解释、不要 Markdown、不要引号包裹。',
        },
        { role: 'user', content: template },
      ],
      model: clip(topic?.modelTier || '', 64) || undefined,
      maxTokens: Math.min(3000, words * 3),
      timeoutMs: 60_000,
      module: 'digital-human',
      operation: 'ai_write',
    });
    const content = clip(output.reply, 8000);
    if (!content) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '模型没有返回内容，请稍后重试或换一个写作模板',
      );
    }
    const wordCount = content.replace(/\s/g, '').length;
    const record = await this.prisma.digitalHumanAiRecord.create({
      data: {
        siteId: site.id,
        memberId: member.id,
        topicId: topic?.id || 0,
        prompt: clip(prompt, 2000),
        response: content,
        wordCount,
      },
    });
    return { id: record.id, content, wordCount };
  }

  // ================= 图文栏目 =================

  async articles(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const type = text(query.type).trim();
    const where = {
      siteId: site.id,
      ...(type ? { type: inEnum(DH_ARTICLE_TYPES, type) } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanArticle.count({ where }),
      this.prisma.digitalHumanArticle.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => this.articleRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async saveArticle(user: CurrentUser, body: DhArticleInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const data = {
      type: inEnum(DH_ARTICLE_TYPES, body.type),
      contentType: inEnum(DH_ARTICLE_CONTENT_TYPES, body.contentType),
      title: clip(body.title, 120),
      cover: clip(body.cover, 500),
      summary: clip(body.summary, 300),
      body: clip(body.body, 200_000),
      link: clip(body.link, 500),
      sort: body.sort,
      enabled: body.enabled,
    };
    if (body.id) {
      const row = await this.prisma.digitalHumanArticle.findFirst({
        where: { id: body.id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
      const updated = await this.prisma.digitalHumanArticle.update({
        where: { id: row.id },
        data,
      });
      return this.articleRow(updated);
    }
    const created = await this.prisma.digitalHumanArticle.create({
      data: { siteId: site.id, ...data },
    });
    return this.articleRow(created);
  }

  async removeArticle(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanArticle.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    await this.prisma.digitalHumanArticle.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ================= 轮播 / 海报 =================

  async swipers(user: CurrentUser) {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanSwiper.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => this.swiperRow(row));
  }

  async saveSwiper(user: CurrentUser, body: DhSwiperInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const data = {
      title: clip(body.title, 120),
      image: clip(body.image, 500),
      link: clip(body.link, 500) || 'none',
      sort: body.sort,
      enabled: body.enabled,
    };
    if (body.id) {
      const row = await this.prisma.digitalHumanSwiper.findFirst({
        where: { id: body.id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '轮播不存在');
      const updated = await this.prisma.digitalHumanSwiper.update({
        where: { id: row.id },
        data,
      });
      return this.swiperRow(updated);
    }
    const created = await this.prisma.digitalHumanSwiper.create({
      data: { siteId: site.id, ...data },
    });
    return this.swiperRow(created);
  }

  async removeSwiper(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanSwiper.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '轮播不存在');
    await this.prisma.digitalHumanSwiper.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async posters(user: CurrentUser) {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanPoster.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    return rows.map((row) => this.posterRow(row));
  }

  async savePoster(user: CurrentUser, body: DhPosterInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const data = {
      name: clip(body.name, 80),
      bgUrl: clip(body.bgUrl, 500),
      avatarX: body.avatarX,
      avatarY: body.avatarY,
      avatarSize: body.avatarSize,
      qrX: body.qrX,
      qrY: body.qrY,
      qrSize: body.qrSize,
      sort: body.sort,
      enabled: body.enabled,
    };
    if (body.id) {
      const row = await this.prisma.digitalHumanPoster.findFirst({
        where: { id: body.id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '海报不存在');
      const updated = await this.prisma.digitalHumanPoster.update({
        where: { id: row.id },
        data,
      });
      return this.posterRow(updated);
    }
    const created = await this.prisma.digitalHumanPoster.create({
      data: { siteId: site.id, ...data },
    });
    return this.posterRow(created);
  }

  async removePoster(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanPoster.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '海报不存在');
    await this.prisma.digitalHumanPoster.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ================= 意见反馈 =================

  async feedbacks(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = clip(text(query.status), 16);
    const where = {
      siteId: site.id,
      ...(status ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanFeedback.count({ where }),
      this.prisma.digitalHumanFeedback.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    return pageOf(
      rows.map((row) => this.feedbackRow(row, nameOf.get(row.memberId) || '')),
      total,
      page,
      pageSize,
    );
  }

  async replyFeedback(user: CurrentUser, id: number, reply: string) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanFeedback.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '反馈不存在');
    const updated = await this.prisma.digitalHumanFeedback.update({
      where: { id: row.id },
      data: { reply: clip(reply, 2000), status: 'replied' },
    });
    const member = updated.memberId
      ? await this.prisma.digitalHumanMember.findUnique({
          where: { id: updated.memberId },
          select: { nickname: true },
        })
      : null;
    return this.feedbackRow(updated, member?.nickname || '');
  }

  async submitFeedback(
    site: SiteRow,
    member: MemberRow | null,
    body: Record<string, unknown>,
  ) {
    const content = clip(text(body.content), 2000);
    if (!content) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写反馈内容');
    }
    const created = await this.prisma.digitalHumanFeedback.create({
      data: {
        siteId: site.id,
        memberId: member?.id || 0,
        content,
        contact: clip(text(body.contact), 60),
        images: stringList(body.images),
      },
    });
    return { id: created.id, message: '已提交，站点会尽快处理' };
  }

  // ================= C 端读取 =================

  async publicSwipers(site: SiteRow) {
    const rows = await this.prisma.digitalHumanSwiper.findMany({
      where: { siteId: site.id, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      link: row.link,
    }));
  }

  async publicPosters(site: SiteRow) {
    const rows = await this.prisma.digitalHumanPoster.findMany({
      where: { siteId: site.id, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      bgUrl: row.bgUrl,
      avatarX: row.avatarX,
      avatarY: row.avatarY,
      avatarSize: row.avatarSize,
      qrX: row.qrX,
      qrY: row.qrY,
      qrSize: row.qrSize,
    }));
  }

  async publicArticles(site: SiteRow, type: string) {
    const rows = await this.prisma.digitalHumanArticle.findMany({
      where: {
        siteId: site.id,
        type: inEnum(DH_ARTICLE_TYPES, type),
        enabled: true,
      },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      contentType: row.contentType,
      title: row.title,
      cover: row.cover,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async publicArticle(site: SiteRow, id: number) {
    const row = await this.prisma.digitalHumanArticle.findFirst({
      where: { id, siteId: site.id, enabled: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在或已下架');
    return this.articleRow(row);
  }

  /** C 端写作模板/选题：只取启用的，平台全局与本站合并。 */
  async publicWriteTopics(site: SiteRow, kind: string) {
    const rows = await this.prisma.digitalHumanWriteTopic.findMany({
      where: {
        siteId: { in: [0, site.id] },
        kind: inEnum(DH_WRITE_KINDS, kind),
        enabled: true,
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      category: row.category,
      // 引导文案/朗读示例要端上直接展示，写作模板只按 id 服务端调用，不回传正文。
      content:
        row.kind === 'clone_hint' || row.kind === 'voice_example'
          ? row.content
          : '',
    }));
  }

  // ================= 行映射 =================

  private topicData(body: DhWriteTopicInput) {
    return {
      kind: inEnum(DH_WRITE_KINDS, body.kind),
      title: clip(body.title, 120),
      category: clip(body.category, 60),
      content: clip(body.content, 20_000),
      modelTier: clip(body.modelTier, 64),
      sort: body.sort,
      enabled: body.enabled,
    };
  }

  private topicRow(row: {
    id: number;
    siteId: number;
    kind: string;
    title: string;
    category: string;
    content: string;
    modelTier: string;
    sort: number;
    enabled: boolean;
    createdAt: Date;
  }): DhWriteTopicRow {
    return {
      id: row.id,
      siteId: row.siteId,
      kind: inEnum(DH_WRITE_KINDS, row.kind),
      title: row.title,
      category: row.category,
      content: row.content,
      modelTier: row.modelTier,
      sort: row.sort,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private articleRow(row: {
    id: number;
    type: string;
    contentType: string;
    title: string;
    cover: string;
    summary: string;
    body: string;
    link: string;
    sort: number;
    enabled: boolean;
    createdAt: Date;
  }): DhArticleRow {
    return {
      id: row.id,
      type: inEnum(DH_ARTICLE_TYPES, row.type),
      contentType: inEnum(DH_ARTICLE_CONTENT_TYPES, row.contentType),
      title: row.title,
      cover: row.cover,
      summary: row.summary,
      body: row.body,
      link: row.link,
      sort: row.sort,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private swiperRow(row: {
    id: number;
    title: string;
    image: string;
    link: string;
    sort: number;
    enabled: boolean;
    createdAt: Date;
  }): DhSwiperRow {
    return {
      id: row.id,
      title: row.title,
      image: row.image,
      link: row.link,
      sort: row.sort,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private posterRow(row: {
    id: number;
    name: string;
    bgUrl: string;
    avatarX: number;
    avatarY: number;
    avatarSize: number;
    qrX: number;
    qrY: number;
    qrSize: number;
    sort: number;
    enabled: boolean;
  }): DhPosterRow {
    return {
      id: row.id,
      name: row.name,
      bgUrl: row.bgUrl,
      avatarX: row.avatarX,
      avatarY: row.avatarY,
      avatarSize: row.avatarSize,
      qrX: row.qrX,
      qrY: row.qrY,
      qrSize: row.qrSize,
      sort: row.sort,
      enabled: row.enabled,
    };
  }

  private feedbackRow(
    row: {
      id: number;
      memberId: number;
      content: string;
      contact: string;
      images: unknown;
      status: string;
      reply: string;
      createdAt: Date;
    },
    nickname: string,
  ): DhFeedbackRow {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      content: row.content,
      contact: row.contact,
      images: stringList(row.images),
      status: row.status,
      reply: row.reply,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
