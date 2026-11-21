"use client";

import { App, Input, Popconfirm, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { KuaidiCustomer } from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { useKuaidiScope } from "./scope";

/** 顾客：微信登录过的买家台账，停用后该买家不能再下单。 */
export function CustomerTab() {
  const { siteId } = useKuaidiScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<KuaidiCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await kuaidiApi.customers({
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

  const toggle = async (row: KuaidiCustomer) => {
    setBusy(true);
    try {
      await kuaidiApi.customerStatus({ body: { siteId, id: row.id, status: !row.status } });
      message.success(row.status ? "已停用该顾客" : "已恢复该顾客");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<KuaidiCustomer> = [
    { title: "微信昵称", dataIndex: "nickname", render: (value: string) => value || "微信用户" },
    { title: "下单次数", dataIndex: "orderCount", width: 100 },
    { title: "已付订单", dataIndex: "paidOrderCount", width: 100 },
    { title: "累计金额", dataIndex: "totalAmount", width: 120, render: (value: number) => moneyCny(value) },
    {
      title: "最近下单",
      dataIndex: "lastOrderAt",
      width: 160,
      render: (value: string | null) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "success" : "default"}>{value ? "正常" : "已停用"}</Tag>,
    },
    {
      title: "操作",
      width: 110,
      render: (_: unknown, row) => (
        <Popconfirm
          title={row.status ? "停用后该买家不能再下单，历史订单不受影响。" : "恢复后该买家可继续下单。"}
          onConfirm={() => void toggle(row)}
        >
          <a>{row.status ? "停用" : "恢复"}</a>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Panel
      title="顾客"
      titleExtra={<span className="muted text-12">微信登录过的买家：累计金额按下单时的运费合计</span>}
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="昵称关键词"
            style={{ width: 200 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
        </Space>
      }
    >
      {rows.length || loading ? (
        <Table
          size="small"
          rowKey="id"
          loading={loading || busy}
          dataSource={rows}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 位顾客`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
        />
      ) : (
        <EmptyState text="还没有微信登录过的买家" />
      )}
    </Panel>
  );
}
