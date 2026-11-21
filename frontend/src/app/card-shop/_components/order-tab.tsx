"use client";

import { App, Button, DatePicker, Drawer, Input, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type { CardShopOrder, CardShopOrderDetail } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { StatusTag } from "./common";
import { useCardShopScope } from "./scope";

/** 订单：台账 + 详情（含出货卡密明文）+ 关单与补发。 */
export function OrderTab() {
  const { siteId, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<CardShopOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [payState, setPayState] = useState<string>("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<CardShopOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.orderList({
        query: {
          siteId,
          keyword: keyword.trim() || undefined,
          payState: (payState || undefined) as CardShopOrder["payState"] | undefined,
          from: range?.[0] ? range[0].format("YYYY-MM-DD") : undefined,
          to: range?.[1] ? range[1].format("YYYY-MM-DD") : undefined,
          page,
          pageSize,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, keyword, payState, range, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: CardShopOrder) => {
    try {
      const data = await cardShopApi.orderDetail({ query: { siteId, id: row.id } });
      setDetail(data);
      setDetailOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单详情读取失败");
    }
  };

  const closeOrder = async (row: CardShopOrder) => {
    setBusy(true);
    try {
      const result = await cardShopApi.orderClose({
        body: { siteId, orderId: row.id, reason: "店主手动关闭" },
      });
      message.success(result?.message || "订单已关闭");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "关单失败");
    } finally {
      setBusy(false);
    }
  };

  const reissue = async (row: CardShopOrder) => {
    setBusy(true);
    try {
      const result = await cardShopApi.orderReissue({
        body: { siteId, orderId: row.id, email: row.notifyEmail || "" },
      });
      message.success(result?.message || "已重新下发");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "补发失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<CardShopOrder> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 180,
      render: (value: string, row) => (
        <a onClick={() => void openDetail(row)}>{value}</a>
      ),
    },
    { title: "商品", dataIndex: "goodsName", ellipsis: true },
    { title: "数量", dataIndex: "quantity", width: 70 },
    { title: "实付", dataIndex: "totalAmount", width: 100, render: (value: number) => moneyCny(value) },
    {
      title: "状态",
      dataIndex: "payState",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="order" value={value} />,
    },
    {
      title: "联系方式",
      dataIndex: "contact",
      width: 150,
      render: (value: string) => value || <span className="muted">—</span>,
    },
    {
      title: "下单时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      width: 190,
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {row.payState === "PENDING" ? (
            <Popconfirm title="关闭后占用的卡密立即放回可售，确定？" onConfirm={() => void closeOrder(row)}>
              <Button size="small" type="text" danger loading={busy}>
                关单
              </Button>
            </Popconfirm>
          ) : null}
          {row.payState === "PAID" ? (
            <Popconfirm title="把本单出货卡密重新通知买家（站内留痕）？" onConfirm={() => void reissue(row)}>
              <Button size="small" type="text" loading={busy}>
                补发
              </Button>
            </Popconfirm>
          ) : null}
          {row.payState === "PENDING" && row.expireAt ? (
            <span className="text-12 muted">{dayjs(row.expireAt).format("MM-DD HH:mm")} 前未付自动关闭</span>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="订单台账"
        titleExtra={<span className="muted text-12">资金直进你的微信商户号，平台不经手</span>}
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="单号 / 交易号 / 联系方式"
            style={{ width: 240 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
          <Select
            allowClear
            placeholder="支付状态"
            style={{ width: 140 }}
            value={payState || undefined}
            options={[
              { value: "PENDING", label: "待支付" },
              { value: "PAID", label: "已支付" },
              { value: "CLOSED", label: "已关闭" },
              { value: "REFUNDED", label: "已退款" },
            ]}
            onChange={(value) => {
              setPage(1);
              setPayState(value || "");
            }}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(value) => {
              setPage(1);
              setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
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
              showTotal: (value) => `共 ${value} 单`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
            }}
          />
        ) : (
          <EmptyState text="还没有订单" />
        )}
      </Panel>

      <Drawer
        title={detail ? `订单 ${detail.orderNo}` : "订单详情"}
        open={detailOpen}
        width={720}
        onClose={() => setDetailOpen(false)}
        destroyOnHidden
      >
        {detail ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Panel title="概要" titleExtra={<StatusTag meta={meta} kind="order" value={detail.payState} />}>
              <div style={{ display: "grid", gap: 6 }}>
                <span>商品：{detail.goodsName} × {detail.quantity}</span>
                <span>
                  金额：{moneyCny(detail.productAmount)} − 优惠 {moneyCny(detail.discountAmount)} ={" "}
                  <strong>{moneyCny(detail.totalAmount)}</strong>
                </span>
                <span>联系方式：{detail.contact || "（未填）"}</span>
                <span>通知邮箱：{detail.notifyEmail || "（未填）"}</span>
                <span>微信交易号：{detail.transactionId || "—"}</span>
                <span>下单时间：{fmtTime(detail.createdAt)}</span>
                <span>支付时间：{detail.paidAt ? fmtTime(detail.paidAt) : "—"}</span>
                {detail.failReason ? <Notice variant="warn">{detail.failReason}</Notice> : null}
              </div>
            </Panel>
            <Panel
              title="出货卡密"
              titleExtra={
                <span className="muted text-12">
                  应发 {detail.quantity} · 实发 {detail.cardCount}
                </span>
              }
            >
              {detail.cards.length ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {detail.cards.map((card) => (
                    <div
                      key={card.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    >
                      <span className="text-12 muted">#{card.sort}</span>
                      <span style={{ fontFamily: "monospace" }}>
                        {card.number ? `${card.number} / ` : ""}
                        {card.secret}
                      </span>
                      <Button
                        size="small"
                        type="text"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(card.number ? `${card.number} ${card.secret}` : card.secret)
                            .then(() => message.success("已复制"));
                        }}
                      >
                        复制
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={detail.payState === "PAID" ? "这单还没有出货记录，可用「补发」重下快照" : "支付成功后出卡"} />
              )}
            </Panel>
            {detail.goodsRemark ? (
              <Panel title="使用说明">
                <div style={{ whiteSpace: "pre-wrap" }}>{detail.goodsRemark}</div>
              </Panel>
            ) : null}
            {detail.takeCardMode !== "OFF" ? (
              <Tag color="blue">该商品下单时设置了取卡密码：买家查单需验证</Tag>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
