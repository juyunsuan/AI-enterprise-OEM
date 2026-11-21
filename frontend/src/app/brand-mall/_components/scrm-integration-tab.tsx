"use client";
import { App, Button, Space, Switch, Tag } from "antd";
import {
  BRAND_SCRM_BRIDGE_REASON_LABELS,
  type BrandScrmBridgeReason,
} from "@enterprise/contracts";
import { Notice, Panel, StatCard } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useBrandScrmActions, useBrandScrmState } from "@/query/brand-mall";
import { ActionLink, dash } from "./brand-common";

/** SCRM 的接入页在营销工具里，这里只给跳转，不重复做一套企微配置表单。 */
const SCRM_SETTING_PATH = "/marketing-tools?tab=wecom-scrm";

const REASON_COLORS: Record<BrandScrmBridgeReason, string> = {
  OK: "green",
  FEATURE_CLOSED: "orange",
  NOT_CONFIGURED: "default",
  UNAUTHORIZED: "red",
};

/**
 * 店铺设置 · 企业微信对接。
 *
 * 这个页签只做三件事：开关、看健康度、手动补发。
 * 交易本身永远不依赖这里——关掉或没接好 SCRM，下单退款照常，
 * 事件留在外发箱里等恢复，所以页面文案要把这条说透，避免用户以为必须接。
 */
export function ScrmIntegrationTab({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const query = useBrandScrmState({ shopId });
  const actions = useBrandScrmActions();
  const state = query.data;

  if (query.isError) {
    return (
      <Panel title="企业微信对接">
        <Notice variant="error">
          对接健康度读取失败：{query.error.message || "请稍后重试"}
        </Notice>
      </Panel>
    );
  }
  if (!state) {
    return (
      <Panel title="企业微信对接">
        <span className="muted text-12">正在读取对接状态…</span>
      </Panel>
    );
  }

  const bridge = state.bridge;
  const pending = state.outbox.PENDING;
  const replayable = state.outbox.SKIPPED;

  const toggle = async (next: boolean) => {
    await actions.toggle.mutateAsync({ body: { shopId, enabled: next } });
    message.success(
      next
        ? "已开启：之后的注册、下单、退款等事件会异步写进企微客户时间线"
        : "已关闭：新事件不再产生，已排队的待发事件保留",
    );
  };

  const retry = async () => {
    const result = await actions.retry.mutateAsync({ body: { shopId } });
    message.success(result?.message || "已重新排队");
  };

  const replay = () => {
    modal.confirm({
      title: `重投 ${replayable} 条跳过的事件`,
      content:
        "重投后这些事件会重新排队，按当前绑定关系再匹配一次企微客户。适合你刚在 SCRM 侧补完客户资料的情况。",
      okText: "确认重投",
      onOk: async () => {
        const result = await actions.replay.mutateAsync({ body: { shopId } });
        message.success(result?.message || "已重新排队");
      },
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="对接开关"
        titleExtra={
          <Space size={6}>
            <Tag color={REASON_COLORS[bridge.reason]}>
              {BRAND_SCRM_BRIDGE_REASON_LABELS[bridge.reason]}
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
          <Space size={10} align="center">
            <Switch
              checked={state.enabled}
              loading={actions.toggle.isPending}
              onChange={(next) => void toggle(next)}
            />
            <span>
              {state.enabled
                ? "已开启：顾客注册、订单付款/完成/退款、领券会异步写进企微客户时间线"
                : "未开启：不产生任何外发事件，商城照常营业"}
            </span>
          </Space>
          {!bridge.ok && bridge.hint ? (
            <Notice variant={state.enabled ? "warn" : "info"}>
              {bridge.hint}
              {bridge.reason === "NOT_CONFIGURED" || bridge.reason === "UNAUTHORIZED" ? (
                <ActionLink path={SCRM_SETTING_PATH}>去接入企业微信</ActionLink>
              ) : null}
            </Notice>
          ) : null}
          <span className="muted text-12">
            两个服务相互独立：关掉 SCRM 或没接好，下单、支付、退款都不受影响，
            事件会留在下面的外发箱里等恢复后自动补发。
          </span>
        </Space>
      </Panel>

      <Panel
        title="对接健康度"
        titleExtra={
          <span className="muted text-12">
            刷新于 {query.isFetching ? "…" : "刚刚"}；匹配不到不猜不建客户，记在「匹配不到」里
          </span>
        }
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <StatCard
            label="可自动匹配"
            value={state.bindings.auto}
            hint="按 unionId 或手机号匹配成功"
          />
          <StatCard
            label="人工绑定"
            value={state.bindings.manual}
            hint="店主手动指定的客户"
          />
          <StatCard
            label="匹配不到"
            value={state.bindings.miss}
            hint="SCRM 里没有对应客户"
          />
          <StatCard
            label="待发送"
            value={pending}
            hint={pending ? "调度器每分钟投递一轮" : "外发箱已清空"}
          />
          <StatCard
            label="已发送"
            value={state.outbox.SENT}
            hint={state.lastSentAt ? fmtTime(state.lastSentAt) : dash(state.lastSentAt)}
          />
          <StatCard
            label="已跳过"
            value={replayable}
            hint="匹配不到或超出补发窗口"
          />
          <StatCard
            label="失败终止"
            value={state.outbox.DEAD}
            hint="连续失败达到上限，不再自动重试"
          />
        </div>
      </Panel>

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
            loading={actions.retry.isPending}
            disabled={!state.enabled || pending === 0}
            onClick={() => void retry()}
          >
            立即重试待发送（{pending}）
          </Button>
          <Button
            loading={actions.replay.isPending}
            disabled={!state.enabled || replayable === 0}
            onClick={replay}
          >
            一键重投已跳过（{replayable}）
          </Button>
          <ActionLink path={SCRM_SETTING_PATH}>打开企业微信 SCRM</ActionLink>
        </Space>
      </Panel>
    </div>
  );
}
