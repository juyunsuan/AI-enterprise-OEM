"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
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
import type {
  RentalInspectionRow,
  RentalItemRow,
  RentalOrderDetail,
  RentalOrderRow,
} from "@enterprise/contracts";
import { rentalApi } from "@/api/rental";
import { Notice, Panel } from "@/components/ui/panel";
import { exportCsv } from "./export";

const cny = (value: number) =>
  "¥" + Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "PENDING_PAYMENT", label: "待付款" },
  { value: "PAID", label: "待取车" },
  { value: "PICKED_UP", label: "租用中" },
  { value: "RETURNED", label: "待结算" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
  { value: "EXPIRED", label: "超时关闭" },
];

const statusColor: Record<string, string> = {
  PENDING_PAYMENT: "gold",
  PAID: "blue",
  PICKED_UP: "processing",
  RETURNED: "orange",
  COMPLETED: "green",
  CANCELLED: "default",
  EXPIRED: "default",
};

type InspectionForm = {
  kind: "HANDOVER" | "RETURN";
  mileage?: number;
  fuelPercent?: number;
  damage?: string;
  damageFee?: number;
  imagesText?: string;
  note?: string;
};

export function OrdersPanel({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<RentalOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [detail, setDetail] = useState<RentalOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inspectionForm] = Form.useForm<InspectionForm>();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm<{
    startAt: string;
    endAt: string;
    discount?: number;
    remark?: string;
  }>();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{
    itemId: number;
    customerName?: string;
    customerPhone?: string;
    startAt: string;
    endAt: string;
    discount?: number;
    remark?: string;
    salesStaffId?: number;
  }>();
  const [items, setItems] = useState<RentalItemRow[]>([]);
  const [staffs, setStaffs] = useState<{ id: number; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.orders({
        params: { id: String(shopId) },
        query: { page, pageSize: 20, keyword, status },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "租单读取失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, message, page, shopId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    rentalApi
      .items({ params: { id: String(shopId) }, query: { page: 1, pageSize: 200, status: "ONLINE" } })
      .then((result) => setItems(result?.list ?? []))
      .catch(() => setItems([]));
    rentalApi
      .staffs({ params: { id: String(shopId) }, query: { page: 1, pageSize: 100, status: "ACTIVE" } })
      .then((result) => setStaffs(result?.list ?? []))
      .catch(() => setStaffs([]));
  }, [shopId]);

  const openDetail = async (id: number) => {
    try {
      const row = await rentalApi.orderDetail({ params: { id: String(shopId), orderId: String(id) } });
      setDetail(row);
      setDetailOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "租单详情读取失败");
    }
  };

  const openEdit = () => {
    if (!detail) return;
    editForm.setFieldsValue({
      startAt: detail.startAt.slice(0, 10),
      endAt: detail.endAt.slice(0, 10),
      discount: detail.discount,
      remark: detail.remark,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!detail) return;
    const values = await editForm.validateFields();
    setBusy(true);
    try {
      await rentalApi.updateOrder({
        params: { id: String(shopId), orderId: String(detail.id) },
        body: {
          startAt: values.startAt,
          endAt: values.endAt,
          discount: Number(values.discount ?? 0),
          remark: values.remark ?? "",
        },
      });
      message.success("租单已更新");
      setEditOpen(false);
      await openDetail(detail.id);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setBusy(false);
    }
  };

  const act = (action: "pickup" | "return" | "complete" | "cancel" | "refundDeposit") => {
    if (!detail) return;
    const labels = {
      pickup: "确认取车",
      return: "确认还回",
      complete: "结算并退押金",
      refundDeposit: "退还押金",
      cancel: "取消订单",
    };
    modal.confirm({
      title: labels[action],
      content:
        action === "complete"
          ? "将按还回验车结果扣除车损后退回押金，确定完成结算吗？"
          : action === "refundDeposit"
            ? "将按还回验车结果把押金原路退回顾客，确定继续吗？"
            : action === "cancel"
              ? "已支付订单取消会原路全额退款，确定继续吗？"
              : `确定将订单推进到「${labels[action]}」吗？`,
      onOk: async () => {
        setBusy(true);
        try {
          const next = await rentalApi.orderAction({
            params: { id: String(shopId), orderId: String(detail.id) },
            body: { action, note: "" },
          });
          setDetail(next);
          message.success("订单已更新");
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const saveInspection = async () => {
    if (!detail) return;
    const values = await inspectionForm.validateFields();
    setBusy(true);
    try {
      await rentalApi.saveInspection({
        params: { id: String(shopId), orderId: String(detail.id) },
        body: {
          kind: values.kind,
          mileage: Number(values.mileage ?? 0),
          fuelPercent: Number(values.fuelPercent ?? 100),
          damage: values.damage ?? "",
          damageFee: Number(values.damageFee ?? 0),
          images: String(values.imagesText || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          note: values.note ?? "",
        },
      });
      message.success("验车记录已保存");
      inspectionForm.resetFields();
      await openDetail(detail.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "验车保存失败");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const values = await createForm.validateFields();
    setBusy(true);
    try {
      await rentalApi.createOrder({
        params: { id: String(shopId) },
        body: {
          customerId: 0,
          customerName: values.customerName ?? "",
          customerPhone: values.customerPhone ?? "",
          itemId: values.itemId,
          startAt: values.startAt,
          endAt: values.endAt,
          discount: Number(values.discount ?? 0),
          remark: values.remark ?? "",
          salesStaffId: Number(values.salesStaffId ?? 0),
        },
      });
      message.success("租单已创建，可让顾客在小程序支付或到店支付");
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<RentalOrderRow> = [
    { title: "单号", dataIndex: "orderNo", width: 200, render: (value: string, row) => <Space direction="vertical" size={0}><span>{value}</span><span style={{ color: "#8a8f99", fontSize: 12 }}>{row.createdAt.slice(0, 10)}</span></Space> },
    { title: "租品", dataIndex: "itemName" },
    {
      title: "顾客",
      dataIndex: "customerName",
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <span>{value || "未留姓名"}</span>
          <span style={{ color: "#8a8f99", fontSize: 12 }}>{row.customerPhone || "—"}</span>
        </Space>
      ),
    },
    { title: "租期", render: (_, row) => `${row.startAt.slice(0, 10)} ~ ${row.endAt.slice(0, 10)}（${row.days} 天）` },
    { title: "经办", dataIndex: "salesStaffName", width: 90, render: (value: string, row) => value || row.pickupStaffName || "—" },
    { title: "实付", dataIndex: "payAmount", align: "right", render: (value: number) => cny(value) },
    { title: "状态", dataIndex: "statusLabel", width: 90, render: (value: string, row) => <Tag color={statusColor[row.status]}>{value}</Tag> },
    { title: "支付", dataIndex: "payStatusLabel", width: 90 },
    { title: "操作", width: 90, render: (_, row) => <Button size="small" onClick={() => void openDetail(row.id)}>详情</Button> },
  ];

  return (
    <>
      <Panel
        title="租单台账"
        extra={
          <Space>
            <Input.Search placeholder="单号 / 顾客 / 租品" allowClear style={{ width: 220 }} onSearch={(value) => { setPage(1); setKeyword(value.trim()); }} />
            <Select style={{ width: 130 }} value={status} onChange={(value) => { setPage(1); setStatus(value); }} options={STATUS_OPTIONS} />
            <Button
              onClick={() =>
                exportCsv(
                  "rental-orders.csv",
                  ["单号", "租品", "顾客", "电话", "开始", "结束", "天数", "实付", "状态", "支付"],
                  rows.map((row) => [
                    row.orderNo,
                    row.itemName,
                    row.customerName,
                    row.customerPhone,
                    row.startAt.slice(0, 10),
                    row.endAt.slice(0, 10),
                    row.days,
                    row.payAmount,
                    row.statusLabel,
                    row.payStatusLabel,
                  ]),
                )
              }
            >
              导出 CSV
            </Button>
            <Button type="primary" onClick={() => setCreateOpen(true)}>线下开单</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        />
      </Panel>

      <Drawer
        title={detail ? `租单 ${detail.orderNo}` : "租单详情"}
        width={640}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="租品">{detail.itemName}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusColor[detail.status]}>{detail.statusLabel}</Tag></Descriptions.Item>
              <Descriptions.Item label="顾客">{detail.customerName || "未留姓名"} {detail.customerPhone || ""}</Descriptions.Item>
              <Descriptions.Item label="支付">{detail.payStatusLabel}</Descriptions.Item>
              <Descriptions.Item label="租期">{detail.startAt.slice(0, 10)} ~ {detail.endAt.slice(0, 10)}（{detail.days} 天）</Descriptions.Item>
              <Descriptions.Item label="租金 / 押金">{cny(detail.rentAmount)} / {cny(detail.depositAmount)}</Descriptions.Item>
              <Descriptions.Item label="实付">{cny(detail.payAmount)}</Descriptions.Item>
              <Descriptions.Item label="车损 / 已退">{cny(detail.damageFee)} / {cny(detail.refundAmount)}</Descriptions.Item>
            </Descriptions>

            <Space wrap>
              {detail.status === "PENDING_PAYMENT" ? (
                <Button loading={busy} onClick={openEdit}>编辑租单</Button>
              ) : null}
              {detail.status === "PAID" ? <Button type="primary" loading={busy} onClick={() => act("pickup")}>确认取车</Button> : null}
              {detail.status === "PICKED_UP" ? <Button type="primary" loading={busy} onClick={() => act("return")}>确认还回</Button> : null}
              {detail.status === "RETURNED" ? <Button type="primary" loading={busy} onClick={() => act("complete")}>结算并退押金</Button> : null}
              {detail.status === "COMPLETED" && detail.payStatus === "PAID" && detail.refundAmount === 0 && detail.depositAmount > 0 ? (
                <Button type="primary" loading={busy} onClick={() => act("refundDeposit")}>退还押金</Button>
              ) : null}
              {detail.status === "PENDING_PAYMENT" || detail.status === "PAID" ? (
                <Button danger loading={busy} onClick={() => act("cancel")}>取消订单</Button>
              ) : null}
            </Space>

            <Panel title="验车记录">
              {detail.inspections.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={detail.inspections}
                  columns={[
                    { title: "环节", dataIndex: "kindLabel", width: 100 },
                    { title: "里程", dataIndex: "mileage", width: 80, render: (value: number) => `${value} km` },
                    { title: "油量", dataIndex: "fuelPercent", width: 70, render: (value: number) => `${value}%` },
                    { title: "车损扣款", dataIndex: "damageFee", width: 100, render: (value: number) => cny(value) },
                    { title: "车况", dataIndex: "damage", ellipsis: true },
                    { title: "操作人", dataIndex: "operatorName", width: 90 },
                  ]}
                />
              ) : (
                <Notice>还没有验车记录；可在下方直接补录。</Notice>
              )}
            </Panel>

            <Panel title="补录验车">
              <Form form={inspectionForm} layout="inline" initialValues={{ kind: "HANDOVER", fuelPercent: 100 }}>
                <Form.Item name="kind" label="环节">
                  <Select style={{ width: 110 }} options={[{ value: "HANDOVER", label: "取车" }, { value: "RETURN", label: "还回" }]} />
                </Form.Item>
                <Form.Item name="mileage" label="里程 km">
                  <InputNumber min={0} style={{ width: 110 }} />
                </Form.Item>
                <Form.Item name="fuelPercent" label="油量 %">
                  <InputNumber min={0} max={100} style={{ width: 90 }} />
                </Form.Item>
                <Form.Item name="damageFee" label="车损元">
                  <InputNumber min={0} precision={2} style={{ width: 110 }} />
                </Form.Item>
                <Form.Item name="damage" label="车况" style={{ minWidth: 240 }}>
                  <Input placeholder="划痕、凹陷等" />
                </Form.Item>
                <Form.Item name="imagesText" label="照片地址（每行一条）" style={{ minWidth: 280 }}>
                  <Input.TextArea rows={2} placeholder="https://…" />
                </Form.Item>
                <Form.Item name="note" label="备注">
                  <Input />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" loading={busy} onClick={() => void saveInspection()}>保存验车</Button>
                </Form.Item>
              </Form>
            </Panel>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title="线下开单"
        open={createOpen}
        confirmLoading={busy}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="itemId" label="租品" rules={[{ required: true, message: "请选择租品" }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.name}（${cny(item.dailyRate)}/天）` }))} />
          </Form.Item>
          <Space>
            <Form.Item name="customerName" label="顾客姓名">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item name="customerPhone" label="联系电话">
              <Input placeholder="选填" />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="startAt" label="开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="endAt" label="结束日期" rules={[{ required: true, message: "请选择结束日期" }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="discount" label="优惠金额（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="salesStaffId" label="经办员工">
            <Select
              allowClear
              placeholder="选填，用于业绩统计"
              options={staffs.map((staff) => ({ value: staff.id, label: staff.name }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑租单"
        open={editOpen}
        confirmLoading={busy}
        onOk={() => void submitEdit()}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Space>
            <Form.Item name="startAt" label="开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="endAt" label="结束日期" rules={[{ required: true, message: "请选择结束日期" }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="discount" label="优惠金额（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Notice>已支付订单只允许修改备注，租期与金额快照不会回溯。</Notice>
        </Form>
      </Modal>
    </>
  );
}

export function InspectionsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<RentalInspectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState("all");
  const [orderNo, setOrderNo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.inspections({
        params: { id: String(shopId) },
        query: { page: 1, pageSize: 100, kind, orderNo },
      });
      setRows(result?.list ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "验车记录读取失败");
    } finally {
      setLoading(false);
    }
  }, [kind, message, orderNo, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="验车台账"
      extra={
        <Space>
          <Input.Search placeholder="按单号搜索" allowClear style={{ width: 220 }} onSearch={(value) => setOrderNo(value.trim())} />
          <Select
            style={{ width: 130 }}
            value={kind}
            onChange={setKind}
            options={[{ value: "all", label: "全部环节" }, { value: "HANDOVER", label: "取车验车" }, { value: "RETURN", label: "还回验车" }]}
          />
          <Button
            onClick={() =>
              exportCsv(
                "rental-inspections.csv",
                ["环节", "租单", "里程", "油量", "车况", "车损扣款", "操作人", "时间"],
                rows.map((row) => [
                  row.kindLabel,
                  row.orderId,
                  row.mileage,
                  row.fuelPercent,
                  row.damage,
                  row.damageFee,
                  row.operatorName,
                  row.createdAt,
                ]),
              )
            }
          >
            导出 CSV
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: "环节", dataIndex: "kindLabel", width: 100 },
          { title: "租单", dataIndex: "orderId", width: 90, render: (value: number) => `#${value}` },
          { title: "里程", dataIndex: "mileage", width: 90, render: (value: number) => `${value} km` },
          { title: "油量", dataIndex: "fuelPercent", width: 80, render: (value: number) => `${value}%` },
          { title: "车况", dataIndex: "damage", ellipsis: true },
          { title: "车损扣款", dataIndex: "damageFee", width: 100, render: (value: number) => cny(value) },
          { title: "操作人", dataIndex: "operatorName", width: 100 },
          { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => value.replace("T", " ").slice(0, 19) },
        ]}
        pagination={{ pageSize: 10 }}
      />
    </Panel>
  );
}