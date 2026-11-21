"use client";

import {
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Card,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  MpFinanceSummary,
  MpMerchantCommission,
  MpSettlement,
  MpWithdrawal,
} from "@enterprise/contracts";
import {
  MP_COMMISSION_SCOPE_LABELS,
  MP_SETTLEMENT_STATUS_LABELS,
  MP_WITHDRAWAL_STATUS_LABELS,
  mpWithdrawalApplyBodySchema,
} from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel, PillTabs } from "@/components/ui/panel";

const SETTLE_COLOR: Record<string, string> = {
  PENDING: "gold",
  CONFIRMED: "cyan",
  PAID: "green",
};

const WITHDRAW_COLOR: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "cyan",
  REJECTED: "red",
  PAID: "green",
};

/**
 * 商户财务：可提现 = 已确认结算净额 - 已申请/已打款提现。
 * 结算单由市场方按周期生成，商户确认后平台打款；提现申请只冻结台账金额，平台不经手资金。
 */
export function FinancePanel({ workspaceReady }: { workspaceReady: boolean }) {
  const { message } = App.useApp();
  const [summary, setSummary] = useState<MpFinanceSummary | null>(null);
  const [commission, setCommission] = useState<MpMerchantCommission | null>(null);
  const [view, setView] = useState("settlement");

  const loadSummary = useCallback(async () => {
    if (!workspaceReady) return;
    try {
      const [finance, rate] = await Promise.all([
        mpMerchantApi.finance(),
        mpMerchantApi.commission(),
      ]);
      setSummary(finance);
      setCommission(rate);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "财务概览读取失败");
    }
  }, [workspaceReady, message]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  if (!workspaceReady) {
    return <Panel title="结算与提现">店铺尚未开通，暂不可查看财务数据。</Panel>;
  }

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {[
          { label: "待确认结算", value: summary?.pendingAmount ?? 0 },
          { label: "已确认待打款", value: summary?.settledAmount ?? 0 },
          { label: "已申请/已打款", value: summary?.withdrawalAmount ?? 0 },
          { label: "可提现余额", value: summary?.availableAmount ?? 0 },
        ].map((item) => (
          <Col key={item.label} xs={12} md={6}>
            <Card size="small">
              <Statistic
                title={item.label}
                prefix="¥"
                value={item.value}
                precision={2}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Panel
        title={`当前抽佣费率 ${commission ? `${commission.rate.toFixed(2)}%` : "-"}`}
        titleExtra={
          <PillTabs
            items={[
              { key: "settlement", label: "结算单" },
              { key: "withdrawal", label: "提现" },
            ]}
            value={view}
            onChange={setView}
          />
        }
      >
        {commission ? (
          <div className="text-12 muted" style={{ marginBottom: 12 }}>
            费率来源：{MP_COMMISSION_SCOPE_LABELS[commission.scopeType] ?? commission.scopeType}
            {commission.scopeName ? ` · ${commission.scopeName}` : ""}
            。下单瞬间快照到子单，调整规则只影响新订单。
          </div>
        ) : null}
        {view === "settlement" ? (
          <SettlementList onChanged={() => void loadSummary()} />
        ) : (
          <WithdrawalList
            available={summary?.availableAmount ?? 0}
            onChanged={() => void loadSummary()}
          />
        )}
      </Panel>
    </>
  );
}

function SettlementList({ onChanged }: { onChanged: () => void }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpSettlement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mpMerchantApi.settlements({ page, pageSize, status });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "结算单读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (row: MpSettlement) => {
    setBusyId(row.id);
    try {
      await mpMerchantApi.settlementConfirm({ id: row.id, remark: "" });
      message.success("已确认，等待平台打款");
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "确认失败");
    } finally {
      setBusyId(0);
    }
  };

  const columns: ColumnsType<MpSettlement> = [
    {
      title: "结算单",
      dataIndex: "settleNo",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.settleNo}</span>
          <span className="text-12 muted">
            {row.periodStart.slice(0, 10)} ~ {row.periodEnd.slice(0, 10)}
          </span>
        </Space>
      ),
    },
    { title: "子单数", dataIndex: "orderCount", width: 80 },
    {
      title: "实付 / 退款",
      key: "gross",
      width: 170,
      render: (_, row) => (
        <span className="text-12">
          ¥{row.grossAmount.toFixed(2)} / -¥{row.refundAmount.toFixed(2)}
        </span>
      ),
    },
    {
      title: "佣金",
      dataIndex: "commissionAmount",
      width: 100,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "净额",
      dataIndex: "netAmount",
      width: 110,
      render: (value: number) => <strong>¥{value.toFixed(2)}</strong>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag color={SETTLE_COLOR[value]}>
          {MP_SETTLEMENT_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, row) =>
        row.status === "PENDING" ? (
          <Button
            size="small"
            type="primary"
            loading={busyId === row.id}
            onClick={() => void confirm(row)}
          >
            确认
          </Button>
        ) : (
          <span className="text-12 muted">{row.paidAt || row.confirmedAt || "-"}</span>
        ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tag>{`共 ${total} 张结算单`}</Tag>
        <SelectStatus value={status} onChange={(value) => {
          setPage(1);
          setStatus(value);
        }} />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        scroll={{ x: 950 }}
      />
    </>
  );
}

function SelectStatus({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      style={{ width: 140, marginLeft: 8 }}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "全部状态" },
        ...Object.entries(MP_SETTLEMENT_STATUS_LABELS).map(([key, label]) => ({
          value: key,
          label,
        })),
      ]}
    />
  );
}

function WithdrawalList({
  available,
  onChanged,
}: {
  available: number;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [busyId, setBusyId] = useState(0);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mpMerchantApi.withdrawals({ page, pageSize, status });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "提现记录读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitApply = async () => {
    try {
      const values = await form.validateFields();
      const body = mpWithdrawalApplyBodySchema.parse(values);
      await mpMerchantApi.withdrawalApply(body);
      message.success("提现申请已提交，等待市场方审核");
      setApplying(false);
      form.resetFields();
      await load();
      onChanged();
    } catch (cause) {
      if (cause instanceof Error) message.error(cause.message);
    }
  };

  const cancel = async (row: MpWithdrawal) => {
    setBusyId(row.id);
    try {
      await mpMerchantApi.withdrawalCancel(row.id);
      message.success("已撤销申请");
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "撤销失败");
    } finally {
      setBusyId(0);
    }
  };

  const columns: ColumnsType<MpWithdrawal> = [
    {
      title: "提现单",
      dataIndex: "withdrawNo",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.withdrawNo}</span>
          <span className="text-12 muted">{row.createdAt}</span>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "applyAmount",
      width: 150,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>¥{row.applyAmount.toFixed(2)}</span>
          <span className="text-12 muted">实付 ¥{row.actualAmount.toFixed(2)}</span>
        </Space>
      ),
    },
    {
      title: "收款账户",
      key: "bank",
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.bankName}</span>
          <span className="text-12 muted">
            {row.accountName} · {row.bankAccount}
          </span>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={WITHDRAW_COLOR[row.status]}>
            {MP_WITHDRAWAL_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
          {row.auditNote ? (
            <span className="text-12 muted">{row.auditNote}</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, row) =>
        row.status === "PENDING" ? (
          <Button
            size="small"
            danger
            loading={busyId === row.id}
            onClick={() => void cancel(row)}
          >
            撤销
          </Button>
        ) : (
          <span className="text-12 muted">-</span>
        ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button type="primary" onClick={() => setApplying(true)}>
          申请提现
        </Button>
        <span className="text-12 muted" style={{ lineHeight: "32px" }}>
          当前可提现 ¥{available.toFixed(2)}
        </span>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        scroll={{ x: 860 }}
      />
      <Modal
        open={applying}
        title="申请提现"
        okText="提交"
        onOk={() => void submitApply()}
        onCancel={() => setApplying(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="applyAmount"
            label={`提现金额（可提 ¥${available.toFixed(2)}）`}
            rules={[{ required: true, message: "请填写提现金额" }]}
          >
            <InputNumber
              min={0.01}
              max={available}
              precision={2}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="bankName"
            label="开户行"
            rules={[{ required: true, message: "请填写开户行" }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            name="accountName"
            label="户名"
            rules={[{ required: true, message: "请填写户名" }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            name="bankAccount"
            label="收款账号"
            rules={[{ required: true, message: "请填写收款账号" }]}
          >
            <Input maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
