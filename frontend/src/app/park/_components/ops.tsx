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
import type {
  ParkAsset,
  ParkInvoice,
  ParkMeter,
  ParkParkingPermit,
  ParkPatrolPlan,
  ParkPatrolRecord,
} from "@enterprise/contracts";
import {
  PARK_ASSET_STATUSES,
  PARK_METER_TYPES,
  PARK_METER_TYPE_LABELS,
  PARK_PATROL_STATUS_LABELS,
} from "@enterprise/contracts";
import { parkApi } from "@/api/park";
import { PillTabs } from "@/components/ui/panel";

type Tab = "invoice" | "patrol" | "parking" | "asset" | "meter";

export function ParkOpsPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [tab, setTab] = useState<Tab>("invoice");
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<ParkInvoice[]>([]);
  const [plans, setPlans] = useState<ParkPatrolPlan[]>([]);
  const [records, setRecords] = useState<ParkPatrolRecord[]>([]);
  const [parking, setParking] = useState<ParkParkingPermit[]>([]);
  const [assets, setAssets] = useState<ParkAsset[]>([]);
  const [meters, setMeters] = useState<ParkMeter[]>([]);
  const [busy, setBusy] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [invoiceForm] = Form.useForm();
  const [planForm] = Form.useForm();
  const [assetForm] = Form.useForm();
  const [meterForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      if (tab === "invoice") {
        setInvoices(
          (await parkApi.invoices({ query: { siteId, status: "", keyword: "" } })) ?? [],
        );
      } else if (tab === "patrol") {
        const [nextPlans, nextRecords] = await Promise.all([
          parkApi.patrolPlans({ query: { siteId } }),
          parkApi.patrolRecords({
            query: { siteId, planId: 0, page: 1, pageSize: 100 },
          }),
        ]);
        setPlans(nextPlans ?? []);
        setRecords(nextRecords?.list ?? []);
      } else if (tab === "parking") {
        setParking(
          (await parkApi.parkingPermits({
            query: { siteId, status: "", keyword: "" },
          })) ?? [],
        );
      } else if (tab === "asset") {
        setAssets((await parkApi.assets({ query: { siteId } })) ?? []);
      } else {
        setMeters((await parkApi.meters({ query: { siteId } })) ?? []);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, siteId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const issueInvoice = async () => {
    const values = await invoiceForm.validateFields();
    setBusy(true);
    try {
      await parkApi.invoiceIssue({
        body: {
          id: 0,
          siteId,
          bizType: values.bizType,
          bizId: 0,
          customerId: 0,
          tenantId: 0,
          title: values.title,
          taxNo: values.taxNo || "",
          amount: values.amount || 0,
          status: "ISSUED",
          note: values.note || "",
        },
      });
      message.success("发票已开具");
      setInvoiceOpen(false);
      invoiceForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "开票失败");
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    const values = await planForm.validateFields();
    const points = String(values.points || "")
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((line: string) => {
        const [name, code] = line.split(",");
        return { name: name.trim(), code: (code || "").trim() };
      });
    setBusy(true);
    try {
      await parkApi.patrolPlanSave({
        body: {
          id: 0,
          siteId,
          name: values.name,
          points,
          staffIds: [],
          status: values.status,
          note: values.note || "",
        },
      });
      message.success("巡检计划已保存");
      setPlanOpen(false);
      planForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveAsset = async () => {
    const values = await assetForm.validateFields();
    setBusy(true);
    try {
      await parkApi.assetSave({
        body: {
          id: 0,
          siteId,
          name: values.name,
          category: values.category || "EQUIPMENT",
          location: values.location || "",
          status: values.status,
          assigneeStaffId: 0,
          assigneeName: "",
          purchaseDate: "",
          value: values.value || 0,
          note: values.note || "",
        },
      });
      message.success("资产已保存");
      setAssetOpen(false);
      assetForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveMeter = async () => {
    const values = await meterForm.validateFields();
    setBusy(true);
    try {
      await parkApi.meterSave({
        body: {
          id: 0,
          siteId,
          meterType: values.meterType,
          meterNo: values.meterNo || "",
          unitId: 0,
          period: values.period,
          reading: values.reading || 0,
          amount: values.amount || 0,
          note: values.note || "",
        },
      });
      message.success("抄表记录已保存");
      setMeterOpen(false);
      meterForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const actParking = async (row: ParkParkingPermit, action: "approve" | "reject") => {
    try {
      await parkApi.parkingPermitAction({ body: { id: row.id, action, note: "" } });
      message.success("已处理");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  return (
    <>
      <PillTabs
        variant="soft"
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { key: "invoice", label: "发票" },
          { key: "patrol", label: "巡检" },
          { key: "parking", label: "停车" },
          { key: "asset", label: "资产" },
          { key: "meter", label: "能耗" },
        ]}
        style={{ marginBottom: 12 }}
      />
      {tab === "invoice" ? (
        <>
          <Button type="primary" onClick={() => setInvoiceOpen(true)} style={{ marginBottom: 12 }}>
            开具发票
          </Button>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={invoices}
            columns={[
              { title: "抬头", dataIndex: "title" },
              { title: "税号", dataIndex: "taxNo" },
              { title: "类型", dataIndex: "bizLabel" },
              { title: "金额", render: (_, row) => `¥${row.amount.toFixed(2)}` },
              { title: "状态", dataIndex: "statusLabel" },
              { title: "开具时间", dataIndex: "issuedAt" },
            ]}
          />
        </>
      ) : null}

      {tab === "patrol" ? (
        <>
          <Button type="primary" onClick={() => setPlanOpen(true)} style={{ marginBottom: 12 }}>
            新增巡检计划
          </Button>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={plans}
            columns={[
              { title: "计划", dataIndex: "name" },
              { title: "点位数", render: (_, row) => row.points.length },
              { title: "记录数", dataIndex: "recordCount" },
              { title: "状态", dataIndex: "statusLabel" },
            ]}
          />
          <Table
            style={{ marginTop: 16 }}
            size="small"
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 8 }}
            dataSource={records}
            columns={[
              { title: "巡检人", dataIndex: "staffName" },
              { title: "点位", dataIndex: "pointName" },
              { title: "结果", dataIndex: "result" },
              { title: "说明", dataIndex: "note" },
              { title: "时间", dataIndex: "createdAt" },
            ]}
          />
        </>
      ) : null}

      {tab === "parking" ? (
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          pagination={false}
          dataSource={parking}
          columns={[
            { title: "车牌", dataIndex: "plateNo" },
            { title: "车型", dataIndex: "vehicleTypeLabel" },
            { title: "有效期", render: (_, row) => `${row.validFrom || "-"} ~ ${row.validTo || "-"}` },
            { title: "状态", render: (_, row) => <Tag>{row.statusLabel}</Tag> },
            {
              title: "操作",
              render: (_, row) =>
                row.status === "PENDING" ? (
                  <Space>
                    <Button size="small" type="primary" onClick={() => void actParking(row, "approve")}>
                      通过
                    </Button>
                    <Button size="small" danger onClick={() => void actParking(row, "reject")}>
                      驳回
                    </Button>
                  </Space>
                ) : null,
            },
          ]}
        />
      ) : null}

      {tab === "asset" ? (
        <>
          <Button type="primary" onClick={() => setAssetOpen(true)} style={{ marginBottom: 12 }}>
            新增资产
          </Button>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={assets}
            columns={[
              { title: "名称", dataIndex: "name" },
              { title: "分类", dataIndex: "category" },
              { title: "位置", dataIndex: "location" },
              { title: "状态", dataIndex: "statusLabel" },
              { title: "价值", render: (_, row) => `¥${row.value.toFixed(2)}` },
            ]}
          />
        </>
      ) : null}

      {tab === "meter" ? (
        <>
          <Button type="primary" onClick={() => setMeterOpen(true)} style={{ marginBottom: 12 }}>
            新增抄表
          </Button>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={meters}
            columns={[
              { title: "类型", dataIndex: "meterTypeLabel" },
              { title: "表号", dataIndex: "meterNo" },
              { title: "周期", dataIndex: "period" },
              { title: "读数", dataIndex: "reading" },
              { title: "金额", render: (_, row) => `¥${row.amount.toFixed(2)}` },
            ]}
          />
        </>
      ) : null}

      <Modal title="开具发票" open={invoiceOpen} onCancel={() => setInvoiceOpen(false)} onOk={() => void issueInvoice()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={invoiceForm} initialValues={{ bizType: "ORDER", amount: 0 }}>
          <Form.Item label="发票抬头" name="title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="税号" name="taxNo"><Input /></Form.Item>
          <Form.Item label="类型" name="bizType">
            <Select options={[{ value: "ORDER", label: "订单" }, { value: "BILL", label: "账单" }]} />
          </Form.Item>
          <Form.Item label="金额" name="amount"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="备注" name="note"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增巡检计划" open={planOpen} onCancel={() => setPlanOpen(false)} onOk={() => void savePlan()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={planForm} initialValues={{ status: "ACTIVE" }}>
          <Form.Item label="计划名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="点位（每行：名称,编码）" name="points" rules={[{ required: true }]}>
            <Input.TextArea rows={6} placeholder={"东门,EAST\n配电房,POWER"} />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={Object.entries(PARK_PATROL_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item label="备注" name="note"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增资产" open={assetOpen} onCancel={() => setAssetOpen(false)} onOk={() => void saveAsset()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={assetForm} initialValues={{ status: "IN_USE", category: "EQUIPMENT", value: 0 }}>
          <Form.Item label="资产名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="分类" name="category"><Input /></Form.Item>
          <Form.Item label="位置" name="location"><Input /></Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={PARK_ASSET_STATUSES.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item label="价值" name="value"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="备注" name="note"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增抄表" open={meterOpen} onCancel={() => setMeterOpen(false)} onOk={() => void saveMeter()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={meterForm} initialValues={{ meterType: "ELECTRIC", reading: 0, amount: 0 }}>
          <Form.Item label="类型" name="meterType">
            <Select options={PARK_METER_TYPES.map((value) => ({ value, label: PARK_METER_TYPE_LABELS[value] }))} />
          </Form.Item>
          <Form.Item label="表号" name="meterNo"><Input /></Form.Item>
          <Form.Item label="周期（YYYY-MM）" name="period" rules={[{ required: true }]}><Input placeholder="2026-11" /></Form.Item>
          <Form.Item label="读数" name="reading"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="金额" name="amount"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="备注" name="note"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
