"use client";

import { marketplaceApi } from "@/api/marketplace";
import { MpScrmPanel, type MpScrmApiAdapter } from "@/components/mp-store/scrm-panel";
import { NoMarket } from "./common";

/** 市场级 SCRM：所有商户的订单与领券事件统一写进企微客户时间线，outbox 按商户记账。 */
const marketScrmApi: MpScrmApiAdapter = {
  state: () => marketplaceApi.scrm(),
  toggle: (enabled) => marketplaceApi.scrmToggle({ body: { enabled } }),
  retry: () => marketplaceApi.scrmRetry(),
  replay: () => marketplaceApi.scrmReplay({ body: {} }),
};

export function ScrmTab({ hasMarket }: { hasMarket: boolean }) {
  if (!hasMarket) {
    return <NoMarket desc="先创建市场与店铺，才有顾客事件可以送到企业微信。" />;
  }
  return <MpScrmPanel title="企业微信 SCRM" api={marketScrmApi} />;
}
