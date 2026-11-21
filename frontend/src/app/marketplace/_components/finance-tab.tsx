"use client";

import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type {
  MpCategory,
  MpCommissionRule,
  MpMerchant,
  MpSettlement,
  MpSettlementDetail,
  MpWithdrawal,
} from "@enterprise/contracts";
import {
  MP_COMMISSION_SCOPE_LABELS,
  MP_SETTLEMENT_STATUS_LABELS,
  MP_WITHDRAWAL_STATUS_LABELS,
  mpCommissionRuleSaveBodySchema,
  mpSettlementGenerateBodySchema,
  mpWithdrawalAuditBodySchema,
} from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel, PillTabs } from "@/components/ui/panel";
import { NoMarket } from "./common";

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
 * 抽佣、结算与提现：
 * 抽佣规则按「商户专属 > 类目 > 平台默认」生效，下单时快照到子单；
 * 结算按周期归集已完成子单（实付 - 退款 - 佣金），商户确认后平台打款；
 * 提现只动台账，平台不经手资金。
 */
export function FinanceTab({ hasMarket }: { hasMarket: boolean }) {
  const [view, setView] = useState("commission");

  if (!hasMarket) {
    return (
      <NoMarket desc="先创建市场并完成交易，抽佣与结算数据才会出现在这里。" />
    );
  }

  return (
    <Panel
      title="抽佣与结算"
      titleExtra={
        <PillTabs
          items={[
            { key: "commission", label: "抽佣规则" },
            { key: "settlement", label: "结算单" },
            { key: "withdrawal", label: "提现审核" },
          ]}
          value={view}
          onChange={setView}
        />
      }
    >
      {view === "commission" ? <CommissionSection /> : null}
      {view === "settlement" ? <SettlementSection /> : null}
      {view === "withdrawal" ? <WithdrawalSection /> : null}
    </Panel>
  );
}

function CommissionSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpCommissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MpCommissionRule | null>(null);
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<MpCategory[]>([]);
  const [merchants, setMerchants] = useState<MpMerchant[]>([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await marketplaceApi.commissionRules()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "抽佣规则读取失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = async (row?: MpCommissionRule) => {
    setEditing(row ?? null);
    form.setFieldsValue({
      scopeType: row?.scopeType ?? "PLATFORM",
      scopeId: row?.scopeId ?? 0,
      rate: row?.rate ?? 0,
      remark: row?.remark ?? "",
    });
    setOpen(true);
    if (categories.length === 0 || merchants.length === 0) {
      try {
        const [categoryRows, merchantPage] = await Promise.all([
          marketplaceApi.categories(),
          marketplaceApi.merchants({ query: { page: 1, pageSize: 100 } }),
        ]);
        setCategories(categoryRows ?? []);
        setMerchants(merchantPage?.list ?? []);
      } catch {
        // 选择列表失败不阻断编辑，提交时后端仍会校验 scopeId
      }
    }
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const body = mpCommissionRuleSaveBodySchema.parse({
        id: editing?.id ?? 0,
        scopeType: values.scopeType,
        scopeId: values.scopeType === "PLATFORM" ? 0 : values.scopeId,
        rate: values.rate,
        remark: values.remark,
      });
      await marketplaceApi.commissionRuleSave({ body });
      message.success("已保存，新订单按下单瞬间的费率快照计算");
      setOpen(false);
      await load();
    } catch (cause) {
      if (cause instanceof Error) message.error(cause.message);
    }
  };

  const toggle = async (row: MpCommissionRule) => {
    try {
      await marketplaceApi.commissionRuleStatus({
        body: { id: row.id, status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
      });
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "状态切换失败");
    }
  };

  const columns: ColumnsType<MpCommissionRule> = [
    {
      title: "范围",
      dataIndex: "scopeType",
      width: 120,
      render: (value: string) => MP_COMMISSION_SCOPE_LABELS[value] ?? value,
    },
    {
      title: "对象",
      dataIndex: "scopeName",
      render: (value: string, row) => value || (row.scopeType === "PLATFORM" ? "全市场" : "-"),
    },
    {
      title: "费率",
      dataIndex: "rate",
      width: 100,
      render: (value: number) => `${value.toFixed(2)}%`,
    },
    { title: "备注", dataIndex: "remark" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag color={value === "ACTIVE" ? "green" : "default"}>
          {value === "ACTIVE" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => void openEditor(row)}>
            编辑
          </Button>
          <Button size="small" onClick={() => void toggle(row)}>
            {row.status === "ACTIVE" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => void openEditor()}>
          新增规则
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 760 }}
      />
      <Modal
        open={open}
        title={editing ? "编辑抽佣规则" : "新增抽佣规则"}
        okText="保存"
        onOk={() => void submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="scopeType"
            label="规则范围"
            rules={[{ required: true, message: "请选择范围" }]}
          >
            <Select
              options={Object.entries(MP_COMMISSION_SCOPE_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
              onChange={() => form.setFieldValue("scopeId", 0)}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.scopeType !== next.scopeType}>
            {({ getFieldValue }) => {
              const scopeType = getFieldValue("scopeType");
              if (scopeType === "PLATFORM") return null;
              const options =
                scopeType === "CATEGORY"
                  ? categories
                      .filter((row) => row.parentId > 0)
                      .map((row) => ({ value: row.id, label: row.name }))
                  : merchants.map((row) => ({ value: row.id, label: row.name }));
              return (
                <Form.Item
                  name="scopeId"
                  label={scopeType === "CATEGORY" ? "类目" : "商户"}
                  rules={[{ required: true, message: "请选择对象" }]}
                >
                  <Select options={options} showSearch optionFilterProp="label" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item
            name="rate"
            label="费率（%）"
            rules={[{ required: true, message: "请填写费率" }]}
          >
            <InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SettlementSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpSettlement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [merchantId, setMerchantId] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [merchants, setMerchants] = useState<MpMerchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MpSettlementDetail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [genForm] = Form.useForm();
  const [voucher, setVoucher] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.settlements({
        query: { page, pageSize, status, merchantId, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "结算单读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, merchantId, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await marketplaceApi.merchants({
          query: { page: 1, pageSize: 100, auditStatus: "APPROVED" },
        });
        setMerchants(result?.list ?? []);
      } catch {
        // 过滤下拉失败不影响台账浏览
      }
    })();
  }, []);

  const openGenerate = () => {
    setRange(null);
    genForm.resetFields();
    setGenerating(true);
  };

  const submitGenerate = async () => {
    try {
      const values = await genForm.validateFields();
      if (!range) {
        message.warning("请选择结算周期");
        return;
      }
      const body = mpSettlementGenerateBodySchema.parse({
        merchantId: values.merchantId,
        shopId: 0,
        periodStart: range[0].startOf("day").toISOString(),
        periodEnd: range[1].endOf("day").toISOString(),
      });
      const created = await marketplaceApi.settlementGenerate({ body });
      message.success("结算单已生成");
      setGenerating(false);
      if (created) setDetail(created);
      await load();
    } catch (cause) {
      if (cause instanceof Error) message.error(cause.message);
    }
  };

  const openDetail = async (row: MpSettlement) => {
    try {
      const next = await marketplaceApi.settlementDetail({ query: { id: row.id } });
      if (next) setDetail(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "结算详情读取失败");
    }
  };

  const pay = async (row: MpSettlement) => {
    setBusy(true);
    try {
      await marketplaceApi.settlementPaid({ body: { id: row.id, voucher } });
      message.success("已标记打款");
      setVoucher("");
      setDetail(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "打款标记失败");
    } finally {
      setBusy(false);
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
    { title: "店铺", dataIndex: "shopName", width: 140 },
    { title: "子单数", dataIndex: "orderCount", width: 80 },
    {
      title: "实付 / 退款",
      key: "gross",
      width: 160,
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
      title: "应结净额",
      dataIndex: "netAmount",
      width: 120,
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
      width: 120,
      render: (_, row) => (
        <Button size="small" onClick={() => void openDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button type="primary" onClick={openGenerate}>
          生成结算单
        </Button>
        <Select
          style={{ width: 180 }}
          value={merchantId}
          onChange={(value) => {
            setPage(1);
            setMerchantId(value);
          }}
          showSearch
          optionFilterProp="label"
          options={[
            { value: 0, label: "全部商户" },
            ...merchants.map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(value);
          }}
          options={[
            { value: "", label: "全部状态" },
            ...Object.entries(MP_SETTLEMENT_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <Input.Search
          allowClear
          placeholder="结算单号"
          style={{ width: 200 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
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
        scroll={{ x: 1000 }}
      />
      <Modal
        open={generating}
        title="生成结算单"
        okText="生成"
        onOk={() => void submitGenerate()}
        onCancel={() => setGenerating(false)}
        destroyOnHidden
      >
        <Form form={genForm} layout="vertical" preserve={false}>
          <Form.Item
            name="merchantId"
            label="商户"
            rules={[{ required: true, message: "请选择商户" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={merchants.map((row) => ({ value: row.id, label: row.name }))}
            />
          </Form.Item>
          <Form.Item label="结算周期" required>
            <DatePicker.RangePicker
              style={{ width: "100%" }}
              value={range}
              onChange={(value) => setRange(value as [Dayjs, Dayjs] | null)}
            />
          </Form.Item>
          <div className="text-12 muted">
            只归集周期内已完成且尚未进过结算单的子单；同一子单只会入账一次。
          </div>
        </Form>
      </Modal>
      <Drawer
        open={!!detail}
        size={560}
        title={detail ? `结算单 ${detail.settleNo}` : "结算详情"}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="状态">
                <Tag color={SETTLE_COLOR[detail.status]}>
                  {MP_SETTLEMENT_STATUS_LABELS[detail.status] ?? detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="店铺">{detail.shopName}</Descriptions.Item>
              <Descriptions.Item label="实付">
                ¥{detail.grossAmount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="退款">
                -¥{detail.refundAmount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="佣金">
                ¥{detail.commissionAmount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="净额">
                <strong>¥{detail.netAmount.toFixed(2)}</strong>
              </Descriptions.Item>
            </Descriptions>
            <Table
              style={{ marginTop: 12 }}
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.items}
              columns={[
                { title: "子单", dataIndex: "subOrderNo" },
                {
                  title: "实付",
                  dataIndex: "payAmount",
                  width: 90,
                  render: (value: number) => `¥${value.toFixed(2)}`,
                },
                {
                  title: "退款",
                  dataIndex: "refundAmount",
                  width: 90,
                  render: (value: number) => `-¥${value.toFixed(2)}`,
                },
                {
                  title: "佣金",
                  dataIndex: "commissionAmount",
                  width: 90,
                  render: (value: number) => `¥${value.toFixed(2)}`,
                },
                {
                  title: "净额",
                  dataIndex: "netAmount",
                  width: 90,
                  render: (value: number) => `¥${value.toFixed(2)}`,
                },
              ]}
            />
            {detail.status === "CONFIRMED" ? (
              <Space.Compact style={{ width: "100%", marginTop: 16 }}>
                <Input
                  placeholder="打款凭证链接或流水号"
                  value={voucher}
                  onChange={(event) => setVoucher(event.target.value)}
                />
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!voucher.trim()}
                  onClick={() => void pay(detail)}
                >
                  标记已打款
                </Button>
              </Space.Compact>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </>
  );
}

function WithdrawalSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("PENDING");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState<{
    row: MpWithdrawal;
    action: "APPROVE" | "REJECT";
  } | null>(null);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<MpWithdrawal | null>(null);
  const [voucher, setVoucher] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.withdrawals({
        query: { page, pageSize, status, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "提现申请读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitAudit = async () => {
    if (!auditing) return;
    setBusy(true);
    try {
      const body = mpWithdrawalAuditBodySchema.parse({
        id: auditing.row.id,
        action: auditing.action,
        auditNote: note,
        fee: auditing.action === "APPROVE" ? fee : 0,
      });
      await marketplaceApi.withdrawalAudit({ body });
      message.success(auditing.action === "APPROVE" ? "已通过，待打款" : "已驳回");
      setAuditing(null);
      setNote("");
      setFee(0);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setBusy(false);
    }
  };

  const submitPaid = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      await marketplaceApi.withdrawalPaid({
        body: { id: paying.id, voucher },
      });
      message.success("已标记打款");
      setPaying(null);
      setVoucher("");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "打款标记失败");
    } finally {
      setBusy(false);
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
          <span className="text-12 muted">
            {row.merchantName} · {row.shopName || "全部店铺"}
          </span>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "applyAmount",
      width: 160,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>¥{row.applyAmount.toFixed(2)}</span>
          <span className="text-12 muted">
            手续费 ¥{row.fee.toFixed(2)} · 实付 ¥{row.actualAmount.toFixed(2)}
          </span>
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
      width: 150,
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
      width: 170,
      render: (_, row) =>
        row.status === "PENDING" ? (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                setAuditing({ row, action: "APPROVE" });
                setNote("");
                setFee(0);
              }}
            >
              通过
            </Button>
            <Button
              size="small"
              danger
              onClick={() => {
                setAuditing({ row, action: "REJECT" });
                setNote("");
              }}
            >
              驳回
            </Button>
          </Space>
        ) : row.status === "APPROVED" ? (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setPaying(row);
              setVoucher("");
            }}
          >
            标记打款
          </Button>
        ) : (
          <span className="text-12 muted">{row.paidAt || row.auditedAt || "-"}</span>
        ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="提现单号"
          style={{ width: 200 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(value);
          }}
          options={[
            { value: "", label: "全部状态" },
            ...Object.entries(MP_WITHDRAWAL_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
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
        scroll={{ x: 960 }}
      />
      <Modal
        open={!!auditing}
        title={auditing?.action === "APPROVE" ? "通过提现申请" : "驳回提现申请"}
        okText="确认"
        confirmLoading={busy}
        onOk={() => void submitAudit()}
        onCancel={() => setAuditing(null)}
        destroyOnHidden
      >
        {auditing?.action === "APPROVE" ? (
          <Form layout="vertical">
            <Form.Item label="手续费（元）">
              <InputNumber
                min={0}
                precision={2}
                style={{ width: "100%" }}
                value={fee}
                onChange={(value) => setFee(Number(value ?? 0))}
              />
            </Form.Item>
            <div className="text-12 muted" style={{ marginBottom: 8 }}>
              实际打款 = 申请金额 - 手续费。
            </div>
          </Form>
        ) : null}
        <Input.TextArea
          rows={3}
          maxLength={200}
          placeholder="审核说明（商户可见）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
      <Modal
        open={!!paying}
        title="标记提现已打款"
        okText="确认"
        confirmLoading={busy}
        onOk={() => void submitPaid()}
        onCancel={() => setPaying(null)}
        destroyOnHidden
      >
        <Input
          placeholder="打款凭证链接或银行流水号"
          value={voucher}
          onChange={(event) => setVoucher(event.target.value)}
        />
      </Modal>
    </>
  );
}
