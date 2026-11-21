"use client";

import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { HealthMeta, HealthPractitionerRole, HealthPractitionerRow } from "@enterprise/contracts";
import { HEALTH_PRACTITIONER_ROLES } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  DataTable,
  Descriptions,
  FilterBar,
  OnOffTag,
  StatusTag,
  cny,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 医护：机构内接诊的医生、健管师、药师与导诊师，以及每位医护可接的服务与报价。
 * 审核与上下架都在店主侧闭环；服务定价决定小程序端看到的挂号/问诊价格。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const parseImages = (value: unknown) =>
  String(value ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 9);

/** 下拉选项：机构、医院、科室各自按店铺取前 100 条即可覆盖一家店的规模。 */
function useSubjectOptions(shopId: number) {
  const organs = useHealthResource(
    () => healthApi.organs({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, kind: "all" } }),
    [shopId],
    shopId > 0,
  );
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
    organOptions: (organs.data?.list ?? []).map((row) => ({ value: row.id, label: row.name })),
    hospitalOptions: (hospitals.data?.list ?? []).map((row) => ({ value: row.id, label: row.name })),
    departmentRows: departments.data?.list ?? [],
  };
}

type ServiceRow = HealthPractitionerRow["services"][number];

export function PractitionersTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("practitioners");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "practitioners",
          label: "医护",
          children: <PractitionerList shopId={shopId} meta={meta} />,
        },
        {
          key: "pricing",
          label: "服务定价",
          children: <ServicePricing shopId={shopId} meta={meta} />,
        },
      ]}
    />
  );
}

function PractitionerList({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<HealthPractitionerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("all");
  const [organId, setOrganId] = useState(0);
  const [hospitalId, setHospitalId] = useState(0);
  const [departmentId, setDepartmentId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<HealthPractitionerRow | null>(null);
  const [editing, setEditing] = useState<HealthPractitionerRow | "new" | null>(null);
  const [auditing, setAuditing] = useState<HealthPractitionerRow | null>(null);
  const { organOptions, hospitalOptions, departmentRows } = useSubjectOptions(shopId);
  // AI 医护：这里只改「这位医护用哪位 AI 客服」，人选与话术都在 AI客服 板块维护。
  const aiStaff = useHealthResource(
    () => healthApi.aiStaffStatus({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const aiBindings = new Map((aiStaff.data?.practitioners ?? []).map((row) => [row.id, row]));
  const aiAgentOptions = [
    { value: 0, label: "不绑定（医护自己回答）" },
    ...(aiStaff.data?.agents ?? []).map((agent) => ({
      value: agent.id,
      label: `${agent.name}${agent.statusLabel ? ` · ${agent.statusLabel}` : ""}`,
    })),
  ];
  const aiEnabled = aiStaff.data?.enabled === true;

  const bindAiAgent = async (row: HealthPractitionerRow, agentId: number) => {
    setBusy(true);
    try {
      await healthApi.aiStaffBindingSave({
        body: { shopId, practitionerId: row.id, agentId },
      });
      message.success(agentId ? `已为 ${row.name} 绑定 AI 客服` : `已解除 ${row.name} 的 AI 客服绑定`);
      await aiStaff.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
      await aiStaff.reload();
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const result = await healthApi.practitioners({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          role,
          organId,
          hospitalId,
          departmentId,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [shopId, page, role, organId, hospitalId, departmentId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: HealthPractitionerRow) => {
    setBusy(true);
    try {
      setDetail(await healthApi.practitionerDetail({ query: { shopId, id: row.id } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (row: HealthPractitionerRow) => {
    setBusy(true);
    try {
      await healthApi.practitionerStatus({
        body: { shopId, id: row.id, status: row.status === "ON" ? "OFF" : "ON" },
      });
      message.success(row.status === "ON" ? "该医护已下架" : "该医护已上架");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: HealthPractitionerRow) => {
    setBusy(true);
    try {
      await healthApi.practitionerRemove({ body: { shopId, id: row.id } });
      message.success("医护已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthPractitionerRow> = [
    { title: "姓名", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    {
      title: "身份",
      dataIndex: "role",
      width: 100,
      render: (value: string) => labelOf(meta, "practitionerRoles", value),
    },
    { title: "职称", dataIndex: "title", width: 110, render: (value: string) => value || "—" },
    { title: "所属机构", dataIndex: "organName", width: 140, render: (value: string) => value || "—" },
    { title: "医院", dataIndex: "hospitalName", width: 140, render: (value: string) => value || "—" },
    {
      title: "科室",
      dataIndex: "departmentName",
      width: 110,
      render: (value: string) => value || "—",
    },
    { title: "手机号", dataIndex: "phone", width: 130, render: (value: string) => value || "—" },
    {
      title: "分成比例",
      dataIndex: "commissionPercent",
      width: 100,
      render: (value: number) => (value > 0 ? `${value}%` : "按店铺默认"),
    },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "上架状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "绑定 AI 客服",
      width: 220,
      render: (_: unknown, row) => {
        const boundId = aiBindings.get(row.id)?.agentId ?? 0;
        // 绑过但那位 AI 客服后来停用了：仍把当前选择显示出来，别让店主以为没绑。
        const options =
          boundId > 0 && !aiAgentOptions.some((item) => item.value === boundId)
            ? [
                ...aiAgentOptions,
                {
                  value: boundId,
                  label: `${aiBindings.get(row.id)?.agentName || `#${boundId}`}（已停用）`,
                },
              ]
            : aiAgentOptions;
        return (
          <Select
            size="small"
            style={{ width: 200 }}
            disabled={busy || !aiAgentOptions.length}
            value={boundId}
            options={options}
            placeholder={aiAgentOptions.length ? "不绑定" : "还没有可用的 AI 客服"}
            onChange={(value: number) => void bindAiAgent(row, value)}
          />
        );
      },
    },
    { title: "接诊人数", dataIndex: "patientCount", width: 100 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 230,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" loading={busy} onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" onClick={() => setAuditing(row)}>
            审核
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void toggleStatus(row)}>
            {row.status === "ON" ? "下架" : "上架"}
          </Button>
          <Popconfirm
            title="删除后该医护的历史接诊与评价保留，但不再出现在小程序端，确认继续？"
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
      title="医护"
      titleExtra={
        <span className="muted text-12">
          审核通过且上架的医护，才会在小程序端被顾客选中接诊
          {aiStaff.data && !aiEnabled ? "；AI 医护当前未开启，绑定后也不会生效（店铺设置 → AI客服 里开启）" : ""}
        </span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增医护
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">身份</span>
          <Select
            value={role}
            style={{ width: 140 }}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部身份" },
              ...HEALTH_PRACTITIONER_ROLES.map((item) => ({
                value: item,
                label: labelOf(meta, "practitionerRoles", item),
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">所属机构</span>
          <Select
            value={organId}
            style={{ width: 180 }}
            onChange={(value) => {
              setOrganId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部机构" }, ...organOptions]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">医院</span>
          <Select
            value={hospitalId}
            style={{ width: 180 }}
            onChange={(value) => {
              setHospitalId(value);
              setDepartmentId(0);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部医院" }, ...hospitalOptions]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">科室</span>
          <Select
            value={departmentId}
            style={{ width: 200 }}
            onChange={(value) => {
              setDepartmentId(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部科室" },
              ...departmentRows
                .filter((row) => !hospitalId || row.hospitalId === hospitalId)
                .map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        </div>
      </FilterBar>

      {rows.length || loading ? (
        <DataTable
          rows={rows}
          columns={columns}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading || busy}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1720 }}
        />
      ) : (
        <EmptyState text="还没有医护：先在机构下新增医护并提交审核，再配置服务定价。" />
      )}

      <Drawer
        open={Boolean(detail)}
        size="large"
        title={detail ? `医护详情 · ${detail.name}` : "医护详情"}
        onClose={() => setDetail(null)}
        destroyOnHidden
      >
        {detail ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Descriptions
              items={[
                { label: "身份", value: labelOf(meta, "practitionerRoles", detail.role) },
                { label: "职称", value: detail.title || "—" },
                { label: "所属机构", value: detail.organName || "—" },
                { label: "医院", value: detail.hospitalName || "—" },
                { label: "科室", value: detail.departmentName || "—" },
                { label: "手机号", value: detail.phone || "—" },
                { label: "所在城市", value: detail.city || "—" },
                { label: "执业证号", value: detail.licenseNo || "—" },
                {
                  label: "分成比例",
                  value: detail.commissionPercent > 0 ? `${detail.commissionPercent}%` : "按店铺默认",
                },
                {
                  label: "审核状态",
                  value: <StatusTag meta={meta} kind="auditStatuses" value={detail.auditStatus} />,
                },
                { label: "审核意见", value: detail.auditReason || "—" },
                { label: "上架状态", value: <OnOffTag value={detail.status} /> },
                { label: "接诊人数", value: detail.patientCount },
                {
                  label: "评分",
                  value: detail.ratings.count
                    ? `${detail.ratings.score.toFixed(1)} 分（${detail.ratings.count} 条）`
                    : "暂无评价",
                },
                { label: "擅长", value: detail.goodAt.length ? detail.goodAt.join("、") : "—" },
              ]}
            />
            <div>
              <div className="muted text-12">个人简介</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.intro || "—"}</div>
            </div>
            <div>
              <div className="muted text-12">可接服务</div>
              {detail.services.length ? (
                <DataTable
                  rows={detail.services}
                  page={1}
                  scroll={{ x: 520 }}
                  columns={[
                    { title: "服务项目", dataIndex: "serviceName" },
                    {
                      title: "业务类型",
                      dataIndex: "bizType",
                      width: 110,
                      render: (value: string) => labelOf(meta, "bizTypes", value),
                    },
                    {
                      title: "定价",
                      dataIndex: "priceCents",
                      width: 110,
                      render: (value: number) => cny(value),
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      width: 90,
                      render: (value: string) => <OnOffTag value={value} />,
                    },
                  ]}
                />
              ) : (
                <div style={{ marginTop: 4 }}>还没有可接服务，到「服务定价」页签为其挂上服务项目。</div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      <PractitionerModal
        shopId={shopId}
        meta={meta}
        editing={editing}
        options={{ organOptions, hospitalOptions, departmentRows }}
        onClose={() => setEditing(null)}
        onDone={() => void load()}
      />

      <PractitionerAuditModal
        shopId={shopId}
        row={auditing}
        onClose={() => setAuditing(null)}
        onDone={() => void load()}
      />
    </Panel>
  );
}

type PractitionerFormValues = {
  organId: number;
  hospitalId: number;
  departmentId: number;
  name: string;
  role: string;
  title: string;
  avatar: string;
  phone: string;
  city: string;
  intro: string;
  goodAt: string[];
  licenseNo: string;
  licenseImages: string;
  commissionPercent: number;
};

function PractitionerModal({
  shopId,
  meta,
  editing,
  options,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  editing: HealthPractitionerRow | "new" | null;
  options: {
    organOptions: { value: number; label: string }[];
    hospitalOptions: { value: number; label: string }[];
    departmentRows: { id: number; hospitalId: number; name: string }[];
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PractitionerFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;
  const hospitalId = Form.useWatch<number | undefined>("hospitalId", form);

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        organId: 0,
        hospitalId: 0,
        departmentId: 0,
        name: "",
        role: "DOCTOR",
        title: "",
        avatar: "",
        phone: "",
        city: "",
        intro: "",
        goodAt: [],
        licenseNo: "",
        licenseImages: "",
        commissionPercent: 0,
      });
      return;
    }
    form.setFieldsValue({
      organId: row.organId,
      hospitalId: row.hospitalId,
      departmentId: row.departmentId,
      name: row.name,
      role: row.role,
      title: row.title,
      avatar: row.avatar,
      phone: row.phone,
      city: row.city,
      intro: row.intro,
      goodAt: row.goodAt,
      licenseNo: row.licenseNo,
      licenseImages: "",
      commissionPercent: row.commissionPercent,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.practitionerSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          organId: Number(values.organId ?? 0),
          hospitalId: Number(values.hospitalId ?? 0),
          departmentId: Number(values.departmentId ?? 0),
          name: values.name,
          role: values.role as HealthPractitionerRole,
          title: values.title ?? "",
          avatar: values.avatar ?? "",
          phone: values.phone ?? "",
          city: values.city ?? "",
          intro: values.intro ?? "",
          goodAt: values.goodAt ?? [],
          licenseNo: values.licenseNo ?? "",
          licenseImages: parseImages(values.licenseImages),
          commissionPercent: Number(values.commissionPercent ?? 0),
        },
      });
      message.success("医护已保存并标记为已核验");
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
      title={row ? `编辑 ${row.name}` : "新增医护"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={760}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="organId" label="所属机构">
            <Select options={[{ value: 0, label: "不归属机构" }, ...options.organOptions]} />
          </Form.Item>
          <Form.Item name="hospitalId" label="医院">
            <Select
              options={[{ value: 0, label: "暂不指定" }, ...options.hospitalOptions]}
              onChange={() => form.setFieldValue("departmentId", 0)}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="科室">
            <Select
              options={[
                { value: 0, label: "暂不指定" },
                ...options.departmentRows
                  .filter((item) => !hospitalId || item.hospitalId === hospitalId)
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请填写姓名" }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="role" label="身份" rules={[{ required: true, message: "请选择身份" }]}>
            <Select
              options={HEALTH_PRACTITIONER_ROLES.map((item) => ({
                value: item,
                label: labelOf(meta, "practitionerRoles", item),
              }))}
            />
          </Form.Item>
          <Form.Item name="title" label="职称">
            <Input maxLength={40} placeholder="如 主任医师" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="city" label="所在城市">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="licenseNo" label="执业证号">
            <Input maxLength={64} />
          </Form.Item>
        </div>
        <Form.Item name="avatar" label="头像地址">
          <Input maxLength={500} placeholder="https://.../avatar.jpg" />
        </Form.Item>
        <Form.Item
          name="goodAt"
          label="擅长"
          extra="逐个输入后回车，如 高血压、糖尿病随访"
        >
          <Select mode="tags" maxTagCount={10} placeholder="输入后回车添加" options={[]} />
        </Form.Item>
        <Form.Item name="intro" label="个人简介">
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
        <Form.Item
          name="licenseImages"
          label="执业资质图"
          extra="每行一个图片地址，最多 9 张；留空会清空已存资质图"
        >
          <Input.TextArea rows={3} placeholder="https://.../license-1.jpg" />
        </Form.Item>
        <Form.Item name="commissionPercent" label="分成比例" extra="0 表示按店铺默认分成">
          <InputNumber min={0} max={100} precision={0} suffix="%" style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PractitionerAuditModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthPractitionerRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ approved: boolean; reason: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({ approved: true, reason: "" });
  }, [row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!row) return;
    setSaving(true);
    try {
      await healthApi.practitionerAudit({
        body: {
          shopId,
          id: row.id,
          approved: Boolean(values.approved),
          reason: values.approved ? "" : String(values.reason || ""),
        },
      });
      message.success(values.approved ? "医护已审核通过" : "医护审核已驳回");
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
      open={Boolean(row)}
      title={row ? `审核医护 · ${row.name}` : "审核医护"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交审核"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="approved" label="审核结果" initialValue={true}>
          <Select
            options={[
              { value: true, label: "通过（小程序端可接诊）" },
              { value: false, label: "驳回（需写明原因）" },
            ]}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.approved !== next.approved}>
          {({ getFieldValue }) => (
            <Form.Item
              name="reason"
              label="驳回原因"
              rules={
                getFieldValue("approved") === false
                  ? [{ required: true, message: "驳回必须写明原因" }]
                  : []
              }
            >
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：执业证号与证件不一致" />
            </Form.Item>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

type PricingFormValues = {
  serviceId: number;
  priceYuan: number;
  instant: boolean;
  maxDailyCount: number;
  status: string;
};

function ServicePricing({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [practitionerId, setPractitionerId] = useState(0);
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const practitioners = useHealthResource(
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
  const catalog = useHealthResource(
    () => healthApi.services({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const detail = useHealthResource(
    () => healthApi.practitionerDetail({ query: { shopId, id: practitionerId } }),
    [shopId, practitionerId],
    shopId > 0 && practitionerId > 0,
  );

  const practitionerOptions = (practitioners.data?.list ?? []).map((row) => ({
    value: row.id,
    label: row.organName ? `${row.name}（${row.organName}）` : row.name,
  }));
  const catalogRows = catalog.data?.list ?? [];
  const services = detail.data?.services ?? [];

  const remove = async (row: ServiceRow) => {
    setBusy(true);
    try {
      await healthApi.practitionerServiceRemove({ body: { shopId, id: row.id } });
      message.success("服务定价已删除");
      await detail.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<ServiceRow> = [
    { title: "服务项目", dataIndex: "serviceName", render: (value: string) => <strong>{value}</strong> },
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 120,
      render: (value: string) => labelOf(meta, "bizTypes", value),
    },
    {
      title: "定价",
      dataIndex: "priceCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    {
      title: "极速问诊",
      dataIndex: "instant",
      width: 100,
      render: (value: boolean) => (value ? "按响应时长" : "按号源时段"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 140,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后该医护不再接这个服务，已下单的订单不受影响。"
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
      title="服务定价"
      titleExtra={
        <span className="muted text-12">一位医护挂哪些服务、卖多少钱，都在这里维护</span>
      }
      extra={
        <Space>
          <Select
            showSearch
            optionFilterProp="label"
            value={practitionerId || undefined}
            placeholder="选择医护"
            style={{ width: 220 }}
            onChange={(value: number) => setPractitionerId(value)}
            options={practitionerOptions}
          />
          <Button
            type="primary"
            size="small"
            disabled={!practitionerId || !catalogRows.length}
            onClick={() => setEditing("new")}
          >
            新增定价
          </Button>
        </Space>
      }
    >
      {!catalogRows.length ? (
        <Notice variant="warn">
          服务目录还是空的：先到「服务目录」创建挂号、问诊、体检等服务项目，再回来给医护定价。
        </Notice>
      ) : null}
      {!practitionerId ? (
        <EmptyState text="先在右上角选择一位医护，再维护他名下可接的服务与价格。" />
      ) : services.length || detail.loading ? (
        <DataTable
          rows={services}
          columns={columns}
          page={1}
          loading={detail.loading || busy}
          scroll={{ x: 760 }}
        />
      ) : (
        <EmptyState text="该医护还没有可接服务：点右上角「新增定价」把服务目录里的项目挂给他。" />
      )}

      <PricingModal
        shopId={shopId}
        meta={meta}
        practitionerId={practitionerId}
        editing={editing}
        catalogRows={catalogRows}
        onClose={() => setEditing(null)}
        onDone={() => void detail.reload()}
      />
    </Panel>
  );
}

function PricingModal({
  shopId,
  meta,
  practitionerId,
  editing,
  catalogRows,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  practitionerId: number;
  editing: ServiceRow | "new" | null;
  catalogRows: { id: number; name: string; bizType: string; priceCents: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PricingFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        serviceId: catalogRows[0]?.id ?? 0,
        priceYuan: Number(((catalogRows[0]?.priceCents ?? 0) / 100).toFixed(2)),
        instant: false,
        maxDailyCount: 0,
        status: "ON",
      });
      return;
    }
    form.setFieldsValue({
      serviceId: row.serviceId,
      priceYuan: Number((row.priceCents / 100).toFixed(2)),
      instant: row.instant,
      maxDailyCount: 0,
      status: row.status,
    });
  }, [open, row, catalogRows, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.practitionerServiceSave({
        body: {
          shopId,
          practitionerId,
          id: row?.id ?? 0,
          serviceId: Number(values.serviceId),
          priceCents: Math.round(Number(values.priceYuan ?? 0) * 100),
          instant: Boolean(values.instant),
          maxDailyCount: Number(values.maxDailyCount ?? 0),
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("服务定价已保存");
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
      title={row ? `编辑定价 · ${row.serviceName}` : "新增服务定价"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="serviceId"
          label="服务项目"
          rules={[{ required: true, message: "请选择服务项目" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={catalogRows.map((item) => ({
              value: item.id,
              label: `${item.name}（${labelOf(meta, "bizTypes", item.bizType)} · ${cny(item.priceCents)}）`,
            }))}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="priceYuan"
            label="该医护定价（元）"
            rules={[{ required: true, message: "请填写价格" }]}
            extra="留 0 表示沿用服务项目的标准价"
          >
            <InputNumber min={0} max={999999} step={1} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="maxDailyCount" label="每日上限" extra="0 表示不限；编辑时请按实际重填">
            <InputNumber min={0} max={200} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="instant" label="极速问诊" valuePropName="checked" extra="不选时段，按响应时长计费">
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
      </Form>
    </Modal>
  );
}
