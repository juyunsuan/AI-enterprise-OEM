/**
 * ERP 单据口径的唯一实现：见 `erp-invariants.ts` 顶部的说明。
 *
 * 原先这几条规则私有在 `erp.service.ts` 里，跨域写单的项目侧无法复用，只能自己抄一套，
 * 抄出来的两份从 2026-11 起就已经不一致（号源、审批态）。所有单据写路径都应 import 这里。
 */

import type { HrmOrg } from '../hrm/hrm.scope';

/** 今天（UTC 日期串），与既有单据的日期口径一致。 */
export const erpToday = (): string => new Date().toISOString().slice(0, 10);

/** 今天零点：单号流水的计数窗口起点（同一天的单据共享一段流水号）。 */
export const erpTodayStart = (): Date => new Date(`${erpToday()}T00:00:00Z`);

/**
 * 大额付款审批阈值（docs §5.3 采购闭环「付款审批」）：
 * 与 OA「付款申请」模板的大额二次确认同一口径（5 万元）；
 * 应付金额达到该值的应付单需财务审批通过后才可登记付款，低额直接付款。
 */
export const PAYMENT_APPROVAL_THRESHOLD = 50000;

/**
 * 金额变动后的审批态：
 * - 低于阈值：无需审批；
 * - 已审批通过且金额没上调：维持 APPROVED（改小不该把已批的单据打回重审）；
 * - 其余（新单、金额上调、从别态变成大额）：待付款审批。
 */
export function nextApprovalStatus(
  amount: number,
  current: string,
  previousAmount?: number,
): string {
  if (amount < PAYMENT_APPROVAL_THRESHOLD) return 'NONE';
  if (
    current === 'APPROVED' &&
    previousAmount !== undefined &&
    amount <= previousAmount
  ) {
    return 'APPROVED';
  }
  return 'PENDING';
}

/**
 * 单据号：`前缀-YYYYMMDD-当日序号`。
 * `count` 必须是**当日**已开张数（不是全量计数），否则跨天序号会跳、同日会重码；
 * 表上没有唯一索引，重码不会报错，只会让对账对不上。
 */
export function erpDocCode(prefix: string, count: number): string {
  const stamp = erpToday().replace(/-/g, '');
  return `${prefix}-${stamp}-${String(count + 1).padStart(4, '0')}`;
}

/** 组织键（写单据时与 `ErpService.orgKey()` 同口径落 orgType/orgUserId）。 */
export function erpOrgOf(org: HrmOrg): { orgType: string; orgUserId: string } {
  return { orgType: org.orgType, orgUserId: org.orgUserId };
}
