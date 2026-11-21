"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { MpMarket } from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { ColumnSwitch, PageHero, Panel } from "@/components/ui/panel";
import { CategoryTab } from "./_components/category-tab";
import { CouponTab } from "./_components/coupon-tab";
import { DiyTab } from "./_components/diy-tab";
import { AfterSaleTab } from "./_components/aftersale-tab";
import { FinanceTab } from "./_components/finance-tab";
import { MARKETPLACE_NAV } from "./_components/common";
import { MarketTab } from "./_components/market-tab";
import { MerchantTab } from "./_components/merchant-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ProductAuditTab } from "./_components/product-audit-tab";
import { PublishTab } from "./_components/publish-tab";
import { ScrmTab } from "./_components/scrm-tab";
import { ShopTab } from "./_components/shop-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 多店铺商城平台（B2B2C）运营方工作台（建站管理 → 多店铺商城平台）：
 * 本站用户是市场方——开市场、维护平台类目、审核商户入驻、治理店铺；
 * 商户是独立账号体系，在自己的 `/merchant` 后台登录，买家入口在 B1 期的小程序。
 *
 * 页签深链：`/marketplace?tab=merchant`。
 */
const TAB_DESC: Record<string, string> = {
  overview: "待审商户与在营店铺是第一优先；市场编号是小程序与入驻页的公开寻址码。",
  market:
    "市场名称、门面与主题色决定小程序外观；未支付关单与结算周期是两个交易参数。市场编号创建后不可改，已发布的小程序配置用的是它。",
  category:
    "平台统一类目：商户与店铺只能从这里选经营范围，不能自造。两级树，停用后不再出现在新选择里，存量引用保持可读。",
  diy:
    "市场级页面决定商城首页、分类页与个人中心的样子，店铺级页面归商户自己装修。草稿随便改，点「发布」才快照成买家看到的版本。",
  coupon:
    "平台券全场或指定店铺可用；满减只作用于商品金额，跨店铺父单按各店命中商品额分摊，父单券只对商品部分生效。",
  merchant:
    "入驻申请即一行：通过后系统自动建一个店铺并把负责人账号置为可用；驳回与封禁必须写原因，商户登录时会看到。封禁同时停用账号与店铺。",
  shop: "店铺台账：运营方只做治理，停服只影响买家端展示与下单，商户后台仍可查看数据。",
  productAudit:
    "商户保存商品后必须送审：通过即上架，驳回必须写原因；改内容会退回草稿并要求重新送审。",
  aftersale:
    "商户不处理或买家不服驳回时由运营方仲裁；退款走原路退回，库存回补与佣金冲销按退款单幂等执行，重试不会重复入账。",
  finance:
    "抽佣按「商户专属 > 类目 > 平台默认」生效并在下单瞬间快照；结算只归集周期内已完成且未入账的子单，提现只记台账、平台不经手资金。",
  scrm:
    "把各商户的付款、完成、退款与领券事件异步写进企微客户时间线。交易链路不依赖 SCRM：没接好或关掉时事件留在外发箱，恢复后自动补发。",
  publish:
    "这个小程序归你自己：AppID 与微信支付商户号都是你自己的主体，买家付款直接进你的商户号。代码包是平台统一输出的源码分发包（zip），市场编号与接口域名由你在微信开发者工具里自填，上传、提审与发布都在微信公众平台完成，本站不代编译、不代传。",
};

const TAB_KEYS = MARKETPLACE_NAV.map((item) => item.key) as readonly string[];

export default function MarketplacePage() {
  return (
    <Suspense fallback={<Panel title="多店铺商城平台">正在读取市场信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <MarketplaceInner />
      </ConfigProvider>
    </Suspense>
  );
}

function MarketplaceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState<string>("overview");
  const [market, setMarket] = useState<MpMarket | null>(null);
  const wantedTab = params.get("tab") || "";

  useEffect(() => {
    if (TAB_KEYS.includes(wantedTab)) setTabState(wantedTab);
  }, [wantedTab]);

  const loadMarket = useCallback(async () => {
    try {
      setMarket(await marketplaceApi.detail());
    } catch {
      // 概览/市场设置页签会各自给出可操作提示，这里只用于判断是否存在市场
    }
  }, []);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket, tab]);

  const setTab = (key: string) => {
    setTabState(key);
    const qs = new URLSearchParams(params.toString());
    if (key === "overview") qs.delete("tab");
    else qs.set("tab", key);
    const suffix = qs.toString();
    router.replace(suffix ? `/marketplace?${suffix}` : "/marketplace", { scroll: false });
  };

  return (
    <>
      <PageHero
        title="多店铺商城平台"
        desc={TAB_DESC[tab]}
        extra={
          <>
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => router.push("/site-builder")}
            >
              返回工具总览
            </Button>
            {market ? <MerchantEntry marketCode={market.shopCode} /> : null}
          </>
        }
      />
      <ToolLaunchBanner tool="marketplace" />
      <ColumnSwitch
        value={tab}
        onChange={setTab}
        options={MARKETPLACE_NAV.map((item) => ({ value: item.key, label: item.label }))}
      />
      {tab === "overview" ? <OverviewTab key="overview" onGo={setTab} /> : null}
      {tab === "market" ? (
        <MarketTab key="market" onChanged={() => void loadMarket()} />
      ) : null}
      {tab === "category" ? <CategoryTab key="category" hasMarket={!!market} /> : null}
      {tab === "diy" ? <DiyTab key="diy" hasMarket={!!market} /> : null}
      {tab === "coupon" ? <CouponTab key="coupon" hasMarket={!!market} /> : null}
      {tab === "merchant" ? <MerchantTab key="merchant" hasMarket={!!market} /> : null}
      {tab === "shop" ? <ShopTab key="shop" hasMarket={!!market} /> : null}
      {tab === "productAudit" ? (
        <ProductAuditTab key="productAudit" hasMarket={!!market} />
      ) : null}
      {tab === "aftersale" ? <AfterSaleTab key="aftersale" hasMarket={!!market} /> : null}
      {tab === "finance" ? <FinanceTab key="finance" hasMarket={!!market} /> : null}
      {tab === "scrm" ? <ScrmTab key="scrm" hasMarket={!!market} /> : null}
      {tab === "publish" ? (
        <PublishTab key="publish" hasMarket={!!market} onGoMarket={() => setTab("market")} />
      ) : null}
    </>
  );
}

/** 商户是独立账号体系：把两个对外入口放在页头，运营方直接复制给商户。 */
function MerchantEntry({ marketCode }: { marketCode: string }) {
  return (
    <div className="text-12" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span className="muted">市场编号 {marketCode}</span>
      <a href="/merchant/apply" target="_blank" rel="noreferrer">
        入驻申请页
      </a>
      <a href="/merchant" target="_blank" rel="noreferrer">
        商户后台
      </a>
    </div>
  );
}
