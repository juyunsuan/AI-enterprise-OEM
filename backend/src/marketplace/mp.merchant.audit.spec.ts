import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { MpMerchantService } from './mp.merchant.service';

/**
 * 入驻审核状态机：PENDING → APPROVED / REJECTED，APPROVED ⇄ BANNED。
 * 逐条钉住「驳回必填原因、已通过不可再驳回、封禁即时停号停店、解封只回草稿不直接营业」，
 * 这些分支一旦退化成「怎么写库都行」，商户端就会出现审核中也能登录、
 * 封禁后店铺仍在卖货的事故。
 */
const merchantRow = (patch: Record<string, unknown> = {}) => ({
  id: 11,
  marketId: 1,
  name: '山野杂货',
  licenseNo: '91300000000000000X',
  licenseImage: '',
  contactName: '王掌柜',
  contactPhone: '13800000000',
  categoryIds: [],
  commissionRate: null,
  auditStatus: 'PENDING',
  auditNote: null,
  auditAt: null,
  auditBy: null,
  status: 'ACTIVE',
  expireAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

function doubles(row: Record<string, unknown>, hasShop = false) {
  const current = { ...row };
  const merchantUpdate = jest.fn(async (args: { data: object }) => {
    Object.assign(current, args.data);
    return current;
  });
  const userUpdateMany = jest.fn(async () => ({ count: 1 }));
  const shopCreate = jest.fn(async (args: { data: object }) => ({
    id: 77,
    ...args.data,
  }));
  const shopUpdateMany = jest.fn(async () => ({ count: 1 }));
  const prisma: PrismaService = stub<PrismaService>({
    mpMerchant: {
      findFirst: jest.fn(async (args: { where: { marketId: number } }) =>
        args.where.marketId === row.marketId ? { ...current } : null,
      ),
      update: merchantUpdate,
      findUniqueOrThrow: jest.fn(async () => ({ ...current })),
    },
    mpMerchantUser: { updateMany: userUpdateMany },
    mpShop: {
      findFirst: jest.fn(async () => (hasShop ? { id: 5 } : null)),
      create: shopCreate,
      updateMany: shopUpdateMany,
      count: jest.fn(async () => (hasShop ? 1 : 1)),
      findUnique: jest.fn(async () => null),
    },
    mpCategory: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  });
  return { prisma, merchantUpdate, userUpdateMany, shopCreate, shopUpdateMany };
}

describe('入驻审核状态机', () => {
  it('通过待审商户：落审核痕迹、激活账号、无店则建草稿店', async () => {
    const { prisma, merchantUpdate, userUpdateMany, shopCreate } =
      doubles(merchantRow());
    const service = new MpMerchantService(prisma);
    const result = await service.audit(1, 'admin', {
      id: 11,
      action: 'APPROVE',
      note: '',
      commissionRate: 0.08,
    });
    expect(result.auditStatus).toBe('APPROVED');
    expect(merchantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditStatus: 'APPROVED',
          auditBy: 'admin',
          commissionRate: 0.08,
        }),
      }),
    );
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
    expect(shopCreate).toHaveBeenCalledTimes(1);
    expect(shopCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', payEnabled: false }),
      }),
    );
  });

  it('已有店铺时通过审核不重复建店', async () => {
    const { prisma, shopCreate } = doubles(merchantRow(), true);
    const service = new MpMerchantService(prisma);
    await service.audit(1, 'admin', { id: 11, action: 'APPROVE', note: '' });
    expect(shopCreate).not.toHaveBeenCalled();
  });

  it('重复通过直接冲突，不产生任何写入', async () => {
    const { prisma, merchantUpdate, shopCreate } = doubles(
      merchantRow({ auditStatus: 'APPROVED' }),
    );
    const service = new MpMerchantService(prisma);
    await expect(
      service.audit(1, 'admin', { id: 11, action: 'APPROVE', note: '' }),
    ).rejects.toThrow('已通过审核');
    expect(merchantUpdate).not.toHaveBeenCalled();
    expect(shopCreate).not.toHaveBeenCalled();
  });

  it('驳回必须写原因，否则 400 且不落库', async () => {
    const { prisma, merchantUpdate } = doubles(merchantRow());
    const service = new MpMerchantService(prisma);
    await expect(
      service.audit(1, 'admin', { id: 11, action: 'REJECT', note: '' }),
    ).rejects.toThrow('驳回必须填写原因');
    expect(merchantUpdate).not.toHaveBeenCalled();
  });

  it('已通过的商户不能驳回（应走封禁）', async () => {
    const { prisma } = doubles(merchantRow({ auditStatus: 'APPROVED' }));
    const service = new MpMerchantService(prisma);
    await expect(
      service.audit(1, 'admin', { id: 11, action: 'REJECT', note: '资料不符' }),
    ).rejects.toThrow('请使用封禁');
  });

  it('封禁：商户关停、账号停用、在营店铺停业', async () => {
    const { prisma, merchantUpdate, userUpdateMany, shopUpdateMany } = doubles(
      merchantRow({ auditStatus: 'APPROVED' }),
    );
    const service = new MpMerchantService(prisma);
    const result = await service.audit(1, 'admin', {
      id: 11,
      action: 'BAN',
      note: '售假',
    });
    expect(result.auditStatus).toBe('BANNED');
    expect(merchantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CLOSED', auditNote: '售假' }),
      }),
    );
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DISABLED' } }),
    );
    expect(shopUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'SUSPENDED' },
        where: expect.objectContaining({ status: { not: 'SUSPENDED' } }),
      }),
    );
  });

  it('解封只回到可继续装修的草稿态，店铺不直接恢复营业', async () => {
    const { prisma, shopUpdateMany } = doubles(
      merchantRow({ auditStatus: 'BANNED', status: 'CLOSED' }),
    );
    const service = new MpMerchantService(prisma);
    const result = await service.audit(1, 'admin', {
      id: 11,
      action: 'UNBAN',
      note: '申诉通过',
    });
    expect(result.auditStatus).toBe('APPROVED');
    expect(shopUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'DRAFT' },
        where: expect.objectContaining({ status: 'SUSPENDED' }),
      }),
    );
  });

  it('未封禁的商户不能解封', async () => {
    const { prisma } = doubles(merchantRow({ auditStatus: 'APPROVED' }));
    const service = new MpMerchantService(prisma);
    await expect(
      service.audit(1, 'admin', { id: 11, action: 'UNBAN', note: '' }),
    ).rejects.toThrow('只有被封禁的商户才能解封');
  });

  it('跨市场审核一律按不存在处理（令牌里的 marketId 不是授权本身）', async () => {
    const { prisma, merchantUpdate } = doubles(merchantRow({ marketId: 2 }));
    const service = new MpMerchantService(prisma);
    await expect(
      service.audit(1, 'admin', { id: 11, action: 'APPROVE', note: '' }),
    ).rejects.toThrow('商户不存在');
    expect(merchantUpdate).not.toHaveBeenCalled();
  });
});
