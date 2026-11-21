import { createHash } from 'node:crypto';
import type {
  MpProduct,
  MpProductAudit,
  MpProductAuditBody,
  MpProductDetail,
  MpProductSaveBody,
  MpProductSku,
  MpProductStatusBody,
  PageResponse,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  MpProduct as MpProductRow,
  MpProductSku as MpProductSkuRow,
} from '../../generated/prisma';
import { skuUniqueId } from '../commerce-core/ident';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import { decimalOf, iso, jsonObject, textOf } from './mp.shared';

type ProductListQuery = {
  page?: unknown;
  pageSize?: unknown;
  keyword?: string;
  status?: string;
};
type AuditListQuery = {
  page?: unknown;
  pageSize?: unknown;
  auditStatus?: string;
  keyword?: string;
};

const PRODUCT_STATUS = new Set([
  'DRAFT',
  'PENDING',
  'ONLINE',
  'OFFLINE',
  'REJECTED',
]);

function specsOf(value: unknown): Array<{ name: string; values: string[] }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = jsonObject(item);
      const name = textOf(record.name).trim();
      const values = Array.isArray(record.values)
        ? record.values.map((v) => textOf(v).trim()).filter(Boolean)
        : [];
      return { name, values };
    })
    .filter((item) => item.name && item.values.length > 0);
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

/** 送审快照：只覆盖「改内容就要重新审核」的字段，库存与销量变化不触发重审。 */
function snapshotHash(
  row: {
    title: string;
    subtitle: string;
    coverImage: string;
    images: unknown;
    detail: string;
    price: unknown;
    specs: unknown;
    guarantee: unknown;
    categoryId: number;
  },
  skus: MpProductSkuRow[],
): string {
  const payload = JSON.stringify({
    title: row.title,
    subtitle: row.subtitle,
    coverImage: row.coverImage,
    images: stringsOf(row.images),
    detail: row.detail,
    price: Number(row.price),
    categoryId: row.categoryId,
    specs: specsOf(row.specs),
    guarantee: stringsOf(row.guarantee),
    skus: skus
      .map((sku) => ({
        uniqueId: sku.uniqueId,
        skuName: sku.skuName,
        specValues: jsonObject(sku.specValues),
        price: Number(sku.price),
        enabled: sku.enabled,
      }))
      .sort((a, b) => a.uniqueId.localeCompare(b.uniqueId)),
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * 商户商品与平台商品审核。
 *
 * 硬口径：
 * 1. 商品永远归属于「市场 + 商户 + 店铺」，任何按 id 的读写都带这三层过滤；
 * 2. 上架只有一条路：DRAFT/REJECTED → 送审 PENDING → 平台通过后 ONLINE；
 * 3. 已上架商品改内容会退回 DRAFT（下架并需重新送审），避免「审核过的壳子换货」；
 * 4. 审核流水与商品快照 hash 同时留痕，改内容必须产生新的送审记录。
 */
export class MpCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
  ) {}

  // ------------------------------------------------------------ 商户端

  async listProducts(
    payload: MpMerchantTokenPayload,
    query: ProductListQuery,
  ): Promise<PageResponse<MpProduct>> {
    const { merchant } = await this.merchants.session(payload);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const keyword = String(query.keyword || '').trim();
    const status = String(query.status || '').trim();
    const where = {
      marketId: merchant.marketId,
      merchantId: merchant.id,
      ...(status && PRODUCT_STATUS.has(status) ? { status } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpProduct.count({ where }),
      this.prisma.mpProduct.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const names = await this.names(merchant.marketId, rows);
    return {
      list: rows.map((row) =>
        this.productView(
          row,
          names.shops.get(row.shopId) ?? '',
          names.categories.get(row.categoryId) ?? '',
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async productDetail(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpProductDetail> {
    const { merchant } = await this.merchants.session(payload);
    const product = await this.requireProduct(
      merchant.marketId,
      merchant.id,
      id,
    );
    const [skus, names] = await Promise.all([
      this.prisma.mpProductSku.findMany({
        where: { productId: product.id },
        orderBy: { id: 'asc' },
      }),
      this.names(merchant.marketId, [product]),
    ]);
    return {
      product: this.productView(
        product,
        names.shops.get(product.shopId) ?? '',
        names.categories.get(product.categoryId) ?? '',
      ),
      skus: skus.map((sku) => this.skuView(sku)),
    };
  }

  async saveProduct(
    payload: MpMerchantTokenPayload,
    body: MpProductSaveBody,
  ): Promise<MpProductDetail> {
    const { merchant, market, shop } = await this.merchants.session(
      payload,
      true,
    );
    if (!shop) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '尚未分配店铺，请联系市场运营方',
      );
    }
    if (body.categoryId > 0) {
      const category = await this.prisma.mpCategory.findFirst({
        where: { id: body.categoryId, marketId: market.id },
        select: { id: true },
      });
      if (!category) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选类目不存在，请刷新后重选',
        );
      }
    }
    const existing =
      body.id > 0
        ? await this.requireProduct(merchant.marketId, merchant.id, body.id)
        : null;
    if (existing?.status === 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '商品审核中，请等待平台审核结果后再修改',
      );
    }
    const skus = body.skus.map((item) => ({
      ...item,
      uniqueId: skuUniqueId(item.specValues) || item.skuName.trim(),
    }));
    const duplicated = skus.filter(
      (sku) =>
        sku.uniqueId &&
        skus.filter((other) => other.uniqueId === sku.uniqueId).length > 1,
    );
    if (
      duplicated.length > 0 ||
      (skus.length > 0 && skus.some((sku) => !sku.uniqueId))
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '规格组合存在重复或缺少规格值，请检查规格定义',
      );
    }
    const enabledSkus = skus.filter((sku) => sku.enabled);
    const price =
      skus.length > 0
        ? Math.min(
            ...(enabledSkus.length > 0 ? enabledSkus : skus).map(
              (sku) => sku.price,
            ),
          )
        : body.price;
    const stock =
      skus.length > 0
        ? enabledSkus.reduce((sum, sku) => sum + sku.stock, 0)
        : body.stock;

    const data = {
      marketId: market.id,
      merchantId: merchant.id,
      shopId: shop.id,
      categoryId: body.categoryId,
      title: body.title,
      subtitle: body.subtitle,
      coverImage: body.coverImage,
      images: body.images,
      detail: body.detail,
      type: body.type,
      price,
      marketPrice: body.marketPrice,
      costPrice: body.costPrice,
      stock,
      unit: body.unit,
      weight: body.weight,
      freightAmount: body.freightAmount,
      specs: body.specs,
      guarantee: body.guarantee,
      // 改内容即退回草稿，必须重新送审；库存/价格类的调整也走同一口径，规则简单可解释
      status: 'DRAFT',
      auditNote: '',
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const product = existing
        ? await tx.mpProduct.update({ where: { id: existing.id }, data })
        : await tx.mpProduct.create({ data });
      if (existing) {
        await tx.mpProductSku.deleteMany({ where: { productId: product.id } });
      }
      if (skus.length > 0) {
        await tx.mpProductSku.createMany({
          data: skus.map((sku) => ({
            marketId: market.id,
            merchantId: merchant.id,
            shopId: shop.id,
            productId: product.id,
            skuName: sku.skuName,
            image: sku.image,
            uniqueId: sku.uniqueId,
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
      }
      return product;
    });
    return this.productDetail(payload, saved.id);
  }

  async setStatus(
    payload: MpMerchantTokenPayload,
    body: MpProductStatusBody,
  ): Promise<MpProduct> {
    const { merchant } = await this.merchants.session(payload, true);
    const product = await this.requireProduct(
      merchant.marketId,
      merchant.id,
      body.id,
    );
    if (body.status === 'ONLINE') {
      if (product.status !== 'OFFLINE') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          product.status === 'PENDING'
            ? '商品审核中，通过后自动上架'
            : '只有审核通过并下架的商品才能重新上架',
        );
      }
    } else if (product.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有在售商品才能下架');
    }
    const updated = await this.prisma.mpProduct.update({
      where: { id: product.id },
      data: { status: body.status },
    });
    const names = await this.names(merchant.marketId, [updated]);
    return this.productView(
      updated,
      names.shops.get(updated.shopId) ?? '',
      names.categories.get(updated.categoryId) ?? '',
    );
  }

  async submit(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpProduct> {
    const { merchant, market } = await this.merchants.session(payload, true);
    const product = await this.requireProduct(
      merchant.marketId,
      merchant.id,
      id,
    );
    if (product.status === 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '商品已在审核中，请勿重复提交',
      );
    }
    if (product.status === 'ONLINE') {
      throw new BusinessException(ErrorCode.CONFLICT, '商品已在售，无需送审');
    }
    const skus = await this.prisma.mpProductSku.findMany({
      where: { productId: product.id },
    });
    if (
      product.type === 'NORMAL' &&
      product.stock <= 0 &&
      skus.every((sku) => sku.stock <= 0)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '商品库存为 0，补充库存后再送审',
      );
    }
    const hash = snapshotHash(product, skus);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.mpProductAudit.create({
        data: {
          marketId: market.id,
          merchantId: merchant.id,
          shopId: product.shopId,
          productId: product.id,
          auditStatus: 'PENDING',
          snapshotHash: hash,
          submitBy: payload.userId.toString(),
        },
      }),
      this.prisma.mpProduct.update({
        where: { id: product.id },
        data: { status: 'PENDING', auditNote: '' },
      }),
    ]);
    const names = await this.names(merchant.marketId, [updated]);
    return this.productView(
      updated,
      names.shops.get(updated.shopId) ?? '',
      names.categories.get(updated.categoryId) ?? '',
    );
  }

  async remove(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<{ ok: boolean; message: string }> {
    const { merchant } = await this.merchants.session(payload, true);
    const product = await this.requireProduct(
      merchant.marketId,
      merchant.id,
      id,
    );
    if (product.status === 'ONLINE' || product.status === 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '在售或审核中的商品不能删除，请先下架',
      );
    }
    await this.prisma.$transaction([
      this.prisma.mpProductSku.deleteMany({ where: { productId: product.id } }),
      this.prisma.mpProduct.delete({ where: { id: product.id } }),
    ]);
    return { ok: true, message: '商品已删除' };
  }

  // ------------------------------------------------------------ 平台端

  async platformList(
    marketId: number,
    query: ProductListQuery & { shopId?: number },
  ): Promise<PageResponse<MpProduct>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const keyword = String(query.keyword || '').trim();
    const status = String(query.status || '').trim();
    const shopId = Number(query.shopId || 0);
    const where = {
      marketId,
      ...(status && PRODUCT_STATUS.has(status) ? { status } : {}),
      ...(shopId > 0 ? { shopId } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpProduct.count({ where }),
      this.prisma.mpProduct.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const names = await this.names(marketId, rows);
    return {
      list: rows.map((row) =>
        this.productView(
          row,
          names.shops.get(row.shopId) ?? '',
          names.categories.get(row.categoryId) ?? '',
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async audits(
    marketId: number,
    query: AuditListQuery,
  ): Promise<PageResponse<MpProductAudit>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const auditStatus = String(query.auditStatus || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(auditStatus ? { auditStatus } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpProductAudit.count({ where }),
      this.prisma.mpProductAudit.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [products, shops, merchants] = await Promise.all([
      this.prisma.mpProduct.findMany({
        where: { id: { in: rows.map((row) => row.productId) } },
        select: { id: true, title: true },
      }),
      this.prisma.mpShop.findMany({
        where: { id: { in: rows.map((row) => row.shopId) } },
        select: { id: true, name: true },
      }),
      this.prisma.mpMerchant.findMany({
        where: { id: { in: rows.map((row) => row.merchantId) } },
        select: { id: true, name: true },
      }),
    ]);
    const productMap = new Map(
      products.map((row) => [row.id, row.title] as const),
    );
    const shopMap = new Map(shops.map((row) => [row.id, row.name] as const));
    const merchantMap = new Map(
      merchants.map((row) => [row.id, row.name] as const),
    );
    const list = rows
      .map((row) => ({
        id: row.id,
        productId: row.productId,
        productTitle: productMap.get(row.productId) ?? '',
        shopId: row.shopId,
        shopName: shopMap.get(row.shopId) ?? '',
        merchantName: merchantMap.get(row.merchantId) ?? '',
        auditStatus: row.auditStatus as MpProductAudit['auditStatus'],
        reason: row.reason,
        snapshotHash: row.snapshotHash,
        submitBy: row.submitBy,
        auditBy: row.auditBy,
        auditAt: iso(row.auditAt),
        createdAt: iso(row.createdAt),
      }))
      .filter((item) => !keyword || item.productTitle.includes(keyword));
    return { list, total, page, pageSize };
  }

  async audit(
    marketId: number,
    auditor: string,
    body: MpProductAuditBody,
  ): Promise<MpProductAudit> {
    const row = await this.prisma.mpProductAudit.findFirst({
      where: { id: body.id, marketId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '审核记录不存在');
    }
    if (row.auditStatus !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该商品已审核，请刷新列表',
      );
    }
    const product = await this.prisma.mpProduct.findFirst({
      where: { id: row.productId, marketId },
    });
    if (!product) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已删除');
    }
    if (!body.approve && !body.reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '驳回必须填写原因，让商户知道怎么改',
      );
    }
    const now = new Date();
    const [, updatedProduct] = await this.prisma.$transaction([
      this.prisma.mpProductAudit.update({
        where: { id: row.id },
        data: {
          auditStatus: body.approve ? 'APPROVED' : 'REJECTED',
          reason: body.reason,
          auditBy: auditor,
          auditAt: now,
        },
      }),
      this.prisma.mpProduct.update({
        where: { id: product.id },
        data: body.approve
          ? { status: 'ONLINE', auditNote: '' }
          : { status: 'REJECTED', auditNote: body.reason },
      }),
    ]);
    void updatedProduct;
    return {
      id: row.id,
      productId: row.productId,
      productTitle: product.title,
      shopId: row.shopId,
      shopName:
        (
          await this.prisma.mpShop.findUnique({
            where: { id: row.shopId },
            select: { name: true },
          })
        )?.name ?? '',
      merchantName:
        (
          await this.prisma.mpMerchant.findUnique({
            where: { id: row.merchantId },
            select: { name: true },
          })
        )?.name ?? '',
      auditStatus: body.approve ? 'APPROVED' : 'REJECTED',
      reason: body.reason,
      snapshotHash: row.snapshotHash,
      submitBy: row.submitBy,
      auditBy: auditor,
      auditAt: iso(now),
      createdAt: iso(row.createdAt),
    };
  }

  // ------------------------------------------------------------ 内部

  private async requireProduct(
    marketId: number,
    merchantId: number,
    id: number,
  ): Promise<MpProductRow> {
    const product = await this.prisma.mpProduct.findFirst({
      where: { id, marketId, merchantId },
    });
    if (!product) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    }
    return product;
  }

  private async names(marketId: number, rows: MpProductRow[]) {
    const shopIds = [...new Set(rows.map((row) => row.shopId))];
    const categoryIds = [
      ...new Set(rows.map((row) => row.categoryId).filter((id) => id > 0)),
    ];
    const [shops, categories] = await Promise.all([
      shopIds.length > 0
        ? this.prisma.mpShop.findMany({
            where: { id: { in: shopIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      categoryIds.length > 0
        ? this.prisma.mpCategory.findMany({
            where: { id: { in: categoryIds }, marketId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      shops: new Map(shops.map((row) => [row.id, row.name] as const)),
      categories: new Map(categories.map((row) => [row.id, row.name] as const)),
    };
  }

  private productView(
    row: MpProductRow,
    shopName: string,
    categoryName: string,
  ): MpProduct {
    return {
      id: row.id,
      marketId: row.marketId,
      merchantId: row.merchantId,
      shopId: row.shopId,
      shopName,
      categoryId: row.categoryId,
      categoryName,
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      images: stringsOf(row.images),
      detail: row.detail,
      type: row.type === 'VIRTUAL' ? 'VIRTUAL' : 'NORMAL',
      price: decimalOf(row.price) ?? 0,
      marketPrice: decimalOf(row.marketPrice) ?? 0,
      costPrice: decimalOf(row.costPrice) ?? 0,
      stock: row.stock,
      sales: row.sales,
      unit: row.unit,
      weight: Number(row.weight),
      freightAmount: decimalOf(row.freightAmount) ?? 0,
      specs: specsOf(row.specs),
      guarantee: stringsOf(row.guarantee),
      status: row.status as MpProduct['status'],
      auditNote: row.auditNote,
      sortOrder: row.sortOrder,
      isHot: row.isHot,
      isNew: row.isNew,
      reviewCount: row.reviewCount,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private skuView(row: MpProductSkuRow): MpProductSku {
    const values = jsonObject(row.specValues);
    return {
      id: row.id,
      skuName: row.skuName,
      image: row.image,
      uniqueId: row.uniqueId,
      specValues: Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, textOf(value)]),
      ),
      price: decimalOf(row.price) ?? 0,
      marketPrice: decimalOf(row.marketPrice) ?? 0,
      costPrice: decimalOf(row.costPrice) ?? 0,
      stock: row.stock,
      sales: row.sales,
      weight: Number(row.weight),
      barcode: row.barcode,
      enabled: row.enabled,
    };
  }
}
