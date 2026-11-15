import type { z } from '@hono/zod-openapi';
import type {
  geoSiteContentActionBodySchema,
  geoSiteContentBodyBodySchema,
  geoSiteContentCreateBodySchema,
  geoSiteContentIdQuerySchema,
  geoSiteContentListQuerySchema,
  geoSiteContentUpdateBodySchema,
  geoSiteMenuCreateBodySchema,
  geoSiteMenuListQuerySchema,
  geoSiteMenuTreeBodySchema,
  geoSiteMenuUpdateBodySchema,
  geoSitePageContentBodySchema,
  geoSitePageCopyBodySchema,
  geoSitePageCreateBodySchema,
  geoSitePageIdQuerySchema,
  geoSitePageQuerySchema,
  geoSitePageReorderBodySchema,
  geoSitePageScriptsBodySchema,
  geoSitePageUpdateBodySchema,
  geoSiteTemplateApplyBodySchema,
  geoSiteTemplateIdBodySchema,
  geoSiteTemplateIdQuerySchema,
  geoSiteTemplateListQuerySchema,
  geoSiteTemplateSaveBodySchema,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { GeoSiteContentService } from './geo-site-content.service';
import { GeoSiteMenuService } from './geo-site-menu.service';
import { GeoSitePageService } from './geo-site-page.service';
import { GeoSiteTemplateService } from './geo-site-template.service';

/**
 * 站点 CMS 契约处理器：`GeoSitePage_*`、`GeoSiteMenu_*`、`GeoSiteContent_*` 三组前缀各一个控制器，
 * 由 automation-routes 的 moduleHandlers 按 operationId 后缀映射同名方法
 * （三块都有 list/create/remove，方法名会同名，所以不能共用一个控制器实例）。
 * 参数顺序＝用户、路径参数、查询、请求体；控制器只做契约类型 → 服务入参的搬运，
 * 归属与权限一律在服务里收口（每个方法第一件事都是 requireSite）。
 */
type PageQuery = z.infer<typeof geoSitePageQuerySchema>;
type PageIdQuery = z.infer<typeof geoSitePageIdQuerySchema>;
type PageCreateBody = z.infer<typeof geoSitePageCreateBodySchema>;
type PageUpdateBody = z.infer<typeof geoSitePageUpdateBodySchema>;
type PageCopyBody = z.infer<typeof geoSitePageCopyBodySchema>;
type PageContentBody = z.infer<typeof geoSitePageContentBodySchema>;
type PageScriptsBody = z.infer<typeof geoSitePageScriptsBodySchema>;
type PageReorderBody = z.infer<typeof geoSitePageReorderBodySchema>;
type IdBody = { id: number };

export class GeoSitePageController {
  constructor(private readonly pages: GeoSitePageService) {}

  bootstrap(user: CurrentUser, query: PageQuery) {
    return this.pages.bootstrap(user, Number(query.siteId));
  }

  list(user: CurrentUser, query: PageQuery) {
    return this.pages.list(user, Number(query.siteId));
  }

  detail(user: CurrentUser, query: PageIdQuery) {
    return this.pages.detail(user, Number(query.id));
  }

  create(user: CurrentUser, body: PageCreateBody) {
    return this.pages.create(user, body);
  }

  update(user: CurrentUser, body: PageUpdateBody) {
    return this.pages.update(user, body);
  }

  copyToLanguage(user: CurrentUser, body: PageCopyBody) {
    return this.pages.copyToLanguage(user, body);
  }

  saveContent(user: CurrentUser, body: PageContentBody) {
    return this.pages.saveContent(user, body);
  }

  /** 返回体带 rejected/whitelist：被平台白名单拒掉的脚本必须让站长看见原因。 */
  saveScripts(user: CurrentUser, body: PageScriptsBody) {
    return this.pages.saveScripts(user, body);
  }

  reorder(user: CurrentUser, body: PageReorderBody) {
    return this.pages.reorder(user, body);
  }

  setHome(user: CurrentUser, body: IdBody) {
    return this.pages.setHome(user, body);
  }

  publish(user: CurrentUser, body: IdBody) {
    return this.pages.publish(user, body);
  }

  offline(user: CurrentUser, body: IdBody) {
    return this.pages.offline(user, body);
  }

  remove(user: CurrentUser, body: IdBody) {
    return this.pages.remove(user, body);
  }
}

export class GeoSiteMenuController {
  constructor(private readonly menus: GeoSiteMenuService) {}

  list(user: CurrentUser, query: MenuListQuery) {
    return this.menus.list(
      user,
      Number(query.siteId),
      query.location,
      query.lang,
    );
  }

  create(user: CurrentUser, body: MenuCreateBody) {
    return this.menus.create(user, body);
  }

  update(user: CurrentUser, body: MenuUpdateBody) {
    return this.menus.update(user, body);
  }

  remove(user: CurrentUser, body: IdBody) {
    return this.menus.remove(user, body);
  }

  saveTree(user: CurrentUser, body: MenuTreeBody) {
    return this.menus.saveTree(user, body);
  }
}

type MenuListQuery = z.infer<typeof geoSiteMenuListQuerySchema>;
type MenuCreateBody = z.infer<typeof geoSiteMenuCreateBodySchema>;
type MenuUpdateBody = z.infer<typeof geoSiteMenuUpdateBodySchema>;
type MenuTreeBody = z.infer<typeof geoSiteMenuTreeBodySchema>;
type ContentListQuery = z.infer<typeof geoSiteContentListQuerySchema>;
type ContentIdQuery = z.infer<typeof geoSiteContentIdQuerySchema>;
type ContentCreateBody = z.infer<typeof geoSiteContentCreateBodySchema>;
type ContentUpdateBody = z.infer<typeof geoSiteContentUpdateBodySchema>;
type ContentBodyBody = z.infer<typeof geoSiteContentBodyBodySchema>;
type ContentActionBody = z.infer<typeof geoSiteContentActionBodySchema>;
type TemplateListQuery = z.infer<typeof geoSiteTemplateListQuerySchema>;
type TemplateIdQuery = z.infer<typeof geoSiteTemplateIdQuerySchema>;
type TemplateIdBody = z.infer<typeof geoSiteTemplateIdBodySchema>;
type TemplateSaveBody = z.infer<typeof geoSiteTemplateSaveBodySchema>;
type TemplateApplyBody = z.infer<typeof geoSiteTemplateApplyBodySchema>;

export class GeoSiteContentController {
  constructor(private readonly contents: GeoSiteContentService) {}

  /** kind 是查询/请求体字段而不是路径段：非法值由服务统一报 400，绝不落进 SQL。 */
  list(user: CurrentUser, query: ContentListQuery) {
    return this.contents.page(user, this.contents.parseKind(query.kind), {
      siteId: Number(query.siteId),
      lang: query.lang,
      status: query.status,
      q: query.q,
      category: query.category,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
    });
  }

  detail(user: CurrentUser, query: ContentIdQuery) {
    return this.contents.detail(
      user,
      this.contents.parseKind(query.kind),
      Number(query.id),
    );
  }

  /** 菜单选择器与列表页数据源都用它：一次拿齐本站页面/文章/产品候选。 */
  pickers(user: CurrentUser, query: PageQuery) {
    return this.contents.pickers(user, Number(query.siteId));
  }

  create(user: CurrentUser, body: ContentCreateBody) {
    return this.contents.create(user, this.contents.parseKind(body.kind), {
      ...body,
    });
  }

  update(user: CurrentUser, body: ContentUpdateBody) {
    return this.contents.update(user, this.contents.parseKind(body.kind), {
      ...body,
    });
  }

  saveBody(user: CurrentUser, body: ContentBodyBody) {
    return this.contents.saveBody(user, this.contents.parseKind(body.kind), {
      id: Number(body.id),
      content: body.content,
    });
  }

  publish(user: CurrentUser, body: ContentActionBody) {
    return this.contents.publish(
      user,
      this.contents.parseKind(body.kind),
      Number(body.id),
    );
  }

  offline(user: CurrentUser, body: ContentActionBody) {
    return this.contents.offline(
      user,
      this.contents.parseKind(body.kind),
      Number(body.id),
    );
  }

  remove(user: CurrentUser, body: ContentActionBody) {
    return this.contents.remove(
      user,
      this.contents.parseKind(body.kind),
      Number(body.id),
    );
  }
}

export class GeoSiteTemplateController {
  constructor(private readonly templates: GeoSiteTemplateService) {}

  /** kind 可省略：省略时区块与整页模板一起返回，编辑器一次拿到两组。 */
  list(user: CurrentUser, query: TemplateListQuery) {
    return this.templates.list(user, Number(query.siteId), query.kind);
  }

  detail(user: CurrentUser, query: TemplateIdQuery) {
    return this.templates.detail(user, Number(query.id));
  }

  save(user: CurrentUser, body: TemplateSaveBody) {
    return this.templates.save(user, body);
  }

  /** 套用模板：mode 省略时由模板类型决定（整页替换、区块追加）。 */
  apply(user: CurrentUser, body: TemplateApplyBody) {
    return this.templates.apply(user, body);
  }

  remove(user: CurrentUser, body: TemplateIdBody) {
    return this.templates.remove(user, body);
  }
}
