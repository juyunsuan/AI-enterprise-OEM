import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Logger } from '../common/logger';
import type { PrismaService } from '../prisma/prisma.service';
import {
  scrmMobileHash,
  withBridgeTimeout,
  type ScrmBridge,
  type ScrmEventKind,
} from '../commerce-core/scrm-port';
import type { ScrmSourceTagService } from './scrm-source-tag.service';

type TerminalRow = {
  scene: string;
  sourceId: number;
  sourceName: string;
  enabled: boolean;
  lastEventKind: string;
  lastTaggedAt: string;
  lastError: string;
};

type CustomerIdentity = {
  unionId: string;
  phone: string;
  nickname: string;
};

const SCENES = [
  'ONSITE',
  'CARD_SHOP',
  'EXPRESS',
  'ERRAND',
  'CIRCLE',
  'DIGITAL_HUMAN',
  'KNOWLEDGE_PAY',
] as const;

const EVENT_LABELS: Record<string, string> = {
  CUSTOMER_REGISTER: '注册成为顾客',
  ORDER_PAID: '订单付款',
  ORDER_COMPLETED: '订单完成',
  COUPON_RECEIVED: '领取优惠券',
};

/**
 * 通用终端 SCRM 接入：给没有独立 outbox 的终端补“来源渠道打标 + 时间线”。
 *
 * 调用点只在顾客登录/下单成功等关键节点做一次 best-effort identify：
 * - 开关关闭、企微未接入、匹配不到联系人、桥超时都只记 lastError，不影响业务；
 * - 同一企微联系人在多个终端出现时会累积多个来源标签；
 * - 各终端的顾客/订单仍是独立表，不共享行。
 */
export class TerminalScrmService {
  private readonly logger = new Logger(TerminalScrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: ScrmBridge,
    private readonly sourceTags: ScrmSourceTagService,
  ) {}

  async list(user: CurrentUser): Promise<TerminalRow[]> {
    const [onsite, card, kuaidi, errand, circle, dh, kp] = await Promise.all([
      this.prisma.onsiteShop.findMany({
        where: { ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      this.prisma.cardShopSite.findMany({
        where: { ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      this.prisma.kuaidiSite.findMany({
        where: { ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      this.prisma.errandSite.findMany({
        where: { ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      this.prisma.circleCommunity.findMany({
        where: { ownerUserId: user.userId },
        select: { id: true, name: true },
      }),
      this.prisma.digitalHumanSite.findMany({
        where: { userId: user.userId },
        select: { id: true, siteName: true },
      }),
      this.prisma.knowledgePaySite.findMany({
        where: { userId: user.userId },
        select: { id: true, siteName: true },
      }),
    ]);
    const roots: Array<{
      scene: string;
      sourceId: number;
      sourceName: string;
    }> = [
      ...onsite.map((row) => ({
        scene: 'ONSITE',
        sourceId: row.id,
        sourceName: row.name,
      })),
      ...card.map((row) => ({
        scene: 'CARD_SHOP',
        sourceId: row.id,
        sourceName: row.name,
      })),
      ...kuaidi.map((row) => ({
        scene: 'EXPRESS',
        sourceId: row.id,
        sourceName: row.name,
      })),
      ...errand.map((row) => ({
        scene: 'ERRAND',
        sourceId: row.id,
        sourceName: row.name,
      })),
      ...circle.map((row) => ({
        scene: 'CIRCLE',
        sourceId: row.id,
        sourceName: row.name,
      })),
      ...dh.map((row) => ({
        scene: 'DIGITAL_HUMAN',
        sourceId: row.id,
        sourceName: row.siteName,
      })),
      ...kp.map((row) => ({
        scene: 'KNOWLEDGE_PAY',
        sourceId: row.id,
        sourceName: row.siteName,
      })),
    ];
    if (!roots.length) return [];
    const settings = await this.prisma.terminalScrmSetting.findMany({
      where: { ownerUserId: user.userId, scene: { in: [...SCENES] } },
    });
    const map = new Map(
      settings.map((row) => [`${row.scene}:${row.sourceId}`, row]),
    );
    return roots.map((root) => {
      const row = map.get(`${root.scene}:${root.sourceId}`);
      return {
        ...root,
        enabled: row?.enabled === true,
        lastEventKind: row?.lastEventKind || '',
        lastTaggedAt: row?.lastTaggedAt ? row.lastTaggedAt.toISOString() : '',
        lastError: row?.lastError || '',
      };
    });
  }

  async toggle(
    user: CurrentUser,
    scene: string,
    sourceId: number,
    enabled: boolean,
  ): Promise<void> {
    const normalized = String(scene || '').toUpperCase();
    if (!SCENES.includes(normalized as (typeof SCENES)[number])) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的终端类型');
    }
    const owns = await this.owns(user.userId, normalized, Number(sourceId));
    if (!owns) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '终端不存在');
    }
    await this.prisma.terminalScrmSetting.upsert({
      where: {
        ownerUserId_scene_sourceId: {
          ownerUserId: user.userId,
          scene: normalized,
          sourceId: Number(sourceId),
        },
      },
      create: {
        ownerUserId: user.userId,
        scene: normalized,
        sourceId: Number(sourceId),
        enabled,
      },
      update: { enabled, lastError: enabled ? '' : undefined },
    });
  }

  /** 关键节点 best-effort 打标：失败只记 lastError，不抛给业务。 */
  async identify(input: {
    ownerUserId?: string;
    scene: string;
    sourceId: number;
    sourceName?: string;
    customerId: number;
    kind: ScrmEventKind;
    recordKey?: string | number;
  }): Promise<void> {
    const scene = String(input.scene || '').toUpperCase();
    const ownerUserId =
      input.ownerUserId || (await this.ownerOf(scene, input.sourceId));
    if (!ownerUserId || !input.customerId) return;
    const recordKey = String(input.recordKey ?? input.customerId);
    const dedupeKey = `${scene}:${input.sourceId}:${input.kind}:${recordKey}`;
    try {
      const setting = await this.prisma.terminalScrmSetting.findUnique({
        where: {
          ownerUserId_scene_sourceId: {
            ownerUserId,
            scene,
            sourceId: input.sourceId,
          },
        },
      });
      if (!setting?.enabled) return;
      const inserted = await this.prisma.terminalScrmEvent.createMany({
        data: [
          {
            dedupeKey,
            scene,
            ownerUserId,
            sourceId: input.sourceId,
            customerId: input.customerId,
            kind: input.kind,
            recordKey,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return;
      const identity = await this.customerOf(
        scene,
        input.sourceId,
        input.customerId,
      );
      if (!identity) {
        await this.finishEvent(dedupeKey, 'SKIPPED', '顾客不存在');
        await this.mark({ ...input, ownerUserId }, '', '顾客不存在');
        return;
      }
      const corp = await this.prisma.scrmCorp.findUnique({
        where: {
          orgType_orgUserId: {
            orgType: 'ENTERPRISE',
            orgUserId: ownerUserId,
          },
        },
        select: { id: true },
      });
      if (!corp) {
        await this.finishEvent(dedupeKey, 'SKIPPED', '未接入企业微信 SCRM');
        await this.mark({ ...input, ownerUserId }, '', '未接入企业微信 SCRM');
        return;
      }
      const status = await this.bridge.status(corp.id);
      if (!status.ok) {
        await this.finishEvent(dedupeKey, 'SKIPPED', status.hint);
        await this.mark({ ...input, ownerUserId }, '', status.hint);
        return;
      }
      const secret = String(
        process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
      ).trim();
      const mobileHash =
        identity.phone && secret ? scrmMobileHash(identity.phone, secret) : '';
      const hit = await this.bridge.matchContact(corp.id, {
        unionId: identity.unionId,
        mobileHash,
      });
      if (!hit) {
        const reason = 'match-miss：SCRM 里没有匹配到企微客户';
        await this.finishEvent(dedupeKey, 'SKIPPED', reason);
        await this.mark({ ...input, ownerUserId }, '', reason);
        return;
      }
      await this.sourceTags.tagSource({
        ownerUserId,
        contactId: hit.contactId,
        scene,
        sourceId: input.sourceId,
        sourceName: input.sourceName,
      });
      const result = await withBridgeTimeout(() =>
        this.bridge.appendTimeline(corp.id, {
          contactId: hit.contactId,
          title: `${input.sourceName || scene} · ${EVENT_LABELS[input.kind] || input.kind}`,
          detail: identity.nickname
            ? `顾客 ${identity.nickname}`
            : '终端顾客事件',
        }),
      );
      await this.finishEvent(
        dedupeKey,
        result.ok ? 'SENT' : 'FAILED',
        result.ok ? '' : result.error,
      );
      await this.mark(
        { ...input, ownerUserId },
        result.ok ? input.kind : '',
        result.ok ? '' : result.error,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '打标失败';
      this.logger.warn(`终端 SCRM 打标失败（${scene}）：${message}`);
      await this.finishEvent(dedupeKey, 'FAILED', message).catch(
        () => undefined,
      );
      await this.mark({ ...input, ownerUserId }, '', message).catch(
        () => undefined,
      );
    }
  }

  /** 订单付款后按单号补打标：路由侧只需传 scene/sourceId/orderNo。 */
  async identifyOrderPaid(input: {
    ownerUserId?: string;
    scene: string;
    sourceId: number;
    sourceName?: string;
    orderNo: string;
  }): Promise<void> {
    const order = await this.orderCustomerOf(
      input.scene,
      input.sourceId,
      input.orderNo,
    );
    if (!order) return;
    await this.identify({
      ...input,
      customerId: order.customerId,
      kind: 'ORDER_PAID',
      recordKey: order.id,
    });
  }

  private async orderCustomerOf(
    scene: string,
    sourceId: number,
    orderNo: string,
  ): Promise<{ id: number; customerId: number } | null> {
    switch (String(scene || '').toUpperCase()) {
      case 'ONSITE':
        return this.prisma.onsiteOrder.findFirst({
          where: { orderNo, shopId: sourceId },
          select: { id: true, customerId: true },
        });
      case 'CARD_SHOP':
        return this.prisma.cardShopOrder.findFirst({
          where: { orderNo, siteId: sourceId },
          select: { id: true, customerId: true },
        });
      case 'EXPRESS':
        return this.prisma.kuaidiOrder.findFirst({
          where: { orderNo, siteId: sourceId },
          select: { id: true, customerId: true },
        });
      case 'ERRAND':
        return this.prisma.errandOrder.findFirst({
          where: { orderNo, siteId: sourceId },
          select: { id: true, customerId: true },
        });
      case 'DIGITAL_HUMAN':
        return this.prisma.digitalHumanOrder
          .findFirst({
            where: { orderNo, siteId: sourceId },
            select: { id: true, memberId: true },
          })
          .then((row) =>
            row ? { id: row.id, customerId: row.memberId } : null,
          );
      case 'KNOWLEDGE_PAY':
        return this.prisma.knowledgePayCashOrder
          .findFirst({
            where: { outTradeNo: orderNo, siteId: sourceId },
            select: { id: true, memberId: true },
          })
          .then((row) =>
            row ? { id: row.id, customerId: row.memberId } : null,
          );
      default:
        return null;
    }
  }

  private async finishEvent(dedupeKey: string, status: string, error: string) {
    await this.prisma.terminalScrmEvent.updateMany({
      where: { dedupeKey },
      data: { status, error: error.slice(0, 500) },
    });
  }

  private async mark(
    input: { ownerUserId: string; scene: string; sourceId: number },
    kind: string,
    error: string,
  ) {
    await this.prisma.terminalScrmSetting.updateMany({
      where: {
        ownerUserId: input.ownerUserId,
        scene: input.scene,
        sourceId: input.sourceId,
      },
      data: {
        ...(kind ? { lastEventKind: kind, lastTaggedAt: new Date() } : {}),
        lastError: error.slice(0, 500),
      },
    });
  }

  private async ownerOf(scene: string, sourceId: number): Promise<string> {
    switch (String(scene || '').toUpperCase()) {
      case 'ONSITE':
        return (
          (
            await this.prisma.onsiteShop.findUnique({
              where: { id: sourceId },
              select: { ownerUserId: true },
            })
          )?.ownerUserId || ''
        );
      case 'CARD_SHOP':
        return (
          (
            await this.prisma.cardShopSite.findUnique({
              where: { id: sourceId },
              select: { ownerUserId: true },
            })
          )?.ownerUserId || ''
        );
      case 'EXPRESS':
        return (
          (
            await this.prisma.kuaidiSite.findUnique({
              where: { id: sourceId },
              select: { ownerUserId: true },
            })
          )?.ownerUserId || ''
        );
      case 'ERRAND':
        return (
          (
            await this.prisma.errandSite.findUnique({
              where: { id: sourceId },
              select: { ownerUserId: true },
            })
          )?.ownerUserId || ''
        );
      case 'CIRCLE':
        return (
          (
            await this.prisma.circleCommunity.findUnique({
              where: { id: sourceId },
              select: { ownerUserId: true },
            })
          )?.ownerUserId || ''
        );
      case 'DIGITAL_HUMAN':
        return (
          (
            await this.prisma.digitalHumanSite.findUnique({
              where: { id: sourceId },
              select: { userId: true },
            })
          )?.userId || ''
        );
      case 'KNOWLEDGE_PAY':
        return (
          (
            await this.prisma.knowledgePaySite.findUnique({
              where: { id: sourceId },
              select: { userId: true },
            })
          )?.userId || ''
        );
      default:
        return '';
    }
  }

  private async owns(
    ownerUserId: string,
    scene: string,
    sourceId: number,
  ): Promise<boolean> {
    if (!Number.isInteger(sourceId) || sourceId <= 0) return false;
    const where = { id: sourceId, ownerUserId };
    switch (scene) {
      case 'ONSITE':
        return Boolean(await this.prisma.onsiteShop.findFirst({ where }));
      case 'CARD_SHOP':
        return Boolean(await this.prisma.cardShopSite.findFirst({ where }));
      case 'EXPRESS':
        return Boolean(await this.prisma.kuaidiSite.findFirst({ where }));
      case 'ERRAND':
        return Boolean(await this.prisma.errandSite.findFirst({ where }));
      case 'CIRCLE':
        return Boolean(await this.prisma.circleCommunity.findFirst({ where }));
      case 'DIGITAL_HUMAN':
        return Boolean(
          await this.prisma.digitalHumanSite.findFirst({
            where: { id: sourceId, userId: ownerUserId },
          }),
        );
      case 'KNOWLEDGE_PAY':
        return Boolean(
          await this.prisma.knowledgePaySite.findFirst({
            where: { id: sourceId, userId: ownerUserId },
          }),
        );
      default:
        return false;
    }
  }

  private async customerOf(
    scene: string,
    sourceId: number,
    customerId: number,
  ): Promise<CustomerIdentity | null> {
    switch (scene) {
      case 'ONSITE': {
        const row = await this.prisma.onsiteCustomer.findFirst({
          where: { id: customerId, shopId: sourceId },
          select: { unionId: true, phone: true, nickname: true },
        });
        return row ? this.identityOf(row) : null;
      }
      case 'CARD_SHOP': {
        const row = await this.prisma.cardShopCustomer.findFirst({
          where: { id: customerId, siteId: sourceId },
          select: { unionid: true, nickname: true },
        });
        return row ? this.identityOf({ ...row, unionId: row.unionid }) : null;
      }
      case 'EXPRESS': {
        const row = await this.prisma.kuaidiCustomer.findFirst({
          where: { id: customerId, siteId: sourceId },
          select: { unionid: true, nickname: true },
        });
        return row ? this.identityOf({ ...row, unionId: row.unionid }) : null;
      }
      case 'ERRAND': {
        const row = await this.prisma.errandCustomer.findFirst({
          where: { id: customerId, siteId: sourceId },
          select: { unionid: true, nickname: true },
        });
        return row ? this.identityOf({ ...row, unionId: row.unionid }) : null;
      }
      case 'CIRCLE': {
        const row = await this.prisma.circleUser.findFirst({
          where: { id: customerId, communityId: sourceId },
          select: { unionid: true, nickname: true },
        });
        return row ? this.identityOf({ ...row, unionId: row.unionid }) : null;
      }
      case 'DIGITAL_HUMAN': {
        const row = await this.prisma.digitalHumanMember.findFirst({
          where: { id: customerId, siteId: sourceId },
          select: { unionId: true, phone: true, nickname: true },
        });
        return row ? this.identityOf(row) : null;
      }
      case 'KNOWLEDGE_PAY': {
        const row = await this.prisma.knowledgePayMember.findFirst({
          where: { id: customerId, siteId: sourceId },
          select: { unionid: true, nickname: true },
        });
        return row ? this.identityOf({ ...row, unionId: row.unionid }) : null;
      }
      default:
        return null;
    }
  }

  private identityOf(row: {
    unionId?: string;
    phone?: string;
    nickname?: string;
  }): CustomerIdentity {
    return {
      unionId: String(row.unionId || ''),
      phone: String(row.phone || ''),
      nickname: String(row.nickname || ''),
    };
  }
}
