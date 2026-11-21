"use client";

// 反馈页签：会员意见列表与回复（回复会显示在小程序反馈页）。
import { App, Button, Image, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import type { DhFeedbackRow } from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList } from "./shared";

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  pending: "待回复",
  replied: "已回复",
};

export function FeedbackTab() {
  const { message } = App.useApp();
  const [status, setStatus] = useState("pending");
  const [reply, setReply] = useState<{ row: DhFeedbackRow; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.feedbacks({
        query: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) },
      }),
    [status],
  );
  const list = usePagedList<DhFeedbackRow>(fetcher);

  const submit = async () => {
    if (!reply) return;
    if (!reply.text.trim()) {
      message.error("请填写回复内容");
      return;
    }
    setSaving(true);
    try {
      await digitalHumanApi.replyFeedback({
        body: { id: reply.row.id, reply: reply.text.trim() },
      });
      message.success("已回复");
      setReply(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<DhFeedbackRow> = [
    {
      title: "会员",
      width: 140,
      render: (_, row) => `${row.nickname || "微信用户"}（${row.memberId}）`,
    },
    { title: "内容", dataIndex: "content", ellipsis: true },
    {
      title: "图片",
      width: 180,
      render: (_, row) =>
        row.images.length ? (
          <Space size={4}>
            {row.images.map((url) => (
              <Image key={url} src={url} alt="反馈图" width={40} height={40} style={{ objectFit: "cover", borderRadius: 4 }} />
            ))}
          </Space>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "联系方式",
      dataIndex: "contact",
      width: 140,
      ellipsis: true,
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Tag color={row.status === "replied" ? "green" : "processing"}>
          {FEEDBACK_STATUS_LABELS[row.status] || row.status}
        </Tag>
      ),
    },
    {
      title: "回复",
      dataIndex: "reply",
      ellipsis: true,
      render: (value: string) => value || <span className="muted">—</span>,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 80,
      render: (_, row) => (
        <Button size="small" onClick={() => setReply({ row, text: row.reply || "" })}>
          {row.reply ? "改回复" : "回复"}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="意见反馈"
      extra={
        <Select
          value={status}
          style={{ width: 120 }}
          options={[
            { value: "pending", label: "待回复" },
            { value: "replied", label: "已回复" },
            { value: "", label: "全部" },
          ]}
          onChange={(value: string) => {
            setStatus(value);
            list.setPage(1);
          }}
        />
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="没有反馈。" />
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

      <Modal
        open={Boolean(reply)}
        title="回复反馈"
        okText="发送"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setReply(null)}
      >
        {reply ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <span className="text-12 muted">{reply.row.content}</span>
            <Input.TextArea
              rows={4}
              maxLength={2000}
              value={reply.text}
              onChange={(event) => setReply({ ...reply, text: event.target.value })}
            />
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}
