"use client";

import { ReloadOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import { App, Button, Input, Space, Spin, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { BotCommandView, BotHostView, BotMessageView } from "@enterprise/contracts";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { useI18n } from "@/lib/i18n/i18n";
import {
  COMMAND_STATUS_LABEL,
  HOST_STATUS_LABEL,
  commandStatusColor,
  fmtTime,
  hostHint,
  hostStatusColor,
  botHostApi,
} from "./common";
import {
  EMPTY_TARGET,
  WorkspaceSelect,
  useWorkspaces,
  type WorkspaceTarget,
} from "./workspace-target";

const OPEN_STATUSES = ["PENDING", "DISPATCHED"];
/** 有指令在跑时的轮询周期：主机执行是异步的，界面按这个节奏回读会话。 */
const POLL_MS = 5000;

/** 气泡时间只显示「时:分」，同一天内的对话不重复年月日（与 Agent 对话同口径）。 */
function clockLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * 主机对话：左侧列出这个账号下已配对的主机（点一台切过去），右侧是那台主机的对话窗口。
 * 指令直接进客户端自带的 Agent，平台不挑执行体、不选软件。
 * 回执与取消入口走下方通栏「指令队列」：气泡只做「说了什么 / 回了什么」，
 * 会话行里没有指令码，状态不硬挂在气泡上。
 */
export function ChatPanel({
  hosts,
  hostId,
  onHostChange,
}: {
  hosts: BotHostView[];
  hostId: number;
  onHostChange: (hostId: number) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [messages, setMessages] = useState<BotMessageView[]>([]);
  const [commands, setCommands] = useState<BotCommandView[]>([]);
  const [host, setHost] = useState<BotHostView | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<WorkspaceTarget>(EMPTY_TARGET);
  const { detail, reload: reloadWorkspaces } = useWorkspaces(hostId);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // 换主机时工作区落回默认：上一台的白名单不适用于这一台。
  useEffect(() => {
    setTarget(EMPTY_TARGET);
  }, [hostId]);

  const refresh = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    const result = await botHostApi.conversation(hostId);
    setError(result.message);
    if (result.data) {
      setMessages(result.data.messages);
      setCommands(result.data.commands);
      setHost(result.data.host);
    }
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 有指令在排队/执行时持续回读，跑完即停，不空转。
  const hasOpen = commands.some((row) => OPEN_STATUSES.includes(row.status));
  useEffect(() => {
    if (!hasOpen) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasOpen, refresh]);

  const send = async () => {
    const instruction = text.trim();
    if (!instruction) {
      message.warning("先说一句要主机做的事");
      return;
    }
    setSending(true);
    try {
      await botHostApi.send(hostId, {
        text: instruction,
        workspace: target.workspace || undefined,
      });
      setText("");
      await refresh();
    } catch (error_) {
      message.error((error_ as Error).message);
    } finally {
      setSending(false);
    }
  };

  const cancel = async (row: BotCommandView) => {
    try {
      await botHostApi.cancel(row.commandCode);
      await refresh();
      message.success(
        row.status === "PENDING" ? "排队中的指令已取消" : "已下发取消，主机下一轮回传时中断",
      );
    } catch (error_) {
      message.error((error_ as Error).message);
    }
  };

  const columns: ColumnsType<BotCommandView> = [
    {
      title: "指令",
      dataIndex: "title",
      key: "title",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value}</span>
          <span className="text-12 muted mono">
            {row.commandCode}
            {row.kind === "schedule" ? " · 定时任务" : ""}
          </span>
        </Space>
      ),
    },
    {
      title: t("工作区"),
      key: "workspace",
      width: 200,
      render: (_, row) => (
        <Tooltip title={row.effectiveWorkspace || row.workspace || t("默认工作区")}>
          <span className="text-12" style={{ maxWidth: 200 }}>
            {row.effectiveWorkspace || row.workspace || t("默认工作区")}
          </span>
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (value: string) => (
        <Tag color={commandStatusColor(value)}>
          {COMMAND_STATUS_LABEL[value] || value}
        </Tag>
      ),
    },
    {
      title: "结果",
      key: "result",
      width: 220,
      ellipsis: true,
      render: (_, row) => {
        const text_ = row.resultText || row.error;
        if (!text_) return <span className="muted">—</span>;
        return (
          <Tooltip title={<pre className="wb-host-tip">{text_}</pre>}>
            <span>{text_}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "下发时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 80,
      render: (_, row) =>
        OPEN_STATUSES.includes(row.status) ? (
          <Button size="small" danger onClick={() => void cancel(row)}>
            取消
          </Button>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  if (!hosts.length) {
    return (
      <Panel title="主机对话">
        <EmptyState text="还没有 Bot 主机：先在「主机」页签完成配对" />
      </Panel>
    );
  }

  return (
    <div className="agent-shell">
      <Panel
        title="主机"
        extra={
          <Button
            icon={<ReloadOutlined aria-hidden />}
            onClick={() => {
              void refresh();
              void reloadWorkspaces();
            }}
          >
            刷新
          </Button>
        }
      >
        <div className="agent-conv-list">
          {hosts.map((row) => (
            <div
              key={row.id}
              className={`agent-conv${row.id === hostId ? " active" : ""}`}
              onClick={() => onHostChange(row.id)}
            >
              <span className="agent-conv-title">{row.name}</span>
              {row.pendingCount ? (
                <span className="text-12 muted">{`${row.pendingCount} 条待执行`}</span>
              ) : null}
              <Tag color={hostStatusColor(row.status)}>
                {HOST_STATUS_LABEL[row.status] || row.status}
              </Tag>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="对话"
        titleExtra={
          host ? <span className="text-12 muted">{hostHint(host)}</span> : undefined
        }
        extra={
          <div className="agent-workspace-row">
            <span className="agent-pick-label">{t("工作区")}</span>
            <WorkspaceSelect
              detail={detail}
              value={target.workspace}
              onChange={(workspace) => setTarget({ workspace })}
            />
            {host ? (
              <Tag color={hostStatusColor(host.status)}>
                {HOST_STATUS_LABEL[host.status] || host.status}
              </Tag>
            ) : null}
          </div>
        }
      >
        {error ? <Notice variant="error">{error}</Notice> : null}
        <div className="agent-thread">
          {loading && !messages.length ? <Spin /> : null}
          {!messages.length && !loading ? (
            <div className="agent-empty">
              <div className="agent-empty-icon">
                <RobotOutlined aria-hidden />
              </div>
              <div className="agent-empty-title">开始一台主机的对话</div>
              <p className="agent-empty-desc">
                左侧先点一台主机，然后在面板右上角选工作区，说一句要它做的事。
                客户端领到后在它本机跑，过程与结果回在这里。
              </p>
            </div>
          ) : null}
          {messages.map((row) => {
            const statusChips = (
              <>
                {row.status === "failed" ? (
                  <span className="agent-chip agent-chip-danger">失败</span>
                ) : null}
                {row.status === "canceled" ? (
                  <span className="agent-chip agent-chip-muted">已中断</span>
                ) : null}
              </>
            );
            if (row.role === "user") {
              return (
                <article className="agent-turn agent-turn-user" key={row.id}>
                  <div className="agent-turn-meta">
                    <span className="agent-turn-name">我</span>
                    {row.createdAt ? (
                      <span className="agent-turn-time">{clockLabel(row.createdAt)}</span>
                    ) : null}
                  </div>
                  <div className="agent-bubble agent-bubble-user">
                    {row.content || "（空）"}
                  </div>
                </article>
              );
            }
            return (
              <article className="agent-turn agent-turn-agent" key={row.id}>
                <div className="agent-avatar" aria-hidden>
                  <RobotOutlined />
                </div>
                <div className="agent-turn-main">
                  <div className="agent-turn-meta">
                    <span className="agent-turn-name">{host?.name || "Bot 主机"}</span>
                    {row.createdAt ? (
                      <span className="agent-turn-time">{clockLabel(row.createdAt)}</span>
                    ) : null}
                    {statusChips}
                  </div>
                  <div className="agent-bubble agent-bubble-agent">
                    {row.content || "（空）"}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <Space orientation="vertical" size={8} style={{ width: "100%", marginTop: 16 }}>
          <Input.TextArea
            rows={3}
            value={text}
            maxLength={4000}
            placeholder="用大白话说清要主机做什么，例如：把 D:\报告 目录里本周的 xlsx 汇总成一张总表"
            onChange={(event) => setText(event.target.value)}
            onPressEnter={(event) => {
              if (event.ctrlKey || event.metaKey) void send();
            }}
          />
          <Space wrap>
            <Button
              type="primary"
              icon={<SendOutlined aria-hidden />}
              loading={sending}
              disabled={loading}
              onClick={() => void send()}
            >
              发送给主机
            </Button>
            <span className="text-12 muted">
              {host ? `${hostHint(host)}；` : ""}
              指令落在上方所选工作区，Ctrl+Enter 发送。
            </span>
          </Space>
        </Space>
      </Panel>

      <div style={{ gridColumn: "1 / -1" }}>
        <Panel title="指令队列" titleBadge={`${commands.length} 条`}>
          {commands.length ? (
            <Table<BotCommandView>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={commands}
              scroll={{ x: "max-content" }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          ) : (
            <EmptyState text="还没有下发过指令" />
          )}
        </Panel>
      </div>
    </div>
  );
}
