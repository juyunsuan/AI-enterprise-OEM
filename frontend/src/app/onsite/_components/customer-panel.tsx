"use client";
// 顾客页签：拉黑只挡小程序端再次下单，历史订单/评价/留资一律保留，随时可恢复。
import {
  ONSITE_CUSTOMER_STATUSES,
  type OnsiteCustomerRow,
} from "@enterprise/contracts";
import { Avatar, Button, Form, Input, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnsiteCustomerActions, useOnsiteCustomers } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, cents, statusText, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

type CustomerStatusFilter = "ALL" | (typeof ONSITE_CUSTOMER_STATUSES)[number];

// 显式标注选项值类型，Select 的 onChange 才能直接收窄回状态联合类型。
const STATUS_OPTIONS: { value: CustomerStatusFilter; label: string }[] = [
  { value: "ALL", label: "全部状态" },
  ...ONSITE_CUSTOMER_STATUSES.map((value) => ({
    value,
    label: statusText("customer", value),
  })),
];

export function CustomerPanel() {
  const { shopId } = useOnsiteScope();
  const router = useRouter();
  const actions = useOnsiteCustomerActions();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<CustomerStatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [blocking, setBlocking] = useState<OnsiteCustomerRow | null>(null);
  const [form] = Form.useForm<{ remark: string }>();

  const filter = useMemo(
    () => ({ keyword: keyword.trim(), status }),
    [keyword, status],
  );
  const query = useOnsiteCustomers({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const filtered = Boolean(keyword.trim() || status !== "ALL");

  const restore = async (row: OnsiteCustomerRow) => {
    await actions.setCustomerStatus.mutateAsync({
      params: { id: String(shopId) },
      body: { id: row.id, status: "ACTIVE", remark: "" },
    });
  };

  const block = async () => {
    if (!blocking) return;
    const values = await form.validateFields();
    await actions.setCustomerStatus.mutateAsync({
      params: { id: String(shopId) },
      body: { id: blocking.id, status: "BLOCKED", remark: values.remark.trim() },
    });
    setBlocking(null);
  };

  const columns: TableProps<OnsiteCustomerRow>["columns"] = [
    {
      title: "顾客",
      key: "profile",
      width: 220,
      render: (_, row) => (
        <Space align="center">
          <Avatar src={row.avatar || undefined}>
            {row.nickname.slice(0, 1) || "客"}
          </Avatar>
          <Space orientation="vertical" size={0}>
            <span>{row.nickname || `顾客 #${row.id}`}</span>
            <span className="muted text-12">{row.phone || "未绑手机号"}</span>
          </Space>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="customer" value={value} />,
    },
    { title: "累计单量", dataIndex: "orderCount", width: 100 },
    {
      title: "累计成交额",
      dataIndex: "paidAmountCents",
      width: 120,
      render: (value: number) => cents(value),
    },
    {
      title: "最近成交",
      dataIndex: "lastOrderAt",
      width: 150,
      render: (value: string) => (value ? timeText(value) : "—"),
    },
    {
      title: "最近登录",
      dataIndex: "lastLoginAt",
      width: 150,
      render: (value: string) => (value ? timeText(value) : "—"),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      fixed: "right",
      render: (_, row) =>
        row.status === "BLOCKED" ? (
          <Button
            size="small"
            type="link"
            loading={actions.setCustomerStatus.isPending}
            onClick={() => void restore(row)}
          >
            恢复
          </Button>
        ) : (
          <Button size="small" type="link" danger onClick={() => setBlocking(row)}>
            拉黑
          </Button>
        ),
    },
  ];

  return (
    <Panel title="顾客名单">
      <Notice variant="info">
        顾客扫小程序码进入本店即自动建档，与你的后台账号是两套数据。
        拉黑只挡 TA 之后在小程序下单，历史订单、评价与留资线索都保留，随时可恢复。
      </Notice>
      <FilterBar
        action={
          filtered ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setKeyword("");
                setStatus("ALL");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : null
        }
      >
        <Input
          allowClear
          style={{ width: 220 }}
          placeholder="昵称或手机号"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
        />
      </FilterBar>
      {!rows.length && !query.isFetching ? (
        filtered ? (
          <EmptyState
            text="没有符合条件的顾客，换个关键字或清除筛选试试。"
            action={
              <Button
                onClick={() => {
                  setKeyword("");
                  setStatus("ALL");
                  setPage(1);
                }}
              >
                清除筛选
              </Button>
            }
          />
        ) : (
          <EmptyState
            text="还没有顾客建档。顾客扫小程序码进店即自动出现在这里，先把小程序发出去才会有人来。"
            action={
              <Button
                type="primary"
                onClick={() => router.push(withShop("/onsite/publish", shopId))}
              >
                去发布小程序
              </Button>
            }
          />
        )
      ) : (
        <DataTable<OnsiteCustomerRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          scroll={{ x: 1200 }}
          onPage={setPage}
        />
      )}

      {blocking ? (
        <Modal
          open
          destroyOnHidden
          title={`拉黑「${blocking.nickname || `顾客 #${blocking.id}`}」`}
          okText="确认拉黑"
          okButtonProps={{ danger: true }}
          confirmLoading={actions.setCustomerStatus.isPending}
          onCancel={() => setBlocking(null)}
          onOk={() => void block()}
        >
          <Descriptions
            items={[
              { label: "手机号", value: blocking.phone || "未绑手机号" },
              { label: "累计单量", value: String(blocking.orderCount) },
              { label: "累计成交额", value: cents(blocking.paidAmountCents) },
            ]}
          />
          <div className="muted text-12" style={{ margin: "8px 0" }}>
            拉黑后该顾客在小程序端无法下单；历史订单与评价不动，随时可在本页「恢复」。
            原因会写入操作留痕，必填。
          </div>
          <Form form={form} layout="vertical" key={blocking.id}>
            <Form.Item
              name="remark"
              label="拉黑原因"
              rules={[{ required: true, whitespace: true, message: "请填写拉黑原因（进审计留痕）" }]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：恶意差评勒索、多次爽约占用排期" />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </Panel>
  );
}
