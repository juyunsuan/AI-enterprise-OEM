"use client";

// 知识付费云课堂工具页面入口：九个页签（基础设置/内容分类/课程内容/首页装修/卡密/会员与订单/学习数据/评价管理/发布与上传）共用 ?tab= 深链。
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CloudUploadOutlined,
  CommentOutlined,
  CompassOutlined,
  GiftOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  SettingOutlined,
  SkinOutlined,
  SolutionOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ColumnSwitch, PageHero } from "@/components/ui/panel";
import { CardsTab } from "./_components/cards-tab";
import { CategoriesTab } from "./_components/categories-tab";
import { ContentTab } from "./_components/content-tab";
import { DecorTab } from "./_components/decor-tab";
import { LearningsTab } from "./_components/learnings-tab";
import { MembersTab } from "./_components/members-tab";
import { NavPageTab } from "./_components/navpage-tab";
import { PublishTab } from "./_components/publish-tab";
import { ReviewsTab } from "./_components/reviews-tab";
import { SettingsTab } from "./_components/settings-tab";
import { TeachersTab } from "./_components/teachers-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 每个平台账号一套自己的知识付费云课堂站点：这里管站点配置、分类、课程与课时、
 * 首页装修（轮播/公告/精选位）、卡密、终端会员、解锁订单、学习数据与课程评价，
 * 并把模板小程序（仓库 miniprogram-kp/）打包成 zip 供下载，用户在自己电脑上传微信并提审发布。
 */
const TAB_KEYS = [
  "settings",
  "categories",
  "content",
  "teachers",
  "decor",
  "navpage",
  "cards",
  "members",
  "learnings",
  "reviews",
  "publish",
] as const;

const TAB_DESC: Record<string, string> = {
  settings:
    "站点的门面都在这里：站点名称、标语、主题色决定小程序外观，模块开关决定哪些栏目在小程序端整块渲染（关掉的模块终端用户完全看不到）。会员定价三档与 7 天签到奖励是积分体系的价格表；微信凭据（AppID / AppSecret）是登录与小程序码的钥匙，填好后可以先「连接自检」再去做代码包。",
  categories:
    "分类是小程序首页与分类页的栏目骨架：标题、封面、排序都在这维护，首页展示顺序按排序号。分类下还挂着课程时被删除会被后端拦截，先把课程挪走再删分类。",
  content:
    "课程是云课堂的货：视频 / 音频 / 图文 / 图片 / 直播五种形态决定默认播放组件，解锁方式分免费获取、积分购买、会员专享三种，另可设置微信支付价。一门课程由章节与课时组成——点行内「课时」编排目录、设置试看与章节；讲师、现金价与上架审核状态也在编辑弹窗里维护。",
  teachers:
    "讲师档案统一维护：姓名、头衔、头像、简介与排序。课程关联讲师后，小程序课程详情展示讲师卡并可进入讲师主页，查看其全部已上架课程。",
  decor:
    "首页装修三件套：轮播图、公告、精选推荐位。跳转统一用「协议:值」写法（resource:<课程ID>、notice:<公告ID>、url:<https 链接>、app:<appid>|<路径>、none 不跳转），改动即时生效到小程序首页，模块显隐去「基础设置」的开关组控制。",
  navpage:
    "「发现」页导航与自定义单页：导航可跳课程、单页、外链或他方小程序；单页用于关于我们、用户协议、活动说明等长文，按富文本在小程序端渲染。",
  cards:
    "卡密用于线下渠道发货与会员补偿：会员天数卡按天充值会员、积分充值卡到账积分、内容直通券解锁指定课程。一次可生成 1-500 张同参数卡密并整批复制；已使用的卡密是兑换台账，不能停用或删除。",
  members:
    "会员是小程序端用 wx.login 自动建档的终端用户：这里可以查积分、会员有效期、连签、解锁与学习记录，并做人工补偿（积分增减、会员天数增减、停用）。订单台账记录每一次解锁的支付方式与消耗积分，免费获取与会员免费也会留痕。",
  learnings:
    "学习数据按「会员 × 课时」记录播放位置与完课状态：可以按课程、会员或课时搜索，查看谁在学、学到哪一节。完课由学员标记或播放至 90% 自动判定，用于评估课程完成率。",
  reviews:
    "评价管理汇总学员评分与留言：解锁课程的会员才能评价，同一人对同一课程只保留最新一条。站点方可以回复（展示在评价下方）、隐藏或删除，隐藏后小程序端列表不再展示但仍保留数据。",
  publish:
    "直接下载统一源码包（zip），解压后在微信开发者工具里按「小程序发布说明」填好本账号的 apiBase、租户码、AppID 与主题色，编译预览无误再自己上传；提交审核与发布在你自己的微信公众平台完成，本站不代传微信。没有生成步骤，也没有发布台账。",
};

const TAB_OPTIONS = [
  { value: "settings", label: (<><SettingOutlined aria-hidden /> 基础设置</>) },
  { value: "categories", label: (<><AppstoreOutlined aria-hidden /> 内容分类</>) },
  { value: "content", label: (<><PlayCircleOutlined aria-hidden /> 课程内容</>) },
  { value: "teachers", label: (<><SolutionOutlined aria-hidden /> 讲师管理</>) },
  { value: "decor", label: (<><SkinOutlined aria-hidden /> 首页装修</>) },
  { value: "navpage", label: (<><CompassOutlined aria-hidden /> 导航与单页</>) },
  { value: "cards", label: (<><GiftOutlined aria-hidden /> 卡密</>) },
  { value: "members", label: (<><TeamOutlined aria-hidden /> 会员与订单</>) },
  { value: "learnings", label: (<><ReadOutlined aria-hidden /> 学习数据</>) },
  { value: "reviews", label: (<><CommentOutlined aria-hidden /> 评价管理</>) },
  { value: "publish", label: (<><CloudUploadOutlined aria-hidden /> 发布与上传</>) },
];

export default function KnowledgePayPage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>("settings");
  // 深链：/knowledge-pay?tab=content，阻断性提示（如「去基础设置」）也靠 setTab 跳转。
  const params = useSearchParams();
  const wantedTab = params.get("tab") || "";
  useEffect(() => {
    if ((TAB_KEYS as readonly string[]).includes(wantedTab)) setTab(wantedTab);
  }, [wantedTab]);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="知识付费云课堂"
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
      <ToolLaunchBanner tool="knowledge-pay" />
      <ColumnSwitch value={tab} onChange={setTab} options={TAB_OPTIONS} />

      {tab === "settings" ? <SettingsTab key="settings" /> : null}
      {tab === "categories" ? <CategoriesTab key="categories" /> : null}
      {tab === "content" ? <ContentTab key="content" /> : null}
      {tab === "teachers" ? <TeachersTab key="teachers" /> : null}
      {tab === "decor" ? <DecorTab key="decor" /> : null}
      {tab === "navpage" ? <NavPageTab key="navpage" /> : null}
      {tab === "cards" ? <CardsTab key="cards" /> : null}
      {tab === "members" ? <MembersTab key="members" /> : null}
      {tab === "learnings" ? <LearningsTab key="learnings" /> : null}
      {tab === "reviews" ? <ReviewsTab key="reviews" /> : null}
      {tab === "publish" ? (
        <PublishTab key="publish" onOpenSettings={() => setTab("settings")} />
      ) : null}
    </ConfigProvider>
  );
}
