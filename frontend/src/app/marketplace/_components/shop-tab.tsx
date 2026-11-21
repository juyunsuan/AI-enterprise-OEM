"use client";

import { App, Button, Input, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpShop } from "@enterprise/contracts";
import { MP_SHOP_STATUS_LABELS } from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { MarketStatusTag, NoMarket } from "./common";

/** 店铺台账：运营方只做治理（停服/恢复），不代商户改店铺资料。 */
export function ShopTab({ hasMarket }: { hasMarket: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpShop[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hasMarket) return;
    setLoading(true);
    try {
      const result = await marketplaceApi.shops({
        query: { page, pageSize, keyword, status },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "店铺读取失败");
    } finally {
      setLoading(false);
    }
  }, [hasMarket, page, pageSize, keyword, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: MpShop) => {
    const next = row.status === "SUSPENDED" ? "ONLINE" : "SUSPENDED";
    setBusy(true);
    try {
      await marketplaceApi.shopStatus({
        body: {
          id: row.id,
          status: next,
          reason: next === "SUSPENDED" ? "市场运营方停服（可在店铺台账恢复）" : "",
        },
      });
      message.success(next === "SUSPENDED" ? "店铺已停服" : "店铺已恢复");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  if (!hasMarket) {
    return <NoMarket desc="先创建市场，审核通过的商户会自动出现在店铺台账。" />;
  }

  const columns: ColumnsType<MpShop> = [
    {
      title: "店铺",
      key: "shop",
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div className="text-12 muted">{row.shopCode}</div>
        </div>
      ),
    },
    { title: "商户", dataIndex: "merchantName", width: 160 },
    {
      title: "类目",
      dataIndex: "categoryNames",
      render: (names: string[]) =>
        names.length ? names.map((name) => <Tag key={name}>{name}</Tag>) : <span className="muted">—</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <MarketStatusTag status={value} labels={MP_SHOP_STATUS_LABELS} />
      ),
    },
    {
      title: "微信支付",
      dataIndex: "payEnabled",
      width: 100,
      render: (value: boolean, row) =>
        value ? <Tag color="green">已开启</Tag> : <Tag>{row.mchId ? "已填未开" : "未配置"}</Tag>,
    },
    { title: "排序", dataIndex: "sortOrder", width: 70 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => (value ? new Date(value).toLocaleString() : "—"),
    },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_, row) =>
        row.status === "CLOSED" ? (
          <span className="muted text-12">商户已退出</span>
        ) : (
          <Space size={4}>
            <Button size="small" type="link" disabled={busy} onClick={() => void toggle(row)}>
              {row.status === "SUSPENDED" ? "恢复" : "停服"}
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel title="店铺台账">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="店铺名 / 店铺编号"
          style={{ width: 240 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
        <Select
          allowClear
          placeholder="店铺状态"
          style={{ width: 140 }}
          value={status || undefined}
          onChange={(value) => {
            setPage(1);
            setStatus(value ?? "");
          }}
          options={Object.entries(MP_SHOP_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
      />
      <div className="text-12 muted" style={{ marginTop: 8 }}>
        停服只影响买家端展示与下单，商户后台仍可查看数据；商户正常经营时不能由运营方直接关闭店铺。
      </div>
    </Panel>
  );
}
