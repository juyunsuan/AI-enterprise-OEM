import {
  type CardShopCategory,
  type CardShopCategorySaveBody,
  type CardShopGoods,
  type CardShopGoodsSaveBody,
  type CardShopGoodsStatus,
  type CardShopStock,
  type CardShopToggles,
  type CardShopWholesaleTier,
} from '@enterprise/contracts';
import { CARD_SHOP_DEFAULT_TOGGLES } from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteContext } from './card-shop.site-context';
import type { CardShopSiteService } from './card-shop.site.service';
import {
  amount,
  cardFormat,
  clip,
  contactMode,
  goodsStatus,
  hashSecret,
  intIn,
  iso,
  jsonInput,
  jsonList,
  mergeJson,
  pageArgs,
  stockLevel,
  STOCK_LEVEL_LABELS,
  takeCardMode,
  textOf,
  toCents,
  verifySecret,
} from './card-shop.shared';

type ProductRow = {
  id: number;
  siteId: number;
  categoryId: number;
  name: string;
  subtitle: string;
  coverImage: string;
  images: unknown;
  price: unknown;
  marketPrice: unknown;
  wholesaleTiers: unknown;
  limitQuantity: number;
  maxQuantity: number;
  stockWarn: number;
  couponEnabled: boolean;
  takeCardMode: string;
  visitPassword: string;
  contactMode: string;
  notifyFlags: unknown;
  cardFormat: string;
  intro: string;
  detail: string;
  remark: string;
  cardOrderMode: string;
  hot: boolean;
  sort: number;
  viewCount: number;
  soldCount: number;
  status: string;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StockCounts = { available: number; locked: number; sold: number };

const EMPTY_STOCK: StockCounts = { available: 0, locked: 0, sold: 0 };

/** 访问密码摘要的盐：绑站点与商品，拿到库也没法跨商品撞库。 */
export const visitPasswordSalt = (siteId: number, goodsId: number) =>
  `card-shop:visit:${siteId}:${goodsId}`;

/** 商品访问密码入库：明文只在这一句里出现，空明文写空串表示「未开启」。 */
export function hashVisitPassword(
  siteId: number,
  goodsId: number,
  plain: string,
): string {
  const value = String(plain ?? '').trim();
  return value ? hashSecret(visitPasswordSalt(siteId, goodsId), value) : '';
}

/** 校验商品访问密码：未设置（密文空串）一律放行。 */
export function checkVisitPassword(
  siteId: number,
  goodsId: number,
  stored: string,
  input: string,
): boolean {
  const normalized = String(stored ?? '');
  if (!normalized) return true;
  return verifySecret(
    visitPasswordSalt(siteId, goodsId),
    String(input ?? ''),
    normalized,
  );
}

/**
 * 商品（＝一种卡的一池库存）与分类。
 *
 * 卡密商城没有 SKU、规格与物流：价格、限购、取卡规则、联系方式口径、出卡顺序全挂在
 * 商品这一行上，库存真值只在 `card_shop_cards` 上，商品行不存库存数（避免两处真值）。
 */
export class CardShopGoodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
    private readonly platform: CardShopPlatformService,
  ) {}

  // ---------------------------------------------------------------- 分类

  async categories(
    user: CurrentUser,
    siteId: number,
  ): Promise<CardShopCategory[]> {
    const current = await this.sites.requireSite(user, siteId);
    const [rows, counts] = await Promise.all([
      this.prisma.cardShopCategory.findMany({
        where: { siteId: current.siteId },
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      this.prisma.cardShopProduct.groupBy({
        by: ['categoryId'],
        where: { siteId: current.siteId, trashedAt: null },
        _count: { _all: true },
      }),
    ]);
    const totalByCategory = new Map<number, number>();
    for (const item of counts) {
      totalByCategory.set(item.categoryId, item._count._all);
    }
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      icon: row.icon,
      remark: row.remark,
      sort: row.sort,
      status: row.status,
      goodsTotal: totalByCategory.get(row.id) ?? 0,
      createdAt: iso(row.createdAt),
    }));
  }

  /** 买家侧分类：只回启用中的分类，与 bootstrap 的分类形状一致。 */
  async publicCategories(
    site: CardShopSiteContext,
  ): Promise<Array<{ id: number; name: string; icon: string }>> {
    if (site.toggles.categoryPage === false) return [];
    const rows = await this.prisma.cardShopCategory.findMany({
      where: { siteId: site.siteId, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({ id: row.id, name: row.name, icon: row.icon }));
  }

  async saveCategory(
    user: CurrentUser,
    body: CardShopCategorySaveBody,
  ): Promise<CardShopCategory> {
    const current = await this.sites.requireSite(user, body.siteId);
    const data = {
      name: clip(body.name, 60),
      icon: clip(body.icon, 500),
      remark: clip(body.remark, 200),
      sort: intIn(body.sort, 0, 9999, 0),
      status: body.status !== false,
    };
    let id = intIn(body.id, 0, 1_000_000_000, 0);
    if (id > 0) {
      const existing = await this.prisma.cardShopCategory.findFirst({
        where: { id, siteId: current.siteId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
      await this.prisma.cardShopCategory.update({ where: { id }, data });
    } else {
      const created = await this.prisma.cardShopCategory.create({
        data: { siteId: current.siteId, ...data },
      });
      id = created.id;
    }
    const rows = await this.categories(user, current.siteId);
    const found = rows.find((row) => row.id === id);
    if (!found) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '分类保存后读取失败',
      );
    }
    return found;
  }

  /** 删分类不删商品：商品落到「未分类」（categoryId=0），避免误删分类把货扫空。 */
  async removeCategory(user: CurrentUser, siteId: number, id: number) {
    const current = await this.sites.requireSite(user, siteId);
    const category = await this.prisma.cardShopCategory.findFirst({
      where: { id, siteId: current.siteId },
    });
    if (!category)
      throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    await this.prisma.$transaction([
      this.prisma.cardShopProduct.updateMany({
        where: { siteId: current.siteId, categoryId: id },
        data: { categoryId: 0 },
      }),
      this.prisma.cardShopCategory.delete({ where: { id } }),
    ]);
    return { ok: true, message: '分类已删除，其下商品已移到未分类' };
  }

  // ---------------------------------------------------------------- 商品

  async goodsList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopGoods>> {
    const current = await this.sites.requireSite(user, Number(query.siteId));
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = {
      siteId: current.siteId,
      trashedAt: null,
    };
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { subtitle: { contains: keyword } },
      ];
    }
    const categoryId = Number(query.categoryId ?? 0);
    if (Number.isInteger(categoryId) && categoryId > 0)
      where.categoryId = categoryId;
    const status = textOf(query.status);
    if (status) where.status = status;
    const orderBy = [{ sort: 'desc' as const }, { id: 'desc' as const }];

    // 「只看库存预警」的判据在卡表上（可用数 ≤ 阈值），无法用商品表的 where 表达，
    // 所以这一条筛选走商品候选 + 一次卡表 groupBy，再按页切；其余筛选都交给数据库分页。
    if (query.warnOnly === true || textOf(query.warnOnly) === 'true') {
      const candidates = await this.prisma.cardShopProduct.findMany({
        where,
        select: { id: true, stockWarn: true },
        orderBy,
        take: 2000,
      });
      const available = await this.availableByGoods(
        current.siteId,
        candidates.map((row) => row.id),
      );
      const warnIds = candidates
        .filter((row) => {
          const count = available.get(row.id) ?? 0;
          const warn = Math.max(0, row.stockWarn);
          return count <= 0 || (warn > 0 && count <= warn);
        })
        .map((row) => row.id);
      const sliceIds = warnIds.slice(offset, offset + pageSize);
      const rows = await this.prisma.cardShopProduct.findMany({
        where: { siteId: current.siteId, id: { in: sliceIds } },
      });
      const ordered = sliceIds
        .map((id) => rows.find((row) => row.id === id))
        .filter((row): row is (typeof rows)[number] => Boolean(row));
      const stockMap = await this.stockOf(current.siteId, sliceIds);
      return pageOf(
        await this.toGoodsRows(
          current.siteId,
          ordered as unknown as ProductRow[],
          stockMap,
        ),
        warnIds.length,
        page,
        pageSize,
      );
    }

    const [rows, total] = await Promise.all([
      this.prisma.cardShopProduct.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopProduct.count({ where }),
    ]);
    const stockMap = await this.stockOf(
      current.siteId,
      rows.map((row) => row.id),
    );
    return pageOf(
      await this.toGoodsRows(
        current.siteId,
        rows as unknown as ProductRow[],
        stockMap,
      ),
      total,
      page,
      pageSize,
    );
  }

  async goodsDetail(
    user: CurrentUser,
    siteId: number,
    id: number,
  ): Promise<CardShopGoods> {
    const current = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.cardShopProduct.findFirst({
      where: { id, siteId: current.siteId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const stockMap = await this.stockOf(current.siteId, [row.id]);
    const [goods] = await this.toGoodsRows(current.siteId, [row], stockMap);
    if (!goods)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '商品读取失败');
    return goods;
  }

  async saveGoods(
    user: CurrentUser,
    body: CardShopGoodsSaveBody,
  ): Promise<CardShopGoods> {
    const current = await this.sites.requireSite(user, body.siteId);
    const limits = await this.platform.limits();
    this.assertKeywords(limits.keywordFilter, body);
    const price = amount(body.price);
    if (price <= 0 && body.status !== 'DRAFT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '售价必须大于 0 才能上架；请先填价格，或保持草稿',
      );
    }
    const marketPrice = amount(body.marketPrice);
    if (marketPrice > 0 && toCents(marketPrice) < toCents(price)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '划线价不能低于售价，买家看到会比实际价还低',
      );
    }
    const limitQuantity = intIn(body.limitQuantity, 0, 100_000, 0);
    const maxQuantity = intIn(body.maxQuantity, 0, 100_000, 0);
    if (maxQuantity > 0 && limitQuantity > maxQuantity) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `起购数量（${limitQuantity}）不能大于单笔限购（${maxQuantity}）`,
      );
    }
    const categoryId = intIn(body.categoryId, 0, 1_000_000_000, 0);
    if (categoryId > 0) {
      const found = await this.prisma.cardShopCategory.findFirst({
        where: { id: categoryId, siteId: current.siteId },
        select: { id: true },
      });
      if (!found)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所选分类不存在');
    }
    const data = {
      categoryId,
      name: clip(body.name, 200),
      subtitle: clip(body.subtitle, 200),
      coverImage: clip(body.coverImage, 500),
      images: jsonInput(
        jsonList<string>(body.images)
          .map((url) => clip(url, 500))
          .slice(0, 9),
      ),
      price,
      marketPrice,
      wholesaleTiers: jsonInput(normalizeTiers(body.wholesaleTiers, price)),
      limitQuantity,
      maxQuantity,
      stockWarn: intIn(body.stockWarn, 0, 100_000, 0),
      couponEnabled: body.couponEnabled === true,
      takeCardMode: takeCardMode(body.takeCardMode),
      contactMode: contactMode(body.contactMode),
      notifyFlags: jsonInput(
        mergeJson(body.notifyFlags, {
          merchantStation: true,
          buyerEmail: false,
        }),
      ),
      cardFormat: cardFormat(body.cardFormat),
      intro: clip(body.intro, 500),
      detail: String(body.detail ?? '').slice(0, 200_000),
      remark: String(body.remark ?? '').slice(0, 200_000),
      // 空串是「跟随站点」的有效值，不能被枚举归一化吃成 OLDEST
      cardOrderMode: clip(body.cardOrderMode ?? '', 16),
      hot: body.hot === true,
      sort: intIn(body.sort, 0, 9999, 0),
      status: goodsStatus(body.status),
    };
    let id = intIn(body.id, 0, 1_000_000_000, 0);
    if (id > 0) {
      const existing = await this.prisma.cardShopProduct.findFirst({
        where: { id, siteId: current.siteId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
      if (existing.trashedAt) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '商品在回收站里，请先从回收站还原再编辑',
        );
      }
      await this.prisma.cardShopProduct.update({ where: { id }, data });
      // 访问密码：undefined = 不动，空串 = 关掉，其余 = 覆盖
      if (body.visitPassword !== undefined) {
        await this.prisma.cardShopProduct.update({
          where: { id },
          data: {
            visitPassword: hashVisitPassword(
              current.siteId,
              id,
              body.visitPassword,
            ),
          },
        });
      }
    } else {
      const goodsTotal = await this.prisma.cardShopProduct.count({
        where: { siteId: current.siteId, trashedAt: null },
      });
      if (goodsTotal >= limits.goodsQuota) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `单个站点最多 ${limits.goodsQuota} 个商品，当前已有 ${goodsTotal} 个；如需更多请联系平台管理员调整配额`,
        );
      }
      const created = await this.prisma.cardShopProduct.create({
        data: { siteId: current.siteId, ...data },
      });
      id = created.id;
      const visit = String(body.visitPassword ?? '').trim();
      if (visit) {
        await this.prisma.cardShopProduct.update({
          where: { id },
          data: { visitPassword: hashVisitPassword(current.siteId, id, visit) },
        });
      }
    }
    return this.goodsDetail(user, current.siteId, id);
  }

  /** 上下架：FROZEN 是平台侧处置状态，店主侧不能自己解也不能自己冻。 */
  async setGoodsStatus(
    user: CurrentUser,
    siteId: number,
    ids: number[],
    status: string,
  ) {
    const current = await this.sites.requireSite(user, siteId);
    const next = String(status) as CardShopGoodsStatus;
    if (next === 'FROZEN') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '「平台冻结」只能由平台管理员设置，店主侧请用「已下架」',
      );
    }
    const unique = dedupeIds(ids);
    if (!unique.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择商品');
    if (next === 'ONLINE') {
      const zeroPrice = await this.prisma.cardShopProduct.count({
        where: {
          siteId: current.siteId,
          id: { in: unique },
          price: { lte: 0 },
        },
      });
      if (zeroPrice > 0) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `${zeroPrice} 个商品还没填写售价，无法上架；请先补价格`,
        );
      }
    }
    const changed = await this.prisma.cardShopProduct.updateMany({
      where: { siteId: current.siteId, id: { in: unique }, trashedAt: null },
      data: { status: next },
    });
    return {
      ok: true,
      changed: changed.count,
      message:
        changed.count === unique.length
          ? `已更新 ${changed.count} 个商品`
          : `已更新 ${changed.count} 个商品，另有 ${unique.length - changed.count} 个不在本站点或已在回收站`,
    };
  }

  /** 进回收站只停卖，不删卡：卡密留在原商品下，还原后继续销售（已售与订单永不受影响）。 */
  async removeGoods(user: CurrentUser, siteId: number, ids: number[]) {
    const current = await this.sites.requireSite(user, siteId);
    const unique = dedupeIds(ids);
    if (!unique.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择商品');
    const changed = await this.prisma.cardShopProduct.updateMany({
      where: { siteId: current.siteId, id: { in: unique }, trashedAt: null },
      data: { status: 'OFFLINE', trashedAt: new Date() },
    });
    return {
      ok: true,
      message: `已把 ${changed.count} 个商品移入回收站；卡密仍在本商品下，还原后继续销售`,
    };
  }

  async restoreGoods(user: CurrentUser, siteId: number, ids: number[]) {
    const current = await this.sites.requireSite(user, siteId);
    const unique = dedupeIds(ids);
    if (!unique.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择商品');
    const changed = await this.prisma.cardShopProduct.updateMany({
      where: {
        siteId: current.siteId,
        id: { in: unique },
        trashedAt: { not: null },
      },
      data: { trashedAt: null, status: 'OFFLINE' },
    });
    return {
      ok: true,
      message: `已还原 ${changed.count} 个商品到「已下架」，确认库存无误后再上架`,
    };
  }

  /** 回收站清单（列表页 trash 参数与删除前置检查都靠它）。 */
  async trashedGoods(user: CurrentUser, siteId: number) {
    const current = await this.sites.requireSite(user, siteId);
    return this.prisma.cardShopProduct.findMany({
      where: { siteId: current.siteId, trashedAt: { not: null } },
      select: { id: true, name: true, trashedAt: true },
      orderBy: [{ trashedAt: 'desc' }],
      take: 200,
    });
  }

  // ---------------------------------------------------------------- 库存

  /** 商品维度库存：一次 groupBy 出这一页的数，列表页不会按行发查询。 */
  async stockOf(
    siteId: number,
    goodsIds: number[],
  ): Promise<Map<number, StockCounts>> {
    const out = new Map<number, StockCounts>();
    for (const id of goodsIds) out.set(id, { ...EMPTY_STOCK });
    if (!goodsIds.length) return out;
    const rows = await this.prisma.cardShopCard.groupBy({
      by: ['goodsId', 'status'],
      where: { siteId, goodsId: { in: goodsIds }, trashedAt: null },
      _count: { _all: true },
    });
    for (const row of rows) {
      const bucket = out.get(row.goodsId);
      if (!bucket) continue;
      if (row.status === 'AVAILABLE') bucket.available += row._count._all;
      else if (row.status === 'LOCKED') bucket.locked += row._count._all;
      else if (row.status === 'SOLD') bucket.sold += row._count._all;
    }
    return out;
  }

  private async availableByGoods(
    siteId: number,
    goodsIds: number[],
  ): Promise<Map<number, number>> {
    const map = await this.stockOf(siteId, goodsIds);
    const out = new Map<number, number>();
    for (const [id, counts] of map) out.set(id, counts.available);
    return out;
  }

  /** 可售数（下单算价与上架判定都用它；走 [siteId, goodsId, status, seq] 索引）。 */
  async availableCount(siteId: number, goodsId: number): Promise<number> {
    return this.prisma.cardShopCard.count({
      where: { siteId, goodsId, status: 'AVAILABLE', trashedAt: null },
    });
  }

  /** 买家可见库存：ACTUAL 给数字，RANGE 只给档位（数字会教人挑时机抢购，也暴露店主进货节奏）。 */
  buildStock(
    counts: StockCounts,
    display: string,
    warn: number,
  ): CardShopStock {
    const level = stockLevel(counts.available, warn);
    return {
      available: counts.available,
      locked: counts.locked,
      sold: counts.sold,
      level,
      levelLabel: STOCK_LEVEL_LABELS[level],
    };
  }

  /** 站点开关合并：库里缺的键按默认全开，避免新加开关把老站点静默关掉。 */
  mergeToggles(value: unknown): CardShopToggles {
    return mergeJson(value, CARD_SHOP_DEFAULT_TOGGLES);
  }

  private async toGoodsRows(
    siteId: number,
    rows: ProductRow[],
    stockMap: Map<number, StockCounts>,
  ): Promise<CardShopGoods[]> {
    if (!rows.length) return [];
    const categories = await this.prisma.cardShopCategory.findMany({
      where: { siteId },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((row) => [row.id, row.name]));
    return rows.map((row) => {
      const counts = stockMap.get(row.id) ?? EMPTY_STOCK;
      const level = stockLevel(counts.available, row.stockWarn);
      const price = amount(row.price);
      return {
        id: row.id,
        siteId: row.siteId,
        categoryId: row.categoryId,
        categoryName: nameById.get(row.categoryId) ?? '',
        name: row.name,
        subtitle: row.subtitle,
        coverImage: row.coverImage,
        images: jsonList<string>(row.images).map((url) => clip(url, 500)),
        price,
        marketPrice: amount(row.marketPrice),
        wholesaleTiers: normalizeTiers(
          jsonList<CardShopWholesaleTier>(row.wholesaleTiers),
          price,
        ),
        limitQuantity: row.limitQuantity,
        maxQuantity: row.maxQuantity,
        stockWarn: row.stockWarn,
        couponEnabled: row.couponEnabled,
        takeCardMode: takeCardMode(row.takeCardMode),
        visitPasswordSet: Boolean(row.visitPassword),
        contactMode: contactMode(row.contactMode),
        notifyFlags: mergeJson(row.notifyFlags, {
          merchantStation: true,
          buyerEmail: false,
        }),
        cardFormat: cardFormat(row.cardFormat),
        intro: row.intro,
        detail: row.detail,
        remark: row.remark,
        cardOrderMode: row.cardOrderMode || '',
        hot: row.hot,
        sort: row.sort,
        viewCount: row.viewCount,
        soldCount: row.soldCount,
        status: goodsStatus(row.status),
        trashedAt: row.trashedAt ? iso(row.trashedAt) : null,
        stock: {
          available: counts.available,
          locked: counts.locked,
          sold: counts.sold,
          level,
          levelLabel: STOCK_LEVEL_LABELS[level],
        },
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      };
    });
  }

  /** 商品名与文案过平台禁售词：卡密商品名容易被拿去挂违禁内容，闸门必须在写入侧。 */
  private assertKeywords(keywordFilter: string[], body: CardShopGoodsSaveBody) {
    if (!keywordFilter.length) return;
    const haystack = [
      clip(body.name, 200),
      clip(body.subtitle, 200),
      clip(body.intro, 500),
    ].join(' ');
    for (const word of keywordFilter) {
      if (word && haystack.includes(word)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `商品信息含平台禁售词「${word}」，请修改后再保存；如属误判请联系平台管理员`,
        );
      }
    }
  }
}

/**
 * 阶梯批发价：丢弃高于零售价的档位（批发价比零售还高就是配错），按 min 升序，
 * 最多 20 档——算价逐档比较，档数再多只会被拿来构造奇怪请求。
 */
export function normalizeTiers(
  value: unknown,
  price: number,
): CardShopWholesaleTier[] {
  const base = toCents(price);
  const out: CardShopWholesaleTier[] = [];
  for (const item of jsonList<CardShopWholesaleTier>(value)) {
    const min = intIn(item?.min, 1, 100_000, 0);
    const tierPrice = amount(item?.price);
    if (min <= 0) continue;
    if (toCents(tierPrice) > base) continue;
    out.push({ min, price: tierPrice });
  }
  out.sort((a, b) => a.min - b.min);
  return out.slice(0, 20);
}

/** 命中阶梯单价：取 min 不超过购买量的最高一档，否则回零售价（分）。 */
export function pickUnitCents(
  tiers: CardShopWholesaleTier[],
  price: number,
  quantity: number,
): number {
  let unit = toCents(price);
  for (const tier of tiers) {
    if (quantity >= tier.min && toCents(tier.price) <= unit) {
      unit = toCents(tier.price);
    }
  }
  return unit;
}

function dedupeIds(ids: number[]): number[] {
  return [
    ...new Set(
      (ids ?? []).map((value) => Number(value)).filter((value) => value > 0),
    ),
  ];
}
