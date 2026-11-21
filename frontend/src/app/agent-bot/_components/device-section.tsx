"use client";

import {
  CommentOutlined,
  DesktopOutlined,
  LinkOutlined,
  MobileOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { Skeleton } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { BotClientKind, BotHostView, BotScheduleView } from "@enterprise/contracts";
import { Notice, TabStrip } from "@/components/ui/panel";
import { AgentBindingsPanel } from "./bindings-panel";
import { ChatPanel } from "./bot-host/chat-panel";
import { botHostApi } from "./bot-host/common";
import { HostPanel } from "./bot-host/host-panel";
import { SchedulePanel } from "./bot-host/schedule-panel";

const SUB_KEYS = ["devices", "chat", "schedules", "bindings"] as const;

/**
 * AWBotDSH 主机 / AWBot 手机共用的设备区：设备台账 / 对话 / 定时任务 / Agent 绑定账号。
 * 两者只差 clientKind（DESKTOP / AWBOT）与文案，指令、工作区与心跳链路同一套。
 */
export function DeviceSection({
  kind,
  defaultSub,
  defaultHostId,
}: {
  kind: BotClientKind;
  defaultSub: string;
  defaultHostId: number;
}) {
  const isMobile = kind === "AWBOT";
  const [sub, setSub] = useState<string>(() =>
    (SUB_KEYS as readonly string[]).includes(defaultSub) ? defaultSub : "devices",
  );
  const [hostId, setHostId] = useState(defaultHostId);
  const [hosts, setHosts] = useState<BotHostView[]>([]);
  const [schedules, setSchedules] = useState<BotScheduleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [hostResult, scheduleResult] = await Promise.all([
      botHostApi.hosts(kind),
      botHostApi.schedules(),
    ]);
    const list = hostResult.data?.list ?? [];
    setHosts(list);
    setSchedules(scheduleResult.data?.list ?? []);
    setError(
      [hostResult.message, scheduleResult.message].filter(Boolean).join("；"),
    );
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 对话/定时页签总得有一台设备在看：深链没带上时回落第一台。
  useEffect(() => {
    if (!hostId && hosts.length) setHostId(hosts[0].id);
  }, [hostId, hosts]);

  // 深链里的 hostId 可能属于另一类设备（任务中心只带主机 ID）：本机没有就回落到第一台。
  useEffect(() => {
    if (hostId && hosts.length && !hosts.some((row) => row.id === hostId)) {
      setHostId(0);
    }
  }, [hosts, hostId]);

  const pendingTotal = hosts.reduce((sum, row) => sum + row.pendingCount, 0);
  const ownSchedules = schedules.filter((row) =>
    hosts.some((host) => host.id === row.hostId),
  );
  const deviceIcon = isMobile ? <MobileOutlined aria-hidden /> : <DesktopOutlined aria-hidden />;

  const items = [
    {
      key: "devices",
      label: (
        <>
          {deviceIcon} {isMobile ? "设备" : "主机"}
        </>
      ),
      count: hosts.length,
    },
    {
      key: "chat",
      label: (
        <>
          <CommentOutlined aria-hidden /> {isMobile ? "对话" : "主机对话"}
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
      count: isMobile ? ownSchedules.length : schedules.length,
    },
    {
      key: "bindings",
      label: (
        <>
          <LinkOutlined aria-hidden /> Agent 绑定账号
        </>
      ),
    },
  ];

  return (
    <div>
      <TabStrip
        items={items}
        value={sub}
        onChange={(key) => setSub((SUB_KEYS as readonly string[]).includes(key) ? key : "devices")}
        style={{ marginBottom: 14 }}
      />

      {error ? (
        <Notice variant="error">{`${isMobile ? "AWBot 手机" : "Bot 主机"}数据加载失败：${error}`}</Notice>
      ) : null}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : sub === "devices" ? (
        <HostPanel
          hosts={hosts}
          reload={reload}
          onOpenChat={(id) => {
            setHostId(id);
            setSub("chat");
          }}
          kind={kind}
        />
      ) : sub === "chat" ? (
        <ChatPanel hosts={hosts} hostId={hostId} onHostChange={setHostId} kind={kind} />
      ) : sub === "schedules" ? (
        <SchedulePanel
          hosts={hosts}
          hostId={hostId}
          onHostChange={setHostId}
          schedules={schedules}
          reload={reload}
          kind={kind}
        />
      ) : (
        <AgentBindingsPanel
          kind={kind}
          devices={hosts.map((row) => ({
            id: row.id,
            name: row.name,
            hint: `${row.statusLabel}${row.online ? "" : " · 离线时绑定仍保留"}`,
            inactive: !row.online,
          }))}
          emptyDevices={
            isMobile
              ? "还没有配对的 AWBot 手机：先在「设备」页签用 6 位连接码配对，再回来把 AI 调用账号授权给它"
              : "还没有配对的 AWBotDSH 主机：先在「主机」页签配对，再回来把 AI 调用账号授权给它"
          }
        />
      )}
    </div>
  );
}
