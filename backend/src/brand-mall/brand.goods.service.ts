import {
  type BrandCategory,
  type BrandCategorySaveBody,
  type BrandCategoryTree,
  type BrandExpress,
  type BrandExpressSaveBody,
  type BrandProductDetail,
  type BrandProductRow,
  type BrandProductSaveBody,
  type BrandProductSku,
  type BrandReview,
  type BrandReviewReplyBody,
} from '@enterprise/contracts';
import { LIST_ALL_LIMIT, pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { productStatus } from './brand.shared';
import type { BrandShippingService } from './brand.shipping.service';
import { normalizeProductIds } from '../commerce-core/product';

type AnyArgs = { ownerUserId: string; shopId: number };

type ProductRecord = {
  id: number;
  shopId: number;
  categoryId: number;
  title: string;
  subtitle: string;
  coverImage: string;
  type: string;
  price: unknown;
  marketPrice: unknown;
  costPrice: unknown;
  stock: number;
  sales: number;
  unit: string;
  weight: unknown;
  volume: unknown;
  freightTemplateId: number;
  specs: unknown;
  guarantee: unknown;
  images: unknown;
  detail: string;
  status: string;
  isHot: boolean;
  isNew: boolean;
  isGood: boolean;
  sortOrder: number;
  virtualRemark: string;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 只把字符串/数字当文本，其它类型一律空串（JSON 列里可能是对象）。 */
const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';

const round2 = (value: unknown): number => Math.round(num(value) * 100) / 100;

function strList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? (value as unknown[])
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? (parsed as unknown[]) : [];
          } catch {
            return [];
          }
        })()
      : [];
  return raw
    .map((item) => text(item).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    )
    .slice(0, 30);
}

function specDefs(value: unknown): Array<{ name: string; values: string[] }> {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => {
      const entry = (item || {}) as { name?: unknown; values?: unknown };
      const values = (Array.isArray(entry.values) ? entry.values : [])
        .map((one) => text(one).trim())
        .filter(Boolean)
        .slice(0, 50);
      return {
        name: text(entry.name).trim().slice(0, 20),
        values,
      };
    })
    .filter((item) => item.name && item.values.length > 0)
    .slice(0, 5);
}

function specMap(value: unknown): Record<string, string> {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.slice(0, 20);
    const value = text(item).trim().slice(0, 30);
    if (name && value) out[name] = value;
  }
  return out;
}

/**
 * 商品域：分类、商品与多规格 SKU、评价、店铺快递。
 *
 * 规格的笛卡尔积不在库里再拆三张表（参考源码用 attr_template / attr_value /
 * attr_result 三表拼），而是 `brand_products.specs` 存维度、`brand_product_skus`
 * 存落到实处的可售行：读一次就能渲染，双库也没有 JSON 函数差异。
 */
export class BrandGoodsService {
  /** 商品配额由平台服务提供；装配时注入，未注入表示不限量。 */
  productQuotaLoader: (() => Promise<number>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipping: BrandShippingService,
  ) {}

  // ---------------------------------------------------------------- 分类

  async categoryList(args: AnyArgs): Promise<BrandCategoryTree[]> {
    const rows = await this.prisma.brandCategory.findMany({
      where: { shopId: args.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: LIST_ALL_LIMIT,
    });
    const counts = await this.prisma.brandProduct.groupBy({
      by: ['categoryId'],
      where: { shopId: args.shopId, categoryId: { gt: 0 } },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );
    const nodes = new Map<number, BrandCategoryTree>();
    for (const row of rows) {
      nodes.set(row.id, {
        id: row.id,
        shopId: row.shopId,
        parentId: row.parentId,
        name: row.name,
        icon: row.icon,
        image: row.image,
        level: row.level,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        productCount: countMap.get(row.id) || 0,
        children: [],
      });
    }
    const roots: BrandCategoryTree[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id) as BrandCategoryTree;
      const parent = row.parentId ? nodes.get(row.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async categorySave(
    args: AnyArgs,
    body: BrandCategorySaveBody,
  ): Promise<BrandCategory> {
    const name = String(body.name || '')
      .trim()
      .slice(0, 30);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '分类名称不能为空');
    let level = 1;
    if (body.parentId > 0) {
      const parent = await this.prisma.brandCategory.findFirst({
        where: { id: body.parentId, shopId: args.shopId },
      });
      if (!parent) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '上级分类不存在');
      }
      if (parent.level >= 3) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '分类最多三级，不能再往下建子分类',
        );
      }
      level = parent.level + 1;
    }
    const data = {
      parentId: body.parentId,
      name,
      icon: String(body.icon || '').slice(0, 500),
      image: String(body.image || '').slice(0, 500),
      level,
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
      enabled: body.enabled !== false,
    };
    if (body.id) {
      const row = await this.prisma.brandCategory.findFirst({
        where: { id: body.id, shopId: args.shopId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
      if (body.parentId === row.id) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '上级分类不能是自己',
        );
      }
      await this.prisma.brandCategory.update({ where: { id: row.id }, data });
      return this.categoryById(args, row.id);
    }
    const created = await this.prisma.brandCategory.create({
      data: { shopId: args.shopId, ...data },
    });
    return this.categoryById(args, created.id);
  }

  private async categoryById(
    args: AnyArgs,
    id: number,
  ): Promise<BrandCategory> {
    const row = await this.prisma.brandCategory.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    const productCount = await this.prisma.brandProduct.count({
      where: { shopId: args.shopId, categoryId: row.id },
    });
    return {
      id: row.id,
      shopId: row.shopId,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
      image: row.image,
      level: row.level,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      productCount,
    };
  }

  async categoryRemove(
    args: AnyArgs,
    id: number,
  ): Promise<{ ok: boolean; message: string }> {
    const row = await this.prisma.brandCategory.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    const [children, products] = await Promise.all([
      this.prisma.brandCategory.count({ where: { parentId: row.id } }),
      this.prisma.brandProduct.count({
        where: { shopId: args.shopId, categoryId: row.id },
      }),
    ]);
    if (children > 0 || products > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该分类下还有 ${children} 个子分类、${products} 个商品，请先移走再删除`,
      );
    }
    await this.prisma.brandCategory.delete({ where: { id: row.id } });
    return { ok: true, message: '分类已删除' };
  }

  async categorySort(args: AnyArgs, ids: number[]) {
    const list = ids.map((id) => Number(id)).filter((id) => id > 0);
    for (const [index, id] of list.entries()) {
      await this.prisma.brandCategory.updateMany({
        where: { id, shopId: args.shopId },
        data: { sortOrder: (index + 1) * 10 },
      });
    }
    return { ok: true, message: '排序已保存' };
  }

  // ---------------------------------------------------------------- 商品

  async productList(
    args: AnyArgs,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      categoryId?: number;
      status?: string;
      type?: string;
      tag?: string;
      sort?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.categoryId && query.categoryId > 0) {
      where.categoryId = {
        in: await this.categoryWithDescendants(args, query.categoryId),
      };
    }
    const keyword = String(query.keyword || '').trim();
    if (keyword) where.title = { contains: keyword };
    if (
      query.tag === 'isHot' ||
      query.tag === 'isNew' ||
      query.tag === 'isGood'
    ) {
      where[query.tag] = true;
    }
    const orderBy =
      query.sort === 'PRICE_ASC'
        ? [{ price: 'asc' as const }]
        : query.sort === 'PRICE_DESC'
          ? [{ price: 'desc' as const }]
          : query.sort === 'SALES_DESC'
            ? [{ sales: 'desc' as const }]
            : query.sort === 'NEWEST'
              ? [{ id: 'desc' as const }]
              : [{ sortOrder: 'asc' as const }, { id: 'desc' as const }];

    const [rows, total] = await Promise.all([
      this.prisma.brandProduct.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandProduct.count({ where }),
    ]);
    const categoryNames = await this.categoryNameMap(args);
    const skuCounts = await this.prisma.brandProductSku.groupBy({
      by: ['productId'],
      where: { productId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const skuCountMap = new Map(
      skuCounts.map((row) => [row.productId, row._count._all]),
    );
    const list = rows.map((row) =>
      this.toProductRow(
        row as ProductRecord,
        categoryNames,
        skuCountMap.get(row.id) || 0,
      ),
    );
    return pageOf(list, total, page, pageSize);
  }

  private async categoryWithDescendants(
    args: AnyArgs,
    root: number,
  ): Promise<number[]> {
    const all = await this.prisma.brandCategory.findMany({
      where: { shopId: args.shopId },
      select: { id: true, parentId: true },
      take: LIST_ALL_LIMIT,
    });
    const picked = new Set<number>([root]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of all) {
        if (picked.has(row.parentId) && !picked.has(row.id)) {
          picked.add(row.id);
          changed = true;
        }
      }
    }
    return [...picked];
  }

  private async categoryNameMap(args: AnyArgs): Promise<Map<number, string>> {
    const rows = await this.prisma.brandCategory.findMany({
      where: { shopId: args.shopId },
      select: { id: true, name: true },
      take: LIST_ALL_LIMIT,
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private toProductRow(
    row: ProductRecord,
    categoryNames: Map<number, string>,
    skuCount: number,
  ): BrandProductRow {
    return {
      id: row.id,
      shopId: row.shopId,
      categoryId: row.categoryId,
      categoryName: categoryNames.get(row.categoryId) || '',
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      type: row.type === 'VIRTUAL' ? 'VIRTUAL' : 'NORMAL',
      price: round2(row.price),
      marketPrice: round2(row.marketPrice),
      stock: row.stock,
      sales: row.sales,
      unit: row.unit,
      freightTemplateId: row.freightTemplateId,
      status: productStatus(row.status),
      isHot: row.isHot,
      isNew: row.isNew,
      isGood: row.isGood,
      sortOrder: row.sortOrder,
      skuCount,
      reviewCount: row.reviewCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async productDetail(args: AnyArgs, id: number): Promise<BrandProductDetail> {
    const row = (await this.prisma.brandProduct.findFirst({
      where: { id, shopId: args.shopId },
    })) as ProductRecord | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const [categoryNames, skus, paramRow] = await Promise.all([
      this.categoryNameMap(args),
      this.skusOf(args, [row.id]),
      this.prisma.brandProductParam.findUnique({
        where: { productId: row.id },
        select: { params: true, protection: true },
      }),
    ]);
    const params = recordList(paramRow?.params)
      .map((item) => ({
        name: text(item.name).slice(0, 30),
        value: text(item.value).slice(0, 200),
      }))
      .filter((item) => item.name !== '');
    const protection = strList(paramRow?.protection);
    return {
      ...this.toProductRow(row, categoryNames, skus.length),
      images: strList(row.images),
      detail: row.detail,
      costPrice: round2(row.costPrice),
      weight: num(row.weight),
      volume: num(row.volume),
      specs: specDefs(row.specs),
      skus,
      guaranteeTags:
        protection.length > 0 ? protection : strList(row.guarantee),
      params,
      virtualRemark: row.virtualRemark,
    };
  }

  private async skusOf(
    args: AnyArgs,
    productIds: number[],
  ): Promise<BrandProductSku[]> {
    if (productIds.length === 0) return [];
    const rows = await this.prisma.brandProductSku.findMany({
      where: { shopId: args.shopId, productId: { in: productIds } },
      orderBy: [{ id: 'asc' }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      shopId: row.shopId,
      skuName: row.skuName,
      image: row.image,
      uniqueId: row.uniqueId,
      specValues: specMap(row.specValues),
      price: round2(row.price),
      marketPrice: round2(row.marketPrice),
      costPrice: round2(row.costPrice),
      stock: row.stock,
      sales: row.sales,
      weight: num(row.weight),
      volume: num(row.volume),
      barcode: row.barcode,
      enabled: row.enabled,
    }));
  }

  async productSave(
    args: AnyArgs,
    body: BrandProductSaveBody,
  ): Promise<BrandProductDetail> {
    const title = String(body.title || '')
      .trim()
      .slice(0, 200);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '商品名称不能为空');
    if (body.categoryId > 0) {
      const category = await this.prisma.brandCategory.findFirst({
        where: { id: body.categoryId, shopId: args.shopId },
      });
      if (!category)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所选分类不存在');
    }
    const specs = specDefs(body.specs);
    const inputSkus = Array.isArray(body.skus) ? body.skus : [];
    const multiSpec = specs.length > 0 && inputSkus.length > 0;
    const freightTemplateId = Math.max(
      0,
      Math.round(body.freightTemplateId || 0),
    );
    await this.shipping.assertTemplate(args.shopId, freightTemplateId);
    const params = Array.isArray(body.params)
      ? body.params
          .map((item) => ({
            name: String(item.name || '')
              .trim()
              .slice(0, 30),
            value: String(item.value || '')
              .trim()
              .slice(0, 200),
          }))
          .filter((item) => item.name !== '')
          .slice(0, 30)
      : [];
    const protection = (
      Array.isArray(body.guaranteeTags) ? body.guaranteeTags : []
    )
      .map((item) =>
        String(item || '')
          .trim()
          .slice(0, 30),
      )
      .filter(Boolean)
      .slice(0, 10);
    const data = {
      shopId: args.shopId,
      ownerUserId: args.ownerUserId,
      categoryId: body.categoryId || 0,
      title,
      subtitle: String(body.subtitle || '')
        .trim()
        .slice(0, 200),
      coverImage: String(body.coverImage || '').slice(0, 500),
      images: strList(body.images),
      detail: String(body.detail || '').slice(0, 200_000),
      type: body.type === 'VIRTUAL' ? 'VIRTUAL' : 'NORMAL',
      price: round2(body.price),
      marketPrice: round2(body.marketPrice),
      costPrice: round2(body.costPrice),
      stock: Math.max(0, Math.round(body.stock || 0)),
      unit: String(body.unit || '件').slice(0, 20),
      weight: num(body.weight),
      volume: num(body.volume),
      freightTemplateId,
      specs,
      guarantee: protection,
      status: ['DRAFT', 'OFFLINE', 'ONLINE'].includes(String(body.status))
        ? body.status
        : 'DRAFT',
      isHot: body.isHot === true,
      isNew: body.isNew === true,
      isGood: body.isGood === true,
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
      virtualRemark: String(body.virtualRemark || '').slice(0, 500),
    };

    let productId = Number(body.id || 0);
    if (productId > 0) {
      const existing = await this.prisma.brandProduct.findFirst({
        where: { id: productId, shopId: args.shopId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
      await this.prisma.brandProduct.update({ where: { id: productId }, data });
    } else {
      const quota = await this.platformProductQuota(args);
      if (quota !== null && quota.total >= quota.limit) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `本店商品数已达平台上限 ${quota.limit} 个，请先下架清理或联系平台管理员调整`,
        );
      }
      const created = await this.prisma.brandProduct.create({ data });
      productId = created.id;
    }

    await this.syncSkus(args, productId, inputSkus, multiSpec, data);
    if (params.length === 0 && protection.length === 0) {
      await this.prisma.brandProductParam.deleteMany({
        where: { productId, shopId: args.shopId },
      });
    } else {
      await this.prisma.brandProductParam.upsert({
        where: { productId },
        create: { shopId: args.shopId, productId, params, protection },
        update: { params, protection },
      });
    }
    return this.productDetail(args, productId);
  }

  /**
   * SKU 同步：带 id 的更新、不带 id 的新增、本次没提交的删除。
   * 多规格时商品主表的价格与库存取 SKU 汇总（最低价为展示价、库存求和），
   * 避免两处数字各说各话。
   */
  private async syncSkus(
    args: AnyArgs,
    productId: number,
    inputSkus: BrandProductSaveBody['skus'],
    multiSpec: boolean,
    data: { price: number; stock: number },
  ) {
    const existing = await this.prisma.brandProductSku.findMany({
      where: { productId, shopId: args.shopId },
      select: { id: true },
    });
    const keepIds = new Set(
      inputSkus.map((sku) => Number(sku.id || 0)).filter((id) => id > 0),
    );
    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await this.prisma.brandProductSku.delete({ where: { id: row.id } });
      }
    }
    let minPrice = data.price;
    let totalStock = 0;
    for (const sku of inputSkus.slice(0, 200)) {
      const specValues = specMap(sku.specValues);
      const uniqueId = multiSpec
        ? Object.values(specValues).join('') ||
          String(sku.skuName || '').slice(0, 191)
        : '';
      const payload = {
        productId,
        shopId: args.shopId,
        skuName: String(sku.skuName || '').slice(0, 200),
        image: String(sku.image || '').slice(0, 500),
        uniqueId: uniqueId.slice(0, 191),
        specValues,
        price: round2(sku.price),
        marketPrice: round2(sku.marketPrice),
        costPrice: round2(sku.costPrice),
        stock: Math.max(0, Math.round(sku.stock || 0)),
        weight: num(sku.weight),
        volume: num(sku.volume),
        barcode: String(sku.barcode || '').slice(0, 64),
        enabled: sku.enabled !== false,
      };
      const id = Number(sku.id || 0);
      if (id > 0) {
        await this.prisma.brandProductSku.updateMany({
          where: { id, shopId: args.shopId },
          data: payload,
        });
      } else {
        await this.prisma.brandProductSku.create({ data: payload });
      }
      if (payload.enabled) {
        minPrice = Math.min(minPrice, payload.price);
        totalStock += payload.stock;
      }
    }
    if (multiSpec) {
      await this.prisma.brandProduct.update({
        where: { id: productId },
        data: { price: round2(minPrice), stock: totalStock },
      });
    }
  }

  async productStatus(args: AnyArgs, ids: number[], status: string) {
    const next = ['DRAFT', 'OFFLINE', 'ONLINE'].includes(String(status))
      ? String(status)
      : null;
    if (!next)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '商品状态不合法');
    const list = normalizeProductIds(ids);
    if (list.length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要操作的商品');
    }
    if (next === 'ONLINE') {
      const withoutSku = await this.prisma.brandProduct.count({
        where: {
          shopId: args.shopId,
          id: { in: list },
          stock: 0,
          type: 'NORMAL',
        },
      });
      if (withoutSku > 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `${withoutSku} 个商品库存为 0，上架后顾客拍下会超卖，请先补库存`,
        );
      }
    }
    const result = await this.prisma.brandProduct.updateMany({
      where: { shopId: args.shopId, id: { in: list } },
      data: { status: next },
    });
    return { ok: true, message: `已更新 ${result.count} 个商品` };
  }

  async productRemove(args: AnyArgs, ids: number[]) {
    const list = normalizeProductIds(ids);
    if (list.length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要删除的商品');
    }
    const referenced = await this.prisma.brandOrderItem.count({
      where: { shopId: args.shopId, productId: { in: list } },
    });
    if (referenced > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `所选商品已产生过订单，删除会破坏历史单据。请改用「下架」，顾客端就看不到它们了`,
      );
    }
    await this.prisma.brandProductSku.deleteMany({
      where: { shopId: args.shopId, productId: { in: list } },
    });
    const result = await this.prisma.brandProduct.deleteMany({
      where: { shopId: args.shopId, id: { in: list } },
    });
    return { ok: true, message: `已删除 ${result.count} 个商品` };
  }

  /**
   * 复制商品：走「读详情 → 存草稿」的同一条通路，不直接拷库里的 JSON/Decimal 列。
   * 好处是副本一定经过与手工录入相同的归一化，也不会把已售数据（销量/评价）带过去。
   */
  async productCopy(args: AnyArgs, ids: number[]) {
    const list = normalizeProductIds(ids, 50);
    if (list.length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要复制的商品');
    }
    const rows = await this.prisma.brandProduct.findMany({
      where: { shopId: args.shopId, id: { in: list } },
      select: { id: true, title: true },
    });
    for (const row of rows) {
      const source = await this.productDetail(args, row.id);
      await this.productSave(args, {
        ...source,
        id: undefined,
        shopId: args.shopId,
        title: `副本 ${source.title}`.slice(0, 200),
        status: 'DRAFT',
        isHot: false,
        isNew: false,
        isGood: false,
        skus: source.skus.map((sku) => ({
          id: undefined,
          skuName: sku.skuName,
          image: sku.image,
          specValues: sku.specValues,
          price: sku.price,
          marketPrice: sku.marketPrice,
          costPrice: sku.costPrice,
          stock: sku.stock,
          weight: sku.weight,
          volume: sku.volume,
          barcode: sku.barcode,
          enabled: sku.enabled,
        })),
      });
    }
    return { ok: true, message: `已复制 ${rows.length} 个商品为草稿` };
  }

  private async platformProductQuota(
    args: AnyArgs,
  ): Promise<{ total: number; limit: number } | null> {
    const limit = this.productQuotaLoader
      ? await this.productQuotaLoader()
      : null;
    if (limit === null || limit === undefined) return null;
    const total = await this.prisma.brandProduct.count({
      where: { shopId: args.shopId },
    });
    return { total, limit };
  }

  // ---------------------------------------------------------------- 评价

  async reviewList(
    args: AnyArgs,
    query: {
      page?: number;
      pageSize?: number;
      productId?: number;
      status?: string;
      rating?: number;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;
    if (query.rating) where.rating = query.rating;
    const [rows, total] = await Promise.all([
      this.prisma.brandProductReview.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandProductReview.count({ where }),
    ]);
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const products = productIds.length
      ? await this.prisma.brandProduct.findMany({
          where: { shopId: args.shopId, id: { in: productIds } },
          select: { id: true, title: true, coverImage: true },
        })
      : [];
    const productMap = new Map(products.map((item) => [item.id, item]));
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const customers = customerIds.length
      ? await this.prisma.brandCustomer.findMany({
          where: { shopId: args.shopId, id: { in: customerIds } },
          select: { id: true, nickname: true, avatar: true },
        })
      : [];
    const customerMap = new Map(customers.map((item) => [item.id, item]));
    const list = rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      productId: row.productId,
      productTitle: productMap.get(row.productId)?.title || '（商品已删除）',
      coverImage: productMap.get(row.productId)?.coverImage || '',
      orderId: row.orderId,
      customerId: row.customerId,
      nickname: customerMap.get(row.customerId)?.nickname || '微信用户',
      avatar: customerMap.get(row.customerId)?.avatar || '',
      rating: row.rating,
      content: row.content,
      images: strList(row.images),
      status: (['PENDING', 'PUBLISHED', 'HIDDEN'].includes(row.status)
        ? row.status
        : 'PUBLISHED') as BrandReview['status'],
      reply: row.reply,
      replyAt: row.replyAt ? row.replyAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  async reviewReply(
    args: AnyArgs,
    body: BrandReviewReplyBody,
  ): Promise<BrandReview> {
    const row = await this.prisma.brandProductReview.findFirst({
      where: { id: body.id, shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    await this.prisma.brandProductReview.update({
      where: { id: row.id },
      data: {
        reply: String(body.reply || '').slice(0, 500),
        replyAt: new Date(),
      },
    });
    return this.reviewById(args, row.id);
  }

  async reviewStatus(
    args: AnyArgs,
    id: number,
    status: string,
  ): Promise<BrandReview> {
    if (!['PENDING', 'PUBLISHED', 'HIDDEN'].includes(String(status))) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '评价状态不合法');
    }
    const row = await this.prisma.brandProductReview.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    await this.prisma.brandProductReview.update({
      where: { id: row.id },
      data: { status },
    });
    return this.reviewById(args, row.id);
  }

  private async reviewById(args: AnyArgs, id: number): Promise<BrandReview> {
    const list = await this.reviewList(args, { page: 1, pageSize: 200 });
    const found = list.list.find((row) => row.id === id);
    if (!found) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    return found;
  }

  // ---------------------------------------------------------------- 快递

  async expressList(
    args: AnyArgs,
    presets: BrandExpress[],
  ): Promise<BrandExpress[]> {
    const rows = await this.prisma.brandExpressCompany.findMany({
      where: { shopId: args.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: LIST_ALL_LIMIT,
    });
    const own = rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      name: row.name,
      code: row.code,
      phone: row.phone,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
    }));
    return [...presets, ...own];
  }

  async expressSave(
    args: AnyArgs,
    body: BrandExpressSaveBody,
  ): Promise<BrandExpress> {
    if (body.id && body.shopId === 0) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '平台预置快递公司不可修改',
      );
    }
    const name = String(body.name || '')
      .trim()
      .slice(0, 40);
    if (!name)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '快递公司名称不能为空',
      );
    const data = {
      name,
      code: String(body.code || '')
        .trim()
        .slice(0, 40),
      phone: String(body.phone || '').slice(0, 30),
      enabled: body.enabled !== false,
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
    };
    if (body.id) {
      const row = await this.prisma.brandExpressCompany.findFirst({
        where: { id: body.id, shopId: args.shopId },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '快递记录不存在');
      await this.prisma.brandExpressCompany.update({
        where: { id: row.id },
        data,
      });
      return { id: row.id, shopId: row.shopId, ...data };
    }
    const created = await this.prisma.brandExpressCompany.create({
      data: { shopId: args.shopId, ...data },
    });
    return { id: created.id, shopId: created.shopId, ...data };
  }

  async expressRemove(args: AnyArgs, id: number) {
    const row = await this.prisma.brandExpressCompany.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递记录不存在');
    await this.prisma.brandExpressCompany.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }
}
