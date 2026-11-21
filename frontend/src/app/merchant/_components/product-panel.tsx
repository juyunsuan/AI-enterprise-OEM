"use client";

import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MpMerchantOptions,
  MpProduct,
  MpProductDetail,
  MpProductSpec,
  MpSkuSaveBody,
} from "@enterprise/contracts";
import {
  MP_PRODUCT_STATUS_LABELS,
  MP_PRODUCT_TYPES,
} from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { ImageUrlField, ImageUrlsField } from "@/components/ui/image-field";
import { Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "default",
  PENDING: "gold",
  ONLINE: "green",
  OFFLINE: "default",
  REJECTED: "red",
};

const TYPE_LABELS: Record<string, string> = {
  NORMAL: "实物商品",
  VIRTUAL: "虚拟商品",
};

type SpecDraft = { name: string; values: string[] };
type SkuDraft = MpSkuSaveBody & { key: string };

/** 规格值拼组合键：与后端 uniqueId 同口径，仅用于编辑期对齐同一组合。 */
function comboKey(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((name) => `${name}:${values[name]?.trim() ?? ""}`)
    .join("|");
}

function cartesian(specs: SpecDraft[]): Record<string, string>[] {
  return specs
    .filter((spec) => spec.name.trim() && spec.values.length > 0)
    .reduce<Record<string, string>[]>(
      (acc, spec) =>
        acc.flatMap((combo) =>
          spec.values.map((value) => ({ ...combo, [spec.name.trim()]: value })),
        ),
      [{}],
    );
}

function skuOf(detail: MpProductDetail): SkuDraft[] {
  return detail.skus.map((sku) => ({
    key: comboKey(sku.specValues) || sku.skuName || String(sku.id),
    id: sku.id,
    skuName: sku.skuName,
    image: sku.image,
    specValues: sku.specValues,
    price: sku.price,
    marketPrice: sku.marketPrice,
    costPrice: sku.costPrice,
    stock: sku.stock,
    weight: sku.weight,
    barcode: sku.barcode,
    enabled: sku.enabled,
  }));
}

/**
 * 商户商品台账：保存即退回草稿，必须送审并由市场运营方通过后才在买家端可见。
 * 多规格走「规格 → 组合」生成 SKU 行；单规格时价格与库存直接用商品上的值。
 */
export function ProductPanel({
  categories,
  workspaceReady,
}: {
  categories: MpMerchantOptions["categories"];
  workspaceReady: boolean;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!workspaceReady) return;
    setLoading(true);
    try {
      const result = await mpMerchantApi.products({
        page,
        pageSize,
        keyword,
        status,
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商品读取失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceReady, page, pageSize, keyword, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await run();
      message.success(done);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<MpProduct> = [
    {
      title: "商品",
      dataIndex: "title",
      render: (_, row) => (
        <Space align="start">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 6,
              overflow: "hidden",
              background: "#fafafa",
              flexShrink: 0,
            }}
          >
            {row.coverImage ? (
              <RawImg
                src={row.coverImage}
                alt={row.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </div>
          <div>
            <div>{row.title}</div>
            <div className="text-12 muted">
              {row.categoryName || "未选类目"} · {TYPE_LABELS[row.type] ?? row.type}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "价格 / 库存",
      dataIndex: "price",
      width: 150,
      render: (_, row) => (
        <div>
          <div>¥{row.price.toFixed(2)}</div>
          <div className="text-12 muted">
            库存 {row.stock} · 已售 {row.sales}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={STATUS_COLOR[row.status]}>
            {MP_PRODUCT_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
          {row.auditNote ? (
            <Tooltip title={row.auditNote}>
              <span className="text-12 muted">驳回原因</span>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 180,
      render: (value: string) => value || "-",
    },
    {
      title: "操作",
      key: "actions",
      width: 260,
      render: (_, row) => (
        <Space size={4} wrap>
          <Button
            size="small"
            type="link"
            disabled={row.status === "PENDING"}
            onClick={() => setEditing(row.id)}
          >
            编辑
          </Button>
          {row.status !== "ONLINE" && row.status !== "PENDING" ? (
            <Button
              size="small"
              type="link"
              disabled={busy}
              onClick={() =>
                void act(() => mpMerchantApi.productSubmit(row.id), "已提交审核")
              }
            >
              送审
            </Button>
          ) : null}
          {row.status === "ONLINE" ? (
            <Button
              size="small"
              type="link"
              disabled={busy}
              onClick={() =>
                void act(
                  () => mpMerchantApi.productStatus({ id: row.id, status: "OFFLINE" }),
                  "商品已下架",
                )
              }
            >
              下架
            </Button>
          ) : null}
          {row.status === "OFFLINE" ? (
            <Button
              size="small"
              type="link"
              disabled={busy}
              onClick={() =>
                void act(
                  () => mpMerchantApi.productStatus({ id: row.id, status: "ONLINE" }),
                  "商品已上架",
                )
              }
            >
              上架
            </Button>
          ) : null}
          {row.status !== "ONLINE" && row.status !== "PENDING" ? (
            <Popconfirm
              title="删除后不可恢复，确认删除该商品？"
              onConfirm={() =>
                void act(() => mpMerchantApi.productRemove(row.id), "商品已删除")
              }
            >
              <Button size="small" type="link" danger disabled={busy}>
                删除
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Panel title="商品台账">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="商品标题"
          style={{ width: 240 }}
          onSearch={(value) => {
            setPage(1);
            setKeyword(value.trim());
          }}
        />
        <Select
          allowClear
          placeholder="商品状态"
          style={{ width: 140 }}
          value={status || undefined}
          onChange={(value) => {
            setPage(1);
            setStatus(value ?? "");
          }}
          options={Object.entries(MP_PRODUCT_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Button
          type="primary"
          disabled={!workspaceReady}
          onClick={() => setEditing(0)}
        >
          新建商品
        </Button>
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
        保存后商品回到草稿并需要重新送审；审核中不能编辑，驳回原因见状态列。
      </div>
      <ProductDrawer
        open={editing !== null}
        productId={editing ?? 0}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </Panel>
  );
}

type ProductForm = {
  categoryId: number;
  title: string;
  subtitle: string;
  type: string;
  price: number;
  marketPrice: number;
  costPrice: number;
  stock: number;
  unit: string;
  weight: number;
  freightAmount: number;
  coverImage: string;
  images: string[];
  detail: string;
  guarantee: string[];
};

function ProductDrawer({
  open,
  productId,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: number;
  categories: MpMerchantOptions["categories"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProductForm>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [specs, setSpecs] = useState<SpecDraft[]>([]);
  const [skus, setSkus] = useState<SkuDraft[]>([]);
  const [loadedId, setLoadedId] = useState(0);

  const categoryOptions = useMemo(() => {
    const names = new Map(categories.map((item) => [item.id, item.name]));
    return categories.map((item) => ({
      value: item.id,
      label: item.parentId ? `　${names.get(item.parentId) ?? ""} / ${item.name}` : item.name,
    }));
  }, [categories]);

  const reset = useCallback(() => {
    form.setFieldsValue({
      categoryId: 0,
      title: "",
      subtitle: "",
      type: "NORMAL",
      price: 0,
      marketPrice: 0,
      costPrice: 0,
      stock: 0,
      unit: "件",
      weight: 0,
      freightAmount: 0,
      coverImage: "",
      images: [],
      detail: "",
      guarantee: [],
    });
    setSpecs([]);
    setSkus([]);
    setLoadedId(0);
  }, [form]);

  useEffect(() => {
    if (!open) return;
    if (productId === 0) {
      reset();
      return;
    }
    let alive = true;
    setLoading(true);
    void mpMerchantApi
      .productDetail(productId)
      .then((detail) => {
        if (!alive || !detail) return;
        form.setFieldsValue({
          categoryId: detail.product.categoryId,
          title: detail.product.title,
          subtitle: detail.product.subtitle,
          type: detail.product.type,
          price: detail.product.price,
          marketPrice: detail.product.marketPrice,
          costPrice: detail.product.costPrice,
          stock: detail.product.stock,
          unit: detail.product.unit || "件",
          weight: detail.product.weight,
          freightAmount: detail.product.freightAmount,
          coverImage: detail.product.coverImage,
          images: detail.product.images,
          detail: detail.product.detail,
          guarantee: detail.product.guarantee,
        });
        const nextSpecs = detail.product.specs.map((spec) => ({
          name: spec.name,
          values: [...spec.values],
        }));
        setSpecs(nextSpecs);
        setSkus(skuOf(detail));
        setLoadedId(detail.product.id);
      })
      .catch((cause) => {
        message.error(cause instanceof Error ? cause.message : "商品读取失败");
        onClose();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, productId, form, message, onClose, reset]);

  useEffect(() => {
    if (!open) return;
    const combos = cartesian(specs);
    if (combos.length === 0) {
      setSkus([]);
      return;
    }
    setSkus((previous) => {
      const index = new Map(previous.map((sku) => [sku.key, sku]));
      return combos.map((values) => {
        const key = comboKey(values);
        const old = index.get(key);
        return old
          ? { ...old, key }
          : {
              key,
              id: 0,
              skuName: Object.values(values).join(" "),
              image: "",
              specValues: values,
              price: Number(form.getFieldValue("price")) || 0,
              marketPrice: 0,
              costPrice: 0,
              stock: 0,
              weight: 0,
              barcode: "",
              enabled: true,
            };
      });
    });
  }, [specs, open, form]);

  const patchSku = (key: string, patch: Partial<SkuDraft>) =>
    setSkus((previous) =>
      previous.map((sku) => (sku.key === key ? { ...sku, ...patch } : sku)),
    );

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const cleanSpecs: MpProductSpec[] = specs
        .map((spec) => ({ name: spec.name.trim(), values: spec.values }))
        .filter((spec) => spec.name && spec.values.length > 0);
      await mpMerchantApi.productSave({
        id: loadedId,
        categoryId: values.categoryId ?? 0,
        title: values.title,
        subtitle: values.subtitle ?? "",
        coverImage: values.coverImage ?? "",
        images: values.images ?? [],
        detail: values.detail ?? "",
        type: values.type as "NORMAL" | "VIRTUAL",
        price: values.price ?? 0,
        marketPrice: values.marketPrice ?? 0,
        costPrice: values.costPrice ?? 0,
        stock: values.stock ?? 0,
        unit: values.unit ?? "件",
        weight: values.weight ?? 0,
        freightAmount: values.freightAmount ?? 0,
        specs: cleanSpecs,
        guarantee: values.guarantee ?? [],
        skus: skus.map((sku) => ({
          id: sku.id,
          skuName: sku.skuName,
          image: sku.image,
          specValues: sku.specValues,
          price: sku.price,
          marketPrice: sku.marketPrice,
          costPrice: sku.costPrice,
          stock: sku.stock,
          weight: sku.weight,
          barcode: sku.barcode,
          enabled: sku.enabled,
        })),
      });
      message.success("商品已保存为草稿，提交审核后买家端可见");
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      size={880}
      destroyOnHidden
      onClose={onClose}
      title={productId ? "编辑商品" : "新建商品"}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" disabled={loading}>
        <Form.Item
          name="title"
          label="商品标题"
          rules={[{ required: true, message: "请填写商品标题" }]}
        >
          <Input maxLength={200} placeholder="买家在小程序里看到的第一行字" />
        </Form.Item>
        <Form.Item name="subtitle" label="副标题">
          <Input maxLength={200} placeholder="卖点一句话，可留空" />
        </Form.Item>
        <Space size={12} wrap>
          <Form.Item name="categoryId" label="类目" style={{ minWidth: 220 }}>
            <Select
              allowClear
              placeholder="选择平台类目"
              options={categoryOptions}
              onChange={(value) => form.setFieldValue("categoryId", value ?? 0)}
            />
          </Form.Item>
          <Form.Item name="type" label="商品类型">
            <Select
              options={MP_PRODUCT_TYPES.map((value) => ({
                value,
                label: TYPE_LABELS[value] ?? value,
              }))}
            />
          </Form.Item>
          <Form.Item name="unit" label="单位">
            <Input maxLength={20} style={{ width: 100 }} />
          </Form.Item>
        </Space>
        <Form.Item label="封面图">
          <Form.Item name="coverImage" noStyle>
            <ImageUrlField />
          </Form.Item>
        </Form.Item>
        <Form.Item label="轮播图">
          <Form.Item name="images" noStyle>
            <ImageUrlsField max={9} />
          </Form.Item>
        </Form.Item>
        <Space size={12} wrap>
          <Form.Item name="price" label="售价（元）">
            <InputNumber min={0} precision={2} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item name="marketPrice" label="划线价（元）">
            <InputNumber min={0} precision={2} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item name="costPrice" label="成本价（元，仅商户可见）">
            <InputNumber min={0} precision={2} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="stock" label="库存">
            <InputNumber min={0} precision={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="freightAmount" label="单件运费（元）">
            <InputNumber min={0} precision={2} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item name="weight" label="重量（kg）">
            <InputNumber min={0} precision={2} style={{ width: 120 }} />
          </Form.Item>
        </Space>
        <Form.Item label="服务承诺">
          <Form.Item name="guarantee" noStyle>
            <Select
              mode="tags"
              maxCount={10}
              placeholder="如：7天无理由 / 正品保障，回车添加"
              tokenSeparators={[",", "，"]}
            />
          </Form.Item>
        </Form.Item>
        <Form.Item name="detail" label="商品详情（纯文本，支持换行）">
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 12 }}
            maxLength={20000}
            showCount
            placeholder="材质、尺寸、售后说明等"
          />
        </Form.Item>

        <div className="text-12 muted" style={{ margin: "4px 0 8px" }}>
          规格最多 3 组；填了规格就按组合生成 SKU，商品价格与库存取 SKU 汇总。
        </div>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {specs.map((spec, index) => (
            <Space key={index} align="start" wrap>
              <Input
                value={spec.name}
                maxLength={30}
                placeholder="规格名（如 颜色）"
                style={{ width: 140 }}
                onChange={(event) =>
                  setSpecs((previous) =>
                    previous.map((item, position) =>
                      position === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <Select
                mode="tags"
                value={spec.values}
                placeholder="规格值，回车添加"
                style={{ minWidth: 280 }}
                tokenSeparators={[",", "，"]}
                onChange={(values: string[]) =>
                  setSpecs((previous) =>
                    previous.map((item, position) =>
                      position === index ? { ...item, values } : item,
                    ),
                  )
                }
              />
              <Button
                size="small"
                type="text"
                danger
                onClick={() => setSpecs((previous) => previous.filter((_, position) => position !== index))}
              >
                删除
              </Button>
            </Space>
          ))}
          <Button
            size="small"
            disabled={specs.length >= 3}
            onClick={() => setSpecs((previous) => [...previous, { name: "", values: [] }])}
          >
            添加规格
          </Button>
        </Space>

        {skus.length > 0 ? (
          <Table
            style={{ marginTop: 12 }}
            rowKey="key"
            size="small"
            dataSource={skus}
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              { title: "规格组合", dataIndex: "skuName", width: 180 },
              {
                title: "售价",
                dataIndex: "price",
                width: 120,
                render: (_, row) => (
                  <InputNumber
                    min={0}
                    precision={2}
                    value={row.price}
                    style={{ width: "100%" }}
                    onChange={(value) => patchSku(row.key, { price: Number(value) || 0 })}
                  />
                ),
              },
              {
                title: "库存",
                dataIndex: "stock",
                width: 110,
                render: (_, row) => (
                  <InputNumber
                    min={0}
                    precision={0}
                    value={row.stock}
                    style={{ width: "100%" }}
                    onChange={(value) => patchSku(row.key, { stock: Number(value) || 0 })}
                  />
                ),
              },
              {
                title: "启用",
                dataIndex: "enabled",
                width: 80,
                render: (_, row) => (
                  <Select
                    value={row.enabled ? 1 : 0}
                    style={{ width: 66 }}
                    options={[
                      { value: 1, label: "是" },
                      { value: 0, label: "否" },
                    ]}
                    onChange={(value) => patchSku(row.key, { enabled: value === 1 })}
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
