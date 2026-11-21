"use client";

import { Card, Col, Row, Statistic, Tag } from "antd";
import { EmptyState, Panel } from "@/components/ui/panel";

/** 运营方工作台的页签键（深链 `/marketplace?tab=merchant`）。 */
export const MARKETPLACE_NAV = [
  { key: "overview", label: "概览" },
  { key: "market", label: "市场设置" },
  { key: "category", label: "平台类目" },
  { key: "diy", label: "市场装修" },
  { key: "coupon", label: "平台券" },
  { key: "merchant", label: "商户入驻" },
  { key: "shop", label: "店铺台账" },
  { key: "productAudit", label: "商品送审" },
  { key: "aftersale", label: "售后仲裁" },
  { key: "finance", label: "结算财务" },
  { key: "scrm", label: "企业微信" },
  { key: "publish", label: "小程序发布" },
] as const;

export function StatGrid({
  items,
}: {
  items: { label: string; value: number | string; hint?: string }[];
}) {
  return (
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col key={item.label} xs={12} md={8} xl={4}>
          <Card size="small">
            <Statistic title={item.label} value={item.value} />
            {item.hint ? (
              <div className="text-12 muted" style={{ marginTop: 4 }}>
                {item.hint}
              </div>
            ) : null}
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export function NoMarket({
  title = "还没有市场",
  desc = "先在「市场设置」创建你的多店铺商城平台，拿到市场编号后就可以招商户入驻。",
  action,
}: {
  title?: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel title={title}>
      <EmptyState text={desc} action={action} />
    </Panel>
  );
}

export function MarketStatusTag({
  status,
  labels,
}: {
  status: string;
  labels: Record<string, string>;
}) {
  const color =
    status === "ONLINE"
      ? "green"
      : status === "SUSPENDED"
        ? "red"
        : status === "CLOSED"
          ? "default"
          : "gold";
  return <Tag color={color}>{labels[status] ?? status}</Tag>;
}

/** 市场编号：小程序 config.js 要填这个值，改了等于让已发布代码包失联。 */
export function ShopCodeBadge({ code }: { code: string }) {
  return (
    <Tag
      color="blue"
      style={{ cursor: "copy" }}
      title="点击复制市场编号"
      onClick={() => {
        void navigator.clipboard?.writeText(code);
      }}
    >
      {code}
    </Tag>
  );
}
