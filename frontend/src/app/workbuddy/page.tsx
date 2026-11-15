"use client";

import {
  KeyOutlined,
  MessageOutlined,
  LockOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { ConfigProvider, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Notice, PageHero } from "@/components/ui/panel";
import { AccountPanel } from "./_components/account-panel";
import { CloudChatPanel } from "./_components/cloud-chat-panel";
import { CloudSchedulePanel } from "./_components/cloud-schedule-panel";
import { AccountPanel as AiCallAccountPanel } from "./_components/ai-call/account-panel";
import { aiCallApi, type AiCallAccount } from "./_components/ai-call/common";
import { AiCallGuideButton } from "./_components/ai-call/usage-guide";
import {
  workbuddyApi,
  type WbAccount,
} from "./_components/common";
import { WorkbuddyGuideButton } from "./_components/usage-guide";

/**
 * Workbuddy 企业版（「工作台」栏目 · 按用户归属），布局与语义对齐 Bot 主机：
 * 账号对话 / 定时任务 / Workbuddy Enterprise 账号 / AI 调用账号。
 *
 * 一个 Workbuddy Enterprise 账号（腾讯云 SecretId / SecretKey）等同于一台 Bot 主机：
 * 选中账号与云端 Agent 直接对话，或把每天要做的事排成定时任务，到点由平台按该账号
 * 向云端 Agent 下发一轮。云端 Agent 的清单、版本与会话都按密钥隔离在腾讯云侧；
 * 平台只保存调用凭据、指令与运行记录，用户离职后凭据即刻作废。
 *
 * 「AI 调用账号」是同一套账号体系下的第三方平台凭据库：每条凭据必须绑定到一个或多个
 * Workbuddy Enterprise 账号，任务在哪个 Workbuddy 账号下运行就只能取与该账号绑定的凭据。
 */
export default function WorkbuddyPage() {
  const [tab, setTab] = useState("chat");
  // 阻断提示直达：/workbuddy?tab=accounts 定位到账号页签
  const wantedTab = useSearchParams().get("tab") || "";
  useEffect(() => {
    // 旧页签已下架：planes/agents 一律回落到仍存在的入口。
    if (wantedTab === "agents" || wantedTab === "plans") setTab("accounts");
    else if (["accounts", "ai-call", "chat", "schedules"].includes(wantedTab)) setTab(wantedTab);
  }, [wantedTab]);
  const [accounts, setAccounts] = useState<WbAccount[]>([]);
  const [aiCallAccounts, setAiCallAccounts] = useState<AiCallAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [accountResult, aiCallResult] = await Promise.all([
      workbuddyApi.accounts(),
      aiCallApi.accounts(),
    ]);
    setAccounts(accountResult.data ?? []);
    setAiCallAccounts(aiCallResult.data ?? []);
    setError([accountResult.message, aiCallResult.message].filter(Boolean).join("；"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="Workbuddy 企业版"
        desc="企云账号等同于 Bot 主机：一个 Workbuddy Enterprise 账号（腾讯云 SecretId / SecretKey）就是一条执行通道，选中账号与云端 Agent 直接对话，或把每天要做的事排成定时任务，到点由平台按该账号下发一轮。云端 Agent 的清单、版本与会话都在你自己的腾讯云 Workbuddy 企业版下，平台只保存调用凭据、指令与运行记录，每个用户填自己的密钥、互不相通。「AI 调用账号」页签集中加密保存第三方平台的口令、API Key 与 Cookie，按 Workbuddy Enterprise 账号授权，任务运行时经机器通道按绑定取用"
        tabs={[
          {
            key: "chat",
            label: <><MessageOutlined aria-hidden /> 账号对话</>,
          },
          {
            key: "schedules",
            label: <><ScheduleOutlined aria-hidden /> 定时任务</>,
          },
          {
            key: "accounts",
            label: (
              <>
                <KeyOutlined aria-hidden /> Workbuddy Enterprise 账号
              </>
            ),
            count: accounts.length,
          },
          {
            key: "ai-call",
            label: (
              <>
                <LockOutlined aria-hidden /> AI 调用账号
              </>
            ),
            count: aiCallAccounts.length,
          },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        titleExtra={
          tab === "ai-call" ? (
            <AiCallGuideButton />
          ) : (
            <WorkbuddyGuideButton />
          )
        }
      />

      {error ? (
        <Notice variant="error">{`Workbuddy 数据加载失败：${error}`}</Notice>
      ) : null}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : tab === "chat" ? (
        <CloudChatPanel accounts={accounts} />
      ) : tab === "schedules" ? (
        <CloudSchedulePanel accounts={accounts} />
      ) : tab === "accounts" ? (
        <AccountPanel accounts={accounts} reload={reload} />
      ) : (
        <AiCallAccountPanel
          accounts={aiCallAccounts}
          workbuddyAccounts={accounts.map((item) => ({
            id: item.id,
            name: item.name,
            status: item.status,
            region: item.region,
          }))}
          reload={reload}
        />
      )}
    </ConfigProvider>
  );
}
