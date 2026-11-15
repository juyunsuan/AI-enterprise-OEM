"use client";

import { Descriptions, Table, Tag } from "antd";
import { useGeoSiteBilling } from "@/query/geo-site";
import { Notice } from "@/components/ui/panel";

const BILL_STATUS: Record<string, { label: string; color: string }> = {
  CHARGED: { label: "已扣费", color: "green" },
  WAIVED: { label: "免费额内", color: "blue" },
  ARREARS: { label: "欠费待补", color: "red" },
};

/** 账单只读展示：出账由平台侧的按月批处理驱动，这里给结论与追溯。 */
export function BillingPanel({ siteId }: { siteId: number }) {
  const query = useGeoSiteBilling(siteId);
  const data = query.data;
  if (!data) return null;
  return (
    <div>
      {data.pricingEnabled ? null : (
        <Notice variant="info">平台当前未启用站内建站的积分计费，站点不扣积分。</Notice>
      )}
      {data.currentMonthPoints === 0 && data.pricingEnabled ? (
        <Notice variant="success">
          本站在「每个账号每月前 {data.freeSites} 个站点免费」的额度内，本月不扣积分。
        </Notice>
      ) : null}
      <Descriptions
        column={1}
        size="small"
        bordered
        style={{ marginTop: 12 }}
        items={[
          { key: "price", label: "标准月价", children: `${data.monthPrice} 积分 / 月` },
          {
            key: "current",
            label: "本月应扣",
            children: `${data.currentMonthPoints} 积分（按当月实际天数折算）`,
          },
          {
            key: "next",
            label: "下次出账",
            children: `${data.nextChargeDate} 00:00（每月 1 日批处理）`,
          },
        ]}
      />
      <Table
        rowKey="periodMonth"
        size="small"
        loading={query.isPending}
        dataSource={data.bills}
        pagination={false}
        style={{ marginTop: 12 }}
        columns={[
          { title: "账期", dataIndex: "periodMonth", width: 110 },
          { title: "计费天数", dataIndex: "days", width: 100 },
          {
            title: "积分",
            dataIndex: "pointsAmount",
            width: 110,
            render: (value: number) => `${value} 积分`,
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: string) => {
              const meta = BILL_STATUS[value] || { label: value, color: "default" };
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
        ]}
      />
      <p className="text-12 muted" style={{ marginTop: 10 }}>
        欠费只冻结访问，站点内容与域名配置完整保留；积分充值后由日批自动补扣并恢复访问。
      </p>
    </div>
  );
}
