import type { Context, Input, MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../http/types';
import {
  isLaunchGateAllowed,
  toolCodeForAdminPath,
} from './tool-launch.catalog';
import type { ToolLaunchService } from './tool-launch.service';

/** 与 feature-gate 同规则：先去掉内部转发前缀再匹配（不能反向 import app，避免环依赖）。 */
const stripBackend = (path: string) =>
  path.replace(/^\/api\/backend(?=\/|$)/, '') || '/';

/**
 * 建站工具启动闸门（管理端）：未启动 / 欠费停服 / 平台停用期间，
 * 该工具域下的**写操作**一律拒绝，读与导出照常——配置只读，数据不丢。
 *
 * 三条刻意的设计：
 * 1. 只拦写：`GET/HEAD/OPTIONS` 直接放行，页面要能进去看到「为什么不能用」；
 * 2. 放行名单（`LAUNCH_GATE_ALLOW_PREFIXES`）含充值与启动设置本身，
 *    否则欠费停服的账号连充值自救都会被自己挡在门外；
 * 3. 按前缀归属工具，新增接口不需要改这里（前缀即边界，与功能开关同一套映射口径）。
 */
export function toolLaunchGateMiddleware(
  launch: ToolLaunchService,
): MiddlewareHandler<ApiEnv> {
  return async (c: Context<ApiEnv, string, Input>, next) => {
    const user = c.get('user');
    if (!user) return next();
    const method = c.req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }
    const path = stripBackend(c.req.path);
    if (isLaunchGateAllowed(path)) return next();
    const code = toolCodeForAdminPath(path);
    if (!code) return next();
    await launch.blockIfStopped(code, user.userId);
    return next();
  };
}
