"use client";

import { PlusOutlined, ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { App, Button, Drawer, Input, Space, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { ScheduleFields } from "@/components/schedule-fields";
import {
  EMPTY_SCHEDULE,
  scheduleBody,
  scheduleDraftFrom,
  scheduleError,
  scheduleText,
  type ScheduleDraft,
} from "@/lib/schedule";
import { AgentPicker } from "./target-select";
import {
  ACCOUNT_STATUS_LABEL,
  fmtTime,
  workbuddyApi,
  type WbAccount,
  type WbCloudSchedule,
  type WbCloudScheduleRun,
} from "./common";

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  dispatched: "已下发",
  succeeded: "成功",
  failed: "失败",
  skipped: "跳过",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  succeeded: "success",
  failed: "error",
  skipped: "warning",
  dispatched: "processing",
};

type Draft = {
  title: string;
  instruction: string;
  accountId?: number;
  agentId: string;
  versionId?: string;
  schedule: ScheduleDraft;
  paused: boolean;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  instruction: "",
  agentId: "",
  schedule: { ...EMPTY_SCHEDULE },
  paused: false,
};

/**
 * 企业云定时任务：与 Bot 主机同口径（定时一次 / 周期重复，错过不补跑、失败只留痕），
 * 到点由平台按所属 Workbuddy 账号直接向云端 Agent 下发一轮。
 */
export function CloudSchedulePanel({ accounts }: { accounts: WbAccount[] }) {
  const { message } = App.useApp();
  const [accountId, setAccountId] = useState<number>();
  const [rows, setRows] = useState<WbCloudSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WbCloudSchedule | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [runsOf, setRunsOf] = useState<WbCloudSchedule | null>(null);
  const [runs, setRuns] = useState<WbCloudScheduleRun[]>([]);

  useEffect(() => {
    if (accountId || !accounts.length) return;
    const first = accounts.find((item) => item.status === "active") || accounts[0];
    setAccountId(first.id);
  }, [accounts, accountId]);

  const reload = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const result = await workbuddyApi.cloudSchedules(accountId);
    setRows(result.data || []);
    setError(result.message);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, accountId, schedule: { ...EMPTY_SCHEDULE } });
    setOpen(true);
  };

  const openEdit = (row: WbCloudSchedule) => {
    setEditing(row);
    setDraft({
      title: row.title,
      instruction: row.instruction,
      accountId: row.accountId,
      agentId: String(row.payload?.agentId || ""),
      versionId: String(row.payload?.versionId || "") || undefined,
      schedule: scheduleDraftFrom(row),
      paused: row.status !== "enabled",
    });
    setOpen(true);
  };

  const save = async () => {
    const scheduleErr = scheduleError(draft.schedule);
    if (scheduleErr) return void message.error(scheduleErr);
    if (!draft.title.trim() || !draft.instruction.trim()) return void message.error("请填写任务名称与每轮指令");
    if (!draft.accountId || !draft.agentId) return void message.error("请选择账号与 Agent");
    const body = {
      title: draft.title.trim(),
      instruction: draft.instruction.trim(),
      payload: { agentId: draft.agentId, versionId: draft.versionId || "" },
      status: draft.paused ? "paused" : "enabled",
      ...scheduleBody(draft.schedule),
    };
    setSaving(true);
    try {
      if (editing) await workbuddyApi.updateCloudSchedule(editing.id, body);
      else await workbuddyApi.createCloudSchedule(draft.accountId, body);
      setOpen(false);
      await reload();
    } catch (err) {
      message.error((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (row: WbCloudSchedule) => {
    try {
      await workbuddyApi.runCloudSchedule(row.id);
      message.success("已下发一轮");
      await reload();
    } catch (err) {
      message.error((err as Error).message || "下发失败");
    }
  };

  const remove = async (row: WbCloudSchedule) => {
    try {
      await workbuddyApi.removeCloudSchedule(row.id);
      await reload();
    } catch (err) {
      message.error((err as Error).message || "删除失败");
    }
  };

  const showRuns = async (row: WbCloudSchedule) => {
    setRunsOf(row);
    const result = await workbuddyApi.cloudScheduleRuns(row.id);
    setRuns(result.data || []);
  };

  return (
    <Panel
      title="定时任务"
      extra={
        <Space>
          <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void reload()} disabled={!accountId}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate} disabled={!accounts.length}>
            新建定时任务
          </Button>
        </Space>
      }
    >
      <div className="agent-workspace-row" style={{ marginBottom: 12 }}>
        <span className="agent-pick-label">账号</span>
        <Space wrap size={6}>
          {accounts.map((item) => (
            <Button
              key={item.id}
              size="small"
              type={item.id === accountId ? "primary" : "default"}
              onClick={() => setAccountId(item.id)}
            >
              {item.name}
              <span className="text-12" style={{ marginLeft: 6 }}>
                {ACCOUNT_STATUS_LABEL[item.status] || item.status}
              </span>
            </Button>
          ))}
        </Space>
      </div>
      {error ? <Notice variant="error">{error}</Notice> : null}
      {loading ? (
        <span className="muted">正在加载…</span>
      ) : !rows.length ? (
        <EmptyState text="这个账号还没有定时任务。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: "任务",
              dataIndex: "title",
              render: (value: string, row) => (
                <Space orientation="vertical" size={0}>
                  <b>{value}</b>
                  <span className="text-12 muted" style={{ maxWidth: 360 }}>
                    {row.instruction}
                  </span>
                </Space>
              ),
            },
            {
              title: "排期",
              key: "schedule",
              width: 200,
              render: (_, row) => (
                <Space orientation="vertical" size={0}>
                  <span className="text-12">{scheduleText(row)}</span>
                  <span className="text-12 muted">
                    {row.scheduledAt ? `下次 ${fmtTime(row.scheduledAt)}` : "没有下一次"}
                  </span>
                </Space>
              ),
            },
            {
              title: "状态",
              key: "status",
              width: 160,
              render: (_, row) => (
                <Space orientation="vertical" size={2}>
                  <Tag color={row.status === "enabled" ? "success" : "default"}>
                    {row.status === "enabled" ? "启用" : "已暂停"}
                  </Tag>
                  <span className="text-12 muted">
                    {row.lastRunAt
                      ? `上轮 ${RUN_STATUS_LABEL[row.lastStatus] || row.lastStatus || "—"} · ${fmtTime(row.lastRunAt)}`
                      : "还没跑过"}
                  </span>
                  {row.lastError ? (
                    <span className="text-12" style={{ color: "var(--danger)" }}>
                      {row.lastError}
                    </span>
                  ) : null}
                </Space>
              ),
            },
            {
              title: "操作",
              key: "action",
              width: 260,
              render: (_, row) => (
                <Space size={4} wrap>
                  <Button size="small" icon={<ThunderboltOutlined aria-hidden />} onClick={() => void runNow(row)}>
                    立即跑一次
                  </Button>
                  <Button size="small" onClick={() => void showRuns(row)}>
                    运行记录 {row.runCount ? `(${row.runCount})` : ""}
                  </Button>
                  <Button size="small" onClick={() => openEdit(row)}>
                    编辑
                  </Button>
                  <Button size="small" danger onClick={() => void remove(row)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size={640}
        title={editing ? `编辑定时任务 · ${editing.title}` : "新建定时任务"}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <div className="data-table-form">
          <label className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">任务名称</span>
            <Input
              value={draft.title}
              maxLength={80}
              placeholder="如：每天整理一次销售线索"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">每轮指令</span>
            <Input.TextArea
              rows={4}
              maxLength={20000}
              value={draft.instruction}
              placeholder="每轮都按这段自包含的话执行，看不到历史上下文"
              onChange={(event) => setDraft({ ...draft, instruction: event.target.value })}
            />
          </label>
          <div className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">执行目标</span>
            <AgentPicker
              accounts={accounts}
              accountId={draft.accountId}
              agentId={draft.agentId || undefined}
              versionId={draft.versionId}
              onChange={(next) =>
                setDraft({
                  ...draft,
                  accountId: next.accountId ?? draft.accountId,
                  agentId: next.agentId || "",
                  versionId: next.versionId,
                })
              }
            />
          </div>
          <ScheduleFields
            draft={draft.schedule}
            onChange={(patch) => setDraft({ ...draft, schedule: { ...draft.schedule, ...patch } })}
            allowOnce={false}
            allowMinuteInterval
          />
          <label className="data-table-form-item">
            <span className="data-table-form-label">状态</span>
            <Space>
              <Button
                size="small"
                type={draft.paused ? "default" : "primary"}
                onClick={() => setDraft({ ...draft, paused: false })}
              >
                启用
              </Button>
              <Button
                size="small"
                type={draft.paused ? "primary" : "default"}
                onClick={() => setDraft({ ...draft, paused: true })}
              >
                暂停
              </Button>
            </Space>
          </label>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(runsOf)}
        onClose={() => setRunsOf(null)}
        size={640}
        title={runsOf ? `运行记录 · ${runsOf.title}` : "运行记录"}
        destroyOnHidden
      >
        {!runs.length ? (
          <EmptyState text="还没有运行记录。" />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={runs}
            columns={[
              {
                title: "时间",
                dataIndex: "createdAt",
                width: 160,
                render: (value: string) => fmtTime(value),
              },
              {
                title: "结果",
                dataIndex: "status",
                width: 90,
                render: (value: string) => (
                  <Tag color={RUN_STATUS_COLOR[value] || "default"}>
                    {RUN_STATUS_LABEL[value] || value}
                  </Tag>
                ),
              },
              {
                title: "说明",
                key: "detail",
                render: (_, row) => (
                  <span className="text-12 muted">
                    {row.error || (row.commandCode ? `指令 ${row.commandCode.slice(0, 8)}` : "—")}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </Panel>
  );
}
