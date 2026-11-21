"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ColumnSwitch, Panel, PageHero } from "@/components/ui/panel";
import { CARD_SHOP_NAV } from "./_components/common";
import { CardTab } from "./_components/card-tab";
import { ContentTab } from "./_components/content-tab";
import { CouponTab } from "./_components/coupon-tab";
import { CustomerTab } from "./_components/customer-tab";
import { GoodsTab } from "./_components/goods-tab";
import { OrderTab } from "./_components/order-tab";
import { OverviewTab } from "./_components/overview-tab";
import { PublishTab } from "./_components/publish-tab";
import { CardShopScope } from "./_components/scope";
import { SiteTab } from "./_components/site-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 卡密商城小程序工具（工作台 → 建站管理）：
 * 一个账号一家自己的卡密商店——站点外观与开关、分类与卡密商品、卡密导入与批次、
 * 订单与取卡凭据、券码、顾客、公告内容都在这一页的页签里。
 *
 * 买家端走 `/api/public/card-shop/**` 免登录通道（小程序包里直连），本页只管店主侧。
 * 页签深链：`/card-shop?siteId=3&tab=order`。
 */
const TAB_DESC: Record<string, string> = {
  overview:
    "本站的今日看板：流水、待支付单、在售商品与可售卡密一眼看完；库存预警会列出低于阈值或已售罄的在售商品，点「去补卡」直接进卡密导入。",
  site: "站点的门面与交易参数：名称、Logo、主题色、公告决定小程序外观；模块开关决定哪些栏目在小程序端整块渲染；锁单时长决定下单后多久未付款自动关单并把卡密放回库存。",
  goods:
    "卡密商品与分类：价格、起购限购、批发阶梯、取卡方式（是否要取卡密码）、联系方式要求、访问密码与库存预警都在这里维护；上架后买家才能在小程序里看到并下单。",
  card:
    "卡密库存与批次：按商品导入（文本粘贴或读入文件，自动识别分隔符、去重、可打乱顺序），列表默认掩码；导出明文前请确认在可信设备上保存。撤回批次只作废未售出的卡密。",
  order:
    "订单台账：待支付超时会自动关闭并释放锁卡；已支付订单可查看出货卡密明文、补发通知，关闭待支付单会立即把占用的卡密放回可售。",
  coupon: "券码：批量生成固定金额或按比例折让的券码，可限定分类与最低金额；下单锁券、关单自动退回，已核销的券留台账。",
  customer: "微信登录过的买家：下单次数、累计金额与最近下单时间；停用后该买家不能再下单。",
  content:
    "公告、资讯与单页：公告对应首页公告栏，资讯与单页进入小程序「资讯」栏目；公告可设为进店自动弹出。",
  publish:
    "一站一部你自己的微信小程序：凭据（AppID / AppSecret / 微信支付商户号）自己填，下载平台统一输出的源码分发包（zip），在微信开发者工具里编译、上传、提审与发布；平台不代编译、不代传，步骤见「小程序发布说明」。买家付款直接进你自己的商户号，平台不经手资金。",
};

const TAB_KEYS = CARD_SHOP_NAV.map((item) => item.key) as readonly string[];

export default function CardShopPage() {
  return (
    <Suspense fallback={<Panel title="卡密商城">正在读取站点信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <CardShopInner />
      </ConfigProvider>
    </Suspense>
  );
}

function CardShopInner() {
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
    router.replace(suffix ? `/card-shop?${suffix}` : "/card-shop", { scroll: false });
  };

  return (
    <CardShopScope tab={tab} setTab={setTab}>
      {() => (
        <>
          <PageHero
            title="卡密商城小程序工具"
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
          <ToolLaunchBanner tool="card-shop" />
          <ColumnSwitch
            value={tab}
            onChange={setTab}
            options={CARD_SHOP_NAV.map((item) => ({ value: item.key, label: item.label }))}
          />
          {tab === "overview" ? <OverviewTab key="overview" /> : null}
          {tab === "site" ? <SiteTab key="site" /> : null}
          {tab === "goods" ? <GoodsTab key="goods" /> : null}
          {tab === "card" ? <CardTab key="card" /> : null}
          {tab === "order" ? <OrderTab key="order" /> : null}
          {tab === "coupon" ? <CouponTab key="coupon" /> : null}
          {tab === "customer" ? <CustomerTab key="customer" /> : null}
          {tab === "content" ? <ContentTab key="content" /> : null}
          {tab === "publish" ? <PublishTab key="publish" /> : null}
        </>
      )}
    </CardShopScope>
  );
}
