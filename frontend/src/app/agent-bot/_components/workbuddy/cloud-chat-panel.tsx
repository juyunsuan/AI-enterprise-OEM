"use client";

import { ReloadOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Input, Space, Tag } from "antd";
import { useEffect, useState } from "react";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { ACCOUNT_STATUS_LABEL, fmtTime, workbuddyApi, type WbAccount, type WbCloudCommand } from "./common";
import { AgentPicker } from "./target-select";

const COMMAND_STATUS: Record<string, string> = {
  PENDING: "待下发",
  DISPATCHED: "执行中",
  DONE: "已完成",
  FAILED: "失败",
  CANCELED: "已取消",
  TIMEOUT: "超时",
};
const RUNNING = ["PENDING", "DISPATCHED"];

export function CloudChatPanel({ accounts }: { accounts: WbAccount[] }) {
  const [accountId, setAccountId] = useState<number>();
  const [agentId, setAgentId] = useState<string>();
  const [versionId, setVersionId] = useState<string>();
  const [commands, setCommands] = useState<WbCloudCommand[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setCommands([]);
    setLoading(true);
    void workbuddyApi.cloudCommands(accountId).then((result) => {
      if (!alive) return;
      setCommands(result.data || []);
      if (result.message) setError(result.message);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [accountId, refreshKey]);

  // 只在还有未收口的指令时轮询，收口后自动停，避免空转。
  const runningIds = commands.filter((item) => RUNNING.includes(item.status)).map((item) => item.id).join(",");
  useEffect(() => {
    if (!runningIds) return;
    const ids = runningIds.split(",").map(Number);
    let alive = true;
    const timer = setInterval(() => {
      void Promise.all(ids.map((id) => workbuddyApi.syncCloudCommand(id).catch(() => null)))
        .then((rows) => {
          if (!alive) return;
          setCommands((prev) => {
            const byId = new Map(rows.filter(Boolean).map((row) => [(row as WbCloudCommand).id, row as WbCloudCommand]));
            return prev.map((item) => byId.get(item.id) || item);
          });
        });
    }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [runningIds]);

  const send = async () => {
    if (!accountId || !agentId || !text.trim() || sending) return;
    const selectedAccount = accountId;
    setSending(true);
    setError("");
    try {
      await workbuddyApi.sendCloudCommand(selectedAccount, { agentId, versionId: versionId || undefined, instruction: text.trim() });
      setText("");
    } catch (err) {
      setError((err as Error).message || "发送失败");
    } finally {
      setSending(false);
      setRefreshKey((value) => value + 1);
    }
  };

  const selectAccount = (id: number) => {
    setAccountId(id);
    setAgentId(undefined);
    setVersionId(undefined);
    setText("");
  };

  if (!accounts.length) return <Panel title="账号对话"><EmptyState text="还没有 Workbuddy Enterprise 账号，请先在账号页签添加。" /></Panel>;
  const selected = accounts.find((item) => item.id === accountId);
  return (
    <div className="agent-shell">
      <Panel title="企业云账号" extra={<Button icon={<ReloadOutlined />} disabled={!accountId || loading} onClick={() => setRefreshKey((value) => value + 1)}>刷新</Button>}>
        <div className="agent-conv-list">
          {accounts.map((account) => (
            <button type="button" key={account.id} className={`agent-conv${account.id === accountId ? " active" : ""}`} onClick={() => selectAccount(account.id)}>
              <span className="agent-conv-title">{account.name}</span>
              <Tag>{ACCOUNT_STATUS_LABEL[account.status] || account.status}</Tag>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="账号对话" titleExtra={selected ? <span className="text-12 muted">{selected.name}</span> : undefined}>
        {!accountId ? <EmptyState text="请先选择左侧账号。" /> : <>
          <AgentPicker accounts={accounts} accountId={accountId} agentId={agentId} versionId={versionId} onChange={(next) => {
            if (next.accountId !== accountId) { if (next.accountId) selectAccount(next.accountId); return; }
            setAgentId(next.agentId); setVersionId(next.versionId);
          }} />
          <Notice>指令下发后会持续追云端任务状态与消息；服务端 5 秒轮询一次，收口即停。</Notice>
          {error ? <Notice variant="error">{error}</Notice> : null}
          <div className="agent-thread">
            {loading ? <span className="muted">正在加载指令…</span> : !commands.length ? <EmptyState text="暂无指令" /> : [...commands].reverse().map((command) => (
              <article className="agent-turn agent-turn-user" key={command.id}>
                <div className="agent-turn-meta"><span>指令 #{command.id}</span><span>{fmtTime(command.createdAt)}</span><Tag color={command.status === "FAILED" || command.status === "TIMEOUT" ? "error" : command.status === "DONE" ? "success" : command.status === "DISPATCHED" || command.status === "PENDING" ? "processing" : "default"}>{COMMAND_STATUS[command.status] || command.status}</Tag></div>
                <div className="agent-bubble agent-bubble-user" style={{ whiteSpace: "pre-wrap" }}>{command.payload?.instruction || "（无指令内容）"}</div>
                <span className="text-12 muted">Agent: {command.agentId}{command.versionId ? ` · 版本: ${command.versionId}` : " · 默认版本"}{command.scheduleId ? ` · 来自定时任务 #${command.scheduleId}` : ""}</span>
                {command.progressText ? <div className="agent-bubble" style={{ whiteSpace: "pre-wrap" }}>{command.progressText}</div> : null}
                {command.error ? <span style={{ color: "var(--danger)" }}>{command.error}</span> : null}
              </article>
            ))}
          </div>
          <Space orientation="vertical" size={8} style={{ width: "100%", marginTop: 16 }}>
            <Input.TextArea rows={3} maxLength={20000} value={text} placeholder="输入要发送给云端 Agent 的指令" onChange={(event) => setText(event.target.value)} onPressEnter={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); void send(); } }} />
            <Space wrap><Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!agentId || !text.trim() || selected?.status !== "active"} onClick={() => void send()}>发送指令</Button><span className="text-12 muted">每条指令新建云端会话；Ctrl+Enter 发送。</span></Space>
          </Space>
        </>}
      </Panel>
    </div>
  );
}
