"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Space, Table, Tag } from "antd";
import type { ParkOrder } from "@enterprise/contracts";
import { parkApi } from "@/api/park";

const colorOf = (status: ParkOrder["status"]) =>
  status === "PAID"
    ? "green"
    : status === "PENDING"
      ? "orange"
      : status === "REFUNDED"
        ? "red"
        : "default";

export function OrdersPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [list, setList] = useState<ParkOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const page = await parkApi.orders({
        query: {
          siteId,
          status: "",
          bizType: "",
          keyword: "",
          page: 1,
          pageSize: 100,
        },
      });
      setList(page?.list ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "订单读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (row: ParkOrder, action: "paid" | "refund" | "cancel") => {
    try {
      await parkApi.orderAction({ body: { id: row.id, action, note: "" } });
      message.success("已处理");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  return (
    <Table
      size="small"
      rowKey="id"
      loading={loading}
      pagination={false}
      dataSource={list}
      columns={[
        { title: "订单号", dataIndex: "orderNo" },
        { title: "类型", dataIndex: "bizLabel" },
        { title: "标题", dataIndex: "title" },
        {
          title: "金额",
          render: (_, row) => `¥${row.amount.toFixed(2)}`,
        },
        {
          title: "状态",
          render: (_, row) => (
            <Tag color={colorOf(row.status)}>{row.statusLabel}</Tag>
          ),
        },
        { title: "支付方式", dataIndex: "payMethod" },
        { title: "创建时间", dataIndex: "createdAt" },
        {
          title: "操作",
          render: (_, row) => (
            <Space>
              {row.status === "PENDING" ? (
                <>
                  <Button size="small" type="primary" onClick={() => void act(row, "paid")}>
                    标记收款
                  </Button>
                  <Button size="small" onClick={() => void act(row, "cancel")}>
                    取消
                  </Button>
                </>
              ) : null}
              {row.status === "PAID" ? (
                <Button size="small" danger onClick={() => void act(row, "refund")}>
                  退款
                </Button>
              ) : null}
            </Space>
          ),
        },
      ]}
    />
  );
}
