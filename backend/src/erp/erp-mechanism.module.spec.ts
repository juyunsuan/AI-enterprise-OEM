import type { HrmOrg } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { HrmScopeService } from '../hrm/hrm.scope';
import type { AiEvalService } from '../ai/ai-eval.service';
import { stub } from '../../test/doubles';
import { ErpService } from './erp.service';
import { registerErpMechanismModules } from './erp-mechanism.module';

/**
 * ERP 主数据的导入导出改由 ERP 域注册（`erp-mechanism.module.ts`）之后，
 * 机制层不再自己 `prisma.erp*` 直写。这里钉的是**改造要修掉的两条分叉**：
 *
 * 1. 导入供应商必须挂上统一外部主体 `bizParty`。原先机制层另写一份 create，
 *    不建也不匹配 party，`partyId` 恒为 0；项目成本页按名称回匹供应商时链就断了。
 * 2. 导入产品税率必须像页面保存那样截断到 0~100。原先 CSV 里手滑写 130 就直接入库，
 *    下游税额算成负数或三倍。
 *
 * 顺带钉住导出列：库存导出要带 inTransit / locked（原来只导两列，运营拿 CSV 对账永远差在途）。
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

function setup() {
  const parties: Row[] = [];
  const vendors: Row[] = [];
  const products: Row[] = [];
  const stocks: Row[] = [
    {
      id: 1,
      orgType: 'ENTERPRISE',
      orgUserId: 'ent-1',
      warehouseId: 3,
      variantId: 9,
      onHand: 12,
      inTransit: 5,
      locked: 2,
      reorderPoint: 10,
    },
  ];
  let seq = 1;
  const prisma = {
    bizParty: {
      findFirst: jest.fn(async ({ where }: { where: Row }) =>
        parties.find((row) =>
          where.id !== undefined
            ? row.id === where.id
            : row.name === where.name && row.orgUserId === where.orgUserId,
        ),
      ),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: seq++, ...data };
        parties.push(row);
        return row;
      }),
    },
    erpVendor: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: seq++,
          status: 'ACTIVE',
          createdAt: new Date('2026-11-19T00:00:00Z'),
          ...data,
        };
        vendors.push(row);
        return row;
      }),
      findMany: jest.fn(async () => vendors),
    },
    erpProduct: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: seq++,
          categoryId: 0,
          barcode: '',
          spec: '',
          status: 'ACTIVE',
          createdAt: new Date('2026-11-19T00:00:00Z'),
          updatedAt: new Date('2026-11-19T00:00:00Z'),
          ...data,
        };
        products.push(row);
        return row;
      }),
      findMany: jest.fn(async () => products),
    },
    erpCategory: { findMany: jest.fn(async () => []) },
    erpVariant: { findMany: jest.fn(async () => []) },
    erpStock: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        where.productId
          ? []
          : stocks.filter((row) => row.orgUserId === where.orgUserId),
      ),
    },
  };
  const exports: Array<{
    definition: { module: string; label: string; columns: string[] };
    rows: (org: HrmOrg, filters: Row) => Promise<Row[]>;
  }> = [];
  const imports: Array<{
    definition: { module: string; label: string; columns: string[] };
    importRow: (org: HrmOrg, row: Row) => Promise<string>;
  }> = [];
  const mechanisms = stub<MechanismService>({
    registerExportModule: jest.fn(
      (
        definition: { module: string; label: string; columns: string[] },
        rows: (org: HrmOrg, filters: Row) => Promise<Row[]>,
      ) => {
        exports.push({ definition, rows });
      },
    ),
    registerImportModule: jest.fn(
      (
        definition: { module: string; label: string; columns: string[] },
        importRow: (org: HrmOrg, row: Row) => Promise<string>,
      ) => {
        imports.push({ definition, importRow });
      },
    ),
    dispatch: jest.fn(async () => undefined),
  });
  const erp = new ErpService(
    stub<PrismaService>(prisma),
    stub<HrmScopeService>(),
    mechanisms,
    stub<AiEvalService>(),
  );
  registerErpMechanismModules(mechanisms, stub<PrismaService>(prisma), erp);
  const importer = (module: string) => {
    const found = imports.find((item) => item.definition.module === module);
    if (!found) throw new Error(`没有注册导入模块 ${module}`);
    return found.importRow;
  };
  const exporter = (module: string) => {
    const found = exports.find((item) => item.definition.module === module);
    if (!found) throw new Error(`没有注册导出模块 ${module}`);
    return found.rows;
  };
  return {
    prisma,
    parties,
    vendors,
    products,
    exporter,
    importer,
    exports,
    imports,
  };
}

describe('ERP 注册到机制层的主数据模块', () => {
  it('注册的模块键与列名保持原样（前端导入导出选择器是硬编码的）', () => {
    const { exports, imports } = setup();
    expect(exports.map((item) => item.definition.module)).toEqual(
      expect.arrayContaining(['erp_product', 'erp_vendor', 'erp_stock']),
    );
    expect(imports.map((item) => item.definition.module)).toEqual(
      expect.arrayContaining(['erp_product', 'erp_vendor']),
    );
    expect(
      exports.find((item) => item.definition.module === 'erp_stock')?.definition
        .columns,
    ).toEqual([
      'warehouseId',
      'variantId',
      'onHand',
      'inTransit',
      'locked',
      'reorderPoint',
    ]);
  });

  it('导入供应商会建档并挂上 bizParty（机制层自己写时漏掉的那一步）', async () => {
    const { importer, parties, vendors } = setup();
    const code = await importer('erp_vendor')(org, {
      name: '供应商甲',
      contactName: '张三',
      phone: '13800000000',
      taxNo: 'TAX-1',
    });
    expect(String(code)).toMatch(/^V/);
    expect(vendors).toHaveLength(1);
    // 编码列留空也要有码，且 partyId 必须非 0——项目成本页按名称回匹供应商全靠它
    expect(Number(vendors[0].partyId)).toBeGreaterThan(0);
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({
      kind: 'VENDOR',
      name: '供应商甲',
      source: 'ERP',
      orgUserId: 'ent-1',
    });
  });

  it('同名供应商重复导入只挂同一个外部主体（不长出第二个 party）', async () => {
    const { importer, parties } = setup();
    await importer('erp_vendor')(org, { name: '供应商甲' });
    await importer('erp_vendor')(org, { name: '供应商甲' });
    expect(parties).toHaveLength(1);
  });

  it('导入产品把税率截断到 0~100，并给缺省单位与编码', async () => {
    const { importer, products } = setup();
    const code = await importer('erp_product')(org, {
      name: '可乐 330ml',
      taxRate: 130,
      purchasePrice: 3,
      salePrice: 5,
    });
    expect(String(code)).toMatch(/^P/);
    expect(products).toHaveLength(1);
    expect(Number(products[0].taxRate)).toBe(100);
    expect(products[0].unit).toBe('件');
    expect(String(products[0].createdBy)).toBe('owner-1');
    // 负税率同样被夹回 0，不会把税额算成负数
    await importer('erp_product')(org, { name: '雪碧 330ml', taxRate: -20 });
    expect(Number(products[1].taxRate)).toBe(0);
  });

  it('导出库存带 inTransit 与 locked（原来只导两列，对账永远差在途）', async () => {
    const { exporter } = setup();
    const rows = await exporter('erp_stock')(org, {});
    expect(rows).toHaveLength(1);
    // 金额/数量列沿用导出既有的 `ds()` 两位小数字符串口径（原来是字符串就还是字符串，
    // 不然 CSV 里 3.5 会变成 3.5 与 3.50 混排）
    expect(rows[0]).toMatchObject({
      warehouseId: 3,
      variantId: 9,
      onHand: '12.00',
      inTransit: '5.00',
      locked: '2.00',
      reorderPoint: '10.00',
    });
  });
});
