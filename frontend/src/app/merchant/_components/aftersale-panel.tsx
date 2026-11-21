"use client";

import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpAfterSale, MpRefund } from "@enterprise/contracts";
import {
  MP_AFTER_SALE_STATUS_LABELS,
  MP_AFTER_SALE_TYPE_LABELS,
  MP_REFUND_STATUS_LABELS,
  mpAfterSaleAuditBodySchema,
} from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel, PillTabs } from "@/components/ui/panel";

const AFTER_SALE_COLOR: Record<string, string> = {
  PENDING: "gold",
  AGREED: "cyan",
  REJECTED: "red",
  REFUNDED: "green",
  CANCELLED: "default",
};

const REFUND_COLOR: Record<string, string> = {
  PENDING: "gold",
  SUCCESS: "green",
  FAILED: "red",
};

/**
 * 商户售后与退款：
 * 仅退款同意即原路退回并回补库存；退货退款要等买家寄回、商户确认收货后再退款。
 * 渠道退款失败的退款单保留在台账里，可直接重试，副作用不会重复执行。
 */
export function AfterSalePanel({ workspaceReady }: { workspaceReady: boolean }) {
  const [view, setView] = useState("aftersale");
  return (
    <Panel
      title="售后与退款"
      titleExtra={
        <PillTabs
          items={[
            { key: "aftersale", label: "售后单" },
            { key: "refund", label: "退款台账" },
          ]}
          value={view}
          onChange={setView}
        />
      }
    >
      {view === "aftersale" ? (
        <AfterSaleList workspaceReady={workspaceReady} />
      ) : (
        <RefundList workspaceReady={workspaceReady} />
      )}
    </Panel>
  );
}

function AfterSaleList({ workspaceReady }: { workspaceReady: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpAfterSale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MpAfterSale | null>(null);
  const [auditing, setAuditing] = useState<{
    row: MpAfterSale;
    action: "AGREE" | "REJECT";
  } | null>(null);
  const [remark, setRemark] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceReady) return;
    setLoading(true);
    try {
      const result = await mpMerchantApi.afterSales({
        page,
        pageSize,
        status,
        keyword,
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "售后单读取失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceReady, page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: MpAfterSale) => {
    setDetail(row);
    try {
      const next = await mpMerchantApi.afterSaleDetail(row.id);
      if (next) setDetail(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "售后详情读取失败");
    }
  };

  const submitAudit = async () => {
    if (!auditing) return;
    setBusy(true);
    try {
      const body = mpAfterSaleAuditBodySchema.parse({
        id: auditing.row.id,
        action: auditing.action,
        merchantRemark: remark,
        rejectReason: auditing.action === "REJECT" ? reason : "",
      });
      const next = await mpMerchantApi.afterSaleAudit(body);
      message.success(
        auditing.action === "REJECT"
          ? "已驳回，买家可补充材料后重新申请"
          : auditing.row.type === "REFUND_ONLY"
            ? "已同意并退款"
            : "已同意，请等待买家寄回后确认收货",
      );
      setAuditing(null);
      setRemark("");
      setReason("");
      if (next) setDetail(next);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "售后处理失败");
    } finally {
      setBusy(false);
    }
  };

  const receive = async (row: MpAfterSale) => {
    setBusy(true);
    try {
      const next = await mpMerchantApi.afterSaleReceive({
        id: row.id,
        merchantRemark: remark,
      });
      message.success("已确认收货并退款");
      setRemark("");
      if (next) setDetail(next);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "确认收货失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<MpAfterSale> = [
    {
      title: "售后单",
      dataIndex: "afterSaleNo",
      width: 180,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.afterSaleNo}</span>
          <span className="text-12 muted">子单 {row.subOrderNo}</span>
        </Space>
      ),
    },
    {
      title: "类型 / 原因",
      key: "type",
      width: 170,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{MP_AFTER_SALE_TYPE_LABELS[row.type] ?? row.type}</span>
          <span className="text-12 muted">{row.reason || "-"}</span>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 100,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag color={AFTER_SALE_COLOR[value]}>
          {MP_AFTER_SALE_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    { title: "申请时间", dataIndex: "createdAt", width: 180 },
    {
      title: "操作",
      key: "actions",
      width: 170,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {row.status === "PENDING" ? (
            <>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setAuditing({ row, action: "AGREE" });
                  setRemark("");
                }}
              >
                同意
              </Button>
              <Button
                size="small"
                danger
                onClick={() => {
                  setAuditing({ row, action: "REJECT" });
                  setReason("");
                }}
              >
                驳回
              </Button>
            </>
          ) : null}
        </Space>
      ),
    },
  ];

  if (!workspaceReady) {
    return <Panel title="售后与退款">店铺尚未开通或市场未营业，暂不可查看售后。</Panel>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="售后单号"
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
            ...Object.entries(MP_AFTER_SALE_STATUS_LABELS).map(([value, label]) => ({
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
        scroll={{ x: 900 }}
      />
      <Drawer
        open={!!detail}
        size={520}
        title={detail ? `售后单 ${detail.afterSaleNo}` : "售后详情"}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="状态">
                <Tag color={AFTER_SALE_COLOR[detail.status]}>
                  {MP_AFTER_SALE_STATUS_LABELS[detail.status] ?? detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {MP_AFTER_SALE_TYPE_LABELS[detail.type] ?? detail.type}
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                ¥{detail.amount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="原因">{detail.reason || "-"}</Descriptions.Item>
              {detail.description ? (
                <Descriptions.Item label="买家说明">
                  {detail.description}
                </Descriptions.Item>
              ) : null}
              {detail.returnExpressNo ? (
                <Descriptions.Item label="买家寄回">
                  {detail.returnExpress} {detail.returnExpressNo}
                </Descriptions.Item>
              ) : null}
              {detail.rejectReason ? (
                <Descriptions.Item label="驳回原因">
                  {detail.rejectReason}
                </Descriptions.Item>
              ) : null}
              {detail.platformNote ? (
                <Descriptions.Item label="平台仲裁">
                  {detail.platformNote}
                </Descriptions.Item>
              ) : null}
              {detail.refundNo ? (
                <Descriptions.Item label="退款单">
                  {detail.refundNo} · {detail.refundStatus}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            {detail.status === "AGREED" && detail.type === "RETURN_REFUND" ? (
              <Space.Compact style={{ width: "100%", marginTop: 16 }}>
                <Input
                  placeholder="收货备注（可选）"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                />
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!detail.returnExpressNo}
                  onClick={() => void receive(detail)}
                >
                  确认收货并退款
                </Button>
              </Space.Compact>
            ) : null}
            <Table
              style={{ marginTop: 12 }}
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.items}
              columns={[
                { title: "商品", dataIndex: "title" },
                { title: "规格", dataIndex: "skuName", width: 110 },
                { title: "数量", dataIndex: "quantity", width: 60 },
                {
                  title: "金额",
                  dataIndex: "amount",
                  width: 90,
                  render: (value: number) => `¥${value.toFixed(2)}`,
                },
              ]}
            />
          </>
        ) : null}
      </Drawer>
      <Modal
        open={!!auditing}
        title={
          auditing?.action === "REJECT"
            ? "驳回售后"
            : auditing?.row.type === "RETURN_REFUND"
              ? "同意退货退款"
              : "同意退款"
        }
        okText="确认"
        confirmLoading={busy}
        onOk={() => void submitAudit()}
        onCancel={() => setAuditing(null)}
        destroyOnHidden
      >
        {auditing?.action === "REJECT" ? (
          <Input.TextArea
            rows={3}
            maxLength={200}
            placeholder="驳回原因（买家可见，必填）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            style={{ marginBottom: 8 }}
          />
        ) : (
          <div className="text-12 muted" style={{ marginBottom: 8 }}>
            {auditing?.row.type === "RETURN_REFUND"
              ? "同意后请等待买家寄回，收货确认后再执行退款。"
              : "同意后立即按原支付渠道退款，库存自动回补、佣金同步冲销。"}
          </div>
        )}
        <Input.TextArea
          rows={2}
          maxLength={200}
          placeholder="处理备注（可选）"
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
        />
      </Modal>
    </>
  );
}

function RefundList({ workspaceReady }: { workspaceReady: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    if (!workspaceReady) return;
    setLoading(true);
    try {
      const result = await mpMerchantApi.refunds({ page, pageSize, status, keyword });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款台账读取失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceReady, page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (row: MpRefund) => {
    setBusyId(row.id);
    try {
      await mpMerchantApi.refundRetry(row.id);
      message.success("已重新发起退款");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款重试失败");
    } finally {
      setBusyId(0);
    }
  };

  const columns: ColumnsType<MpRefund> = [
    {
      title: "退款单",
      dataIndex: "refundNo",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.refundNo}</span>
          <span className="text-12 muted">子单 {row.subOrderNo}</span>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 100,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={REFUND_COLOR[row.status]}>
            {MP_REFUND_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
          {row.error ? <span className="text-12 muted">{row.error}</span> : null}
        </Space>
      ),
    },
    { title: "退款时间", dataIndex: "refundedAt", width: 180 },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, row) =>
        row.status === "FAILED" ? (
          <Button
            size="small"
            type="primary"
            loading={busyId === row.id}
            onClick={() => void retry(row)}
          >
            重试
          </Button>
        ) : (
          <span className="text-12 muted">-</span>
        ),
    },
  ];

  if (!workspaceReady) {
    return <Panel title="售后与退款">店铺尚未开通或市场未营业，暂不可查看退款。</Panel>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="退款单号"
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
            ...Object.entries(MP_REFUND_STATUS_LABELS).map(([value, label]) => ({
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
        scroll={{ x: 760 }}
      />
    </>
  );
}
