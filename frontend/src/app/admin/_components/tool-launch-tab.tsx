"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { toolLaunchAdminApi } from "@/api/tool-launch";
import { useOperationMutation } from "@/query/business";
import { PermissionNotice, fmtTime, useAdminData } from "./common";
import { ErrandAdminPanel } from "./errand-admin-panel";
import {
  TOOL_BILLING_CYCLE_LABELS,
  TOOL_BILLING_CYCLES,
  TOOL_LAUNCH_CODES,
  TOOL_LAUNCH_STATUS_LABELS,
} from "@enterprise/contracts";
import type {
  ToolBillingCycle,
  ToolLaunchCode,
  ToolLaunchPricingRow,
  ToolLaunchStatus,
  ToolLaunchSubscriptionRow,
} from "@enterprise/contracts";

/**
 * 平台后台「建站启动计费」页签：9 个建站工具的启动口径、平台策略与启动台账。
 *
 * 单价与口径仍然写进 `module_pricing`（与「价目与用量」同表同真源）——
 * 用户侧启动页说的价就是这里填的价，两处配置迟早分叉的事不给第二次机会。
 */

const CYCLE_OPTIONS = Object.entries(TOOL_BILLING_CYCLE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  ...Object.entries(TOOL_LAUNCH_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

type PricingDraft = {
  billingCycle: ToolBillingCycle;
  unitPriceAmount: number;
  freeQuotaAmount: number;
  minChargeAmount: number;
  usageUnitSize: number;
  launchEnabled: boolean;
  usageBilled: boolean;
  enabled: boolean;
};

/** 老价目行的 billingCycle 可能是空串（沿用用量计费语义），一律归一到枚举内的口径。 */
function cycleOf(value: string): ToolBillingCycle {
  return (TOOL_BILLING_CYCLES as readonly string[]).includes(value)
    ? (value as ToolBillingCycle)
    : "FREE";
}

const draftOf = (row: ToolLaunchPricingRow): PricingDraft => ({
  billingCycle: cycleOf(row.billingCycle),
  unitPriceAmount: row.unitPriceAmount,
  freeQuotaAmount: row.freeQuotaAmount,
  minChargeAmount: row.minChargeAmount,
  usageUnitSize: row.usageUnitSize,
  launchEnabled: row.launchEnabled,
  usageBilled: row.usageBilled,
  enabled: row.enabled,
});

export function ToolLaunchTab() {
  const { message } = App.useApp();
  const { data, denied, loading, reload } = useAdminData("tool-launch-overview", (signal) =>
    toolLaunchAdminApi.overview({}, { signal }),
  );
  const [drafts, setDrafts] = useState<Record<string, PricingDraft>>({});
  const [tool, setTool] = useState<ToolLaunchCode | "">("");
  const [status, setStatus] = useState<ToolLaunchStatus | "">("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(data.tools.map((row) => [row.toolCode, draftOf(row)])),
    );
  }, [data]);

  const savePricing = useOperationMutation(
    (input: { tool: ToolLaunchCode; body: PricingDraft }) =>
      toolLaunchAdminApi.savePricing({
        body: {
          tool: input.tool,
          billingCycle: input.body.billingCycle,
          unitPriceAmount: input.body.unitPriceAmount,
          freeQuotaAmount: input.body.freeQuotaAmount,
          minChargeAmount: input.body.minChargeAmount,
          usageUnitSize: input.body.usageUnitSize,
          launchEnabled: input.body.launchEnabled,
          usageBilled: input.body.usageBilled,
          enabled: input.body.enabled,
        },
      }),
    ["tool-launch-overview", "tool-launch-subs", "tool-launch-usage"],
  );

  const savePolicy = useOperationMutation(
    (body: { graceHours: number; transitionDays: number; suspendOnArrears: boolean }) =>
      toolLaunchAdminApi.savePolicy({ body }),
    ["tool-launch-overview", "tool-launch-subs"],
  );

  const subs = useAdminData(
    "tool-launch-subs",
    (signal) =>
      toolLaunchAdminApi.subscriptions(
        { query: { tool: tool || undefined, status: status || undefined, page, pageSize: 20 } },
        { signal },
      ),
    { tool, status, page },
  );

  const toggle = useOperationMutation(
    (input: { user: string; tool: ToolLaunchCode; off: boolean; reason: string }) =>
      toolLaunchAdminApi.toggle({ body: input }),
    ["tool-launch-subs", "tool-launch-overview", "tool-launch-usage"],
  );

  const patch = (code: string, part: Partial<PricingDraft>) =>
    setDrafts((rows) => ({ ...rows, [code]: { ...rows[code], ...part } }));

  const askToggle = (row: ToolLaunchSubscriptionRow, off: boolean) => {
    let reason = "";
    Modal.confirm({
      title: off ? `强制停用「${row.toolName}」？` : `人工恢复「${row.toolName}」？`,
      content: off ? (
        <Input
          placeholder="停用原因（用户在工具页会看到这句）"
          maxLength={200}
          onChange={(event) => {
            reason = event.target.value;
          }}
        />
      ) : (
        <Notice variant="info">
          恢复后按当期口径继续可用；欠费自动复活不会覆盖人工处置，反之也一样。
        </Notice>
      ),
      okText: off ? "确认停用" : "确认恢复",
      okButtonProps: { danger: off },
      onOk: async () => {
        await toggle.mutateAsync({
          user: row.userId,
          tool: row.toolCode as ToolLaunchCode,
          off,
          reason,
        });
        message.success(off ? "已停用" : "已恢复");
      },
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <PermissionNotice denied={denied} />
      <ErrandAdminPanel />

      <Panel
        title="平台策略"
        titleExtra={
          <span className="text-12 muted">
            欠费宽限与存量免费过渡天数作用于全部建站工具；单价与口径在下面逐工具配置
          </span>
        }
      >
        {data ? (
          <PolicyForm
            initial={data.policy}
            busy={savePolicy.isPending}
            onSubmit={(body) => savePolicy.mutateAsync(body)}
          />
        ) : (
          <EmptyState text={loading ? "读取中…" : "暂无数据"} />
        )}
        {data ? (
          <Descriptions
            size="small"
            column={{ xs: 2, md: 5 }}
            style={{ marginTop: 12 }}
            items={[
              { key: "a", label: "运行中", children: data.counters.active },
              { key: "b", label: "免费过渡期", children: data.counters.trial },
              { key: "c", label: "欠费宽限中", children: data.counters.arrears },
              { key: "d", label: "未启动/已停服", children: data.counters.stopped },
              {
                key: "e",
                label: "近 30 天出账积分",
                children: `${data.counters.pointsCharged30d}（欠费待补 ${data.counters.unpaidBills} 笔）`,
              },
              {
                key: "f",
                label: "过渡期锚点",
                children: data.policy.legacyAnchor
                  ? fmtTime(data.policy.legacyAnchor)
                  : "未落定（首次读取时写入）",
              },
            ]}
          />
        ) : null}
      </Panel>

      <Panel
        title="各工具计费口径"
        titleExtra={
          <span className="text-12 muted">
            周期口径＝启动即扣首期、到期自动续扣；按访问 / 按流量 / 按浏览量可单独开启期末按量出账
          </span>
        }
      >
        <Table<ToolLaunchPricingRow>
          rowKey="toolCode"
          size="small"
          loading={loading}
          dataSource={data?.tools ?? []}
          pagination={false}
          locale={{ emptyText: <EmptyState text="暂无工具" /> }}
          columns={[
            {
              title: "工具",
              width: 190,
              render: (_, row) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <span className="mono text-12 muted">{row.pricingCode}</span>
                  {!row.configured ? <Tag color="default">未配置</Tag> : null}
                  {row.ownBilling ? <Tag color="blue">只读·站点月账</Tag> : null}
                </div>
              ),
            },
            {
              title: "口径",
              width: 130,
              render: (_, row) => (
                <Select
                  size="small"
                  style={{ width: 118 }}
                  disabled={row.ownBilling}
                  value={drafts[row.toolCode]?.billingCycle ?? row.billingCycle}
                  options={CYCLE_OPTIONS}
                  onChange={(value) => patch(row.toolCode, { billingCycle: value })}
                />
              ),
            },
            {
              title: "单价（积分）",
              width: 120,
              render: (_, row) => (
                <InputNumber
                  size="small"
                  min={0}
                  disabled={row.ownBilling}
                  style={{ width: 108 }}
                  value={drafts[row.toolCode]?.unitPriceAmount ?? row.unitPriceAmount}
                  onChange={(value) => patch(row.toolCode, { unitPriceAmount: Number(value ?? 0) })}
                />
              ),
            },
            {
              title: "免费额",
              width: 110,
              render: (_, row) => (
                <InputNumber
                  size="small"
                  min={0}
                  disabled={row.ownBilling}
                  style={{ width: 98 }}
                  value={drafts[row.toolCode]?.freeQuotaAmount ?? row.freeQuotaAmount}
                  onChange={(value) => patch(row.toolCode, { freeQuotaAmount: Number(value ?? 0) })}
                />
              ),
            },
            {
              title: "起扣",
              width: 100,
              render: (_, row) => (
                <InputNumber
                  size="small"
                  min={0}
                  disabled={row.ownBilling}
                  style={{ width: 88 }}
                  value={drafts[row.toolCode]?.minChargeAmount ?? row.minChargeAmount}
                  onChange={(value) => patch(row.toolCode, { minChargeAmount: Number(value ?? 0) })}
                />
              ),
            },
            {
              title: "计量粒度",
              width: 130,
              render: (_, row) => (
                <InputNumber
                  size="small"
                  min={1}
                  disabled={row.ownBilling}
                  style={{ width: 118 }}
                  value={drafts[row.toolCode]?.usageUnitSize ?? row.usageUnitSize}
                  onChange={(value) => patch(row.toolCode, { usageUnitSize: Number(value ?? 1) })}
                />
              ),
            },
            {
              title: "按量出账",
              width: 100,
              render: (_, row) => {
                const cycle = drafts[row.toolCode]?.billingCycle ?? row.billingCycle;
                const usage = cycle === "USAGE_PV" || cycle === "USAGE_BYTES" || cycle === "USAGE_VIEW";
                return (
                  <Switch
                    size="small"
                    disabled={row.ownBilling || !usage}
                    checked={drafts[row.toolCode]?.usageBilled ?? row.usageBilled}
                    onChange={(value) => patch(row.toolCode, { usageBilled: value })}
                  />
                );
              },
            },
            {
              title: "允许自启",
              width: 96,
              render: (_, row) => (
                <Switch
                  size="small"
                  disabled={row.ownBilling}
                  checked={drafts[row.toolCode]?.launchEnabled ?? row.launchEnabled}
                  onChange={(value) => patch(row.toolCode, { launchEnabled: value })}
                />
              ),
            },
            {
              title: "启用扣费",
              width: 96,
              render: (_, row) => (
                <Switch
                  size="small"
                  disabled={row.ownBilling}
                  checked={drafts[row.toolCode]?.enabled ?? row.enabled}
                  onChange={(value) => patch(row.toolCode, { enabled: value })}
                />
              ),
            },
            {
              title: "用户会看到的说明",
              render: (_, row) => (
                <span className="text-12 muted">
                  {drafts[row.toolCode]
                    ? previewNote(row, drafts[row.toolCode])
                    : row.note}
                  <div className="text-12 muted">
                    运行中 {row.stats.active} · 过渡 {row.stats.trial} · 欠费{" "}
                    {row.stats.arrears} · 未启动 {row.stats.stopped}
                  </div>
                </span>
              ),
            },
            {
              title: "操作",
              width: 88,
              render: (_, row) => (
                <Button
                  size="small"
                  type="primary"
                  loading={savePricing.isPending}
                  disabled={!drafts[row.toolCode] || row.ownBilling}
                  onClick={async () => {
                    await savePricing.mutateAsync({
                      tool: row.toolCode,
                      body: drafts[row.toolCode],
                    });
                    message.success(`「${row.name}」计费口径已更新`);
                    await reload();
                  }}
                >
                  保存
                </Button>
              ),
            },
          ]}
        />
        <Notice variant="info">
          改价只影响下一期：已启动账号的当期单价与账期在启动时已快照，页面与账单都会按快照说明。
          周期口径的「免费额」＝启动后前 N 期免费；按访问 / 按流量的「免费额」＝每期免费量（单位同计量粒度）。
        </Notice>
      </Panel>

      <Panel
        title="启动台账"
        titleExtra={<span className="text-12 muted">谁启动了什么、账期跑到哪、欠费多久</span>}
        extra={
          <Space>
            <Select
              size="small"
              style={{ width: 180 }}
              value={tool}
              options={[
                { value: "", label: "全部工具" },
                ...TOOL_LAUNCH_CODES.map((code) => ({
                  value: code,
                  label:
                    data?.tools.find((item) => item.toolCode === code)?.name || code,
                })),
              ]}
              onChange={(value: ToolLaunchCode | "") => {
                setTool(value);
                setPage(1);
              }}
            />
            <Select
              size="small"
              style={{ width: 140 }}
              value={status}
              options={STATUS_OPTIONS}
              onChange={(value: ToolLaunchStatus | "") => {
                setStatus(value);
                setPage(1);
              }}
            />
          </Space>
        }
      >
        <Table<ToolLaunchSubscriptionRow>
          rowKey="id"
          size="small"
          loading={subs.loading}
          dataSource={subs.data?.rows ?? []}
          locale={{ emptyText: <EmptyState text="暂无启动记录" /> }}
          pagination={{
            current: page,
            pageSize: 20,
            total: subs.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            { title: "账号", dataIndex: "username", width: 160 },
            { title: "工具", dataIndex: "toolName", width: 150 },
            {
              title: "状态",
              dataIndex: "status",
              width: 120,
              render: (value: string) =>
                TOOL_LAUNCH_STATUS_LABELS[value] || value,
            },
            {
              title: "账期",
              width: 300,
              render: (_, row) =>
                row.periodStart
                  ? `${fmtTime(row.periodStart)} ~ ${fmtTime(row.periodEnd)}`
                  : row.trialEndsAt
                    ? `过渡期至 ${fmtTime(row.trialEndsAt)}`
                    : "—",
            },
            {
              title: "单价 / 期数",
              width: 140,
              render: (_, row) => `${row.unitPriceAmount}/${row.cycleDays} 天 · ${row.billedPeriods} 期`,
            },
            {
              title: "欠费起算",
              width: 170,
              render: (_, row) => (row.arrearsSince ? fmtTime(row.arrearsSince) : "—"),
            },
            {
              title: "操作",
              width: 140,
              render: (_, row) => (
                <Button
                  size="small"
                  danger={row.status !== "STOPPED"}
                  disabled={toggle.isPending}
                  onClick={() => askToggle(row, row.status !== "STOPPED")}
                >
                  {row.status !== "STOPPED" ? "强制停用" : "人工恢复"}
                </Button>
              ),
            },
          ]}
        />
      </Panel>
    </Space>
  );
}

/** 保存前的口径预览：让管理员在提交这一行时就看到用户会读到什么。 */
function previewNote(row: ToolLaunchPricingRow, draft: PricingDraft): string {
  if (row.ownBilling) return row.note;
  const cycle = TOOL_BILLING_CYCLE_LABELS[draft.billingCycle] || draft.billingCycle;
  if (draft.billingCycle === "FREE" || !draft.enabled) {
    return `${cycle}，当前不扣积分`;
  }
  if (
    draft.billingCycle === "USAGE_PV" ||
    draft.billingCycle === "USAGE_BYTES" ||
    draft.billingCycle === "USAGE_VIEW"
  ) {
    const unit =
      draft.billingCycle === "USAGE_BYTES"
        ? "字节"
        : draft.billingCycle === "USAGE_VIEW"
          ? "次浏览"
          : "次访问";
    return `${cycle}：${draft.unitPriceAmount} 积分/${draft.usageUnitSize} ${unit}（${
      draft.usageBilled ? "期末按实际用量出账" : "只计量，暂不出账"
    }）`;
  }
  const unit =
    draft.billingCycle === "DAY" ? "天" : draft.billingCycle === "YEAR" ? "年" : "30 天";
  const free = draft.freeQuotaAmount > 0 ? `，前 ${draft.freeQuotaAmount} 期免费` : "";
  return `${cycle}：${draft.unitPriceAmount} 积分/${unit}${free}，到期自动续扣`;
}

function PolicyForm({
  initial,
  busy,
  onSubmit,
}: {
  initial: { graceHours: number; transitionDays: number; suspendOnArrears: boolean };
  busy: boolean;
  onSubmit: (body: {
    graceHours: number;
    transitionDays: number;
    suspendOnArrears: boolean;
  }) => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  useEffect(() => {
    form.setFieldsValue(initial);
  }, [form, initial]);
  return (
    <Form
      form={form}
      layout="inline"
      onFinish={async (values) => {
        await onSubmit({
          graceHours: Number(values.graceHours ?? 0),
          transitionDays: Number(values.transitionDays ?? 0),
          suspendOnArrears: !!values.suspendOnArrears,
        });
        message.success("平台策略已保存");
      }}
    >
      <Form.Item
        name="graceHours"
        label="欠费宽限（小时）"
        rules={[{ required: true, message: "请填写宽限小时数" }]}
      >
        <InputNumber min={0} max={720} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item
        name="transitionDays"
        label="存量免费过渡（天）"
        rules={[{ required: true, message: "请填写过渡天数" }]}
      >
        <InputNumber min={0} max={365} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="suspendOnArrears" label="超期自动停服" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          保存策略
        </Button>
      </Form.Item>
    </Form>
  );
}
