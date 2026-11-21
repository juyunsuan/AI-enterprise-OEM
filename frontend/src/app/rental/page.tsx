"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, ConfigProvider, Form, Input, Modal, Select, Space, Tag } from "antd";
import type { RentalShopRow } from "@enterprise/contracts";
import { rentalApi } from "@/api/rental";
import { ColumnSwitch, Notice, PageHero, Panel } from "@/components/ui/panel";
import { OverviewPanel, ItemsPanel } from "./_components/overview-items";
import { OrdersPanel, InspectionsPanel } from "./_components/orders";
import { CustomersPanel, StaffPanel, SettingsPanel } from "./_components/customers-staff-settings";

const TABS = [
  { value: "overview", label: "看板" },
  { value: "items", label: "租品" },
  { value: "orders", label: "租单" },
  { value: "inspections", label: "验车" },
  { value: "customers", label: "顾客" },
  { value: "staff", label: "员工" },
  { value: "settings", label: "设置与发布" },
];

const TAB_DESC: Record<string, string> = {
  overview: "门店经营看板：今日新单与收款、待取车、租用中、待结算与在押押金；近 30 天趋势、热租租品与品类收入。",
  items: "通用租品：车辆 / 设备 / 场地共用一张表，属性按 key=value 自行扩展；下架只停止展示，历史租单快照保留。",
  orders: "租单台账：线下开单、取车验车、还回验车、结算退押金与取消退款；状态机只允许前进，非法动作会被拒绝。",
  inspections: "验车台账：取车与还回两个环节的里程、油量、车况、车损扣款与现场照片，是押金结算与纠纷举证的依据。",
  customers: "门店顾客：一店一套小程序顾客档案，可查看消费与限制下单；与站内 CRM 账号隔离，不混用权限。",
  staff: "员工与工号：员工在小程序用手机号 + 工号绑定后才能验车与结算；停用即无法绑定，历史记录保留。",
  settings: "门店资料、交易参数、AI 客服与企业微信 SCRM 绑定、小程序凭据与微信支付，以及统一源码包下载。",
};

export default function RentalPage() {
  return (
    <Suspense fallback={<Panel title="租赁管理">正在读取门店信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <RentalInner />
      </ConfigProvider>
    </Suspense>
  );
}

function RentalInner() {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string; servicePhone?: string; address?: string; themeColor?: string; navigationTitle?: string }>();
  const [shops, setShops] = useState<RentalShopRow[]>([]);
  const [shopId, setShopId] = useState(0);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shop = useMemo(() => shops.find((row) => row.id === shopId) || shops[0] || null, [shopId, shops]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.shops({ query: { page: 1, pageSize: 100, keyword: "", status: "all" } });
      const list = result?.list ?? [];
      setShops(list);
      setShopId((current) => (list.some((row) => row.id === current) ? current : list[0]?.id || 0));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "门店读取失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const createShop = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const row = await rentalApi.createShop({
        body: {
          id: 0,
          name: values.name,
          logo: "",
          servicePhone: values.servicePhone ?? "",
          address: values.address ?? "",
          themeColor: values.themeColor ?? "#3370ff",
          navigationTitle: values.navigationTitle ?? "租赁管理",
        },
      });
      message.success("门店已创建，请继续配置租品与小程序");
      setCreateOpen(false);
      form.resetFields();
      await load();
      if (row?.id) setShopId(row.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHero
        title={shop ? `租赁管理 · ${shop.name}` : "租赁管理小程序"}
        desc={TAB_DESC[tab]}
        extra={
          <Space>
            <Select
              style={{ width: 220 }}
              value={shop?.id}
              loading={loading}
              placeholder="选择门店"
              onChange={setShopId}
              options={shops.map((row) => ({
                value: row.id,
                label: `${row.name}（${row.shopCode}）`,
              }))}
            />
            <Button onClick={() => setCreateOpen(true)}>新建门店</Button>
          </Space>
        }
      />

      {!loading && !shops.length ? (
        <Panel title="先创建一家租赁门店">
          <Notice>
            门店是租品、租单、顾客与员工数据的归属主体。创建后系统会生成唯一门店码，小程序 config.js 与员工绑定时使用。
          </Notice>
          <Button type="primary" style={{ marginTop: 16 }} onClick={() => setCreateOpen(true)}>创建门店</Button>
        </Panel>
      ) : shop ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Tag color={shop.status === "ONLINE" ? "green" : "default"}>{shop.statusLabel}</Tag>
              <span style={{ color: "#8a8f99" }}>门店码 {shop.shopCode}</span>
              <span style={{ color: "#8a8f99" }}>租品 {shop.itemCount} · 租单 {shop.orderCount}</span>
              <span style={{ color: "#8a8f99" }}>{shop.payEnabled ? "微信支付已开启" : "微信支付未开启"}</span>
            </Space>
          </div>
          <ColumnSwitch value={tab} onChange={setTab} options={TABS} />
          {tab === "overview" ? <OverviewPanel shopId={shop.id} /> : null}
          {tab === "items" ? <ItemsPanel shopId={shop.id} /> : null}
          {tab === "orders" ? <OrdersPanel shopId={shop.id} /> : null}
          {tab === "inspections" ? <InspectionsPanel shopId={shop.id} /> : null}
          {tab === "customers" ? <CustomersPanel shopId={shop.id} /> : null}
          {tab === "staff" ? <StaffPanel shopId={shop.id} /> : null}
          {tab === "settings" ? <SettingsPanel shop={shop} onRefresh={load} /> : null}
        </>
      ) : (
        <Panel title="租赁管理">{loading ? "正在读取门店…" : "暂无可用门店"}</Panel>
      )}

      <Modal
        title="新建租赁门店"
        open={createOpen}
        confirmLoading={busy}
        onOk={() => void createShop()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="门店名称" rules={[{ required: true, message: "请填写门店名称" }]}>
            <Input placeholder="如：上海浦东租车中心" />
          </Form.Item>
          <Form.Item name="servicePhone" label="联系电话">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="门店地址">
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="themeColor" label="主题色">
              <Input placeholder="#3370ff" />
            </Form.Item>
            <Form.Item name="navigationTitle" label="小程序标题">
              <Input placeholder="租赁管理" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}