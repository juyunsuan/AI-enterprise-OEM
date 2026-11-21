import type { PrismaService } from '../prisma/prisma.service';
import type {
  ErpOrgKey,
  ErpPayableOverdueRow,
  ErpPayableRefRow,
  ErpPayableSourceRow,
  ErpPort,
  ErpPurchaseOrderBriefRow,
  ErpPurchaseOrderRow,
  ErpReceivableContractRow,
  ErpReceivableOverdueRow,
  ErpReceivableRefRow,
  ErpReplenishmentOrderRow,
  ErpStockQuery,
  ErpStockRow,
  ErpVariantRow,
  ErpVendorRow,
} from './erp-port';

/**
 * `ErpPort` 的真实实现：ERP 域内的只读桥。
 *
 * 铁律（与 `commerce-core/scrm-port` 同一格子的做法）：
 * - 每个查询都必须带 (orgType, orgUserId) 组织条件，杜绝无 owner 过滤的全表读；
 *   历史上个别调用点（如按 id 取供应商、按 productId 取税率）没带组织条件，
 *   收口到桥后统一补上——越权 id 查不到就按「不存在」返回空值；
 * - 只读：不建单、不改单，写侧仍走 `ErpService` / 原链路；
 * - 超时与降级由调用方用 `withBridgeTimeout` 落地，桥本身如实抛数据库错误。
 */

/** Decimal（Prisma 十进制）折算为 number，空值按 0。 */
const n = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 逾期扫描的状态口径：OPEN/PARTIAL/OVERDUE 仍属未结清单据。 */
const OPEN_DOC_STATUSES = ['OPEN', 'PARTIAL', 'OVERDUE'];

/** 补货信号认作「在途」的采购单状态（与 docs §8.4 完成依据一致）。 */
const REPLENISHMENT_OPEN_STATUSES = ['PENDING', 'APPROVED', 'RECEIVING'];

/** 应收逾期扫描的默认取数上限（沿用收口前调用点的 take 值）。 */
const DEFAULT_LIMIT = 200;

export class ErpBridge implements ErpPort {
  constructor(private readonly prisma: PrismaService) {}

  // ---- 库存与商品主数据 ----

  async listStock(
    org: ErpOrgKey,
    query: ErpStockQuery = {},
  ): Promise<ErpStockRow[]> {
    if (query.variantIds && !query.variantIds.length) return [];
    const rows = await this.prisma.erpStock.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        ...(query.variantIds?.length
          ? { variantId: { in: query.variantIds } }
          : {}),
        ...(query.warehouseId === undefined
          ? {}
          : { warehouseId: query.warehouseId }),
        ...(query.onlyWithReorderPoint ? { reorderPoint: { gt: 0 } } : {}),
      },
      select: {
        warehouseId: true,
        variantId: true,
        onHand: true,
        reorderPoint: true,
      },
      ...(query.limit ? { take: query.limit } : {}),
    });
    return rows.map((row) => ({
      warehouseId: row.warehouseId,
      variantId: row.variantId,
      onHand: n(row.onHand),
      reorderPoint: n(row.reorderPoint),
    }));
  }

  async listVariants(
    org: ErpOrgKey,
    variantIds: number[],
  ): Promise<ErpVariantRow[]> {
    if (!variantIds.length) return [];
    const rows = await this.prisma.erpVariant.findMany({
      where: {
        id: { in: variantIds },
        orgType: org.orgType,
        orgUserId: org.orgUserId,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        productId: true,
        purchasePrice: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      productId: row.productId,
      purchasePrice: n(row.purchasePrice),
    }));
  }

  async getProductTaxRate(org: ErpOrgKey, productId: number): Promise<number> {
    if (!(productId > 0)) return 0;
    // 收口前这里是不带组织条件的 findUnique；补上组织过滤后越权 id 按 0 处理。
    const product = await this.prisma.erpProduct.findFirst({
      where: { id: productId, orgType: org.orgType, orgUserId: org.orgUserId },
      select: { taxRate: true },
    });
    return n(product?.taxRate);
  }

  // ---- 供应商 ----

  async listVendors(
    org: ErpOrgKey,
    vendorIds?: number[],
  ): Promise<ErpVendorRow[]> {
    // 收口前按 ids 取名没有组织条件；统一补上，越权 id 自然查不到。
    if (vendorIds && !vendorIds.length) return [];
    const rows = await this.prisma.erpVendor.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        ...(vendorIds?.length ? { id: { in: vendorIds } } : {}),
      },
      select: { id: true, name: true },
    });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async findVendorByName(
    org: ErpOrgKey,
    name: string,
  ): Promise<ErpVendorRow | null> {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const row = await this.prisma.erpVendor.findFirst({
      where: { orgType: org.orgType, orgUserId: org.orgUserId, name: trimmed },
      select: { id: true, name: true },
    });
    return row ? { id: row.id, name: row.name } : null;
  }

  async findActiveVendor(org: ErpOrgKey): Promise<ErpVendorRow | null> {
    const row = await this.prisma.erpVendor.findFirst({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: 'ACTIVE',
      },
      orderBy: { id: 'desc' },
      select: { id: true, name: true },
    });
    return row ? { id: row.id, name: row.name } : null;
  }

  // ---- 采购与入库 ----

  async listPurchaseOrdersByProject(
    org: ErpOrgKey,
    projectId: number,
  ): Promise<ErpPurchaseOrderBriefRow[]> {
    const rows = await this.prisma.erpPurchaseOrder.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        projectId,
        status: { not: 'CANCELED' },
      },
      select: { id: true, amount: true, status: true },
    });
    return rows.map((row) => ({
      id: row.id,
      amount: n(row.amount),
      status: row.status,
    }));
  }

  async listPurchaseOrdersForReconcile(
    org: ErpOrgKey,
  ): Promise<ErpPurchaseOrderRow[]> {
    const rows = await this.prisma.erpPurchaseOrder.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: { notIn: ['DRAFT', 'CANCELED'] },
      },
      select: {
        id: true,
        orderNo: true,
        vendorId: true,
        projectId: true,
        amount: true,
        taxAmount: true,
        status: true,
      },
      orderBy: { id: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      vendorId: row.vendorId,
      projectId: row.projectId,
      amount: n(row.amount),
      taxAmount: n(row.taxAmount),
      status: row.status,
    }));
  }

  async findReplenishmentOrder(
    org: ErpOrgKey,
    sourceNo: string,
  ): Promise<ErpReplenishmentOrderRow | null> {
    const row = await this.prisma.erpPurchaseOrder.findFirst({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        sourceType: 'STOCK_LOW',
        sourceNo,
        status: { in: REPLENISHMENT_OPEN_STATUSES },
      },
      orderBy: { id: 'desc' },
      select: { id: true, orderNo: true },
    });
    return row ? { id: row.id, orderNo: row.orderNo } : null;
  }

  async countPurchaseOrdersCreatedSince(
    org: ErpOrgKey,
    since: Date,
  ): Promise<number> {
    return this.prisma.erpPurchaseOrder.count({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        createdAt: { gte: since },
      },
    });
  }

  async listReceivedOrderIds(
    org: ErpOrgKey,
    purchaseOrderIds: number[],
  ): Promise<number[]> {
    if (!purchaseOrderIds.length) return [];
    const rows = await this.prisma.erpReceipt.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        purchaseOrderId: { in: purchaseOrderIds },
        status: 'RECEIVED',
      },
      select: { purchaseOrderId: true },
    });
    return [...new Set(rows.map((row) => row.purchaseOrderId))];
  }

  // ---- 应收应付 ----

  async listOverdueReceivables(
    org: ErpOrgKey,
    dueBefore: string,
    limit = DEFAULT_LIMIT,
  ): Promise<ErpReceivableOverdueRow[]> {
    const rows = await this.prisma.erpReceivable.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: { in: OPEN_DOC_STATUSES },
        dueDate: { lt: dueBefore },
      },
      select: {
        id: true,
        code: true,
        customerName: true,
        amount: true,
        receivedAmount: true,
        dueDate: true,
      },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      customerName: row.customerName,
      amount: n(row.amount),
      receivedAmount: n(row.receivedAmount),
      dueDate: row.dueDate,
    }));
  }

  async listOverduePayables(
    org: ErpOrgKey,
    dueBefore: string,
    limit = DEFAULT_LIMIT,
  ): Promise<ErpPayableOverdueRow[]> {
    const rows = await this.prisma.erpPayable.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: { in: OPEN_DOC_STATUSES },
        dueDate: { lt: dueBefore },
      },
      select: {
        id: true,
        code: true,
        vendorId: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
      },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      vendorId: row.vendorId,
      amount: n(row.amount),
      paidAmount: n(row.paidAmount),
      dueDate: row.dueDate,
    }));
  }

  async listReceivablesByContracts(
    org: ErpOrgKey,
    contractIds: number[],
  ): Promise<ErpReceivableContractRow[]> {
    if (!contractIds.length) return [];
    const rows = await this.prisma.erpReceivable.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: { not: 'CANCELED' },
        OR: [
          { contractId: { in: contractIds } },
          { sourceType: 'CONTRACT', sourceId: { in: contractIds } },
        ],
      },
      select: {
        contractId: true,
        sourceId: true,
        amount: true,
        receivedAmount: true,
      },
    });
    return rows.map((row) => ({
      contractId: row.contractId,
      sourceId: row.sourceId,
      amount: n(row.amount),
      receivedAmount: n(row.receivedAmount),
    }));
  }

  async findReceivableBySource(
    org: ErpOrgKey,
    sourceType: string,
    sourceId: number,
  ): Promise<ErpReceivableRefRow | null> {
    const row = await this.prisma.erpReceivable.findFirst({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        sourceType,
        sourceId,
      },
      select: { id: true, status: true, customerName: true },
    });
    return row
      ? { id: row.id, status: row.status, customerName: row.customerName }
      : null;
  }

  async sumPaidByPurchaseOrders(
    org: ErpOrgKey,
    purchaseOrderIds: number[],
  ): Promise<number> {
    if (!purchaseOrderIds.length) return 0;
    const rows = await this.prisma.erpPayable.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        sourceType: 'PURCHASE_ORDER',
        sourceId: { in: purchaseOrderIds },
      },
      select: { paidAmount: true },
    });
    return rows.reduce((total, row) => total + n(row.paidAmount), 0);
  }

  async listPurchaseOrderPayables(
    org: ErpOrgKey,
  ): Promise<ErpPayableSourceRow[]> {
    const rows = await this.prisma.erpPayable.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        sourceType: 'PURCHASE_ORDER',
        status: { not: 'CANCELED' },
      },
      select: { sourceId: true, amount: true, paidAmount: true },
    });
    return rows.map((row) => ({
      sourceId: row.sourceId,
      amount: n(row.amount),
      paidAmount: n(row.paidAmount),
    }));
  }

  async findPayableBySource(
    org: ErpOrgKey,
    sourceType: string,
    sourceId: number,
  ): Promise<ErpPayableRefRow | null> {
    const row = await this.prisma.erpPayable.findFirst({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        sourceType,
        sourceId,
      },
      select: { id: true, status: true, paidAmount: true },
    });
    return row
      ? { id: row.id, status: row.status, paidAmount: n(row.paidAmount) }
      : null;
  }

  async countPayables(org: ErpOrgKey): Promise<number> {
    return this.prisma.erpPayable.count({
      where: { orgType: org.orgType, orgUserId: org.orgUserId },
    });
  }
}
