import {
  circuitShouldOpen,
  nextRetryAt,
  OUTBOX_POLICY,
  outboxDedupeKey,
  outboxRoundUnavailable,
  planOutboxDrain,
  SCRM_OUTBOX_POLICY,
  withBridgeTimeout,
  type OutboxRowLike,
} from './outbox-policy';

/**
 * 公共 Outbox 策略件的行为钉法：三域（brand_scrm_outbox / mp_scrm_outbox /
 * health_scrm_events）共用这一份数值，所以每个数值都要在这里被断言一次，
 * 谁改动数值就会把这三域的容错一起改掉——不允许悄悄调。
 */
function rows(count: number, startedMinutesAgo: number): OutboxRowLike[] {
  const createdAt = new Date(Date.now() - startedMinutesAgo * 60_000);
  return Array.from({ length: count }, (_unused, index) => ({
    id: index + 1,
    attempts: 0,
    nextTryAt: null,
    createdAt,
  }));
}

describe('commerce-core/outbox-policy 数值与旧名一致', () => {
  it('SCRM 端口的旧名与公共件是同一份常量', () => {
    expect(SCRM_OUTBOX_POLICY).toBe(OUTBOX_POLICY);
    expect(OUTBOX_POLICY).toMatchObject({
      batchSize: 50,
      timeoutMs: 3_000,
      circuitFailures: 5,
      circuitOpenMs: 600_000,
      maxAgeMs: 30 * 86_400_000,
      maxBacklog: 2_000,
      retryBackoffMs: 60_000,
    });
  });

  it('幂等键 = 业务:事件:业务主键，重试只落一次', () => {
    expect(outboxDedupeKey('brand:5', 'ORDER_PAID', 1024)).toBe(
      'brand:5:ORDER_PAID:1024',
    );
    expect(outboxDedupeKey('', 'ORDER_PAID', ' 9 ')).toBe(
      'commerce:ORDER_PAID:9',
    );
  });
});

describe('commerce-core/outbox-policy 投递计划', () => {
  it('不可用（含 FEATURE_CLOSED）时整轮顺延，绝不消耗重试次数', () => {
    const plan = planOutboxDrain(rows(3, 1), { unavailable: true });
    expect(plan.send).toEqual([]);
    expect(plan.defer).toHaveLength(3);
    expect(plan.defer.every((row) => row.attempts === 0)).toBe(true);
  });

  it('单轮条数受批量上限约束，其余留在下一轮', () => {
    const batch = OUTBOX_POLICY.batchSize;
    const plan = planOutboxDrain(rows(batch + 7, 1));
    expect(plan.send).toHaveLength(batch);
    expect(plan.defer).toHaveLength(7);
    expect(plan.expire).toHaveLength(0);
  });

  it('超过存活期的事件淘汰，不再追赶', () => {
    const old = new Date(Date.now() - OUTBOX_POLICY.maxAgeMs - 60_000);
    const plan = planOutboxDrain([
      { id: 1, attempts: 2, nextTryAt: null, createdAt: old },
      ...rows(2, 1),
    ]);
    expect(plan.expire.map((row) => row.id)).toEqual([1]);
    expect(plan.send).toHaveLength(2);
  });

  it('积压超水位时最老的一批被挤掉', () => {
    const total = OUTBOX_POLICY.maxBacklog + 5;
    const plan = planOutboxDrain(rows(total, 1));
    expect(plan.expire).toHaveLength(5);
    expect(plan.send).toHaveLength(OUTBOX_POLICY.batchSize);
  });

  it('未到重试时间的行顺延', () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    const plan = planOutboxDrain(
      [
        {
          id: 1,
          attempts: 1,
          nextTryAt: new Date(now.getTime() + 60_000),
          createdAt: now,
        },
        { id: 2, attempts: 0, nextTryAt: null, createdAt: now },
      ],
      { now },
    );
    expect(plan.send.map((row) => row.id)).toEqual([2]);
    expect(plan.defer.map((row) => row.id)).toEqual([1]);
  });

  it('「本轮不可投递」= 桥不可用 或 熔断冷却中', () => {
    expect(outboxRoundUnavailable({ ok: true })).toBe(false);
    expect(outboxRoundUnavailable({ ok: false })).toBe(true);
    expect(outboxRoundUnavailable({ ok: true }, true)).toBe(true);
  });
});

describe('commerce-core/outbox-policy 退避与熔断', () => {
  it('退避逐轮指数放大并夹到 6 小时上限', () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    const delta = (attempts: number) =>
      nextRetryAt(attempts, now).getTime() - now.getTime();
    expect(delta(0)).toBe(OUTBOX_POLICY.retryBackoffMs);
    expect(delta(1)).toBe(OUTBOX_POLICY.retryBackoffMs);
    expect(delta(2)).toBe(OUTBOX_POLICY.retryBackoffMs * 2);
    expect(delta(3)).toBe(OUTBOX_POLICY.retryBackoffMs * 4);
    expect(delta(30)).toBe(6 * 3_600_000);
    // 放大不等于无限追赶：任何时候都不会超过上限
    expect(delta(999)).toBeLessThanOrEqual(6 * 3_600_000);
  });

  it('连续失败达到阈值打开熔断', () => {
    expect(circuitShouldOpen(OUTBOX_POLICY.circuitFailures)).toBe(true);
    expect(circuitShouldOpen(OUTBOX_POLICY.circuitFailures - 1)).toBe(false);
  });
});

describe('commerce-core/outbox-policy 桥超时竞速', () => {
  it('超时按失败返回，不抛出、不拖住调用方', async () => {
    const never = () => new Promise<string>(() => undefined);
    const started = Date.now();
    await expect(withBridgeTimeout(never, 5)).resolves.toMatchObject({
      ok: false,
      error: 'SCRM 调用超时',
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    await expect(withBridgeTimeout(async () => 'ok', 50)).resolves.toEqual({
      ok: true,
      value: 'ok',
    });
  });

  it('桥抛错也折成失败结果，主链路拿不到异常', async () => {
    await expect(
      withBridgeTimeout(async () => {
        throw new Error('企微 500');
      }, 50),
    ).resolves.toEqual({ ok: false, error: '企微 500' });
  });
});
