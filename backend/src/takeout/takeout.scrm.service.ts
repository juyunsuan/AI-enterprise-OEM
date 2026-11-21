import type { PrismaService } from '../prisma/prisma.service';
import type { ScrmSourceTagService } from '../wecom-scrm/scrm-source-tag.service';
import {
  nextRetryAt,
  scrmDedupeKey,
  scrmMobileHash,
  withBridgeTimeout,
  type ScrmBridge,
  type ScrmEventKind,
} from '../commerce-core/scrm-port';

/**
 * 外卖 × 企业微信 SCRM：复用 `ScrmBridge`，但事件落外卖自己的 outbox，
 * 与品牌商城的 `brand_scrm_outbox` 互不可见。
 */
export class TakeoutScrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: ScrmBridge,
    private readonly sourceTags?: ScrmSourceTagService,
  ) {}

  async enqueue(input: {
    shopId: number;
    ownerUserId: string;
    customerId: number;
    kind: ScrmEventKind;
    recordKey: string | number;
    payload?: Record<string, unknown>;
  }) {
    if (!input.shopId || !input.customerId) return;
    try {
      const shop = await this.prisma.takeoutShop.findUnique({
        where: { id: input.shopId },
        select: { scrmEnabled: true, name: true, ownerUserId: true },
      });
      if (!shop?.scrmEnabled) return;
      await this.prisma.takeoutScrmOutbox.createMany({
        data: [
          {
            dedupeKey: scrmDedupeKey('takeout', input.kind, input.recordKey),
            shopId: input.shopId,
            ownerUserId: input.ownerUserId || shop.ownerUserId,
            customerId: input.customerId,
            kind: input.kind,
            payload: {
              shopName: shop.name,
              ...(input.payload || {}),
            },
          },
        ],
        skipDuplicates: true,
      });
    } catch {
      // SCRM 是旁路：写不进 outbox 也不回滚订单
    }
  }

  /** 调度入口：按门店归属串行投递；失败按退避重试，匹配不到客户记 SKIPPED。 */
  async drain(limitOrgs = 20) {
    const summary = { orgs: 0, sent: 0, skipped: 0, failed: 0 };
    const groups = await this.prisma.takeoutScrmOutbox.findMany({
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
    }
    return summary;
  }

  private async drainOrg(ownerUserId: string) {
    const out = { sent: 0, skipped: 0, failed: 0 };
    const corp = await this.prisma.scrmCorp.findUnique({
      where: {
        orgType_orgUserId: { orgType: 'ENTERPRISE', orgUserId: ownerUserId },
      },
      select: { id: true },
    });
    const status = corp
      ? await this.bridge.status(corp.id)
      : { ok: false, reason: 'NOT_CONFIGURED' as const, hint: '' };
    const rows = await this.prisma.takeoutScrmOutbox.findMany({
      where: { ownerUserId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (!rows.length) return out;
    if (!status.ok) {
      await this.prisma.takeoutScrmOutbox.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { nextRetryAt: new Date(Date.now() + 3_600_000) },
      });
      return out;
    }
    for (const row of rows) {
      if (row.nextRetryAt && row.nextRetryAt.getTime() > Date.now()) continue;
      const contactId = await this.resolveContact(corp!.id, row.customerId);
      if (!contactId) {
        await this.prisma.takeoutScrmOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SKIPPED',
            lastError: 'match-miss：SCRM 里没有匹配到企微客户',
          },
        });
        out.skipped += 1;
        continue;
      }
      const payload = (row.payload || {}) as Record<string, unknown>;
      await this.sourceTags?.tagSource({
        ownerUserId,
        contactId,
        scene: 'TAKEOUT',
        sourceId: row.shopId,
        sourceName: textOf(payload.shopName),
      });
      const result = await withBridgeTimeout(() =>
        this.bridge.appendTimeline(corp!.id, {
          contactId,
          title: `${textOf(payload.shopName) || '外卖门店'} · ${eventTitle(row.kind)}`,
          detail: eventDetail(payload),
        }),
      );
      if (result.ok) {
        await this.prisma.takeoutScrmOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            attempts: row.attempts + 1,
            sentAt: new Date(),
            lastError: '',
            nextRetryAt: null,
          },
        });
        out.sent += 1;
      } else {
        const attempts = row.attempts + 1;
        await this.prisma.takeoutScrmOutbox.update({
          where: { id: row.id },
          data: {
            attempts,
            status: attempts >= 5 ? 'DEAD' : 'PENDING',
            lastError: result.error.slice(0, 500),
            nextRetryAt: attempts >= 5 ? null : nextRetryAt(attempts),
          },
        });
        out.failed += 1;
      }
    }
    return out;
  }

  private async resolveContact(orgId: number, customerId: number) {
    const customer = await this.prisma.takeoutCustomer.findUnique({
      where: { id: customerId },
      select: { unionId: true, phone: true },
    });
    if (!customer) return 0;
    const secret = String(
      process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
    ).trim();
    const mobileHash =
      customer.phone && secret ? scrmMobileHash(customer.phone, secret) : '';
    if (!customer.unionId && !mobileHash) return 0;
    const hit = await this.bridge.matchContact(orgId, {
      unionId: customer.unionId || '',
      mobileHash,
    });
    return hit?.contactId || 0;
  }
}

function textOf(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';
}

function eventTitle(kind: string) {
  if (kind === 'CUSTOMER_REGISTER') return '注册成为外卖顾客';
  if (kind === 'ORDER_PAID') return '外卖订单付款';
  if (kind === 'ORDER_COMPLETED') return '外卖订单完成';
  if (kind === 'COUPON_RECEIVED') return '领取优惠券';
  return kind;
}

function eventDetail(payload: Record<string, unknown>) {
  const parts: string[] = [];
  if (textOf(payload.orderNo)) parts.push(`订单 ${textOf(payload.orderNo)}`);
  if (textOf(payload.amountYuan))
    parts.push(`金额 ¥${textOf(payload.amountYuan)}`);
  if (textOf(payload.couponName))
    parts.push(`券 ${textOf(payload.couponName)}`);
  if (textOf(payload.customerLabel)) parts.push(textOf(payload.customerLabel));
  return parts.join(' · ') || '外卖顾客事件';
}
