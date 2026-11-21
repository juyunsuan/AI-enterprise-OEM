"use client";

import {
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  TAKEOUT_ORDER_MODE_LABELS,
  TAKEOUT_ORDER_STATUS_LABELS,
  TAKEOUT_ORDER_STATUSES,
  type MiniAppView,
  type TakeoutCategory,
  type TakeoutCoupon,
  type TakeoutOrderDetail,
  type TakeoutOrderRow,
  type TakeoutOrderStatus,
  type TakeoutProductDetail,
  type TakeoutProductRow,
  type TakeoutShop,
} from "@enterprise/contracts";
import { Panel, PillTabs } from "@/components/ui/panel";
import { PublishTab } from "./_components/publish-tab";
import { fmtTime } from "@/lib/datetime";
import { takeoutApi } from "@/api/takeout";

const TABS = [
  { key: "shop", label: "门店设置" },
  { key: "menu", label: "菜单管理" },
  { key: "order", label: "订单管理" },
  { key: "coupon", label: "优惠券" },
  { key: "publish", label: "小程序发布" },
];

const money = (value: unknown) => "¥" + Number(value || 0).toFixed(2);
const GRID = (cols: number) => ({
  display: "grid",
  gridTemplateColumns: "repeat(" + cols + ", minmax(0, 1fr))",
  gap: 16,
});

export default function TakeoutPage() {
  const { message } = App.useApp();
  const [shops, setShops] = useState<TakeoutShop[]>([]);
  const [shopId, setShopId] = useState(0);
  const [shop, setShop] = useState<TakeoutShop | null>(null);
  const [tab, setTab] = useState("shop");
  const [loading, setLoading] = useState(true);

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await takeoutApi.shops();
      setShops(rows);
      const next = shopId && rows.some((row) => row.id === shopId) ? shopId : rows[0]?.id || 0;
      setShopId(next);
      if (next) setShop(await takeoutApi.shopDetail({ query: { shopId: next } }));
      else setShop(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "门店加载失败");
    } finally {
      setLoading(false);
    }
  }, [message, shopId]);

  useEffect(() => {
    void loadShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickShop = async (id: number) => {
    setShopId(id);
    setShop(await takeoutApi.shopDetail({ query: { shopId: id } }));
  };

  if (loading) return <div style={{ padding: 40 }}>加载中...</div>;
  if (!shops.length) return <CreateShop onDone={loadShops} />;

  return (
    <div style={{ padding: 24, maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>外卖点餐</h2>
        <Select
          value={shopId}
          style={{ width: 240 }}
          options={shops.map((row) => ({ value: row.id, label: `${row.name} · ${row.shopCode}` }))}
          onChange={(value) => void pickShop(Number(value))}
        />
        {shop ? (
          <Tag color={shop.status === "ONLINE" ? "green" : "default"}>
            {shop.status === "ONLINE" ? "营业中" : "未上线"}
          </Tag>
        ) : null}
        <div style={{ flex: 1 }} />
        <Button onClick={() => void loadShops()}>刷新</Button>
      </div>

      <PillTabs items={TABS} value={tab} onChange={setTab} style={{ marginBottom: 16 }} />

      {shop && shopId ? (
        <>
          {tab === "shop" ? <ShopTab shop={shop} onSaved={loadShops} /> : null}
          {tab === "menu" ? <MenuTab shopId={shopId} /> : null}
          {tab === "order" ? <OrderTab shopId={shopId} /> : null}
          {tab === "coupon" ? <CouponTab shopId={shopId} /> : null}
          {tab === "publish" ? <PublishTab /> : null}
        </>
      ) : null}
    </div>
  );
}

function CreateShop({ onDone }: { onDone: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string; shopCode: string }>();
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ padding: 24, maxWidth: 560, margin: "80px auto" }}>
      <Panel title="创建外卖门店">
        <div className="muted text-12" style={{ marginBottom: 16 }}>
          外卖门店与品牌商城店铺是两套数据，互不可见。
        </div>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setSaving(true);
            try {
              await takeoutApi.shopCreate({
                body: { name: values.name, shopCode: values.shopCode },
              });
              message.success("门店已创建");
              onDone();
            } catch (error) {
              message.error(error instanceof Error ? error.message : "创建失败");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item name="name" label="门店名称" rules={[{ required: true, min: 2, max: 30 }]}>
            <Input placeholder="例如：小满食堂" />
          </Form.Item>
          <Form.Item
            name="shopCode"
            label="门店寻址码"
            extra="小程序 config.js 里填这个码；创建后不建议修改"
            rules={[{ required: true, min: 4, max: 16 }, { pattern: /^[A-Za-z0-9]+$/, message: "只能字母或数字" }]}
          >
            <Input placeholder="例如：XIAOMAN01" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            创建门店
          </Button>
        </Form>
      </Panel>
    </div>
  );
}

function ShopTab({ shop, onSaved }: { shop: TakeoutShop; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [appForm] = Form.useForm();
  const [appView, setAppView] = useState<MiniAppView | null>(null);
  const [scrm, setScrm] = useState<{
    enabled: boolean;
    pending: number;
    sent: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    form.setFieldsValue({
      ...shop,
      ...shop.trade,
      ...shop.takeout,
    });
    void takeoutApi.appDetail({ query: { shopId: shop.id } }).then((view) => {
      setAppView(view);
      appForm.setFieldsValue(view);
    });
    void takeoutApi
      .scrmState({ query: { shopId: shop.id } })
      .then((state) => setScrm(state));
  }, [appForm, form, shop]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await takeoutApi.shopUpdate({
        body: {
          shopId: shop.id,
          name: values.name,
          logo: values.logo || "",
          slogan: values.slogan || "",
          servicePhone: values.servicePhone || "",
          themeColor: values.themeColor || "#E64340",
        },
      });
      await takeoutApi.shopTrade({
        body: {
          shopId: shop.id,
          trade: {
            autoCancelMinutes: values.autoCancelMinutes,
            deliveryFee: values.deliveryFee,
            freeDeliveryAmount: values.freeDeliveryAmount,
            minOrderAmount: values.minOrderAmount,
            buyerMessageEnabled: values.buyerMessageEnabled,
            selfCancelEnabled: values.selfCancelEnabled,
            pointsEnabled: values.pointsEnabled,
            pointsReturnRate: values.pointsReturnRate,
            pointsPerYuan: values.pointsPerYuan,
            pointsDeductMaxPercent: values.pointsDeductMaxPercent,
          },
          takeout: {
            businessHours: values.businessHours,
            estimatedMinutes: values.estimatedMinutes,
            deliveryEnabled: values.deliveryEnabled,
            pickupEnabled: values.pickupEnabled,
            dineInEnabled: values.dineInEnabled,
            announcement: values.announcement || "",
          },
        },
      });
      message.success("已保存");
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="门店设置"
      extra={
        <Space>
          <Button
            onClick={async () => {
              await takeoutApi.shopStatus({
                body: {
                  shopId: shop.id,
                  status: shop.status === "ONLINE" ? "OFFLINE" : "ONLINE",
                },
              });
              message.success(shop.status === "ONLINE" ? "已下线" : "已上线");
              onSaved();
            }}
          >
            {shop.status === "ONLINE" ? "下线门店" : "上线营业"}
          </Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存设置
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <div style={GRID(3)}>
          <Form.Item name="name" label="门店名称" rules={[{ required: true, min: 2, max: 30 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="servicePhone" label="客服电话">
            <Input />
          </Form.Item>
          <Form.Item name="themeColor" label="主题色">
            <Input placeholder="#E64340" />
          </Form.Item>
        </div>
        <div style={GRID(2)}>
          <Form.Item name="logo" label="Logo 地址">
            <Input />
          </Form.Item>
          <Form.Item name="slogan" label="一句话介绍">
            <Input />
          </Form.Item>
        </div>
        <div style={GRID(3)}>
          <Form.Item name="businessHours" label="营业时段">
            <Input placeholder="10:00-22:00" />
          </Form.Item>
          <Form.Item name="estimatedMinutes" label="预计制作分钟">
            <InputNumber min={5} max={180} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="announcement" label="门店公告">
            <Input />
          </Form.Item>
        </div>
        <div style={GRID(4)}>
          <Form.Item name="minOrderAmount" label="起送价">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deliveryFee" label="配送费">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="freeDeliveryAmount" label="免配送门槛">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="autoCancelMinutes" label="未付自动取消(分钟)">
            <InputNumber min={5} max={10080} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={GRID(4)}>
          <Form.Item name="deliveryEnabled" label="外卖配送" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="pickupEnabled" label="到店自取" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="dineInEnabled" label="堂食点餐" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="buyerMessageEnabled" label="允许买家留言" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <div style={GRID(4)}>
          <Form.Item name="pointsEnabled" label="启用积分" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="pointsPerYuan" label="抵扣 1 元需积分">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="pointsReturnRate" label="每消费 1 元返积分">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="pointsDeductMaxPercent" label="积分最多抵 %">
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
        </div>
      </Form>

      <Divider titlePlacement="start">企业微信 SCRM</Divider>
      <Space size={12} style={{ marginBottom: 16 }}>
        <Switch
          checked={scrm?.enabled === true}
          onChange={async (enabled) => {
            const state = await takeoutApi.scrmToggle({
              body: { shopId: shop.id, enabled },
            });
            if (state.ok) {
              setScrm(await takeoutApi.scrmState({ query: { shopId: shop.id } }));
              message.success(enabled ? "已开启来源打标" : "已关闭来源打标");
            }
          }}
        />
        <span>启用来源渠道打标</span>
        {scrm ? (
          <span className="muted text-12">
            待发 {scrm.pending} · 成功 {scrm.sent} · 跳过 {scrm.skipped} · 失败 {scrm.failed}
          </span>
        ) : null}
      </Space>
      <div className="muted text-12" style={{ marginBottom: 16 }}>
        开启后，顾客登录/下单会匹配企微联系人并追加“外卖点餐·本店”来源标签。
      </div>

      <Divider titlePlacement="start">小程序主体与支付凭据</Divider>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        AppID/AppSecret 用于 wx.login；商户号与 APIv3 凭据用于本店微信支付。
        密钥留空表示保留原值，不会回显。
      </div>
      <Space size={8} style={{ marginBottom: 12 }}>
        <Tag color={appView?.configured ? "green" : "default"}>
          {appView?.configured ? "AppID 已配置" : "AppID 未配置"}
        </Tag>
        <Tag color={appView?.payEnabled ? "green" : "default"}>
          {appView?.payEnabled ? "在线收款已开启" : "在线收款未开启"}
        </Tag>
        <Tag color={appView?.appSecretConfigured ? "green" : "default"}>
          {appView?.appSecretConfigured ? "Secret 已保存" : "Secret 未保存"}
        </Tag>
      </Space>
      <Form form={appForm} layout="vertical">
        <div style={GRID(3)}>
          <Form.Item name="appId" label="小程序 AppID">
            <Input placeholder="wx..." />
          </Form.Item>
          <Form.Item name="appSecret" label="AppSecret（留空保留原值）">
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </div>
        <div style={GRID(3)}>
          <Form.Item name="mchId" label="微信支付商户号">
            <Input />
          </Form.Item>
          <Form.Item name="payCertSerial" label="商户证书序列号">
            <Input />
          </Form.Item>
          <Form.Item name="payEnabled" label="开启在线收款" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <div style={GRID(2)}>
          <Form.Item name="payApiV3Key" label="APIv3 密钥（留空保留原值）">
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </div>
        <Form.Item name="payPrivateKey" label="商户私钥 PEM（留空保留原值）">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space>
          <Button
            onClick={async () => {
              const values = await appForm.validateFields();
              const view = await takeoutApi.appSave({
                body: {
                  shopId: shop.id,
                  appId: values.appId || "",
                  appSecret: values.appSecret || undefined,
                  mchId: values.mchId || "",
                  payApiV3Key: values.payApiV3Key || undefined,
                  payCertSerial: values.payCertSerial || "",
                  payPrivateKey: values.payPrivateKey || undefined,
                  payEnabled: !!values.payEnabled,
                  templates: {},
                },
              });
              setAppView(view);
              appForm.setFieldsValue({ ...view, appSecret: "", payApiV3Key: "", payPrivateKey: "" });
              message.success("主体凭据已保存");
              onSaved();
            }}
          >
            保存主体凭据
          </Button>
          <Button
            onClick={async () => {
              const result = await takeoutApi.appTest({ body: { shopId: shop.id } });
              if (result.ok) message.success("AppID / AppSecret 自检通过");
              else message.error(result.message || "自检失败");
            }}
          >
            连通自检
          </Button>
        </Space>
      </Form>
    </Panel>
  );
}

function MenuTab({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [categories, setCategories] = useState<TakeoutCategory[]>([]);
  const [products, setProducts] = useState<TakeoutProductRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<TakeoutProductDetail | null>(null);
  const [drawer, setDrawer] = useState(false);

  const load = useCallback(async () => {
    const [cats, list] = await Promise.all([
      takeoutApi.categoryList({ query: { shopId } }),
      takeoutApi.productList({ query: { shopId, keyword: keyword || undefined, page: 1, pageSize: 100 } }),
    ]);
    setCategories(cats);
    setProducts(list.list);
  }, [keyword, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<TakeoutProductRow> = [
    { title: "菜品", dataIndex: "title" },
    {
      title: "分类",
      dataIndex: "categoryId",
      render: (id: number) => categories.find((row) => row.id === id)?.name || "未分类",
    },
    { title: "价格", dataIndex: "price", render: (value: number) => money(value) },
    { title: "库存", dataIndex: "stock" },
    { title: "销量", dataIndex: "sales" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: string) => (
        <Tag color={value === "ONLINE" ? "green" : value === "OFFLINE" ? "default" : "orange"}>
          {value === "ONLINE" ? "上架中" : value === "OFFLINE" ? "已下架" : "草稿"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            onClick={async () => {
              setEditing(await takeoutApi.productDetail({ query: { shopId, id: row.id } }));
              setDrawer(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: `删除菜品「${row.title}」？`,
                onOk: async () => {
                  await takeoutApi.productRemove({ body: { shopId, id: row.id } });
                  message.success("已删除");
                  await load();
                },
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const addCategory = () => {
    let name = "";
    modal.confirm({
      title: "新增分类",
      content: <Input placeholder="分类名称" onChange={(event) => (name = event.target.value)} />,
      onOk: async () => {
        if (!name.trim()) return;
        await takeoutApi.categorySave({ body: { shopId, name: name.trim() } });
        message.success("分类已新增");
        await load();
      },
    });
  };

  return (
    <Panel
      title="菜单管理"
      extra={
        <Space>
          <Button onClick={addCategory}>新增分类</Button>
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setDrawer(true);
            }}
          >
            新增菜品
          </Button>
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        {categories.map((row) => (
          <Tag key={row.id} closable onClose={async () => {
            await takeoutApi.categoryRemove({ body: { shopId, id: row.id } });
            await load();
          }}>
            {row.name}（{row.productCount}）
          </Tag>
        ))}
        <Input
          allowClear
          placeholder="搜索菜品"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          style={{ width: 200 }}
        />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={products} pagination={false} />
      <ProductDrawer
        open={drawer}
        shopId={shopId}
        categories={categories}
        product={editing}
        onClose={() => setDrawer(false)}
        onSaved={async () => {
          setDrawer(false);
          await load();
        }}
      />
    </Panel>
  );
}

function ProductDrawer({
  open,
  shopId,
  categories,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  shopId: number;
  categories: TakeoutCategory[];
  product: TakeoutProductDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [specs, setSpecs] = useState<Array<{ name: string; valuesText: string }>>([]);
  const [skus, setSkus] = useState<Array<{ skuName: string; specValues: Record<string, string>; price: number; stock: number; enabled: boolean }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      product
        ? { ...product, categoryId: product.categoryId || undefined }
        : { status: "ONLINE", unit: "份", stock: 100, isHot: false, isNew: false, sortOrder: 0 },
    );
    setSpecs(
      (product?.specs || []).map((spec) => ({
        name: spec.name,
        valuesText: spec.values.join(","),
      })),
    );
    setSkus(
      (product?.skus || []).map((sku) => ({
        skuName: sku.skuName,
        specValues: sku.specValues,
        price: sku.price,
        stock: sku.stock,
        enabled: sku.enabled,
      })),
    );
  }, [form, open, product]);

  const generate = () => {
    const groups = specs
      .map((spec) => ({
        name: spec.name.trim(),
        values: spec.valuesText.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      }))
      .filter((spec) => spec.name && spec.values.length);
    if (!groups.length) {
      setSkus([]);
      return;
    }
    let combos: Array<Record<string, string>> = [{}];
    for (const group of groups) {
      const next: Array<Record<string, string>> = [];
      for (const combo of combos) {
        for (const value of group.values) {
          next.push({ ...combo, [group.name]: value });
        }
      }
      combos = next;
    }
    const basePrice = Number(form.getFieldValue("price") || 0);
    const baseStock = Number(form.getFieldValue("stock") || 0);
    setSkus(
      combos.map((values) => {
        const skuName = Object.values(values).join(" / ");
        const old = skus.find((row) => row.skuName === skuName);
        return old || { skuName, specValues: values, price: basePrice, stock: baseStock, enabled: true };
      }),
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const parsedSpecs = specs
        .map((spec) => ({
          name: spec.name.trim(),
          values: spec.valuesText.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
        }))
        .filter((spec) => spec.name && spec.values.length);
      await takeoutApi.productSave({
        body: {
          shopId,
          id: product?.id,
          categoryId: values.categoryId || 0,
          title: values.title,
          subtitle: values.subtitle || "",
          coverImage: values.coverImage || "",
          images: values.images ?? product?.images ?? [],
          detail: values.detail ?? product?.detail ?? "",
          price: values.price,
          marketPrice: values.marketPrice || 0,
          stock: values.stock || 0,
          unit: values.unit || "份",
          specs: parsedSpecs,
          status: values.status,
          isHot: !!values.isHot,
          isNew: !!values.isNew,
          sortOrder: values.sortOrder || 0,
          skus: parsedSpecs.length
            ? skus.map((sku) => ({
                id: 0,
                skuName: sku.skuName,
                image: "",
                uniqueId: sku.skuName,
                specValues: sku.specValues,
                price: sku.price,
                marketPrice: 0,
                stock: sku.stock,
                enabled: sku.enabled,
              }))
            : [],
        },
      });
      message.success("菜品已保存");
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width={760}
      title={product ? "编辑菜品" : "新增菜品"}
      onClose={onClose}
      extra={
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <div style={GRID(2)}>
          <Form.Item name="title" label="菜品名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="categoryId" label="分类">
            <Select allowClear options={categories.map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
        </div>
        <div style={GRID(3)}>
          <Form.Item name="price" label="价格" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="marketPrice" label="划线价">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="stock" label="库存">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={GRID(3)}>
          <Form.Item name="unit" label="单位">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ONLINE", label: "上架中" },
                { value: "OFFLINE", label: "已下架" },
                { value: "DRAFT", label: "草稿" },
              ]}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="coverImage" label="封面图地址">
          <Input />
        </Form.Item>
        <Form.Item name="subtitle" label="一句话描述">
          <Input />
        </Form.Item>
        <div style={GRID(2)}>
          <Form.Item name="isHot" label="热销" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isNew" label="新品" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Form.Item label="规格">
          <Space direction="vertical" style={{ width: "100%" }}>
            {specs.map((spec, index) => (
              <Space key={index} style={{ width: "100%" }}>
                <Input
                  placeholder="规格名，如 份量"
                  value={spec.name}
                  onChange={(event) => {
                    const next = [...specs];
                    next[index] = { ...next[index], name: event.target.value };
                    setSpecs(next);
                  }}
                  style={{ width: 180 }}
                />
                <Input
                  placeholder="规格值，逗号分隔，如 小份,大份"
                  value={spec.valuesText}
                  onChange={(event) => {
                    const next = [...specs];
                    next[index] = { ...next[index], valuesText: event.target.value };
                    setSpecs(next);
                  }}
                />
                <Button danger onClick={() => setSpecs(specs.filter((_, i) => i !== index))}>
                  删除
                </Button>
              </Space>
            ))}
            <Space>
              <Button onClick={() => setSpecs([...specs, { name: "", valuesText: "" }])}>
                添加规格
              </Button>
              <Button onClick={generate}>生成 SKU 组合</Button>
            </Space>
          </Space>
        </Form.Item>
        {skus.length ? (
          <Table
            rowKey="skuName"
            size="small"
            pagination={false}
            dataSource={skus}
            columns={[
              { title: "规格组合", dataIndex: "skuName" },
              {
                title: "价格",
                render: (_, row) => (
                  <InputNumber
                    min={0}
                    precision={2}
                    value={row.price}
                    onChange={(value) =>
                      setSkus(skus.map((item) => (item.skuName === row.skuName ? { ...item, price: Number(value || 0) } : item)))
                    }
                  />
                ),
              },
              {
                title: "库存",
                render: (_, row) => (
                  <InputNumber
                    min={0}
                    value={row.stock}
                    onChange={(value) =>
                      setSkus(skus.map((item) => (item.skuName === row.skuName ? { ...item, stock: Number(value || 0) } : item)))
                    }
                  />
                ),
              },
              {
                title: "启用",
                render: (_, row) => (
                  <Switch
                    checked={row.enabled}
                    onChange={(value) =>
                      setSkus(skus.map((item) => (item.skuName === row.skuName ? { ...item, enabled: value } : item)))
                    }
                  />
                ),
              },
            ]}
          />
        ) : null}
      </Form>
    </Drawer>
  );
}

function OrderTab({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<TakeoutOrderRow[]>([]);
  const [detail, setDetail] = useState<TakeoutOrderDetail | null>(null);

  const load = useCallback(async () => {
    const data = await takeoutApi.orderList({
      query: {
        shopId,
        status: (status || undefined) as TakeoutOrderStatus | undefined,
        page: 1,
        pageSize: 100,
      },
    });
    setRows(data.list);
  }, [shopId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = async (id: number) => {
    await takeoutApi.orderAdvance({ body: { shopId, id, action: "READY" } });
    message.success("已出餐");
    await load();
  };
  const finish = async (id: number) => {
    await takeoutApi.orderFinish({ body: { shopId, id } });
    message.success("已标记完成");
    await load();
  };
  const markPaid = async (id: number) => {
    await takeoutApi.orderMarkPaid({ body: { shopId, id } });
    message.success("已确认线下收款");
    await load();
  };

  return (
    <Panel
      title="订单管理"
      extra={
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 180 }}
          value={status || undefined}
          options={TAKEOUT_ORDER_STATUSES.map((key) => ({ value: key, label: TAKEOUT_ORDER_STATUS_LABELS[key] }))}
          onChange={(value) => setStatus(String(value || ""))}
        />
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: "订单号", dataIndex: "orderNo", width: 190 },
          { title: "方式", dataIndex: "orderMode", render: (value: string) => TAKEOUT_ORDER_MODE_LABELS[value] || value },
          { title: "状态", dataIndex: "status", render: (value: string) => TAKEOUT_ORDER_STATUS_LABELS[value] || value },
          { title: "金额", dataIndex: "payAmount", render: (value: number) => money(value) },
          { title: "顾客", dataIndex: "nickname" },
          { title: "下单时间", dataIndex: "createdAt", render: (value: string) => fmtTime(value) },
          {
            title: "操作",
            key: "actions",
            render: (_, row) => (
              <Space size={0}>
                <Button type="link" size="small" onClick={async () => setDetail(await takeoutApi.orderDetail({ query: { shopId, id: row.id } }))}>
                  详情
                </Button>
                {row.status === "PENDING_PAYMENT" ? (
                  <Button type="link" size="small" onClick={() => void markPaid(row.id)}>
                    线下收款
                  </Button>
                ) : null}
                {row.status === "PAID" ? (
                  <Button type="link" size="small" onClick={() => void advance(row.id)}>
                    出餐
                  </Button>
                ) : null}
                {row.status === "SHIPPED" ? (
                  <Button type="link" size="small" onClick={() => void finish(row.id)}>
                    完成
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
        pagination={false}
      />
      <Drawer open={Boolean(detail)} width={560} onClose={() => setDetail(null)} title="订单详情">
        {detail ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="订单号">{detail.orderNo}</Descriptions.Item>
              <Descriptions.Item label="状态">{TAKEOUT_ORDER_STATUS_LABELS[detail.status]}</Descriptions.Item>
              <Descriptions.Item label="方式">{TAKEOUT_ORDER_MODE_LABELS[detail.orderMode]}</Descriptions.Item>
              <Descriptions.Item label="取餐号">{detail.pickupCode || dash()}</Descriptions.Item>
              <Descriptions.Item label="桌号">{detail.tableNo || dash()}</Descriptions.Item>
              <Descriptions.Item label="备注">{detail.buyerRemark || dash()}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.items}
              columns={[
                { title: "菜品", dataIndex: "title" },
                { title: "规格", dataIndex: "skuName" },
                { title: "数量", dataIndex: "quantity" },
                { title: "小计", dataIndex: "totalPrice", render: (value: number) => money(value) },
              ]}
            />
            <Descriptions column={1} size="small">
              <Descriptions.Item label="商品金额">{money(detail.goodsAmount)}</Descriptions.Item>
              <Descriptions.Item label="配送费">{money(detail.deliveryFee)}</Descriptions.Item>
              <Descriptions.Item label="优惠">{money(detail.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="实付">{money(detail.payAmount)}</Descriptions.Item>
            </Descriptions>
            <Space direction="vertical" style={{ width: "100%" }}>
              {detail.logs.map((log) => (
                <div key={log.id} className="text-12">
                  {fmtTime(log.createdAt)} · {log.content}
                </div>
              ))}
            </Space>
          </Space>
        ) : null}
      </Drawer>
    </Panel>
  );
}

function CouponTab({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<TakeoutCoupon[]>([]);
  const [editing, setEditing] = useState<TakeoutCoupon | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const data = await takeoutApi.couponList({ query: { shopId, page: 1, pageSize: 100 } });
    setRows(data.list);
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    await takeoutApi.couponSave({
      body: {
        shopId,
        id: editing?.id,
        name: values.name,
        type: values.type,
        value: values.value,
        threshold: values.threshold || 0,
        totalCount: values.totalCount,
        perLimit: values.perLimit,
        validType: "DAYS",
        startAt: "",
        endAt: "",
        validDays: values.validDays,
        scope: "ALL",
        scopeIds: [],
        status: values.status,
      },
    });
    message.success("优惠券已保存");
    setOpen(false);
    await load();
  };

  return (
    <Panel
      title="优惠券"
      extra={
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({ type: "FULL_REDUCE", value: 5, threshold: 30, totalCount: 100, perLimit: 1, validType: "DAYS", validDays: 7, status: "ONLINE" });
            setOpen(true);
          }}
        >
          新建优惠券
        </Button>
      }
    >
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "类型", dataIndex: "type", render: (value: string) => (value === "DISCOUNT" ? "折扣券" : "满减券") },
          { title: "力度", dataIndex: "value", render: (value: number, row) => (row.type === "DISCOUNT" ? `${Number(value) / 10}折` : money(value)) },
          { title: "门槛", dataIndex: "threshold", render: (value: number) => money(value) },
          { title: "已领/总量", render: (_, row) => `${row.receivedCount}/${row.totalCount}` },
          { title: "状态", dataIndex: "status" },
          {
            title: "操作",
            key: "actions",
            render: (_, row) => (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setEditing(row);
                  form.setFieldsValue(row);
                  setOpen(true);
                }}
              >
                编辑
              </Button>
            ),
          },
        ]}
      />
      <Modal open={open} title={editing ? "编辑优惠券" : "新建优惠券"} onCancel={() => setOpen(false)} onOk={() => void save()}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="type" label="类型">
              <Select
                style={{ width: 140 }}
                options={[
                  { value: "FULL_REDUCE", label: "满减券" },
                  { value: "DISCOUNT", label: "折扣券" },
                ]}
              />
            </Form.Item>
            <Form.Item name="value" label="力度（满减元/折扣百分比）">
              <InputNumber min={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="threshold" label="门槛">
              <InputNumber min={0} precision={2} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="totalCount" label="发放总量">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="perLimit" label="每人限领">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="validDays" label="有效天数">
              <InputNumber min={1} />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ONLINE", label: "发放中" },
                { value: "OFFLINE", label: "停发" },
                { value: "ENDED", label: "结束" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}

function dash() {
  return "—";
}