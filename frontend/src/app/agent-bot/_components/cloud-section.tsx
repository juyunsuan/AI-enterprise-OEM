"use client";

import {
  KeyOutlined,
  LinkOutlined,
  MessageOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { Skeleton } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Notice, TabStrip } from "@/components/ui/panel";
import { AccountPanel } from "./workbuddy/account-panel";
import { CloudChatPanel } from "./workbuddy/cloud-chat-panel";
import { CloudSchedulePanel } from "./workbuddy/cloud-schedule-panel";
import { workbuddyApi, type WbAccount } from "./workbuddy/common";
import { AgentBindingsPanel } from "./bindings-panel";

const SUB_KEYS = ["chat", "schedules", "accounts", "bindings"] as const;

/**
 * WorkBuddy 企业云：一个企业账号（腾讯云 SecretId / SecretKey）等同一条执行通道。
 * 页签＝账号对话 / 定时任务 / 企业账号台账 / Agent 绑定账号（把 AI 调用凭据授权给具体账号）。
 */
export function CloudSection({ defaultSub }: { defaultSub: string }) {
  const [sub, setSub] = useState<string>(() =>
    (SUB_KEYS as readonly string[]).includes(defaultSub) ? defaultSub : "chat",
  );
  const [accounts, setAccounts] = useState<WbAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const result = await workbuddyApi.accounts();
    setAccounts(result.data ?? []);
    setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const items = [
    {
      key: "chat",
      label: (
        <>
          <MessageOutlined aria-hidden /> 账号对话
        </>
      ),
    },
    {
      key: "schedules",
      label: (
        <>
          <ScheduleOutlined aria-hidden /> 定时任务
        </>
      ),
    },
    {
      key: "accounts",
      label: (
        <>
          <KeyOutlined aria-hidden /> WorkBuddy 企业账号
        </>
      ),
      count: accounts.length,
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
        onChange={(key) => setSub((SUB_KEYS as readonly string[]).includes(key) ? key : "chat")}
        style={{ marginBottom: 14 }}
      />

      {error ? (
        <Notice variant="error">{`WorkBuddy 数据加载失败：${error}`}</Notice>
      ) : null}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : sub === "chat" ? (
        <CloudChatPanel accounts={accounts} />
      ) : sub === "schedules" ? (
        <CloudSchedulePanel accounts={accounts} />
      ) : sub === "accounts" ? (
        <AccountPanel accounts={accounts} reload={reload} />
      ) : (
        <AgentBindingsPanel
          kind="WORKBUDDY"
          devices={accounts.map((row) => ({
            id: row.id,
            name: row.name,
            hint: row.status === "active" ? "可用" : "已停用",
            inactive: row.status !== "active",
          }))}
          emptyDevices="还没有 WorkBuddy 企业账号：先在「WorkBuddy 企业账号」页签登记密钥，再回来把 AI 调用账号授权给它"
        />
      )}
    </div>
  );
}
