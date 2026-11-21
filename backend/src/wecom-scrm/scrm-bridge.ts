import type { PrismaService } from '../prisma/prisma.service';
import type {
  ScrmBridge,
  ScrmBridgeStatus,
  ScrmProfile,
  ScrmTimelineEntry,
} from '../commerce-core/scrm-port';
import { scrmMobileHash } from '../commerce-core/scrm-port';

/**
 * `ScrmBridge` 的真实实现：SCRM 侧的写入动作全部走自己的表与服务，
 * 商城侧只经 `commerce-core/scrm-port` 的接口类型调用，两边互不 import。
 *
 * 手机号匹配：SCRM 侧的「手机号」是资料卡字段，桥按固定上下文 `scrm-match`
 * 算出 HMAC 后与商城传来的摘要比对——商城不存明文，SCRM 也不必知道商城口径。
 */
export class WecomScrmBridge implements ScrmBridge {
  constructor(private readonly prisma: PrismaService) {}

  /** 与 `brand.scrm.service` 使用同一份摘要密钥来源，保证两侧可比。 */
  private get matchSecret(): string {
    return String(
      process.env.SCRM_MATCH_SECRET ?? process.env.JWT_SECRET ?? '',
    ).trim();
  }

  private async corp(orgId: number) {
    if (!orgId) return null;
    return this.prisma.scrmCorp.findUnique({ where: { id: orgId } });
  }

  async status(orgId: number): Promise<ScrmBridgeStatus> {
    const corp = await this.corp(orgId);
    if (!corp) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        hint: '本账号还没接入企业微信客户运营，去「营销工具 · 企业微信 SCRM」完成接入后回来重试',
      };
    }
    if (!corp.enabled || corp.status !== 'ACTIVE') {
      return {
        ok: false,
        reason: 'FEATURE_CLOSED',
        hint: '企业微信 SCRM 已停用；商城交易不受影响，事件会保留为待发送，恢复后自动补发',
      };
    }
    if (!corp.contactSecretEnc) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        hint: 'SCRM 还缺「外部联系人」Secret，补齐后重试',
      };
    }
    return { ok: true, reason: 'OK', hint: '' };
  }

  async matchContact(
    orgId: number,
    query: { unionId?: string; mobileHash?: string },
  ): Promise<{ contactId: number } | null> {
    const corp = await this.corp(orgId);
    if (!corp) return null;
    const where = { orgType: corp.orgType, orgUserId: corp.orgUserId };
    const unionId = String(query.unionId || '').trim();
    if (unionId) {
      const hit = await this.prisma.scrmContact.findFirst({
        where: { ...where, unionId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (hit) return { contactId: hit.id };
    }
    const mobileHash = String(query.mobileHash || '').trim();
    if (!mobileHash || !this.matchSecret) return null;
    // 手机号只存在于 SCRM 的资料卡字段里：逐条摘要比对，不把明文带出 SCRM 域。
    const values = await this.prisma.scrmContactFieldValue.findMany({
      where: { ...where, fieldKey: 'mobile' },
      select: { contactId: true, value: true },
    });
    for (const row of values) {
      const mobile = firstString(row.value);
      if (mobile && scrmMobileHash(mobile, this.matchSecret) === mobileHash) {
        const alive = await this.prisma.scrmContact.findFirst({
          where: { ...where, id: row.contactId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (alive) return { contactId: alive.id };
      }
    }
    return null;
  }

  async appendTimeline(orgId: number, entry: ScrmTimelineEntry): Promise<void> {
    const corp = await this.corp(orgId);
    if (!corp) return;
    await this.prisma.scrmTimelineEvent.create({
      data: {
        orgType: corp.orgType,
        orgUserId: corp.orgUserId,
        contactId: entry.contactId,
        kind: 'MALL',
        title: entry.title.slice(0, 120),
        detail: entry.detail.slice(0, 2000),
        at: entry.at ?? new Date(),
      },
    });
    await this.prisma.scrmContact.updateMany({
      where: {
        orgType: corp.orgType,
        orgUserId: corp.orgUserId,
        id: entry.contactId,
      },
      data: { lastInteractionAt: entry.at ?? new Date() },
    });
  }

  async pushFields(
    orgId: number,
    contactId: number,
    values: Record<string, string>,
  ): Promise<{ written: number }> {
    const corp = await this.corp(orgId);
    if (!corp) return { written: 0 };
    const where = { orgType: corp.orgType, orgUserId: corp.orgUserId };
    const keys = Object.keys(values || {});
    if (keys.length === 0) return { written: 0 };
    const defined = await this.prisma.scrmContactField.findMany({
      where: { ...where, key: { in: keys } },
      select: { key: true },
    });
    const allowed = new Set(defined.map((row) => row.key));
    let written = 0;
    for (const key of keys) {
      if (!allowed.has(key)) continue;
      await this.prisma.scrmContactFieldValue.upsert({
        where: { contactId_fieldKey: { contactId, fieldKey: key } },
        create: {
          ...where,
          contactId,
          fieldKey: key,
          value: [String(values[key] ?? '')],
        },
        update: { value: [String(values[key] ?? '')] },
      });
      written += 1;
    }
    return { written };
  }

  async readProfiles(
    orgId: number,
    contactIds: number[],
  ): Promise<Map<number, ScrmProfile>> {
    const out = new Map<number, ScrmProfile>();
    const ids = Array.from(new Set(contactIds.filter((id) => id > 0)));
    if (ids.length === 0) return out;
    const corp = await this.corp(orgId);
    if (!corp) return out;
    const where = { orgType: corp.orgType, orgUserId: corp.orgUserId };
    const contacts = await this.prisma.scrmContact.findMany({
      where: { ...where, id: { in: ids } },
      select: { id: true, lastInteractionAt: true },
    });
    const links = await this.prisma.scrmContactTag.findMany({
      where: { ...where, contactId: { in: ids } },
      select: { contactId: true, tagId: true },
    });
    const tagIds = Array.from(new Set(links.map((row) => row.tagId)));
    const tags = tagIds.length
      ? await this.prisma.scrmTag.findMany({
          where: { ...where, id: { in: tagIds }, deleted: false },
          select: { id: true, name: true },
        })
      : [];
    const tagName = new Map(tags.map((row) => [row.id, row.name]));
    for (const contact of contacts) {
      out.set(contact.id, {
        tags: links
          .filter((row) => row.contactId === contact.id)
          .map((row) => tagName.get(row.tagId) || '')
          .filter(Boolean),
        lastInteractionAt: contact.lastInteractionAt
          ? contact.lastInteractionAt.toISOString()
          : '',
      });
    }
    return out;
  }
}

/** 字段值列可能存字符串或字符串数组（历史数据两种都有），取第一个非空值。 */
function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  return '';
}
