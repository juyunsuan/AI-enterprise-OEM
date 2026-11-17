"use client";

import { ClockCircleOutlined, MessageOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Drawer,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  BotDispatchSource,
  BotDispatchTask,
  BotDispatchTaskDetail,
  BotDispatchTaskType,
} from "@enterprise/contracts";
import { BOT_DISPATCH_TARGET_KIND_SHORT_LABELS } from "@enterprise/contracts";
import { EmptyState, Notice, Panel, TabStrip } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import {
  SOURCE_LABEL,
  deviceChatPath,
  devicePairingPath,
  dispatchApi,
  dispatchRowKey,
  isOpenTask,
  taskStatusColor,
  type DispatchTaskPage,
} from "./dispatch-common";

const EMPTY_PAGE: DispatchTaskPage = {
  list: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

type TypeFilter = "all" | BotDispatchTaskType;
type SourceFilter = BotDispatchSource | "ALL";

const TYPE_TABS = [
  { key: "all", label: "全部任务" },
  { key: "command", label: "一次性派单" },
  { key: "schedule", label: "定时任务" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "AGENT", label: "仅 Agent 派单" },
  { value: "ALL", label: "含设备 / 企云页面手动下发" },
  { value: "UI", label: "仅手动下发" },
];

/** 有未到终态的指令时按这个间隔续拉：设备看客户端回执，云端由平台轮询后落库。 */
const POLL_MS = 5000;

/**
 * Agent 群控页签：只看「Agent 派给主机 / 手机 / 企业云的活」这一本台账。
 * 三条通道的清单（在线、负载、电量、令牌、凭据、可用 Agent）都归「Agent-Bot」，这里不复制一份——
 * 账号下可能挂几百台设备，把设备清单搬进 Agent 页签会把这一屏挤得没法用。
 * 台账把一次性派单与定时任务归一成同一形状，行内直接跳回那台执行位的对话框。
 */
export function AgentDispatchTab() {
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<DispatchTaskPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [source, setSource] = useState<SourceFilter>("AGENT");
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<BotDispatchTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // quiet＝轮询：不掀表格的 loading，避免每 5 秒闪一次骨架。
  const reload = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const result = await dispatchApi.tasks({
        ...(type === "all" ? {} : { type }),
        source,
        page: pageNo,
        pageSize,
      });
      if (result.data) setRows(result.data);
      setError(result.message);
      setLoading(false);
    },
    [type, source, pageNo, pageSize],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const hasOpen = rows.list.some(isOpenTask);
  useEffect(() => {
    if (!hasOpen) return;
    const timer = setInterval(() => void reload(true), POLL_MS);
    return () => clearInterval(timer);
  }, [hasOpen, reload]);

  const openDetail = async (row: BotDispatchTask) => {
    setDetail({ ...row, progressText: "", workspace: "" });
    setDetailLoading(true);
    const result = await dispatchApi.taskDetail(row.id, row.type, row.clientKind);
    if (result.data) setDetail(result.data);
    else message.error(result.message || "任务详情加载失败");
    setDetailLoading(false);
  };

  const toggleSchedule = async (row: BotDispatchTask) => {
    const next = row.status === "enabled" ? "paused" : "enabled";
    try {
      await dispatchApi.setScheduleStatus(row.id, next, row.clientKind);
      message.success(
        next === "paused" ? `已暂停「${row.title}」` : `已恢复「${row.title}」`,
      );
      await reload(true);
    } catch (error) {
      message.error((error as Error).message || "操作失败");
    }
  };

  const columns: ColumnsType<BotDispatchTask> = [
    {
      title: "任务",
      dataIndex: "title",
      width: 280,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          {row.instruction && row.instruction !== row.title ? (
            <div className="text-12 muted" style={{ wordBreak: "break-all" }}>
              {row.instruction.length > 60
                ? `${row.instruction.slice(0, 60)}…`
                : row.instruction}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "执行位",
      dataIndex: "hostName",
      width: 220,
      render: (_, row) => (
        <Space size={6}>
          <Tooltip
            title={
              row.clientKind === "WORKBUDDY"
                ? "打开企云账号的云端对话"
                : "打开这台设备的对话框"
            }
          >
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: "auto" }}
              onClick={() =>
                router.push(deviceChatPath(row.clientKind, row.hostId))
              }
            >
              {row.hostName}
            </Button>
          </Tooltip>
          <Tag>
            {BOT_DISPATCH_TARGET_KIND_SHORT_LABELS[row.clientKind] ||
              row.clientKind}
          </Tag>
        </Space>
      ),
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 110,
      render: (value: BotDispatchSource) => (
        <Tag color={value === "AGENT" ? "blue" : "default"}>
          {SOURCE_LABEL[value] || value}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (_, row) => <Tag color={taskStatusColor(row)}>{row.statusLabel}</Tag>,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 210,
      render: (_, row) => (
        <div className="text-12">
          <div>{`创建 ${fmtTime(row.createdAt)}`}</div>
          {row.type === "schedule" ? (
            <div className="muted">
              {`下一轮 ${row.scheduledAt ? fmtTime(row.scheduledAt) : "—"} · 已跑 ${row.runCount} 轮`}
            </div>
          ) : (
            <div className="muted">
              {row.finishedAt ? `完成 ${fmtTime(row.finishedAt)}` : "等待客户端领取"}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "结果",
      dataIndex: "resultSummary",
      width: 240,
      render: (_, row) => {
        const text = row.error || row.resultSummary;
        if (!text) return <span className="muted">—</span>;
        return (
          <Tooltip title={text}>
            <span
              style={{
                display: "block",
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: row.error ? "#d4380d" : undefined,
              }}
            >
              {text}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: "操作",
      dataIndex: "id",
      width: 150,
      render: (_, row) => (
        <Space size={6}>
          <Button size="small" type="link" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {row.type === "schedule" ? (
            <Button
              size="small"
              type="link"
              onClick={() => void toggleSchedule(row)}
            >
              {row.status === "enabled" ? "暂停" : "恢复"}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error ? <Notice variant="error">群控台账加载失败：{error}</Notice> : null}

      <Panel
        title="派单台账"
        titleExtra={
          <span className="text-12 muted">
            Agent 在对话与定时任务里派发给主机 / 手机 / 企业云的任务都记在这里；有未跑完的指令时自动续拉结果
          </span>
        }
        extra={
          <Space size={10}>
            <Select
              size="small"
              value={source}
              options={SOURCE_OPTIONS}
              style={{ width: 200 }}
              onChange={(value: SourceFilter) => {
                setSource(value);
                setPageNo(1);
              }}
            />
            <Button
              size="small"
              type="link"
              onClick={() => router.push(devicePairingPath("DESKTOP"))}
            >
              设备 / 企云清单在 Agent-Bot
            </Button>
          </Space>
        }
      >
        <TabStrip
          items={TYPE_TABS}
          value={type}
          onChange={(key) => {
            setType(key as TypeFilter);
            setPageNo(1);
          }}
          style={{ marginBottom: 12 }}
        />
        <Table<BotDispatchTask>
          size="small"
          rowKey={dispatchRowKey}
          loading={loading}
          columns={columns}
          dataSource={rows.list}
          scroll={{ x: "max-content" }}
          pagination={{
            current: rows.page,
            pageSize: rows.pageSize,
            total: rows.total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (next, nextSize) => {
              setPageNo(next);
              setPageSize(nextSize);
            },
          }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ClockCircleOutlined style={{ fontSize: 36 }} aria-hidden />}
                text={
                  source === "AGENT"
                    ? "还没有 Agent 派单：到「对话」里让 Agent 把活派给主机 / 手机 / 企业云，或切到「含设备 / 企云页面手动下发」看历史指令"
                    : "这个口径下还没有任务"
                }
                action={
                  source === "AGENT" ? (
                    <Button onClick={() => router.push("/agent?tab=chat")}>
                      去对话里派单
                    </Button>
                  ) : null
                }
              />
            ),
          }}
        />
      </Panel>

      <Drawer
        open={Boolean(detail)}
        title={detail ? `任务详情 · ${detail.title}` : "任务详情"}
        size="large"
        onClose={() => setDetail(null)}
        destroyOnHidden
        extra={
          detail ? (
            <Button
              size="small"
              icon={<MessageOutlined aria-hidden />}
              onClick={() =>
                router.push(deviceChatPath(detail.clientKind, detail.hostId))
              }
            >
              {detail.clientKind === "WORKBUDDY"
                ? "到企云对话查看"
                : "到设备对话查看"}
            </Button>
          ) : null
        }
      >
        {detailLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
        {detail ? (
          <div style={{ display: "grid", gap: 14 }}>
            <Alert
              type={detail.error ? "error" : "info"}
              showIcon
              message={`${detail.hostName} · ${detail.statusLabel}`}
              description={
                detail.error ||
                `${SOURCE_LABEL[detail.source] || detail.source} · 任务号 ${detail.taskKey}`
              }
            />
            <div>
              <div className="text-12 muted">指令</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                {detail.instruction || "—"}
              </div>
            </div>
            {detail.workspace ? (
              <div>
                <div className="text-12 muted">执行目录</div>
                <div style={{ marginTop: 4 }}>{detail.workspace}</div>
              </div>
            ) : null}
            <div>
              <div className="text-12 muted">执行过程</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: 4,
                  maxHeight: 320,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                {detail.progressText || "（还没有回传的过程）"}
              </div>
            </div>
            <div>
              <div className="text-12 muted">结果摘要</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                {detail.resultSummary || "—"}
              </div>
            </div>
            {detail.type === "schedule" ? (
              <div>
                <div className="text-12 muted">排期</div>
                <div style={{ marginTop: 4 }}>
                  {`下一轮 ${detail.scheduledAt ? fmtTime(detail.scheduledAt) : "—"} · 已跑 ${detail.runCount} 轮`}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
