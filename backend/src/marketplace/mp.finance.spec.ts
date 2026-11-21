import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { MpFinanceService } from './mp.finance.service';
import type { MpMerchantService } from './mp.merchant.service';
import type { MpMerchantTokenPayload } from './mp.token';

/**
 * B2 资金域：抽佣费率解析、可提现口径、提现申请与审核。
 * 这些分支直接决定商户能提多少钱，退化成「有单就能提」会把未确认结算提前放出去。
 */
const marketRow = (patch: Record<string, unknown> = {}) => ({
  id: 1,
  name: '城市集市',
  ownerUserId: 'owner-1',
  settleJson: {},
  ...patch,
});

const merchantRow = (patch: Record<string, unknown> = {}) => ({
  id: 11,
  marketId: 1,
  name: '山野杂货',
  categoryIds: [3],
  commissionRate: null,
  ...patch,
});

const rule = (patch: Record<string, unknown>) => ({
  id: 1,
  marketId: 1,
  scopeType: 'PLATFORM',
  scopeId: 0,
  rate: 5,
  status: 'ACTIVE',
  ...patch,
});

function financeService(parts: {
  market?: Record<string, unknown>;
  merchants?: Record<string, unknown>[];
  rules?: Record<string, unknown>[];
  settlements?: { status: string; netAmount: number }[];
  withdrawals?: { status: string; applyAmount: number }[];
}) {
  const market = marketRow(parts.market);
  const merchant = merchantRow(parts.merchants?.[0]);
  const createWithdrawal = jest.fn(
    async (args: { data: Record<string, unknown> }) => ({
      id: 91,
      fee: 0,
      actualAmount: args.data.applyAmount,
      auditNote: '',
      auditedAt: null,
      auditedBy: null,
      voucher: '',
      paidAt: null,
      createdAt: new Date(),
      merchantName: merchant.name,
      shopName: '',
      ...args.data,
    }),
  );
  const updateWithdrawal = jest.fn(
    async (args: { data: Record<string, unknown> }) => ({
      id: 91,
      withdrawNo: 'WD1',
      applyAmount: 100,
      fee: 0,
      actualAmount: 100,
      bankName: '招商银行',
      bankAccount: '6225880000000000',
      accountName: '王掌柜',
      status: 'PENDING',
      auditNote: '',
      voucher: '',
      auditedAt: null,
      auditedBy: '',
      paidAt: null,
      createdAt: new Date(),
      merchantName: merchant.name,
      shopName: '',
      ...args.data,
    }),
  );
  const prisma = stub<PrismaService>({
    mpMerchant: {
      findMany: jest.fn(async () => parts.merchants ?? [merchant]),
      findFirst: jest.fn(async () => merchant),
    },
    mpCommissionRule: { findMany: jest.fn(async () => parts.rules ?? []) },
    mpMarket: {
      findUnique: jest.fn(async () => market),
      findFirst: jest.fn(async () => market),
    },
    mpSettlement: { findMany: jest.fn(async () => parts.settlements ?? []) },
    mpWithdrawal: {
      findMany: jest.fn(async () => parts.withdrawals ?? []),
      findFirst: jest.fn(async () => ({
        id: 91,
        marketId: 1,
        merchantId: 11,
        applyAmount: 100,
        status: 'PENDING',
      })),
      create: createWithdrawal,
      update: updateWithdrawal,
    },
  });
  const merchants = {
    session: jest.fn(async () => ({ market, merchant, shop: { id: 5 } })),
  } as unknown as MpMerchantService;
  return {
    service: new MpFinanceService(prisma, merchants),
    prisma,
    createWithdrawal,
    updateWithdrawal,
  };
}

const payload = { sub: 'merchant' } as unknown as MpMerchantTokenPayload;

describe('抽佣费率解析优先级', () => {
  const resolve = async (parts: {
    merchants?: Record<string, unknown>[];
    rules?: Record<string, unknown>[];
    market?: Record<string, unknown>;
  }) => {
    const { service } = financeService(parts);
    const rates = await service.resolveRates(
      marketRow(parts.market) as never,
      (parts.merchants ?? [{ id: 11 }]).map((row) => row.id as number),
    );
    return rates.get(11);
  };

  it('商户专属 > 类目 > 平台默认', async () => {
    const rates = await resolve({
      merchants: [{ id: 11, categoryIds: [3], commissionRate: null }],
      rules: [
        rule({ id: 1, scopeType: 'PLATFORM', scopeId: 0, rate: 5 }),
        rule({ id: 2, scopeType: 'CATEGORY', scopeId: 3, rate: 8 }),
        rule({ id: 3, scopeType: 'MERCHANT', scopeId: 11, rate: 3 }),
      ],
    });
    expect(rates).toEqual({ rate: 3, scopeType: 'MERCHANT', scopeId: 11 });
  });

  it('命中商户类目时用类目费率，不落到平台默认', async () => {
    const rates = await resolve({
      merchants: [{ id: 11, categoryIds: [3], commissionRate: null }],
      rules: [
        rule({ id: 1, scopeType: 'PLATFORM', scopeId: 0, rate: 5 }),
        rule({ id: 2, scopeType: 'CATEGORY', scopeId: 3, rate: 8 }),
        rule({ id: 4, scopeType: 'CATEGORY', scopeId: 99, rate: 20 }),
      ],
    });
    expect(rates).toEqual({ rate: 8, scopeType: 'CATEGORY', scopeId: 3 });
  });

  it('无自身规则时回退平台默认；规则全无时回退商户字段，再回退市场参数', async () => {
    const withPlatform = await resolve({
      merchants: [{ id: 11, categoryIds: [3], commissionRate: 12 }],
      rules: [rule({ id: 1, scopeType: 'PLATFORM', scopeId: 0, rate: 5 })],
    });
    expect(withPlatform).toEqual({
      rate: 5,
      scopeType: 'PLATFORM',
      scopeId: 0,
    });

    const merchantField = await resolve({
      merchants: [{ id: 11, categoryIds: [], commissionRate: 12 }],
      rules: [],
    });
    expect(merchantField).toEqual({
      rate: 12,
      scopeType: 'MERCHANT',
      scopeId: 11,
    });

    const marketDefault = await resolve({
      merchants: [{ id: 11, categoryIds: [], commissionRate: null }],
      rules: [],
      market: { settleJson: { defaultCommissionRate: 7 } },
    });
    expect(marketDefault).toEqual({
      rate: 7,
      scopeType: 'MERCHANT',
      scopeId: 11,
    });
  });
});

describe('可提现口径', () => {
  it('只计已确认/已打款结算，扣已打款与冻结中的提现，且不为负', async () => {
    const { service } = financeService({
      settlements: [
        { status: 'PENDING', netAmount: 50 },
        { status: 'CONFIRMED', netAmount: 100 },
        { status: 'PAID', netAmount: 40 },
      ],
      withdrawals: [
        { status: 'PAID', applyAmount: 60 },
        { status: 'PENDING', applyAmount: 20 },
        { status: 'APPROVED', applyAmount: 10 },
        { status: 'REJECTED', applyAmount: 999 },
      ],
    });
    const summary = await service.financeOf(1, 11);
    expect(summary).toEqual({
      pendingAmount: 50,
      settledAmount: 140,
      withdrawalAmount: 60,
      frozenAmount: 30,
      availableAmount: 50,
    });
  });

  it('冻结超过已确认净额时余额归零而不是负数', async () => {
    const { service } = financeService({
      settlements: [{ status: 'CONFIRMED', netAmount: 80 }],
      withdrawals: [{ status: 'APPROVED', applyAmount: 100 }],
    });
    const summary = await service.financeOf(1, 11);
    expect(summary.availableAmount).toBe(0);
  });

  it('未确认结算不能提现：申请金额超过可提现即拒绝且不写库', async () => {
    const { service, createWithdrawal } = financeService({
      settlements: [{ status: 'PENDING', netAmount: 500 }],
      withdrawals: [],
    });
    await expect(
      service.merchantWithdrawalApply(payload, {
        applyAmount: 100,
        bankName: '招商银行',
        bankAccount: '6225880000000000',
        accountName: '王掌柜',
      }),
    ).rejects.toThrow('可提现余额不足');
    expect(createWithdrawal).not.toHaveBeenCalled();
  });
});

describe('提现审核', () => {
  it('通过时手续费封顶到申请金额，实付不为负', async () => {
    const { service, updateWithdrawal } = financeService({});
    const row = await service.withdrawalAudit('owner-1', {
      id: 91,
      action: 'APPROVE',
      auditNote: '',
      fee: 150,
    });
    expect(updateWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          fee: 100,
          actualAmount: 0,
        }),
      }),
    );
    expect(row.status).toBe('APPROVED');
  });

  it('驳回必须填原因，否则 400 且不落库', async () => {
    const { service, updateWithdrawal } = financeService({});
    await expect(
      service.withdrawalAudit('owner-1', {
        id: 91,
        action: 'REJECT',
        auditNote: ' ',
        fee: 0,
      }),
    ).rejects.toThrow('请填写驳回原因');
    expect(updateWithdrawal).not.toHaveBeenCalled();
  });
});
