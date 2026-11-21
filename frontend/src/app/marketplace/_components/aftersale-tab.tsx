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
import type {
  MpAfterSale,
  MpPayRecord,
  MpRefund,
  MpRefundDetail,
} from "@enterprise/contracts";
import {
  MP_AFTER_SALE_STATUS_LABELS,
  MP_AFTER_SALE_TYPE_LABELS,
  MP_PAY_RECORD_STATUSES,
  MP_REFUND_CHANNEL_LABELS,
  MP_REFUND_EFFECT_LABELS,
  MP_REFUND_STATUS_LABELS,
  mpAfterSaleArbitrateBodySchema,
} from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel, PillTabs } from "@/components/ui/panel";
import { NoMarket } from "./common";

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
 * 售后仲裁与资金台账：
 * 1. 售后单：商户超时不处理或买家不服驳回时，由市场方裁定退款/维持驳回；
 * 2. 退款台账：每笔退款单的渠道、渠道单号与副作用（回补库存/佣金冲销）；
 * 3. 支付流水：父单按子单拆出的入账记录，结算对账以它为准。
 */
export function AfterSaleTab({ hasMarket }: { hasMarket: boolean }) {
  const [view, setView] = useState("aftersale");

  if (!hasMarket) {
    return (
      <NoMarket desc="先创建市场并完成交易，售后单与资金台账才会出现在这里。" />
    );
  }

  return (
    <Panel
      title="售后与资金"
      titleExtra={
        <PillTabs
          items={[
            { key: "aftersale", label: "售后仲裁" },
            { key: "refund", label: "退款台账" },
            { key: "pay", label: "支付流水" },
          ]}
          value={view}
          onChange={setView}
        />
      }
    >
      {view === "aftersale" ? <AfterSaleList /> : null}
      {view === "refund" ? <RefundList /> : null}
      {view === "pay" ? <PayRecordList /> : null}
    </Panel>
  );
}

function AfterSaleList() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpAfterSale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MpAfterSale | null>(null);
  const [arbitrating, setArbitrating] = useState<{
    row: MpAfterSale;
    action: "REFUND" | "REJECT";
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.afterSales({
        query: { page, pageSize, status, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "售后单读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: MpAfterSale) => {
    setDetail(row);
    try {
      const next = await marketplaceApi.afterSaleDetail({ query: { id: row.id } });
      if (next) setDetail(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "售后详情读取失败");
    }
  };

  const submitArbitration = async () => {
    if (!arbitrating) return;
    setBusy(true);
    try {
      const body = mpAfterSaleArbitrateBodySchema.parse({
        id: arbitrating.row.id,
        action: arbitrating.action,
        platformNote: note,
      });
      const next = await marketplaceApi.afterSaleArbitrate({ body });
      message.success(
        arbitrating.action === "REFUND" ? "已裁定退款" : "已维持驳回",
      );
      setArbitrating(null);
      setNote("");
      if (next) setDetail(next);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "仲裁失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<MpAfterSale> = [
    {
      title: "售后单",
      dataIndex: "afterSaleNo",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.afterSaleNo}</span>
          <span className="text-12 muted">
            {row.shopName} · 子单 {row.subOrderNo}
          </span>
        </Space>
      ),
    },
    {
      title: "类型 / 原因",
      dataIndex: "type",
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
      width: 110,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={AFTER_SALE_COLOR[row.status]}>
            {MP_AFTER_SALE_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
          {row.rejectReason ? (
            <span className="text-12 muted">驳回：{row.rejectReason}</span>
          ) : null}
        </Space>
      ),
    },
    { title: "申请时间", dataIndex: "createdAt", width: 180 },
    {
      title: "操作",
      key: "actions",
      width: 200,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {row.status === "PENDING" || row.status === "REJECTED" ? (
            <>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setArbitrating({ row, action: "REFUND" });
                  setNote("");
                }}
              >
                裁定退款
              </Button>
              <Button
                size="small"
                danger
                onClick={() => {
                  setArbitrating({ row, action: "REJECT" });
                  setNote("");
                }}
              >
                维持驳回
              </Button>
            </>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="售后单号"
          style={{ width: 220 }}
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
        scroll={{ x: 980 }}
      />
      <Drawer
        open={!!detail}
        size={520}
        title={detail ? `售后单 ${detail.afterSaleNo}` : "售后详情"}
        onClose={() => setDetail(null)}
      >
        {detail ? <AfterSaleDetailView row={detail} /> : null}
      </Drawer>
      <Modal
        open={!!arbitrating}
        title={arbitrating?.action === "REFUND" ? "裁定退款" : "维持驳回"}
        okText="确认"
        confirmLoading={busy}
        onOk={() => void submitArbitration()}
        onCancel={() => setArbitrating(null)}
        destroyOnHidden
      >
        <div className="text-12 muted" style={{ marginBottom: 8 }}>
          {arbitrating?.action === "REFUND"
            ? "将直接按售后金额原路退款（线下收款则记线下退款），并回补库存、冲销佣金。"
            : "维持驳回后买家不可再次仲裁，但可重新申请售后。"}
        </div>
        <Input.TextArea
          rows={3}
          maxLength={200}
          showCount
          placeholder="仲裁说明（买家与商户都会看到）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
    </>
  );
}

function AfterSaleDetailView({ row }: { row: MpAfterSale }) {
  return (
    <>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">
          <Tag color={AFTER_SALE_COLOR[row.status]}>
            {MP_AFTER_SALE_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="类型">
          {MP_AFTER_SALE_TYPE_LABELS[row.type] ?? row.type}
        </Descriptions.Item>
        <Descriptions.Item label="金额">¥{row.amount.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="原因">{row.reason || "-"}</Descriptions.Item>
        {row.description ? (
          <Descriptions.Item label="说明">{row.description}</Descriptions.Item>
        ) : null}
        {row.returnExpress ? (
          <Descriptions.Item label="退货物流">
            {row.returnExpress} {row.returnExpressNo}
          </Descriptions.Item>
        ) : null}
        {row.merchantRemark ? (
          <Descriptions.Item label="商户备注">{row.merchantRemark}</Descriptions.Item>
        ) : null}
        {row.rejectReason ? (
          <Descriptions.Item label="驳回原因">{row.rejectReason}</Descriptions.Item>
        ) : null}
        {row.platformNote ? (
          <Descriptions.Item label="平台仲裁">{row.platformNote}</Descriptions.Item>
        ) : null}
        {row.refundNo ? (
          <Descriptions.Item label="退款单">
            {row.refundNo} · {row.refundStatus}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      <Table
        style={{ marginTop: 12 }}
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={row.items}
        columns={[
          { title: "商品", dataIndex: "title" },
          { title: "规格", dataIndex: "skuName", width: 120 },
          { title: "单价", dataIndex: "price", width: 90 },
          { title: "数量", dataIndex: "quantity", width: 70 },
          {
            title: "小计",
            dataIndex: "amount",
            width: 90,
            render: (value: number) => `¥${value.toFixed(2)}`,
          },
        ]}
      />
    </>
  );
}

function RefundList() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MpRefundDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.refunds({
        query: { page, pageSize, status, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款台账读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: MpRefund) => {
    try {
      const next = await marketplaceApi.refundDetail({ query: { id: row.id } });
      if (next) setDetail(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款详情读取失败");
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
          <span className="text-12 muted">
            {row.shopName} · 子单 {row.subOrderNo}
          </span>
        </Space>
      ),
    },
    {
      title: "渠道",
      dataIndex: "channel",
      width: 110,
      render: (value: string) => MP_REFUND_CHANNEL_LABELS[value] ?? value,
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 110,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 130,
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
      width: 90,
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
        <Input.Search
          allowClear
          placeholder="退款单号"
          style={{ width: 220 }}
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
        scroll={{ x: 860 }}
      />
      <Drawer
        open={!!detail}
        size={520}
        title={detail ? `退款单 ${detail.refund.refundNo}` : "退款详情"}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="状态">
                <Tag color={REFUND_COLOR[detail.refund.status]}>
                  {MP_REFUND_STATUS_LABELS[detail.refund.status] ??
                    detail.refund.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                ¥{detail.refund.amount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="渠道">
                {MP_REFUND_CHANNEL_LABELS[detail.refund.channel] ??
                  detail.refund.channel}
              </Descriptions.Item>
              <Descriptions.Item label="渠道退款单号">
                {detail.refund.transactionId || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="操作人">
                {detail.refund.operatorType}
              </Descriptions.Item>
              <Descriptions.Item label="失败原因">
                {detail.refund.error || "-"}
              </Descriptions.Item>
            </Descriptions>
            <Table
              style={{ marginTop: 12 }}
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.effects}
              columns={[
                {
                  title: "副作用",
                  dataIndex: "effect",
                  render: (value: string) =>
                    MP_REFUND_EFFECT_LABELS[value] ?? value,
                },
                { title: "状态", dataIndex: "status", width: 100 },
                {
                  title: "说明 / 失败原因",
                  key: "detail",
                  render: (_, effect) => (
                    <span className="text-12 muted">
                      {effect.error ||
                        (effect.status === "DONE" ? "已完成" : "待执行")}
                    </span>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </Drawer>
    </>
  );
}

function PayRecordList() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpPayRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.payRecords({
        query: { page, pageSize, status, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "支付流水读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<MpPayRecord> = [
    {
      title: "子单",
      dataIndex: "subOrderNo",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.subOrderNo}</span>
          <span className="text-12 muted">父单 {row.orderNo}</span>
        </Space>
      ),
    },
    { title: "微信单号", dataIndex: "transactionId", ellipsis: true },
    {
      title: "入账金额",
      dataIndex: "amount",
      width: 110,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "佣金",
      dataIndex: "commissionAmount",
      width: 100,
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag color={value === "REFUNDED" ? "red" : "green"}>{value}</Tag>
      ),
    },
    { title: "支付时间", dataIndex: "paidAt", width: 180 },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="子单号 / 父单号"
          style={{ width: 220 }}
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
            ...MP_PAY_RECORD_STATUSES.map((value) => ({ value, label: value })),
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
    </>
  );
}
