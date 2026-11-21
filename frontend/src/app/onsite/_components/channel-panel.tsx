"use client";
// 代理-渠道：渠道分类先分组（如社群 / 异业 / 地推），渠道商挂分类下按成交额分佣。
import type {
  OnsiteChannelCategoryRow,
  OnsiteChannelCategorySave,
  OnsiteChannelRow,
  OnsiteChannelSave,
} from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteAgentActions,
  useOnsiteChannelCategories,
  useOnsiteChannels,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { StatusTag, cents } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const EMPTY_CHANNEL: OnsiteChannelSave = {
  categoryId: 0,
  name: "",
  contact: "",
  phone: "",
  rate: 0,
};

export function ChannelPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const categories = useOnsiteChannelCategories({ shopId });
  const channels = useOnsiteChannels({ shopId });
  const categoryRows = categories.data?.list ?? [];
  const channelRows = channels.data?.list ?? [];

  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<OnsiteChannelCategoryRow | null>(null);
  const [catForm] = Form.useForm<OnsiteChannelCategorySave>();

  const [channelOpen, setChannelOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<OnsiteChannelRow | null>(null);
  const [channelForm] = Form.useForm<OnsiteChannelSave>();

  const openCat = (row?: OnsiteChannelCategoryRow) => {
    catForm.setFieldsValue(row ? { id: row.id, name: row.name, sortOrder: row.sortOrder } : { name: "", sortOrder: 0 });
    setEditingCat(row ?? null);
    setCatOpen(true);
  };

  const saveCat = async () => {
    const values = await catForm.validateFields();
    await actions.saveChannelCategory.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editingCat?.id },
    });
    setCatOpen(false);
  };

  const openChannel = (row?: OnsiteChannelRow) => {
    channelForm.setFieldsValue(
      row
        ? {
            id: row.id,
            categoryId: row.categoryId,
            name: row.name,
            contact: row.contact,
            phone: row.phone,
            rate: row.rate,
          }
        : { ...EMPTY_CHANNEL },
    );
    setEditingChannel(row ?? null);
    setChannelOpen(true);
  };

  const saveChannel = async () => {
    const values = await channelForm.validateFields();
    await actions.saveChannel.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editingChannel?.id },
    });
    setChannelOpen(false);
  };

  const toggleChannel = (row: OnsiteChannelRow) =>
    void actions.setChannelStatus.mutateAsync({
      params: { id: String(shopId), channelId: String(row.id) },
      body: { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
    });

  const catColumns: TableProps<OnsiteChannelCategoryRow>["columns"] = [
    { title: "分类", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "排序", dataIndex: "sortOrder", width: 100 },
    {
      title: "操作",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openCat(row)}>
            编辑
          </Button>
          <Popconfirm
            title={`删除分类「${row.name}」`}
            description="分类下还有渠道时删除会被拒绝；请先把渠道移到其他分类。"
            okText="确认删除"
            cancelText="再想想"
            onConfirm={() =>
              void actions.removeChannelCategory.mutateAsync({
                params: { id: String(shopId), categoryId: String(row.id) },
                body: undefined,
              })
            }
          >
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const channelColumns: TableProps<OnsiteChannelRow>["columns"] = [
    {
      title: "渠道商",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <strong>{row.name}</strong>
          <div className="muted text-12">
            {row.categoryName || "未分类"}
            {row.contact ? ` · ${row.contact}` : ""}
            {row.phone ? ` · ${row.phone}` : ""}
          </div>
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
          <Button size="small" type="link" onClick={() => openChannel(row)}>
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            danger={row.status === "ACTIVE"}
            onClick={() => toggleChannel(row)}
          >
            {row.status === "ACTIVE" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="渠道分类"
        extra={
          <Button onClick={() => openCat()}>新增分类</Button>
        }
      >
        <Notice variant="info">
          分类只用于分组与筛选，不参与算佣；渠道商选择分类后，这里可以快速看出各类渠道的产出。
        </Notice>
        {categoryRows.length ? (
          <Space wrap size={8} style={{ marginBottom: 12 }}>
            {categoryRows.map((row) => (
              <Tag key={row.id}>{row.name}</Tag>
            ))}
          </Space>
        ) : null}
        {!categoryRows.length && !categories.isFetching ? (
          <EmptyState text="还没有渠道分类。分类可以留空直接用未分类，先建一个便于归纳。" />
        ) : (
          <DataTable<OnsiteChannelCategoryRow>
            rows={categoryRows}
            columns={catColumns}
            page={1}
            loading={categories.isFetching}
          />
        )}
      </Panel>

      <Panel
        title="渠道商"
        extra={
          <Button type="primary" onClick={() => openChannel()}>
            新增渠道商
          </Button>
        }
      >
        {!channelRows.length && !channels.isFetching ? (
          <EmptyState text="还没有渠道商。建渠道商后在「绑定关系」里把顾客挂过去才会产生分佣。" />
        ) : (
          <DataTable<OnsiteChannelRow>
            rows={channelRows}
            columns={channelColumns}
            page={1}
            loading={channels.isFetching}
          />
        )}
      </Panel>

      <Modal
        open={catOpen}
        destroyOnHidden
        title={editingCat ? `编辑分类：${editingCat.name}` : "新增渠道分类"}
        confirmLoading={actions.saveChannelCategory.isPending}
        onCancel={() => setCatOpen(false)}
        onOk={() => void saveCat()}
      >
        <Form form={catForm} layout="vertical">
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: "请填写分类名称" }]}
          >
            <Input maxLength={40} placeholder="如：社群渠道" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序值">
            <InputNumber min={0} max={9999} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={channelOpen}
        destroyOnHidden
        title={editingChannel ? `编辑渠道商：${editingChannel.name}` : "新增渠道商"}
        confirmLoading={actions.saveChannel.isPending}
        onCancel={() => setChannelOpen(false)}
        onOk={() => void saveChannel()}
      >
        <Form form={channelForm} layout="vertical">
          <Form.Item
            name="name"
            label="渠道商名称"
            rules={[{ required: true, message: "请填写渠道商名称" }]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="categoryId" label="分类" style={{ width: 180 }}>
              <Select
                options={[
                  { value: 0, label: "未分类" },
                  ...categoryRows.map((row) => ({ value: row.id, label: row.name })),
                ]}
              />
            </Form.Item>
            <Form.Item name="rate" label="分佣比例（%）" style={{ width: 150 }}>
              <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="contact" label="联系人" style={{ width: 200 }}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="phone" label="电话" style={{ width: 200 }}>
              <Input maxLength={32} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
