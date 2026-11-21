"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
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
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import {
  HEALTH_AUDIT_STATUSES,
  HEALTH_AUDIT_STATUS_LABELS,
  HEALTH_COUPON_KINDS,
  HEALTH_COUPON_KIND_LABELS,
  HEALTH_MEMBER_GRANT_STATUSES,
  HEALTH_MEMBER_GRANT_STATUS_LABELS,
  HEALTH_ORDER_BIZ_TYPES,
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  type HealthCouponRow,
  type HealthCouponTicketRow,
  type HealthMemberCardRow,
  type HealthMemberGrantRow,
  type HealthMemberLevelRow,
  type HealthPointLogRow,
  type HealthPointRuleRow,
  type HealthPosterRow,
  type HealthPromoteLogRow,
  type HealthPromoterRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  cny,
  DataTable,
  FilterBar,
  LoadError,
  OnOffTag,
  onOffLabel,
  StatusTag,
  useHealthResource,
} from "./health-common";

/**
 * 会员、券、积分与推广：等级与会员卡、券模板与领券记录、积分规则与流水、推客与海报。
 * 可执行的动作严格对齐 `health.marketing.service.ts` 与 `health.promoter.service.ts`；
 * 积分规则后端没有删除接口，停用即下线；积分流水的时间筛选只过滤当前页。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 200;

const yuanToCents = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100));
const centsToYuan = (value: unknown) => Number(value ?? 0) / 100;

/** 发放来源与积分场景是后端写入的短枚举，界面只给中文口径。 */
const GRANT_SOURCE_LABELS: Record<string, string> = {
  ADMIN: "店主发放",
  ORDER: "购卡订单",
};
const POINT_SCENE_LABELS: Record<string, string> = {
  ADMIN: "店主调整",
  ORDER: "订单",
};

const STATUS_OPTIONS = (["ON", "OFF"] as const).map((value) => ({
  value,
  label: onOffLabel(value),
}));

const COUPON_KIND_OPTIONS = HEALTH_COUPON_KINDS.map((value) => ({
  value,
  label: HEALTH_COUPON_KIND_LABELS[value] ?? value,
}));

const BIZ_TYPE_OPTIONS = HEALTH_ORDER_BIZ_TYPES.map((value) => ({
  value,
  label: HEALTH_ORDER_BIZ_TYPE_LABELS[value] ?? value,
}));

/** 领券状态契约没给字典，页内自带。 */
const TICKET_STATUS_LABELS: Record<string, string> = {
  UNUSED: "未使用",
  USED: "已使用",
  EXPIRED: "已过期",
};
const TICKET_TONE: Record<string, string> = { UNUSED: "green", USED: "blue", EXPIRED: "default" };
const TICKET_STATUS_OPTIONS = Object.keys(TICKET_STATUS_LABELS).map((value) => ({
  value,
  label: TICKET_STATUS_LABELS[value],
}));

const GRANT_STATUS_OPTIONS = HEALTH_MEMBER_GRANT_STATUSES.map((value) => ({
  value,
  label: HEALTH_MEMBER_GRANT_STATUS_LABELS[value] ?? value,
}));
const GRANT_TONE: Record<string, string> = {
  UNUSED: "gold",
  BINDING: "green",
  USED_UP: "blue",
  EXPIRED: "default",
  REVOKED: "red",
};

const PROMOTER_STATUS_OPTIONS = HEALTH_AUDIT_STATUSES.map((value) => ({
  value,
  label: HEALTH_AUDIT_STATUS_LABELS[value] ?? value,
}));

const POSTER_TARGET_OPTIONS = [
  { value: "SHOP", label: "店铺首页" },
  { value: "SERVICE", label: "服务项目" },
  { value: "GOODS", label: "商品" },
  { value: "EXAM", label: "体检套餐" },
  { value: "SIGN_PKG", label: "签约服务包" },
  { value: "ARTICLE", label: "科普文章" },
];

const posterTargetText = (value: string) =>
  POSTER_TARGET_OPTIONS.find((item) => item.value === value)?.label ?? value;

/** 顾客下拉：发放会员卡、按顾客筛选流水与券共用。 */
function useCustomerOptions(shopId: number, enabled = true) {
  const resource = useHealthResource(
    () => healthApi.customers({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    enabled && shopId > 0,
  );
  const rows = resource.data?.list ?? [];
  return {
    options: rows.map((row) => ({
      value: row.id,
      label: row.nickname
        ? `${row.nickname}（${row.phone || `#${row.id}`}）`
        : row.phone || `顾客${row.id}`,
    })),
  };
}

export function MarketingTab() {
  const shopId = useHealthShopId();
  const [panel, setPanel] = useState("member");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "member", label: "会员卡", children: <MemberPanel shopId={shopId} /> },
        { key: "coupon", label: "优惠券", children: <CouponPanel shopId={shopId} /> },
        { key: "point", label: "积分", children: <PointPanel shopId={shopId} /> },
        { key: "promote", label: "推广", children: <PromotePanel shopId={shopId} /> },
      ]}
    />
  );
}

// ============================================================================
// 会员卡
// ============================================================================

function MemberPanel({ shopId }: { shopId: number }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <LevelsPanel shopId={shopId} />
      <CardsPanel shopId={shopId} />
      <GrantsPanel shopId={shopId} />
    </div>
  );
}

function LevelsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthMemberLevelRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.memberLevels({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthMemberLevelRow) => {
    setBusy(true);
    try {
      await healthApi.memberLevelRemove({ body: { shopId, id: row.id } });
      message.success("会员等级已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMemberLevelRow> = [
    {
      title: "等级名称",
      dataIndex: "name",
      width: 180,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "达标累计消费",
      dataIndex: "reachCents",
      width: 150,
      render: (value: number) => (value > 0 ? cny(value) : "手动指定"),
    },
    {
      title: "结算折扣",
      dataIndex: "discountPercent",
      width: 110,
      render: (value: number) => (value >= 100 ? "不打折" : `${value}%`),
    },
    {
      title: "积分倍率",
      dataIndex: "pointRatePercent",
      width: 110,
      render: (value: number) => `${value}%`,
    },
    {
      title: "权益",
      dataIndex: "benefits",
      width: 280,
      ellipsis: true,
      render: (value: string[]) => (value.length ? value.join("、") : "—"),
    },
    { title: "会员数", dataIndex: "memberCount", width: 90 },
    { title: "排序", dataIndex: "sort", width: 80 },
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
            title="删除后已归入该等级的顾客失去等级权益。"
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
      title="会员等级"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={
        <span className="muted text-12">按累计消费自动升级，也可在顾客详情里手动指定</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增等级
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthMemberLevelRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 1240 }}
      />

      <LevelModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type LevelFormValues = {
  name: string;
  reachYuan: number;
  discountPercent: number;
  pointRatePercent: number;
  benefits: string[];
  sort: number;
  status: string;
};

function LevelModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthMemberLevelRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<LevelFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      reachYuan: centsToYuan(row?.reachCents),
      discountPercent: row?.discountPercent ?? 100,
      pointRatePercent: row?.pointRatePercent ?? 100,
      benefits: row?.benefits ?? [],
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.memberLevelSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          reachCents: yuanToCents(values.reachYuan),
          discountPercent: Number(values.discountPercent ?? 100),
          pointRatePercent: Number(values.pointRatePercent ?? 100),
          benefits: (values.benefits ?? [])
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .slice(0, 20),
          sort: Number(values.sort ?? 0),
          status: (values.status ?? "ON") as HealthMemberLevelRow["status"],
        },
      });
      message.success(row ? "会员等级已保存" : "会员等级已创建");
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
      title={row ? `编辑等级「${row.name}」` : "新增会员等级"}
      width={620}
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
            label="等级名称"
            rules={[{ required: true, message: "请填写等级名称" }]}
          >
            <Input maxLength={40} placeholder="如 黄金会员" />
          </Form.Item>
          <Form.Item name="reachYuan" label="达标累计消费（元）" extra="0 表示只手动指定">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="discountPercent" label="结算折扣（%）" extra="100 表示不打折，95 即 95% 结算">
            <InputNumber min={1} max={100} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="pointRatePercent" label="积分倍率（%）" extra="100 表示按基础积分发放">
            <InputNumber min={0} max={500} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="sort" label="排序值" extra="越小越靠前">
            <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item label="权益说明" extra="每条一句话，最多 20 条，小程序端会员页展示">
          <Form.List name="benefits">
            {(fields, { add, remove }) => (
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline">
                    <Form.Item name={field.name} style={{ marginBottom: 0, width: 460 }}>
                      <Input maxLength={60} placeholder="如 每年一次免费体检" />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add("")}
                  disabled={fields.length >= 20}
                >
                  添加权益
                </Button>
              </div>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function CardsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthMemberCardRow | "new" | null>(null);
  const [granting, setGranting] = useState<HealthMemberCardRow | null>(null);
  const resource = useHealthResource(
    () => healthApi.memberCards({ query: { shopId, page, pageSize: PAGE_SIZE, keyword } }),
    [shopId, page, keyword],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];
  const cardOptions = rows.map((row) => ({
    value: row.id,
    label: `${row.name}（${cny(row.priceCents)}）`,
  }));

  const remove = async (row: HealthMemberCardRow) => {
    setBusy(true);
    try {
      await healthApi.memberCardRemove({ body: { shopId, id: row.id } });
      message.success("会员卡已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMemberCardRow> = [
    {
      title: "会员卡",
      dataIndex: "name",
      width: 240,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          <div className="muted text-12">{row.cover ? "已配封面" : "未配封面"}</div>
        </div>
      ),
    },
    { title: "售价", dataIndex: "priceCents", width: 110, render: (value: number) => cny(value) },
    {
      title: "划线价",
      dataIndex: "originPriceCents",
      width: 110,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "有效期",
      dataIndex: "validDays",
      width: 100,
      render: (value: number) => `${value} 天`,
    },
    {
      title: "权益",
      dataIndex: "benefits",
      width: 300,
      ellipsis: true,
      render: (value: HealthMemberCardRow["benefits"]) =>
        value.length
          ? value.map((item) => `${item.label}${item.quota > 0 ? `×${item.quota}` : ""}`).join("、")
          : "—",
    },
    { title: "已发放", dataIndex: "soldCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 230,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" onClick={() => setGranting(row)}>
            发放
          </Button>
          <Popconfirm
            title="删除后小程序端不再售卖，已发放的卡权益保留到到期。"
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
      title="会员卡"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">权益在发放时快照，后续改卡不影响已发的卡</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增会员卡
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">搜索</span>
          <Input.Search
            allowClear
            placeholder="会员卡名称"
            style={{ width: 200 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthMemberCardRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1270 }}
      />

      <CardModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />

      <GrantModal
        shopId={shopId}
        card={granting}
        cardOptions={cardOptions}
        onClose={() => setGranting(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type CardFormValues = {
  name: string;
  cover: string;
  priceYuan: number;
  originPriceYuan: number;
  validDays: number;
  intro: string;
  status: string;
  benefits: { key: string; label: string; quota: number; desc: string }[];
};

function CardModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthMemberCardRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CardFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      cover: row?.cover ?? "",
      priceYuan: centsToYuan(row?.priceCents),
      originPriceYuan: centsToYuan(row?.originPriceCents),
      validDays: row?.validDays ?? 365,
      intro: row?.intro ?? "",
      status: row?.status ?? "ON",
      benefits: (row?.benefits ?? []).map((item) => ({ ...item })),
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.memberCardSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          cover: values.cover ?? "",
          priceCents: yuanToCents(values.priceYuan),
          originPriceCents: yuanToCents(values.originPriceYuan),
          validDays: Number(values.validDays ?? 365),
          intro: values.intro ?? "",
          status: (values.status ?? "ON") as HealthMemberCardRow["status"],
          benefits: (values.benefits ?? []).map((item) => ({
            key: (item?.key ?? "").trim(),
            label: (item?.label ?? "").trim(),
            quota: Number(item?.quota ?? 0),
            desc: item?.desc ?? "",
          })),
        },
      });
      message.success(row ? "会员卡已保存" : "会员卡已创建");
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
      title={row ? `编辑会员卡「${row.name}」` : "新增会员卡"}
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
            label="会员卡名称"
            rules={[{ required: true, message: "请填写会员卡名称" }]}
          >
            <Input maxLength={80} placeholder="如 年度健康会员卡" />
          </Form.Item>
          <Form.Item name="cover" label="封面图地址">
            <Input maxLength={500} placeholder="https://…" />
          </Form.Item>
          <Form.Item name="priceYuan" label="售价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="originPriceYuan" label="划线价（元）" extra="0 表示不展示">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="validDays" label="有效期（天）">
            <InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item label="权益明细" extra="配额 0 表示不限次；发放时快照到顾客的卡">
          <Form.List name="benefits">
            {(fields, { add, remove }) => (
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" wrap>
                    <Form.Item
                      name={[field.name, "key"]}
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: "请填写权益键" }]}
                    >
                      <Input maxLength={40} placeholder="权益键 如 EXAM" style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "label"]}
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: "请填写权益名称" }]}
                    >
                      <Input maxLength={40} placeholder="权益名称" style={{ width: 170 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "quota"]} style={{ marginBottom: 0 }}>
                      <InputNumber min={0} max={99999} precision={0} placeholder="配额" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "desc"]} style={{ marginBottom: 0 }}>
                      <Input maxLength={200} placeholder="说明" style={{ width: 180 }} />
                    </Form.Item>
                    <Button type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ key: "", label: "", quota: 0, desc: "" })}
                  disabled={fields.length >= 20}
                >
                  添加权益
                </Button>
              </div>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item name="intro" label="会员卡说明">
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder="适用门店、使用规则与退改说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function GrantModal({
  shopId,
  card,
  cardOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  card: HealthMemberCardRow | null;
  cardOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    cardId: number;
    customerIds: number[];
    validDays: number;
    reason: string;
  }>();
  const [saving, setSaving] = useState(false);
  const open = Boolean(card);
  const customers = useCustomerOptions(shopId, open);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      cardId: card?.id ?? 0,
      customerIds: [],
      validDays: 0,
      reason: "",
    });
  }, [open, card, form]);

  if (!card) return null;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await healthApi.memberGrant({
        body: {
          shopId,
          cardId: Number(values.cardId ?? card.id),
          customerIds: (values.customerIds ?? []).map((id) => Number(id)),
          validDays: Number(values.validDays ?? 0),
          reason: values.reason ?? "",
        },
      });
      message.success(result?.message || `已发放 ${result?.granted ?? 0} 张`);
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发放失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`发放会员卡「${card.name}」`}
      width={620}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认发放"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="cardId"
          label="会员卡"
          rules={[{ required: true, message: "请选择会员卡" }]}
        >
          <Select options={cardOptions} placeholder="选择会员卡" />
        </Form.Item>
        <Form.Item
          name="customerIds"
          label="发放给顾客"
          extra="可多选，单次最多 200 人；列表可输入姓名或手机号搜索"
          rules={[{ required: true, message: "请选择至少一位顾客" }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            maxTagCount={6}
            placeholder="选择顾客"
            options={customers.options}
          />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="validDays" label="有效期天数" extra="0 表示按会员卡自身有效期">
            <InputNumber min={0} max={3650} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="发放备注">
            <Input maxLength={200} placeholder="如 门店活动赠送" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function GrantsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [customerId, setCustomerId] = useState(0);
  const [busy, setBusy] = useState(false);
  const customers = useCustomerOptions(shopId);
  const resource = useHealthResource(
    () =>
      healthApi.memberGrants({
        query: { shopId, page, pageSize: PAGE_SIZE, grantStatus: status, customerId },
      }),
    [shopId, page, status, customerId],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const revoke = async (row: HealthMemberGrantRow) => {
    setBusy(true);
    try {
      await healthApi.memberGrantRevoke({ body: { shopId, id: row.id, reason: "店主收回" } });
      message.success("会员卡已收回");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "收回失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthMemberGrantRow> = [
    { title: "会员卡", dataIndex: "cardName", width: 180 },
    { title: "顾客", dataIndex: "customerLabel", width: 170 },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => (
        <Tag color={GRANT_TONE[value] ?? "default"}>
          {HEALTH_MEMBER_GRANT_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "权益使用",
      dataIndex: "benefits",
      width: 280,
      render: (value: HealthMemberGrantRow["benefits"]) =>
        value.length
          ? value.map((item) => `${item.label} ${item.used}/${item.quota}`).join("、")
          : "—",
    },
    { title: "核销码", dataIndex: "verifyCode", width: 130, render: (value: string) => value || "—" },
    {
      title: "生效时间",
      dataIndex: "activatedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "到期时间",
      dataIndex: "expireAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    { title: "来源", dataIndex: "source", width: 100, render: (value: string) => GRANT_SOURCE_LABELS[value] ?? "其他" },
    {
      title: "操作",
      width: 100,
      fixed: "right",
      render: (_: unknown, row) =>
        row.status === "REVOKED" ? (
          <span className="muted text-12">已收回</span>
        ) : (
          <Popconfirm
            title="收回后该卡立即失效，已使用的权益不退还。"
            onConfirm={() => void revoke(row)}
          >
            <Button size="small" type="text" danger loading={busy}>
              收回
            </Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <Panel
      title="发放记录"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">卖出的卡与手工发放的卡都在这里，凭核销码到店使用</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">状态</span>
          <Select
            value={status}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...GRANT_STATUS_OPTIONS]}
          />
        </div>
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
            options={[{ value: 0, label: "全部顾客" }, ...customers.options]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthMemberGrantRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1380 }}
      />
    </Panel>
  );
}

// ============================================================================
// 优惠券
// ============================================================================

function CouponPanel({ shopId }: { shopId: number }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <CouponsPanel shopId={shopId} />
      <TicketsPanel shopId={shopId} />
    </div>
  );
}

function CouponsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthCouponRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.coupons({ query: { shopId, page, pageSize: PAGE_SIZE, keyword } }),
    [shopId, page, keyword],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthCouponRow) => {
    setBusy(true);
    try {
      await healthApi.couponRemove({ body: { shopId, id: row.id } });
      message.success("优惠券已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthCouponRow> = [
    {
      title: "券名称",
      dataIndex: "name",
      width: 200,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          <div className="muted text-12">
            {HEALTH_COUPON_KIND_LABELS[row.kind] ?? row.kind}
            {row.startFeeCents > 0 ? ` · 满 ${cny(row.startFeeCents)} 可用` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "优惠",
      dataIndex: "reduceCents",
      width: 140,
      render: (_: unknown, row) =>
        row.kind === "DISCOUNT"
          ? `${row.discountPercent}% 结算`
          : row.kind === "CASH"
            ? `抵 ${cny(row.reduceCents)}`
            : `减 ${cny(row.reduceCents)}`,
    },
    {
      title: "适用业务",
      dataIndex: "bizTypes",
      width: 220,
      ellipsis: true,
      render: (value: HealthCouponRow["bizTypes"]) =>
        value.length
          ? value.map((item) => HEALTH_ORDER_BIZ_TYPE_LABELS[item] ?? item).join("、")
          : "全部业务",
    },
    {
      title: "发行/领取/使用",
      dataIndex: "totalCount",
      width: 150,
      render: (_: unknown, row) => `${row.totalCount} / ${row.takenCount} / ${row.usedCount}`,
    },
    {
      title: "限领",
      dataIndex: "perCustomerLimit",
      width: 90,
      render: (value: number) => `${value} 张/人`,
    },
    {
      title: "有效期",
      dataIndex: "validDays",
      width: 200,
      render: (_: unknown, row) =>
        row.validStart || row.validEnd
          ? `${row.validStart ? fmtTime(row.validStart).slice(0, 10) : "不限"} 至 ${
              row.validEnd ? fmtTime(row.validEnd).slice(0, 10) : "不限"
            }`
          : row.validDays > 0
            ? `领取后 ${row.validDays} 天`
            : "长期有效",
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
            title="删除后已领未用的券按原记录继续可用，新顾客不能再领。"
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
      title="券模板"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">停用后不能再领，已领的券到期前仍可使用</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增优惠券
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">搜索</span>
          <Input.Search
            allowClear
            placeholder="券名称"
            style={{ width: 200 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthCouponRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1440 }}
      />

      <CouponModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type CouponFormValues = {
  name: string;
  kind: string;
  reduceYuan: number;
  discountPercent: number;
  startFeeYuan: number;
  totalCount: number;
  perCustomerLimit: number;
  validDays: number;
  validStartDay?: Dayjs;
  validEndDay?: Dayjs;
  bizTypes: string[];
  goodsIdsText: string;
  status: string;
};

function CouponModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthCouponRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CouponFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      kind: row?.kind ?? "FULL_REDUCE",
      reduceYuan: centsToYuan(row?.reduceCents),
      discountPercent: row?.discountPercent ?? 100,
      startFeeYuan: centsToYuan(row?.startFeeCents),
      totalCount: row?.totalCount ?? 0,
      perCustomerLimit: row?.perCustomerLimit ?? 1,
      validDays: row?.validDays ?? 30,
      validStartDay: row?.validStart ? dayjs(row.validStart) : undefined,
      validEndDay: row?.validEnd ? dayjs(row.validEnd) : undefined,
      bizTypes: row?.bizTypes ?? [],
      goodsIdsText: (row?.goodsIds ?? []).join(","),
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.couponSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          kind: (values.kind ?? "FULL_REDUCE") as HealthCouponRow["kind"],
          reduceCents: yuanToCents(values.reduceYuan),
          discountPercent: Number(values.discountPercent ?? 100),
          startFeeCents: yuanToCents(values.startFeeYuan),
          totalCount: Number(values.totalCount ?? 0),
          perCustomerLimit: Number(values.perCustomerLimit ?? 1),
          validDays: Number(values.validDays ?? 0),
          validStart: values.validStartDay ? values.validStartDay.format("YYYY-MM-DD") : "",
          validEnd: values.validEndDay ? values.validEndDay.format("YYYY-MM-DD") : "",
          bizTypes: (values.bizTypes ?? []) as HealthCouponRow["bizTypes"],
          goodsIds: (values.goodsIdsText ?? "")
            .split(/[,，\s]+/)
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0)
            .slice(0, 200),
          status: (values.status ?? "ON") as HealthCouponRow["status"],
        },
      });
      message.success(row ? "优惠券已保存" : "优惠券已创建");
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
      title={row ? `编辑优惠券「${row.name}」` : "新增优惠券"}
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
            label="券名称"
            rules={[{ required: true, message: "请填写券名称" }]}
          >
            <Input maxLength={60} placeholder="如 满 99 减 20" />
          </Form.Item>
          <Form.Item name="kind" label="券类型">
            <Select options={COUPON_KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="reduceYuan" label="减免金额（元）" extra="折扣券忽略此项">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="discountPercent" label="折扣（%）" extra="仅折扣券生效，90 即按 90% 结算">
            <InputNumber min={1} max={99} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="startFeeYuan" label="使用门槛（元）" extra="0 表示无门槛">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="totalCount" label="发行量" extra="已领数量达到发行量后停止发放">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="perCustomerLimit" label="每人限领（张）">
            <InputNumber min={1} max={99} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="validDays" label="领取后有效天数" extra="填了起止时间时以后者为准">
            <InputNumber min={0} max={3650} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="validStartDay" label="生效日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="validEndDay" label="失效日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Form.Item name="bizTypes" label="适用业务" extra="不选表示全部业务可用">
          <Select mode="multiple" allowClear placeholder="全部业务" options={BIZ_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="goodsIdsText"
          label="指定商品编号"
          extra="逗号分隔；指定商品券必填，其余券留空"
        >
          <Input maxLength={2000} placeholder="如 12,34,56" />
        </Form.Item>
        <Form.Item name="status" label="启用状态">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TicketsPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [couponId, setCouponId] = useState(0);
  const [status, setStatus] = useState("all");
  const coupons = useHealthResource(
    () => healthApi.coupons({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const couponOptions = (coupons.data?.list ?? []).map((row) => ({
    value: row.id,
    label: row.name,
  }));
  const resource = useHealthResource(
    () =>
      healthApi.couponTickets({
        query: { shopId, page, pageSize: PAGE_SIZE, couponId, ticketStatus: status },
      }),
    [shopId, page, couponId, status],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const columns: ColumnsType<HealthCouponTicketRow> = [
    { title: "券名称", dataIndex: "couponName", width: 200 },
    { title: "顾客", dataIndex: "customerLabel", width: 170 },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => (
        <Tag color={TICKET_TONE[value] ?? "default"}>{TICKET_STATUS_LABELS[value] ?? value}</Tag>
      ),
    },
    { title: "券码", dataIndex: "code", width: 150, render: (value: string) => value || "—" },
    {
      title: "领取时间",
      dataIndex: "receivedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "使用时间",
      dataIndex: "usedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "有效期至",
      dataIndex: "expireAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "关联订单",
      dataIndex: "orderId",
      width: 110,
      render: (value: number) => (value > 0 ? `#${value}` : "—"),
    },
  ];

  return (
    <Panel
      title="领券记录"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">按券或状态筛选，过期券不再参与结算</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">优惠券</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={couponId}
            style={{ width: 220 }}
            onChange={(value: number) => {
              setCouponId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部券" }, ...couponOptions]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">使用状态</span>
          <Select
            value={status}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...TICKET_STATUS_OPTIONS]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthCouponTicketRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1220 }}
      />
    </Panel>
  );
}

// ============================================================================
// 积分
// ============================================================================

function PointPanel({ shopId }: { shopId: number }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PointRulesPanel shopId={shopId} />
      <PointLogsPanel shopId={shopId} />
    </div>
  );
}

function PointRulesPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthPointRuleRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.pointRules({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const toggleStatus = async (row: HealthPointRuleRow) => {
    const next = row.status === "ON" ? "OFF" : "ON";
    setBusy(true);
    try {
      await healthApi.pointRuleSave({
        body: {
          shopId,
          id: row.id,
          action: row.action,
          label: row.label,
          pointValue: row.pointValue,
          dailyLimit: row.dailyLimit,
          status: next,
        },
      });
      message.success(next === "ON" ? "积分规则已启用" : "积分规则已停用");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthPointRuleRow> = [
    {
      title: "场景",
      dataIndex: "label",
      width: 220,
      render: (value: string, row) => (
        <div>
          <strong>{value || row.action}</strong>
          <div className="muted text-12">{row.action}</div>
        </div>
      ),
    },
    {
      title: "积分值",
      dataIndex: "pointValue",
      width: 110,
      render: (value: number) => (value >= 0 ? `+${value}` : `${value}`),
    },
    {
      title: "每人每日上限",
      dataIndex: "dailyLimit",
      width: 140,
      render: (value: number) => (value > 0 ? `${value} 次` : "不限"),
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
          <Button size="small" type="text" loading={busy} onClick={() => void toggleStatus(row)}>
            {row.status === "ON" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="积分规则"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={
        <span className="muted text-12">同一场景只能有一条规则；后端未提供删除，停用即停止发放</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增规则
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthPointRuleRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 760 }}
      />

      <PointRuleModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type PointRuleFormValues = {
  action: string;
  label: string;
  pointValue: number;
  dailyLimit: number;
  status: string;
};

function PointRuleModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthPointRuleRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PointRuleFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      action: row?.action ?? "",
      label: row?.label ?? "",
      pointValue: row?.pointValue ?? 0,
      dailyLimit: row?.dailyLimit ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.pointRuleSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          action: values.action.trim(),
          label: values.label ?? "",
          pointValue: Number(values.pointValue ?? 0),
          dailyLimit: Number(values.dailyLimit ?? 0),
          status: (values.status ?? "ON") as HealthPointRuleRow["status"],
        },
      });
      message.success(row ? "积分规则已保存" : "积分规则已创建");
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
      title={row ? `编辑积分规则「${row.action}」` : "新增积分规则"}
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="action"
          label="场景编码"
          extra="后端记账用的唯一场景，如 ORDER_PAID / SIGN_IN"
          rules={[{ required: true, message: "请填写场景编码" }]}
        >
          <Input maxLength={40} placeholder="如 ORDER_PAID" />
        </Form.Item>
        <Form.Item name="label" label="场景名称" extra="小程序端展示用">
          <Input maxLength={60} placeholder="如 下单返积分" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="pointValue" label="积分值" extra="正数发放，负数扣减">
            <InputNumber min={-9999} max={9999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="dailyLimit" label="每人每日上限" extra="0 表示不限">
            <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="status" label="启用状态">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PointLogsPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState(0);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const customers = useCustomerOptions(shopId);
  const resource = useHealthResource(
    () =>
      healthApi.pointLogs({
        query: { shopId, page, pageSize: PAGE_SIZE, customerId },
      }),
    [shopId, page, customerId],
    shopId > 0,
  );
  const from = range?.[0]?.format("YYYY-MM-DD") ?? "";
  const to = range?.[1]?.format("YYYY-MM-DD") ?? "";
  // 后端流水接口只按顾客过滤，日期在前端过滤已加载的这一页。
  const rows = (resource.data?.list ?? []).filter((row) => {
    if (!range) return true;
    const day = String(row.createdAt ?? "").slice(0, 10);
    return day >= from && day <= to;
  });

  const columns: ColumnsType<HealthPointLogRow> = [
    { title: "顾客", dataIndex: "customerLabel", width: 180 },
    {
      title: "场景",
      dataIndex: "action",
      width: 160,
      render: (value: string) => POINT_SCENE_LABELS[value] ?? "其他",
    },
    {
      title: "变动",
      dataIndex: "pointValue",
      width: 100,
      render: (value: number) => (
        <span style={{ color: value < 0 ? "var(--danger, #cf1322)" : undefined }}>
          {value >= 0 ? `+${value}` : `${value}`}
        </span>
      ),
    },
    { title: "余额", dataIndex: "balance", width: 100 },
    {
      title: "关联单据",
      dataIndex: "refId",
      width: 130,
      render: (value: number, row) => (value > 0 ? `${row.refType || "单"} #${value}` : "—"),
    },
    {
      title: "备注",
      dataIndex: "note",
      width: 240,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Panel
      title="积分流水"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">手工调整会落一条 ADMIN 流水并同步顾客积分</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setAdjusting(true)}>
          手工调整
        </Button>
      }
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
            options={[{ value: 0, label: "全部顾客" }, ...customers.options]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">日期（仅当前页）</span>
          <DatePicker.RangePicker
            value={range}
            onChange={(value) => {
              setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
            }}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthPointLogRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1170 }}
      />

      <AdjustModal
        shopId={shopId}
        open={adjusting}
        onClose={() => setAdjusting(false)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

function AdjustModal({
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
  const [form] = Form.useForm<{ customerId: number; pointValue: number; note: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ customerId: 0, pointValue: 0, note: "" });
  }, [open, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.pointAdjust({
        body: {
          shopId,
          customerId: Number(values.customerId ?? 0),
          pointValue: Number(values.pointValue ?? 0),
          note: values.note ?? "",
        },
      });
      message.success("积分已调整");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "调整失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="手工调整积分"
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认调整"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="customerId"
          label="顾客编号"
          extra="顾客列表里的 id，可在「顾客与档案」查看"
          rules={[{ required: true, message: "请填写顾客编号" }]}
        >
          <InputNumber min={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="pointValue"
          label="变动积分"
          extra="正数增加，负数扣减；扣减后不能为负"
          rules={[{ required: true, message: "请填写变动积分" }]}
        >
          <InputNumber min={-999999} max={999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="note"
          label="调整原因"
          rules={[{ required: true, message: "请填写调整原因" }]}
        >
          <Input maxLength={200} placeholder="如 活动补偿" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 推广
// ============================================================================

function PromotePanel({ shopId }: { shopId: number }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PromotersPanel shopId={shopId} />
      <PromoteLogsPanel shopId={shopId} />
      <PostersPanel shopId={shopId} />
    </div>
  );
}

function PromotersPanel({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [auditing, setAuditing] = useState<HealthPromoterRow | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.promoters({
        query: { shopId, page, pageSize: PAGE_SIZE, auditStatus: status },
      }),
    [shopId, page, status],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const columns: ColumnsType<HealthPromoterRow> = [
    {
      title: "推客",
      dataIndex: "name",
      width: 180,
      render: (value: string, row) => (
        <div>
          <strong>{value || `顾客${row.customerId}`}</strong>
          <div className="muted text-12">{row.phoneMasked || "—"}</div>
        </div>
      ),
    },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 120,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "分佣比例",
      dataIndex: "ratePercent",
      width: 110,
      render: (value: number) => (value > 0 ? `${value}%` : "按店铺默认"),
    },
    { title: "绑定顾客", dataIndex: "bindCustomerCount", width: 100 },
    { title: "推广订单", dataIndex: "orderCount", width: 100 },
    {
      title: "累计收益",
      dataIndex: "earningCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    {
      title: "可结算",
      dataIndex: "settleableCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    {
      title: "审核备注",
      dataIndex: "auditReason",
      width: 200,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 110,
      fixed: "right",
      render: (_: unknown, row) =>
        row.auditStatus === "APPROVED" ? (
          <span className="muted text-12">已通过</span>
        ) : (
          <Button size="small" type="text" onClick={() => setAuditing(row)}>
            审核
          </Button>
        ),
    },
  ];

  return (
    <Panel
      title="推客"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">通过后按比例计佣，比例 0 表示跟随店铺默认；需在店铺设置里开启推客分销</span>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">审核状态</span>
          <Select
            value={status}
            style={{ width: 150 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...PROMOTER_STATUS_OPTIONS]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthPromoterRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1370 }}
      />

      <AuditModal
        shopId={shopId}
        row={auditing}
        onClose={() => setAuditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

function AuditModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthPromoterRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ approved: boolean; ratePercent: number; reason: string }>();
  const [saving, setSaving] = useState(false);
  const open = Boolean(row);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ approved: true, ratePercent: 0, reason: "" });
  }, [open, form]);

  if (!row) return null;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.promoterAudit({
        body: {
          shopId,
          id: row.id,
          approved: Boolean(values.approved),
          ratePercent: Number(values.ratePercent ?? 0),
          reason: values.reason ?? "",
        },
      });
      message.success(values.approved ? "推客已通过审核" : "推客申请已驳回");
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
      open={open}
      title={`审核推客「${row.name || `顾客${row.customerId}`}」`}
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交审核"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="approved" label="审核结论">
          <Select
            options={[
              { value: true, label: "通过" },
              { value: false, label: "驳回" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="ratePercent"
          label="个人分佣比例（%）"
          extra="0 表示按店铺默认比例，上限 50"
        >
          <InputNumber min={0} max={50} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="reason" label="审核备注" extra="驳回时请写明原因，推客端可见">
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="如 资质齐全，同意入驻" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PromoteLogsPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [promoterId, setPromoterId] = useState(0);
  const promoters = useHealthResource(
    () =>
      healthApi.promoters({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, auditStatus: "all" },
      }),
    [shopId],
    shopId > 0,
  );
  const promoterOptions = (promoters.data?.list ?? []).map((row) => ({
    value: row.id,
    label: row.name || `顾客${row.customerId}`,
  }));
  const resource = useHealthResource(
    () =>
      healthApi.promoteLogs({
        query: { shopId, page, pageSize: PAGE_SIZE, promoterId },
      }),
    [shopId, page, promoterId],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const columns: ColumnsType<HealthPromoteLogRow> = [
    { title: "推客", dataIndex: "promoterName", width: 160 },
    { title: "顾客", dataIndex: "customerLabel", width: 170 },
    {
      title: "推广对象",
      dataIndex: "targetName",
      width: 220,
      render: (value: string, row) =>
        value ? `${value}${row.targetType ? `（${row.targetType}）` : ""}` : `#${row.targetId}`,
    },
    {
      title: "关联订单",
      dataIndex: "orderId",
      width: 110,
      render: (value: number) => (value > 0 ? `#${value}` : "—"),
    },
    {
      title: "佣金",
      dataIndex: "commissionCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
  ];

  return (
    <Panel
      title="推广记录"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">按推客筛选，佣金随订单结算进入可结算余额</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">推客</span>
          <Select
            showSearch
            optionFilterProp="label"
            value={promoterId}
            style={{ width: 220 }}
            onChange={(value: number) => {
              setPromoterId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部推客" }, ...promoterOptions]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthPromoteLogRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 930 }}
      />
    </Panel>
  );
}

function PostersPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthPosterRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.posters({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthPosterRow) => {
    setBusy(true);
    try {
      await healthApi.posterRemove({ body: { shopId, id: row.id } });
      message.success("推广海报已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthPosterRow> = [
    {
      title: "海报名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "指向",
      dataIndex: "targetType",
      width: 190,
      render: (value: string, row) =>
        `${posterTargetText(value)}${row.targetId > 0 ? ` #${row.targetId}` : ""}`,
    },
    {
      title: "标题文案",
      dataIndex: "titleText",
      width: 220,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "二维码位置",
      dataIndex: "qrcodePosition",
      width: 170,
      render: (value: HealthPosterRow["qrcodePosition"]) =>
        `x ${value.x} / y ${value.y} / ${value.size}px`,
    },
    {
      title: "背景图",
      dataIndex: "background",
      width: 200,
      ellipsis: true,
      render: (value: string) => value || "—",
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
            title="删除后已分享的图片不受影响，只是不再能生成新图。"
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
      title="推广海报"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">海报模板用于推客与顾客分享，小程序端按位置贴二维码</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增海报
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthPosterRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 1230 }}
      />

      <PosterModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type PosterFormValues = {
  name: string;
  targetType: string;
  targetId: number;
  background: string;
  posX: number;
  posY: number;
  posSize: number;
  titleText: string;
  subtitleText: string;
  status: string;
};

function PosterModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthPosterRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PosterFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      targetType: row?.targetType ?? "SHOP",
      targetId: row?.targetId ?? 0,
      background: row?.background ?? "",
      posX: row?.qrcodePosition.x ?? 300,
      posY: row?.qrcodePosition.y ?? 1000,
      posSize: row?.qrcodePosition.size ?? 180,
      titleText: row?.titleText ?? "",
      subtitleText: row?.subtitleText ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.posterSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          targetType: (values.targetType ?? "SHOP") as HealthPosterRow["targetType"],
          targetId: Number(values.targetId ?? 0),
          background: values.background ?? "",
          qrcodePosition: {
            x: Number(values.posX ?? 0),
            y: Number(values.posY ?? 0),
            size: Number(values.posSize ?? 180),
          },
          titleText: values.titleText ?? "",
          subtitleText: values.subtitleText ?? "",
          status: (values.status ?? "ON") as HealthPosterRow["status"],
        },
      });
      message.success(row ? "推广海报已保存" : "推广海报已创建");
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
      title={row ? `编辑海报「${row.name}」` : "新增推广海报"}
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
            label="海报名称"
            rules={[{ required: true, message: "请填写海报名称" }]}
          >
            <Input maxLength={60} placeholder="如 首页分享图" />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="targetType" label="指向类型">
            <Select options={POSTER_TARGET_OPTIONS} />
          </Form.Item>
          <Form.Item name="targetId" label="指向对象编号" extra="店铺首页填 0，其余填对应业务 id">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Form.Item name="background" label="背景图地址">
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="posX" label="二维码 X（px）">
            <InputNumber min={0} max={2000} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="posY" label="二维码 Y（px）">
            <InputNumber min={0} max={4000} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="posSize" label="二维码边长（px）">
            <InputNumber min={60} max={800} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="titleText" label="主标题">
          <Input maxLength={60} placeholder="海报上的大字，可留空" />
        </Form.Item>
        <Form.Item name="subtitleText" label="副标题">
          <Input maxLength={120} placeholder="补充说明，可留空" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
