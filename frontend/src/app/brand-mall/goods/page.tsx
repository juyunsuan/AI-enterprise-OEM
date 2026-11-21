"use client";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BRAND_PRODUCT_STATUSES,
  BRAND_PRODUCT_STATUS_LABELS,
  BRAND_PRODUCT_TYPES,
  BRAND_PRODUCT_TYPE_LABELS,
  type BrandProductRow,
  type BrandProductStatus,
  type BrandProductType,
} from "@enterprise/contracts";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { useBrandCategories, useBrandGoodsActions, useBrandProducts } from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import { CategoryTree } from "../_components/category-tree";
import { ProductDrawer } from "../_components/product-drawer";
import { ReviewTable } from "../_components/review-table";
import { StatusTag, dash } from "../_components/brand-common";

/** 契约里 `sort` / `tag` 是内联枚举、没导出类型别名，这里按同口径声明。 */
type ProductSort = "DEFAULT" | "PRICE_ASC" | "PRICE_DESC" | "SALES_DESC" | "NEWEST";
type ProductTag = "isHot" | "isNew" | "isGood";

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "DEFAULT", label: "默认（分类内排序值）" },
  { value: "NEWEST", label: "最新创建" },
  { value: "PRICE_ASC", label: "价格从低到高" },
  { value: "PRICE_DESC", label: "价格从高到低" },
  { value: "SALES_DESC", label: "销量优先" },
];

const TAG_OPTIONS: { value: ProductTag; label: string }[] = [
  { value: "isHot", label: "热销" },
  { value: "isNew", label: "新品" },
  { value: "isGood", label: "精品" },
];

export default function BrandGoodsPage() {
  return (
    <BrandShell
      active="goods"
      title="商品管理"
      desc="左侧管分类（新建、改名、停用、上下移动），右侧管商品（筛选、批量上下架、复制、删除）。商品改动只更新本站数据，小程序端启动时拉最新配置，不用重新出包。"
    >
      <GoodsWorkbench />
    </BrandShell>
  );
}

function GoodsWorkbench() {
  const [tab, setTab] = useState("goods");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "goods", label: "商品与分类", children: <GoodsSection key="goods" /> },
        { key: "review", label: "顾客评价", children: <ReviewSection key="review" /> },
      ]}
    />
  );
}

function ReviewSection() {
  const { shopId, meta } = useBrandScope();
  return (
    <Panel title="顾客评价" desc-anchor="">
      <ReviewTable shopId={shopId} meta={meta} />
    </Panel>
  );
}

function GoodsSection() {
  const { message, modal } = App.useApp();
  const { shopId, meta } = useBrandScope();
  const params = useSearchParams();
  const categoriesQuery = useBrandCategories({ shopId });
  const actions = useBrandGoodsActions();

  const [categoryId, setCategoryId] = useState(0);
  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<ProductSort>("DEFAULT");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<{ open: boolean; productId: number }>({
    open: false,
    productId: 0,
  });

  // 空串 = 不筛；转成契约的可选枚举只在 filter 这一处发生。
  const filter = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      categoryId: categoryId || undefined,
      status: (status || undefined) as BrandProductStatus | undefined,
      type: (type || undefined) as BrandProductType | undefined,
      tag: (tag || undefined) as ProductTag | undefined,
      sort,
    }),
    [keyword, categoryId, status, type, tag, sort],
  );

  const query = useBrandProducts({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const filtered = Boolean(keyword.trim() || status || type || tag || categoryId);

  const setStatusBatch = async (ids: number[], next: BrandProductStatus) => {
    if (!ids.length) return;
    await actions.setProductStatus.mutateAsync({ body: { shopId, ids, status: next } });
    message.success(`已把 ${ids.length} 个商品改为「${BRAND_PRODUCT_STATUS_LABELS[next]}」`);
    setSelected([]);
  };

  const removeRows = (ids: number[]) => {
    modal.confirm({
      title: `删除 ${ids.length} 个商品`,
      content: "删除后小程序端立即不可见；已生成订单里保留商品快照，不受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeProducts.mutateAsync({ body: { shopId, ids } });
        message.success("商品已删除");
        setSelected([]);
      },
    });
  };

  const copyRows = async (ids: number[]) => {
    if (!ids.length) return;
    await actions.copyProducts.mutateAsync({ body: { shopId, ids } });
    message.success("已复制为草稿，改完标题再上架，避免同名商品");
    setSelected([]);
  };

  const columns: ColumnsType<BrandProductRow> = [
    {
      title: "商品",
      dataIndex: "title",
      width: 300,
      render: (_, row) => (
        <Space align="start">
          {row.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- OSS 直链域名随租户变化
            <img
              src={row.coverImage}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                background: "#fafafa",
                display: "inline-block",
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div>{row.title}</div>
            <div className="muted text-12">
              {dash(row.subtitle)} · 单位 {row.unit}
            </div>
            <Space size={2} wrap>
              {row.isHot ? <Tag color="red">热销</Tag> : null}
              {row.isNew ? <Tag color="green">新品</Tag> : null}
              {row.isGood ? <Tag color="gold">精品</Tag> : null}
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: "分类",
      dataIndex: "categoryName",
      width: 130,
      render: (value: string) => dash(value || "未分类"),
    },
    {
      title: "价格",
      dataIndex: "price",
      width: 120,
      render: (value: number, row) => (
        <div>
          <div>{moneyCny(value)}</div>
          {row.marketPrice > 0 ? (
            <span className="muted text-12" style={{ textDecoration: "line-through" }}>
              {moneyCny(row.marketPrice)}
            </span>
          ) : null}
        </div>
      ),
    },
    { title: "库存", dataIndex: "stock", width: 80 },
    { title: "销量", dataIndex: "sales", width: 80 },
    {
      title: "规格",
      dataIndex: "skuCount",
      width: 90,
      render: (value: number) => (value > 1 ? `${value} 个 SKU` : "单规格"),
    },
    {
      title: "评价",
      dataIndex: "reviewCount",
      width: 80,
      render: (value: number) => `${value} 条`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="product" value={value} />,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, productId: row.id })}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            loading={actions.setProductStatus.isPending}
            onClick={() =>
              void setStatusBatch([row.id], row.status === "ONLINE" ? "OFFLINE" : "ONLINE")
            }
          >
            {row.status === "ONLINE" ? "下架" : "上架"}
          </Button>
          <Button
            size="small"
            type="link"
            icon={<CopyOutlined aria-hidden />}
            onClick={() => void copyRows([row.id])}
          >
            复制
          </Button>
          <Button
            size="small"
            type="link"
            danger
            icon={<DeleteOutlined aria-hidden />}
            onClick={() => removeRows([row.id])}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 320, flexShrink: 0 }}>
        <CategoryTree shopId={shopId} selected={categoryId} onSelect={setCategoryId} />
      </div>
      <Panel
        title="商品列表"
        titleExtra={
          filtered ? (
            <span className="muted text-12">
              已按条件筛选
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setKeyword("");
                  setStatus("");
                  setType("");
                  setTag("");
                  setSort("DEFAULT");
                  setCategoryId(0);
                  setPage(1);
                }}
              >
                清除筛选
              </Button>
            </span>
          ) : null
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, productId: 0 })}
          >
            新建商品
          </Button>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            allowClear
            style={{ width: 220 }}
            prefix={<SearchOutlined aria-hidden />}
            placeholder="标题或副标题关键字"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="状态"
            value={status || undefined}
            onChange={(value) => {
              setStatus(value ?? "");
              setPage(1);
            }}
            options={BRAND_PRODUCT_STATUSES.map((value) => ({
              value,
              label: BRAND_PRODUCT_STATUS_LABELS[value],
            }))}
          />
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="类型"
            value={type || undefined}
            onChange={(value) => {
              setType(value ?? "");
              setPage(1);
            }}
            options={BRAND_PRODUCT_TYPES.map((value) => ({
              value,
              label: BRAND_PRODUCT_TYPE_LABELS[value],
            }))}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="标签"
            value={tag || undefined}
            onChange={(value) => {
              setTag(value ?? "");
              setPage(1);
            }}
            options={TAG_OPTIONS}
          />
          <Select
            style={{ width: 190 }}
            value={sort}
            onChange={(value) => {
              setSort(value);
              setPage(1);
            }}
            options={SORT_OPTIONS}
          />
        </Space>
        {selected.length ? (
          <Space wrap style={{ marginBottom: 12 }}>
            <span className="muted text-12">已选 {selected.length} 个</span>
            <Button size="small" onClick={() => void setStatusBatch(selected, "ONLINE")}>
              批量上架
            </Button>
            <Button size="small" onClick={() => void setStatusBatch(selected, "OFFLINE")}>
              批量下架
            </Button>
            <Button size="small" onClick={() => void copyRows(selected)}>
              批量复制
            </Button>
            <Button size="small" danger onClick={() => removeRows(selected)}>
              批量删除
            </Button>
          </Space>
        ) : null}
        <Table<BrandProductRow>
          rowKey="id"
          size="small"
          loading={query.isFetching}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1360 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map(Number)),
          }}
          locale={{
            emptyText: filtered ? (
              <EmptyState text="没有符合当前条件的商品，换个关键字或清除筛选试试" />
            ) : (
              <EmptyState
                text="还没有商品。先建分类，再录第一个商品，顾客才能在小程序里逛起来。"
                action={
                  <Button
                    type="primary"
                    icon={<PlusOutlined aria-hidden />}
                    onClick={() => setEditing({ open: true, productId: 0 })}
                  >
                    新建商品
                  </Button>
                }
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
        <ProductDrawer
          open={editing.open}
          shopId={shopId}
          productId={editing.productId}
          categories={categoriesQuery.data ?? []}
          onClose={() => setEditing({ open: false, productId: 0 })}
        />
      </Panel>
    </div>
  );
}
