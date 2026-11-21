"use client";

import {
  App,
  Button,
  DatePicker,
  Drawer,
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
  HealthFollowupTaskRow,
  HealthMeta,
  HealthPatientPlanRow,
  HealthPlanRow,
  HealthSurveyAnswerRow,
  HealthSurveyDetail,
  HealthSurveyRow,
} from "@enterprise/contracts";
import {
  HEALTH_CROWD_KINDS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_FOLLOWUP_STATUS_LABELS,
  HEALTH_FOLLOWUP_WAYS,
  HEALTH_FOLLOWUP_WAY_LABELS,
  HEALTH_PLAN_STEP_TYPES,
  HEALTH_PLAN_STEP_TYPE_LABELS,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtDate, fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  DataTable,
  Descriptions,
  FilterBar,
  LoadError,
  OnOffTag,
  StatusTag,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 方案与随访：管理方案、患者方案、随访任务、量表问卷、答卷记录。
 * 口径是「按方案提醒、按任务随访」：问卷只给风险提示，页面不出现诊断结论。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

type Paged<T> = { list: T[]; total: number } | null;

const FOLLOWUP_TONE: Record<string, string> = {
  PENDING: "gold",
  DONE: "green",
  SKIPPED: "default",
  OVERDUE: "red",
  CANCELLED: "default",
};

const PATIENT_PLAN_STATUSES = ["RUNNING", "PAUSED", "DONE", "DROPPED"] as const;
type PatientPlanStatus = (typeof PATIENT_PLAN_STATUSES)[number];
const PATIENT_PLAN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "执行中",
  PAUSED: "已暂停",
  DONE: "已完成",
  DROPPED: "已中止",
};
const PATIENT_PLAN_TONE: Record<string, string> = {
  RUNNING: "blue",
  PAUSED: "gold",
  DONE: "green",
  DROPPED: "default",
};

const SURVEY_QUESTION_TYPES = ["SINGLE", "MULTI", "NUMBER", "TEXT"] as const;
const SURVEY_QUESTION_TYPE_LABELS: Record<string, string> = {
  SINGLE: "单选",
  MULTI: "多选",
  NUMBER: "数值",
  TEXT: "文本",
};

const RECORD_STATUSES = ["DONE", "SKIPPED", "CANCELLED"] as const;
const RECORD_STATUS_LABELS: Record<string, string> = {
  DONE: "已完成",
  SKIPPED: "已跳过",
  CANCELLED: "已取消",
};

/** 平台字典优先，字典缺该项时回落契约常量，不把枚举原样甩到界面。 */
const crowdLabel = (meta: HealthMeta | null, value: string) => {
  const text = labelOf(meta, "crowdKinds", value);
  return text === value ? HEALTH_CROWD_KIND_LABELS[value] || value : text;
};
const wayLabel = (meta: HealthMeta | null, value: string) => {
  const text = labelOf(meta, "followupWays", value);
  return text === value ? HEALTH_FOLLOWUP_WAY_LABELS[value] || value : text;
};
const stepTypeLabel = (value: string) =>
  HEALTH_PLAN_STEP_TYPE_LABELS[value] || value;

function FollowupStatusTag({ value }: { value: string }) {
  return (
    <Tag color={FOLLOWUP_TONE[value] ?? "default"}>
      {HEALTH_FOLLOWUP_STATUS_LABELS[value] || value}
    </Tag>
  );
}

function PatientPlanStatusTag({ value }: { value: string }) {
  return (
    <Tag color={PATIENT_PLAN_TONE[value] ?? "default"}>
      {PATIENT_PLAN_STATUS_LABELS[value] || value}
    </Tag>
  );
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

/** 就诊人下拉：一家店前 100 位够用。 */
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
  };
}

function usePractitionerOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.practitioners({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return {
    rows,
    options: rows.map((row) => ({ value: row.id, label: row.name })),
  };
}

function usePlanOptions(shopId: number) {
  const state = useHealthResource(
    () =>
      healthApi.plans({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, crowdKind: "all" },
      }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return { rows, options: rows.map((row) => ({ value: row.id, label: row.name })) };
}

function useSurveyOptions(shopId: number) {
  const state = useHealthResource(
    () =>
      healthApi.surveys({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, crowdKind: "all" },
      }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return { rows, options: rows.map((row) => ({ value: row.id, label: row.title })) };
}

function useMetricOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.metrics({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data ?? [];
  return { rows, options: rows.map((row) => ({ value: row.id, label: `${row.name}${row.unit ? `（${row.unit}）` : ""}` })) };
}

export function FollowupsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("plans");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "plans", label: "管理方案", children: <PlanPanel shopId={shopId} meta={meta} /> },
        {
          key: "patientPlans",
          label: "患者方案",
          children: <PatientPlanPanel shopId={shopId} />,
        },
        { key: "tasks", label: "随访任务", children: <TaskPanel shopId={shopId} meta={meta} /> },
        { key: "surveys", label: "量表问卷", children: <SurveyPanel shopId={shopId} meta={meta} /> },
        {
          key: "answers",
          label: "答卷记录",
          children: <AnswerPanel shopId={shopId} />,
        },
      ]}
    />
  );
}

// ============================================================================
// 一、管理方案
// ============================================================================

type PlanStepValues = {
  type: string;
  name: string;
  dayOffset: number;
  repeatEveryDays: number;
  refId: number;
  required: boolean;
};

type PlanFormValues = {
  name: string;
  crowdKind: string;
  cycleDays: number;
  desc: string;
  status: string;
  steps: PlanStepValues[];
};

function PlanPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [crowdKind, setCrowdKind] = useState("all");
  const [editing, setEditing] = useState<HealthPlanRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const list = usePagedRows<HealthPlanRow>({
    load: () =>
      healthApi.plans({ query: { shopId, page, pageSize: PAGE_SIZE, crowdKind } }),
    deps: [shopId, page, crowdKind],
    enabled: shopId > 0,
    errorText: "管理方案读取失败",
  });

  const remove = async (row: HealthPlanRow) => {
    setBusy(true);
    try {
      await healthApi.planRemove({ body: { shopId, id: row.id } });
      message.success("管理方案已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthPlanRow> = [
    { title: "方案名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    {
      title: "适用人群",
      dataIndex: "crowdKind",
      width: 110,
      render: (value: string) => crowdLabel(meta, value),
    },
    { title: "周期（天）", dataIndex: "cycleDays", width: 100 },
    {
      title: "步骤",
      dataIndex: "steps",
      width: 220,
      render: (value: HealthPlanRow["steps"]) =>
        value.length
          ? value
              .slice(0, 3)
              .map((step) => `${stepTypeLabel(step.type)}第 ${step.dayOffset} 天`)
              .join("、") + (value.length > 3 ? ` 等 ${value.length} 步` : "")
          : "—",
    },
    { title: "执行中", dataIndex: "runningCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 130,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除方案不影响已开始的随访，后续不再按它派任务，确认删除？"
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
      title="管理方案"
      titleExtra={<span className="muted text-12">方案是「第几天做什么」的模板，患者方案按它派生随访任务</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增方案
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">适用人群</span>
          <Select
            value={crowdKind}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setCrowdKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部人群" },
              ...HEALTH_CROWD_KINDS.map((value) => ({
                value,
                label: crowdLabel(meta, value),
              })),
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
          loading={list.loading || busy}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1240 }}
        />
      ) : (
        <EmptyState text="还没有管理方案：先建一条高血压或糖尿病方案，再给患者启用。" />
      )}

      <PlanModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function PlanModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthPlanRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PlanFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      crowdKind: row?.crowdKind ?? "ALL",
      cycleDays: row?.cycleDays ?? 90,
      desc: row?.desc ?? "",
      status: row?.status ?? "ON",
      steps:
        row?.steps.map((step) => ({
          type: step.type,
          name: step.name,
          dayOffset: step.dayOffset,
          repeatEveryDays: step.repeatEveryDays,
          refId: step.refId,
          required: step.required,
        })) ?? [],
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.planSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          crowdKind: values.crowdKind as HealthPlanRow["crowdKind"],
          cycleDays: Number(values.cycleDays ?? 90),
          desc: values.desc ?? "",
          status: values.status === "OFF" ? "OFF" : "ON",
          steps: (values.steps ?? []).map((step) => ({
            type: step.type as (typeof HEALTH_PLAN_STEP_TYPES)[number],
            name: step.name ?? "",
            dayOffset: Number(step.dayOffset ?? 1),
            repeatEveryDays: Number(step.repeatEveryDays ?? 0),
            refId: Number(step.refId ?? 0),
            required: Boolean(step.required),
          })),
        },
      });
      message.success("管理方案已保存");
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
      title={row ? `编辑方案 · ${row.name}` : "新增管理方案"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={860}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 140px", gap: 12 }}>
          <Form.Item
            name="name"
            label="方案名称"
            rules={[{ required: true, message: "请填写方案名称" }]}
          >
            <Input maxLength={80} placeholder="例如：高血压 90 天管理方案" />
          </Form.Item>
          <Form.Item name="crowdKind" label="适用人群">
            <Select
              options={HEALTH_CROWD_KINDS.map((value) => ({
                value,
                label: crowdLabel(meta, value),
              }))}
            />
          </Form.Item>
          <Form.Item name="cycleDays" label="周期（天）">
            <InputNumber min={1} max={730} precision={0} style={{ width: "100%" }} />
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
        <Form.Item name="desc" label="方案说明">
          <Input.TextArea rows={2} maxLength={2000} showCount placeholder="适用条件、注意事项" />
        </Form.Item>
        <Form.Item label="步骤" extra="第几天触发 + 是否按间隔重复；关联编号对应指标、量表或宣教内容">
          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                {fields.map((field, index) => (
                  <div
                    key={field.key}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="muted text-12">步骤 {index + 1}</span>
                      <Button size="small" type="text" danger onClick={() => remove(field.name)}>
                        移除
                      </Button>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "130px 1fr 100px 110px 110px 70px",
                        gap: 8,
                      }}
                    >
                      <Form.Item name={[field.name, "type"]} label="类型" style={{ marginBottom: 0 }}>
                        <Select
                          options={HEALTH_PLAN_STEP_TYPES.map((value) => ({
                            value,
                            label: stepTypeLabel(value),
                          }))}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, "name"]} label="名称" style={{ marginBottom: 0 }}>
                        <Input maxLength={60} placeholder="展示给患者的步骤名" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "dayOffset"]}
                        label="第几天"
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={1} max={730} precision={0} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "repeatEveryDays"]}
                        label="每几天重复"
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} max={365} precision={0} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "refId"]}
                        label="关联编号"
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "required"]}
                        label="必做"
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                  </div>
                ))}
                <Button
                  size="small"
                  onClick={() =>
                    add({
                      type: "FOLLOWUP",
                      name: "",
                      dayOffset: 1,
                      repeatEveryDays: 0,
                      refId: 0,
                      required: true,
                    })
                  }
                >
                  添加步骤
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 二、患者方案
// ============================================================================

type StartFormValues = {
  planId: number;
  patientIds: number[];
  practitionerId: number;
  startAt: Dayjs | null;
  cycleDays: number;
};

type StatusFormValues = { status: PatientPlanStatus; reason: string };

function PatientPlanPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [planId, setPlanId] = useState(0);
  const [patientId, setPatientId] = useState(0);
  const [planStatus, setPlanStatus] = useState("all");
  const [starting, setStarting] = useState(false);
  const [statusRow, setStatusRow] = useState<HealthPatientPlanRow | null>(null);

  const plans = usePlanOptions(shopId);
  const patients = usePatientOptions(shopId);
  const practitioners = usePractitionerOptions(shopId);

  const list = usePagedRows<HealthPatientPlanRow>({
    load: () =>
      healthApi.patientPlans({
        query: { shopId, page, pageSize: PAGE_SIZE, planId, patientId, planStatus },
      }),
    deps: [shopId, page, planId, patientId, planStatus],
    enabled: shopId > 0,
    errorText: "患者方案读取失败",
  });

  const columns: ColumnsType<HealthPatientPlanRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "方案", dataIndex: "planName", render: (value: string) => <strong>{value}</strong> },
    {
      title: "责任医护",
      dataIndex: "practitionerName",
      width: 120,
      render: (value: string) => value || "未指定",
    },
    {
      title: "开始",
      dataIndex: "startAt",
      width: 110,
      render: (value: string) => (value ? fmtDate(value) : "—"),
    },
    {
      title: "结束",
      dataIndex: "endAt",
      width: 110,
      render: (value: string) => (value ? fmtDate(value) : "—"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <PatientPlanStatusTag value={value} />,
    },
    {
      title: "进度",
      dataIndex: "progressPercent",
      width: 150,
      render: (value: number, row) => `${value}%（${row.stepDoneCount}/${row.stepTotalCount} 步）`,
    },
    {
      title: "操作",
      width: 110,
      fixed: "right",
      render: (_: unknown, row) => (
        <Button size="small" type="text" onClick={() => setStatusRow(row)}>
          调整状态
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="患者方案"
      titleExtra={<span className="muted text-12">开始后按方案周期派随访任务，暂停或中止即停止派发</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setStarting(true)}>
          开始方案
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">方案</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={planId}
            style={{ width: 200 }}
            onChange={(value: number) => {
              setPlanId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部方案" }, ...plans.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">就诊人</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={patientId}
            style={{ width: 180 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patients.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={planStatus}
            style={{ width: 130 }}
            onChange={(value: string) => {
              setPlanStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...PATIENT_PLAN_STATUSES.map((value) => ({
                value,
                label: PATIENT_PLAN_STATUS_LABELS[value],
              })),
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
          scroll={{ x: 1080 }}
        />
      ) : (
        <EmptyState text="还没有患者方案：选一条管理方案，批量给就诊人开始。" />
      )}

      <StartModal
        shopId={shopId}
        open={starting}
        planOptions={plans.options}
        patientOptions={patients.options}
        practitionerOptions={practitioners.options}
        onClose={() => setStarting(false)}
        onDone={() => void list.reload()}
      />
      <PlanStatusModal
        shopId={shopId}
        row={statusRow}
        onClose={() => setStatusRow(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function StartModal({
  shopId,
  open,
  planOptions,
  patientOptions,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  planOptions: { value: number; label: string }[];
  patientOptions: { value: number; label: string }[];
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StartFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ patientIds: [], practitionerId: 0, startAt: null, cycleDays: 0 });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await healthApi.patientPlanStart({
        body: {
          shopId,
          planId: Number(values.planId),
          patientIds: values.patientIds ?? [],
          practitionerId: Number(values.practitionerId ?? 0),
          startAt: values.startAt ? values.startAt.format("YYYY-MM-DD") : "",
          cycleDays: Number(values.cycleDays ?? 0),
        },
      });
      message.success(
        result?.message || `已开始 ${result?.started ?? 0} 位，跳过 ${result?.skipped ?? 0} 位`,
      );
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "开始失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="开始患者方案"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="开始"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="planId"
          label="管理方案"
          rules={[{ required: true, message: "请选择管理方案" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择方案"
            options={planOptions}
          />
        </Form.Item>
        <Form.Item
          name="patientIds"
          label="就诊人"
          rules={[{ required: true, message: "请选择就诊人" }]}
          extra="支持多选，已在执行同一方案的就诊人会被跳过"
        >
          <Select
            mode="multiple"
            maxTagCount={6}
            showSearch
            optionFilterProp="label"
            placeholder="选择就诊人"
            options={patientOptions}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="practitionerId" label="责任医护">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "暂不指定" }, ...practitionerOptions]}
            />
          </Form.Item>
          <Form.Item name="startAt" label="开始日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="cycleDays" label="周期（天）" extra="0 = 按方案周期">
            <InputNumber min={0} max={730} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function PlanStatusModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthPatientPlanRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StatusFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({
      status: (PATIENT_PLAN_STATUSES as readonly string[]).includes(row.status)
        ? (row.status as PatientPlanStatus)
        : "PAUSED",
      reason: "",
    });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.patientPlanStatus({
        body: { shopId, id: row.id, status: values.status, reason: values.reason ?? "" },
      });
      message.success("患者方案状态已更新");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "更新失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `调整状态 · ${row.patientName} / ${row.planName}` : "调整状态"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="status" label="目标状态">
          <Select
            options={PATIENT_PLAN_STATUSES.map((value) => ({
              value,
              label: PATIENT_PLAN_STATUS_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="reason" label="原因" extra="暂停、中止时建议写明原因，便于复核">
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 三、随访任务
// ============================================================================

type TaskFormValues = {
  patientIds: number[];
  title: string;
  content: string;
  way: string;
  planAt: Dayjs | null;
  practitionerId: number;
};

type RecordFormValues = {
  status: (typeof RECORD_STATUSES)[number];
  conclusion: string;
  reason: string;
  nextAt: Dayjs | null;
  metrics: { metricId: number; value: number; measuredAt: Dayjs | null }[];
  attachments: { name: string; url: string }[];
};

function TaskPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [practitionerId, setPractitionerId] = useState(0);
  const [taskStatus, setTaskStatus] = useState("all");
  const [way, setWay] = useState("all");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(0);
  const [assignRow, setAssignRow] = useState<HealthFollowupTaskRow | null>(null);
  const [busy, setBusy] = useState(false);

  const patients = usePatientOptions(shopId);
  const practitioners = usePractitionerOptions(shopId);

  const list = usePagedRows<HealthFollowupTaskRow>({
    load: () =>
      healthApi.followupTasks({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          patientId,
          practitionerId,
          taskStatus,
          way,
          from: range?.[0] ? range[0].format("YYYY-MM-DD") : "",
          to: range?.[1] ? range[1].format("YYYY-MM-DD") : "",
        },
      }),
    deps: [shopId, page, patientId, practitionerId, taskStatus, way, range],
    enabled: shopId > 0,
    errorText: "随访任务读取失败",
  });

  const remove = async (row: HealthFollowupTaskRow) => {
    setBusy(true);
    try {
      await healthApi.followupRemove({ body: { shopId, id: row.id } });
      message.success("随访任务已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthFollowupTaskRow> = [
    {
      title: "就诊人",
      dataIndex: "patientName",
      width: 100,
      render: (value: string, row) => (
        <a onClick={() => setDetailId(row.id)}>{value}</a>
      ),
    },
    { title: "任务", dataIndex: "title", render: (value: string) => <strong>{value || "随访"}</strong> },
    {
      title: "方式",
      dataIndex: "way",
      width: 130,
      render: (value: string) => wayLabel(meta, value),
    },
    {
      title: "来源方案",
      dataIndex: "planName",
      width: 150,
      render: (value: string) => value || "手工创建",
    },
    {
      title: "计划时间",
      dataIndex: "planAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <FollowupStatusTag value={value} />,
    },
    {
      title: "责任医护",
      dataIndex: "practitionerName",
      width: 110,
      render: (value: string) => value || "未指派",
    },
    {
      title: "逾期",
      dataIndex: "overdueHours",
      width: 80,
      render: (value: number) => (value > 0 ? `${value} 小时` : "—"),
    },
    {
      title: "操作",
      width: 190,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetailId(row.id)}>
            随访
          </Button>
          <Button size="small" type="text" onClick={() => setAssignRow(row)}>
            转派
          </Button>
          <Popconfirm
            title="删除后该随访任务与其记录不再展示，确认删除？"
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
      title="随访任务"
      titleExtra={<span className="muted text-12">任务来自方案或手工创建，登记结论后才会闭环</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setCreating(true)}>
          新建随访
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
            style={{ width: 180 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patients.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">责任医护</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 150 }}
            onChange={(value: number) => {
              setPractitionerId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医护" }, ...practitioners.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={taskStatus}
            style={{ width: 120 }}
            onChange={(value: string) => {
              setTaskStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...Object.entries(HEALTH_FOLLOWUP_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">方式</span>
          <Select
            value={way}
            style={{ width: 140 }}
            onChange={(value: string) => {
              setWay(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部方式" },
              ...HEALTH_FOLLOWUP_WAYS.map((value) => ({
                value,
                label: wayLabel(meta, value),
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">计划日期</span>
          <DatePicker.RangePicker
            value={range}
            onChange={(value) => {
              setRange(value as [Dayjs, Dayjs] | null);
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
          scroll={{ x: 1320 }}
        />
      ) : (
        <EmptyState text="还没有随访任务：启用患者方案会自动派任务，也可以手工新建。" />
      )}

      <TaskCreateModal
        shopId={shopId}
        meta={meta}
        open={creating}
        patientOptions={patients.options}
        practitionerOptions={practitioners.options}
        onClose={() => setCreating(false)}
        onDone={() => void list.reload()}
      />
      <TaskDetailDrawer
        shopId={shopId}
        taskId={detailId}
        meta={meta}
        onClose={() => setDetailId(0)}
        onSaved={() => void list.reload()}
      />
      <TaskAssignModal
        shopId={shopId}
        row={assignRow}
        practitionerOptions={practitioners.options}
        onClose={() => setAssignRow(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function TaskCreateModal({
  shopId,
  meta,
  open,
  patientOptions,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  open: boolean;
  patientOptions: { value: number; label: string }[];
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      patientIds: [],
      title: "随访提醒",
      content: "",
      way: "PHONE",
      planAt: dayjs().add(1, "hour"),
      practitionerId: 0,
    });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await healthApi.followupCreate({
        body: {
          shopId,
          patientIds: values.patientIds ?? [],
          title: values.title ?? "",
          content: values.content ?? "",
          way: (values.way || "PHONE") as (typeof HEALTH_FOLLOWUP_WAYS)[number],
          planAt: values.planAt ? values.planAt.format("YYYY-MM-DD HH:mm") : "",
          practitionerId: Number(values.practitionerId ?? 0),
        },
      });
      message.success(result?.message || `已创建 ${result?.created ?? 0} 条随访任务`);
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建随访任务"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="创建"
      confirmLoading={saving}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="patientIds"
          label="就诊人"
          rules={[{ required: true, message: "请选择就诊人" }]}
          extra="支持多选，每位就诊人生成一条任务"
        >
          <Select
            mode="multiple"
            maxTagCount={6}
            showSearch
            optionFilterProp="label"
            placeholder="选择就诊人"
            options={patientOptions}
          />
        </Form.Item>
        <Form.Item name="title" label="任务标题" rules={[{ required: true, message: "请填写任务标题" }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="content" label="随访内容">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="电话要问哪些问题、注意事项" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="way" label="随访方式">
            <Select
              options={HEALTH_FOLLOWUP_WAYS.map((value) => ({
                value,
                label: wayLabel(meta, value),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="planAt"
            label="计划时间"
            rules={[{ required: true, message: "请选择计划时间" }]}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="practitionerId" label="责任医护">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "暂不指定" }, ...practitionerOptions]}
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function TaskDetailDrawer({
  shopId,
  taskId,
  meta,
  onClose,
  onSaved,
}: {
  shopId: number;
  taskId: number;
  meta: HealthMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detail = useHealthResource(
    () => healthApi.followupDetail({ query: { shopId, id: taskId } }),
    [shopId, taskId],
    shopId > 0 && taskId > 0,
  );
  const task = detail.data?.task ?? null;
  const records = detail.data?.records ?? [];

  const recordColumns: ColumnsType<(typeof records)[number]> = [
    { title: "结论", dataIndex: "conclusion", render: (value: string) => value || "—" },
    { title: "医护", dataIndex: "practitionerName", width: 100 },
    {
      title: "下次随访",
      dataIndex: "nextAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "登记时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Drawer
      open={taskId > 0}
      size="large"
      title={task ? `随访 · ${task.patientName} · ${task.title || "随访"}` : "随访任务"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail.error ? <LoadError text={detail.error} /> : null}
      {task ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "就诊人", value: task.patientName },
              { label: "方式", value: wayLabel(meta, task.way) },
              { label: "来源", value: task.planName || "手工创建" },
              { label: "计划时间", value: task.planAt ? fmtTime(task.planAt) : "—" },
              { label: "状态", value: <FollowupStatusTag value={task.status} /> },
              { label: "责任医护", value: task.practitionerName || "未指派" },
              { label: "人群", value: task.crowdNames.length ? task.crowdNames.join("、") : "—" },
              { label: "完成时间", value: task.doneAt ? fmtTime(task.doneAt) : "—" },
            ]}
          />
          <div>
            <div className="muted text-12">随访内容</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{task.content || "—"}</div>
          </div>
          <div>
            <strong>随访记录</strong>
            {records.length ? (
              <DataTable
                rows={records}
                columns={recordColumns}
                page={1}
                loading={detail.loading}
                scroll={{ x: 620 }}
              />
            ) : (
              <div style={{ marginTop: 4 }} className="muted text-12">
                还没有登记记录。
              </div>
            )}
          </div>
          <TaskRecordForm
            key={task.id}
            shopId={shopId}
            taskId={task.id}
            onSaved={() => {
              void detail.reload();
              onSaved();
            }}
          />
        </div>
      ) : detail.loading ? (
        <div className="muted text-12">正在读取随访详情…</div>
      ) : null}
    </Drawer>
  );
}

function TaskRecordForm({
  shopId,
  taskId,
  onSaved,
}: {
  shopId: number;
  taskId: number;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RecordFormValues>();
  const [saving, setSaving] = useState(false);
  const metrics = useMetricOptions(shopId);
  const status = Form.useWatch("status", form) ?? "DONE";

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.followupSave({
        body: {
          shopId,
          taskId,
          conclusion: values.conclusion ?? "",
          nextAt: values.nextAt ? values.nextAt.format("YYYY-MM-DD HH:mm") : "",
          metrics: (values.metrics ?? [])
            .filter((item) => Number(item.metricId) > 0 && Number.isFinite(Number(item.value)))
            .map((item) => ({
              metricId: Number(item.metricId),
              value: Number(item.value),
              measuredAt: item.measuredAt ? item.measuredAt.format("YYYY-MM-DD HH:mm") : "",
            })),
          attachments: (values.attachments ?? [])
            .filter((item) => String(item?.url ?? "").trim())
            .map((item) => ({
              name: String(item.name ?? "").slice(0, 80) || "附件",
              url: String(item.url).slice(0, 500),
            })),
          reason: values.reason ?? "",
          status: values.status ?? "DONE",
        },
      });
      message.success("随访记录已保存");
      form.resetFields();
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        status: "DONE",
        conclusion: "",
        reason: "",
        nextAt: null,
        metrics: [],
        attachments: [],
      }}
      style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}
    >
      <strong>登记本次随访</strong>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 200px", gap: 12, marginTop: 12 }}>
        <Form.Item name="status" label="结果">
          <Select
            options={RECORD_STATUSES.map((value) => ({
              value,
              label: RECORD_STATUS_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="conclusion"
          label="随访结论"
          rules={[
            {
              required: status === "DONE",
              message: "完成随访需填写结论",
            },
          ]}
        >
          <Input.TextArea rows={2} maxLength={2000} showCount placeholder="沟通要点、患者反馈" />
        </Form.Item>
        <Form.Item name="nextAt" label="下次随访时间">
          <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </div>
      {status !== "DONE" ? (
        <Form.Item
          name="reason"
          label="原因"
          rules={[{ required: true, message: "请填写原因" }]}
        >
          <Input maxLength={200} placeholder="跳过或取消的原因" />
        </Form.Item>
      ) : null}
      <Form.Item label="本次指标" extra="登记本次测量值，留空则不记录">
        <Form.List name="metrics">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {fields.map((field) => (
                <Space key={field.key} align="end" wrap>
                  <Form.Item name={[field.name, "metricId"]} noStyle>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="指标"
                      style={{ width: 200 }}
                      options={metrics.options}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "value"]} noStyle>
                    <InputNumber
                      placeholder="数值"
                      min={-999999}
                      max={999999}
                      style={{ width: 120 }}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "measuredAt"]} noStyle>
                    <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: 180 }} />
                  </Form.Item>
                  <Button size="small" onClick={() => remove(field.name)}>
                    移除
                  </Button>
                </Space>
              ))}
              <Button size="small" disabled={fields.length >= 20} onClick={() => add({})}>
                添加指标
              </Button>
            </Space>
          )}
        </Form.List>
      </Form.Item>
      <Form.Item label="附件" extra="图片或报告直链，最多 9 个">
        <Form.List name="attachments">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {fields.map((field) => (
                <Space key={field.key} align="end" wrap>
                  <Form.Item name={[field.name, "name"]} noStyle>
                    <Input placeholder="附件名" maxLength={80} style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item name={[field.name, "url"]} noStyle>
                    <Input placeholder="https://…" maxLength={500} style={{ width: 360 }} />
                  </Form.Item>
                  <Button size="small" onClick={() => remove(field.name)}>
                    移除
                  </Button>
                </Space>
              ))}
              <Button size="small" disabled={fields.length >= 9} onClick={() => add({})}>
                添加附件
              </Button>
            </Space>
          )}
        </Form.List>
      </Form.Item>
      <Button type="primary" loading={saving} onClick={() => void submit()}>
        保存记录
      </Button>
    </Form>
  );
}

function TaskAssignModal({
  shopId,
  row,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthFollowupTaskRow | null;
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ practitionerId: number }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({ practitionerId: row.practitionerId || undefined });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.followupAssign({
        body: { shopId, taskIds: [row.id], practitionerId: Number(values.practitionerId) },
      });
      message.success("随访任务已转派");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "转派失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `转派随访 · ${row.patientName}` : "转派随访"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="转派"
      confirmLoading={saving}
      destroyOnHidden
      width={440}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="practitionerId"
          label="责任医护"
          rules={[{ required: true, message: "请选择责任医护" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择医护"
            options={practitionerOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 四、量表问卷
// ============================================================================

type SurveyFormValues = {
  title: string;
  desc: string;
  crowdKind: string;
  status: string;
  riskBands: { minScore: number; maxScore: number; level: string; advice: string }[];
  questions: {
    title: string;
    type: string;
    required: boolean;
    unit: string;
    options: { label: string; score: number }[];
  }[];
};

function SurveyPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [crowdKind, setCrowdKind] = useState("all");
  const [editing, setEditing] = useState<HealthSurveyRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const list = usePagedRows<HealthSurveyRow>({
    load: () =>
      healthApi.surveys({ query: { shopId, page, pageSize: PAGE_SIZE, crowdKind } }),
    deps: [shopId, page, crowdKind],
    enabled: shopId > 0,
    errorText: "量表问卷读取失败",
  });

  const remove = async (row: HealthSurveyRow) => {
    setBusy(true);
    try {
      await healthApi.surveyRemove({ body: { shopId, id: row.id } });
      message.success("量表问卷已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthSurveyRow> = [
    { title: "问卷标题", dataIndex: "title", render: (value: string) => <strong>{value}</strong> },
    {
      title: "适用人群",
      dataIndex: "crowdKind",
      width: 110,
      render: (value: string) => crowdLabel(meta, value),
    },
    { title: "题目数", dataIndex: "questionCount", width: 90 },
    { title: "答卷数", dataIndex: "answerCount", width: 90 },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 130,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除问卷后历史答卷仍保留，但不再展示问卷内容，确认删除？"
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
      title="量表问卷"
      titleExtra={<span className="muted text-12">按总分区间给风险提示，端上展示「提示」而非结论</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增问卷
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">适用人群</span>
          <Select
            value={crowdKind}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setCrowdKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部人群" },
              ...HEALTH_CROWD_KINDS.map((value) => ({
                value,
                label: crowdLabel(meta, value),
              })),
            ]}
          />
        </div>
      </FilterBar>

      <Notice variant="info">
        量表用于了解患者近况并按分值给出风险提示，提示文案需由医护确认，不作诊断依据。
      </Notice>

      {list.rows.length || list.loading ? (
        <DataTable
          rows={list.rows}
          columns={columns}
          total={list.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={list.loading || busy}
          onPage={(next) => setPage(next)}
          scroll={{ x: 980 }}
        />
      ) : (
        <EmptyState text="还没有量表问卷：先建一份血压或血糖自评量表。" />
      )}

      <SurveyModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function SurveyModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthSurveyRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SurveyFormValues>();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    setError("");
    if (!row) {
      form.setFieldsValue({
        title: "",
        desc: "",
        crowdKind: "ALL",
        status: "ON",
        riskBands: [],
        questions: [],
      });
      return;
    }
    form.setFieldsValue({
      title: row.title,
      desc: row.desc,
      crowdKind: row.crowdKind,
      status: row.status,
      riskBands: row.riskBands,
      questions: [],
    });
    setLoading(true);
    void healthApi
      .surveyDetail({ query: { shopId, id: row.id } })
      .then((detail: HealthSurveyDetail | null) => {
        form.setFieldValue(
          "questions",
          (detail?.questions ?? []).map((question) => ({
            title: question.title,
            type: question.type,
            required: question.required,
            unit: question.unit,
            options: question.options,
          })),
        );
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "问卷详情读取失败");
      })
      .finally(() => setLoading(false));
  }, [open, row, shopId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.surveySave({
        body: {
          shopId,
          id: row?.id ?? 0,
          title: values.title,
          desc: values.desc ?? "",
          crowdKind: values.crowdKind as HealthSurveyRow["crowdKind"],
          status: values.status === "OFF" ? "OFF" : "ON",
          riskBands: (values.riskBands ?? []).map((band) => ({
            minScore: Number(band.minScore ?? 0),
            maxScore: Number(band.maxScore ?? 0),
            level: band.level ?? "",
            advice: band.advice ?? "",
          })),
          questions: (values.questions ?? []).map((question, index) => ({
            title: question.title ?? "",
            type: (question.type || "SINGLE") as (typeof SURVEY_QUESTION_TYPES)[number],
            required: Boolean(question.required),
            sort: index,
            unit: question.unit ?? "",
            options: (question.options ?? []).map((option) => ({
              label: option.label ?? "",
              score: Number(option.score ?? 0),
            })),
          })),
        },
      });
      message.success("量表问卷已保存");
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
      title={row ? `编辑问卷 · ${row.title}` : "新增量表问卷"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={900}
    >
      {error ? <LoadError text={error} /> : null}
      <Form form={form} layout="vertical" disabled={loading}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px", gap: 12 }}>
          <Form.Item
            name="title"
            label="问卷标题"
            rules={[{ required: true, message: "请填写问卷标题" }]}
          >
            <Input maxLength={80} placeholder="例如：高血压自我管理量表" />
          </Form.Item>
          <Form.Item name="crowdKind" label="适用人群">
            <Select
              options={HEALTH_CROWD_KINDS.map((value) => ({
                value,
                label: crowdLabel(meta, value),
              }))}
            />
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
        <Form.Item name="desc" label="问卷说明">
          <Input.TextArea rows={2} maxLength={1000} showCount />
        </Form.Item>
        <Form.Item label="风险区间" extra="按总分区间给提示，最多 10 段">
          <Form.List name="riskBands">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                {fields.map((field) => (
                  <Space key={field.key} align="end" wrap>
                    <Form.Item name={[field.name, "minScore"]} noStyle>
                      <InputNumber min={0} max={9999} placeholder="最低分" style={{ width: 100 }} />
                    </Form.Item>
                    <span className="muted text-12">至</span>
                    <Form.Item name={[field.name, "maxScore"]} noStyle>
                      <InputNumber min={0} max={9999} placeholder="最高分" style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "level"]} noStyle>
                      <Input placeholder="风险等级" maxLength={20} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "advice"]} noStyle>
                      <Input placeholder="提示文案" maxLength={500} style={{ width: 300 }} />
                    </Form.Item>
                    <Button size="small" onClick={() => remove(field.name)}>
                      移除
                    </Button>
                  </Space>
                ))}
                <Button
                  size="small"
                  disabled={fields.length >= 10}
                  onClick={() => add({ minScore: 0, maxScore: 0, level: "", advice: "" })}
                >
                  添加区间
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item label="题目" extra="选项分值用于累计总分，文本题不计分">
          <Form.List name="questions">
            {(questionFields, questionOps) => (
              <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                {questionFields.map((questionField, index) => (
                  <div
                    key={questionField.key}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="muted text-12">第 {index + 1} 题</span>
                      <Button
                        size="small"
                        type="text"
                        danger
                        onClick={() => questionOps.remove(questionField.name)}
                      >
                        移除
                      </Button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px", gap: 8 }}>
                      <Form.Item
                        name={[questionField.name, "title"]}
                        label="题干"
                        style={{ marginBottom: 0 }}
                      >
                        <Input maxLength={200} />
                      </Form.Item>
                      <Form.Item
                        name={[questionField.name, "type"]}
                        label="题型"
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          options={SURVEY_QUESTION_TYPES.map((value) => ({
                            value,
                            label: SURVEY_QUESTION_TYPE_LABELS[value],
                          }))}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[questionField.name, "unit"]}
                        label="单位"
                        style={{ marginBottom: 0 }}
                      >
                        <Input maxLength={16} placeholder="选填" />
                      </Form.Item>
                      <Form.Item
                        name={[questionField.name, "required"]}
                        label="必答"
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                    <Form.List name={[questionField.name, "options"]}>
                      {(optionFields, optionOps) => (
                        <Space orientation="vertical" size={6} style={{ width: "100%", marginTop: 8 }}>
                          {optionFields.map((optionField) => (
                            <Space key={optionField.key} align="end" wrap>
                              <Form.Item name={[optionField.name, "label"]} noStyle>
                                <Input placeholder="选项文案" maxLength={80} style={{ width: 320 }} />
                              </Form.Item>
                              <Form.Item name={[optionField.name, "score"]} noStyle>
                                <InputNumber
                                  min={0}
                                  max={999}
                                  placeholder="分值"
                                  style={{ width: 100 }}
                                />
                              </Form.Item>
                              <Button size="small" onClick={() => optionOps.remove(optionField.name)}>
                                移除
                              </Button>
                            </Space>
                          ))}
                          <Button
                            size="small"
                            disabled={optionFields.length >= 30}
                            onClick={() => optionOps.add({ label: "", score: 0 })}
                          >
                            添加选项
                          </Button>
                        </Space>
                      )}
                    </Form.List>
                  </div>
                ))}
                <Button
                  size="small"
                  disabled={questionFields.length >= 100}
                  onClick={() =>
                    questionOps.add({
                      title: "",
                      type: "SINGLE",
                      required: true,
                      unit: "",
                      options: [],
                    })
                  }
                >
                  添加题目
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 五、答卷记录
// ============================================================================

function AnswerPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [surveyId, setSurveyId] = useState(0);
  const [patientId, setPatientId] = useState(0);
  const surveys = useSurveyOptions(shopId);
  const patients = usePatientOptions(shopId);

  const list = usePagedRows<HealthSurveyAnswerRow>({
    load: () =>
      healthApi.surveyAnswers({
        query: { shopId, page, pageSize: PAGE_SIZE, surveyId, patientId },
      }),
    deps: [shopId, page, surveyId, patientId],
    enabled: shopId > 0,
    errorText: "答卷记录读取失败",
  });

  const columns: ColumnsType<HealthSurveyAnswerRow> = [
    { title: "问卷", dataIndex: "surveyTitle", render: (value: string) => <strong>{value}</strong> },
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "总分", dataIndex: "score", width: 80 },
    {
      title: "风险等级",
      dataIndex: "riskLevel",
      width: 110,
      render: (value: string) => (value ? <Tag>{value}</Tag> : "—"),
    },
    { title: "填写人", dataIndex: "filledBy", width: 120, render: (value: string) => value || "—" },
    {
      title: "答卷时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Panel
      title="答卷记录"
      titleExtra={<span className="muted text-12">展开行可看每题作答，风险等级仅作提示</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">问卷</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={surveyId}
            style={{ width: 220 }}
            onChange={(value: number) => {
              setSurveyId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部问卷" }, ...surveys.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">就诊人</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={patientId}
            style={{ width: 180 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patients.options]}
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
          scroll={{ x: 880 }}
          expandable={{
            expandedRowRender: (row) =>
              row.answers.length ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {row.answers.map((answer, index) => (
                    <div key={`${answer.questionTitle}-${index}`}>
                      <span className="muted text-12">{answer.questionTitle}</span>
                      <div>
                        {answer.labels.length
                          ? answer.labels.join("、")
                          : answer.textValue || (answer.numberValue ? String(answer.numberValue) : "—")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="muted text-12">这份答卷没有作答明细。</span>
              ),
            rowExpandable: (row) => row.answers.length > 0,
          }}
        />
      ) : (
        <EmptyState text="还没有答卷：患者在小程序填写量表后自动进这份记录。" />
      )}
    </Panel>
  );
}
