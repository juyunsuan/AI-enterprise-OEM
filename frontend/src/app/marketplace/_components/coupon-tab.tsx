"use client";

import { useEffect, useState } from "react";
import { marketplaceApi } from "@/api/marketplace";
import { MpCouponPanel, type MpCouponApiAdapter } from "@/components/mp-store/coupon-panel";
import { NoMarket } from "./common";

/** 平台券：市场方发、全场或指定店铺可用；商户券由商户在自己的后台发。 */
const platformCouponApi: MpCouponApiAdapter = {
  list: (query) => marketplaceApi.coupons({ query }),
  save: (body) => marketplaceApi.couponSave({ body }),
  status: (body) => marketplaceApi.couponStatus({ body }),
};

export function CouponTab({ hasMarket }: { hasMarket: boolean }) {
  const [shops, setShops] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!hasMarket) return;
    let alive = true;
    void marketplaceApi
      .shops({ query: { page: 1, pageSize: 200, keyword: "", status: "" } })
      .then((result) => {
        if (alive) {
          setShops((result?.list ?? []).map((shop) => ({ id: shop.id, name: shop.name })));
        }
      })
      .catch(() => {
        // 店铺列表只用于「指定店铺」下拉，读不到不阻塞券管理
      });
    return () => {
      alive = false;
    };
  }, [hasMarket]);

  const api = platformCouponApi;

  if (!hasMarket) {
    return <NoMarket desc="先创建市场，才能发平台券。" />;
  }
  return (
    <MpCouponPanel
      title="平台券"
      api={api}
      shops={shops}
      allowShopScope
      emptyHint="还没有平台券，新建一张吸引买家"
    />
  );
}
