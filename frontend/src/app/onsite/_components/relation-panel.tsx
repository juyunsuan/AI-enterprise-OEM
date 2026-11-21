"use client";
// 代理-绑定关系：顾客 → 推荐人 / 渠道 / 业务员 / 代理 的归属台账；一单成交按这里的快照分佣。
import type { OnsiteRelationRow } from "@enterprise/contracts";
import { Button, DatePicker, Form, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import {
  useOnsiteAgentActions,
  useOnsiteAgents,
  useOnsiteChannels,
  useOnsiteRelations,
  useOnsiteSalesmen,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;

type BindForm = {
  customerId: number;
  pid: number;
  channelId: number;
  salesmanId: number;
  agentId: number;
  expiresAt?: Dayjs | null;
};

export function RelationPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const [page, setPage] = useState(1);
  const query = useOnsiteRelations({ shopId }, page, PAGE_SIZE);
  const channels = useOnsiteChannels({ shopId });
  const salesmen = useOnsiteSalesmen({ shopId });
  const agents = useOnsiteAgents({ shopId }, {});
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<BindForm>();

  const openBind = () => {
    form.setFieldsValue({
      customerId: 0,
      pid: 0,
      channelId: 0,
      salesmanId: 0,
      agentId: 0,
      expiresAt: null,
    });
    setOpen(true);
  };

  const bind = async () => {
    const values = await form.validateFields();
    await actions.bindRelation.mutateAsync({
      params: { id: String(shopId) },
      body: {
        customerId: values.customerId,
        pid: values.pid || 0,
        channelId: values.channelId || 0,
        salesmanId: values.salesmanId || 0,
        agentId: values.agentId || 0,
        expiresAt: values.expiresAt ? values.expiresAt.endOf("day").format() : "",
      },
    });
    setOpen(false);
  };

  const columns: TableProps<OnsiteRelationRow>["columns"] = [
    {
      title: "顾客",
      dataIndex: "customerName",
      width: 150,
      render: (_, row) => row.customerName || `#${row.customerId}`,
    },
    {
      title: "归属",
      dataIndex: "channelName",
      render: (_, row) => {
        const parts = [
          row.channelName ? `渠道：${row.channelName}` : "",
          row.salesmanName ? `业务员：${row.salesmanName}` : "",
          row.agentName ? `代理：${row.agentName}` : "",
          row.pid ? `推荐人：#${row.pid}` : "",
        ].filter(Boolean);
        return parts.length ? (
          <div className="text-12">{parts.join(" · ")}</div>
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 100,
      render: (value: string) => (value === "MANUAL" ? "手工绑定" : value),
    },
    {
      title: "有效期",
      dataIndex: "expiresAt",
      width: 160,
      render: (value: string) => (value ? timeText(value) : "长期"),
    },
    {
      title: "绑定时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
  ];

  return (
    <Panel
      title="绑定关系"
      extra={
        <Button type="primary" onClick={openBind}>
          手工绑定
        </Button>
      }
    >
      <Notice variant="info">
        顾客的归属由这里决定：推荐人、渠道、业务员、代理可以同时存在，成交时各自按自己的比例分佣。
        有效期到期后不再参与新订单的分佣；已成交订单的佣金不受影响。
      </Notice>
      {!query.data?.list.length && !query.isFetching ? (
        <EmptyState text="还没有绑定关系。顾客通过分享链接进入会自动绑定，也可以在这里手工补齐。" />
      ) : (
        <DataTable<OnsiteRelationRow>
          rows={query.data?.list ?? []}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}

      <Modal
        open={open}
        destroyOnHidden
        title="手工绑定归属"
        confirmLoading={actions.bindRelation.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => void bind()}
      >
        <Form form={form} layout="vertical">
          <Space size={12} wrap>
            <Form.Item
              name="customerId"
              label="顾客 ID"
              rules={[{ required: true, message: "请填写顾客 ID" }]}
              style={{ width: 160 }}
              extra="在「顾客私域 › 顾客」查看"
            >
              <InputNumber style={{ width: "100%" }} min={1} />
            </Form.Item>
            <Form.Item name="pid" label="推荐人顾客 ID" style={{ width: 160 }}>
              <InputNumber style={{ width: "100%" }} min={0} placeholder="0 = 无" />
            </Form.Item>
            <Form.Item name="expiresAt" label="有效期至" style={{ width: 180 }} extra="留空 = 长期">
              <DatePicker
                style={{ width: "100%" }}
                disabledDate={(current) => current.isBefore(dayjs().startOf("day"))}
              />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="channelId" label="渠道商" style={{ width: 200 }}>
              <Select
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 0, label: "不绑定渠道" },
                  ...(channels.data?.list ?? []).map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
              />
            </Form.Item>
            <Form.Item name="salesmanId" label="业务员" style={{ width: 200 }}>
              <Select
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 0, label: "不绑定业务员" },
                  ...(salesmen.data?.list ?? []).map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
              />
            </Form.Item>
            <Form.Item name="agentId" label="区域代理" style={{ width: 200 }}>
              <Select
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 0, label: "不绑定代理" },
                  ...(agents.data?.list ?? []).map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Panel>
  );
}
