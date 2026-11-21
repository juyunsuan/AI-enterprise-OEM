"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ParkBill, ParkLease, ParkTenant } from "@enterprise/contracts";
import { parkApi } from "@/api/park";

type LeaseForm = {
  tenantId: number;
  title: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  deposit: number;
  billingCycle: "MONTH" | "QUARTER" | "YEAR";
  status: "DRAFT" | "ACTIVE" | "ENDED";
  note?: string;
};
type BillForm = {
  leaseId: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount?: number;
};

const leaseColor = (status: ParkLease["status"]) =>
  status === "ACTIVE" ? "green" : status === "ENDED" ? "default" : "orange";
const billColor = (status: ParkBill["status"]) =>
  status === "PAID" ? "green" : status === "OPEN" ? "orange" : status === "OVERDUE" ? "red" : "default";

export function LeasesPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [leases, setLeases] = useState<ParkLease[]>([]);
  const [bills, setBills] = useState<ParkBill[]>([]);
  const [tenants, setTenants] = useState<ParkTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaseOpen, setLeaseOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaseForm] = Form.useForm<LeaseForm>();
  const [billForm] = Form.useForm<BillForm>();

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [leaseRows, billPage, tenantRows] = await Promise.all([
        parkApi.leases({ query: { siteId, status: "", keyword: "" } }),
        parkApi.bills({
          query: {
            siteId,
            leaseId: 0,
            status: "",
            keyword: "",
            page: 1,
            pageSize: 100,
          },
        }),
        parkApi.tenants({ query: { siteId, status: "", keyword: "" } }),
      ]);
      setLeases(leaseRows ?? []);
      setBills(billPage?.list ?? []);
      setTenants(tenantRows ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "租约读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLease = async () => {
    const values = await leaseForm.validateFields();
    setBusy(true);
    try {
      await parkApi.leaseSave({
        body: {
          id: 0,
          siteId,
          tenantId: values.tenantId,
          title: values.title,
          startDate: values.startDate,
          endDate: values.endDate,
          rentAmount: values.rentAmount || 0,
          deposit: values.deposit || 0,
          billingCycle: values.billingCycle,
          status: values.status,
          note: values.note || "",
        },
      });
      message.success("租约已保存");
      setLeaseOpen(false);
      leaseForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const setLeaseStatus = async (row: ParkLease) => {
    try {
      await parkApi.leaseStatus({
        body: {
          id: row.id,
          status: row.status === "ACTIVE" ? "ENDED" : "ACTIVE",
        },
      });
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const removeLease = async (row: ParkLease) => {
    try {
      await parkApi.leaseRemove({ body: { id: row.id } });
      message.success("已删除");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const generateBill = async () => {
    const values = await billForm.validateFields();
    setBusy(true);
    try {
      await parkApi.billGenerate({
        body: {
          leaseId: values.leaseId,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
          dueDate: values.dueDate,
          ...(values.amount ? { amount: values.amount } : {}),
          note: "",
        },
      });
      message.success("账单已生成");
      setBillOpen(false);
      billForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "出账失败");
    } finally {
      setBusy(false);
    }
  };

  const actBill = async (row: ParkBill, action: "paid" | "cancel") => {
    try {
      await parkApi.billAction({ body: { id: row.id, action, note: "" } });
      message.success("已处理");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Space>
          <Button type="primary" onClick={() => setLeaseOpen(true)}>
            新增租约
          </Button>
          <Button onClick={() => setBillOpen(true)} disabled={!leases.length}>
            生成账单
          </Button>
        </Space>
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={leases}
        columns={[
          { title: "租约", dataIndex: "title" },
          { title: "租户", dataIndex: "tenantName" },
          { title: "起止", render: (_, row) => `${row.startDate} ~ ${row.endDate}` },
          { title: "月租", render: (_, row) => `¥${row.rentAmount.toFixed(2)}` },
          { title: "账单数", dataIndex: "billCount" },
          {
            title: "状态",
            render: (_, row) => <Tag color={leaseColor(row.status)}>{row.statusLabel}</Tag>,
          },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => void setLeaseStatus(row)}>
                  {row.status === "ACTIVE" ? "结束" : "生效"}
                </Button>
                <Button danger size="small" onClick={() => void removeLease(row)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Table
        style={{ marginTop: 16 }}
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={bills}
        columns={[
          { title: "账单号", dataIndex: "billNo" },
          { title: "租户", dataIndex: "tenantName" },
          { title: "周期", render: (_, row) => `${row.periodStart} ~ ${row.periodEnd}` },
          { title: "到期", dataIndex: "dueDate" },
          { title: "金额", render: (_, row) => `¥${row.amount.toFixed(2)}` },
          {
            title: "状态",
            render: (_, row) => <Tag color={billColor(row.status)}>{row.statusLabel}</Tag>,
          },
          {
            title: "ERP 应收",
            render: (_, row) => (row.erpReceivableId ? `#${row.erpReceivableId}` : "未同步"),
          },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                {row.status === "OPEN" || row.status === "OVERDUE" ? (
                  <Button size="small" type="primary" onClick={() => void actBill(row, "paid")}>
                    收款
                  </Button>
                ) : null}
                {row.status !== "PAID" && row.status !== "CANCELED" ? (
                  <Button size="small" onClick={() => void actBill(row, "cancel")}>
                    取消
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新增租约"
        open={leaseOpen}
        onCancel={() => setLeaseOpen(false)}
        onOk={() => void saveLease()}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={leaseForm}
          initialValues={{ billingCycle: "MONTH", status: "DRAFT", rentAmount: 0, deposit: 0 }}
        >
          <Form.Item label="租户" name="tenantId" rules={[{ required: true }]}>
            <Select options={tenants.map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
          <Form.Item label="租约名称" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space>
            <Form.Item label="开始日期" name="startDate" rules={[{ required: true }]}>
              <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="结束日期" name="endDate" rules={[{ required: true }]}>
              <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item label="月租" name="rentAmount">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item label="押金" name="deposit">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item label="出账周期" name="billingCycle">
              <Select
                options={[
                  { value: "MONTH", label: "按月" },
                  { value: "QUARTER", label: "按季" },
                  { value: "YEAR", label: "按年" },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { value: "DRAFT", label: "草稿" },
                { value: "ACTIVE", label: "生效中" },
                { value: "ENDED", label: "已结束" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="生成账单"
        open={billOpen}
        onCancel={() => setBillOpen(false)}
        onOk={() => void generateBill()}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form layout="vertical" form={billForm}>
          <Form.Item label="租约" name="leaseId" rules={[{ required: true }]}>
            <Select
              options={leases
                .filter((row) => row.status === "ACTIVE")
                .map((row) => ({ value: row.id, label: `${row.title}（${row.tenantName}）` }))}
            />
          </Form.Item>
          <Space>
            <Form.Item label="周期开始" name="periodStart" rules={[{ required: true }]}>
              <Input placeholder="2026-11-01" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="周期结束" name="periodEnd" rules={[{ required: true }]}>
              <Input placeholder="2026-11-30" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="到期日" name="dueDate" rules={[{ required: true }]}>
              <Input placeholder="2026-12-05" style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item label="金额（留空取租约月租）" name="amount">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
