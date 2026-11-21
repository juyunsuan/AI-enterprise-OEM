"use client";

import { App, Button, DatePicker, Drawer, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type {
  KuaidiOrder,
  KuaidiOrderAction,
  KuaidiOrderActionBody,
  KuaidiOrderDetail,
} from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { cny, labelOf, partyLine, StatusTag } from "./common";
import { useKuaidiScope } from "./scope";

/** 各动作允许的当前履约状态（与后端状态机一致，避免点了才报错）。 */
const ACTION_ALLOWED: Record<KuaidiOrderAction, string[]> = {
  MARK_PAID: [],
  ACCEPT: ["PENDING_PICKUP"],
  PICKUP: ["PENDING_PICKUP", "ACCEPTED"],
  TRANSIT: ["ACCEPTED", "PICKED_UP"],
  DELIVER: ["PICKED_UP", "IN_TRANSIT"],
  COMPLETE: ["IN_TRANSIT", "DELIVERED"],
  EXCEPTION: ["PENDING_PICKUP", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"],
  CANCEL: ["PENDING_PICKUP", "ACCEPTED", "EXCEPTION"],
  REFUND: ["PENDING_PICKUP", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COMPLETED", "EXCEPTION"],
};

const ACTION_ORDER: KuaidiOrderAction[] = [
  "MARK_PAID",
  "ACCEPT",
  "PICKUP",
  "TRANSIT",
  "DELIVER",
  "COMPLETE",
  "EXCEPTION",
  "CANCEL",
  "REFUND",
];

/** 订单：台账 + 详情（寄收件人、金额构成、履约时间线）+ 状态机推进。 */
export function OrderTab() {
  const { siteId, meta } = useKuaidiScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<KuaidiOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [payState, setPayState] = useState<string>("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<KuaidiOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [acting, setActing] = useState<{ order: KuaidiOrder; action: KuaidiOrderAction } | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await kuaidiApi.orders({
        query: {
          siteId,
          keyword: keyword.trim() || undefined,
          status: (status || undefined) as KuaidiOrder["status"] | undefined,
          payState: (payState || undefined) as KuaidiOrder["payState"] | undefined,
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
  }, [siteId, keyword, status, payState, range, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: KuaidiOrder) => {
    try {
      const data = await kuaidiApi.orderDetail({ query: { siteId, id: row.id } });
      setDetail(data);
      setDetailOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单详情读取失败");
    }
  };

  const actionsOf = (order: KuaidiOrder): KuaidiOrderAction[] =>
    ACTION_ORDER.filter((action) => {
      if (action === "MARK_PAID") {
        return order.payState === "PENDING" && order.payMode === "OFFLINE";
      }
      if (action === "REFUND" && order.payState !== "PAID") return false;
      return ACTION_ALLOWED[action].includes(order.status);
    });

  const columns: ColumnsType<KuaidiOrder> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 180,
      render: (value: string, row) => <a onClick={() => void openDetail(row)}>{value}</a>,
    },
    { title: "快递公司", dataIndex: "companyName", width: 110 },
    {
      title: "寄件人",
      width: 150,
      render: (_: unknown, row) => (
        <span title={partyLine(row.sender)}>
          {row.sender.name} · {row.receiver.city}
        </span>
      ),
    },
    {
      title: "计费重",
      dataIndex: "chargeWeightKg",
      width: 90,
      render: (value: number) => `${value} kg`,
    },
    { title: "运费", dataIndex: "totalAmount", width: 100, render: (value: number) => moneyCny(value) },
    {
      title: "支付",
      dataIndex: "payState",
      width: 150,
      render: (value: string, row) => (
        <Space size={4}>
          <StatusTag meta={meta} kind="pay" value={value} />
          <span className="muted text-12">{labelOf(meta, "payMode", row.payMode)}</span>
        </Space>
      ),
    },
    {
      title: "履约",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="order" value={value} />,
    },
    { title: "下单时间", dataIndex: "createdAt", width: 160, render: (value: string) => fmtTime(value) },
    {
      title: "操作",
      width: 170,
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {actionsOf(row).length ? (
            <Select
              size="small"
              placeholder="推进"
              style={{ width: 110 }}
              value={null}
              options={actionsOf(row).map((action) => ({
                value: action,
                label: labelOf(meta, "action", action),
              }))}
              onChange={(action: KuaidiOrderAction) => setActing({ order: row, action })}
            />
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
        title="寄件订单台账"
        titleExtra={<span className="muted text-12">运费直进你的微信商户号，平台不经手；退款只做线下登记</span>}
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="单号 / 寄收件人 / 手机号"
            style={{ width: 240 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
          <Select
            allowClear
            placeholder="履约状态"
            style={{ width: 140 }}
            value={status || undefined}
            options={["PENDING_PICKUP", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED", "EXCEPTION"].map(
              (value) => ({ value, label: labelOf(meta, "order", value) }),
            )}
            onChange={(value) => {
              setPage(1);
              setStatus(value || "");
            }}
          />
          <Select
            allowClear
            placeholder="支付状态"
            style={{ width: 140 }}
            value={payState || undefined}
            options={["PENDING", "PAID", "REFUNDED", "CLOSED"].map((value) => ({
              value,
              label: labelOf(meta, "pay", value),
            }))}
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
            scroll={{ x: 1180 }}
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
          <EmptyState text="还没有寄件订单" />
        )}
      </Panel>

      <Drawer
        title={detail ? `订单 ${detail.orderNo}` : "订单详情"}
        open={detailOpen}
        width={760}
        onClose={() => setDetailOpen(false)}
        destroyOnHidden
      >
        {detail ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Panel
              title="概要"
              titleExtra={
                <Space size={4}>
                  <StatusTag meta={meta} kind="pay" value={detail.payState} />
                  <StatusTag meta={meta} kind="order" value={detail.status} />
                </Space>
              }
            >
              <div style={{ display: "grid", gap: 6 }}>
                <span>快递公司：{detail.companyName}</span>
                <span>物品：{detail.itemName} · {detail.itemCount} 件 · 实重 {detail.itemWeightKg} kg</span>
                <span>
                  体积重 {detail.volumeWeightKg} kg · 计费重 {detail.chargeWeightKg} kg
                  {detail.length || detail.width || detail.height
                    ? `（${detail.length}×${detail.width}×${detail.height} cm）`
                    : ""}
                </span>
                <span>支付方式：{labelOf(meta, "payMode", detail.payMode)}</span>
                <span>物流单号：{detail.trackingNo || "—"}</span>
                <span>取件时段：{detail.pickupSlot || "—"}</span>
                <span>备注：{detail.remark || "—"}</span>
                <span>下单时间：{fmtTime(detail.createdAt)}</span>
                <span>支付时间：{detail.paidAt ? fmtTime(detail.paidAt) : "—"}</span>
                {detail.cancelReason ? <Notice variant="warn">{detail.cancelReason}</Notice> : null}
              </div>
            </Panel>

            <Panel title="寄件人">
              <div style={{ display: "grid", gap: 4 }}>
                <span>{detail.sender.name} · {detail.sender.mobile}</span>
                <span className="muted">{partyLine(detail.sender)}</span>
              </div>
            </Panel>
            <Panel title="收件人">
              <div style={{ display: "grid", gap: 4 }}>
                <span>{detail.receiver.name} · {detail.receiver.mobile}</span>
                <span className="muted">{partyLine(detail.receiver)}</span>
              </div>
            </Panel>

            <Panel title="运费构成">
              <div style={{ display: "grid", gap: 6 }}>
                <span>首重/续重：{cny(detail.baseFee)} + {cny(detail.extraFee)}</span>
                <span>偏远加收：{cny(detail.remoteFee)}</span>
                <span>保价费：{cny(detail.insuranceFee)}（声明价值 {cny(detail.insuredValue)}）</span>
                <strong>合计：{cny(detail.totalAmount)}</strong>
              </div>
            </Panel>

            <Panel title="履约时间线">
              {detail.events.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.events.map((event) => (
                    <div
                      key={event.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 90px 1fr",
                        gap: 10,
                        borderBottom: "1px solid var(--border)",
                        paddingBottom: 6,
                      }}
                    >
                      <span className="text-12 muted">{fmtTime(event.at)}</span>
                      <Tag>{event.statusLabel || labelOf(meta, "order", event.status)}</Tag>
                      <span className="text-12">
                        {event.note || "—"}
                        {event.operator ? <span className="muted"> · {event.operator}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="还没有履约记录" />
              )}
            </Panel>

            <OrderActionPanel
              order={detail}
              onDone={async () => {
                await load();
                const next = await kuaidiApi.orderDetail({ query: { siteId, id: detail.id } });
                if (next) setDetail(next);
              }}
            />
          </div>
        ) : null}
      </Drawer>

      <OrderActionModal
        siteId={siteId}
        acting={acting}
        onClose={() => setActing(null)}
        onDone={async () => {
          await load();
          if (detail) {
            const next = await kuaidiApi.orderDetail({ query: { siteId, id: detail.id } });
            if (next) setDetail(next);
          }
        }}
      />
    </div>
  );
}

/** 详情页里的动作区：与表格里的「推进」共用同一个弹窗。 */
function OrderActionPanel({ order, onDone }: { order: KuaidiOrder; onDone: () => Promise<void> }) {
  const { meta } = useKuaidiScope();
  const [acting, setActing] = useState<KuaidiOrderAction | null>(null);
  const { siteId } = useKuaidiScope();
  const allowed = ACTION_ORDER.filter((action) => {
    if (action === "MARK_PAID") return order.payState === "PENDING" && order.payMode === "OFFLINE";
    if (action === "REFUND" && order.payState !== "PAID") return false;
    return ACTION_ALLOWED[action].includes(order.status);
  });
  if (!allowed.length) return null;
  return (
    <Panel title="推进履约">
      <Space wrap>
        {allowed.map((action) => (
          <Button key={action} onClick={() => setActing(action)}>
            {labelOf(meta, "action", action)}
          </Button>
        ))}
      </Space>
      <OrderActionModal
        siteId={siteId}
        acting={acting ? { order, action: acting } : null}
        onClose={() => setActing(null)}
        onDone={async () => {
          setActing(null);
          await onDone();
        }}
      />
    </Panel>
  );
}

function OrderActionModal({
  siteId,
  acting,
  onClose,
  onDone,
}: {
  siteId: number;
  acting: { order: KuaidiOrder; action: KuaidiOrderAction } | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { meta } = useKuaidiScope();
  const [note, setNote] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [saving, setSaving] = useState(false);
  const open = Boolean(acting);
  const action = acting?.action;

  useEffect(() => {
    if (!open) return;
    setNote("");
    setTrackingNo(acting?.order.trackingNo || "");
  }, [open, acting]);

  if (!acting || !action) return null;

  const requiresNote = action === "EXCEPTION";
  const requiresTracking = action === "PICKUP" || action === "TRANSIT";
  const blocked = requiresNote && !note.trim();
  const blockedTracking = requiresTracking && !trackingNo.trim();

  const submit = async () => {
    setSaving(true);
    try {
      const body: KuaidiOrderActionBody = {
        siteId,
        id: acting.order.id,
        action,
        note: note.trim(),
        trackingNo: trackingNo.trim(),
      };
      const result = await kuaidiApi.orderAction({ body });
      message.success(result?.message || "已更新");
      onClose();
      await onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={labelOf(meta, "action", action)}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认"
      okButtonProps={{ disabled: blocked || blockedTracking }}
      confirmLoading={saving}
      destroyOnHidden
    >
      <div style={{ display: "grid", gap: 10 }}>
        <span className="text-12 muted">
          订单 {acting.order.orderNo} · 当前状态 {labelOf(meta, "order", acting.order.status)}
        </span>
        {requiresTracking ? (
          <Input
            placeholder="物流单号（取件/运输必填）"
            maxLength={64}
            value={trackingNo}
            onChange={(event) => setTrackingNo(event.target.value)}
          />
        ) : null}
        <Input.TextArea
          rows={3}
          maxLength={300}
          showCount
          placeholder={requiresNote ? "异常原因（必填，买家端可见）" : "备注（可选）"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}
