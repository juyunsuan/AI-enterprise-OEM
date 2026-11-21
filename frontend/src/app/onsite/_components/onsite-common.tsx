"use client";
// 上门服务各页共用的一层：板块导航、状态文案/配色、金额与时间口径。
import {
  ONSITE_ALERT_STATUS_LABELS,
  ONSITE_APPEAL_STATUS_LABELS,
  ONSITE_DISPATCH_MODE_LABELS,
  ONSITE_FORM_FIELD_TYPE_LABELS,
  ONSITE_LABEL_TYPE_LABELS,
  ONSITE_ORDER_ACTION_LABELS,
  ONSITE_ORDER_STATUS_LABELS,
  ONSITE_REFUND_STATUS_LABELS,
  ONSITE_REVIEW_STATUS_LABELS,
  ONSITE_SERVICE_STATUS_LABELS,
  ONSITE_SHOP_STATUS_LABELS,
  ONSITE_SLOT_REASON_LABELS,
  ONSITE_STAFF_STATUS_LABELS,
  ONSITE_TRAVEL_FEE_SOURCE_LABELS,
  ONSITE_WITHDRAWAL_STATUS_LABELS,
} from "@enterprise/contracts";
import { Tag } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { fmtDate, fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";

/**
 * 板块导航：一个菜单入口（`/onsite`）进来后靠这条导航切分工作区，
 * 深链统一带 `?shopId=`，方便站内通知（订单/报警/评价）直接跳到具体店铺的对应页。
 */
export const ONSITE_NAV = [
  { key: "overview", label: "总览", path: "/onsite" },
  { key: "catalog", label: "服务目录", path: "/onsite/catalog" },
  { key: "staff", label: "技师排期", path: "/onsite/staff" },
  { key: "order", label: "订单履约", path: "/onsite/order" },
  { key: "aftersale", label: "售后与安全", path: "/onsite/aftersale" },
  { key: "review", label: "评价口碑", path: "/onsite/review" },
  { key: "customer", label: "顾客私域", path: "/onsite/customer" },
  { key: "marketing", label: "营销增长", path: "/onsite/marketing" },
  { key: "finance", label: "财务分账", path: "/onsite/finance" },
  { key: "agent", label: "代理分销", path: "/onsite/agent" },
  { key: "content", label: "内容运营", path: "/onsite/content" },
  { key: "publish", label: "小程序发布", path: "/onsite/publish" },
  { key: "setting", label: "店铺设置", path: "/onsite/setting" },
] as const;

export type OnsiteNavKey = (typeof ONSITE_NAV)[number]["key"];

/** P0 单页四页签时期的深链（已入库的站内通知链接仍用这套），映射到现在的分区路由。 */
export const LEGACY_TAB_ROUTE: Record<string, string> = {
  overview: "/onsite",
  setting: "/onsite/setting",
  wechat: "/onsite/publish?panel=wechat",
  release: "/onsite/publish?panel=release",
  order: "/onsite/order",
  aftersale: "/onsite/aftersale?panel=refund",
  safety: "/onsite/aftersale?panel=alert",
  review: "/onsite/review",
};

/** 保留当前 query（orderId、alertId 等）只换店铺，切店不丢上下文。 */
export function withShop(path: string, shopId: number): string {
  const [base, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("shopId", String(shopId));
  return `${base}?${params.toString()}`;
}

/** 契约金额一律是整数分，展示层只有这一处换算口径。 */
export const cents = (value: unknown): string =>
  moneyCny(Number(value || 0) / 100);

/** 状态语义色：绿=可服务/完成，蓝=进行中，橙=待处理，红=异常/受限，灰=未上架。 */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "default",
  OFFLINE: "default",
  HIDDEN: "default",
  DISABLED: "default",
  UNPAID: "orange",
  PUBLISHED: "green",
  ONLINE: "green",
  ACTIVE: "green",
  PAID: "green",
  ACCEPTED: "green",
  RESOLVED: "green",
  REFUNDED: "cyan",
  SIGNED: "green",
  REVIEWED: "green",
  COMPLETED: "green",
  PENDING: "orange",
  PENDING_PAYMENT: "orange",
  REFUND_PENDING: "orange",
  PROCESSING: "blue",
  EN_ROUTE: "blue",
  ON_SITE: "blue",
  SERVING: "purple",
  OFF_DUTY: "gold",
  EXPIRED: "default",
  CANCELLED: "default",
  MISFIRE: "default",
  LEFT: "default",
  SUSPENDED: "red",
  REJECTED: "red",
  BLOCKED: "red",
};

/** 同一状态值在不同域里文案不同（如 PENDING：订单待接单 / 评价待审），按 kind 取契约字典。 */
const STATUS_LABELS: Record<string, Record<string, string>> = {
  shop: ONSITE_SHOP_STATUS_LABELS,
  service: ONSITE_SERVICE_STATUS_LABELS,
  staff: ONSITE_STAFF_STATUS_LABELS,
  order: ONSITE_ORDER_STATUS_LABELS,
  orderAction: ONSITE_ORDER_ACTION_LABELS,
  refund: ONSITE_REFUND_STATUS_LABELS,
  review: ONSITE_REVIEW_STATUS_LABELS,
  appeal: ONSITE_APPEAL_STATUS_LABELS,
  alert: ONSITE_ALERT_STATUS_LABELS,
  slotReason: ONSITE_SLOT_REASON_LABELS,
  feeSource: ONSITE_TRAVEL_FEE_SOURCE_LABELS,
  labelType: ONSITE_LABEL_TYPE_LABELS,
  fieldType: ONSITE_FORM_FIELD_TYPE_LABELS,
  dispatch: ONSITE_DISPATCH_MODE_LABELS,
  // 契约里这几个状态是内联枚举、没带文案字典，端上补齐。
  article: { DRAFT: "草稿", PUBLISHED: "已发布", OFFLINE: "已下架" },
  feedback: { PENDING: "待处理", DONE: "已处理" },
  submission: { PENDING: "待跟进", APPROVED: "已通过", REJECTED: "已关闭" },
  customer: { ACTIVE: "正常", BLOCKED: "已拉黑" },
  pay: { UNPAID: "未付款", PAID: "已付款", REFUNDING: "退款中", REFUNDED: "已退款" },
  withdrawal: ONSITE_WITHDRAWAL_STATUS_LABELS,
  settlement: { PENDING: "待打款", PAID: "已打款" },
  recharge: { UNPAID: "待支付", PAID: "已到账", CANCELLED: "已取消", EXPIRED: "已过期" },
  distributor: {
    PENDING: "待审核",
    APPROVED: "已通过",
    REJECTED: "已驳回",
    DISABLED: "已停用",
  },
  agent: { ACTIVE: "启用中", DISABLED: "已停用" },
};

export function statusText(kind: string, value: string): string {
  return STATUS_LABELS[kind]?.[value] ?? value;
}

/**
 * 状态标签：`kind` 只影响文案来源，配色按状态值统一取，
 * 这样「已拉黑/已停服」在任何页签里都是同一个红色，不需要每页各自维护。
 */
export function StatusTag({
  kind,
  value,
  extra,
}: {
  kind: string;
  value: string;
  extra?: ReactNode;
}) {
  if (!value) return <span className="muted">—</span>;
  return (
    <>
      <Tag color={STATUS_COLOR[value] ?? "default"}>
        {statusText(kind, value)}
      </Tag>
      {extra}
    </>
  );
}

/** 只有「已拉黑」这类需要解释的状态值得单列一列；此处用于把契约枚举转成下拉选项。 */
export function statusOptions(kind: string, values: readonly string[]) {
  return [
    { value: "all", label: "全部状态" },
    ...values.map((value) => ({ value, label: statusText(kind, value) })),
  ];
}

/** 时间/日期列口径复用全站统一的 `@/lib/datetime`，这里只转发以便页内一处 import。 */
export const timeText = fmtTime;
export const dayText = fmtDate;

/**
 * 页内分段面板的选中态：状态源是 URL 上的 `?panel=`，
 * 这样站内通知能直接跳到「售后-退款」而不是先落到默认页签再让人自己点。
 * 必须在 `OnsiteShell` 之下调用（外壳已用 Suspense 包住 useSearchParams）。
 */
export function useOnsitePanel(defaultKey: string, allowed: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname() || "/onsite";
  const params = useSearchParams();
  const queryPanel = params.get("panel") ?? "";
  const shopId = Number(params.get("shopId") || 0);
  const value = allowed.includes(queryPanel) ? queryPanel : defaultKey;
  const setValue = useCallback(
    (next: string) => {
      const search = new URLSearchParams(params.toString());
      search.set("panel", next);
      if (shopId) search.set("shopId", String(shopId));
      router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    },
    [params, pathname, router, shopId],
  );
  return [value, setValue] as const;
}
