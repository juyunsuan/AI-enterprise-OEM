"use client";

import { useEffect, useState } from "react";
import { Table } from "antd";
import type { ErrandOverview } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { cny, StatBlock } from "./common";

/** 总览：今日流水、各状态单量、骑手在线与近 7 天趋势。 */
export function OverviewTab() {
  const [data, setData] = useState<ErrandOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    errandApi
      .overview()
      .then((row) => setData(row ?? null))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "总览读取失败"));
  }, []);

  if (error) return <Notice variant="error">{error}</Notice>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="今日看板">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatBlock title="今日已支付订单" value={data?.todayOrders ?? 0} hint={`金额 ${cny(data?.todayGmv)}`} />
          <StatBlock title="待支付" value={data?.pendingPay ?? 0} hint="超时会自动关单" />
          <StatBlock title="待接单" value={data?.pendingAccept ?? 0} hint="可人工指派骑手" />
          <StatBlock title="在途" value={data?.inProgress ?? 0} hint={`今日完成 ${data?.completedToday ?? 0} 单`} />
          <StatBlock title="在线骑手" value={data?.onlineRiders ?? 0} hint={`待审核 ${data?.pendingRiders ?? 0} 人`} />
          <StatBlock title="累计订单" value={data?.totalOrders ?? 0} hint={`累计支付 ${cny(data?.totalGmv)}`} />
        </div>
      </Panel>
      <Panel title="分城市看板" titleExtra={<span className="muted text-12">同一账号下的城市/服务区</span>}>
        <Table
          rowKey="cityId"
          size="small"
          pagination={false}
          dataSource={data?.cityStats ?? []}
          columns={[
            { title: "城市", dataIndex: "cityName" },
            { title: "今日订单", dataIndex: "todayOrders", width: 100 },
            { title: "今日金额", width: 120, render: (_, row) => cny(row.todayGmv) },
            { title: "待接单", dataIndex: "pending", width: 90 },
            { title: "在途", dataIndex: "inProgress", width: 80 },
            { title: "在线骑手", dataIndex: "onlineRiders", width: 100 },
          ]}
        />
      </Panel>
      <Panel title="近 7 天已支付趋势" titleExtra={<span className="muted text-12">按下单日统计，已支付订单</span>}>
        <Table
          rowKey="day"
          size="small"
          pagination={false}
          dataSource={data?.trend ?? []}
          columns={[
            { title: "日期", dataIndex: "day" },
            { title: "订单数", dataIndex: "orders" },
            { title: "金额", render: (_, row) => cny(row.amount) },
          ]}
        />
      </Panel>
    </div>
  );
}
