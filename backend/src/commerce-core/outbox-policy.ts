/**
 * Outbox 外发容错公共策略件：纯常量 + 纯函数，零依赖、零 I/O、可假时钟单测。
 *
 * 来源与定位：原来这套策略完整实现在 `commerce-core/scrm-port.ts`（品牌商城 × 企业微信 SCRM）。
 * `brand_scrm_outbox` / `mp_scrm_outbox` / `health_scrm_events` 三域各自一张出站表——
 * **表刻意不合并**（域内字段、组织维度、状态档位都不同），但「怎么重试、什么时候放弃」
 * 这一套数值与判定只允许存在这一份，改动只发生在这一处。
 *
 * 三条铁律（三域一致，别在调用点削弱）：
 * 1. 主链路只往自己域的 outbox 写一行，投递由异步 drain 完成；
 *    桥超时或失败只影响这一行事件的状态，绝不回滚业务事务、不阻断下单/支付/退款。
 * 2. `payloadJson` 存「快照时刻的事实」（金额、单号、券名等）：
 *    补发时按写入时的快照外发，禁止回读业务表现值——订单后来改价或退款了，
 *    历史事件表达的仍是当时发生的事。
 * 3. 「不可用」（FEATURE_CLOSED / NOT_CONFIGURED / 熔断冷却中）只顺延、绝不消耗 attempts，
 *    否则平台管理员关一次板块就会把所有历史事件打成终态。
 */

/** 调度策略：数值来自设计方案 §九之二，三域共用同一份。 */
export const OUTBOX_POLICY = {
  /** 每轮每个组织最多投递条数，避免一个大商户拖垮整轮调度。 */
  batchSize: 50,
  /** 单次 bridge 调用超时（毫秒）。 */
  timeoutMs: 3_000,
  /** 连续失败达到该次数即对该组织熔断。 */
  circuitFailures: 5,
  /** 熔断打开时长（毫秒），期间该组织的事件整体顺延。 */
  circuitOpenMs: 600_000,
  /** 单条事件最长存活：超时后淘汰为 SKIPPED，不再追赶。 */
  maxAgeMs: 30 * 86_400_000,
  /** 积压水位：超出后淘汰最老的事件。 */
  maxBacklog: 2_000,
  /** 重试退避基数（毫秒），按失败次数指数放大。 */
  retryBackoffMs: 60_000,
} as const;

/** SCRM 端口沿用的旧名（同一份数值，只是叫法不同，别复制出第二份常量）。 */
export const SCRM_OUTBOX_POLICY = OUTBOX_POLICY;

/** 退避放大上限：再往后重试没有意义，只会把调度器占满。 */
const RETRY_BACKOFF_MAX_MS = 6 * 3_600_000;

/** 指数放大的轮次上限：2^20 早已触到上限，纯粹防溢出。 */
const RETRY_BACKOFF_MAX_EXPONENT = 20;

/**
 * 幂等键：同一业务的同一条事件在任何重试路径上都只落一次。
 * 形如 `<biz>:<eventKind>:<业务主键>`，落到 outbox 表的唯一列上。
 */
export function outboxDedupeKey(
  biz: string,
  eventKind: string,
  recordKey: string | number,
): string {
  return `${String(biz || 'commerce').trim()}:${eventKind}:${String(recordKey).trim()}`;
}

/** SCRM 端口沿用的旧名。 */
export const scrmDedupeKey = outboxDedupeKey;

export interface OutboxRowLike {
  id: number;
  attempts: number;
  nextTryAt?: Date | null;
  createdAt: Date;
}

export interface OutboxDrainPlan<T extends OutboxRowLike = OutboxRowLike> {
  /** 本轮可以投递的行。 */
  send: T[];
  /** 未到重试时间或处于熔断 / 关闭态，需要顺延的行。 */
  defer: T[];
  /** 超过存活期或被积压水位挤掉的行，落库为 SKIPPED。 */
  expire: T[];
}

export interface OutboxDrainOptions {
  now?: Date;
  /** 桥不可用时置 true：整轮顺延，绝不增加 attempts。 */
  unavailable?: boolean;
  batchSize?: number;
  maxAgeMs?: number;
  maxBacklog?: number;
}

/**
 * 纯函数式的一轮投递计划，便于用假时钟做单测。
 *
 * 关键取舍：`unavailable`（含 FEATURE_CLOSED）时不消耗重试次数，
 * 否则平台管理员关一次 SCRM 就会把所有历史事件打成 DEAD。
 */
export function planOutboxDrain<T extends OutboxRowLike>(
  rows: T[],
  options: OutboxDrainOptions = {},
): OutboxDrainPlan<T> {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? OUTBOX_POLICY.maxAgeMs;
  const maxBacklog = options.maxBacklog ?? OUTBOX_POLICY.maxBacklog;
  const batchSize = Math.max(
    1,
    Math.round(options.batchSize ?? OUTBOX_POLICY.batchSize),
  );

  const aged = new Set<T>();
  for (const row of rows) {
    if (now.getTime() - row.createdAt.getTime() > maxAgeMs) aged.add(row);
  }
  const alive = rows
    .filter((row) => !aged.has(row))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const overflow = alive.length > maxBacklog ? alive.slice(maxBacklog) : [];
  const kept = overflow.length ? alive.slice(0, maxBacklog) : alive;

  if (options.unavailable) {
    return {
      send: [],
      defer: kept,
      expire: [...aged, ...overflow],
    };
  }

  const send: T[] = [];
  const defer: T[] = [];
  for (const row of kept) {
    if (send.length < batchSize && (!row.nextTryAt || row.nextTryAt <= now)) {
      send.push(row);
    } else {
      defer.push(row);
    }
  }
  return {
    send,
    defer,
    expire: [...aged, ...overflow],
  };
}

/** 下一次重试时间：指数退避并夹到 6 小时，避免长尾把调度器占满。 */
export function nextRetryAt(attempts: number, now: Date = new Date()): Date {
  const exponent = Math.max(0, Math.round(attempts) - 1);
  const backoffMs = Math.min(
    OUTBOX_POLICY.retryBackoffMs *
      2 ** Math.min(exponent, RETRY_BACKOFF_MAX_EXPONENT),
    RETRY_BACKOFF_MAX_MS,
  );
  return new Date(now.getTime() + backoffMs);
}

export function circuitShouldOpen(
  consecutiveFailures: number,
  threshold: number = OUTBOX_POLICY.circuitFailures,
): boolean {
  return consecutiveFailures >= Math.max(1, threshold);
}

/**
 * 「本轮不可投递」判定：桥不可用或熔断冷却中，都只顺延、不消耗 attempts。
 * `unavailable` 的两种来源分开传参，是为了让调用点把「配置不可用」和「连续失败」
 * 这两件事各自讲清楚，而不是一律折算成失败次数。
 */
export function outboxRoundUnavailable(
  status: { ok: boolean },
  circuitOpen = false,
): boolean {
  return !status.ok || circuitOpen;
}

/** 带超时地调用桥：超时按失败处理，但绝不阻塞商城自己的请求线程。 */
export async function withBridgeTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number = OUTBOX_POLICY.timeoutMs,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('SCRM 调用超时')), timeoutMs);
  });
  try {
    const value = await Promise.race([work(), timeout]);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
