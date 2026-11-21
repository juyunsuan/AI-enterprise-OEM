"use client";

import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import {
  HEALTH_AFTERSALE_KIND_LABELS,
  HEALTH_AFTERSALE_KINDS,
  HEALTH_AFTERSALE_STATUSES,
  HEALTH_AFTERSALE_STATUS_LABELS,
  HEALTH_ORDER_BIZ_TYPES,
  HEALTH_ORDER_STATUSES,
  HEALTH_PAY_STATUSES,
  HEALTH_PAY_STATUS_LABELS,
  type HealthAftersaleKind,
  type HealthAftersaleRow,
  type HealthAftersaleStatus,
  type HealthMeta,
  type HealthOrderDetail,
  type HealthOrderItemRow,
  type HealthOrderRow,
  type HealthVerifyResult,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  cny,
  DataTable,
  Descriptions,
  FilterBar,
  labelOf,
  LoadError,
  StatusTag,
  StatsGrid,
  StatBlock,
  useHealthResource,
} from "./health-common";

/**
 * 订单与售后：订单台账与状态机推进、售后处理、到店核销。
 *
 * 可执行的动作严格对齐后端 `health.order.rules.ts` 的转换表，界面不给出非法动作；
 * 商品订单发货走 `orderDeliver`（落发货单），其余动作走 `orderAction`。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const yuanToCents = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100));

const ACTION_LABELS: Record<string, string> = {
  ACCEPT: "接单",
  ASSIGN: "派单",
  REJECT: "拒单",
  START: "开始服务",
  COMPLETE: "完成",
  SHIP: "发货",
  REFUND_APPROVE: "同意退款",
  REFUND_REJECT: "驳回退款",
  CANCEL: "取消订单",
  REMARK: "备注",
};

type OrderAction =
  | "ACCEPT"
  | "ASSIGN"
  | "REJECT"
  | "START"
  | "COMPLETE"
  | "SHIP"
  | "REFUND_APPROVE"
  | "REFUND_REJECT"
  | "CANCEL"
  | "REMARK";

const ORDER_ACTIONS: OrderAction[] = [
  "ACCEPT",
  "ASSIGN",
  "REJECT",
  "START",
  "COMPLETE",
  "SHIP",
  "REFUND_APPROVE",
  "REFUND_REJECT",
  "CANCEL",
  "REMARK",
];

/** 各动作允许的当前状态（镜像后端 TRANSITIONS，避免点了才报错）。 */
const ACTION_ALLOWED: Record<OrderAction, string[]> = {
  ACCEPT: ["PAID"],
  ASSIGN: ["PAID", "ACCEPTED"],
  REJECT: ["PAID", "ACCEPTED", "ASSIGNED"],
  START: ["ACCEPTED", "ASSIGNED"],
  SHIP: ["PAID", "ACCEPTED"],
  COMPLETE: ["ACCEPTED", "SERVING", "DELIVERED", "VERIFIED"],
  REFUND_APPROVE: ["REFUND_PENDING", "AFTER_SALE_PENDING"],
  REFUND_REJECT: ["REFUND_PENDING", "AFTER_SALE_PENDING"],
  CANCEL: ["PENDING_PAYMENT", "PAID"],
  REMARK: [],
};

/** 支付状态与售后状态没有下发字典，用契约常量兜底，也不把枚举原样露出。 */
const PAY_TONE: Record<string, string> = {
  UNPAID: "gold",
  PAID: "green",
  REFUNDING: "orange",
  REFUNDED: "default",
};
const AFTERSALE_TONE: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
  RETURNED: "blue",
  DONE: "green",
  CLOSED: "default",
};

const payTag = (value: string) => (
  <Tag color={PAY_TONE[value] ?? "default"}>{HEALTH_PAY_STATUS_LABELS[value] ?? value}</Tag>
);

const aftersaleStatusTag = (value: string) => (
  <Tag color={AFTERSALE_TONE[value] ?? "default"}>
    {HEALTH_AFTERSALE_STATUS_LABELS[value] ?? value}
  </Tag>
);

const aftersaleKindText = (value: string) =>
  HEALTH_AFTERSALE_KIND_LABELS[value] ?? value;

/** 医护下拉：派单与核销都选人，一次取前 100 条足够。 */
function usePractitionerOptions(shopId: number, enabled: boolean) {
  const resource = useHealthResource(
    () => healthApi.practitioners({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    enabled && shopId > 0,
  );
  const rows = resource.data?.list ?? [];
  return rows.map((row) => ({
    value: row.id,
    label: row.role ? `${row.name}（${labelOf(null, "practitionerRoles", row.role)}）` : row.name,
  }));
}

export function OrdersTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("orders");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "orders", label: "订单", children: <OrdersPanel shopId={shopId} meta={meta} /> },
        {
          key: "aftersales",
          label: "售后",
          children: <AftersalesPanel shopId={shopId} />,
        },
        {
          key: "verify",
          label: "核销",
          children: <VerifyPanel shopId={shopId} meta={meta} />,
        },
      ]}
    />
  );
}

// ============================================================================
// 订单
// ============================================================================

function OrdersPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [bizType, setBizType] = useState("all");
  const [status, setStatus] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
  const [practitionerId, setPractitionerId] = useState(0);
  const [patientId, setPatientId] = useState(0);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<HealthOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [acting, setActing] = useState<{ order: HealthOrderRow; action: OrderAction } | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const practitionerOptions = usePractitionerOptions(shopId, true);
  const patients = useHealthResource(
    () => healthApi.patients({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    shopId > 0,
  );
  const from = range?.[0]?.format("YYYY-MM-DD") ?? "";
  const to = range?.[1]?.format("YYYY-MM-DD") ?? "";

  const stats = useHealthResource(
    () => healthApi.orderStats({ query: { shopId, days: 30 } }),
    [shopId],
    shopId > 0,
  );
  const resource = useHealthResource(
    () =>
      healthApi.orders({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          bizType,
          status,
          payStatus,
          practitionerId,
          patientId,
          keyword,
          from,
          to,
        },
      }),
    [shopId, page, bizType, status, payStatus, practitionerId, patientId, keyword, from, to],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];
  const stat = stats.data;

  const openDetail = async (row: HealthOrderRow) => {
    try {
      const data = await healthApi.orderDetail({ query: { shopId, id: row.id } });
      setDetail(data);
      setDetailOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单详情读取失败");
    }
  };

  const refresh = async (orderId?: number) => {
    await resource.reload();
    void stats.reload();
    if (orderId && detailOpen) {
      try {
        const next = await healthApi.orderDetail({ query: { shopId, id: orderId } });
        setDetail(next);
      } catch {
        setDetailOpen(false);
        setDetail(null);
      }
    }
  };

  const exportOrders = async () => {
    setExporting(true);
    try {
      const result = await healthApi.orderExport({
        query: { shopId, bizType, status, payStatus, practitionerId, patientId, keyword, from, to },
      });
      if (result?.url) window.open(result.url, "_blank", "noopener");
      message.success(result?.message || `已导出 ${result?.count ?? 0} 条订单`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const actionsOf = (row: HealthOrderRow): OrderAction[] =>
    ORDER_ACTIONS.filter((action) => {
      if (action === "REMARK") return true;
      if (action === "SHIP" && row.bizType !== "GOODS") return false;
      return ACTION_ALLOWED[action].includes(row.status);
    });

  const columns: ColumnsType<HealthOrderRow> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 180,
      render: (value: string, row) => <a onClick={() => void openDetail(row)}>{value}</a>,
    },
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 130,
      render: (value: string, row) => row.bizTypeLabel || labelOf(meta, "bizTypes", value),
    },
    {
      title: "履约状态",
      dataIndex: "status",
      width: 130,
      render: (value: string) => <StatusTag meta={meta} kind="orderStatuses" value={value} />,
    },
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 130,
      render: (value: string, row) => (
        <span title={row.customerPhoneMasked}>
          {value || "—"}
          {row.customerPhoneMasked ? (
            <div className="muted text-12">{row.customerPhoneMasked}</div>
          ) : null}
        </span>
      ),
    },
    {
      title: "就诊人",
      dataIndex: "patientName",
      width: 110,
      render: (value: string) => value || "—",
    },
    {
      title: "实付",
      dataIndex: "payAmountCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "支付状态",
      dataIndex: "payStatus",
      width: 110,
      render: (value: string) => payTag(value),
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
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Select
            size="small"
            placeholder="推进"
            style={{ width: 118 }}
            value={undefined}
            options={actionsOf(row).map((action) => ({
              value: action,
              label: ACTION_LABELS[action] ?? action,
            }))}
            onChange={(action: OrderAction) => setActing({ order: row, action })}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Panel
        title="订单概览"
        titleExtra={<span className="muted text-12">金额口径为实付，退款单不重复计入</span>}
      >
        {stat ? (
          <StatsGrid>
            <StatBlock title="近 30 天订单" value={stat.totalCount} hint={`今日 ${stat.todayCount} 单`} />
            <StatBlock title="待付款" value={stat.pendingPayCount} hint="超时未付自动关闭" />
            <StatBlock title="待发货" value={stat.pendingShipCount} hint="商品订单发货后转已发货" />
            <StatBlock title="服务中" value={stat.servingCount} />
            <StatBlock title="售后处理中" value={stat.aftersaleCount} />
            <StatBlock title="今日收款" value={cny(stat.todayPayCents)} />
            <StatBlock title="本月收款" value={cny(stat.monthPayCents)} />
            <StatBlock title="本月退款" value={cny(stat.refundCents)} />
          </StatsGrid>
        ) : stats.error ? (
          <LoadError text={stats.error} />
        ) : (
          <span className="muted text-12">{stats.loading ? "统计读取中…" : "暂无统计"}</span>
        )}
      </Panel>

      <Panel
        title="订单台账"
        titleBadge={resource.data ? `${resource.data.total}` : undefined}
        titleExtra={
          <span className="muted text-12">服务类订单按接单/服务/完成推进，商品订单走发货与收货</span>
        }
        extra={
          <Button size="small" loading={exporting} onClick={() => void exportOrders()}>
            导出当前筛选
          </Button>
        }
      >
        <FilterBar>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">搜索</span>
            <Input.Search
              allowClear
              placeholder="订单号 / 顾客 / 就诊人"
              style={{ width: 220 }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">业务类型</span>
            <Select
              value={bizType}
              style={{ width: 160 }}
              onChange={(value: string) => {
                setBizType(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部类型" },
                ...HEALTH_ORDER_BIZ_TYPES.map((value) => ({
                  value,
                  label: labelOf(meta, "bizTypes", value),
                })),
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">履约状态</span>
            <Select
              value={status}
              style={{ width: 160 }}
              onChange={(value: string) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部状态" },
                ...HEALTH_ORDER_STATUSES.map((value) => ({
                  value,
                  label: labelOf(meta, "orderStatuses", value),
                })),
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">支付状态</span>
            <Select
              value={payStatus}
              style={{ width: 140 }}
              onChange={(value: string) => {
                setPayStatus(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部" },
                ...HEALTH_PAY_STATUSES.map((value) => ({
                  value,
                  label: HEALTH_PAY_STATUS_LABELS[value] ?? value,
                })),
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">医护</span>
            <Select
              showSearch
              optionFilterProp="label"
              value={practitionerId}
              style={{ width: 180 }}
              onChange={(value: number) => {
                setPractitionerId(value);
                setPage(1);
              }}
              options={[{ value: 0, label: "全部医护" }, ...practitionerOptions]}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">就诊人</span>
            <Select
              showSearch
              optionFilterProp="label"
              value={patientId}
              style={{ width: 170 }}
              onChange={(value: number) => {
                setPatientId(value);
                setPage(1);
              }}
              options={[
                { value: 0, label: "全部就诊人" },
                ...(patients.data?.list ?? []).map((row) => ({
                  value: row.id,
                  label: row.name,
                })),
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">下单日期</span>
            <DatePicker.RangePicker
              value={range}
              onChange={(value) => {
                setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
                setPage(1);
              }}
            />
          </div>
        </FilterBar>

        {resource.error ? <LoadError text={resource.error} /> : null}
        <DataTable<HealthOrderRow>
          rows={rows}
          columns={columns}
          total={resource.data?.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={resource.loading}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1450 }}
        />
      </Panel>

      <OrderDetailDrawer
        open={detailOpen}
        detail={detail}
        meta={meta}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
      />

      <OrderActionModal
        shopId={shopId}
        meta={meta}
        acting={acting}
        practitionerOptions={practitionerOptions}
        onClose={() => setActing(null)}
        onDone={async (orderId) => {
          setActing(null);
          await refresh(orderId);
        }}
      />
    </div>
  );
}

function OrderDetailDrawer({
  open,
  detail,
  meta,
  onClose,
}: {
  open: boolean;
  detail: HealthOrderDetail | null;
  meta: HealthMeta | null;
  onClose: () => void;
}) {
  const order = detail?.order;
  const itemColumns: ColumnsType<HealthOrderItemRow> = [
    { title: "名称", dataIndex: "productName", width: 220 },
    {
      title: "规格",
      dataIndex: "skuName",
      width: 140,
      render: (value: string) => value || "—",
    },
    { title: "数量", dataIndex: "quantity", width: 70 },
    { title: "单价", dataIndex: "unitPriceCents", width: 100, render: (value: number) => cny(value) },
    { title: "金额", dataIndex: "amountCents", width: 100, render: (value: number) => cny(value) },
    {
      title: "关联",
      dataIndex: "refLabel",
      width: 160,
      render: (value: string) => value || "—",
    },
  ];

  return (
    <Drawer
      open={open}
      size="large"
      destroyOnHidden
      onClose={onClose}
      title={order ? `订单详情 · ${order.orderNo}` : "订单详情"}
    >
      {detail && order ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Panel
            title="概要"
            titleExtra={
              <Space size={4}>
                <StatusTag meta={meta} kind="orderStatuses" value={order.status} />
                {payTag(order.payStatus)}
              </Space>
            }
          >
            <Descriptions
              items={[
                { label: "业务类型", value: order.bizTypeLabel || labelOf(meta, "bizTypes", order.bizType) },
                { label: "顾客", value: `${order.customerName || "—"} ${order.customerPhoneMasked}` },
                { label: "就诊人", value: order.patientName || "—" },
                { label: "医护", value: order.practitionerName || "—" },
                { label: "机构", value: order.organName || "—" },
                { label: "下单时间", value: fmtTime(order.createdAt) },
                { label: "支付时间", value: order.paidAt ? fmtTime(order.paidAt) : "—" },
                { label: "核销码", value: order.verifyCode || "—" },
                {
                  label: "核销",
                  value: order.verified ? `已核销 ${fmtTime(order.verifiedAt)}` : "未核销",
                },
                { label: "顾客备注", value: order.remark || "—" },
                { label: "店主备注", value: order.shopNote || "—" },
              ]}
            />
            <div style={{ display: "grid", gap: 4, marginTop: 12 }}>
              <span className="text-12">商品合计 {cny(order.goodsAmountCents)}</span>
              <span className="text-12">服务合计 {cny(order.serviceAmountCents)}</span>
              <span className="text-12">
                运费 {cny(order.shippingCents)} · 券 {cny(order.couponCents)} · 积分抵扣{" "}
                {cny(order.pointDeductCents)} · 优惠 {cny(order.discountCents)}
              </span>
              <strong>实付 {cny(order.payAmountCents)}</strong>
              <span className="text-12 muted">
                已退 {cny(order.refundAmountCents)} · 可退 {cny(order.refundableCents)}
              </span>
            </div>
          </Panel>

          <Panel title="明细">
            <DataTable<HealthOrderItemRow>
              rows={detail.items}
              columns={itemColumns}
              page={1}
              scroll={{ x: 800 }}
            />
          </Panel>

          <Panel title="价格流水">
            {detail.priceFlows.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {detail.priceFlows.map((flow, index) => (
                  <div
                    key={`${flow.step}-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr 110px",
                      gap: 10,
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 4,
                    }}
                  >
                    <span className="text-12 muted">{fmtTime(flow.createdAt)}</span>
                    <span className="text-12">
                      {flow.label || flow.step}
                      {flow.refLabel ? <span className="muted"> · {flow.refLabel}</span> : null}
                    </span>
                    <span className="text-12">{cny(flow.amountCents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">还没有价格流水</span>
            )}
          </Panel>

          <Panel title="状态流转">
            {detail.statusLogs.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {detail.statusLogs.map((log, index) => (
                  <div
                    key={`${log.to}-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr 140px",
                      gap: 10,
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 4,
                    }}
                  >
                    <span className="text-12 muted">{fmtTime(log.createdAt)}</span>
                    <span className="text-12">
                      {labelOf(meta, "orderStatuses", log.from) || "新建"} →{" "}
                      {labelOf(meta, "orderStatuses", log.to)}
                      {log.note ? <span className="muted"> · {log.note}</span> : null}
                    </span>
                    <span className="text-12 muted">{log.operator || "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">还没有状态记录</span>
            )}
          </Panel>

          <Panel title="发货单">
            {detail.shipments.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {detail.shipments.map((shipment) => (
                  <div key={shipment.id} style={{ display: "grid", gap: 4 }}>
                    <strong className="text-12">
                      {shipment.expressCompanyName} {shipment.trackingNo}
                    </strong>
                    <span className="text-12 muted">
                      发货 {fmtTime(shipment.shippedAt)}
                      {shipment.receivedAt ? ` · 签收 ${fmtTime(shipment.receivedAt)}` : ""}
                    </span>
                    <span className="text-12">
                      包裹：
                      {shipment.items.map((item) => `${item.name}×${item.quantity}`).join("、") ||
                        "—"}
                    </span>
                    {shipment.remark ? (
                      <span className="text-12 muted">{shipment.remark}</span>
                    ) : null}
                    {shipment.traces.length ? (
                      <div style={{ display: "grid", gap: 2 }}>
                        {shipment.traces.map((trace, index) => (
                          <span key={`${trace.at}-${index}`} className="text-12 muted">
                            {fmtTime(trace.at)} {trace.text}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">还没有发货记录</span>
            )}
          </Panel>

          <Panel title="关联售后">
            {detail.aftersales.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {detail.aftersales.map((row) => (
                  <div key={row.id} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span className="text-12">{aftersaleKindText(row.kind)}</span>
                    {aftersaleStatusTag(row.status)}
                    <span className="text-12">
                      申请 {cny(row.applyAmountCents)} · 退款 {cny(row.refundAmountCents)}
                    </span>
                    <span className="text-12 muted">{row.reason || "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">没有售后单</span>
            )}
          </Panel>

          <Panel title="分账">
            {detail.shares.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {detail.shares.map((share) => (
                  <div key={share.id} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span className="text-12">
                      {labelOf(meta, "earnerKinds", share.earnerKind)} · {share.earnerName}
                    </span>
                    <span className="text-12 muted">
                      比例 {share.percent}% · 应分 {cny(share.shareCents)} · 实分{" "}
                      {cny(share.actualCents)}
                    </span>
                    <Tag color={share.settled ? "green" : "default"}>
                      {share.settled ? "已入账" : "待结算"}
                    </Tag>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted text-12">没有分账记录</span>
            )}
          </Panel>

          {detail.consult ? (
            <Panel
              title="关联问诊"
              titleExtra={
                <Tag>{labelOf(meta, "consultStatuses", detail.consult.status)}</Tag>
              }
            >
              <Descriptions
                items={[
                  { label: "标题", value: detail.consult.title || "—" },
                  { label: "主诉", value: detail.consult.symptomText || "—" },
                  { label: "接诊医护", value: detail.consult.practitionerName || "—" },
                  {
                    label: "结论",
                    value: detail.consult.conclusion || "—",
                  },
                ]}
              />
            </Panel>
          ) : null}

          {detail.prescription ? (
            <Panel
              title="关联处方"
              titleExtra={<span className="muted text-12">{detail.prescription.prescriptionNo}</span>}
            >
              <Descriptions
                items={[
                  { label: "开方医生", value: detail.prescription.doctorName || "—" },
                  { label: "诊断", value: detail.prescription.diagnosisText || "—" },
                  {
                    label: "药品",
                    value:
                      detail.prescription.items
                        .map((item) => `${item.drugName}×${item.quantity}`)
                        .join("、") || "—",
                  },
                ]}
              />
            </Panel>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

type OrderActionFormValues = {
  practitionerId?: number;
  refundYuan?: number;
  note?: string;
  expressCompanyId?: number;
  expressCompanyName?: string;
  trackingNo?: string;
};

function OrderActionModal({
  shopId,
  meta,
  acting,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  meta: HealthMeta | null;
  acting: { order: HealthOrderRow; action: OrderAction } | null;
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: (orderId: number) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<OrderActionFormValues>();
  const [saving, setSaving] = useState(false);
  const express = useHealthResource(
    () => healthApi.expressCompanies({ query: { shopId } }),
    [shopId],
    Boolean(acting) && shopId > 0,
  );
  const open = Boolean(acting);
  const action = acting?.action;

  useEffect(() => {
    if (!open || !acting) return;
    form.resetFields();
    form.setFieldsValue({
      practitionerId: acting.order.practitionerId || undefined,
      refundYuan: Number(acting.order.refundableCents || 0) / 100,
      expressCompanyId: 0,
    });
  }, [open, acting, form]);

  if (!acting || !action) return null;

  const isShip = action === "SHIP";
  const needsPractitioner = action === "ASSIGN";
  const needsRefund = action === "REFUND_APPROVE";
  const needsNote = action === "REJECT" || action === "REFUND_REJECT" || action === "CANCEL";

  const submit = async () => {
    const values = await form.validateFields();
    const companyId = Number(values.expressCompanyId ?? 0);
    const companyName = (values.expressCompanyName ?? "").trim();
    if (isShip && companyId <= 0 && !companyName) {
      message.error("请选择或手填快递公司");
      return;
    }
    setSaving(true);
    try {
      if (isShip) {
        await healthApi.orderDeliver({
          body: {
            shopId,
            orderId: acting.order.id,
            expressCompanyId: companyId,
            expressCompanyName: companyName,
            trackingNo: (values.trackingNo ?? "").trim(),
            remark: (values.note ?? "").trim(),
          },
        });
      } else {
        await healthApi.orderAction({
          body: {
            shopId,
            id: acting.order.id,
            action,
            note: (values.note ?? "").trim(),
            practitionerId: Number(values.practitionerId ?? 0),
            refundAmountCents: yuanToCents(values.refundYuan),
          },
        });
      }
      message.success(`${ACTION_LABELS[action] ?? "操作"}成功`);
      await onDone(acting.order.id);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={ACTION_LABELS[action] ?? "订单操作"}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认"
      confirmLoading={saving}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <span className="text-12 muted">
          订单 {acting.order.orderNo} · {acting.order.bizTypeLabel || labelOf(meta, "bizTypes", acting.order.bizType)} · 当前{" "}
          {labelOf(meta, "orderStatuses", acting.order.status)}
        </span>
        <Form form={form} layout="vertical">
          {needsPractitioner ? (
            <Form.Item
              name="practitionerId"
              label="接单医护"
              rules={[{ required: true, message: "请选择接单医护" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择医护"
                options={practitionerOptions}
              />
            </Form.Item>
          ) : null}
          {needsRefund ? (
            <Form.Item
              name="refundYuan"
              label="退款金额（元）"
              extra={`可退 ${cny(acting.order.refundableCents)}，填 0 按可退金额全额退`}
            >
              <InputNumber min={0} precision={2} style={{ width: "100%" }} />
            </Form.Item>
          ) : null}
          {isShip ? (
            <>
              <Form.Item name="expressCompanyId" label="快递公司">
                <Select
                  allowClear
                  placeholder="选择本店已维护的快递公司"
                  options={(express.data ?? []).map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="expressCompanyName"
                label="或手填快递公司"
                extra="下拉里没有时直接写名称，与下拉二选一"
              >
                <Input maxLength={60} placeholder="如 顺丰速运" />
              </Form.Item>
              <Form.Item
                name="trackingNo"
                label="运单号"
                rules={[{ required: true, message: "请填写运单号" }]}
              >
                <Input maxLength={64} placeholder="顾客可在小程序订单里查看物流" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="note"
            label={isShip ? "发货备注" : "备注"}
            rules={
              needsNote
                ? [{ required: true, message: "请填写原因，顾客端可见" }]
                : undefined
            }
            extra={needsNote ? "必填，顾客端可见" : "可留空"}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
        {isShip ? (
          <Notice variant="info">
            发货后订单转为「已发货」，可继续发货补第二个包裹；买家确认收货后订单可完成。
          </Notice>
        ) : null}
        {action === "REFUND_APPROVE" ? (
          <Notice variant="warn">同意退款会按实付回补库存并冲销分账，退款后不可撤销。</Notice>
        ) : null}
      </div>
    </Modal>
  );
}

// ============================================================================
// 售后
// ============================================================================

function AftersalesPanel({ shopId }: { shopId: number }) {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [detailId, setDetailId] = useState(0);
  const [handling, setHandling] = useState<HealthAftersaleRow | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.aftersales({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          keyword,
          aftersaleStatus: status,
          kind,
        },
      }),
    [shopId, page, keyword, status, kind],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const detail = useHealthResource(
    () => healthApi.aftersaleDetail({ query: { shopId, id: detailId } }),
    [shopId, detailId],
    detailId > 0 && shopId > 0,
  );

  const columns: ColumnsType<HealthAftersaleRow> = [
    {
      title: "售后单号",
      width: 170,
      render: (_: unknown, row) => (
        <a onClick={() => setDetailId(row.id)}>
          #{row.id} · {row.orderNo || "—"}
        </a>
      ),
    },
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 130,
      render: (value: string) => value || "—",
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 110,
      render: (value: HealthAftersaleKind) => aftersaleKindText(value),
    },
    {
      title: "原因",
      dataIndex: "reason",
      width: 180,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "申请金额",
      dataIndex: "applyAmountCents",
      width: 110,
      render: (value: number) => cny(value),
    },
    {
      title: "退款金额",
      dataIndex: "refundAmountCents",
      width: 110,
      render: (value: number) => (value > 0 ? cny(value) : "—"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: HealthAftersaleStatus) => aftersaleStatusTag(value),
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetailId(row.id)}>
            详情
          </Button>
          <Button
            size="small"
            type="text"
            disabled={row.status === "CLOSED" || row.status === "REJECTED"}
            onClick={() => setHandling(row)}
          >
            处理
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="售后单"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={<span className="muted text-12">同意退款会按实付回补库存并冲销分账</span>}
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">搜索</span>
          <Input.Search
            allowClear
            placeholder="订单号 / 顾客"
            style={{ width: 220 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">售后状态</span>
          <Select
            value={status}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...HEALTH_AFTERSALE_STATUSES.map((value) => ({
                value,
                label: HEALTH_AFTERSALE_STATUS_LABELS[value] ?? value,
              })),
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">售后类型</span>
          <Select
            value={kind}
            style={{ width: 160 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部类型" },
              ...HEALTH_AFTERSALE_KINDS.map((value) => ({
                value,
                label: HEALTH_AFTERSALE_KIND_LABELS[value] ?? value,
              })),
            ]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthAftersaleRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1230 }}
      />

      <Modal
        open={detailId > 0}
        title="售后详情"
        width={680}
        destroyOnHidden
        onCancel={() => setDetailId(0)}
        footer={
          <Space>
            <Button onClick={() => setDetailId(0)}>关闭</Button>
            <Button
              type="primary"
              disabled={
                !detail.data ||
                detail.data.status === "CLOSED" ||
                detail.data.status === "REJECTED"
              }
              onClick={() => {
                if (detail.data) setHandling(detail.data);
              }}
            >
              处理
            </Button>
          </Space>
        }
      >
        {detail.error ? <LoadError text={detail.error} /> : null}
        {detail.data ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Descriptions
              items={[
                { label: "关联订单", value: detail.data.orderNo || "—" },
                { label: "顾客", value: detail.data.customerName || "—" },
                { label: "类型", value: aftersaleKindText(detail.data.kind) },
                { label: "状态", value: aftersaleStatusTag(detail.data.status) },
                { label: "申请金额", value: cny(detail.data.applyAmountCents) },
                {
                  label: "退款金额",
                  value:
                    detail.data.refundAmountCents > 0 ? cny(detail.data.refundAmountCents) : "—",
                },
                { label: "申请时间", value: fmtTime(detail.data.createdAt) },
                {
                  label: "处理时间",
                  value: detail.data.handledAt ? fmtTime(detail.data.handledAt) : "—",
                },
                { label: "退回单号", value: detail.data.returnTrackingNo || "—" },
                { label: "店主回复", value: detail.data.shopReply || "—" },
              ]}
            />
            <div>
              <div className="muted text-12">问题描述</div>
              <div>{detail.data.description || detail.data.reason || "—"}</div>
            </div>
            {detail.data.images.length ? (
              <div>
                <div className="muted text-12">凭证</div>
                <Space wrap size={8}>
                  {detail.data.images.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      查看凭证
                    </a>
                  ))}
                </Space>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="muted text-12">{detail.loading ? "读取中…" : "暂无数据"}</span>
        )}
      </Modal>

      <AftersaleHandleModal
        shopId={shopId}
        row={handling}
        onClose={() => setHandling(null)}
        onDone={async () => {
          setHandling(null);
          setDetailId(0);
          await resource.reload();
        }}
      />
    </Panel>
  );
}

type AftersaleHandleValues = {
  action: string;
  reply: string;
  refundYuan: number;
};

function AftersaleHandleModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthAftersaleRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AftersaleHandleValues>();
  const [saving, setSaving] = useState(false);
  const open = Boolean(row);

  useEffect(() => {
    if (!open || !row) return;
    form.resetFields();
    form.setFieldsValue({
      action: row.status === "APPROVED" ? "RECEIVED" : row.status === "PENDING" ? "APPROVE" : "CLOSE",
      reply: "",
      refundYuan: Number(row.applyAmountCents || 0) / 100,
    });
  }, [open, row, form]);

  if (!row) return null;

  /** 可选动作按当前状态收敛（与后端 aftersaleHandle 的校验口径一致）。 */
  const actionOptions =
    row.status === "PENDING"
      ? [
          { value: "APPROVE", label: "同意售后" },
          { value: "REJECT", label: "驳回申请" },
        ]
      : row.status === "APPROVED"
        ? [
            { value: "RECEIVED", label: "确认收到退货" },
            { value: "CLOSE", label: "完结（退款并关闭 / 直接关闭）" },
          ]
        : [{ value: "CLOSE", label: "完结（退款并关闭 / 直接关闭）" }];

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.aftersaleHandle({
        body: {
          shopId,
          id: row.id,
          action: (values.action ?? "APPROVE") as "APPROVE" | "REJECT" | "RECEIVED" | "CLOSE",
          reply: values.reply ?? "",
          refundAmountCents: yuanToCents(values.refundYuan),
        },
      });
      message.success("售后已处理");
      await onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "处理失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`处理售后 · ${row.orderNo || `#${row.id}`}`}
      width={560}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认"
      confirmLoading={saving}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <span className="text-12 muted">
          {aftersaleKindText(row.kind)} · 申请 {cny(row.applyAmountCents)} · 当前{" "}
          {HEALTH_AFTERSALE_STATUS_LABELS[row.status] ?? row.status}
        </span>
        <Form form={form} layout="vertical">
          <Form.Item name="action" label="处理动作" rules={[{ required: true, message: "请选择动作" }]}>
            <Select options={actionOptions} />
          </Form.Item>
          <Form.Item
            name="refundYuan"
            label="退款金额（元）"
            extra="同意时为空按申请金额；完结时填 0 表示不退款直接关闭"
          >
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reply" label="处理说明" extra="顾客端可见，最多 500 字">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
        <Notice variant="info">
          只有待处理的售后可同意或驳回；已同意的可先确认收货再完结退款。
        </Notice>
      </div>
    </Modal>
  );
}

// ============================================================================
// 核销
// ============================================================================

function VerifyPanel({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [code, setCode] = useState("");
  const [practitionerId, setPractitionerId] = useState(0);
  const [result, setResult] = useState<HealthVerifyResult | null>(null);
  const [saving, setSaving] = useState(false);
  const practitionerOptions = usePractitionerOptions(shopId, true);

  const submit = async () => {
    const value = code.trim();
    if (value.length < 4) {
      message.error("请填写核销码");
      return;
    }
    setSaving(true);
    try {
      const next = await healthApi.verify({
        body: { shopId, code: value, practitionerId },
      });
      setResult(next);
      if (next?.ok) message.success(next.message || "核销成功");
      else message.error(next?.message || "核销失败");
    } catch (cause) {
      setResult(null);
      message.error(cause instanceof Error ? cause.message : "核销失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Panel
        title="到店核销"
        titleExtra={
          <span className="muted text-12">一单一码，核销后立即失效，重复核销会被拒绝</span>
        }
      >
        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">核销码</span>
            <Input.Search
              allowClear
              value={code}
              placeholder="顾客出示的核销码，4-32 位"
              enterButton="核销"
              loading={saving}
              onChange={(event) => setCode(event.target.value)}
              onSearch={() => void submit()}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="muted text-12">核销医护（可选）</span>
            <Select
              showSearch
              optionFilterProp="label"
              value={practitionerId}
              onChange={setPractitionerId}
              options={[{ value: 0, label: "不指定医护" }, ...practitionerOptions]}
            />
          </div>
          <span className="muted text-12">
            挂号、体检、签约与年卡权益都走这一处核销；商品订单不走核销，按收货完成。
          </span>
        </div>
      </Panel>

      {result ? (
        <Panel
          title="核销结果"
          titleExtra={
            <Tag color={result.ok ? "green" : "red"}>{result.ok ? "核销成功" : "核销失败"}</Tag>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <Descriptions
              items={[
                { label: "订单号", value: result.order?.orderNo || "—" },
                { label: "就诊人", value: result.patientName || "—" },
                { label: "服务", value: result.serviceName || "—" },
                {
                  label: "订单状态",
                  value: result.order ? (
                    <StatusTag meta={meta} kind="orderStatuses" value={result.order.status} />
                  ) : (
                    "—"
                  ),
                },
                {
                  label: "实付",
                  value: result.order ? cny(result.order.payAmountCents) : "—",
                },
                {
                  label: "核销时间",
                  value: result.order?.verifiedAt ? fmtTime(result.order.verifiedAt) : "—",
                },
              ]}
            />
            <Notice variant={result.ok ? "success" : "warn"}>
              {result.message || (result.ok ? "已核销" : "核销未完成")}
            </Notice>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
