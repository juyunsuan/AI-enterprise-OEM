"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import {
  HEALTH_GOODS_KINDS,
  HEALTH_GOODS_KIND_LABELS,
  type HealthDrugRow,
  type HealthExpressCompanyRow,
  type HealthGoodsCategoryRow,
  type HealthGoodsRow,
  type HealthShippingTemplateRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
import { useHealthShopId } from "./health-scope";
import {
  cny,
  DataTable,
  FilterBar,
  LoadError,
  OnOffTag,
  onOffLabel,
  useHealthResource,
} from "./health-common";

/**
 * 商品与药品：商品、分类、药品字典、快递公司、运费模板。
 * 商品可关联药品字典（带出批准文号与处方标记），处方药下单时小程序端会校验有效处方；
 * 快递公司供商品订单发货选用，运费模板决定首重/续重与偏远地区加收。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;

const yuanToCents = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100));
const centsToYuan = (value: unknown) => Number(value ?? 0) / 100;

const STATUS_OPTIONS = (["ON", "OFF"] as const).map((value) => ({
  value,
  label: onOffLabel(value),
}));

const KIND_OPTIONS = HEALTH_GOODS_KINDS.map((value) => ({
  value,
  label: HEALTH_GOODS_KIND_LABELS[value] ?? value,
}));

const kindText = (value: string) => HEALTH_GOODS_KIND_LABELS[value] ?? value;

const SHIPPING_MODE_OPTIONS = [
  { value: "TEMPLATE", label: "按运费模板" },
  { value: "FREE", label: "包邮" },
  { value: "FIXED", label: "固定运费" },
];

export function GoodsTab() {
  const shopId = useHealthShopId();
  const [panel, setPanel] = useState("goods");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "goods",
          label: "商品",
          children: <GoodsPanel shopId={shopId} />,
        },
        {
          key: "categories",
          label: "分类",
          children: <CategoriesPanel shopId={shopId} />,
        },
        {
          key: "drugs",
          label: "药品字典",
          children: <DrugsPanel shopId={shopId} />,
        },
        {
          key: "express",
          label: "快递公司",
          children: <ExpressPanel shopId={shopId} />,
        },
        {
          key: "shipping",
          label: "运费模板",
          children: <ShippingPanel shopId={shopId} />,
        },
      ]}
    />
  );
}

/** 商品表单用到的三类下拉：分类、药品字典、运费模板，一次取全供筛选与表单共用。 */
function useGoodsOptions(shopId: number, enabled: boolean) {
  const categories = useHealthResource(
    () => healthApi.goodsCategories({ query: { shopId } }),
    [shopId],
    enabled && shopId > 0,
  );
  const drugs = useHealthResource(
    () => healthApi.drugs({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE } }),
    [shopId],
    enabled && shopId > 0,
  );
  const templates = useHealthResource(
    () => healthApi.shippingTemplates({ query: { shopId } }),
    [shopId],
    enabled && shopId > 0,
  );
  return {
    categoryRows: categories.data ?? [],
    categoryOptions: (categories.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    drugRows: drugs.data?.list ?? [],
    drugOptions: (drugs.data?.list ?? []).map((row) => ({
      value: row.id,
      label: row.spec ? `${row.genericName}（${row.spec}）` : row.genericName,
    })),
    templateOptions: (templates.data ?? []).map((row) => ({ value: row.id, label: row.name })),
  };
}

// ============================================================================
// 商品
// ============================================================================

function GoodsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [kind, setKind] = useState("all");
  const [categoryId, setCategoryId] = useState(0);
  const [rxOnly, setRxOnly] = useState(0);
  const [lowStock, setLowStock] = useState(0);
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthGoodsRow | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<HealthGoodsRow | null>(null);
  const options = useGoodsOptions(shopId, true);
  const resource = useHealthResource(
    () =>
      healthApi.goods({
        query: {
          shopId,
          page,
          pageSize: PAGE_SIZE,
          keyword,
          kind,
          categoryId,
          prescriptionOnly: rxOnly,
          lowStock,
          status,
        },
      }),
    [shopId, page, keyword, kind, categoryId, rxOnly, lowStock, status],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const toggleStatus = async (row: HealthGoodsRow) => {
    const next = row.status === "ON" ? "OFF" : "ON";
    setBusy(true);
    try {
      await healthApi.goodsStatus({ body: { shopId, id: row.id, status: next, reason: "" } });
      message.success(next === "ON" ? `「${row.name}」已上架` : `「${row.name}」已下架`);
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: HealthGoodsRow) => {
    setBusy(true);
    try {
      await healthApi.goodsRemove({ body: { shopId, id: row.id } });
      message.success("商品已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthGoodsRow> = [
    {
      title: "商品名称",
      dataIndex: "name",
      width: 240,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          <div className="muted text-12">
            {row.mainImage ? "已配主图" : "未配主图"}
            {row.drugName ? ` · 关联 ${row.drugName}` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 100,
      render: (value: string) => <Tag>{kindText(value)}</Tag>,
    },
    {
      title: "分类",
      dataIndex: "categoryName",
      width: 120,
      render: (value: string) => value || "未分类",
    },
    { title: "售价", dataIndex: "priceCents", width: 100, render: (value: number) => cny(value) },
    {
      title: "库存",
      dataIndex: "stock",
      width: 90,
      render: (value: number, row) => (
        <span style={{ color: value <= 10 ? "var(--danger, #cf1322)" : undefined }}>
          {value}
          {row.skuMode ? <span className="muted text-12">（多规格）</span> : null}
        </span>
      ),
    },
    { title: "已售", dataIndex: "sales", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "处方药",
      dataIndex: "prescriptionRequired",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "volcano" : "default"}>{value ? "需处方" : "不需"}</Tag>
      ),
    },
    {
      title: "评分",
      dataIndex: "reviewScore",
      width: 100,
      render: (value: number, row) =>
        row.reviewCount > 0 ? `${value.toFixed(1)}（${row.reviewCount}）` : "—",
    },
    {
      title: "操作",
      width: 240,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="text" onClick={() => setAdjusting(row)}>
            调库存
          </Button>
          <Button size="small" type="text" loading={busy} onClick={() => void toggleStatus(row)}>
            {row.status === "ON" ? "下架" : "上架"}
          </Button>
          <Popconfirm
            title="删除后小程序端立即不可售，历史订单不受影响。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="商品"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">处方药下单会校验就诊人的有效处方，无处方直接拦下</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增商品
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">搜索</span>
          <Input.Search
            allowClear
            placeholder="商品名称"
            style={{ width: 200 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">类型</span>
          <Select
            value={kind}
            style={{ width: 140 }}
            onChange={(value: string) => {
              setKind(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部类型" }, ...KIND_OPTIONS]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">分类</span>
          <Select
            value={categoryId}
            style={{ width: 170 }}
            onChange={(value: number) => {
              setCategoryId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部分类" }, ...options.categoryOptions]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">处方药</span>
          <Select
            value={rxOnly}
            style={{ width: 130 }}
            onChange={(value: number) => {
              setRxOnly(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部" },
              { value: 1, label: "仅处方药" },
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">库存</span>
          <Select
            value={lowStock}
            style={{ width: 150 }}
            onChange={(value: number) => {
              setLowStock(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部库存" },
              { value: 1, label: "低于 10 件" },
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">上架状态</span>
          <Select
            value={status}
            style={{ width: 130 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...STATUS_OPTIONS]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthGoodsRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1500 }}
        expandable={{
          rowExpandable: (row) => row.skus.length > 0,
          expandedRowRender: (row) => (
            <div style={{ display: "grid", gap: 4 }}>
              {row.skus.map((sku) => (
                <span key={sku.id} className="text-12">
                  {sku.name || "默认规格"} · {cny(sku.priceCents)} · 库存 {sku.stock} · 已售 {sku.sales}
                  {sku.specs.length
                    ? ` · ${sku.specs.map((spec) => `${spec.label}:${spec.value}`).join(" ")}`
                    : ""}
                </span>
              ))}
            </div>
          ),
        }}
      />

      <div className="muted text-12" style={{ marginTop: 8 }}>
        多规格商品的库存按规格分别记账，订单扣减到具体规格；调库存只记台账，不改订单。
      </div>

      <GoodsModal
        shopId={shopId}
        editing={editing}
        categoryOptions={options.categoryOptions}
        drugOptions={options.drugOptions}
        templateOptions={options.templateOptions}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />

      <StockModal
        shopId={shopId}
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type GoodsFormValues = {
  name: string;
  kind: string;
  categoryId: number;
  images: { url: string }[];
  drugId?: number;
  prescriptionRequired: boolean;
  spec: string;
  unit: string;
  priceYuan: number;
  originPriceYuan: number;
  costYuan: number;
  stock: number;
  skuMode: boolean;
  skus: { name: string; priceYuan: number; stock: number }[];
  detail: string;
  shippingMode: string;
  shippingTemplateId?: number;
  recommend: boolean;
  status: string;
};

function GoodsModal({
  shopId,
  editing,
  categoryOptions,
  drugOptions,
  templateOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthGoodsRow | "new" | null;
  categoryOptions: { value: number; label: string }[];
  drugOptions: { value: number; label: string }[];
  templateOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<GoodsFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      kind: row?.kind ?? "HEALTH_PRODUCT",
      categoryId: row?.categoryId ?? categoryOptions[0]?.value ?? 0,
      images: (row?.images ?? []).map((url) => ({ url })),
      drugId: row?.drugId || undefined,
      prescriptionRequired: row?.prescriptionRequired ?? false,
      spec: row?.spec ?? "",
      unit: row?.unit ?? "件",
      priceYuan: centsToYuan(row?.priceCents),
      originPriceYuan: centsToYuan(row?.originPriceCents),
      costYuan: centsToYuan(row?.costCents),
      stock: row?.stock ?? 0,
      skuMode: row?.skuMode ?? false,
      skus: (row?.skus ?? []).map((sku) => ({
        name: sku.name,
        priceYuan: centsToYuan(sku.priceCents),
        stock: sku.stock,
      })),
      detail: row?.detail ?? "",
      shippingMode: row?.shippingMode || "TEMPLATE",
      shippingTemplateId: row?.shippingTemplateId || undefined,
      recommend: row?.recommend ?? false,
      status: row?.status ?? "ON",
    });
    // 打开时取一次默认值；下拉数据后到也不覆盖用户已经改动的内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, form]);

  /** 编辑时按规格名找回原有规格维度（表单只改名称/价格/库存）。 */
  const specsOf = (name: string) =>
    row?.skus.find((sku) => sku.name === name)?.specs ?? [];

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.goodsSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          kind: (values.kind ?? "HEALTH_PRODUCT") as HealthGoodsRow["kind"],
          categoryId: Number(values.categoryId ?? 0),
          images: (values.images ?? [])
            .map((item) => (item?.url ?? "").trim())
            .filter(Boolean)
            .slice(0, 9),
          drugId: Number(values.drugId ?? 0),
          prescriptionRequired: Boolean(values.prescriptionRequired),
          spec: values.spec ?? "",
          unit: values.unit ?? "件",
          priceCents: yuanToCents(values.priceYuan),
          originPriceCents: yuanToCents(values.originPriceYuan),
          costCents: yuanToCents(values.costYuan),
          stock: Number(values.stock ?? 0),
          skuMode: Boolean(values.skuMode),
          skus: (values.skus ?? []).map((sku) => ({
            name: (sku.name ?? "").trim(),
            specs: specsOf(sku.name ?? ""),
            priceCents: yuanToCents(sku.priceYuan),
            stock: Number(sku.stock ?? 0),
          })),
          detail: values.detail ?? "",
          shippingMode: (values.shippingMode ?? "TEMPLATE") as "TEMPLATE" | "FREE" | "FIXED",
          shippingTemplateId: Number(values.shippingTemplateId ?? 0),
          recommend: Boolean(values.recommend),
          status: (values.status ?? "ON") as HealthGoodsRow["status"],
        },
      });
      message.success(row ? "商品已保存" : "商品已创建，上架后小程序端可售");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑商品「${row.name}」` : "新增商品"}
      width={820}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: "请填写商品名称" }]}
          >
            <Input maxLength={120} placeholder="如 电子血压计（上臂式）" />
          </Form.Item>
          <Form.Item name="kind" label="商品类型">
            <Select options={KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="categoryId" label="所属分类" extra="分类为空时先到「分类」页签新增">
            <Select allowClear placeholder="未分类" options={categoryOptions} />
          </Form.Item>
          <Form.Item
            name="drugId"
            label="关联药品字典"
            extra="关联后带出批准文号与处方标记"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="非药品可留空"
              options={drugOptions}
            />
          </Form.Item>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="priceYuan" label="售价（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="originPriceYuan" label="划线价（元）" extra="0 表示不展示">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="costYuan" label="成本价（元）" extra="仅店主可见">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="prescriptionRequired"
            label="需处方"
            valuePropName="checked"
            extra="开启后下单校验有效处方"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="spec" label="规格">
            <Input maxLength={60} placeholder="如 100 片/瓶" />
          </Form.Item>
          <Form.Item name="unit" label="单位">
            <Input maxLength={16} placeholder="如 盒 / 件 / 瓶" />
          </Form.Item>
        </div>

        <Form.Item name="images" label="商品图片" extra="每行一个图片地址，最多 9 张，第一张为主图">
          <Form.List name="images">
            {(fields, { add, remove }) => (
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline">
                    <Form.Item
                      name={[field.name, "url"]}
                      style={{ marginBottom: 0, width: 560 }}
                    >
                      <Input maxLength={500} placeholder="https://…" />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ url: "" })}
                  disabled={fields.length >= 9}
                >
                  添加图片
                </Button>
              </div>
            )}
          </Form.List>
        </Form.Item>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="skuMode"
            label="多规格"
            valuePropName="checked"
            extra="开启后按规格分别记库存"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="stock"
            label="总库存"
            extra={row?.skuMode ? "多规格商品的总库存由规格汇总" : "未开启多规格时按整件记库存"}
          >
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="recommend" label="推荐位" valuePropName="checked" extra="小程序首页优先展示">
            <Switch />
          </Form.Item>
        </div>

        <Form.Item
          noStyle
          shouldUpdate={(prev, next) => prev.skuMode !== next.skuMode}
        >
          {({ getFieldValue }) =>
            getFieldValue("skuMode") ? (
              <Form.Item label="规格列表" extra="名称建议写清规格组合，如「500ml×2 瓶装」">
                <Form.List name="skus">
                  {(fields, { add, remove }) => (
                    <div style={{ display: "grid", gap: 8 }}>
                      {fields.map((field) => (
                        <Space key={field.key} align="baseline" wrap>
                          <Form.Item
                            name={[field.name, "name"]}
                            style={{ marginBottom: 0, width: 260 }}
                            rules={[{ required: true, message: "请填写规格名称" }]}
                          >
                            <Input maxLength={80} placeholder="规格名称" />
                          </Form.Item>
                          <Form.Item name={[field.name, "priceYuan"]} style={{ marginBottom: 0 }}>
                            <InputNumber
                              min={0}
                              precision={2}
                              placeholder="售价（元）"
                              style={{ width: 140 }}
                            />
                          </Form.Item>
                          <Form.Item name={[field.name, "stock"]} style={{ marginBottom: 0 }}>
                            <InputNumber
                              min={0}
                              precision={0}
                              placeholder="库存"
                              style={{ width: 110 }}
                            />
                          </Form.Item>
                          <Button
                            type="text"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        </Space>
                      ))}
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add({ name: "", priceYuan: 0, stock: 0 })}
                        disabled={fields.length >= 100}
                      >
                        添加规格
                      </Button>
                    </div>
                  )}
                </Form.List>
              </Form.Item>
            ) : null
          }
        </Form.Item>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item name="shippingMode" label="运费方式">
            <Select options={SHIPPING_MODE_OPTIONS} />
          </Form.Item>
          <Form.Item name="shippingTemplateId" label="运费模板" extra="运费方式为模板时生效">
            <Select
              allowClear
              placeholder="选择模板"
              options={templateOptions}
            />
          </Form.Item>
          <Form.Item name="status" label="上架状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item name="detail" label="商品详情">
          <Input.TextArea
            rows={5}
            maxLength={60000}
            placeholder="成分、用法、适用人群与注意事项；处方药请写明「凭处方购买」"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function StockModal({
  shopId,
  row,
  onClose,
  onDone,
}: {
  shopId: number;
  row: HealthGoodsRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ skuId: number; delta: number; note: string }>();
  const [saving, setSaving] = useState(false);
  const open = Boolean(row);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ skuId: 0, delta: 0, note: "" });
  }, [open, form]);

  if (!row) return null;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.goodsStockAdjust({
        body: {
          shopId,
          id: row.id,
          skuId: Number(values.skuId ?? 0),
          delta: Number(values.delta ?? 0),
          note: values.note ?? "",
        },
      });
      message.success("库存已调整");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "调整失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`调整库存 · ${row.name}`}
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认调整"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="skuId" label="调整对象">
          <Select
            options={[
              { value: 0, label: `整体库存（当前 ${row.stock}）` },
              ...row.skus.map((sku) => ({
                value: sku.id,
                label: `${sku.name || "默认规格"}（当前 ${sku.stock}）`,
              })),
            ]}
          />
        </Form.Item>
        <Form.Item
          name="delta"
          label="增减数量"
          extra="正数入库，负数出库；调整后不能小于 0"
          rules={[{ required: true, message: "请填写增减数量" }]}
        >
          <InputNumber min={-999999} max={999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="note" label="调整原因">
          <Input maxLength={200} placeholder="如 盘点补录 / 破损报损" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 分类
// ============================================================================

function CategoriesPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthGoodsCategoryRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.goodsCategories({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthGoodsCategoryRow) => {
    setBusy(true);
    try {
      await healthApi.goodsCategoryRemove({ body: { shopId, id: row.id } });
      message.success("分类已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthGoodsCategoryRow> = [
    {
      title: "分类名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "上级分类",
      dataIndex: "parentId",
      width: 160,
      render: (value: number) =>
        value > 0 ? rows.find((item) => item.id === value)?.name ?? `#${value}` : "顶级分类",
    },
    {
      title: "图标",
      dataIndex: "icon",
      width: 220,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    { title: "排序", dataIndex: "sort", width: 80 },
    { title: "商品数", dataIndex: "goodsCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后该分类下的商品变为未分类。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="商品分类"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">小程序商城按分类组织商品，支持两级</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增分类
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthGoodsCategoryRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 940 }}
      />

      <CategoryModal
        shopId={shopId}
        rows={rows}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type CategoryFormValues = {
  name: string;
  parentId: number;
  icon: string;
  sort: number;
  status: string;
};

function CategoryModal({
  shopId,
  rows,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  rows: HealthGoodsCategoryRow[];
  editing: HealthGoodsCategoryRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CategoryFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      parentId: row?.parentId ?? 0,
      icon: row?.icon ?? "",
      sort: row?.sort ?? 0,
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const parentOptions = [
    { value: 0, label: "顶级分类" },
    ...rows
      .filter((item) => item.id !== row?.id)
      .map((item) => ({ value: item.id, label: item.name })),
  ];

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.goodsCategorySave({
        body: {
          shopId,
          id: row?.id ?? 0,
          parentId: Number(values.parentId ?? 0),
          name: values.name,
          icon: values.icon ?? "",
          sort: Number(values.sort ?? 0),
          status: (values.status ?? "ON") as HealthGoodsCategoryRow["status"],
        },
      });
      message.success(row ? "分类已保存" : "分类已创建");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑分类「${row.name}」` : "新增分类"}
      width={520}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="分类名称"
          rules={[{ required: true, message: "请填写分类名称" }]}
        >
          <Input maxLength={40} placeholder="如 家用器械" />
        </Form.Item>
        <Form.Item name="parentId" label="上级分类">
          <Select options={parentOptions} />
        </Form.Item>
        <Form.Item name="icon" label="图标地址" extra="小程序端分类入口的图标，可留空">
          <Input maxLength={500} placeholder="https://…" />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item name="sort" label="排序值" extra="越小越靠前">
            <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 药品字典
// ============================================================================

function DrugsPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [rxOnly, setRxOnly] = useState(0);
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthDrugRow | "new" | null>(null);
  const resource = useHealthResource(
    () =>
      healthApi.drugs({
        query: { shopId, page, pageSize: PAGE_SIZE, keyword, prescriptionOnly: rxOnly, status },
      }),
    [shopId, page, keyword, rxOnly, status],
    shopId > 0,
  );
  const rows = resource.data?.list ?? [];

  const remove = async (row: HealthDrugRow) => {
    setBusy(true);
    try {
      await healthApi.drugRemove({ body: { shopId, id: row.id } });
      message.success("药品已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthDrugRow> = [
    {
      title: "通用名",
      dataIndex: "genericName",
      width: 200,
      render: (value: string, row) => (
        <div>
          <strong>{value}</strong>
          {row.brandName ? <div className="muted text-12">{row.brandName}</div> : null}
        </div>
      ),
    },
    { title: "规格", dataIndex: "spec", width: 140, render: (value: string) => value || "—" },
    { title: "单位", dataIndex: "unit", width: 80, render: (value: string) => value || "—" },
    {
      title: "生产厂家",
      dataIndex: "manufacturer",
      width: 200,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "批准文号",
      dataIndex: "approvalNo",
      width: 160,
      render: (value: string) => value || "—",
    },
    {
      title: "处方标记",
      dataIndex: "prescriptionRequired",
      width: 110,
      render: (value: boolean, row) => (
        <Tag color={value ? "volcano" : "green"}>{value ? "处方药" : row.otcClass || "非处方"}</Tag>
      ),
    },
    { title: "分类", dataIndex: "category", width: 120, render: (value: string) => value || "—" },
    { title: "价格", dataIndex: "priceCents", width: 100, render: (value: number) => cny(value) },
    { title: "库存", dataIndex: "stock", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后已关联该药品的商品会失去处方标记来源。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="药品字典"
      titleBadge={resource.data ? `${resource.data.total}` : undefined}
      titleExtra={
        <span className="muted text-12">处方药下单会校验就诊人的有效处方，无处方不可下单</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增药品
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">搜索</span>
          <Input.Search
            allowClear
            placeholder="通用名"
            style={{ width: 200 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">处方标记</span>
          <Select
            value={rxOnly}
            style={{ width: 140 }}
            onChange={(value: number) => {
              setRxOnly(value);
              setPage(1);
            }}
            options={[
              { value: 0, label: "全部药品" },
              { value: 1, label: "仅处方药" },
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">启用状态</span>
          <Select
            value={status}
            style={{ width: 130 }}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={[{ value: "all", label: "全部状态" }, ...STATUS_OPTIONS]}
          />
        </div>
      </FilterBar>

      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthDrugRow>
        rows={rows}
        columns={columns}
        total={resource.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={resource.loading || busy}
        onPage={(next) => setPage(next)}
        scroll={{ x: 1420 }}
      />

      <DrugModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type DrugFormValues = {
  genericName: string;
  brandName: string;
  spec: string;
  unit: string;
  manufacturer: string;
  approvalNo: string;
  prescriptionRequired: boolean;
  otcClass: string;
  category: string;
  priceYuan: number;
  stock: number;
  intro: string;
  status: string;
};

function DrugModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthDrugRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DrugFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      genericName: row?.genericName ?? "",
      brandName: row?.brandName ?? "",
      spec: row?.spec ?? "",
      unit: row?.unit ?? "盒",
      manufacturer: row?.manufacturer ?? "",
      approvalNo: row?.approvalNo ?? "",
      prescriptionRequired: row?.prescriptionRequired ?? false,
      otcClass: row?.otcClass ?? "",
      category: row?.category ?? "",
      priceYuan: centsToYuan(row?.priceCents),
      stock: row?.stock ?? 0,
      intro: row?.intro ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.drugSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          genericName: values.genericName,
          brandName: values.brandName ?? "",
          spec: values.spec ?? "",
          unit: values.unit ?? "盒",
          manufacturer: values.manufacturer ?? "",
          approvalNo: values.approvalNo ?? "",
          prescriptionRequired: Boolean(values.prescriptionRequired),
          otcClass: values.otcClass ?? "",
          category: values.category ?? "",
          priceCents: yuanToCents(values.priceYuan),
          stock: Number(values.stock ?? 0),
          intro: values.intro ?? "",
          status: (values.status ?? "ON") as HealthDrugRow["status"],
        },
      });
      message.success(row ? "药品已保存" : "药品已创建，可关联到商品");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑药品「${row.genericName}」` : "新增药品"}
      width={720}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="genericName"
            label="通用名"
            rules={[{ required: true, message: "请填写药品通用名" }]}
          >
            <Input maxLength={120} placeholder="如 阿莫西林胶囊" />
          </Form.Item>
          <Form.Item name="brandName" label="商品名">
            <Input maxLength={120} placeholder="如 阿莫仙" />
          </Form.Item>
          <Form.Item name="spec" label="规格">
            <Input maxLength={60} placeholder="如 0.25g×24 粒" />
          </Form.Item>
          <Form.Item name="unit" label="单位">
            <Input maxLength={16} placeholder="如 盒 / 瓶" />
          </Form.Item>
          <Form.Item name="manufacturer" label="生产厂家">
            <Input maxLength={120} placeholder="如 某某制药有限公司" />
          </Form.Item>
          <Form.Item name="approvalNo" label="批准文号">
            <Input maxLength={64} placeholder="如 国药准字 H12345678" />
          </Form.Item>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Form.Item
            name="prescriptionRequired"
            label="处方药"
            valuePropName="checked"
            extra="处方药下单校验有效处方"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="otcClass" label="非处方分类" extra="如 甲类 OTC / 乙类 OTC，可留空">
            <Input maxLength={20} placeholder="按处方标记自动" />
          </Form.Item>
          <Form.Item name="category" label="药理分类">
            <Input maxLength={40} placeholder="如 抗生素 / 降压药" />
          </Form.Item>
          <Form.Item name="priceYuan" label="价格（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="stock" label="库存">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="intro" label="说明">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="适应症、用法用量与禁忌" />
        </Form.Item>
        <div className="muted text-12">
          关联药品的商品会自动带出处方标记；处方药在小程序端下单时校验就诊人的有效处方，无有效处方不能提交。
        </div>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 快递公司
// ============================================================================

function ExpressPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthExpressCompanyRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.expressCompanies({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthExpressCompanyRow) => {
    setBusy(true);
    try {
      await healthApi.expressRemove({ body: { shopId, id: row.id } });
      message.success("快递公司已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthExpressCompanyRow> = [
    {
      title: "快递公司",
      dataIndex: "name",
      width: 220,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: "编码", dataIndex: "code", width: 140, render: (value: string) => value || "—" },
    { title: "客服电话", dataIndex: "phone", width: 180, render: (value: string) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后发货不能再选这家公司，历史发货单不受影响。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="快递公司"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={<span className="muted text-12">商品订单发货时从这里选择承运公司</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增快递公司
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthExpressCompanyRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 800 }}
      />

      <ExpressModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ExpressFormValues = { name: string; code: string; phone: string; status: string };

function ExpressModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthExpressCompanyRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ExpressFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      code: row?.code ?? "",
      phone: row?.phone ?? "",
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.expressSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          code: values.code ?? "",
          phone: values.phone ?? "",
          status: (values.status ?? "ON") as HealthExpressCompanyRow["status"],
        },
      });
      message.success(row ? "快递公司已保存" : "快递公司已创建");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑快递公司「${row.name}」` : "新增快递公司"}
      width={480}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="快递公司名称"
          rules={[{ required: true, message: "请填写快递公司名称" }]}
        >
          <Input maxLength={60} placeholder="如 顺丰速运" />
        </Form.Item>
        <Form.Item name="code" label="公司编码" extra="对接物流轨迹时使用，可留空">
          <Input maxLength={40} placeholder="如 SF" />
        </Form.Item>
        <Form.Item name="phone" label="客服电话">
          <Input maxLength={32} placeholder="顾客查件时可拨打" />
        </Form.Item>
        <Form.Item name="status" label="启用状态">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// 运费模板
// ============================================================================

function ShippingPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthShippingTemplateRow | "new" | null>(null);
  const resource = useHealthResource(
    () => healthApi.shippingTemplates({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const rows = resource.data ?? [];

  const remove = async (row: HealthShippingTemplateRow) => {
    setBusy(true);
    try {
      await healthApi.shippingTemplateRemove({ body: { shopId, id: row.id } });
      message.success("运费模板已删除");
      await resource.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthShippingTemplateRow> = [
    {
      title: "模板名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "包邮门槛",
      dataIndex: "freeOverCents",
      width: 130,
      render: (value: number) => (value > 0 ? `满 ${cny(value)}` : "不包邮"),
    },
    {
      title: "默认首费",
      dataIndex: "firstFeeCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    {
      title: "默认续费",
      dataIndex: "additionalFeeCents",
      width: 120,
      render: (value: number) => cny(value),
    },
    {
      title: "偏远地区",
      dataIndex: "regions",
      width: 280,
      render: (value: HealthShippingTemplateRow["regions"]) =>
        value.length
          ? `${value.length} 个：${value
              .slice(0, 4)
              .map((item) => item.province)
              .join("、")}${value.length > 4 ? "…" : ""}`
          : "未单独设置",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      width: 160,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除后引用该模板的商品需重新选择运费方式。"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="运费模板"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      titleExtra={
        <span className="muted text-12">默认首重/续费之外，可给偏远省份单独加收</span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新增运费模板
        </Button>
      }
    >
      {resource.error ? <LoadError text={resource.error} /> : null}
      <DataTable<HealthShippingTemplateRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={resource.loading || busy}
        scroll={{ x: 1000 }}
      />

      <ShippingModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing(null)}
        onDone={() => void resource.reload()}
      />
    </Panel>
  );
}

type ShippingFormValues = {
  name: string;
  freeOverYuan: number;
  firstFeeYuan: number;
  additionalFeeYuan: number;
  regions: { province: string; firstFeeYuan: number; additionalFeeYuan: number }[];
  status: string;
};

function ShippingModal({
  shopId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthShippingTemplateRow | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ShippingFormValues>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: row?.name ?? "",
      freeOverYuan: centsToYuan(row?.freeOverCents),
      firstFeeYuan: centsToYuan(row?.firstFeeCents),
      additionalFeeYuan: centsToYuan(row?.additionalFeeCents),
      regions: (row?.regions ?? []).map((item) => ({
        province: item.province,
        firstFeeYuan: centsToYuan(item.firstFeeCents),
        additionalFeeYuan: centsToYuan(item.additionalFeeCents),
      })),
      status: row?.status ?? "ON",
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.shippingTemplateSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          freeOverCents: yuanToCents(values.freeOverYuan),
          firstFeeCents: yuanToCents(values.firstFeeYuan),
          additionalFeeCents: yuanToCents(values.additionalFeeYuan),
          regions: (values.regions ?? [])
            .filter((item) => (item?.province ?? "").trim())
            .map((item) => ({
              province: item.province.trim(),
              firstFeeCents: yuanToCents(item.firstFeeYuan),
              additionalFeeCents: yuanToCents(item.additionalFeeYuan),
            })),
          status: (values.status ?? "ON") as HealthShippingTemplateRow["status"],
        },
      });
      message.success(row ? "运费模板已保存" : "运费模板已创建");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑运费模板「${row.name}」` : "新增运费模板"}
      width={720}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: "请填写模板名称" }]}
          >
            <Input maxLength={40} placeholder="如 全国快递默认" />
          </Form.Item>
          <Form.Item name="status" label="启用状态">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="freeOverYuan" label="包邮门槛（元）" extra="0 表示不包邮">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="firstFeeYuan" label="首件运费（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="additionalFeeYuan" label="续件运费（元）">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Form.Item label="偏远地区加收" extra="按省份单独设置首费与续费，最多 40 条">
          <Form.List name="regions">
            {(fields, { add, remove }) => (
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" wrap>
                    <Form.Item
                      name={[field.name, "province"]}
                      style={{ marginBottom: 0, width: 180 }}
                      rules={[{ required: true, message: "请填写省份" }]}
                    >
                      <Input maxLength={30} placeholder="省份，如 新疆" />
                    </Form.Item>
                    <Form.Item name={[field.name, "firstFeeYuan"]} style={{ marginBottom: 0 }}>
                      <InputNumber
                        min={0}
                        precision={2}
                        placeholder="首费（元）"
                        style={{ width: 130 }}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, "additionalFeeYuan"]} style={{ marginBottom: 0 }}>
                      <InputNumber
                        min={0}
                        precision={2}
                        placeholder="续费（元）"
                        style={{ width: 130 }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ province: "", firstFeeYuan: 0, additionalFeeYuan: 0 })}
                  disabled={fields.length >= 40}
                >
                  添加地区
                </Button>
              </div>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}
