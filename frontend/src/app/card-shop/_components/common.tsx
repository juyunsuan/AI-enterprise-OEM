"use client";

import { Tag } from "antd";
import type { ReactNode } from "react";
import type { CardShopMeta } from "@enterprise/contracts";
import { moneyCny } from "@/lib/money";

/**
 * 卡密商城各页签共用的一层：状态标签、文案字典与金额。
 * 标签文案优先取 `CardShop_meta` 下发的字典（平台改口径不用发版），
 * 字典缺省时回落到契约常量，保证任何时候都不会把枚举原样甩到界面上。
 */

export const CARD_SHOP_NAV = [
  { key: "overview", label: "总览" },
  { key: "site", label: "站点设置" },
  { key: "goods", label: "商品" },
  { key: "card", label: "卡密" },
  { key: "order", label: "订单" },
  { key: "coupon", label: "券码" },
  { key: "customer", label: "顾客" },
  { key: "content", label: "公告与内容" },
  { key: "publish", label: "小程序发布" },
] as const;

export type CardShopNavKey = (typeof CARD_SHOP_NAV)[number]["key"];

const FALLBACK: Record<string, Record<string, string>> = {
  site: {
    DRAFT: "未上线",
    ONLINE: "营业中",
    SUSPENDED: "已停服",
    CLOSED: "已关闭",
  },
  goods: {
    DRAFT: "草稿",
    OFFLINE: "已下架",
    ONLINE: "销售中",
    FROZEN: "平台冻结",
  },
  card: {
    AVAILABLE: "可售",
    LOCKED: "待支付占用",
    SOLD: "已售",
    DISABLED: "已停用",
    VOID: "已作废",
  },
  order: {
    PENDING: "待支付",
    PAID: "已支付",
    CLOSED: "已关闭",
    REFUNDED: "已退款",
  },
  coupon: {
    UNUSED: "未使用",
    LOCKED: "下单占用",
    USED: "已核销",
    DISABLED: "已停用",
  },
  content: { NOTICE: "公告", ARTICLE: "资讯", PAGE: "单页" },
};

const TONE: Record<string, string> = {
  ONLINE: "green",
  PAID: "green",
  AVAILABLE: "green",
  UNUSED: "green",
  DRAFT: "default",
  OFFLINE: "default",
  PENDING: "gold",
  LOCKED: "gold",
  SUSPENDED: "red",
  FROZEN: "red",
  CLOSED: "default",
  REFUNDED: "blue",
  SOLD: "blue",
  USED: "blue",
  DISABLED: "default",
  VOID: "default",
};

export function labelOf(
  meta: CardShopMeta | null,
  kind: "site" | "goods" | "card" | "order" | "coupon" | "content",
  value: string,
): string {
  const dict =
    kind === "site"
      ? meta?.siteStatusLabels
      : kind === "goods"
        ? meta?.goodsStatusLabels
        : kind === "card"
          ? meta?.cardStatusLabels
          : kind === "order"
            ? meta?.orderStateLabels
            : kind === "coupon"
              ? meta?.couponStatusLabels
              : meta?.contentKindLabels;
  return dict?.[value] || FALLBACK[kind]?.[value] || value;
}

export function StatusTag({
  meta,
  kind,
  value,
}: {
  meta: CardShopMeta | null;
  kind: "site" | "goods" | "card" | "order" | "coupon" | "content";
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

/** 卡密列表的一行摘要：卡号存在时显示「卡号 / 卡密」，否则只显示卡密。 */
export function cardSecretLabel(number: string, secret: string) {
  return number ? `${number} / ${secret}` : secret;
}
