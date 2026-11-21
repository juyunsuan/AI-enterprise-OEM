"use client";

import { App, Button, Spin, Table } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { KuaidiOverview } from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { cny, StatBlock } from "./common";
import { useKuaidiScope } from "./scope";

/** 总览：今日寄件看板 + 近 7 天流水柱图 + 履约提醒。 */
export function OverviewTab() {
  const { siteId, site, setTab, meta } = useKuaidiScope();
  const { message } = App.useApp();
  const [data, setData] = useState<KuaidiOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setData(await kuaidiApi.overview({ query: { siteId } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "总览读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <Panel title="今日看板">
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (!data) return <EmptyState text="还没有可展示的数据" />;

  const peak = Math.max(1, ...data.dailyTrend.map((point) => Number(point.revenue || 0)));
  const toPickup = data.pendingPickup + data.pendingPay;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {meta && !meta.limits.enabled ? (
        <Notice variant="warn">
          平台当前暂停了快递寄件板块：站点数据只读，恢复后小程序端自动可用。
        </Notice>
      ) : null}
      {site?.status === "DRAFT" ? (
        <Notice variant="info">
          站点还没上线营业：买家在小程序里暂时无法下单。去「站点设置」确认外观、保价与快递公司后把状态切到「营业中」。
        </Notice>
      ) : null}

      <Panel
        title="今日看板"
        titleExtra={<span className="muted text-12">{site?.name || ""}</span>}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <StatBlock title="今日寄件流水" value={cny(data.todayRevenue)} hint={`今日下单 ${data.todayOrders} 单`} />
          <StatBlock title="待支付订单" value={data.pendingPay} hint="超时自动关闭" />
          <StatBlock title="待取件订单" value={data.pendingPickup} hint="已付款，等待上门取件" />
          <StatBlock title="运输中" value={data.inTransit} hint={`已完成 ${data.completed} 单`} />
          <StatBlock title="累计流水" value={cny(data.totalRevenue)} hint={`累计 ${data.totalOrders} 单`} />
          <StatBlock title="快递公司 / 顾客" value={`${data.companyTotal} / ${data.customerTotal}`} hint="启用的报价条数 / 微信登录买家" />
        </div>
      </Panel>

      <Panel
        title="待办提醒"
        titleExtra={<span className="muted text-12">待支付会过期，待取件与在途要推进履约</span>}
        extra={
          <Button size="small" onClick={() => setTab("order")}>
            去处理
          </Button>
        }
      >
        {toPickup || data.inTransit ? (
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            showHeader={false}
            dataSource={[
              data.pendingPay ? { key: "pay", text: `待支付 ${data.pendingPay} 单（到期未付自动关闭）` } : null,
              data.pendingPickup ? { key: "pickup", text: `待取件 ${data.pendingPickup} 单` } : null,
              data.inTransit ? { key: "transit", text: `在途/已取件 ${data.inTransit} 单` } : null,
            ].filter((item): item is { key: string; text: string } => item !== null)}
            columns={[{ dataIndex: "text" }]}
          />
        ) : (
          <EmptyState text="没有待处理的寄件单" />
        )}
      </Panel>

      <Panel title="近 7 天流水">
        {data.dailyTrend.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {data.dailyTrend.map((point) => (
              <div
                key={point.date}
                style={{ display: "grid", gridTemplateColumns: "92px 1fr 88px", gap: 10, alignItems: "center" }}
              >
                <span className="text-12 muted">{point.date}</span>
                <div style={{ background: "var(--border)", borderRadius: 4, height: 10 }}>
                  <div
                    style={{
                      width: `${Math.round((Number(point.revenue || 0) / peak) * 100)}%`,
                      minWidth: Number(point.revenue) > 0 ? 2 : 0,
                      background: "var(--ant-color-primary, #3370ff)",
                      height: 10,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span className="text-12">
                  {cny(point.revenue)} · {point.orders} 单
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="最近 7 天还没有成交" />
        )}
      </Panel>
    </div>
  );
}
