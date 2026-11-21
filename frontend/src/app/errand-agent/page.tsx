"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Space, Table, Tag } from "antd";
import { Panel } from "@/components/ui/panel";
import { agentToken, errandAgentApi, type AgentSession } from "@/api/errand-agent";

const money = (value: unknown) => `¥${Number(value || 0).toFixed(2)}`;

export default function ErrandAgentPage() {
  const { message } = App.useApp();
  const [token, setToken] = useState("");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [wallet, setWallet] = useState<{
    balance: number;
    frozen: number;
    totalIncome: number;
    txs: Record<string, unknown>[];
    withdrawals: Record<string, unknown>[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [bankInfo, setBankInfo] = useState("");

  useEffect(() => {
    setToken(agentToken.get());
  }, []);

  const load = useCallback(async (nextToken: string) => {
    if (!nextToken) return;
    setLoading(true);
    setError("");
    try {
      const [me, orderPage, walletView] = await Promise.all([
        errandAgentApi.me(nextToken),
        errandAgentApi.orders(nextToken),
        errandAgentApi.wallet(nextToken),
      ]);
      setSession(me);
      setOrders(orderPage.list || []);
      setWallet(walletView);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "读取失败";
      setError(text);
      if (text.includes("登录")) {
        agentToken.clear();
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  if (!token) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto" }}>
        <Panel title="跑腿代理后台">
          <Form
            layout="vertical"
            onFinish={async (values: { site: string; mobile: string; password: string }) => {
              try {
                const result = await errandAgentApi.login(values);
                agentToken.set(result.token);
                setToken(result.token);
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "登录失败");
              }
            }}
          >
            <Form.Item name="site" label="站点码" rules={[{ required: true, message: "请填写站点码" }]}>
              <Input maxLength={16} placeholder="店主提供的小程序站点码" />
            </Form.Item>
            <Form.Item name="mobile" label="手机号" rules={[{ required: true, message: "请填写手机号" }]}>
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请填写密码" }]}>
              <Input.Password maxLength={64} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录代理后台
            </Button>
          </Form>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title={`代理后台 · ${session?.agent.name || ""}`}
        titleExtra={
          <Space>
            <Tag color="blue">{`分佣 ${((session?.agent.commissionRate || 0) * 100).toFixed(1)}%`}</Tag>
            <Button size="small" onClick={() => void load(token)} loading={loading}>
              刷新
            </Button>
            <Button
              size="small"
              onClick={() => {
                agentToken.clear();
                setToken("");
                setSession(null);
              }}
            >
              退出
            </Button>
          </Space>
        }
      >
        {error ? <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div> : null}
        <Space size={24} wrap>
          <span>负责城市：{session?.cities.map((city) => city.name).join(" / ") || "未分配"}</span>
          <span>今日订单：{session?.ordersToday ?? 0}</span>
          <span>今日流水：{money(session?.gmvToday)}</span>
          <span>今日分佣：{money(session?.commissionToday)}</span>
          <span>余额：{money(wallet?.balance)}</span>
          <span>累计分佣：{money(wallet?.totalIncome)}</span>
        </Space>
      </Panel>

      <Panel title="城市订单">
        <Table
          rowKey={(row) => String(row.id)}
          size="small"
          dataSource={orders}
          pagination={false}
          columns={[
            { title: "单号", dataIndex: "orderNo", width: 170 },
            { title: "城市", dataIndex: "cityName", width: 110 },
            { title: "状态", dataIndex: "status", width: 110 },
            { title: "金额", width: 100, render: (_, row) => money(row.totalAmount) },
            {
              title: "下单时间",
              width: 170,
              render: (_, row) =>
                row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "—",
            },
          ]}
        />
      </Panel>

      <Panel title="佣金与提现">
        <Space wrap style={{ marginBottom: 12 }}>
          <InputNumber
            min={0.01}
            placeholder="提现金额"
            value={amount ?? undefined}
            onChange={(value) => setAmount(Number(value) || 0)}
          />
          <Input
            style={{ width: 280 }}
            placeholder="收款信息（微信/支付宝/银行卡）"
            value={bankInfo}
            onChange={(event) => setBankInfo(event.target.value)}
          />
          <Button
            type="primary"
            onClick={async () => {
              if (!amount || amount <= 0) {
                message.warning("请填写提现金额");
                return;
              }
              try {
                await errandAgentApi.withdraw(token, amount, bankInfo);
                message.success("提现申请已提交");
                setAmount(null);
                setBankInfo("");
                await load(token);
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "提现失败");
              }
            }}
          >
            申请提现
          </Button>
        </Space>
        <Table
          rowKey={(row) => String(row.id)}
          size="small"
          dataSource={wallet?.txs || []}
          pagination={false}
          columns={[
            { title: "类型", dataIndex: "type", width: 130 },
            { title: "金额", width: 100, render: (_, row) => money(row.amount) },
            { title: "订单", dataIndex: "orderNo", width: 170 },
            { title: "备注", dataIndex: "remark" },
            {
              title: "时间",
              width: 170,
              render: (_, row) =>
                row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "—",
            },
          ]}
        />
        <Table
          style={{ marginTop: 12 }}
          rowKey={(row) => String(row.id)}
          size="small"
          dataSource={wallet?.withdrawals || []}
          pagination={false}
          columns={[
            { title: "金额", width: 100, render: (_, row) => money(row.amount) },
            { title: "状态", dataIndex: "status", width: 90 },
            { title: "收款信息", dataIndex: "bankInfo" },
            {
              title: "申请时间",
              width: 170,
              render: (_, row) =>
                row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "—",
            },
          ]}
        />
      </Panel>
    </div>
  );
}