import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSiteService } from './geo-site.service';
import {
  GEO_SITE_LANGUAGE_LABELS,
  GEO_SITE_LIMITS,
  GEO_SITE_MENU_LOCATIONS,
  GEO_SITE_MENU_TARGETS,
  normalizeLanguage,
  normalizeLanguageList,
  safeSiteUrl,
  toText,
} from './geo-site.shared';

/**
 * 站点菜单服务：HEADER 顶部导航与 FOOTER 页脚导航共用一张表，两级（parentId=0 为顶级）。
 *
 * 快照口径：站点发布时把「可见且能解析到线上目标」的菜单冻结进 geo_sites.publishedMenus，
 * 公开渲染只读快照——这样草稿改菜单不会即时影响线上，且快照里绝不残留草稿内容的链接。
 * 落库与快照都不存 href：链接由渲染层按当前 host 与页面/文章 id 现算，
 * 换域名、换 slug 之后导航自动跟着变，不会把绝对地址钉死在库里。
 */

export type MenuRow = {
  id: number;
  siteId: number;
  location: string;
  lang: string;
  parentId: number;
  label: string;
  targetType: string;
  targetId: number;
  url: string;
  sort: number;
  visible: number;
  openNewTab: number;
};

/** 快照节点：渲染层与前端导航共用同一形状。 */
export type GeoSiteMenuNode = {
  id: number;
  label: string;
  /** HEADER | FOOTER：公开渲染按位置分栏，快照必须自带 */
  location: string;
  /** 语言码：公开导航按当前语言取，缺该语言时回落到默认语言 */
  lang: string;
  /** 新标签打开：外链的 rel 与 target 都由它决定 */
  newTab: boolean;
  targetType: string;
  targetId: number;
  url: string;
  children: GeoSiteMenuNode[];
};

/** 对外视图：tinyint 收成布尔，前端只用 true/false。 */
export type GeoSiteMenuView = Omit<MenuRow, 'visible' | 'openNewTab'> & {
  visible: boolean;
  openNewTab: boolean;
  children: GeoSiteMenuView[];
};

const LOCATIONS = new Set<string>(GEO_SITE_MENU_LOCATIONS);
const TARGETS = new Set<string>(GEO_SITE_MENU_TARGETS);

function viewOf(row: MenuRow): Omit<GeoSiteMenuView, 'children'> {
  const { visible, openNewTab, ...rest } = row;
  return { ...rest, visible: visible === 1, openNewTab: openNewTab === 1 };
}

/** 外链/锚点入库前的最后把关：只认 http(s) 绝对地址与 #锚点，其余直接落空串。 */
function normalizeMenuUrl(value: unknown): string {
  const raw = toText(value).trim().slice(0, 500);
  if (!raw) return '';
  if (raw.startsWith('#')) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  return safeSiteUrl(raw) || '';
}

function nodesOf(rows: MenuRow[]): GeoSiteMenuView[] {
  const byId = new Map<number, GeoSiteMenuView>();
  for (const row of rows) byId.set(row.id, { ...viewOf(row), children: [] });
  const roots: GeoSiteMenuView[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent && parent.id !== row.id && parent.lang === row.lang) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortTree = (list: GeoSiteMenuView[]) => {
    list.sort((a, b) => a.sort - b.sort || a.id - b.id);
    for (const item of list) sortTree(item.children);
  };
  sortTree(roots);
  return roots;
}

export class GeoSiteMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: GeoSiteService,
  ) {}

  async list(
    user: CurrentUser,
    siteId: number,
    location?: string,
    langValue?: string,
  ) {
    const site = await this.sites.requireSite(user, Number(siteId));
    const loc = this.normalizeLocation(location);
    const where: Record<string, unknown> = { siteId: site.id };
    if (location) where.location = loc;
    if (langValue !== undefined && String(langValue).trim()) {
      where.lang = this.langOf(site, langValue);
    }
    const rows = (await this.prisma.geoSiteMenuItem.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    })) as MenuRow[];
    return nodesOf(rows);
  }

  async create(
    user: CurrentUser,
    body: {
      siteId: number;
      location?: string;
      lang?: string;
      parentId?: number;
      label: string;
      targetType?: string;
      targetId?: number;
      url?: string;
      visible?: boolean;
      openNewTab?: boolean;
      sort?: number;
    },
  ) {
    const site = await this.sites.requireSite(user, Number(body.siteId));
    const label = String(body.label ?? '')
      .trim()
      .slice(0, 60);
    if (!label)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写菜单文字（如「产品」「关于我们」）',
      );
    await this.assertCapacity(site.id);
    const location = this.normalizeLocation(body.location);
    const lang = this.langOf(site, body.lang);
    const targetType = this.normalizeTargetType(body.targetType);
    const targetId = Math.max(0, Number(body.targetId ?? 0) || 0);
    const url = normalizeMenuUrl(body.url);
    if (
      targetType === 'PAGE' ||
      targetType === 'ARTICLE' ||
      targetType === 'PRODUCT'
    ) {
      await this.assertTargetOwned(site.id, targetType, targetId);
    } else if (!url) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        targetType === 'URL'
          ? '外部链接需要填写 http(s) 地址'
          : '页内锚点需要填写以 # 开头的片段标识',
      );
    }
    const parentId = Math.max(0, Number(body.parentId ?? 0) || 0);
    if (parentId) await this.assertParent(site.id, parentId, location, lang);
    const sort = Number(body.sort ?? 0) || 0;
    const created = (await this.prisma.geoSiteMenuItem.create({
      data: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        location,
        lang,
        parentId,
        label,
        targetType,
        targetId,
        url,
        sort,
        visible: body.visible === false ? 0 : 1,
        openNewTab: body.openNewTab ? 1 : 0,
      },
    })) as MenuRow;
    // 只回单个节点：列表由前端在保存成功后自动重拉，服务端不再顺带返回整棵树
    return { ...viewOf(created), children: [] };
  }

  async update(
    user: CurrentUser,
    body: {
      id: number;
      label?: string;
      location?: string;
      lang?: string;
      parentId?: number;
      targetType?: string;
      targetId?: number;
      url?: string;
      visible?: boolean;
      openNewTab?: boolean;
      sort?: number;
    },
  ) {
    const row = await this.requireItem(user, Number(body.id));
    const site = await this.sites.requireSite(user, row.siteId);
    const data: Record<string, unknown> = {};
    let lang = normalizeLanguage(row.lang, site.defaultLanguage);
    if (body.lang !== undefined) {
      lang = this.langOf(site, body.lang);
      if (lang !== normalizeLanguage(row.lang, site.defaultLanguage)) {
        const childCount = await this.prisma.geoSiteMenuItem.count({
          where: { siteId: row.siteId, parentId: row.id },
        });
        if (childCount || row.parentId) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '该菜单有子级或挂在父级下，不能单独切换语言：请在新语言下重建导航',
          );
        }
        data.lang = lang;
      }
    }
    if (body.label !== undefined) {
      const label = String(body.label).trim().slice(0, 60);
      if (!label)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '菜单文字不能为空（如「产品」「关于我们」）',
        );
      data.label = label;
    }
    if (body.location !== undefined)
      data.location = this.normalizeLocation(body.location);
    const location = toText(data.location ?? row.location);
    if (body.parentId !== undefined) {
      const parentId = Math.max(0, Number(body.parentId) || 0);
      if (parentId) {
        if (parentId === row.id) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '菜单不能把自己设为父级',
          );
        }
        await this.assertParent(row.siteId, parentId, location, lang);
      }
      data.parentId = parentId;
    }
    const targetType =
      body.targetType !== undefined
        ? this.normalizeTargetType(body.targetType)
        : row.targetType;
    if (body.targetType !== undefined) data.targetType = targetType;
    if (body.targetId !== undefined) {
      const targetId = Math.max(0, Number(body.targetId) || 0);
      await this.assertTargetOwned(row.siteId, targetType, targetId);
      data.targetId = targetId;
    }
    if (body.url !== undefined) {
      const url = normalizeMenuUrl(body.url);
      if ((targetType === 'URL' || targetType === 'ANCHOR') && !url) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          targetType === 'URL'
            ? '外部链接需要填写 http(s) 地址'
            : '页内锚点需要填写以 # 开头的片段标识',
        );
      }
      data.url = url;
    }
    if (body.visible !== undefined) data.visible = body.visible ? 1 : 0;
    if (body.openNewTab !== undefined)
      data.openNewTab = body.openNewTab ? 1 : 0;
    if (body.sort !== undefined) data.sort = Number(body.sort) || 0;
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的内容');
    }
    const saved = (await this.prisma.geoSiteMenuItem.update({
      where: { id: row.id },
      data,
    })) as MenuRow;
    return { ...viewOf(saved), children: [] };
  }

  async remove(user: CurrentUser, body: { id: number }) {
    const row = await this.requireItem(user, Number(body.id));
    // 两级结构：删父级连带删子级，避免留下永远显示不出来的孤儿
    await this.prisma.geoSiteMenuItem.deleteMany({
      where: { siteId: row.siteId, id: { in: [row.id] } },
    });
    await this.prisma.geoSiteMenuItem.deleteMany({
      where: { siteId: row.siteId, parentId: row.id },
    });
    return { ok: true as const, message: '菜单已删除' };
  }

  /** 整层排序 + 结构一次性写回：前端拖拽后提交 [{id,parentId,sort}]。 */
  async saveTree(
    user: CurrentUser,
    body: {
      siteId: number;
      location?: string;
      lang?: string;
      items: { id: number; parentId?: number; sort: number }[];
    },
  ) {
    const site = await this.sites.requireSite(user, Number(body.siteId));
    const location = this.normalizeLocation(body.location);
    const where: Record<string, unknown> = { siteId: site.id, location };
    const lang =
      body.lang !== undefined && String(body.lang).trim()
        ? this.langOf(site, body.lang)
        : '';
    if (lang) where.lang = lang;
    const rows = await this.prisma.geoSiteMenuItem.findMany({
      where,
      select: { id: true, parentId: true },
    });
    const ids = new Set(rows.map((row) => row.id));
    const items = (Array.isArray(body.items) ? body.items : []).filter((item) =>
      ids.has(Number(item.id)),
    );
    const parentIds = new Map(rows.map((row) => [row.id, row.parentId]));
    const tx = items.map((item) => {
      const id = Number(item.id);
      let parentId = Math.max(
        0,
        Number(item.parentId ?? parentIds.get(id) ?? 0),
      );
      // 只允许两级：父级的父级必须是 0，否则把该节点的父级降为顶级
      if (parentId && parentIds.get(parentId)) parentId = 0;
      if (parentId === id) parentId = 0;
      return this.prisma.geoSiteMenuItem.update({
        where: { id },
        data: { sort: Math.max(0, Number(item.sort) || 0), parentId },
      });
    });
    if (tx.length) await this.prisma.$transaction(tx);
    return this.list(user, site.id, location, lang || undefined);
  }

  /* ---------------------------- 快照 ---------------------------- */

  /**
   * 站点发布用：只留可见项，并剔除解析不到线上目标的项。
   * pages/articles/products 三张表的「已发布 id 集合」由调用方（渲染数据服务）传入，
   * 菜单服务因此不必知道内容库的取数细节。
   */
  async snapshot(
    siteId: number,
    online: {
      pages: Set<number>;
      articles: Set<number>;
      products: Set<number>;
    },
  ) {
    const rows = (await this.prisma.geoSiteMenuItem.findMany({
      where: { siteId, visible: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    })) as MenuRow[];
    const keep = rows.filter((row) => {
      if (row.targetType === 'PAGE') return online.pages.has(row.targetId);
      if (row.targetType === 'ARTICLE')
        return online.articles.has(row.targetId);
      if (row.targetType === 'PRODUCT')
        return online.products.has(row.targetId);
      return Boolean(row.url);
    });
    const keptIds = new Set(keep.map((row) => row.id));
    const usable = keep.filter(
      (row) => !row.parentId || keptIds.has(row.parentId),
    );
    const tree = nodesOf(usable);
    return this.toSnapshotNodes(tree);
  }

  /** 快照 JSON → 节点树：脏数据（非数组/缺字段）一律丢弃，绝不把未知结构拼进公开页面。 */
  static deserialize(value: unknown): GeoSiteMenuNode[] {
    if (!Array.isArray(value)) return [];
    const walk = (list: unknown[]): GeoSiteMenuNode[] =>
      list.flatMap((item): GeoSiteMenuNode[] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const raw = item as Record<string, unknown>;
        const label =
          typeof raw.label === 'string' ? raw.label.slice(0, 60) : '';
        if (!label) return [];
        const targetType =
          typeof raw.targetType === 'string' && TARGETS.has(raw.targetType)
            ? raw.targetType
            : 'URL';
        const targetId = Math.max(0, Number(raw.targetId ?? 0) || 0);
        const url = normalizeMenuUrl(raw.url);
        if (targetType === 'URL' && !url) return [];
        if (targetType === 'ANCHOR' && !url.startsWith('#')) return [];
        if (targetType !== 'URL' && targetType !== 'ANCHOR' && !targetId) {
          return [];
        }
        const location =
          typeof raw.location === 'string' && LOCATIONS.has(raw.location)
            ? raw.location
            : 'HEADER';
        return [
          {
            id: Math.max(0, Number(raw.id ?? 0) || 0),
            label,
            location,
            lang:
              typeof raw.lang === 'string' && raw.lang
                ? normalizeLanguage(raw.lang)
                : '',
            newTab: raw.newTab === true,
            targetType,
            targetId,
            url,
            children: Array.isArray(raw.children) ? walk(raw.children) : [],
          },
        ];
      });
    return walk(value);
  }

  /** 草稿树 → 快照节点：丢掉 sort/visible 等编辑期字段，快照只需要链接与层级。 */
  private toSnapshotNodes(tree: GeoSiteMenuView[]): GeoSiteMenuNode[] {
    return tree.map((node) => ({
      id: node.id,
      label: node.label,
      location: node.location,
      lang: node.lang,
      newTab: node.openNewTab,
      targetType: node.targetType,
      targetId: node.targetId,
      url: node.url,
      children: this.toSnapshotNodes(node.children),
    }));
  }

  /* ---------------------------- 内部 ---------------------------- */

  private async requireItem(user: CurrentUser, id: number): Promise<MenuRow> {
    const row = (await this.prisma.geoSiteMenuItem.findUnique({
      where: { id },
    })) as MenuRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '菜单项不存在');
    await this.sites.requireSite(user, row.siteId);
    return row;
  }

  private langOf(
    site: { defaultLanguage: string; languages: unknown },
    value: unknown,
  ): string {
    const def = normalizeLanguage(site.defaultLanguage);
    const lang = normalizeLanguage(value, def);
    const enabled = normalizeLanguageList(site.languages, def);
    if (!enabled.includes(lang)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `站点未启用「${GEO_SITE_LANGUAGE_LABELS[lang] || lang}」：请先在「站点设置 · 多语言」勾选该语言`,
      );
    }
    return lang;
  }

  private normalizeLocation(value: unknown): string {
    const raw = toText(value).trim().toUpperCase();
    if (!raw) return 'HEADER';
    if (!LOCATIONS.has(raw)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '菜单位置只支持 HEADER（顶部）与 FOOTER（页脚）',
      );
    }
    return raw;
  }

  private normalizeTargetType(value: unknown): string {
    const raw = toText(value).trim().toUpperCase();
    if (!raw) return 'PAGE';
    if (!TARGETS.has(raw)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '菜单目标类型不支持该值',
      );
    }
    return raw;
  }

  private async assertCapacity(siteId: number) {
    const count = await this.prisma.geoSiteMenuItem.count({
      where: { siteId },
    });
    if (count >= GEO_SITE_LIMITS.maxMenusPerSite) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单个站点最多 ${GEO_SITE_LIMITS.maxMenusPerSite} 个菜单项`,
      );
    }
  }

  private async assertParent(
    siteId: number,
    parentId: number,
    location: string,
    lang: string,
  ) {
    const parent = await this.prisma.geoSiteMenuItem.findFirst({
      where: { id: parentId, siteId },
    });
    if (!parent) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '父级菜单不存在，请先创建父级或改为顶级',
      );
    }
    if (parent.location !== location) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '父级菜单与当前菜单不在同一位置（顶部/页脚不能互相嵌套）',
      );
    }
    if (normalizeLanguage(parent.lang) !== lang) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '父级菜单与当前菜单不是同一语言，请在新语言下重建导航',
      );
    }
    if (parent.parentId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '导航只支持两级，不能再往子级下挂菜单',
      );
    }
  }

  /** 目标必须属于本站：跨站挂页面/文章会把别的企业的站内地址塞进本站导航。 */
  private async assertTargetOwned(
    siteId: number,
    targetType: string,
    targetId: number,
  ) {
    if (!targetId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择菜单要跳转的页面或内容',
      );
    }
    let owned = false;
    if (targetType === 'PAGE') {
      owned = !!(await this.prisma.geoSitePage.findFirst({
        where: { id: targetId, siteId },
        select: { id: true },
      }));
    } else if (targetType === 'ARTICLE') {
      owned = !!(await this.prisma.geoSiteArticle.findFirst({
        where: { id: targetId, siteId },
        select: { id: true },
      }));
    } else if (targetType === 'PRODUCT') {
      owned = !!(await this.prisma.geoSiteProduct.findFirst({
        where: { id: targetId, siteId },
        select: { id: true },
      }));
    }
    if (!owned) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '菜单目标不属于本站点，请重新选择',
      );
    }
  }
}
