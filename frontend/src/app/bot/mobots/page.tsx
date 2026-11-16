"use client";

import {
  CommentOutlined,
  MobileOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { ConfigProvider, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BotHostView, BotScheduleView } from "@enterprise/contracts";
import { Notice, PageHero } from "@/components/ui/panel";
import { ChatPanel } from "../hosts/_components/chat-panel";
import { botHostApi } from "../hosts/_components/common";
import { HostPanel } from "../hosts/_components/host-panel";
import { SchedulePanel } from "../hosts/_components/schedule-panel";

/**
 * Agent-Bot · Mobot 手机：与 Bot 主机共用设备/指令/会话/定时/模型授权骨架，
 * 仅 clientKind=MOBOT。手机端通过 6 位连接码配对后心跳领取 Prompt，
 * 由手机内的本地 Agent 执行并流式回传；平台不下发工作区与手机本地配置。
 */
const TAB_KEYS = ["hosts", "chat", "schedules"] as const;

export default function MobotPage() {
  const [tab, setTab] = useState("hosts");
  const [hostId, setHostId] = useState(0);
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
      botHostApi.hosts("MOBOT"),
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

  useEffect(() => {
    if (!hostId && hosts.length) setHostId(hosts[0].id);
  }, [hostId, hosts]);

  const pendingTotal = hosts.reduce((sum, row) => sum + row.pendingCount, 0);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="Mobot 手机"
        desc="Mobot 手机通过 6 位连接码与本账号配对后，以出站 HTTPS 心跳领取平台下发的 Prompt，由手机内的本地 Agent 执行并流式回传；平台只传「做什么」与「做到哪了」，不下发手机工作区，也看不到手机里的模型、技能与本地文件。配对后平台模型授权（含该账号的 AIPDD Key 兜底）会随心跳同步到手机现有模型配置；手机离线时指令照常排队，上线心跳即领取。Android 由前台服务保活，iOS 以 Mobot 客户端实际能力为准。"
        tabs={[
          {
            key: "hosts",
            label: (
              <>
                <MobileOutlined aria-hidden /> 设备
              </>
            ),
            count: hosts.length,
          },
          {
            key: "chat",
            label: (
              <>
                <CommentOutlined aria-hidden /> 对话
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
            count: schedules.filter((row) =>
              hosts.some((host) => host.id === row.hostId),
            ).length,
          },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {error ? (
        <Notice variant="error">{`Mobot 手机数据加载失败：${error}`}</Notice>
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
          kind="MOBOT"
        />
      ) : tab === "chat" ? (
        <ChatPanel
          hosts={hosts}
          hostId={hostId}
          onHostChange={setHostId}
          kind="MOBOT"
        />
      ) : (
        <SchedulePanel
          hosts={hosts}
          hostId={hostId}
          onHostChange={setHostId}
          schedules={schedules}
          reload={reload}
          kind="MOBOT"
        />
      )}
    </ConfigProvider>
  );
}