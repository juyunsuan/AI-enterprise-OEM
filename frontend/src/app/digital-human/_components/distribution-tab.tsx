"use client";

// 分销页签：推广员申请审核、佣金流水、提现审核。
import {
  App,
  Button,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  DH_COMMISSION_TYPE_LABELS,
  DH_JOIN_TYPE_LABELS,
  DH_WITHDRAW_METHOD_LABELS,
  DH_WITHDRAW_STATUS_LABELS,
  type DhCommissionRow,
  type DhPromoterApplyRow,
  type DhWithdrawRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList, yuan } from "./shared";

export function DistributionTab() {
  const [tab, setTab] = useState("applies");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "applies", label: "推广员申请", children: <ApplySection key="applies" /> },
        { key: "commissions", label: "佣金流水", children: <CommissionSection key="commissions" /> },
        { key: "withdraws", label: "提现审核", children: <WithdrawSection key="withdraws" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 推广员申请
// ---------------------------------------------------------------------------

const APPLY_STATUS_LABELS: Record<number, string> = {
  0: "待审核",
  1: "已通过",
  2: "已驳回",
};

type ApplyStatus = "" | "0" | "1" | "2";

function ApplySection() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<ApplyStatus>("0");
  const [audit, setAudit] = useState<{
    row: DhPromoterApplyRow;
    pass: boolean;
    remark: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.promoterApplies({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(status ? { status: Number(status) } : {}),
        },
      }),
    [status],
  );
  const list = usePagedList<DhPromoterApplyRow>(fetcher);

  const submit = async () => {
    if (!audit) return;
    setSaving(true);
    try {
      await digitalHumanApi.auditPromoter({
        body: { id: audit.row.id, pass: audit.pass, remark: audit.remark.trim() },
      });
      message.success(audit.pass ? "已通过" : "已驳回");
      setAudit(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<DhPromoterApplyRow> = [
    {
      title: "申请人",
      width: 180,
      render: (_, row) => (
        <Space size={8}>
          {row.avatar ? (
            <Image src={row.avatar} alt="头像" width={28} height={28} preview={false} style={{ borderRadius: "50%" }} />
          ) : null}
          <Space orientation="vertical" size={0}>
            <span>{row.nickname || "微信用户"}</span>
            <span className="muted text-12">ID {row.memberId}</span>
          </Space>
        </Space>
      ),
    },
    {
      title: "开通方式",
      width: 110,
      render: (_, row) => DH_JOIN_TYPE_LABELS[row.joinType] || row.joinType,
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Tag color={row.status === 1 ? "green" : row.status === 2 ? "red" : "processing"}>
          {APPLY_STATUS_LABELS[row.status] || row.status}
        </Tag>
      ),
    },
    { title: "申请理由", dataIndex: "reason", ellipsis: true },
    {
      title: "申请时间",
      dataIndex: "appliedAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.status === 0 ? (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              onClick={() => setAudit({ row, pass: true, remark: "" })}
            >
              通过
            </Button>
            <Button size="small" danger onClick={() => setAudit({ row, pass: false, remark: "" })}>
              驳回
            </Button>
          </Space>
        ) : (
          <span className="muted text-12">{row.adminRemark || "—"}</span>
        ),
    },
  ];

  return (
    <Panel
      title="推广员申请"
      extra={
        <Select
          value={status}
          style={{ width: 120 }}
          options={[
            { value: "0", label: "待审核" },
            { value: "1", label: "已通过" },
            { value: "2", label: "已驳回" },
            { value: "", label: "全部" },
          ]}
          onChange={(value: ApplyStatus) => {
            setStatus(value);
            list.setPage(1);
          }}
        />
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="没有待处理的推广员申请。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
        />
      )}

      <Modal
        open={Boolean(audit)}
        title={audit?.pass ? "通过申请" : "驳回申请"}
        okText={audit?.pass ? "通过" : "驳回"}
        okButtonProps={audit?.pass ? undefined : { danger: true }}
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setAudit(null)}
      >
        {audit ? (
          <label>
            审核备注
            <Input
              value={audit.remark}
              maxLength={200}
              onChange={(event) => setAudit({ ...audit, remark: event.target.value })}
            />
          </label>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 佣金流水
// ---------------------------------------------------------------------------

type CommissionType = "" | "1" | "2" | "3" | "4";

function CommissionSection() {
  const [type, setType] = useState<CommissionType>("");
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.commissions({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(type ? { type: Number(type) } : {}),
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [type, memberId],
  );
  const list = usePagedList<DhCommissionRow>(fetcher);

  const columns: ColumnsType<DhCommissionRow> = [
    {
      title: "推广员",
      width: 150,
      render: (_, row) => `${row.nickname || "微信用户"}（${row.memberId}）`,
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      render: (value: number) => (
        <Tag>{DH_COMMISSION_TYPE_LABELS[String(value)] || value}</Tag>
      ),
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      width: 110,
      render: (value: number) => (
        <span style={{ color: value < 0 ? "var(--error, #ff4d4f)" : "var(--success, #52c41a)" }}>
          {yuan(value)}
        </span>
      ),
    },
    {
      title: "来源",
      width: 180,
      render: (_, row) => (
        <span className="text-12">
          {row.level ? `${row.level} 级` : ""}
          {row.fromNickname ? ` · ${row.fromNickname}` : ""}
          {row.orderId ? ` · 订单 #${row.orderId}` : ""}
          {row.rate ? ` · ${row.rate}%` : ""}
        </span>
      ),
    },
    { title: "余额", dataIndex: "balanceAfter", width: 100 },
    { title: "备注", dataIndex: "remark", ellipsis: true },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
  ];

  return (
    <Panel
      title="佣金流水"
      extra={
        <Space>
          <Input
            placeholder="推广员 ID"
            value={memberId}
            style={{ width: 120 }}
            onChange={(event) => setMemberId(event.target.value)}
            onPressEnter={() => list.setPage(1)}
          />
          <Select
            value={type}
            style={{ width: 130 }}
            options={[
              { value: "", label: "全部类型" },
              { value: "1", label: "推广收入" },
              { value: "2", label: "提现支出" },
              { value: "3", label: "退款扣回" },
              { value: "4", label: "提现退回" },
            ]}
            onChange={(value: CommissionType) => {
              setType(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={list.loading}
        columns={columns}
        dataSource={list.rows}
        pagination={{
          current: list.page,
          pageSize: PAGE_SIZE,
          total: list.total,
          showSizeChanger: false,
          onChange: list.setPage,
        }}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 提现审核
// ---------------------------------------------------------------------------

type WithdrawStatus = "" | "0" | "1" | "2";

function WithdrawSection() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<WithdrawStatus>("0");
  const [audit, setAudit] = useState<{
    row: DhWithdrawRow;
    pass: boolean;
    remark: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.withdraws({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(status ? { status: Number(status) } : {}),
        },
      }),
    [status],
  );
  const list = usePagedList<DhWithdrawRow>(fetcher);

  const submit = async () => {
    if (!audit) return;
    setSaving(true);
    try {
      await digitalHumanApi.auditWithdraw({
        body: { id: audit.row.id, pass: audit.pass, remark: audit.remark.trim() },
      });
      message.success(audit.pass ? "已标记打款" : "已驳回并退回余额");
      setAudit(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<DhWithdrawRow> = [
    {
      title: "推广员",
      width: 150,
      render: (_, row) => `${row.nickname || "微信用户"}（${row.memberId}）`,
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      width: 110,
      render: (value: number) => yuan(value),
    },
    {
      title: "收款",
      width: 240,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span className="text-12">
            {DH_WITHDRAW_METHOD_LABELS[row.method] || row.method}
            {row.bankName ? ` · ${row.bankName}` : ""}
          </span>
          <span className="text-12 muted">
            {row.accountName} {row.accountNo}
          </span>
          {row.qrUrl ? (
            <Image src={row.qrUrl} alt="收款码" width={48} height={48} />
          ) : null}
        </Space>
      ),
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Tag color={row.status === 1 ? "green" : row.status === 2 ? "red" : "processing"}>
          {DH_WITHDRAW_STATUS_LABELS[String(row.status)] || row.status}
        </Tag>
      ),
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.status === 0 ? (
          <Space size={4}>
            <Button size="small" type="primary" onClick={() => setAudit({ row, pass: true, remark: "" })}>
              已打款
            </Button>
            <Button size="small" danger onClick={() => setAudit({ row, pass: false, remark: "" })}>
              驳回
            </Button>
          </Space>
        ) : (
          <span className="muted text-12">{row.adminRemark || "—"}</span>
        ),
    },
  ];

  return (
    <Panel
      title="提现审核"
      extra={
        <Select
          value={status}
          style={{ width: 120 }}
          options={[
            { value: "0", label: "待处理" },
            { value: "1", label: "已打款" },
            { value: "2", label: "已驳回" },
            { value: "", label: "全部" },
          ]}
          onChange={(value: WithdrawStatus) => {
            setStatus(value);
            list.setPage(1);
          }}
        />
      }
    >
      <Notice variant="info">
        申请时余额已冻结；审核「已打款」后请线下完成转账，驳回会把金额退回推广员余额。
      </Notice>
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="没有待处理的提现申请。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
          style={{ marginTop: 12 }}
        />
      )}

      <Modal
        open={Boolean(audit)}
        title={audit?.pass ? "确认已打款" : "驳回提现"}
        okText={audit?.pass ? "已打款" : "驳回"}
        okButtonProps={audit?.pass ? undefined : { danger: true }}
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setAudit(null)}
      >
        {audit ? (
          <label>
            审核备注
            <Input
              value={audit.remark}
              maxLength={200}
              onChange={(event) => setAudit({ ...audit, remark: event.target.value })}
            />
          </label>
        ) : null}
      </Modal>
    </Panel>
  );
}
