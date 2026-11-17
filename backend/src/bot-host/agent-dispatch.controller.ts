import type { CurrentUser } from '../auth/current-user';
import { AgentDispatchService } from './agent-dispatch.service';

/**
 * Agent 群控页签的界面侧接口（登录态）。方法名与 `AgentDispatch_*` 端点后缀一一对应，
 * 由 automation-routes 的 `moduleHandlers('AgentDispatch_', ...)` 按参数顺序自动派发
 * （user → 路径参数 → 查询 → 请求体）。
 */
export class AgentDispatchController {
  constructor(private readonly service: AgentDispatchService) {}

  async devices(user: CurrentUser, query?: Record<string, unknown>) {
    return this.service.devices(user, {
      kind: query?.kind as string | undefined,
    });
  }

  async tasks(user: CurrentUser, query?: Record<string, unknown>) {
    return this.service.tasks(user, query || {});
  }

  async taskDetail(
    user: CurrentUser,
    id: string,
    query?: Record<string, unknown>,
  ) {
    return this.service.taskDetail(user, id, {
      type: query?.type as 'command' | 'schedule' | undefined,
    });
  }

  async scheduleStatus(
    user: CurrentUser,
    id: string,
    body?: Record<string, unknown>,
  ) {
    return this.service.scheduleStatus(user, id, {
      status: body?.status as string | undefined,
    });
  }
}
