"use client";

import { App, Button, Form, Input, Modal, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpMerchantProfile, MpMerchantUser } from "@enterprise/contracts";
import { MP_MERCHANT_ROLE_LABELS } from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";

type StaffForm = {
  id: number;
  username: string;
  password: string;
  phone: string;
};

/** 店员账号：负责人可为店员建号/改密/停用；角色不可改，避免互相提权。 */
export function StaffPanel({ profile }: { profile: MpMerchantProfile }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpMerchantUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MpMerchantUser | "new" | null>(null);
  const [form] = Form.useForm<StaffForm>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await mpMerchantApi.staffList()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "店员读取失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (row: MpMerchantUser | "new") => {
    setEditing(row);
    form.setFieldsValue(
      row === "new"
        ? { id: 0, username: "", password: "", phone: "" }
        : { id: row.id, username: row.username, password: "", phone: row.phone },
    );
  };

  const save = async (values: StaffForm) => {
    setBusy(true);
    try {
      await mpMerchantApi.staffSave({
        id: values.id,
        username: values.username,
        password: values.password ?? "",
        phone: values.phone ?? "",
        role: "STAFF",
      });
      message.success(values.id ? "店员已更新" : "店员账号已创建");
      setEditing(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: MpMerchantUser) => {
    const next = row.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setBusy(true);
    try {
      await mpMerchantApi.staffStatus({ id: row.id, status: next });
      message.success(next === "DISABLED" ? "店员已停用" : "店员已恢复");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<MpMerchantUser> = [
    { title: "账号", dataIndex: "username", width: 180 },
    {
      title: "角色",
      dataIndex: "role",
      width: 100,
      render: (role: string) => (
        <Tag color={role === "OWNER" ? "blue" : "default"}>{MP_MERCHANT_ROLE_LABELS[role] ?? role}</Tag>
      ),
    },
    { title: "手机", dataIndex: "phone", width: 150, render: (value: string) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (value === "ACTIVE" ? <Tag color="green">可用</Tag> : <Tag>已停用</Tag>),
    },
    {
      title: "最近登录",
      dataIndex: "lastLoginAt",
      width: 170,
      render: (value: string) => (value ? new Date(value).toLocaleString() : "从未"),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, row) =>
        row.id === profile.userId || row.role === "OWNER" ? (
          <span className="muted text-12">当前账号</span>
        ) : (
          <Space size={4}>
            <Button size="small" type="link" onClick={() => open(row)}>
              编辑
            </Button>
            <Button size="small" type="link" danger={row.status === "ACTIVE"} disabled={busy} onClick={() => void toggle(row)}>
              {row.status === "ACTIVE" ? "停用" : "恢复"}
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="店员账号"
      extra={
        profile.role === "OWNER" ? (
          <Button type="primary" onClick={() => open("new")}>
            新增店员
          </Button>
        ) : null
      }
    >
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      <div className="text-12 muted" style={{ marginTop: 8 }}>
        店员与负责人同属这一商户，只用商户后台；停用后该账号立即不能再登录。
      </div>
      <Modal
        title={editing === "new" ? "新增店员" : "编辑店员"}
        open={editing !== null}
        destroyOnHidden
        confirmLoading={busy}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="id" hidden>
            <Input type="hidden" />
          </Form.Item>
          <Form.Item
            name="username"
            label="登录账号"
            rules={[
              { required: true, message: "请填写账号" },
              {
                pattern: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
                message: "以字母开头，4-32 位字母、数字或下划线",
              },
            ]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing === "new" ? "初始密码" : "重置密码（留空不改）"}
            rules={
              editing === "new"
                ? [{ required: true, min: 8, max: 64, message: "初始密码至少 8 位" }]
                : [{ min: 8, max: 64, message: "新密码至少 8 位" }]
            }
          >
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input maxLength={32} />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}
