import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { MpCatalogService } from './mp.catalog.service';
import type { MpMerchantService } from './mp.merchant.service';
import type { MpMerchantTokenPayload } from './mp.token';

/**
 * 商品上架状态机：DRAFT/REJECTED → 送审 PENDING → 平台通过后 ONLINE，
 * ONLINE ⇄ OFFLINE 只能由商户手动切换。核对住「在售商品不能重复送审、
 * 零库存实物不能送审、驳回必须写原因、已审记录不能二次审」这几条，
 * 避免审核记录与商品状态各说各话。
 */
const payload: MpMerchantTokenPayload = {
  userId: 9,
  merchantId: 11,
  marketId: 1,
  role: 'OWNER',
};

const productRow = (patch: Record<string, unknown> = {}) => ({
  id: 51,
  marketId: 1,
  merchantId: 11,
  shopId: 5,
  categoryId: 3,
  title: '手工帆布包',
  subtitle: '',
  coverImage: '',
  images: [],
  detail: '',
  type: 'NORMAL',
  price: 128,
  marketPrice: 158,
  costPrice: 60,
  stock: 10,
  sales: 0,
  unit: '件',
  weight: 0.5,
  freightAmount: 0,
  specs: [],
  guarantee: [],
  status: 'DRAFT',
  auditNote: '',
  sortOrder: 0,
  isHot: false,
  isNew: false,
  reviewCount: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

const auditRow = (patch: Record<string, unknown> = {}) => ({
  id: 71,
  marketId: 1,
  merchantId: 11,
  shopId: 5,
  productId: 51,
  auditStatus: 'PENDING',
  reason: '',
  snapshotHash: 'hash',
  submitBy: '9',
  auditBy: '',
  auditAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

function doubles(row: Record<string, unknown>, audit = auditRow()) {
  const current = { ...row };
  const productUpdate = jest.fn(async (args: { data: object }) => {
    Object.assign(current, args.data);
    return { ...current };
  });
  const auditCreate = jest.fn(async (args: { data: object }) => ({
    id: 71,
    reason: '',
    auditBy: '',
    auditAt: null,
    ...args.data,
  }));
  const auditUpdate = jest.fn(async (args: { data: object }) => ({
    ...audit,
    ...args.data,
  }));
  const skuFindMany = jest.fn(async () => []);
  const productDelete = jest.fn(async () => ({ ...current }));
  const skuDeleteMany = jest.fn(async () => ({ count: 0 }));
  const prisma: PrismaService = stub<PrismaService>({
    mpProduct: {
      findFirst: jest.fn(async (args: { where: { marketId: number } }) =>
        args.where.marketId === row.marketId ? { ...current } : null,
      ),
      update: productUpdate,
      delete: productDelete,
    },
    mpProductSku: { findMany: skuFindMany, deleteMany: skuDeleteMany },
    mpProductAudit: {
      findFirst: jest.fn(async (args: { where: { marketId: number } }) =>
        args.where.marketId === audit.marketId ? { ...audit } : null,
      ),
      create: auditCreate,
      update: auditUpdate,
    },
    mpShop: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
    },
    mpCategory: { findMany: jest.fn(async () => []) },
    mpMerchant: { findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    ),
  });
  const merchants = stub<MpMerchantService>({
    session: jest.fn(async () => ({
      merchant: { id: 11, marketId: 1 },
      market: { id: 1, status: 'ONLINE' },
      shop: { id: 5 },
    })),
  });
  return {
    prisma,
    merchants,
    productUpdate,
    auditCreate,
    auditUpdate,
    skuFindMany,
    productDelete,
  };
}

function serviceOf(prisma: PrismaService, merchants: MpMerchantService) {
  return new MpCatalogService(prisma, merchants);
}

describe('商品送审与审核状态机', () => {
  it('草稿送审：生成待审记录并把商品置为审核中', async () => {
    const d = doubles(productRow());
    const result = await serviceOf(d.prisma, d.merchants).submit(payload, 51);
    expect(result.status).toBe('PENDING');
    expect(d.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 51,
          auditStatus: 'PENDING',
          submitBy: '9',
        }),
      }),
    );
  });

  it('审核中不能重复送审', async () => {
    const d = doubles(productRow({ status: 'PENDING' }));
    await expect(
      serviceOf(d.prisma, d.merchants).submit(payload, 51),
    ).rejects.toThrow('商品已在审核中');
    expect(d.auditCreate).not.toHaveBeenCalled();
  });

  it('在售商品无需送审', async () => {
    const d = doubles(productRow({ status: 'ONLINE' }));
    await expect(
      serviceOf(d.prisma, d.merchants).submit(payload, 51),
    ).rejects.toThrow('无需送审');
  });

  it('实物商品库存为 0 时拦截送审', async () => {
    const d = doubles(productRow({ stock: 0 }));
    await expect(
      serviceOf(d.prisma, d.merchants).submit(payload, 51),
    ).rejects.toThrow('库存为 0');
    expect(d.auditCreate).not.toHaveBeenCalled();
  });

  it('平台通过：商品直接上架', async () => {
    const d = doubles(productRow({ status: 'PENDING' }));
    const result = await serviceOf(d.prisma, d.merchants).audit(1, 'admin', {
      id: 71,
      approve: true,
      reason: '',
    });
    expect(result.auditStatus).toBe('APPROVED');
    expect(d.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ONLINE', auditNote: '' }),
      }),
    );
  });

  it('驳回必须写原因，且原因回写到商品的审核备注', async () => {
    const d = doubles(productRow({ status: 'PENDING' }));
    const service = serviceOf(d.prisma, d.merchants);
    await expect(
      service.audit(1, 'admin', { id: 71, approve: false, reason: '' }),
    ).rejects.toThrow('驳回必须填写原因');
    expect(d.auditUpdate).not.toHaveBeenCalled();

    await service.audit(1, 'admin', {
      id: 71,
      approve: false,
      reason: '主图与标题不符',
    });
    expect(d.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          auditNote: '主图与标题不符',
        }),
      }),
    );
  });

  it('已审核的记录不能二次审核', async () => {
    const d = doubles(
      productRow({ status: 'ONLINE' }),
      auditRow({ auditStatus: 'APPROVED' }),
    );
    await expect(
      serviceOf(d.prisma, d.merchants).audit(1, 'admin', {
        id: 71,
        approve: true,
        reason: '',
      }),
    ).rejects.toThrow('该商品已审核');
    expect(d.auditUpdate).not.toHaveBeenCalled();
  });

  it('跨市场审核按不存在处理', async () => {
    const d = doubles(productRow(), auditRow({ marketId: 2 }));
    await expect(
      serviceOf(d.prisma, d.merchants).audit(1, 'admin', {
        id: 71,
        approve: true,
        reason: '',
      }),
    ).rejects.toThrow('审核记录不存在');
  });
});

describe('商品上下架与删除', () => {
  it('只有已下架商品能重新上架', async () => {
    const d = doubles(productRow({ status: 'DRAFT' }));
    await expect(
      serviceOf(d.prisma, d.merchants).setStatus(payload, {
        id: 51,
        status: 'ONLINE',
      }),
    ).rejects.toThrow('只有审核通过并下架的商品才能重新上架');
    expect(d.productUpdate).not.toHaveBeenCalled();
  });

  it('下架只允许在售商品', async () => {
    const d = doubles(productRow({ status: 'DRAFT' }));
    await expect(
      serviceOf(d.prisma, d.merchants).setStatus(payload, {
        id: 51,
        status: 'OFFLINE',
      }),
    ).rejects.toThrow('只有在售商品才能下架');
  });

  it('下架在售商品写入 OFFLINE', async () => {
    const d = doubles(productRow({ status: 'ONLINE' }));
    const result = await serviceOf(d.prisma, d.merchants).setStatus(payload, {
      id: 51,
      status: 'OFFLINE',
    });
    expect(result.status).toBe('OFFLINE');
  });

  it('在售商品不能删除', async () => {
    const d = doubles(productRow({ status: 'ONLINE' }));
    await expect(
      serviceOf(d.prisma, d.merchants).remove(payload, 51),
    ).rejects.toThrow('不能删除');
    expect(d.productDelete).not.toHaveBeenCalled();
  });

  it('草稿商品删除时连同 SKU 一起清理', async () => {
    const d = doubles(productRow({ status: 'DRAFT' }));
    await serviceOf(d.prisma, d.merchants).remove(payload, 51);
    expect(d.productDelete).toHaveBeenCalledWith({ where: { id: 51 } });
  });
});
