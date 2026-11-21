"use client";

// 数字人小程序工具页面入口：十四个页签共用 ?tab= 深链，概览页的引导也靠 setTab 跳转。
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  AudioOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  GiftOutlined,
  MessageOutlined,
  MoneyCollectOutlined,
  PictureOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ColumnSwitch, PageHero } from "@/components/ui/panel";
import { AssetsTab } from "./_components/assets-tab";
import { CardsTab } from "./_components/cards-tab";
import { ChannelsTab } from "./_components/channels-tab";
import { ContentTab } from "./_components/content-tab";
import { DistributionTab } from "./_components/distribution-tab";
import { FeedbackTab } from "./_components/feedback-tab";
import { LibraryTab } from "./_components/library-tab";
import { MembersTab } from "./_components/members-tab";
import { OrdersTab } from "./_components/orders-tab";
import { OverviewTab } from "./_components/overview-tab";
import { PackagesTab } from "./_components/packages-tab";
import { PublishTab } from "./_components/publish-tab";
import { SettingsTab } from "./_components/settings-tab";
import { WorksTab } from "./_components/works-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

const TAB_KEYS = [
  "overview",
  "settings",
  "channels",
  "members",
  "assets",
  "works",
  "library",
  "packages",
  "orders",
  "cards",
  "distribution",
  "content",
  "feedback",
  "publish",
] as const;

const TAB_DESC: Record<string, string> = {
  overview:
    "站点概况一屏看完：会员、作品、订单、流水、待办。顶部红点来自待处理事项（推广申请、提现、反馈），点卡片直接跳对应页签。渠道状态决定合成能不能跑：四种能力各需一条可用默认渠道。",
  settings:
    "站点门面与经营参数：名称/标语/主题色决定小程序外观，模块开关决定哪些栏目在小程序端整块渲染；计价是每次合成扣多少算力；新人礼是首次登录赠送；克隆时长区间与文案字数上限端上和服务端双重校验；分销比例与提现门槛在这里配置。",
  channels:
    "模型配置沿用本站「渠道」范式：一个能力可配多条渠道、其中一条为默认，密钥密文入库只回显是否已配置。声音克隆/形象训练/语音合成/对口型四种能力，按供应商协议（Fox 聚合 / SyncLabs / 自定义）走不同适配器，测试按钮会带一次轻量探测。",
  members:
    "终端会员是微信小程序里 wx.login 自动建档的用户：这里查三账户余额（算力/形象点/声音点）、会员有效期、推广身份，并做人工补偿（加减点数、增减会员天数、冻结）。流水按账户记录每一笔增减与业务来源，失败退费也会留痕。",
  assets:
    "会员上传的形象与声音素材：形象状态走训练（训练中/可用/失败），声音克隆同理。失败的素材可以在这里删掉让会员重传；删除不影响已生成的作品。",
  works:
    "作品是每次合成任务的结果：状态分合成中/已完成/失败，失败已自动退回算力。任务台账记录每次异步调用（TTS/对口型/克隆）的供应商任务号与重试次数，卡住的任务可以手工重试。",
  library:
    "公共素材库对全站会员可见：音色按分组维护（供应商 speakerId 必填，克隆音色另有会员自己的声音），BGM 按分组维护音频地址与时长。平台内置库（siteId=0）只读，站点可复制成自己的再改。",
  packages:
    "四类充值套餐：会员（天数）、算力、形象点、声音点。价格单位为元，原价用于划线展示；限购次数 0 表示不限；推荐标记在小程序端高亮。套餐删掉不影响已支付订单。",
  orders:
    "订单是会员在小程序里用站点自己的微信商户号支付形成的，平台不经手资金。已支付订单可发起退款：走微信退款接口，成功后自动回收发放的资产并按比例扣回两级佣金。",
  cards:
    "卡密用于线下渠道发货与会员补偿：一次生成 1-1000 张同参数卡密，导出 CSV 给渠道；未使用的卡密可停用，已使用的不能停用或删除。",
  distribution:
    "两级分销：推广员申请按开通方式（自动/付费/人工审核）处理；佣金按订单实付金额与两级比例入账；提现申请时余额已冻结，审核打款或驳回（驳回退回余额）。退款订单的佣金会被自动扣回。",
  content:
    "小程序内容位：首页轮播（跳转用「协议:值」）、图文栏目（教程/公告/关于/隐私/协议）、推广海报版式（只存坐标，头像与小程序码在端上 canvas 合成）、AI 写作模板（支持 [PROMPT]/[WORDS] 占位符）。",
  feedback:
    "会员在小程序里提交的意见反馈（文字+最多三张图）：在这里回复，回复会显示在小程序反馈列表里。",
  publish:
    "发布链路三步：填站点自己的微信小程序 AppID（以及商户号用于收款），下载平台统一输出的源码分发包（zip），在微信开发者工具里编译、上传、提审与发布。平台不代编译、不代传，步骤见「小程序发布说明」。",
};

export default function DigitalHumanPage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>("overview");
  const params = useSearchParams();
  const wantedTab = params.get("tab") || "";
  useEffect(() => {
    if ((TAB_KEYS as readonly string[]).includes(wantedTab)) setTab(wantedTab);
  }, [wantedTab]);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="数字人小程序工具"
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
      <ToolLaunchBanner tool="digital-human" />
      <ColumnSwitch
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: (<><DashboardOutlined aria-hidden /> 概览</>) },
          { value: "settings", label: (<><SettingOutlined aria-hidden /> 站点设置</>) },
          { value: "channels", label: (<><ThunderboltOutlined aria-hidden /> 模型配置</>) },
          { value: "members", label: (<><TeamOutlined aria-hidden /> 会员与流水</>) },
          { value: "assets", label: (<><VideoCameraOutlined aria-hidden /> 形象与声音</>) },
          { value: "works", label: (<><AppstoreOutlined aria-hidden /> 作品与任务</>) },
          { value: "library", label: (<><AudioOutlined aria-hidden /> 素材库</>) },
          { value: "packages", label: (<><ShoppingOutlined aria-hidden /> 套餐</>) },
          { value: "orders", label: (<><MoneyCollectOutlined aria-hidden /> 订单</>) },
          { value: "cards", label: (<><GiftOutlined aria-hidden /> 卡密</>) },
          { value: "distribution", label: (<><UserSwitchOutlined aria-hidden /> 分销</>) },
          { value: "content", label: (<><PictureOutlined aria-hidden /> 内容位</>) },
          { value: "feedback", label: (<><MessageOutlined aria-hidden /> 反馈</>) },
          { value: "publish", label: (<><CloudUploadOutlined aria-hidden /> 小程序发布</>) },
        ]}
      />

      {tab === "overview" ? <OverviewTab key="overview" onOpen={setTab} /> : null}
      {tab === "settings" ? <SettingsTab key="settings" /> : null}
      {tab === "channels" ? <ChannelsTab key="channels" /> : null}
      {tab === "members" ? <MembersTab key="members" /> : null}
      {tab === "assets" ? <AssetsTab key="assets" /> : null}
      {tab === "works" ? <WorksTab key="works" /> : null}
      {tab === "library" ? <LibraryTab key="library" /> : null}
      {tab === "packages" ? <PackagesTab key="packages" /> : null}
      {tab === "orders" ? <OrdersTab key="orders" /> : null}
      {tab === "cards" ? <CardsTab key="cards" /> : null}
      {tab === "distribution" ? <DistributionTab key="distribution" /> : null}
      {tab === "content" ? <ContentTab key="content" /> : null}
      {tab === "feedback" ? <FeedbackTab key="feedback" /> : null}
      {tab === "publish" ? <PublishTab key="publish" /> : null}
    </ConfigProvider>
  );
}
