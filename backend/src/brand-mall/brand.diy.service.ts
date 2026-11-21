import {
  BRAND_DEFAULT_DIY_STYLES,
  BRAND_DIY_PAGE_TYPES,
  type BrandDiyComponent,
  type BrandDiyPage,
  type BrandDiyPageRow,
  type BrandDiyPageType,
  type BrandDiySaveBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { isBrandWidget, widgetDefaults } from './brand.diy-widgets';
import {
  clip,
  diyPageType,
  jsonInput,
  jsonList,
  mergeJson,
  iso,
} from './brand.shared';

type AnyArgs = { ownerUserId: string; shopId: number };

type PageRecord = {
  id: number;
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

const PAGE_TYPES = new Set<string>(BRAND_DIY_PAGE_TYPES);

function normalizeComponents(value: unknown): BrandDiyComponent[] {
  return jsonList<Record<string, unknown>>(value)
    .filter((item) => isBrandWidget(item?.type))
    .slice(0, 60)
    .map((item, index) => {
      const type = String(item.type) as BrandDiyComponent['type'];
      return {
        id: clip(item.id || `${type}-${index + 1}`, 64),
        type,
        props: mergeJson<Record<string, unknown>>(
          item.props,
          widgetDefaults(type),
        ),
      };
    });
}

/**
 * DIY 装修：草稿与线上快照分列存储，改一半不影响顾客端。
 *
 * 组件白名单是安全边界：只认 `brand.diy-widgets.ts` 里声明的类型，
 * 未知类型直接丢掉，避免库里塞进端上渲染不了的脏数据。
 */
export class BrandDiyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(args: AnyArgs): Promise<BrandDiyPageRow[]> {
    const rows = (await this.prisma.brandDiyPage.findMany({
      where: { shopId: args.shopId },
      orderBy: [{ sortOrder: 'desc' }, { id: 'asc' }],
      take: 100,
    })) as unknown as PageRecord[];
    return rows.map((row) => this.toRow(row));
  }

  private toRow(row: PageRecord): BrandDiyPageRow {
    return {
      id: row.id,
      shopId: row.shopId,
      name: row.name,
      type: diyPageType(row.type),
      status: row.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      isDefault: row.isDefault,
      coverImage: row.coverImage,
      sortOrder: row.sortOrder,
      componentCount: normalizeComponents(row.components).length,
      publishedAt: iso(row.publishedAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toDetail(row: PageRecord): BrandDiyPage {
    return {
      ...this.toRow(row),
      components: normalizeComponents(row.components),
      styles: mergeJson(row.styles, BRAND_DEFAULT_DIY_STYLES),
      publishedComponents: normalizeComponents(row.publishedComponents),
      publishedStyles: mergeJson(row.publishedStyles, BRAND_DEFAULT_DIY_STYLES),
    };
  }

  private async page(args: AnyArgs, id: number): Promise<PageRecord> {
    const row = (await this.prisma.brandDiyPage.findFirst({
      where: { id, shopId: args.shopId },
    })) as unknown as PageRecord | null;
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '装修页面不存在');
    return row;
  }

  async detail(args: AnyArgs, id: number): Promise<BrandDiyPage> {
    return this.toDetail(await this.page(args, id));
  }

  async save(args: AnyArgs, body: BrandDiySaveBody): Promise<BrandDiyPage> {
    const name = String(body.name || '')
      .trim()
      .slice(0, 40);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '页面名称不能为空');
    const type = PAGE_TYPES.has(body.type) ? body.type : 'ACTIVITY';
    const components = normalizeComponents(body.components);
    const data = {
      name,
      type,
      components: jsonInput(components),
      styles: jsonInput(mergeJson(body.styles, BRAND_DEFAULT_DIY_STYLES)),
      coverImage: clip(body.coverImage, 500),
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
    };
    if (body.id) {
      const row = await this.page(args, body.id);
      await this.prisma.brandDiyPage.update({ where: { id: row.id }, data });
      return this.detail(args, row.id);
    }
    const created = await this.prisma.brandDiyPage.create({
      data: { shopId: args.shopId, ...data, isDefault: false, status: 'DRAFT' },
    });
    return this.detail(args, created.id);
  }

  /**
   * 发布：把草稿冻结进 published*。
   * 首页/分类页/个人中心三类默认页发布时互斥 isDefault，顾客端按 type 取默认页。
   */
  async publish(args: AnyArgs, id: number): Promise<BrandDiyPage> {
    const row = await this.page(args, id);
    const components = normalizeComponents(row.components);
    if (components.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '页面还是空的，先拖入至少一个组件再发布',
      );
    }
    await this.prisma.brandDiyPage.update({
      where: { id: row.id },
      data: {
        status: 'PUBLISHED',
        publishedComponents: jsonInput(components),
        publishedStyles: jsonInput(
          mergeJson(row.styles, BRAND_DEFAULT_DIY_STYLES),
        ),
        publishedAt: new Date(),
      },
    });
    return this.detail(args, row.id);
  }

  async copy(args: AnyArgs, id: number): Promise<BrandDiyPageRow> {
    const row = await this.page(args, id);
    const created = await this.prisma.brandDiyPage.create({
      data: {
        shopId: args.shopId,
        name: `副本 ${row.name}`.slice(0, 40),
        type: row.type,
        components: jsonInput(normalizeComponents(row.components)),
        styles: jsonInput(mergeJson(row.styles, BRAND_DEFAULT_DIY_STYLES)),
        coverImage: row.coverImage,
        isDefault: false,
        status: 'DRAFT',
        sortOrder: row.sortOrder,
      },
    });
    return this.toRow(created);
  }

  async remove(args: AnyArgs, id: number) {
    const row = await this.page(args, id);
    if (row.isDefault) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '默认页面不能删除：顾客端按类型取默认页，删掉后该页面会打不开',
      );
    }
    await this.prisma.brandDiyPage.delete({ where: { id: row.id } });
    return { ok: true, message: '页面已删除' };
  }

  /** 公开通道用：按 id 取某个已发布活动页的线上快照。 */
  async publishedActivity(
    shopId: number,
    id: number,
  ): Promise<{
    id: number;
    name: string;
    components: BrandDiyComponent[];
    styles: Record<string, unknown>;
  } | null> {
    const row = (await this.prisma.brandDiyPage.findFirst({
      where: { id: Number(id), shopId, status: 'PUBLISHED' },
    })) as unknown as PageRecord | null;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      components: normalizeComponents(row.publishedComponents),
      styles: mergeJson(row.publishedStyles, BRAND_DEFAULT_DIY_STYLES),
    };
  }

  /** 公开通道用：取某类型的已发布默认页快照。 */
  async publishedDefault(
    shopId: number,
    type: BrandDiyPageType,
  ): Promise<{
    id: number;
    components: BrandDiyComponent[];
    styles: Record<string, unknown>;
  } | null> {
    const row = (await this.prisma.brandDiyPage.findFirst({
      where: { shopId, type, status: 'PUBLISHED' },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'desc' }, { id: 'asc' }],
    })) as unknown as PageRecord | null;
    if (!row) return null;
    return {
      id: row.id,
      components: normalizeComponents(row.publishedComponents),
      styles: mergeJson(row.publishedStyles, BRAND_DEFAULT_DIY_STYLES),
    };
  }
}
