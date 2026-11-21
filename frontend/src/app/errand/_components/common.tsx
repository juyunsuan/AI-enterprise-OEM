"use client";

import { Tag } from "antd";
import type { ReactNode } from "react";
import type { ErrandMeta } from "@enterprise/contracts";
import { moneyCny } from "@/lib/money";

export const ERRAND_NAV = [
  { key: "overview", label: "总览" },
  { key: "site", label: "站点设置" },
  { key: "city", label: "服务城市" },
  { key: "order", label: "跑腿订单" },
  { key: "rider", label: "骑手与审核" },
  { key: "customer", label: "顾客" },
  { key: "coupon", label: "优惠券" },
  { key: "wallet", label: "骑手钱包" },
  { key: "agent", label: "代理" },
  { key: "ai", label: "AI 调度" },
  { key: "publish", label: "小程序发布" },
] as const;

export type ErrandNavKey = (typeof ERRAND_NAV)[number]["key"];

type LabelKind =
  | "site"
  | "city"
  | "order"
  | "pay"
  | "payMode"
  | "rider"
  | "vehicle"
  | "service"
  | "action"
  | "coupon"
  | "withdrawal";

const FALLBACK: Record<LabelKind, Record<string, string>> = {
  site: { DRAFT: "未上线", ONLINE: "营业中", CLOSED: "已关闭" },
  city: { ENABLED: "开通", DISABLED: "停用" },
  order: {
    PENDING_PAY: "待支付",
    PENDING_ACCEPT: "待接单",
    ACCEPTED: "已接单",
    PICKED_UP: "已取件",
    DELIVERING: "配送中",
    ARRIVED: "已送达",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    EXCEPTION: "异常",
  },
  pay: { PENDING: "待支付", PAID: "已支付", REFUNDED: "已退款", CLOSED: "已关闭" },
  payMode: { ONLINE: "微信在线支付", OFFLINE: "线下结算" },
  rider: { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已拒绝", SUSPENDED: "已停用" },
  vehicle: { EBIKE: "电动车", MOTO: "摩托车", CAR: "汽车", WALK: "步行" },
  service: { SEND: "帮我送", BUY: "帮我买" },
  action: {
    MARK_PAID: "登记已收款",
    ASSIGN: "指派骑手",
    ACCEPT: "骑手接单",
    PICKUP: "已取件",
    DELIVER: "开始配送",
    ARRIVE: "已送达",
    COMPLETE: "完成订单",
    EXCEPTION: "标记异常",
    CANCEL: "取消订单",
    REFUND: "登记退款",
  },
  coupon: { FIXED: "满减券", PERCENT: "折扣券" },
  withdrawal: { PENDING: "待打款", PAID: "已打款", REJECTED: "已驳回" },
};

const TONE: Record<string, string> = {
  ONLINE: "green",
  APPROVED: "green",
  PAID: "green",
  COMPLETED: "green",
  ARRIVED: "green",
  PENDING: "gold",
  PENDING_PAY: "gold",
  PENDING_ACCEPT: "gold",
  ACCEPTED: "blue",
  PICKED_UP: "blue",
  DELIVERING: "blue",
  DRAFT: "default",
  CLOSED: "default",
  CANCELLED: "default",
  REFUNDED: "blue",
  REJECTED: "red",
  SUSPENDED: "red",
  EXCEPTION: "red",
};

export function labelOf(meta: ErrandMeta | null, kind: LabelKind, value: string): string {
  const dict =
    kind === "site"
      ? meta?.siteStatusLabels
      : kind === "city"
        ? meta?.cityStatusLabels
      : kind === "order"
        ? meta?.orderStateLabels
        : kind === "pay"
          ? meta?.payStateLabels
          : kind === "payMode"
            ? meta?.payModeLabels
            : kind === "rider"
              ? meta?.riderStatusLabels
              : kind === "vehicle"
                ? meta?.vehicleLabels
                : kind === "service"
                  ? meta?.serviceTypeLabels
                  : kind === "action"
                    ? meta?.actionLabels
                    : kind === "coupon"
                      ? meta?.couponTypeLabels
                      : meta?.withdrawalStatusLabels;
  return dict?.[value] || FALLBACK[kind]?.[value] || value;
}

export function StatusTag({
  meta,
  kind,
  value,
}: {
  meta: ErrandMeta | null;
  kind: LabelKind;
  value: string;
}) {
  return <Tag color={TONE[value] ?? "default"}>{labelOf(meta, kind, value)}</Tag>;
}

export function StatBlock({
  title,
  value,
  hint,
}: {
  title: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 16px",
        display: "grid",
        gap: 4,
      }}
    >
      <span className="muted text-12">{title}</span>
      <strong style={{ fontSize: 22, lineHeight: 1.3 }}>{value}</strong>
      {hint ? <span className="text-12 muted">{hint}</span> : null}
    </div>
  );
}

export const cny = (value: unknown) => moneyCny(value ?? 0);

export function partyLine(party: {
  province: string;
  city: string;
  district: string;
  address: string;
}) {
  return `${party.province} ${party.city} ${party.district} ${party.address}`.trim();
}
