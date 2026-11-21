"use client";

import { Tag } from "antd";
import type { ReactNode } from "react";
import type { KuaidiMeta } from "@enterprise/contracts";
import { moneyCny } from "@/lib/money";

/**
 * 快递寄件各页签共用的一层：状态标签、文案字典与金额。
 * 标签文案优先取 `Kuaidi_meta` 下发的字典（平台改口径不用发版），
 * 字典缺省时回落到契约常量，保证任何时候都不会把枚举原样甩到界面上。
 */

export const KUAIDI_NAV = [
  { key: "overview", label: "总览" },
  { key: "site", label: "站点设置" },
  { key: "company", label: "快递公司" },
  { key: "order", label: "寄件订单" },
  { key: "customer", label: "顾客" },
  { key: "pay", label: "收款账户" },
  { key: "publish", label: "小程序发布" },
] as const;

export type KuaidiNavKey = (typeof KUAIDI_NAV)[number]["key"];

type LabelKind = "site" | "order" | "pay" | "payMode" | "address" | "action";

const FALLBACK: Record<LabelKind, Record<string, string>> = {
  site: {
    DRAFT: "未上线",
    ONLINE: "营业中",
    CLOSED: "已关闭",
  },
  order: {
    PENDING_PICKUP: "待取件",
    ACCEPTED: "已接单",
    PICKED_UP: "已取件",
    IN_TRANSIT: "运输中",
    DELIVERED: "已签收",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    EXCEPTION: "异常",
  },
  pay: {
    PENDING: "待支付",
    PAID: "已支付",
    REFUNDED: "已退款",
    CLOSED: "已关闭",
  },
  payMode: {
    ONLINE: "微信在线支付",
    OFFLINE: "线下登记",
  },
  address: {
    SENDER: "寄件地址",
    RECEIVER: "收件地址",
  },
  action: {
    MARK_PAID: "登记已收款",
    ACCEPT: "接单",
    PICKUP: "已取件",
    TRANSIT: "运输中",
    DELIVER: "已签收",
    COMPLETE: "完成订单",
    EXCEPTION: "标记异常",
    CANCEL: "取消订单",
    REFUND: "登记退款",
  },
};

const TONE: Record<string, string> = {
  ONLINE: "green",
  PAID: "green",
  COMPLETED: "green",
  PENDING_PICKUP: "gold",
  PENDING: "gold",
  ACCEPTED: "blue",
  PICKED_UP: "blue",
  IN_TRANSIT: "blue",
  DELIVERED: "green",
  DRAFT: "default",
  CLOSED: "default",
  CANCELLED: "default",
  REFUNDED: "blue",
  EXCEPTION: "red",
};

export function labelOf(meta: KuaidiMeta | null, kind: LabelKind, value: string): string {
  const dict =
    kind === "site"
      ? meta?.siteStatusLabels
      : kind === "order"
        ? meta?.orderStateLabels
        : kind === "pay"
          ? meta?.payStateLabels
          : kind === "payMode"
            ? meta?.payModeLabels
            : kind === "address"
              ? meta?.addressTypeLabels
              : meta?.actionLabels;
  return dict?.[value] || FALLBACK[kind]?.[value] || value;
}

export function StatusTag({
  meta,
  kind,
  value,
}: {
  meta: KuaidiMeta | null;
  kind: LabelKind;
  value: string;
}) {
  return <Tag color={TONE[value] ?? "default"}>{labelOf(meta, kind, value)}</Tag>;
}

/** 概览用的数字卡片：标题、主数字与一行辅助说明。 */
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

/** 地址一行式摘要：省市区 + 详细地址。 */
export function partyLine(party: { province: string; city: string; district: string; address: string }) {
  return `${party.province} ${party.city} ${party.district} ${party.address}`.trim();
}
