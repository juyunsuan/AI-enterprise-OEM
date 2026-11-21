import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { CircleCommunityService } from './circle.community.service';
import { clip } from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;

/**
 * 微信订阅消息（可选）：租户在小程序主体里配置模板 ID 后才发送。
 *
 * 模板字段由租户选择的微信模板决定，本服务按约定字段发送：
 * `thing1`＝社区名、`thing2`＝摘要、`time3`＝时间。模板字段不一致时微信会拒绝，
 * 这里只吞掉失败——站内消息已经落库，订阅消息不应影响主链路。
 */
export class CircleSubscribeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly community: CircleCommunityService,
  ) {}

  async notify(
    row: CommunityRow,
    targetUserId: number,
    key: 'circleComment' | 'circleLike' | 'circleAudit' | 'circleActivity',
    page: string,
    content: string,
  ): Promise<void> {
    if (!targetUserId) return;
    const subject = this.community.subject(row.ownerUserId, row.name);
    const [view, user, runtime] = await Promise.all([
      this.miniApp.view(subject).catch(() => null),
      this.prisma.circleUser.findFirst({
        where: { id: targetUserId, communityId: row.id },
        select: { openid: true },
      }),
      this.miniApp.runtime(subject).catch(() => null),
    ]);
    const templateId = view?.templates?.[key] || '';
    if (!templateId || !user?.openid || !runtime) return;
    await this.client
      .sendSubscribeMessage(runtime, {
        templateId,
        openId: user.openid,
        page,
        data: {
          thing1: { value: clip(row.name, 20) },
          thing2: { value: clip(content, 20) || '圈子社区' },
          time3: { value: new Date().toISOString().slice(0, 16) },
        },
      })
      .catch(() => undefined);
  }
}
