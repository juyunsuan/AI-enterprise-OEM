import type {
  BrandProductSku,
  BrandProductSkuInput,
  BrandProductSpec,
} from "@enterprise/contracts";

/**
 * 规格 → SKU 的纯算法层（无 React）：商品编辑抽屉与规格表组件都从这里取，
 * 保证「组合键」的算法只有一份实现——两处不一致会让编辑既有商品时丢规格。
 */

/** 与契约 `brandProductSpecSchema` / `brandProductSkuInputSchema` 同口径的上限。 */
export const BRAND_SPEC_LIMITS = {
  countMax: 5,
  valuesMax: 50,
  nameMax: 20,
  valueMax: 30,
};

export const BRAND_SKU_LIMITS = {
  max: 200,
  stockMax: 9_999_999,
  weightMax: 99_999,
  volumeMax: 999_999,
  barcodeMax: 64,
};

/** 单元格表：组合键 → 该 SKU 的可编辑值（含既有 sku.id，保存时才会走更新）。 */
export type SpecCells = Record<string, BrandProductSkuInput>;

export function emptyCell(specValues: Record<string, string>): BrandProductSkuInput {
  return {
    skuName: Object.values(specValues).join(" "),
    image: "",
    specValues,
    price: 0,
    marketPrice: 0,
    costPrice: 0,
    stock: 0,
    weight: 0,
    volume: 0,
    barcode: "",
    enabled: true,
  };
}

/** 规格值 → SKU 行的笛卡尔积；名称或值没填全的规格先跳过。 */
export function cartesian(specs: BrandProductSpec[]): Record<string, string>[] {
  return specs
    .filter((spec) => spec.name.trim() && spec.values.length)
    .reduce<Record<string, string>[]>(
      (acc, spec) =>
        acc.flatMap((combo) =>
          spec.values.map((value) => ({ ...combo, [spec.name.trim()]: value })),
        ),
      [{}],
    );
}

/** 组合键：按规格名排序拼串，组合顺序变了也能落到同一个单元格。 */
export function valuesToKey(specValues: Record<string, string>): string {
  return Object.keys(specValues)
    .sort()
    .map((name) => `${name}=${specValues[name]}`)
    .join("|");
}

export function keyToValues(key: string): Record<string, string> {
  if (!key) return {};
  const result: Record<string, string> = {};
  for (const part of key.split("|")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.slice(0, index)] = part.slice(index + 1);
  }
  return result;
}

export function cellOf(cells: SpecCells, key: string): BrandProductSkuInput {
  return cells[key] ?? emptyCell(keyToValues(key));
}

/** 提交用的 SKU 数组：只带当前组合里存在的行，缺的按默认值补齐。 */
export function buildSkus(specs: BrandProductSpec[], cells: SpecCells): BrandProductSkuInput[] {
  return cartesian(specs).map((specValues) => {
    const key = valuesToKey(specValues);
    const cell = cellOf(cells, key);
    return {
      ...cell,
      specValues,
      skuName: cell.skuName || Object.values(specValues).join(" "),
    };
  });
}

/** 详情回填：既有 SKU 按 specValues 组合键索引（BrandProductSku 结构上满足输入类型）。 */
export function splitSkus(skus: Array<BrandProductSku | BrandProductSkuInput>): SpecCells {
  const cells: SpecCells = {};
  for (const sku of skus) cells[valuesToKey(sku.specValues ?? {})] = sku;
  return cells;
}

/** 商品列表价：多规格时取 SKU 最低价（与契约 price = min(skus) 口径一致）。 */
export function minSkuPrice(
  specs: BrandProductSpec[],
  cells: SpecCells,
  fallback: number,
): number {
  const prices = buildSkus(specs, cells).map((sku) => sku.price);
  return prices.length ? Math.min(...prices) : fallback;
}

/** 多规格总库存：契约里商品库存由 SKU 汇总。 */
export function sumSkuStock(specs: BrandProductSpec[], cells: SpecCells): number {
  return buildSkus(specs, cells).reduce((sum, sku) => sum + sku.stock, 0);
}
