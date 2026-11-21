import {
  type OnsiteBannerInput,
  type OnsiteBannerRow,
  type OnsiteCategoryInput,
  type OnsiteCategoryRow,
  type OnsiteLabelInput,
  type OnsiteLabelRow,
  type OnsiteServiceInput,
  type OnsiteServiceRow,
  type OnsiteServiceStatus,
  type OnsiteStaffPriceRow,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, decimalOf, stringArray } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';

const SERVICE_STATUSES = ['DRAFT', 'ONLINE', 'OFFLINE'] as const;
const LINK_TYPES = [
  'NONE',
  'SERVICE',
  'CATEGORY',
  'STAFF',
  'ARTICLE',
  'WEBVIEW',
] as const;

type ServiceRowLike = {
  id: number;
  title: string;
  subtitle: string;
  coverImage: string;
  images: unknown;
  detail: string;
  price: unknown;
  marketPrice: unknown;
  durationMinutes: number;
  maxDurationMinutes: number;
  addonEnabled: boolean;
  addonUnitMinutes: number;
  addonRate: unknown;
  materialFee: unknown;
  travelFeeMode: string;
  customTravelFee: unknown;
  highlights: unknown;
  doorEnabled: boolean;
  storeEnabled: boolean;
  status: string;
  sortOrder: number;
  salesVirtual: number;
  salesTrue: number;
  rating: unknown;
  reviewCount: number;
  updatedAt: Date;
};

const statusOf = (value: string): OnsiteServiceStatus => {
  for (const status of SERVICE_STATUSES) {
    if (status === value) return status;
  }
  return 'DRAFT';
};

/** 链接对象落库是 JSON，读回时按白名单收敛，脏值一律降级为不跳转。 */
const linkTypeOf = (value: unknown): OnsiteBannerRow['link']['type'] => {
  for (const type of LINK_TYPES) {
    if (type === value) return type;
  }
  return 'NONE';
};

/**
 * 服务目录：分类、服务、标签、轮播、技师差异价。
 *
 * 三条来自参考源码的口径：
 * - 一个服务可挂多个分类（源码 cate_connect），所以分类下还有服务时删分类必须拦；
 * - 销量分「展示值 / 真实值」（源码 sale 与 true_sale），列表展示两者之和；
 * - 技师对同一服务可单独定价，未单独定价才回落服务价——源码用 price=-1 表达「不单独定价」，
 *   这里用「有没有这一行」表达，读代码时不必再记魔法数。
 */
export class OnsiteCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  // ---------- 分类 ----------

  async categories(user: CurrentUser, shopId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const [rows, links] = await Promise.all([
      this.prisma.onsiteCategory.findMany({
        where: { shopId: shop.shopId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.onsiteServiceCategoryLink.findMany({
        where: { shopId: shop.shopId },
        select: { categoryId: true },
      }),
    ]);
    const counts = new Map<number, number>();
    for (const link of links) {
      counts.set(link.categoryId, (counts.get(link.categoryId) || 0) + 1);
    }
    const list: OnsiteCategoryRow[] = rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      image: row.image,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      serviceCount: counts.get(row.id) || 0,
    }));
    return { list };
  }

  async saveCategory(
    user: CurrentUser,
    shopId: string,
    body: OnsiteCategoryInput,
  ): Promise<OnsiteCategoryRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const data = {
      parentId: Math.max(0, Math.round(body.parentId || 0)),
      name: body.name.trim().slice(0, 60),
      image: body.image.trim().slice(0, 500),
      sortOrder: Math.round(body.sortOrder || 0),
      enabled: body.enabled !== false,
    };
    if (data.parentId > 0) {
      const parent = await this.prisma.onsiteCategory.findFirst({
        where: { id: data.parentId, shopId: shop.shopId },
      });
      if (!parent) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '上级分类不存在，请重新选择',
        );
      }
      if (parent.parentId > 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '分类只支持两级，请挂在一级分类下',
        );
      }
    }
    const dup = await this.prisma.onsiteCategory.findFirst({
      where: {
        shopId: shop.shopId,
        name: data.name,
        parentId: data.parentId,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `同级下已有分类「${data.name}」`,
      );
    }
    const row = body.id
      ? await this.prisma.onsiteCategory.update({
          where: { id: body.id },
          data,
        })
      : await this.prisma.onsiteCategory.create({
          data: { shopId: shop.shopId, ...data },
        });
    return { ...row, serviceCount: 0 };
  }

  async removeCategory(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteCategory.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    const [linked, children] = await Promise.all([
      this.prisma.onsiteServiceCategoryLink.count({
        where: { categoryId: row.id, shopId: shop.shopId },
      }),
      this.prisma.onsiteCategory.count({ where: { parentId: row.id } }),
    ]);
    if (linked > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」下还有 ${linked} 个服务，请先到「服务目录」把它们改到其它分类，再删除分类`,
      );
    }
    if (children > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」下还有 ${children} 个子分类，请先删除子分类`,
      );
    }
    await this.prisma.onsiteCategory.delete({ where: { id: row.id } });
    return { removed: true };
  }

  // ---------- 服务 ----------

  private async toServiceRows(shopId: number, rows: ServiceRowLike[]) {
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [] as OnsiteServiceRow[];
    const [categoryLinks, labelLinks, priceLinks] = await Promise.all([
      this.prisma.onsiteServiceCategoryLink.findMany({
        where: { serviceId: { in: ids } },
      }),
      this.prisma.onsiteServiceLabelLink.findMany({
        where: { shopId, serviceId: { in: ids } },
      }),
      this.prisma.onsiteServiceStaffPrice.findMany({
        where: { shopId, serviceId: { in: ids } },
        select: { serviceId: true },
      }),
    ]);
    const labelIds = labelLinks.map((link) => link.labelId);
    const labels = labelIds.length
      ? await this.prisma.onsiteServiceLabel.findMany({
          where: { id: { in: labelIds } },
          select: { id: true, name: true },
        })
      : [];
    const labelName = new Map(labels.map((label) => [label.id, label.name]));
    const categoriesOf = new Map<number, number[]>();
    for (const link of categoryLinks) {
      const bucket = categoriesOf.get(link.serviceId) ?? [];
      bucket.push(link.categoryId);
      categoriesOf.set(link.serviceId, bucket);
    }
    const highlightsOf = new Map<number, string[]>();
    for (const link of labelLinks) {
      const bucket = highlightsOf.get(link.serviceId) ?? [];
      const name = labelName.get(link.labelId);
      if (name) bucket.push(name);
      highlightsOf.set(link.serviceId, bucket);
    }
    const staffCount = new Map<number, number>();
    for (const link of priceLinks) {
      staffCount.set(link.serviceId, (staffCount.get(link.serviceId) || 0) + 1);
    }
    return rows.map<OnsiteServiceRow>((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      images: stringArray(row.images),
      detail: row.detail,
      priceCents: centsOf(row.price),
      marketPriceCents: centsOf(row.marketPrice),
      durationMinutes: row.durationMinutes,
      maxDurationMinutes: row.maxDurationMinutes,
      addonEnabled: row.addonEnabled,
      addonUnitMinutes: row.addonUnitMinutes,
      addonRate: Number(row.addonRate ?? 100),
      materialFeeCents: centsOf(row.materialFee),
      travelFeeMode: row.travelFeeMode === 'CUSTOM' ? 'CUSTOM' : 'CITY',
      customTravelFeeCents: centsOf(row.customTravelFee),
      highlights: highlightsOf.get(row.id) ?? stringArray(row.highlights),
      doorEnabled: row.doorEnabled,
      storeEnabled: row.storeEnabled,
      status: statusOf(row.status),
      sortOrder: row.sortOrder,
      salesVirtual: row.salesVirtual,
      salesTrue: row.salesTrue,
      rating: Number(row.rating ?? 5),
      reviewCount: row.reviewCount,
      categoryIds: categoriesOf.get(row.id) ?? [],
      staffCount: staffCount.get(row.id) ?? 0,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async services(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = text(query.status, 'all');
    const keyword = text(query.keyword).trim().slice(0, 40);
    const categoryId = Number(query.categoryId) || 0;
    const staffId = Number(query.staffId) || 0;
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { subtitle: { contains: keyword } },
            ],
          }
        : {}),
    };
    // 分类与技师是关系表，先在内存里求出服务 id 集合再分页：
    // 跨库 JOIN 写法差异大，且这两个筛选都是小集合。
    let restrictIds: number[] | null = null;
    if (categoryId > 0) {
      const links = await this.prisma.onsiteServiceCategoryLink.findMany({
        where: { shopId: shop.shopId, categoryId },
        select: { serviceId: true },
      });
      restrictIds = links.map((link) => link.serviceId);
    }
    if (staffId > 0) {
      const links = await this.prisma.onsiteServiceStaffPrice.findMany({
        where: { shopId: shop.shopId, staffId },
        select: { serviceId: true },
      });
      const byStaff = links.map((link) => link.serviceId);
      restrictIds = restrictIds
        ? restrictIds.filter((id) => byStaff.includes(id))
        : byStaff;
    }
    const scoped = restrictIds ? { ...where, id: { in: restrictIds } } : where;
    const [total, rows] = await Promise.all([
      this.prisma.onsiteService.count({ where: scoped }),
      this.prisma.onsiteService.findMany({
        where: scoped,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      await this.toServiceRows(shop.shopId, rows),
      total,
      page,
      pageSize,
    );
  }

  async serviceDetail(user: CurrentUser, shopId: string, serviceId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteService.findFirst({
      where: { id: Number(serviceId), shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    const [result] = await this.toServiceRows(shop.shopId, [row]);
    return result;
  }

  async saveService(
    user: CurrentUser,
    shopId: string,
    body: OnsiteServiceInput,
  ): Promise<OnsiteServiceRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const categoryIds = Array.from(new Set(body.categoryIds));
    const labelIds = Array.from(new Set(body.labelIds));
    if (categoryIds.length) {
      const found = await this.prisma.onsiteCategory.count({
        where: { id: { in: categoryIds }, shopId: shop.shopId },
      });
      if (found !== categoryIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选分类里有不属于本店铺的，请重新选择分类',
        );
      }
    }
    if (labelIds.length) {
      const found = await this.prisma.onsiteServiceLabel.count({
        where: { id: { in: labelIds }, shopId: shop.shopId, type: 'FEATURE' },
      });
      if (found !== labelIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选标签里有不属于本店铺的，请先到「标签与轮播」新建',
        );
      }
    }
    if (
      body.maxDurationMinutes > 0 &&
      body.maxDurationMinutes < body.durationMinutes
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '最长可约时长不能小于单次服务时长',
      );
    }
    if (!body.doorEnabled && !body.storeEnabled) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '上门与到店至少开启一种履约方式，否则该服务无法被预约',
      );
    }
    const data = {
      title: body.title.trim().slice(0, 120),
      subtitle: body.subtitle.trim().slice(0, 160),
      coverImage: body.coverImage.trim().slice(0, 500),
      images: body.images.slice(0, 12),
      detail: String(body.detail || '').slice(0, 60000),
      price: decimalOf(body.priceCents),
      marketPrice: decimalOf(body.marketPriceCents),
      durationMinutes: body.durationMinutes,
      maxDurationMinutes: body.maxDurationMinutes,
      addonEnabled: body.addonEnabled,
      addonUnitMinutes: body.addonUnitMinutes,
      addonRate: Number(body.addonRate) || 100,
      materialFee: decimalOf(body.materialFeeCents),
      travelFeeMode: body.travelFeeMode,
      customTravelFee: decimalOf(body.customTravelFeeCents),
      // 标签名同时快照进 highlights：列表页与小程序卡片不再 JOIN 标签表
      highlights: await this.labelNames(shop.shopId, labelIds),
      doorEnabled: body.doorEnabled,
      storeEnabled: body.storeEnabled,
      status: body.status,
      sortOrder: body.sortOrder,
      salesVirtual: body.salesVirtual,
    };
    const row = body.id
      ? await this.prisma.onsiteService.update({ where: { id: body.id }, data })
      : await this.prisma.onsiteService.create({
          data: { shopId: shop.shopId, ...data },
        });
    await this.replaceLinks(shop.shopId, row.id, categoryIds, labelIds);
    await this.audit(user.userId, 'onsite.service.save', data.title);
    const [result] = await this.toServiceRows(shop.shopId, [row]);
    return result;
  }

  private async labelNames(shopId: number, labelIds: number[]) {
    if (!labelIds.length) return [];
    const rows = await this.prisma.onsiteServiceLabel.findMany({
      where: { id: { in: labelIds }, shopId },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    });
    return rows.map((row) => row.name).slice(0, 12);
  }

  /** 关系表整组替换：先删后建，避免逐行 diff 在两套库上写出不同语义。 */
  private async replaceLinks(
    shopId: number,
    serviceId: number,
    categoryIds: number[],
    labelIds: number[],
  ) {
    await this.prisma.onsiteServiceCategoryLink.deleteMany({
      where: { serviceId },
    });
    await this.prisma.onsiteServiceLabelLink.deleteMany({
      where: { shopId, serviceId },
    });
    if (categoryIds.length) {
      await this.prisma.onsiteServiceCategoryLink.createMany({
        data: categoryIds.map((categoryId) => ({
          shopId,
          serviceId,
          categoryId,
        })),
      });
    }
    if (labelIds.length) {
      await this.prisma.onsiteServiceLabelLink.createMany({
        data: labelIds.map((labelId) => ({ shopId, serviceId, labelId })),
      });
    }
  }

  async setServiceStatus(
    user: CurrentUser,
    shopId: string,
    ids: number[],
    status: OnsiteServiceStatus,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const target = Array.from(new Set(ids)).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (!target.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先选择要操作的服务',
      );
    }
    const owned = await this.prisma.onsiteService.count({
      where: { id: { in: target }, shopId: shop.shopId },
    });
    if (owned !== target.length) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '选中项里有不属于本店铺的服务',
      );
    }
    const updated = await this.prisma.onsiteService.updateMany({
      where: { id: { in: target }, shopId: shop.shopId },
      data: { status },
    });
    await this.audit(
      user.userId,
      'onsite.service.status',
      `${status} ${target.length} 项`,
    );
    return { updated: updated.count };
  }

  async removeService(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteService.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    if (row.status === 'ONLINE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.title}」仍在架上，请先下架再删除（历史订单要能回看服务名称与价格）`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.onsiteServiceCategoryLink.deleteMany({
        where: { serviceId: row.id },
      }),
      this.prisma.onsiteServiceLabelLink.deleteMany({
        where: { shopId: shop.shopId, serviceId: row.id },
      }),
      this.prisma.onsiteServiceStaffPrice.deleteMany({
        where: { shopId: shop.shopId, serviceId: row.id },
      }),
      this.prisma.onsiteService.delete({ where: { id: row.id } }),
    ]);
    await this.audit(user.userId, 'onsite.service.remove', row.title);
    return { removed: true };
  }

  /** 复制服务：新行回到草稿态，销量与评分不带过来（复制的是卖点，不是历史成绩）。 */
  async copyService(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteService.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    const [categoryLinks, labelLinks] = await Promise.all([
      this.prisma.onsiteServiceCategoryLink.findMany({
        where: { serviceId: row.id },
      }),
      this.prisma.onsiteServiceLabelLink.findMany({
        where: { shopId: shop.shopId, serviceId: row.id },
      }),
    ]);
    const created = await this.prisma.onsiteService.create({
      data: {
        shopId: shop.shopId,
        title: `${row.title}（副本）`.slice(0, 120),
        subtitle: row.subtitle,
        coverImage: row.coverImage,
        images: stringArray(row.images),
        detail: row.detail,
        price: row.price,
        marketPrice: row.marketPrice,
        durationMinutes: row.durationMinutes,
        maxDurationMinutes: row.maxDurationMinutes,
        addonEnabled: row.addonEnabled,
        addonUnitMinutes: row.addonUnitMinutes,
        addonRate: row.addonRate,
        materialFee: row.materialFee,
        travelFeeMode: row.travelFeeMode,
        customTravelFee: row.customTravelFee,
        highlights: stringArray(row.highlights),
        doorEnabled: row.doorEnabled,
        storeEnabled: row.storeEnabled,
        status: 'DRAFT',
        sortOrder: row.sortOrder,
      },
    });
    await this.replaceLinks(
      shop.shopId,
      created.id,
      categoryLinks.map((link) => link.categoryId),
      labelLinks.map((link) => link.labelId),
    );
    const [result] = await this.toServiceRows(shop.shopId, [created]);
    return result;
  }

  // ---------- 技师差异价 ----------

  async staffPrices(user: CurrentUser, shopId: string, serviceId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const service = await this.prisma.onsiteService.findFirst({
      where: { id: Number(serviceId), shopId: shop.shopId },
    });
    if (!service)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    const [staffRows, priceRows] = await Promise.all([
      this.prisma.onsiteStaff.findMany({
        where: { shopId: shop.shopId, status: { in: ['ONLINE', 'OFF_DUTY'] } },
        orderBy: [{ sortTop: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.onsiteServiceStaffPrice.findMany({
        where: { shopId: shop.shopId, serviceId: service.id },
      }),
    ]);
    const priceOf = new Map(priceRows.map((row) => [row.staffId, row]));
    const list: OnsiteStaffPriceRow[] = staffRows.map((row) => {
      const price = priceOf.get(row.id);
      return {
        staffId: row.id,
        name: row.name,
        phone: row.phone,
        priceCents: centsOf(price?.price ?? service.price),
        durationMinutes: price?.durationMinutes || service.durationMinutes,
        priced: Boolean(price),
      };
    });
    return { list };
  }

  /**
   * 整组保存差异价：未出现在 rows 里的行删掉（= 回落服务原价）。
   * 入参带 staffId 白名单校验，防止跨店铺写入。
   */
  async saveStaffPrices(
    user: CurrentUser,
    shopId: string,
    serviceId: string,
    rows: { staffId: number; priceCents: number; durationMinutes?: number }[],
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const service = await this.prisma.onsiteService.findFirst({
      where: { id: Number(serviceId), shopId: shop.shopId },
    });
    if (!service)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    const cleaned = rows
      .filter(
        (row) =>
          Number.isInteger(row.staffId) &&
          row.staffId > 0 &&
          Number.isInteger(row.priceCents) &&
          row.priceCents >= 0,
      )
      .slice(0, 200);
    const distinctIds = Array.from(new Set(cleaned.map((row) => row.staffId)));
    if (distinctIds.length) {
      const owned = await this.prisma.onsiteStaff.count({
        where: { id: { in: distinctIds }, shopId: shop.shopId },
      });
      if (owned !== distinctIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '提交的技师里有不属于本店铺的，请刷新后重试',
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.onsiteServiceStaffPrice.deleteMany({
        where: { shopId: shop.shopId, serviceId: service.id },
      }),
      this.prisma.onsiteServiceStaffPrice.createMany({
        data: cleaned.map((row) => ({
          shopId: shop.shopId,
          serviceId: service.id,
          staffId: row.staffId,
          price: decimalOf(row.priceCents),
          durationMinutes: row.durationMinutes || 0,
        })),
      }),
    ]);
    return this.staffPrices(user, shopId, serviceId);
  }

  // ---------- 标签 ----------

  async labels(user: CurrentUser, shopId: string, type: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteServiceLabel.findMany({
      where: {
        shopId: shop.shopId,
        ...(type && type !== 'all' ? { type } : {}),
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    const links = await this.prisma.onsiteServiceLabelLink.findMany({
      where: {
        shopId: shop.shopId,
        labelId: { in: rows.map((row) => row.id) },
      },
      select: { labelId: true },
    });
    const usage = new Map<number, number>();
    for (const link of links) {
      usage.set(link.labelId, (usage.get(link.labelId) || 0) + 1);
    }
    const list: OnsiteLabelRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type === 'REVIEW' ? 'REVIEW' : 'FEATURE',
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      usageCount: usage.get(row.id) || 0,
    }));
    return { list };
  }

  async saveLabel(user: CurrentUser, shopId: string, body: OnsiteLabelInput) {
    const shop = await this.shops.requireShop(user, shopId);
    const data = {
      name: body.name.trim().slice(0, 40),
      type: body.type,
      sortOrder: Math.round(body.sortOrder || 0),
      enabled: body.enabled !== false,
    };
    const dup = await this.prisma.onsiteServiceLabel.findFirst({
      where: {
        shopId: shop.shopId,
        name: data.name,
        type: data.type,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `同类标签「${data.name}」已存在`,
      );
    }
    const row = body.id
      ? await this.prisma.onsiteServiceLabel.update({
          where: { id: body.id },
          data,
        })
      : await this.prisma.onsiteServiceLabel.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      name: row.name,
      type: row.type === 'REVIEW' ? 'REVIEW' : 'FEATURE',
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      usageCount: 0,
    } satisfies OnsiteLabelRow;
  }

  async removeLabel(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteServiceLabel.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '标签不存在');
    await this.prisma.$transaction([
      this.prisma.onsiteServiceLabelLink.deleteMany({
        where: { shopId: shop.shopId, labelId: row.id },
      }),
      this.prisma.onsiteServiceLabel.delete({ where: { id: row.id } }),
    ]);
    return { removed: true };
  }

  // ---------- 轮播 ----------

  async banners(user: CurrentUser, shopId: string, position: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteBanner.findMany({
      where: {
        shopId: shop.shopId,
        ...(position && position !== 'all' ? { position } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    const list: OnsiteBannerRow[] = rows.map((row) => {
      const link = (row.link ?? {}) as { type?: unknown; value?: unknown };
      return {
        id: row.id,
        position: row.position,
        title: row.title,
        image: row.image,
        link: { type: linkTypeOf(link.type), value: text(link.value) },
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      };
    });
    return { list };
  }

  async saveBanner(user: CurrentUser, shopId: string, body: OnsiteBannerInput) {
    const shop = await this.shops.requireShop(user, shopId);
    if (!body.image.trim()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先上传轮播图片');
    }
    const data = {
      position: (body.position || 'HOME').trim().slice(0, 20),
      title: body.title.trim().slice(0, 80),
      image: body.image.trim().slice(0, 500),
      link: {
        type: body.link?.type || 'NONE',
        value: String(body.link?.value || ''),
      },
      sortOrder: Math.round(body.sortOrder || 0),
      enabled: body.enabled !== false,
    };
    const row = body.id
      ? await this.prisma.onsiteBanner.update({ where: { id: body.id }, data })
      : await this.prisma.onsiteBanner.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      position: row.position,
      title: row.title,
      image: row.image,
      link: { type: data.link.type, value: data.link.value },
      sortOrder: row.sortOrder,
      enabled: row.enabled,
    } satisfies OnsiteBannerRow;
  }

  async removeBanner(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteBanner.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '轮播图不存在');
    await this.prisma.onsiteBanner.delete({ where: { id: row.id } });
    return { removed: true };
  }

  /** 店铺首页概览要用：在售服务数 / 在岗技师数 / 上架轮播数（不额外开接口）。 */
  async shopStats(shopId: number) {
    const [serviceCount, staffCount, bannerCount] = await Promise.all([
      this.prisma.onsiteService.count({ where: { shopId, status: 'ONLINE' } }),
      this.prisma.onsiteStaff.count({ where: { shopId, status: 'ONLINE' } }),
      this.prisma.onsiteBanner.count({ where: { shopId, enabled: true } }),
    ]);
    return { serviceCount, staffCount, bannerCount };
  }

  /** C 端浏览：只出已上架服务，销量按「虚拟 + 真实」合并展示。 */
  async publicServices(
    shopId: number,
    query: {
      page: number;
      pageSize: number;
      keyword: string;
      categoryId: number;
    },
  ) {
    const where = {
      shopId,
      status: 'ONLINE',
      doorEnabled: true,
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { subtitle: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    let restrictIds: number[] | null = null;
    if (query.categoryId > 0) {
      const links = await this.prisma.onsiteServiceCategoryLink.findMany({
        where: { shopId, categoryId: query.categoryId },
        select: { serviceId: true },
      });
      restrictIds = links.map((link) => link.serviceId);
    }
    const scoped = restrictIds ? { ...where, id: { in: restrictIds } } : where;
    const [total, rows] = await Promise.all([
      this.prisma.onsiteService.count({ where: scoped }),
      this.prisma.onsiteService.findMany({
        where: scoped,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const list = rows.map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      priceCents: centsOf(row.price),
      marketPriceCents: centsOf(row.marketPrice),
      durationMinutes: row.durationMinutes,
      materialFeeCents: centsOf(row.materialFee),
      addonEnabled: row.addonEnabled,
      addonUnitMinutes: row.addonUnitMinutes,
      highlights: stringArray(row.highlights),
      rating: Number(row.rating ?? 5),
      reviewCount: row.reviewCount,
      sales: row.salesVirtual + row.salesTrue,
    }));
    return { list, total, page: query.page, pageSize: query.pageSize };
  }

  async publicServiceDetail(shopId: number, serviceId: number) {
    const row = await this.prisma.onsiteService.findFirst({
      where: { id: serviceId, shopId, status: 'ONLINE' },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务已下架或不存在');
    const links = await this.prisma.onsiteServiceStaffPrice.findMany({
      where: { shopId, serviceId: row.id },
      select: { staffId: true, price: true },
    });
    const staffIds = links.map((link) => link.staffId);
    const staffRows = staffIds.length
      ? await this.prisma.onsiteStaff.findMany({
          where: { id: { in: staffIds }, shopId, status: 'ONLINE' },
          select: { id: true, name: true, avatar: true, rating: true },
        })
      : [];
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      images: stringArray(row.images),
      detail: row.detail,
      priceCents: centsOf(row.price),
      marketPriceCents: centsOf(row.marketPrice),
      durationMinutes: row.durationMinutes,
      materialFeeCents: centsOf(row.materialFee),
      travelFeeMode: row.travelFeeMode,
      customTravelFeeCents: centsOf(row.customTravelFee),
      addonEnabled: row.addonEnabled,
      addonUnitMinutes: row.addonUnitMinutes,
      addonRate: Number(row.addonRate ?? 100),
      highlights: stringArray(row.highlights),
      rating: Number(row.rating ?? 5),
      reviewCount: row.reviewCount,
      sales: row.salesVirtual + row.salesTrue,
      /** 指定了可做技师时端上直接给候选；为空表示全员可做（列表另拉） */
      staff: staffRows.map((item) => ({
        id: item.id,
        name: item.name,
        avatar: item.avatar,
        rating: Number(item.rating ?? 5),
        priceCents: centsOf(
          links.find((link) => link.staffId === item.id)?.price ?? row.price,
        ),
      })),
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
