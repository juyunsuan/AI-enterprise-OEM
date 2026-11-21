"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
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
  HEALTH_CROWD_KINDS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_HOSPITAL_LEVELS,
  HEALTH_HOSPITAL_LEVEL_LABELS,
  HEALTH_ORDER_BIZ_TYPES,
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  type HealthCityRow,
  type HealthCrowdKind,
  type HealthDepartmentRow,
  type HealthDiseaseRow,
  type HealthExamItemRow,
  type HealthExamPackageRow,
  type HealthGuidanceResult,
  type HealthHospitalRow,
  type HealthMeta,
  type HealthOrderBizType,
  type HealthServiceRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
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
 * 服务目录：服务项目、医院、科室、城市、疾病百科、体检项目、体检套餐与导诊模拟。
 * 这些数据是小程序端可售与导诊的底表——医院/科室挂医护，服务项目挂价格，
 * 体检项目组成套餐，疾病百科供导诊匹配；全部按店铺隔离。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const PACKAGE_ITEM_MODE_LABELS: Record<string, string> = {
  INCLUDE: "套餐内含",
  ADDON: "可加价加项",
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

const bizOptions = (meta: HealthMeta | null) =>
  dictOptions(meta?.bizTypes, HEALTH_ORDER_BIZ_TYPES, HEALTH_ORDER_BIZ_TYPE_LABELS);
const crowdOptions = (meta: HealthMeta | null) =>
  dictOptions(meta?.crowdKinds, HEALTH_CROWD_KINDS, HEALTH_CROWD_KIND_LABELS);
const crowdText = (meta: HealthMeta | null, kinds: string[]) =>
  kinds.length ? kinds.map((kind) => labelOf(meta, "crowdKinds", kind)).join("、") : "—";

export function CatalogTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("services");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "services",
          label: "服务项目",
          children: <ServicesPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "hospitals",
          label: "医院",
          children: <HospitalsPanel shopId={shopId} />,
        },
        {
          key: "departments",
          label: "科室",
          children: <DepartmentsPanel shopId={shopId} />,
        },
        {
          key: "cities",
          label: "城市",
          children: <CitiesPanel shopId={shopId} />,
        },
        {
          key: "diseases",
          label: "疾病百科",
          children: <DiseasesPanel shopId={shopId} />,
        },
        {
          key: "examItems",
          label: "体检项目",
          children: <ExamItemsPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "examPackages",
          label: "体检套餐",
          children: <ExamPackagesPanel shopId={shopId} meta={meta} />,
        },
        {
          key: "guidance",
          label: "导诊模拟",
          children: <GuidancePanel shopId={shopId} meta={meta} />,
        },
      ]}
    />
  );
}

// ============================================================================
// 服务项目
// ============================================================================

function ServicesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [bizType, setBizType] = useState("all");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthServiceRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.services({ query: { shopId, page, pageSize: PAGE_SIZE, bizType, category } }),
    [shopId, page, bizType, category],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const toggleStatus = async (row: HealthServiceRow) => {
    const next = row.status === "ON" ? "OFF" : "ON";
    setBusy(true);
    try {
      await healthApi.serviceStatus({ body: { shopId, id: row.id, status: next, reason: "" } });
      message.success(next === "ON" ? `「${row.name}」已上架` : `「${row.name}」已下架`);
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: HealthServiceRow) => {
    setBusy(true);
    try {
      await healthApi.serviceRemove({ body: { shopId, id: row.id } });
      message.success("服务项目已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthServiceRow> = [
    {
      title: "服务名称",
      dataIndex: "name",
      width: 220,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          {row.category ? <div className="muted text-12">{row.category}</div> : null}
        </div>
      ),
    },
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 120,
      render: (value: string) => labelOf(meta, "bizTypes", value),
    },
    {
      title: "分类",
      dataIndex: "category",
      width: 110,
      render: (value: string) => value || "—",
    },
    { title: "售价", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "划线价",
      dataIndex: "originPriceCents",
      width: 110,
      render: (value: number) =>
        value > 0 ? (
          <span className="muted" style={{ textDecoration: "line-through" }}>
            {cny(value)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "时长",
      dataIndex: "durationMinutes",
      width: 110,
      render: (value: number) => (value > 0 ? `${value} 分钟` : "按号源时段"),
    },
    {
      title: "选号源",
      dataIndex: "needSlot",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "blue" : "default"}>{value ? "需选时段" : "不需"}</Tag>
      ),
    },
    {
      title: "就诊人",
      dataIndex: "needPatient",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "blue" : "default"}>{value ? "需填写" : "不需"}</Tag>
      ),
    },
    {
      title: "适用人群",
      dataIndex: "crowdKinds",
      width: 160,
      render: (value: string[]) => crowdText(meta, value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "排序", dataIndex: "sort", width: 70 },
    { title: "已下单", dataIndex: "orderCount", width: 90 },
    {
      title: "操作",
      width: 210,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void toggleStatus(row)}>
            {row.status === "ON" ? "下架" : "上架"}
          </Button>
          <Popconfirm
            title="删除后小程序端立即不可售，历史订单与评价不受影响。"
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
      title="服务项目"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">「需选号源」决定下单是否占用排班号源</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增服务项目
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">业务类型</span>
          <Select
            value={bizType}
            style={{ width: 180 }}
            onChange={(value: string) => {
              setBizType(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部类型" }, ...bizOptions(meta)]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">分类</span>
          <Input.Search
            allowClear
            placeholder="如 图文问诊"
            style={{ width: 200 }}
            onSearch={(value) => {
              setCategory(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthServiceRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1560 }}
      />

      <div className="muted text-12" style={{ marginTop: 8 }}>
        需要选号源的服务（挂号、体检、上门采样）先到「排班号源」把号放出来才可预约；关闭后下单即进入履约，不占号源。
      </div>

      <ServiceModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ServiceFormValues = {
  name: string;
  bizType: string;
  category: string;
  cover: string;
  intro: string;
  needSlot: boolean;
  needPatient: boolean;
  durationMinutes: number;
  priceYuan: number;
  originPriceYuan: number;
  crowdKinds: string[];
  status: string;
  sort: number;
};

function ServiceModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthServiceRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ServiceFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      bizType: row?.bizType ?? "CONSULT_TEXT",
      category: row?.category ?? "",
      cover: row?.cover ?? "",
      intro: row?.intro ?? "",
      needSlot: row?.needSlot ?? false,
      needPatient: row?.needPatient ?? true,
      durationMinutes: row?.durationMinutes ?? 0,
      priceYuan: centsToYuan(row?.priceCents),
      originPriceYuan: centsToYuan(row?.originPriceCents),
      crowdKinds: row?.crowdKinds ?? [],
      status: row?.status ?? "ON",
      sort: row?.sort ?? 0,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.serviceSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          bizType: values.bizType as HealthOrderBizType,
          category: values.category ?? "",
          cover: values.cover ?? "",
          intro: values.intro ?? "",
          needSlot: Boolean(values.needSlot),
          needPatient: Boolean(values.needPatient),
          durationMinutes: Number(values.durationMinutes ?? 0),
          priceCents: yuanToCents(values.priceYuan),
          originPriceCents: yuanToCents(values.originPriceYuan),
          crowdKinds: (values.crowdKinds ?? []) as HealthCrowdKind[],
          status: values.status as HealthServiceRow["status"],
          sort: Number(values.sort ?? 0),
        },
      });
      message.success(row ? "服务项目已保存" : "服务项目已创建，上架后小程序端可售");
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
      title={row ? `编辑服务「${row.name}」` : "新增服务项目"}
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
            name="name"
            label="服务名称"
            rules={[{ required: true, message: "请填写服务名称" }]}
          >
            <Input maxLength={80} placeholder="如 图文问诊（15 分钟）" />
          </Form.Item>
          <Form.Item
            name="bizType"
            label="业务类型"
            rules={[{ required: true, message: "请选择业务类型" }]}
            extra="决定订单履约方式与小程序入口"
          >
            <Select options={bizOptions(meta)} />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input maxLength={40} placeholder="如 问诊 / 体检 / 绿通" />
          </Form.Item>
          <Form.Item name="durationMinutes" label="时长（分钟）" extra="0 表示按号源时段">
            <InputNumber min={0} max={1440} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="priceYuan" label="售价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="originPriceYuan" label="划线价（元）" extra="0 表示不展示划线价">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="crowdKinds" label="适用人群">
          <Select
            mode="multiple"
            allowClear
            placeholder="不选即全部人群"
            options={crowdOptions(meta)}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="needSlot"
            label="需要选号源"
            valuePropName="checked"
            extra="开启后下单必须先选号源时段"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="needPatient"
            label="需要就诊人"
            valuePropName="checked"
            extra="关闭后下单不收集就诊人信息"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="status" label="上架状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="sort" label="排序值" extra="越小越靠前">
          <InputNumber min={0} max={9999} precision={0} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="cover" label="封面图" extra="对象存储直链，留空用默认占位">
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
        <Form.Item name="intro" label="服务说明">
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder="服务内容、流程与注意事项" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 医院
// ============================================================================

function HospitalsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthHospitalRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.hospitals({ query: { shopId, page, pageSize: PAGE_SIZE, city } }),
    [shopId, page, city],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthHospitalRow) => {
    setBusy(true);
    try {
      await healthApi.hospitalRemove({ body: { shopId, id: row.id } });
      message.success("医院已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthHospitalRow> = [
    {
      title: "医院名称",
      dataIndex: "name",
      width: 230,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "等级",
      dataIndex: "level",
      width: 110,
      render: (value: string) => HEALTH_HOSPITAL_LEVEL_LABELS[value] ?? value,
    },
    { title: "城市", dataIndex: "city", width: 100, render: (value: string) => value || "—" },
    { title: "地址", dataIndex: "address", width: 220, render: (value: string) => value || "—" },
    {
      title: "合作关系",
      dataIndex: "partnered",
      width: 110,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "合作医院" : "非合作"}</Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "科室数", dataIndex: "departmentCount", width: 90 },
    { title: "医护数", dataIndex: "practitionerCount", width: 90 },
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
            title="删除后小程序端不再展示该医院，其下科室与医护需重新归属。"
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
      title="医院"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">合作医院在绿通与挂号中优先展示</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增医院
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">所在城市</span>
          <Input.Search
            allowClear
            placeholder="按城市筛选"
            style={{ width: 200 }}
            onSearch={(value) => {
              setCity(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthHospitalRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1280 }}
      />

      <HospitalModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type HospitalFormValues = {
  name: string;
  level: string;
  city: string;
  address: string;
  lng: number;
  lat: number;
  intro: string;
  partnered: boolean;
  status: string;
};

function HospitalModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthHospitalRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<HospitalFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      level: row?.level ?? "NONE",
      city: row?.city ?? "",
      address: row?.address ?? "",
      lng: row?.lng ?? 0,
      lat: row?.lat ?? 0,
      intro: row?.intro ?? "",
      partnered: row?.partnered ?? false,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.hospitalSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          level: (values.level ?? "NONE") as HealthHospitalRow["level"],
          city: values.city ?? "",
          address: values.address ?? "",
          lng: Number(values.lng ?? 0),
          lat: Number(values.lat ?? 0),
          intro: values.intro ?? "",
          partnered: Boolean(values.partnered),
          status: (values.status ?? "ON") as HealthHospitalRow["status"],
        },
      });
      message.success(row ? "医院已保存" : "医院已创建");
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
      title={row ? `编辑医院「${row.name}」` : "新增医院"}
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
            name="name"
            label="医院名称"
            rules={[{ required: true, message: "请填写医院名称" }]}
          >
            <Input maxLength={120} placeholder="如 某某市第一人民医院" />
          </Form.Item>
          <Form.Item name="level" label="医院等级">
            <Select
              options={HEALTH_HOSPITAL_LEVELS.map((value) => ({
                value,
                label: HEALTH_HOSPITAL_LEVEL_LABELS[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="city" label="所在城市">
            <Input maxLength={60} placeholder="如 杭州" />
          </Form.Item>
          <Form.Item name="address" label="详细地址">
            <Input maxLength={200} placeholder="院区地址，小程序端展示" />
          </Form.Item>
          <Form.Item name="lng" label="经度" extra="用于小程序端按距离排序，0 表示未定位">
            <InputNumber min={-180} max={180} precision={6} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="lat" label="纬度">
            <InputNumber min={-90} max={90} precision={6} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="partnered"
            label="合作医院"
            valuePropName="checked"
            extra="开启后在绿通与挂号中优先展示"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="intro" label="医院简介">
          <Input.TextArea rows={4} maxLength={2000} showCount placeholder="特色科室、设备与就诊须知" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 科室
// ============================================================================

/** 医院下拉：一家店通常不超过几十家，一次取前 100 条足够。 */
function useHospitalOptions(shopId: number) {
  const hospitals = useHealthResource(
    () => healthApi.hospitals({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  return {
    hospitalRows: hospitals.data?.list ?? [],
    hospitalOptions: (hospitals.data?.list ?? []).map((row) => ({
      value: row.id,
      label: row.name,
    })),
  };
}

function DepartmentsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [hospitalId, setHospitalId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthDepartmentRow | "new" | null>(null);
  const { hospitalOptions } = useHospitalOptions(shopId);
  const resource = useHealthResource(
    () => healthApi.departments({ query: { shopId, page, pageSize: PAGE_SIZE, hospitalId } }),
    [shopId, page, hospitalId],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthDepartmentRow) => {
    setBusy(true);
    try {
      await healthApi.departmentRemove({ body: { shopId, id: row.id } });
      message.success("科室已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthDepartmentRow> = [
    {
      title: "科室名称",
      dataIndex: "name",
      width: 180,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "所属医院",
      dataIndex: "hospitalName",
      width: 200,
      render: (value: string) => value || "—",
    },
    { title: "分类", dataIndex: "category", width: 120, render: (value: string) => value || "—" },
    {
      title: "简介",
      dataIndex: "intro",
      width: 260,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "医护数", dataIndex: "practitionerCount", width: 90 },
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
            title="删除后该科室下医护将失去科室归属，导诊也不再推荐它。"
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
      title="科室"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">科室挂在医院下，导诊与排班按科室归类</span>}
      extra={
        <Button
          type="primary"
          size="small"
          disabled={!hospitalOptions.length}
          onClick={() => setEditing("new")}
        >
          新增科室
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">所属医院</span>
          <Select
            value={hospitalId}
            style={{ width: 260 }}
            onChange={(value: number) => {
              setHospitalId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医院" }, ...hospitalOptions]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      {hospitalOptions.length ? null : (
        <div className="muted text-12" style={{ marginBottom: 8 }}>
          还没有医院：先到「医院」页签新增医院，科室才有归属。
        </div>
      )}
      <DataTable<HealthDepartmentRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1180 }}
      />

      <DepartmentModal
        shopId={shopId}
        hospitalOptions={hospitalOptions}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type DepartmentFormValues = {
  hospitalId: number;
  name: string;
  category: string;
  intro: string;
  sort: number;
  status: string;
};

function DepartmentModal({
  shopId,
  hospitalOptions,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  hospitalOptions: { value: number; label: string }[];
  editing: HealthDepartmentRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DepartmentFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      hospitalId: row?.hospitalId ?? hospitalOptions[0]?.value ?? 0,
      name: row?.name ?? "",
      category: row?.category ?? "",
      intro: row?.intro ?? "",
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form, hospitalOptions]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.departmentSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          hospitalId: Number(values.hospitalId ?? 0),
          name: values.name,
          category: values.category ?? "",
          intro: values.intro ?? "",
          sort: Number(values.sort ?? 0),
          status: (values.status ?? "ON") as HealthDepartmentRow["status"],
        },
      });
      message.success(row ? "科室已保存" : "科室已创建");
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
      title={row ? `编辑科室「${row.name}」` : "新增科室"}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="hospitalId"
          label="所属医院"
          rules={[{ required: true, message: "请选择所属医院" }]}
        >
          <Select options={hospitalOptions} placeholder="选择医院" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="科室名称"
            rules={[{ required: true, message: "请填写科室名称" }]}
          >
            <Input maxLength={60} placeholder="如 心血管内科" />
          </Form.Item>
          <Form.Item name="category" label="科室分类">
            <Input maxLength={40} placeholder="如 内科 / 外科 / 医技" />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="sort" label="排序值" extra="越小越靠前">
            <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="intro" label="科室简介">
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="诊疗范围与出诊说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 城市
// ============================================================================

function CitiesPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthCityRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.cities({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthCityRow) => {
    setBusy(true);
    try {
      await healthApi.cityRemove({ body: { shopId, id: row.id } });
      message.success("城市已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthCityRow> = [
    {
      title: "城市名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "行政区划代码", dataIndex: "code", width: 160, render: (value: string) => value || "—" },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "医院数", dataIndex: "hospitalCount", width: 100 },
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
            title="删除后小程序端城市筛选少一个选项，已归属该城市的医院与套餐需重新选择。"
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
      title="城市"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">城市是医院与体检套餐的分组维度</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增城市
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthCityRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 820 }}
      />

      <CityModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type CityFormValues = { name: string; code: string; sort: number; status: string };

function CityModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthCityRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CityFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      code: row?.code ?? "",
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.citySave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          code: values.code ?? "",
          sort: Number(values.sort ?? 0),
          status: (values.status ?? "ON") as HealthCityRow["status"],
        },
      });
      message.success(row ? "城市已保存" : "城市已创建");
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
      title={row ? `编辑城市「${row.name}」` : "新增城市"}
      width={480}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="城市名称"
          rules={[{ required: true, message: "请填写城市名称" }]}
        >
          <Input maxLength={40} placeholder="如 杭州" />
        </Form.Item>
        <Form.Item name="code" label="行政区划代码" extra="用于对外展示与对账，可留空">
          <Input maxLength={20} placeholder="如 330100" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="sort" label="排序值" extra="越小越靠前">
            <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
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
// 疾病百科
// ============================================================================

/** 科室下拉（跨医院）：疾病挂科室，导诊按科室推荐医护。 */
function useDepartmentOptions(shopId: number, enabled: boolean) {
  const departments = useHealthResource(
    () =>
      healthApi.departments({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, hospitalId: 0 } }),
    [shopId],
    enabled && shopId > 0,
  );
  const rows = departments.data?.list ?? [];
  return {
    departmentRows: rows,
    departmentOptions: rows.map((row) => ({
      value: row.id,
      label: row.hospitalName ? `${row.name}（${row.hospitalName}）` : row.name,
    })),
  };
}

function DiseasesPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const meta = useHealthMeta();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthDiseaseRow | "new" | null>(null);
  const { departmentOptions } = useDepartmentOptions(shopId, true);
  const resource = useHealthResource(
    () => healthApi.diseases({ query: { shopId, page, pageSize: PAGE_SIZE, category } }),
    [shopId, page, category],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthDiseaseRow) => {
    setBusy(true);
    try {
      await healthApi.diseaseRemove({ body: { shopId, id: row.id } });
      message.success("疾病条目已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthDiseaseRow> = [
    {
      title: "疾病名称",
      dataIndex: "name",
      width: 180,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "分类", dataIndex: "category", width: 120, render: (value: string) => value || "—" },
    {
      title: "所属科室",
      dataIndex: "departmentNames",
      width: 220,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    {
      title: "相关症状",
      dataIndex: "symptomNames",
      width: 240,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 110,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
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
            title="删除后导诊不再按该疾病匹配科室，相关症状也会被解除。"
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
      title="疾病百科"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">导诊按「症状 → 疾病 → 科室」匹配，只给建议不下诊断</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增疾病
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">分类</span>
          <Input.Search
            allowClear
            placeholder="如 心血管"
            style={{ width: 200 }}
            onSearch={(value) => {
              setCategory(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthDiseaseRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1180 }}
      />

      <DiseaseModal
        shopId={shopId}
        departmentOptions={departmentOptions}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type DiseaseFormValues = {
  name: string;
  category: string;
  departmentIds: number[];
  symptomNames: string[];
  overview: string;
  advice: string;
  status: string;
};

function DiseaseModal({
  shopId,
  departmentOptions,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  departmentOptions: { value: number; label: string }[];
  editing: HealthDiseaseRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DiseaseFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      category: row?.category ?? "",
      departmentIds: row?.departmentIds ?? [],
      symptomNames: row?.symptomNames ?? [],
      overview: row?.overview ?? "",
      advice: row?.advice ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.diseaseSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          category: values.category ?? "",
          departmentIds: values.departmentIds ?? [],
          symptomNames: (values.symptomNames ?? []).map((item) => item.trim()).filter(Boolean),
          overview: values.overview ?? "",
          advice: values.advice ?? "",
          status: (values.status ?? "ON") as HealthDiseaseRow["status"],
        },
      });
      message.success(row ? "疾病条目已保存" : "疾病条目已创建，审核通过后参与导诊");
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
      title={row ? `编辑疾病「${row.name}」` : "新增疾病"}
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
            name="name"
            label="疾病名称"
            rules={[{ required: true, message: "请填写疾病名称" }]}
          >
            <Input maxLength={60} placeholder="如 原发性高血压" />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input maxLength={40} placeholder="如 心血管 / 内分泌" />
          </Form.Item>
        </div>
        <Form.Item name="departmentIds" label="所属科室" extra="导诊会把患者导向这些科室">
          <Select
            mode="multiple"
            allowClear
            placeholder="选择科室"
            options={departmentOptions}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="symptomNames"
          label="相关症状"
          extra="输入后回车新增，逗号分隔可一次录多个；导诊按症状命中"
        >
          <Select
            mode="tags"
            tokenSeparators={[",", "，"]}
            placeholder="如 头晕、心悸"
            options={[]}
          />
        </Form.Item>
        <Form.Item name="overview" label="疾病概述">
          <Input.TextArea rows={4} maxLength={8000} showCount placeholder="病因、常见表现与就医时机" />
        </Form.Item>
        <Form.Item name="advice" label="就医建议">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="导诊结果里展示的自助建议" />
        </Form.Item>
        <Form.Item name="status" label="启用状态" style={{ width: 200 }}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 体检项目
// ============================================================================

function ExamItemsPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthExamItemRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.examItems({ query: { shopId, page, pageSize: PAGE_SIZE, category } }),
    [shopId, page, category],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthExamItemRow) => {
    setBusy(true);
    try {
      await healthApi.examItemRemove({ body: { shopId, id: row.id } });
      message.success("体检项目已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthExamItemRow> = [
    {
      title: "项目名称",
      dataIndex: "name",
      width: 220,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "分类", dataIndex: "category", width: 120, render: (value: string) => value || "—" },
    { title: "单位", dataIndex: "unit", width: 90, render: (value: string) => value || "—" },
    {
      title: "参考范围",
      dataIndex: "reference",
      width: 180,
      render: (value: string) => value || "—",
    },
    { title: "单价", dataIndex: "priceCents", width: 100, render: (value: number) => cny(value) },
    {
      title: "适用人群",
      dataIndex: "crowdKinds",
      width: 160,
      render: (value: string[]) => crowdText(meta, value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
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
            title="删除后已引用它的套餐需重新选择项目。"
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
      title="体检项目"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">体检项目是套餐的最小组件，按项目和加价组成套餐</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增体检项目
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">分类</span>
          <Input.Search
            allowClear
            placeholder="如 生化 / 影像"
            style={{ width: 200 }}
            onSearch={(value) => {
              setCategory(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthExamItemRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1120 }}
      />

      <ExamItemModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ExamItemFormValues = {
  name: string;
  category: string;
  unit: string;
  reference: string;
  priceYuan: number;
  genderLimit: string;
  crowdKinds: string[];
  desc: string;
  status: string;
};

function ExamItemModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthExamItemRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ExamItemFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      category: row?.category ?? "",
      unit: row?.unit ?? "",
      reference: row?.reference ?? "",
      priceYuan: centsToYuan(row?.priceCents),
      genderLimit: row?.genderLimit || "ALL",
      crowdKinds: row?.crowdKinds ?? [],
      desc: row?.desc ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.examItemSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          category: values.category ?? "",
          unit: values.unit ?? "",
          reference: values.reference ?? "",
          priceCents: yuanToCents(values.priceYuan),
          genderLimit: values.genderLimit ?? "ALL",
          crowdKinds: (values.crowdKinds ?? []) as HealthCrowdKind[],
          desc: values.desc ?? "",
          status: (values.status ?? "ON") as HealthExamItemRow["status"],
        },
      });
      message.success(row ? "体检项目已保存" : "体检项目已创建，可加入体检套餐");
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
      title={row ? `编辑体检项目「${row.name}」` : "新增体检项目"}
      width={680}
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
            label="项目名称"
            rules={[{ required: true, message: "请填写项目名称" }]}
          >
            <Input maxLength={80} placeholder="如 空腹血糖" />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input maxLength={40} placeholder="如 生化 / 血常规 / 影像" />
          </Form.Item>
          <Form.Item name="unit" label="计量单位">
            <Input maxLength={20} placeholder="如 mmol/L" />
          </Form.Item>
          <Form.Item name="reference" label="参考范围">
            <Input maxLength={120} placeholder="如 3.9-6.1" />
          </Form.Item>
          <Form.Item name="priceYuan" label="单价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="genderLimit" label="性别限制">
            <Select
              options={[
                { value: "ALL", label: "不限" },
                { value: "MALE", label: "仅男性" },
                { value: "FEMALE", label: "仅女性" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="crowdKinds" label="适用人群">
          <Select
            mode="multiple"
            allowClear
            placeholder="不选即全部人群"
            options={crowdOptions(meta)}
          />
        </Form.Item>
        <Form.Item name="desc" label="项目说明">
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="检查内容与注意事项" />
        </Form.Item>
        <Form.Item name="status" label="启用状态" style={{ width: 200 }}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 体检套餐
// ============================================================================

function ExamPackagesPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [cityId, setCityId] = useState(0);
  const [crowdKind, setCrowdKind] = useState("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthExamPackageRow | "new" | null>(null);
  const [detail, setDetail] = useState<HealthExamPackageRow | null>(null);
  const cities = useHealthResource(
    () => healthApi.cities({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const resource = useHealthResource(
    () =>
      healthApi.examPackages({
        query: { shopId, page, pageSize: PAGE_SIZE, cityId, crowdKind },
      }),
    [shopId, page, cityId, crowdKind],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthExamPackageRow) => {
    setBusy(true);
    try {
      await healthApi.examPackageRemove({ body: { shopId, id: row.id } });
      message.success("体检套餐已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthExamPackageRow> = [
    {
      title: "套餐名称",
      dataIndex: "name",
      width: 220,
      render: (value: string, row) => (
        <Space size={6}>
          <strong>{value}</strong>
          {row.hot ? <Tag color="volcano">热门</Tag> : null}
        </Space>
      ),
    },
    { title: "城市", dataIndex: "cityName", width: 100, render: (value: string) => value || "—" },
    {
      title: "体检机构",
      dataIndex: "organName",
      width: 180,
      render: (value: string) => value || "—",
    },
    {
      title: "适用人群",
      dataIndex: "crowdKinds",
      width: 160,
      render: (value: string[]) => crowdText(meta, value),
    },
    { title: "售价", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "划线价",
      dataIndex: "originPriceCents",
      width: 110,
      render: (value: number) =>
        value > 0 ? (
          <span className="muted" style={{ textDecoration: "line-through" }}>
            {cny(value)}
          </span>
        ) : (
          "—"
        ),
    },
    { title: "项目数", dataIndex: "itemCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "已售", dataIndex: "orderCount", width: 80 },
    {
      title: "操作",
      width: 190,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后小程序端立即不可售，历史订单与报告不受影响。"
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
      title="体检套餐"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">套餐由体检项目组合而成，价格按套餐整单售卖</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增套餐
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">城市</span>
          <Select
            value={cityId}
            style={{ width: 180 }}
            onChange={(value: number) => {
              setCityId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部城市" },
              ...(cities.data ?? []).map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">适用人群</span>
          <Select
            value={crowdKind}
            style={{ width: 180 }}
            onChange={(value: string) => {
              setCrowdKind(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部人群" }, ...crowdOptions(meta)]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthExamPackageRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1340 }}
      />

      <ExamPackageModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />

      <ExamPackageDetailModal shopId={shopId} meta={meta} row={detail} onClose={() => setDetail(null)} />
    </Panel>
  );
}

function ExamPackageDetailModal({
  shopId,
  meta,
  row,
  onClose,
}: {
  shopId: number;
  meta: HealthMeta | null;
  row: HealthExamPackageRow | null;
  onClose: () => void;
}) {
  const open = Boolean(row && shopId);
  const resource = useHealthResource(
    () => healthApi.examPackageDetail({ query: { shopId, id: row?.id ?? 0 } }),
    [shopId, row?.id],
    open,
  );
  const detail = resource.data ?? null;

  return (
    <Modal
      open={open}
      title={row ? `套餐详情 · ${row.name}` : "套餐详情"}
      width={720}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      {detail ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Descriptions
            items={[
              { label: "套餐名称", value: detail.name },
              { label: "城市", value: detail.cityName || "—" },
              { label: "体检机构", value: detail.organName || "—" },
              { label: "售价", value: cny(detail.priceCents) },
              { label: "划线价", value: detail.originPriceCents > 0 ? cny(detail.originPriceCents) : "—" },
              { label: "适用人群", value: crowdText(meta, detail.crowdKinds) },
              {
                label: "性别限制",
                value:
                  detail.genderLimit === "MALE" ? "仅男性" : detail.genderLimit === "FEMALE" ? "仅女性" : "不限",
              },
              { label: "项目数", value: `${detail.itemCount} 项` },
              { label: "状态", value: <OnOffTag value={detail.status} /> },
              { label: "已售", value: detail.orderCount },
            ]}
          />
          <div>
            <div className="muted text-12">检查项目</div>
            <DataTable<HealthExamPackageRow["items"][number]>
              rows={detail.items}
              rowKey={(item) => `${item.itemId}-${item.mode}`}
              page={1}
              columns={[
                { title: "项目", dataIndex: "name", render: (value: string) => value },
                { title: "分类", dataIndex: "category", width: 120, render: (value: string) => value || "—" },
                { title: "单项价", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
                {
                  title: "计费方式",
                  dataIndex: "mode",
                  width: 130,
                  render: (value: string) => PACKAGE_ITEM_MODE_LABELS[value] ?? value,
                },
              ]}
              scroll={{ x: 560 }}
            />
          </div>
          {detail.intro ? (
            <div>
              <div className="muted text-12">套餐说明</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{detail.intro}</div>
            </div>
          ) : null}
          {detail.notice ? (
            <div>
              <div className="muted text-12">体检须知</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{detail.notice}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

type PackageFormValues = {
  name: string;
  cover: string;
  cityId: number;
  organId: number;
  crowdKinds: string[];
  genderLimit: string;
  marriedLimit: string;
  priceYuan: number;
  originPriceYuan: number;
  intro: string;
  notice: string;
  hot: boolean;
  status: string;
  items: { itemId: number; mode: "INCLUDE" | "ADDON" }[];
};

function ExamPackageModal({
  shopId,
  meta,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthExamPackageRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PackageFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  // 选项只在弹窗打开时取：城市、体检机构、体检项目。
  const cities = useHealthResource(
    () => healthApi.cities({ query: { shopId } }),
    [shopId],
    open && shopId > 0,
  );
  const organs = useHealthResource(
    () => healthApi.organs({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, kind: "all" } }),
    [shopId],
    open && shopId > 0,
  );
  const examItems = useHealthResource(
    () => healthApi.examItems({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    open && shopId > 0,
  );
  const itemRows = examItems.data?.list ?? [];
  const itemOptions = itemRows.map((item) => ({
    value: item.id,
    label: `${item.name}（${cny(item.priceCents)}）`,
  }));

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      cover: row?.cover ?? "",
      cityId: row?.cityId ?? 0,
      organId: row?.organId ?? 0,
      crowdKinds: row?.crowdKinds ?? [],
      genderLimit: row?.genderLimit || "ALL",
      marriedLimit: row?.marriedLimit || "ALL",
      priceYuan: centsToYuan(row?.priceCents),
      originPriceYuan: centsToYuan(row?.originPriceCents),
      intro: row?.intro ?? "",
      notice: row?.notice ?? "",
      hot: row?.hot ?? false,
      status: row?.status ?? "ON",
      items: (row?.items ?? []).map((item) => ({
        itemId: item.itemId,
        mode: item.mode === "ADDON" ? "ADDON" : "INCLUDE",
      })),
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.examPackageSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          cover: values.cover ?? "",
          cityId: Number(values.cityId ?? 0),
          organId: Number(values.organId ?? 0),
          crowdKinds: (values.crowdKinds ?? []) as HealthCrowdKind[],
          genderLimit: values.genderLimit ?? "ALL",
          marriedLimit: values.marriedLimit ?? "ALL",
          priceCents: yuanToCents(values.priceYuan),
          originPriceCents: yuanToCents(values.originPriceYuan),
          intro: values.intro ?? "",
          notice: values.notice ?? "",
          hot: Boolean(values.hot),
          status: (values.status ?? "ON") as HealthExamPackageRow["status"],
          items: (values.items ?? [])
            .filter((item) => Number(item?.itemId) > 0)
            .map((item) => ({
              itemId: Number(item.itemId),
              mode: item.mode === "ADDON" ? ("ADDON" as const) : ("INCLUDE" as const),
            })),
        },
      });
      message.success(row ? "体检套餐已保存" : "体检套餐已创建");
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
      title={row ? `编辑套餐「${row.name}」` : "新增体检套餐"}
      width={780}
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
            <Input maxLength={80} placeholder="如 中老年关爱体检套餐" />
          </Form.Item>
          <Form.Item name="cover" label="封面图" extra="留空用默认占位">
            <Input maxLength={500} placeholder="https://…" />
          </Form.Item>
          <Form.Item name="cityId" label="所属城市" extra="不选即不限城市">
            <Select
              placeholder="选择城市"
              options={[
                { value: 0, label: "不限城市" },
                ...(cities.data ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Form.Item>
          <Form.Item name="organId" label="体检机构" extra="不选即由店铺安排">
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择机构"
              options={[
                { value: 0, label: "不指定机构" },
                ...(organs.data?.list ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Form.Item>
          <Form.Item name="priceYuan" label="售价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="originPriceYuan" label="划线价（元）" extra="0 表示不展示划线价">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Form.Item name="crowdKinds" label="适用人群">
          <Select
            mode="multiple"
            allowClear
            placeholder="不选即全部人群"
            options={crowdOptions(meta)}
          />
        </Form.Item>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="genderLimit" label="性别限制">
            <Select
              options={[
                { value: "ALL", label: "不限" },
                { value: "MALE", label: "仅男性" },
                { value: "FEMALE", label: "仅女性" },
              ]}
            />
          </Form.Item>
          <Form.Item name="marriedLimit" label="婚否限制">
            <Select
              options={[
                { value: "ALL", label: "不限" },
                { value: "MARRIED", label: "仅已婚" },
                { value: "UNMARRIED", label: "仅未婚" },
              ]}
            />
          </Form.Item>
          <Form.Item name="hot" label="设为热门" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>

        <Form.Item label="检查项目" extra="从「体检项目」中挑选；「可加价加项」不计入套餐价，由顾客自愿加购">
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" wrap>
                    <Form.Item
                      name={[field.name, "itemId"]}
                      rules={[{ required: true, message: "请选择项目" }]}
                      style={{ marginBottom: 0, minWidth: 320 }}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择体检项目"
                        options={itemOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "mode"]}
                      initialValue="INCLUDE"
                      style={{ marginBottom: 0, width: 150 }}
                    >
                      <Select
                        options={[
                          { value: "INCLUDE", label: "套餐内含" },
                          { value: "ADDON", label: "可加价加项" },
                        ]}
                      />
                    </Form.Item>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined aria-hidden />}
                      onClick={() => remove(field.name)}
                    >
                      移除
                    </Button>
                  </Space>
                ))}
                <div>
                  <Button
                    size="small"
                    icon={<PlusOutlined aria-hidden />}
                    disabled={!itemOptions.length}
                    onClick={() => add({ itemId: 0, mode: "INCLUDE" })}
                  >
                    添加项目
                  </Button>
                  {itemOptions.length ? null : (
                    <span className="muted text-12" style={{ marginLeft: 8 }}>
                      还没有体检项目，先到「体检项目」页签新增
                    </span>
                  )}
                </div>
              </div>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item name="intro" label="套餐说明">
          <Input.TextArea rows={3} maxLength={4000} showCount placeholder="适合人群与检查重点" />
        </Form.Item>
        <Form.Item name="notice" label="体检须知">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="空腹要求、预约与到店流程" />
        </Form.Item>
        <Form.Item name="status" label="上架状态" style={{ width: 200 }}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 导诊模拟
// ============================================================================

function GuidancePanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    symptomNames: string[];
    patientAge: number;
    patientGender?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<HealthGuidanceResult | null>(null);
  const diseases = useHealthResource(
    () => healthApi.diseases({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const symptomOptions = [
    ...new Set((diseases.data?.list ?? []).flatMap((row) => row.symptomNames)),
  ]
    .filter(Boolean)
    .map((value) => ({ value, label: value }));

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const next = await healthApi.guidanceSimulate({
        body: {
          shopId,
          symptomNames: (values.symptomNames ?? []).map((item) => item.trim()).filter(Boolean),
          patientAge: Number(values.patientAge ?? 0),
          patientGender: values.patientGender ?? "",
        },
      });
      setResult(next);
      message.success("导诊模拟已完成");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导诊模拟失败");
    } finally {
      setSaving(false);
    }
  };

  const departmentColumns: ColumnsType<HealthGuidanceResult["departments"][number]> = [
    {
      title: "推荐科室",
      dataIndex: "departmentName",
      width: 180,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "命中的疾病",
      dataIndex: "hitDiseases",
      width: 260,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    {
      title: "建议",
      dataIndex: "advice",
      render: (value: string) => value || "—",
    },
  ];

  const practitionerColumns: ColumnsType<HealthGuidanceResult["practitioners"][number]> = [
    {
      title: "推荐医护",
      dataIndex: "name",
      width: 140,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          <div className="muted text-12">{row.title || labelOf(meta, "practitionerRoles", row.role)}</div>
        </div>
      ),
    },
    {
      title: "身份",
      dataIndex: "role",
      width: 110,
      render: (value: string) => labelOf(meta, "practitionerRoles", value),
    },
    {
      title: "科室 / 医院",
      width: 240,
      render: (_: unknown, row) => `${row.departmentName || "—"} · ${row.hospitalName || "—"}`,
    },
    { title: "匹配度", dataIndex: "score", width: 90, render: (value: number) => value },
    {
      title: "推荐理由",
      dataIndex: "reason",
      render: (value: string) => value || "—",
    },
  ];

  return (
    <Panel
      title="导诊模拟"
      titleExtra={<span className="muted text-12">在店主侧重放顾客的导诊问答，校准症状词与科室映射</span>}
    >
      <Alert
        type="error"
        showIcon
        message="仅作就医参考，不构成诊断，急危重症请拨 120"
        description="导诊结果来自疾病百科的症状匹配，不能替代医生面诊与检查；突发胸痛、意识障碍、大出血等请立即拨打 120 或前往急诊。"
        style={{ marginBottom: 14 }}
      />

      <Form form={form} layout="vertical" initialValues={{ patientAge: 0 }}>
        <Form.Item
          name="symptomNames"
          label="症状"
          extra="可从已有症状多选，也可直接输入后回车（逗号分隔可一次录多个）"
          rules={[{ required: true, message: "请至少选择一个症状" }]}
        >
          <Select
            mode="tags"
            allowClear
            tokenSeparators={[",", "，"]}
            placeholder="如 头晕、心悸"
            options={symptomOptions}
            optionFilterProp="label"
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "160px 160px 160px", gap: 12 }}>
          <Form.Item name="patientAge" label="年龄">
            <InputNumber min={0} max={120} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="patientGender" label="性别">
            <Select
              allowClear
              placeholder="不限"
              options={[
                { value: "MALE", label: "男" },
                { value: "FEMALE", label: "女" },
              ]}
            />
          </Form.Item>
          <Form.Item label=" ">
            <Button type="primary" loading={saving} onClick={() => void submit()}>
              开始导诊
            </Button>
          </Form.Item>
        </div>
      </Form>

      {result ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Descriptions
            items={[
              { label: "识别症状", value: result.symptomNames.join("、") || "—" },
              { label: "推荐科室数", value: `${result.departments.length} 个` },
              { label: "推荐医护数", value: `${result.practitioners.length} 位` },
            ]}
          />
          <div>
            <div className="muted text-12">推荐科室</div>
            <DataTable<HealthGuidanceResult["departments"][number]>
              rows={result.departments}
              columns={departmentColumns}
              rowKey={(item) => String(item.departmentId)}
              page={1}
              scroll={{ x: 760 }}
            />
          </div>
          <div>
            <div className="muted text-12">推荐医护</div>
            <DataTable<HealthGuidanceResult["practitioners"][number]>
              rows={result.practitioners}
              columns={practitionerColumns}
              rowKey={(item) => String(item.practitionerId)}
              page={1}
              scroll={{ x: 900 }}
            />
          </div>
          <div className="muted text-12">{result.disclaimer}</div>
        </div>
      ) : null}
    </Panel>
  );
}
