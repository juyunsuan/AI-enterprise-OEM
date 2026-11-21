import { clampCents } from './money';

/**
 * 商品中台：形态注册、规格组合展开、SKU 价格与库存汇总、上架前的超卖拦截。
 *
 * 「形态」在这里是可注册的描述符而不是写死的枚举：品牌商城只有实物与虚拟，
 * 多店铺商城平台二期把卡密、上门服务也注册进来，交易与售后代码不用改分支。
 */

export interface ProductTypeDescriptor {
  /** 落库的类型串，与业务契约的枚举一致。 */
  key: string;
  label: string;
  /** 是否占用物流：决定运费与状态机里的发货段。 */
  requiresShipping: boolean;
  /** 是否按库存扣减：虚拟与卡密的库存语义不同，交给业务自行维护。 */
  stockManaged: boolean;
}

export const BASE_PRODUCT_TYPES: readonly ProductTypeDescriptor[] = [
  {
    key: 'NORMAL',
    label: '实物商品',
    requiresShipping: true,
    stockManaged: true,
  },
  {
    key: 'VIRTUAL',
    label: '虚拟商品',
    requiresShipping: false,
    stockManaged: false,
  },
] as const;

export const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
} as const;
export type ProductStatus =
  (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: '草稿',
  OFFLINE: '已下架',
  ONLINE: '销售中',
};

/** 批量操作一次最多处理的条数，与列表页的勾选上限同源。 */
export const PRODUCT_BATCH_LIMIT = 200;

export interface ProductTypeRegistry {
  list(): ProductTypeDescriptor[];
  descriptor(type: string): ProductTypeDescriptor;
  requiresShipping(type: string): boolean;
  stockManaged(type: string): boolean;
}

/**
 * 业务在基础形态之外追加自己的形态；同 key 以业务注册为准，
 * 未登记的类型一律按「需要发货、占用库存」处理，宁可多算运费也不漏算。
 */
export function createProductTypeRegistry(
  extra: ProductTypeDescriptor[] = [],
): ProductTypeRegistry {
  const map = new Map<string, ProductTypeDescriptor>([
    ...BASE_PRODUCT_TYPES.map((item) => [item.key, item] as const),
    ...extra.map((item) => [item.key, item] as const),
  ]);
  const fallback: ProductTypeDescriptor = {
    key: 'NORMAL',
    label: '未知形态',
    requiresShipping: true,
    stockManaged: true,
  };
  const descriptor = (type: string): ProductTypeDescriptor =>
    map.get(String(type || '')) || fallback;
  return {
    list: () => [...map.values()],
    descriptor,
    requiresShipping: (type) => descriptor(type).requiresShipping,
    stockManaged: (type) => descriptor(type).stockManaged,
  };
}

export interface ProductSpecGroup {
  name: string;
  values: string[];
}

export interface SkuMatrixResult {
  combinations: Record<string, string>[];
  /** 超限截断时的说明，界面据此提示店主合并规格。 */
  reason: string;
}

/**
 * 规格笛卡尔积，按规格组的录入顺序展开，最多 100 个 SKU。
 * 顺序稳定是「重存规格不产生新 SKU」的前提，配合 ident 的 skuUniqueId 使用。
 */
export function generateSkuMatrix(
  specs: ProductSpecGroup[],
  limit = 100,
): SkuMatrixResult {
  const groups = specs
    .map((group) => ({
      name: String(group.name || '').trim(),
      values: [
        ...new Set(
          (group.values || [])
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ],
    }))
    .filter((group) => group.name !== '' && group.values.length > 0);
  if (groups.length === 0) {
    return { combinations: [], reason: '' };
  }
  let rows: Record<string, string>[] = [{}];
  for (const group of groups) {
    const next: Record<string, string>[] = [];
    for (const row of rows) {
      for (const value of group.values) {
        next.push({ ...row, [group.name]: value });
      }
    }
    rows = next;
  }
  const max = Math.max(1, Math.round(limit));
  if (rows.length > max) {
    return {
      combinations: rows.slice(0, max),
      reason: `规格组合共 ${rows.length} 个，超过上限 ${max} 个，已截断，请合并或删减规格值`,
    };
  }
  return { combinations: rows, reason: '' };
}

export interface SkuRollupRow {
  priceCents: number;
  stock: number;
  enabled: boolean;
}

export interface SkuRollup {
  /** 商品列表展示价：启用 SKU 的最低价（分）。 */
  minPriceCents: number;
  totalStock: number;
  enabledCount: number;
}

/** 多规格商品的价与库存回写口径：只统计启用的 SKU。 */
export function rollupSkus(rows: SkuRollupRow[]): SkuRollup {
  const enabled = rows.filter((row) => row.enabled);
  if (enabled.length === 0)
    return { minPriceCents: 0, totalStock: 0, enabledCount: 0 };
  return {
    minPriceCents: Math.min(
      ...enabled.map((row) => clampCents(row.priceCents)),
    ),
    totalStock: enabled.reduce(
      (sum, row) => sum + Math.max(0, Math.round(row.stock || 0)),
      0,
    ),
    enabledCount: enabled.length,
  };
}

/** 单行成交价：有 SKU 用 SKU 价，否则用商品价，一律不认端上传的金额。 */
export function resolveUnitCents(
  skuPriceCents: number | null | undefined,
  productPriceCents: number,
): number {
  const sku =
    skuPriceCents === null || skuPriceCents === undefined
      ? null
      : clampCents(skuPriceCents);
  return sku === null ? clampCents(productPriceCents) : sku;
}

export interface OnlineGuardInput {
  id: number;
  type: string;
  stock: number;
}

export interface OnlineGuardResult {
  ok: boolean;
  ids: number[];
  reason: string;
}

/**
 * 上架前的超卖拦截：占用库存的形态必须有余量，否则顾客拍下会超卖。
 * 与实现保持同一句提示文案，前端不需要再拼一遍。
 */
export function blockZeroStockOnline(
  products: OnlineGuardInput[],
  registry: ProductTypeRegistry,
): OnlineGuardResult {
  const blocked = products
    .filter(
      (item) =>
        registry.stockManaged(item.type) && Math.round(item.stock || 0) <= 0,
    )
    .map((item) => item.id);
  if (blocked.length === 0) return { ok: true, ids: [], reason: '' };
  return {
    ok: false,
    ids: blocked,
    reason: `${blocked.length} 个商品库存为 0，上架后顾客拍下会超卖，请先补库存`,
  };
}

/** 批量入参归一化：去重、去非正数、夹到批量上限（默认商品批量上限）。 */
export function normalizeProductIds(
  ids: unknown,
  limit: number = PRODUCT_BATCH_LIMIT,
): number[] {
  const list = Array.isArray(ids) ? ids : [ids];
  const cleaned = [
    ...new Set(
      list
        .map((id) => Math.round(Number(id)))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  return cleaned.slice(0, Math.max(1, Math.round(limit)));
}
