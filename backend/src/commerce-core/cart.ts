import { clampCents } from './money';

/**
 * 购物车：只做与存储无关的行合并、勾选与计数。
 *
 * 单价与失效判定由业务侧现查商品表后传进来，购物车行本身不存价格快照——
 * 否则改价就要回写所有购物车，历史行还会带着旧价下单。
 */

export const CART_LIMITS = {
  /** 单个顾客的购物车行数上限，与结算一次最多处理的行数同源。 */
  maxRows: 50,
  maxQuantity: 999,
  minQuantity: 1,
} as const;

export interface CartRow {
  productId: number;
  skuId: number;
  quantity: number;
  selected: boolean;
}

export interface CartRowPrice {
  unitCents: number;
  totalCents: number;
  valid: boolean;
  invalidReason: string;
}

export function cartRowKey(row: { productId: number; skuId: number }): string {
  return `${Math.round(Number(row.productId) || 0)}:${Math.round(Number(row.skuId) || 0)}`;
}

export function normalizeQuantity(quantity: unknown): number {
  const value = Math.round(Number(quantity));
  if (!Number.isFinite(value)) return CART_LIMITS.minQuantity;
  return Math.min(
    CART_LIMITS.maxQuantity,
    Math.max(CART_LIMITS.minQuantity, value),
  );
}

export interface MergeResult {
  rows: CartRow[];
  /** 被夹取或拒绝时的提示文案，界面直接 toast。 */
  message: string;
  added: boolean;
}

/** 同商品同规格累加数量，新增行超出行数上限时拒绝。 */
export function mergeCartRow(rows: CartRow[], input: CartRow): MergeResult {
  const key = cartRowKey(input);
  const index = rows.findIndex((row) => cartRowKey(row) === key);
  if (index >= 0) {
    const current = rows[index];
    const merged = normalizeQuantity(
      current.quantity + normalizeQuantity(input.quantity),
    );
    const overflowed =
      current.quantity + normalizeQuantity(input.quantity) > merged;
    const next = rows.slice();
    next[index] = {
      ...current,
      quantity: merged,
      selected: input.selected !== false,
    };
    return {
      rows: next,
      message: overflowed
        ? `单件商品最多购买 ${CART_LIMITS.maxQuantity} 件`
        : '',
      added: false,
    };
  }
  if (rows.length >= CART_LIMITS.maxRows) {
    return {
      rows,
      message: `购物车最多放 ${CART_LIMITS.maxRows} 种商品，请先清理`,
      added: false,
    };
  }
  return {
    rows: [
      ...rows,
      {
        productId: Math.round(Number(input.productId) || 0),
        skuId: Math.round(Number(input.skuId) || 0),
        quantity: normalizeQuantity(input.quantity),
        selected: input.selected !== false,
      },
    ],
    message: '',
    added: true,
  };
}

/** 不传 keys 表示全选 / 全不选；传了只动命中的行。 */
export function toggleSelected(
  rows: CartRow[],
  selected: boolean,
  keys?: string[],
): CartRow[] {
  if (!keys || keys.length === 0) {
    return rows.map((row) => ({ ...row, selected }));
  }
  const wanted = new Set(keys);
  return rows.map((row) =>
    wanted.has(cartRowKey(row)) ? { ...row, selected } : row,
  );
}

export function selectedRows(rows: CartRow[]): CartRow[] {
  return rows.filter((row) => row.selected);
}

export interface CartCounters {
  rowCount: number;
  quantity: number;
  selectedRowCount: number;
  selectedQuantity: number;
}

export function cartCounters(rows: CartRow[]): CartCounters {
  const chosen = selectedRows(rows);
  return {
    rowCount: rows.length,
    quantity: rows.reduce(
      (sum, row) => sum + normalizeQuantity(row.quantity),
      0,
    ),
    selectedRowCount: chosen.length,
    selectedQuantity: chosen.reduce(
      (sum, row) => sum + normalizeQuantity(row.quantity),
      0,
    ),
  };
}

/** 行金额汇总：失效行不计入货款，但仍回显给顾客说明原因。 */
export function cartAmounts(
  rows: CartRow[],
  priceOf: (row: CartRow) => CartRowPrice,
): {
  rows: Array<CartRow & CartRowPrice>;
  goodsCents: number;
  invalidCount: number;
} {
  let goodsCents = 0;
  let invalidCount = 0;
  const priced = rows.map((row) => {
    const price = priceOf(row);
    if (!price.valid) invalidCount += 1;
    else if (row.selected) goodsCents += clampCents(price.totalCents);
    return { ...row, ...price };
  });
  return { rows: priced, goodsCents, invalidCount };
}

/** 结算数量口径：供 priceOrder 复用，与购物车展示保持一致。 */
export function checkoutItems(
  rows: CartRow[],
): Array<{ productId: number; skuId: number; quantity: number }> {
  return selectedRows(rows)
    .slice(0, CART_LIMITS.maxRows)
    .map((row) => ({
      productId: row.productId,
      skuId: row.skuId,
      quantity: normalizeQuantity(row.quantity),
    }));
}
