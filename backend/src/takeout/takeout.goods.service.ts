import type {
  TakeoutCategory,
  TakeoutCategorySaveBody,
  TakeoutProductDetail,
  TakeoutProductRow,
  TakeoutProductSaveBody,
  TakeoutProductSku,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  amountOut,
  clip,
  iso,
  jsonList,
  productStatus,
  skuUniqueId,
} from './takeout.shared';

type ShopArgs = { ownerUserId: string; shopId: number };

function textOf(value: unknown, max: number): string {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : '';
  return text.trim().slice(0, max);
}

function specList(value: unknown) {
  return jsonList<Record<string, unknown>>(value)
    .map((item) => ({
      name: textOf(item.name, 30),
      values: jsonList<unknown>(item.values)
        .map((value) => textOf(value, 30))
        .filter(Boolean),
    }))
    .filter((item) => item.name);
}

function productMap(row: {
  id: number;
  categoryId: number;
  title: string;
  subtitle: string;
  coverImage: string;
  price: unknown;
  marketPrice: unknown;
  stock: number;
  sales: number;
  unit: string;
  specs: unknown;
  status: string;
  isHot: boolean;
  isNew: boolean;
  sortOrder: number;
  createdAt: Date;
}): TakeoutProductRow {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    subtitle: row.subtitle,
    coverImage: row.coverImage,
    price: amountOut(row.price),
    marketPrice: amountOut(row.marketPrice),
    stock: row.stock,
    sales: row.sales,
    unit: row.unit,
    specs: specList(row.specs),
    status: productStatus(row.status),
    isHot: row.isHot,
    isNew: row.isNew,
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt),
  };
}

function skuMap(row: {
  id: number;
  skuName: string;
  image: string;
  uniqueId: string;
  specValues: unknown;
  price: unknown;
  marketPrice: unknown;
  stock: number;
  sales: number;
  enabled: boolean;
}): TakeoutProductSku {
  const values: Record<string, string> = {};
  const raw = row.specValues;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      values[key] = textOf(value, 200);
    }
  }
  return {
    id: row.id,
    skuName: row.skuName,
    image: row.image,
    uniqueId: row.uniqueId,
    specValues: values,
    price: amountOut(row.price),
    marketPrice: amountOut(row.marketPrice),
    stock: row.stock,
    sales: row.sales,
    enabled: row.enabled,
  };
}

export class TakeoutGoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(args: ShopArgs): Promise<TakeoutCategory[]> {
    const rows = await this.prisma.takeoutCategory.findMany({
      where: { shopId: args.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const counts = await this.prisma.takeoutProduct.groupBy({
      by: ['categoryId'],
      where: { shopId: args.shopId },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((item) => [item.categoryId, item._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      productCount: countMap.get(row.id) || 0,
    }));
  }

  async saveCategory(
    args: ShopArgs,
    body: TakeoutCategorySaveBody,
  ): Promise<TakeoutCategory> {
    const data = {
      name: clip(body.name, 30),
      icon: clip(body.icon, 500),
      sortOrder: body.sortOrder,
      enabled: body.enabled,
    };
    const row = body.id
      ? await this.prisma.takeoutCategory.updateMany({
          where: { id: body.id, shopId: args.shopId },
          data,
        })
      : await this.prisma.takeoutCategory.create({
          data: { ...data, shopId: args.shopId },
        });
    if (body.id && 'count' in row && row.count === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    }
    const saved = body.id
      ? await this.prisma.takeoutCategory.findFirst({
          where: { id: body.id, shopId: args.shopId },
        })
      : (row as { id: number });
    if (!saved) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    const id = 'id' in saved ? Number(saved.id) : 0;
    const full = await this.prisma.takeoutCategory.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!full) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    return {
      id: full.id,
      name: full.name,
      icon: full.icon,
      sortOrder: full.sortOrder,
      enabled: full.enabled,
      productCount: 0,
    };
  }

  async removeCategory(args: ShopArgs, id: number) {
    const used = await this.prisma.takeoutProduct.count({
      where: { shopId: args.shopId, categoryId: id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该分类下还有 ${used} 个菜品，请先移出分类`,
      );
    }
    await this.prisma.takeoutCategory.deleteMany({
      where: { id, shopId: args.shopId },
    });
    return { ok: true, message: '分类已删除' };
  }

  async products(
    args: ShopArgs,
    query: {
      keyword?: string;
      categoryId?: number;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.categoryId !== undefined) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) where.title = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.takeoutProduct.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.takeoutProduct.count({ where }),
    ]);
    return pageOf(rows.map(productMap), total, page, pageSize);
  }

  async productDetail(
    args: ShopArgs,
    id: number,
  ): Promise<TakeoutProductDetail> {
    const row = await this.prisma.takeoutProduct.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '菜品不存在');
    const skus = await this.prisma.takeoutProductSku.findMany({
      where: { productId: row.id, shopId: args.shopId },
      orderBy: { id: 'asc' },
    });
    return {
      ...productMap(row),
      images: jsonList<string>(row.images).map((item) => String(item)),
      detail: row.detail,
      skus: skus.map(skuMap),
    };
  }

  async saveProduct(
    args: ShopArgs,
    body: TakeoutProductSaveBody,
  ): Promise<TakeoutProductDetail> {
    if (body.categoryId > 0) {
      const category = await this.prisma.takeoutCategory.findFirst({
        where: { id: body.categoryId, shopId: args.shopId },
        select: { id: true },
      });
      if (!category) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所选分类不存在');
      }
    }
    const data = {
      categoryId: body.categoryId,
      title: clip(body.title, 120),
      subtitle: clip(body.subtitle, 200),
      coverImage: clip(body.coverImage, 500),
      images: body.images,
      detail: body.detail,
      price: body.price,
      marketPrice: body.marketPrice,
      stock: body.stock,
      unit: clip(body.unit, 20) || '份',
      specs: body.specs,
      status: body.status,
      isHot: body.isHot,
      isNew: body.isNew,
      sortOrder: body.sortOrder,
    };
    const row = body.id
      ? await this.prisma.takeoutProduct.updateMany({
          where: { id: body.id, shopId: args.shopId },
          data,
        })
      : await this.prisma.takeoutProduct.create({
          data: { ...data, shopId: args.shopId, ownerUserId: args.ownerUserId },
        });
    if (body.id && 'count' in row && row.count === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '菜品不存在');
    }
    const productId = body.id || Number((row as { id: number }).id);
    await this.prisma.takeoutProductSku.deleteMany({
      where: { productId, shopId: args.shopId },
    });
    for (const sku of body.skus) {
      await this.prisma.takeoutProductSku.create({
        data: {
          productId,
          shopId: args.shopId,
          skuName: clip(sku.skuName, 200),
          image: clip(sku.image, 500),
          uniqueId: clip(sku.uniqueId, 191) || skuUniqueId(sku.specValues),
          specValues: sku.specValues,
          price: sku.price,
          marketPrice: sku.marketPrice,
          stock: sku.stock,
          enabled: sku.enabled,
        },
      });
    }
    return this.productDetail(args, productId);
  }

  async removeProduct(args: ShopArgs, id: number) {
    await this.prisma.takeoutProductSku.deleteMany({
      where: { productId: id, shopId: args.shopId },
    });
    await this.prisma.takeoutProduct.deleteMany({
      where: { id, shopId: args.shopId },
    });
    return { ok: true, message: '菜品已删除' };
  }

  /** C 端菜单：在线分类 + 在线菜品 + 可售规格。 */
  async menu(shopId: number) {
    const [categories, products] = await Promise.all([
      this.prisma.takeoutCategory.findMany({
        where: { shopId, enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
      this.prisma.takeoutProduct.findMany({
        where: { shopId, status: 'ONLINE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        take: 500,
      }),
    ]);
    const ids = products.map((row) => row.id);
    const skus = ids.length
      ? await this.prisma.takeoutProductSku.findMany({
          where: { shopId, productId: { in: ids }, enabled: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const skuMap = new Map<number, typeof skus>();
    for (const sku of skus) {
      const list = skuMap.get(sku.productId) || [];
      list.push(sku);
      skuMap.set(sku.productId, list);
    }
    const rows = products.map((row) => {
      const own = skuMap.get(row.id) || [];
      const specs = specList(row.specs);
      const prices = own.length
        ? own.map((sku) => Number(sku.price)).filter(Number.isFinite)
        : [Number(row.price)].filter(Number.isFinite);
      const stock = own.length
        ? own.reduce((sum, sku) => sum + Math.max(0, sku.stock), 0)
        : Math.max(0, row.stock);
      return {
        id: row.id,
        categoryId: row.categoryId,
        title: row.title,
        subtitle: row.subtitle,
        coverImage: row.coverImage,
        price: prices.length ? Math.min(...prices) : 0,
        marketPrice: Number(row.marketPrice) || 0,
        sales: row.sales,
        stock,
        soldOut: stock <= 0,
        isHot: row.isHot,
        specs,
        skus: own.map((sku) => ({
          id: sku.id,
          skuName: sku.skuName,
          specValues: skuMapValues(sku.specValues),
          price: Number(sku.price) || 0,
          stock: Math.max(0, sku.stock),
        })),
      };
    });
    const grouped = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      count: rows.filter((row) => row.categoryId === category.id).length,
    }));
    const uncategorized = rows.filter(
      (row) => !grouped.some((item) => item.id === row.categoryId),
    );
    if (uncategorized.length) {
      grouped.push({
        id: 0,
        name: '其他',
        icon: '',
        count: uncategorized.length,
      });
    }
    return { categories: grouped, products: rows };
  }
}

function skuMapValues(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = textOf(item, 200);
    }
  }
  return out;
}
