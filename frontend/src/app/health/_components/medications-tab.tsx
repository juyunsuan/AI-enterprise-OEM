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
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import type {
  HealthDrugRow,
  HealthMedicationEffectRow,
  HealthMedicationLogRow,
  HealthMedicationRow,
  HealthMeta,
  HealthPrescriptionRow,
} from "@enterprise/contracts";
import {
  HEALTH_MEDICATION_FREQUENCIES,
  HEALTH_MEDICATION_FREQUENCY_LABELS,
  HEALTH_MEDICATION_WAYS,
  HEALTH_PRESCRIPTION_STATUS_LABELS,
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
  cny,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 用药与处方：用药计划、打卡记录、效果评估、处方。
 * 处方只做「医师开方 + 药师审核」的流转与留痕，页面不产生任何自动诊断结论。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

type Paged<T> = { list: T[]; total: number } | null;

const WAY_LABELS: Record<string, string> = {
  ORAL: "口服",
  INJECTION: "注射",
  TOPICAL: "外用",
  INHALATION: "吸入",
  OTHER: "其他",
};

const LOG_RESULTS = ["TAKEN", "MISSED", "REFUSED"] as const;
type LogResult = (typeof LOG_RESULTS)[number];
const LOG_RESULT_LABELS: Record<string, string> = {
  TAKEN: "已服",
  MISSED: "漏服",
  REFUSED: "拒服",
};
const LOG_RESULT_TONE: Record<string, string> = {
  TAKEN: "green",
  MISSED: "red",
  REFUSED: "gold",
};

const EFFECT_LEVELS = ["BETTER", "STABLE", "WORSE", "UNKNOWN"] as const;
type EffectLevel = (typeof EFFECT_LEVELS)[number];
const EFFECT_LEVEL_LABELS: Record<string, string> = {
  BETTER: "好转",
  STABLE: "稳定",
  WORSE: "加重",
  UNKNOWN: "不确定",
};
const EFFECT_LEVEL_TONE: Record<string, string> = {
  BETTER: "green",
  STABLE: "blue",
  WORSE: "red",
  UNKNOWN: "default",
};

const PRESCRIPTION_TONE: Record<string, string> = {
  DRAFT: "default",
  SUBMITTED: "gold",
  PHARMACY_APPROVED: "green",
  PHARMACY_REJECTED: "red",
  DISPENSED: "blue",
  EXPIRED: "default",
  REVOKED: "default",
};

function LogResultTag({ value }: { value: string }) {
  return (
    <Tag color={LOG_RESULT_TONE[value] ?? "default"}>{LOG_RESULT_LABELS[value] || value}</Tag>
  );
}

function EffectLevelTag({ value }: { value: string }) {
  return (
    <Tag color={EFFECT_LEVEL_TONE[value] ?? "default"}>{EFFECT_LEVEL_LABELS[value] || value}</Tag>
  );
}

function PrescriptionStatusTag({
  meta,
  value,
}: {
  meta: HealthMeta | null;
  value: string;
}) {
  const text = labelOf(meta, "prescriptionStatuses", value);
  return (
    <Tag color={PRESCRIPTION_TONE[value] ?? "default"}>
      {text === value ? HEALTH_PRESCRIPTION_STATUS_LABELS[value] || value : text}
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

function useDrugOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.drugs({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return {
    rows,
    options: rows.map((row) => ({
      value: row.id,
      label: `${row.genericName}${row.spec ? `（${row.spec}）` : ""}`,
    })),
  };
}

/** 打卡、评估要选到具体用药：本店处方与用药计划前 100 条够用。 */
function useMedicationOptions(shopId: number) {
  const state = useHealthResource(
    () =>
      healthApi.medications({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, patientId: 0 },
      }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return {
    rows,
    options: rows.map((row) => ({
      value: row.id,
      label: `${row.patientName || "就诊人"} · ${row.drugName}${row.doseText ? ` ${row.doseText}` : ""}`,
    })),
  };
}

export function MedicationsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("medications");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "medications",
          label: "用药",
          children: <MedicationPanel shopId={shopId} />,
        },
        { key: "logs", label: "打卡记录", children: <LogPanel shopId={shopId} /> },
        { key: "effects", label: "效果评估", children: <EffectPanel shopId={shopId} /> },
        {
          key: "prescriptions",
          label: "处方",
          children: <PrescriptionPanel shopId={shopId} meta={meta} />,
        },
      ]}
    />
  );
}

// ============================================================================
// 一、用药
// ============================================================================

type MedicationFormValues = {
  patientId: number;
  drugId: number;
  drugName: string;
  spec: string;
  doseText: string;
  way: string;
  frequency: string;
  frequencyText: string;
  startAt: Dayjs | null;
  stopAt: Dayjs | null;
  remindTimes: string[];
  prescriptionId: number;
  note: string;
  status: string;
};

function MedicationPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [editing, setEditing] = useState<HealthMedicationRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const patients = usePatientOptions(shopId);
  const drugs = useDrugOptions(shopId);

  const list = usePagedRows<HealthMedicationRow>({
    load: () =>
      healthApi.medications({ query: { shopId, page, pageSize: PAGE_SIZE, patientId } }),
    deps: [shopId, page, patientId],
    enabled: shopId > 0,
    errorText: "用药计划读取失败",
  });

  const toggleStatus = async (row: HealthMedicationRow) => {
    setBusy(true);
    try {
      await healthApi.medicationStatus({
        body: { shopId, id: row.id, status: row.status === "ON" ? "OFF" : "ON" },
      });
      message.success(row.status === "ON" ? "用药计划已停用" : "用药计划已启用");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "更新失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: HealthMedicationRow) => {
    setBusy(true);
    try {
      await healthApi.medicationRemove({ body: { shopId, id: row.id } });
      message.success("用药计划已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMedicationRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 100 },
    {
      title: "药品",
      dataIndex: "drugName",
      render: (value: string, row) => (
        <span>
          <strong>{value}</strong>
          {row.spec ? <span className="muted text-12"> · {row.spec}</span> : null}
        </span>
      ),
    },
    { title: "剂量", dataIndex: "doseText", width: 110, render: (v: string) => v || "—" },
    {
      title: "途径",
      dataIndex: "way",
      width: 80,
      render: (value: string) => WAY_LABELS[value] || value,
    },
    {
      title: "频次",
      dataIndex: "frequency",
      width: 180,
      render: (value: string, row) =>
        `${HEALTH_MEDICATION_FREQUENCY_LABELS[value] || value}${
          row.frequencyText ? `（${row.frequencyText}）` : ""
        }`,
    },
    {
      title: "用药期",
      width: 190,
      render: (_: unknown, row) =>
        `${row.startAt ? fmtDate(row.startAt) : "—"} 至 ${row.stopAt ? fmtDate(row.stopAt) : "—"}`,
    },
    {
      title: "提醒",
      dataIndex: "remindTimes",
      width: 130,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    { title: "打卡", dataIndex: "logCount", width: 70 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 190,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void toggleStatus(row)}>
            {row.status === "ON" ? "停用" : "启用"}
          </Button>
          <Popconfirm
            title="删除后该用药计划与提醒停止，打卡记录保留，确认删除？"
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
      title="用药"
      titleExtra={<span className="muted text-12">用药计划按提醒时点给患者推送服药打卡</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增用药
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
          scroll={{ x: 1360 }}
        />
      ) : (
        <EmptyState text="还没有用药计划：可从处方生成，或直接为就诊人手工添加。" />
      )}

      <MedicationModal
        shopId={shopId}
        editing={editing}
        patientOptions={patients.options}
        drugOptions={drugs.options}
        drugRows={drugs.rows}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function MedicationModal({
  shopId,
  editing,
  patientOptions,
  drugOptions,
  drugRows,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthMedicationRow | "new" | null;
  patientOptions: { value: number; label: string }[];
  drugOptions: { value: number; label: string }[];
  drugRows: HealthDrugRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MedicationFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      patientId: row?.patientId ?? undefined,
      drugId: row?.drugId ?? 0,
      drugName: row?.drugName ?? "",
      spec: row?.spec ?? "",
      doseText: row?.doseText ?? "",
      way: row?.way ?? "ORAL",
      frequency: row?.frequency ?? "QD",
      frequencyText: row?.frequencyText ?? "",
      startAt: row?.startAt ? dayjs(row.startAt) : null,
      stopAt: row?.stopAt ? dayjs(row.stopAt) : null,
      remindTimes: row?.remindTimes ?? [],
      prescriptionId: row?.prescriptionId ?? 0,
      note: row?.note ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  /** 选到药品库条目时回填名称与规格，避免两处口径不一致。 */
  const pickDrug = (drugId: number) => {
    const hit = drugRows.find((item) => item.id === drugId);
    if (!hit) return;
    form.setFieldValue("drugName", hit.genericName);
    form.setFieldValue("spec", hit.spec);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.medicationSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          patientId: Number(values.patientId),
          drugId: Number(values.drugId ?? 0),
          drugName: values.drugName ?? "",
          spec: values.spec ?? "",
          doseText: values.doseText ?? "",
          way: (values.way || "ORAL") as (typeof HEALTH_MEDICATION_WAYS)[number],
          frequency: (values.frequency ||
            "QD") as (typeof HEALTH_MEDICATION_FREQUENCIES)[number],
          frequencyText: values.frequencyText ?? "",
          startAt: values.startAt ? values.startAt.format("YYYY-MM-DD") : "",
          stopAt: values.stopAt ? values.stopAt.format("YYYY-MM-DD") : "",
          remindTimes: (values.remindTimes ?? []).map((item) => String(item).slice(0, 8)),
          prescriptionId: Number(values.prescriptionId ?? 0),
          note: values.note ?? "",
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("用药计划已保存");
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
      title={row ? `编辑用药 · ${row.drugName}` : "新增用药"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={760}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="patientId"
            label="就诊人"
            rules={[{ required: true, message: "请选择就诊人" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择就诊人"
              options={patientOptions}
            />
          </Form.Item>
          <Form.Item name="drugId" label="药品库">
            <Select
              showSearch
              optionFilterProp="label"
              allowClear
              placeholder="选填，选中回填名称与规格"
              options={drugOptions}
              onChange={(value?: number) => pickDrug(Number(value ?? 0))}
            />
          </Form.Item>
          <Form.Item
            name="drugName"
            label="药品名称"
            rules={[{ required: true, message: "请填写药品名称" }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="spec" label="规格">
            <Input maxLength={60} placeholder="例如：5mg × 28 片" />
          </Form.Item>
          <Form.Item name="doseText" label="单次剂量">
            <Input maxLength={60} placeholder="例如：1 片" />
          </Form.Item>
          <Form.Item name="way" label="给药途径">
            <Select
              options={HEALTH_MEDICATION_WAYS.map((value) => ({
                value,
                label: WAY_LABELS[value] || value,
              }))}
            />
          </Form.Item>
          <Form.Item name="frequency" label="频次">
            <Select
              options={HEALTH_MEDICATION_FREQUENCIES.map((value) => ({
                value,
                label: HEALTH_MEDICATION_FREQUENCY_LABELS[value] || value,
              }))}
            />
          </Form.Item>
          <Form.Item name="frequencyText" label="频次补充" extra="自定义频次时填写">
            <Input maxLength={60} placeholder="例如：早饭前半小时" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ON", label: "启用" },
                { value: "OFF", label: "停用" },
              ]}
            />
          </Form.Item>
          <Form.Item name="startAt" label="开始日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="stopAt" label="结束日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="prescriptionId" label="关联处方编号" extra="0 = 不关联">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          name="remindTimes"
          label="提醒时点"
          extra="HH:mm 格式，输入后回车添加，最多 12 个"
        >
          <Select mode="tags" placeholder="例如：08:00" tokenSeparators={[",", "，", " "]} />
        </Form.Item>
        <Form.Item name="note" label="用药说明">
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="饭前/饭后、注意事项" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 二、打卡记录
// ============================================================================

type LogFormValues = {
  medicationId: number;
  planAt: Dayjs | null;
  result: LogResult;
  note: string;
};

function LogPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [medicationId, setMedicationId] = useState(0);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [creating, setCreating] = useState(false);

  const patients = usePatientOptions(shopId);
  const medications = useMedicationOptions(shopId);

  const list = usePagedRows<HealthMedicationLogRow>({
    load: () =>
      healthApi.medicationLogs({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          patientId,
          medicationId,
          from: range?.[0] ? range[0].format("YYYY-MM-DD") : "",
          to: range?.[1] ? range[1].format("YYYY-MM-DD") : "",
        },
      }),
    deps: [shopId, page, patientId, medicationId, range],
    enabled: shopId > 0,
    errorText: "打卡记录读取失败",
  });

  const columns: ColumnsType<HealthMedicationLogRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "药品", dataIndex: "drugName", render: (value: string) => <strong>{value}</strong> },
    {
      title: "应服时间",
      dataIndex: "planAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "实际时间",
      dataIndex: "takenAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "结果",
      dataIndex: "result",
      width: 90,
      render: (value: string) => <LogResultTag value={value} />,
    },
    { title: "备注", dataIndex: "note", render: (value: string) => value || "—" },
    {
      title: "登记时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Panel
      title="打卡记录"
      titleExtra={<span className="muted text-12">患者在小程序打卡，医护可代录漏服与拒服</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setCreating(true)}>
          补录打卡
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
          <span className="muted text-12">用药计划</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={medicationId}
            style={{ width: 260 }}
            onChange={(value: number) => {
              setMedicationId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部用药" }, ...medications.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">应服日期</span>
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
          loading={list.loading}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1000 }}
        />
      ) : (
        <EmptyState text="还没有打卡记录：患者在用药提醒里打卡后自动进这里。" />
      )}

      <LogModal
        shopId={shopId}
        open={creating}
        medicationOptions={medications.options}
        onClose={() => setCreating(false)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function LogModal({
  shopId,
  open,
  medicationOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  medicationOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<LogFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ planAt: dayjs(), result: "TAKEN", note: "" });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.medicationLogSave({
        body: {
          shopId,
          medicationId: Number(values.medicationId),
          planAt: values.planAt ? values.planAt.format("YYYY-MM-DD HH:mm") : "",
          result: values.result ?? "TAKEN",
          note: values.note ?? "",
        },
      });
      message.success("打卡记录已保存");
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
      title="补录服药打卡"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="medicationId"
          label="用药计划"
          rules={[{ required: true, message: "请选择用药计划" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择用药"
            options={medicationOptions}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="planAt" label="应服时间">
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="result" label="结果">
            <Select
              options={LOG_RESULTS.map((value) => ({
                value,
                label: LOG_RESULT_LABELS[value],
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} maxLength={200} showCount placeholder="漏服原因等" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 三、效果评估
// ============================================================================

type EffectFormValues = {
  medicationId: number;
  level: EffectLevel;
  symptomText: string;
  advice: string;
};

function EffectPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [medicationId, setMedicationId] = useState(0);
  const [creating, setCreating] = useState(false);

  const patients = usePatientOptions(shopId);
  const medications = useMedicationOptions(shopId);

  const list = usePagedRows<HealthMedicationEffectRow>({
    load: () =>
      healthApi.medicationEffects({
        query: { shopId, page, pageSize: PAGE_SIZE, patientId, medicationId },
      }),
    deps: [shopId, page, patientId, medicationId],
    enabled: shopId > 0,
    errorText: "效果评估读取失败",
  });

  const columns: ColumnsType<HealthMedicationEffectRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "药品", dataIndex: "drugName", render: (value: string) => <strong>{value}</strong> },
    {
      title: "评估结论",
      dataIndex: "level",
      width: 100,
      render: (value: string) => <EffectLevelTag value={value} />,
    },
    { title: "症状描述", dataIndex: "symptomText", render: (value: string) => value || "—" },
    {
      title: "指标",
      dataIndex: "metrics",
      width: 180,
      render: (value: HealthMedicationEffectRow["metrics"]) =>
        value.length
          ? value.map((item) => `${item.metricName}${item.value}${item.unit}`).join("、")
          : "—",
    },
    { title: "建议", dataIndex: "advice", width: 200, render: (value: string) => value || "—" },
    {
      title: "评估人",
      dataIndex: "evaluatorName",
      width: 100,
      render: (value: string) => value || "—",
    },
    {
      title: "评估时间",
      dataIndex: "evaluatedAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Panel
      title="效果评估"
      titleExtra={<span className="muted text-12">评估记录用药后的主观变化，供复诊参考</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setCreating(true)}>
          记录评估
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
          <span className="muted text-12">用药计划</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={medicationId}
            style={{ width: 260 }}
            onChange={(value: number) => {
              setMedicationId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部用药" }, ...medications.options]}
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
          scroll={{ x: 1180 }}
        />
      ) : (
        <EmptyState text="还没有效果评估：随访或复诊后为用药计划记一条。" />
      )}

      <EffectModal
        shopId={shopId}
        open={creating}
        medicationOptions={medications.options}
        onClose={() => setCreating(false)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function EffectModal({
  shopId,
  open,
  medicationOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  medicationOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<EffectFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ level: "STABLE", symptomText: "", advice: "" });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.medicationEffectSave({
        body: {
          shopId,
          medicationId: Number(values.medicationId),
          level: values.level ?? "STABLE",
          symptomText: values.symptomText ?? "",
          advice: values.advice ?? "",
        },
      });
      message.success("效果评估已保存");
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
      title="记录用药效果"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="medicationId"
          label="用药计划"
          rules={[{ required: true, message: "请选择用药计划" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择用药"
            options={medicationOptions}
          />
        </Form.Item>
        <Form.Item name="level" label="评估结论">
          <Select
            options={EFFECT_LEVELS.map((value) => ({
              value,
              label: EFFECT_LEVEL_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="symptomText" label="症状描述">
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="患者反馈、不良反应" />
        </Form.Item>
        <Form.Item name="advice" label="处理建议" extra="仅作管理建议，不替代医师诊断">
          <Input.TextArea rows={2} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 四、处方
// ============================================================================

type PrescriptionItemValues = {
  drugId: number;
  quantity: number;
  doseText: string;
  way: string;
  frequency: string;
  days: number;
};

type PrescriptionFormValues = {
  patientId: number;
  consultId: number;
  orderId: number;
  doctorId: number;
  diagnosisText: string;
  advice: string;
  signatureUrl: string;
  items: PrescriptionItemValues[];
};

function PrescriptionPanel({
  shopId,
  meta,
}: {
  shopId: number;
  meta: HealthMeta | null;
}) {
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [doctorId, setDoctorId] = useState(0);
  const [prescriptionStatus, setPrescriptionStatus] = useState("all");
  const [editing, setEditing] = useState<HealthPrescriptionRow | "new" | null>(null);
  const [detailId, setDetailId] = useState(0);
  const [reviewRow, setReviewRow] = useState<HealthPrescriptionRow | null>(null);
  const [revokeRow, setRevokeRow] = useState<HealthPrescriptionRow | null>(null);

  const patients = usePatientOptions(shopId);
  const practitioners = usePractitionerOptions(shopId);
  const drugs = useDrugOptions(shopId);

  const list = usePagedRows<HealthPrescriptionRow>({
    load: () =>
      healthApi.prescriptions({
        query: { shopId, page, pageSize: PAGE_SIZE, patientId, doctorId, prescriptionStatus },
      }),
    deps: [shopId, page, patientId, doctorId, prescriptionStatus],
    enabled: shopId > 0,
    errorText: "处方读取失败",
  });

  const columns: ColumnsType<HealthPrescriptionRow> = [
    {
      title: "处方编号",
      dataIndex: "prescriptionNo",
      width: 170,
      render: (value: string, row) => <a onClick={() => setDetailId(row.id)}>{value}</a>,
    },
    { title: "就诊人", dataIndex: "patientName", width: 100 },
    {
      title: "开方医师",
      dataIndex: "doctorName",
      width: 110,
      render: (value: string) => value || "—",
    },
    { title: "诊断", dataIndex: "diagnosisText", width: 220, render: (v: string) => v || "—" },
    { title: "明细", width: 80, render: (_: unknown, row) => `${row.items.length} 项` },
    {
      title: "金额",
      dataIndex: "totalCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <PrescriptionStatusTag meta={meta} value={value} />,
    },
    {
      title: "开方时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 220,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetailId(row.id)}>
            详情
          </Button>
          {row.status === "DRAFT" ? (
            <Button size="small" type="text" onClick={() => setEditing(row)}>
              编辑
            </Button>
          ) : null}
          {row.status === "SUBMITTED" ? (
            <Button size="small" type="text" onClick={() => setReviewRow(row)}>
              审核
            </Button>
          ) : null}
          {row.status !== "REVOKED" && row.status !== "EXPIRED" ? (
            <Button size="small" type="text" danger onClick={() => setRevokeRow(row)}>
              作废
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="处方"
      titleExtra={<span className="muted text-12">医师开方 → 药师审核 → 调配，全流程留痕</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          开具处方
        </Button>
      }
    >
      <Notice variant="warn">
        合规提示：处方须由已认证医师本人人工填写诊断与用药内容，系统不自动生成诊断结论，也不提供自动用药建议；药师审核通过后方可调配。
      </Notice>
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
          <span className="muted text-12">开方医师</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={doctorId}
            style={{ width: 160 }}
            onChange={(value: number) => {
              setDoctorId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医师" }, ...practitioners.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={prescriptionStatus}
            style={{ width: 140 }}
            onChange={(value: string) => {
              setPrescriptionStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...Object.keys(PRESCRIPTION_TONE).map((value) => ({
                value,
                label: labelOf(meta, "prescriptionStatuses", value),
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
          scroll={{ x: 1420 }}
        />
      ) : (
        <EmptyState text="还没有处方：问诊结束后由医师在这里开具并提交药师审核。" />
      )}

      <PrescriptionModal
        shopId={shopId}
        editing={editing}
        patientOptions={patients.options}
        doctorOptions={practitioners.options}
        drugOptions={drugs.options}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
      <PrescriptionDrawer shopId={shopId} meta={meta} prescriptionId={detailId} onClose={() => setDetailId(0)} />
      <ReviewModal
        shopId={shopId}
        row={reviewRow}
        onClose={() => setReviewRow(null)}
        onDone={() => void list.reload()}
      />
      <RevokeModal
        shopId={shopId}
        row={revokeRow}
        onClose={() => setRevokeRow(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function PrescriptionModal({
  shopId,
  editing,
  patientOptions,
  doctorOptions,
  drugOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthPrescriptionRow | "new" | null;
  patientOptions: { value: number; label: string }[];
  doctorOptions: { value: number; label: string }[];
  drugOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PrescriptionFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      patientId: row?.patientId ?? undefined,
      consultId: row?.consultId ?? 0,
      orderId: row?.orderId ?? 0,
      doctorId: row?.doctorId ?? 0,
      diagnosisText: row?.diagnosisText ?? "",
      advice: row?.advice ?? "",
      signatureUrl: row?.signatureUrl ?? "",
      items: (row?.items ?? []).map((item) => ({
        drugId: item.drugId,
        quantity: item.quantity,
        doseText: item.doseText,
        way: item.way || "ORAL",
        frequency: item.frequency || "QD",
        days: item.days,
      })),
    });
  }, [open, row, form]);

  const submit = async (submit: boolean) => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.prescriptionSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          patientId: Number(values.patientId),
          consultId: Number(values.consultId ?? 0),
          orderId: Number(values.orderId ?? 0),
          doctorId: Number(values.doctorId ?? 0),
          diagnosisText: values.diagnosisText ?? "",
          advice: values.advice ?? "",
          signatureUrl: values.signatureUrl ?? "",
          items: (values.items ?? []).map((item) => ({
            drugId: Number(item.drugId),
            quantity: Number(item.quantity ?? 1),
            doseText: item.doseText ?? "",
            way: item.way || "ORAL",
            frequency: item.frequency || "QD",
            days: Number(item.days ?? 0),
          })),
          submit,
        },
      });
      message.success(submit ? "处方已提交药师审核" : "处方草稿已保存");
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
      title={row ? `编辑处方 · ${row.prescriptionNo}` : "开具处方"}
      onCancel={onClose}
      destroyOnHidden
      width={900}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="draft" loading={saving} onClick={() => void submit(false)}>
          保存草稿
        </Button>,
        <Button key="submit" type="primary" loading={saving} onClick={() => void submit(true)}>
          提交审核
        </Button>,
      ]}
    >
      <Notice variant="warn">
        处方须由认证医师本人填写诊断与用药，系统不自动下诊断结论；提交后由药师审核。
      </Notice>
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="patientId"
            label="就诊人"
            rules={[{ required: true, message: "请选择就诊人" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择就诊人"
              options={patientOptions}
            />
          </Form.Item>
          <Form.Item name="doctorId" label="开方医师">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "按登录医师" }, ...doctorOptions]}
            />
          </Form.Item>
          <Form.Item name="consultId" label="关联问诊编号" extra="0 = 不关联">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="orderId" label="关联订单编号" extra="0 = 不关联">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          name="diagnosisText"
          label="临床诊断"
          rules={[{ required: true, message: "请由医师填写诊断" }]}
          extra="仅认证医师人工填写，系统不生成诊断"
        >
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>
        <Form.Item name="advice" label="用药嘱咐">
          <Input.TextArea rows={2} maxLength={1000} showCount />
        </Form.Item>
        <Form.Item name="signatureUrl" label="医师签章图片" extra="签名图直链，留空表示线下补签">
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
        <Form.Item label="药品明细" extra="至少 1 项，最多 50 项">
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                {fields.map((field) => (
                  <Space key={field.key} align="end" wrap>
                    <Form.Item
                      name={[field.name, "drugId"]}
                      noStyle
                      rules={[{ required: true, message: "请选择药品" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="药品"
                        style={{ width: 220 }}
                        options={drugOptions}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "quantity"]} noStyle>
                      <InputNumber
                        min={1}
                        max={9999}
                        precision={0}
                        placeholder="数量"
                        style={{ width: 90 }}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "doseText"]} noStyle>
                      <Input placeholder="单次剂量" maxLength={60} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "way"]} noStyle>
                      <Select
                        style={{ width: 100 }}
                        options={HEALTH_MEDICATION_WAYS.map((value) => ({
                          value,
                          label: WAY_LABELS[value] || value,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "frequency"]} noStyle>
                      <Select
                        style={{ width: 120 }}
                        options={HEALTH_MEDICATION_FREQUENCIES.map((value) => ({
                          value,
                          label: HEALTH_MEDICATION_FREQUENCY_LABELS[value] || value,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "days"]} noStyle>
                      <InputNumber
                        min={0}
                        max={180}
                        precision={0}
                        placeholder="天数"
                        style={{ width: 80 }}
                      />
                    </Form.Item>
                    <Button size="small" onClick={() => remove(field.name)}>
                      移除
                    </Button>
                  </Space>
                ))}
                <Button
                  size="small"
                  disabled={fields.length >= 50}
                  onClick={() =>
                    add({ quantity: 1, doseText: "", way: "ORAL", frequency: "QD", days: 0 })
                  }
                >
                  添加药品
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PrescriptionDrawer({
  shopId,
  meta,
  prescriptionId,
  onClose,
}: {
  shopId: number;
  meta: HealthMeta | null;
  prescriptionId: number;
  onClose: () => void;
}) {
  const detail = useHealthResource(
    () => healthApi.prescriptionDetail({ query: { shopId, id: prescriptionId } }),
    [shopId, prescriptionId],
    shopId > 0 && prescriptionId > 0,
  );
  const row = detail.data;

  const itemColumns: ColumnsType<HealthPrescriptionRow["items"][number]> = [
    { title: "药品", dataIndex: "drugName", render: (value: string) => <strong>{value}</strong> },
    { title: "规格", dataIndex: "spec", width: 140, render: (v: string) => v || "—" },
    { title: "数量", dataIndex: "quantity", width: 80 },
    { title: "单位", dataIndex: "unit", width: 70, render: (v: string) => v || "—" },
    { title: "剂量", dataIndex: "doseText", width: 100, render: (v: string) => v || "—" },
    {
      title: "用法",
      width: 120,
      render: (_: unknown, item) =>
        `${WAY_LABELS[item.way] || item.way} / ${HEALTH_MEDICATION_FREQUENCY_LABELS[item.frequency] || item.frequency}`,
    },
    { title: "天数", dataIndex: "days", width: 70 },
    {
      title: "单价",
      dataIndex: "priceCents",
      width: 100,
      render: (value: number) => cny(value),
    },
  ];

  return (
    <Drawer
      open={prescriptionId > 0}
      size="large"
      title={row ? `处方详情 · ${row.prescriptionNo}` : "处方详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail.error ? <LoadError text={detail.error} /> : null}
      {row ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "处方编号", value: row.prescriptionNo },
              { label: "就诊人", value: row.patientName },
              { label: "开方医师", value: row.doctorName || "—" },
              { label: "状态", value: <PrescriptionStatusTag meta={meta} value={row.status} /> },
              { label: "审核药师", value: row.pharmacistName || "—" },
              { label: "审核意见", value: row.pharmacyNote || "—" },
              { label: "审核时间", value: row.reviewedAt ? fmtTime(row.reviewedAt) : "—" },
              { label: "有效期至", value: row.validUntil ? fmtDate(row.validUntil) : "—" },
              { label: "金额", value: cny(row.totalCents) },
              { label: "开方时间", value: row.createdAt ? fmtTime(row.createdAt) : "—" },
            ]}
          />
          <div>
            <div className="muted text-12">临床诊断</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{row.diagnosisText || "—"}</div>
          </div>
          <div>
            <div className="muted text-12">用药嘱咐</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{row.advice || "—"}</div>
          </div>
          <div>
            <strong>药品明细</strong>
            <DataTable
              rows={row.items}
              columns={itemColumns}
              page={1}
              loading={detail.loading}
              rowKey="id"
              scroll={{ x: 860 }}
            />
          </div>
          <div>
            <div className="muted text-12">医师签章</div>
            {row.signatureUrl ? (
              <a href={row.signatureUrl} target="_blank" rel="noreferrer">
                查看签章图片
              </a>
            ) : (
              <span>未上传</span>
            )}
          </div>
        </div>
      ) : detail.loading ? (
        <div className="muted text-12">正在读取处方详情…</div>
      ) : null}
    </Drawer>
  );
}

function ReviewModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthPrescriptionRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ approved: boolean; note: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({ approved: true, note: "" });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.prescriptionReview({
        body: { shopId, id: row.id, approved: Boolean(values.approved), note: values.note ?? "" },
      });
      message.success(values.approved ? "处方已审核通过" : "处方已驳回");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `药师审核 · ${row.prescriptionNo}` : "药师审核"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交审核结果"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="approved" label="审核结论">
          <Select
            options={[
              { value: true, label: "通过，可调配" },
              { value: false, label: "驳回，需医师修改" },
            ]}
          />
        </Form.Item>
        <Form.Item name="note" label="审核意见" extra="驳回时请写明原因">
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RevokeModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthPrescriptionRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({ reason: "" });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.prescriptionRevoke({
        body: { shopId, id: row.id, reason: values.reason ?? "" },
      });
      message.success("处方已作废");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "作废失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `作废处方 · ${row.prescriptionNo}` : "作废处方"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认作废"
      confirmLoading={saving}
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="作废原因" extra="会写入处方留痕">
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
