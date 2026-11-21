"use client";
// 财务-提现审核：技师/代理/分销商/合伙人的提现申请按「通过 → 打款」或「驳回（写原因）」处理，金额与税费在申请时已算好。
import type { OnsiteWithdrawalRow } from "@enterprise/contracts";
import { Button, Form, Input, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import { useOnsiteWalletActions, useOnsiteWithdrawals } from "@/query/onsite";
import type { OnsiteWithdrawalFilter } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, cents, statusOptions, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const REASON_MAX = 200;

const OWNER_TEXT: Record<string, string> = {
  STAFF: "技师",
  AGENT: "代理",
  DISTRIBUTOR: "分销商",
  PARTNER: "合伙人",
};
const METHOD_TEXT: Record<string, string> = {
  WECHAT: "微信零钱",
  ALIPAY: "支付宝",
  OFFLINE: "线下转账",
};
const ACTION_TEXT: Record<string, string> = {
  APPROVE: "通过申请",
  PAID: "标记已打款",
  REJECT: "驳回申请",
  CANCEL: "撤销申请",
};

type Action = "APPROVE" | "PAID" | "REJECT" | "CANCEL";

export function WithdrawalPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteWalletActions();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [handling, setHandling] = useState<{ row: OnsiteWithdrawalRow; action: Action } | null>(
    null,
  );
  const [form] = Form.useForm<{ reason: string; transactionId: string }>();
  const filter = useMemo(
    () => ({
      status:
        status === "all" ? undefined : (status as OnsiteWithdrawalFilter["status"]),
    }),
    [status],
  );
  const query = useOnsiteWithdrawals({ shopId }, filter, page, PAGE_SIZE);

  const openHandle = (row: OnsiteWithdrawalRow, action: Action) => {
    form.setFieldsValue({ reason: "", transactionId: "" });
    setHandling({ row, action });
  };

  const submit = async () => {
    if (!handling) return;
    const values = await form.validateFields();
    await actions.handleWithdrawal.mutateAsync({
      params: { id: String(shopId), withdrawalId: String(handling.row.id) },
      body: {
        action: handling.action,
        reason: values.reason || "",
        transactionId: values.transactionId || "",
      },
    });
    setHandling(null);
  };

  const renderActions = (row: OnsiteWithdrawalRow) => {
    if (row.status === "PENDING") {
      return (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openHandle(row, "APPROVE")}>
            通过
          </Button>
          <Button size="small" type="link" danger onClick={() => openHandle(row, "REJECT")}>
            驳回
          </Button>
        </Space>
      );
    }
    if (row.status === "APPROVED") {
      return (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openHandle(row, "PAID")}>
            标记打款
          </Button>
          <Button size="small" type="link" danger onClick={() => openHandle(row, "REJECT")}>
            驳回
          </Button>
        </Space>
      );
    }
    return <span className="muted text-12">已处理</span>;
  };

  const columns: TableProps<OnsiteWithdrawalRow>["columns"] = [
    {
      title: "申请人",
      dataIndex: "ownerName",
      width: 170,
      render: (_, row) => (
        <div>
          <div>{row.ownerName || `#${row.ownerId}`}</div>
          <div className="muted text-12">{OWNER_TEXT[row.ownerType] ?? row.ownerType}</div>
        </div>
      ),
    },
    { title: "申请金额", dataIndex: "amountCents", width: 110, render: (v: number) => cents(v) },
    {
      title: "税费（率）",
      dataIndex: "taxCents",
      width: 120,
      render: (_, row) => (
        <span title={`税率 ${row.taxRate}%`}>
          {cents(row.taxCents)}
          <span className="muted text-12"> / {row.taxRate}%</span>
        </span>
      ),
    },
    {
      title: "实际到账",
      dataIndex: "actualCents",
      width: 110,
      render: (v: number) => <strong>{cents(v)}</strong>,
    },
    {
      title: "方式",
      dataIndex: "method",
      width: 100,
      render: (value: string) => METHOD_TEXT[value] ?? value,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 130,
      render: (value: string) => <StatusTag kind="withdrawal" value={value} />,
    },
    {
      title: "处理记录",
      dataIndex: "transactionId",
      width: 200,
      render: (_, row) => (
        <div>
          {row.rejectReason ? <div className="text-12">驳回：{row.rejectReason}</div> : null}
          {row.transactionId ? (
            <div className="muted text-12">流水号 {row.transactionId}</div>
          ) : null}
          {row.handledAt ? (
            <div className="muted text-12">{timeText(row.handledAt)}</div>
          ) : null}
          {!row.rejectReason && !row.transactionId && !row.handledAt ? (
            <span className="muted">—</span>
          ) : null}
        </div>
      ),
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
    { title: "操作", key: "actions", width: 160, render: (_, row) => renderActions(row) },
  ];

  return (
    <Panel title="提现审核">
      <Notice variant="info">
        金额与税费在申请时已按规则算好并锁定，审核只推进状态：通过后可标记已打款（可填流水号），
        驳回必须写原因且申请人可见。打款本身走你自己的微信/支付宝或线下转账。
      </Notice>
      <FilterBar>
        <Select
          style={{ width: 180 }}
          value={status}
          options={statusOptions("withdrawal", [
            "PENDING",
            "APPROVED",
            "PAID",
            "REJECTED",
            "CANCELLED",
          ])}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </FilterBar>
      {!query.data?.list.length && !query.isFetching ? (
        <EmptyState text="没有待处理的提现申请。技师/代理/分销商在小程序端发起提现后会出现在这里。" />
      ) : (
        <DataTable<OnsiteWithdrawalRow>
          rows={query.data?.list ?? []}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}

      <Modal
        open={handling !== null}
        destroyOnHidden
        title={handling ? `${ACTION_TEXT[handling.action]}：${handling.row.ownerName || `#${handling.row.ownerId}`}` : ""}
        confirmLoading={actions.handleWithdrawal.isPending}
        onCancel={() => setHandling(null)}
        onOk={() => void submit()}
      >
        <div className="muted text-12" style={{ marginBottom: 12 }}>
          申请 {cents(handling?.row.amountCents)}，实际到账 {cents(handling?.row.actualCents)}。
        </div>
        <Form form={form} layout="vertical">
          {handling?.action === "REJECT" ? (
            <Form.Item
              name="reason"
              label="驳回原因"
              rules={[{ required: true, message: "驳回必须写明原因" }]}
              extra="申请人可见，写清楚补什么材料或为什么不能提现"
            >
              <Input maxLength={REASON_MAX} placeholder="如：账户信息与实名不一致，请重新提交" />
            </Form.Item>
          ) : null}
          {handling?.action === "PAID" ? (
            <Form.Item
              name="transactionId"
              label="打款流水号"
              extra="微信/支付宝转账单号可留空（线下转账），便于日后对账"
            >
              <Input maxLength={64} placeholder="如：微信转账单号 1000..." />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </Panel>
  );
}
