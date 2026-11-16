"use client";

import { HistoryOutlined, PlayCircleOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { usePasswordConfirm } from "@/components/confirm-with-password";
import { ScheduleFields } from "@/components/schedule-fields";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useI18n } from "@/lib/i18n/i18n";
import {
  EMPTY_SCHEDULE,
  scheduleBody,
  scheduleDraftFrom,
  scheduleError,
  scheduleText,
  nextRunText,
  type ScheduleDraft,
} from "@/lib/schedule";
import {
  type BotClientKind,
  type BotScheduleView,
  type BotScheduleRunView,
  type BotHostView,
} from "@enterprise/contracts";
import {
  HOST_STATUS_LABEL,
  SCHEDULE_LAST_STATUS_LABEL,
  fmtTime,
  hostStatusColor,
  botHostApi,
} from "./common";
import {
  EMPTY_TARGET,
  WorkspacePicker,
  useWorkspaces,
  type WorkspaceTarget,
} from "./workspace-target";

const RUN_STATUS_COLOR: Record<string, string> = {
  succeeded: "success",
  failed: "error",
  skipped: "warning",
  dispatched: "processing",
  queued: "default",
};

type Draft = {
  hostId: number;
  title: string;
  instruction: string;
  target: WorkspaceTarget;
  schedule: ScheduleDraft;
};

function toDraft(row: BotScheduleView): Draft {
  return {
    hostId: row.hostId,
    title: row.title,
    instruction: row.instruction,
    target: { workspace: row.workspace },
    schedule: scheduleDraftFrom(row),
  };
}

const EMPTY_DRAFT: Draft = {
  hostId: 0,
  title: "",
  instruction: "",
  target: EMPTY_TARGET,
  schedule: { ...EMPTY_SCHEDULE, scheduleType: "recurring" },
};

/**
 * 主机定时任务：每轮下发一句自包含的自然语言指令，到点由调度器入队、主机心跳领取。
 * 排期口径与 RPA 任务、Workbuddy 计划任务共用同一套控件（ScheduleFields）。
 */
export function SchedulePanel({
  hosts,
  hostId,
  onHostChange,
  schedules,
  reload,
  kind = "DESKTOP",
}: {
  hosts: BotHostView[];
  hostId: number;
  onHostChange: (hostId: number) => void;
  schedules: BotScheduleView[];
  reload: () => Promise<void>;
  kind?: BotClientKind;
}) {
  const isMobile = kind === "MOBOT";
  const { message } = App.useApp();
  const { t } = useI18n();
  const { request, modal } = usePasswordConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BotScheduleView | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<{ title: string; list: BotScheduleRunView[] } | null>(
    null,
  );
  const { detail, reload: reloadDetail } = useWorkspaces(draft.hostId);

  const patch = (next: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...next }));

  const startCreate = () => {
    setEditing(null);
    setDraft({
      ...EMPTY_DRAFT,
      schedule: { ...EMPTY_SCHEDULE, scheduleType: "recurring" },
      hostId: hostId || hosts[0]?.id || 0,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.hostId) {
      message.warning("先选择要下发的主机");
      return;
    }
    if (!draft.title.trim()) {
      message.warning("请填写任务名称");
      return;
    }
    if (!draft.instruction.trim()) {
      message.warning("请填写每轮要交给主机做的事");
      return;
    }
    const scheduleHint = scheduleError(draft.schedule);
    if (scheduleHint) {
      message.warning(scheduleHint);
      return;
    }
    const body = {
      hostId: draft.hostId,
      title: draft.title.trim(),
      instruction: draft.instruction.trim(),
      workspace: isMobile ? undefined : draft.target.workspace || undefined,
      ...scheduleBody(draft.schedule),
    };
    setBusy(true);
    try {
      if (editing) {
        const target = editing;
        request({
          title: "修改定时任务（需密码）",
          content: `确认修改「${target.title}」的排期与指令？`,
          okText: "保存修改",
          onOk: async () => {
            await botHostApi.updateSchedule(target.id, body);
            close();
            await reload();
          },
        });
      } else {
        await botHostApi.createSchedule(body);
        close();
        await reload();
        message.success("已新建 1 个定时任务");
      }
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const toggleStatus = async (row: BotScheduleView, enabled: boolean) => {
    try {
      await botHostApi.updateSchedule(row.id, { status: enabled ? "enabled" : "paused" });
      await reload();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const runNow = async (row: BotScheduleView) => {
    try {
      await botHostApi.runSchedule(row.id);
      await reload();
      message.success(`已为「${row.title}」补跑一轮，等主机领取`);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const remove = (row: BotScheduleView) => {
    request({
      title: "删除定时任务（需密码）",
      content: `删除「${row.title}」会同时清掉它的运行记录，已下发的指令不受影响。确认删除？`,
      danger: true,
      okText: "确认删除",
      onOk: async () => {
        await botHostApi.removeSchedule(row.id);
        await reload();
      },
    });
  };

  const showRuns = async (row: BotScheduleView) => {
    const result = await botHostApi.scheduleRuns(row.id);
    if (result.message) {
      message.error(result.message);
      return;
    }
    setRuns({ title: row.title, list: result.data?.list ?? [] });
  };

  const columns: ColumnsType<BotScheduleView> = [
    {
      title: "任务",
      dataIndex: "title",
      key: "title",
      width: 200,
      render: (value: string) => <b>{value}</b>,
    },
    {
      title: "每轮指令",
      dataIndex: "instruction",
      key: "instruction",
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={<pre className="wb-host-tip">{value}</pre>}>
          <span>{value}</span>
        </Tooltip>
      ),
    },
    ...(isMobile
      ? []
      : [
          {
            title: t("工作区"),
            key: "workspace",
            width: 170,
            render: (_: unknown, row: BotScheduleView) => (
              <Tooltip title={row.workspace || t("默认工作区")}>
                <span className="text-12" style={{ maxWidth: 170 }}>
                  {row.workspace || t("默认工作区")}
                </span>
              </Tooltip>
            ),
          },
        ]),
    {
      title: "排期",
      key: "schedule",
      width: 210,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{scheduleText(row)}</span>
          <span className="text-12 muted">{nextRunText(row)}</span>
        </Space>
      ),
    },
    {
      title: "最近一轮",
      key: "last",
      width: 180,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Space size={6}>
            <Tag color={RUN_STATUS_COLOR[row.lastStatus] || "default"}>
              {SCHEDULE_LAST_STATUS_LABEL[row.lastStatus] || row.lastStatus || "未执行"}
            </Tag>
            <span className="text-12 muted">{`已跑 ${row.runCount} 轮`}</span>
          </Space>
          <span className="text-12 muted">
            {row.lastRunAt ? fmtTime(row.lastRunAt) : "—"}
          </span>
        </Space>
      ),
    },
    {
      title: "启用",
      dataIndex: "status",
      key: "status",
      width: 70,
      render: (value: string, row) => (
        <Switch
          size="small"
          checked={value === "enabled"}
          onChange={(next) => void toggleStatus(row, next)}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 250,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<PlayCircleOutlined aria-hidden />}
            onClick={() => void runNow(row)}
          >
            立即跑
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditing(row);
              setDraft(toDraft(row));
              setOpen(true);
            }}
          >
            改
          </Button>
          <Button
            size="small"
            icon={<HistoryOutlined aria-hidden />}
            onClick={() => void showRuns(row)}
            title="运行记录"
          />
          <Button size="small" danger onClick={() => remove(row)}>
            删
          </Button>
        </Space>
      ),
    },
  ];

  const visibleSchedules = schedules.filter((row) => row.hostId === hostId);
  const countOf = (id: number) =>
    schedules.filter((row) => row.hostId === id).length;

  // 切主机时把工作区落回默认：上一台的白名单不适用于这一台。
  const switchHost = (id: number) => {
    onHostChange(id);
    setDraft((prev) => ({ ...prev, hostId: id, target: EMPTY_TARGET }));
  };

  if (!hosts.length) {
    return (
      <Panel title={isMobile ? "Mobot 定时任务" : "主机定时任务"}>
        <EmptyState
          text={
            isMobile
              ? "先在「设备」页签配对一台 Mobot 手机"
              : "先在「主机」页签配对一台主机"
          }
        />
      </Panel>
    );
  }

  return (
    <>
      <div className="agent-shell">
        <Panel title={isMobile ? "Mobot 手机" : "主机"}>
          <div className="agent-conv-list">
            {hosts.map((row) => (
              <div
                key={row.id}
                className={`agent-conv${row.id === hostId ? " active" : ""}`}
                onClick={() => switchHost(row.id)}
              >
                <span className="agent-conv-title">{row.name}</span>
                <span className="text-12 muted">{`${countOf(row.id)} 个任务`}</span>
                <Tag color={hostStatusColor(row.status)}>
                  {HOST_STATUS_LABEL[row.status] || row.status}
                </Tag>
              </div>
            ))}
          </div>
          <div className="text-12 muted" style={{ marginTop: 8 }}>
            {isMobile
              ? "点一台 Mobot 手机查看定时任务；手机离线时到点指令保持待执行，上线即领取。"
              : "点一台主机查看它的定时任务；主机离线时到点指令保持待执行，上线即领取。"}
          </div>
        </Panel>

        <Panel
          title="定时任务"
          titleBadge={`${visibleSchedules.length} 个`}
          extra={
            <Button type="primary" onClick={startCreate}>
              新建定时任务
            </Button>
          }
        >
          {visibleSchedules.length ? (
            <Table<BotScheduleView>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={visibleSchedules}
              scroll={{ x: "max-content" }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          ) : (
            <EmptyState text="这台主机还没有定时任务：把每轮要做的事写成一句话，按周期到点自动下发" />
          )}
        </Panel>
      </div>

      <Modal
        open={open}
        title={
          editing
            ? `修改定时任务（${editing.title}）`
            : isMobile
              ? "新建 Mobot 定时任务"
              : "新建主机定时任务"
        }
        onCancel={close}
        onOk={() => void submit()}
        okText={busy ? "提交中" : editing ? "保存修改" : "创建"}
        cancelText="取消"
        confirmLoading={busy}
        destroyOnHidden
        width={680}
      >
        <div className="data-table-form">
          {hosts.length > 1 ? (
            <label className="data-table-form-item">
              <span className="data-table-form-label">
                执行主机<b style={{ color: "var(--danger)" }}> *</b>
              </span>
              <Select
                value={draft.hostId || undefined}
                placeholder="选择这台任务归属的主机"
                options={hosts.map((row) => ({
                  value: row.id,
                  label: row.online ? row.name : `${row.name}（不在线，指令先排队）`,
                }))}
                onChange={(value) =>
                  patch({ hostId: value, target: EMPTY_TARGET })
                }
              />
            </label>
          ) : null}
          {isMobile ? null : (
            <div className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
              <span className="data-table-form-label">工作区</span>
              <WorkspacePicker
                detail={detail}
                value={draft.target}
                onChange={(target) => patch({ target })}
                onReload={reloadDetail}
              />
            </div>
          )}
          <label className="data-table-form-item">
            <span className="data-table-form-label">
              任务名称<b style={{ color: "var(--danger)" }}> *</b>
            </span>
            <Input
              value={draft.title}
              maxLength={80}
              placeholder="如 每日晨报汇总"
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>
          <label className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">
              每轮指令<b style={{ color: "var(--danger)" }}> *</b>
            </span>
            <Input.TextArea
              rows={4}
              value={draft.instruction}
              maxLength={4000}
              placeholder="每轮都只按这一句话执行，不带上文，请把目录、要求一次说清"
              onChange={(event) => patch({ instruction: event.target.value })}
            />
          </label>
          <ScheduleFields
            draft={draft.schedule}
            onChange={(next) => patch({ schedule: { ...draft.schedule, ...next } })}
            textDate={Boolean(editing)}
            allowOnce={false}
          />
          <div className="text-12 muted" style={{ gridColumn: "1 / -1" }}>
            到点只负责把指令排进该设备的队列；离线时指令保持待执行，上线心跳即领取。
            周期重复的上一轮跑到终态后才算完成，错过的时刻不补跑。
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(runs)}
        title={`运行记录 · ${runs?.title || ""}`}
        onCancel={() => setRuns(null)}
        footer={<Button onClick={() => setRuns(null)}>关闭</Button>}
        destroyOnHidden
        width={720}
      >
        {runs?.list.length ? (
          <Table<BotScheduleRunView>
            rowKey="id"
            size="small"
            columns={[
              {
                title: "状态",
                dataIndex: "status",
                key: "status",
                width: 100,
                render: (value: string) => (
                  <Tag color={RUN_STATUS_COLOR[value] || "default"}>
                    {SCHEDULE_LAST_STATUS_LABEL[value] || value}
                  </Tag>
                ),
              },
              {
                title: "指令码",
                dataIndex: "commandCode",
                key: "commandCode",
                width: 180,
                render: (value: string) => <span className="mono text-12">{value || "—"}</span>,
              },
              {
                title: "开始",
                dataIndex: "startedAt",
                key: "startedAt",
                width: 150,
                render: (value: string | null) => fmtTime(value),
              },
              {
                title: "结束",
                dataIndex: "finishedAt",
                key: "finishedAt",
                width: 150,
                render: (value: string | null) => fmtTime(value),
              },
              {
                title: "说明",
                dataIndex: "error",
                key: "error",
                render: (value: string) => value || "—",
              },
            ]}
            dataSource={runs.list}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
          />
        ) : (
          <EmptyState text="这个任务还没有跑过" />
        )}
      </Modal>
      {modal}
    </>
  );
}
