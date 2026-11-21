import { createHmac } from 'node:crypto';

/**
 * SCRM 对接端口：商城侧只依赖这个接口，永不调用企业微信、永不直写 `scrm_*` 表。
 *
 * 松耦合的唯一代码保证点在这里——交易事务内只往本地 outbox 写一行，
 * 投递由异步调度器完成；SCRM 服务未开通、未配置或鉴权失败时，
 * 事件顺延且不计失败次数，商城自己的下单、支付、退款一律照常成功。
 */

/** 商城会产生的顾客事件；`BALANCE_RECHARGED` 属二期，先占位保持口径一致。 */
export const SCRM_EVENT_KINDS = [
  'CUSTOMER_REGISTER',
  'ORDER_PAID',
  'ORDER_COMPLETED',
  'ORDER_REFUNDED',
  'COUPON_RECEIVED',
  'REVIEW_SUBMITTED',
  'BALANCE_RECHARGED',
  'CUSTOMER_SILENT_30D',
] as const;
export type ScrmEventKind = (typeof SCRM_EVENT_KINDS)[number];
export const SCRM_EVENT_LABELS: Record<ScrmEventKind, string> = {
  CUSTOMER_REGISTER: '注册成为商城顾客',
  ORDER_PAID: '订单付款',
  ORDER_COMPLETED: '订单完成',
  ORDER_REFUNDED: '订单退款',
  COUPON_RECEIVED: '领取优惠券',
  REVIEW_SUBMITTED: '提交评价',
  BALANCE_RECHARGED: '余额充值',
  CUSTOMER_SILENT_30D: '30 天未回访',
};

/** 投递状态：与业务表的 status 列同义，业务侧自己落库。 */
export const SCRM_OUTBOX_STATUSES = [
  'PENDING',
  'SENT',
  'SKIPPED',
  'DEAD',
] as const;
export type ScrmOutboxStatus = (typeof SCRM_OUTBOX_STATUSES)[number];

/**
 * 投递策略已原样搬到 `commerce-core/outbox-policy.ts`（数值只有一份），这里整批再导出：
 * 既保留 SCRM 旧名（`SCRM_OUTBOX_POLICY` / `scrmDedupeKey`），也透出公共新名，
 * 保证 `brand-mall` / `marketplace` 的既有 import 路径一根都不破。
 * 新增调用点（如健康域）请直接从 `./outbox-policy` 取。
 */
export {
  circuitShouldOpen,
  nextRetryAt,
  outboxDedupeKey,
  outboxRoundUnavailable,
  planOutboxDrain,
  withBridgeTimeout,
  OUTBOX_POLICY,
  SCRM_OUTBOX_POLICY,
  scrmDedupeKey,
} from './outbox-policy';
export type {
  OutboxDrainOptions,
  OutboxDrainPlan,
  OutboxRowLike,
} from './outbox-policy';

export type ScrmBridgeAvailability =
  'OK' | 'FEATURE_CLOSED' | 'NOT_CONFIGURED' | 'UNAUTHORIZED';

export interface ScrmBridgeStatus {
  ok: boolean;
  reason: ScrmBridgeAvailability;
  /** 给管理员看的下一步提示，页面据此渲染跳转。 */
  hint: string;
}

/** 时间线一条：只允许「谁在什么时候做了什么」级别的摘要。 */
export interface ScrmTimelineEntry {
  contactId: number;
  title: string;
  detail: string;
  at?: Date;
}

export interface ScrmProfile {
  tags: string[];
  lastInteractionAt: string;
}

/**
 * 桥的全部能力。返回 Promise 的方法都必须能被调用方用超时打断，
 * 桥的实现内部不得反向依赖商城的服务类。
 *
 * 手机号一律以商城侧算好的 HMAC 传入，桥不接受明文：SCRM 侧只需要能比对，
 * 不需要能还原顾客号码。
 */
export interface ScrmBridge {
  status(orgId: number): Promise<ScrmBridgeStatus>;
  /** 匹配锚点优先级由业务侧决定（unionId > 手机号哈希 > 人工绑定）。 */
  matchContact(
    orgId: number,
    query: { unionId?: string; mobileHash?: string },
  ): Promise<{ contactId: number } | null>;
  appendTimeline(orgId: number, entry: ScrmTimelineEntry): Promise<void>;
  pushFields(
    orgId: number,
    contactId: number,
    values: Record<string, string>,
  ): Promise<{ written: number }>;
  readProfiles(
    orgId: number,
    contactIds: number[],
  ): Promise<Map<number, ScrmProfile>>;
}

/** SCRM 未接入时注入的实现：状态永远 NOT_CONFIGURED，动作一律空转。 */
export const noopScrmBridge: ScrmBridge = {
  status: () =>
    Promise.resolve({
      ok: false,
      reason: 'NOT_CONFIGURED',
      hint: '尚未开通企业微信客户运营',
    }),
  matchContact: () => Promise.resolve(null),
  appendTimeline: () => Promise.resolve(undefined),
  pushFields: () => Promise.resolve({ written: 0 }),
  readProfiles: () => Promise.resolve(new Map()),
};

/**
 * 手机号匹配哈希：HMAC-SHA256 且上下文固定为 `scrm-match`，
 * 明文与裸 SHA 都不落库——裸哈希可被彩虹表反查，手机号属于个人敏感信息。
 */
export function scrmMobileHash(mobilePlain: string, secret: string): string {
  const digits = String(mobilePlain || '').replace(/\D/g, '');
  if (!digits || !secret) return '';
  return createHmac('sha256', secret)
    .update(`scrm-match:${digits}`)
    .digest('hex');
}

/** 顾客脱敏标签：只保留可读性所需的头尾，不送姓名与地址全文。 */
export function scrmCustomerLabel(input: {
  mobile?: string;
  nickname?: string;
}): string {
  const mobile = String(input.mobile || '').replace(/\D/g, '');
  if (mobile.length >= 7) {
    return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
  }
  const nickname = String(input.nickname || '').trim();
  return nickname || '商城顾客';
}

/**
 * 投递策略（批量上限 / 桥超时 / 熔断 / 指数退避 / 存活期与积压水位淘汰 / 幂等键）
 * 已原样搬到 `./outbox-policy.ts`，由本文件顶部再导出——健康域也共用同一份，
 * 别在这里重新实现第二套数值。
 *
 * 事件载荷口径同样不变：`payloadJson` 存「快照时刻的事实」（金额、单号、券名），
 * 补发时按写入时的快照外发，禁止回读商城现值。
 */
