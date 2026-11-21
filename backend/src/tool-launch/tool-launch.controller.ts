import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { ToolLaunchPricingSaveBody } from '@enterprise/contracts';
import type { ToolCode } from './tool-launch.catalog';
import type { ToolLaunchService } from './tool-launch.service';
import type { ToolLaunchAdminService } from './tool-launch.admin.service';
import type { ToolLaunchState } from './tool-launch.service';

/**
 * 启动设置控制器：契约 `ToolLaunch_*` / `ToolLaunchAdmin_*` 由 moduleHandlers 自动派发，
 * 参数顺序固定「user → 路径参 → query → 请求体」，返回值不套信封。
 *
 * 台账里的日期一律序列化成 ISO 字符串（缺期次给 null），前端不需要再猜时区。
 */

const iso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

function serializeState(state: ToolLaunchState) {
  return {
    toolCode: state.toolCode,
    name: state.name,
    path: state.path,
    launchPath: state.launchPath,
    summary: state.summary,
    ownBilling: state.ownBilling,
    status: state.status,
    stopReason: state.stopReason,
    startedAt: iso(state.startedAt),
    stoppedAt: iso(state.stoppedAt),
    trialEndsAt: iso(state.trialEndsAt),
    cycleDays: state.cycleDays,
    unitPrice: state.unitPrice,
    periodStart: iso(state.periodStart),
    periodEnd: iso(state.periodEnd),
    billedPeriods: state.billedPeriods,
    arrearsSince: iso(state.arrearsSince),
    offBy: state.offBy,
    offReason: state.offReason,
    plan: state.plan,
    open: state.open,
    nextChargeAt: iso(state.nextChargeAt),
    nextChargeAmount: state.nextChargeAmount,
  };
}

export class ToolLaunchController {
  constructor(private readonly launch: ToolLaunchService) {}

  async states(user: CurrentUser) {
    const rows = await this.launch.states(user.userId);
    return rows.map(serializeState);
  }

  async detail(user: CurrentUser, query: { tool: ToolCode }) {
    const detail = await this.launch.detail(user.userId, query.tool);
    return {
      ...detail,
      state: serializeState(detail.state),
      bills: detail.bills.map((bill) => ({
        ...bill,
        periodStart: iso(bill.periodStart) || '',
        periodEnd: iso(bill.periodEnd) || '',
      })),
    };
  }

  async start(user: CurrentUser, body: { tool: ToolCode }) {
    // 启动即扣主账号积分，子账号无权代主账号花钱（停止不扣钱，不限制）
    if (user.isSubAccount()) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '启动会立即扣减本账号积分，请由主账号在「启动设置」页操作',
      );
    }
    return serializeState(
      await this.launch.start(
        user.userId,
        body.tool,
        user.username || user.userId,
      ),
    );
  }

  async stop(user: CurrentUser, body: { tool: ToolCode }) {
    return serializeState(await this.launch.stop(user.userId, body.tool));
  }
}

export class ToolLaunchAdminController {
  constructor(
    private readonly admin: ToolLaunchAdminService,
    private readonly launch: ToolLaunchService,
    private readonly requireAdmin: (user: CurrentUser) => void,
  ) {}

  async overview(user: CurrentUser) {
    this.requireAdmin(user);
    return this.admin.overview();
  }

  async savePricing(user: CurrentUser, body: ToolLaunchPricingSaveBody) {
    this.requireAdmin(user);
    return this.admin.savePricing(body, user.userId);
  }

  async savePolicy(user: CurrentUser, body: Record<string, unknown>) {
    this.requireAdmin(user);
    const policy = await this.admin.savePolicy(user, body);
    return {
      graceHours: policy.graceHours,
      transitionDays: policy.transitionDays,
      suspendOnArrears: policy.suspendOnArrears,
      legacyAnchor: policy.legacyAnchor,
    };
  }

  async subscriptions(
    user: CurrentUser,
    query: Parameters<ToolLaunchAdminService['subscriptions']>[0],
  ) {
    this.requireAdmin(user);
    return this.admin.subscriptions(query);
  }

  /** 人工停用 / 恢复：欠费自动复活不覆盖平台处置，反向也一样。 */
  async toggle(
    user: CurrentUser,
    body: { user: string; tool: ToolCode; off: boolean; reason?: string },
  ) {
    this.requireAdmin(user);
    const target = await this.admin.resolveTargetUser(body.user);
    const state = await this.launch.platformToggle(
      target,
      body.tool,
      body.off,
      user.userId,
      body.reason || (body.off ? '平台停用' : ''),
    );
    return serializeState(state);
  }
}
