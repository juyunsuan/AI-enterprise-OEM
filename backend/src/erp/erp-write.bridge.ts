/**
 * ERP 写侧端口的实现：跨域单据写入统一收在这里（`erp/erp-write-port.ts` 讲为什么要收）。
 *
 * 三条实现纪律，都是这一批改造要修掉的历史问题：
 * 1. **号源只有一处**：单号一律走 `erp-invariants.erpDocCode` + 当日计数，
 *    与 `ErpService` 完全同口径。原先项目侧用全量计数、ERP 侧用当日计数，
 *    同一个 `YF-` 前缀两套号，而表上没有唯一索引——重码不报错，只对账时对不上。
 * 2. **更新自证归属**：所有更新都是 `where: { id, orgType, orgUserId }` + `count===0 抛错`，
 *    与 `ErpService.requireOwnedRow()` 同一口径（管理员身份不能替代目标记录的组织校验）。
 *    跨域那几处原代码是 `update({ where: { id } })`，防线只在「前面那次读数带了组织条件」。
 * 3. **写侧不降级**：任何一步失败都如实抛出，返回给调用方去留痕；读端口那种
 *    「超时折算空值」在这里是事故（流程走完但单据没落地）。
 */

import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { clip } from '../hrm/hrm.helpers';
import type { HrmOrg } from '../hrm/hrm.scope';
import type {
  ErpPayableCancelOutcome,
  ErpPayableSyncInput,
  ErpReceivableSyncInput,
  ErpReplenishmentInput,
  ErpReplenishmentResult,
  ErpWritePort,
} from './erp-write-port';
import type { ErpOrgKey, ErpPort } from './erp-port';
import {
  erpDocCode,
  erpToday,
  erpTodayStart,
  nextApprovalStatus,
} from './erp-invariants';

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** 含税金额与税额：与 `ErpService` 采购闭环同样的两位小数口径。 */
const money = (value: number): number => Math.round(value * 100) / 100;

export class ErpWriteBridge implements ErpWritePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mechanisms: MechanismService,
    /** 读数复用读端口：SKU/税率/默认供应商/未关闭单据的判定口径不许有第二份。 */
    private readonly reads: ErpPort,
  ) {}

  async syncContractReceivable(
    org: HrmOrg,
    input: ErpReceivableSyncInput,
  ): Promise<number> {
    const amount = num(input.amount);
    if (amount <= 0) return 0;
    const key = this.key(org);
    const existing = await this.prisma.erpReceivable.findFirst({
      where: { ...key, sourceType: 'CONTRACT', sourceId: input.contractId },
      select: { id: true, status: true },
      orderBy: { id: 'asc' },
    });
    if (existing) {
      // 已作废的应收是财务的结论，跨域重新计提不许把它拉回在册状态
      if (existing.status === 'CANCELED') return existing.id;
      await this.updateOwned('应收单', () =>
        this.prisma.erpReceivable.updateMany({
          where: { id: existing.id, ...key },
          data: {
            amount,
            customerName: clip(input.customerName || '', 120),
            customerId: input.customerId,
          },
        }),
      );
      return existing.id;
    }
    const code = erpDocCode(
      'YS',
      await this.prisma.erpReceivable.count({
        where: { ...key, createdAt: { gte: erpTodayStart() } },
      }),
    );
    const created = await this.prisma.erpReceivable.create({
      data: {
        ...key,
        code,
        customerName: clip(input.customerName || '未命名客户', 120),
        customerId: input.customerId,
        contractId: input.contractId,
        sourceType: 'CONTRACT',
        sourceId: input.contractId,
        amount,
        dueDate: clip(input.dueDate || '', 16),
        note: clip(input.note || '', 500),
      },
      select: { id: true },
    });
    return created.id;
  }

  async syncSourcePayable(
    org: HrmOrg,
    input: ErpPayableSyncInput,
  ): Promise<number> {
    const amount = num(input.amount);
    if (amount <= 0) return 0;
    const key = this.key(org);
    const existing = await this.prisma.erpPayable.findFirst({
      where: { ...key, sourceType: input.sourceType, sourceId: input.sourceId },
      select: { id: true, status: true, amount: true, approvalStatus: true },
      orderBy: { id: 'asc' },
    });
    if (existing) {
      if (existing.status === 'CANCELED') return existing.id;
      // 金额变了必须重算审批态：跨域改小大额应付不能绕过财务审批
      const approvalStatus = nextApprovalStatus(
        amount,
        existing.approvalStatus,
        num(existing.amount),
      );
      await this.updateOwned('应付单', () =>
        this.prisma.erpPayable.updateMany({
          where: { id: existing.id, ...key },
          data: { amount, approvalStatus },
        }),
      );
      return existing.id;
    }
    const code = erpDocCode(
      'YF',
      await this.prisma.erpPayable.count({
        where: { ...key, createdAt: { gte: erpTodayStart() } },
      }),
    );
    const created = await this.prisma.erpPayable.create({
      data: {
        ...key,
        code,
        vendorId: input.vendorId,
        sourceType: clip(input.sourceType, 32),
        sourceId: input.sourceId,
        amount,
        dueDate: clip(input.dueDate || erpToday(), 16),
        approvalStatus: nextApprovalStatus(amount, 'NONE'),
        note: clip(input.note || '', 500),
      },
      select: { id: true },
    });
    return created.id;
  }

  async cancelSourcePayable(
    org: HrmOrg,
    sourceType: string,
    sourceId: number,
    contextNote?: string,
  ): Promise<ErpPayableCancelOutcome> {
    const key = this.key(org);
    const row = await this.prisma.erpPayable.findFirst({
      where: { ...key, sourceType, sourceId },
      select: { id: true, status: true, paidAmount: true, note: true },
      orderBy: { id: 'asc' },
    });
    if (!row) return 'ABSENT';
    if (row.status === 'CANCELED') return 'ALREADY_CANCELED';
    // 已有付款（含部分付款）的应付不能静默取消：账已经动了，只有财务冲销后才能作废。
    // 但「不取消」不能只体现为调用方拿到一个布尔值——上游业务状态已经改完了，
    // 没人回头看返回值就会留下「合作已取消、应付还在册」的分叉。所以留痕写在这里：
    // 单据自己带着待处理的说明，财务台账上能查到，不依赖调用方自觉。
    if (num(row.paidAmount) > 0) {
      const reason = contextNote || `来源 ${sourceType}#${sourceId} 已取消`;
      const trail = `待财务冲销：${reason}，本单已付 ${num(row.paidAmount)}，应付未作废`;
      // 追加而不是覆盖：原备注是业务写下的验收说明，财务痕迹只是补一句。
      // 同一条痕迹不重复写（同一来源被反复取消时不能把备注越刷越长）。
      if (!row.note.includes(trail)) {
        await this.updateOwned('应付单', () =>
          this.prisma.erpPayable.updateMany({
            where: { id: row.id, ...key },
            data: {
              note: clip(`${row.note ? `${row.note}｜` : ''}${trail}`, 500),
            },
          }),
        );
      }
      return 'HAS_PAYMENT';
    }
    await this.updateOwned('应付单', () =>
      this.prisma.erpPayable.updateMany({
        where: { id: row.id, ...key },
        data: { status: 'CANCELED' },
      }),
    );
    return 'CANCELED';
  }

  async ensureReplenishmentOrder(
    org: HrmOrg,
    input: ErpReplenishmentInput,
  ): Promise<ErpReplenishmentResult | null> {
    const key = this.key(org);
    const open = await this.reads.findReplenishmentOrder(key, input.sourceNo);
    if (open)
      return { orderId: open.id, orderNo: open.orderNo, created: false };
    const [variant] = await this.reads.listVariants(key, [input.variantId]);
    if (!variant) return null;
    const quantity = Math.max(1, Math.round(num(input.quantity, 1)));
    const price = variant.purchasePrice;
    const amount = money(quantity * price);
    const taxRate = await this.reads.getProductTaxRate(key, variant.productId);
    const taxAmount = money((amount * taxRate) / 100);
    const vendor = await this.reads.findActiveVendor(key);
    const orderNo = erpDocCode(
      'CG',
      await this.reads.countPurchaseOrdersCreatedSince(key, erpTodayStart()),
    );
    const created = await this.prisma.erpPurchaseOrder.create({
      data: {
        ...key,
        orderNo,
        vendorId: vendor?.id || 0,
        projectId: 0,
        sourceType: 'STOCK_LOW',
        sourceNo: clip(input.sourceNo, 64),
        warehouseId: input.warehouseId,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku || '',
            quantity,
            price,
          },
        ],
        amount,
        taxAmount,
        expectedAt: '',
        note: clip(
          `库存低于补货点自动生成：${input.reason || variant.name || variant.sku || ''}`,
          500,
        ),
        // 正式采购申请：仍需采购审批后才能收货（docs §8.4 完成依据）
        status: 'PENDING',
        createdBy: org.actorId || org.orgUserId,
      },
      select: { id: true, orderNo: true, amount: true },
    });
    // 事件由 ERP 域自己发（与 ErpService.savePurchaseOrder 同一条），调用方不再各发一份。
    // 金额取自己算出来的那份，不依赖 create 回读的 select——替身或驱动少回一个字段
    // 就会把事件里的金额写成 NaN。
    void this.mechanisms
      .dispatch(org, 'erp.purchase.created', {
        orderId: created.id,
        orderNo: created.orderNo,
        amount: amount.toFixed(2),
        source: 'STOCK_LOW',
      })
      .catch(() => undefined);
    return { orderId: created.id, orderNo: created.orderNo, created: true };
  }

  private key(org: HrmOrg): ErpOrgKey {
    return { orgType: org.orgType, orgUserId: org.orgUserId };
  }

  /**
   * 归属自证的更新：查不到（或不属于本组织）就是 0 行——按「单据不存在」抛出，
   * 而不是静默成功。管理员身份不能替代目标记录的组织校验（设计方案 §3.3）。
   */
  private async updateOwned(
    label: string,
    run: () => Promise<{ count: number }>,
  ): Promise<void> {
    const changed = await run();
    if (changed.count > 0) return;
    throw new BusinessException(
      ErrorCode.NOT_FOUND,
      `${label}不存在或不属于当前组织，写入已终止（请按刷新后重试处理）`,
    );
  }
}
