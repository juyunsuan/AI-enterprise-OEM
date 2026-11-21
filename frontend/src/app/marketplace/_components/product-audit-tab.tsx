"use client";

import {
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpProductAudit } from "@enterprise/contracts";
import {
  MP_PRODUCT_AUDIT_STATUS_LABELS,
  mpProductAuditBodySchema,
} from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { NoMarket } from "./common";

const AUDIT_COLOR: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
};

/**
 * 商品送审队列：商户保存商品后必须经运营方审核才能上架。
 * 审核通过自动上架；驳回必须写原因，商户在商品台账里能看到。
 */
export function ProductAuditTab({ hasMarket }: { hasMarket: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpProductAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [auditStatus, setAuditStatus] = useState("PENDING");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<MpProductAudit | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!hasMarket) return;
    setLoading(true);
    try {
      const result = await marketplaceApi.productAudits({
        query: { page, pageSize, auditStatus, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核队列读取失败");
    } finally {
      setLoading(false);
    }
  }, [hasMarket, page, pageSize, auditStatus, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: MpProductAudit, approve: boolean, note: string) => {
    setBusy(true);
    try {
      await marketplaceApi.productAudit({
        body: mpProductAuditBodySchema.parse({ id: row.id, approve, reason: note }),
      });
      message.success(approve ? "已通过并上架" : "已驳回，商户可修改后重新送审");
      setRejecting(null);
      setReason("");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<MpProductAudit> = [
    {
      title: "商品",
      dataIndex: "productTitle",
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.productTitle}</span>
          <span className="text-12 muted">
            {row.shopName} · {row.merchantName}
          </span>
        </Space>
      ),
    },
    {
      title: "提交",
      dataIndex: "createdAt",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.createdAt}</span>
          <span className="text-12 muted">提交人 {row.submitBy || "-"}</span>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "auditStatus",
      width: 160,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={AUDIT_COLOR[row.auditStatus]}>
            {MP_PRODUCT_AUDIT_STATUS_LABELS[row.auditStatus] ?? row.auditStatus}
          </Tag>
          {row.reason ? <span className="text-12 muted">{row.reason}</span> : null}
          {row.auditBy ? (
            <span className="text-12 muted">审核人 {row.auditBy}</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_, row) =>
        row.auditStatus === "PENDING" ? (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              disabled={busy}
              onClick={() => void decide(row, true, "")}
            >
              通过
            </Button>
            <Button
              size="small"
              danger
              disabled={busy}
              onClick={() => {
                setRejecting(row);
                setReason("");
              }}
            >
              驳回
            </Button>
          </Space>
        ) : (
          <span className="text-12 muted">{row.auditAt || "-"}</span>
        ),
    },
  ];

  if (!hasMarket) {
    return <NoMarket desc="先创建市场并招商户入驻，商品送审才会出现在这里。" />;
  }

  return (
    <Panel title="商品送审">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="商品标题"
          style={{ width: 220 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
        <Select
          style={{ width: 140 }}
          value={auditStatus}
          onChange={(value) => {
            setPage(1);
            setAuditStatus(value);
          }}
          options={Object.entries(MP_PRODUCT_AUDIT_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
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
      />
      <div className="text-12 muted" style={{ marginTop: 8 }}>
        通过即上架；驳回必须写原因，商户修改后保存会回到草稿并需要重新送审。
      </div>

      <Modal
        open={!!rejecting}
        title={`驳回「${rejecting?.productTitle ?? ""}」`}
        okText="确认驳回"
        okButtonProps={{ danger: true, loading: busy }}
        destroyOnHidden
        onCancel={() => setRejecting(null)}
        onOk={() => {
          if (!reason.trim()) {
            message.warning("请填写驳回原因，商户需要按原因修改");
            return;
          }
          if (rejecting) void decide(rejecting, false, reason.trim());
        }}
      >
        <Input.TextArea
          value={reason}
          rows={3}
          maxLength={500}
          showCount
          placeholder="如：主图与标题不符 / 缺少必要资质，请补充后重新送审"
          onChange={(event) => setReason(event.target.value)}
        />
      </Modal>
    </Panel>
  );
}
