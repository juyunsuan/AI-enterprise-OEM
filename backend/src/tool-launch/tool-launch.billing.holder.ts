import type { ToolLaunchBillingService } from './tool-launch.billing.service';
import type { ToolCode } from './tool-launch.catalog';

/**
 * 启动计费的晚绑定入口：`stop()` 需要在用户停止时结算本期已产生的按量用量，
 * 但 `ToolLaunchService` 与 `ToolLaunchBillingService` 是双向依赖（日批依赖前者做闸门），
 * 直接构造会成环。与 `tool-launch.holder` 同一手法：装配期绑定一次，未绑定时放行。
 */
let billing: ToolLaunchBillingService | null = null;

export function bindToolLaunchBilling(service: ToolLaunchBillingService) {
  billing = service;
}

export async function settleUsageOnStop(
  userId: string,
  code: ToolCode,
  now = new Date(),
): Promise<void> {
  if (!billing) return;
  await billing.settleUsageBeforeStop(userId, code, now);
}
