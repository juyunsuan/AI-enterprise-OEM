/**
 * ERP 主数据的机制层挂载点：导出行提供者 + 导入写入器。
 *
 * 为什么由 ERP 域注册、而不是机制层自己读写 ERP 表：
 * 机制层的导入导出是通用底座（字段映射、任务、试运行、错误汇总），它不该知道
 * 「供应商要挂 bizParty」「税率要截断 0~100」「编码列留空要补时间戳码」这些 ERP 规则。
 * 过去它把这些规则抄了一份，抄漏的两处都是事后才发现的：
 * - 导入的供应商没有 `partyId`（`ErpService.vendorPartyId` 才会建/挂外部主体），
 *   项目成本页按名称回匹供应商时链就断了；
 * - 导入的产品税率不截断，CSV 里手滑写 130 就入库，税额算成负数或三倍。
 *
 * 现在导入走 `ErpService.importProductRow / importVendorRow`（与页面保存同一个写核心），
 * 导出走 ERP 自己的取数，机制层只剩通用模块。
 */

import type { MechanismService } from '../mechanisms/mechanism.service';
import type { HrmOrg } from '../hrm/hrm.scope';
import type { PrismaService } from '../prisma/prisma.service';
import { ds } from '../hrm/hrm.helpers';
import type { ErpService } from './erp.service';

type Row = Record<string, unknown>;

const PRODUCT_COLUMNS = [
  'id',
  'code',
  'name',
  'unit',
  'purchasePrice',
  'salePrice',
  'taxRate',
  'status',
];
const VENDOR_COLUMNS = [
  'id',
  'code',
  'name',
  'contactName',
  'phone',
  'email',
  'status',
];
const STOCK_COLUMNS = [
  'warehouseId',
  'variantId',
  'onHand',
  'inTransit',
  'locked',
  'reorderPoint',
];

/** 装配时调用一次：把 ERP 的三个导出模块与两个导入模块挂到机制层。 */
export function registerErpMechanismModules(
  mechanisms: MechanismService,
  prisma: PrismaService,
  erp: ErpService,
) {
  const orgOf = (org: HrmOrg) => ({
    orgType: org.orgType,
    orgUserId: org.orgUserId,
  });

  mechanisms.registerExportModule(
    { module: 'erp_product', label: '产品', columns: PRODUCT_COLUMNS },
    async (org) =>
      (
        await prisma.erpProduct.findMany({
          where: orgOf(org),
          orderBy: { id: 'asc' },
        })
      ).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        unit: row.unit,
        purchasePrice: ds(row.purchasePrice),
        salePrice: ds(row.salePrice),
        taxRate: ds(row.taxRate),
        status: row.status,
      })),
  );

  mechanisms.registerExportModule(
    { module: 'erp_vendor', label: '供应商', columns: VENDOR_COLUMNS },
    async (org) =>
      (
        await prisma.erpVendor.findMany({
          where: orgOf(org),
          orderBy: { id: 'asc' },
        })
      ).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        contactName: row.contactName,
        phone: row.phone,
        email: row.email,
        status: row.status,
      })),
  );

  // 库存导出要带上 inTransit / locked：机制层原来只读了 onHand 与 reorderPoint 两列，
  // 导出表里少两列，运营拿 CSV 做的对账就永远差在途与占用。
  mechanisms.registerExportModule(
    { module: 'erp_stock', label: '库存', columns: STOCK_COLUMNS },
    async (org) =>
      (
        await prisma.erpStock.findMany({
          where: orgOf(org),
          orderBy: { id: 'asc' },
        })
      ).map((row) => ({
        warehouseId: row.warehouseId,
        variantId: row.variantId,
        onHand: ds(row.onHand),
        inTransit: ds(row.inTransit),
        locked: ds(row.locked),
        reorderPoint: ds(row.reorderPoint),
      })),
  );

  mechanisms.registerImportModule(
    {
      module: 'erp_product',
      label: '产品',
      columns: [
        'code',
        'name',
        'unit',
        'spec',
        'purchasePrice',
        'salePrice',
        'taxRate',
        'note',
      ],
    },
    (org: HrmOrg, row: Row) => erp.importProductRow(org, row),
  );

  mechanisms.registerImportModule(
    {
      module: 'erp_vendor',
      label: '供应商',
      columns: [
        'code',
        'name',
        'contactName',
        'phone',
        'email',
        'taxNo',
        'address',
        'note',
      ],
    },
    (org: HrmOrg, row: Row) => erp.importVendorRow(org, row),
  );
}
