"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ColumnSwitch, PageHero, Panel } from "@/components/ui/panel";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";
import { ERRAND_NAV } from "./_components/common";
import { ErrandScope } from "./_components/scope";
import { OverviewTab } from "./_components/overview-tab";
import { SiteTab } from "./_components/site-tab";
import { CityTab } from "./_components/city-tab";
import { OrderTab } from "./_components/order-tab";
import { RiderTab } from "./_components/rider-tab";
import { CustomerTab } from "./_components/customer-tab";
import { CouponTab } from "./_components/coupon-tab";
import { WalletTab } from "./_components/wallet-tab";
import { AgentTab } from "./_components/agent-tab";
import { AiTab } from "./_components/ai-tab";
import { PublishTab } from "./_components/publish-tab";

/**
 * 跑腿小程序工具（工作台 → 建站管理）：
 * 账号负责人即小程序管理员；站点、计价、订单、骑手、优惠券、钱包与发布都在这一页。
 *
 * 顾客与骑手走 `/api/public/errand/**` 免登录通道（小程序包直连），本页只管店主侧。
 * 页签深链：`/errand?tab=order`。
 */
const TAB_DESC: Record<string, string> = {
  overview: "本站今日看板：流水、待接单、在途与骑手在线情况一眼看完；近 7 天趋势按已支付订单金额统计。",
  site: "站点门面：名称、Logo、主题色、公告、联系方式、栏目开关与 AI 客服绑定；多城市计价在「服务城市」里按城市分别维护。",
  city: "服务城市：同一账号下可开多个城市/服务区，每个城市独立计价、抢单半径、自动派单、骑手分成与优惠券；停用城市后顾客看不到、骑手不能再接该城订单。",
  order: "跑腿订单台账：待支付超时自动关闭；已支付后按「待接单 → 接单 → 取件 → 配送 → 送达 → 完成」推进；可人工指派骑手，异常与退款只做登记，平台不代扣代退。",
  rider: "骑手报名审核：小程序里提交姓名/手机号/证件照后在这里通过或拒绝；通过后才能切「接单中」，拒绝要写清原因。",
  customer: "小程序顾客台账：昵称、订单与累计金额、积分余额；停用后该微信不能继续下单，历史订单不受影响。",
  coupon: "优惠券：满减或折扣，设置门槛、总量与有效期；顾客在小程序领取，下单时自动校验门槛并抵扣。",
  wallet: "骑手钱包：每单跑腿劳务收入进骑手余额，提现申请由店主核对打款或驳回；资金在店主线下账户间流转，平台只记台账。",
  agent: "城市代理：下游独立账号（手机号+密码），由平台账号创建；按负责城市从服务费分佣，代理可登录独立后台查看订单、佣金与申请提现。",
  ai: "AI 辅助：调度建议按订单与在线骑手给出候选与理由；经营复盘按近 N 天数据给结论与建议。两处都走账号在「模型设置」里配的平台模型网关，未配置模型时自动回落规则式结论。",
  publish:
    "一个账号一部你自己的微信小程序：凭据自己填，下载平台统一源码分发包后在微信开发者工具里编译、上传、提审与发布；平台不代编译、不代传。",
};

const TAB_KEYS = ERRAND_NAV.map((item) => item.key) as readonly string[];

export default function ErrandPage() {
  return (
    <Suspense fallback={<Panel title="跑腿小程序">正在读取站点信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <ErrandInner />
      </ConfigProvider>
    </Suspense>
  );
}

function ErrandInner() {
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
    router.replace(suffix ? `/errand?${suffix}` : "/errand", { scroll: false });
  };

  return (
    <ErrandScope tab={tab} setTab={setTab}>
      {({ site }) => (
        <>
          <PageHero
            title={site ? `跑腿小程序 · ${site.name}` : "跑腿小程序"}
            desc={TAB_DESC[tab]}
            extra={
              <Button
                icon={<ArrowLeftOutlined aria-hidden />}
                onClick={() => router.push("/site-builder")}
              >
                返回工具总览
              </Button>
            }
          />
          <ToolLaunchBanner tool="errand" />
          <ColumnSwitch
            value={tab}
            onChange={setTab}
            options={ERRAND_NAV.map((item) => ({ value: item.key, label: item.label }))}
          />
          {tab === "overview" ? <OverviewTab key="overview" /> : null}
          {tab === "site" ? <SiteTab key="site" /> : null}
          {tab === "city" ? <CityTab key="city" /> : null}
          {tab === "order" ? <OrderTab key="order" /> : null}
          {tab === "rider" ? <RiderTab key="rider" /> : null}
          {tab === "customer" ? <CustomerTab key="customer" /> : null}
          {tab === "coupon" ? <CouponTab key="coupon" /> : null}
          {tab === "wallet" ? <WalletTab key="wallet" /> : null}
          {tab === "agent" ? <AgentTab key="agent" /> : null}
          {tab === "ai" ? <AiTab key="ai" /> : null}
          {tab === "publish" ? <PublishTab key="publish" /> : null}
        </>
      )}
    </ErrandScope>
  );
}
