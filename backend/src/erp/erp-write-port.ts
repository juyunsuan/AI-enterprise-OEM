/**
 * ERP 写侧端口：跨域要落 ERP 单据（合同→应收、外部合作验收→应付、库存预警→补货采购单）
 * 时只依赖这个接口，不再在别人的模块里 `prisma.erp*` 直写。
 *
 * 为什么必须有这一层（对齐 `erp-port.ts` 的读侧收口）：
 * - **单据不变量只该有一份**：单号流水、大额审批态、`erp.*` 事件、`createdBy` 口径、
 *   「已付款不许静默取消」原本散在 `erp.service.ts`；跨域直写等于把每条规则复制一份。
 *   历史上项目侧 `YF-` 用全量计数、ERP 侧用今日计数，同一前缀两套号源（表上无唯一索引，
 *   重码了没人看得见）；项目侧改应付金额不重算审批态，大额应付能被改小绕过财务审批。
 * - **归属必须自证**：跨域那几处 `update({ where: { id } })` 不带组织条件，安全全靠
 *   「前面那次读数带了组织过滤」。本端口的实现一律用 `(id + orgType + orgUserId)` 更新，
 *   调用方传错 id 也改不到别家的单据。
 * - **写失败不许吞**：读侧可以降级成空值，写侧降级就是「流程走完了但单据没落地」，
 *   所以实现一律如实抛出；调用方要兜底也必须留痕（见 `docs/架构优化落地执行方案（校准修订版）.md` §七）。
 *
 * 参数用 `HrmOrg` 而不是读侧的 `ErpOrgKey`：写单据必然有操作人（`createdBy`、事件广播都要），
 * 而调用方（增长扫描 / 项目管理）本来就持有一个 `HrmOrg`。
 */

import type { HrmOrg } from '../hrm/hrm.scope';

/** 合同 → 应收：按 (sourceType=CONTRACT, sourceId) 幂等，重复触发只改金额不新增。 */
export type ErpReceivableSyncInput = {
  /** 合同 id，同时作为幂等键与 `contractId`。 */
  contractId: number;
  customerId: number;
  /** 客户名由调用方从 CRM 取（跨域读数不该发生在 ERP 单据实现里）。 */
  customerName: string;
  amount: number;
  /** 到期日 YYYY-MM-DD；空串按 ERP 默认（不到期提醒）。 */
  dueDate?: string;
  note?: string;
};

/** 来源单据 → 应付（外部合作验收、到货结算等）。 */
export type ErpPayableSyncInput = {
  sourceType: string;
  sourceId: number;
  /** 供应商 id：0 表示来源没挂供应商（沿用历史「先挂单后补主体」口径）。 */
  vendorId: number;
  amount: number;
  dueDate?: string;
  note?: string;
};

/** 取消应付的结果：没取消成功时的两种情况都必须能被调用方区分开。 */
export type ErpPayableCancelOutcome =
  'CANCELED' | 'ALREADY_CANCELED' | 'ABSENT' | 'HAS_PAYMENT';

/** 库存预警 → 补货采购单：调用方只给「哪个仓库、哪个 SKU、建议补多少」。 */
export type ErpReplenishmentInput = {
  warehouseId: number;
  variantId: number;
  /** 库存行的幂等键：`stock:${warehouseId}:${variantId}`。 */
  sourceNo: string;
  /** 建议补货量（实现侧按 1 兜底取整）。 */
  quantity: number;
  /** 预警详情文案，进采购单备注。 */
  reason?: string;
};

/** 补货单建单结果：`created=false` 表示复用了已有的未关闭单据（没重复建）。 */
export type ErpReplenishmentResult = {
  orderId: number;
  orderNo: string;
  created: boolean;
};

export interface ErpWritePort {
  /**
   * 合同回款 → 应收单。
   * 返回 `0` 表示金额不大于 0（原调用方语义：不计提）；已作废的应收不被复活，直接回原 id。
   */
  syncContractReceivable(
    org: HrmOrg,
    input: ErpReceivableSyncInput,
  ): Promise<number>;
  /**
   * 来源单据 → 应付单：单号走 ERP 的当日流水，金额变动一律重算大额审批态。
   * 返回 `0` 表示金额不大于 0；已作废的应付不被复活，直接回原 id。
   */
  syncSourcePayable(org: HrmOrg, input: ErpPayableSyncInput): Promise<number>;
  /**
   * 取消来源单据对应的应付，返回为什么没取消：
   * - `CANCELED`：已置作废；
   * - `ALREADY_CANCELED`：本来就是作废态（幂等）；
   * - `ABSENT`：这张来源单据没挂过应付；
   * - `HAS_PAYMENT`：**已有付款，不能静默取消**——此时实现侧会在应付备注上留一条
   *   待财务冲销的痕迹（用 `contextNote` 说明是谁触发的），调用方不需要、也不应该
   *   自己去写 `erp_payables`：闸门与留痕是 ERP 域的规矩，写第二份迟早与端口分叉。
   */
  cancelSourcePayable(
    org: HrmOrg,
    sourceType: string,
    sourceId: number,
    contextNote?: string,
  ): Promise<ErpPayableCancelOutcome>;
  /**
   * 库存预警 → 补货采购单（PENDING，仍需采购审批）。
   * 单号、税率、含税金额、默认供应商、`erp.purchase.created` 事件都在实现侧补齐；
   * 同一 `sourceNo` 已有未关闭采购单时直接复用，重复扫描不会长出第二张单。
   * 返回 `null` 表示 SKU 在本组织下不存在（无货可补）。
   */
  ensureReplenishmentOrder(
    org: HrmOrg,
    input: ErpReplenishmentInput,
  ): Promise<ErpReplenishmentResult | null>;
}

/**
 * 写侧端口未装配时的实现：**一律抛错**，绝不空转。
 *
 * 读端口返回空值只是「页面显示没有数据」；写端口空转就是「项目已验收、台账上没有应付单」
 * 这种账实分叉，而且没有任何人收到提醒。装配缺失必须在第一次写单时炸出来。
 */
export const failingErpWritePort: ErpWritePort = {
  syncContractReceivable: () => {
    throw new Error('ERP 写侧端口未装配（syncContractReceivable）');
  },
  syncSourcePayable: () => {
    throw new Error('ERP 写侧端口未装配（syncSourcePayable）');
  },
  cancelSourcePayable: () => {
    throw new Error('ERP 写侧端口未装配（cancelSourcePayable）');
  },
  ensureReplenishmentOrder: () => {
    throw new Error('ERP 写侧端口未装配（ensureReplenishmentOrder）');
  },
};
