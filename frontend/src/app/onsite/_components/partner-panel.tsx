"use client";
// 代理-合伙人：以在职技师为载体的合伙人身份（如技师带单），按成交额额外分佣，与合作技师档案同源。
import type { OnsitePartnerRow, OnsitePartnerSave } from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useOnsiteAgentActions, useOnsitePartners, useOnsiteStaff } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { StatusTag, cents } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const EMPTY: OnsitePartnerSave = { staffId: 0, name: "", rate: 0 };

export function PartnerPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const query = useOnsitePartners({ shopId });
  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, 100);
  const staffRows = staffQuery.data?.list ?? [];
  const rows = query.data?.list ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OnsitePartnerRow | null>(null);
  const [form] = Form.useForm<OnsitePartnerSave>();

  const openForm = (row?: OnsitePartnerRow) => {
    form.setFieldsValue(
      row
        ? { id: row.id, staffId: row.staffId, name: row.name, rate: row.rate }
        : { ...EMPTY },
    );
    setEditing(row ?? null);
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    await actions.savePartner.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editing?.id },
    });
    setOpen(false);
  };

  const columns: TableProps<OnsitePartnerRow>["columns"] = [
    {
      title: "合伙人",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <strong>{row.name || row.staffName || `技师 #${row.staffId}`}</strong>
          <div className="muted text-12">技师：{row.staffName || `#${row.staffId}`}</div>
        </div>
      ),
    },
    {
      title: "分佣比例",
      dataIndex: "rate",
      width: 110,
      render: (value: number) => `${value}%`,
    },
    {
      title: "累计佣金",
      dataIndex: "commissionCents",
      width: 130,
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
      width: 90,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => openForm(row)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="合伙人"
      extra={
        <Button type="primary" onClick={() => openForm()}>
          新增合伙人
        </Button>
      }
    >
      <Notice variant="info">
        合伙人是挂在技师档案上的额外分佣身份，顾客归属到该合伙人后，成交额按比例进佣金台账。
        合伙人必须是在职技师；技师停用后分佣随之停止。
      </Notice>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="还没有合伙人。选择在职技师设置分佣比例即可加入。" />
      ) : (
        <DataTable<OnsitePartnerRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      )}

      <Modal
        open={open}
        destroyOnHidden
        title={editing ? `编辑合伙人：${editing.name || editing.staffName}` : "新增合伙人"}
        confirmLoading={actions.savePartner.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="staffId"
            label="关联技师"
            rules={[{ required: true, message: "请选择技师" }]}
            extra="同一技师只能有一个合伙人身份"
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={staffRows.map((row) => ({
                value: row.id,
                label: `${row.name}${row.staffNo ? `（${row.staffNo}）` : ""}`,
              }))}
            />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="name" label="展示名称" style={{ width: 220 }} extra="留空显示技师名">
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="rate" label="分佣比例（%）" style={{ width: 150 }}>
              <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Panel>
  );
}
