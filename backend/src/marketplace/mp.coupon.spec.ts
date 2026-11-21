import type { PrismaService } from '../prisma/prisma.service';
import type { MpMerchantService } from './mp.merchant.service';
import { stub } from '../../test/doubles';
import { MpCouponService, type MpCouponLine } from './mp.coupon.service';

/**
 * 券抵扣与跨店分摊：父单一张券只能按「命中范围的商品额」抵扣，
 * 再按各子单命中额比例分摊；这里钉住比例分摊、门槛、商户券限店与折扣折算，
 * 任何一处算错都会让子单实付合计 ≠ 父单实付，对账直接对不平。
 */
const lines: MpCouponLine[] = [
  { shopId: 1, productId: 11, categoryId: 101, totalCents: 10_000 },
  { shopId: 2, productId: 21, categoryId: 102, totalCents: 5_000 },
];

const couponRow = (patch: Record<string, unknown> = {}) => ({
  id: 5,
  marketId: 1,
  shopId: 0,
  merchantId: 0,
  issuerType: 'PLATFORM',
  name: '满 100 减 50',
  type: 'FULL_REDUCE',
  value: 50,
  threshold: 100,
  totalCount: 100,
  receivedCount: 3,
  usedCount: 0,
  perLimit: 1,
  validType: 'FIXED',
  startAt: null,
  endAt: null,
  validDays: 7,
  scope: 'ALL',
  scopeIds: [],
  status: 'ONLINE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

const ticketRow = (patch: Record<string, unknown> = {}) => ({
  id: 90,
  marketId: 1,
  couponId: 5,
  customerId: 7,
  status: 'UNUSED',
  orderId: 0,
  receivedAt: new Date('2026-01-02T00:00:00Z'),
  usedAt: null,
  expireAt: new Date('2099-01-01T00:00:00Z'),
  ...patch,
});

function service(coupon: Record<string, unknown>, ticket = ticketRow()) {
  const prisma: PrismaService = stub<PrismaService>({
    mpCouponTicket: { findFirst: jest.fn(async () => ({ ...ticket })) },
    mpCoupon: { findFirst: jest.fn(async () => ({ ...coupon })) },
  });
  const merchants = stub<MpMerchantService>({});
  return new MpCouponService(prisma, merchants);
}

describe('券抵扣与跨店分摊', () => {
  it('满减券跨两店按命中商品额比例分摊，余数归命中额最大的子单', async () => {
    const usage = await service(couponRow()).use(1, 7, 90, lines);
    expect(usage.discountCents).toBe(5000);
    expect(usage.allocations.get(1)).toBe(3334);
    expect(usage.allocations.get(2)).toBe(1666);
    expect(
      [...usage.allocations.values()].reduce((sum, value) => sum + value, 0),
    ).toBe(usage.discountCents);
  });

  it('命中商品额未达门槛直接拒绝，并给出可读原因', async () => {
    await expect(
      service(couponRow({ threshold: 200 })).use(1, 7, 90, lines),
    ).rejects.toThrow('满 200 元可用');
  });

  it('商户券只抵本店商品，不跨店蹭单', async () => {
    const usage = await service(
      couponRow({
        issuerType: 'MERCHANT',
        shopId: 2,
        merchantId: 9,
        scope: 'SHOP',
        scopeIds: [2],
        threshold: 0,
      }),
    ).use(1, 7, 90, lines);
    expect(usage.discountCents).toBe(5000);
    expect(usage.allocations.get(1)).toBeUndefined();
    expect(usage.allocations.get(2)).toBe(5000);
  });

  it('折扣券按「折」折算：8.5 折抵 15%', async () => {
    const usage = await service(
      couponRow({ type: 'DISCOUNT', value: 8.5, threshold: 0 }),
    ).use(1, 7, 90, lines);
    expect(usage.discountCents).toBe(2250);
    expect(usage.allocations.get(1)).toBe(1500);
    expect(usage.allocations.get(2)).toBe(750);
  });

  it('已使用的券不能再抵扣', async () => {
    await expect(
      service(couponRow(), ticketRow({ status: 'USED' })).use(1, 7, 90, lines),
    ).rejects.toThrow('该券已使用或已过期');
  });

  it('已结束的券即使手里有票也不能用', async () => {
    await expect(
      service(couponRow({ status: 'ENDED' })).use(1, 7, 90, lines),
    ).rejects.toThrow('该券已结束');
  });
});
