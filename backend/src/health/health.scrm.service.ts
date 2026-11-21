import {
  HEALTH_SCRM_EVENT_TYPES,
  HEALTH_SCRM_EVENT_LABELS,
  type HealthScrmEventRow,
  type HealthScrmLink,
  type HealthScrmLinkSaveBody,
  type HealthScrmPushBody,
  type HealthScrmPushResult,
  type HealthScrmTagMap,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { pageParam, pageOf } from '../common/api';
import type { ScrmSourceTagService } from '../wecom-scrm/scrm-source-tag.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import {
  circuitShouldOpen,
  nextRetryAt,
  OUTBOX_POLICY,
  outboxRoundUnavailable,
  planOutboxDrain,
  withBridgeTimeout,
} from '../commerce-core/outbox-policy';
import type { PrismaService } from '../prisma/prisma.service';
import type { HrmOrg } from '../hrm/hrm.scope';
import type { ScrmSopService } from '../wecom-scrm/scrm-sop.service';
import { audit, clip, jsonObj, requireShop, toIso } from './health.shared';

const PUSH_SKIP = {
  NO_LINK: '本店尚未绑定企业微信 SCRM 组织',
  SCRM_CLOSED: '营销工具的 SCRM 被停用或未接入，事件继续排队',
  NO_TAG: '该事件类型还没有配置企微标签',
  NO_CONTACT: '该顾客还没有企业微信外部联系人映射',
} as const;

/** 每轮扫描上限：与 brand / 多店铺商城侧同形，让存活期与积压水位能看到真实积压。 */
const PUSH_SCAN_LIMIT = 500;

/**
 * 健康管理 → 企业微信 SCRM 的松耦合出站。
 *
 * 边界（写死在这里，别处不要再加）：
 * 1. 本服务**只读** scrm_corps / scrm_contacts 的极少量字段用于寻址，绝不写 SCRM 的表；
 * 2. SCRM 未接入、被平台关闭、缺标签、顾客没加企微好友，都只把事件标成 SKIPPED 并说明原因，
 *    本域任何功能不因此失败；
 * 3. 反向没有任何依赖：SCRM 侧不 import 本域，健康工具被关闭时 SCRM 照常运行。
 *
 * 投递容错走公共件 `commerce-core/outbox-policy`（与 brand_scrm_outbox / mp_scrm_outbox 同一套
 * 超时 / 熔断 / 指数退避 / 水位淘汰数值）；表不合并，只共用策略。
 * `payload_json` 存「快照时刻的事实」，补发时不回读健康域现值。
 */
export class HealthScrmService {
  /**
   * 退避与熔断的进程内门禁（事件 id → 下次可投递时间）。
   *
   * 取舍：`health_scrm_events` 只有 status / attempts / occurred_at / sent_at，
   * 没有 `next_at` 列——补列要走迁移，本轮不动 schema，所以「下次可投递时间」与
   * 「本店连续失败数」在这里等价维护。影响面可控：
   * - 门禁只表示「早于该时间不要重试」，过期即丢弃，重启最坏结果只是少等一轮退避；
   * - 投递动作是给同一联系人打同一标签（SCRM 侧幂等），少等一轮不会重复产生副作用；
   * - 后续若补 next_at 列，只需把 gates 的读写换成列读写，策略数值一行都不用动。
   */
  private readonly gates = new Map<number, Date>();
  /** 店铺级连续失败计数与熔断冷却到期时间（毫秒时间戳）。 */
  private readonly circuits = new Map<
    number,
    { failures: number; openUntil: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sop: ScrmSopService,
    /** 桥调用超时；默认取公共策略数值，单测可注入短值。 */
    private readonly bridgeTimeoutMs: number = OUTBOX_POLICY.timeoutMs,
    private readonly sourceTags?: ScrmSourceTagService,
  ) {}

  // ---------- 绑定 ----------

  private async linkRow(shopId: number) {
    return this.prisma.healthScrmLink.findFirst({
      where: { shopId },
      orderBy: { id: 'asc' },
    });
  }

  private async tagMapOf(shopId: number): Promise<HealthScrmTagMap> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: `health_scrm_tag_map_${shopId}` },
    });
    return jsonObj<HealthScrmTagMap>(row?.value ? safeJson(row.value) : {}, {});
  }

  private async saveTagMap(shopId: number, map: HealthScrmTagMap) {
    await this.prisma.systemSetting.upsert({
      where: { key: `health_scrm_tag_map_${shopId}` },
      create: {
        key: `health_scrm_tag_map_${shopId}`,
        value: JSON.stringify(map),
      },
      update: { value: JSON.stringify(map) },
    });
  }

  /** SCRM 侧可用性：读 corp 的 enabled 与 status，不回任何密钥。 */
  private async scrmState(orgType: string, orgUserId: string) {
    const corp = await this.prisma.scrmCorp.findUnique({
      where: { orgType_orgUserId: { orgType, orgUserId } },
      select: { corpName: true, enabled: true, status: true, corpId: true },
    });
    if (!corp) {
      return { available: false, text: '尚未接入企业微信 SCRM', corpName: '' };
    }
    if (!corp.enabled) {
      return {
        available: false,
        text: '企业微信 SCRM 已被停用',
        corpName: corp.corpName,
      };
    }
    return {
      available: true,
      text: corp.corpName || corp.corpId || '已接入',
      corpName: corp.corpName,
    };
  }

  async link(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthScrmLink> {
    const context = await requireShop(this.prisma, user, query.shopId);
    const shopId = context.shop.id;
    const row = await this.linkRow(shopId);
    const [pendingCount, failedCount, sentCount] = await Promise.all([
      this.prisma.healthScrmEvent.count({
        where: { shopId, status: 'PENDING' },
      }),
      this.prisma.healthScrmEvent.count({
        where: { shopId, status: 'FAILED' },
      }),
      this.prisma.healthScrmEvent.count({ where: { shopId, status: 'SENT' } }),
    ]);
    if (!row) {
      return {
        linked: false,
        orgType: '',
        orgUserId: '',
        scrmAvailable: false,
        scrmStatusText: '未绑定',
        pushEnabled: false,
        pullEnabled: false,
        tagMap: {},
        pendingCount,
        failedCount,
        sentCount,
        lastPushAt: '',
        lastPullAt: '',
        lastError: '',
        guideText:
          '想让企微客服按健康事件跟进（新客、术后、异常指标），先在「营销工具 → 企业微信 SCRM」接入企业，再把组织键填到这里；不绑也不影响健康工具本身。',
        guideHref: '/wecom-scrm',
      };
    }
    const state = await this.scrmState(row.orgType, row.orgUserId);
    return {
      linked: true,
      orgType: row.orgType,
      orgUserId: row.orgUserId,
      scrmAvailable: state.available,
      scrmStatusText: state.text,
      pushEnabled: row.pushEnabled,
      pullEnabled: row.pullEnabled,
      tagMap: await this.tagMapOf(shopId),
      pendingCount,
      failedCount,
      sentCount,
      lastPushAt: toIso(row.lastPushAt),
      lastPullAt: toIso(row.lastPullAt),
      lastError: row.lastError,
      guideText: state.available
        ? '已绑定：命中标签的顾客会在企微侧自动打上标签，具体跟进动作由 SCRM 的 SOP 决定。'
        : state.text,
      guideHref: '/wecom-scrm',
    };
  }

  async linkSave(
    user: CurrentUser,
    body: HealthScrmLinkSaveBody,
  ): Promise<HealthScrmLink> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    if (!context.isOwner) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有店主可以绑定企业微信 SCRM',
      );
    }
    const orgType = clip(body.orgType, 20);
    const orgUserId = clip(body.orgUserId, 64);
    if (!orgType || !orgUserId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写 SCRM 组织类型与组织账号',
      );
    }
    const existing = await this.linkRow(context.shop.id);
    const data = {
      orgType,
      orgUserId,
      pushEnabled: body.pushEnabled !== false,
      pullEnabled: body.pullEnabled === true,
      lastError: '',
    };
    if (existing) {
      await this.prisma.healthScrmLink.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.healthScrmLink.create({
        data: { shopId: context.shop.id, ...data },
      });
    }
    await this.saveTagMap(context.shop.id, body.tagMap ?? {});
    await audit(
      this.prisma,
      user.userId,
      'health.scrm.link',
      `shop=${context.shop.id} ${orgType}/${orgUserId}`,
    );
    return this.link(user, { shopId: context.shop.id });
  }

  async linkRemove(user: CurrentUser, body: { shopId: number }) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    if (!context.isOwner) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有店主可以解绑企业微信 SCRM',
      );
    }
    await this.prisma.healthScrmLink.deleteMany({
      where: { shopId: context.shop.id },
    });
    return {
      ok: true,
      message: '已解绑；已排队的事件保留，重新绑定后可继续推送',
    };
  }

  // ---------- 事件 ----------

  async events(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(this.prisma, user, query.shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const eventType = clip(query.eventType, 32) || 'all';
    const eventStatus = clip(query.eventStatus, 16) || 'all';
    const where = {
      shopId: context.shop.id,
      ...(eventType !== 'all' ? { eventType } : {}),
      ...(eventStatus !== 'all' ? { status: eventStatus } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthScrmEvent.count({ where }),
      this.prisma.healthScrmEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const names = await this.customerNames(rows.map((row) => row.customerId));
    return pageOf(
      rows.map((row) => this.toEventRow(row, names)),
      total,
      page,
      pageSize,
    );
  }

  private toEventRow(
    row: {
      id: number;
      eventType: string;
      customerId: number;
      refType: string;
      refId: number;
      status: string;
      attempts: number;
      lastError: string;
      occurredAt: Date;
      sentAt: Date | null;
    },
    names: Map<number, string>,
  ): HealthScrmEventRow {
    const type = (HEALTH_SCRM_EVENT_TYPES as readonly string[]).includes(
      row.eventType,
    )
      ? (row.eventType as HealthScrmEventRow['eventType'])
      : 'CUSTOMER_CREATED';
    return {
      id: row.id,
      eventType: type,
      customerId: row.customerId,
      customerName: names.get(row.customerId) || '',
      refType: row.refType,
      refId: row.refId,
      status: row.status as HealthScrmEventRow['status'],
      attempts: row.attempts,
      lastError: row.lastError,
      occurredAt: toIso(row.occurredAt),
      sentAt: toIso(row.sentAt),
    };
  }

  private async customerNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map();
    const rows = await this.prisma.healthCustomer.findMany({
      where: { id: { in: unique } },
      select: { id: true, nickname: true, phone: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        row.nickname || row.phone || `顾客#${row.id}`,
      ]),
    );
  }

  /**
   * 推送：拉取 PENDING 事件，按公共 Outbox 策略投递（超时 / 熔断 / 指数退避 / 水位淘汰）。
   * 任何一侧不可用都不算业务失败：整轮顺延、不消耗 attempts，SCRM 恢复后自动补发。
   * 标签命中后由 SCRM 自己的 TAG SOP 决定下一步（加好友后跟进、发资料、拉群…）。
   */
  async push(
    user: CurrentUser,
    body: HealthScrmPushBody,
  ): Promise<HealthScrmPushResult> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const shopId = context.shop.id;
    const link = await this.linkRow(shopId);
    if (!link) {
      return { sent: 0, skipped: 0, failed: 0, message: PUSH_SKIP.NO_LINK };
    }
    if (!link.pushEnabled) {
      return {
        sent: 0,
        skipped: 0,
        failed: 0,
        message: '本店未开启「推送到 SCRM」',
      };
    }
    const state = await this.scrmState(link.orgType, link.orgUserId);
    const tagMap = await this.tagMapOf(shopId);
    const now = new Date();
    this.forgetExpiredGates(now);
    const circuitOpen = this.circuitIsOpen(shopId, now);
    const unavailable = outboxRoundUnavailable(
      { ok: state.available },
      circuitOpen,
    );
    const scan = await this.prisma.healthScrmEvent.findMany({
      where: {
        shopId,
        status: 'PENDING',
        ...(body.ids.length ? { id: { in: body.ids } } : {}),
      },
      orderBy: { occurredAt: 'asc' },
      // 比本轮批量多扫一些：存活期淘汰与积压水位要看得到真实积压（与 brand/mp 侧同形）。
      take: Math.max(body.limit, PUSH_SCAN_LIMIT),
    });
    const pending = new Map(scan.map((row) => [row.id, row]));
    // 字段适配：本表没有 createdAt / next_at 列——occurred_at 承担「事件发生时刻」
    // （补发窗口起算点），「下次可投递时间」来自进程内门禁（见类内 gates 的取舍说明）。
    const plan = planOutboxDrain(
      scan.map((row) => ({
        id: row.id,
        attempts: row.attempts,
        createdAt: row.occurredAt,
        nextTryAt: this.gates.get(row.id) ?? null,
      })),
      { now, unavailable, batchSize: body.limit },
    );
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    if (plan.expire.length) {
      for (const row of plan.expire) this.gates.delete(row.id);
      await this.prisma.healthScrmEvent.updateMany({
        where: {
          shopId,
          id: { in: plan.expire.map((row) => row.id) },
          status: 'PENDING',
        },
        data: {
          status: 'SKIPPED',
          lastError: (state.available
            ? '超出补发窗口或被积压水位淘汰'
            : `${PUSH_SKIP.SCRM_CLOSED}：${state.text}`
          ).slice(0, 500),
        },
      });
      skipped += plan.expire.length;
    }

    if (unavailable) {
      // 未接入 / 被停用 / 熔断冷却中都不是失败：只顺延，绝不增加 attempts，
      // 否则管理员关一次 SCRM 就会把所有历史事件打成终态。
      const deferUntil = new Date(now.getTime() + OUTBOX_POLICY.circuitOpenMs);
      for (const row of plan.defer) this.gates.set(row.id, deferUntil);
      return {
        sent: 0,
        skipped,
        failed: 0,
        message: state.available
          ? `SCRM 连续失败已熔断（冷却 ${Math.round(OUTBOX_POLICY.circuitOpenMs / 60_000)} 分钟），${plan.defer.length} 条事件继续排队`
          : `${state.text}（事件继续排队）`,
      };
    }

    const org: HrmOrg = {
      orgType: link.orgType,
      orgUserId: link.orgUserId,
      actorId: context.shop.ownerUserId,
      isOwner: true,
      isAdmin: true,
      roles: [],
      positions: [],
      department: '',
    };
    for (const planned of plan.send) {
      const row = pending.get(planned.id);
      if (!row) continue;
      const tagId = Number(tagMap[row.eventType] || 0);
      if (!tagId) {
        await this.mark(row.id, 'SKIPPED', PUSH_SKIP.NO_TAG);
        this.gates.delete(row.id);
        skipped += 1;
        continue;
      }
      const contactId = await this.resolveContact(
        link.orgType,
        link.orgUserId,
        shopId,
        row.customerId,
      );
      if (!contactId) {
        await this.mark(row.id, 'SKIPPED', PUSH_SKIP.NO_CONTACT);
        this.gates.delete(row.id);
        skipped += 1;
        continue;
      }
      await this.sourceTags?.tagSource({
        ownerUserId: link.orgUserId,
        contactId,
        scene: 'HEALTH',
        sourceId: shopId,
      });
      // 桥超时竞速：SCRM 卡住也不能把这条推送的请求线程拖住，超时按失败处理。
      const outcome = await withBridgeTimeout(
        () => this.sop.triggerTag(org, contactId, [tagId]),
        this.bridgeTimeoutMs,
      );
      if (outcome.ok) {
        await this.mark(row.id, 'SENT', '');
        this.gates.delete(row.id);
        this.circuits.delete(shopId);
        sent += 1;
        continue;
      }
      const attempts = planned.attempts + 1;
      // 本表无 DEAD 档（契约只有 PENDING/SENT/FAILED/SKIPPED）：第 5 次失败落 FAILED
      // 并退出 PENDING 队列，语义等价于商城侧的 DEAD，恢复只能靠人工重投。
      const terminal = attempts >= OUTBOX_POLICY.circuitFailures;
      await this.mark(
        row.id,
        terminal ? 'FAILED' : 'PENDING',
        outcome.error.slice(0, 400),
      );
      if (terminal) this.gates.delete(row.id);
      else this.gates.set(row.id, nextRetryAt(attempts, now));
      this.bumpCircuit(shopId, now);
      failed += 1;
    }
    const deferred = plan.defer.length;
    const message =
      sent + skipped + failed === 0
        ? '队列里没有待推送的事件'
        : `已推送 ${sent} 条，跳过 ${skipped} 条，失败 ${failed} 条${deferred ? `，顺延 ${deferred} 条` : ''}`;
    await this.prisma.healthScrmLink.update({
      where: { id: link.id },
      data: { lastPushAt: new Date(), lastError: failed ? message : '' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.scrm.push',
      `shop=${shopId} ${message}`,
    );
    return { sent, skipped, failed, message };
  }

  /** 门禁到期即遗忘：它只表示「早于此时间不要重试」，过期后留着反而挡住补发。 */
  private forgetExpiredGates(now: Date): void {
    for (const [id, until] of this.gates) {
      if (until <= now) this.gates.delete(id);
    }
  }

  /** 熔断冷却是否仍在生效；冷却结束即清零连败计数，让下一条事件重新试探。 */
  private circuitIsOpen(shopId: number, now: Date): boolean {
    const circuit = this.circuits.get(shopId);
    if (!circuit) return false;
    if (circuit.openUntil > now.getTime()) return true;
    this.circuits.delete(shopId);
    return false;
  }

  /** 记录一次投递失败：连续失败达到阈值就打开该店的熔断，整轮进入冷却。 */
  private bumpCircuit(shopId: number, now: Date): void {
    const failures = (this.circuits.get(shopId)?.failures ?? 0) + 1;
    this.circuits.set(shopId, {
      failures,
      openUntil: circuitShouldOpen(failures)
        ? now.getTime() + OUTBOX_POLICY.circuitOpenMs
        : 0,
    });
  }

  async skip(user: CurrentUser, body: { shopId: number; ids: number[] }) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await this.prisma.healthScrmEvent.updateMany({
      where: {
        shopId: context.shop.id,
        id: { in: body.ids },
        status: 'PENDING',
      },
      data: { status: 'SKIPPED', lastError: '人工跳过' },
    });
    return { ok: true, message: '已跳过' };
  }

  private async mark(id: number, status: string, error: string) {
    await this.prisma.healthScrmEvent.update({
      where: { id },
      data: {
        status,
        lastError: error.slice(0, 500),
        attempts: { increment: 1 },
        ...(status === 'SENT' ? { sentAt: new Date() } : {}),
      },
    });
  }

  /**
   * 顾客 → 企微联系人：先看映射表；没有就用手机号在 SCRM 自定义字段里匹配一次，
   * 命中后把映射落下来（下一次不再查）。都失败则返回 0，由调用方标 SKIPPED。
   */
  private async resolveContact(
    orgType: string,
    orgUserId: string,
    shopId: number,
    customerId: number,
  ): Promise<number> {
    const ref = await this.prisma.healthScrmContactRef.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
    });
    if (ref) {
      const contact = await this.prisma.scrmContact.findUnique({
        where: {
          orgType_orgUserId_externalUserId: {
            orgType,
            orgUserId,
            externalUserId: ref.externalUserId,
          },
        },
        select: { id: true },
      });
      if (contact) return contact.id;
    }
    const customer = await this.prisma.healthCustomer.findUnique({
      where: { id: customerId },
      select: { phone: true },
    });
    const phone = (customer?.phone || '').replace(/\D/g, '');
    if (phone.length < 6) return 0;
    const field = await this.prisma.scrmContactFieldValue.findFirst({
      where: {
        orgType,
        orgUserId,
        fieldKey: { in: ['phone', 'mobile', 'tel'] },
        OR: [{ value: { equals: [phone] } }, { value: { equals: phone } }],
      },
      select: { contactId: true },
    });
    if (!field) return 0;
    const contact = await this.prisma.scrmContact.findFirst({
      where: { id: field.contactId, orgType, orgUserId },
      select: { id: true, externalUserId: true },
    });
    if (!contact) return 0;
    await this.prisma.healthScrmContactRef
      .upsert({
        where: { shopId_customerId: { shopId, customerId } },
        create: {
          shopId,
          customerId,
          externalUserId: contact.externalUserId,
        },
        update: {
          externalUserId: contact.externalUserId,
          syncedAt: new Date(),
        },
      })
      .catch(() => undefined);
    return contact.id;
  }

  /**
   * 业务侧投递入口：任何业务动作只调它，内部失败一律吞掉。
   * 事件进队列本身就是「松耦合」的另一半——SCRM 不在线也不丢事实。
   */
  async enqueue(input: {
    shopId: number;
    eventType: (typeof HEALTH_SCRM_EVENT_TYPES)[number];
    customerId?: number;
    refType?: string;
    refId?: number;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const link = await this.linkRow(input.shopId);
      if (!link || !link.pushEnabled) return;
      await this.prisma.healthScrmEvent.create({
        data: {
          shopId: input.shopId,
          eventType: input.eventType,
          customerId: input.customerId ?? 0,
          refType: clip(input.refType, 24),
          refId: input.refId ?? 0,
          payloadJson: (input.payload ?? {}) as never,
        },
      });
    } catch {
      // 出站事件是旁路：写不进去不影响业务本身。
    }
  }

  /** 供页面展示的事件类型文案（前端也可直接用契约常量）。 */
  eventLabels(): Record<string, string> {
    return HEALTH_SCRM_EVENT_LABELS;
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
