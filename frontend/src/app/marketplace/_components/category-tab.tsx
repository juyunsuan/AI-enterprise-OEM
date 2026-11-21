"use client";

import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MpCategory } from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { NoMarket } from "./common";

type CategoryForm = {
  id: number;
  parentId: number;
  name: string;
  icon: string;
  sortOrder: number;
  status: "ONLINE" | "OFFLINE";
};

/**
 * 平台统一类目：商户与店铺只能从这里选经营范围，不能自造。
 * 两级树；停用后不可再被新入驻/新店铺选中，存量引用保持可读。
 */
export function CategoryTab({ hasMarket }: { hasMarket: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MpCategory | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<CategoryForm>();

  const load = useCallback(async () => {
    if (!hasMarket) return;
    setLoading(true);
    try {
      setRows((await marketplaceApi.categories()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "类目读取失败");
    } finally {
      setLoading(false);
    }
  }, [hasMarket, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const roots = useMemo(() => rows.filter((row) => row.parentId === 0), [rows]);
  const nameOf = useMemo(
    () => new Map(rows.map((row) => [row.id, row.name] as const)),
    [rows],
  );

  const open = (row: MpCategory | "new") => {
    setEditing(row);
    form.setFieldsValue(
      row === "new"
        ? { id: 0, parentId: 0, name: "", icon: "", sortOrder: 0, status: "ONLINE" }
        : {
            id: row.id,
            parentId: row.parentId,
            name: row.name,
            icon: row.icon,
            sortOrder: row.sortOrder,
            status: row.status,
          },
    );
  };

  const submit = async (values: CategoryForm) => {
    setBusy(true);
    try {
      await marketplaceApi.categorySave({ body: values });
      message.success(values.id ? "类目已更新" : "类目已创建");
      setEditing(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: MpCategory) => {
    setBusy(true);
    try {
      await marketplaceApi.categoryRemove({ body: { id: row.id } });
      message.success("类目已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  if (!hasMarket) {
    return <NoMarket desc="先创建市场，再维护平台类目。" />;
  }

  const columns: ColumnsType<MpCategory> = [
    {
      title: "类目",
      dataIndex: "name",
      render: (_, row) => (
        <span style={{ paddingLeft: row.parentId ? 16 : 0 }}>
          {row.parentId ? "└ " : ""}
          {row.name}
        </span>
      ),
    },
    {
      title: "上级",
      dataIndex: "parentId",
      width: 140,
      render: (parentId: number) => (parentId ? nameOf.get(parentId) ?? "—" : "一级"),
    },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: string) =>
        status === "ONLINE" ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
    { title: "引用商户", dataIndex: "merchantTotal", width: 100 },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <span style={{ display: "inline-flex", gap: 4 }}>
          <Button size="small" type="link" onClick={() => open(row)}>
            编辑
          </Button>
          <Popconfirm title="删除该类目？" onConfirm={() => void remove(row)} disabled={busy}>
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <Panel
      title="平台类目"
      extra={
        <Button type="primary" onClick={() => open("new")}>
          新建类目
        </Button>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
      />
      <div className="text-12 muted" style={{ marginTop: 8 }}>
        类目最多两级；被商户或店铺引用的类目不能删除，可改为「停用」使其不再出现在新选择里。
      </div>
      <Modal
        title={editing === "new" ? "新建类目" : "编辑类目"}
        open={editing !== null}
        destroyOnHidden
        confirmLoading={busy}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="parentId" label="上级类目">
            <Select
              options={[
                { value: 0, label: "无（一级类目）" },
                ...roots
                  .filter((row) => editing === "new" || row.id !== editing?.id)
                  .map((row) => ({ value: row.id, label: row.name })),
              ]}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="类目名称"
            rules={[{ required: true, max: 60, message: "请填写类目名称" }]}
          >
            <Input maxLength={60} placeholder="如：食品生鲜" />
          </Form.Item>
          <Form.Item name="icon" label="图标地址">
            <Input maxLength={500} placeholder="https://…（可留空）" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序（越小越前）">
            <InputNumber min={0} max={9999} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ONLINE", label: "启用" },
                { value: "OFFLINE", label: "停用" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}
