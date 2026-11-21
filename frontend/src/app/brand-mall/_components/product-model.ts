import type {
  BrandProductDetail,
  BrandProductParamItem,
  BrandProductSaveBody,
  BrandProductSkuInput,
  BrandProductSpec,
  BrandProductStatus,
  BrandProductType,
} from "@enterprise/contracts";
import { splitSkus, type SpecCells } from "./sku-model";

/** 商品表单里与 SKU 无关的长度上限，与契约 `brandProductSaveBodySchema` 同口径。 */
export const BRAND_PRODUCT_LIMITS = {
  titleMax: 120,
  subtitleMax: 200,
  imagesMax: 20,
  detailMax: 200_000,
  unitMax: 20,
  tagMax: 10,
  tagLengthMax: 30,
  virtualRemarkMax: 500,
  sortOrderMax: 9999,
  categoryNameMax: 30,
  paramMax: 30,
  paramNameMax: 30,
  paramValueMax: 200,
};

/** 表单里的标量字段（走 antd Form），图片/详情/规格三块是受控 state。 */
export type ProductScalars = {
  categoryId: number;
  title: string;
  subtitle: string;
  coverImage: string;
  type: BrandProductType;
  price: number;
  marketPrice: number;
  costPrice: number;
  stock: number;
  unit: string;
  weight: number;
  volume: number;
  freightTemplateId: number;
  status: BrandProductStatus;
  isHot: boolean;
  isNew: boolean;
  isGood: boolean;
  sortOrder: number;
  virtualRemark: string;
};

export const emptyProductScalars: ProductScalars = {
  categoryId: 0,
  title: "",
  subtitle: "",
  coverImage: "",
  type: "NORMAL",
  price: 0,
  marketPrice: 0,
  costPrice: 0,
  stock: 0,
  unit: "件",
  weight: 0,
  volume: 0,
  freightTemplateId: 0,
  status: "DRAFT",
  isHot: false,
  isNew: false,
  isGood: false,
  sortOrder: 0,
  virtualRemark: "",
};

export type ProductDraft = ProductScalars & {
  images: string[];
  detail: string;
  guaranteeTags: string[];
  params: BrandProductParamItem[];
  specs: BrandProductSpec[];
  cells: SpecCells;
};

export const emptyProductDraft: ProductDraft = {
  ...emptyProductScalars,
  images: [],
  detail: "",
  guaranteeTags: [],
  params: [],
  specs: [],
  cells: {},
};

/** 详情 → 草稿：只取可编辑字段，SKU 落进按组合键索引的单元格（保住 id 才走更新而不是重建）。 */
export function draftFromDetail(detail: BrandProductDetail): ProductDraft {
  return {
    categoryId: detail.categoryId,
    title: detail.title,
    subtitle: detail.subtitle,
    coverImage: detail.coverImage,
    type: detail.type,
    price: detail.price,
    marketPrice: detail.marketPrice,
    costPrice: detail.costPrice,
    stock: detail.stock,
    unit: detail.unit,
    weight: detail.weight,
    volume: detail.volume,
    freightTemplateId: detail.freightTemplateId,
    status: detail.status,
    isHot: detail.isHot,
    isNew: detail.isNew,
    isGood: detail.isGood,
    sortOrder: detail.sortOrder,
    virtualRemark: detail.virtualRemark,
    images: detail.images,
    detail: detail.detail,
    guaranteeTags: detail.guaranteeTags,
    params: detail.params,
    specs: detail.specs,
    cells: splitSkus(detail.skus),
  };
}

/**
 * 草稿 → 保存体。
 *
 * 多规格时商品级 price/stock 由 SKU 推导（契约口径：多规格以 SKU 汇总为准），
 * 基础信息里这两个字段在多规格模式下根本没注册进表单，不能直接取表单值。
 */
export function bodyFromDraft(
  draft: ProductDraft,
  options: { shopId: number; id?: number; multiSpec: boolean; skus: BrandProductSkuInput[] },
): BrandProductSaveBody {
  const { images, detail, guaranteeTags, params, specs, cells, ...scalars } = draft;
  void cells;
  const prices = options.skus.map((sku) => sku.price);
  return {
    ...scalars,
    price: options.multiSpec && prices.length ? Math.min(...prices) : scalars.price,
    stock: options.multiSpec
      ? options.skus.reduce((sum, sku) => sum + sku.stock, 0)
      : scalars.stock,
    shopId: options.shopId,
    id: options.id,
    specs: options.multiSpec
      ? specs.filter((spec) => spec.name.trim() && spec.values.length)
      : [],
    skus: options.multiSpec ? options.skus : [],
    images,
    detail,
    guaranteeTags,
    params,
  };
}
