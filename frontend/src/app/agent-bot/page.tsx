"use client";

import {
  ApiOutlined,
  DesktopOutlined,
  MobileOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import { ConfigProvider } from "antd";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { PageHero } from "@/components/ui/panel";
import { AiCallGuideButton } from "./_components/ai-call/usage-guide";
import { AiCallSection } from "./_components/ai-call-section";
import { BotHostGuideButton } from "./_components/bot-host/usage-guide";
import { CloudSection } from "./_components/cloud-section";
import { DeviceSection } from "./_components/device-section";
import { WorkbuddyGuideButton } from "./_components/workbuddy/usage-guide";

/**
 * Agent-Bot（「工作台」栏目 · 按账号归属）：四个页签把「跑活的 Agent」收在一处——
 * AWBotDSH 主机 / AWBot 手机 / WorkBuddy 企业云是三类执行通道，AI 调用账号是它们共用的第三方平台凭据库。
 *
 * 三类通道的共性：客户端或企业密钥与本人账号配对后成为一条执行通道，平台只下发「做什么」
 * 与「落到哪个工作区」，本机怎么配模型、装了什么技能都不上报、不展示；令牌库内只存 sha256，
 * 明文只在配对那一次回显，账号离职即刻作废。
 *
 * 凭据的授权边界是「哪台 Agent 在用」：各通道内的「Agent 绑定账号」页签按设备/账号勾选可用凭据，
 * 客户端凭主机令牌（x-bot-token）或任务侧凭平台 API Key（x-api-key + kind/agentId）取用，
 * 未绑定的一律查不到、也解不了密。
 */
const TAB_KEYS = ["bots", "awbot", "cloud", "ai-call"] as const;

const TAB_DESC: Record<string, string> = {
  bots:
    "在主机上装 AWBotDSH 客户端：填好本站地址并用配对码（或粘贴令牌）配对后，它就成为这个账号名下一台在线设备，并提供可选工作区。在对话框里选主机与工作区，说人话，平台把指令排队，客户端领到后在本机执行并流式回传过程与结果；也可以把每天要做的事排成定时任务，到点自动下发。平台只传「做什么」与「落到哪个目录」，客户端里怎么配模型、有哪些技能与数字分身都归它自己。本期支持 Windows 与 macOS 主机，指令串行执行、离线时照常排队。",
  awbot:
    "AWBot 手机通过 6 位连接码与本账号配对后，以出站 HTTPS 心跳领取平台下发的 Prompt，由手机内的本地 Agent 执行并流式回传；平台只传「做什么」与「做到哪了」，不下发手机工作区，也看不到手机里的模型、技能与本地文件。配对后平台模型授权（含该账号的 AIPDD Key 兜底）会随心跳同步到手机现有模型配置；手机离线时指令照常排队，上线心跳即领取。",
  cloud:
    "企云账号等同于 Bot 主机：一个 WorkBuddy 企业账号（腾讯云 SecretId / SecretKey）就是一条执行通道，选中账号与云端 Agent 直接对话，或把每天要做的事排成定时任务，到点由平台按该账号下发一轮。云端 Agent 的清单、版本与会话都在你自己的腾讯云 WorkBuddy 企业版下，平台只保存调用凭据、指令与运行记录，每个用户填自己的密钥、互不相通。",
  "ai-call":
    "很多平台没有给 AI 用的开放接口，只能靠账号登录或 Cookie 操作。这里把各平台的口令 / API Key / Cookie 集中加密保存（AES-256-GCM，界面永不回显），再由 AWBotDSH 主机、AWBot 手机、WorkBuddy 企业账号各自的「Agent 绑定账号」页签按设备授权：一台 Agent 只能取到自己被绑定的凭据，取用即刻审计。任务侧用平台 API Key（x-api-key + kind/agentId），已配对的客户端用主机令牌（x-bot-token）直接取。",
};

const GUIDE: Record<string, ComponentType> = {
  bots: BotHostGuideButton,
  cloud: WorkbuddyGuideButton,
  "ai-call": AiCallGuideButton,
};

export default function AgentBotPage() {
  const [tab, setTab] = useState<string>("bots");
  // 深链：/agent-bot?tab=cloud&sub=accounts；旧地址与各页签内定位都靠这两个参数 + hostId。
  const params = useSearchParams();
  const wantedTab = params.get("tab") || "";
  const sub = params.get("sub") || "";
  const hostId = Number(params.get("hostId") || 0);
  useEffect(() => {
    if ((TAB_KEYS as readonly string[]).includes(wantedTab)) setTab(wantedTab);
  }, [wantedTab]);

  const Guide = GUIDE[tab];

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="Agent-Bot"
        desc={TAB_DESC[tab]}
        tabs={[
          {
            key: "bots",
            label: (
              <>
                <DesktopOutlined aria-hidden /> AWBotDSH 主机
              </>
            ),
          },
          {
            key: "awbot",
            label: (
              <>
                <MobileOutlined aria-hidden /> AWBot 手机
              </>
            ),
          },
          {
            key: "cloud",
            label: (
              <>
                <RiseOutlined aria-hidden /> WorkBuddy 企业云
              </>
            ),
          },
          {
            key: "ai-call",
            label: (
              <>
                <ApiOutlined aria-hidden /> AI 调用账号
              </>
            ),
          },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        titleExtra={Guide ? <Guide /> : undefined}
      />

      {tab === "bots" ? (
        <DeviceSection key="bots" kind="DESKTOP" defaultSub={sub} defaultHostId={hostId} />
      ) : tab === "awbot" ? (
        <DeviceSection key="awbot" kind="AWBOT" defaultSub={sub} defaultHostId={hostId} />
      ) : tab === "cloud" ? (
        <CloudSection key="cloud" defaultSub={sub} />
      ) : (
        <AiCallSection key="ai-call" />
      )}
    </ConfigProvider>
  );
}
