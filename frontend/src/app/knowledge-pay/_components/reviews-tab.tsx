"use client";

// 评价管理：课程评分与留言审核，支持站点方回复、隐藏与删除。
import { DeleteOutlined, MessageOutlined, EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  Modal,
  Popconfirm,
  Rate,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { KpResourceRow, KpReviewRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const PAGE_SIZE = 20;

export function ReviewsTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<KpResourceRow[]>([]);

  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [resourceId, setResourceId] = useState(0);
  const [page, setPage] = useState(1);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<KpReviewRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await knowledgePayApi.resources({
          query: { page: 1, pageSize: 200, keyword: "", categoryId: 0, mediaType: "all", accessMode: "all", status: "all" },
        });
        setCourses(data?.list ?? []);
      } catch {
        // 课程筛选是辅助能力，失败不影响评价列表
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.reviews({
        query: {
          page,
          pageSize: PAGE_SIZE,
          keyword: appliedKeyword,
          resourceId,
          status,
        },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "评价加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, appliedKeyword, resourceId, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReply = (row: KpReviewRow) => {
    setReplyTarget(row);
    setReplyText(row.reply);
    setReplyOpen(true);
  };

  const saveReply = async () => {
    if (!replyTarget) return;
    setSaving(true);
    try {
      await knowledgePayApi.replyReview({
        params: { id: String(replyTarget.id) },
        body: { reply: replyText.trim() },
      });
      message.success("回复已保存，小程序端即时可见");
      setReplyOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: KpReviewRow) => {
    try {
      await knowledgePayApi.setReviewStatus({
        params: { id: String(row.id) },
        body: { status: !row.status },
      });
      message.success(row.status ? "评价已隐藏" : "评价已显示");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const remove = async (row: KpReviewRow) => {
    try {
      await knowledgePayApi.removeReview({ params: { id: String(row.id) } });
      message.success("评价已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpReviewRow> = [
    {
      title: "会员",
      dataIndex: "nickname",
      width: 140,
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value || "微信用户"}</span>
          {row.avatar ? <span className="text-12 muted">有头像</span> : null}
        </Space>
      ),
    },
    {
      title: "课程",
      dataIndex: "courseTitle",
      width: 200,
      ellipsis: true,
      render: (value: string) => value || <span className="text-12 muted">课程已删除</span>,
    },
    {
      title: "评分",
      dataIndex: "rating",
      width: 130,
      render: (value: number) => <Rate disabled value={value} style={{ fontSize: 14 }} />,
    },
    {
      title: "评价内容",
      dataIndex: "content",
      ellipsis: true,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2} style={{ width: "100%" }}>
          <span>{value || <span className="text-12 muted">未填写文字</span>}</span>
          {row.reply ? (
            <span className="text-12" style={{ color: "var(--primary)" }}>
              站点回复：{row.reply}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="green">显示中</Tag> : <Tag>已隐藏</Tag>,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 220,
      render: (_value, row) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<MessageOutlined aria-hidden />}
            onClick={() => openReply(row)}
          >
            回复
          </Button>
          <Button
            type="link"
            size="small"
            icon={row.status ? <EyeInvisibleOutlined aria-hidden /> : <EyeOutlined aria-hidden />}
            onClick={() => void toggleStatus(row)}
          >
            {row.status ? "隐藏" : "显示"}
          </Button>
          <Popconfirm title="删除这条评价？" onConfirm={() => void remove(row)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined aria-hidden />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="评价管理"
      titleExtra={<span className="text-12 muted">会员解锁课程后可评分留言；回复与隐藏动作即时生效</span>}
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="评价关键词"
          style={{ width: 220 }}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (!event.target.value) {
              setAppliedKeyword("");
              setPage(1);
            }
          }}
          onSearch={(value) => {
            setAppliedKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          style={{ width: 220 }}
          value={resourceId}
          onChange={(value) => {
            setResourceId(value);
            setPage(1);
          }}
          options={[
            { value: 0, label: "全部课程" },
            ...courses.map((item) => ({ value: item.id, label: item.title })),
          ]}
        />
        <Select
          style={{ width: 120 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "visible", label: "显示中" },
            { value: "hidden", label: "已隐藏" },
          ]}
        />
      </Space>

      <Table<KpReviewRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1180 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: <EmptyState text="还没有评价；学员解锁并学习课程后可提交评分。" /> }}
      />

      <Modal
        open={replyOpen}
        title={`回复评价 · ${replyTarget?.nickname || "会员"}`}
        onCancel={() => setReplyOpen(false)}
        onOk={() => void saveReply()}
        confirmLoading={saving}
        okText="保存回复"
        destroyOnHidden
      >
        <div className="text-12 muted" style={{ marginBottom: 6 }}>
          原评价：{replyTarget?.content || "（未填写文字）"}
        </div>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          value={replyText}
          placeholder="回复会展示在该评价下方，留空保存表示删除回复"
          onChange={(event) => setReplyText(event.target.value)}
        />
      </Modal>
    </Panel>
  );
}
