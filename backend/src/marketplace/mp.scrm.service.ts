import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
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
} from '../commerce-core/scrm-port';

/**
 * 事件生产接口：交易/券/售后只依赖它，默认空转实现让单测无需装配 SCRM。
 */
export interface MpScrmSink {
  enqueue(input: {
    marketId: number;
    merchantId: number;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    payload?: Record<string, unknown>;
  }): Promise<void>;
}

export const noopMpScrmSink: MpScrmSink = {
  enqueue() {
    return Promise.resolve();
  },
};

/**
 * 多店铺商城 × 企业微信 SCRM（B4）。
 *
 * 与品牌商城同一套端口纪律：交易主链路只写 `mp_scrm_outbox` 一行，
 * 投递由调度器异步完成；桥失败只影响这一行事件，不回滚订单、退款与领券。
 * 维度差异：这里按**商户**建 outbox——一个市场下的每个商户各自一条客户匹配线，
 * 但投递组织仍是市场运营方（`ownerUserId`）的企业微信，组织的桥只需接一次。
 */
export class MpScrmService implements MpScrmSink {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: ScrmBridge,
    private readonly sourceTags?: ScrmSourceTagService,
  ) {}

  // ---------------------------------------------------------------- 事件生产

  /** 市场未开 SCRM 时不生产事件；外发失败一律吞掉，绝不阻断业务事务。 */
  async enqueue(input: {
    marketId: number;
    merchantId: number;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!input.marketId || !input.merchantId || !input.customerId) return;
    try {
      const market = await this.prisma.mpMarket.findUnique({
        where: { id: input.marketId },
        select: { scrmEnabled: true, name: true, ownerUserId: true },
      });
      if (!market?.scrmEnabled) return;
      await this.prisma.mpScrmOutbox.createMany({
        data: [
          {
            marketId: input.marketId,
            merchantId: input.merchantId,
            ownerUserId: market.ownerUserId,
            customerId: input.customerId,
            eventKind: input.kind,
            dedupeKey: scrmDedupeKey(
              `mp:${input.marketId}:${input.merchantId}`,
              input.kind,
              input.recordKey,
            ),
            payloadJson: {
              marketName: market.name,
              ...(input.payload || {}),
            },
          },
        ],
        skipDuplicates: true,
      });
    } catch {
      // 外发是旁路：写不进 outbox 也绝不回滚订单/退款/领券
    }
  }

  // ---------------------------------------------------------------- 投递

  /** 调度器入口：与品牌商城共用一个 tick，按组织分组串行投递。 */
  async drain(limitOrgs = 20): Promise<{
    orgs: number;
    sent: number;
    skipped: number;
    failed: number;
    deferred: number;
  }> {
    const summary = { orgs: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
    const groups = await this.prisma.mpScrmOutbox.findMany({
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
          hint: '去「营销工具 · 企业微信 SCRM」完成接入',
        };
    const rows = await this.prisma.mpScrmOutbox.findMany({
      where: { ownerUserId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        marketId: true,
        merchantId: true,
        customerId: true,
        eventKind: true,
        payloadJson: true,
        attempts: true,
        nextAt: true,
        createdAt: true,
      },
    });
    if (rows.length === 0) return out;

    // 同品牌侧：冷却结束后要让最老那条再试一次，否则事件只能等 30 天窗口淘汰。
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
      await this.prisma.mpScrmOutbox.updateMany({
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
      await this.prisma.mpScrmOutbox.updateMany({
        where: { id: { in: plan.defer.map((row) => row.id) } },
        data: { nextAt: new Date(Date.now() + 3_600_000) },
      });
      out.deferred += plan.defer.length;
      return out;
    }

    const merchantIds = Array.from(
      new Set(plan.send.map((row) => row.merchantId)),
    );
    const merchants = merchantIds.length
      ? await this.prisma.mpMerchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true },
        })
      : [];
    const merchantName = new Map(merchants.map((row) => [row.id, row.name]));

    for (const row of plan.send) {
      const outcome = await this.deliver(corp!.id, {
        ...row,
        ownerUserId,
        merchantName: merchantName.get(row.merchantId) || '商户',
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
    row: {
      id: number;
      ownerUserId: string;
      marketId: number;
      merchantId: number;
      customerId: number;
      eventKind: string;
      payloadJson: unknown;
      attempts: number;
      merchantName: string;
    },
  ): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
    const payload = (row.payloadJson || {}) as Record<string, unknown>;
    const contactId = await this.resolveContact(orgId, row);
    if (!contactId) {
      await this.prisma.mpScrmOutbox.update({
        where: { id: row.id },
        data: {
          status: 'SKIPPED',
          lastError: 'match-miss：SCRM 里没有匹配到该商户的企微客户',
          sentAt: null,
        },
      });
      return 'SKIPPED';
    }
    await this.sourceTags?.tagSource({
      ownerUserId: row.ownerUserId,
      contactId,
      scene: 'MARKET',
      sourceId: row.merchantId,
      sourceName: row.merchantName,
    });
    const title = `${row.merchantName} · ${eventTitle(row.eventKind)}`;
    const detail = eventDetail(payload);
    const result = await withBridgeTimeout(() =>
      this.bridge.appendTimeline(orgId, { contactId, title, detail }),
    );
    if (result.ok) {
      await this.prisma.mpScrmOutbox.update({
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
    await this.prisma.mpScrmOutbox.update({
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
    row: {
      ownerUserId: string;
      marketId: number;
      merchantId: number;
      customerId: number;
    },
  ): Promise<number> {
    const binding = await this.prisma.mpScrmBinding.findUnique({
      where: {
        merchantId_customerId: {
          merchantId: row.merchantId,
          customerId: row.customerId,
        },
      },
    });
    if (binding?.status === 'BOUND' && binding.contactId > 0) {
      return binding.contactId;
    }
    if (binding?.status === 'IGNORED') return 0;
    const customer = await this.prisma.mpCustomer.findUnique({
      where: { id: row.customerId },
      select: { unionId: true, phone: true },
    });
    if (!customer) return 0;
    const mobileHash = this.mobileHashOf(customer.phone);
    const hit = await this.bridge.matchContact(orgId, {
      unionId: customer.unionId || binding?.unionId || '',
      mobileHash,
    });
    const base = {
      marketId: row.marketId,
      merchantId: row.merchantId,
      ownerUserId: row.ownerUserId,
      customerId: row.customerId,
      unionId: customer.unionId || '',
      mobileHash,
      bindSource: customer.unionId ? 'AUTO_UNIONID' : 'AUTO_MOBILE',
      status: 'BOUND',
      lastSyncAt: new Date(),
    };
    await this.prisma.mpScrmBinding.upsert({
      where: {
        merchantId_customerId: {
          merchantId: row.merchantId,
          customerId: row.customerId,
        },
      },
      create: { ...base, contactId: hit?.contactId ?? 0 },
      update: {
        contactId: hit?.contactId ?? 0,
        unionId: base.unionId,
        mobileHash,
        bindSource: base.bindSource,
        status: 'BOUND',
        lastSyncAt: base.lastSyncAt,
      },
    });
    return hit?.contactId ?? 0;
  }

  private mobileHashOf(phone: string): string {
    const secret = String(
      process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
    ).trim();
    if (!phone || !secret) return '';
    return scrmMobileHash(phone, secret);
  }

  // ---------------------------------------------------------------- 设置与健康度

  /** 市场运营方视图：市场级开关 + 全市场外发箱和匹配档位。 */
  async state(ownerUserId: string) {
    const market = await this.requireMarket(ownerUserId);
    const status = await this.marketBridgeStatus(ownerUserId);
    const [outbox, bindings, lastSent, missed] = await Promise.all([
      this.outboxCounts({ marketId: market.id }),
      this.bindingCounts({ marketId: market.id }),
      this.lastSentAt({ marketId: market.id }),
      this.prisma.mpScrmOutbox.count({
        where: { marketId: market.id, status: 'SKIPPED' },
      }),
    ]);
    return {
      enabled: market.scrmEnabled,
      marketName: market.name,
      bridge: status,
      outbox,
      bindings: { ...bindings, miss: missed },
      lastSentAt: lastSent,
    };
  }

  /** 商户只读视图：开关归市场，商户只看到自己名下的事件。 */
  async merchantState(payload: { marketId: number; merchantId: number }) {
    const merchant = await this.prisma.mpMerchant.findFirst({
      where: { id: payload.merchantId, marketId: payload.marketId },
      select: { name: true },
    });
    if (!merchant) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '商户身份无效，请重新登录',
      );
    }
    const market = await this.requireMarketById(payload.marketId);
    const status = await this.marketBridgeStatus(market.ownerUserId);
    const [outbox, bindings, lastSent, missed] = await Promise.all([
      this.outboxCounts({ merchantId: payload.merchantId }),
      this.bindingCounts({ merchantId: payload.merchantId }),
      this.lastSentAt({ merchantId: payload.merchantId }),
      this.prisma.mpScrmOutbox.count({
        where: { merchantId: payload.merchantId, status: 'SKIPPED' },
      }),
    ]);
    return {
      enabled: market.scrmEnabled,
      marketName: market.name,
      merchantName: merchant.name,
      bridge: status,
      outbox,
      bindings: { ...bindings, miss: missed },
      lastSentAt: lastSent,
    };
  }

  async toggle(ownerUserId: string, enabled: boolean) {
    const market = await this.requireMarket(ownerUserId);
    await this.prisma.mpMarket.update({
      where: { id: market.id },
      data: { scrmEnabled: Boolean(enabled) },
    });
    if (!enabled) {
      // 关掉时不清账：待发送事件保留，SCRM 恢复后仍可补发
      return {
        ok: true,
        message: '已关闭，新事件不再产生；历史待发事件保留',
      };
    }
    return {
      ok: true,
      message: '已开启，顾客下单/完成/退款/领券等事件将异步写入企微客户时间线',
    };
  }

  /** 立即投递一次（运营方手动重试），只处理本市场所属组织。 */
  async retryNow(ownerUserId: string): Promise<{
    ok: boolean;
    message: string;
    sent: number;
    skipped: number;
    failed: number;
    deferred: number;
  }> {
    await this.requireMarket(ownerUserId);
    await this.prisma.mpScrmOutbox.updateMany({
      where: { ownerUserId, status: 'PENDING', nextAt: { gt: new Date() } },
      data: { nextAt: null },
    });
    const result = await this.drainOrg(ownerUserId);
    return {
      ok: true,
      message: `已投递：成功 ${result.sent}，跳过 ${result.skipped}，失败 ${result.failed}，顺延 ${result.deferred}`,
      ...result,
    };
  }

  /** 一键重投 SKIPPED：SCRM 侧补完客户后把漏掉的事件补发。 */
  async replaySkipped(ownerUserId: string, ids?: number[]) {
    const market = await this.requireMarket(ownerUserId);
    const where: Record<string, unknown> = {
      marketId: market.id,
      ownerUserId,
      status: 'SKIPPED',
    };
    if (ids?.length) {
      where.id = { in: ids.map(Number).filter((id) => id > 0) };
    }
    const changed = await this.prisma.mpScrmOutbox.updateMany({
      where,
      data: { status: 'PENDING', attempts: 0, nextAt: null, lastError: '' },
    });
    return {
      ok: true,
      message: `已重投 ${changed.count} 条`,
      count: changed.count,
    };
  }

  // ---------------------------------------------------------------- 内部

  private async requireMarket(ownerUserId: string) {
    const market = await this.prisma.mpMarket.findUnique({
      where: { ownerUserId },
    });
    if (!market) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '尚未创建市场，请先完成建店',
      );
    }
    return market;
  }

  private async requireMarketById(marketId: number) {
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: marketId },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场不存在');
    }
    return market;
  }

  private async marketBridgeStatus(ownerUserId: string) {
    const corp = await this.prisma.scrmCorp.findUnique({
      where: {
        orgType_orgUserId: { orgType: 'ENTERPRISE', orgUserId: ownerUserId },
      },
      select: { id: true },
    });
    return corp
      ? this.bridge.status(corp.id)
      : {
          ok: false,
          reason: 'NOT_CONFIGURED' as const,
          hint: '去「营销工具 · 企业微信 SCRM」完成接入',
        };
  }

  private async outboxCounts(scope: {
    marketId?: number;
    merchantId?: number;
  }) {
    const counts = await this.prisma.mpScrmOutbox.groupBy({
      by: ['status'],
      where: scope,
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
    return byStatus;
  }

  private async bindingCounts(scope: {
    marketId?: number;
    merchantId?: number;
  }) {
    const rows = await this.prisma.mpScrmBinding.groupBy({
      by: ['bindSource', 'status'],
      where: scope,
      _count: { _all: true },
    });
    const sum = (predicate: (row: (typeof rows)[number]) => boolean) =>
      rows.filter(predicate).reduce((acc, row) => acc + row._count._all, 0);
    return {
      auto: sum((row) => row.status === 'BOUND' && row.bindSource !== 'MANUAL'),
      manual: sum(
        (row) => row.status === 'BOUND' && row.bindSource === 'MANUAL',
      ),
      ignored: sum((row) => row.status === 'IGNORED'),
    };
  }

  private async lastSentAt(scope: { marketId?: number; merchantId?: number }) {
    const row = await this.prisma.mpScrmOutbox.findFirst({
      where: { ...scope, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return row?.sentAt ? row.sentAt.toISOString() : '';
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

/** 只送摘要：单号 / 金额 / 券名 / 店铺名，不送收货人与地址。 */
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
