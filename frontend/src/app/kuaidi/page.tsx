"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ColumnSwitch, Panel, PageHero } from "@/components/ui/panel";
import { KUAIDI_NAV } from "./_components/common";
import { CompanyTab } from "./_components/company-tab";
import { CustomerTab } from "./_components/customer-tab";
import { OrderTab } from "./_components/order-tab";
import { OverviewTab } from "./_components/overview-tab";
import { PayTab } from "./_components/pay-tab";
import { PublishTab } from "./_components/publish-tab";
import { KuaidiScope, SiteSwitcher } from "./_components/scope";
import { SiteTab } from "./_components/site-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 快递寄件小程序工具（工作台 → 建站管理）：
 * 一个账号一套或多套自己的寄件站——站点外观与开关、快递公司报价、寄件订单履约、
 * 顾客与小程序发布都在这一页的页签里，站点之间数据完全隔离。
 *
 * 买家端走 `/api/public/kuaidi/**` 免登录通道（小程序包里直连），本页只管店主侧。
 * 页签深链：`/kuaidi?siteId=3&tab=order`。
 */
const TAB_DESC: Record<string, string> = {
  overview:
    "本站今日看板：今日寄件流水、待支付单、待取件与在途单一眼看完；近 7 天趋势按已支付订单金额统计。",
  site: "寄件点的门面与交易参数：名称、Logo、主题色、公告决定小程序外观；省市区与地址用于顾客选点和导航；模块开关决定哪些栏目在小程序端整块渲染；保价规则、最大计费重量、支付保留时长与共用收款账户都在这里定。",
  company:
    "快递公司报价：首重/续重价格、偏远省份加收、时效与排序决定买家看到哪几家、算出来多少钱。建站时已铺一份模板，改价即可用；停用后买家端立即不再出现。",
  order:
    "寄件订单台账：待支付超时会自动关闭；已支付订单按「接单 → 取件 → 运输 → 签收 → 完成」推进，取件与运输要填物流单号；异常与退款只做登记，平台不代扣代退。",
  customer: "微信登录过的买家：下单次数、累计金额与最近下单时间；停用后该买家不能再下单。",
  pay: "企业级收款账户：一个微信支付商户号可被多个寄件点共用；买家运费由微信支付直接结算到你的商户号，平台不代扣、不代退、不碰资金。",
  publish:
    "一个账号一部你自己的微信小程序：凭据（AppID / AppSecret）自己填，下载平台统一输出的源码分发包（zip），在微信开发者工具里编译、上传、提审与发布；平台不代编译、不代传，步骤见「小程序发布说明」。顾客进小程序后选寄件点，收款走「收款账户」里的商户号，平台不经手资金。",
};

const TAB_KEYS = KUAIDI_NAV.map((item) => item.key) as readonly string[];

export default function KuaidiPage() {
  return (
    <Suspense fallback={<Panel title="快递寄件">正在读取站点信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <KuaidiInner />
      </ConfigProvider>
    </Suspense>
  );
}

function KuaidiInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState<string>("overview");
  const wantedTab = params.get("tab") || "";

  useEffect(() => {
    if (TAB_KEYS.includes(wantedTab)) setTabState(wantedTab);
  }, [wantedTab]);

  const setTab = (key: string) => {
    setTabState(key);
    const qs = new URLSearchParams(params.toString());
    if (key === "overview") qs.delete("tab");
    else qs.set("tab", key);
    const suffix = qs.toString();
    router.replace(suffix ? `/kuaidi?${suffix}` : "/kuaidi", { scroll: false });
  };

  return (
    <KuaidiScope tab={tab} setTab={setTab}>
      {() => (
        <>
          <PageHero
            title="快递寄件小程序工具"
            desc={TAB_DESC[tab]}
            extra={
              <>
                <Button
                  icon={<ArrowLeftOutlined aria-hidden />}
                  onClick={() => router.push("/site-builder")}
                >
                  返回工具总览
                </Button>
                <SiteSwitcher />
              </>
            }
          />
          <ToolLaunchBanner tool="kuaidi" />
          <ColumnSwitch
            value={tab}
            onChange={setTab}
            options={KUAIDI_NAV.map((item) => ({ value: item.key, label: item.label }))}
          />
          {tab === "overview" ? <OverviewTab key="overview" /> : null}
          {tab === "site" ? <SiteTab key="site" /> : null}
          {tab === "company" ? <CompanyTab key="company" /> : null}
          {tab === "order" ? <OrderTab key="order" /> : null}
          {tab === "customer" ? <CustomerTab key="customer" /> : null}
          {tab === "pay" ? <PayTab key="pay" /> : null}
          {tab === "publish" ? <PublishTab key="publish" /> : null}
        </>
      )}
    </KuaidiScope>
  );
}
