import type { CircleAiAction, CircleAiResult } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { aiChat } from '../ai/ai-gateway';
import type { ChatMessage } from '../geo/geo-llm.client';
import { clip } from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;

const ACTION_PROMPTS: Record<CircleAiAction, string> = {
  GROUP_INTRO:
    '你是社区运营助手。请为下面这个圈子写一段 80-120 字的中文简介，语气友好、具体，不要空话。',
  NOTICE:
    '你是社区运营助手。请为社区管理员写一条 60-100 字的中文公告，说明清楚、可直接发布。',
  POST_SUMMARY:
    '你是社区内容助手。请用 60 字以内中文总结下面帖子的核心信息，只输出摘要正文。',
  HOT_DIGEST:
    '你是社区运营助手。请根据最近热门帖子写一份 120-200 字的中文社区周报，分点概括热点与讨论方向。',
};

/**
 * AI 运营助手：统一走全系统 AI 网关（ai-gateway），按网关用量事实计费。
 * 只服务圈主/管理员侧；C 端客服只绑定 service-desk，不在这里另建 AI 客服实体。
 */
export class CircleAiService {
  constructor(private readonly prisma: PrismaService) {}

  private async contextOf(community: CommunityRow, groupId: number) {
    const group = groupId
      ? await this.prisma.circleGroup.findFirst({
          where: { id: groupId, communityId: community.id },
          select: { name: true, intro: true, rules: true },
        })
      : null;
    const posts = await this.prisma.circlePost.findMany({
      where: {
        communityId: community.id,
        status: 'PUBLISHED',
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
      orderBy: [{ isFeatured: 'desc' }, { hotScore: 'desc' }, { id: 'desc' }],
      take: 12,
      select: { content: true, likeCount: true, commentCount: true },
    });
    return {
      group,
      posts: posts.map((row) => clip(row.content, 220)),
    };
  }

  async generate(
    user: CurrentUser,
    community: CommunityRow,
    body: { action: CircleAiAction; prompt: string; groupId: number },
  ): Promise<CircleAiResult> {
    if (!community.aiAssistantEnabled) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '本社区未开启 AI 运营助手，请先在「社区设置」打开',
      );
    }
    const context = await this.contextOf(community, body.groupId);
    const lines = [
      `社区名称：${community.name}`,
      community.intro ? `社区简介：${clip(community.intro, 300)}` : '',
      context.group
        ? `圈子：${context.group.name}\n简介：${clip(context.group.intro, 300)}\n规则：${clip(context.group.rules, 300)}`
        : '',
      context.posts.length
        ? `最近帖子：\n${context.posts.map((text, index) => `${index + 1}. ${text}`).join('\n')}`
        : '',
      body.prompt ? `管理员补充要求：${clip(body.prompt, 1000)}` : '',
    ].filter(Boolean);
    const messages: ChatMessage[] = [
      { role: 'system', content: ACTION_PROMPTS[body.action] },
      { role: 'user', content: lines.join('\n\n') },
    ];
    const result = await aiChat(this.prisma, {
      userId: user.userId,
      messages,
      maxTokens: 900,
      timeoutMs: 60_000,
      module: 'circle',
      operation: `circle_${body.action.toLowerCase()}`,
      // 与全站 AI 科目共用价目；没有单独规则时网关按按次包价兜底
      charge: { code: 'ai_service', refId: community.code },
    });
    return {
      text: clip(result.reply, 4000),
      model: result.model,
      action: body.action,
    };
  }
}
