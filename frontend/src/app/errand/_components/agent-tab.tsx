"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
} from "antd";
import type {
  ErrandAgent,
  ErrandAgentWithdrawal,
  ErrandCity,
} from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { cny } from "./common";

type AgentDraft = {
  name: string;
  mobile: string;
  password: string;
  status: "ACTIVE" | "DISABLED";
  commissionRate: number;
  cityIds: number[];
};

const EMPTY: AgentDraft = {
  name: "",
  mobile: "",
  password: "",
  status: "ACTIVE",
  commissionRate: 0.1,
  cityIds: [],
};

/** 城市代理：下游独立账号，由平台账号创建；按城市分佣、独立提现。 */
export function AgentTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandAgent[]>([]);
  const [withdrawals, setWithdrawals] = useState<ErrandAgentWithdrawal[]>([]);
  const [cities, setCities] = useState<ErrandCity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ErrandAgent | null>(null);
  const [form] = Form.useForm<AgentDraft>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, withdraw, cityList] = await Promise.all([
        errandApi.agents(),
        errandApi.agentWithdrawals({ query: { page: 1, pageSize: 20, status: "" } }),
        errandApi.cities(),
      ]);
      setRows(list ?? []);
      setWithdrawals(withdraw?.list ?? []);
      setCities(cityList ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "代理读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (row?: ErrandAgent) => {
    setEditing(row ?? null);
    setOpen(true);
    form.setFieldsValue(
      row
        ? {
            name: row.name,
            mobile: row.mobile,
            password: "",
            status: row.status,
            commissionRate: row.commissionRate,
            cityIds: row.cityIds,
          }
        : EMPTY,
    );
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await errandApi.agentSave({
        body: {
          id: editing?.id ?? 0,
          name: values.name,
          mobile: values.mobile,
          password: values.password || "",
          status: values.status,
          commissionRate: Number(values.commissionRate) || 0,
          cityIds: values.cityIds || [],
        },
      });
      message.success("代理已保存");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  const act = async (row: ErrandAgentWithdrawal, action: "PAID" | "REJECTED") => {
    try {
      await errandApi.agentWithdrawalAction({ body: { id: row.id, action, note: "" } });
      message.success(action === "PAID" ? "已登记打款" : "已驳回并退回余额");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="城市代理"
        titleExtra={<span className="text-12 muted">代理是下游独立账号（手机号+密码），不属于平台账号体系</span>}
        extra={
          <Button type="primary" onClick={() => openForm()}>
            新增代理
          </Button>
        }
      >
        {error ? <Notice variant="error">{error}</Notice> : null}
        <Table<ErrandAgent>
          rowKey="id"
          size="small"
          loading={loading}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "手机号", dataIndex: "mobile", width: 130 },
            {
              title: "负责城市",
              render: (_, row) =>
                row.cityIds.length
                  ? row.cityIds
                      .map((id) => cities.find((city) => city.id === id)?.name || `#${id}`)
                      .join(" / ")
                  : "未分配",
            },
            { title: "分佣", width: 90, render: (_, row) => `${(row.commissionRate * 100).toFixed(1)}%` },
            { title: "余额", width: 100, render: (_, row) => cny(row.balance) },
            { title: "累计分佣", width: 110, render: (_, row) => cny(row.totalIncome) },
            { title: "状态", width: 80, render: (_, row) => (row.status === "ACTIVE" ? "启用" : "停用") },
            {
              title: "操作",
              width: 210,
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => openForm(row)}>
                    编辑
                  </Button>
                  <Button
                    size="small"
                    onClick={async () => {
                      try {
                        await errandApi.agentStatus({
                          body: {
                            id: row.id,
                            status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                          },
                        });
                        await load();
                      } catch (cause) {
                        message.error(cause instanceof Error ? cause.message : "操作失败");
                      }
                    }}
                  >
                    {row.status === "ACTIVE" ? "停用" : "启用"}
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={async () => {
                      try {
                        await errandApi.agentRemove({ body: { id: row.id } });
                        await load();
                      } catch (cause) {
                        message.error(cause instanceof Error ? cause.message : "删除失败");
                      }
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="代理提现">
        <Table<ErrandAgentWithdrawal>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={withdrawals}
          columns={[
            { title: "代理", dataIndex: "agentName", width: 130 },
            { title: "金额", width: 100, render: (_, row) => cny(row.amount) },
            { title: "状态", width: 90, dataIndex: "status" },
            { title: "收款信息", dataIndex: "bankInfo" },
            { title: "申请时间", width: 170, render: (_, row) => new Date(row.createdAt).toLocaleString() },
            {
              title: "操作",
              width: 170,
              render: (_, row) =>
                row.status === "PENDING" ? (
                  <Space>
                    <Button size="small" type="primary" onClick={() => void act(row, "PAID")}>
                      已打款
                    </Button>
                    <Button size="small" danger onClick={() => void act(row, "REJECTED")}>
                      驳回
                    </Button>
                  </Space>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>

      <Modal
        title={editing ? "编辑代理" : "新增代理"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        okText="保存"
        width={620}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Space wrap align="start">
            <Form.Item name="name" label="代理名称" rules={[{ required: true, message: "请填写名称" }]}>
              <Input style={{ width: 200 }} maxLength={60} />
            </Form.Item>
            <Form.Item name="mobile" label="登录手机号" rules={[{ required: true, message: "请填写手机号" }]}>
              <Input style={{ width: 180 }} maxLength={20} />
            </Form.Item>
            <Form.Item
              name="password"
              label={editing ? "重置密码（留空不变）" : "登录密码"}
              rules={editing ? [] : [{ required: true, message: "请设置密码" }]}
            >
              <Input.Password style={{ width: 200 }} maxLength={64} />
            </Form.Item>
            <Form.Item name="commissionRate" label="分佣比例（0.1=10%）">
              <InputNumber style={{ width: 150 }} min={0} max={1} step={0.01} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                style={{ width: 110 }}
                options={[
                  { value: "ACTIVE", label: "启用" },
                  { value: "DISABLED", label: "停用" },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item name="cityIds" label="负责城市">
            <Select
              mode="multiple"
              options={cities.map((city) => ({ value: city.id, label: city.name }))}
              placeholder="不选则暂不分佣"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}