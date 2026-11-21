"use client";

// 形象与声音页签：会员克隆素材台账（训练状态、素材回放、失败清理）。
import { App, Button, Input, Image, Modal, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  DH_TRAIN_STATUS_LABELS,
  type DhBodyRow,
  type DhVoiceRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList } from "./shared";

export function AssetsTab() {
  const [tab, setTab] = useState("bodies");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "bodies", label: "形象", children: <BodySection key="bodies" /> },
        { key: "voices", label: "声音", children: <VoiceSection key="voices" /> },
      ]}
    />
  );
}

function statusTag(status: number) {
  const color = status === 1 ? "green" : status === 2 ? "red" : "processing";
  return <Tag color={color}>{DH_TRAIN_STATUS_LABELS[String(status)] || status}</Tag>;
}

function MemberFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      placeholder="会员 ID"
      value={value}
      style={{ width: 120 }}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function BodySection() {
  const { message } = App.useApp();
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.bodies({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [memberId],
  );
  const list = usePagedList<DhBodyRow>(fetcher);

  const remove = (row: DhBodyRow) => {
    Modal.confirm({
      title: "删除形象",
      content: `确定删除「${row.name}」？会员已生成的作品不受影响。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeBody({ body: { id: row.id } });
          message.success("已删除");
          list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhBodyRow> = [
    {
      title: "形象",
      width: 220,
      render: (_, row) => (
        <Space size={8}>
          {row.coverUrl ? (
            <Image src={row.coverUrl} alt="封面" width={48} height={48} style={{ objectFit: "cover", borderRadius: 6 }} />
          ) : (
            <span style={{ width: 48, height: 48, border: "1px solid var(--border)", borderRadius: 6, display: "inline-block" }} />
          )}
          <Space orientation="vertical" size={0}>
            <span>{row.name}</span>
            <span className="muted text-12">{row.durationSec}s</span>
          </Space>
        </Space>
      ),
    },
    {
      title: "会员",
      dataIndex: "nickname",
      width: 150,
      render: (value: string, row) => `${value || "微信用户"}（${row.memberId}）`,
    },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          {statusTag(row.status)}
          {row.failReason ? <span className="text-12" style={{ color: "var(--error, #ff4d4f)" }}>{row.failReason}</span> : null}
        </Space>
      ),
    },
    {
      title: "素材",
      render: (_, row) =>
        row.sourceVideoUrl ? (
          <a href={row.sourceVideoUrl} target="_blank" rel="noreferrer">
            查看训练视频
          </a>
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
      title="形象素材"
      extra={
        <Space>
          <MemberFilter value={memberId} onChange={setMemberId} />
          <Button size="small" onClick={() => list.setPage(1)}>
            查询
          </Button>
        </Space>
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有会员上传形象素材。" />
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

function VoiceSection() {
  const { message } = App.useApp();
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.voices({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [memberId],
  );
  const list = usePagedList<DhVoiceRow>(fetcher);

  const remove = (row: DhVoiceRow) => {
    Modal.confirm({
      title: "删除声音",
      content: `确定删除「${row.name}」？会员已生成的作品不受影响。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeVoice({ body: { id: row.id } });
          message.success("已删除");
          list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhVoiceRow> = [
    { title: "声音", dataIndex: "name", width: 160 },
    {
      title: "会员",
      dataIndex: "nickname",
      width: 150,
      render: (value: string, row) => `${value || "微信用户"}（${row.memberId}）`,
    },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          {statusTag(row.status)}
          {row.failReason ? <span className="text-12" style={{ color: "var(--error, #ff4d4f)" }}>{row.failReason}</span> : null}
        </Space>
      ),
    },
    {
      title: "试听",
      render: (_, row) =>
        row.demoAudioUrl ? (
          <audio controls preload="none" src={row.demoAudioUrl} style={{ height: 30 }} />
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
      title="声音素材"
      extra={
        <Space>
          <MemberFilter value={memberId} onChange={setMemberId} />
          <Button size="small" onClick={() => list.setPage(1)}>
            查询
          </Button>
        </Space>
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有会员上传声音素材。" />
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
