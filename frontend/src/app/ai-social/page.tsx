"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  CodeOutlined,
  CommentOutlined,
  FileTextOutlined,
  IdcardOutlined,
  MailOutlined,
  MessageOutlined,
  SolutionOutlined,
  SwapOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Result, Spin } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError, ErrorCode } from "@enterprise/contracts";
import { aiSocialApi } from "@/api/ai-social";
import {
  PageHero,
  Panel,
  Translatable,
} from "@/components/ui/panel";
import { ToolCard, ToolCardGrid } from "@/components/ui/tool-card";
import { useSession } from "@/lib/session";

/** 入口 key → 图标与文案；实际地址由后端按部署环境给出，前端不拼域名。 */
const ENTRY: Record<
  string,
  { label: string; description: string; icon: ReactNode }
> = {
  chat: {
    label: "打开聊天",
    description: "与 AIworkin 上的联系人、群聊和数字分身对话。",
    icon: <MessageOutlined aria-hidden />,
  },
  twins: {
    label: "我的分身",
    description: "管理数字分身与绑定的 SKILL，让分身替你接待与协作。",
    icon: <UserOutlined aria-hidden />,
  },
  discover: {
    label: "发现人脉",
    description: "按行业、技能与关系度数发现同行，直接发起连接。",
    icon: <SolutionOutlined aria-hidden />,
  },
  groups: {
    label: "小组",
    description: "加入或创建兴趣小组，参与讨论与内容共创。",
    icon: <CommentOutlined aria-hidden />,
  },
  hiring: {
    label: "招聘",
    description: "发布岗位、浏览招聘广场，与候选人直接沟通。",
    icon: <TeamOutlined aria-hidden />,
  },
  matching: {
    label: "撮合",
    description: "在供需市场里撮合需求与服务，直接对接合作方。",
    icon: <SwapOutlined aria-hidden />,
  },
  skills: {
    label: "技能市场",
    description: "浏览、安装与发布 AI 技能包，扩展分身能力。",
    icon: <ThunderboltOutlined aria-hidden />,
  },
  apps: {
    label: "应用市场",
    description: "发现 AIworkin 上的应用与工具。",
    icon: <AppstoreOutlined aria-hidden />,
  },
  friends: {
    label: "好友",
    description: "查看好友、好友申请与关注关系。",
    icon: <UserSwitchOutlined aria-hidden />,
  },
  mail: {
    label: "站内私信",
    description: "查看 AIworkin 私信与好友申请结果。",
    icon: <MailOutlined aria-hidden />,
  },
  notifications: {
    label: "通知",
    description: "打开 AIworkin 通知中心，查看全部社交通知。",
    icon: <BellOutlined aria-hidden />,
  },
  developers: {
    label: "开发者",
    description: "开发者入口：API Key、应用与集成。",
    icon: <CodeOutlined aria-hidden />,
  },
  profile: {
    label: "我的主页",
    description: "维护对外展示的主页、工作室与公开资料。",
    icon: <IdcardOutlined aria-hidden />,
  },
  resume: {
    label: "我的简历",
    description: "维护职场简历，供招聘方查看。",
    icon: <FileTextOutlined aria-hidden />,
  },
};

/** 与更新后的 DSH 插件面板同构：主入口 / 更多 / 交流与治理 / 我的。 */
const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: "主入口", keys: ["chat", "twins", "discover", "groups"] },
  { title: "更多", keys: ["hiring", "matching", "skills", "apps"] },
  {
    title: "交流与治理",
    keys: ["friends", "mail", "notifications", "developers"],
  },
  { title: "我的", keys: ["profile", "resume"] },
];

const DESC =
  "社交能力由 AIworkin 的 DSH 社交插件提供：聊天、数字分身、人脉、小组、招聘与撮合都在 AIworkin 侧完成，数据不在本站保存。";

export default function AiSocialPage() {
  const { me } = useSession();
  const entry = useQuery({
    queryKey: ["ai-social-entry", me?.userId || ""],
    queryFn: () => aiSocialApi.entry(),
    enabled: !!me,
  });
  const data = entry.data;

  if (entry.error) {
    const closed =
      entry.error instanceof ApiError &&
      entry.error.code === ErrorCode.FEATURE_CLOSED.code;
    return (
      <>
        <PageHero title="AI社交" desc={DESC} />
        <Panel title="AI社交">
          <Result
            status={closed ? "info" : "warning"}
            title={closed ? "该功能暂未开放" : "AI社交暂时不可用"}
            subTitle={
              closed
                ? "平台管理员已关闭该入口，请联系管理员开启后再试。"
                : entry.error.message
            }
          />
        </Panel>
      </>
    );
  }

  if (entry.isPending || !me) {
    return (
      <>
        <PageHero title="AI社交" desc={DESC} />
        <Panel title="AI社交">
          <div style={{ display: "grid", placeItems: "center", minHeight: 220 }}>
            <Spin />
          </div>
        </Panel>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHero title="AI社交" desc={DESC} />
        <Panel title="AI社交">
          <Result
            status="warning"
            title="AI社交暂时不可用"
            subTitle="没有取到入口配置，请稍后重试或联系平台管理员。"
          />
        </Panel>
      </>
    );
  }

  if (!data.keyBound) {
    const inactive = data.state === "KEY_INACTIVE";
    return (
      <>
        <PageHero title="AI社交" desc={DESC} />
        <Panel title="准入校验">
          <Result
            status="warning"
            title={
              inactive ? "绑定的 API Key 已失效" : "先绑定 AIPDD API Key"
            }
            subTitle={
              inactive
                ? "请到「模型服务 → API Key 管理」重新绑定一把可用的 AIPDD API Key。"
                : "AI社交使用你的 AIPDD API Key 作为身份与授权凭据，绑定后即可进入。"
            }
            extra={
              <Link href="/developer/keys">
                <Button type="primary">
                  {inactive ? "重新绑定" : "去绑定 API Key"}
                </Button>
              </Link>
            }
          />
        </Panel>
      </>
    );
  }

  if (!data.links.length) {
    return (
      <>
        <PageHero title="AI社交" desc={DESC} />
        <Panel title="入口配置">
          <Result
            status="warning"
            title="尚未配置 AIworkin 网页地址"
            subTitle="请平台部署方配置 AIWORKIN_WEB_URL（AIworkin 网页）或 SNS_WEB_URL（独立社交站网页）后重试。"
          />
        </Panel>
      </>
    );
  }

  const byKey = new Map(data.links.map((link) => [link.key, link]));
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.keys
      .map((key) => byKey.get(key))
      .filter((link): link is { key: string; url: string } => Boolean(link)),
  })).filter((group) => group.links.length);

  return (
    <>
      <PageHero
        title="AI社交"
        desc={`${DESC}${
          data.webMode === "aiworkin"
            ? "入口会在新窗口打开 AIworkin，如未登录请先用 AIPDD 账号登录。"
            : ""
        }`}
      />
      <Panel title="社交入口">
        {groups.map((group) => (
          <section key={group.title} style={{ marginBottom: 20 }}>
            <h4
              className="muted text-12"
              style={{ margin: "0 0 10px", fontWeight: 500 }}
            >
              <Translatable text={group.title} />
            </h4>
            <ToolCardGrid>
              {group.links.map((link) => {
                const meta = ENTRY[link.key];
                return (
                  <ToolCard
                    key={link.key}
                    icon={meta.icon}
                    title={<Translatable text={meta.label} />}
                    description={<Translatable text={meta.description} />}
                    onClick={() =>
                      window.open(link.url, "_blank", "noopener,noreferrer")
                    }
                  />
                );
              })}
            </ToolCardGrid>
          </section>
        ))}
      </Panel>
    </>
  );
}
