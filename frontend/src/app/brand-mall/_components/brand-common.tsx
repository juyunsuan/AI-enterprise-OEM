"use client";
import {
  BRAND_COUPON_SCOPE_LABELS,
  BRAND_COUPON_STATUS_LABELS,
  BRAND_COUPON_TYPE_LABELS,
  BRAND_CUSTOMER_SOURCE_LABELS,
  BRAND_CUSTOMER_STATUS_LABELS,
  BRAND_DIY_PAGE_TYPE_LABELS,
  BRAND_DIY_STATUS_LABELS,
  BRAND_ORDER_STATUS_LABELS,
  BRAND_PAY_STATUS_LABELS,
  BRAND_PAY_TYPE_LABELS,
  BRAND_PRODUCT_STATUS_LABELS,
  BRAND_PRODUCT_TYPE_LABELS,
  BRAND_REFUND_STATUS_LABELS,
  BRAND_REFUND_TICKET_STATUS_LABELS,
  BRAND_RETURN_TYPE_LABELS,
  BRAND_SHOP_STATUS_LABELS,
  BRAND_TICKET_STATUS_LABELS,
  MINI_APP_STATUS_LABELS,
  MINI_REVIEW_STATUS_LABELS,
  type BrandMeta,
} from "@enterprise/contracts";
import { Tag } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { moneyCny } from "@/lib/money";

/** 商城各页共用的一层：状态文案/配色、金额与「缺前置条件时给出可点入口」的组件。 */

export const BRAND_NAV = [
  { key: "overview", label: "总览", path: "/brand-mall" },
  { key: "goods", label: "商品", path: "/brand-mall/goods" },
  { key: "order", label: "订单", path: "/brand-mall/order" },
  { key: "refund", label: "售后", path: "/brand-mall/refund" },
  { key: "customer", label: "顾客", path: "/brand-mall/customer" },
  { key: "marketing", label: "优惠券", path: "/brand-mall/marketing" },
  { key: "decorate", label: "页面装修", path: "/brand-mall/decorate" },
  { key: "publish", label: "小程序发布", path: "/brand-mall/publish" },
  { key: "setting", label: "店铺设置", path: "/brand-mall/setting" },
] as const;

export type BrandNavKey = (typeof BRAND_NAV)[number]["key"];

/** 评价的 PENDING/PUBLISHED/HIDDEN 在契约里是内联枚举、没有文案字典，先在端上补齐。 */
const BRAND_LOCAL_REVIEW_LABELS: Record<string, string> = {
  PENDING: "待处理",
  PUBLISHED: "已发布",
  HIDDEN: "已隐藏",
};

/** 状态文案优先取 `BrandMall_meta` 下发的字典（平台改口径不用发版），字典没覆盖到的回落契约常量。 */
const FALLBACK_LABELS: Record<string, Record<string, string>> = {
  shop: BRAND_SHOP_STATUS_LABELS,
  product: BRAND_PRODUCT_STATUS_LABELS,
  productType: BRAND_PRODUCT_TYPE_LABELS,
  order: BRAND_ORDER_STATUS_LABELS,
  pay: BRAND_PAY_STATUS_LABELS,
  refund: BRAND_REFUND_STATUS_LABELS,
  payType: BRAND_PAY_TYPE_LABELS,
  returnType: BRAND_RETURN_TYPE_LABELS,
  refundTicket: BRAND_REFUND_TICKET_STATUS_LABELS,
  customer: BRAND_CUSTOMER_STATUS_LABELS,
  customerSource: BRAND_CUSTOMER_SOURCE_LABELS,
  couponType: BRAND_COUPON_TYPE_LABELS,
  couponScope: BRAND_COUPON_SCOPE_LABELS,
  couponStatus: BRAND_COUPON_STATUS_LABELS,
  ticket: BRAND_TICKET_STATUS_LABELS,
  diyPageType: BRAND_DIY_PAGE_TYPE_LABELS,
  diyStatus: BRAND_DIY_STATUS_LABELS,
  appStatus: MINI_APP_STATUS_LABELS,
  reviewStatus: MINI_REVIEW_STATUS_LABELS,
  review: BRAND_LOCAL_REVIEW_LABELS,
};

/** meta 里确实下发文案字典的字段名（其余 kind 回落契约常量）。 */
type BrandLabelDictKey =
  | "statusLabels"
  | "productStatusLabels"
  | "orderStatusLabels"
  | "payStatusLabels"
  | "refundStatusLabels"
  | "payTypeLabels"
  | "returnTypeLabels"
  | "refundTicketStatusLabels"
  | "customerSourceLabels"
  | "couponTypeLabels"
  | "couponScopeLabels"
  | "couponStatusLabels"
  | "ticketStatusLabels"
  | "diyPageTypeLabels"
  | "reviewStatusLabels";

const META_KEYS: Partial<Record<BrandLabelKind, BrandLabelDictKey>> = {
  shop: "statusLabels",
  product: "productStatusLabels",
  order: "orderStatusLabels",
  pay: "payStatusLabels",
  refund: "refundStatusLabels",
  payType: "payTypeLabels",
  returnType: "returnTypeLabels",
  refundTicket: "refundTicketStatusLabels",
  customerSource: "customerSourceLabels",
  couponType: "couponTypeLabels",
  couponScope: "couponScopeLabels",
  couponStatus: "couponStatusLabels",
  ticket: "ticketStatusLabels",
  diyPageType: "diyPageTypeLabels",
  reviewStatus: "reviewStatusLabels",
};

const COLORS: Record<string, Record<string, string>> = {
  shop: { DRAFT: "default", ONLINE: "success", SUSPENDED: "warning", CLOSED: "default" },
  product: { DRAFT: "default", OFFLINE: "default", ONLINE: "success" },
  productType: { NORMAL: "blue", VIRTUAL: "purple" },
  order: {
    PENDING_PAYMENT: "warning",
    PAID: "processing",
    SHIPPED: "cyan",
    COMPLETED: "success",
    CANCELLED: "default",
  },
  pay: { UNPAID: "default", PAID: "success", REFUNDING: "warning", REFUNDED: "default" },
  refund: {
    NONE: "default",
    PENDING: "warning",
    APPROVED: "processing",
    REJECTED: "error",
    DONE: "success",
  },
  refundTicket: {
    PENDING: "warning",
    AGREED: "processing",
    REJECTED: "error",
    REFUNDED: "success",
    CANCELLED: "default",
  },
  customer: { ACTIVE: "success", BLOCKED: "error" },
  couponStatus: { ONLINE: "success", OFFLINE: "default", ENDED: "default" },
  ticket: { UNUSED: "processing", USED: "success", EXPIRED: "default" },
  review: { PENDING: "warning", PUBLISHED: "success", HIDDEN: "default" },
  diyStatus: { DRAFT: "default", PUBLISHED: "success" },
  appStatus: { UNVERIFIED: "default", VERIFIED: "success", FAILED: "error" },
  reviewStatus: { "": "default", SUBMITTED: "processing", APPROVED: "success", REJECTED: "error" },
};

export type BrandLabelKind = keyof typeof FALLBACK_LABELS & string;

export function brandLabel(
  meta: BrandMeta | null | undefined,
  kind: BrandLabelKind,
  value: string,
): string {
  const metaKey = META_KEYS[kind];
  const dict = metaKey ? meta?.[metaKey] : undefined;
  return dict?.[value] ?? FALLBACK_LABELS[kind]?.[value] ?? value;
}

export function brandColor(kind: BrandLabelKind, value: string): string {
  return COLORS[kind]?.[value] ?? "default";
}

/** 状态徽标：文案永远走字典，未知值原样显示而不是崩掉。 */
export function StatusTag({
  meta,
  kind,
  value,
}: {
  meta?: BrandMeta | null;
  kind: BrandLabelKind;
  value: string;
}) {
  if (!value) return <span className="muted">—</span>;
  return <Tag color={brandColor(kind, value)}>{brandLabel(meta, kind, value)}</Tag>;
}

/** 空值统一显示破折号，避免一串空白列。 */
export function dash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** 金额展示：契约里 money 已是两位小数的数字，端上只做千分位与符号。 */
export function Money({ value }: { value: number }) {
  return <>{moneyCny(value)}</>;
}

/** 「0 元」在运费/门槛这类字段里意思是「不限」，不能写成 ¥0.00 让人以为要收钱。 */
export function MoneyOrUnlimited({
  value,
  zeroText = "不限",
}: {
  value: number;
  zeroText?: string;
}) {
  return <>{value > 0 ? moneyCny(value) : zeroText}</>;
}

/** 拼上当前店铺，跳转后不用自己在每个链接里记 shopId。 */
export function withShop(path: string, shopId: number): string {
  return `${path}${path.includes("?") ? "&" : "?"}shopId=${shopId}`;
}

/**
 * 阻断态入口：任何「现在做不了」的提示都必须带一个能点去解决问题的链接，
 * 不接受只弹一条错误文案（项目反馈记忆的硬要求）。
 */
export function ActionLink({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  return (
    <Link href={path} style={{ padding: "0 4px" }}>
      <span className="text-12">{children}</span>
    </Link>
  );
}

/** 未配小程序码 / 未出包之类的阻断说明。 */
export function BlockHint({
  text,
  path,
  action,
}: {
  text: string;
  path?: string;
  action?: string;
}) {
  return (
    <span className="muted text-12">
      {text}
      {path ? <ActionLink path={path}>{action ?? "去处理"}</ActionLink> : null}
    </span>
  );
}

/** 列表页 `statusCounts` 取数：契约只保证是字符串键的数字表，缺键按 0 处理。 */
export function countOf(counts: Record<string, number> | undefined, key: string) {
  return counts?.[key] ?? 0;
}
