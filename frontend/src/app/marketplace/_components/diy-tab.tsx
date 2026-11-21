"use client";

import { marketplaceApi } from "@/api/marketplace";
import { MpDiyPanel, type MpDiyApiAdapter } from "@/components/mp-store/diy-panel";
import { NoMarket } from "./common";

/** 市场级页面（shopId=0）：商城首页、分类页、个人中心与活动页；店铺级页面归商户自己装修。 */
const marketDiyApi: MpDiyApiAdapter = {
  widgets: () => marketplaceApi.diyWidgets(),
  list: () => marketplaceApi.diyList({ query: { shopId: 0, type: "" } }),
  detail: (id) => marketplaceApi.diyDetail({ query: { id } }),
  save: (body) => marketplaceApi.diySave({ body }),
  publish: (id) => marketplaceApi.diyPublish({ body: { id } }),
  remove: (id) => marketplaceApi.diyRemove({ body: { id } }),
};

export function DiyTab({ hasMarket }: { hasMarket: boolean }) {
  if (!hasMarket) {
    return <NoMarket desc="先创建市场，再装修商城首页与活动页。" />;
  }
  return (
    <MpDiyPanel
      title="市场装修（市场级页面）"
      api={marketDiyApi}
      emptyHint="还没有市场级页面，先新建一个首页"
    />
  );
}
