"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RentalItemRow, RentalStats } from "@enterprise/contracts";
import { rentalApi } from "@/api/rental";
import { Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";
import { exportCsv } from "./export";

const cny = (value: number) =>
  "¥" + Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseAttributes(text: string) {
  const out: Record<string, string> = {};
  String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf("=");
      if (index <= 0) return;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) out[key] = value;
    });
  return out;
}

function attributesText(value: Record<string, string>) {
  return Object.entries(value || {})
    .map(([key, item]) => `${key}=${item}`)
    .join("\n");
}

export function OverviewPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<{
    shops: number;
    itemsOnline: number;
    activeRentals: number;
    pendingPickup: number;
    pendingReturn: number;
    todayOrders: number;
    todayRevenue: number;
    depositHeld: number;
    totalCustomers: number;
  } | null>(null);
  const [stats, setStats] = useState<RentalStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        rentalApi.overview(),
        rentalApi.stats({ params: { id: String(shopId) }, query: { days: 30 } }),
      ]);
      setOverview(o);
      setStats(s);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "看板读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <StatGrid>
        <StatCard label="今日新单" value={overview?.todayOrders ?? "—"} hint={`今日收款 ${cny(overview?.todayRevenue ?? 0)}`} />
        <StatCard label="待取车" value={overview?.pendingPickup ?? "—"} hint="已支付，等待交接验车" />
        <StatCard label="租用中" value={overview?.activeRentals ?? "—"} hint="未还回的在租订单" />
        <StatCard label="待结算" value={overview?.pendingReturn ?? "—"} hint="已还回，等待押金结算" />
        <StatCard label="在租租品" value={overview?.itemsOnline ?? "—"} hint="状态为在租的租品" />
        <StatCard label="在押押金" value={cny(overview?.depositHeld ?? 0)} hint="未结算订单的押金合计" />
        <StatCard label="门店顾客" value={overview?.totalCustomers ?? "—"} hint="本店小程序顾客档案" />
      </StatGrid>

      <Panel title="近 30 天趋势" extra={<Button size="small" loading={loading} onClick={() => void load()}>刷新</Button>}>
        {stats ? (
          <Table
            size="small"
            rowKey="date"
            pagination={false}
            dataSource={stats.trend.slice(-10)}
            columns={[
              { title: "日期", dataIndex: "date" },
              { title: "订单", dataIndex: "orders", align: "right" },
              { title: "实收", dataIndex: "revenue", align: "right", render: (value: number) => cny(value) },
            ]}
          />
        ) : (
          <Notice>正在读取经营数据…</Notice>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="热租租品">
          <Table
            size="small"
            rowKey="itemId"
            pagination={false}
            dataSource={stats?.topItems ?? []}
            columns={[
              { title: "租品", dataIndex: "itemName" },
              { title: "单量", dataIndex: "orders", align: "right", width: 80 },
              { title: "实收", dataIndex: "revenue", align: "right", render: (value: number) => cny(value) },
            ]}
          />
        </Panel>
        <Panel title="品类收入">
          <Table
            size="small"
            rowKey="category"
            pagination={false}
            dataSource={stats?.categoryRevenue ?? []}
            columns={[
              { title: "品类", dataIndex: "category" },
              { title: "实收", dataIndex: "revenue", align: "right", render: (value: number) => cny(value) },
            ]}
          />
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Panel title="销售员业绩">
          <Table
            size="small"
            rowKey="staffName"
            pagination={false}
            dataSource={stats?.staffPerformance ?? []}
            columns={[
              { title: "员工", dataIndex: "staffName" },
              { title: "单量", dataIndex: "orders", align: "right", width: 70 },
              { title: "实收", dataIndex: "revenue", align: "right", render: (value: number) => cny(value) },
            ]}
          />
        </Panel>
        <Panel title="客户性别">
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={stats?.customerGender ?? []}
            columns={[
              { title: "性别", dataIndex: "key" },
              { title: "人数", dataIndex: "count", align: "right", width: 70 },
            ]}
          />
        </Panel>
        <Panel title="客户城市">
          <Table
            size="small"
            rowKey="city"
            pagination={false}
            dataSource={stats?.customerCities ?? []}
            columns={[
              { title: "城市", dataIndex: "city" },
              { title: "人数", dataIndex: "count", align: "right", width: 70 },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

type ItemForm = {
  id?: number;
  category?: string;
  name: string;
  cover?: string;
  description?: string;
  attributesText?: string;
  dailyRate?: number;
  deposit?: number;
  stock?: number;
  status?: "ONLINE" | "OFFLINE";
  sortOrder?: number;
};

export function ItemsPanel({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ItemForm>();
  const [rows, setRows] = useState<RentalItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RentalItemRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.items({
        params: { id: String(shopId) },
        query: { page: 1, pageSize: 100, keyword, status },
      });
      setRows(result?.list ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "租品读取失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, message, shopId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: "ONLINE", stock: 1, dailyRate: 0, deposit: 0, sortOrder: 0 });
    setOpen(true);
  };

  const openEdit = (row: RentalItemRow) => {
    setEditing(row);
    form.setFieldsValue({
      id: row.id,
      category: row.category,
      name: row.name,
      cover: row.cover,
      description: row.description,
      attributesText: attributesText(row.attributes),
      dailyRate: row.dailyRate,
      deposit: row.deposit,
      stock: row.stock,
      status: row.status as "ONLINE" | "OFFLINE",
      sortOrder: row.sortOrder,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await rentalApi.saveItem({
        params: { id: String(shopId) },
        body: {
          id: values.id ?? 0,
          category: values.category ?? "",
          name: values.name,
          cover: values.cover ?? "",
          images: values.cover ? [values.cover] : [],
          description: values.description ?? "",
          attributes: parseAttributes(values.attributesText ?? ""),
          dailyRate: Number(values.dailyRate ?? 0),
          deposit: Number(values.deposit ?? 0),
          stock: Number(values.stock ?? 1),
          status: values.status ?? "ONLINE",
          sortOrder: Number(values.sortOrder ?? 0),
        },
      });
      message.success(editing ? "租品已更新" : "租品已创建");
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: RentalItemRow) => {
    modal.confirm({
      title: "下架租品",
      content: `下架「${row.name}」后小程序不再展示，历史租单快照保留。确定继续吗？`,
      onOk: async () => {
        await rentalApi.removeItem({ params: { id: String(shopId) }, body: { id: row.id } });
        message.success("已下架");
        await load();
      },
    });
  };

  const columns: ColumnsType<RentalItemRow> = [
    { title: "租品", dataIndex: "name", render: (value: string, row) => <Space direction="vertical" size={0}><span>{value}</span><span style={{ color: "#8a8f99", fontSize: 12 }}>{row.category || "未分类"}</span></Space> },
    { title: "日租金", dataIndex: "dailyRate", align: "right", render: (value: number) => cny(value) },
    { title: "押金", dataIndex: "deposit", align: "right", render: (value: number) => cny(value) },
    { title: "库存", dataIndex: "stock", align: "right", width: 80 },
    { title: "状态", dataIndex: "statusLabel", width: 90, render: (value: string, row) => <Tag color={row.status === "ONLINE" ? "green" : "default"}>{value}</Tag> },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Button size="small" danger onClick={() => remove(row)}>下架</Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="租品管理"
      extra={
        <Space>
          <Input.Search placeholder="按名称搜索" allowClear style={{ width: 220 }} onSearch={(value) => setKeyword(value.trim())} />
          <Select
            style={{ width: 120 }}
            value={status}
            onChange={setStatus}
            options={[{ value: "all", label: "全部状态" }, { value: "ONLINE", label: "在租" }, { value: "OFFLINE", label: "已下架" }]}
          />
          <Button
            onClick={() =>
              exportCsv(
                "rental-items.csv",
                ["名称", "品类", "日租金", "押金", "库存", "状态", "排序"],
                rows.map((row) => [
                  row.name,
                  row.category,
                  row.dailyRate,
                  row.deposit,
                  row.stock,
                  row.statusLabel,
                  row.sortOrder,
                ]),
              )
            }
          >
            导出 CSV
          </Button>
          <Button type="primary" onClick={openCreate}>新增租品</Button>
        </Space>
      }
    >
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} />

      <Drawer
        title={editing ? "编辑租品" : "新增租品"}
        width={520}
        open={open}
        onClose={() => setOpen(false)}
        extra={<Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="租品名称" rules={[{ required: true, message: "请填写租品名称" }]}>
            <Input placeholder="如：奔驰 C260 / 索尼 A7M4 / 30㎡拍摄棚" />
          </Form.Item>
          <Form.Item name="category" label="品类">
            <Input placeholder="车辆 / 设备 / 场地" />
          </Form.Item>
          <Form.Item name="cover" label="封面图地址">
            <Input placeholder="https://… 可留空" />
          </Form.Item>
          <Space style={{ width: "100%" }}>
            <Form.Item name="dailyRate" label="日租金（元）" style={{ width: 160 }}>
              <InputNumber min={0} precision={2} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="deposit" label="押金（元）" style={{ width: 160 }}>
              <InputNumber min={0} precision={2} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="stock" label="可租数量" style={{ width: 120 }}>
              <InputNumber min={0} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </Space>
          <Form.Item name="attributesText" label="属性（每行 key=value）">
            <Input.TextArea rows={4} placeholder={"车牌=沪A12345\n变速箱=自动\n座位=5"} />
          </Form.Item>
          <Form.Item name="description" label="详细说明">
            <Input.TextArea rows={4} placeholder="取还规则、证件要求、保险说明等" />
          </Form.Item>
          <Space>
            <Form.Item name="status" label="状态">
              <Select options={[{ value: "ONLINE", label: "在租" }, { value: "OFFLINE", label: "下架" }]} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} precision={0} />
            </Form.Item>
          </Space>
        </Form>
      </Drawer>
    </Panel>
  );
}