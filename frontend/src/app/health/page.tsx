"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ColumnSwitch, Panel, PageHero } from "@/components/ui/panel";
import { CatalogTab } from "./_components/catalog-tab";
import { ContentTab } from "./_components/content-tab";
import { DecorateTab } from "./_components/decorate-tab";
import { FinanceTab } from "./_components/finance-tab";
import { FollowupsTab } from "./_components/followups-tab";
import { GoodsTab } from "./_components/goods-tab";
import { HEALTH_NAV } from "./_components/health-common";
import { HealthScope, ShopSwitcher } from "./_components/health-scope";
import { MarketingTab } from "./_components/marketing-tab";
import { MedicationsTab } from "./_components/medications-tab";
import { MetricsTab } from "./_components/metrics-tab";
import { OrdersTab } from "./_components/orders-tab";
import { OrgansTab } from "./_components/organs-tab";
import { OverviewTab } from "./_components/overview-tab";
import { PatientsTab } from "./_components/patients-tab";
import { PractitionersTab } from "./_components/practitioners-tab";
import { ReleaseTab } from "./_components/release-tab";
import { ReviewsTab } from "./_components/reviews-tab";
import { SettingTab } from "./_components/setting-tab";
import { SlotsTab } from "./_components/slots-tab";
import { StatTab } from "./_components/stat-tab";
import { TeamsTab } from "./_components/teams-tab";
import { WechatTab } from "./_components/wechat-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 健康管理小程序工具（工作台 → 建站管理）：
 * 一个账号可开 N 家店，店铺是数据边界，所有页签共用 query 里的 shopId；
 * 页签深链：`/health?shopId=3&tab=order`。
 *
 * 顾客端与医护端走 `/api/public/health/**` 免登录通道（小程序包里直连），本页只管店主侧。
 */
const TAB_DESC: Record<string, string> = {
  overview: "开店进度与关键存量：缺哪一步就点哪一步，机构、医护、服务、号源、商品与凭据按顺序补齐即可上线。",
  wechat: "小程序凭据与自检：AppID / AppSecret、微信商户号与服务端回调；保存后可在线自检，凭据只进不进出。",
  release: "直接下载统一源码包（zip），再按页内的「小程序发布说明」在微信开发者工具里填本账号的参数、编译上传；提审与发布在你的微信公众平台完成，本站不代传微信。",
  organs: "机构（医院 / 诊所 / 体检中心）与入驻审核：资质件、执业许可与审核人都留痕，驳回必须写原因。",
  practitioners: "医护入驻与资质认证：医生、健管师、药师与导诊师分开维护，审核通过才可上架接单。",
  teams: "团队与家庭医生签约小组：成员分工、团队公告与入团审核。",
  catalog: "服务目录与主数据：服务项目、科室与医院、开通城市、疾病库决定顾客端能挂什么、问什么。",
  slots: "班次模板与号源：批量生成日历、锁号与停诊；号源是挂号与问诊的库存口径。",
  patients: "就诊人与健康档案：基本信息、档案项、病史与分组，是问诊、随访与指标的地基。",
  metrics: "健康指标、预警规则与预警处理：数值型指标带单位与阈值，越界自动生成预警待办。",
  followups: "管理方案、患者方案与随访任务：方案模板决定随访节奏，任务按计划派给医护执行。",
  medications: "用药记录、处方与审方：处方药下单会校验有效处方。",
  goods: "商品、分类、药品字典、快递公司与运费模板：多规格 SKU 逐行定价定库存，上下架即生效。",
  orders: "统一订单与售后：挂号、问诊、体检、商品等业务共用一套状态机，发货与核销在这里推进。",
  marketing: "会员等级与会员卡、优惠券与领券记录、积分规则与流水、推客审核与推广海报。",
  finance: "收益台账、分账规则、银行卡与提现：分账是店内记账口径，平台不经手资金，提现由店主线下打款。",
  content: "分类、文章、社区动态、问答、广播与热词：内容审核通过才对外可见。",
  decorate: "轮播、公告、自定义页面、服务入口与协议：顾客端首页的外观都在这里配。",
  reviews: "评价、统计、回复与申诉处理：差评申诉留痕，违规评价可隐藏。",
  stat: "交易、业务与触达看板：按日看流水、订单结构与关键转化。",
  setting: "店铺资料、交易参数、员工与角色、客服与 SCRM 挂接：停服与留痕都在这页。",
};

const TAB_KEYS = HEALTH_NAV.map((item) => item.key) as readonly string[];

export default function HealthPage() {
  return (
    <Suspense fallback={<Panel title="健康管理">正在读取店铺信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <HealthInner />
      </ConfigProvider>
    </Suspense>
  );
}

function HealthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState("overview");
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
    router.replace(suffix ? `/health?${suffix}` : "/health", { scroll: false });
  };

  return (
    <HealthScope>
      <HealthWorkspace tab={tab} setTab={setTab} />
    </HealthScope>
  );
}

function HealthWorkspace({ tab, setTab }: { tab: string; setTab: (key: string) => void }) {
  const router = useRouter();

  return (
    <>
      <PageHero
        title="健康管理小程序工具"
        desc={TAB_DESC[tab]}
        extra={
          <>
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => router.push("/site-builder")}
            >
              返回工具总览
            </Button>
            <ShopSwitcher />
          </>
        }
      />
      <ToolLaunchBanner tool="health" />
      <ColumnSwitch
        value={tab}
        onChange={setTab}
        options={HEALTH_NAV.map((item) => ({ value: item.key, label: item.label }))}
      />
      {tab === "overview" ? <OverviewTab onNavigate={setTab} /> : null}
      {tab === "wechat" ? <WechatTab /> : null}
      {tab === "release" ? <ReleaseTab onOpenSettings={() => setTab("wechat")} /> : null}
      {tab === "organs" ? <OrgansTab /> : null}
      {tab === "practitioners" ? <PractitionersTab /> : null}
      {tab === "teams" ? <TeamsTab /> : null}
      {tab === "catalog" ? <CatalogTab /> : null}
      {tab === "slots" ? <SlotsTab /> : null}
      {tab === "patients" ? <PatientsTab /> : null}
      {tab === "metrics" ? <MetricsTab /> : null}
      {tab === "followups" ? <FollowupsTab /> : null}
      {tab === "medications" ? <MedicationsTab /> : null}
      {tab === "goods" ? <GoodsTab /> : null}
      {tab === "orders" ? <OrdersTab /> : null}
      {tab === "marketing" ? <MarketingTab /> : null}
      {tab === "finance" ? <FinanceTab /> : null}
      {tab === "content" ? <ContentTab /> : null}
      {tab === "decorate" ? <DecorateTab /> : null}
      {tab === "reviews" ? <ReviewsTab /> : null}
      {tab === "stat" ? <StatTab /> : null}
      {tab === "setting" ? <SettingTab /> : null}
    </>
  );
}
