"use client";

import {
  CommentOutlined,
  DesktopOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { ConfigProvider, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BotHostView, BotScheduleView } from "@enterprise/contracts";
import { Notice, PageHero } from "@/components/ui/panel";
import { ChatPanel } from "./_components/chat-panel";
import { botHostApi } from "./_components/common";
import { HostPanel } from "./_components/host-panel";
import { SchedulePanel } from "./_components/schedule-panel";
import { BotHostGuideButton } from "./_components/usage-guide";

/**
 * Bot 主机（「工作台」栏目 · 按账号归属）：三个页签＝主机台账 / 主机对话 / 定时任务。
 *
 * 在本人机器上装 BotBuddy 客户端，填本站地址并配对后，它就成为这个账号名下一台在线设备，
 * 并上报可选工作区。对话框里选主机与工作区，说人话，平台把指令排队，客户端领到后
 * 在本机执行并流式回传。客户端怎么配模型、装了哪些技能与数字分身是它自己的事，
 * 平台一概不看、不存、不校验；主机令牌库内只存 sha256、明文只在配对那一次回显，
 * 账号离职即刻作废。任何账号切企业 / 服务商 / 职员身份，看到的都是同一批主机。
 */
const TAB_KEYS = ["hosts", "chat", "schedules"] as const;

export default function BotHostsPage() {
  const [tab, setTab] = useState("hosts");
  const [hostId, setHostId] = useState(0);
  // 深链直达：/bot/hosts?tab=schedules；任务中心点「去处理」带 ?hostId=N 落到那台主机的对话。
  const params = useSearchParams();
  const wantedTab = params.get("tab") || "";
  const wantedHost = Number(params.get("hostId") || 0);
  useEffect(() => {
    if ((TAB_KEYS as readonly string[]).includes(wantedTab)) setTab(wantedTab);
    if (wantedHost > 0) setHostId(wantedHost);
  }, [wantedTab, wantedHost]);

  const [hosts, setHosts] = useState<BotHostView[]>([]);
  const [schedules, setSchedules] = useState<BotScheduleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [hostResult, scheduleResult] = await Promise.all([
      botHostApi.hosts(),
      botHostApi.schedules(),
    ]);
    const list = hostResult.data?.list ?? [];
    setHosts(list);
    setSchedules(scheduleResult.data?.list ?? []);
    setError(
      [hostResult.message, scheduleResult.message].filter(Boolean).join("；"),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 对话页签总得有一台主机在看：深链没带上时回落第一台。
  useEffect(() => {
    if (!hostId && hosts.length) setHostId(hosts[0].id);
  }, [hostId, hosts]);

  const pendingTotal = hosts.reduce((sum, row) => sum + row.pendingCount, 0);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="Bot 主机"
        desc="在主机上装 BotBuddy 客户端：填好本站地址并用配对码（或粘贴令牌）配对后，它就成为这个账号名下一台在线设备，并提供可选工作区。在对话框里选主机与工作区，说人话，平台把指令排队，客户端领到后在本机执行并流式回传过程与结果；也可以把每天要做的事排成定时任务，到点自动下发。平台只传「做什么」与「落到哪个目录」，客户端里怎么配模型、有哪些技能与数字分身都归它自己，不上报也不展示：主机令牌只在库里存 sha256、明文只在配对那一次显示，账号离职后令牌即刻作废。本期支持 Windows 与 macOS 主机，指令串行执行、离线时照常排队。"
        tabs={[
          {
            key: "hosts",
            label: (
              <>
                <DesktopOutlined aria-hidden /> 主机
              </>
            ),
            count: hosts.length,
          },
          {
            key: "chat",
            label: (
              <>
                <CommentOutlined aria-hidden /> 主机对话
              </>
            ),
            count: pendingTotal,
          },
          {
            key: "schedules",
            label: (
              <>
                <ScheduleOutlined aria-hidden /> 定时任务
              </>
            ),
            count: schedules.length,
          },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        titleExtra={<BotHostGuideButton />}
      />

      {error ? (
        <Notice variant="error">{`Bot 主机数据加载失败：${error}`}</Notice>
      ) : null}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : tab === "hosts" ? (
        <HostPanel
          hosts={hosts}
          reload={reload}
          onOpenChat={(id) => {
            setHostId(id);
            setTab("chat");
          }}
        />
      ) : tab === "chat" ? (
        <ChatPanel hosts={hosts} hostId={hostId} onHostChange={setHostId} />
      ) : (
        <SchedulePanel
          hosts={hosts}
          hostId={hostId}
          onHostChange={setHostId}
          schedules={schedules}
          reload={reload}
        />
      )}
    </ConfigProvider>
  );
}
