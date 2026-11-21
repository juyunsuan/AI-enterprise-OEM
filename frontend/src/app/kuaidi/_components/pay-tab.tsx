"use client";

import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  KuaidiEnterprise,
  KuaidiPayAccount,
  KuaidiPayAccountSaveBody,
} from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useKuaidiScope } from "./scope";

/**
 * 收款账户：企业级微信支付商户号，多个寄件点共用。
 *
 * 资金直收：买家运费由微信支付直接结算到店主自己的商户号，平台不代扣、不代退、
 * 不落资金账本。商户号 + APIv3 密钥 + 证书私钥齐了才算「可用」；
 * 寄件点在「站点设置」里指定账户，未指定时用账号下第一个启用的账户。
 */
export function PayTab() {
  const { message } = App.useApp();
  const { reload } = useKuaidiScope();
  const [accounts, setAccounts] = useState<KuaidiPayAccount[]>([]);
  const [enterprises, setEnterprises] = useState<KuaidiEnterprise[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<KuaidiPayAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, companies] = await Promise.all([
        kuaidiApi.payAccounts(),
        kuaidiApi.enterprises(),
      ]);
      setAccounts(rows ?? []);
      setEnterprises(companies ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "收款账户读取失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async (row: KuaidiPayAccount) => {
    setBusyId(row.id);
    try {
      const result = await kuaidiApi.payAccountTest({ body: { id: row.id } });
      if (result?.ok) message.success(result.message);
      else message.warning(result?.message || "自查未通过");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自查失败");
    } finally {
      setBusyId(0);
    }
  };

  const remove = async (row: KuaidiPayAccount) => {
    setBusyId(row.id);
    try {
      await kuaidiApi.payAccountRemove({ body: { id: row.id } });
      message.success(`收款账户「${row.name}」已删除`);
      await load();
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusyId(0);
    }
  };

  const columns: ColumnsType<KuaidiPayAccount> = [
    {
      title: "账户名称",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <strong>{value}</strong>
          <span className="muted text-12">{row.mchId}</span>
        </Space>
      ),
    },
    {
      title: "归属企业",
      dataIndex: "enterpriseName",
      width: 180,
      render: (value: string) => value || <span className="muted">个人主体</span>,
    },
    {
      title: "凭据",
      key: "secrets",
      width: 220,
      render: (_value, row) => (
        <Space size={4} wrap>
          <Tag color={row.keyConfigured ? "success" : "default"}>
            {row.keyConfigured ? "APIv3 密钥已配" : "缺 APIv3 密钥"}
          </Tag>
          <Tag color={row.certConfigured ? "success" : "default"}>
            {row.certConfigured ? "证书私钥已配" : "缺证书私钥"}
          </Tag>
          {row.certSerial ? null : <Tag color="warning">缺证书序列号</Tag>}
        </Space>
      ),
    },
    {
      title: "状态",
      key: "state",
      width: 130,
      render: (_value, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.complete ? "green" : "gold"}>
            {row.complete ? "可用于在线收款" : "未配齐"}
          </Tag>
          <span className="muted text-12">{row.enabled ? "已启用" : "已停用"}</span>
        </Space>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 210,
      render: (_value, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            loading={busyId === row.id}
            onClick={() => void test(row)}
          >
            自查
          </Button>
          <Popconfirm
            title="删除后绑定的寄件点会回落为「默认」账户；已有订单不受影响。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="link" danger loading={busyId === row.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="收款账户（企业级）"
        titleExtra={
          <span className="muted text-12">
            运费由微信支付直接进你的商户号，平台不经手资金
          </span>
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => setCreating(true)}
          >
            新增收款账户
          </Button>
        }
      >
        <Notice variant="info">
          <Space orientation="vertical" size={4}>
            <span>
              一个商户号可以被账号下多个寄件点共用；每个寄件点在「站点设置」里选账户，
              不选则自动使用这里第一个启用的账户。账户必须四项齐全才算可用：
              商户号、APIv3 密钥（32 位）、商户证书序列号、商户 API 证书私钥（apiclient_key.pem）。
            </span>
            <span className="muted text-12">
              密钥类字段只写不读：编辑时留空表示保留原值。退款由你在微信商户平台操作后回本站登记，
              平台不代扣、不代退。
            </span>
          </Space>
        </Notice>
        <Table<KuaidiPayAccount>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={accounts}
          pagination={false}
          scroll={{ x: 1050 }}
          locale={{
            emptyText: (
              <EmptyState
                text="还没有收款账户：新增一个你自己的微信支付商户号，配齐凭据后即可在小程序里在线收运费。"
                action={
                  <Button type="primary" onClick={() => setCreating(true)}>
                    新增收款账户
                  </Button>
                }
              />
            ),
          }}
        />
      </Panel>

      <AccountModal
        open={creating || Boolean(editing)}
        account={editing}
        enterprises={enterprises}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={async () => {
          setCreating(false);
          setEditing(null);
          await load();
          await reload();
        }}
      />
    </div>
  );
}

const MCH_PATTERN = /^\d{6,32}$/;

function AccountModal({
  open,
  account,
  enterprises,
  onClose,
  onDone,
}: {
  open: boolean;
  account: KuaidiPayAccount | null;
  enterprises: KuaidiEnterprise[];
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<KuaidiPayAccountSaveBody>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      id: account?.id ?? 0,
      name: account?.name ?? "",
      enterpriseId: account?.enterpriseId ?? 0,
      mchId: account?.mchId ?? "",
      certSerial: account?.certSerial ?? "",
      apiV3Key: "",
      privateKey: "",
      enabled: account?.enabled ?? true,
    });
  }, [open, account, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body: KuaidiPayAccountSaveBody = {
        id: values.id ?? 0,
        name: values.name.trim(),
        enterpriseId: Number(values.enterpriseId) || 0,
        mchId: values.mchId.trim(),
        certSerial: (values.certSerial ?? "").trim(),
        enabled: values.enabled !== false,
      };
      const key = (values.apiV3Key ?? "").trim();
      const privateKey = (values.privateKey ?? "").trim();
      if (key) body.apiV3Key = key;
      if (privateKey) body.privateKey = privateKey;
      await kuaidiApi.payAccountSave({ body });
      message.success(account ? "收款账户已更新" : "收款账户已新增");
      await onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={account ? `编辑收款账户 · ${account.name}` : "新增收款账户"}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
    >
      <Notice variant="info">
        商户号、APIv3 密钥与证书都在微信支付商户平台；证书私钥只能从 apiclient_key.pem
        文件里整段粘贴，请与证书序列号保持同一次申请。
      </Notice>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="name"
          label="账户名称"
          rules={[{ required: true, message: "请填写账户名称" }]}
        >
          <Input maxLength={80} placeholder="例如：总部企业收款" />
        </Form.Item>
        <Form.Item
          name="enterpriseId"
          label="归属企业"
          extra="选择已通过备案认证的企业；个人主体可留空"
        >
          <Select
            options={[
              { value: 0, label: "不绑定企业（个人主体）" },
              ...enterprises.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </Form.Item>
        <Form.Item
          name="mchId"
          label="微信支付商户号"
          rules={[
            { required: true, message: "请填写商户号" },
            { pattern: MCH_PATTERN, message: "商户号应为纯数字，如 1900000109" },
          ]}
        >
          <Input maxLength={64} placeholder="1900000109" />
        </Form.Item>
        <Form.Item
          name="apiV3Key"
          label="APIv3 密钥"
          extra="账户中心 → API 安全 → APIv3 密钥，32 位字符；留空表示保留原值"
          rules={[
            {
              validator: async (_rule, value: string) => {
                const key = String(value ?? "").trim();
                if (key && key.length !== 32) {
                  throw new Error("APIv3 密钥应为 32 位字符");
                }
              },
            },
          ]}
        >
          <Input.Password maxLength={32} placeholder="32 位字符" />
        </Form.Item>
        <Form.Item
          name="certSerial"
          label="商户证书序列号"
          extra="商户平台 API 证书里的序列号，明文保存、可回显"
        >
          <Input maxLength={128} placeholder="如 5157F09EF9727AE160BB38F82BABEDZ2" />
        </Form.Item>
        <Form.Item
          name="privateKey"
          label="商户 API 证书私钥"
          extra="apiclient_key.pem 的整段内容；留空表示保留原值"
        >
          <Input.TextArea rows={3} maxLength={8192} placeholder="-----BEGIN PRIVATE KEY-----" />
        </Form.Item>
        <Form.Item name="enabled" label="启用该账户" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
