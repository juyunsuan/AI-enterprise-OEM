"use client";
import { Button, Input, Modal, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandCategoryTree, BrandCoupon, BrandProductRow } from "@enterprise/contracts";
import { moneyCny } from "@/lib/money";
import { useBrandCategories, useBrandCoupons, useBrandProducts } from "@/query/brand-mall";
import { StatusTag } from "../../_components/brand-common";

/**
 * 装修组件里的「按 id 选数据」选择器：商品列表选品、优惠券选券、链接选商品/券/分类。
 *
 * 装修 props 只存 id（C 端按 id 现查），所以回传的是 id 数组；
 * 链接对象还要存一个展示用的 name，单选时把标题一起带回去。
 */

type PickerRow = { id: number };

function PickerShell<T extends PickerRow>({
  open,
  title,
  rows,
  columns,
  loading,
  total,
  page,
  pageSize = 10,
  onPage,
  keyword,
  onKeyword,
  selected,
  onChange,
  multi,
  onOk,
  onCancel,
}: {
  open: boolean;
  title: string;
  rows: T[];
  columns: ColumnsType<T>;
  loading: boolean;
  total: number;
  page: number;
  pageSize?: number;
  onPage: (page: number) => void;
  keyword: string;
  onKeyword: (value: string) => void;
  selected: number[];
  onChange: (ids: number[]) => void;
  multi: boolean;
  onOk: (ids: number[], first: T | undefined) => void;
  onCancel: () => void;
}) {
  /** 翻页后仍要能取回标题（链接对象的 name），所以把见过的行都留着。 */
  const known = useRef(new Map<number, T>());
  useEffect(() => {
    for (const row of rows) known.current.set(row.id, row);
  }, [rows]);

  return (
    <Modal
      open={open}
      title={title}
      width={860}
      destroyOnHidden
      okText="确定"
      onCancel={onCancel}
      onOk={() => onOk(selected, known.current.get(selected[selected.length - 1] ?? 0))}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 240 }}
          placeholder="名称关键字"
          value={keyword}
          onChange={(event) => {
            onKeyword(event.target.value);
            onPage(1);
          }}
        />
        <span className="muted text-12">
          {multi
            ? `已选 ${selected.length} 项，翻页后选择仍保留`
            : "单选：点行选中，只保留最后一个"}
        </span>
      </Space>
      <Table<T>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ y: 320 }}
        rowSelection={{
          type: multi ? "checkbox" : "radio",
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          onChange: (keys) => onChange(keys.map(Number)),
        }}
        onRow={(record) => ({
          // 勾选列自己会走 onChange，行点击不再翻一次，否则点一下等于选了又取消。
          onClick: (event) => {
            if ((event.target as HTMLElement).closest(".ant-table-selection-column")) return;
            if (multi) {
              onChange(
                selected.includes(record.id)
                  ? selected.filter((id) => id !== record.id)
                  : [...selected, record.id],
              );
            } else {
              onChange([record.id]);
            }
          },
          style: { cursor: "pointer" },
        })}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: onPage,
        }}
      />
    </Modal>
  );
}

/**
 * 选择弹窗的临时勾选状态放在只在打开时挂载的内部组件里：
 * 每次打开都从外部已选值重新开始，不用同步 effect，也不会把上一次的残留带进来
 * （`selectedIds` 是渲染期新建的数组，进依赖数组会每帧重置掉用户刚勾的行）。
 */
export function ProductPickerModal(props: {
  open: boolean;
  shopId: number;
  selectedIds: number[];
  multi?: boolean;
  onOk: (ids: number[], label: string) => void;
  onCancel: () => void;
}) {
  return props.open ? <ProductPickerBody {...props} open /> : null;
}

function ProductPickerBody({
  open,
  shopId,
  selectedIds,
  multi = true,
  onOk,
  onCancel,
}: {
  open: boolean;
  shopId: number;
  selectedIds: number[];
  multi?: boolean;
  onOk: (ids: number[], label: string) => void;
  onCancel: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>(selectedIds);
  const query = useBrandProducts({ shopId }, { keyword: keyword.trim() || undefined }, page, 10);
  const rows = query.data?.list ?? [];

  const columns: ColumnsType<BrandProductRow> = [
    {
      title: "商品",
      dataIndex: "title",
      render: (_, row) => (
        <Space align="start">
          {row.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- OSS 直链域名随租户变化
            <img
              src={row.coverImage}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }}
            />
          ) : null}
          <div>
            <div>{row.title}</div>
            <div className="muted text-12">
              {row.categoryName || "未分类"} · 库存 {row.stock} · 销量 {row.sales}
            </div>
          </div>
        </Space>
      ),
    },
    { title: "价格", dataIndex: "price", width: 110, render: (value: number) => moneyCny(value) },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag kind="product" value={value} />,
    },
  ];

  return (
    <PickerShell<BrandProductRow>
      open={open}
      title="选择商品"
      rows={rows}
      columns={columns}
      loading={query.isFetching}
      total={query.data?.total ?? 0}
      page={page}
      onPage={setPage}
      keyword={keyword}
      onKeyword={setKeyword}
      selected={selected}
      onChange={setSelected}
      multi={multi}
      onOk={(ids, first) => onOk(ids, first?.title ?? "")}
      onCancel={onCancel}
    />
  );
}

export function CouponPickerModal(props: {
  open: boolean;
  shopId: number;
  selectedIds: number[];
  multi?: boolean;
  onOk: (ids: number[], label: string) => void;
  onCancel: () => void;
}) {
  return props.open ? <CouponPickerBody {...props} open /> : null;
}

function CouponPickerBody({
  open,
  shopId,
  selectedIds,
  multi = true,
  onOk,
  onCancel,
}: {
  open: boolean;
  shopId: number;
  selectedIds: number[];
  multi?: boolean;
  onOk: (ids: number[], label: string) => void;
  onCancel: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>(selectedIds);
  const query = useBrandCoupons({ shopId }, { keyword: keyword.trim() || undefined }, page, 10);
  const rows = query.data?.list ?? [];

  const columns: ColumnsType<BrandCoupon> = [
    {
      title: "券",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div className="muted text-12">
            {row.type === "DISCOUNT" ? `${row.value}% 折扣` : `减 ${moneyCny(row.value)}`} ·
            满 {moneyCny(row.threshold)} 可用 · 已领 {row.receivedCount}/{row.totalCount}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag kind="couponStatus" value={value} />,
    },
  ];

  return (
    <PickerShell<BrandCoupon>
      open={open}
      title="选择优惠券"
      rows={rows}
      columns={columns}
      loading={query.isFetching}
      total={query.data?.total ?? 0}
      page={page}
      onPage={setPage}
      keyword={keyword}
      onKeyword={setKeyword}
      selected={selected}
      onChange={setSelected}
      multi={multi}
      onOk={(ids, first) => onOk(ids, first?.name ?? "")}
      onCancel={onCancel}
    />
  );
}

/** 分类树拍平成带缩进的选项：商品列表按分类取数、链接跳分类都用它。 */
export function useCategoryOptions(shopId: number) {
  const query = useBrandCategories({ shopId });
  const options = useMemo(() => {
    const flat: { value: number; label: string; name: string }[] = [];
    const walk = (nodes: BrandCategoryTree[], depth: number) => {
      for (const node of nodes) {
        flat.push({
          value: node.id,
          label: `${"\u3000".repeat(depth)}${node.name}`,
          name: node.name,
        });
        walk(node.children ?? [], depth + 1);
      }
    };
    walk(query.data ?? [], 0);
    return flat;
  }, [query.data]);
  return { options, isError: query.isError, message: query.error?.message ?? "" };
}

export function CategorySelect({
  shopId,
  value,
  onChange,
  allowAll = false,
  placeholder = "选择分类",
}: {
  shopId: number;
  value: number;
  onChange: (id: number, name: string) => void;
  allowAll?: boolean;
  placeholder?: string;
}) {
  const { options } = useCategoryOptions(shopId);
  const list = allowAll
    ? [{ value: 0, label: "全部分类（一级）", name: "全部分类" }, ...options]
    : options;
  return (
    <Select
      showSearch
      optionFilterProp="label"
      placeholder={list.length ? placeholder : "分类读取中…"}
      style={{ width: "100%" }}
      value={value || undefined}
      onChange={(id: number) => {
        const hit = list.find((item) => item.value === id);
        onChange(id, hit?.name ?? "");
      }}
      options={list.map((item) => ({ value: item.value, label: item.label }))}
    />
  );
}

/** 商品/券的批量选择按钮：显示已选数量，点开表格弹窗。 */
export function IdsPickerButton({
  count,
  noun,
  onClick,
}: {
  count: number;
  noun: string;
  onClick: () => void;
}) {
  return (
    <Space wrap>
      <Button size="small" onClick={onClick}>
        {count ? `已选 ${count} ${noun}（修改）` : `选择${noun}`}
      </Button>
      {count ? (
        <span className="muted text-12">顺序不影响端上排序，端上按商品自身排序取</span>
      ) : null}
    </Space>
  );
}
