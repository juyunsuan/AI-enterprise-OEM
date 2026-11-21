"use client";

// 学习数据：会员 × 课时的播放进度台账，用于看谁在学、学到哪、是否完课。
import { App, Input, Progress, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { KpLearningRow, KpResourceRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const PAGE_SIZE = 20;

function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

export function LearningsTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpLearningRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<KpResourceRow[]>([]);

  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [resourceId, setResourceId] = useState(0);
  const [completed, setCompleted] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    void (async () => {
      try {
        const data = await knowledgePayApi.resources({
          query: { page: 1, pageSize: 200, keyword: "", categoryId: 0, mediaType: "all", accessMode: "all", status: "all" },
        });
        setCourses(data?.list ?? []);
      } catch {
        // 课程筛选是辅助能力，失败不影响台账
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.learnings({
        query: {
          page,
          pageSize: PAGE_SIZE,
          keyword: appliedKeyword,
          resourceId,
          completed,
        },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "学习记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, appliedKeyword, resourceId, completed, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<KpLearningRow> = [
    {
      title: "会员",
      dataIndex: "nickname",
      width: 150,
      render: (value: string) => value || "微信用户",
    },
    {
      title: "课程",
      dataIndex: "courseTitle",
      width: 220,
      ellipsis: true,
      render: (value: string) => value || <span className="text-12 muted">课程已删除</span>,
    },
    {
      title: "课时",
      dataIndex: "lessonTitle",
      width: 220,
      ellipsis: true,
      render: (value: string) => value || <span className="text-12 muted">课时已删除</span>,
    },
    {
      title: "播放进度",
      width: 200,
      render: (_value, row) => {
        const percent = row.durationSec
          ? Math.min(100, Math.round((row.positionSec / row.durationSec) * 100))
          : 0;
        return (
          <Space orientation="vertical" size={2} style={{ width: "100%" }}>
            <Progress percent={percent} size="small" showInfo={false} />
            <span className="text-12 muted">
              {clock(row.positionSec)} / {clock(row.durationSec)}
            </span>
          </Space>
        );
      },
    },
    {
      title: "状态",
      dataIndex: "completed",
      width: 100,
      render: (value: boolean) =>
        value ? <Tag color="green">已完课</Tag> : <Tag color="blue">学习中</Tag>,
    },
    {
      title: "最近学习",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
  ];

  return (
    <Panel
      title="学习数据"
      titleExtra={<span className="text-12 muted">按课时记录播放位置；完课 = 主动标记或播放至 90%</span>}
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="会员 / 课程 / 课时关键词"
          style={{ width: 240 }}
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
          value={completed}
          onChange={(value) => {
            setCompleted(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "doing", label: "学习中" },
            { value: "done", label: "已完课" },
          ]}
        />
      </Space>

      <Table<KpLearningRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1060 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: <EmptyState text="还没有学习记录；学员在小程序里播放课时后会自动上报进度。" /> }}
      />
    </Panel>
  );
}
