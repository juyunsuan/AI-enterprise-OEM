"use client";

import { App, Avatar, Button, Input, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { CardShopCustomer } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { useCardShopScope } from "./scope";

/** 顾客：微信登录过的买家台账；停用后不能再下单。 */
export function CustomerTab() {
  const { siteId } = useCardShopScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<CardShopCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.customerList({
        query: { siteId, keyword: keyword.trim() || undefined, page, pageSize },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "顾客读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: CardShopCustomer) => {
    try {
      await cardShopApi.customerStatus({ body: { siteId, id: row.id, status: !row.status } });
      message.success(row.status ? "已停用该顾客" : "已恢复该顾客");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const columns: ColumnsType<CardShopCustomer> = [
    {
      title: "顾客",
      dataIndex: "nickname",
      render: (_: string, row) => (
        <Space size={8}>
          <Avatar src={row.avatar || undefined} size={28}>
            {(row.nickname || "客").slice(0, 1)}
          </Avatar>
          <div style={{ display: "grid" }}>
            <span>{row.nickname || "微信用户"}</span>
            <span className="text-12 muted">{row.openid ? `openid ${row.openid.slice(0, 8)}…` : "—"}</span>
          </div>
        </Space>
      ),
    },
    { title: "下单", dataIndex: "orderCount", width: 90 },
    { title: "已付订单", dataIndex: "paidOrderCount", width: 100 },
    { title: "累计金额", dataIndex: "totalAmount", width: 120, render: (value: number) => moneyCny(value) },
    {
      title: "最近下单",
      dataIndex: "lastOrderAt",
      width: 160,
      render: (value: string | null) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: boolean) => (value ? <Tag color="green">正常</Tag> : <Tag>已停用</Tag>),
    },
    {
      title: "操作",
      width: 100,
      render: (_: unknown, row) => (
        <Button size="small" type="text" danger={row.status} onClick={() => void toggle(row)}>
          {row.status ? "停用" : "恢复"}
        </Button>
      ),
    },
  ];

  return (
    <Panel title="顾客" titleExtra={<span className="muted text-12">微信登录过本店的买家</span>}>
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="昵称 / openid"
          style={{ width: 220 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value);
          }}
        />
      </Space>
      {rows.length || loading ? (
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 位`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
        />
      ) : (
        <EmptyState text="还没有登录过的顾客；未登录买家也能匿名下单与查单" />
      )}
    </Panel>
  );
}
