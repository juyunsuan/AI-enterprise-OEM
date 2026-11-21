"use client";
// 代理-区域代理：省/市/区县三级代理台账，上级代理决定分佣层级；佣金按订单快照计算，改档案不影响历史单。
import type { OnsiteAgentRow, OnsiteAgentSave } from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteAgentActions,
  useOnsiteAgents,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { StatusTag, cents } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const TYPE_TEXT: Record<string, string> = {
  PROVINCE: "省代",
  CITY: "市代",
  DISTRICT: "区县代",
};

const EMPTY: OnsiteAgentSave = {
  agentType: "CITY",
  name: "",
  phone: "",
  provinceCode: "",
  cityCode: "",
  areaCode: "",
  commissionRate: 0,
  parentId: 0,
};

export function AgentRegionPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const query = useOnsiteAgents({ shopId }, {});
  const rows = query.data?.list ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OnsiteAgentRow | null>(null);
  const [form] = Form.useForm<OnsiteAgentSave>();

  const openForm = (row?: OnsiteAgentRow) => {
    form.setFieldsValue(
      row
        ? {
            id: row.id,
            agentType: row.agentType,
            name: row.name,
            phone: row.phone,
            provinceCode: row.provinceCode,
            cityCode: row.cityCode,
            areaCode: row.areaCode,
            commissionRate: row.commissionRate,
            parentId: row.parentId,
          }
        : { ...EMPTY },
    );
    setEditing(row ?? null);
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    await actions.saveAgent.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editing?.id },
    });
    setOpen(false);
  };

  const toggle = (row: OnsiteAgentRow) =>
    void actions.setAgentStatus.mutateAsync({
      params: { id: String(shopId), agentId: String(row.id) },
      body: { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
    });

  const columns: TableProps<OnsiteAgentRow>["columns"] = [
    {
      title: "代理",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <strong>{row.name}</strong>
          <div className="muted text-12">
            {TYPE_TEXT[row.agentType] ?? row.agentType}
            {row.phone ? ` · ${row.phone}` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "覆盖区域",
      dataIndex: "provinceCode",
      width: 180,
      render: (_, row) => {
        const codes = [row.provinceCode, row.cityCode, row.areaCode].filter(Boolean);
        return codes.length ? codes.join(" / ") : <span className="muted">未填写</span>;
      },
    },
    {
      title: "上级代理",
      dataIndex: "parentName",
      width: 140,
      render: (value: string, row) => value || (row.parentId ? `#${row.parentId}` : "顶级"),
    },
    {
      title: "分佣比例",
      dataIndex: "commissionRate",
      width: 110,
      render: (value: number) => `${value}%`,
    },
    {
      title: "成单 / 佣金",
      dataIndex: "orderCount",
      width: 140,
      render: (_, row) => (
        <div>
          <div>{row.orderCount} 单</div>
          <div className="muted text-12">{cents(row.commissionCents)}</div>
        </div>
      ),
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
      title="区域代理"
      extra={
        <Button type="primary" onClick={() => openForm()}>
          新增代理
        </Button>
      }
    >
      <Notice variant="info">
        代理按省 / 市 / 区县挂靠上级，订单归属到顾客绑定的区域代理。分佣比例在成交时写进佣金快照，
        之后改比例只影响新订单。停用后不再接收新归属，历史佣金照常结算。
      </Notice>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="还没有区域代理。先建省代/市代，再往下挂区县代。" />
      ) : (
        <DataTable<OnsiteAgentRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      )}

      <Modal
        open={open}
        destroyOnHidden
        title={editing ? `编辑代理：${editing.name}` : "新增代理"}
        confirmLoading={actions.saveAgent.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
      >
        <Form form={form} layout="vertical">
          <Space size={12} wrap>
            <Form.Item name="agentType" label="代理类型" style={{ width: 140 }}>
              <Select
                options={[
                  { value: "PROVINCE", label: "省代" },
                  { value: "CITY", label: "市代" },
                  { value: "DISTRICT", label: "区县代" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: "请填写代理名称" }]}
              style={{ width: 220 }}
            >
              <Input maxLength={60} placeholder="公司或个人名" />
            </Form.Item>
            <Form.Item name="phone" label="联系电话" style={{ width: 180 }}>
              <Input maxLength={32} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="provinceCode" label="省份编码" style={{ width: 130 }}>
              <Input maxLength={20} placeholder="如 440000" />
            </Form.Item>
            <Form.Item name="cityCode" label="城市编码" style={{ width: 130 }}>
              <Input maxLength={20} placeholder="如 440300" />
            </Form.Item>
            <Form.Item name="areaCode" label="区县编码" style={{ width: 130 }}>
              <Input maxLength={20} placeholder="如 440305" />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="commissionRate" label="分佣比例（%）" style={{ width: 150 }}>
              <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
            </Form.Item>
            <Form.Item
              name="parentId"
              label="上级代理"
              style={{ width: 220 }}
              extra="0 = 顶级代理"
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={[
                  { value: 0, label: "无（顶级）" },
                  ...rows
                    .filter((row) => row.id !== editing?.id)
                    .map((row) => ({
                      value: row.id,
                      label: `${row.name}（${TYPE_TEXT[row.agentType] ?? row.agentType}）`,
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
