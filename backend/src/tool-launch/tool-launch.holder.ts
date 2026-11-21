import { Logger } from '../common/logger';
import type { ToolCode } from './tool-launch.catalog';
import type { ToolLaunchService } from './tool-launch.service';

/**
 * 启动闸门的取用入口（公开通道与出包链路的晚绑定）。
 *
 * 为什么用装配期晚绑定而不是给 9 个模块各加一个构造参数：
 * 闸门是横切的（与 `MpMarketService.deskSiteHook` 同一手法），
 * 9 条通道 × 若干构造点全量改签名，收益远小于噪音；绑定动作就在 `createServices` 里做一次。
 *
 * 未绑定时：管理端与出包按「放行」处理并只告警一次——启动功能是新增闸门，
 * 装配漏绑绝不应该把已在营业的小程序当场打死。前缀归属与放行规则由
 * `tool-launch-gate.spec.ts` 守住，漏绑会在日志里以 warn 暴露。
 */
let holder: ToolLaunchService | null = null;
let warned = false;

const logger = new Logger('ToolLaunchGate');

export function bindToolLaunch(service: ToolLaunchService) {
  holder = service;
}

export function toolLaunch(): ToolLaunchService | null {
  if (!holder && !warned) {
    warned = true;
    logger.warn(
      '启动闸门未绑定：跳过工具级拦截（请检查 createServices 里的 bindToolLaunch）',
    );
  }
  return holder;
}

/**
 * C 端一行式判定：闸门没绑定（装配遗漏）或工具确已启动都算可用。
 * 公开通道要的是「能不能继续服务顾客」，不是抛错，所以判定收敛成布尔值。
 */
export async function toolOpen(
  code: ToolCode,
  ownerUserId: string,
): Promise<boolean> {
  const launch = toolLaunch();
  return !launch || (await launch.availableForPublic(code, ownerUserId));
}
