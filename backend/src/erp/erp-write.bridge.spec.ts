import type { HrmOrg } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { stub } from '../../test/doubles';
import { noopErpPort, type ErpPort } from '../erp/erp-port';
import { ErpWriteBridge } from '../erp/erp-write.bridge';
import { erpToday } from '../erp/erp-invariants';

/**
 * ERP 写侧端口的实现约束。
 *
 * 这几条都是这一轮从跨域直写里挑出来的真实事故面：号源两套会重码、改金额不重算审批态
 * 能绕过财务审批、`where: { id }` 不带组织条件能改到别人单据、有付款的应付被静默跳过。
 * 断言只认「端口行为」，不认调用方怎么拼参数——所以这里用内存假库跑真实现。
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
const other = { ...org, orgUserId: 'ent-2' };

class FakeDb {
  receivables: Row[] = [];
  payables: Row[] = [];
  orders: Row[] = [];
  private seq = 1;

  erpReceivable = {
    findFirst: async ({ where }: { where: Row }) =>
      this.receivables.find((row) => matches(row, where)) ?? null,
    count: async ({ where }: { where: Row }) =>
      this.receivables.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row = { id: this.seq++, status: 'OPEN', note: '', ...data };
      this.receivables.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = this.receivables.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
  };

  erpPayable = {
    findFirst: async ({ where }: { where: Row }) =>
      this.payables.find((row) => matches(row, where)) ?? null,
    count: async ({ where }: { where: Row }) =>
      this.payables.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row = { id: this.seq++, status: 'OPEN', note: '', ...data };
      this.payables.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = this.payables.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
  };

  erpPurchaseOrder = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: this.seq++, ...data };
      this.orders.push(row);
      return row;
    },
  };

  /** $transaction 不在写端口路径上，这里只给个直通实现。 */
  async $transaction(input: unknown) {
    const fn = input as (tx: FakeDb) => Promise<unknown>;
    return typeof fn === 'function' ? fn(this) : undefined;
  }
}

/** 只支持本用例需要的简单等值条件（`createdAt.gte` 单独处理）。 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'createdAt') {
      const bound = (expected as { gte?: Date }).gte;
      return (
        !bound || new Date(String(row.createdAt)).getTime() >= bound.getTime()
      );
    }
    return row[key] === expected;
  });
}

function setup(
  options: {
    receivables?: Row[];
    payables?: Row[];
    reads?: Partial<ErpPort>;
  } = {},
) {
  const db = new FakeDb();
  (options.receivables || []).forEach((row) => db.receivables.push({ ...row }));
  (options.payables || []).forEach((row) => db.payables.push({ ...row }));
  const events: Array<{ event: string; payload: Row }> = [];
  const mechanisms = stub<MechanismService>({
    dispatch: jest.fn(async (_org: HrmOrg, event: string, payload: Row) => {
      events.push({ event, payload });
      return undefined;
    }),
  });
  const reads = stub<ErpPort>({
    ...noopErpPort,
    listVariants: jest.fn(async () => [
      {
        id: 9,
        sku: 'SKU-9',
        name: '可乐 330ml',
        productId: 3,
        purchasePrice: 5,
      },
    ]),
    ...options.reads,
  });
  const bridge = new ErpWriteBridge(stub<PrismaService>(db), mechanisms, reads);
  return { db, bridge, events, reads, mechanisms };
}

describe('ERP 写端口：应收（合同回款）', () => {
  it('首次计提走 YS 当日流水号，重复计提只改金额不新增', async () => {
    const { db, bridge } = setup();
    const input = {
      contractId: 77,
      customerId: 5,
      customerName: '客户甲',
      amount: 1200,
      note: '合同 C-1 回款计划',
    };
    const first = await bridge.syncContractReceivable(org, input);
    expect(db.receivables).toHaveLength(1);
    expect(db.receivables[0]).toMatchObject({
      code: `YS-${erpToday().replace(/-/g, '')}-0001`,
      sourceType: 'CONTRACT',
      sourceId: 77,
      contractId: 77,
    });
    // 应收表上没有经手人字段（ERP 侧同样不写），别把「没这列」当成漏写
    expect(db.receivables[0].createdBy).toBeUndefined();
    // 同合同再计提一次（金额改了）：仍然是同一张单
    await bridge.syncContractReceivable(org, { ...input, amount: 1500 });
    expect(db.receivables).toHaveLength(1);
    expect(Number(db.receivables[0].amount)).toBe(1500);
    expect(first).toBe(db.receivables[0].id);
  });

  it('已作废的应收不被跨域重新计提拉回在册', async () => {
    const { db, bridge } = setup({
      receivables: [
        {
          id: 1,
          orgType: org.orgType,
          orgUserId: org.orgUserId,
          sourceType: 'CONTRACT',
          sourceId: 77,
          status: 'CANCELED',
          amount: 900,
        },
      ],
    });
    const id = await bridge.syncContractReceivable(org, {
      contractId: 77,
      customerId: 5,
      customerName: '客户甲',
      amount: 1500,
    });
    expect(id).toBe(1);
    expect(db.receivables[0].status).toBe('CANCELED');
    expect(Number(db.receivables[0].amount)).toBe(900);
  });

  it('金额不大于 0 不计提（原调用方语义）', async () => {
    const { db, bridge } = setup();
    expect(
      await bridge.syncContractReceivable(org, {
        contractId: 78,
        customerId: 5,
        customerName: '客户甲',
        amount: 0,
      }),
    ).toBe(0);
    expect(db.receivables).toHaveLength(0);
  });
});

describe('ERP 写端口：应付（外部合作验收）', () => {
  it('大额应付建单即待审批，改小金额必须重算审批态', async () => {
    const { db, bridge } = setup();
    const base = {
      sourceType: 'ENGAGEMENT',
      sourceId: 12,
      vendorId: 7,
      note: '外部合作验收：供应商甲',
    };
    await bridge.syncSourcePayable(org, { ...base, amount: 80000 });
    expect(db.payables[0]).toMatchObject({
      code: `YF-${erpToday().replace(/-/g, '')}-0001`,
      approvalStatus: 'PENDING',
    });
    // 跨域把 8 万改成 3 万：审批态要跟着回到免审批，而不是留着 PENDING 或更糟
    await bridge.syncSourcePayable(org, { ...base, amount: 30000 });
    expect(db.payables).toHaveLength(1);
    expect(db.payables[0].approvalStatus).toBe('NONE');
    // 再涨回大额且此前已审批通过：必须重新进审批
    db.payables[0].approvalStatus = 'APPROVED';
    db.payables[0].amount = 30000;
    await bridge.syncSourcePayable(org, { ...base, amount: 90000 });
    expect(db.payables[0].approvalStatus).toBe('PENDING');
  });

  it('已有付款的应付不取消，并在单据上留下待财务冲销的痕迹（可重复执行）', async () => {
    const { db, bridge } = setup({
      payables: [
        {
          id: 3,
          orgType: org.orgType,
          orgUserId: org.orgUserId,
          sourceType: 'ENGAGEMENT',
          sourceId: 12,
          status: 'PARTIAL',
          paidAmount: 2000,
          amount: 5000,
          note: '外部合作验收：供应商甲',
        },
      ],
    });
    expect(
      await bridge.cancelSourcePayable(
        org,
        'ENGAGEMENT',
        12,
        '外部合作 #12 已取消',
      ),
    ).toBe('HAS_PAYMENT');
    expect(db.payables[0].status).toBe('PARTIAL');
    expect(String(db.payables[0].note)).toContain('待财务冲销');
    expect(String(db.payables[0].note)).toContain('外部合作 #12 已取消');
    // 原业务备注没丢
    expect(String(db.payables[0].note)).toContain('外部合作验收：供应商甲');
    const once = String(db.payables[0].note).length;
    await bridge.cancelSourcePayable(
      org,
      'ENGAGEMENT',
      12,
      '外部合作 #12 已取消',
    );
    expect(String(db.payables[0].note).length).toBe(once);
  });

  it('没有付款的应付正常作废', async () => {
    const { db, bridge } = setup({
      payables: [
        {
          id: 4,
          orgType: org.orgType,
          orgUserId: org.orgUserId,
          sourceType: 'ENGAGEMENT',
          sourceId: 13,
          status: 'OPEN',
          paidAmount: 0,
          amount: 500,
        },
      ],
    });
    expect(await bridge.cancelSourcePayable(org, 'ENGAGEMENT', 13)).toBe(
      'CANCELED',
    );
    expect(db.payables[0].status).toBe('CANCELED');
  });
});

describe('ERP 写端口：跨组织越权与补货建单', () => {
  it('拿别家的单据 id 来改：改不动，并且明确报错（归属自证）', async () => {
    const { db, bridge } = setup({
      receivables: [
        {
          id: 9,
          orgType: org.orgType,
          orgUserId: other.orgUserId,
          sourceType: 'CONTRACT',
          sourceId: 77,
          status: 'OPEN',
          amount: 1000,
        },
      ],
    });
    // 读数按组织过滤：本组织读不到那行，于是给自己新建一张，别家那张一分钱都没动
    await bridge.syncContractReceivable(org, {
      contractId: 77,
      customerId: 5,
      customerName: '客户甲',
      amount: 1200,
    });
    expect(db.receivables).toHaveLength(2);
    const foreign = db.receivables.find(
      (row) => row.orgUserId === other.orgUserId,
    );
    const mine = db.receivables.find((row) => row.orgUserId === org.orgUserId);
    expect(Number(foreign?.amount)).toBe(1000);
    expect(foreign?.status).toBe('OPEN');
    expect(Number(mine?.amount)).toBe(1200);
  });

  it('更新别人组织的单据：count 0 → 抛「不存在或不属于当前组织」', async () => {
    const { bridge } = setup();
    await expect(
      (
        bridge as unknown as {
          updateOwned: (
            label: string,
            run: () => Promise<{ count: number }>,
          ) => Promise<void>;
        }
      ).updateOwned('应付单', async () => ({ count: 0 })),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('补货单：同来源已有在途单就复用，不新建也不重复发事件', async () => {
    const open = { id: 88, orderNo: 'CG-20261111-0003' };
    const { db, bridge, events } = setup({
      reads: { findReplenishmentOrder: jest.fn(async () => open) },
    });
    const result = await bridge.ensureReplenishmentOrder(org, {
      warehouseId: 1,
      variantId: 9,
      sourceNo: 'stock:1:9',
      quantity: 8,
    });
    expect(result).toEqual({
      orderId: 88,
      orderNo: 'CG-20261111-0003',
      created: false,
    });
    expect(db.orders).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('补货单：新建时含税金额、默认供应商、经手人与事件都由端口一次补齐', async () => {
    const { db, bridge, events } = setup({
      reads: {
        findReplenishmentOrder: jest.fn(async () => null),
        findActiveVendor: jest.fn(async () => ({ id: 7, name: '供应商甲' })),
        getProductTaxRate: jest.fn(async () => 13),
        countPurchaseOrdersCreatedSince: jest.fn(async () => 0),
      },
    });
    const result = await bridge.ensureReplenishmentOrder(org, {
      warehouseId: 1,
      variantId: 9,
      sourceNo: 'stock:1:9',
      quantity: 8,
      reason: '可乐 330ml 现存 2 / 补货点 10',
    });
    expect(result?.created).toBe(true);
    expect(db.orders[0]).toMatchObject({
      orgType: org.orgType,
      orgUserId: org.orgUserId,
      orderNo: `CG-${erpToday().replace(/-/g, '')}-0001`,
      vendorId: 7,
      status: 'PENDING',
      sourceType: 'STOCK_LOW',
      amount: 40,
      taxAmount: 5.2,
      // 经手人是触发扫描的人（actorId），与 ErpService 同口径；原来这里写的是组织主账号
      createdBy: 'owner-1',
    });
    expect(events.map((item) => item.event)).toContain('erp.purchase.created');
    expect(events[0].payload).toMatchObject({
      source: 'STOCK_LOW',
      amount: '40.00',
    });
  });

  it('补货单：SKU 在本组织不存在时不建单（无货可补）', async () => {
    const { db, bridge, events } = setup({
      reads: {
        findReplenishmentOrder: jest.fn(async () => null),
        listVariants: jest.fn(async () => []),
      },
    });
    expect(
      await bridge.ensureReplenishmentOrder(org, {
        warehouseId: 1,
        variantId: 999,
        sourceNo: 'stock:1:999',
        quantity: 8,
      }),
    ).toBeNull();
    expect(db.orders).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
