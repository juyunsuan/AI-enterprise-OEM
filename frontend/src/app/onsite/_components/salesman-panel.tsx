"use client";
// 代理-业务员：挂在区域代理下的跑单人员，按成交额拿提成；归属来自顾客绑定的业务员。
import type { OnsiteAgentRow, OnsiteSalesmanRow, OnsiteSalesmanSave } from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useOnsiteAgentActions, useOnsiteAgents, useOnsiteSalesmen } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { StatusTag, cents } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const EMPTY: OnsiteSalesmanSave = {
  agentId: 0,
  name: "",
  phone: "",
  area: "",
  rate: 0,
};

export function SalesmanPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const query = useOnsiteSalesmen({ shopId });
  const agentQuery = useOnsiteAgents({ shopId }, {});
  const agents = agentQuery.data?.list ?? [];
  const rows = query.data?.list ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OnsiteSalesmanRow | null>(null);
  const [form] = Form.useForm<OnsiteSalesmanSave>();

  const openForm = (row?: OnsiteSalesmanRow) => {
    form.setFieldsValue(
      row
        ? {
            id: row.id,
            agentId: row.agentId,
            name: row.name,
            phone: row.phone,
            area: row.area,
            rate: row.rate,
          }
        : { ...EMPTY },
    );
    setEditing(row ?? null);
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    await actions.saveSalesman.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editing?.id },
    });
    setOpen(false);
  };

  const toggle = (row: OnsiteSalesmanRow) =>
    void actions.setSalesmanStatus.mutateAsync({
      params: { id: String(shopId), salesmanId: String(row.id) },
      body: { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
    });

  const columns: TableProps<OnsiteSalesmanRow>["columns"] = [
    {
      title: "业务员",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <strong>{row.name}</strong>
          {row.phone ? <div className="muted text-12">{row.phone}</div> : null}
        </div>
      ),
    },
    {
      title: "所属代理",
      dataIndex: "agentName",
      width: 160,
      render: (value: string, row) => value || (row.agentId ? `#${row.agentId}` : "未挂靠"),
    },
    { title: "负责区域", dataIndex: "area", width: 180, render: (v: string) => v || "—" },
    {
      title: "提成比例",
      dataIndex: "rate",
      width: 110,
      render: (value: number) => `${value}%`,
    },
    {
      title: "累计佣金",
      dataIndex: "commissionCents",
      width: 120,
      render: (value: number) => cents(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="agent" value={value} />,
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openForm(row)}>
            编辑
          </Button>
          <Button size="small" type="link" danger={row.status === "ACTIVE"} onClick={() => toggle(row)}>
            {row.status === "ACTIVE" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="业务员"
      extra={
        <Button type="primary" onClick={() => openForm()}>
          新增业务员
        </Button>
      }
    >
      <Notice variant="info">
        业务员挂在区域代理下跑单，提成按成交额 × 比例进佣金台账。顾客的归属关系在「绑定关系」页签维护，
        修改提成比例只影响新成交的订单。
      </Notice>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="还没有业务员。先建区域代理，再往代理下挂业务员。" />
      ) : (
        <DataTable<OnsiteSalesmanRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      )}

      <Modal
        open={open}
        destroyOnHidden
        title={editing ? `编辑业务员：${editing.name}` : "新增业务员"}
        confirmLoading={actions.saveSalesman.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
      >
        <Form form={form} layout="vertical">
          <Space size={12} wrap>
            <Form.Item
              name="name"
              label="姓名"
              rules={[{ required: true, message: "请填写姓名" }]}
              style={{ width: 200 }}
            >
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="phone" label="电话" style={{ width: 180 }}>
              <Input maxLength={32} />
            </Form.Item>
            <Form.Item name="rate" label="提成比例（%）" style={{ width: 150 }}>
              <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="agentId" label="所属代理" style={{ width: 240 }}>
              <Select
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 0, label: "不挂靠代理" },
                  ...agents.map((row: OnsiteAgentRow) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
              />
            </Form.Item>
            <Form.Item name="area" label="负责区域" style={{ width: 260 }}>
              <Input maxLength={120} placeholder="如：南山区 / 科技园片区" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Panel>
  );
}
