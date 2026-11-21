"use client";

import { App, Button, Space, Switch, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import type {
  MpScrmMerchantState,
  MpScrmReplayResult,
  MpScrmRetryResult,
  MpScrmState,
} from "@enterprise/contracts";
import { Notice, Panel, StatCard } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const SCRM_SETTING_PATH = "/marketing-tools?tab=wecom-scrm";

const REASON_LABELS: Record<string, string> = {
  OK: "已接通",
  FEATURE_CLOSED: "功能未开通",
  NOT_CONFIGURED: "未接入企业微信",
  UNAUTHORIZED: "授权已失效",
};

const REASON_COLORS: Record<string, string> = {
  OK: "green",
  FEATURE_CLOSED: "orange",
  NOT_CONFIGURED: "default",
  UNAUTHORIZED: "red",
};

export type MpScrmApiAdapter = {
  state: () => Promise<MpScrmState | MpScrmMerchantState | null>;
  toggle?: (enabled: boolean) => Promise<{ ok: boolean; message: string } | null>;
  retry?: () => Promise<MpScrmRetryResult | null>;
  replay?: () => Promise<MpScrmReplayResult | null>;
};

/**
 * 企微 SCRM 面板：市场运营方可以开关与手动补发；商户侧只读。
 *
 * 交易链路永不依赖 SCRM——关掉或没接好，下单、支付、退款照常，
 * 事件留在外发箱里等恢复后自动补发，所以文案不把「必须接入」说成前置条件。
 */
export function MpScrmPanel({
  title,
  api,
  readonly = false,
  ready = true,
}: {
  title: string;
  api: MpScrmApiAdapter;
  readonly?: boolean;
  ready?: boolean;
}) {
  const { message, modal } = App.useApp();
  const [state, setState] = useState<MpScrmState | MpScrmMerchantState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const next = await api.state();
      if (!next) throw new Error("对接状态读取失败");
      setState(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "对接状态读取失败");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return (
      <Panel title={title}>
        <Notice variant="info">店铺创建后才会开始记账顾客事件</Notice>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title={title}>
        <Notice variant="error">{error}</Notice>
      </Panel>
    );
  }

  if (!state) {
    return (
      <Panel title={title}>
        <span className="muted text-12">正在读取对接状态…</span>
      </Panel>
    );
  }

  const bridge = state.bridge;
  const pending = state.outbox.PENDING;
  const replayable = state.outbox.SKIPPED;

  const toggle = async (next: boolean) => {
    if (!api.toggle) return;
    setBusy("toggle");
    try {
      const result = await api.toggle(next);
      if (!result) throw new Error("操作失败，请稍后重试");
      message.success(result.message || (next ? "已开启" : "已关闭"));
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy("");
    }
  };

  const retry = async () => {
    if (!api.retry) return;
    setBusy("retry");
    try {
      const result = await api.retry();
      if (!result) throw new Error("投递失败，请稍后重试");
      message.success(result.message || "已重新排队");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "投递失败");
    } finally {
      setBusy("");
    }
  };

  const replay = () => {
    if (!api.replay) return;
    modal.confirm({
      title: `重投 ${replayable} 条跳过的事件`,
      content:
        "重投后这些事件会重新排队，按当前绑定关系再匹配一次企微客户。适合你刚在 SCRM 侧补完客户资料的情况。",
      okText: "确认重投",
      onOk: async () => {
        const result = await api.replay!();
        if (!result) throw new Error("重投失败，请稍后重试");
        message.success(result.message || "已重新排队");
        await load();
      },
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title={title}
        titleExtra={
          <Space size={6}>
            <Tag color={REASON_COLORS[bridge.reason]}>
              {REASON_LABELS[bridge.reason] ?? bridge.reason}
            </Tag>
            {bridge.ok ? (
              <span className="muted text-12">
                最近成功发送 {state.lastSentAt ? fmtTime(state.lastSentAt) : "还没有"}
              </span>
            ) : null}
          </Space>
        }
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {readonly ? (
            <span>
              {state.enabled
                ? "市场已开启企微事件外发：本店的付款、完成、退款、领券事件会异步写进客户时间线。开关归市场运营方，商户侧只读。"
                : "市场尚未开启企微事件外发；本店交易不受影响，接入后历史待发事件可补发。"}
            </span>
          ) : (
            <Space size={10} align="center">
              <Switch
                checked={state.enabled}
                loading={busy === "toggle"}
                onChange={(next) => void toggle(next)}
              />
              <span>
                {state.enabled
                  ? "已开启：各商户的订单付款/完成/退款与领券会异步写进企微客户时间线"
                  : "未开启：不产生任何外发事件，商城照常营业"}
              </span>
            </Space>
          )}
          {!bridge.ok && bridge.hint ? (
            <Notice variant={state.enabled ? "warn" : "info"}>
              {bridge.hint}
              <a href={SCRM_SETTING_PATH} target="_blank" rel="noreferrer">
                去接入企业微信
              </a>
            </Notice>
          ) : null}
          <span className="muted text-12">
            两个服务相互独立：关掉 SCRM 或没接好，下单、支付、退款都不受影响，
            事件会留在下面的外发箱里等恢复后自动补发。
          </span>
        </Space>
      </Panel>

      <Panel title="对接健康度">
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <StatCard label="可自动匹配" value={state.bindings.auto} hint="按 unionId 或手机号匹配成功" />
          <StatCard label="人工绑定" value={state.bindings.manual} hint="手动指定的客户" />
          <StatCard label="匹配不到" value={state.bindings.miss} hint="SCRM 里没有对应客户" />
          <StatCard label="待发送" value={pending} hint={pending ? "调度器每分钟投递一轮" : "外发箱已清空"} />
          <StatCard label="已发送" value={state.outbox.SENT} hint={state.lastSentAt ? fmtTime(state.lastSentAt) : "还没有"} />
          <StatCard label="已跳过" value={replayable} hint="匹配不到或超出补发窗口" />
          <StatCard label="失败终止" value={state.outbox.DEAD} hint="连续失败达到上限，不再自动重试" />
        </div>
      </Panel>

      {!readonly ? (
        <Panel
          title="手动补发"
          titleExtra={
            <span className="muted text-12">
              改完 SCRM 客户资料后不用等下一轮调度，这里可以立刻重试
            </span>
          }
        >
          <Space wrap size={8}>
            <Button
              type="primary"
              loading={busy === "retry"}
              disabled={!state.enabled || pending === 0}
              onClick={() => void retry()}
            >
              立即重试待发送（{pending}）
            </Button>
            <Button
              loading={busy === "replay"}
              disabled={!state.enabled || replayable === 0}
              onClick={replay}
            >
              一键重投已跳过（{replayable}）
            </Button>
            <a href={SCRM_SETTING_PATH} target="_blank" rel="noreferrer">
              打开企业微信 SCRM
            </a>
          </Space>
        </Panel>
      ) : null}
    </div>
  );
}
