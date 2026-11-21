"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Input, Modal, Space, Table } from "antd";
import type { ErrandWalletSummary, ErrandWithdrawal } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { cny, StatusTag } from "./common";

/** 骑手钱包：劳务收入流水、提现申请与打款/驳回。 */
export function WalletTab() {
  const { meta } = useErrandScope();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<ErrandWalletSummary | null>(null);
  const [rows, setRows] = useState<ErrandWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ row: ErrandWithdrawal; action: "PAID" | "REJECTED"; method?: "MANUAL" | "WECHAT" } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [wallet, list] = await Promise.all([
        errandApi.wallet(),
        errandApi.withdrawals({ query: { page, pageSize: 20, status: "" } }),
      ]);
      setSummary(wallet ?? null);
      setRows(list?.list ?? []);
      setTotal(list?.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "钱包读取失败");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!target) return;
    try {
      await errandApi.withdrawalAction({
        body: {
          id: target.row.id,
          action: target.action,
          note,
          method: target.method || "MANUAL",
        },
      });
      message.success(target.action === "PAID" ? "已登记打款" : "已驳回并退回余额");
      setTarget(null);
      setNote("");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="钱包概览">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div>
            <div className="muted text-12">骑手数</div>
            <strong>{summary?.riders ?? 0}</strong>
          </div>
          <div>
            <div className="muted text-12">累计劳务收入</div>
            <strong>{cny(summary?.totalIncome)}</strong>
          </div>
          <div>
            <div className="muted text-12">当前可提现余额</div>
            <strong>{cny(summary?.totalBalance)}</strong>
          </div>
          <div>
            <div className="muted text-12">已打款 / 待打款</div>
            <strong>
              {cny(summary?.totalWithdrawPaid)} / {cny(summary?.totalWithdrawPending)}
            </strong>
          </div>
        </div>
      </Panel>

      <Panel title="提现申请">
        {error ? <Notice variant="error">{error}</Notice> : null}
        <Table<ErrandWithdrawal>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
          columns={[
            { title: "骑手", width: 160, render: (_, row) => `${row.riderName}（${row.riderNo}）` },
            { title: "金额", width: 100, render: (_, row) => cny(row.amount) },
            { title: "状态", width: 100, render: (_, row) => <StatusTag meta={meta} kind="withdrawal" value={row.status} /> },
            {
              title: "打款方式",
              width: 130,
              render: (_, row) =>
                row.method === "WECHAT"
                  ? `微信转账${row.transferState === "SUBMITTED" ? "·已提交" : ""}`
                  : row.status === "PAID"
                    ? "手工"
                    : "—",
            },
            { title: "收款信息", dataIndex: "bankInfo" },
            { title: "申请时间", width: 170, render: (_, row) => new Date(row.createdAt).toLocaleString() },
            { title: "处理备注", dataIndex: "handledNote" },
            {
              title: "操作",
              width: 170,
              render: (_, row) =>
                row.status === "PENDING" ? (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        setTarget({ row, action: "PAID", method: "WECHAT" });
                        setNote("");
                      }}
                    >
                      微信打款
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setTarget({ row, action: "PAID", method: "MANUAL" });
                        setNote("");
                      }}
                    >
                      手工已打款
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        setTarget({ row, action: "REJECTED" });
                        setNote("");
                      }}
                    >
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

      <Panel title="最近收入流水" titleExtra={<span className="muted text-12">订单完成自动入账</span>}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={summary?.recent ?? []}
          columns={[
            { title: "骑手", dataIndex: "riderName", width: 120 },
            { title: "类型", dataIndex: "type", width: 120 },
            { title: "金额", width: 100, render: (_, row) => cny(row.amount) },
            { title: "订单", dataIndex: "orderNo", width: 170 },
            { title: "备注", dataIndex: "remark" },
            { title: "时间", width: 170, render: (_, row) => new Date(row.createdAt).toLocaleString() },
          ]}
        />
      </Panel>

      <Modal
        title={
          target?.action === "PAID"
            ? target.method === "WECHAT"
              ? "微信自动打款"
              : "登记手工已打款"
            : "驳回提现"
        }
        open={!!target}
        onCancel={() => setTarget(null)}
        onOk={() => void submit()}
        okText="确认"
        destroyOnHidden
      >
        <div className="muted text-12" style={{ marginBottom: 8 }}>
          平台不经手资金：请在微信/银行完成转账后回来登记；驳回会把冻结金额退回骑手余额。
        </div>
        <Input.TextArea
          rows={3}
          maxLength={300}
          placeholder="处理备注（可选）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
    </div>
  );
}
