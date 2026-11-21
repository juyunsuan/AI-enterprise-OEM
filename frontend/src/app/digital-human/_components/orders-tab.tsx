"use client";

// 订单页签：小程序端微信支付订单台账，已支付订单可退款（自动回收资产与佣金）。
import { SearchOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  DH_ORDER_STATUS_LABELS,
  DH_PACKAGE_TYPES,
  DH_PACKAGE_TYPE_LABELS,
  type DhOrderRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList, yuan } from "./shared";

type OrderStatus = "" | "0" | "1" | "2" | "3";
type PackageType = "" | (typeof DH_PACKAGE_TYPES)[number];

export function OrdersTab() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<OrderStatus>("");
  const [type, setType] = useState<PackageType>("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [refund, setRefund] = useState<{ row: DhOrderRow; reason: string } | null>(null);
  const [refunding, setRefunding] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.orders({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(status ? { status: Number(status) } : {}),
          ...(type ? { type } : {}),
          ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
        },
      }),
    [status, type, appliedKeyword],
  );
  const list = usePagedList<DhOrderRow>(fetcher);

  const submitRefund = async () => {
    if (!refund) return;
    setRefunding(true);
    try {
      const result = await digitalHumanApi.refundOrder({
        body: { id: refund.row.id, reason: refund.reason.trim() || "站点方退款" },
      });
      if (result?.ok) message.success(result.message || "已退款");
      else message.warning(result?.message || "退款未完成");
      setRefund(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款失败");
    } finally {
      setRefunding(false);
    }
  };

  const columns: ColumnsType<DhOrderRow> = [
    {
      title: "订单",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span className="mono text-12">{row.orderNo}</span>
          <span className="muted text-12">{row.nickname || "微信用户"}</span>
        </Space>
      ),
    },
    {
      title: "套餐",
      width: 180,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{row.packageName || `#${row.packageId}`}</span>
          <span className="muted text-12">
            {DH_PACKAGE_TYPE_LABELS[row.type] || row.type}
          </span>
        </Space>
      ),
    },
    { title: "金额", dataIndex: "amountCents", width: 100, render: (value: number) => yuan(value) },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Tag color={row.status === 1 ? "green" : row.status === 2 ? "orange" : "default"}>
          {DH_ORDER_STATUS_LABELS[String(row.status)] || row.status}
        </Tag>
      ),
    },
    {
      title: "分佣",
      width: 140,
      render: (_, row) =>
        row.commission1Cents || row.commission2Cents ? (
          <span className="text-12">
            一级 {yuan(row.commission1Cents)} · 二级 {yuan(row.commission2Cents)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "支付时间",
      dataIndex: "paidAt",
      width: 150,
      render: (value: string | null) => (
        <span className="text-12 muted">{value ? fmtTime(value) : "—"}</span>
      ),
    },
    {
      title: "操作",
      width: 90,
      render: (_, row) =>
        row.status === 1 ? (
          <Button
            size="small"
            danger
            onClick={() => setRefund({ row, reason: "" })}
          >
            退款
          </Button>
        ) : (
          <span className="muted text-12">—</span>
        ),
    },
  ];

  return (
    <Panel
      title="订单台账"
      extra={
        <Space wrap>
          <Input
            allowClear
            placeholder="订单号/会员"
            prefix={<SearchOutlined />}
            value={keyword}
            style={{ width: 170 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setAppliedKeyword(keyword.trim());
              list.setPage(1);
            }}
          />
          <Select
            value={type}
            style={{ width: 140 }}
            options={[
              { value: "", label: "全部类型" },
              ...DH_PACKAGE_TYPES.map((value) => ({
                value,
                label: DH_PACKAGE_TYPE_LABELS[value],
              })),
            ]}
            onChange={(value: PackageType) => {
              setType(value);
              list.setPage(1);
            }}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            options={[
              { value: "", label: "全部状态" },
              { value: "0", label: "未支付" },
              { value: "1", label: "已支付" },
              { value: "2", label: "已退款" },
              { value: "3", label: "已关闭" },
            ]}
            onChange={(value: OrderStatus) => {
              setStatus(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      <Notice variant="info">
        资金进的是站点自己的微信商户号，平台不经手。退款会调微信退款接口，成功后自动回收本次发放的会员天数与点数，并按比例扣回两级佣金。
      </Notice>
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有订单。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
          style={{ marginTop: 12 }}
        />
      )}

      <Modal
        open={Boolean(refund)}
        title="订单退款"
        okText="确认退款"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={refunding}
        onOk={() => void submitRefund()}
        onCancel={() => setRefund(null)}
      >
        {refund ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <span className="text-12 muted">
              {refund.row.orderNo} · {refund.row.packageName} · {yuan(refund.row.amountCents)}
            </span>
            <label>
              退款原因
              <Input
                value={refund.reason}
                maxLength={200}
                placeholder="站点方退款"
                onChange={(event) => setRefund({ ...refund, reason: event.target.value })}
              />
            </label>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}
