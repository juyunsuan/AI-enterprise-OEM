"use client";
// 意见反馈页签：顾客/技师对体验的留言，回复并结案后状态从「待回复」变为「已处理」（DONE）。
import { type OnsiteFeedbackRow } from "@enterprise/contracts";
import { Button, Form, Input, Modal, Radio, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useOnsiteFeedbacks, useOnsiteReviewActions } from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

export function FeedbackPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteReviewActions();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [handling, setHandling] = useState<OnsiteFeedbackRow | null>(null);
  const [form] = Form.useForm<{ reply: string; decision: "DONE" | "PENDING" }>();

  const query = useOnsiteFeedbacks({ shopId }, { status }, page);
  const rows = query.data?.list ?? [];

  const submit = async () => {
    if (!handling) return;
    const values = await form.validateFields();
    await actions.handleFeedback.mutateAsync({
      params: { id: String(shopId) },
      body: {
        id: handling.id,
        reply: values.reply.trim(),
        status: values.decision,
      },
    });
    setHandling(null);
  };

  const columns: TableProps<OnsiteFeedbackRow>["columns"] = [
    {
      title: "提交人",
      key: "who",
      width: 150,
      render: (_, row) =>
        row.staffName
          ? `技师 ${row.staffName}`
          : row.customerId
            ? `顾客 #${row.customerId}`
            : "—",
    },
    { title: "分类", dataIndex: "category", width: 110 },
    {
      title: "内容",
      dataIndex: "content",
      width: 320,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2} style={{ maxWidth: 320 }}>
          <span>{value}</span>
          <span className="muted text-12">
            {row.images.length ? `图 ${row.images.length} 张 ` : ""}
            {row.video ? "附视频 " : ""}
            {row.orderId ? `订单 #${row.orderId}` : ""}
          </span>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="feedback" value={value} />,
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "回复",
      key: "reply",
      width: 240,
      render: (_, row) =>
        row.reply ? (
          <Space orientation="vertical" size={2}>
            <span>{row.reply}</span>
            <span className="muted text-12">{timeText(row.handledAt)}</span>
          </Space>
        ) : (
          <span className="muted text-12">未回复</span>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setHandling(row)}>
          {row.reply ? "修改处理" : "回复"}
        </Button>
      ),
    },
  ];

  return (
    <Panel title="意见反馈">
      <Notice variant="info">
        这里收集小程序端「意见反馈」入口来的留言（顾客与技师都可提交）。
        回复后选择「处理完成」即结案（状态变为 DONE）；选「保持待回复」可先记一条内部答复、稍后再结。
      </Notice>
      <FilterBar>
        <Select
          style={{ width: 150 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "PENDING", label: "待回复" },
            { value: "DONE", label: "已处理" },
          ]}
        />
      </FilterBar>
      <DataTable<OnsiteFeedbackRow>
        rows={rows}
        columns={columns}
        total={query.data?.total}
        page={page}
        loading={query.isFetching}
        scroll={{ x: 1250 }}
        onPage={setPage}
      />

      {handling ? (
        <Modal
          open
          destroyOnHidden
          title={`处理反馈 #${handling.id}（${handling.category || "未分类"}）`}
          okText="提交"
          confirmLoading={actions.handleFeedback.isPending}
          onCancel={() => setHandling(null)}
          onOk={() => void submit()}
        >
          <div className="muted text-12" style={{ marginBottom: 8 }}>
            {handling.content}
          </div>
          <Form
            form={form}
            layout="vertical"
            key={handling.id}
            initialValues={{ reply: handling.reply, decision: "DONE" }}
          >
            <Form.Item name="decision" label="处理结论" rules={[{ required: true }]}>
              <Radio.Group
                options={[
                  { value: "DONE", label: "处理完成（结案）" },
                  { value: "PENDING", label: "保持待回复" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="reply"
              label="回复内容"
              extra="处理完成时必须写清结论，提交人会在通知里看到这段回复；最多 300 字"
              rules={[
                {
                  validator: (_rule, value: string) =>
                    form.getFieldValue("decision") === "DONE" &&
                    !String(value ?? "").trim()
                      ? Promise.reject(new Error("请填写给提交人的回复"))
                      : Promise.resolve(),
                },
              ]}
            >
              <Input.TextArea rows={4} maxLength={300} showCount />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </Panel>
  );
}
