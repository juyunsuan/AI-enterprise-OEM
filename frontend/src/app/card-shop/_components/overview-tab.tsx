"use client";

import { App, Button, Spin, Table } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { CardShopOverview } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { cny, StatBlock } from "./common";
import { useCardShopScope } from "./scope";

/** 总览：今日看板 + 近 7 天流水柱图 + 库存预警。 */
export function OverviewTab() {
  const { siteId, site, setTab, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [data, setData] = useState<CardShopOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setData(await cardShopApi.overview({ query: { siteId } }));
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

  const peak = Math.max(1, ...data.dailyTrend.map((point) => Number(point.amount || 0)));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {meta && !meta.limits.enabled ? (
        <Notice variant="warn">
          平台当前暂停了卡密商城板块：站点数据只读，恢复后小程序端自动可用。
        </Notice>
      ) : null}
      {site?.status === "DRAFT" ? (
        <Notice variant="info">
          商店还没上线营业：买家在小程序里暂时无法下单。去「站点设置」确认外观与开关后把状态切到「营业中」。
        </Notice>
      ) : null}

      <Panel title="今日看板" titleExtra={<span className="muted text-12">{site?.name || ""}</span>}>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <StatBlock title="今日流水" value={cny(data.todayAmount)} hint={`已支付 ${data.todayPaidOrders} 单`} />
          <StatBlock title="待支付订单" value={data.pendingOrders} hint="超时自动关闭并释放卡密" />
          <StatBlock title="可售卡密" value={data.availableCards} hint={`在售商品 ${data.onlineGoodsTotal}/${data.goodsTotal}`} />
          <StatBlock title="累计流水" value={cny(data.totalAmount)} hint={`累计已付 ${data.totalPaidOrders} 单`} />
          <StatBlock title="顾客" value={data.customerTotal} hint="微信登录过的买家" />
        </div>
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
                      width: `${Math.round((Number(point.amount || 0) / peak) * 100)}%`,
                      minWidth: Number(point.amount) > 0 ? 2 : 0,
                      background: "var(--ant-color-primary, #3370ff)",
                      height: 10,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span className="text-12">
                  {cny(point.amount)} · {point.orders} 单
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="最近 7 天还没有成交" />
        )}
      </Panel>

      <Panel
        title="库存预警"
        titleExtra={<span className="muted text-12">低于商品预警阈值或已售罄的在售商品</span>}
        extra={
          <Button size="small" onClick={() => setTab("card")}>
            去补卡
          </Button>
        }
      >
        {data.stockWarnings.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.stockWarnings}
            columns={[
              { title: "商品", dataIndex: "name", ellipsis: true },
              {
                title: "可售卡密",
                dataIndex: "available",
                width: 120,
                render: (value: number) => (value > 0 ? value : <span style={{ color: "#d4380d" }}>已售罄</span>),
              },
            ]}
          />
        ) : (
          <EmptyState text="在售商品库存都还充足" />
        )}
      </Panel>
    </div>
  );
}
