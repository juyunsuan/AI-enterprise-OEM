"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpMerchant, MpMerchantDetail } from "@enterprise/contracts";
import {
  MP_MERCHANT_AUDIT_STATUS_LABELS,
  MP_MERCHANT_STATUS_LABELS,
} from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { NoMarket } from "./common";

const AUDIT_COLOR: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "orange",
  BANNED: "red",
};

type AuditForm = {
  action: "APPROVE" | "REJECT" | "BAN" | "UNBAN";
  note: string;
  commissionRate: number | null;
};

/**
 * 商户入驻审核：申请即一行，通过后系统自动建一个店铺并把负责人账号置为可用。
 * 封禁会同时停用账号与挂起店铺；解封恢复账号并让店铺回到装修中。
 */
export function MerchantTab({ hasMarket }: { hasMarket: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpMerchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [auditStatus, setAuditStatus] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState<MpMerchant | null>(null);
  const [detail, setDetail] = useState<MpMerchantDetail | null>(null);
  const [form] = Form.useForm<AuditForm>();

  const load = useCallback(async () => {
    if (!hasMarket) return;
    setLoading(true);
    try {
      const result = await marketplaceApi.merchants({
        query: { page, pageSize, keyword, auditStatus, status },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商户读取失败");
    } finally {
      setLoading(false);
    }
  }, [hasMarket, page, pageSize, keyword, auditStatus, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAudit = (row: MpMerchant) => {
    setAuditing(row);
    form.setFieldsValue({
      action: row.auditStatus === "BANNED" ? "UNBAN" : "APPROVE",
      note: "",
      commissionRate: row.commissionRate ?? null,
    });
  };

  const submitAudit = async (values: AuditForm) => {
    if (!auditing) return;
    setBusy(true);
    try {
      await marketplaceApi.merchantAudit({
        body: {
          id: auditing.id,
          action: values.action,
          note: values.note ?? "",
          commissionRate: values.commissionRate ?? null,
        },
      });
      message.success("审核结果已保存");
      setAuditing(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (row: MpMerchant, next: "ACTIVE" | "CLOSED") => {
    setBusy(true);
    try {
      await marketplaceApi.merchantStatus({ body: { id: row.id, status: next } });
      message.success(next === "ACTIVE" ? "商户已恢复" : "商户已停业");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (row: MpMerchant) => {
    try {
      setDetail(await marketplaceApi.merchantDetail({ query: { id: row.id } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商户详情读取失败");
    }
  };

  if (!hasMarket) {
    return <NoMarket desc="先创建市场，商户才能凭市场编号提交入驻申请。" />;
  }

  const columns: ColumnsType<MpMerchant> = [
    {
      title: "商户",
      key: "name",
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div className="text-12 muted">{row.licenseNo || "未填营业执照号"}</div>
        </div>
      ),
    },
    {
      title: "联系人",
      key: "contact",
      width: 170,
      render: (_, row) => (
        <div>
          <div>{row.contactName}</div>
          <div className="text-12 muted">{row.contactPhone}</div>
        </div>
      ),
    },
    {
      title: "经营范围",
      dataIndex: "categoryNames",
      render: (names: string[]) =>
        names.length ? names.map((name) => <Tag key={name}>{name}</Tag>) : <span className="muted">—</span>,
    },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 150,
      render: (value: string, row) => (
        <Tooltip title={row.auditNote || undefined}>
          <Tag color={AUDIT_COLOR[value]}>{MP_MERCHANT_AUDIT_STATUS_LABELS[value] ?? value}</Tag>
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "ACTIVE" ? "blue" : "default"}>
          {MP_MERCHANT_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    { title: "店铺", dataIndex: "shopCount", width: 70 },
    {
      title: "抽佣",
      dataIndex: "commissionRate",
      width: 90,
      render: (value: number | null) => (value === null ? "按类目" : `${value}%`),
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => (value ? new Date(value).toLocaleString() : "—"),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_, row) => (
        <Space size={4} wrap>
          <Button size="small" type="link" onClick={() => void openDetail(row)}>
            详情
          </Button>
          {row.auditStatus !== "BANNED" ? (
            <Button size="small" type="link" onClick={() => openAudit(row)}>
              {row.auditStatus === "PENDING" ? "审核" : "调整"}
            </Button>
          ) : (
            <Button size="small" type="link" onClick={() => openAudit(row)}>
              解封
            </Button>
          )}
          {row.auditStatus === "APPROVED" ? (
            row.status === "ACTIVE" ? (
              <Button size="small" type="link" danger disabled={busy} onClick={() => void changeStatus(row, "CLOSED")}>
                停业
              </Button>
            ) : (
              <Button size="small" type="link" disabled={busy} onClick={() => void changeStatus(row, "ACTIVE")}>
                恢复
              </Button>
            )
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Panel title="商户入驻">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="商户名 / 联系人 / 电话"
          style={{ width: 240 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
        <Select
          allowClear
          placeholder="审核状态"
          style={{ width: 140 }}
          value={auditStatus || undefined}
          onChange={(value) => {
            setPage(1);
            setAuditStatus(value ?? "");
          }}
          options={Object.entries(MP_MERCHANT_AUDIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          allowClear
          placeholder="商户状态"
          style={{ width: 140 }}
          value={status || undefined}
          onChange={(value) => {
            setPage(1);
            setStatus(value ?? "");
          }}
          options={Object.entries(MP_MERCHANT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
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

      <Modal
        title={auditing ? `审核：${auditing.name}` : "审核"}
        open={auditing !== null}
        destroyOnHidden
        confirmLoading={busy}
        onCancel={() => setAuditing(null)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submitAudit}>
          <Form.Item name="action" label="处理结果" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "APPROVE", label: "通过入驻" },
                { value: "REJECT", label: "驳回申请" },
                { value: "BAN", label: "封禁商户" },
                { value: "UNBAN", label: "解封商户" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="commissionRate"
            label="专属抽佣比例（%），留空按类目/平台默认"
          >
            <InputNumber min={0} max={100} precision={2} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            name="note"
            label="审核意见"
            extra="驳回与封禁必须填写原因，商户登录时会看到这句话。"
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? detail.merchant.name : "商户详情"}
        open={detail !== null}
        size="large"
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div className="text-12 muted">主体信息</div>
              <div>营业执照：{detail.merchant.licenseNo || "未填"}</div>
              <div>
                联系人：{detail.merchant.contactName}（{detail.merchant.contactPhone}）
              </div>
              <div>
                审核：
                <Tag color={AUDIT_COLOR[detail.merchant.auditStatus]}>
                  {MP_MERCHANT_AUDIT_STATUS_LABELS[detail.merchant.auditStatus]}
                </Tag>
                {detail.merchant.auditNote ? <span className="muted">{detail.merchant.auditNote}</span> : null}
              </div>
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 6 }}>
                店铺（{detail.shops.length}）
              </div>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.shops}
                columns={[
                  { title: "店铺", dataIndex: "name" },
                  { title: "编号", dataIndex: "shopCode" },
                  { title: "状态", dataIndex: "status" },
                  {
                    title: "微信支付",
                    dataIndex: "payEnabled",
                    render: (value: boolean) => (value ? "已开启" : "未开启"),
                  },
                ]}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 6 }}>
                账号（{detail.users.length}）
              </div>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.users}
                columns={[
                  { title: "账号", dataIndex: "username" },
                  { title: "角色", dataIndex: "role" },
                  { title: "手机", dataIndex: "phone" },
                  { title: "状态", dataIndex: "status" },
                  {
                    title: "最近登录",
                    dataIndex: "lastLoginAt",
                    render: (value: string) => (value ? new Date(value).toLocaleString() : "从未"),
                  },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Drawer>
    </Panel>
  );
}
