"use client";

import {
  CarOutlined,
  GlobalOutlined,
  MedicineBoxOutlined,
  MessageOutlined,
  PayCircleOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  ShopOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { Alert, Button, ConfigProvider, Tag } from "antd";
import { useRouter } from "next/navigation";
import { PageHero, Panel } from "@/components/ui/panel";
import { PublishGuideEntry } from "@/components/mini-program/publish-guide";
import { ToolCard, ToolCardGrid } from "@/components/ui/tool-card";
import { useToolVisibility } from "@/lib/feature-visibility";
import type { ToolLaunchStateView } from "@enterprise/contracts";
import {
  cycleLabel,
  findToolLaunch,
  formatDateTime,
  launchStatusTag,
  useToolLaunchStates,
} from "@/lib/tool-launch";

type BuilderTool = {
  /** 功能目录 code（后台「功能开关」按它关板块）；关掉后本页不再出现这张卡。 */
  feature: string;
  /** RBAC 模块 key（子账号未授权同样不展示）；没有独立模块的留空。 */
  module?: string;
  title: string;
  description: string;
  icon: ReactNode;
  path: string;
  group: "mini" | "web";
};

/**
 * 建站管理（工作台栏目，卡片页）：用户自建、自主运营与上传发布的站点工具集，按载体分两大板块——
 * 「小程序」放微信原生小程序工具（知识付费 / 上门服务 / 品牌商城 / 健康管理 / 多店铺商城平台 / 数字人 / 卡密商城 / 快递寄件），
 * 「Web建站」放浏览器站点工具（国际独立站，独立页面入口；营销工具页内另有同名页签，数据同一套）。
 * 每个工具一张卡、整卡点击进入各自页面；新增建站工具只需在本表加一行并在功能目录挂子码。
 */
const TOOLS: BuilderTool[] = [
  {
    feature: "knowledge-pay",
    module: "knowledge-pay",
    group: "mini",
    icon: <PayCircleOutlined aria-hidden />,
    title: "知识付费云课堂",
    description:
      "建自己的知识付费云课堂：课程与课时目录、图文/音频/视频/直播内容、试看与积分解锁、会员专享、学习进度与完课、课程评价与讲师主页、卡密兑换与每日签到；下载平台统一源码包，在微信开发者工具里自填本站地址与站点编码后上传。",
    path: "/knowledge-pay",
  },
  {
    feature: "onsite",
    module: "onsite",
    group: "mini",
    icon: <TeamOutlined aria-hidden />,
    title: "上门服务小程序",
    description:
      "面向到家服务业（健康美容、维修保洁等）的预约小程序：服务项目与技师档期、上门下单、门店自营与客户侧免登录通道，凭自己的小程序凭据发布上线。",
    path: "/onsite",
  },
  {
    feature: "brand-mall",
    module: "brand-mall",
    group: "mini",
    icon: <ShopOutlined aria-hidden />,
    title: "品牌商城",
    description:
      "自建卖货小程序：店铺与商品、购物车下单、交易参数与物流售后，顾客在小程序内完成购买，数据归店铺自营，代码包上传微信后自运营。",
    path: "/brand-mall",
  },
  {
    feature: "health",
    module: "health",
    group: "mini",
    icon: <MedicineBoxOutlined aria-hidden />,
    title: "健康管理小程序",
    description:
      "建一部自己运营的健康管理小程序：机构与医护入驻审核、服务目录与号源排班、挂号问诊与体检报告、就诊人档案与指标随访、会员券积分与分账提现台账；顾客端与医护工作台分身份出包，收款进你自己的微信商户号，平台不经手。",
    path: "/health",
  },
  {
    feature: "marketplace",
    module: "marketplace",
    group: "mini",
    icon: <ShopOutlined aria-hidden />,
    title: "多店铺商城平台",
    description:
      "把自己做成平台方：创建市场、维护统一类目、审核商户入驻并治理店铺；商户用独立账号在商户后台管理自己的店，资金直进各商户微信商户号，平台不经手。",
    path: "/marketplace",
  },
  {
    feature: "digital-human",
    module: "digital-human",
    group: "mini",
    icon: <VideoCameraOutlined aria-hidden />,
    title: "数字人小程序工具",
    description:
      "建自己的 AI 数字人分身小程序：形象克隆与声音克隆、文案配音合成口播视频、会员套餐与卡密、两级分销与提现，收款进你自有的微信商户号；下载平台统一源码包后在微信开发者工具自助填参数上传。",
    path: "/digital-human",
  },
  {
    feature: "card-shop",
    module: "card-shop",
    group: "mini",
    icon: <WalletOutlined aria-hidden />,
    title: "卡密商城小程序",
    description:
      "自动发卡小商店：导入卡密、上架卡密商品，买家匿名或微信登录下单，支付成功后立即拿到卡密，也能凭单号与联系方式自助查单取卡；收款进你自己的微信商户号，平台不经手资金。",
    path: "/card-shop",
  },
  {
    feature: "kuaidi",
    module: "kuaidi",
    group: "mini",
    icon: <CarOutlined aria-hidden />,
    title: "快递寄件小程序",
    description:
      "开自己的寄件平台：一个账号一部小程序、可建多个寄件点让顾客就近选择；配置快递公司首重/续重与偏远加价，买家选寄收件人自动报价、预约取件，付款后你按状态机安排取件与物流；客服复用 AI 客服，收款进你自己的微信商户号。",
    path: "/kuaidi",
  },
  {
    feature: "errand",
    module: "errand",
    group: "mini",
    icon: <SendOutlined aria-hidden />,
    title: "跑腿小程序",
    description:
      "做同城帮送/帮买：账号负责人就是小程序管理员，一个账号一部小程序；按起步价 + 距离 + 重量 + 夜间与帮买服务费自动计价，骑手在小程序报名、你审核后接单履约，顾客微信支付直达你的商户号；客服复用 AI 客服，AI 调度走平台模型网关，二维码与素材进数字资产。",
    path: "/errand",
  },
  {
    feature: "circle",
    module: "circle",
    group: "mini",
    icon: <MessageOutlined aria-hidden />,
    title: "圈子社区小程序",
    description:
      "开一个自己的圈子社区：账号负责人就是社区管理员，建分类与圈子、审核圈主与成员、管理图文帖与楼中楼评论、处理举报与站内消息；C 端成员独立于站内账号。客服复用 AI 客服，AI 运营助手走平台模型网关，按订阅时间/流量/访问量/浏览量扣积分启动。",
    path: "/circle",
  },
  {
    feature: "global-site",
    group: "web",
    icon: <GlobalOutlined aria-hidden />,
    title: "国际独立站",
    description:
      "拖拽搭建对外站点：页面、菜单、文章与产品按多语言分别维护，发布到平台子域或客户自有域名（TXT + CNAME 自助校验），站点按月扣积分、欠费停服不删数据。",
    path: "/international-site",
  },
];

/** 卡片副行：一句话说清「现在扣不扣钱、什么时候扣」，未启动要点开就看得懂。 */
function launchMeta(state: ToolLaunchStateView): string {
  if (!state.open) {
    // 平台暂停不是用户能自己解开的，卡片不能写「点击设置启动」把人引到一个必然失败的按钮上
    if (state.stopReason === "PLATFORM") {
      return "平台已暂停：顾客端不可访问，也不扣积分 · 请联系平台客服";
    }
    return state.stopReason === "ARREARS"
      ? "欠费已停服：充值后启动即恢复，未启动期间不扣积分"
      : "未启动：顾客端不可访问，也不扣积分 · 点击设置启动";
  }
  if (state.status === "TRIAL") {
    const after = state.plan.billingEnabled
      ? `之后按 ${state.plan.unitPrice} 积分/${state.plan.unitLabel || state.plan.cycleLabel} 自动出账`
      : "之后仍不扣积分";
    return `免费过渡期至 ${formatDateTime(state.trialEndsAt)} · ${after}`;
  }
  if (state.status === "ARREARS") return "欠费宽限中：尽快补齐积分，超期自动停服";
  if (state.ownBilling) return "运行中 · 积分按站点数每月出账（独立站账单）";
  if (!state.plan.billingEnabled) {
    // 按访问/按流量当前只计量不出账：不写「0 积分/0 天」这种看起来像坏了的口径
    return state.plan.cycleDays > 0
      ? "运行中 · 当前口径不扣积分"
      : `运行中 · ${cycleLabel(state.plan.cycle)}口径，本期只计量不出账`;
  }
  return `运行中 · ${state.nextChargeAmount} 积分/${state.cycleDays} 天，下次 ${formatDateTime(state.nextChargeAt)}`;
}

const GROUPS: { key: "mini" | "web"; title: string; extra: string }[] = [
  {
    key: "mini",
    title: "小程序",
    extra: "微信原生小程序工具：下载平台统一源码包，自己在微信开发者工具里填参数、上传与提审发布",
  },
  {
    key: "web",
    title: "Web建站",
    extra: "面向浏览器访问的独立站点工具",
  },
];

export default function SiteBuilderPage() {
  const router = useRouter();
  const { isOpen } = useToolVisibility();
  const visible = TOOLS.filter((tool) => isOpen(tool.feature, tool.module));
  // 启动状态与计费口径来自后端：卡片只负责「一眼看出这工具现在开没开、开起来多少钱」
  const { states, loaded, failed, reload } = useToolLaunchStates();

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <div style={{ display: "grid", gap: 16 }}>
        {loaded && failed ? (
          <Alert
            type="warning"
            showIcon
            message="启动状态没取到"
            description="卡片上的「运行中 / 未启动」标签暂时不是最新，顾客端是否已停服以各工具页的横幅为准。"
            action={
              <Button size="small" onClick={() => void reload()}>
                重试
              </Button>
            }
          />
        ) : null}
        <PageHero
          title="建站管理"
          desc="把自己的生意装进一个可独立运营的站点：小程序板块面向微信原生小程序（平台统一输出源码分发包，下载后在微信开发者工具里自己填参数、编译上传，提审与发布在微信公众平台完成，本站不代编译、不代传）；Web建站板块面向浏览器访问的独立站点。各工具的数据、会员与订单彼此隔离、互不影响。每个工具都要先「启动」才对外营业，也只有启动后才按平台配置的口径扣积分。"
          extra={
            <Button onClick={() => router.push("/site-builder/launch")}>
              启动设置与计费规则
            </Button>
          }
        />
        {GROUPS.map((section) => {
          const tools = visible.filter((tool) => tool.group === section.key);
          // 板块内工具被全部关掉或未按模块授权时，不留空板块。
          if (!tools.length) return null;
          return (
            // 小程序板块的开发/发布说明已独立成页，这里不再用抽屉；Web 板块仍保留站点发布说明抽屉。
            <Panel
              key={section.key}
              title={section.title}
              titleExtra={
                <span className="text-12 muted">{section.extra}</span>
              }
              extra={
                section.key === "mini" ? (
                  <Button
                    type="link"
                    size="small"
                    icon={<QuestionCircleOutlined aria-hidden />}
                    onClick={() => router.push("/site-builder/mini-dev-guide")}
                  >
                    小程序开发与发布
                  </Button>
                ) : (
                  <PublishGuideEntry label="站点发布说明" tool="global-site" />
                )
              }
            >
              <ToolCardGrid>
                {tools.map((tool) => {
                  const launch = findToolLaunch(states, tool.feature);
                  const tag = launch ? launchStatusTag(launch) : null;
                  return (
                    <ToolCard
                      key={tool.path}
                      icon={tool.icon}
                      title={tool.title}
                      tag={
                        tag ? (
                          <Tag color={tag.color} style={{ marginInlineStart: 4 }}>
                            {tag.label}
                          </Tag>
                        ) : null
                      }
                      description={tool.description}
                      meta={launch ? launchMeta(launch) : undefined}
                      onClick={() =>
                        router.push(
                          launch && !launch.open
                            ? `/site-builder/launch?tool=${launch.toolCode}`
                            : tool.path,
                        )
                      }
                    />
                  );
                })}
              </ToolCardGrid>
            </Panel>
          );
        })}
      </div>
    </ConfigProvider>
  );
}
