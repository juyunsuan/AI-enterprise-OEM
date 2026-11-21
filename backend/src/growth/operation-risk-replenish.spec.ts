import type { HrmOrg, HrmScopeService } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TaskDraft } from '../task-center/task-source';
import { stub } from '../../test/doubles';
import { noopErpPort } from '../erp/erp-port';
import { ErpWriteBridge } from '../erp/erp-write.bridge';
import type { ErpPort } from '../erp/erp-port';
import { OperationRiskService } from './operation-risk.service';

/**
 * docs §8.4「库存低于阈值 → 补货申请」：
 * 扫描后要落一张待审批的正式采购单（后续仍走采购审批），任务派给采购岗位；
 * 同一仓库 + 变体已有在途补货单时复用，不重复建单。
 *
 * 这里注入的是**真的** `ErpWriteBridge`（底下还是同一份 prisma 替身）：
 * 建单已经收口到 ERP 写端口，用真实现才测得到「号源走当日流水、事件由 ERP 域发一次、
 * 复用在途单」这三条口径，而不是只测调用方把 create 传对了参数。
 */

type Row = Record<string, unknown>;

const org: HrmOrg = {
  orgType: 'ENTERPRISE',
  orgUserId: 'ent-1',
  actorId: 'owner-1',
  isOwner: true,
  isAdmin: true,
  roles: [],
  positions: [],
  department: '',
};

function setup(options: { openOrder?: Row | null; lowStock?: boolean } = {}) {
  const drafts: TaskDraft[] = [];
  const events: Array<{ event: string; payload: Row }> = [];
  const created: Row[] = [];
  const openOrder = options.openOrder === undefined ? null : options.openOrder;
  const lowStock = options.lowStock !== false;
  const prisma = {
    pjProject: { findMany: jest.fn(async () => []) },
    pjCostItem: { groupBy: jest.fn(async () => []) },
    pjTask: { findMany: jest.fn(async () => []) },
    orgStaff: {
      findMany: jest.fn(async () => [
        {
          memberUserId: 'buyer-1',
          roles: ['PURCHASE'],
          positions: [],
        },
      ]),
    },
    erpPurchaseOrder: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        created.push(data);
        return { id: 100, orderNo: data.orderNo };
      }),
    },
  };
  const findReplenishmentOrder = jest.fn(async () => openOrder);
  const erp = stub<ErpPort>({
    ...noopErpPort,
    listStock: jest.fn(async () =>
      lowStock
        ? [{ warehouseId: 1, variantId: 9, onHand: 2, reorderPoint: 10 }]
        : [],
    ),
    listVariants: jest.fn(async () => [
      {
        id: 9,
        sku: 'SKU-9',
        name: '可乐 330ml',
        productId: 3,
        purchasePrice: 5,
      },
    ]),
    findReplenishmentOrder,
    getProductTaxRate: jest.fn(async () => 13),
    findActiveVendor: jest.fn(async () => ({ id: 7, name: '供应商甲' })),
    countPurchaseOrdersCreatedSince: jest.fn(async () => 0),
  });
  const mechanisms = {
    dispatch: jest.fn(async (_org: HrmOrg, event: string, payload: Row) => {
      events.push({ event, payload });
      return undefined;
    }),
  };
  const service = new OperationRiskService(
    stub<PrismaService>(prisma),
    stub<HrmScopeService>(),
    stub<MechanismService>(mechanisms),
    {
      assign: async (draft: TaskDraft) => {
        drafts.push(draft);
        return null;
      },
    },
    erp,
    // 写真实现：同一个 prisma 替身，断言仍然落在 created/events 上
    new ErpWriteBridge(
      stub<PrismaService>(prisma),
      stub<MechanismService>(mechanisms),
      erp,
    ),
  );
  return {
    service,
    prisma,
    erp,
    findReplenishmentOrder,
    drafts,
    events,
    created,
  };
}

describe('库存低于补货点 → 补货申请（docs §8.4）', () => {
  it('派单时生成待审批补货采购单，并派给采购岗位', async () => {
    const ctx = setup();
    const signals = await ctx.service.dispatchRisks(org);
    const stockSignal = signals.find((item) => item.kind === 'STOCK_LOW');
    expect(stockSignal?.stock).toMatchObject({
      warehouseId: 1,
      variantId: 9,
      sku: 'SKU-9',
      quantity: 8,
    });
    expect(ctx.created).toHaveLength(1);
    expect(ctx.created[0]).toMatchObject({
      orgType: 'ENTERPRISE',
      orgUserId: 'ent-1',
      vendorId: 7,
      sourceType: 'STOCK_LOW',
      sourceNo: 'stock:1:9',
      warehouseId: 1,
      status: 'PENDING',
      items: [{ variantId: 9, sku: 'SKU-9', quantity: 8, price: 5 }],
    });
    expect(ctx.drafts).toHaveLength(1);
    expect(ctx.drafts[0]).toMatchObject({
      source: 'risk',
      sourceId: 'stock:1:9:o100',
      assigneeUserId: 'buyer-1',
      title: '补货申请：可乐 330ml',
      sourceStatusLabel: '待审批补货',
    });
    expect(ctx.drafts[0].description).toContain('已生成采购申请');
    expect(ctx.events.map((item) => item.event)).toContain(
      'erp.purchase.created',
    );
  });

  it('已有在途补货单时复用，不重复建单也不重复派任务行', async () => {
    const ctx = setup({ openOrder: { id: 88, orderNo: 'CG-20261111-0003' } });
    await ctx.service.dispatchRisks(org);
    expect(ctx.created).toHaveLength(0);
    expect(ctx.drafts).toHaveLength(1);
    expect(ctx.drafts[0]).toMatchObject({
      sourceId: 'stock:1:9:o88',
      assigneeUserId: 'buyer-1',
    });
    expect(ctx.drafts[0].description).toContain('CG-20261111-0003');
  });

  it('关闭前复核：在途补货单存在即放行（不必等库存回补）', async () => {
    const ctx = setup();
    ctx.findReplenishmentOrder.mockResolvedValueOnce({
      id: 100,
      orderNo: 'CG-20261119-0001',
    });
    const outcome = await ctx.service.recheck(
      { orgType: 'ENTERPRISE', orgUserId: 'ent-1' },
      'stock:1:9:o100',
    );
    expect(outcome.cleared).toBe(true);
  });

  it('关闭前复核：没有补货单且库存仍低时拒绝关闭', async () => {
    const ctx = setup();
    const outcome = await ctx.service.recheck(
      { orgType: 'ENTERPRISE', orgUserId: 'ent-1' },
      'stock:1:9:o100',
    );
    expect(outcome.cleared).toBe(false);
    expect(outcome.reason).toContain('异常仍未消除');
  });
});
