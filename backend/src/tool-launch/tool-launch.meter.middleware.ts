import { Logger } from '../common/logger';
import { takeToolHit } from '../common/request-context';
import type { ApiEnv } from '../http/types';
import { TOOL_LAUNCH_CATALOG, type ToolCode } from './tool-launch.catalog';
import type { ToolLaunchMeterService } from './tool-launch.meter';
import type { MiddlewareHandler } from 'hono';

/**
 * 建站工具公开通道计量：把 PV 与响应字节按「站主 + 工具 + 自然日」累计。
 *
 * 归属人从闸门来（闸门放行时把命中的工具与站主记在请求上下文里，见 `markToolHit`），
 * 这样不必给 9 条通道各写一套解析。响应体只在 JSON 上量长度——图片与代码包这类
 * 大响应再克隆一次纯粹浪费内存，那部分按 0 计入，出账前会用网关侧真实流量口径替换。
 *
 * 计量与业务彻底解耦：任何异常一律吞掉，绝不因为「记了一笔访问」把顾客请求打断。
 */
export function toolLaunchMeterMiddleware(
  meter: ToolLaunchMeterService,
): MiddlewareHandler<ApiEnv> {
  const logger = new Logger('ToolLaunchMeter');
  return async (c, next) => {
    await next();
    const hit = takeToolHit();
    if (!hit) return;
    // 只计成功响应：按访问/按流量是要拿去出账的口径，探活、错路径、被风控挡掉的
    // 4xx/5xx 都算一次访问就等于虚增站主的账单。
    if (!c.res.ok) return;
    try {
      const bytes = await responseBytes(c.res);
      await meter.hit(hit.code as ToolCode, hit.userId, bytes);
    } catch (error) {
      logger.warn(
        `建站工具计量失败（${hit.code}）：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}

export const TOOL_LAUNCH_PUBLIC_PREFIXES = TOOL_LAUNCH_CATALOG.map(
  (item) => item.publicPrefix,
);

async function responseBytes(res: Response): Promise<number> {
  const declared = Number(res.headers.get('content-length') || '');
  if (Number.isFinite(declared) && declared > 0) return declared;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return 0;
  try {
    const body = await res.clone().arrayBuffer();
    return body.byteLength;
  } catch {
    return 0;
  }
}
