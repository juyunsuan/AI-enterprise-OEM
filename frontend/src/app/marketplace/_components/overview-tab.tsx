"use client";

import { App, Button, Descriptions } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { MpMarket, MpOverview } from "@enterprise/contracts";
import { MP_MARKET_STATUS_LABELS } from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { MARKETPLACE_NAV, MarketStatusTag, NoMarket, ShopCodeBadge, StatGrid } from "./common";

/** 运营方概览：待审商户是第一优先，其次是店铺在营数。 */
export function OverviewTab({ onGo }: { onGo: (tab: string) => void }) {
  const { message } = App.useApp();
  const [market, setMarket] = useState<MpMarket | null>(null);
  const [overview, setOverview] = useState<MpOverview | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, stats] = await Promise.all([
        marketplaceApi.detail(),
        marketplaceApi.overview(),
      ]);
      setMarket(detail);
      setOverview(stats);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "概览读取失败");
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!market) {
    return (
      <NoMarket
        action={<Button type="primary" onClick={() => onGo("market")}>去创建市场</Button>}
      />
    );
  }

  return (
    <>
      <Panel
        title={`${market.name} 的关键指标`}
        titleExtra={<MarketStatusTag status={market.status} labels={MP_MARKET_STATUS_LABELS} />}
      >
        <StatGrid
          items={[
            { label: "商户总数", value: overview?.merchantTotal ?? 0 },
            {
              label: "待审商户",
              value: overview?.pendingMerchantTotal ?? 0,
              hint: "审核通过后才能上架",
            },
            { label: "店铺总数", value: overview?.shopTotal ?? 0 },
            { label: "在营店铺", value: overview?.onlineShopTotal ?? 0 },
            { label: "平台类目", value: overview?.categoryTotal ?? 0 },
            { label: "近 7 天新商户", value: overview?.weekMerchantTotal ?? 0 },
          ]}
        />
      </Panel>
      <Panel title="市场信息">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="市场名称">{market.name}</Descriptions.Item>
          <Descriptions.Item label="市场编号">
            <ShopCodeBadge code={market.shopCode} />
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <MarketStatusTag status={market.status} labels={MP_MARKET_STATUS_LABELS} />
          </Descriptions.Item>
          <Descriptions.Item label="未支付关单">{market.closeMinutes} 分钟</Descriptions.Item>
          <Descriptions.Item label="结算周期">{market.settleCycleDays} 天</Descriptions.Item>
          <Descriptions.Item label="主题色">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: market.themeColor,
                  display: "inline-block",
                }}
              />
              {market.themeColor}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="简介" span={2}>
            {market.description || "未填写"}
          </Descriptions.Item>
        </Descriptions>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Button onClick={() => onGo("merchant")}>去审核商户</Button>
          <Button onClick={() => onGo("category")}>维护平台类目</Button>
          <Button onClick={() => onGo("shop")}>查看店铺台账</Button>
          <Button type="link" onClick={() => onGo("market")}>
            修改市场设置
          </Button>
        </div>
      </Panel>
      <Panel title="下一步">
        <div className="text-12 muted">
          {MARKETPLACE_NAV.find((item) => item.key === "market")?.label}：
          把市场编号（{market.shopCode}）发给商户即可开始入驻；商户审核通过后系统自动为其开一个店铺，
          商户用申请时的账号在「商户后台」登录。买家小程序与商品交易在 B1 期接入。
        </div>
      </Panel>
    </>
  );
}
