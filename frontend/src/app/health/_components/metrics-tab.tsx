"use client";

import {
  App,
  Button,
  DatePicker,
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
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import type {
  HealthAlertRow,
  HealthAlertRuleRow,
  HealthMeta,
  HealthMetricLogRow,
  HealthMetricRow,
  HealthMetricTrend,
} from "@enterprise/contracts";
import {
  HEALTH_ALERT_RULE_TYPES,
  HEALTH_ALERT_RULE_TYPE_LABELS,
  HEALTH_ALERT_STATUS_LABELS,
  HEALTH_METRIC_VALUE_TYPES,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  DataTable,
  Descriptions,
  FilterBar,
  LoadError,
  OnOffTag,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 指标与预警：指标定义、测量记录、趋势、预警规则与预警事件。
 * 口径统一为「只提示超出管理目标区间，不下诊断」——店主编规则、医护看趋势、顾客看提示。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

/** 分页返回体；列表接口按约定可能回 null，取数侧统一兜底。 */
type Paged<T> = { list: T[]; total: number } | null;

const ALERT_TONE: Record<string, string> = {
  OPEN: "red",
  ACKED: "gold",
  RESOLVED: "green",
  FALSE: "default",
};

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "低" },
  { value: "MEDIUM", label: "中" },
  { value: "HIGH", label: "高" },
];

const SOURCE_LABELS: Record<string, string> = {
  SELF: "顾客自填",
  STAFF: "医护代录",
  DEVICE: "设备导入",
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  NUMBER: "数值",
  TEXT: "文本",
  SELECT: "单选",
  BOOLEAN: "是与否",
};

const GRANULARITY_OPTIONS = [
  { value: "DAY", label: "按日" },
  { value: "WEEK", label: "按周" },
  { value: "MONTH", label: "按月" },
];

const DAYS_OPTIONS = [7, 30, 90, 180, 365].map((value) => ({ value, label: `近 ${value} 天` }));

const valueTypeLabel = (value: string) => VALUE_TYPE_LABELS[value] || value;
const severityLabel = (value: string) => SEVERITY_OPTIONS.find((item) => item.value === value)?.label || value;

/** 判定方式文案：平台字典优先，字典缺该项时回落契约常量，不把枚举原样甩到界面。 */
const ruleTypeLabel = (meta: HealthMeta | null, value: string) => {
  const text = labelOf(meta, "alertRuleTypes", value);
  return text === value ? HEALTH_ALERT_RULE_TYPE_LABELS[value] || value : text;
};

function AlertStatusTag({ value }: { value: string }) {
  return <Tag color={ALERT_TONE[value] ?? "default"}>{HEALTH_ALERT_STATUS_LABELS[value] || value}</Tag>;
}

/** 分页取数：失败弹一次提示并保留上一次结果，变更成功后调用 reload 重拉。 */
function usePagedRows<T>({
  load,
  deps,
  enabled = true,
  errorText = "读取失败",
}: {
  load: () => Promise<Paged<T>>;
  deps: unknown[];
  enabled?: boolean;
  errorText?: string;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const depKey = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    void loadRef
      .current()
      .then((result) => {
        if (!alive) return;
        setRows(result?.list ?? []);
        setTotal(result?.total ?? 0);
      })
      .catch((cause: unknown) => {
        if (alive) message.error(cause instanceof Error ? cause.message : errorText);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // depKey 是 deps 的稳定序列化；tick 供 reload 触发同条件重拉。
  }, [depKey, tick, enabled, errorText, message]);

  return {
    rows,
    total,
    loading,
    reload: async () => setTick((value) => value + 1),
  };
}

/** 就诊人下拉：一家店前 100 位够用，搜索按姓名过滤。 */
function usePatientOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.patients({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return {
    rows,
    options: rows.map((row) => ({
      value: row.id,
      label: row.customerLabel ? `${row.name}（${row.customerLabel}）` : row.name,
    })),
    reload: state.reload,
  };
}

export function MetricsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("metrics");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "metrics", label: "指标定义", children: <MetricPanel shopId={shopId} /> },
        { key: "logs", label: "测量记录", children: <LogPanel shopId={shopId} /> },
        { key: "trend", label: "趋势", children: <TrendPanel shopId={shopId} /> },
        { key: "rules", label: "预警规则", children: <RulePanel shopId={shopId} meta={meta} /> },
        { key: "alerts", label: "预警事件", children: <AlertPanel shopId={shopId} /> },
      ]}
    />
  );
}

// ============================================================================
// 一、指标定义
// ============================================================================

/** 选项 JSON：字符串数组，容忍换行与全角逗号之外的书写错误直接报错。 */
function parseStringArray(text: string): string[] | null {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

/** 额外字段 JSON：对象数组，缺省字段按契约补默认值。 */
function parseExtraFields(text: string): HealthMetricRow["extraFields"] | null {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rows: HealthMetricRow["extraFields"] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = String(row.type ?? "NUMBER");
      rows.push({
        key: String(row.key ?? ""),
        label: String(row.label ?? ""),
        type: (HEALTH_METRIC_VALUE_TYPES as readonly string[]).includes(type)
          ? (type as HealthMetricRow["extraFields"][number]["type"])
          : "NUMBER",
        required: Boolean(row.required),
        unit: String(row.unit ?? ""),
        options: Array.isArray(row.options) ? row.options.map((option) => String(option)) : [],
      });
    }
    return rows;
  } catch {
    return null;
  }
}

function MetricPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const state = useHealthResource(
    () => healthApi.metrics({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [editing, setEditing] = useState<HealthMetricRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = state.data ?? [];

  const remove = async (row: HealthMetricRow) => {
    setBusy(true);
    try {
      await healthApi.metricRemove({ body: { shopId, id: row.id } });
      message.success("指标已删除");
      await state.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMetricRow> = [
    { title: "指标名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "键名", dataIndex: "metricKey", width: 140 },
    { title: "单位", dataIndex: "unit", width: 80, render: (v: string) => v || "—" },
    {
      title: "取数类型",
      dataIndex: "valueType",
      width: 100,
      render: (value: string) => valueTypeLabel(value),
    },
    {
      title: "目标区间",
      width: 160,
      render: (_: unknown, row) =>
        row.valueType === "NUMBER" ? `${row.normalLow} – ${row.normalHigh}` : "不适用",
    },
    {
      title: "小数位",
      dataIndex: "decimals",
      width: 80,
      render: (value: number) => `${value} 位`,
    },
    { title: "记录数", dataIndex: "recordCount", width: 90 },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "来源",
      dataIndex: "builtin",
      width: 90,
      render: (value: boolean) => (value ? <Tag>内置</Tag> : <Tag color="blue">自定义</Tag>),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 130,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除指标后其历史测量记录不再展示，确认删除？"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger loading={busy}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="指标定义"
      titleExtra={
        <span className="muted text-12">目标区间只是管理目标，超出区间仅做提示，不构成诊断</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增指标
        </Button>
      }
    >
      {state.error ? <LoadError text={state.error} /> : null}
      {rows.length || state.loading ? (
        <DataTable
          rows={rows}
          columns={columns}
          page={1}
          loading={state.loading || busy}
          scroll={{ x: 1180 }}
        />
      ) : (
        <EmptyState text="还没有指标：先建血压、血糖、体重等指标，才能录测量值与配预警规则。" />
      )}
      <MetricModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void state.reload()}
      />
    </Panel>
  );
}

type MetricFormValues = {
  metricKey: string;
  name: string;
  unit: string;
  valueType: string;
  decimals: number;
  normalLow: number;
  normalHigh: number;
  optionsText: string;
  extraFieldsText: string;
  sort: number;
  status: string;
};

function MetricModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthMetricRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MetricFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const valueType = Form.useWatch<string | undefined>("valueType", form);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      metricKey: row?.metricKey ?? "",
      name: row?.name ?? "",
      unit: row?.unit ?? "",
      valueType: row?.valueType ?? "NUMBER",
      decimals: row?.decimals ?? 1,
      normalLow: row?.normalLow ?? 0,
      normalHigh: row?.normalHigh ?? 0,
      optionsText: row ? JSON.stringify(row.options) : "[]",
      extraFieldsText: row ? JSON.stringify(row.extraFields, null, 2) : "[]",
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    const options = parseStringArray(values.optionsText ?? "");
    if (!options) {
      message.error('选项需为 JSON 字符串数组，例如 ["低","中","高"]');
      return;
    }
    const extraFields = parseExtraFields(values.extraFieldsText ?? "");
    if (!extraFields) {
      message.error("额外字段需为 JSON 对象数组，至少包含 key 与 label，例如 [{\"key\":\"dia\",\"label\":\"舒张压\"}]");
      return;
    }
    setSaving(true);
    try {
      await healthApi.metricSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          metricKey: values.metricKey,
          name: values.name,
          unit: values.unit ?? "",
          valueType: values.valueType as HealthMetricRow["valueType"],
          decimals: Number(values.decimals ?? 1),
          normalLow: Number(values.normalLow ?? 0),
          normalHigh: Number(values.normalHigh ?? 0),
          options,
          extraFields,
          sort: Number(values.sort ?? 0),
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("指标已保存");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑指标 · ${row.name}` : "新增指标"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={680}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="指标名称"
            rules={[{ required: true, message: "请填写指标名称" }]}
          >
            <Input maxLength={40} placeholder="如 收缩压" />
          </Form.Item>
          <Form.Item
            name="metricKey"
            label="键名"
            rules={[{ required: true, message: "请填写键名" }]}
            extra={row?.builtin ? "内置指标的键名不可修改" : "同店唯一，如 sbp"}
          >
            <Input maxLength={40} disabled={Boolean(row?.builtin)} />
          </Form.Item>
          <Form.Item name="unit" label="单位">
            <Input maxLength={16} placeholder="如 mmHg" />
          </Form.Item>
          <Form.Item name="valueType" label="取数类型">
            <Select
              options={HEALTH_METRIC_VALUE_TYPES.map((value) => ({
                value,
                label: valueTypeLabel(value),
              }))}
            />
          </Form.Item>
          <Form.Item name="decimals" label="小数位">
            <InputNumber min={0} max={4} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="normalLow" label="目标下限" extra="数值指标生效">
            <InputNumber min={-999999} max={999999} style={{ width: "100%" }} disabled={valueType !== "NUMBER"} />
          </Form.Item>
          <Form.Item name="normalHigh" label="目标上限" extra="数值指标生效">
            <InputNumber min={-999999} max={999999} style={{ width: "100%" }} disabled={valueType !== "NUMBER"} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ON", label: "启用" },
                { value: "OFF", label: "停用" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="optionsText"
          label="单选选项（JSON）"
          extra='单选类型生效，字符串数组，例如 ["低","中","高"]'
        >
          <Input.TextArea rows={2} placeholder='["低","中","高"]' />
        </Form.Item>
        <Form.Item
          name="extraFieldsText"
          label="额外字段（JSON）"
          extra='对象数组，键为 key/label/type/required/unit/options，例如 [{"key":"dia","label":"舒张压"}]'
        >
          <Input.TextArea rows={4} placeholder='[{"key":"dia","label":"舒张压","type":"NUMBER","required":true,"unit":"mmHg","options":[]}]' />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 二、测量记录
// ============================================================================

function LogPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [metricId, setMetricId] = useState(0);
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const patients = usePatientOptions(shopId);
  const metrics = useHealthResource(
    () => healthApi.metrics({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const metricRows = metrics.data ?? [];

  const list = usePagedRows<HealthMetricLogRow>({
    load: () =>
      healthApi.metricLogs({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          patientId,
          metricId,
          abnormalOnly: abnormalOnly ? 1 : 0,
          from: range ? range[0].format("YYYY-MM-DD") : "",
          to: range ? range[1].format("YYYY-MM-DD") : "",
        },
      }),
    deps: [shopId, page, patientId, metricId, abnormalOnly, range ? range[0].valueOf() : 0, range ? range[1].valueOf() : 0],
    enabled: shopId > 0,
    errorText: "测量记录读取失败",
  });

  const remove = async (row: HealthMetricLogRow) => {
    setBusy(true);
    try {
      await healthApi.metricLogRemove({ body: { shopId, id: row.id } });
      message.success("测量记录已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMetricLogRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "指标", dataIndex: "metricName", width: 120 },
    {
      title: "数值",
      width: 120,
      render: (_: unknown, row) => (
        <span>{row.valueText ? `${row.valueText}${row.unit ? ` ${row.unit}` : ""}` : `${row.value}${row.unit || ""}`}</span>
      ),
    },
    {
      title: "状态",
      dataIndex: "abnormal",
      width: 110,
      render: (value: boolean, row) =>
        value ? (
          <Tag color="red">超出区间{row.abnormalDirection === "ABOVE" ? "↑" : row.abnormalDirection === "BELOW" ? "↓" : ""}</Tag>
        ) : (
          <Tag color="green">区间内</Tag>
        ),
    },
    {
      title: "测量时间",
      dataIndex: "measuredAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 100,
      render: (value: string) => SOURCE_LABELS[value] || value || "—",
    },
    { title: "录入人", dataIndex: "staffName", width: 110, render: (v: string) => v || "—" },
    { title: "备注", dataIndex: "note", render: (v: string) => v || "—" },
    {
      title: "操作",
      width: 90,
      render: (_: unknown, row) => (
        <Popconfirm title="删除后该次测量不再进入趋势，确认删除？" onConfirm={() => void remove(row)}>
          <Button size="small" type="text" danger loading={busy}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Panel
      title="测量记录"
      titleExtra={<span className="muted text-12">顾客自填、医护代录与设备导入的记录在这里统一核对</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setAdding(true)}>
          代录测量
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">就诊人</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={patientId}
            style={{ width: 200 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patients.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">指标</span>
          <Select
            value={metricId}
            style={{ width: 160 }}
            onChange={(value: number) => {
              setMetricId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部指标" },
              ...metricRows.map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">测量日期</span>
          <DatePicker.RangePicker
            value={range}
            onChange={(value) => {
              setPage(1);
              setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">只看超区间</span>
          <Switch
            checked={abnormalOnly}
            onChange={(value: boolean) => {
              setAbnormalOnly(value);
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {list.rows.length || list.loading ? (
        <DataTable
          rows={list.rows}
          columns={columns}
          total={list.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={list.loading || busy}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1240 }}
        />
      ) : (
        <EmptyState text="还没有测量记录：顾客在小程序自填，或在这里为就诊人代录。" />
      )}

      <LogModal
        shopId={shopId}
        open={adding}
        patientOptions={patients.options}
        metricRows={metricRows}
        onClose={() => setAdding(false)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

type LogFormValues = {
  patientId: number;
  metricId: number;
  value: number;
  valueText: string;
  measuredAt: Dayjs | null;
  note: string;
};

function LogModal({
  shopId,
  open,
  patientOptions,
  metricRows,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  patientOptions: { value: number; label: string }[];
  metricRows: HealthMetricRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<LogFormValues>();
  const [saving, setSaving] = useState(false);
  const defaultPatientId = patientOptions[0]?.value ?? 0;
  const defaultMetricId = metricRows[0]?.id ?? 0;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      patientId: defaultPatientId,
      metricId: defaultMetricId,
      value: 0,
      valueText: "",
      measuredAt: dayjs(),
      note: "",
    });
  }, [open, defaultPatientId, defaultMetricId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.metricLogSave({
        body: {
          shopId,
          patientId: Number(values.patientId),
          metricId: Number(values.metricId),
          value: Number(values.value ?? 0),
          valueText: values.valueText ?? "",
          measuredAt: values.measuredAt ? values.measuredAt.format("YYYY-MM-DD HH:mm") : "",
          note: values.note ?? "",
        },
      });
      message.success("测量记录已保存");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="代录测量记录"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={620}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="patientId"
            label="就诊人"
            rules={[{ required: true, message: "请选择就诊人" }]}
          >
            <Select showSearch optionFilterProp="label" options={patientOptions} />
          </Form.Item>
          <Form.Item
            name="metricId"
            label="指标"
            rules={[{ required: true, message: "请选择指标" }]}
          >
            <Select
              options={metricRows.map((row) => ({
                value: row.id,
                label: `${row.name}${row.unit ? `（${row.unit}）` : ""}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="value" label="数值" extra="文本类指标可留 0">
            <InputNumber min={-999999} max={999999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="valueText" label="文本结果" extra="如「阴性」，填了优先展示">
            <Input maxLength={120} placeholder="选填" />
          </Form.Item>
        </div>
        <Form.Item name="measuredAt" label="测量时间">
          <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="如 服药前 / 晨起空腹" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 三、趋势
// ============================================================================

function TrendPanel({ shopId }: { shopId: number }) {
  const [patientId, setPatientId] = useState(0);
  const [metricId, setMetricId] = useState(0);
  const [days, setDays] = useState(90);
  const [granularity, setGranularity] = useState("DAY");
  const patients = usePatientOptions(shopId);
  const metrics = useHealthResource(
    () => healthApi.metrics({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const metricRows = metrics.data ?? [];
  const trend = useHealthResource(
    () =>
      healthApi.metricTrend({
        query: { shopId, patientId, metricId, days, granularity: granularity as "DAY" | "WEEK" | "MONTH" },
      }),
    [shopId, patientId, metricId, days, granularity],
    shopId > 0 && patientId > 0 && metricId > 0,
  );

  return (
    <Panel
      title="趋势"
      titleExtra={<span className="muted text-12">按粒度聚合平均值，参考线只是管理目标区间</span>}
      extra={
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            value={patientId || undefined}
            placeholder="选择就诊人"
            style={{ width: 180 }}
            onChange={(value: number) => setPatientId(value)}
            options={patients.options}
          />
          <Select
            value={metricId || undefined}
            placeholder="选择指标"
            style={{ width: 150 }}
            onChange={(value: number) => setMetricId(value)}
            options={metricRows.map((row) => ({ value: row.id, label: row.name }))}
          />
          <Select
            value={days}
            style={{ width: 120 }}
            onChange={(value: number) => setDays(value)}
            options={DAYS_OPTIONS}
          />
          <Select
            value={granularity}
            style={{ width: 100 }}
            onChange={(value: string) => setGranularity(value)}
            options={GRANULARITY_OPTIONS}
          />
        </Space>
      }
    >
      {!patientId || !metricId ? (
        <EmptyState text="先选就诊人与指标，再选时间范围与粒度，就能看到这段时间的平均值走势。" />
      ) : trend.error ? (
        <LoadError text={trend.error} />
      ) : trend.data ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "指标", value: trend.data.metricName },
              {
                label: "目标区间",
                value: `${trend.data.normalLow} – ${trend.data.normalHigh}${trend.data.unit ? ` ${trend.data.unit}` : ""}`,
              },
              {
                label: "最近一次",
                value: trend.data.latest
                  ? `${trend.data.latest.value}${trend.data.latest.unit || ""} · ${fmtTime(trend.data.latest.measuredAt)}`
                  : "暂无记录",
              },
              {
                label: "基线均值",
                value: `${trend.data.baselineValue}${trend.data.unit ? ` ${trend.data.unit}` : ""}`,
              },
              { label: "聚合粒度", value: GRANULARITY_OPTIONS.find((item) => item.value === trend.data?.granularity)?.label || trend.data.granularity },
              { label: "数据点", value: trend.data.points.length },
            ]}
          />
          <TrendChart trend={trend.data} />
          <DataTable
            rows={trend.data.points}
            page={1}
            loading={trend.loading}
            rowKey="bucket"
            scroll={{ x: 560 }}
            columns={[
              { title: "时段", dataIndex: "bucket", width: 120 },
              { title: "次数", dataIndex: "count", width: 80 },
              {
                title: "平均",
                dataIndex: "avgValue",
                width: 100,
                render: (value: number) => `${value}${trend.data?.unit || ""}`,
              },
              {
                title: "最高",
                dataIndex: "maxValue",
                width: 100,
                render: (value: number) => `${value}${trend.data?.unit || ""}`,
              },
              {
                title: "最低",
                dataIndex: "minValue",
                width: 100,
                render: (value: number) => `${value}${trend.data?.unit || ""}`,
              },
              {
                title: "超区间次数",
                dataIndex: "abnormalCount",
                width: 110,
                render: (value: number) =>
                  value > 0 ? <Tag color="red">{value}</Tag> : <span className="muted">0</span>,
              },
            ]}
          />
        </div>
      ) : (
        <div className="muted text-12">正在读取趋势…</div>
      )}
    </Panel>
  );
}

/** 纯 CSS 柱线图：柱高按平均值，参考线按目标区间，基线用虚线横向标出。 */
function TrendChart({ trend }: { trend: HealthMetricTrend }) {
  const points = trend.points;
  if (!points.length) {
    return <EmptyState text="这段时间还没有测量记录，录几次测量值就能画出走势。" />;
  }
  const candidates = [
    ...points.flatMap((point) => [point.minValue, point.maxValue]),
    trend.normalLow,
    trend.normalHigh,
    trend.baselineValue,
  ].filter((value) => Number.isFinite(value));
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;
  const top = (value: number) => ((max - value) / span) * 100;
  const height = 200;

  return (
    <div>
      <div style={{ position: "relative", height, borderBottom: "1px solid var(--border)" }}>
        {[
          { label: `目标上限 ${trend.normalHigh}`, value: trend.normalHigh, color: "#faad14" },
          { label: `目标下限 ${trend.normalLow}`, value: trend.normalLow, color: "#faad14" },
          { label: `基线 ${trend.baselineValue}`, value: trend.baselineValue, color: "#8c8c8c" },
        ].map((line) => (
          <div
            key={line.label}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${top(line.value)}%`,
              borderTop: `1px dashed ${line.color}`,
            }}
          >
            <span
              className="text-12"
              style={{ position: "absolute", right: 0, top: -18, color: line.color }}
            >
              {line.label}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            height: "100%",
            padding: "0 8px",
          }}
        >
          {points.map((point) => (
            <div
              key={point.bucket}
              title={`${point.bucket} 平均 ${point.avgValue}${trend.unit} · ${point.count} 次 · 超区间 ${point.abnormalCount} 次`}
              style={{
                flex: 1,
                minWidth: 6,
                height: `${Math.max(2, ((point.avgValue - min) / span) * 100)}%`,
                background:
                  point.abnormalCount > 0 ? "var(--danger, #cf1322)" : "var(--primary, #1677ff)",
                borderRadius: "3px 3px 0 0",
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "4px 8px" }}>
        {points.map((point) => (
          <div
            key={point.bucket}
            className="muted text-12"
            style={{ flex: 1, minWidth: 6, textAlign: "center", overflow: "hidden" }}
          >
            {point.bucket}
          </div>
        ))}
      </div>
      <div className="muted text-12" style={{ marginTop: 4 }}>
        柱高为该时段平均值，红色表示该时段出现过超出目标区间的记录；目标区间与基线仅供参考，不做诊断。
      </div>
    </div>
  );
}

// ============================================================================
// 四、预警规则
// ============================================================================

function RulePanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const state = useHealthResource(
    () => healthApi.alertRules({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const metrics = useHealthResource(
    () => healthApi.metrics({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [editing, setEditing] = useState<HealthAlertRuleRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = state.data ?? [];
  const metricRows = metrics.data ?? [];

  const remove = async (row: HealthAlertRuleRow) => {
    setBusy(true);
    try {
      await healthApi.alertRuleRemove({ body: { shopId, id: row.id } });
      message.success("预警规则已删除");
      await state.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthAlertRuleRow> = [
    { title: "规则名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "指标", dataIndex: "metricName", width: 120 },
    {
      title: "判定方式",
      dataIndex: "ruleType",
      width: 130,
      render: (value: string) => ruleTypeLabel(meta, value),
    },
    {
      title: "阈值",
      width: 160,
      render: (_: unknown, row) => `${row.lowThreshold} – ${row.highThreshold}`,
    },
    {
      title: "相对基线",
      dataIndex: "deltaPercent",
      width: 100,
      render: (value: number) => (value > 0 ? `±${value}%` : "—"),
    },
    {
      title: "连续次数",
      dataIndex: "consecutiveTimes",
      width: 100,
      render: (value: number) => `${value} 次`,
    },
    {
      title: "统计窗口",
      dataIndex: "periodDays",
      width: 100,
      render: (value: number) => `${value} 天`,
    },
    {
      title: "通知对象",
      width: 180,
      render: (_: unknown, row) => {
        const targets = [
          row.notifyCustomer ? "顾客" : "",
          row.notifyOwner ? "健管师" : "",
          row.notifyShop ? "店主" : "",
        ].filter(Boolean);
        return targets.length ? targets.join("、") : "不通知";
      },
    },
    {
      title: "级别",
      dataIndex: "severity",
      width: 80,
      render: (value: string) => severityLabel(value),
    },
    { title: "命中", dataIndex: "hitCount", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 130,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm title="删除后该规则不再触发预警，历史预警保留，确认删除？" onConfirm={() => void remove(row)}>
            <Button size="small" type="text" danger loading={busy}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="预警规则"
      titleExtra={
        <span className="muted text-12">只提示超出管理目标区间，不下诊断</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增规则
        </Button>
      }
    >
      <Notice variant="info">
        规则只提示超出管理目标区间，不下诊断：命中后生成预警事件，按通知对象推给顾客、责任健管师或店主，处置结果记在事件里。
      </Notice>
      {state.error ? <LoadError text={state.error} /> : null}
      <div style={{ marginTop: 12 }}>
        {rows.length || state.loading ? (
          <DataTable
            rows={rows}
            columns={columns}
            page={1}
            loading={state.loading || busy}
            scroll={{ x: 1420 }}
          />
        ) : (
          <EmptyState text="还没有预警规则：给血压、血糖等指标配上目标区间与判定方式后才会产生预警。" />
        )}
      </div>
      <RuleModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        metricRows={metricRows}
        onClose={() => setEditing(null)}
        onDone={() => void state.reload()}
      />
    </Panel>
  );
}

type RuleFormValues = {
  name: string;
  metricId: number;
  ruleType: string;
  lowThreshold: number;
  highThreshold: number;
  deltaPercent: number;
  consecutiveTimes: number;
  periodDays: number;
  notifyCustomer: boolean;
  notifyOwner: boolean;
  notifyShop: boolean;
  severity: string;
  status: string;
};

function RuleModal({
  shopId,
  meta,
  editing,
  metricRows,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthAlertRuleRow | "new" | null;
  metricRows: HealthMetricRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RuleFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const defaultMetricId = metricRows[0]?.id ?? 0;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      metricId: row?.metricId || defaultMetricId,
      ruleType: row?.ruleType ?? "ABSOLUTE",
      lowThreshold: row?.lowThreshold ?? 0,
      highThreshold: row?.highThreshold ?? 0,
      deltaPercent: row?.deltaPercent ?? 20,
      consecutiveTimes: row?.consecutiveTimes ?? 2,
      periodDays: row?.periodDays ?? 7,
      notifyCustomer: row?.notifyCustomer ?? true,
      notifyOwner: row?.notifyOwner ?? true,
      notifyShop: row?.notifyShop ?? false,
      severity: row?.severity ?? "MEDIUM",
      status: row?.status ?? "ON",
    });
  }, [open, row, defaultMetricId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.alertRuleSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          metricId: Number(values.metricId),
          ruleType: values.ruleType as HealthAlertRuleRow["ruleType"],
          lowThreshold: Number(values.lowThreshold ?? 0),
          highThreshold: Number(values.highThreshold ?? 0),
          deltaPercent: Number(values.deltaPercent ?? 20),
          consecutiveTimes: Number(values.consecutiveTimes ?? 2),
          periodDays: Number(values.periodDays ?? 7),
          notifyCustomer: Boolean(values.notifyCustomer),
          notifyOwner: Boolean(values.notifyOwner),
          notifyShop: Boolean(values.notifyShop),
          severity: values.severity || "MEDIUM",
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("预警规则已保存");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑规则 · ${row.name}` : "新增预警规则"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={700}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: "请填写规则名称" }]}>
            <Input maxLength={60} placeholder="如 收缩压偏高提醒" />
          </Form.Item>
          <Form.Item
            name="metricId"
            label="指标"
            rules={[{ required: true, message: "请选择指标" }]}
          >
            <Select
              options={metricRows.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="选择指标"
            />
          </Form.Item>
          <Form.Item name="ruleType" label="判定方式">
            <Select
              options={HEALTH_ALERT_RULE_TYPES.map((value) => ({
                value,
                label: ruleTypeLabel(meta, value),
              }))}
            />
          </Form.Item>
          <Form.Item name="lowThreshold" label="低阈值" extra="0 表示不限下限">
            <InputNumber min={-999999} max={999999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="highThreshold" label="高阈值" extra="0 表示不限上限">
            <InputNumber min={-999999} max={999999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deltaPercent" label="相对基线偏移" extra="仅相对基线判定使用">
            <InputNumber min={1} max={500} precision={0} suffix="%" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="consecutiveTimes" label="连续次数">
            <InputNumber min={1} max={30} precision={0} suffix="次" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="periodDays" label="统计窗口">
            <InputNumber min={1} max={365} precision={0} suffix="天" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="severity" label="预警级别">
            <Select options={SEVERITY_OPTIONS} />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="notifyCustomer" label="通知顾客" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notifyOwner" label="通知责任健管师" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notifyShop" label="通知店主" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ON", label: "启用" },
                { value: "OFF", label: "停用" },
              ]}
            />
          </Form.Item>
        </div>
        <Notice variant="warn">
          只提示超出管理目标区间，不下诊断：命中只生成提醒事件与通知，具体判断由医护人工确认。
        </Notice>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 五、预警事件
// ============================================================================

function AlertPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [ruleId, setRuleId] = useState(0);
  const [alertStatus, setAlertStatus] = useState("all");
  const [handling, setHandling] = useState<HealthAlertRow | null>(null);
  const patients = usePatientOptions(shopId);
  const rules = useHealthResource(
    () => healthApi.alertRules({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );

  const list = usePagedRows<HealthAlertRow>({
    load: () =>
      healthApi.alerts({
        query: { shopId, page, pageSize: PAGE_SIZE, patientId, ruleId, alertStatus },
      }),
    deps: [shopId, page, patientId, ruleId, alertStatus],
    enabled: shopId > 0,
    errorText: "预警事件读取失败",
  });

  const columns: ColumnsType<HealthAlertRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "规则", dataIndex: "ruleName", width: 150, render: (v: string) => v || "—" },
    { title: "指标", dataIndex: "metricName", width: 110 },
    {
      title: "数值",
      width: 100,
      render: (_: unknown, row) => `${row.value}${row.unit || ""}`,
    },
    { title: "阈值", dataIndex: "thresholdText", width: 120, render: (v: string) => v || "—" },
    {
      title: "级别",
      dataIndex: "severity",
      width: 80,
      render: (value: string) => severityLabel(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <AlertStatusTag value={value} />,
    },
    {
      title: "测量时间",
      dataIndex: "measuredAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "责任健管师",
      dataIndex: "ownerPractitionerName",
      width: 120,
      render: (v: string) => v || "未指定",
    },
    { title: "处置备注", dataIndex: "handleNote", render: (v: string) => v || "—" },
    {
      title: "操作",
      width: 90,
      fixed: "right",
      render: (_: unknown, row) => (
        <Button size="small" type="text" onClick={() => setHandling(row)}>
          处置
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="预警事件"
      titleExtra={<span className="muted text-12">预警只表示超出管理目标区间，处置结论由医护填写</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">就诊人</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={patientId}
            style={{ width: 200 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patients.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">规则</span>
          <Select
            value={ruleId}
            style={{ width: 190 }}
            onChange={(value: number) => {
              setRuleId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部规则" },
              ...(rules.data ?? []).map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={alertStatus}
            style={{ width: 130 }}
            onChange={(value: string) => {
              setAlertStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              { value: "OPEN", label: "待处理" },
              { value: "ACKED", label: "处理中" },
              { value: "RESOLVED", label: "已闭环" },
              { value: "FALSE", label: "误报" },
            ]}
          />
        </div>
      </FilterBar>

      {list.rows.length || list.loading ? (
        <DataTable
          rows={list.rows}
          columns={columns}
          total={list.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={list.loading}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1380 }}
        />
      ) : (
        <EmptyState text="还没有预警事件：规则命中后才会在这里生成事件，可标记处理中、已闭环或误报。" />
      )}

      <AlertHandleModal
        shopId={shopId}
        row={handling}
        onClose={() => setHandling(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function AlertHandleModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthAlertRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ status: string; note: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({ status: row.status === "OPEN" ? "ACKED" : row.status, note: row.handleNote });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.alertHandle({
        body: {
          shopId,
          id: row.id,
          status: values.status as HealthAlertRow["status"],
          note: values.note ?? "",
        },
      });
      message.success("预警事件已处置");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "处置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `处置预警 · ${row.patientName}` : "处置预警"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交处置"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      {row ? (
        <div style={{ marginBottom: 12 }}>
          <Descriptions
            items={[
              { label: "指标", value: row.metricName || "—" },
              { label: "数值", value: `${row.value}${row.unit || ""}` },
              { label: "阈值", value: row.thresholdText || "—" },
              { label: "级别", value: severityLabel(row.severity) },
              { label: "测量时间", value: row.measuredAt ? fmtTime(row.measuredAt) : "—" },
            ]}
          />
        </div>
      ) : null}
      <Form form={form} layout="vertical">
        <Form.Item name="status" label="处置结果">
          <Select
            options={[
              { value: "ACKED", label: "处理中（已联系，继续观察）" },
              { value: "RESOLVED", label: "已闭环（已复测或已就医）" },
              { value: "FALSE", label: "误报（设备或录入有误）" },
              { value: "OPEN", label: "退回待处理" },
            ]}
          />
        </Form.Item>
        <Form.Item name="note" label="处置备注" extra="写清联系情况与建议，顾客端与随访会引用">
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="如 已电话联系，嘱明日晨起复测" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
