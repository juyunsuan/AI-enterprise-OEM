"use client";

import { Button, Space } from "antd";
import { useRouter } from "next/navigation";
import { Alert } from "antd";
import type { ToolLaunchCode } from "@enterprise/contracts";
import { findToolLaunch, formatDateTime, useToolLaunchStates } from "@/lib/tool-launch";

/**
 * 工具页顶部的启动横幅：只在「不是完全可用」时出现，说清三件事——
 * 现在什么状态、顾客端会怎样、下一步点哪里。运行中不打扰。
 *
 * 状态读的是与卡片页同一份 `ToolLaunch_states`，绝不在这再算一套判定。
 */
export function ToolLaunchBanner({ tool }: { tool: ToolLaunchCode }) {
  const router = useRouter();
  const { states, loaded, failed, reload } = useToolLaunchStates();
  if (!loaded) return null;
  const state = findToolLaunch(states, tool);
  if (!state) {
    // 一个状态都没拿到还什么都不说，等于告诉用户「一切正常」——欠费停服的人会错过恢复时机。
    if (!failed) return null;
    return (
      <Alert
        type="warning"
        showIcon
        message="启动状态没取到"
        description="网络或后端暂时读不到这个工具的启动状态，当前展示可能不是最新；稍后重试即可。"
        action={
          <Button size="small" onClick={() => void reload()}>
            重试
          </Button>
        }
      />
    );
  }
  if (state.status === "ACTIVE") return null;

  const go = () => router.push(`/site-builder/launch?tool=${tool}`);
  const detail = state.ownBilling
    ? "站内配置只读（国际独立站的积分按站点月账出账）。"
    : "顾客端已停服，站内配置只读；源码包仍可随时下载。";

  if (state.status === "ARREARS") {
    return (
      <Alert
        type="warning"
        showIcon
        message="积分欠费宽限中"
        description={`补齐后自动恢复营业；宽限截止前未补齐将自动停服。欠费起算：${formatDateTime(
          state.arrearsSince,
        )}。`}
        action={
          <Space size={6}>
            <Button size="small" type="primary" onClick={() => router.push("/points")}>
              去充值
            </Button>
            <Button size="small" onClick={go}>
              查看计费规则
            </Button>
          </Space>
        }
      />
    );
  }
  if (state.status === "TRIAL") {
    return (
      <Alert
        type="info"
        showIcon
        message="免费过渡期内"
        description={`存量站点默认已启动，不扣积分。过渡期截止 ${formatDateTime(
          state.trialEndsAt,
        )}，之后按平台配置的口径自动出账。`}
        action={
          <Button size="small" onClick={go}>
            查看计费规则
          </Button>
        }
      />
    );
  }
  const arrears = state.stopReason === "ARREARS";
  const platform = state.stopReason === "PLATFORM";
  return (
    <Alert
      type="error"
      showIcon
      message={platform ? "平台已暂停该工具" : arrears ? "欠费已停服" : "该工具尚未启动"}
      description={
        platform
          ? state.offReason || detail
          : `${detail}未启动期间不扣积分，启动后自动恢复。${
              arrears ? "请先充值再启动。" : ""
            }`
      }
      action={
        arrears ? (
          <Space size={6}>
            <Button size="small" type="primary" onClick={() => router.push("/points")}>
              去充值
            </Button>
            <Button size="small" onClick={go}>
              启动设置
            </Button>
          </Space>
        ) : (
          <Button size="small" type="primary" onClick={go}>
            查看计费规则并启动
          </Button>
        )
      }
    />
  );
}
