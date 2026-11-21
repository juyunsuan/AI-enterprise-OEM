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
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HealthAlertRow,
  HealthCrowdGroupRow,
  HealthCustomerDetail,
  HealthCustomerRow,
  HealthDictItemRow,
  HealthMedicalEventRow,
  HealthMeta,
  HealthOrderRow,
  HealthPatientRelation,
  HealthPatientRow,
  HealthRecordRow,
  HealthReportDetail,
  HealthReportRow,
} from "@enterprise/contracts";
import {
  HEALTH_ALERT_STATUS_LABELS,
  HEALTH_CROWD_KINDS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_MEDICAL_EVENT_KINDS,
  HEALTH_MEDICAL_EVENT_KIND_LABELS,
  HEALTH_PATIENT_RELATIONS,
  HEALTH_PATIENT_RELATION_LABELS,
  HEALTH_RECORD_ITEM_TYPES,
  HEALTH_RECORD_ITEM_TYPE_LABELS,
  HEALTH_REPORT_SOURCE_LABELS,
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
  cny,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 就诊人与档案：顾客台账、就诊人、人群分组、健康档案、医疗事件、店铺字典与体检报告。
 * 档案只做「记录 + 提示」，页面不出现任何诊断或治疗结论。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

/** 分页返回体；详情/列表接口按约定可能回 null，取数侧统一兜底。 */
type Paged<T> = { list: T[]; total: number } | null;

const ALERT_TONE: Record<string, string> = {
  OPEN: "red",
  ACKED: "gold",
  RESOLVED: "green",
  FALSE: "default",
};

const SEVERITY_LABELS: Record<string, string> = { LOW: "低", MEDIUM: "中", HIGH: "高" };

const REPORT_KINDS = [
  { value: "EXAM", label: "体检报告" },
  { value: "LAB", label: "化验单" },
  { value: "IMAGE", label: "影像报告" },
  { value: "OTHER", label: "其他" },
];

const GENDERS = ["男", "女", "未知"];
const BLOOD_TYPES = ["A", "B", "AB", "O", "不详"];

/** 档案「基本信息」的固定字段：未知键原样保留，不因编辑而丢历史数据。 */
const BASIC_FIELDS = [
  { key: "bloodType", label: "血型", placeholder: "如 A / O" },
  { key: "heightCm", label: "身高（cm）" },
  { key: "weightKg", label: "体重（kg）" },
  { key: "smoke", label: "吸烟情况", placeholder: "如 不吸烟 / 每日 10 支" },
  { key: "drink", label: "饮酒情况", placeholder: "如 偶尔 / 每周 2 次" },
  { key: "exercise", label: "运动习惯", placeholder: "如 每周快走 3 次" },
  { key: "sleep", label: "睡眠情况", placeholder: "如 7 小时 / 易醒" },
  { key: "remark", label: "其他说明" },
];

const relationLabel = (value: string) => HEALTH_PATIENT_RELATION_LABELS[value] || value;
const eventKindLabel = (value: string) => HEALTH_MEDICAL_EVENT_KIND_LABELS[value] || value;

/** 平台字典优先，字典缺该项时回落契约常量，不把枚举原样甩到界面。 */
const dictLabel = (
  meta: HealthMeta | null,
  kind: "crowdKinds" | "recordItemTypes",
  value: string,
  fallback: Record<string, string>,
) => {
  const text = labelOf(meta, kind, value);
  return text === value ? fallback[value] || value : text;
};
const crowdKindLabel = (meta: HealthMeta | null, value: string) =>
  dictLabel(meta, "crowdKinds", value, HEALTH_CROWD_KIND_LABELS);
const recordItemTypeLabel = (meta: HealthMeta | null, value: string) =>
  dictLabel(meta, "recordItemTypes", value, HEALTH_RECORD_ITEM_TYPE_LABELS);
const reportKindLabel = (value: string) =>
  REPORT_KINDS.find((item) => item.value === value)?.label || value || "—";
const severityLabel = (value: string) => SEVERITY_LABELS[value] || value || "—";

function AlertStatusTag({ value }: { value: string }) {
  return <Tag color={ALERT_TONE[value] ?? "default"}>{HEALTH_ALERT_STATUS_LABELS[value] || value}</Tag>;
}

/** 逗号 / 换行分隔的地址串 → 文件列表（名字取末段，够列表区分即可）。 */
function parseFiles(text: unknown) {
  return String(text ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 9)
    .map((url) => ({
      name: url.split("/").pop()?.split("?")[0] || "附件",
      url,
    }));
}

const filesToText = (files: { url: string }[]) => files.map((item) => item.url).join("\n");

/**
 * 分页取数：失败弹一次提示并保留上一次结果，变更成功后由调用方 reload。
 * （选项类小接口用 `useHealthResource`，这里只管带筛选的主表。）
 */
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
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const depKey = JSON.stringify(deps);

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const result = await loadRef.current();
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : errorText);
    } finally {
      setLoading(false);
    }
  }, [enabled, errorText, message]);

  useEffect(() => {
    void run();
    // depKey 是 deps 的稳定序列化，避免每次渲染新建数组导致死循环。
  }, [run, depKey]);

  return { rows, total, loading, reload: run };
}

/** 下拉选项：一家店的顾客 / 就诊人 / 人群分组 / 医护在前 100 条内可覆盖。 */
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
    loading: state.loading,
    reload: state.reload,
  };
}

function useCustomerOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.customers({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data?.list ?? [];
  return {
    rows,
    options: rows.map((row) => ({
      value: row.id,
      label: `${row.nickname || "微信用户"}（${row.phone || "无手机号"}）`,
    })),
  };
}

function useCrowdOptions(shopId: number) {
  const state = useHealthResource(
    () => healthApi.crowdGroups({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = state.data ?? [];
  return {
    rows,
    options: rows.map((row) => ({ value: row.id, label: row.name })),
    loading: state.loading,
    reload: state.reload,
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

export function PatientsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("customers");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "customers", label: "顾客", children: <CustomerPanel shopId={shopId} meta={meta} /> },
        { key: "patients", label: "就诊人", children: <PatientPanel shopId={shopId} meta={meta} /> },
        { key: "crowds", label: "人群分组", children: <CrowdPanel shopId={shopId} meta={meta} /> },
        { key: "records", label: "健康档案", children: <RecordPanel shopId={shopId} meta={meta} /> },
        { key: "events", label: "医疗事件", children: <EventPanel shopId={shopId} meta={meta} /> },
        { key: "dicts", label: "字典", children: <DictPanel shopId={shopId} /> },
        { key: "reports", label: "体检报告", children: <ReportPanel shopId={shopId} meta={meta} /> },
      ]}
    />
  );
}

// ============================================================================
// 一、顾客
// ============================================================================

function CustomerPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [memberLevelId, setMemberLevelId] = useState(0);
  const [crowdGroupId, setCrowdGroupId] = useState(0);
  const [detail, setDetail] = useState<HealthCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<HealthCustomerRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const levels = useHealthResource(
    () => healthApi.memberLevels({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const crowds = useCrowdOptions(shopId);

  const list = usePagedRows<HealthCustomerRow>({
    load: () =>
      healthApi.customers({
        query: { shopId, page, pageSize: PAGE_SIZE, keyword, status, memberLevelId, crowdGroupId },
      }),
    deps: [shopId, page, keyword, status, memberLevelId, crowdGroupId],
    enabled: shopId > 0,
    errorText: "顾客读取失败",
  });

  const openDetail = async (row: HealthCustomerRow) => {
    setDetailLoading(true);
    try {
      setDetail(await healthApi.customerDetail({ query: { shopId, id: row.id } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "顾客详情读取失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const data = await healthApi.customerExport({ query: { shopId } });
      if (data?.url) window.open(data.url, "_blank", "noopener");
      message.success(
        data?.message ||
          `已生成 ${data?.fileName || "顾客名单"}，共 ${data?.count ?? 0} 条顾客记录`,
      );
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<HealthCustomerRow> = [
    {
      title: "顾客",
      dataIndex: "nickname",
      render: (value: string) => <strong>{value || "微信用户"}</strong>,
    },
    { title: "手机号", dataIndex: "phone", width: 130, render: (value: string) => value || "—" },
    { title: "性别", dataIndex: "gender", width: 70, render: (value: string) => value || "—" },
    { title: "城市", dataIndex: "city", width: 100, render: (value: string) => value || "—" },
    {
      title: "会员等级",
      dataIndex: "memberLevelName",
      width: 110,
      render: (value: string) => value || "—",
    },
    { title: "就诊人", dataIndex: "patientCount", width: 80 },
    { title: "订单", dataIndex: "orderCount", width: 80 },
    {
      title: "累计消费",
      dataIndex: "totalPayCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "钱包余额",
      dataIndex: "walletCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    { title: "积分", dataIndex: "pointValue", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "最近活跃",
      dataIndex: "lastActiveAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" loading={detailLoading} onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="顾客"
      titleExtra={<span className="muted text-12">手机号按店铺脱敏展示，详情查看会留审计</span>}
      extra={
        <Button size="small" loading={exporting} onClick={() => void exportRows()}>
          导出名单
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">关键词</span>
          <Input.Search
            allowClear
            placeholder="昵称或手机号"
            style={{ width: 190 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">会员等级</span>
          <Select
            value={memberLevelId}
            style={{ width: 150 }}
            onChange={(value: number) => {
              setMemberLevelId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部等级" },
              ...(levels.data ?? []).map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">人群分组</span>
          <Select
            value={crowdGroupId}
            style={{ width: 160 }}
            onChange={(value: number) => {
              setCrowdGroupId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部分组" }, ...crowds.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={status}
            style={{ width: 120 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              { value: "ON", label: "启用" },
              { value: "OFF", label: "停用" },
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
          scroll={{ x: 1560 }}
        />
      ) : (
        <EmptyState text="还没有顾客：顾客用小程序登录或下单后会自动进这份台账。" />
      )}

      <Drawer
        open={Boolean(detail)}
        size="large"
        title={detail ? `顾客详情 · ${detail.customer.nickname || "微信用户"}` : "顾客详情"}
        onClose={() => setDetail(null)}
        destroyOnHidden
      >
        {detail ? <CustomerDetailBody detail={detail} meta={meta} /> : null}
      </Drawer>

      <CustomerModal
        shopId={shopId}
        row={editing}
        levelOptions={(levels.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function CustomerDetailBody({
  detail,
  meta,
}: {
  detail: HealthCustomerDetail;
  meta: HealthMeta | null;
}) {
  const { customer, patients, recentOrders, recentAlerts } = detail;

  const patientColumns: ColumnsType<HealthPatientRow> = [
    { title: "姓名", dataIndex: "name" },
    {
      title: "关系",
      dataIndex: "relation",
      width: 80,
      render: (value: string) => relationLabel(value),
    },
    { title: "性别", dataIndex: "gender", width: 70 },
    { title: "年龄", dataIndex: "age", width: 70 },
    { title: "手机号", dataIndex: "phone", width: 130, render: (value: string) => value || "—" },
    {
      title: "人群",
      dataIndex: "crowdNames",
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
  ];

  const orderColumns: ColumnsType<HealthOrderRow> = [
    { title: "订单号", dataIndex: "orderNo", width: 180 },
    {
      title: "业务",
      dataIndex: "bizType",
      width: 110,
      render: (value: string) => labelOf(meta, "bizTypes", value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="orderStatuses" value={value} />,
    },
    {
      title: "实付",
      dataIndex: "payAmountCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "下单时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  const alertColumns: ColumnsType<HealthAlertRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 100 },
    { title: "指标", dataIndex: "metricName", width: 120 },
    {
      title: "数值",
      dataIndex: "value",
      width: 100,
      render: (value: number, row) => `${value}${row.unit || ""}`,
    },
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
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Descriptions
        items={[
          { label: "昵称", value: customer.nickname || "微信用户" },
          { label: "手机号", value: customer.phone || "—" },
          { label: "性别", value: customer.gender || "—" },
          { label: "城市", value: customer.city || "—" },
          { label: "会员等级", value: customer.memberLevelName || "—" },
          {
            label: "来源",
            value: customer.source ? customer.source : "小程序",
          },
          { label: "推荐人", value: customer.promoterName || "无" },
          { label: "就诊人", value: customer.patientCount },
          { label: "订单数", value: customer.orderCount },
          { label: "累计消费", value: cny(customer.totalPayCents) },
          { label: "钱包余额", value: cny(customer.walletCents) },
          { label: "积分", value: customer.pointValue },
          { label: "状态", value: <OnOffTag value={customer.status} /> },
          {
            label: "最近活跃",
            value: customer.lastActiveAt ? fmtTime(customer.lastActiveAt) : "—",
          },
          { label: "注册时间", value: customer.createdAt ? fmtTime(customer.createdAt) : "—" },
        ]}
      />
      <div>
        <div className="muted text-12">店主备注</div>
        <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.remark || "—"}</div>
      </div>
      <div>
        <div className="muted text-12">就诊人</div>
        {patients.length ? (
          <DataTable rows={patients} columns={patientColumns} page={1} scroll={{ x: 720 }} />
        ) : (
          <div style={{ marginTop: 4 }}>该顾客还没有建档就诊人。</div>
        )}
      </div>
      <div>
        <div className="muted text-12">最近订单</div>
        {recentOrders.length ? (
          <DataTable rows={recentOrders} columns={orderColumns} page={1} scroll={{ x: 660 }} />
        ) : (
          <div style={{ marginTop: 4 }}>暂无订单。</div>
        )}
      </div>
      <div>
        <div className="muted text-12">最近预警</div>
        {recentAlerts.length ? (
          <DataTable rows={recentAlerts} columns={alertColumns} page={1} scroll={{ x: 660 }} />
        ) : (
          <div style={{ marginTop: 4 }}>暂无预警记录。</div>
        )}
      </div>
    </div>
  );
}

type CustomerFormValues = {
  nickname: string;
  phone: string;
  city: string;
  memberLevelId: number;
  remark: string;
  status: string;
};

function CustomerModal({
  shopId,
  row,
  levelOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthCustomerRow | null;
  levelOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CustomerFormValues>();
  const [saving, setSaving] = useState(false);
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!row) return;
    setRemark("");
    form.setFieldsValue({
      nickname: row.nickname,
      phone: row.phone,
      city: row.city,
      memberLevelId: row.memberLevelId,
      remark: "",
      status: row.status,
    });
    // 备注只存详情接口，打开详情时再回填，避免列表口径混用。
    void healthApi
      .customerDetail({ query: { shopId, id: row.id } })
      .then((detail) => {
        if (!detail) return;
        setRemark(detail.remark);
        form.setFieldValue("remark", detail.remark);
      })
      .catch(() => undefined);
  }, [row, shopId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.customerSave({
        body: {
          shopId,
          id: row.id,
          nickname: values.nickname ?? "",
          phone: values.phone ?? "",
          city: values.city ?? "",
          memberLevelId: Number(values.memberLevelId ?? 0),
          remark: values.remark ?? "",
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("顾客资料已保存");
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
      open={Boolean(row)}
      title={row ? `编辑顾客 · ${row.nickname || "微信用户"}` : "编辑顾客"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="nickname" label="昵称">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="phone" label="手机号" extra="改动会占用该号码，重复会报冲突">
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="city" label="城市">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="memberLevelId" label="会员等级">
            <Select
              options={[{ value: 0, label: "不指定等级" }, ...levelOptions]}
              placeholder="不指定等级"
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
        <Form.Item name="remark" label="店主备注" extra="仅店主侧可见">
          <Input.TextArea rows={3} maxLength={500} showCount placeholder={remark || "例如：高血压随访重点顾客"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 二、就诊人
// ============================================================================

function PatientPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  void meta;
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [customerId, setCustomerId] = useState(0);
  const [practitionerId, setPractitionerId] = useState(0);
  const [crowdGroupId, setCrowdGroupId] = useState(0);
  const [editing, setEditing] = useState<HealthPatientRow | "new" | null>(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const customers = useCustomerOptions(shopId);
  const practitioners = usePractitionerOptions(shopId);
  const crowds = useCrowdOptions(shopId);
  const patientOptions = usePatientOptions(shopId);

  const list = usePagedRows<HealthPatientRow>({
    load: () =>
      healthApi.patients({
        query: { shopId, page, pageSize: PAGE_SIZE, keyword, customerId, practitionerId, crowdGroupId },
      }),
    deps: [shopId, page, keyword, customerId, practitionerId, crowdGroupId],
    enabled: shopId > 0,
    errorText: "就诊人读取失败",
  });

  const remove = async (row: HealthPatientRow) => {
    setBusy(true);
    try {
      await healthApi.patientRemove({ body: { shopId, id: row.id } });
      message.success("就诊人已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthPatientRow> = [
    { title: "姓名", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "所属顾客", dataIndex: "customerLabel", width: 140, render: (v: string) => v || "—" },
    {
      title: "关系",
      dataIndex: "relation",
      width: 80,
      render: (value: string) => relationLabel(value),
    },
    { title: "性别", dataIndex: "gender", width: 70, render: (v: string) => v || "—" },
    { title: "年龄", dataIndex: "age", width: 70 },
    {
      title: "生日",
      dataIndex: "birthday",
      width: 110,
      render: (value: string) => (value ? fmtDate(value) : "—"),
    },
    { title: "手机号", dataIndex: "phone", width: 130, render: (v: string) => v || "—" },
    { title: "证件号", dataIndex: "idCardMasked", width: 110, render: (v: string) => v || "—" },
    { title: "血型", dataIndex: "bloodType", width: 70, render: (v: string) => v || "—" },
    {
      title: "身高/体重",
      width: 110,
      render: (_: unknown, row) => `${row.heightCm || "—"} / ${row.weightKg || "—"}`,
    },
    {
      title: "责任健管师",
      dataIndex: "ownerPractitionerName",
      width: 130,
      render: (v: string) => v || "未指定",
    },
    {
      title: "人群分组",
      dataIndex: "crowdNames",
      width: 160,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    {
      title: "建档时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 170,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" onClick={() => setMoving(true)}>
            移动
          </Button>
          <Popconfirm
            title="删除后该就诊人的档案、指标记录不再展示，历史订单保留，确认删除？"
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
      title="就诊人"
      titleExtra={
        <span className="muted text-12">就诊人是建档、测量与随访的主体，一个顾客可建多位</span>
      }
      extra={
        <Space>
          <Button size="small" onClick={() => setMoving(true)}>
            批量移动
          </Button>
          <Button type="primary" size="small" onClick={() => setEditing("new")}>
            新增就诊人
          </Button>
        </Space>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">关键词</span>
          <Input.Search
            allowClear
            placeholder="姓名或手机号"
            style={{ width: 180 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">所属顾客</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={customerId}
            style={{ width: 200 }}
            onChange={(value: number) => {
              setCustomerId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部顾客" }, ...customers.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">责任健管师</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId}
            style={{ width: 160 }}
            onChange={(value: number) => {
              setPractitionerId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医护" }, ...practitioners.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">人群分组</span>
          <Select
            value={crowdGroupId}
            style={{ width: 160 }}
            onChange={(value: number) => {
              setCrowdGroupId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部分组" }, ...crowds.options]}
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
          scroll={{ x: 1720 }}
        />
      ) : (
        <EmptyState text="还没有就诊人：顾客在小程序建档，或在这里直接为顾客补建。" />
      )}

      <PatientModal
        shopId={shopId}
        editing={editing}
        customerOptions={customers.options}
        practitionerOptions={practitioners.options}
        crowdOptions={crowds.options}
        onClose={() => setEditing(null)}
        onDone={() => {
          void list.reload();
          void patientOptions.reload();
        }}
      />

      <PatientMoveModal
        shopId={shopId}
        open={moving}
        patientRows={patientOptions.rows}
        practitionerOptions={practitioners.options}
        crowdOptions={crowds.options}
        onClose={() => setMoving(false)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

type PatientFormValues = {
  customerId: number;
  name: string;
  relation: string;
  gender: string;
  birthday: Dayjs | null;
  phone: string;
  idCard: string;
  bloodType: string;
  heightCm: number;
  weightKg: number;
  ownerPractitionerId: number;
  crowdIds: number[];
  remark: string;
};

function PatientModal({
  shopId,
  editing,
  customerOptions,
  practitionerOptions,
  crowdOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthPatientRow | "new" | null;
  customerOptions: { value: number; label: string }[];
  practitionerOptions: { value: number; label: string }[];
  crowdOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PatientFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        customerId: 0,
        name: "",
        relation: "SELF",
        gender: "",
        birthday: null,
        phone: "",
        idCard: "",
        bloodType: "",
        heightCm: 0,
        weightKg: 0,
        ownerPractitionerId: 0,
        crowdIds: [],
        remark: "",
      });
      return;
    }
    form.setFieldsValue({
      customerId: row.customerId,
      name: row.name,
      relation: row.relation,
      gender: row.gender,
      birthday: row.birthday ? dayjs(row.birthday) : null,
      phone: row.phone,
      idCard: "",
      bloodType: row.bloodType,
      heightCm: row.heightCm,
      weightKg: row.weightKg,
      ownerPractitionerId: row.ownerPractitionerId,
      crowdIds: row.crowdIds,
      remark: row.remark,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.patientSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          customerId: Number(values.customerId ?? 0),
          name: values.name,
          relation: (values.relation as HealthPatientRelation) || "SELF",
          gender: values.gender ?? "",
          birthday: values.birthday ? values.birthday.format("YYYY-MM-DD") : "",
          phone: values.phone ?? "",
          idCard: values.idCard ?? "",
          bloodType: values.bloodType ?? "",
          heightCm: Number(values.heightCm ?? 0),
          weightKg: Number(values.weightKg ?? 0),
          ownerPractitionerId: Number(values.ownerPractitionerId ?? 0),
          crowdIds: values.crowdIds ?? [],
          remark: values.remark ?? "",
        },
      });
      message.success("就诊人已保存");
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
      title={row ? `编辑就诊人 · ${row.name}` : "新增就诊人"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="customerId" label="所属顾客" extra="留空按手机号自动归集">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "按手机号自动归集" }, ...customerOptions]}
            />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请填写姓名" }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="relation" label="与顾客关系">
            <Select
              options={HEALTH_PATIENT_RELATIONS.map((value) => ({
                value,
                label: relationLabel(value),
              }))}
            />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select
              allowClear
              options={GENDERS.map((value) => ({ value, label: value }))}
              placeholder="未填"
            />
          </Form.Item>
          <Form.Item name="birthday" label="生日">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="idCard" label="证件号" extra="留空表示不改动已有证件号">
            <Input maxLength={32} placeholder="加密保存，列表只回末四位" />
          </Form.Item>
          <Form.Item name="bloodType" label="血型">
            <Select
              allowClear
              options={BLOOD_TYPES.map((value) => ({ value, label: value }))}
              placeholder="未填"
            />
          </Form.Item>
          <Form.Item name="ownerPractitionerId" label="责任健管师">
            <Select
              showSearch
              optionFilterProp="label"
              options={[{ value: 0, label: "暂不指定" }, ...practitionerOptions]}
            />
          </Form.Item>
          <Form.Item name="heightCm" label="身高（cm）">
            <InputNumber min={0} max={250} step={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="weightKg" label="体重（kg）">
            <InputNumber min={0} max={400} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="crowdIds" label="人群分组">
            <Select mode="multiple" maxTagCount={4} options={crowdOptions} placeholder="可多选" />
          </Form.Item>
        </div>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PatientMoveModal({
  shopId,
  open,
  patientRows,
  practitionerOptions,
  crowdOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  open: boolean;
  patientRows: HealthPatientRow[];
  practitionerOptions: { value: number; label: string }[];
  crowdOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    patientIds: number[];
    practitionerId: number;
    crowdGroupIds: number[];
    replace: boolean;
  }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ patientIds: [], practitionerId: 0, crowdGroupIds: [], replace: false });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!values.patientIds?.length) {
      message.warning("请先选择要移动的就诊人");
      return;
    }
    setSaving(true);
    try {
      await healthApi.patientMove({
        body: {
          shopId,
          patientIds: values.patientIds,
          practitionerId: Number(values.practitionerId ?? 0),
          crowdGroupIds: values.crowdGroupIds ?? [],
          replace: Boolean(values.replace),
        },
      });
      message.success(`已移动 ${values.patientIds.length} 位就诊人`);
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "移动失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="批量移动就诊人"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认移动"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="patientIds"
          label="就诊人"
          rules={[{ required: true, message: "请选择就诊人" }]}
          extra="支持多选，最多 200 位"
        >
          <Select
            mode="multiple"
            maxTagCount={6}
            showSearch
            optionFilterProp="label"
            options={patientRows.map((row) => ({
              value: row.id,
              label: row.customerLabel ? `${row.name}（${row.customerLabel}）` : row.name,
            }))}
            placeholder="选择要移动的就诊人"
          />
        </Form.Item>
        <Form.Item name="practitionerId" label="责任健管师">
          <Select
            showSearch
            optionFilterProp="label"
            options={[{ value: 0, label: "保持不变" }, ...practitionerOptions]}
          />
        </Form.Item>
        <Form.Item name="crowdGroupIds" label="人群分组">
          <Select mode="multiple" maxTagCount={4} options={crowdOptions} placeholder="可多选" />
        </Form.Item>
        <Form.Item
          name="replace"
          label="替换原分组"
          valuePropName="checked"
          extra="开启后清空原有分组再写入，关闭则追加"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 三、人群分组
// ============================================================================

function CrowdPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const state = useHealthResource(
    () => healthApi.crowdGroups({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [editing, setEditing] = useState<HealthCrowdGroupRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = state.data ?? [];

  const remove = async (row: HealthCrowdGroupRow) => {
    setBusy(true);
    try {
      await healthApi.crowdGroupRemove({ body: { shopId, id: row.id } });
      message.success("人群分组已删除");
      await state.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthCrowdGroupRow> = [
    { title: "分组名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    {
      title: "分组类型",
      dataIndex: "kind",
      width: 120,
      render: (value: string) => crowdKindLabel(meta, value),
    },
    { title: "成员数", dataIndex: "memberCount", width: 90 },
    { title: "说明", dataIndex: "desc", render: (value: string) => value || "—" },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
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
            title="删除分组只解除成员关系，就诊人档案与记录保留，确认删除？"
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
      title="人群分组"
      titleExtra={<span className="muted text-12">分组用于筛人、发券与方案投放，不改变档案内容</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增分组
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
          scroll={{ x: 760 }}
        />
      ) : (
        <EmptyState text="还没有人群分组：按高血压、糖尿病、老年等人群建组，便于批量管理与随访。" />
      )}
      <CrowdModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void state.reload()}
      />
    </Panel>
  );
}

function CrowdModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthCrowdGroupRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string; kind: string; desc: string }>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      kind: row?.kind ?? "ALL",
      desc: row?.desc ?? "",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.crowdGroupSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          kind: values.kind as HealthCrowdGroupRow["kind"],
          desc: values.desc ?? "",
        },
      });
      message.success("人群分组已保存");
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
      title={row ? `编辑分组 · ${row.name}` : "新增人群分组"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="分组名称" rules={[{ required: true, message: "请填写分组名称" }]}>
          <Input maxLength={40} placeholder="例如：高血压随访组" />
        </Form.Item>
        <Form.Item name="kind" label="分组类型">
          <Select
            options={HEALTH_CROWD_KINDS.map((value) => ({
              value,
              label: crowdKindLabel(meta, value),
            }))}
          />
        </Form.Item>
        <Form.Item name="desc" label="说明">
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：收缩压偏高、需每月复测" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 四、健康档案
// ============================================================================

function RecordPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [patientId, setPatientId] = useState(0);
  const patientOptions = usePatientOptions(shopId);
  const state = useHealthResource(
    () => healthApi.recordDetail({ query: { shopId, id: patientId } }),
    [shopId, patientId],
    shopId > 0 && patientId > 0,
  );
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState<HealthRecordRow["items"][number] | "new" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const record = state.data;

  const removeItem = async (itemId: number) => {
    setBusy(true);
    try {
      await healthApi.recordItemRemove({ body: { shopId, patientId, id: itemId } });
      message.success("档案条目已删除");
      await state.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const itemColumns: ColumnsType<HealthRecordRow["items"][number]> = [
    {
      title: "分型",
      dataIndex: "type",
      width: 110,
      render: (value: string) => recordItemTypeLabel(meta, value),
    },
    { title: "名称", dataIndex: "label", width: 140, render: (v: string) => v || "—" },
    { title: "内容", dataIndex: "value" },
    {
      title: "起止",
      width: 180,
      render: (_: unknown, row) =>
        row.startAt || row.endAt ? `${row.startAt || "—"} 至 ${row.endAt || "—"}` : "—",
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 80,
      render: (_: unknown, row) => (
        <Popconfirm title="删除后该条目不再展示，确认删除？" onConfirm={() => void removeItem(row.id)}>
          <Button size="small" type="text" danger loading={busy}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const eventColumns: ColumnsType<HealthMedicalEventRow> = [
    {
      title: "类型",
      dataIndex: "kind",
      width: 90,
      render: (value: string) => eventKindLabel(value),
    },
    { title: "事件", dataIndex: "title" },
    { title: "医院/科室", width: 180, render: (_: unknown, row) => `${row.hospitalName || "—"} ${row.departmentName || ""}` },
    {
      title: "发生时间",
      dataIndex: "occurAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  const basics = record?.basics ?? {};
  const basicsText = (key: string) => {
    const value = basics[key];
    return value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);
  };

  return (
    <Panel
      title="健康档案"
      titleExtra={<span className="muted text-12">档案只做记录：必填项齐备且至少一条分型条目才算完整</span>}
      extra={
        <Select
          showSearch
          optionFilterProp="label"
          value={patientId || undefined}
          placeholder="选择就诊人"
          style={{ width: 220 }}
          onChange={(value: number) => setPatientId(value)}
          options={patientOptions.options}
        />
      }
    >
      {!patientId ? (
        <EmptyState text="先在右上角选择一位就诊人，再维护他的基本信息、既往史与医疗事件。" />
      ) : state.error ? (
        <LoadError text={state.error} />
      ) : record ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "就诊人", value: record.patientName || "—" },
              {
                label: "档案状态",
                value: <Tag color={record.completed ? "green" : "gold"}>{record.completed ? "已完整" : "待完善"}</Tag>,
              },
              { label: "条目数", value: record.items.length },
              { label: "医疗事件", value: record.events.length },
              { label: "更新时间", value: record.updatedAt ? fmtTime(record.updatedAt) : "—" },
            ]}
          />
          <div>
            <Space style={{ marginBottom: 8 }}>
              <strong>基本信息</strong>
              <Button size="small" onClick={() => setBasicsOpen(true)}>
                编辑基本信息
              </Button>
            </Space>
            <Descriptions
              items={BASIC_FIELDS.map((field) => ({
                label: field.label,
                value: basicsText(field.key),
              }))}
            />
          </div>
          <div>
            <Space style={{ marginBottom: 8 }}>
              <strong>档案条目</strong>
              <Button size="small" onClick={() => setItemEditing("new")}>
                新增条目
              </Button>
            </Space>
            {record.items.length ? (
              <DataTable
                rows={record.items}
                columns={itemColumns}
                page={1}
                loading={state.loading || busy}
                scroll={{ x: 780 }}
              />
            ) : (
              <EmptyState text="还没有档案条目：先补一条既往史或过敏史。" />
            )}
          </div>
          <div>
            <strong>关联医疗事件</strong>
            {record.events.length ? (
              <DataTable
                rows={record.events}
                columns={eventColumns}
                page={1}
                scroll={{ x: 640 }}
              />
            ) : (
              <div style={{ marginTop: 4 }}>暂无医疗事件，可到「医疗事件」页签补录。</div>
            )}
          </div>
          {!record.completed ? (
            <Notice variant="warn">
              档案未完整：基本信息至少填 3 项，并补一条既往史 / 过敏史等分型条目，小程序端建档引导才会放行。
            </Notice>
          ) : null}
        </div>
      ) : (
        <div className="muted text-12">正在读取档案…</div>
      )}

      <BasicsModal
        shopId={shopId}
        patientId={patientId}
        open={basicsOpen}
        basics={record?.basics ?? {}}
        onClose={() => setBasicsOpen(false)}
        onDone={() => void state.reload()}
      />
      <RecordItemModal
        shopId={shopId}
        meta={meta}
        patientId={patientId}
        editing={itemEditing}
        onClose={() => setItemEditing(null)}
        onDone={() => void state.reload()}
      />
    </Panel>
  );
}

function BasicsModal({
  shopId,
  patientId,
  open,
  basics,
  onClose,
  onDone,
}: {
  shopId: number;
  patientId: number;
  open: boolean;
  basics: Record<string, unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Record<string, string>>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const values: Record<string, string> = {};
    BASIC_FIELDS.forEach((field) => {
      const value = basics[field.key];
      values[field.key] = value === undefined || value === null ? "" : String(value);
    });
    form.setFieldsValue(values);
  }, [open, basics, form]);

  const submit = async () => {
    const values = await form.validateFields();
    const next: Record<string, unknown> = { ...basics };
    BASIC_FIELDS.forEach((field) => {
      const text = String(values[field.key] ?? "").trim();
      if (text) next[field.key] = text;
      else delete next[field.key];
    });
    setSaving(true);
    try {
      await healthApi.recordSave({ body: { shopId, patientId, basics: next } });
      message.success("基本信息已保存");
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
      title="编辑基本信息"
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {BASIC_FIELDS.map((field) => (
            <Form.Item key={field.key} name={field.key} label={field.label}>
              <Input maxLength={200} placeholder={field.placeholder || "选填"} />
            </Form.Item>
          ))}
        </div>
      </Form>
    </Modal>
  );
}

type RecordItemFormValues = {
  type: string;
  label: string;
  value: string;
  dictKey: string;
  startAt: Dayjs | null;
  endAt: Dayjs | null;
};

function RecordItemModal({
  shopId,
  meta,
  patientId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  patientId: number;
  editing: HealthRecordRow["items"][number] | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RecordItemFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      type: row?.type ?? "PAST",
      label: row?.label ?? "",
      value: row?.value ?? "",
      dictKey: row?.dictKey ?? "",
      startAt: row?.startAt ? dayjs(row.startAt) : null,
      endAt: row?.endAt ? dayjs(row.endAt) : null,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.recordItemSave({
        body: {
          shopId,
          patientId,
          id: row?.id ?? 0,
          type: values.type as HealthRecordRow["items"][number]["type"],
          label: values.label ?? "",
          value: values.value,
          dictKey: values.dictKey ?? "",
          startAt: values.startAt ? values.startAt.format("YYYY-MM-DD") : "",
          endAt: values.endAt ? values.endAt.format("YYYY-MM-DD") : "",
        },
      });
      message.success("档案条目已保存");
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
      title={row ? "编辑档案条目" : "新增档案条目"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="分型">
          <Select
            options={HEALTH_RECORD_ITEM_TYPES.map((value) => ({
              value,
              label: recordItemTypeLabel(meta, value),
            }))}
          />
        </Form.Item>
        <Form.Item name="label" label="名称" extra="如「青霉素」「高血压 8 年」">
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item
          name="value"
          label="内容"
          rules={[{ required: true, message: "请填写条目内容" }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="dictKey" label="字典键" extra="对应店铺字典分组">
            <Input maxLength={60} placeholder="选填" />
          </Form.Item>
          <Form.Item name="startAt" label="开始">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="endAt" label="结束">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 五、医疗事件
// ============================================================================

function EventPanel({ shopId }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [kind, setKind] = useState("all");
  const [editing, setEditing] = useState<HealthMedicalEventRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const patientOptions = usePatientOptions(shopId);

  const list = usePagedRows<HealthMedicalEventRow>({
    load: () =>
      healthApi.medicalEventList({ query: { shopId, page, pageSize: PAGE_SIZE, patientId, kind } }),
    deps: [shopId, page, patientId, kind],
    enabled: shopId > 0,
    errorText: "医疗事件读取失败",
  });

  const nameOf = (id: number) => patientOptions.rows.find((row) => row.id === id)?.name || "—";

  const remove = async (row: HealthMedicalEventRow) => {
    setBusy(true);
    try {
      await healthApi.medicalEventRemove({ body: { shopId, id: row.id } });
      message.success("医疗事件已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMedicalEventRow> = [
    {
      title: "就诊人",
      dataIndex: "patientId",
      width: 110,
      render: (value: number) => nameOf(value),
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 90,
      render: (value: string) => eventKindLabel(value),
    },
    { title: "事件", dataIndex: "title", render: (value: string) => <strong>{value}</strong> },
    { title: "医院", dataIndex: "hospitalName", width: 150, render: (v: string) => v || "—" },
    { title: "科室", dataIndex: "departmentName", width: 110, render: (v: string) => v || "—" },
    { title: "医生", dataIndex: "doctorName", width: 100, render: (v: string) => v || "—" },
    {
      title: "发生时间",
      dataIndex: "occurAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "离院时间",
      dataIndex: "leaveAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    { title: "诊断", dataIndex: "diagnosis", width: 160, render: (v: string) => v || "—" },
    {
      title: "附件",
      dataIndex: "attachments",
      width: 80,
      render: (value: { url: string }[]) => (value.length ? `${value.length} 个` : "—"),
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
          <Popconfirm title="删除后该事件不再出现在档案里，确认删除？" onConfirm={() => void remove(row)}>
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
      title="医疗事件"
      titleExtra={<span className="muted text-12">门诊、住院、手术等就诊记录，会同步出现在就诊人档案</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增事件
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
            style={{ width: 220 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patientOptions.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">类型</span>
          <Select
            value={kind}
            style={{ width: 140 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部类型" },
              ...HEALTH_MEDICAL_EVENT_KINDS.map((value) => ({
                value,
                label: eventKindLabel(value),
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
          scroll={{ x: 1500 }}
        />
      ) : (
        <EmptyState text="还没有医疗事件：补录门诊/住院记录，档案与随访判断才有依据。" />
      )}

      <EventModal
        shopId={shopId}
        editing={editing}
        patientOptions={patientOptions.options}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

type EventFormValues = {
  patientId: number;
  kind: string;
  title: string;
  hospitalName: string;
  departmentName: string;
  doctorName: string;
  occurAt: Dayjs | null;
  leaveAt: Dayjs | null;
  diagnosis: string;
  summary: string;
  attachments: string;
};

function EventModal({
  shopId,
  editing,
  patientOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthMedicalEventRow | "new" | null;
  patientOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<EventFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const defaultPatientId = patientOptions[0]?.value ?? 0;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      patientId: row?.patientId ?? defaultPatientId,
      kind: row?.kind ?? "OUTPATIENT",
      title: row?.title ?? "",
      hospitalName: row?.hospitalName ?? "",
      departmentName: row?.departmentName ?? "",
      doctorName: row?.doctorName ?? "",
      occurAt: row?.occurAt ? dayjs(row.occurAt) : null,
      leaveAt: row?.leaveAt ? dayjs(row.leaveAt) : null,
      diagnosis: row?.diagnosis ?? "",
      summary: row?.summary ?? "",
      attachments: row ? filesToText(row.attachments) : "",
    });
  }, [open, row, defaultPatientId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.medicalEventSave({
        body: {
          shopId,
          patientId: Number(values.patientId),
          id: row?.id ?? 0,
          kind: values.kind as HealthMedicalEventRow["kind"],
          title: values.title,
          hospitalName: values.hospitalName ?? "",
          departmentName: values.departmentName ?? "",
          doctorName: values.doctorName ?? "",
          occurAt: values.occurAt ? values.occurAt.format("YYYY-MM-DD HH:mm") : "",
          leaveAt: values.leaveAt ? values.leaveAt.format("YYYY-MM-DD HH:mm") : "",
          diagnosis: values.diagnosis ?? "",
          summary: values.summary ?? "",
          attachments: parseFiles(values.attachments),
        },
      });
      message.success("医疗事件已保存");
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
      title={row ? `编辑事件 · ${row.title}` : "新增医疗事件"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={720}
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
          <Form.Item name="kind" label="类型">
            <Select
              options={HEALTH_MEDICAL_EVENT_KINDS.map((value) => ({
                value,
                label: eventKindLabel(value),
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="title"
          label="事件标题"
          rules={[{ required: true, message: "请填写事件标题" }]}
        >
          <Input maxLength={120} placeholder="例如：市一院心内科复诊" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="hospitalName" label="医院">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="departmentName" label="科室">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="doctorName" label="医生">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="occurAt" label="发生时间">
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="leaveAt" label="离院时间">
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="diagnosis" label="诊断">
          <Input maxLength={500} placeholder="医院给出的诊断原文" />
        </Form.Item>
        <Form.Item name="summary" label="摘要">
          <Input.TextArea rows={3} maxLength={4000} showCount placeholder="就诊经过、用药与医嘱摘要" />
        </Form.Item>
        <Form.Item
          name="attachments"
          label="附件地址"
          extra="每行一个地址，最多 9 个；名称按地址末段自动取"
        >
          <Input.TextArea rows={3} placeholder="https://.../report.pdf" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 六、字典
// ============================================================================

function DictPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [groupKey, setGroupKey] = useState("");
  const [editing, setEditing] = useState<HealthDictItemRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useHealthResource(
    () => healthApi.dictList({ query: { shopId, groupKey } }),
    [shopId, groupKey],
    shopId > 0,
  );
  const rows = state.data ?? [];

  const remove = async (row: HealthDictItemRow) => {
    setBusy(true);
    try {
      await healthApi.dictRemove({ body: { shopId, id: row.id } });
      message.success("字典项已删除");
      await state.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthDictItemRow> = [
    { title: "分组", dataIndex: "groupKey", width: 140 },
    { title: "显示名", dataIndex: "label", render: (value: string) => <strong>{value}</strong> },
    { title: "值", dataIndex: "value", width: 160, render: (v: string) => v || "—" },
    { title: "排序", dataIndex: "sort", width: 80 },
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
          <Popconfirm title="删除后已引用的档案条目不受影响，确认删除？" onConfirm={() => void remove(row)}>
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
      title="字典"
      titleExtra={<span className="muted text-12">店铺自有字典：过敏原、疾病名、生活习惯等，供档案与表单下拉</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增字典项
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">分组键</span>
          <Input.Search
            allowClear
            placeholder="如 allergen，留空看全部"
            style={{ width: 220 }}
            onSearch={(value) => setGroupKey(value.trim())}
          />
        </div>
      </FilterBar>

      {state.error ? <LoadError text={state.error} /> : null}
      {rows.length || state.loading ? (
        <DataTable
          rows={rows}
          columns={columns}
          page={1}
          loading={state.loading || busy}
          scroll={{ x: 700 }}
        />
      ) : (
        <EmptyState text="还没有字典项：建一组分组键，把常用的过敏原或疾病名录进去。" />
      )}

      <DictModal
        shopId={shopId}
        editing={editing}
        groupKey={groupKey}
        onClose={() => setEditing(null)}
        onDone={() => void state.reload()}
      />
    </Panel>
  );
}

function DictModal({
  shopId,
  editing,
  groupKey,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthDictItemRow | "new" | null;
  groupKey: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    groupKey: string;
    label: string;
    value: string;
    sort: number;
    status: string;
  }>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      groupKey: row?.groupKey ?? groupKey ?? "",
      label: row?.label ?? "",
      value: row?.value ?? "",
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, groupKey, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.dictSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          groupKey: values.groupKey,
          label: values.label,
          value: values.value ?? "",
          sort: Number(values.sort ?? 0),
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("字典项已保存");
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
      title={row ? "编辑字典项" : "新增字典项"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="groupKey"
          label="分组键"
          rules={[{ required: true, message: "请填写分组键" }]}
          extra="同一组的项会一起出现在下拉里，如 allergen"
        >
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item
          name="label"
          label="显示名"
          rules={[{ required: true, message: "请填写显示名" }]}
        >
          <Input maxLength={60} placeholder="如 青霉素" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="value" label="值" extra="留空同显示名">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
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
      </Form>
    </Modal>
  );
}

// ============================================================================
// 七、体检报告
// ============================================================================

function ReportPanel({ shopId }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [patientId, setPatientId] = useState(0);
  const [kind, setKind] = useState("all");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [detail, setDetail] = useState<HealthReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<HealthReportRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const patientOptions = usePatientOptions(shopId);

  const list = usePagedRows<HealthReportRow>({
    load: () =>
      healthApi.reports({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          patientId,
          kind,
          abnormalOnly: abnormalOnly ? 1 : 0,
        },
      }),
    deps: [shopId, page, patientId, kind, abnormalOnly],
    enabled: shopId > 0,
    errorText: "体检报告读取失败",
  });

  const openDetail = async (row: HealthReportRow) => {
    setDetailLoading(true);
    try {
      setDetail(await healthApi.reportDetail({ query: { shopId, id: row.id } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "报告详情读取失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const remove = async (row: HealthReportRow) => {
    setBusy(true);
    try {
      await healthApi.reportRemove({ body: { shopId, id: row.id } });
      message.success("体检报告已删除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthReportRow> = [
    { title: "就诊人", dataIndex: "patientName", width: 110 },
    { title: "报告名称", dataIndex: "title", render: (value: string) => <strong>{value}</strong> },
    {
      title: "类型",
      dataIndex: "kind",
      width: 110,
      render: (value: string) => reportKindLabel(value),
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 120,
      render: (value: string) => HEALTH_REPORT_SOURCE_LABELS[value] || value,
    },
    { title: "医院", dataIndex: "hospitalName", width: 140, render: (v: string) => v || "—" },
    {
      title: "报告日期",
      dataIndex: "reportAt",
      width: 120,
      render: (value: string) => (value ? fmtDate(value) : "—"),
    },
    { title: "项目数", dataIndex: "itemCount", width: 90 },
    {
      title: "异常项",
      dataIndex: "abnormalCount",
      width: 90,
      render: (value: number) =>
        value > 0 ? <Tag color="red">{value} 项</Tag> : <span className="muted">无</span>,
    },
    { title: "建议", dataIndex: "adviceCount", width: 80 },
    {
      title: "操作",
      width: 180,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" loading={detailLoading} onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm title="删除后顾客端不再展示该报告，确认删除？" onConfirm={() => void remove(row)}>
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
      title="体检报告"
      titleExtra={<span className="muted text-12">报告只做异常项提示与医师建议，不给诊断结论</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          录入报告
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
            style={{ width: 220 }}
            onChange={(value: number) => {
              setPatientId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部就诊人" }, ...patientOptions.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">类型</span>
          <Select
            value={kind}
            style={{ width: 140 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部类型" }, ...REPORT_KINDS]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">只看异常</span>
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
          scroll={{ x: 1320 }}
        />
      ) : (
        <EmptyState text="还没有体检报告：录入报告后顾客端可查看，医师也能基于异常项给建议。" />
      )}

      <ReportDetailDrawer
        shopId={shopId}
        detail={detail}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        onDone={(next) => setDetail(next)}
      />

      <ReportModal
        shopId={shopId}
        editing={editing}
        patientOptions={patientOptions.options}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function ReportDetailDrawer({
  shopId,
  detail,
  loading,
  onClose,
  onDone,
}: {
  shopId: number;
  detail: HealthReportDetail | null;
  loading: boolean;
  onClose: () => void;
  onDone: (next: HealthReportDetail) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ content: string; consultId: number }>();
  const [saving, setSaving] = useState(false);

  const itemColumns: ColumnsType<HealthReportDetail["items"][number]> = [
    { title: "项目", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    {
      title: "结果",
      width: 140,
      render: (_: unknown, row) =>
        row.valueText ? `${row.valueText}${row.unit ? ` ${row.unit}` : ""}` : "—",
    },
    { title: "参考范围", dataIndex: "reference", width: 160, render: (v: string) => v || "—" },
    {
      title: "标记",
      dataIndex: "abnormal",
      width: 90,
      render: (value: boolean, row) =>
        value ? <Tag color="red">异常{row.direction}</Tag> : <span className="muted">正常</span>,
    },
  ];

  const saveAdvice = async () => {
    const values = await form.validateFields();
    if (!detail) return;
    setSaving(true);
    try {
      const next = await healthApi.reportAdviceSave({
        body: {
          shopId,
          reportId: detail.report.id,
          consultId: Number(values.consultId ?? 0),
          content: values.content,
        },
      });
      message.success("医师建议已保存");
      form.setFieldsValue({ content: "", consultId: 0 });
      if (next) onDone(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={Boolean(detail)}
      size="large"
      title={detail ? `报告详情 · ${detail.report.title}` : "报告详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {detail ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Descriptions
            items={[
              { label: "就诊人", value: detail.report.patientName || "—" },
              { label: "类型", value: reportKindLabel(detail.report.kind) },
              {
                label: "来源",
                value: HEALTH_REPORT_SOURCE_LABELS[detail.report.source] || detail.report.source,
              },
              { label: "医院", value: detail.report.hospitalName || "—" },
              {
                label: "报告日期",
                value: detail.report.reportAt ? fmtDate(detail.report.reportAt) : "—",
              },
              { label: "项目数", value: detail.report.itemCount },
              { label: "异常项", value: detail.report.abnormalCount },
              { label: "建议数", value: detail.report.adviceCount },
            ]}
          />
          <div>
            <div className="muted text-12">结论</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
              {detail.report.conclusion || "—"}
            </div>
          </div>
          <div>
            <strong>检查项目</strong>
            {detail.items.length ? (
              <DataTable
                rows={detail.items}
                columns={itemColumns}
                page={1}
                scroll={{ x: 640 }}
              />
            ) : (
              <div style={{ marginTop: 4 }}>暂无检查项目。</div>
            )}
          </div>
          <div>
            <strong>医师建议</strong>
            {detail.advices.length ? (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {detail.advices.map((advice) => (
                  <div
                    key={advice.id}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
                  >
                    <div className="muted text-12">
                      {advice.doctorName || "医师"} · {advice.createdAt ? fmtTime(advice.createdAt) : "—"}
                      {advice.consultId ? " · 关联问诊" : ""}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{advice.content}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 4 }}>还没有建议。</div>
            )}
          </div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="content"
              label="新增建议"
              rules={[{ required: true, message: "请填写建议内容" }]}
            >
              <Input.TextArea rows={3} maxLength={4000} showCount placeholder="复测建议、生活方式提醒等" />
            </Form.Item>
            <Form.Item name="consultId" label="关联问诊单号" extra="0 表示不关联">
              <InputNumber min={0} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Button type="primary" loading={saving || loading} onClick={() => void saveAdvice()}>
              提交建议
            </Button>
          </Form>
        </div>
      ) : null}
    </Drawer>
  );
}

type ReportFormValues = {
  patientId: number;
  title: string;
  kind: string;
  hospitalName: string;
  reportAt: Dayjs | null;
  conclusion: string;
  files: string;
  items: {
    name: string;
    value: number;
    unit: string;
    reference: string;
    abnormal: boolean;
  }[];
};

function ReportModal({
  shopId,
  editing,
  patientOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthReportRow | "new" | null;
  patientOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReportFormValues>();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const defaultPatientId = patientOptions[0]?.value ?? 0;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        patientId: defaultPatientId,
        title: "",
        kind: "EXAM",
        hospitalName: "",
        reportAt: dayjs(),
        conclusion: "",
        files: "",
        items: [],
      });
      return;
    }
    // 编辑时按详情回填条目，列表行不含项目明细。
    setLoading(true);
    void healthApi
      .reportDetail({ query: { shopId, id: row.id } })
      .then((detail) => {
        if (!detail) return;
        form.setFieldsValue({
          patientId: detail.report.patientId,
          title: detail.report.title,
          kind: detail.report.kind || "EXAM",
          hospitalName: detail.report.hospitalName,
          reportAt: detail.report.reportAt ? dayjs(detail.report.reportAt) : null,
          conclusion: detail.report.conclusion,
          files: filesToText(detail.report.files),
          items: detail.items.map((item) => ({
            name: item.name,
            value: item.value,
            unit: item.unit,
            reference: item.reference,
            abnormal: item.abnormal,
          })),
        });
      })
      .catch((cause: unknown) => {
        message.error(cause instanceof Error ? cause.message : "报告详情读取失败");
      })
      .finally(() => setLoading(false));
  }, [open, row, shopId, defaultPatientId, form, message]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.reportSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          patientId: Number(values.patientId),
          title: values.title,
          kind: values.kind || "EXAM",
          hospitalName: values.hospitalName ?? "",
          reportAt: values.reportAt ? values.reportAt.format("YYYY-MM-DD") : "",
          conclusion: values.conclusion ?? "",
          files: parseFiles(values.files),
          items: (values.items ?? []).map((item) => ({
            name: String(item.name ?? ""),
            value: Number(item.value ?? 0),
            valueText: "",
            unit: item.unit ?? "",
            reference: item.reference ?? "",
            abnormal: Boolean(item.abnormal),
            direction: "",
          })),
        },
      });
      message.success("体检报告已保存");
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
      title={row ? `编辑报告 · ${row.title}` : "录入体检报告"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={860}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="patientId"
            label="就诊人"
            rules={[{ required: true, message: "请选择就诊人" }]}
          >
            <Select showSearch optionFilterProp="label" options={patientOptions} />
          </Form.Item>
          <Form.Item name="kind" label="类型">
            <Select options={REPORT_KINDS} />
          </Form.Item>
          <Form.Item name="reportAt" label="报告日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          name="title"
          label="报告名称"
          rules={[{ required: true, message: "请填写报告名称" }]}
        >
          <Input maxLength={120} placeholder="例如：2026 年度职工体检" />
        </Form.Item>
        <Form.Item name="hospitalName" label="出具医院">
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="conclusion" label="结论">
          <Input.TextArea rows={2} maxLength={2000} showCount />
        </Form.Item>
        <Form.Item name="files" label="报告附件" extra="每行一个地址，最多 9 个">
          <Input.TextArea rows={2} placeholder="https://.../report.pdf" />
        </Form.Item>

        <div className="muted text-12" style={{ marginBottom: 8 }}>
          检查项目（数值留空也能保存文字结果，异常项会汇总进列表）
        </div>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <div style={{ display: "grid", gap: 8 }}>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.8fr 0.7fr 1fr 0.6fr auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Form.Item name={[field.name, "name"]} noStyle>
                    <Input placeholder="项目名称" maxLength={80} />
                  </Form.Item>
                  <Form.Item name={[field.name, "value"]} noStyle>
                    <InputNumber placeholder="数值" style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name={[field.name, "unit"]} noStyle>
                    <Input placeholder="单位" maxLength={20} />
                  </Form.Item>
                  <Form.Item name={[field.name, "reference"]} noStyle>
                    <Input placeholder="参考范围" maxLength={120} />
                  </Form.Item>
                  <Form.Item name={[field.name, "abnormal"]} valuePropName="checked" noStyle>
                    <Switch checkedChildren="异常" unCheckedChildren="正常" />
                  </Form.Item>
                  <Button size="small" type="text" danger onClick={() => remove(field.name)}>
                    删除
                  </Button>
                </div>
              ))}
              <Button size="small" onClick={() => add({ name: "", value: 0, unit: "", reference: "", abnormal: false })}>
                新增检查项
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
      {loading ? <Notice variant="info">正在读取报告明细…</Notice> : null}
    </Modal>
  );
}
