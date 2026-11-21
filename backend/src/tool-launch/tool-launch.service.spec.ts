import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PointsService } from '../points/points.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ToolLaunchBillingService } from './tool-launch.billing.service';
import { ToolLaunchService } from './tool-launch.service';
import { TOOL_LAUNCH_CATALOG } from './tool-launch.catalog';
import { ToolLaunchSettingsService } from './tool-launch.settings.service';
import { stub } from '../../test/doubles';

/**
 * 启动设置状态机与账期批处理的用例。
 *
 * 这一组断言守着本功能最贵的两条红线：
 * 1) **未启动不扣积分**——STOPPED 行在任何批处理里都不许出账；
 * 2) **出账幂等**——同一天重跑、同一账期重跑都只有一份账单、一笔流水。
 * 积分与账单用同一份内存态模拟事务提交/回滚，避免「测试通过但真库留了半条账单」。
 */

type Row = Record<string, unknown> & { id: number };

/** 唯一约束冲突的真实形状：Error + code，替身抛它才能同时满足 lint 与运行时判定。 */
function uniqueViolation() {
  return Object.assign(new Error('Unique constraint violation'), {
    code: 'P2002',
  });
}

const DAY = 86400_000;
const T0 = new Date('2026-11-18T10:00:00.000Z');

function lte(value: unknown, bound: Date | undefined) {
  if (!bound) return true;
  const at = value instanceof Date ? value.getTime() : Number.NaN;
  return Number.isFinite(at) && at <= bound.getTime();
}

function lt(value: unknown, bound: Date | undefined) {
  if (!bound) return true;
  const at = value instanceof Date ? value.getTime() : Number.NaN;
  return Number.isFinite(at) && at < bound.getTime();
}

class FakeDb {
  pricing: Row[] = [];
  subs: Row[] = [];
  bills: Row[] = [];
  usage: Row[] = [];
  events: Row[] = [];
  settings = new Map<string, string>();
  accounts = new Map<
    string,
    { balanceAmount: number; status: string; arrearsSince: Date | null }
  >();
  legacy = new Map<string, number>();
  appliedKeys = new Set<string>();
  txSeq = 0;
  private seq = 1;

  private take() {
    return this.seq++;
  }

  /**
   * 事务替身：写入缓冲在副本上，出错整批回滚（贴合真库语义，暴露「半条账单」这类缺陷）。
   * 回滚必须就地清空再塞回——测试与替身共享同一批数组引用，重新赋值会让两边分叉。
   */
  async $transaction(input: unknown) {
    const fn =
      typeof input === 'function'
        ? (input as (tx: FakeDb) => Promise<unknown>)
        : undefined;
    if (!fn) throw new Error('测试替身只支持回调式事务');
    const snap = {
      subs: this.subs.map((row) => ({ ...row })),
      bills: this.bills.map((row) => ({ ...row })),
      events: this.events.map((row) => ({ ...row })),
      accounts: [...this.accounts.entries()].map(
        ([key, value]) => [key, { ...value }] as const,
      ),
      applied: [...this.appliedKeys],
    };
    const put = (target: Row[], rows: Row[]) => {
      target.length = 0;
      rows.forEach((row) => target.push(row));
    };
    try {
      return await fn(this);
    } catch (error) {
      put(this.subs, snap.subs);
      put(this.bills, snap.bills);
      put(this.events, snap.events);
      this.accounts.clear();
      snap.accounts.forEach(([key, value]) => this.accounts.set(key, value));
      this.appliedKeys.clear();
      snap.applied.forEach((key) => this.appliedKeys.add(key));
      throw error;
    }
  }

  modulePricing = {
    findUnique: async ({ where }: { where: { code: string } }) =>
      this.pricing.find((item) => item.code === where.code) ?? null,
    findMany: async ({ where }: { where: { code: { in: string[] } } }) =>
      this.pricing.filter((item) => where.code.in.includes(String(item.code))),
  };

  systemSetting = {
    findUnique: async ({ where }: { where: { key: string } }) =>
      this.settings.has(where.key)
        ? { key: where.key, value: this.settings.get(where.key) }
        : null,
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }) => {
      this.settings.set(
        where.key,
        this.settings.has(where.key) ? update.value : create.value,
      );
      return { key: where.key };
    },
  };

  toolSubscription = {
    findUnique: async ({
      where,
    }: {
      where: {
        id?: number;
        userId_toolCode?: { userId: string; toolCode: string };
      };
    }) => {
      if (where.id !== undefined)
        return this.subs.find((row) => row.id === where.id) ?? null;
      const key = where.userId_toolCode!;
      return (
        this.subs.find(
          (row) => row.userId === key.userId && row.toolCode === key.toolCode,
        ) ?? null
      );
    },
    findUniqueOrThrow: async (args: {
      where: {
        id?: number;
        userId_toolCode?: { userId: string; toolCode: string };
      };
    }) => {
      const row = await this.toolSubscription.findUnique(args);
      if (!row) throw new Error('找不到订阅');
      return row;
    },
    findMany: async ({
      where,
    }: {
      where?: {
        userId?: string;
        status?: string;
        trialEndsAt?: { lte: Date };
        periodEnd?: { lte: Date };
        arrearsSince?: { lt: Date };
      };
      take?: number;
    }) =>
      this.subs.filter(
        (row) =>
          (!where?.userId || row.userId === where.userId) &&
          (!where?.status || row.status === where.status) &&
          lte(row.trialEndsAt, where?.trialEndsAt?.lte) &&
          lte(row.periodEnd, where?.periodEnd?.lte) &&
          lt(row.arrearsSince, where?.arrearsSince?.lt) &&
          !(where?.arrearsSince && !row.arrearsSince),
      ),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (
        this.subs.some(
          (row) => row.userId === data.userId && row.toolCode === data.toolCode,
        )
      ) {
        throw uniqueViolation();
      }
      const row: Row = {
        id: this.take(),
        arrearsSince: null,
        billedPeriods: 0,
        stopReason: '',
        offBy: '',
        offReason: '',
        ...data,
      };
      this.subs.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: number };
      data: Record<string, unknown>;
    }) => {
      const row = this.subs.find((item) => item.id === where.id);
      if (!row) throw new Error('订阅不存在');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { status?: string };
      data: Record<string, unknown>;
    }) => {
      const hits = this.subs.filter(
        (row) => !where.status || row.status === where.status,
      );
      hits.forEach((row) => Object.assign(row, data));
      return { count: hits.length };
    },
  };

  toolSubscriptionBill = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (
        this.bills.some(
          (row) =>
            row.subscriptionId === data.subscriptionId &&
            row.periodKey === data.periodKey,
        )
      ) {
        throw uniqueViolation();
      }
      const row: Row = { id: this.take(), ...data };
      this.bills.push(row);
      return row;
    },
    findMany: async ({ where }: { where: { status?: string } }) =>
      this.bills.filter((row) => !where?.status || row.status === where.status),
    count: async ({
      where,
    }: {
      where: { subscriptionId?: number; status?: string };
    }) =>
      this.bills.filter(
        (row) =>
          (where.subscriptionId === undefined ||
            row.subscriptionId === where.subscriptionId) &&
          (!where.status || row.status === where.status),
      ).length,
    update: async ({
      where,
      data,
    }: {
      where: { id: number };
      data: Record<string, unknown>;
    }) => {
      const row = this.bills.find((item) => item.id === where.id);
      if (!row) throw new Error('账单不存在');
      Object.assign(row, data);
      return row;
    },
  };

  toolUsageDaily = {
    findMany: async () => this.usage,
  };

  usageEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.events.push({ id: this.take(), ...data });
      return data;
    },
  };

  pointAccount = {
    update: async ({
      where,
      data,
    }: {
      where: { userId: string };
      data: Record<string, unknown>;
    }) => {
      const account = this.accounts.get(where.userId);
      if (account) Object.assign(account, data);
      return account;
    },
  };

  /** 9 个工具的存量探针：按模型名取预置条数。 */
  legacyCounter(model: string) {
    return {
      count: async () => this.legacy.get(model) ?? 0,
    };
  }

  get delegates() {
    return {
      knowledgePaySite: this.legacyCounter('knowledgePaySite'),
      onsiteShop: this.legacyCounter('onsiteShop'),
      brandShop: this.legacyCounter('brandShop'),
      healthShop: this.legacyCounter('healthShop'),
      mpMarket: this.legacyCounter('mpMarket'),
      digitalHumanSite: this.legacyCounter('digitalHumanSite'),
      cardShopSite: this.legacyCounter('cardShopSite'),
      kuaidiSite: this.legacyCounter('kuaidiSite'),
      errandSite: this.legacyCounter('errandSite'),
      takeoutShop: this.legacyCounter('takeoutShop'),
      circleCommunity: this.legacyCounter('circleCommunity'),
      geoSite: this.legacyCounter('geoSite'),
    };
  }
}

function setup(
  options: {
    pricing?: Partial<Row> | null;
    pricingCode?: string;
    balance?: number;
    legacy?: Record<string, number>;
    settings?: Record<string, unknown>;
  } = {},
) {
  const db = new FakeDb();
  if (options.pricing !== null) {
    db.pricing.push({
      id: 1,
      code: options.pricingCode ?? 'brand_mall',
      mode: 'METERED',
      unit: '',
      unitPriceAmount: 300,
      freeQuotaAmount: 0,
      minChargeAmount: 0.01,
      enabled: 1,
      billingCycle: 'DAY30',
      usageUnitSize: 1,
      launchEnabled: 1,
      ...(options.pricing || {}),
    });
  }
  Object.entries(options.legacy || {}).forEach(([model, count]) =>
    db.legacy.set(model, count),
  );
  db.accounts.set('u1', {
    balanceAmount: options.balance ?? 1000,
    status: 'ACTIVE',
    arrearsSince: null,
  });
  if (options.settings)
    db.settings.set('tool_launch_settings', JSON.stringify(options.settings));

  // $transaction 等类方法挂在原型上，展开对象会丢，所以先接原型再合并字段与模型替身
  const prisma = stub<PrismaService>(
    Object.assign(Object.create(FakeDb.prototype), db, db.delegates),
  );
  const points = stub<PointsService>({
    ensureAccount: async (userId: string) =>
      db.accounts.get(userId) ?? {
        balanceAmount: 0,
        status: 'ACTIVE',
        arrearsSince: null,
      },
    debitTx: async (
      tx: FakeDb,
      userId: string,
      _type: string,
      amount: number,
      input: { idempotencyKey?: string } = {},
    ) => {
      if (input.idempotencyKey) {
        if (db.appliedKeys.has(input.idempotencyKey)) throw uniqueViolation();
        db.appliedKeys.add(input.idempotencyKey);
      }
      const account = tx.accounts.get(userId)!;
      if (account.balanceAmount < amount) {
        throw new BusinessException(ErrorCode.POINTS_INSUFFICIENT);
      }
      account.balanceAmount -= amount;
      return { balance: account.balanceAmount, txId: ++db.txSeq };
    },
  });
  const settings = new ToolLaunchSettingsService(prisma, stub());
  const launch = new ToolLaunchService(prisma, points, settings);
  const billing = new ToolLaunchBillingService(
    prisma,
    points,
    settings,
    launch,
  );
  return { db, launch, billing, settings };
}

describe('启动设置状态机', () => {
  it('全新账号：未启动、可用闸门为关、没有任何账单', async () => {
    const { db, launch } = setup({ balance: 5000 });
    const state = await launch.state('u1', 'brand-mall');
    expect(state.status).toBe('STOPPED');
    expect(state.stopReason).toBe('NOT_STARTED');
    expect(state.open).toBe(false);
    expect(db.bills).toHaveLength(0);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(5000);
  });

  it('存量已有店铺：默认已启动进免费过渡期，本期不出账（上线当天不打断营业）', async () => {
    const { db, launch } = setup({
      legacy: { brandShop: 2 },
      settings: {
        graceHours: 72,
        transitionDays: 15,
        suspendOnArrears: true,
        legacyAnchor: T0.toISOString(),
      },
    });
    const state = await launch.state('u1', 'brand-mall');
    expect(state.status).toBe('TRIAL');
    expect(state.open).toBe(true);
    expect(state.trialEndsAt).toEqual(new Date(T0.getTime() + 15 * DAY));
    expect(state.nextChargeAt).toEqual(new Date(T0.getTime() + 15 * DAY));
    expect(db.bills).toHaveLength(0);
  });

  it('启动按 30 天口径：预付首期、账期到 +30 天、余额同步减少', async () => {
    const { db, launch } = setup({ balance: 1000 });
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(state.cycleDays).toBe(30);
    expect(state.unitPrice).toBe(300);
    expect(state.periodEnd!.getTime() - state.periodStart!.getTime()).toBe(
      30 * DAY,
    );
    expect(db.bills).toHaveLength(1);
    expect(db.bills[0]).toMatchObject({
      status: 'CHARGED',
      pointsAmount: 300,
      toolCode: 'brand-mall',
    });
    expect(db.accounts.get('u1')!.balanceAmount).toBe(700);
  });

  it('余额不足：启动当场失败并给出充值入口，不留半条账单', async () => {
    const { db, launch } = setup({ balance: 10 });
    await expect(launch.start('u1', 'brand-mall')).rejects.toMatchObject({
      errorCode: { code: ErrorCode.POINTS_INSUFFICIENT.code },
    });
    expect(db.bills).toHaveLength(0);
    expect(db.subs[0]).toMatchObject({ status: 'STOPPED' });
    expect(db.accounts.get('u1')!.balanceAmount).toBe(10);
  });

  it('平台配置首期免费：启动落 WAIVED 账单且不动余额', async () => {
    const { db, launch } = setup({
      pricing: { freeQuotaAmount: 1 },
      balance: 500,
    });
    await launch.start('u1', 'brand-mall');
    expect(db.bills[0]).toMatchObject({ status: 'WAIVED', pointsAmount: 0 });
    expect(db.accounts.get('u1')!.balanceAmount).toBe(500);
  });

  it('平台关闭自助启动：拒绝并说明原因', async () => {
    const { launch } = setup({ pricing: { launchEnabled: 0 } });
    await expect(launch.start('u1', 'brand-mall')).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('停止后闸门即关，且批处理不再为停服账号出账', async () => {
    const { db, launch, billing } = setup({ balance: 1000 });
    await launch.start('u1', 'brand-mall');
    await launch.stop('u1', 'brand-mall');
    expect(await launch.isOpen('brand-mall', 'u1')).toBe(false);
    const before = db.bills.length;
    // 账期早已过期也不该出账：STOPPED 不参与续扣
    db.subs[0].periodEnd = new Date(T0.getTime() - DAY);
    await billing.runDaily(new Date());
    expect(db.bills).toHaveLength(before);
  });

  it('未启动的公开通道与出包口：报错带启动页地址（阻断必须可自救）', async () => {
    const { launch } = setup();
    let error: unknown;
    try {
      await launch.blockIfStopped('brand-mall', 'u1');
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(BusinessException);
    expect((error as BusinessException).data).toMatchObject({
      toolCode: 'brand-mall',
      startUrl: '/site-builder/launch?tool=brand-mall',
      reason: 'NOT_STARTED',
    });
  });
});

describe('账期日批：续扣、欠费、停服与复活', () => {
  it('过渡期到期自动转 ACTIVE 并出首期', async () => {
    const { db, launch, billing } = setup({
      legacy: { brandShop: 1 },
      balance: 1000,
      settings: {
        graceHours: 72,
        transitionDays: 15,
        suspendOnArrears: true,
        legacyAnchor: new Date(T0.getTime() - 20 * DAY).toISOString(),
      },
    });
    await launch.state('u1', 'brand-mall');
    expect(db.subs[0].status).toBe('TRIAL');
    await billing.runDaily(T0);
    expect(db.subs[0]).toMatchObject({ status: 'ACTIVE', billedPeriods: 1 });
    expect(db.bills[0]).toMatchObject({ status: 'CHARGED', pointsAmount: 300 });
  });

  it('到期续扣按 periodKey 首尾相接，重跑同一天不重复扣', async () => {
    const { db, launch, billing } = setup({ balance: 5000 });
    const started = await launch.start('u1', 'brand-mall');
    const due = new Date(started.periodEnd!.getTime() + 1000);
    await billing.runDaily(due);
    expect(db.bills).toHaveLength(2);
    expect(db.subs[0]).toMatchObject({ billedPeriods: 2, status: 'ACTIVE' });
    expect(db.bills[1].periodStart).toEqual(started.periodEnd);
    // 守卫键：同一天再跑直接跳过
    const again = await billing.runDaily(due);
    expect(again.skipped).toBe(true);
    expect(db.bills).toHaveLength(2);
  });

  it('续扣时余额不足：账记 ARREARS、订阅进宽限期，营业不中断', async () => {
    const { db, launch, billing } = setup({ balance: 1000 });
    const started = await launch.start('u1', 'brand-mall');
    db.accounts.get('u1')!.balanceAmount = 100;
    await billing.runDaily(new Date(started.periodEnd!.getTime() + 1000));
    expect(db.subs[0].status).toBe('ARREARS');
    expect(db.bills).toHaveLength(2);
    expect(db.bills[1]).toMatchObject({ status: 'ARREARS', pointsAmount: 300 });
    // 宽限期内仍然可用
    expect(await launch.isOpen('brand-mall', 'u1')).toBe(true);
  });

  it('超过宽限期才停服，停服后不再累计新账', async () => {
    const { db, launch, billing } = setup({ balance: 1000 });
    const started = await launch.start('u1', 'brand-mall');
    db.accounts.get('u1')!.balanceAmount = 0;
    const first = new Date(started.periodEnd!.getTime() + 1000);
    await billing.runDaily(first);
    // 下一天：宽限未到（72h），不停服
    await billing.runDaily(new Date(first.getTime() + DAY));
    expect(db.subs[0].status).toBe('ARREARS');
    // 第 4 天：超宽限 → 停服并留痕
    await billing.runDaily(new Date(first.getTime() + 4 * DAY));
    expect(db.subs[0]).toMatchObject({
      status: 'STOPPED',
      stopReason: 'ARREARS',
    });
    expect(await launch.isOpen('brand-mall', 'u1')).toBe(false);
    const bills = db.bills.length;
    await billing.runDaily(new Date(first.getTime() + 40 * DAY));
    expect(db.bills).toHaveLength(bills);
  });

  it('充值后自动补扣复活，且账期从当下重新起算（不为停服天数买单）', async () => {
    const { db, launch, billing } = setup({ balance: 1000 });
    const started = await launch.start('u1', 'brand-mall');
    db.accounts.get('u1')!.balanceAmount = 0;
    const arrearsAt = new Date(started.periodEnd!.getTime() + 1000);
    await billing.runDaily(arrearsAt);
    await billing.runDaily(new Date(arrearsAt.getTime() + 4 * DAY));
    expect(db.subs[0].status).toBe('STOPPED');

    db.accounts.get('u1')!.balanceAmount = 600;
    await billing.runDaily(new Date(arrearsAt.getTime() + 10 * DAY));
    expect(db.subs[0].status).toBe('ACTIVE');
    expect(db.bills.filter((bill) => bill.status === 'CHARGED')).toHaveLength(
      2,
    );
    expect(db.bills.filter((bill) => bill.status === 'ARREARS')).toHaveLength(
      0,
    );
    // 复活后重新起的账期在 10 天之后，不会立刻又欠一期
    expect(new Date(db.subs[0].periodEnd as Date).getTime()).toBeGreaterThan(
      new Date(arrearsAt.getTime() + 10 * DAY).getTime(),
    );
  });

  it('国际独立站有自家站点月账：启动与批处理都不出第二套周期账', async () => {
    const { db, launch, billing } = setup({
      pricingCode: 'geo_site',
      pricing: { billingCycle: 'DAY30', unitPriceAmount: 999 },
      balance: 5000,
    });
    const state = await launch.start('u1', 'global-site');
    expect(state.status).toBe('ACTIVE');
    expect(state.ownBilling).toBe(true);
    expect(db.bills).toHaveLength(0);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(5000);
    // 账期即便过期，批处理也不给自带账单的工具出周期账
    db.subs[0].periodEnd = new Date(T0.getTime() - 3 * DAY);
    await billing.runDaily(new Date(T0.getTime() + 2 * DAY));
    expect(db.bills).toHaveLength(0);
  });

  it('未配置价目行的工具：启动零扣费、批处理也不出账', async () => {
    const { db, launch, billing } = setup({ pricing: null, balance: 500 });
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(state.nextChargeAmount).toBe(0);
    expect(db.bills[0]).toMatchObject({ status: 'WAIVED', pointsAmount: 0 });
    expect(db.accounts.get('u1')!.balanceAmount).toBe(500);
    db.subs[0].periodEnd = new Date(T0.getTime() - DAY);
    await billing.runDaily(T0);
    expect(Number(db.bills[1].pointsAmount)).toBe(0);
  });
});

describe('卡片页状态汇总', () => {
  it('全部建站工具一次读全，有存量的进过渡期、没存量的保持未启动', async () => {
    const { db, launch } = setup({
      balance: 2000,
      legacy: { brandShop: 1, geoSite: 3 },
    });
    const states = await launch.states('u1');
    expect(states).toHaveLength(TOOL_LAUNCH_CATALOG.length);
    expect(states.map((item) => item.toolCode)).toContain('global-site');
    const byCode = new Map(states.map((item) => [item.toolCode, item]));
    // 存量商城进免费过渡期；独立站自带月账，直接 ACTIVE 且不在这里出账
    expect(byCode.get('brand-mall')!.status).toBe('TRIAL');
    expect(byCode.get('global-site')!.status).toBe('ACTIVE');
    expect(byCode.get('global-site')!.open).toBe(true);
    expect(states.filter((item) => item.status === 'STOPPED')).toHaveLength(
      TOOL_LAUNCH_CATALOG.length - 2,
    );
    expect(db.subs).toHaveLength(TOOL_LAUNCH_CATALOG.length);
    expect(db.bills).toHaveLength(0);
  });
});

describe('欠费期间点启动不重复收钱', () => {
  /** 让"补扣欠费"和"起新一期"在余额上可区分：欠费单 300，新一期 300。 */
  async function startInArrears(options: {
    balanceAfterStart: number;
    offBy?: string;
  }) {
    const { db, launch } = setup({ balance: 1000 });
    await launch.start('u1', 'brand-mall');
    // 制造一张欠费账单：把账期推到过去，再让日批以不足余额扣款
    db.subs[0].periodEnd = new Date(Date.now() - DAY);
    db.accounts.get('u1')!.balanceAmount = 0;
    const { billing } = setupWith(db);
    await billing.runDaily(new Date());
    expect(db.subs[0].status).toBe('ARREARS');
    db.accounts.get('u1')!.balanceAmount = options.balanceAfterStart;
    if (options.offBy) db.subs[0].offBy = options.offBy;
    return { db, launch, billing };
  }

  /** 复用同一份替身库，只换 billing 实例。 */
  function setupWith(db: FakeDb) {
    const prisma = stub<PrismaService>(
      Object.assign(Object.create(FakeDb.prototype), db, db.delegates),
    );
    const points = stub<PointsService>({
      ensureAccount: async (userId: string) =>
        db.accounts.get(userId) ?? {
          balanceAmount: 0,
          status: 'ACTIVE',
          arrearsSince: null,
        },
      debitTx: async (
        tx: FakeDb,
        userId: string,
        _t: string,
        amount: number,
        input: { idempotencyKey?: string } = {},
      ) => {
        if (input.idempotencyKey) {
          if (db.appliedKeys.has(input.idempotencyKey)) throw uniqueViolation();
          db.appliedKeys.add(input.idempotencyKey);
        }
        const account = tx.accounts.get(userId)!;
        if (account.balanceAmount < amount)
          throw new BusinessException(ErrorCode.POINTS_INSUFFICIENT);
        account.balanceAmount -= amount;
        return { balance: account.balanceAmount, txId: ++db.txSeq };
      },
    });
    const settings = new ToolLaunchSettingsService(prisma, stub());
    const launch = new ToolLaunchService(prisma, points, settings);
    const billing = new ToolLaunchBillingService(
      prisma,
      points,
      settings,
      launch,
    );
    return { launch, billing };
  }

  it('余额够补欠时：只补原来那一期，不新增账单', async () => {
    const { db, launch } = await startInArrears({ balanceAfterStart: 900 });
    const billsBefore = db.bills.length;
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(db.bills).toHaveLength(billsBefore); // 原欠费单被改写为 CHARGED，不是多一条
    expect(db.bills.some((bill) => bill.status === 'ARREARS')).toBe(false);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(600);
  });

  it('余额不够补欠时：直接报欠费待补，而不是再扣一期', async () => {
    const { db, launch } = await startInArrears({ balanceAfterStart: 10 });
    await expect(launch.start('u1', 'brand-mall')).rejects.toThrow(/欠费待补/);
    expect(db.bills.filter((bill) => bill.status === 'CHARGED')).toHaveLength(
      1,
    );
  });

  it('被平台停用时：点启动直接被拒，既不补扣也不起新一期', async () => {
    const { db, launch } = await startInArrears({
      balanceAfterStart: 900,
      offBy: 'admin-1',
    });
    const billsBefore = db.bills.length;
    await expect(launch.start('u1', 'brand-mall')).rejects.toThrow(
      /已被平台停用/,
    );
    expect(db.bills).toHaveLength(billsBefore);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(900);
    expect(db.subs[0].offBy).toBe('admin-1');
  });

  it('日批补扣也不碰平台停用：没在营业就不该扣钱', async () => {
    const { db, billing } = await startInArrears({
      balanceAfterStart: 900,
      offBy: 'admin-1',
    });
    await billing.runDaily(new Date(Date.now() + DAY));
    expect(db.accounts.get('u1')!.balanceAmount).toBe(900);
    expect(db.bills.some((bill) => bill.status === 'ARREARS')).toBe(true);
    expect(db.subs[0].status).not.toBe('ACTIVE');
  });

  it('用户自己停止后留着的欠费单：日批不补扣也不重新开机', async () => {
    const { db, launch, billing } = await startInArrears({
      balanceAfterStart: 900,
    });
    // 用户欠费后主动点了停止（欠费单还挂着，余额随后充上来了）
    await launch.stop('u1', 'brand-mall');
    expect(db.subs[0].stopReason).toBe('USER');
    await billing.runDaily(new Date(Date.now() + DAY));
    expect(db.accounts.get('u1')!.balanceAmount).toBe(900);
    expect(db.subs[0].status).toBe('STOPPED');
    expect(db.bills.some((bill) => bill.status === 'ARREARS')).toBe(true);
  });

  it('用户自己停止后再点启动：先结清欠费再恢复，只补原来那一期', async () => {
    const { db, launch } = await startInArrears({ balanceAfterStart: 900 });
    await launch.stop('u1', 'brand-mall');
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(db.bills.some((bill) => bill.status === 'ARREARS')).toBe(false);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(600);
  });

  it('幂等键跟着期次而不是时钟：扣款成功但台账没推进，重跑也只扣一期', async () => {
    // 真并发（Promise.all 两个 start）测不了：替身事务共享同一批数组，没有隔离性，
    // 回滚会把另一个事务刚写的行一起抹掉。这里测的是同一件事的实现点——
    // 撞唯一键的是「第几期」，不是「几点几分」，所以重试/隔天重跑都只会 EXISTS。
    const { db, launch } = setup({ balance: 1000 });
    await launch.start('u1', 'brand-mall');
    expect(db.accounts.get('u1')!.balanceAmount).toBe(700);
    // 模拟扣款流水已落、订阅行没写回去（进程在两步之间挂掉）
    db.subs[0].billedPeriods = 0;
    db.subs[0].status = 'STOPPED';
    db.subs[0].periodEnd = null;
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(db.bills).toHaveLength(1);
    expect(db.bills[0].status).toBe('CHARGED');
    expect(db.accounts.get('u1')!.balanceAmount).toBe(700);
    // 期次计数留在 0 是有意为之：下一轮续扣撞的还是同一个 P1 键 → EXISTS → 计数自愈，
    // 中间绝不会多扣一分钱。
    expect(db.subs[0].billedPeriods).toBe(0);
  });
});

describe('停止后再启动不重复收钱', () => {
  it('上一期还没到期：只把功能闸再打开，不再扣一期', async () => {
    const { db, launch } = setup({ balance: 1000 });
    await launch.start('u1', 'brand-mall');
    expect(db.accounts.get('u1')!.balanceAmount).toBe(700);
    await launch.stop('u1', 'brand-mall');
    expect(db.subs[0].status).toBe('STOPPED');
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(state.open).toBe(true);
    expect(db.bills).toHaveLength(1);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(700);
    expect(db.subs[0].billedPeriods).toBe(1);
  });

  it('存量免费过渡期内重启：回到过渡期状态，一期都不扣', async () => {
    const { db, launch } = setup({
      balance: 1000,
      legacy: { brandShop: 2 },
      settings: {
        graceHours: 72,
        transitionDays: 15,
        suspendOnArrears: true,
        legacyAnchor: T0.toISOString(),
      },
    });
    await launch.state('u1', 'brand-mall');
    expect(db.subs[0].status).toBe('TRIAL');
    await launch.stop('u1', 'brand-mall');
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('TRIAL');
    expect(state.open).toBe(true);
    expect(db.bills).toHaveLength(0);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(1000);
  });

  it('账期已经到期：照常按当期口径扣新的一期（别把该收的也免掉）', async () => {
    const { db, launch } = setup({ balance: 1000 });
    await launch.start('u1', 'brand-mall');
    await launch.stop('u1', 'brand-mall');
    db.subs[0].periodEnd = new Date(Date.now() - DAY);
    const state = await launch.start('u1', 'brand-mall');
    expect(state.status).toBe('ACTIVE');
    expect(db.bills).toHaveLength(2);
    expect(db.accounts.get('u1')!.balanceAmount).toBe(400);
    expect(db.subs[0].billedPeriods).toBe(2);
  });
});
