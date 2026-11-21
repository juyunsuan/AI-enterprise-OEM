/**
 * ERP 读侧端口：增长驾驶舱 / 经营异常 / 项目成本等中台域只依赖这个接口，
 * 不再直接 `prisma.erp*` 查 ERP 表（口径对齐 `commerce-core/scrm-port.ts`）。
 *
 * 设计要点：
 * - 端口定义在 ERP 域、实现在 `erp.bridge.ts`、装配在 `http/services.ts`，
 *   调用方与实现互不 import 实现类；
 * - 每个方法都带组织键 `(orgType, orgUserId)`（与 `ErpService.orgKey()/requireOwnedRow()`
 *   同一口径），实现侧必须按组织过滤，杜绝越权读数；
 * - 方法一律只读；创建/更新 ERP 单据的写侧仍走写端口/原链路（下一批收口）；
 * - `noopErpPort`：ERP 未接入/单测免装配时空转返回安全空值；
 * - 超时与降级由调用方用 `commerce-core/outbox-policy` 的 `withBridgeTimeout` 落地：
 *   ERP 查询失败/超时不得让驾驶舱、增长雷达、项目成本页整体报错。
 */

import { Logger } from '../common/logger';

/** 组织键：与 HRM/ERP 全域一致的 (orgType, orgUserId) 二元组。 */
export interface ErpOrgKey {
  orgType: string;
  orgUserId: string;
}

// ------------------------------------------------------------------
// 读数 DTO：金额/数量统一折算为 number，调用方不再面对 Decimal。
// ------------------------------------------------------------------

export interface ErpStockRow {
  warehouseId: number;
  variantId: number;
  onHand: number;
  reorderPoint: number;
}

/** 库存查询条件：按变体、按仓库，或只看设置了补货点的行（预警/补货所需读数）。 */
export interface ErpStockQuery {
  variantIds?: number[];
  warehouseId?: number;
  onlyWithReorderPoint?: boolean;
  limit?: number;
}

export interface ErpVariantRow {
  id: number;
  sku: string;
  name: string;
  productId: number;
  /** 采购单价：补货申请与库存金额估算共用。 */
  purchasePrice: number;
}

export interface ErpVendorRow {
  id: number;
  name: string;
}

/** 采购单简行（项目成本三口径用）。 */
export interface ErpPurchaseOrderBriefRow {
  id: number;
  amount: number;
  status: string;
}

/** 采购单对账行（采购单 ↔ 应付对账用）。 */
export interface ErpPurchaseOrderRow {
  id: number;
  orderNo: string;
  vendorId: number;
  projectId: number;
  amount: number;
  taxAmount: number;
  status: string;
}

/** 在途补货申请单（待审批/已批准/收货中）。 */
export interface ErpReplenishmentOrderRow {
  id: number;
  orderNo: string;
}

export interface ErpReceivableOverdueRow {
  id: number;
  code: string;
  customerName: string;
  amount: number;
  receivedAmount: number;
  dueDate: string;
}

export interface ErpPayableOverdueRow {
  id: number;
  code: string;
  vendorId: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
}

/** 按合同挂账的应收简行（合同履约四态判定用）。 */
export interface ErpReceivableContractRow {
  contractId: number;
  sourceId: number;
  amount: number;
  receivedAmount: number;
}

/** 按来源单据定位的应收引用行（写侧幂等分支的读数）。 */
export interface ErpReceivableRefRow {
  id: number;
  status: string;
  customerName: string;
}

/** 按来源单据定位的应付引用行。 */
export interface ErpPayableRefRow {
  id: number;
  status: string;
  paidAmount: number;
}

/** 采购单来源应付的金额行（对账用）。 */
export interface ErpPayableSourceRow {
  sourceId: number;
  amount: number;
  paidAmount: number;
}

// ------------------------------------------------------------------
// 端口
// ------------------------------------------------------------------

export interface ErpPort {
  // ---- 库存与商品主数据 ----
  /** 库存查询：按 variant / warehouse 过滤；`onlyWithReorderPoint` 供预警扫描。 */
  listStock(org: ErpOrgKey, query?: ErpStockQuery): Promise<ErpStockRow[]>;
  /** 变体读数：标签、SKU、采购单价（补货所需）。空 ids 返回空。 */
  listVariants(org: ErpOrgKey, variantIds: number[]): Promise<ErpVariantRow[]>;
  /** 商品税率（补货申请计税用）；查不到或越权返回 0。 */
  getProductTaxRate(org: ErpOrgKey, productId: number): Promise<number>;

  // ---- 供应商 ----
  /** 供应商名单：传 ids 按 ids 取（越权 id 自动被过滤），不传取本组织全量。 */
  listVendors(org: ErpOrgKey, vendorIds?: number[]): Promise<ErpVendorRow[]>;
  /** 同名供应商（外部主体 ↔ 供应商匹配）；无匹配返回 null。 */
  findVendorByName(org: ErpOrgKey, name: string): Promise<ErpVendorRow | null>;
  /** 最近一个在用供应商（补货申请沿用供应商用）；无则 null。 */
  findActiveVendor(org: ErpOrgKey): Promise<ErpVendorRow | null>;

  // ---- 采购与入库 ----
  /** 项目归属采购单（非取消），成本三口径用。 */
  listPurchaseOrdersByProject(
    org: ErpOrgKey,
    projectId: number,
  ): Promise<ErpPurchaseOrderBriefRow[]>;
  /** 对账口径采购单：排除草稿与取消，按 id 倒序。 */
  listPurchaseOrdersForReconcile(
    org: ErpOrgKey,
  ): Promise<ErpPurchaseOrderRow[]>;
  /** 同一库存信号键的在途补货申请单（幂等复用与结案复核用）。 */
  findReplenishmentOrder(
    org: ErpOrgKey,
    sourceNo: string,
  ): Promise<ErpReplenishmentOrderRow | null>;
  /** 指定时刻之后创建的采购单数（补货单号流水用）。 */
  countPurchaseOrdersCreatedSince(org: ErpOrgKey, since: Date): Promise<number>;
  /** 已入库（RECEIVED）的采购单 id 去重集合。 */
  listReceivedOrderIds(
    org: ErpOrgKey,
    purchaseOrderIds: number[],
  ): Promise<number[]>;

  // ---- 应收应付 ----
  /** 逾期应收清单（OPEN/PARTIAL/OVERDUE 且 dueDate 早于给定日）。 */
  listOverdueReceivables(
    org: ErpOrgKey,
    dueBefore: string,
    limit?: number,
  ): Promise<ErpReceivableOverdueRow[]>;
  /** 逾期应付清单。 */
  listOverduePayables(
    org: ErpOrgKey,
    dueBefore: string,
    limit?: number,
  ): Promise<ErpPayableOverdueRow[]>;
  /** 按合同挂账的应收读数（contractId 命中或 CONTRACT 来源命中）。 */
  listReceivablesByContracts(
    org: ErpOrgKey,
    contractIds: number[],
  ): Promise<ErpReceivableContractRow[]>;
  /** 按来源单据找应收（合同回款计划幂等分支的读数）。 */
  findReceivableBySource(
    org: ErpOrgKey,
    sourceType: string,
    sourceId: number,
  ): Promise<ErpReceivableRefRow | null>;
  /** 指定采购单来源应付的已付金额合计。 */
  sumPaidByPurchaseOrders(
    org: ErpOrgKey,
    purchaseOrderIds: number[],
  ): Promise<number>;
  /** 全部「采购单」来源应付（非取消），对账聚合用。 */
  listPurchaseOrderPayables(org: ErpOrgKey): Promise<ErpPayableSourceRow[]>;
  /** 按来源单据找应付（合作验收回写/取消的读数）。 */
  findPayableBySource(
    org: ErpOrgKey,
    sourceType: string,
    sourceId: number,
  ): Promise<ErpPayableRefRow | null>;
  /** 应付单总数（单号流水用）。 */
  countPayables(org: ErpOrgKey): Promise<number>;
}

/** 漏装配只喊一次：装配缺陷是系统性的，不需要每个请求都刷日志。 */
let warnedUnwired = false;

/**
 * 装配漏传端口时的兜底：**构造期就喊出来**，不许静默。
 *
 * noop 的空值渲染成页面上的「没有逾期应收 / 没有库存预警」，和「ERP 读不到」长得一模一样，
 * 没人会去查——这类缺陷只在事故后被发现。生产装配始终显式传 `erpReadPort`
 * （`http/services.ts`），这里防的是新增调用点忘了传参。
 */
export function unwiredErpPort(): ErpPort {
  if (!warnedUnwired) {
    warnedUnwired = true;
    new Logger('ErpPort').error(
      'ErpPort 未装配（用到 noop 兜底）：ERP 读数会全部按空值渲染，页面看起来是「没有异常」而不是「读不到」。请在装配层显式注入 erpReadPort。',
    );
  }
  return noopErpPort;
}

/** ERP 未接入时注入的实现：全部空转返回安全空值，调用方按「无数据」渲染。 */
export const noopErpPort: ErpPort = {
  listStock: () => Promise.resolve([]),
  listVariants: () => Promise.resolve([]),
  getProductTaxRate: () => Promise.resolve(0),
  listVendors: () => Promise.resolve([]),
  findVendorByName: () => Promise.resolve(null),
  findActiveVendor: () => Promise.resolve(null),
  listPurchaseOrdersByProject: () => Promise.resolve([]),
  listPurchaseOrdersForReconcile: () => Promise.resolve([]),
  findReplenishmentOrder: () => Promise.resolve(null),
  countPurchaseOrdersCreatedSince: () => Promise.resolve(0),
  listReceivedOrderIds: () => Promise.resolve([]),
  listOverdueReceivables: () => Promise.resolve([]),
  listOverduePayables: () => Promise.resolve([]),
  listReceivablesByContracts: () => Promise.resolve([]),
  findReceivableBySource: () => Promise.resolve(null),
  sumPaidByPurchaseOrders: () => Promise.resolve(0),
  listPurchaseOrderPayables: () => Promise.resolve([]),
  findPayableBySource: () => Promise.resolve(null),
  countPayables: () => Promise.resolve(0),
};
