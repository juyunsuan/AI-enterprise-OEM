"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Input, Table } from "antd";
import type { ErrandCustomer } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { cny } from "./common";

/** 小程序顾客台账：下单/消费/积分与停用。 */
export function CustomerTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await errandApi.customers({ query: { page, pageSize: 20, keyword } });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "顾客读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="顾客"
      titleExtra={
        <Input.Search
          size="small"
          allowClear
          placeholder="昵称 / openid"
          style={{ width: 220 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value);
          }}
        />
      }
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      <Table<ErrandCustomer>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        columns={[
          { title: "顾客", width: 140, render: (_, row) => row.nickname || `#${row.id}` },
          { title: "openid", dataIndex: "openid", ellipsis: true },
          { title: "订单", width: 80, dataIndex: "orderCount" },
          { title: "已支付", width: 80, dataIndex: "paidOrderCount" },
          { title: "累计金额", width: 110, render: (_, row) => cny(row.totalAmount) },
          { title: "积分", width: 90, dataIndex: "points" },
          { title: "状态", width: 80, render: (_, row) => (row.status ? "正常" : "已停用") },
          {
            title: "最近下单",
            width: 170,
            render: (_, row) => (row.lastOrderAt ? new Date(row.lastOrderAt).toLocaleString() : "—"),
          },
          {
            title: "操作",
            width: 100,
            render: (_, row) => (
              <Button
                size="small"
                danger={row.status}
                onClick={async () => {
                  try {
                    await errandApi.customerStatus({ body: { id: row.id, status: !row.status } });
                    await load();
                  } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "操作失败");
                  }
                }}
              >
                {row.status ? "停用" : "恢复"}
              </Button>
            ),
          },
        ]}
      />
    </Panel>
  );
}