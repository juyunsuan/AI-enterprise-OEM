"use client";

import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { KuaidiCompany, KuaidiCompanySaveBody } from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { moneyCny } from "@/lib/money";
import { useKuaidiScope } from "./scope";

/**
 * 快递公司报价：买家端按这里的首重/续重、偏远加收算出可选快递与运费。
 * 停用不删数据，买家端立即不再出现该公司。
 */
export function CompanyTab() {
  const { siteId, site } = useKuaidiScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<KuaidiCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<KuaidiCompany | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setRows((await kuaidiApi.companies({ query: { siteId } })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "快递公司读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: KuaidiCompany) => {
    setBusy(true);
    try {
      await kuaidiApi.companyStatus({ body: { siteId, id: row.id, enabled: !row.enabled } });
      message.success(row.enabled ? "已停用" : "已启用");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: KuaidiCompany) => {
    setBusy(true);
    try {
      await kuaidiApi.companyRemove({ body: { siteId, id: row.id } });
      message.success("已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<KuaidiCompany> = [
    {
      title: "快递公司",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space size={6}>
          <strong>{value}</strong>
          {row.code ? <Tag>{row.code}</Tag> : null}
        </Space>
      ),
    },
    {
      title: "首重",
      width: 140,
      render: (_: unknown, row) => `${row.firstWeightKg} kg 内 ${moneyCny(row.firstPrice)}`,
    },
    {
      title: "续重",
      width: 150,
      render: (_: unknown, row) =>
        `每 ${row.extraWeightKg} kg 加 ${moneyCny(row.extraPrice)}`,
    },
    {
      title: "偏远加收",
      width: 190,
      render: (_: unknown, row) =>
        row.remoteExtra > 0
          ? `${row.remoteProvinces.join("、") || "未选省份"} +${moneyCny(row.remoteExtra)}`
          : <span className="muted">无</span>,
    },
    { title: "时效", dataIndex: "deliveryDays", width: 100, render: (value: string) => value || "—" },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      render: (value: boolean) => (
        <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag>
      ),
    },
    {
      title: "操作",
      width: 180,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void toggle(row)}>
            {row.enabled ? "停用" : "启用"}
          </Button>
          <Popconfirm title="删除后买家端立即不可选，历史订单不受影响。" onConfirm={() => void remove(row)}>
            <Button size="small" type="text" danger>
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
        title="快递公司报价"
        titleExtra={
          <span className="muted text-12">
            {site ? `${site.name} · 买家端按首重/续重与偏远省份实时报价` : ""}
          </span>
        }
        extra={
          <Button type="primary" size="small" onClick={() => setEditing("new")}>
            新增快递公司
          </Button>
        }
      >
        <Notice variant="info">
          运费只由服务端按这里的规则计算：首重价 + 超出部分按续重单价向上取整，
          收件省份命中偏远清单再加偏远费；保价费在站点设置里单独配置。
        </Notice>
        {rows.length || loading ? (
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={false}
            scroll={{ x: 1100 }}
          />
        ) : (
          <EmptyState text="还没有快递公司：新建站点会自动铺一份模板价，删除后可在这里重新添加。" />
        )}
      </Panel>

      <CompanyModal
        siteId={siteId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void load()}
      />
    </div>
  );
}

function CompanyModal({
  siteId,
  editing,
  onClose,
  onDone,
}: {
  siteId: number;
  editing: KuaidiCompany | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<KuaidiCompanySaveBody>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        id: 0,
        siteId,
        code: "",
        name: "",
        logo: "",
        firstWeightKg: 1,
        firstPrice: 8,
        extraWeightKg: 1,
        extraPrice: 3,
        remoteProvinces: [],
        remoteExtra: 0,
        deliveryDays: "",
        remark: "",
        enabled: true,
        sort: 0,
      });
      return;
    }
    form.setFieldsValue({
      id: row.id,
      siteId,
      code: row.code,
      name: row.name,
      logo: row.logo,
      firstWeightKg: row.firstWeightKg,
      firstPrice: row.firstPrice,
      extraWeightKg: row.extraWeightKg,
      extraPrice: row.extraPrice,
      remoteProvinces: row.remoteProvinces,
      remoteExtra: row.remoteExtra,
      deliveryDays: row.deliveryDays,
      remark: row.remark,
      enabled: row.enabled,
      sort: row.sort,
    });
  }, [open, row, siteId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await kuaidiApi.companySave({ body: { ...values, siteId } });
      message.success("快递公司已保存");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={row ? `编辑 ${row.name}` : "新增快递公司"}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请填写快递公司名称" }]}>
            <Input maxLength={60} placeholder="如 顺丰速运" />
          </Form.Item>
          <Form.Item name="code" label="编码" extra="快递公司代码，仅作标记">
            <Input maxLength={20} placeholder="如 SF" />
          </Form.Item>
          <Form.Item name="firstWeightKg" label="首重（kg）">
            <InputNumber min={0.1} max={100} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="firstPrice" label="首重价（元）">
            <InputNumber min={0} max={99999} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="extraWeightKg" label="续重步长（kg）">
            <InputNumber min={0.1} max={100} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="extraPrice" label="续重单价（元）">
            <InputNumber min={0} max={99999} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remoteExtra" label="偏远加收（元）">
            <InputNumber min={0} max={99999} step={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="sort" label="排序" extra="数字越大越靠前">
            <InputNumber min={-9999} max={9999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deliveryDays" label="时效文案">
            <Input maxLength={40} placeholder="如 1-2 天" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Form.Item
          name="remoteProvinces"
          label="偏远省份（收件地命中时加收）"
          extra="逐个输入省份名后回车，如 新疆、西藏、内蒙古"
        >
          <Select
            mode="tags"
            maxTagCount={10}
            placeholder="输入省份名后回车添加"
            options={(row?.remoteProvinces ?? []).map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
