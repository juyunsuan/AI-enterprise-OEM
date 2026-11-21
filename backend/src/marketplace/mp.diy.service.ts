import type {
  MpDiyPage,
  MpDiyPageRow,
  MpDiyPageSaveBody,
  MpDiyPageType,
  MpPublicDiy,
} from '@enterprise/contracts';
import {
  DIY_LIMITS,
  diyUnknownTypes,
  normalizeDiyPage,
  type DiyNode,
} from '../commerce-core/diy';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import { MP_DIY_DESCRIPTORS, MP_DIY_WIDGET_CATALOG } from './mp.diy-widgets';
import { iso, jsonObject, jsonInput } from './mp.shared';

/** 装修归属：marketId 必填，shopId=0 表示市场级（平台装修）。 */
export type MpDiyScope = { marketId: number; shopId: number };

type PageRecord = {
  id: number;
  marketId: number;
  shopId: number;
  name: string;
  type: string;
  components: unknown;
  styles: unknown;
  coverImage: string;
  isDefault: boolean;
  status: string;
  publishedComponents: unknown;
  publishedStyles: unknown;
  publishedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const PAGE_TYPES = new Set<string>(['HOME', 'CATEGORY', 'MINE', 'ACTIVITY']);

function pageType(value: string): MpDiyPageType {
  return (PAGE_TYPES.has(value) ? value : 'ACTIVITY') as MpDiyPageType;
}

function normalize(input: unknown, reject: boolean): DiyNode[] {
  if (reject) {
    const unknown = diyUnknownTypes(input, MP_DIY_DESCRIPTORS);
    if (unknown.length > 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `包含未知组件「${unknown.join('、')}」，请刷新编辑器后重试`,
      );
    }
  }
  return normalizeDiyPage(input, MP_DIY_DESCRIPTORS).nodes;
}

/**
 * 装修服务：市场级与店铺级共用一套页面模型。
 *
 * 硬口径：
 * 1. 组件只认 `MP_DIY_WIDGETS` 白名单，未知类型保存时直接拒绝（不静默丢弃）；
 * 2. 草稿与线上快照分列存储，发布前改一半不影响顾客端；
 * 3. 同「市场 + 店铺 + 页面类型」只允许一条 isDefault，C 端按它取首页。
 */
export class MpDiyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
  ) {}

  widgets() {
    return MP_DIY_WIDGET_CATALOG;
  }

  /** 商户侧：店铺未建好时不能进装修（没有任何可发布的位置）。 */
  async merchantScope(payload: MpMerchantTokenPayload, write: boolean) {
    const { merchant, shop } = await this.merchants.session(payload, write);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺尚未创建，请联系市场运营方完成开店后再装修',
      );
    }
    return {
      marketId: merchant.marketId,
      shopId: shop.id,
    } satisfies MpDiyScope;
  }

  // ------------------------------------------------------------ 管理端

  async list(
    scope: MpDiyScope,
    query: { shopId?: unknown; type?: string },
  ): Promise<MpDiyPageRow[]> {
    const shopId = Number(query.shopId ?? scope.shopId);
    if (scope.shopId > 0 && shopId !== scope.shopId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只能查看本店铺的装修');
    }
    const type = String(query.type || '').trim();
    const rows = (await this.prisma.mpDiyPage.findMany({
      where: {
        marketId: scope.marketId,
        shopId: shopId > 0 ? shopId : 0,
        ...(PAGE_TYPES.has(type) ? { type } : {}),
      },
      orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }],
      take: 100,
    })) as unknown as PageRecord[];
    return rows.map((row) => this.toRow(row));
  }

  async detail(scope: MpDiyScope, id: number): Promise<MpDiyPage> {
    return this.toDetail(await this.page(scope, id));
  }

  async save(scope: MpDiyScope, body: MpDiyPageSaveBody): Promise<MpDiyPage> {
    const name = String(body.name || '')
      .trim()
      .slice(0, 40);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '页面名称不能为空');
    }
    const shopId =
      scope.shopId > 0 ? scope.shopId : body.shopId > 0 ? body.shopId : 0;
    await this.requireShop(scope.marketId, shopId);
    const components = normalize(body.components, true).slice(
      0,
      DIY_LIMITS.maxWidgets,
    );
    const data = {
      name,
      type: PAGE_TYPES.has(body.type) ? body.type : 'ACTIVITY',
      components: components as unknown as object,
      styles: jsonObject(body.styles) as unknown as object,
      coverImage: String(body.coverImage || '').slice(0, 500),
      isDefault: Boolean(body.isDefault),
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
    };
    if (body.id) {
      const row = await this.page(scope, body.id);
      await this.prisma.mpDiyPage.update({ where: { id: row.id }, data });
      if (data.isDefault)
        await this.keepSingleDefault(
          row.marketId,
          row.shopId,
          data.type,
          row.id,
        );
      return this.detail(scope, row.id);
    }
    const created = await this.prisma.mpDiyPage.create({
      data: { marketId: scope.marketId, shopId, ...data, status: 'DRAFT' },
    });
    if (data.isDefault) {
      await this.keepSingleDefault(
        scope.marketId,
        shopId,
        data.type,
        created.id,
      );
    }
    return this.detail({ marketId: scope.marketId, shopId }, created.id);
  }

  /** 发布：草稿冻结进线上快照；默认页发布后同类型其余页面自动让位。 */
  async publish(scope: MpDiyScope, id: number): Promise<MpDiyPage> {
    const row = await this.page(scope, id);
    const components = normalize(row.components, true);
    if (components.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '页面还是空的，先拖入至少一个组件再发布',
      );
    }
    await this.prisma.mpDiyPage.update({
      where: { id: row.id },
      data: {
        status: 'PUBLISHED',
        publishedComponents: jsonInput(components),
        publishedStyles: jsonInput(jsonObject(row.styles)),
        publishedAt: new Date(),
      },
    });
    if (row.isDefault) {
      await this.keepSingleDefault(row.marketId, row.shopId, row.type, row.id);
    }
    return this.detail(scope, row.id);
  }

  async remove(scope: MpDiyScope, id: number) {
    const row = await this.page(scope, id);
    if (row.isDefault) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '默认页面不能删除：顾客端按类型取默认页，删掉后该页面会打不开',
      );
    }
    await this.prisma.mpDiyPage.delete({ where: { id: row.id } });
    return { ok: true, message: '页面已删除' };
  }

  // ------------------------------------------------------------ C 端

  /** 市场首页：平台装修的默认 HOME 页面，没发布过回 null。 */
  marketHome(marketId: number): Promise<MpPublicDiy | null> {
    return this.publishedHome(marketId, 0);
  }

  shopHome(marketId: number, shopId: number): Promise<MpPublicDiy | null> {
    return this.publishedHome(marketId, shopId);
  }

  private async publishedHome(
    marketId: number,
    shopId: number,
  ): Promise<MpPublicDiy | null> {
    const row = (await this.prisma.mpDiyPage.findFirst({
      where: { marketId, shopId, type: 'HOME', status: 'PUBLISHED' },
      orderBy: [{ isDefault: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
    })) as unknown as PageRecord | null;
    if (!row || row.publishedComponents == null) return null;
    return {
      components: normalizeDiyPage(row.publishedComponents, MP_DIY_DESCRIPTORS)
        .nodes,
      styles: jsonObject(row.publishedStyles),
    };
  }

  // ------------------------------------------------------------ 内部

  private async page(scope: MpDiyScope, id: number): Promise<PageRecord> {
    const row = (await this.prisma.mpDiyPage.findFirst({
      where: {
        id: Number(id),
        marketId: scope.marketId,
        ...(scope.shopId > 0 ? { shopId: scope.shopId } : {}),
      },
    })) as unknown as PageRecord | null;
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '装修页面不存在');
    }
    return row;
  }

  private async requireShop(marketId: number, shopId: number) {
    if (shopId <= 0) return;
    const shop = await this.prisma.mpShop.findFirst({
      where: { id: shopId, marketId },
      select: { id: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
  }

  private async keepSingleDefault(
    marketId: number,
    shopId: number,
    type: string,
    keepId: number,
  ) {
    await this.prisma.mpDiyPage.updateMany({
      where: {
        marketId,
        shopId,
        type,
        isDefault: true,
        id: { not: keepId },
      },
      data: { isDefault: false },
    });
  }

  private toRow(row: PageRecord): MpDiyPageRow {
    return {
      id: row.id,
      marketId: row.marketId,
      shopId: row.shopId,
      name: row.name,
      type: pageType(row.type),
      status: row.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      isDefault: row.isDefault,
      coverImage: row.coverImage,
      sortOrder: row.sortOrder,
      componentCount: normalizeDiyPage(row.components, MP_DIY_DESCRIPTORS).nodes
        .length,
      publishedAt: iso(row.publishedAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toDetail(row: PageRecord): MpDiyPage {
    return {
      ...this.toRow(row),
      components: normalizeDiyPage(row.components, MP_DIY_DESCRIPTORS).nodes,
      styles: jsonObject(row.styles),
      createdAt: iso(row.createdAt),
    };
  }
}
