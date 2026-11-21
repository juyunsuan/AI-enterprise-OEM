import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';

type TemplateSlot = 'parkApprove' | 'parkVisit' | 'parkWork';

/**
 * 微信订阅消息字段名由园区自建模板决定；这里约定三类模板：
 * - parkApprove：thing1 标题 / phrase2 结果 / time3 时间 / thing4 备注
 * - parkVisit：thing1 标题 / time2 时间 / thing3 地点
 * - parkWork：thing1 标题 / phrase2 状态 / time3 时间
 * 模板未配置时静默跳过，不影响主流程。
 */
const TEMPLATE_FIELDS: Record<TemplateSlot, string[]> = {
  parkApprove: ['thing1', 'phrase2', 'time3', 'thing4'],
  parkVisit: ['thing1', 'time2', 'thing3'],
  parkWork: ['thing1', 'phrase2', 'time3'],
};

export class ParkNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
  ) {}

  private async subject(siteId: number) {
    return this.prisma.parkSite.findUnique({
      where: { id: siteId },
      select: { id: true, ownerUserId: true, name: true },
    });
  }

  async templates(siteId: number): Promise<Record<string, string>> {
    const site = await this.subject(siteId);
    if (!site) return {};
    return this.miniApp
      .templates({
        ownerUserId: site.ownerUserId,
        scene: 'PARK',
        shopId: site.id,
        shopName: site.name,
      })
      .catch(() => ({}));
  }

  async notify(
    siteId: number,
    customer: { openid: string },
    slot: TemplateSlot,
    page: string,
    values: string[],
  ): Promise<boolean> {
    try {
      if (!customer.openid) return false;
      const site = await this.subject(siteId);
      if (!site) return false;
      const subject = {
        ownerUserId: site.ownerUserId,
        scene: 'PARK' as const,
        shopId: site.id,
        shopName: site.name,
      };
      const runtime = await this.miniApp.runtime(subject);
      if (!runtime) return false;
      const templates = await this.miniApp.templates(subject);
      const templateId = templates[slot] || '';
      if (!templateId) return false;
      const data: Record<string, { value: string }> = {};
      TEMPLATE_FIELDS[slot].forEach((key, index) => {
        const value = String(values[index] ?? '').slice(0, 60);
        if (value) data[key] = { value };
      });
      const result = await this.client.sendSubscribeMessage(runtime, {
        templateId,
        openId: customer.openid,
        page,
        data,
      });
      return result.sent;
    } catch {
      return false;
    }
  }
}
