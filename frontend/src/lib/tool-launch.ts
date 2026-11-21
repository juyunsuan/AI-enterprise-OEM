import { useCallback, useEffect, useState } from "react";
import type { ToolLaunchStateView } from "@enterprise/contracts";
import {
  TOOL_BILLING_CYCLE_LABELS,
  TOOL_LAUNCH_STATUS_LABELS,
  TOOL_STOP_REASON_LABELS,
} from "@enterprise/contracts";
import { toolLaunchApi } from "@/api/tool-launch";

/**
 * 启动状态读取与展示口径。
 *
 * 卡片页、各工具横幅、启动设置页三处共用同一份状态文案——
 * 同一个状态在三个地方叫法不一致，用户就会以为系统坏了。
 */

export type ToolLaunchSnapshot = {
  states: ToolLaunchStateView[];
  /** 首次读取是否已完成：未完成时页面显示骨架而不是「未启动」，避免误判成停服。 */
  loaded: boolean;
  /** 读取失败：卡片页与横幅要显式说「状态没取到」，不能默默显示成一切正常。 */
  failed: boolean;
  reload: () => Promise<void>;
};

export function useToolLaunchStates(): ToolLaunchSnapshot {
  const [states, setStates] = useState<ToolLaunchStateView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setStates((await toolLaunchApi.states()) || []);
      setFailed(false);
    } catch {
      // 读失败时保持旧值（不把已营业的工具误标成「未启动」），但要把「没取到」告知页面
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { states, loaded, failed, reload };
}

export function findToolLaunch(
  states: ToolLaunchStateView[],
  tool: string,
): ToolLaunchStateView | undefined {
  return states.find((item) => item.toolCode === tool);
}

/** 状态标签：颜色即语气，红色只在「已经影响营业」时用。 */
export function launchStatusTag(state: ToolLaunchStateView): {
  label: string;
  color: string;
} {
  const color =
    state.status === "ACTIVE"
      ? "green"
      : state.status === "TRIAL"
        ? "blue"
        : state.status === "ARREARS"
          ? "orange"
          : state.stopReason === "ARREARS" || state.stopReason === "PLATFORM"
            ? "red"
            : "default";
  // 「未启动 · 尚未启动」是同义反复：只有停服来路能补充信息时才拼上
  const reason =
    state.status === "STOPPED" && state.stopReason && state.stopReason !== "NOT_STARTED"
      ? TOOL_STOP_REASON_LABELS[state.stopReason]
      : "";
  const label = TOOL_LAUNCH_STATUS_LABELS[state.status] || state.status;
  return { label: reason ? `${label} · ${reason}` : label, color };
}

export function cycleLabel(cycle: string): string {
  return TOOL_BILLING_CYCLE_LABELS[cycle] || cycle;
}

export function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

/** 启动确认弹层要逐条讲清的话：全部取自后端 plan，不在前端另写一套口径。 */
export function launchTerms(state: ToolLaunchStateView): string[] {
  const { plan } = state;
  const terms: string[] = [];
  if (plan.cycle === "FREE" || !plan.billingEnabled) {
    terms.push("当前口径不扣积分：启动后随时可停止，数据始终保留。");
  } else {
    terms.push(
      `启动即扣首期 ${plan.unitPrice} 积分（${plan.cycleLabel}：${plan.unitPrice} 积分/${plan.unitLabel || plan.cycleLabel}）。`,
    );
    terms.push(
      `之后每 ${plan.cycleDays} 天到期自动续扣；停止或欠费停服后不再产生新账单。`,
    );
    if (plan.freePeriods > 0) {
      terms.push(`平台已配置启动后前 ${plan.freePeriods} 期免费。`);
    }
    if (plan.minCharge > 0) {
      terms.push(`单笔账单不低于 ${plan.minCharge} 积分起扣。`);
    }
  }
  terms.push(
    `余额不足会先进入欠费宽限 ${plan.graceHours} 小时，期间照常可用；超期自动停服，充值后自动补扣并恢复。`,
  );
  if (state.ownBilling) {
    terms.push(
      "国际独立站的积分按「站点数 × 自然月」由独立站账单出账，本页启动只是放行功能，不重复扣费。",
    );
  }
  if (plan.cycle === "USAGE_PV" || plan.cycle === "USAGE_BYTES") {
    terms.push(
      `平台配置的是${cycleLabel(plan.cycle)}口径（${plan.unitPrice} 积分/${
        plan.cycle === "USAGE_PV"
          ? `${plan.usageUnitSize} 次访问`
          : formatBytes(plan.usageUnitSize)
      }），当前只计量、暂不出账。`,
    );
  }
  return terms;
}
