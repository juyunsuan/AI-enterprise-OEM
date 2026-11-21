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
 * 租赁 × 企业微信 SCRM：复用站内 ScrmBridge，事件只写租赁自己的 outbox。
 * 业务事务不依赖 SCRM 是否开通：写入失败只降级为空转。
 */
export class RentalScrmService {
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
    if (!input.shopId || !input.customerId || !input.ownerUserId) return;
    try {
      const shop = await this.prisma.rentalShop.findUnique({
        where: { id: input.shopId },
        select: { name: true, ownerUserId: true, tradeJson: true },
      });
      if (!shop) return;
      const trade = (shop.tradeJson || {}) as { scrmCodeId?: unknown };
      if (Number(trade.scrmCodeId || 0) <= 0) return;
      await this.prisma.rentalScrmOutbox.createMany({
        data: [
          {
            dedupeKey: scrmDedupeKey('rental', input.kind, input.recordKey),
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
      // SCRM 是旁路：写不进 outbox 也不回滚租单
    }
  }

  async drain(limitOrgs = 20) {
    const groups = await this.prisma.rentalScrmOutbox.findMany({
      where: { status: 'PENDING' },
      select: { ownerUserId: true },
      distinct: ['ownerUserId'],
      take: Math.max(1, limitOrgs),
    });
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const group of groups) {
      const result = await this.drainOrg(group.ownerUserId);
      sent += result.sent;
      skipped += result.skipped;
      failed += result.failed;
    }
    return { orgs: groups.length, sent, skipped, failed };
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
    const rows = await this.prisma.rentalScrmOutbox.findMany({
      where: { ownerUserId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (!rows.length) return out;
    if (!status.ok) {
      await this.prisma.rentalScrmOutbox.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { nextRetryAt: new Date(Date.now() + 3_600_000) },
      });
      return out;
    }
    for (const row of rows) {
      if (row.nextRetryAt && row.nextRetryAt.getTime() > Date.now()) continue;
      const contactId = await this.resolveContact(corp!.id, row.customerId);
      if (!contactId) {
        await this.prisma.rentalScrmOutbox.update({
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
        scene: 'RENTAL',
        sourceId: row.shopId,
        sourceName:
          typeof payload.shopName === 'string' ? payload.shopName : '',
      });
      const result = await withBridgeTimeout(() =>
        this.bridge.appendTimeline(corp!.id, {
          contactId,
          title: `${typeof payload.shopName === 'string' ? payload.shopName : '租赁门店'} · ${eventTitle(row.kind)}`,
          detail: eventDetail(payload),
        }),
      );
      if (result.ok) {
        await this.prisma.rentalScrmOutbox.update({
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
        await this.prisma.rentalScrmOutbox.update({
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
    const customer = await this.prisma.rentalCustomer.findUnique({
      where: { id: customerId },
      select: { unionId: true, phone: true },
    });
    if (!customer) return 0;
    const secret = String(
      process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
    ).trim();
    const mobileHash =
      customer.phone && secret ? scrmMobileHash(customer.phone, secret) : '';
    const matched = await this.bridge.matchContact(orgId, {
      ...(customer.unionId ? { unionId: customer.unionId } : {}),
      ...(mobileHash ? { mobileHash } : {}),
    });
    return matched?.contactId || 0;
  }
}

function eventTitle(kind: string) {
  const labels: Record<string, string> = {
    CUSTOMER_REGISTER: '注册成为租赁顾客',
    ORDER_PAID: '租单付款',
    ORDER_COMPLETED: '租单完成',
    ORDER_REFUNDED: '租单退款',
  };
  return labels[kind] || kind;
}

function eventDetail(payload: Record<string, unknown>) {
  const parts = [payload.itemName, payload.orderNo, payload.amount]
    .filter((item) => item !== undefined && item !== null && item !== '')
    .map((item) => String(item));
  return parts.join(' · ');
}
