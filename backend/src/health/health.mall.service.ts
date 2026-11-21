import {
  type HealthAftersaleHandleBody,
  type HealthAftersaleRow,
  type HealthDrugRow,
  type HealthDrugSaveBody,
  type HealthExpressCompanyRow,
  type HealthGoodsCategoryRow,
  type HealthGoodsCategorySaveBody,
  type HealthGoodsRow,
  type HealthGoodsSaveBody,
  type HealthShippingTemplateRow,
  type HealthShippingTemplateSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  jsonObj,
  makeNo,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';

const GOODS_KINDS = new Set(['DRUG', 'DEVICE', 'CONSUMABLE', 'HEALTH_PRODUCT']);
const AFTERSALE_KINDS = new Set([
  'REFUND',
  'RETURN_REFUND',
  'EXCHANGE',
  'RESEND',
  'REPAIR',
]);
const AFTERSALE_STATUSES = new Set([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RETURNING',
  'RETURNED',
  'REFUNDED',
  'CLOSED',
]);

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

type ShippingRules = {
  freeOverCents: number;
  firstFeeCents: number;
  additionalFeeCents: number;
  regions: {
    province: string;
    firstFeeCents: number;
    additionalFeeCents: number;
  }[];
};

type GoodsSkuView = {
  id: number;
  name: string;
  specs: { key: string; label: string; value: string }[];
  priceCents: number;
  stock: number;
  sales: number;
};

/**
 * 实物商城：商品、药品字典、物流与售后（C9）。
 *
 * 口径：
 * 1. 商品 kind 决定展示分组，但处方的硬门禁只认药品字典的 rxType=RX；
 *    商品上的 `isRx` 是冗余快照，保存时以关联药品为准。
 * 2. 多规格（skuMode）时库存落在 SKU 行，商品行库存仅作汇总展示；
 *    单规格时库存落在商品行。调库存按 skuId 是否大于 0 分流。
 * 3. 运费模板把首件/续件/包邮门槛全部放进 rulesJson，避免为规则再加表。
 * 4. 售后走本店台账，退款只回写订单的退款金额与支付状态，不直接动钱包。
 */
export class HealthMallService {
  constructor(private readonly prisma: PrismaService) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      keyword: clip(query.keyword, 60),
    };
  }

  // ---------- 商品分类 ----------

  async goodsCategories(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'goods');
    const [rows, counts] = await Promise.all([
      this.prisma.healthGoodsCategory.findMany({
        where: { shopId: ctx.shop.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthGoods.groupBy({
        by: ['categoryId'],
        where: { shopId: ctx.shop.id },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );
    return rows.map<HealthGoodsCategoryRow>((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
      sort: row.sort,
      status: row.status === 'ON' ? 'ON' : 'OFF',
      goodsCount: countMap.get(row.id) ?? 0,
    }));
  }

  async goodsCategorySave(
    user: CurrentUser,
    body: HealthGoodsCategorySaveBody,
  ): Promise<HealthGoodsCategoryRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    if (body.parentId > 0) {
      const parent = await this.prisma.healthGoodsCategory.findFirst({
        where: { id: body.parentId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!parent)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '上级分类不存在');
      if (parent.id === body.id)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '上级分类不能是自己',
        );
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthGoodsCategory.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品分类不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      parentId: body.parentId,
      name: body.name,
      icon: body.icon,
      sort: body.sort,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthGoodsCategory.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthGoodsCategory.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.goodsCategory.update' : 'health.goodsCategory.create',
      `shop=${ctx.shop.id} category=${row.id}`,
    );
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
      sort: row.sort,
      status: row.status === 'ON' ? 'ON' : 'OFF',
      goodsCount: await this.prisma.healthGoods.count({
        where: { shopId: ctx.shop.id, categoryId: row.id },
      }),
    };
  }

  async goodsCategoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthGoodsCategory.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品分类不存在');
    const [children, goods] = await Promise.all([
      this.prisma.healthGoodsCategory.count({
        where: { shopId: ctx.shop.id, parentId: row.id },
      }),
      this.prisma.healthGoods.count({
        where: { shopId: ctx.shop.id, categoryId: row.id },
      }),
    ]);
    if (children > 0)
      throw new BusinessException(ErrorCode.CONFLICT, '请先删除下级分类');
    if (goods > 0)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '分类下还有商品，不能删除',
      );
    await this.prisma.healthGoodsCategory.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.goodsCategory.remove',
      `shop=${ctx.shop.id} category=${row.id}`,
    );
    return { ok: true, message: '商品分类已删除' };
  }

  // ---------- 商品 ----------

  private async goodsRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      kind: string;
      categoryId: number;
      imagesJson: unknown;
      coverImage: string;
      drugId: number;
      isRx: boolean;
      spec: string;
      unit: string;
      priceCents: number;
      originPriceCents: number;
      costCents: number;
      stock: number;
      sales: number;
      skuMode: boolean;
      detailHtml: string;
      shippingMode: string;
      shippingTemplateId: number;
      recommend: boolean;
      auditStatus: string;
      status: string;
      createdAt: Date;
    }[],
  ): Promise<HealthGoodsRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const categoryIds = [
      ...new Set(rows.map((row) => row.categoryId).filter((id) => id > 0)),
    ];
    const drugIds = [
      ...new Set(rows.map((row) => row.drugId).filter((id) => id > 0)),
    ];
    const [categories, drugs, skus, reviews] = await Promise.all([
      categoryIds.length
        ? this.prisma.healthGoodsCategory.findMany({
            where: { shopId, id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [],
      drugIds.length
        ? this.prisma.healthDrug.findMany({
            where: { shopId, id: { in: drugIds } },
            select: {
              id: true,
              genericName: true,
              approvalNo: true,
              rxType: true,
              spec: true,
              unit: true,
            },
          })
        : [],
      this.prisma.healthGoodsSku.findMany({
        where: { shopId, goodsId: { in: ids } },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthReview.groupBy({
        by: ['targetId'],
        where: {
          shopId,
          targetType: 'GOODS',
          targetId: { in: ids },
          status: 'PUBLISHED',
        },
        _count: { _all: true },
        _avg: { score: true },
      }),
    ]);
    const categoryMap = new Map(categories.map((row) => [row.id, row.name]));
    const drugMap = new Map(drugs.map((row) => [row.id, row]));
    const skuMap = new Map<number, GoodsSkuView[]>();
    for (const sku of skus) {
      const list = skuMap.get(sku.goodsId) ?? [];
      list.push({
        id: sku.id,
        name: sku.specText,
        specs: jsonArr<GoodsSkuView['specs'][number]>(sku.specsJson).filter(
          (item) => item && typeof item.value === 'string',
        ),
        priceCents: sku.priceCents,
        stock: sku.stock,
        sales: sku.sales,
      });
      skuMap.set(sku.goodsId, list);
    }
    const reviewMap = new Map(
      reviews.map((row) => [
        row.targetId,
        { count: row._count._all, score: row._avg.score ?? 0 },
      ]),
    );
    return rows.map((row) => {
      const images = jsonArr<unknown>(row.imagesJson)
        .map((item) => String(item))
        .filter(Boolean);
      const drug = drugMap.get(row.drugId);
      const review = reviewMap.get(row.id);
      return {
        id: row.id,
        name: row.name,
        kind: GOODS_KINDS.has(row.kind) ? row.kind : 'HEALTH_PRODUCT',
        categoryId: row.categoryId,
        categoryName: categoryMap.get(row.categoryId) ?? '',
        images,
        mainImage: row.coverImage || images[0] || '',
        drugId: row.drugId,
        drugName: drug?.genericName ?? '',
        approvalNo: drug?.approvalNo ?? '',
        prescriptionRequired: drug ? drug.rxType === 'RX' : row.isRx,
        spec: row.spec || drug?.spec || '',
        unit: row.unit || drug?.unit || '件',
        priceCents: row.priceCents,
        originPriceCents: row.originPriceCents,
        costCents: row.costCents,
        stock: row.stock,
        sales: row.sales,
        skuMode: row.skuMode,
        skus: skuMap.get(row.id) ?? [],
        detail: row.detailHtml,
        shippingMode: row.shippingMode,
        shippingTemplateId: row.shippingTemplateId,
        recommend: row.recommend,
        auditStatus: ['PENDING', 'APPROVED', 'REJECTED'].includes(
          row.auditStatus,
        )
          ? row.auditStatus
          : 'APPROVED',
        status: row.status === 'ON' ? 'ON' : 'OFF',
        reviewCount: review?.count ?? 0,
        reviewScore: Math.round((review?.score ?? 0) * 10) / 10,
        createdAt: toIso(row.createdAt),
      } as HealthGoodsRow;
    });
  }

  async goods(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'goods');
    const categoryId = intIn(query.categoryId, 0, 2_000_000_000, 0);
    const kind = strOf(query.kind, 24, 'all');
    const prescriptionOnly = intIn(query.prescriptionOnly, 0, 1, 0) === 1;
    const lowStock = intIn(query.lowStock, 0, 1, 0) === 1;
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (categoryId > 0) where.categoryId = categoryId;
    if (kind && kind !== 'all' && GOODS_KINDS.has(kind)) where.kind = kind;
    if (prescriptionOnly) where.isRx = true;
    if (lowStock) where.stock = { lte: 10 };
    if (keyword) where.name = { contains: keyword };
    const status = strOf(query.status, 8, 'all');
    if (status === 'ON' || status === 'OFF') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthGoods.findMany({
        where,
        orderBy: [{ recommend: 'desc' }, { sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthGoods.count({ where }),
    ]);
    return {
      list: await this.goodsRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async goodsDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthGoodsRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'goods');
    const row = await this.prisma.healthGoods.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const [mapped] = await this.goodsRows(ctx.shop.id, [row]);
    return mapped;
  }

  async goodsSave(
    user: CurrentUser,
    body: HealthGoodsSaveBody,
  ): Promise<HealthGoodsRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    if (body.categoryId > 0) {
      const category = await this.prisma.healthGoodsCategory.findFirst({
        where: { id: body.categoryId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!category)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '商品分类不存在');
    }
    if (body.shippingTemplateId > 0) {
      const template = await this.prisma.healthShippingTemplate.findFirst({
        where: { id: body.shippingTemplateId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!template)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '运费模板不存在');
    }
    let isRx = body.kind === 'DRUG' && body.prescriptionRequired;
    if (body.drugId > 0) {
      const drug = await this.prisma.healthDrug.findFirst({
        where: { id: body.drugId, shopId: ctx.shop.id },
        select: { id: true, rxType: true },
      });
      if (!drug)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '关联药品不存在');
      isRx = drug.rxType === 'RX' || isRx;
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthGoods.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    }
    const images = body.images.filter(Boolean);
    const skuStock = body.skus.reduce((sum, sku) => sum + sku.stock, 0);
    const data = {
      shopId: ctx.shop.id,
      categoryId: body.categoryId,
      name: body.name,
      kind: body.kind,
      imagesJson: images,
      coverImage: images[0] ?? '',
      detailHtml: body.detail,
      priceCents: body.priceCents,
      originPriceCents: body.originPriceCents,
      costCents: body.costCents,
      stock: body.skuMode ? skuStock : body.stock,
      unit: body.unit,
      spec: body.spec,
      skuMode: body.skuMode,
      isRx,
      drugId: body.drugId,
      shippingMode: body.shippingMode,
      shippingTemplateId: body.shippingTemplateId,
      recommend: body.recommend,
      auditStatus: existing ? existing.auditStatus : 'APPROVED',
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthGoods.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthGoods.create({ data });
    if (body.skuMode && body.skus.length) {
      await this.prisma.$transaction([
        this.prisma.healthGoodsSku.deleteMany({
          where: { shopId: ctx.shop.id, goodsId: row.id },
        }),
        this.prisma.healthGoodsSku.createMany({
          data: body.skus.map((sku, index) => ({
            shopId: ctx.shop.id,
            goodsId: row.id,
            specText: sku.name,
            specsJson: sku.specs,
            priceCents: sku.priceCents,
            stock: sku.stock,
            sort: index,
            status: 'ON',
          })),
        }),
      ]);
    }
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.goods.update' : 'health.goods.create',
      `shop=${ctx.shop.id} goods=${row.id} skus=${body.skuMode ? body.skus.length : 0}`,
    );
    const [mapped] = await this.goodsRows(ctx.shop.id, [row]);
    return mapped;
  }

  async goodsStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string; reason: string },
  ): Promise<HealthGoodsRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthGoods.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const status =
      body.status === 'ON' || body.status === 'OFF' ? body.status : null;
    if (!status)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '状态只能是 ON 或 OFF',
      );
    const updated = await this.prisma.healthGoods.update({
      where: { id: row.id },
      data: { status },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.goods.status',
      `shop=${ctx.shop.id} goods=${row.id} status=${status} reason=${body.reason}`,
    );
    const [mapped] = await this.goodsRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async goodsRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthGoods.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const used = await this.prisma.healthOrderItem.count({
      where: { shopId: ctx.shop.id, itemType: 'GOODS', refId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该商品已产生订单，不能删除，请改为下架',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthGoodsSku.deleteMany({
        where: { shopId: ctx.shop.id, goodsId: row.id },
      }),
      this.prisma.healthCart.deleteMany({
        where: { shopId: ctx.shop.id, goodsId: row.id },
      }),
      this.prisma.healthGoods.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.goods.remove',
      `shop=${ctx.shop.id} goods=${row.id}`,
    );
    return { ok: true, message: '商品已删除' };
  }

  async goodsStockAdjust(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      skuId: number;
      delta: number;
      note: string;
    },
  ): Promise<HealthGoodsRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'goods');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthGoods.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    if (body.skuId > 0) {
      const sku = await this.prisma.healthGoodsSku.findFirst({
        where: { id: body.skuId, shopId: ctx.shop.id, goodsId: row.id },
      });
      if (!sku)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '商品规格不存在');
      const next = sku.stock + body.delta;
      if (next < 0)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '调整后库存不能小于 0',
        );
      await this.prisma.healthGoodsSku.update({
        where: { id: sku.id },
        data: { stock: next },
      });
      const sum = await this.prisma.healthGoodsSku.aggregate({
        where: { shopId: ctx.shop.id, goodsId: row.id },
        _sum: { stock: true },
      });
      const updated = await this.prisma.healthGoods.update({
        where: { id: row.id },
        data: { stock: sum._sum.stock ?? 0 },
      });
      await audit(
        this.prisma,
        user.userId,
        'health.goods.stock',
        `shop=${ctx.shop.id} goods=${row.id} sku=${sku.id} delta=${body.delta} note=${body.note}`,
      );
      const [mapped] = await this.goodsRows(ctx.shop.id, [updated]);
      return mapped;
    }
    const next = row.stock + body.delta;
    if (next < 0)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '调整后库存不能小于 0',
      );
    const updated = await this.prisma.healthGoods.update({
      where: { id: row.id },
      data: { stock: next },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.goods.stock',
      `shop=${ctx.shop.id} goods=${row.id} delta=${body.delta} note=${body.note}`,
    );
    const [mapped] = await this.goodsRows(ctx.shop.id, [updated]);
    return mapped;
  }

  // ---------- 药品字典 ----------

  private drugRow(row: {
    id: number;
    genericName: string;
    brandName: string;
    spec: string;
    unit: string;
    manufacturer: string;
    approvalNo: string;
    rxType: string;
    otcClass: string;
    category: string;
    priceCents: number;
    stock: number;
    indication: string;
    status: string;
  }): HealthDrugRow {
    return {
      id: row.id,
      genericName: row.genericName,
      brandName: row.brandName,
      spec: row.spec,
      unit: row.unit,
      manufacturer: row.manufacturer,
      approvalNo: row.approvalNo,
      prescriptionRequired: row.rxType === 'RX',
      otcClass: row.otcClass || (row.rxType === 'RX' ? 'RX' : row.rxType),
      category: row.category,
      priceCents: row.priceCents,
      stock: row.stock,
      intro: row.indication,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    };
  }

  async drugs(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'drugs');
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (intIn(query.prescriptionOnly, 0, 1, 0) === 1) where.rxType = 'RX';
    if (keyword) where.genericName = { contains: keyword };
    const status = strOf(query.status, 8, 'all');
    if (status === 'ON' || status === 'OFF') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthDrug.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthDrug.count({ where }),
    ]);
    return {
      list: rows.map((row) => this.drugRow(row)),
      total,
      page,
      pageSize,
    };
  }

  async drugSave(
    user: CurrentUser,
    body: HealthDrugSaveBody,
  ): Promise<HealthDrugRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'drugs');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthDrug.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '药品不存在');
    }
    const rxType = body.prescriptionRequired
      ? 'RX'
      : body.otcClass.includes('B')
        ? 'OTC_B'
        : body.otcClass === 'RX'
          ? 'RX'
          : 'OTC_A';
    const data = {
      shopId: ctx.shop.id,
      name: body.brandName || body.genericName,
      genericName: body.genericName,
      brandName: body.brandName,
      spec: body.spec,
      unit: body.unit,
      manufacturer: body.manufacturer,
      approvalNo: body.approvalNo,
      rxType,
      otcClass: body.otcClass,
      category: body.category,
      priceCents: body.priceCents,
      stock: body.stock,
      indication: body.intro,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthDrug.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthDrug.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.drug.update' : 'health.drug.create',
      `shop=${ctx.shop.id} drug=${row.id} rx=${rxType}`,
    );
    return this.drugRow(row);
  }

  async drugRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'drugs');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthDrug.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '药品不存在');
    const [goodsUsed, rxUsed] = await Promise.all([
      this.prisma.healthGoods.count({
        where: { shopId: ctx.shop.id, drugId: row.id },
      }),
      this.prisma.healthPrescriptionItem.count({
        where: { shopId: ctx.shop.id, drugId: row.id },
      }),
    ]);
    if (goodsUsed > 0 || rxUsed > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '药品已被商品或处方引用，不能删除，请改为停用',
      );
    }
    await this.prisma.healthDrug.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.drug.remove',
      `shop=${ctx.shop.id} drug=${row.id}`,
    );
    return { ok: true, message: '药品已删除' };
  }

  // ---------- 物流 ----------

  async expressCompanies(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'logistics');
    const rows = await this.prisma.healthExpressCompany.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map<HealthExpressCompanyRow>((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      phone: row.phone,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    }));
  }

  async expressSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      name: string;
      code: string;
      phone: string;
      status: string;
    },
  ): Promise<HealthExpressCompanyRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'logistics');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthExpressCompany.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递公司不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      code: body.code,
      phone: body.phone,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthExpressCompany.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthExpressCompany.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.express.update' : 'health.express.create',
      `shop=${ctx.shop.id} express=${row.id}`,
    );
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      phone: row.phone,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    };
  }

  async expressRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'logistics');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthExpressCompany.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递公司不存在');
    await this.prisma.healthExpressCompany.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.express.remove',
      `shop=${ctx.shop.id} express=${row.id}`,
    );
    return { ok: true, message: '快递公司已删除' };
  }

  private shippingRulesOf(value: unknown): ShippingRules {
    const obj = jsonObj<Record<string, unknown>>(value, {});
    return {
      freeOverCents: numOf(obj.freeOverCents),
      firstFeeCents: numOf(obj.firstFeeCents),
      additionalFeeCents: numOf(obj.additionalFeeCents),
      regions: jsonArr<ShippingRules['regions'][number]>(obj.regions)
        .filter((item) => item && typeof item.province === 'string')
        .map((item) => ({
          province: item.province,
          firstFeeCents: numOf(item.firstFeeCents),
          additionalFeeCents: numOf(item.additionalFeeCents),
        })),
    };
  }

  async shippingTemplates(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'logistics');
    const rows = await this.prisma.healthShippingTemplate.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: { id: 'asc' },
    });
    return rows.map<HealthShippingTemplateRow>((row) => {
      const rules = this.shippingRulesOf(row.rulesJson);
      return {
        id: row.id,
        name: row.name,
        freeOverCents: rules.freeOverCents,
        firstFeeCents: rules.firstFeeCents,
        additionalFeeCents: rules.additionalFeeCents,
        regions: rules.regions,
        status: row.status === 'ON' ? 'ON' : 'OFF',
      };
    });
  }

  async shippingTemplateSave(
    user: CurrentUser,
    body: HealthShippingTemplateSaveBody,
  ): Promise<HealthShippingTemplateRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'logistics');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthShippingTemplate.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '运费模板不存在');
    }
    const rules: ShippingRules = {
      freeOverCents: body.freeOverCents,
      firstFeeCents: body.firstFeeCents,
      additionalFeeCents: body.additionalFeeCents,
      regions: body.regions,
    };
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      rulesJson: rules,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthShippingTemplate.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthShippingTemplate.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.shipping.update' : 'health.shipping.create',
      `shop=${ctx.shop.id} template=${row.id} regions=${body.regions.length}`,
    );
    return {
      id: row.id,
      name: row.name,
      freeOverCents: body.freeOverCents,
      firstFeeCents: body.firstFeeCents,
      additionalFeeCents: body.additionalFeeCents,
      regions: body.regions,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    };
  }

  async shippingTemplateRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'logistics');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthShippingTemplate.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '运费模板不存在');
    const used = await this.prisma.healthGoods.count({
      where: { shopId: ctx.shop.id, shippingTemplateId: row.id },
    });
    if (used > 0)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '模板已被商品引用，不能删除',
      );
    await this.prisma.healthShippingTemplate.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.shipping.remove',
      `shop=${ctx.shop.id} template=${row.id}`,
    );
    return { ok: true, message: '运费模板已删除' };
  }

  // ---------- 售后 ----------

  async aftersaleRows(
    shopId: number,
    rows: {
      id: number;
      orderId: number;
      customerId: number;
      kind: string;
      reason: string;
      description: string;
      imagesJson: unknown;
      amountCents: number;
      refundCents: number;
      status: string;
      auditNote: string;
      returnExpress: string;
      handledAt: Date | null;
      createdAt: Date;
    }[],
  ): Promise<HealthAftersaleRow[]> {
    if (!rows.length) return [];
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const [orders, customers] = await Promise.all([
      this.prisma.healthOrder.findMany({
        where: { shopId, id: { in: orderIds } },
        select: { id: true, orderNo: true },
      }),
      this.prisma.healthCustomer.findMany({
        where: { shopId, id: { in: customerIds } },
        select: { id: true, nickname: true, phone: true },
      }),
    ]);
    const orderMap = new Map(orders.map((row) => [row.id, row.orderNo]));
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    return rows.map((row) => {
      const customer = customerMap.get(row.customerId);
      return {
        id: row.id,
        orderId: row.orderId,
        orderNo: orderMap.get(row.orderId) ?? '',
        customerId: row.customerId,
        customerName:
          customer?.nickname || customer?.phone || `顾客${row.customerId}`,
        kind: (AFTERSALE_KINDS.has(row.kind)
          ? row.kind
          : 'REFUND') as HealthAftersaleRow['kind'],
        reason: row.reason,
        description: row.description,
        images: jsonArr<unknown>(row.imagesJson)
          .map((item) => String(item))
          .filter(Boolean),
        applyAmountCents: row.amountCents,
        refundAmountCents: row.refundCents,
        status: (AFTERSALE_STATUSES.has(row.status)
          ? row.status
          : 'PENDING') as HealthAftersaleRow['status'],
        shopReply: row.auditNote,
        returnTrackingNo: row.returnExpress,
        handledAt: toIso(row.handledAt),
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async aftersales(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const status = strOf(query.aftersaleStatus, 24, 'all');
    const kind = strOf(query.kind, 24, 'all');
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (status && status !== 'all') where.status = status;
    if (kind && kind !== 'all') where.kind = kind;
    const [rows, total] = await Promise.all([
      this.prisma.healthAftersale.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthAftersale.count({ where }),
    ]);
    return {
      list: await this.aftersaleRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async aftersaleDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthAftersaleRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const { id } = query as { shopId: number; id: number };
    const row = await this.prisma.healthAftersale.findFirst({
      where: { id: Number(id), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    const [mapped] = await this.aftersaleRows(ctx.shop.id, [row]);
    return mapped;
  }

  async aftersaleHandle(
    user: CurrentUser,
    body: HealthAftersaleHandleBody,
  ): Promise<HealthAftersaleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'orders');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthAftersale.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    if (row.status === 'CLOSED' || row.status === 'CANCELLED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '售后单已结束，不能再处理',
      );
    }
    if (body.action === 'APPROVE' && row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待处理的售后单可以同意',
      );
    }
    if (body.action === 'REJECT' && row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待处理的售后单可以驳回',
      );
    }
    if (
      body.action === 'RECEIVED' &&
      row.status !== 'APPROVED' &&
      row.status !== 'RETURNING'
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有已同意/退货中的售后单可以确认收货',
      );
    }
    const now = new Date();
    const data: Record<string, unknown> = {
      auditBy: user.username ?? String(user.userId),
      auditAt: now,
      handledAt: now,
    };
    if (body.reply) data.auditNote = body.reply;
    if (body.action === 'APPROVE') {
      data.status = 'APPROVED';
      data.refundCents = body.refundAmountCents || row.amountCents;
    } else if (body.action === 'REJECT') {
      data.status = 'REJECTED';
      data.refundCents = 0;
    } else if (body.action === 'RECEIVED') {
      data.status = 'RETURNED';
    } else {
      const refund = body.refundAmountCents || row.refundCents;
      if (refund > 0) {
        data.status = 'REFUNDED';
        data.refundCents = refund;
        const order = await this.prisma.healthOrder.findFirst({
          where: { id: row.orderId, shopId: ctx.shop.id },
        });
        if (order) {
          const totalRefund = order.refundAmountCents + refund;
          await this.prisma.healthOrder.update({
            where: { id: order.id },
            data: {
              refundAmountCents: totalRefund,
              refundNo: order.refundNo || makeNo('RF'),
              refundedAt: now,
              payStatus:
                totalRefund >= order.payAmountCents
                  ? 'REFUNDED'
                  : order.payStatus,
            },
          });
        }
      } else {
        data.status = 'CLOSED';
      }
    }
    const updated = await this.prisma.healthAftersale.update({
      where: { id: row.id },
      data: data as never,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.aftersale.handle',
      `shop=${ctx.shop.id} aftersale=${row.id} action=${body.action} refund=${numOf(data.refundCents)}`,
    );
    const [mapped] = await this.aftersaleRows(ctx.shop.id, [updated]);
    return mapped;
  }
}
