"use client";

import { Table } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import type { HealthDashboard } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Notice, Panel, PillTabs } from "@/components/ui/panel";
import { fmtDate } from "@/lib/datetime";
import {
  LoadError,
  StatBlock,
  StatsGrid,
  cny,
  labelOf,
  useHealthResource,
} from "./health-common";
import { useHealthMeta, useHealthShopId } from "./health-scope";

/**
 * 经营看板：把店内的顾客、交易、医疗服务与待办并在一页看。
 * 所有数字只反映经营与服务量，不含任何诊断结论或个体健康判断；
 * 图表全部用纯 CSS 画，不引图表库。
 */

const DAY_OPTIONS = [
  { key: "7", label: "近 7 天" },
  { key: "30", label: "近 30 天" },
  { key: "90", label: "近 90 天" },
];

export function StatTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [days, setDays] = useState(30);
  const resource = useHealthResource(
    () => healthApi.dashboard({ query: { shopId, days } }),
    [shopId, days],
  );
  const data = resource.data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Notice variant="info">
        经营看板：只看顾客、交易、服务量与待办，不含诊断结论；需要医疗判断请回到病历与随访记录。
      </Notice>

      <Panel
        title="经营概览"
        titleExtra={
          data ? (
            <span className="muted text-12">
              {fmtDate(data.range.from)} 至 {fmtDate(data.range.to)}
            </span>
          ) : null
        }
        extra={
          <PillTabs
            size="small"
            variant="soft"
            items={DAY_OPTIONS}
            value={String(days)}
            onChange={(key) => setDays(Number(key))}
          />
        }
      >
        {resource.error ? <LoadError text={resource.error} /> : null}
        {!data ? (
          <span className="muted text-12">读取中…</span>
        ) : (
          <StatsGrid>
            <StatBlock title="新增顾客" value={data.customerNew} hint="区间内新注册顾客" />
            <StatBlock title="活跃顾客" value={data.customerActive} hint="区间内有下单或咨询" />
            <StatBlock title="就诊人" value={data.patientCount} hint="已建档的就诊人总数" />
            <StatBlock title="订单量" value={data.orderCount} hint="区间内所有业务订单" />
            <StatBlock title="支付额" value={cny(data.payCents)} hint="已支付金额" />
            <StatBlock title="退款额" value={cny(data.refundCents)} hint="区间内退款金额" />
            <StatBlock title="问诊量" value={data.consultCount} hint="图文/电话/视频问诊合计" />
            <StatBlock
              title="平均接诊"
              value={`${data.consultAvgAcceptMinutes} 分钟`}
              hint="从下单到医护接诊"
            />
            <StatBlock
              title="随访完成率"
              value={`${data.followupDonePercent}%`}
              hint={`完成 ${data.followupDone} / 共 ${data.followupTotal}`}
            />
            <StatBlock title="逾期随访" value={data.followupOverdue} hint="超过计划时间未完成" />
            <StatBlock title="指标记录" value={data.metricLogCount} hint="顾客自填与医护代录合计" />
            <StatBlock title="预警" value={data.alertCount} hint="区间内触发的预警条数" />
            <StatBlock title="未处理预警" value={data.alertOpenCount} hint="需要医护跟进" />
            <StatBlock title="处方" value={data.prescriptionCount} hint="区间内开具的处方数" />
            <StatBlock
              title="待审处方"
              value={data.prescriptionPendingReview}
              hint="等待药师审核"
            />
            <StatBlock title="待发货" value={data.goodsShipPending} hint="商城已付款待发货" />
            <StatBlock title="待售后" value={data.aftersalePending} hint="售后申请待处理" />
            <StatBlock title="待提现" value={data.withdrawalPending} hint="提现申请待审核" />
            <StatBlock title="活跃医护" value={data.practitionerActive} hint="区间内有接诊或履约" />
            <StatBlock
              title="评分"
              value={data.reviewScore}
              hint={`${data.reviewCount} 条评价的平均分`}
            />
          </StatsGrid>
        )}
      </Panel>

      {data ? (
        <>
          <Panel title="每日趋势" titleExtra={<span className="muted text-12">各序列按自身峰值等比，只看走势</span>}>
            <TrendChart points={data.trend} />
          </Panel>

          <Panel title="业务构成" titleExtra={<span className="muted text-12">按订单量占比</span>}>
            <BizMixBars rows={data.bizMix} meta={meta} />
          </Panel>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
            <Panel title="医护排行" titleExtra={<span className="muted text-12">按订单量前 5</span>}>
              <TopPractitioners rows={data.topPractitioners} />
            </Panel>
            <Panel title="待办提醒" titleExtra={<span className="muted text-12">到对应页签处理</span>}>
              <TodoList rows={data.todo} />
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** 纯 CSS 柱图：每日订单、新增顾客、预警三条，支付额只进指标卡与悬浮提示。 */
function TrendChart({ points }: { points: HealthDashboard["trend"] }) {
  if (!points.length) return <span className="muted text-12">区间内还没有数据</span>;
  const maxOrder = Math.max(1, ...points.map((point) => point.orderCount));
  const maxCustomer = Math.max(1, ...points.map((point) => point.customerNew));
  const maxAlert = Math.max(1, ...points.map((point) => point.alertCount));
  const bar = (value: number, max: number) => {
    const percent = Math.round((Number(value || 0) / max) * 100);
    return { height: `${value > 0 ? Math.max(percent, 3) : 0}%`, minHeight: value > 0 ? 2 : 0 };
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }} className="text-12 muted">
        <Legend color="#3370ff" text="订单量" />
        <Legend color="#52c41a" text="新增顾客" />
        <Legend color="#fa8c16" text="预警" />
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 110, minWidth: points.length * 20 }}>
          {points.map((point) => (
            <div
              key={point.day}
              title={`${point.day}：订单 ${point.orderCount}，新增顾客 ${point.customerNew}，预警 ${point.alertCount}，支付 ${cny(point.payCents)}`}
              style={{ display: "flex", gap: 2, alignItems: "flex-end", height: "100%", minWidth: 14 }}
            >
              <div
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: "#3370ff",
                  ...bar(point.orderCount, maxOrder),
                }}
              />
              <div
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: "#52c41a",
                  ...bar(point.customerNew, maxCustomer),
                }}
              />
              <div
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: "#fa8c16",
                  ...bar(point.alertCount, maxAlert),
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="text-12 muted">
        <span>{points[0]?.day ?? ""}</span>
        <span>{points[points.length - 1]?.day ?? ""}</span>
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      {text}
    </span>
  );
}

function BizMixBars({
  rows,
  meta,
}: {
  rows: HealthDashboard["bizMix"];
  meta: ReturnType<typeof useHealthMeta>;
}) {
  if (!rows.length) return <span className="muted text-12">区间内还没有成交，先跑通一单再回来看构成</span>;
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.count, 0));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => {
        const share = Math.round((row.count / total) * 1000) / 10;
        return (
          <div
            key={row.bizType}
            style={{ display: "grid", gridTemplateColumns: "120px 1fr 170px", gap: 10, alignItems: "center" }}
          >
            <span className="text-12">{labelOf(meta, "bizTypes", row.bizType)}</span>
            <div style={{ background: "var(--border)", borderRadius: 4, height: 10 }}>
              <div
                style={{
                  width: `${Math.max(share, row.count > 0 ? 2 : 0)}%`,
                  height: 10,
                  borderRadius: 4,
                  background: "var(--ant-color-primary, #3370ff)",
                }}
              />
            </div>
            <span className="text-12">
              {row.count} 单 · {share}% · {cny(row.payCents)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TopPractitioners({ rows }: { rows: HealthDashboard["topPractitioners"] }) {
  const columns: TableProps<HealthDashboard["topPractitioners"][number]>["columns"] = [
    { title: "医护", dataIndex: "name", width: 120 },
    { title: "订单", dataIndex: "orderCount", width: 80 },
    {
      title: "分成收入",
      dataIndex: "earningCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    { title: "评分", dataIndex: "score", width: 80 },
  ];
  return (
    <Table
      size="small"
      rowKey="practitionerId"
      pagination={false}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 420 }}
    />
  );
}

function TodoList({ rows }: { rows: HealthDashboard["todo"] }) {
  if (!rows.length) return <span className="muted text-12">没有待办，保持住</span>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 6,
          }}
        >
          <span className="text-12">{item.label}</span>
          <strong style={{ color: item.count ? "#cf1322" : undefined }}>{item.count}</strong>
        </div>
      ))}
      <span className="muted text-12">按条目名称到左侧对应页签处理；数字为当前未完成量。</span>
    </div>
  );
}
