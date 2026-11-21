"use client";

import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type {
  MpCoupon,
  MpCouponSaveBody,
  MpCouponScope,
  MpCouponType,
  MpCouponValidType,
} from "@enterprise/contracts";
import {
  MP_COUPON_SCOPE_LABELS,
  MP_COUPON_SCOPES,
  MP_COUPON_STATUS_LABELS,
  MP_COUPON_TYPE_LABELS,
  MP_COUPON_TYPES,
} from "@enterprise/contracts";
import { Notice, Panel } from "@/components/ui/panel";

export type MpCouponApiAdapter = {
  list: (query: {
    page: number;
    pageSize: number;
    status?: string;
    keyword?: string;
  }) => Promise<{ list: MpCoupon[]; total: number } | null>;
  save: (body: MpCouponSaveBody) => Promise<MpCoupon | null>;
  status: (body: { id: number; status: "ONLINE" | "OFFLINE" }) => Promise<MpCoupon | null>;
};

type CouponForm = {
  name: string;
  type: MpCouponType;
  value: number;
  threshold: number;
  totalCount: number;
  perLimit: number;
  validType: MpCouponValidType;
  startAt: Dayjs | null;
  endAt: Dayjs | null;
  validDays: number;
  scope: MpCouponScope;
  /** CATEGORY / PRODUCT 手工填写的编号串 */
  scopeText: string;
  /** SHOP 作用域从店铺列表多选，提交时并入 scopeIds */
  shopScopeIds: number[];
};

const FORM_DEFAULT: CouponForm = {
  name: "",
  type: "FULL_REDUCE",
  value: 5,
  threshold: 0,
  totalCount: 0,
  perLimit: 1,
  validType: "FIXED",
  startAt: null,
  endAt: null,
  validDays: 7,
  scope: "ALL",
  scopeText: "",
  shopScopeIds: [],
};

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "green",
  OFFLINE: "default",
  ENDED: "red",
};

/**
 * 券管理面板：市场方发平台券，商户发本店券（同一套 DTO，作用域不同）。
 *
 * 金额一律「元」，折扣按 1–10 折填写（8.5 = 8.5 折）；满减只作用于商品金额，
 * 跨商户父单券由后端按各店命中商品额分摊，前端不参与分摊计算。
 */
export function MpCouponPanel({
  title,
  api,
  shops = [],
  allowShopScope = false,
  scopeOptions = MP_COUPON_SCOPES,
  emptyHint,
}: {
  title: string;
  api: MpCouponApiAdapter;
  shops?: { id: number; name: string }[];
  allowShopScope?: boolean;
  scopeOptions?: readonly MpCouponScope[];
  emptyHint: string;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpCoupon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<MpCoupon | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.list({ page, pageSize, status, keyword });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "优惠券读取失败");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, status, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const changeStatus = async (row: MpCoupon, next: "ONLINE" | "OFFLINE") => {
    try {
      await api.status({ id: row.id, status: next });
      message.success(next === "ONLINE" ? "已恢复发放" : "已停止发放");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const columns: ColumnsType<MpCoupon> = [
    {
      title: "券名称",
      dataIndex: "name",
      render: (value, row) => (
        <Space size={6} wrap>
          <span>{value}</span>
          {row.issuerType === "MERCHANT" && row.shopName ? (
            <Tag>{row.shopName}</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: "优惠",
      width: 140,
      render: (_, row) =>
        row.type === "DISCOUNT"
          ? `${row.value} 折`
          : `减 ${row.value} 元`,
    },
    {
      title: "门槛",
      dataIndex: "threshold",
      width: 100,
      render: (value) => (value > 0 ? `满 ${value} 元` : "无门槛"),
    },
    {
      title: "领取/使用",
      width: 130,
      render: (_, row) => (
        <span>
          {row.receivedCount}
          {row.totalCount > 0 ? ` / ${row.totalCount}` : " / 不限"} · 用 {row.usedCount}
        </span>
      ),
    },
    {
      title: "有效期",
      width: 220,
      render: (_, row) =>
        row.validType === "DAYS"
          ? `领取后 ${row.validDays} 天`
          : `${row.startAt || "—"} 至 ${row.endAt || "—"}`,
    },
    {
      title: "作用域",
      width: 110,
      render: (_, row) => MP_COUPON_SCOPE_LABELS[row.scope] ?? row.scope,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value) => (
        <Tag color={STATUS_COLOR[value]}>{MP_COUPON_STATUS_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "操作",
      width: 190,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={row.status === "ENDED"}
            onClick={() => {
              setEditing(row);
              setOpen(true);
            }}
          >
            编辑
          </Button>
          {row.status === "ONLINE" ? (
            <Button size="small" onClick={() => void changeStatus(row, "OFFLINE")}>
              停发
            </Button>
          ) : row.status === "OFFLINE" ? (
            <Button size="small" type="primary" ghost onClick={() => void changeStatus(row, "ONLINE")}>
              恢复发放
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Panel
        title={title}
        titleExtra={
          <span className="muted text-12">
            满减只作用于商品金额；停发后已领到的券仍可使用至到期
          </span>
        }
        extra={
          <Space size={8}>
            <Select
              style={{ width: 120 }}
              value={status}
              options={[
                { value: "", label: "全部状态" },
                { value: "ONLINE", label: "发放中" },
                { value: "OFFLINE", label: "已停发" },
                { value: "ENDED", label: "已结束" },
              ]}
              onChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
            />
            <Input.Search
              allowClear
              placeholder="按名称搜索"
              style={{ width: 180 }}
              onSearch={(value) => {
                setPage(1);
                setKeyword(value.trim());
              }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
              新建券
            </Button>
          </Space>
        }
      >
        {error ? <Notice variant="error">{error}</Notice> : null}
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{ emptyText: <Empty description={emptyHint} /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size);
            },
          }}
        />
      </Panel>

      <CouponModal
        key={`${open ? "open" : "closed"}-${editing?.id ?? 0}`}
        open={open}
        editing={editing}
        shops={shops}
        allowShopScope={allowShopScope}
        scopeOptions={scopeOptions}
        saving={saving}
        onCancel={() => setOpen(false)}
        onSubmit={async (form) => {
          setSaving(true);
          try {
            await api.save({
              id: editing?.id ?? 0,
              name: form.name.trim(),
              type: form.type,
              value: form.value,
              threshold: form.threshold,
              totalCount: form.totalCount,
              perLimit: form.perLimit,
              validType: form.validType,
              startAt: form.startAt ? form.startAt.toISOString() : "",
              endAt: form.endAt ? form.endAt.toISOString() : "",
              validDays: form.validDays,
              scope: form.scope,
              scopeIds:
                form.scope === "SHOP"
                  ? form.shopScopeIds
                  : form.scopeText
                      .split(/[,，\s]+/)
                      .map((item) => Number(item))
                      .filter((item) => Number.isInteger(item) && item > 0),
            });
            message.success("已保存");
            setOpen(false);
            await load();
          } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
          } finally {
            setSaving(false);
          }
        }}
      />
    </>
  );
}

function CouponModal({
  open,
  editing,
  shops,
  allowShopScope,
  scopeOptions,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  editing: MpCoupon | null;
  shops: { id: number; name: string }[];
  allowShopScope: boolean;
  scopeOptions: readonly MpCouponScope[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: CouponForm) => void;
}) {
  const [form] = Form.useForm<CouponForm>();
  const [type, setType] = useState<MpCouponType>(editing?.type ?? "FULL_REDUCE");
  const [scope, setScope] = useState<MpCouponScope>(editing?.scope ?? "ALL");
  const [validType, setValidType] = useState<MpCouponValidType>(
    editing?.validType ?? "FIXED",
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      ...FORM_DEFAULT,
      name: editing?.name ?? "",
      type: editing?.type ?? "FULL_REDUCE",
      value: editing?.value ?? 5,
      threshold: editing?.threshold ?? 0,
      totalCount: editing?.totalCount ?? 0,
      perLimit: editing?.perLimit ?? 1,
      validType: editing?.validType ?? "FIXED",
      startAt: editing?.startAt ? dayjs(editing.startAt) : null,
      endAt: editing?.endAt ? dayjs(editing.endAt) : null,
      validDays: editing?.validDays ?? 7,
      scope: editing?.scope ?? "ALL",
      scopeText:
        editing && (editing.scope === "CATEGORY" || editing.scope === "PRODUCT")
          ? (editing.scopeIds ?? []).join(",")
          : "",
      shopScopeIds: editing?.scope === "SHOP" ? (editing.scopeIds ?? []) : [],
    });
    setType(editing?.type ?? "FULL_REDUCE");
    setScope(editing?.scope ?? "ALL");
    setValidType(editing?.validType ?? "FIXED");
  }, [open, editing, form]);

  const effectiveScopes = scopeOptions.filter(
    (item) => item !== "SHOP" || allowShopScope,
  );

  return (
    <Modal
      open={open}
      destroyOnHidden
      title={editing ? "编辑优惠券" : "新建优惠券"}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => void form.validateFields().then(onSubmit)}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="券名称"
          name="name"
          rules={[{ required: true, message: "请填写券名称" }]}
        >
          <Input maxLength={40} placeholder="如：满 100 减 10" />
        </Form.Item>
        <Space size={12} wrap>
          <Form.Item label="类型" name="type">
            <Select
              style={{ width: 120 }}
              options={MP_COUPON_TYPES.map((item) => ({
                value: item,
                label: MP_COUPON_TYPE_LABELS[item] ?? item,
              }))}
              onChange={(value) => setType(value)}
            />
          </Form.Item>
          <Form.Item
            label={type === "DISCOUNT" ? "折扣（1–10 折）" : "减免金额（元）"}
            name="value"
            rules={[{ required: true, message: "请填写优惠值" }]}
          >
            <InputNumber
              min={0.1}
              max={type === "DISCOUNT" ? 9.9 : 9_999_999}
              step={type === "DISCOUNT" ? 0.1 : 1}
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item label="使用门槛（元，0=无门槛）" name="threshold">
            <InputNumber min={0} style={{ width: 160 }} />
          </Form.Item>
        </Space>
        <Space size={12} wrap>
          <Form.Item label="发行总量（0=不限）" name="totalCount">
            <InputNumber min={0} max={1_000_000} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item label="每人限领" name="perLimit">
            <InputNumber min={1} max={100} style={{ width: 120 }} />
          </Form.Item>
        </Space>
        <Space size={12} wrap>
          <Form.Item label="有效期方式" name="validType">
            <Select
              style={{ width: 140 }}
              options={[
                { value: "FIXED", label: "固定起止时间" },
                { value: "DAYS", label: "领取后 N 天" },
              ]}
              onChange={(value) => setValidType(value)}
            />
          </Form.Item>
          {validType === "DAYS" ? (
            <Form.Item label="领取后有效天数" name="validDays">
              <InputNumber min={1} max={365} style={{ width: 130 }} />
            </Form.Item>
          ) : null}
        </Space>
        {validType === "FIXED" ? (
          <Space size={12} wrap>
            <Form.Item label="开始时间" name="startAt">
              <DatePicker showTime />
            </Form.Item>
            <Form.Item label="结束时间" name="endAt">
              <DatePicker showTime />
            </Form.Item>
          </Space>
        ) : null}
        <Form.Item label="适用范围" name="scope">
          <Select
            style={{ width: 180 }}
            options={effectiveScopes.map((item) => ({
              value: item,
              label: MP_COUPON_SCOPE_LABELS[item] ?? item,
            }))}
            onChange={(value) => setScope(value)}
          />
        </Form.Item>
        {scope === "SHOP" && allowShopScope ? (
          <Form.Item
            label="适用店铺"
            name="shopScopeIds"
            extra="至少选一家店铺"
            rules={[{ required: true, message: "请选择适用店铺" }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="选择店铺"
              options={shops.map((shop) => ({
                value: shop.id,
                label: shop.name,
              }))}
            />
          </Form.Item>
        ) : null}
        {scope === "CATEGORY" || scope === "PRODUCT" ? (
          <Form.Item
            label={scope === "CATEGORY" ? "类目编号" : "商品编号"}
            name="scopeText"
            extra="多个编号用逗号分隔"
            rules={[{ required: true, message: "请填写适用范围编号" }]}
          >
            <Input placeholder="如：12,18" />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
