"use client";

import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import {
  HEALTH_EARNER_KINDS,
  HEALTH_EARNER_KIND_LABELS,
  HEALTH_ORDER_BIZ_TYPES,
  HEALTH_WITHDRAWAL_STATUSES,
  HEALTH_WITHDRAWAL_STATUS_LABELS,
  type HealthBankCardRow,
  type HealthCommissionRuleRow,
  type HealthCustomerRow,
  type HealthEarnerRow,
  type HealthMeta,
  type HealthOrderShareRow,
  type HealthWalletLogRow,
  type HealthWithdrawalRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  cny,
  DataTable,
  FilterBar,
  labelOf,
  LoadError,
  OnOffTag,
  onOffLabel,
  useHealthResource,
} from "./health-common";

/**
 * 资金与提现：收益台账、分账规则、银行卡与提现。
 *
 * 口径（与后端 `health.finance.service.ts` 一致）：钱都走店铺自有商户号，
 * 平台不经手；提现只是店主线下打款的台账登记，线上只留状态与凭证。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const SCOPE_LABELS: Record<HealthCommissionRuleRow["scope"], string> = {
  DEFAULT: "店铺默认",
  ORGAN: "按机构",
  PRACTITIONER: "按医护",
  SERVICE: "按服务项目",
  TEAM: "按团队",
};

const SCOPE_OPTIONS = (
  ["DEFAULT", "ORGAN", "PRACTITIONER", "SERVICE", "TEAM"] as const
).map((value) => ({ value, label: SCOPE_LABELS[value] }));

/** 提现状态没有完整下发到 meta 的兜底，避免把枚举原样露出。 */
const WITHDRAWAL_TONE: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "blue",
  PAID: "green",
  REJECTED: "red",
  CANCELLED: "default",
};

const WITHDRAWAL_STATUS_OPTIONS = HEALTH_WITHDRAWAL_STATUSES.map((value) => ({
  value,
  label: HEALTH_WITHDRAWAL_STATUS_LABELS[value] ?? value,
}));

const WALLET_KIND_LABELS: Record<string, string> = {
  RECHARGE: "充值",
  REFUND: "退款",
  PAY: "消费",
  ADJUST: "调账",
};

const EARER_KIND_OPTIONS = HEALTH_EARNER_KINDS.map((value) => ({
  value,
  label: HEALTH_EARNER_KIND_LABELS[value] ?? value,
}));

const earnerKindText = (meta: HealthMeta | null, value: string) =>
  HEALTH_EARNER_KIND_LABELS[value] ?? labelOf(meta, "earnerKinds", value);

const withdrawTag = (value: string) => (
  <Tag color={WITHDRAWAL_TONE[value] ?? "default"}>
    {HEALTH_WITHDRAWAL_STATUS_LABELS[value] ?? value}
  </Tag>
);

/** 可处理的动作：只有待审核能同意，已同意才能登记打款；已打款不再给入口。 */
function withdrawalActions(status: string) {
  if (status === "PENDING") {
    return [
      { value: "APPROVE", label: "同意申请（转为待打款）" },
      { value: "REJECT", label: "驳回申请" },
    ];
  }
  if (status === "APPROVED") {
    return [
      { value: "PAID", label: "登记已线下打款" },
      { value: "REJECT", label: "驳回申请" },
    ];
  }
  return [];
}

/** 收款对象下拉：按收益方类型取本店对应名单，SHOP 不需要选人。 */
function useEarnerOptions(shopId: number, kind: string, enabled: boolean) {
  const resource = useHealthResource<{ value: number; label: string }[]>(
    async () => {
      if (kind === "ORGAN") {
        const data = await healthApi.organs({
          query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE },
        });
        return (data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
      }
      if (kind === "PRACTITIONER") {
        const data = await healthApi.practitioners({
          query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE },
        });
        return (data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
      }
      if (kind === "TEAM") {
        const data = await healthApi.teams({
          query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE },
        });
        return (data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
      }
      if (kind === "PROMOTER") {
        const data = await healthApi.promoters({
          query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE },
        });
        return (data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
      }
      return [];
    },
    [shopId, kind],
    enabled && shopId > 0,
  );
  return resource.data ?? [];
}

export function FinanceTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("ledger");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Notice variant="info">
        分账与提现都是「店内记账口径」：平台不经手资金、提现由店主线下打款，线上只记台账与状态。
      </Notice>
      <PanelTabs
        value={panel}
        onChange={setPanel}
        items={[
          { key: "ledger", label: "收益台账", children: <LedgerPanel shopId={shopId} meta={meta} /> },
          { key: "rules", label: "分账规则", children: <RulesPanel shopId={shopId} meta={meta} /> },
          { key: "banks", label: "银行卡", children: <BanksPanel shopId={shopId} meta={meta} /> },
          {
            key: "withdrawals",
            label: "提现",
            children: <WithdrawalsPanel shopId={shopId} meta={meta} />,
          },
        ]}
      />
    </div>
  );
}

// ============================================================================
// 收益台账
// ============================================================================

function LedgerPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const [kind, setKind] = useState("all");
  const earners = useHealthResource(
    () => healthApi.earners({ query: { shopId, earnerKind: kind } }),
    [shopId, kind],
    shopId > 0,
  );
  const rows = earners.data ?? [];
  const unsettled = rows.reduce((sum, row) => sum + row.settleableCents, 0);

  const columns: ColumnsType<HealthEarnerRow> = [
    {
      title: "收益方",
      width: 230,
      render: (_: unknown, row) => (
        <div>
          <strong>{row.earnerName || `#${row.earnerId}`}</strong>
          <div className="muted text-12">{earnerKindText(meta, row.earnerKind)}</div>
        </div>
      ),
    },
    { title: "累计应分", dataIndex: "totalCents", width: 120, render: (value: number) => cny(value) },
    {
      title: "可提现",
      dataIndex: "settleableCents",
      width: 120,
      render: (value: number) => <strong>{cny(value)}</strong>,
    },
    {
      title: "提现中",
      dataIndex: "withdrawingCents",
      width: 110,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "已打款",
      dataIndex: "withdrawnCents",
      width: 110,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "待结算",
      dataIndex: "pendingCents",
      width: 110,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    { title: "订单数", dataIndex: "orderCount", width: 90 },
    {
      title: "收款卡",
      dataIndex: "bankLabel",
      width: 200,
      render: (value: string) => value || "未绑定",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Panel
        title="收益汇总"
        titleBadge={rows.length ? `${rows.length}` : undefined}
        titleExtra={
          <span className="muted text-12">
            医护 / 机构 / 推客按订单分账汇总，可提现 {cny(unsettled)}
          </span>
        }
      >
        <FilterBar>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">收益方类型</span>
            <Select
              value={kind}
              style={{ width: 160 }}
              onChange={setKind}
              options={[{ value: "all", label: "全部类型" }, ...EARER_KIND_OPTIONS]}
            />
          </div>
        </FilterBar>
        {earners.error ? <LoadError text={earners.error} /> : null}
        <DataTable<HealthEarnerRow>
          rows={rows}
          columns={columns}
          page={1}
          rowKey={(row) => `${row.earnerKind}:${row.earnerId}`}
          loading={earners.loading}
          scroll={{ x: 1100 }}
        />
        <div className="muted text-12" style={{ marginTop: 8 }}>
          可提现 = 已结算分账 − 提现中 − 已打款；待结算是分账可结算时间未到的部分。
        </div>
      </Panel>

      <OrderSharesPanel shopId={shopId} meta={meta} />
      <WalletLogsPanel shopId={shopId} />
    </div>
  );
}

function OrderSharesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState(0);
  const [kind, setKind] = useState("all");
  const resource = useHealthResource(
    () =>
      healthApi.orderShares({
        query: { shopId, page, pageSize: PAGE_SIZE, orderId, earnerKind: kind },
      }),
    [shopId, page, orderId, kind],
    shopId > 0,
  );

  const columns: ColumnsType<HealthOrderShareRow> = [
    { title: "订单号", dataIndex: "orderNo", width: 180, render: (value: string) => value || "—" },
    {
      title: "收益方",
      width: 190,
      render: (_: unknown, row) => (
        <span>
          {row.earnerName || `#${row.earnerId}`}
          <span className="muted text-12">（{earnerKindText(meta, row.earnerKind)}）</span>
        </span>
      ),
    },
    { title: "比例", dataIndex: "percent", width: 80, render: (value: number) => `${value}%` },
    { title: "计费基数", dataIndex: "baseCents", width: 110, render: (value: number) => cny(value) },
    { title: "应分", dataIndex: "shareCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "冲销",
      dataIndex: "deductedCents",
      width: 100,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "实分",
      dataIndex: "actualCents",
      width: 110,
      render: (value: number) => <strong>{cny(value)}</strong>,
    },
    {
      title: "可结算时间",
      dataIndex: "settleableAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "结算",
      dataIndex: "settled",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "已入账" : "待结算"}</Tag>
      ),
    },
  ];

  return (
    <Panel
      title="订单分账明细"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">按订单查每一笔分账；退款会冲销对应分账</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">订单编号</span>
          <InputNumber
            min={0}
            precision={0}
            value={orderId}
            placeholder="0 表示全部订单"
            style={{ width: 180 }}
            onChange={(value) => {
              setOrderId(Number(value ?? 0));
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">收益方类型</span>
          <Select
            value={kind}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部类型" }, ...EARER_KIND_OPTIONS]}
          />
        </div>
      </FilterBar>
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthOrderShareRow>
        rows={resource.data?.list ?? []}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1230 }}
      />
    </Panel>
  );
}

function WalletLogsPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState(0);
  const customers = useHealthResource(
    () =>
      healthApi.customers({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const resource = useHealthResource(
    () => healthApi.walletLogs({ query: { shopId, page, pageSize: PAGE_SIZE, customerId } }),
    [shopId, page, customerId],
    shopId > 0,
  );
  const customerRows: HealthCustomerRow[] = customers.data?.list ?? [];

  const columns: ColumnsType<HealthWalletLogRow> = [
    {
      title: "顾客",
      dataIndex: "customerLabel",
      width: 180,
      render: (value: string) => value || "—",
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 100,
      render: (value: string) => <Tag>{WALLET_KIND_LABELS[value] ?? "其他变动"}</Tag>,
    },
    {
      title: "变动",
      dataIndex: "amountCents",
      width: 120,
      render: (value: number) => (
        <span style={{ color: value < 0 ? "var(--danger, #cf1322)" : undefined }}>
          {value < 0 ? "-" : "+"}
          {cny(Math.abs(value))}
        </span>
      ),
    },
    { title: "余额", dataIndex: "balanceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "关联",
      dataIndex: "refId",
      width: 140,
      render: (value: number) => (value > 0 ? `订单 #${value}` : "—"),
    },
    { title: "备注", dataIndex: "note", width: 260, ellipsis: true, render: (value: string) => value || "—" },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
  ];

  return (
    <Panel
      title="顾客钱包流水"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">顾客余额的充值与退款流水，只记店内账本</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">顾客</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={customerId}
            style={{ width: 220 }}
            onChange={(value: number) => {
              setCustomerId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部顾客" },
              ...customerRows.map((row) => ({
                value: row.id,
                label: row.nickname || row.phone || `顾客${row.id}`,
              })),
            ]}
          />
        </div>
      </FilterBar>
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthWalletLogRow>
        rows={resource.data?.list ?? []}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1070 }}
      />
    </Panel>
  );
}

// ============================================================================
// 分账规则
// ============================================================================

function RulesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthCommissionRuleRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.commissionRules({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthCommissionRuleRow) => {
    setBusy(true);
    try {
      await healthApi.commissionRuleRemove({ body: { shopId, id: row.id } });
      message.success("分账规则已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthCommissionRuleRow> = [
    {
      title: "作用域",
      width: 200,
      render: (_: unknown, row) => (
        <div>
          <strong>{SCOPE_LABELS[row.scope] ?? "店铺默认"}</strong>
          {row.scopeName ? <div className="muted text-12">{row.scopeName}</div> : null}
        </div>
      ),
    },
    {
      title: "适用业务",
      dataIndex: "bizTypes",
      width: 260,
      render: (value: HealthCommissionRuleRow["bizTypes"]) =>
        value.length
          ? value.map((item) => labelOf(meta, "bizTypes", item)).join("、")
          : "全部业务",
    },
    { title: "机构", dataIndex: "organPercent", width: 80, render: (value: number) => `${value}%` },
    {
      title: "医护",
      dataIndex: "practitionerPercent",
      width: 80,
      render: (value: number) => `${value}%`,
    },
    {
      title: "推客",
      dataIndex: "promoterPercent",
      width: 80,
      render: (value: number) => `${value}%`,
    },
    { title: "团队", dataIndex: "teamPercent", width: 80, render: (value: number) => `${value}%` },
    { title: "店铺留存", dataIndex: "shopPercent", width: 100, render: (value: number) => `${value}%` },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "校验",
      dataIndex: "validateMessage",
      width: 180,
      render: (value: string) =>
        value ? (
          <span className="text-12" style={{ color: "var(--danger, #cf1322)" }}>
            {value}
          </span>
        ) : (
          <span className="muted text-12">合计 100%，正常</span>
        ),
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后命中该作用域的订单回落到上级规则或店铺默认。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="分账规则"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={
        <span className="muted text-12">
          各方比例合计不能超过 100%，差额归店铺；优先级 服务项目 &gt; 医护 &gt; 机构 &gt; 默认
        </span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增规则
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthCommissionRuleRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 1300 }}
      />

      <RuleModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type RuleFormValues = {
  scope: HealthCommissionRuleRow["scope"];
  scopeId: number;
  bizTypes: string[];
  organPercent: number;
  practitionerPercent: number;
  promoterPercent: number;
  teamPercent: number;
  status: string;
};

const BIZ_TYPE_OPTIONS = HEALTH_ORDER_BIZ_TYPES.map((value) => ({ value, label: value }));

function RuleModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthCommissionRuleRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RuleFormValues>();
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<HealthCommissionRuleRow["scope"]>("DEFAULT");
  const [assigned, setAssigned] = useState(0);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const scopeOptions = useEarnerOptions(shopId, scope, open && scope !== "DEFAULT");

  useEffect(() => {
    if (!open) return;
    const sum =
      (row?.organPercent ?? 0) +
      (row?.practitionerPercent ?? 0) +
      (row?.promoterPercent ?? 0) +
      (row?.teamPercent ?? 0);
    setScope(row?.scope ?? "DEFAULT");
    setAssigned(sum);
    form.setFieldsValue({
      scope: row?.scope ?? "DEFAULT",
      scopeId: row?.scopeId || 0,
      bizTypes: row?.bizTypes ?? [],
      organPercent: row?.organPercent ?? 0,
      practitionerPercent: row?.practitionerPercent ?? 0,
      promoterPercent: row?.promoterPercent ?? 0,
      teamPercent: row?.teamPercent ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (scope !== "DEFAULT" && Number(values.scopeId ?? 0) <= 0) {
      message.error("请选择该规则作用的对象");
      return;
    }
    setSaving(true);
    try {
      await healthApi.commissionRuleSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          scope: (values.scope ?? "DEFAULT") as HealthCommissionRuleRow["scope"],
          scopeId: scope === "DEFAULT" ? 0 : Number(values.scopeId ?? 0),
          bizTypes: (values.bizTypes ?? []) as HealthCommissionRuleRow["bizTypes"],
          organPercent: Number(values.organPercent ?? 0),
          practitionerPercent: Number(values.practitionerPercent ?? 0),
          promoterPercent: Number(values.promoterPercent ?? 0),
          teamPercent: Number(values.teamPercent ?? 0),
          status: (values.status ?? "ON") as HealthCommissionRuleRow["status"],
        },
      });
      message.success(row ? "分账规则已保存" : "分账规则已创建");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const shopPercent = 100 - assigned;

  return (
    <Modal
      open={open}
      title={row ? "编辑分账规则" : "新增分账规则"}
      width={720}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(_changed, all) => {
          const next = all as RuleFormValues;
          setAssigned(
            Number(next.organPercent ?? 0) +
              Number(next.practitionerPercent ?? 0) +
              Number(next.promoterPercent ?? 0) +
              Number(next.teamPercent ?? 0),
          );
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="scope" label="作用域">
            <Select
              options={SCOPE_OPTIONS}
              onChange={(value: HealthCommissionRuleRow["scope"]) => setScope(value)}
            />
          </Form.Item>
          <Form.Item
            name="scopeId"
            label="作用对象"
            extra={scope === "DEFAULT" ? "店铺默认对所有业务生效" : "选择具体的机构 / 医护 / 服务 / 团队"}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={scope === "DEFAULT"}
              placeholder={scope === "DEFAULT" ? "无需选择" : "选择对象"}
              options={scopeOptions}
            />
          </Form.Item>
        </div>

        <Form.Item name="bizTypes" label="适用业务" extra="留空表示全部业务类型">
          <Select
            mode="multiple"
            allowClear
            placeholder="全部业务"
            options={BIZ_TYPE_OPTIONS.map((item) => ({
              value: item.value,
              label: labelOf(meta, "bizTypes", item.value),
            }))}
          />
        </Form.Item>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="organPercent" label="机构比例（%）">
            <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="practitionerPercent" label="医护比例（%）">
            <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="promoterPercent" label="推客比例（%）">
            <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="teamPercent" label="团队比例（%）">
            <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item label="店铺留存（%）" extra="自动按 100% 减去各方比例计算">
            <InputNumber
              value={shopPercent}
              disabled
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select
              options={[
                { value: "ON", label: onOffLabel("ON") },
                { value: "OFF", label: onOffLabel("OFF") },
              ]}
            />
          </Form.Item>
        </div>
        {shopPercent < 0 ? (
          <Notice variant="warn">各方比例合计已超过 100%，请下调后再保存。</Notice>
        ) : (
          <div className="muted text-12">各方合计 {assigned}%，店铺留存 {shopPercent}%。</div>
        )}
      </Form>
    </Modal>
  );
}

// ============================================================================
// 银行卡
// ============================================================================

function BanksPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("all");
  const [editing, setEditing] = useState<HealthBankCardRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.bankCards({ query: { shopId, earnerKind: kind } }),
    [shopId, kind],
    shopId > 0,
  );
  const earners = useHealthResource(
    () => healthApi.earners({ query: { shopId, earnerKind: "all" } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];
  const nameMap = new Map(
    (earners.data ?? []).map((row) => [`${row.earnerKind}:${row.earnerId}`, row.earnerName]),
  );

  const remove = async (row: HealthBankCardRow) => {
    setBusy(true);
    try {
      await healthApi.bankCardRemove({ body: { shopId, id: row.id } });
      message.success("银行卡已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthBankCardRow> = [
    {
      title: "收款方",
      width: 210,
      render: (_: unknown, row) => (
        <div>
          <strong>
            {nameMap.get(`${row.earnerKind}:${row.earnerId}`) || `#${row.earnerId}`}
          </strong>
          <div className="muted text-12">{earnerKindText(meta, row.earnerKind)}</div>
        </div>
      ),
    },
    { title: "开户名", dataIndex: "holderName", width: 150, render: (value: string) => value || "—" },
    {
      title: "开户行",
      dataIndex: "bankName",
      width: 220,
      render: (value: string, row) => (
        <div>
          <span>{value || "—"}</span>
          {row.branchName ? <div className="muted text-12">{row.branchName}</div> : null}
        </div>
      ),
    },
    {
      title: "卡号",
      dataIndex: "cardTail",
      width: 180,
      render: (value: string) => `**** **** **** ${value || "----"}`,
    },
    {
      title: "默认",
      dataIndex: "isDefault",
      width: 90,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "默认收款" : "普通"}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="有处理中的提现时不能删除该卡。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="收款银行卡"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">卡号只存密文、列表只回后四位，用于店主线下打款</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增银行卡
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">收款方类型</span>
          <Select
            value={kind}
            style={{ width: 160 }}
            onChange={setKind}
            options={[{ value: "all", label: "全部类型" }, ...EARER_KIND_OPTIONS]}
          />
        </div>
      </FilterBar>
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthBankCardRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 1170 }}
      />

      <BankCardModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type BankCardFormValues = {
  earnerKind: HealthBankCardRow["earnerKind"];
  earnerId: number;
  holderName: string;
  bankName: string;
  branchName: string;
  cardNo: string;
  isDefault: boolean;
};

function BankCardModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthBankCardRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BankCardFormValues>();
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<HealthBankCardRow["earnerKind"]>("PRACTITIONER");
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const earnerOptions = useEarnerOptions(shopId, kind, open && kind !== "SHOP");

  useEffect(() => {
    if (!open) return;
    setKind(row?.earnerKind ?? "PRACTITIONER");
    form.setFieldsValue({
      earnerKind: row?.earnerKind ?? "PRACTITIONER",
      earnerId: row?.earnerId ?? 0,
      holderName: row?.holderName ?? "",
      bankName: row?.bankName ?? "",
      branchName: row?.branchName ?? "",
      cardNo: "",
      isDefault: row?.isDefault ?? false,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (kind !== "SHOP" && Number(values.earnerId ?? 0) <= 0) {
      message.error("请选择收款对象");
      return;
    }
    setSaving(true);
    try {
      await healthApi.bankCardSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          earnerKind: kind,
          earnerId: kind === "SHOP" ? 0 : Number(values.earnerId ?? 0),
          holderName: (values.holderName ?? "").trim(),
          bankName: (values.bankName ?? "").trim(),
          branchName: (values.branchName ?? "").trim(),
          cardNo: (values.cardNo ?? "").trim(),
          isDefault: Boolean(values.isDefault),
        },
      });
      message.success(row ? "银行卡已保存" : "银行卡已新增");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? "编辑银行卡" : "新增银行卡"}
      width={620}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="earnerKind" label="收款方类型">
            <Select
              options={EARER_KIND_OPTIONS}
              onChange={(value: HealthBankCardRow["earnerKind"]) => setKind(value)}
            />
          </Form.Item>
          <Form.Item
            name="earnerId"
            label="收款对象"
            extra={kind === "SHOP" ? "店铺收款无需选择对象" : "从本店对应名单里选"}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={kind === "SHOP"}
              placeholder={kind === "SHOP" ? "店铺自收" : "选择对象"}
              options={earnerOptions}
            />
          </Form.Item>
          <Form.Item
            name="holderName"
            label="开户名"
            rules={[{ required: true, message: "请填写开户名" }]}
          >
            <Input maxLength={60} placeholder="与银行卡一致的户名" />
          </Form.Item>
          <Form.Item
            name="bankName"
            label="开户银行"
            rules={[{ required: true, message: "请填写开户银行" }]}
          >
            <Input maxLength={60} placeholder="如 中国工商银行" />
          </Form.Item>
          <Form.Item name="branchName" label="开户支行">
            <Input maxLength={120} placeholder="如 杭州西湖支行，可留空" />
          </Form.Item>
          <Form.Item
            name="cardNo"
            label="银行卡号"
            extra={row ? `当前尾号 ${row.cardTail}，留空表示不改` : "仅加密入库，列表只回后四位"}
            rules={row ? undefined : [{ required: true, message: "请填写银行卡号" }]}
          >
            <Input maxLength={32} placeholder={row ? "留空不改" : "请输入完整卡号"} />
          </Form.Item>
        </div>
        <Form.Item name="isDefault" label="设为默认收款卡" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 提现
// ============================================================================

function WithdrawalsPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [handling, setHandling] = useState<HealthWithdrawalRow | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.withdrawals({
        query: { shopId, page, pageSize: PAGE_SIZE, withdrawalStatus: status, earnerKind: kind },
      }),
    [shopId, page, status, kind],
    shopId > 0,
  );

  const columns: ColumnsType<HealthWithdrawalRow> = [
    { title: "提现单号", dataIndex: "withdrawalNo", width: 180, render: (value: string) => value || "—" },
    {
      title: "收益方",
      width: 180,
      render: (_: unknown, row) => (
        <span>
          {row.earnerName || `#${row.earnerId}`}
          <span className="muted text-12">（{earnerKindText(meta, row.earnerKind)}）</span>
        </span>
      ),
    },
    { title: "申请金额", dataIndex: "amountCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "税费",
      dataIndex: "taxCents",
      width: 100,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "手续费",
      dataIndex: "feeCents",
      width: 100,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "实付",
      dataIndex: "actualCents",
      width: 110,
      render: (value: number) => <strong>{cny(value)}</strong>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => withdrawTag(value),
    },
    { title: "收款卡", dataIndex: "bankLabel", width: 200, render: (value: string) => value || "—" },
    { title: "申请时间", dataIndex: "applyAt", width: 160, render: (value: string) => fmtTime(value) },
    {
      title: "处理时间",
      dataIndex: "handledAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "处理说明",
      dataIndex: "handleNote",
      width: 200,
      ellipsis: true,
      render: (value: string, row) => value || row.paidVoucher || "—",
    },
    {
      title: "操作",
      width: 130,
      fixed: "right",
      render: (_: unknown, row) =>
        withdrawalActions(row.status).length ? (
          <Button size="small" type="text" onClick={() => setHandling(row)}>
            处理
          </Button>
        ) : (
          <span className="muted text-12">已完结</span>
        ),
    },
  ];

  return (
    <Panel
      title="提现台账"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">店主线下打款后再来登记，线上只留审批与凭证</span>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">提现状态</span>
          <Select
            value={status}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...WITHDRAWAL_STATUS_OPTIONS]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">收益方类型</span>
          <Select
            value={kind}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部类型" }, ...EARER_KIND_OPTIONS]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthWithdrawalRow>
        rows={resource.data?.list ?? []}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1500 }}
      />

      <WithdrawalHandleModal
        shopId={shopId}
        row={handling}
        onClose={() => setHandling(null)}
        onDone={async () => {
          setHandling(null);
          await resource.reload();
        }}
      />
    </Panel>
  );
}

type WithdrawalHandleValues = { action: string; note: string; paidVoucher: string };

function WithdrawalHandleModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthWithdrawalRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WithdrawalHandleValues>();
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState("APPROVE");
  const open = Boolean(row);

  useEffect(() => {
    if (!open || !row) return;
    const first = withdrawalActions(row.status)[0]?.value ?? "APPROVE";
    setAction(first);
    form.resetFields();
    form.setFieldsValue({ action: first, note: "", paidVoucher: "" });
  }, [open, row, form]);

  if (!row) return null;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.withdrawalHandle({
        body: {
          shopId,
          id: row.id,
          action: (values.action ?? "APPROVE") as "APPROVE" | "REJECT" | "PAID" | "CANCEL",
          note: (values.note ?? "").trim(),
          paidVoucher: (values.paidVoucher ?? "").trim(),
        },
      });
      message.success("提现已处理");
      await onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "处理失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`处理提现 · ${row.withdrawalNo || `#${row.id}`}`}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认"
      confirmLoading={saving}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <span className="text-12 muted">
          {row.earnerName || `#${row.earnerId}`} · 申请 {cny(row.amountCents)} · 实付{" "}
          {cny(row.actualCents)} · 当前 {HEALTH_WITHDRAWAL_STATUS_LABELS[row.status] ?? row.status}
        </span>
        <Form form={form} layout="vertical">
          <Form.Item
            name="action"
            label="处理动作"
            rules={[{ required: true, message: "请选择动作" }]}
          >
            <Select
              options={withdrawalActions(row.status)}
              onChange={(value: string) => setAction(value)}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="处理说明"
            rules={
              action === "REJECT" ? [{ required: true, message: "驳回需填写原因" }] : undefined
            }
            extra={action === "REJECT" ? "必填，收益方可看到" : "可留空"}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          {action === "PAID" ? (
            <Form.Item name="paidVoucher" label="打款凭证" extra="线下转账的流水号或凭证图片地址，可留空">
              <Input maxLength={500} placeholder="如 转账流水号 / https://…" />
            </Form.Item>
          ) : null}
        </Form>
        <Notice variant="warn">
          平台不经手资金：同意后由店主线下打款，打款完成再登记「已打款」留痕。
        </Notice>
      </div>
    </Modal>
  );
}
