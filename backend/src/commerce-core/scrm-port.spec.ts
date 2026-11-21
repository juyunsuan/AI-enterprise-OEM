import {
  circuitShouldOpen,
  noopScrmBridge,
  nextRetryAt,
  planOutboxDrain,
  SCRM_OUTBOX_POLICY,
  scrmCustomerLabel,
  scrmDedupeKey,
  scrmMobileHash,
  withBridgeTimeout,
  type OutboxRowLike,
  type ScrmBridge,
} from './scrm-port';

function rows(count: number, startedMinutesAgo: number): OutboxRowLike[] {
  const createdAt = new Date(Date.now() - startedMinutesAgo * 60_000);
  return Array.from({ length: count }, (_unused, index) => ({
    id: index + 1,
    attempts: 0,
    nextTryAt: null,
    createdAt,
  }));
}

describe('commerce-core/scrm-port 事件键与脱敏', () => {
  it('幂等键 = 业务:事件:业务主键，重试只落一次', () => {
    expect(scrmDedupeKey('brand', 'ORDER_PAID', 1024)).toBe(
      'brand:ORDER_PAID:1024',
    );
    expect(scrmDedupeKey('', 'ORDER_PAID', ' 9 ')).toBe(
      'commerce:ORDER_PAID:9',
    );
  });

  it('手机号哈希用 HMAC，且绝不泄露明文', () => {
    const hash = scrmMobileHash('138-0000-1111', 'secret');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(scrmMobileHash('13800001111', 'secret'));
    expect(hash).not.toBe(scrmMobileHash('13800001111', 'other'));
    expect(hash).not.toContain('13800001111');
    expect(scrmMobileHash('13800001111', '')).toBe('');
    expect(scrmMobileHash('', 'secret')).toBe('');
  });

  it('顾客标签只留头三位与末四位', () => {
    expect(scrmCustomerLabel({ mobile: '13800001111' })).toBe('138****1111');
    expect(scrmCustomerLabel({ nickname: '小陈' })).toBe('小陈');
    expect(scrmCustomerLabel({})).toBe('商城顾客');
  });
});

describe('commerce-core/scrm-port 投递计划', () => {
  it('SCRM 不可用时整轮顺延，绝不消耗重试次数', () => {
    const plan = planOutboxDrain(rows(3, 1), { unavailable: true });
    expect(plan.send).toEqual([]);
    expect(plan.defer).toHaveLength(3);
    expect(plan.defer.every((row) => row.attempts === 0)).toBe(true);
  });

  it('单轮条数受批量上限约束，其余留在下一轮', () => {
    const batch = SCRM_OUTBOX_POLICY.batchSize;
    const plan = planOutboxDrain(rows(batch + 7, 1));
    expect(plan.send).toHaveLength(batch);
    expect(plan.defer).toHaveLength(7);
    expect(plan.expire).toHaveLength(0);
  });

  it('超过存活期的事件淘汰，不再追赶', () => {
    const old = new Date(Date.now() - SCRM_OUTBOX_POLICY.maxAgeMs - 60_000);
    const plan = planOutboxDrain([
      { id: 1, attempts: 2, nextTryAt: null, createdAt: old },
      ...rows(2, 1),
    ]);
    expect(plan.expire.map((row) => row.id)).toEqual([1]);
    expect(plan.send).toHaveLength(2);
  });

  it('积压超水位时最老的一批被挤掉', () => {
    const total = SCRM_OUTBOX_POLICY.maxBacklog + 5;
    const plan = planOutboxDrain(rows(total, 1));
    expect(plan.expire).toHaveLength(5);
    expect(plan.send).toHaveLength(SCRM_OUTBOX_POLICY.batchSize);
  });

  it('未到重试时间的行顺延', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');
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
});

describe('commerce-core/scrm-port 退避与熔断', () => {
  it('退避指数放大并夹到 6 小时', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');
    expect(nextRetryAt(1, now).getTime() - now.getTime()).toBe(
      SCRM_OUTBOX_POLICY.retryBackoffMs,
    );
    expect(nextRetryAt(2, now).getTime() - now.getTime()).toBe(
      SCRM_OUTBOX_POLICY.retryBackoffMs * 2,
    );
    expect(nextRetryAt(30, now).getTime() - now.getTime()).toBe(6 * 3_600_000);
  });

  it('连续失败达到阈值打开熔断', () => {
    expect(circuitShouldOpen(SCRM_OUTBOX_POLICY.circuitFailures)).toBe(true);
    expect(circuitShouldOpen(SCRM_OUTBOX_POLICY.circuitFailures - 1)).toBe(
      false,
    );
  });

  it('桥调用超时按失败处理，不拖住主流程', async () => {
    const slow = () =>
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('迟到的结果'), 30),
      );
    await expect(withBridgeTimeout(slow, 5)).resolves.toMatchObject({
      ok: false,
      error: 'SCRM 调用超时',
    });
    await expect(withBridgeTimeout(async () => 'ok', 50)).resolves.toEqual({
      ok: true,
      value: 'ok',
    });
  });

  it('空实现让所有动作安全空转', async () => {
    const bridge: ScrmBridge = noopScrmBridge;
    expect((await bridge.status(1)).reason).toBe('NOT_CONFIGURED');
    expect(await bridge.matchContact(1, { unionId: 'u' })).toBeNull();
    expect(await bridge.pushFields(1, 7, { a: 'b' })).toEqual({ written: 0 });
    expect((await bridge.readProfiles(1, [7])).size).toBe(0);
    await expect(
      bridge.appendTimeline(1, { contactId: 7, title: 't', detail: 'd' }),
    ).resolves.toBeUndefined();
  });
});
