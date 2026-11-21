import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { ErpBridge } from './erp.bridge';
import { noopErpPort } from './erp-port';
import type { ErpOrgKey } from './erp-port';

/**
 * ERP 读侧端口的组织隔离用例：桥的每个查询都必须带 (orgType, orgUserId) 条件，
 * 越权 id / 别家组织的行一律按「不存在」返回空值——这是收口前后最重要的语义增量
 * （收口前个别调用点按 id 直查没有组织条件）。
 */

const ORG_A: ErpOrgKey = { orgType: 'ENTERPRISE', orgUserId: 'ent-a' };
const ORG_B: ErpOrgKey = { orgType: 'ENTERPRISE', orgUserId: 'ent-b' };

type AnyRow = Record<string, unknown>;

function matches(row: AnyRow, where: AnyRow): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      const branches = cond as AnyRow[];
      return branches.some((branch) => matches(row, branch));
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const nested = cond as Record<string, unknown>;
      if ('in' in nested) return (nested.in as unknown[]).includes(row[key]);
      if ('not' in nested) return row[key] !== nested.not;
      if ('notIn' in nested)
        return !(nested.notIn as unknown[]).includes(row[key]);
      if ('lt' in nested) return (row[key] as string) < (nested.lt as string);
      if ('gt' in nested) {
        const value = Number(row[key]);
        return Number.isFinite(value) && value > Number(nested.gt);
      }
      if ('gte' in nested)
        return (row[key] as Date).getTime() >= (nested.gte as Date).getTime();
      return false;
    }
    return row[key] === cond;
  });
}

/** 内存表：只实现桥用到的 findMany / findFirst / count，select/orderBy 按原语义简化。 */
function model(seed: AnyRow[] = []) {
  const rows = [...seed];
  const pick = (args: { where?: AnyRow; orderBy?: AnyRow } = {}) => {
    const hit = rows.filter((row) => matches(row, args.where ?? {}));
    if (args.orderBy && 'id' in args.orderBy) {
      const dir = (args.orderBy as { id: string }).id === 'desc' ? -1 : 1;
      hit.sort((a, b) => (Number(a.id) - Number(b.id)) * dir);
    }
    return hit;
  };
  return {
    findMany: jest.fn(async (args: { where?: AnyRow } = {}) => pick(args)),
    findFirst: jest.fn(
      async (args: { where?: AnyRow; orderBy?: AnyRow } = {}) =>
        pick(args)[0] ?? null,
    ),
    count: jest.fn(async (args: { where?: AnyRow } = {}) => pick(args).length),
  };
}

function buildBridge(seed: Partial<Record<string, AnyRow[]>> = {}) {
  const prisma: Record<string, ReturnType<typeof model>> = {};
  for (const [key, rows] of Object.entries(seed)) prisma[key] = model(rows);
  for (const key of [
    'erpStock',
    'erpVariant',
    'erpProduct',
    'erpVendor',
    'erpPurchaseOrder',
    'erpReceipt',
    'erpReceivable',
    'erpPayable',
  ] as const) {
    prisma[key] = prisma[key] || model([]);
  }
  return new ErpBridge(stub<PrismaService>(prisma));
}

describe('ErpBridge：读侧端口的组织隔离', () => {
  it('逾期应收/应付只返回本组织未结清单据', async () => {
    const bridge = buildBridge({
      erpReceivable: [
        {
          id: 1,
          ...ORG_A,
          status: 'OPEN',
          dueDate: '2026-10-01',
          amount: 100,
          receivedAmount: 0,
          code: 'YS-1',
          customerName: '客户甲',
        },
        {
          id: 2,
          ...ORG_B,
          status: 'OPEN',
          dueDate: '2026-10-01',
          amount: 999,
          receivedAmount: 0,
          code: 'YS-2',
          customerName: '别家客户',
        },
        {
          id: 3,
          ...ORG_A,
          status: 'PAID',
          dueDate: '2026-10-01',
          amount: 50,
          receivedAmount: 50,
          code: 'YS-3',
          customerName: '已结清',
        },
      ],
      erpPayable: [
        {
          id: 4,
          ...ORG_A,
          status: 'OVERDUE',
          dueDate: '2026-09-30',
          amount: 10,
          paidAmount: 0,
          code: 'YF-4',
          vendorId: 7,
        },
        {
          id: 5,
          ...ORG_B,
          status: 'OPEN',
          dueDate: '2026-09-30',
          amount: 10,
          paidAmount: 0,
          code: 'YF-5',
          vendorId: 8,
        },
      ],
    });
    const receivables = await bridge.listOverdueReceivables(
      ORG_A,
      '2026-11-01',
    );
    expect(receivables.map((row) => row.id)).toEqual([1]);
    const payables = await bridge.listOverduePayables(ORG_A, '2026-11-01');
    expect(payables.map((row) => row.id)).toEqual([4]);
  });

  it('按 ids 取供应商时越权 id 被组织条件过滤（收口前该查询无 owner 条件）', async () => {
    const bridge = buildBridge({
      erpVendor: [
        { id: 1, ...ORG_A, name: '本家供应商', status: 'ACTIVE' },
        { id: 2, ...ORG_B, name: '别家供应商', status: 'ACTIVE' },
      ],
    });
    const picked = await bridge.listVendors(ORG_A, [1, 2]);
    expect(picked.map((row) => row.id)).toEqual([1]);
    const all = await bridge.listVendors(ORG_A);
    expect(all.map((row) => row.id)).toEqual([1]);
    // 空 ids 不发查询直接返回空，别家组织整表读不到。
    expect(await bridge.listVendors(ORG_B, [])).toEqual([]);
  });

  it('商品税率按组织过滤：越权 productId 返回 0', async () => {
    const bridge = buildBridge({
      erpProduct: [
        { id: 10, ...ORG_A, taxRate: 13 },
        { id: 11, ...ORG_B, taxRate: 6 },
      ],
    });
    expect(await bridge.getProductTaxRate(ORG_A, 10)).toBe(13);
    expect(await bridge.getProductTaxRate(ORG_A, 11)).toBe(0);
  });

  it('在途补货单只认同组织同 sourceNo；库存/入库/应付聚合同样带 owner', async () => {
    const bridge = buildBridge({
      erpPurchaseOrder: [
        {
          id: 20,
          ...ORG_A,
          sourceType: 'STOCK_LOW',
          sourceNo: 'stock:1:9',
          status: 'PENDING',
          orderNo: 'CG-A',
          createdAt: new Date('2026-11-19T00:00:00Z'),
        },
        {
          id: 21,
          ...ORG_B,
          sourceType: 'STOCK_LOW',
          sourceNo: 'stock:1:9',
          status: 'PENDING',
          orderNo: 'CG-B',
          createdAt: new Date('2026-11-19T00:00:00Z'),
        },
      ],
      erpStock: [
        {
          id: 30,
          ...ORG_A,
          warehouseId: 1,
          variantId: 9,
          onHand: 2,
          reorderPoint: 10,
        },
        {
          id: 31,
          ...ORG_B,
          warehouseId: 1,
          variantId: 9,
          onHand: 1,
          reorderPoint: 10,
        },
        {
          id: 32,
          ...ORG_A,
          warehouseId: 1,
          variantId: 99,
          onHand: 5,
          reorderPoint: 0,
        },
      ],
      erpReceipt: [
        { id: 40, ...ORG_A, purchaseOrderId: 20, status: 'RECEIVED' },
        { id: 41, ...ORG_B, purchaseOrderId: 21, status: 'RECEIVED' },
      ],
      erpPayable: [
        {
          id: 50,
          ...ORG_A,
          sourceType: 'PURCHASE_ORDER',
          sourceId: 20,
          amount: 100,
          paidAmount: 30,
          status: 'PARTIAL',
        },
        {
          id: 51,
          ...ORG_B,
          sourceType: 'PURCHASE_ORDER',
          sourceId: 21,
          amount: 700,
          paidAmount: 700,
          status: 'PAID',
        },
      ],
    });
    const order = await bridge.findReplenishmentOrder(ORG_A, 'stock:1:9');
    expect(order).toMatchObject({ id: 20, orderNo: 'CG-A' });
    expect(await bridge.findReplenishmentOrder(ORG_B, 'nope')).toBeNull();
    const stocks = await bridge.listStock(ORG_A, {
      onlyWithReorderPoint: true,
    });
    expect(stocks.map((row) => row.variantId)).toEqual([9]);
    expect(await bridge.listReceivedOrderIds(ORG_A, [20, 21])).toEqual([20]);
    expect(await bridge.sumPaidByPurchaseOrders(ORG_A, [20, 21])).toBe(30);
    const payables = await bridge.listPurchaseOrderPayables(ORG_A);
    expect(payables.map((row) => row.sourceId)).toEqual([20]);
    expect(
      await bridge.countPurchaseOrdersCreatedSince(
        ORG_A,
        new Date('2026-11-01T00:00:00Z'),
      ),
    ).toBe(1);
  });

  it('按来源找应收/应付与合同应收读数都限制在本组织内', async () => {
    const bridge = buildBridge({
      erpReceivable: [
        {
          id: 60,
          ...ORG_A,
          sourceType: 'CONTRACT',
          sourceId: 5,
          contractId: 5,
          status: 'OPEN',
          customerName: '客户甲',
          amount: 80,
          receivedAmount: 0,
        },
        {
          id: 61,
          ...ORG_B,
          sourceType: 'CONTRACT',
          sourceId: 5,
          contractId: 5,
          status: 'OPEN',
          customerName: '别家客户',
          amount: 80,
          receivedAmount: 0,
        },
      ],
      erpPayable: [
        {
          id: 70,
          ...ORG_A,
          sourceType: 'ENGAGEMENT',
          sourceId: 3,
          status: 'OPEN',
          paidAmount: 0,
        },
      ],
    });
    expect(
      await bridge.findReceivableBySource(ORG_A, 'CONTRACT', 5),
    ).toMatchObject({ id: 60 });
    expect(
      await bridge.findReceivableBySource(ORG_B, 'CONTRACT', 404),
    ).toBeNull();
    const byContract = await bridge.listReceivablesByContracts(ORG_A, [5]);
    expect(byContract.map((row) => row.contractId)).toEqual([5]);
    expect(
      await bridge.findPayableBySource(ORG_A, 'ENGAGEMENT', 3),
    ).toMatchObject({ id: 70, paidAmount: 0 });
    expect(await bridge.findPayableBySource(ORG_B, 'ENGAGEMENT', 3)).toBeNull();
    expect(await bridge.countPayables(ORG_A)).toBe(1);
    expect(await bridge.countPayables(ORG_B)).toBe(0);
  });
});

describe('noopErpPort：ERP 未接入时全部空转返回安全空值', () => {
  it('每个方法都返回空/零值而不是抛错', async () => {
    expect(await noopErpPort.listStock(ORG_A)).toEqual([]);
    expect(await noopErpPort.listVariants(ORG_A, [1])).toEqual([]);
    expect(await noopErpPort.getProductTaxRate(ORG_A, 1)).toBe(0);
    expect(await noopErpPort.listVendors(ORG_A)).toEqual([]);
    expect(await noopErpPort.findVendorByName(ORG_A, 'x')).toBeNull();
    expect(await noopErpPort.findActiveVendor(ORG_A)).toBeNull();
    expect(await noopErpPort.listPurchaseOrdersByProject(ORG_A, 1)).toEqual([]);
    expect(await noopErpPort.listPurchaseOrdersForReconcile(ORG_A)).toEqual([]);
    expect(await noopErpPort.findReplenishmentOrder(ORG_A, 'k')).toBeNull();
    expect(
      await noopErpPort.countPurchaseOrdersCreatedSince(ORG_A, new Date()),
    ).toBe(0);
    expect(await noopErpPort.listReceivedOrderIds(ORG_A, [1])).toEqual([]);
    expect(
      await noopErpPort.listOverdueReceivables(ORG_A, '2026-11-01'),
    ).toEqual([]);
    expect(await noopErpPort.listOverduePayables(ORG_A, '2026-11-01')).toEqual(
      [],
    );
    expect(await noopErpPort.listReceivablesByContracts(ORG_A, [1])).toEqual(
      [],
    );
    expect(
      await noopErpPort.findReceivableBySource(ORG_A, 'CONTRACT', 1),
    ).toBeNull();
    expect(await noopErpPort.sumPaidByPurchaseOrders(ORG_A, [1])).toBe(0);
    expect(await noopErpPort.listPurchaseOrderPayables(ORG_A)).toEqual([]);
    expect(
      await noopErpPort.findPayableBySource(ORG_A, 'ENGAGEMENT', 1),
    ).toBeNull();
    expect(await noopErpPort.countPayables(ORG_A)).toBe(0);
  });
});
