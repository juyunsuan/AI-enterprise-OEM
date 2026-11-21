"use client";
// 技师申诉页签：申诉成立会隐藏涉事差评并重算技师评分，处理说明必填写、直接回复给技师。
import {
  ONSITE_APPEAL_STATUSES,
  type OnsiteAppealRow,
} from "@enterprise/contracts";
import { Button, Form, Input, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useOnsiteAppeals, useOnsiteReviewActions } from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, statusOptions, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

type AppealDecision = { row: OnsiteAppealRow; accepted: boolean };

export function AppealPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteReviewActions();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<AppealDecision | null>(null);
  const [form] = Form.useForm<{ reply: string }>();

  const query = useOnsiteAppeals({ shopId }, { status }, page);
  const rows = query.data?.list ?? [];

  const submit = async () => {
    if (!decision) return;
    const values = await form.validateFields();
    await actions.handleAppeal.mutateAsync({
      params: { id: String(shopId) },
      body: {
        id: decision.row.id,
        accepted: decision.accepted,
        reply: values.reply.trim(),
      },
    });
    setDecision(null);
  };

  const columns: TableProps<OnsiteAppealRow>["columns"] = [
    { title: "技师", dataIndex: "staffName", width: 120 },
    {
      title: "关联评价/订单",
      key: "target",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>评价 #{row.reviewId}</span>
          <span className="muted text-12">{row.orderNo || "无订单号"}</span>
        </Space>
      ),
    },
    {
      title: "申诉理由",
      dataIndex: "reason",
      width: 300,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2} style={{ maxWidth: 300 }}>
          <span>{value}</span>
          {row.images.length ? (
            <span className="muted text-12">凭证 {row.images.length} 张</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag kind="appeal" value={value} />,
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "处理结果",
      key: "handled",
      width: 260,
      render: (_, row) =>
        row.status === "PENDING" ? (
          <span className="muted text-12">待裁决</span>
        ) : (
          <Space orientation="vertical" size={2}>
            <span>{row.reply || "—"}</span>
            <span className="muted text-12">{timeText(row.handledAt)}</span>
          </Space>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      fixed: "right",
      render: (_, row) =>
        row.status === "PENDING" ? (
          <Space size={0} wrap>
            <Button
              size="small"
              type="link"
              onClick={() => setDecision({ row, accepted: true })}
            >
              申诉成立
            </Button>
            <Button
              size="small"
              type="link"
              danger
              onClick={() => setDecision({ row, accepted: false })}
            >
              驳回
            </Button>
          </Space>
        ) : (
          <span className="muted text-12">已处理</span>
        ),
    },
  ];

  return (
    <Panel title="技师申诉">
      <Notice variant="info">
        技师对差评的申诉在这里裁决：「申诉成立」会把涉事评价隐藏并重算该技师评分；
        「驳回」则维持展示。两种结论都必须写处理说明，会直接回复给技师。
      </Notice>
      <FilterBar>
        <Select
          style={{ width: 150 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={statusOptions("appeal", ONSITE_APPEAL_STATUSES)}
        />
      </FilterBar>
      <DataTable<OnsiteAppealRow>
        rows={rows}
        columns={columns}
        total={query.data?.total}
        page={page}
        loading={query.isFetching}
        scroll={{ x: 1200 }}
        onPage={setPage}
      />

      {decision ? (
        <Modal
          open
          destroyOnHidden
          title={decision.accepted ? "裁定申诉成立" : "裁定驳回申诉"}
          okText="提交结论"
          confirmLoading={actions.handleAppeal.isPending}
          onCancel={() => setDecision(null)}
          onOk={() => void submit()}
        >
          <div className="muted text-12" style={{ marginBottom: 8 }}>
            技师「{decision.row.staffName}」对评价 #{decision.row.reviewId} 的申诉：
            {decision.row.reason}
          </div>
          <Form form={form} layout="vertical" key={decision.row.id}>
            <Form.Item
              name="reply"
              label="处理说明（回复技师）"
              extra={
                decision.accepted
                  ? "成立后该评价将被隐藏、不再计入技师评分，请说明依据"
                  : "驳回后该评价继续展示并计分，请说明理由"
              }
              rules={[{ required: true, whitespace: true, message: "处理说明必填，不能只点按钮" }]}
            >
              <Input.TextArea rows={4} maxLength={300} showCount />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </Panel>
  );
}
