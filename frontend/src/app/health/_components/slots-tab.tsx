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
  TimePicker,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import type {
  HealthConsultRow,
  HealthConsultRuleRow,
  HealthCrowdKind,
  HealthGreenOrderRow,
  HealthMeta,
  HealthShiftGenerateResult,
  HealthShiftTemplateRow,
  HealthSignOrderRow,
  HealthSignPackageRow,
  HealthSlotCalendar,
  HealthSlotRow,
} from "@enterprise/contracts";
import {
  HEALTH_CONSULT_STATUSES,
  HEALTH_CROWD_KINDS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_GREEN_STATUSES,
  HEALTH_GREEN_STATUS_LABELS,
  HEALTH_ORDER_BIZ_TYPES,
  HEALTH_SIGN_ORDER_STATUSES,
  HEALTH_SIGN_ORDER_STATUS_LABELS,
  HEALTH_SLOT_KINDS,
  HEALTH_SLOT_KIND_LABELS,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  cny,
  DataTable,
  Descriptions,
  FilterBar,
  labelOf,
  LoadError,
  OnOffTag,
  onOffLabel,
  StatusTag,
  useHealthResource,
} from "./health-common";

/**
 * 排班号源：排班模板、号源日历、问诊规则与问诊单、家医签约、绿通快约。
 *
 * 号源是挂号/体检/上门位的唯一库存：模板按星期展开成具体时段，
 * 小程序端可选的每一格都对应这里的号源行。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

const CONSULT_BIZ_TYPES = HEALTH_ORDER_BIZ_TYPES.filter((value) => value.startsWith("CONSULT_"));
const GREEN_KIND_LABELS: Record<string, string> = { GREEN: "绿通", OPERATION: "手术快约" };

type ConsultAction = "ACCEPT" | "REJECT" | "FINISH" | "CANCEL" | "REMIND" | "CONCLUDE";

const CONSULT_ACTION_LABELS: Record<ConsultAction, string> = {
  ACCEPT: "接单",
  REJECT: "拒诊",
  FINISH: "完成",
  CANCEL: "取消",
  REMIND: "提醒",
  CONCLUDE: "结单",
};

/** 金额在接口里一律是分，表单里按元填，提交时换算回去。 */
const yuanToCents = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100));
const centsToYuan = (value: unknown) => Number(value ?? 0) / 100;

const STATUS_OPTIONS = (["ON", "OFF"] as const).map((value) => ({
  value,
  label: onOffLabel(value),
}));

/** 枚举下拉：优先用 `Health_meta` 下发的字典，缺省回落到契约常量。 */
function dictOptions(
  dict?: Record<string, string>,
  order?: readonly string[],
  labels?: Record<string, string>,
) {
  if (dict && Object.keys(dict).length) {
    return Object.entries(dict).map(([value, label]) => ({ value, label }));
  }
  return (order ?? []).map((value) => ({ value, label: labels?.[value] ?? value }));
}

const crowdText = (meta: HealthMeta | null, kinds: string[]) =>
  kinds.length ? kinds.map((kind) => labelOf(meta, "crowdKinds", kind)).join("、") : "—";

/** 号源被停诊：后端把「已约满 / 已过就诊时间」也写进 blockedReason，需排除。 */
const isBlocked = (row: HealthSlotRow) =>
  Boolean(row.blockedReason) && !["已约满", "已过就诊时间"].includes(row.blockedReason);

const consultStatusLabel = (meta: HealthMeta | null, value: string) =>
  labelOf(meta, "consultStatuses", value) || value;

// ============================================================================
// 页签壳
// ============================================================================

export function SlotsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("shifts");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "shifts",
          label: "排班模板",
          children: <ShiftTemplatesPanel shopId={shopId} />,
        },
        {
          key: "calendar",
          label: "号源日历",
          children: <SlotCalendarPanel shopId={shopId} />,
        },
        {
          key: "consultRules",
          label: "问诊规则",
          children: <ConsultRulesPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "consults",
          label: "问诊单",
          children: <ConsultsPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "sign",
          label: "家庭医生签约",
          children: <SignPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "green",
          label: "绿通快约",
          children: <GreenPanel shopId={shopId} />,
        },
      ]}
    />
  );
}

// ============================================================================
// 共用下拉
// ============================================================================

/** 医护下拉：一家店的医护通常不超过百人，一次取满即可。 */
function usePractitionerOptions(shopId: number) {
  const resource = useHealthResource(
    () =>
      healthApi.practitioners({
        query: {
          shopId,
          page: 1,
          pageSize: OPTION_PAGE_SIZE,
          role: "all",
          organId: 0,
          hospitalId: 0,
          departmentId: 0,
        },
      }),
    [shopId],
    shopId > 0,
  );
  return (resource.data?.list ?? []).map((row) => ({
    value: row.id,
    label: row.organName ? `${row.name}（${row.organName}）` : row.name,
  }));
}

/** 排班表单要医院/科室：与医护页同一套归属口径。 */
function useScheduleOptions(shopId: number) {
  const hospitals = useHealthResource(
    () => healthApi.hospitals({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const departments = useHealthResource(
    () =>
      healthApi.departments({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, hospitalId: 0 },
      }),
    [shopId],
    shopId > 0,
  );
  return {
    hospitalOptions: (hospitals.data?.list ?? []).map((row) => ({ value: row.id, label: row.name })),
    departmentRows: departments.data?.list ?? [],
  };
}

// ============================================================================
// 一、排班模板
// ============================================================================

function ShiftTemplatesPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [practitionerId, setPractitionerId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthShiftTemplateRow | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const practitionerOptions = usePractitionerOptions(shopId);
  const resource = useHealthResource(
    () => healthApi.shiftTemplates({ query: { shopId, practitionerId } }),
    [shopId, practitionerId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthShiftTemplateRow) => {
    setBusy(true);
    try {
      await healthApi.shiftTemplateRemove({ body: { shopId, id: row.id } });
      message.success("排班模板已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthShiftTemplateRow> = [
    {
      title: "医护",
      dataIndex: "practitionerName",
      width: 140,
      render: (value: string) => <strong>{value || "—"}</strong>,
    },
    {
      title: "出诊星期",
      dataIndex: "weekdays",
      width: 220,
      render: (value: number[]) =>
        value.length ? value.map((day) => WEEKDAY_LABELS[day] ?? day).join("、") : "—",
    },
    {
      title: "时段",
      width: 150,
      render: (_: unknown, row) => `${row.startAt} - ${row.endAt}`,
    },
    {
      title: "号源类型",
      dataIndex: "kind",
      width: 110,
      render: (value: string) => HEALTH_SLOT_KIND_LABELS[value] ?? value,
    },
    {
      title: "单号时长",
      dataIndex: "slotMinutes",
      width: 100,
      render: (value: number) => `${value} 分钟`,
    },
    { title: "每号额度", dataIndex: "quotaPerSlot", width: 100 },
    { title: "单价", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "口径提示",
      dataIndex: "configWarning",
      width: 220,
      render: (value: string) => (value ? <span className="text-12">{value}</span> : "—"),
    },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="已生成号源的模板不能删除，请改为停用。"
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
      title="排班模板"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">按星期循环出诊，生成号源后小程序端才可预约</span>}
      extra={
        <Space>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 200 }}
            onChange={(value: number) => setPractitionerId(value)}
            options={[{ value: 0, label: "全部医护" }, ...practitionerOptions]}
          />
          <Button size="small" onClick={() => setGenerating(true)}>
            生成号源
          </Button>
          <Button type="primary" size="small" onClick={() => setEditing("new")}>
            新增排班
          </Button>
        </Space>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      {rows.length || resource.loading ? (
        <DataTable<HealthShiftTemplateRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={resource.loading || busy}
          scroll={{ x: 1420 }}
        />
      ) : (
        <EmptyState text="还没有排班：先新增排班模板，再点右上角「生成号源」把时段放出去。" />
      )}

      <ShiftTemplateModal
        shopId={shopId}
        editing={editing}
        practitionerOptions={practitionerOptions}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
      <ShiftGenerateModal
        shopId={shopId}
        open={generating}
        onClose={() => setGenerating(false)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ShiftFormValues = {
  practitionerId: number;
  hospitalId: number;
  departmentId: number;
  kind: string;
  weekdays: number[];
  startAt: Dayjs | null;
  endAt: Dayjs | null;
  slotMinutes: number;
  quotaPerSlot: number;
  priceYuan: number;
  status: string;
};

function ShiftTemplateModal({
  shopId,
  editing,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthShiftTemplateRow | "new" | null;
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ShiftFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const { hospitalOptions, departmentRows } = useScheduleOptions(shopId);
  const hospitalId = Form.useWatch<number | undefined>("hospitalId", form);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      practitionerId: row?.practitionerId ?? practitionerOptions[0]?.value ?? 0,
      hospitalId: row?.hospitalId ?? 0,
      departmentId: row?.departmentId ?? 0,
      kind: row?.kind ?? "OUTPATIENT",
      weekdays: row?.weekdays ?? [1, 2, 3, 4, 5],
      startAt: row?.startAt ? dayjs(`2000-01-01 ${row.startAt}`) : dayjs("2000-01-01 08:30"),
      endAt: row?.endAt ? dayjs(`2000-01-01 ${row.endAt}`) : dayjs("2000-01-01 12:00"),
      slotMinutes: row?.slotMinutes ?? 30,
      quotaPerSlot: row?.quotaPerSlot ?? 1,
      priceYuan: centsToYuan(row?.priceCents),
      status: row?.status ?? "ON",
    });
  }, [open, row, form, practitionerOptions]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!values.startAt || !values.endAt) {
      message.error("请填写出诊开始与结束时间");
      return;
    }
    setSaving(true);
    try {
      await healthApi.shiftTemplateSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          practitionerId: Number(values.practitionerId ?? 0),
          hospitalId: Number(values.hospitalId ?? 0),
          departmentId: Number(values.departmentId ?? 0),
          kind: (values.kind ?? "OUTPATIENT") as HealthShiftTemplateRow["kind"],
          weekdays: values.weekdays ?? [],
          startAt: values.startAt.format("HH:mm"),
          endAt: values.endAt.format("HH:mm"),
          slotMinutes: Number(values.slotMinutes ?? 30),
          quotaPerSlot: Number(values.quotaPerSlot ?? 1),
          priceCents: yuanToCents(values.priceYuan),
          status: (values.status ?? "ON") as HealthShiftTemplateRow["status"],
        },
      });
      message.success(row ? "排班模板已保存" : "排班模板已创建");
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
      title={row ? `编辑排班 · ${row.practitionerName}` : "新增排班模板"}
      width={720}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="practitionerId"
            label="出诊医护"
            rules={[{ required: true, message: "请选择出诊医护" }]}
          >
            <Select showSearch optionFilterProp="label" options={practitionerOptions} />
          </Form.Item>
          <Form.Item name="kind" label="号源类型">
            <Select
              options={HEALTH_SLOT_KINDS.map((value) => ({
                value,
                label: HEALTH_SLOT_KIND_LABELS[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="hospitalId" label="出诊医院">
            <Select
              options={[{ value: 0, label: "按医护归属" }, ...hospitalOptions]}
              onChange={() => form.setFieldValue("departmentId", 0)}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="出诊科室">
            <Select
              options={[
                { value: 0, label: "按医护归属" },
                ...departmentRows
                  .filter((item) => !hospitalId || item.hospitalId === hospitalId)
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="weekdays"
          label="出诊星期"
          rules={[{ required: true, message: "至少选择一个星期" }]}
        >
          <Select
            mode="multiple"
            options={[1, 2, 3, 4, 5, 6, 7].map((value) => ({
              value,
              label: WEEKDAY_LABELS[value],
            }))}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="startAt"
            label="开始时间"
            rules={[{ required: true, message: "请选择开始时间" }]}
          >
            <TimePicker format="HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="endAt"
            label="结束时间"
            rules={[{ required: true, message: "请选择结束时间" }]}
          >
            <TimePicker format="HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="slotMinutes" label="单号时长（分钟）" extra="须为 5 的倍数">
            <InputNumber min={5} max={240} step={5} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="quotaPerSlot" label="每号额度">
            <InputNumber min={1} max={999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="priceYuan" label="单价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function ShiftGenerateModal({
  shopId,
  open,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ from: Dayjs | null; days: number; overwriteQuota: boolean }>();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<HealthShiftGenerateResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    form.setFieldsValue({ from: dayjs(), days: 30, overwriteQuota: false });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!values.from) {
      message.error("请选择开始日期");
      return;
    }
    setSaving(true);
    try {
      const created = await healthApi.shiftGenerate({
        body: {
          shopId,
          practitionerId: 0,
          from: values.from.format("YYYY-MM-DD"),
          days: Number(values.days ?? 30),
          overwriteQuota: Boolean(values.overwriteQuota),
        },
      });
      setResult(created ?? null);
      message.success(created?.message || "号源已生成");
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="按排班生成号源"
      open={open}
      destroyOnHidden
      width={520}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="生成"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="from"
          label="开始日期"
          rules={[{ required: true, message: "请选择开始日期" }]}
        >
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="days" label="生成天数" extra="1 至 90 天，按模板的出诊星期展开">
          <InputNumber min={1} max={90} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="overwriteQuota"
          label="覆盖已有额度"
          valuePropName="checked"
          extra="关闭时只补新增时段，已存在的时段原样保留"
        >
          <Switch />
        </Form.Item>
      </Form>
      {result ? (
        <Notice variant="success">
          新建 {result.createdSlots} 个，更新额度 {result.updatedSlots} 个，跳过已存在{" "}
          {result.skippedSlots} 个。
        </Notice>
      ) : null}
    </Modal>
  );
}

// ============================================================================
// 二、号源日历
// ============================================================================

function SlotCalendarPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [practitionerId, setPractitionerId] = useState(0);
  const [departmentId, setDepartmentId] = useState(0);
  const [from, setFrom] = useState<Dayjs>(dayjs());
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [blockTarget, setBlockTarget] = useState<HealthSlotRow | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const practitionerOptions = usePractitionerOptions(shopId);
  const { departmentRows } = useScheduleOptions(shopId);
  const resource = useHealthResource(
    () =>
      healthApi.slotCalendar({
        query: {
          shopId,
          practitionerId,
          departmentId,
          from: from.format("YYYY-MM-DD"),
          days,
        },
      }),
    [shopId, practitionerId, departmentId, from, days],
    shopId > 0,
  );
  const calendar: HealthSlotCalendar | null = resource.data;

  const toggleBlock = async (row: HealthSlotRow, blocked: boolean, reason: string) => {
    setBusy(true);
    try {
      await healthApi.slotBlock({ body: { shopId, slotId: row.id, blocked, reason } });
      message.success(blocked ? "该时段已停诊" : "该时段已恢复可约");
      setBlockTarget(null);
      setBlockReason("");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthSlotRow> = [
    {
      title: "时段",
      width: 130,
      render: (_: unknown, row) => `${row.startAt} - ${row.endAt}`,
    },
    {
      title: "医护",
      dataIndex: "practitionerName",
      width: 120,
      render: (value: string) => value || "—",
    },
    {
      title: "科室 / 医院",
      width: 190,
      render: (_: unknown, row) => (
        <div>
          <div>{row.departmentName || "—"}</div>
          <div className="muted text-12">{row.hospitalName || "—"}</div>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 100,
      render: (value: string) => HEALTH_SLOT_KIND_LABELS[value] ?? value,
    },
    { title: "额度", dataIndex: "quota", width: 70 },
    { title: "已约", dataIndex: "occupied", width: 70 },
    {
      title: "余号",
      dataIndex: "remain",
      width: 70,
      render: (value: number) => (
        <span style={{ color: value > 0 ? undefined : "var(--danger, #cf1322)" }}>{value}</span>
      ),
    },
    { title: "价格", dataIndex: "priceCents", width: 100, render: (value: number) => cny(value) },
    {
      title: "可约",
      dataIndex: "bookable",
      width: 90,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "可约" : "不可约"}</Tag>
      ),
    },
    {
      title: "说明",
      dataIndex: "blockedReason",
      width: 160,
      render: (value: string) => value || "—",
    },
    {
      title: "操作",
      width: 100,
      fixed: "right",
      render: (_: unknown, row) =>
        isBlocked(row) ? (
          <Button
            size="small"
            type="text"
            loading={busy}
            onClick={() => void toggleBlock(row, false, "")}
          >
            恢复
          </Button>
        ) : (
          <Button
            size="small"
            type="text"
            danger
            onClick={() => {
              setBlockTarget(row);
              setBlockReason("");
            }}
          >
            停诊
          </Button>
        ),
    },
  ];

  return (
    <Panel
      title="号源日历"
      titleExtra={
        <span className="muted text-12">
          时区 {calendar?.timezone ?? "+08:00"}；停诊只影响未预约的时段
        </span>
      }
      extra={
        <Space>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 180 }}
            onChange={(value: number) => setPractitionerId(value)}
            options={[{ value: 0, label: "全部医护" }, ...practitionerOptions]}
          />
          <Select
            value={departmentId}
            style={{ width: 170 }}
            onChange={(value: number) => setDepartmentId(value)}
            options={[
              { value: 0, label: "全部科室" },
              ...departmentRows.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <DatePicker
            value={from}
            onChange={(value: Dayjs | null) => setFrom(value ?? dayjs())}
          />
          <Select
            value={days}
            style={{ width: 100 }}
            onChange={(value: number) => setDays(value)}
            options={[7, 14, 30].map((value) => ({ value, label: `${value} 天` }))}
          />
        </Space>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <div style={{ display: "grid", gap: 14 }}>
        {(calendar?.days ?? []).length ? (
          (calendar?.days ?? []).map((day) => (
            <div
              key={day.day}
              style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <strong>
                  {day.day} {WEEKDAY_LABELS[day.weekday] ?? ""}
                </strong>
                <span className="muted text-12">
                  {day.slots.length ? `余号合计 ${day.remainTotal}` : "当日没有号源"}
                </span>
              </div>
              {day.slots.length ? (
                <DataTable<HealthSlotRow>
                  rows={day.slots}
                  columns={columns}
                  page={1}
                  loading={resource.loading || busy}
                  scroll={{ x: 1240 }}
                />
              ) : (
                <span className="muted text-12">按排班模板生成号源后，这里会按天列出时段。</span>
              )}
            </div>
          ))
        ) : (
          <EmptyState text="所选日期没有号源：先到「排班模板」建班并生成号源。" />
        )}
      </div>

      <Modal
        title={blockTarget ? `停诊 ${blockTarget.startAt} - ${blockTarget.endAt}` : "停诊"}
        open={Boolean(blockTarget)}
        destroyOnHidden
        width={480}
        onCancel={() => setBlockTarget(null)}
        onOk={() => (blockTarget ? void toggleBlock(blockTarget, true, blockReason) : undefined)}
        okText="确认停诊"
        confirmLoading={busy}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <span className="muted text-12">停诊原因会展示在小程序端的不可约提示里</span>
          <Input
            maxLength={100}
            value={blockReason}
            placeholder="如 医生外出参会"
            onChange={(event) => setBlockReason(event.target.value)}
          />
        </div>
      </Modal>
    </Panel>
  );
}

// ============================================================================
// 三、问诊规则
// ============================================================================

function ConsultRulesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [practitionerId, setPractitionerId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthConsultRuleRow | "new" | null>(null);
  const practitionerOptions = usePractitionerOptions(shopId);
  const resource = useHealthResource(
    () => healthApi.consultRules({ query: { shopId, practitionerId } }),
    [shopId, practitionerId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthConsultRuleRow) => {
    setBusy(true);
    try {
      await healthApi.consultRuleRemove({ body: { shopId, id: row.id } });
      message.success("问诊规则已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthConsultRuleRow> = [
    {
      title: "医护",
      dataIndex: "practitionerName",
      width: 140,
      render: (value: string) => <strong>{value || "—"}</strong>,
    },
    {
      title: "问诊类型",
      dataIndex: "bizType",
      width: 120,
      render: (value: string) => labelOf(meta, "bizTypes", value),
    },
    {
      title: "极速问诊",
      dataIndex: "instant",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "blue" : "default"}>{value ? "按响应时长" : "按预约时段"}</Tag>
      ),
    },
    { title: "价格", dataIndex: "priceCents", width: 100, render: (value: number) => cny(value) },
    {
      title: "时长",
      dataIndex: "minutes",
      width: 100,
      render: (value: number) => (value > 0 ? `${value} 分钟` : "不限"),
    },
    {
      title: "每日上限",
      dataIndex: "maxDailyCount",
      width: 100,
      render: (value: number) => (value > 0 ? `${value} 单` : "不限"),
    },
    {
      title: "图文条数",
      dataIndex: "messageLimit",
      width: 100,
      render: (value: number) => (value > 0 ? `${value} 条` : "不限"),
    },
    {
      title: "需就诊人",
      dataIndex: "needPatient",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "blue" : "default"}>{value ? "需填写" : "不需"}</Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后该医护不再接这类问诊，已产生的问诊单不受影响。"
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
      title="问诊规则"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={
        <span className="muted text-12">价格、时长与上限按医护 × 问诊类型配置，文字沟通走 AI客服</span>
      }
      extra={
        <Space>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 200 }}
            onChange={(value: number) => setPractitionerId(value)}
            options={[{ value: 0, label: "全部医护" }, ...practitionerOptions]}
          />
          <Button type="primary" size="small" onClick={() => setEditing("new")}>
            新增规则
          </Button>
        </Space>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      {rows.length || resource.loading ? (
        <DataTable<HealthConsultRuleRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={resource.loading || busy}
          scroll={{ x: 1220 }}
        />
      ) : (
        <EmptyState text="还没有问诊规则：为医护配置价格与时段后，小程序端才能下单问诊。" />
      )}

      <ConsultRuleModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        practitionerOptions={practitionerOptions}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ConsultRuleFormValues = {
  practitionerId: number;
  bizType: string;
  instant: boolean;
  priceYuan: number;
  minutes: number;
  maxDailyCount: number;
  messageLimit: number;
  needPatient: boolean;
  status: string;
};

function ConsultRuleModal({
  shopId,
  meta,
  editing,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthConsultRuleRow | "new" | null;
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ConsultRuleFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      practitionerId: row?.practitionerId ?? practitionerOptions[0]?.value ?? 0,
      bizType: row?.bizType ?? "CONSULT_TEXT",
      instant: row?.instant ?? false,
      priceYuan: centsToYuan(row?.priceCents),
      minutes: row?.minutes ?? 0,
      maxDailyCount: row?.maxDailyCount ?? 0,
      messageLimit: row?.messageLimit ?? 0,
      needPatient: row?.needPatient ?? true,
      status: row?.status ?? "ON",
    });
  }, [open, row, form, practitionerOptions]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.consultRuleSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          practitionerId: Number(values.practitionerId ?? 0),
          bizType: (values.bizType ?? "CONSULT_TEXT") as HealthConsultRuleRow["bizType"],
          instant: Boolean(values.instant),
          priceCents: yuanToCents(values.priceYuan),
          minutes: Number(values.minutes ?? 0),
          maxDailyCount: Number(values.maxDailyCount ?? 0),
          messageLimit: Number(values.messageLimit ?? 0),
          needPatient: Boolean(values.needPatient),
          status: (values.status ?? "ON") as HealthConsultRuleRow["status"],
        },
      });
      message.success(row ? "问诊规则已保存" : "问诊规则已创建");
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
      title={row ? `编辑问诊规则 · ${row.practitionerName}` : "新增问诊规则"}
      width={680}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="practitionerId"
            label="接诊医护"
            rules={[{ required: true, message: "请选择接诊医护" }]}
          >
            <Select showSearch optionFilterProp="label" options={practitionerOptions} />
          </Form.Item>
          <Form.Item
            name="bizType"
            label="问诊类型"
            rules={[{ required: true, message: "请选择问诊类型" }]}
          >
            <Select
              options={CONSULT_BIZ_TYPES.map((value) => ({
                value,
                label: labelOf(meta, "bizTypes", value),
              }))}
            />
          </Form.Item>
          <Form.Item name="priceYuan" label="价格（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="minutes" label="问诊时长（分钟）" extra="0 表示不限">
            <InputNumber min={0} max={1440} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="maxDailyCount" label="每日上限" extra="0 表示不限">
            <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="messageLimit" label="图文条数上限" extra="0 表示不限，仅图文问诊生效">
            <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="instant" label="极速问诊" valuePropName="checked" extra="不选时段，按响应时长约束">
            <Switch />
          </Form.Item>
          <Form.Item name="needPatient" label="需要就诊人" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 四、问诊单
// ============================================================================

function ConsultsPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const [page, setPage] = useState(1);
  const [bizType, setBizType] = useState("all");
  const [status, setStatus] = useState("all");
  const [practitionerId, setPractitionerId] = useState(0);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<HealthConsultRow | null>(null);
  const [sessionRow, setSessionRow] = useState<HealthConsultRow | null>(null);
  const [actionState, setActionState] = useState<{
    row: HealthConsultRow;
    action: ConsultAction;
  } | null>(null);
  const practitionerOptions = usePractitionerOptions(shopId);
  const resource = useHealthResource(
    () =>
      healthApi.consults({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          consultBizType: bizType,
          consultStatus: status,
          practitionerId,
          from: range ? range[0].format("YYYY-MM-DD") : "",
          to: range ? range[1].format("YYYY-MM-DD") : "",
        },
      }),
    [shopId, page, bizType, status, practitionerId, range],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const actionsOf = (row: HealthConsultRow): ConsultAction[] => {
    if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(row.status)) return [];
    if (row.status === "PENDING_PAYMENT") return ["CANCEL"];
    if (row.status === "WAIT_ACCEPT") return ["ACCEPT", "REJECT", "CANCEL"];
    const list: ConsultAction[] = ["CONCLUDE", "FINISH"];
    if (row.bizType === "CONSULT_TEXT") list.push("REMIND");
    list.push("CANCEL");
    return list;
  };

  const columns: ColumnsType<HealthConsultRow> = [
    {
      title: "类型",
      dataIndex: "bizType",
      width: 110,
      render: (value: string) => labelOf(meta, "bizTypes", value),
    },
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 170,
      render: (value: string) => value || "—",
    },
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "就诊人",
      dataIndex: "patientName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "接诊医护",
      dataIndex: "practitionerName",
      width: 120,
      render: (value: string) => value || "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => (
        <StatusTag meta={meta} kind="consultStatuses" value={value} />
      ),
    },
    {
      title: "预约时间",
      dataIndex: "appointAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "评分",
      dataIndex: "ratingScore",
      width: 90,
      render: (value: number) => (value > 0 ? `${value} 分` : "未评价"),
    },
    {
      title: "操作",
      width: 230,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => setDetail(row)}>
            详情
          </Button>
          {row.bizType === "CONSULT_TEXT" ? (
            <Button size="small" type="text" onClick={() => setSessionRow(row)}>
              会话
            </Button>
          ) : null}
          {actionsOf(row).map((action) => (
            <Button
              key={action}
              size="small"
              type="text"
              danger={action === "REJECT" || action === "CANCEL"}
              onClick={() => setActionState({ row, action })}
            >
              {CONSULT_ACTION_LABELS[action]}
            </Button>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="问诊单"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">图文问诊的沟通在 AI客服会话里进行，本页只做接单与结单</span>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">问诊类型</span>
          <Select
            value={bizType}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setBizType(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部类型" },
              ...CONSULT_BIZ_TYPES.map((value) => ({
                value,
                label: labelOf(meta, "bizTypes", value),
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={status}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...HEALTH_CONSULT_STATUSES.map((value) => ({
                value,
                label: consultStatusLabel(meta, value),
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">接诊医护</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 190 }}
            onChange={(value: number) => {
              setPractitionerId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医护" }, ...practitionerOptions]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">下单日期</span>
          <DatePicker.RangePicker
            value={range}
            onChange={(value) => {
              setPage(1);
              setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthConsultRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1260 }}
      />

      <ConsultDetailDrawer
        shopId={shopId}
        meta={meta}
        row={detail}
        onClose={() => setDetail(null)}
      />
      <ConsultSessionModal shopId={shopId} row={sessionRow} onClose={() => setSessionRow(null)} />
      <ConsultActionModal
        shopId={shopId}
        state={actionState}
        onClose={() => setActionState(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

function ConsultDetailDrawer({
  shopId,
  meta,
  row,
  onClose,
}: {
  shopId: number;
  meta: HealthMeta | null;
  row: HealthConsultRow | null;
  onClose: () => void;
}) {
  void meta;
  const open = Boolean(row && shopId);
  const resource = useHealthResource(
    () => healthApi.consultDetail({ query: { shopId, id: row?.id ?? 0 } }),
    [shopId, row?.id],
    open,
  );
  const detail = resource.data ?? row;

  return (
    <Drawer
      open={open}
      size="large"
      title={detail ? `问诊单 · ${detail.orderNo || detail.title}` : "问诊单详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "问诊类型", value: labelOf(meta, "bizTypes", detail.bizType) },
              {
                label: "状态",
                value: <StatusTag meta={meta} kind="consultStatuses" value={detail.status} />,
              },
              { label: "订单号", value: detail.orderNo || "—" },
              { label: "标题", value: detail.title || "—" },
              { label: "顾客", value: detail.customerName || "—" },
              { label: "就诊人", value: detail.patientName || "—" },
              { label: "接诊医护", value: detail.practitionerName || "—" },
              { label: "预约时间", value: detail.appointAt ? fmtTime(detail.appointAt) : "—" },
              { label: "联系电话", value: detail.contactPhoneMasked || "—" },
              { label: "开始时间", value: detail.startedAt ? fmtTime(detail.startedAt) : "—" },
              { label: "过期时间", value: detail.expiredAt ? fmtTime(detail.expiredAt) : "—" },
              { label: "完成时间", value: detail.finishedAt ? fmtTime(detail.finishedAt) : "—" },
              {
                label: "评分",
                value: detail.ratingScore > 0 ? `${detail.ratingScore} 分` : "未评价",
              },
            ]}
          />
          <div>
            <div className="muted text-12">症状描述</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.symptomText || "—"}</div>
          </div>
          <div>
            <div className="muted text-12">问诊结论</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.conclusion || "—"}</div>
          </div>
          {detail.attachments.length ? (
            <div>
              <div className="muted text-12">附件</div>
              <Space wrap style={{ marginTop: 4 }}>
                {detail.attachments.map((item) => (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                    {item.name || "查看附件"}
                  </a>
                ))}
              </Space>
            </div>
          ) : null}
          {detail.bizType === "CONSULT_TEXT" ? (
            <Notice variant="info">沟通统一在 AI客服进行，本页只展示会话标识与履约状态。</Notice>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function ConsultSessionModal({
  shopId,
  row,
  onClose,
}: {
  shopId: number;
  row: HealthConsultRow | null;
  onClose: () => void;
}) {
  const open = Boolean(row && shopId);
  const resource = useHealthResource(
    () => healthApi.consultSession({ query: { shopId, id: row?.id ?? 0 } }),
    [shopId, row?.id],
    open,
  );
  const session = resource.data;

  return (
    <Modal
      open={open}
      title={row ? `AI客服会话 · ${row.orderNo || row.title}` : "AI客服会话"}
      width={620}
      destroyOnHidden
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <Notice variant="info">沟通统一在 AI客服进行，本页不建聊天。</Notice>
      {resource.error ? <LoadError text={resource.error} /> : null}
      <div style={{ marginTop: 12 }}>
        {session ? (
          <Descriptions
            items={[
              { label: "站点标识", value: session.siteKey || "—" },
              { label: "会话编号", value: session.conversationId || "—" },
              {
                label: "访问令牌",
                value: (
                  <span style={{ wordBreak: "break-all" }}>{session.accessToken || "—"}</span>
                ),
              },
              {
                label: "流地址",
                value: <span style={{ wordBreak: "break-all" }}>{session.streamPath || "—"}</span>,
              },
              {
                label: "有效期至",
                value: session.expiresAt ? fmtTime(session.expiresAt) : "—",
              },
            ]}
          />
        ) : (
          <span className="muted text-12">正在读取会话参数…</span>
        )}
      </div>
    </Modal>
  );
}

function ConsultActionModal({
  shopId,
  state,
  onClose,
  onDone,
}: {
  shopId: number;
  state: { row: HealthConsultRow; action: ConsultAction } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason: string; conclusion: string }>();
  const [saving, setSaving] = useState(false);
  const open = state !== null;
  const action = state?.action;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ reason: "", conclusion: state?.row.conclusion ?? "" });
  }, [open, state, form]);

  const submit = async () => {
    if (!state) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.consultAction({
        body: {
          shopId,
          id: state.row.id,
          action: state.action,
          reason: values.reason ?? "",
          conclusion: values.conclusion ?? "",
        },
      });
      message.success(`${CONSULT_ACTION_LABELS[state.action]}已提交`);
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
      title={
        state
          ? `${CONSULT_ACTION_LABELS[state.action]} · ${state.row.orderNo || state.row.title}`
          : "问诊处理"
      }
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        {action === "REJECT" || action === "CANCEL" ? (
          <Form.Item
            name="reason"
            label={action === "REJECT" ? "拒诊原因" : "取消原因"}
            rules={[{ required: true, message: "请填写原因" }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="会同步到订单备注" />
          </Form.Item>
        ) : null}
        {action === "CONCLUDE" || action === "FINISH" ? (
          <Form.Item
            name="conclusion"
            label="问诊结论"
            rules={action === "CONCLUDE" ? [{ required: true, message: "请填写问诊结论" }] : []}
          >
            <Input.TextArea rows={4} maxLength={2000} showCount placeholder="诊断结论与建议" />
          </Form.Item>
        ) : null}
        {action === "ACCEPT" || action === "REMIND" ? (
          <span className="muted text-12">
            {action === "ACCEPT" ? "接单后进入沟通中，图文问诊会延长会话有效期。" : "提醒会延长图文会话有效期，不发消息。"}
          </span>
        ) : null}
      </Form>
    </Modal>
  );
}

// ============================================================================
// 五、家庭医生签约
// ============================================================================

function SignPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SignPackagesPanel shopId={shopId} meta={meta} />
      <SignOrdersPanel shopId={shopId} meta={meta} />
    </div>
  );
}

function useTeamOptions(shopId: number) {
  const resource = useHealthResource(
    () => healthApi.teams({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, organId: 0 } }),
    [shopId],
    shopId > 0,
  );
  return (resource.data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
}

function SignPackagesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [teamId, setTeamId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthSignPackageRow | "new" | null>(null);
  const teamOptions = useTeamOptions(shopId);
  const practitionerOptions = usePractitionerOptions(shopId);
  const resource = useHealthResource(
    () => healthApi.signPackages({ query: { shopId, page, pageSize: PAGE_SIZE, teamId } }),
    [shopId, page, teamId],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthSignPackageRow) => {
    setBusy(true);
    try {
      await healthApi.signPackageRemove({ body: { shopId, id: row.id } });
      message.success("签约套餐已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthSignPackageRow> = [
    {
      title: "套餐名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "服务团队", dataIndex: "teamName", width: 150, render: (value: string) => value || "—" },
    {
      title: "签约医护",
      dataIndex: "practitionerName",
      width: 130,
      render: (value: string) => value || "—",
    },
    { title: "价格", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "年限",
      dataIndex: "years",
      width: 90,
      render: (value: number) => `${value} 年`,
    },
    {
      title: "适用人群",
      dataIndex: "crowdKinds",
      width: 160,
      render: (value: string[]) => crowdText(meta, value),
    },
    {
      title: "权益",
      dataIndex: "benefits",
      width: 220,
      render: (value: HealthSignPackageRow["benefits"]) =>
        value.length
          ? value
              .map((item) => `${item.label || item.key}${item.quota > 0 ? `×${item.quota}` : "×不限"}`)
              .join("、")
          : "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "已签约", dataIndex: "orderCount", width: 90 },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后小程序端不再售卖该套餐，已生效的签约不受影响。"
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
      title="签约套餐"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">套餐按年限售卖，权益次数决定履约边界</span>}
      extra={
        <Space>
          <Select
            value={teamId}
            style={{ width: 180 }}
            onChange={(value: number) => {
              setTeamId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部团队" }, ...teamOptions]}
          />
          <Button type="primary" size="small" onClick={() => setEditing("new")}>
            新增套餐
          </Button>
        </Space>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthSignPackageRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1380 }}
      />

      <SignPackageModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        teamOptions={teamOptions}
        practitionerOptions={practitionerOptions}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type SignPackageBenefit = { key: string; label: string; quota: number; desc: string };

type SignPackageFormValues = {
  name: string;
  teamId: number;
  practitionerId: number;
  priceYuan: number;
  years: number;
  crowdKinds: string[];
  intro: string;
  status: string;
  benefits: SignPackageBenefit[];
};

function SignPackageModal({
  shopId,
  meta,
  editing,
  teamOptions,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthSignPackageRow | "new" | null;
  teamOptions: { value: number; label: string }[];
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SignPackageFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      teamId: row?.teamId ?? teamOptions[0]?.value ?? 0,
      practitionerId: row?.practitionerId ?? 0,
      priceYuan: centsToYuan(row?.priceCents),
      years: row?.years ?? 1,
      crowdKinds: row?.crowdKinds ?? [],
      intro: row?.intro ?? "",
      status: row?.status ?? "ON",
      benefits: row?.benefits ?? [],
    });
  }, [open, row, form, teamOptions]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.signPackageSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          teamId: Number(values.teamId ?? 0),
          practitionerId: Number(values.practitionerId ?? 0),
          priceCents: yuanToCents(values.priceYuan),
          years: Number(values.years ?? 1),
          crowdKinds: (values.crowdKinds ?? []) as HealthCrowdKind[],
          intro: values.intro ?? "",
          status: (values.status ?? "ON") as HealthSignPackageRow["status"],
          benefits: (values.benefits ?? []).map((item) => ({
            key: String(item?.key ?? "").trim(),
            label: String(item?.label ?? "").trim(),
            quota: Number(item?.quota ?? 0),
            desc: String(item?.desc ?? "").trim(),
          })),
        },
      });
      message.success(row ? "签约套餐已保存" : "签约套餐已创建");
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
      title={row ? `编辑签约套餐 · ${row.name}` : "新增签约套餐"}
      width={760}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="套餐名称"
            rules={[{ required: true, message: "请填写套餐名称" }]}
          >
            <Input maxLength={80} placeholder="如 家庭医生年卡（基础版）" />
          </Form.Item>
          <Form.Item name="teamId" label="服务团队">
            <Select
              options={[{ value: 0, label: "暂不指定" }, ...teamOptions]}
              placeholder="选择团队"
            />
          </Form.Item>
          <Form.Item name="practitionerId" label="签约医护">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "暂不指定" }, ...practitionerOptions]}
            />
          </Form.Item>
          <Form.Item name="priceYuan" label="价格（元）" rules={[{ required: true, message: "请填写价格" }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="years" label="签约年限">
            <InputNumber min={1} max={5} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="crowdKinds" label="适用人群">
          <Select
            mode="multiple"
            allowClear
            placeholder="不选即全部人群"
            options={dictOptions(meta?.crowdKinds, HEALTH_CROWD_KINDS, HEALTH_CROWD_KIND_LABELS)}
          />
        </Form.Item>
        <div className="muted text-12" style={{ marginBottom: 6 }}>
          签约权益：次数额度填 0 表示不限次
        </div>
        <Form.List name="benefits">
          {(fields, { add, remove }) => (
            <div style={{ display: "grid", gap: 8 }}>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 100px 1.4fr 40px",
                    gap: 8,
                  }}
                >
                  <Form.Item name={[field.name, "key"]} style={{ marginBottom: 0 }}>
                    <Input maxLength={40} placeholder="权益键，如 consult" />
                  </Form.Item>
                  <Form.Item name={[field.name, "label"]} style={{ marginBottom: 0 }}>
                    <Input maxLength={40} placeholder="权益名称" />
                  </Form.Item>
                  <Form.Item name={[field.name, "quota"]} style={{ marginBottom: 0 }}>
                    <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name={[field.name, "desc"]} style={{ marginBottom: 0 }}>
                    <Input maxLength={200} placeholder="权益说明" />
                  </Form.Item>
                  <Button size="small" type="text" danger onClick={() => remove(field.name)}>
                    移除
                  </Button>
                </div>
              ))}
              <Button
                type="dashed"
                block
                onClick={() => add({ key: "", label: "", quota: 0, desc: "" })}
              >
                添加权益
              </Button>
            </div>
          )}
        </Form.List>
        <Form.Item name="intro" label="套餐介绍" style={{ marginTop: 12 }}>
          <Input.TextArea rows={3} maxLength={4000} showCount placeholder="服务内容与签约须知" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SignOrdersPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [signStatus, setSignStatus] = useState("all");
  const [detail, setDetail] = useState<HealthSignOrderRow | null>(null);
  const [signing, setSigning] = useState<HealthSignOrderRow | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.signOrders({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          patientId: patientId ?? 0,
          signStatus,
        },
      }),
    [shopId, page, patientId, signStatus],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const signText = (row: HealthSignOrderRow) =>
    row.signPhotoUrl || row.signatureUrl ? "已留痕" : "待补录";

  const columns: ColumnsType<HealthSignOrderRow> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 170,
      render: (value: string) => value || "—",
    },
    {
      title: "签约套餐",
      dataIndex: "packageName",
      width: 190,
      render: (value: string) => <strong>{value || "—"}</strong>,
    },
    {
      title: "就诊人",
      dataIndex: "patientName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 110,
      render: (value: string) => value || "—",
    },
    { title: "团队", dataIndex: "teamName", width: 140, render: (value: string) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag
          color={
            value === "EFFECTIVE"
              ? "green"
              : value === "SIGNED"
                ? "blue"
                : value === "EXPIRED" || value === "REFUNDED" || value === "CANCELLED"
                  ? "default"
                  : "gold"
          }
        >
          {HEALTH_SIGN_ORDER_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "服务期",
      width: 220,
      render: (_: unknown, row) =>
        row.startAt || row.endAt
          ? `${row.startAt ? fmtTime(row.startAt) : "—"} 至 ${row.endAt ? fmtTime(row.endAt) : "—"}`
          : "—",
    },
    { title: "金额", dataIndex: "amountCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "签署留痕",
      width: 100,
      render: (_: unknown, row) => (
        <Tag color={row.signPhotoUrl || row.signatureUrl ? "green" : "default"}>
          {signText(row)}
        </Tag>
      ),
    },
    {
      title: "操作",
      width: 140,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setSigning(row)}>
            签署留痕
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="签约单"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">线下签署的拍照与签名上传后作为履约凭证</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">就诊人编号</span>
          <InputNumber
            min={0}
            precision={0}
            placeholder="按就诊人筛选"
            style={{ width: 170 }}
            value={patientId}
            onChange={(value) => {
              setPage(1);
              setPatientId(value ?? null);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">签约状态</span>
          <Select
            value={signStatus}
            style={{ width: 170 }}
            onChange={(value: string) => {
              setSignStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...HEALTH_SIGN_ORDER_STATUSES.map((value) => ({
                value,
                label: HEALTH_SIGN_ORDER_STATUS_LABELS[value] ?? value,
              })),
            ]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthSignOrderRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1480 }}
      />

      <SignOrderDrawer shopId={shopId} meta={meta} row={detail} onClose={() => setDetail(null)} />
      <SignOrderSignModal
        shopId={shopId}
        row={signing}
        onClose={() => setSigning(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

function SignOrderDrawer({
  shopId,
  meta,
  row,
  onClose,
}: {
  shopId: number;
  meta: HealthMeta | null;
  row: HealthSignOrderRow | null;
  onClose: () => void;
}) {
  void meta;
  const open = Boolean(row && shopId);
  const resource = useHealthResource(
    () => healthApi.signOrderDetail({ query: { shopId, id: row?.id ?? 0 } }),
    [shopId, row?.id],
    open,
  );
  const detail = resource.data ?? row;

  return (
    <Drawer
      open={open}
      size="large"
      title={detail ? `签约单 · ${detail.orderNo || detail.packageName}` : "签约单详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "订单号", value: detail.orderNo || "—" },
              { label: "签约套餐", value: detail.packageName || "—" },
              {
                label: "状态",
                value: HEALTH_SIGN_ORDER_STATUS_LABELS[detail.status] ?? detail.status,
              },
              { label: "顾客", value: detail.customerName || "—" },
              { label: "就诊人", value: detail.patientName || "—" },
              { label: "服务团队", value: detail.teamName || "—" },
              { label: "签约医护", value: detail.practitionerName || "—" },
              { label: "金额", value: cny(detail.amountCents) },
              { label: "开始时间", value: detail.startAt ? fmtTime(detail.startAt) : "—" },
              { label: "结束时间", value: detail.endAt ? fmtTime(detail.endAt) : "—" },
              { label: "核销码", value: detail.verifyCode || "—" },
              {
                label: "核销状态",
                value: (
                  <Tag color={detail.verified ? "green" : "default"}>
                    {detail.verified ? "已核销" : "未核销"}
                  </Tag>
                ),
              },
              {
                label: "签署留痕",
                value: (
                  <Space size={8}>
                    {detail.signPhotoUrl ? (
                      <a href={detail.signPhotoUrl} target="_blank" rel="noreferrer">
                        签约照片
                      </a>
                    ) : null}
                    {detail.signatureUrl ? (
                      <a href={detail.signatureUrl} target="_blank" rel="noreferrer">
                        手写签名
                      </a>
                    ) : null}
                    {!detail.signPhotoUrl && !detail.signatureUrl ? "未上传" : null}
                  </Space>
                ),
              },
            ]}
          />
          <div>
            <div className="muted text-12">权益使用情况</div>
            {detail.benefitUsed.length ? (
              <DataTable
                rows={detail.benefitUsed}
                page={1}
                rowKey="key"
                scroll={{ x: 420 }}
                columns={[
                  { title: "权益", dataIndex: "label" },
                  {
                    title: "已用",
                    dataIndex: "used",
                    width: 100,
                    render: (value: number) => `${value}`,
                  },
                  {
                    title: "额度",
                    dataIndex: "quota",
                    width: 100,
                    render: (value: number) => (value > 0 ? `${value}` : "不限"),
                  },
                ]}
              />
            ) : (
              <span className="muted text-12">还没有权益使用记录</span>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function SignOrderSignModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthSignOrderRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ signPhotoUrl: string; signatureUrl: string }>();
  const [saving, setSaving] = useState(false);
  const open = Boolean(row);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({
      signPhotoUrl: row.signPhotoUrl ?? "",
      signatureUrl: row.signatureUrl ?? "",
    });
  }, [row, form]);

  const submit = async () => {
    if (!row) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.signOrderSignSave({
        body: {
          shopId,
          id: row.id,
          signPhotoUrl: values.signPhotoUrl ?? "",
          signatureUrl: values.signatureUrl ?? "",
        },
      });
      message.success("签署留痕已保存");
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
      title={row ? `签署留痕 · ${row.orderNo || row.packageName}` : "签署留痕"}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="signPhotoUrl"
          label="签约拍照"
          extra="线下签署时的合影或协议照片地址，留空表示未上传"
        >
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
        <Form.Item name="signatureUrl" label="手写签名" extra="签名图片地址，留空表示未上传">
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 六、绿通快约
// ============================================================================

/** 按当前状态给出可推进的下一状态；已完成/已退单不再推进。 */
const GREEN_NEXT_STATUSES: Record<string, string[]> = {
  PENDING: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["MATCHING", "BOOKED", "REJECTED"],
  MATCHING: ["BOOKED", "REJECTED"],
  BOOKED: ["DONE"],
};

function GreenPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [greenStatus, setGreenStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [detail, setDetail] = useState<HealthGreenOrderRow | null>(null);
  const [progressState, setProgressState] = useState<{
    row: HealthGreenOrderRow;
    status: string;
  } | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.greenOrders({
        query: { shopId, page, pageSize: PAGE_SIZE, greenStatus, kind },
      }),
    [shopId, page, greenStatus, kind],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const columns: ColumnsType<HealthGreenOrderRow> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 170,
      render: (value: string) => value || "—",
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 100,
      render: (value: string) => GREEN_KIND_LABELS[value] ?? value,
    },
    {
      title: "就诊人",
      dataIndex: "patientName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "目标医院 / 科室",
      width: 200,
      render: (_: unknown, row) => (
        <div>
          <div>{row.targetHospital || "—"}</div>
          <div className="muted text-12">{row.targetDepartment || "—"}</div>
        </div>
      ),
    },
    {
      title: "期望时间",
      dataIndex: "expectAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag
          color={
            value === "DONE" || value === "BOOKED"
              ? "green"
              : value === "REJECTED"
                ? "red"
                : value === "PENDING"
                  ? "gold"
                  : "blue"
          }
        >
          {HEALTH_GREEN_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "匹配结果",
      width: 190,
      render: (_: unknown, row) => (
        <div>
          <div>{row.matchedHospital || "—"}</div>
          <div className="muted text-12">{row.matchedDoctor || "—"}</div>
        </div>
      ),
    },
    {
      title: "操作",
      width: 240,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => setDetail(row)}>
            详情
          </Button>
          {(GREEN_NEXT_STATUSES[row.status] ?? []).map((status) => (
            <Button
              key={status}
              size="small"
              type="text"
              danger={status === "REJECTED"}
              onClick={() => setProgressState({ row, status })}
            >
              {HEALTH_GREEN_STATUS_LABELS[status] ?? status}
            </Button>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="绿通快约"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">推进状态时补录匹配医院与医生，每一步都会留进度记录</span>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">工单状态</span>
          <Select
            value={greenStatus}
            style={{ width: 170 }}
            onChange={(value: string) => {
              setGreenStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...HEALTH_GREEN_STATUSES.map((value) => ({
                value,
                label: HEALTH_GREEN_STATUS_LABELS[value] ?? value,
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">类型</span>
          <Select
            value={kind}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部类型" },
              { value: "GREEN", label: GREEN_KIND_LABELS.GREEN },
              { value: "OPERATION", label: GREEN_KIND_LABELS.OPERATION },
            ]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthGreenOrderRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1480 }}
      />

      <GreenDetailDrawer shopId={shopId} row={detail} onClose={() => setDetail(null)} />
      <GreenProgressModal
        shopId={shopId}
        state={progressState}
        onClose={() => setProgressState(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

function GreenDetailDrawer({
  shopId,
  row,
  onClose,
}: {
  shopId: number;
  row: HealthGreenOrderRow | null;
  onClose: () => void;
}) {
  const open = Boolean(row && shopId);
  const resource = useHealthResource(
    () => healthApi.greenDetail({ query: { shopId, id: row?.id ?? 0 } }),
    [shopId, row?.id],
    open,
  );
  const detail = resource.data ?? row;

  return (
    <Drawer
      open={open}
      size="large"
      title={detail ? `绿通单 · ${detail.orderNo || detail.patientName}` : "绿通单详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "订单号", value: detail.orderNo || "—" },
              { label: "类型", value: GREEN_KIND_LABELS[detail.kind] ?? detail.kind },
              {
                label: "状态",
                value: HEALTH_GREEN_STATUS_LABELS[detail.status] ?? detail.status,
              },
              { label: "目标医院", value: detail.targetHospital || "—" },
              { label: "目标科室", value: detail.targetDepartment || "—" },
              { label: "期望时间", value: detail.expectAt ? fmtTime(detail.expectAt) : "—" },
              { label: "紧急程度", value: detail.urgency || "—" },
              { label: "顾客", value: detail.customerName || "—" },
              { label: "就诊人", value: detail.patientName || "—" },
              { label: "匹配医院", value: detail.matchedHospital || "—" },
              { label: "匹配医生", value: detail.matchedDoctor || "—" },
              { label: "匹配时间", value: detail.matchedAt ? fmtTime(detail.matchedAt) : "—" },
              { label: "金额", value: cny(detail.amountCents) },
              {
                label: "提交时间",
                value: detail.createdAt ? fmtTime(detail.createdAt) : "—",
              },
            ]}
          />
          <div>
            <div className="muted text-12">病情描述</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.symptomText || "—"}</div>
          </div>
          {detail.attachments.length ? (
            <div>
              <div className="muted text-12">病历附件</div>
              <Space wrap style={{ marginTop: 4 }}>
                {detail.attachments.map((item) => (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                    {item.name || "查看附件"}
                  </a>
                ))}
              </Space>
            </div>
          ) : null}
          <div>
            <div className="muted text-12">推进记录</div>
            {detail.progress.length ? (
              <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                {detail.progress.map((step) => (
                  <div
                    key={`${step.at}-${step.label}`}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{step.label || "进度"}</strong>
                      <span className="muted text-12">{step.at ? fmtTime(step.at) : "—"}</span>
                    </div>
                    <div className="text-12">{step.note || "—"}</div>
                    <div className="muted text-12">操作人：{step.operatorName || "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">还没有推进记录</span>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function GreenProgressModal({
  shopId,
  state,
  onClose,
  onDone,
}: {
  shopId: number;
  state: { row: HealthGreenOrderRow; status: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    status: string;
    matchedHospital: string;
    matchedDoctor: string;
    matchedAt: Dayjs | null;
    note: string;
  }>();
  const [saving, setSaving] = useState(false);
  const open = state !== null;

  useEffect(() => {
    if (!state) return;
    form.setFieldsValue({
      status: state.status,
      matchedHospital: state.row.matchedHospital ?? "",
      matchedDoctor: state.row.matchedDoctor ?? "",
      matchedAt: state.row.matchedAt ? dayjs(state.row.matchedAt) : null,
      note: "",
    });
  }, [state, form]);

  const submit = async () => {
    if (!state) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.greenProgress({
        body: {
          shopId,
          id: state.row.id,
          status: (values.status ?? state.status) as HealthGreenOrderRow["status"],
          matchedHospital: values.matchedHospital ?? "",
          matchedDoctor: values.matchedDoctor ?? "",
          matchedAt: values.matchedAt ? values.matchedAt.format("YYYY-MM-DD HH:mm") : "",
          note: values.note ?? "",
        },
      });
      message.success("工单进度已更新");
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
      title={state ? `推进工单 · ${state.row.orderNo || state.row.patientName}` : "推进工单"}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="status"
          label="推进到"
          rules={[{ required: true, message: "请选择目标状态" }]}
        >
          <Select
            options={HEALTH_GREEN_STATUSES.map((value) => ({
              value,
              label: HEALTH_GREEN_STATUS_LABELS[value] ?? value,
            }))}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="matchedHospital" label="匹配医院">
            <Input maxLength={120} placeholder="如 某某市第一人民医院" />
          </Form.Item>
          <Form.Item name="matchedDoctor" label="匹配医生">
            <Input maxLength={60} placeholder="如 王医生（心内科）" />
          </Form.Item>
        </div>
        <Form.Item name="matchedAt" label="约到时间">
          <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="note" label="进度备注" extra="会作为本次进度记录的内容">
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="沟通结果、号源信息与注意事项" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
