import type { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../common/logger';

export type ScrmSourceInput = {
  ownerUserId: string;
  contactId: number;
  scene: string;
  sourceId: number;
  sourceName?: string;
};

const SCENE_LABELS: Record<string, string> = {
  BRAND: '品牌商城',
  TAKEOUT: '外卖点餐',
  ONSITE: '上门服务',
  HEALTH: '健康管理',
  MARKET: '多店商城',
  CARD_SHOP: '卡密商城',
  EXPRESS: '快递寄件',
  ERRAND: '跑腿',
  CIRCLE: '圈子社区',
  DIGITAL_HUMAN: '数字人',
  KNOWLEDGE_PAY: '知识付费',
  RENTAL: '租赁',
};

const SCENE_COLORS: Record<string, string> = {
  BRAND: '#fa3534',
  TAKEOUT: '#e64340',
  ONSITE: '#1677ff',
  HEALTH: '#13c2c2',
  MARKET: '#722ed1',
  CARD_SHOP: '#eb2f96',
  EXPRESS: '#2f54eb',
  ERRAND: '#faad14',
  CIRCLE: '#52c41a',
  DIGITAL_HUMAN: '#2f54eb',
  KNOWLEDGE_PAY: '#13c2c2',
  RENTAL: '#fa8c16',
};

/**
 * SCRM 来源渠道打标。
 *
 * 同一个人可以在 A/B 两个小程序各有一条独立顾客记录（ID 不同），但落到 SCRM
 * 是同一个企微联系人。每次某个终端的事件匹配到该联系人，就给它追加一个
 * `来源渠道` 自动标签；标签按 (scene, sourceId) 幂等，多终端会产生多个标签，
 * 从而表达「这个企微客户的多个业务属性」。
 *
 * 本地标签 externalId 为空，不会冒充企微原生标签推送给企微；在 SCRM 客户详情里
 * 与企微标签一起展示。sourceId 使用各终端的店铺/站点/市场/社区 id。
 */
export class ScrmSourceTagService {
  private readonly logger = new Logger(ScrmSourceTagService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 打标是旁路：失败只记日志，不影响 SCRM 事件投递与业务事务。 */
  async tagSource(input: ScrmSourceInput): Promise<number> {
    try {
      return await this.tagSourceUnsafe(input);
    } catch (error) {
      this.logger.warn(
        `来源渠道打标失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  private async tagSourceUnsafe(input: ScrmSourceInput): Promise<number> {
    const scene = String(input.scene || '')
      .trim()
      .toUpperCase();
    const sourceId = Number(input.sourceId || 0);
    if (!input.ownerUserId || !input.contactId || !scene) return 0;
    const label = SCENE_LABELS[scene] || scene;
    const sourceName = String(input.sourceName || '').trim();
    const name = (sourceName ? `${label}·${sourceName}` : label).slice(0, 60);
    const localKey = `source:${scene}:${sourceId}`;
    const tag = await this.prisma.scrmTag.upsert({
      where: {
        orgType_orgUserId_externalId_localKey: {
          orgType: 'ENTERPRISE',
          orgUserId: input.ownerUserId,
          externalId: '',
          localKey,
        },
      },
      create: {
        orgType: 'ENTERPRISE',
        orgUserId: input.ownerUserId,
        groupId: 0,
        externalId: '',
        localKey,
        name,
        color: SCENE_COLORS[scene] || '',
        source: 'AUTO',
        sortOrder: 0,
        usageCount: 0,
      },
      update: {
        name,
        color: SCENE_COLORS[scene] || '',
        deleted: false,
      },
    });
    const linked = await this.prisma.scrmContactTag.createMany({
      data: [
        {
          orgType: 'ENTERPRISE',
          orgUserId: input.ownerUserId,
          contactId: input.contactId,
          tagId: tag.id,
          source: 'AUTO',
        },
      ],
      skipDuplicates: true,
    });
    if (linked.count > 0) {
      await this.prisma.scrmTag.update({
        where: { id: tag.id },
        data: { usageCount: { increment: 1 } },
      });
    }
    return tag.id;
  }
}
