"use client";

import {
  App,
  Button,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { HealthApplicationRow, HealthMeta, HealthOrganKind, HealthOrganRow } from "@enterprise/contracts";
import { HEALTH_ORGAN_KINDS, HEALTH_ORGAN_KIND_LABELS } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import { DataTable, Descriptions, FilterBar, StatusTag } from "./health-common";

/**
 * 机构：院内主体（医院、诊所、体检中心、药房、健康管理机构）与它们的入驻申请台账。
 * 机构是医护、号源、团队的归属，审核通过才在小程序端露出。
 */

const PAGE_SIZE = 20;

/** 入驻申请的对象类型（后端按字符串落库，这里只做展示映射）。 */
const APPLICATION_KIND_LABELS: Record<string, string> = {
  ORGAN: "机构",
  PRACTITIONER: "医护",
};

/** 详情接口在行结构之外还带着资质图与简介字段，契约行类型未列，按可选承接。 */
type OrganDetail = HealthOrganRow & { licenseImages?: string[]; intro?: string };

/** 资质图输入：每行一个地址，也接受逗号分隔；最多 9 张。 */
const parseImages = (value: unknown) =>
  String(value ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 9);

const kindLabel = (kind: string) => HEALTH_ORGAN_KIND_LABELS[kind] || kind;

export function OrgansTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("organs");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "organs", label: "机构", children: <OrganList shopId={shopId} meta={meta} /> },
        {
          key: "applications",
          label: "入驻申请",
          children: <ApplicationLedger shopId={shopId} meta={meta} />,
        },
      ]}
    />
  );
}

function OrganList({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<HealthOrganRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<OrganDetail | null>(null);
  const [editing, setEditing] = useState<OrganDetail | "new" | null>(null);
  const [auditing, setAuditing] = useState<HealthOrganRow | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const result = await healthApi.organs({
        query: { shopId, page, pageSize: PAGE_SIZE, kind },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [shopId, page, kind, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // 详情与编辑都先取一次详情，避免列表行缺资质图/简介时被表单写空。
  const fetchDetail = async (row: HealthOrganRow) => {
    const found = await healthApi.organDetail({ query: { shopId, id: row.id } });
    return found as OrganDetail;
  };

  const openDetail = async (row: HealthOrganRow) => {
    setBusy(true);
    try {
      setDetail(await fetchDetail(row));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async (row: HealthOrganRow) => {
    setBusy(true);
    try {
      setEditing(await fetchDetail(row));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: HealthOrganRow) => {
    setBusy(true);
    try {
      await healthApi.organRemove({ body: { shopId, id: row.id } });
      message.success("机构已下架删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthOrganRow> = [
    {
      title: "机构名称",
      dataIndex: "name",
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "类型", dataIndex: "kind", width: 110, render: (value: string) => kindLabel(value) },
    { title: "所在城市", dataIndex: "city", width: 100, render: (value: string) => value || "—" },
    { title: "联系人", dataIndex: "contactName", width: 100, render: (value: string) => value || "—" },
    { title: "联系电话", dataIndex: "contactPhone", width: 130, render: (value: string) => value || "—" },
    { title: "执业许可证", dataIndex: "licenseNo", width: 150, render: (value: string) => value || "—" },
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
    { title: "医护数", dataIndex: "practitionerCount", width: 90 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 210,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" loading={busy} onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void openEdit(row)}>
            编辑
          </Button>
          <Button size="small" type="text" onClick={() => setAuditing(row)}>
            审核
          </Button>
          <Popconfirm
            title="下架删除后小程序端立即不可见，已归属的医护会失去机构，确认继续？"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              下架删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="机构"
      titleExtra={
        <span className="muted text-12">机构审核通过后，小程序端才展示它的医护、号源与服务</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增机构
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">机构类型</span>
          <Select
            value={kind}
            style={{ width: 180 }}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部类型" },
              ...HEALTH_ORGAN_KINDS.map((item) => ({ value: item, label: kindLabel(item) })),
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
          scroll={{ x: 1420 }}
        />
      ) : (
        <EmptyState text="还没有机构：先新增机构并提交审核，医护与团队都挂在机构下面。" />
      )}

      <Drawer
        open={Boolean(detail)}
        size="large"
        title={detail ? `机构详情 · ${detail.name}` : "机构详情"}
        onClose={() => setDetail(null)}
        destroyOnHidden
      >
        {detail ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Descriptions
              items={[
                { label: "机构类型", value: kindLabel(detail.kind) },
                { label: "所在城市", value: detail.city || "—" },
                { label: "详细地址", value: detail.address || "—" },
                { label: "联系人", value: detail.contactName || "—" },
                { label: "联系电话", value: detail.contactPhone || "—" },
                { label: "执业许可证", value: detail.licenseNo || "—" },
                {
                  label: "分成比例",
                  value: detail.commissionPercent > 0 ? `${detail.commissionPercent}%` : "按店铺默认",
                },
                { label: "医护数", value: detail.practitionerCount },
                {
                  label: "审核状态",
                  value: <StatusTag meta={meta} kind="auditStatuses" value={detail.auditStatus} />,
                },
                { label: "审核意见", value: detail.auditReason || "—" },
                { label: "审核时间", value: detail.auditAt ? fmtTime(detail.auditAt) : "—" },
                { label: "创建时间", value: detail.createdAt ? fmtTime(detail.createdAt) : "—" },
              ]}
            />
            <div>
              <div className="muted text-12">资质图</div>
              {detail.licenseImages?.length ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {detail.licenseImages.map((url) => (
                    <Image
                      key={url}
                      src={url}
                      alt="机构资质图"
                      width={96}
                      height={96}
                      style={{ objectFit: "cover", borderRadius: 8 }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>—</div>
              )}
            </div>
            <div>
              <div className="muted text-12">机构简介</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{detail.intro || "—"}</div>
            </div>
            <div className="muted text-12">
              审核通过后小程序端展示该机构；下架删除会解除医护归属，历史订单与档案不受影响。
            </div>
          </div>
        ) : null}
      </Drawer>

      <OrganModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void load()}
      />

      <OrganAuditModal
        shopId={shopId}
        row={auditing}
        onClose={() => setAuditing(null)}
        onDone={() => void load()}
      />
    </Panel>
  );
}

type OrganFormValues = {
  name: string;
  kind: string;
  city: string;
  address: string;
  contactName: string;
  contactPhone: string;
  licenseNo: string;
  licenseImages: string;
  commissionPercent: number;
  intro: string;
};

function OrganModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: OrganDetail | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<OrganFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        name: "",
        kind: "CLINIC",
        city: "",
        address: "",
        contactName: "",
        contactPhone: "",
        licenseNo: "",
        licenseImages: "",
        commissionPercent: 0,
        intro: "",
      });
      return;
    }
    form.setFieldsValue({
      name: row.name,
      kind: row.kind,
      city: row.city,
      address: row.address,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      licenseNo: row.licenseNo,
      licenseImages: (row.licenseImages ?? []).join("\n"),
      commissionPercent: row.commissionPercent,
      intro: row.intro ?? "",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.organSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          kind: values.kind as HealthOrganKind,
          city: values.city ?? "",
          address: values.address ?? "",
          contactName: values.contactName ?? "",
          contactPhone: values.contactPhone ?? "",
          licenseNo: values.licenseNo ?? "",
          licenseImages: parseImages(values.licenseImages),
          commissionPercent: Number(values.commissionPercent ?? 0),
          intro: values.intro ?? "",
        },
      });
      message.success("机构已保存并标记为已核验");
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
      title={row ? `编辑 ${row.name}` : "新增机构"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={680}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="机构名称"
            rules={[{ required: true, message: "请填写机构名称" }]}
          >
            <Input maxLength={120} placeholder="如 某某综合门诊部" />
          </Form.Item>
          <Form.Item name="kind" label="机构类型" rules={[{ required: true, message: "请选择机构类型" }]}>
            <Select
              options={HEALTH_ORGAN_KINDS.map((item) => ({ value: item, label: kindLabel(item) }))}
            />
          </Form.Item>
          <Form.Item name="city" label="所在城市">
            <Input maxLength={60} placeholder="如 杭州" />
          </Form.Item>
          <Form.Item name="address" label="详细地址">
            <Input maxLength={200} placeholder="门店/院区地址，小程序端展示" />
          </Form.Item>
          <Form.Item name="contactName" label="联系人">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input maxLength={32} placeholder="签约与售后对接人电话" />
          </Form.Item>
          <Form.Item name="licenseNo" label="执业许可证号">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="commissionPercent"
            label="分成比例"
            extra="0 表示按店铺默认分成"
          >
            <InputNumber min={0} max={100} precision={0} suffix="%" style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          name="licenseImages"
          label="资质图"
          extra="每行一个图片地址，也可用逗号分隔，最多 9 张；留空会清空已存资质图"
        >
          <Input.TextArea rows={3} placeholder="https://.../license-1.jpg" />
        </Form.Item>
        <Form.Item name="intro" label="机构简介">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="科室设置、设备与特色服务" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

type AuditFormValues = { approved: boolean; reason: string };

function OrganAuditModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthOrganRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AuditFormValues>();
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
      await healthApi.organAudit({
        body: {
          shopId,
          id: row.id,
          approved: Boolean(values.approved),
          reason: values.approved ? "" : String(values.reason || ""),
        },
      });
      message.success(values.approved ? "机构已审核通过" : "机构审核已驳回");
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
      title={row ? `审核机构 · ${row.name}` : "审核机构"}
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
              { value: true, label: "通过（小程序端展示）" },
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
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：执业许可证模糊，请重新上传" />
            </Form.Item>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ApplicationLedger({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<HealthApplicationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const result = await healthApi.applications({
        query: { shopId, page, pageSize: PAGE_SIZE },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [shopId, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<HealthApplicationRow> = [
    {
      title: "申请对象",
      dataIndex: "kind",
      width: 100,
      render: (value: string) => APPLICATION_KIND_LABELS[value] || value,
    },
    { title: "对象编号", dataIndex: "targetId", width: 100 },
    { title: "名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "联系电话", dataIndex: "phone", width: 130, render: (value: string) => value || "—" },
    { title: "城市", dataIndex: "city", width: 100, render: (value: string) => value || "—" },
    {
      title: "提交时间",
      dataIndex: "submitAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    { title: "审核意见", dataIndex: "auditReason", render: (value: string) => value || "—" },
  ];

  return (
    <Panel
      title="入驻申请"
      titleExtra={
        <span className="muted text-12">顾客/医护在小程序端提交的入驻资料台账，只读；处置在「机构」页签完成</span>
      }
      extra={
        <Button size="small" onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      }
    >
      {rows.length || loading ? (
        <DataTable
          rows={rows}
          columns={columns}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1120 }}
          expandable={{
            rowExpandable: (row) =>
              (row.materials?.length ?? 0) > 0 || Object.keys(row.extras ?? {}).length > 0,
            expandedRowRender: (row) => (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div className="muted text-12">资质材料</div>
                  <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(row.materials ?? [], null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="muted text-12">补充信息</div>
                  <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(row.extras ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ),
          }}
        />
      ) : (
        <EmptyState text="还没有入驻申请：顾客或医护在小程序端提交资料后会出现在这里。" />
      )}
    </Panel>
  );
}
