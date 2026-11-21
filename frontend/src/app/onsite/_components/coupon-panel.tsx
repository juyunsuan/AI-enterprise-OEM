"use client";
// 营销-券：券模板与领取/核销明细同页，发券按顾客 id 定向，不做群发。
import {
  ONSITE_COUPON_SCOPES,
  ONSITE_COUPON_TYPES,
  type OnsiteCouponRow,
  type OnsiteCouponTicketRow,
} from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteCouponActions,
  useOnsiteCouponTickets,
  useOnsiteCoupons,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, cents, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const TYPE_TEXT: Record<string, string> = {
  FULL_REDUCTION: "满减",
  DISCOUNT: "折扣",
  NEW_USER: "新客",
};
const SCOPE_TEXT: Record<string, string> = {
  ALL: "全场",
  CATEGORY: "指定分类",
  SERVICE: "指定服务",
};

type CouponForm = {
  name: string;
  type: string;
  scope: string;
  thresholdYuan: number;
  discountYuan: number;
  discountRate: number;
  totalQuantity: number;
  perLimit: number;
  newUserOnly: boolean;
  validEndAt: string;
};

export function CouponPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteCouponActions();
  const [page, setPage] = useState(1);
  const query = useOnsiteCoupons({ shopId }, {}, page);
  const rows = query.data?.list ?? [];
  const [editing, setEditing] = useState<OnsiteCouponRow | null>(null);
  const [form] = Form.useForm<CouponForm>();
  const [ticketsOf, setTicketsOf] = useState<OnsiteCouponRow | null>(null);

  const openEditor = (row?: OnsiteCouponRow) => {
    setEditing(row ?? ({} as OnsiteCouponRow));
    form.setFieldsValue(
      row
        ? {
            name: row.name,
            type: row.type,
            scope: row.scope,
            thresholdYuan: row.thresholdCents / 100,
            discountYuan: row.discountCents / 100,
            discountRate: row.discountRate,
            totalQuantity: row.totalQuantity,
            perLimit: row.perLimit,
            newUserOnly: row.newUserOnly,
            validEndAt: row.validEndAt ? row.validEndAt.slice(0, 10) : "",
          }
        : {
            name: "",
            type: "FULL_REDUCTION",
            scope: "ALL",
            thresholdYuan: 0,
            discountYuan: 0,
            discountRate: 90,
            totalQuantity: 0,
            perLimit: 1,
            newUserOnly: false,
            validEndAt: "",
          },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    await actions.saveCoupon.mutateAsync({
      params: { id: String(shopId) },
      body: {
        ...(editing?.id ? { id: editing.id } : {}),
        name: values.name.trim(),
        type: values.type as (typeof ONSITE_COUPON_TYPES)[number],
        scope: values.scope as (typeof ONSITE_COUPON_SCOPES)[number],
        scopeTargets: editing?.scopeTargets ?? [],
        thresholdCents: Math.round((values.thresholdYuan || 0) * 100),
        discountCents: Math.round((values.discountYuan || 0) * 100),
        discountRate: values.discountRate || 0,
        totalQuantity: values.totalQuantity || 0,
        perLimit: values.perLimit || 1,
        newUserOnly: values.newUserOnly,
        validStartAt: "",
        validEndAt: values.validEndAt ? `${values.validEndAt}T00:00:00` : "",
      },
    });
    setEditing(null);
  };

  const toggle = async (row: OnsiteCouponRow) => {
    await actions.setCouponStatus.mutateAsync({
      params: { id: String(shopId), couponId: String(row.id) },
      body: { status: row.status === "ON" ? "OFF" : "ON" },
    });
  };

  const columns: TableProps<OnsiteCouponRow>["columns"] = [
    { title: "名称", dataIndex: "name", width: 180 },
    {
      title: "类型",
      dataIndex: "type",
      width: 90,
      render: (value: string) => TYPE_TEXT[value] ?? value,
    },
    {
      title: "门槛 / 面额",
      key: "amount",
      width: 170,
      render: (_, row) => (
        <span>
          {row.thresholdCents ? `满 ${cents(row.thresholdCents)}` : "无门槛"}
          {row.type === "DISCOUNT"
            ? ` · ${row.discountRate / 10} 折`
            : ` · 减 ${cents(row.discountCents)}`}
        </span>
      ),
    },
    {
      title: "范围",
      dataIndex: "scope",
      width: 100,
      render: (value: string) => SCOPE_TEXT[value] ?? value,
    },
    {
      title: "发放 / 总量",
      key: "issued",
      width: 120,
      render: (_, row) =>
        `${row.issuedCount} / ${row.totalQuantity || "不限"}`,
    },
    { title: "每人限领", dataIndex: "perLimit", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag kind="coupon" value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 200,
      fixed: "right",
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => openEditor(row)}>
            编辑
          </Button>
          <Button size="small" type="link" onClick={() => setTicketsOf(row)}>
            明细
          </Button>
          <Button size="small" type="link" onClick={() => void toggle(row)}>
            {row.status === "ON" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="优惠券"
      extra={
        <Button type="primary" onClick={() => openEditor()}>
          新建券
        </Button>
      }
    >
      <Notice variant="info">
        券在顾客下单时抵扣服务与物料，不抵车费（车费是技师的路途补偿）。
        新客券只发给本店还没有已支付订单的顾客；领取上限与总量耗尽后自动不可领。
      </Notice>
      <FilterBar>
        <span className="muted text-12">券模板在后台维护，顾客在小程序「我的券」里领取或使用。</span>
      </FilterBar>
      {!rows.length && !query.isFetching ? (
        <EmptyState
          text="还没有券。先建一张满减券，再在小程序端引导顾客领取。"
          action={
            <Button type="primary" onClick={() => openEditor()}>
              新建券
            </Button>
          }
        />
      ) : (
        <DataTable<OnsiteCouponRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          scroll={{ x: 1100 }}
          onPage={setPage}
        />
      )}

      {editing ? (
        <Modal
          open
          destroyOnHidden
          title={editing.id ? "编辑券" : "新建券"}
          confirmLoading={actions.saveCoupon.isPending}
          onCancel={() => setEditing(null)}
          onOk={() => void save()}
        >
          <Form form={form} layout="vertical" key={editing.id ?? "new"}>
            <Form.Item name="name" label="券名称" rules={[{ required: true, whitespace: true, message: "请填写券名称" }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Space size={12} wrap>
              <Form.Item name="type" label="类型">
                <Select
                  style={{ width: 130 }}
                  options={Object.entries(TYPE_TEXT).map(([value, label]) => ({ value, label }))}
                />
              </Form.Item>
              <Form.Item name="scope" label="适用范围">
                <Select
                  style={{ width: 140 }}
                  options={Object.entries(SCOPE_TEXT).map(([value, label]) => ({ value, label }))}
                />
              </Form.Item>
              <Form.Item name="perLimit" label="每人限领">
                <InputNumber min={1} max={20} style={{ width: 100 }} />
              </Form.Item>
            </Space>
            <Space size={12} wrap>
              <Form.Item name="thresholdYuan" label="使用门槛（元）">
                <InputNumber min={0} step={1} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="discountYuan" label="抵扣金额（元）">
                <InputNumber min={0} step={1} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="discountRate" label="折扣率（90 = 9 折）">
                <InputNumber min={1} max={100} style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Space size={12} wrap>
              <Form.Item name="totalQuantity" label="发放总量（0 = 不限）">
                <InputNumber min={0} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="validEndAt" label="有效期至">
                <Input placeholder="2026-12-31" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="newUserOnly" label="仅新客" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
          </Form>
        </Modal>
      ) : null}

      {ticketsOf ? <TicketModal coupon={ticketsOf} onClose={() => setTicketsOf(null)} /> : null}
    </Panel>
  );
}

function TicketModal({
  coupon,
  onClose,
}: {
  coupon: OnsiteCouponRow;
  onClose: () => void;
}) {
  const { shopId } = useOnsiteScope();
  const [page, setPage] = useState(1);
  const query = useOnsiteCouponTickets({ shopId }, coupon.id, page);
  const rows = query.data?.list ?? [];
  const columns: TableProps<OnsiteCouponTicketRow>["columns"] = [
    { title: "券码", dataIndex: "code", width: 160 },
    { title: "顾客", dataIndex: "customerName", width: 140 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "领取时间", dataIndex: "createdAt", width: 160, render: (v: string) => timeText(v) },
    { title: "使用时间", dataIndex: "usedAt", width: 160, render: (v: string) => (v ? timeText(v) : "—") },
    { title: "过期时间", dataIndex: "expireAt", width: 160, render: (v: string) => (v ? timeText(v) : "—") },
  ];
  return (
    <Modal open destroyOnHidden width={860} title={`「${coupon.name}」领取明细`} footer={null} onCancel={onClose}>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="这张券还没有人领取。" />
      ) : (
        <DataTable<OnsiteCouponTicketRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}
    </Modal>
  );
}
