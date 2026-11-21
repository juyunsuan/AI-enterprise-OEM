"use client";

// 作品与任务页签：合成结果台账与异步任务台账（卡住的任务可重试）。
import { SearchOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  DH_TASK_KIND_LABELS,
  DH_TASK_STATUS_LABELS,
  DH_WORK_STAGE_LABELS,
  DH_WORK_STATUS_LABELS,
  type DhTaskRow,
  type DhWorkRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList } from "./shared";

export function WorksTab() {
  const [tab, setTab] = useState("works");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "works", label: "作品", children: <WorkSection key="works" /> },
        { key: "tasks", label: "异步任务", children: <TaskSection key="tasks" /> },
      ]}
    />
  );
}

type WorkStatus = "" | "0" | "1" | "2";
type TaskStatus = "" | "0" | "1" | "2" | "3";

function WorkSection() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<WorkStatus>("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.works({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(status ? { status: Number(status) } : {}),
          ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [status, appliedKeyword, memberId],
  );
  const list = usePagedList<DhWorkRow>(fetcher);

  const remove = (row: DhWorkRow) => {
    Modal.confirm({
      title: "删除作品",
      content: `确定删除「${row.title || row.id}」？删除后会员端不可再查看。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeWork({ body: { id: row.id } });
          message.success("已删除");
          list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhWorkRow> = [
    {
      title: "作品",
      dataIndex: "title",
      width: 220,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value || `作品 #${row.id}`}</span>
          <span className="muted text-12">{row.nickname || "微信用户"}</span>
        </Space>
      ),
    },
    {
      title: "状态",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.status === 1 ? "green" : row.status === 2 ? "red" : "processing"}>
            {DH_WORK_STATUS_LABELS[String(row.status)] || row.status}
          </Tag>
          <span className="muted text-12">
            {DH_WORK_STAGE_LABELS[row.stage] || row.stage}
          </span>
          {row.failReason ? (
            <span className="text-12" style={{ color: "var(--error, #ff4d4f)" }}>
              {row.failReason}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "消耗",
      width: 100,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{row.pointCost} 算力</span>
          {row.isRefund ? <span className="text-12" style={{ color: "var(--success, #52c41a)" }}>已退回</span> : null}
        </Space>
      ),
    },
    {
      title: "结果",
      render: (_, row) =>
        row.resultVideoUrl ? (
          <a href={row.resultVideoUrl} target="_blank" rel="noreferrer">
            播放视频
          </a>
        ) : row.audioUrl ? (
          <audio controls preload="none" src={row.audioUrl} style={{ height: 30 }} />
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "创建",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 80,
      render: (_, row) => (
        <Button size="small" danger onClick={() => remove(row)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="作品台账"
      extra={
        <Space wrap>
          <Input
            allowClear
            placeholder="作品标题"
            prefix={<SearchOutlined />}
            value={keyword}
            style={{ width: 160 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setAppliedKeyword(keyword.trim());
              list.setPage(1);
            }}
          />
          <Input
            placeholder="会员 ID"
            value={memberId}
            style={{ width: 110 }}
            onChange={(event) => setMemberId(event.target.value)}
            onPressEnter={() => list.setPage(1)}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            options={[
              { value: "", label: "全部状态" },
              { value: "0", label: "合成中" },
              { value: "1", label: "已完成" },
              { value: "2", label: "合成失败" },
            ]}
            onChange={(value: WorkStatus) => {
              setStatus(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有合成作品。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
        />
      )}
    </Panel>
  );
}

function TaskSection() {
  const { message } = App.useApp();
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState<TaskStatus>("");
  const [retrying, setRetrying] = useState<number | null>(null);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.tasks({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(kind ? { kind } : {}),
          ...(status ? { status: Number(status) } : {}),
        },
      }),
    [kind, status],
  );
  const list = usePagedList<DhTaskRow>(fetcher);

  const retry = async (row: DhTaskRow) => {
    setRetrying(row.id);
    try {
      const result = await digitalHumanApi.retryTask({ body: { id: row.id } });
      if (result?.ok) message.success(result.message || "已重新发起");
      else message.warning(result?.message || "重试失败");
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "重试失败");
    } finally {
      setRetrying(null);
    }
  };

  const columns: ColumnsType<DhTaskRow> = [
    {
      title: "任务",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{DH_TASK_KIND_LABELS[row.kind] || row.kind}</span>
          <span className="muted text-12">
            {row.refTable} #{row.refId} · {row.protocol}
          </span>
        </Space>
      ),
    },
    {
      title: "状态",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.status === 2 ? "green" : row.status === 3 ? "red" : "processing"}>
            {DH_TASK_STATUS_LABELS[String(row.status)] || row.status}
          </Tag>
          <span className="muted text-12">尝试 {row.attempts} 次</span>
          {row.error ? (
            <span className="text-12" style={{ color: "var(--error, #ff4d4f)" }}>
              {row.error}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "供应商任务号",
      dataIndex: "providerTaskId",
      ellipsis: true,
      render: (value: string) => <span className="mono text-12">{value || "—"}</span>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 90,
      render: (_, row) => (
        <Button
          size="small"
          disabled={row.status === 2}
          loading={retrying === row.id}
          onClick={() => void retry(row)}
        >
          重试
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="异步任务"
      extra={
        <Space>
          <Select
            value={kind}
            style={{ width: 150 }}
            options={[
              { value: "", label: "全部类型" },
              ...Object.entries(DH_TASK_KIND_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(value: string) => {
              setKind(value);
              list.setPage(1);
            }}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            options={[
              { value: "", label: "全部状态" },
              { value: "0", label: "待发起" },
              { value: "1", label: "进行中" },
              { value: "2", label: "成功" },
              { value: "3", label: "失败" },
            ]}
            onChange={(value: TaskStatus) => {
              setStatus(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={list.loading}
        columns={columns}
        dataSource={list.rows}
        pagination={{
          current: list.page,
          pageSize: PAGE_SIZE,
          total: list.total,
          showSizeChanger: false,
          onChange: list.setPage,
        }}
      />
    </Panel>
  );
}
