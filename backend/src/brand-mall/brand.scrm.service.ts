import type { PrismaService } from '../prisma/prisma.service';
import type { ScrmSourceTagService } from '../wecom-scrm/scrm-source-tag.service';
import {
  nextRetryAt,
  planOutboxDrain,
  scrmDedupeKey,
  scrmMobileHash,
  withBridgeTimeout,
  type ScrmBridge,
  type ScrmEventKind,
  type ScrmOutboxStatus,
  type ScrmProfile,
} from '../commerce-core/scrm-port';

/**
 * 事件生产接口：交易/顾客服务只依赖它，默认空转实现让单测无需装配 SCRM。
 */
export interface BrandScrmSink {
  enqueue(input: {
    shopId: number;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    ownerUserId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
}

export const noopScrmSink: BrandScrmSink = {
  enqueue() {
    return Promise.resolve();
  },
};

/**
 * 品牌商城 × 企业微信 SCRM 的松耦合接线。
 *
 * 两条铁律（设计方案 §九之二 / §十一）：
 * 1. 交易主链路只往 `brand_scrm_outbox` 写一行，绝不在这里同步调桥；
 * 2. 任何桥的失败都只影响这一行事件的状态，不回滚订单、不阻断退款。
 */
export class BrandScrmService implements BrandScrmSink {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: ScrmBridge,
    private readonly sourceTags?: ScrmSourceTagService,
  ) {}

  // ---------------------------------------------------------------- 事件生产

  /**
   * 主事务旁的 outbox 写入口：`skipDuplicates` 保证重放不产生第二条。
   * 店铺未开启 SCRM 时直接返回——关掉一个业务不生产事件，SCRM 侧不感知。
   */
  async enqueue(input: {
    shopId: number;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    ownerUserId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!input.shopId || !input.customerId) return;
    try {
      const shop = await this.prisma.brandShop.findUnique({
        where: { id: input.shopId },
        select: { scrmEnabled: true, name: true, ownerUserId: true },
      });
      if (!shop?.scrmEnabled) return;
      await this.enqueueUnchecked({
        ...input,
        ownerUserId: input.ownerUserId || shop.ownerUserId,
        shopName: shop.name,
      });
    } catch {
      // 外发是旁路：写不进 outbox 也绝不回滚订单/退款
    }
  }

  /** 已确认开关时的写入口（批量场景省一次店铺查询）。 */
  private async enqueueUnchecked(input: {
    shopId: number;
    ownerUserId: string;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    shopName: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.brandScrmOutbox.createMany({
      data: [
        {
          shopId: input.shopId,
          ownerUserId: input.ownerUserId,
          customerId: input.customerId,
          eventKind: input.kind,
          dedupeKey: scrmDedupeKey(
            `brand:${input.shopId}`,
            input.kind,
            input.recordKey,
          ),
          payloadJson: {
            shopName: input.shopName,
            ...(input.payload || {}),
          },
        },
      ],
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------------- 投递

  /** 调度器入口：每轮按组织串行，单组织批量上限见 commerce-core 策略。 */
  async drain(limitOrgs = 20): Promise<{
    orgs: number;
    sent: number;
    skipped: number;
    failed: number;
    deferred: number;
  }> {
    const summary = { orgs: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
    const groups = await this.prisma.brandScrmOutbox.findMany({
      where: { status: 'PENDING' },
      select: { ownerUserId: true },
      distinct: ['ownerUserId'],
      take: Math.max(1, limitOrgs),
    });
    for (const group of groups) {
      summary.orgs += 1;
      const result = await this.drainOrg(group.ownerUserId);
      summary.sent += result.sent;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
      summary.deferred += result.deferred;
    }
    return summary;
  }

  private async drainOrg(ownerUserId: string): Promise<{
    sent: number;
    skipped: number;
    failed: number;
    deferred: number;
  }> {
    const out = { sent: 0, skipped: 0, failed: 0, deferred: 0 };
    const corp = await this.prisma.scrmCorp.findUnique({
      where: {
        orgType_orgUserId: { orgType: 'ENTERPRISE', orgUserId: ownerUserId },
      },
      select: { id: true },
    });
    const status = corp
      ? await this.bridge.status(corp.id)
      : {
          ok: false,
          reason: 'NOT_CONFIGURED' as const,
          hint: '未接入企业微信客户运营',
        };
    const rows = await this.prisma.brandScrmOutbox.findMany({
      where: { ownerUserId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        shopId: true,
        customerId: true,
        eventKind: true,
        payloadJson: true,
        attempts: true,
        nextAt: true,
        createdAt: true,
      },
    });
    if (rows.length === 0) return out;

    // 连续失败达到阈值且仍在冷却期内才熔断整组织：冷却结束要让最老那条再试一次，
    // 否则 attempts 永远停在阈值、DEAD 不可达，事件只能靠 30 天窗口淘汰。
    const now = Date.now();
    const circuitOpen = rows.some(
      (row) =>
        row.attempts >= 4 && row.nextAt !== null && row.nextAt.getTime() > now,
    );
    const plan = planOutboxDrain(
      rows.map((row) => ({ ...row, nextTryAt: row.nextAt })),
      { unavailable: !status.ok || circuitOpen },
    );

    if (plan.expire.length) {
      await this.prisma.brandScrmOutbox.updateMany({
        where: { id: { in: plan.expire.map((row) => row.id) } },
        data: {
          status: 'SKIPPED',
          lastError: status.ok
            ? '超出补发窗口或被积压水位淘汰'
            : `SCRM 不可用（${status.reason}）超过补发窗口`,
        },
      });
      out.skipped += plan.expire.length;
    }

    if (!status.ok) {
      // 关掉 SCRM 不是失败：顺延时间、不消耗 attempts，恢复后自动补发。
      const deferUntil = new Date(Date.now() + 3_600_000);
      await this.prisma.brandScrmOutbox.updateMany({
        where: { id: { in: plan.defer.map((row) => row.id) } },
        data: { nextAt: deferUntil },
      });
      out.deferred += plan.defer.length;
      return out;
    }

    const shopIds = Array.from(new Set(plan.send.map((row) => row.shopId)));
    const shops = shopIds.length
      ? await this.prisma.brandShop.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, name: true },
        })
      : [];
    const shopName = new Map(shops.map((row) => [row.id, row.name]));

    for (const row of plan.send) {
      const outcome = await this.deliver(corp!.id, ownerUserId, {
        ...row,
        shopName: shopName.get(row.shopId) || '品牌商城',
      });
      if (outcome === 'SENT') out.sent += 1;
      else if (outcome === 'SKIPPED') out.skipped += 1;
      else out.failed += 1;
    }
    out.deferred += plan.defer.length;
    return out;
  }

  private async deliver(
    orgId: number,
    ownerUserId: string,
    row: {
      id: number;
      shopId: number;
      customerId: number;
      eventKind: string;
      payloadJson: unknown;
      attempts: number;
      shopName: string;
    },
  ): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
    const payload = (row.payloadJson || {}) as Record<string, unknown>;
    const contactId = await this.resolveContact(
      orgId,
      row.shopId,
      row.customerId,
    );
    if (!contactId) {
      await this.prisma.brandScrmOutbox.update({
        where: { id: row.id },
        data: {
          status: 'SKIPPED',
          lastError: 'match-miss：SCRM 里没有匹配到企微客户',
          sentAt: null,
        },
      });
      return 'SKIPPED';
    }
    await this.sourceTags?.tagSource({
      ownerUserId,
      contactId,
      scene: 'BRAND',
      sourceId: row.shopId,
      sourceName: row.shopName,
    });
    const title = `${row.shopName} · ${eventTitle(row.eventKind)}`;
    const detail = eventDetail(payload);
    const result = await withBridgeTimeout(() =>
      this.bridge.appendTimeline(orgId, { contactId, title, detail }),
    );
    if (result.ok) {
      await this.prisma.brandScrmOutbox.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          attempts: row.attempts + 1,
          sentAt: new Date(),
          lastError: '',
          nextAt: null,
        },
      });
      return 'SENT';
    }
    const attempts = row.attempts + 1;
    await this.prisma.brandScrmOutbox.update({
      where: { id: row.id },
      data: {
        attempts,
        status: attempts >= 5 ? 'DEAD' : 'PENDING',
        lastError: result.error.slice(0, 500),
        nextAt: attempts >= 5 ? null : nextRetryAt(attempts),
      },
    });
    return 'FAILED';
  }

  /** 绑定优先；没有绑定就按 unionId > mobileHash 自动匹配，匹配不到不猜。 */
  private async resolveContact(
    orgId: number,
    shopId: number,
    customerId: number,
  ): Promise<number> {
    const binding = await this.prisma.brandScrmBinding.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
    });
    if (binding?.status === 'BOUND' && binding.contactId > 0) {
      return binding.contactId;
    }
    if (binding?.status === 'IGNORED') return 0;
    const customer = await this.prisma.brandCustomer.findUnique({
      where: { id: customerId },
      select: { id: true, unionId: true, phone: true, nickname: true },
    });
    if (!customer) return 0;
    const mobileHash = this.mobileHashOf(customer.phone);
    const hit = await this.bridge.matchContact(orgId, {
      unionId: customer.unionId || binding?.unionId || '',
      mobileHash,
    });
    if (!hit) {
      await this.prisma.brandScrmBinding.upsert({
        where: { shopId_customerId: { shopId, customerId } },
        create: {
          shopId,
          ownerUserId: (await this.ownerOf(shopId)) || '',
          customerId,
          contactId: 0,
          unionId: customer.unionId || '',
          mobileHash,
          bindSource: customer.unionId ? 'AUTO_UNIONID' : 'AUTO_MOBILE',
          status: 'BOUND',
          lastSyncAt: new Date(),
        },
        update: {
          unionId: customer.unionId || '',
          mobileHash,
          lastSyncAt: new Date(),
        },
      });
      return 0;
    }
    await this.prisma.brandScrmBinding.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: {
        shopId,
        ownerUserId: (await this.ownerOf(shopId)) || '',
        customerId,
        contactId: hit.contactId,
        unionId: customer.unionId || '',
        mobileHash,
        bindSource: customer.unionId ? 'AUTO_UNIONID' : 'AUTO_MOBILE',
        status: 'BOUND',
        lastSyncAt: new Date(),
      },
      update: {
        contactId: hit.contactId,
        unionId: customer.unionId || '',
        mobileHash,
        bindSource: customer.unionId ? 'AUTO_UNIONID' : 'AUTO_MOBILE',
        status: 'BOUND',
        lastSyncAt: new Date(),
      },
    });
    return hit.contactId;
  }

  private async ownerOf(shopId: number): Promise<string> {
    const shop = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true },
    });
    return shop?.ownerUserId || '';
  }

  private mobileHashOf(phone: string): string {
    const secret = String(
      process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
    ).trim();
    if (!phone || !secret) return '';
    return scrmMobileHash(phone, secret);
  }

  // ---------------------------------------------------------------- 设置与健康度

  async state(args: { ownerUserId: string; shopId: number }) {
    const shop = await this.prisma.brandShop.findUnique({
      where: { id: args.shopId },
      select: { name: true, scrmEnabled: true },
    });
    const corp = await this.prisma.scrmCorp.findUnique({
      where: {
        orgType_orgUserId: {
          orgType: 'ENTERPRISE',
          orgUserId: args.ownerUserId,
        },
      },
      select: { id: true },
    });
    const status = corp
      ? await this.bridge.status(corp.id)
      : {
          ok: false,
          reason: 'NOT_CONFIGURED' as const,
          hint: '去「营销工具 · 企业微信 SCRM」完成接入',
        };
    const counts = await this.prisma.brandScrmOutbox.groupBy({
      by: ['status'],
      where: { shopId: args.shopId },
      _count: { _all: true },
    });
    const byStatus: Record<ScrmOutboxStatus, number> = {
      PENDING: 0,
      SENT: 0,
      SKIPPED: 0,
      DEAD: 0,
    };
    for (const row of counts) {
      if (row.status in byStatus) {
        byStatus[row.status as ScrmOutboxStatus] = row._count._all;
      }
    }
    const bindings = await this.prisma.brandScrmBinding.groupBy({
      by: ['bindSource', 'status'],
      where: { shopId: args.shopId },
      _count: { _all: true },
    });
    const bound = bindings
      .filter((row) => row.status === 'BOUND' && row.bindSource !== 'MANUAL')
      .reduce((sum, row) => sum + row._count._all, 0);
    const manual = bindings
      .filter((row) => row.status === 'BOUND' && row.bindSource === 'MANUAL')
      .reduce((sum, row) => sum + row._count._all, 0);
    const ignored = bindings
      .filter((row) => row.status === 'IGNORED')
      .reduce((sum, row) => sum + row._count._all, 0);
    const lastSent = await this.prisma.brandScrmOutbox.findFirst({
      where: { shopId: args.shopId, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    const missed = await this.prisma.brandScrmOutbox.count({
      where: { shopId: args.shopId, status: 'SKIPPED' },
    });
    return {
      enabled: Boolean(shop?.scrmEnabled),
      shopName: shop?.name || '',
      bridge: status,
      outbox: byStatus,
      bindings: { auto: bound, manual, ignored, miss: missed },
      lastSentAt: lastSent?.sentAt ? lastSent.sentAt.toISOString() : '',
    };
  }

  async toggle(
    args: { ownerUserId: string; shopId: number },
    enabled: boolean,
  ) {
    await this.prisma.brandShop.updateMany({
      where: { id: args.shopId, ownerUserId: args.ownerUserId },
      data: { scrmEnabled: Boolean(enabled) },
    });
    if (!enabled) {
      // 关掉时不清账：待发送事件保留，SCRM 恢复后仍可补发（可随时手动关停）
      return { ok: true, message: '已关闭，新事件不再产生；历史待发事件保留' };
    }
    return {
      ok: true,
      message: '已开启，顾客注册/下单/退款等事件将异步写入企微客户时间线',
    };
  }

  /** 立即投递一次（店主手动重试），只处理该店铺所属组织。 */
  async retryNow(args: { ownerUserId: string; shopId: number }) {
    await this.prisma.brandScrmOutbox.updateMany({
      where: {
        shopId: args.shopId,
        status: 'PENDING',
        nextAt: { gt: new Date() },
      },
      data: { nextAt: null },
    });
    const result = await this.drainOrg(args.ownerUserId);
    return {
      ok: true,
      message: `已投递：成功 ${result.sent}，跳过 ${result.skipped}，失败 ${result.failed}，顺延 ${result.deferred}`,
      ...result,
    };
  }

  /** 一键重投 SKIPPED：店主在 SCRM 侧补完客户后把漏掉的事件补发。 */
  async replaySkipped(args: {
    ownerUserId: string;
    shopId: number;
    ids?: number[];
  }) {
    const where: Record<string, unknown> = {
      shopId: args.shopId,
      ownerUserId: args.ownerUserId,
      status: 'SKIPPED',
    };
    if (args.ids?.length)
      where.id = { in: args.ids.map(Number).filter((id) => id > 0) };
    const changed = await this.prisma.brandScrmOutbox.updateMany({
      where,
      data: { status: 'PENDING', attempts: 0, nextAt: null, lastError: '' },
    });
    return {
      ok: true,
      message: `已重投 ${changed.count} 条`,
      count: changed.count,
    };
  }

  /** 顾客详情只读画像：绑定信息 + SCRM 标签（未开启或未匹配返回空值，不留空指针）。 */
  async customerProfile(
    args: { ownerUserId: string; shopId: number },
    customerId: number,
  ) {
    const binding = await this.prisma.brandScrmBinding.findUnique({
      where: { shopId_customerId: { shopId: args.shopId, customerId } },
    });
    const corp = await this.prisma.scrmCorp.findUnique({
      where: {
        orgType_orgUserId: {
          orgType: 'ENTERPRISE',
          orgUserId: args.ownerUserId,
        },
      },
      select: { id: true },
    });
    const status = corp
      ? await this.bridge.status(corp.id)
      : { ok: false, reason: 'NOT_CONFIGURED' as const, hint: '' };
    if (!binding || binding.contactId <= 0 || !corp) {
      return {
        bound: false,
        bridge: status,
        tags: [] as string[],
        lastInteractionAt: '',
        bindSource: binding?.bindSource || '',
        contactId: 0,
      };
    }
    const profiles = status.ok
      ? await this.bridge.readProfiles(corp.id, [binding.contactId])
      : new Map<number, ScrmProfile>();
    const profile = profiles.get(binding.contactId);
    return {
      bound: true,
      bridge: status,
      tags: profile?.tags || [],
      lastInteractionAt: profile?.lastInteractionAt || '',
      bindSource: binding.bindSource,
      contactId: binding.contactId,
    };
  }
}

function eventTitle(kind: string): string {
  switch (kind) {
    case 'CUSTOMER_REGISTER':
      return '新顾客注册';
    case 'ORDER_PAID':
      return '订单付款';
    case 'ORDER_COMPLETED':
      return '订单完成';
    case 'ORDER_REFUNDED':
      return '订单退款';
    case 'COUPON_RECEIVED':
      return '领取优惠券';
    case 'REVIEW_SUBMITTED':
      return '提交评价';
    case 'BALANCE_RECHARGED':
      return '余额充值';
    case 'CUSTOMER_SILENT_30D':
      return '30 天未回访';
    default:
      return kind;
  }
}

/** 只送摘要：事件类型 / 金额 / 单号 / 店铺名，不送收货人与地址。 */
function eventDetail(payload: Record<string, unknown>): string {
  const label = textOf(payload.customerLabel);
  const orderNo = textOf(payload.orderNo);
  const amountYuan = Number(payload.amountYuan);
  const couponName = textOf(payload.couponName);
  const parts: string[] = [];
  if (label) parts.push(label);
  if (orderNo) parts.push(`单号 ${orderNo}`);
  if (Number.isFinite(amountYuan) && amountYuan > 0) {
    parts.push(`金额 ¥${amountYuan.toFixed(2)}`);
  }
  if (couponName) parts.push(couponName);
  return parts.join(' · ') || '商城事件';
}

/** payload 是自由 JSON 列：只认字符串，其余类型直接当空，避免 `[object Object]` 外发。 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
