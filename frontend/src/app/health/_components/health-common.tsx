"use client";

import { Space, Table } from "antd";
import type { TableProps } from "antd";
import { Tag } from "antd";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { HealthMeta } from "@enterprise/contracts";
import { moneyCny } from "@/lib/money";

/**
 * 健康管理各页签共用的一层：导航、状态标签、金额与取数。
 * 标签文案优先取 `Health_meta` 下发的字典（平台改口径不用发版），
 * 字典缺省时回落到契约常量，任何时候都不把枚举原样甩到界面上。
 */

export const HEALTH_NAV = [
  { key: "overview", label: "总览" },
  { key: "wechat", label: "微信凭据" },
  { key: "release", label: "小程序发布" },
  { key: "organs", label: "机构" },
  { key: "practitioners", label: "医护" },
  { key: "teams", label: "团队" },
  { key: "catalog", label: "服务目录" },
  { key: "slots", label: "排班号源" },
  { key: "patients", label: "就诊人与档案" },
  { key: "metrics", label: "指标与预警" },
  { key: "followups", label: "方案与随访" },
  { key: "medications", label: "用药与处方" },
  { key: "goods", label: "商品与药品" },
  { key: "orders", label: "订单与售后" },
  { key: "marketing", label: "会员券积分" },
  { key: "finance", label: "资金与提现" },
  { key: "content", label: "内容与社区" },
  { key: "decorate", label: "装修与协议" },
  { key: "reviews", label: "评价" },
  { key: "stat", label: "看板" },
  { key: "setting", label: "店铺设置" },
] as const;

export type HealthNavKey = (typeof HEALTH_NAV)[number]["key"];
export const HEALTH_TAB_KEYS = HEALTH_NAV.map((item) => item.key) as readonly string[];

export const cny = (cents: unknown) => moneyCny(Number(cents || 0) / 100);

type MetaDictKey = Exclude<keyof HealthMeta, "scene" | "timeUnits">;

const FALLBACK: Record<string, Record<string, string>> = {
  shopStatuses: { DRAFT: "未上线", ONLINE: "营业中", SUSPENDED: "平台停服", CLOSED: "已关闭" },
  staffRoles: { OWNER: "店主", OPERATION: "运营", MEDICAL: "医疗管理", PHARMACY: "药师", FINANCE: "财务" },
  practitionerRoles: { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
  auditStatuses: { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已驳回" },
  bizTypes: {
    REGISTER: "挂号",
    CONSULT: "问诊",
    GUIDANCE: "导诊",
    SIGN: "家庭医生签约",
    GREEN: "绿通/手术快约",
    EXAM: "体检",
    REPORT_READ: "报告解读",
    CONCIERGE: "私人医生",
    GOODS: "商品",
    MEMBER: "会员卡",
    RECHARGE: "充值",
  },
  orderStatuses: {
    PENDING_PAYMENT: "待支付",
    PAID: "已支付",
    SERVING: "履约中",
    DELIVERED: "已交付",
    COMPLETED: "已完成",
    REVIEWED: "已评价",
    CANCELLED: "已取消",
    EXPIRED: "已过期",
    REFUND_PENDING: "退款中",
    REFUNDED: "已退款",
    AFTER_SALE: "售后中",
  },
  consultStatuses: {
    WAITING: "待接诊",
    ACCEPTED: "已接诊",
    IN_PROGRESS: "问诊中",
    FINISHED: "已完成",
    CANCELLED: "已取消",
    EXPIRED: "已过期",
  },
  followupWays: { PHONE: "电话", TEXT: "文字", CLINIC: "门诊", SELF: "居家自填" },
  alertRuleTypes: { ABSOLUTE: "绝对上下限", BASELINE: "相对基线", CONSECUTIVE: "连续次数", PERIOD: "时段限定" },
  prescriptionStatuses: {
    DRAFT: "草稿",
    PENDING_REVIEW: "待药师审核",
    APPROVED: "已通过",
    REJECTED: "已驳回",
    REVOKED: "已作废",
  },
  aftersaleKinds: { REFUND_ONLY: "仅退款", RETURN_REFUND: "退货退款", EXCHANGE: "换货" },
  withdrawalStatuses: { PENDING: "待审核", APPROVED: "已通过", PAID: "已打款", REJECTED: "已驳回" },
  earnerKinds: { PRACTITIONER: "医护", ORGAN: "机构", PROMOTER: "推客" },
  crowdKinds: { HYPERTENSION: "高血压", DIABETES: "糖尿病", ELDERLY: "老年", OTHER: "其他" },
  recordItemTypes: { PAST: "既往史", ALLERGY: "过敏史", FAMILY: "家族史", LIFESTYLE: "生活方式", SYMPTOM: "症状" },
  contentKinds: { ARTICLE: "图文", VIDEO: "视频", AUDIO: "音频" },
  diyBlocks: {},
  serviceEntries: {},
};

const ON_LABELS: Record<string, string> = { ON: "启用", OFF: "停用" };

export function labelOf(meta: HealthMeta | null, kind: MetaDictKey, value: string): string {
  const dict = meta?.[kind];
  if (dict && typeof dict === "object" && !Array.isArray(dict)) {
    const hit = (dict as Record<string, string>)[value];
    if (hit) return hit;
  }
  if (kind === "shopStatuses" && FALLBACK.shopStatuses[value]) return FALLBACK.shopStatuses[value];
  return FALLBACK[kind]?.[value] || ON_LABELS[value] || value;
}

export function onOffLabel(value: string): string {
  return ON_LABELS[value] || value;
}

const TONE: Record<string, string> = {
  ONLINE: "green",
  ON: "green",
  APPROVED: "green",
  PAID: "green",
  COMPLETED: "green",
  REVIEWED: "green",
  DONE: "green",
  FINISHED: "green",
  TAKEN: "green",
  PASSED: "green",
  DRAFT: "default",
  OFF: "default",
  CLOSED: "default",
  CANCELLED: "default",
  EXPIRED: "default",
  REVOKED: "default",
  PENDING: "gold",
  PENDING_PAYMENT: "gold",
  PENDING_REVIEW: "gold",
  WAITING: "gold",
  ACCEPTED: "blue",
  IN_PROGRESS: "blue",
  SERVING: "blue",
  DELIVERED: "blue",
  PAID_OUT: "blue",
  SUSPENDED: "red",
  REJECTED: "red",
  OFFLINE: "red",
  FAILED: "red",
  OVERDUE: "red",
  ABNORMAL: "red",
  SEVERE: "red",
};

export function StatusTag({
  meta,
  kind,
  value,
}: {
  meta: HealthMeta | null;
  kind: MetaDictKey;
  value: string;
}) {
  return <Tag color={TONE[value] ?? "default"}>{labelOf(meta, kind, value)}</Tag>;
}

export function OnOffTag({ value }: { value: string }) {
  return <Tag color={TONE[value] ?? "default"}>{onOffLabel(value)}</Tag>;
}

/** 概览与看板用的数字块。 */
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

export function StatsGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 页签内取数：一次拉取 + 手动刷新。
 * `deps` 里的值变化即重拉（店铺切换、筛选变化），`enabled=false` 时不发请求。
 */
export function useHealthResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const depKey = JSON.stringify(deps);

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const next = await fetcherRef.current();
      setData(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void run();
    // depKey 是 deps 的稳定序列化，避免调用方每次渲染新建数组导致死循环。
  }, [run, depKey]);

  return {
    data,
    loading,
    error,
    reload: run,
    setData: (next: T | null) => setData(next),
  };
}

/** 通用「读取失败」提示块，页签里统一文案。 */
export function LoadError({ text }: { text: string }) {
  return (
    <div className="text-12" style={{ color: "var(--danger, #cf1322)" }}>
      读取失败：{text}
    </div>
  );
}

/** 列表筛选条：控件靠左、主操作靠右，超过一行自动折行。 */
export function FilterBar({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <Space wrap size={12} align="end">
        {children}
      </Space>
      {action ? <Space wrap size={8}>{action}</Space> : null}
    </div>
  );
}

/** 服务端分页表格：`total` 缺省按「取满一页就还有下一页」处理。 */
export function DataTable<T>({
  rows,
  columns,
  total,
  page,
  pageSize = 20,
  loading,
  rowKey = "id",
  onPage,
  scroll,
  expandable,
}: {
  rows: T[];
  columns: TableProps<T>["columns"];
  total?: number;
  page: number;
  pageSize?: number;
  loading?: boolean;
  rowKey?: string | ((row: T) => string);
  onPage?: (page: number, pageSize: number) => void;
  scroll?: { x?: number | string; y?: number | string };
  expandable?: TableProps<T>["expandable"];
}) {
  const known = typeof total === "number";
  return (
    <Table<T>
      size="small"
      rowKey={rowKey}
      loading={loading}
      columns={columns}
      dataSource={rows}
      scroll={scroll ?? { x: "max-content" }}
      expandable={expandable}
      pagination={
        onPage
          ? {
              current: page,
              pageSize,
              total: known ? total : page * pageSize + (rows.length >= pageSize ? 1 : 0),
              showSizeChanger: false,
              onChange: onPage,
            }
          : false
      }
    />
  );
}

/** 详情抽屉/弹窗里的键值块：统一「标签在上、值在下」的读法。 */
export function Descriptions({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div className="muted text-12">{item.label}</div>
          <div>{item.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
