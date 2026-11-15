"use client";
import type { GeoSiteLanguage } from "@enterprise/contracts";
import { geoSiteApi, geoSiteCmsApi } from "@/api/geo-site";
import { useBusinessMutation, useBusinessQuery } from "./business";

const SITE = "geo-site";
/** 站点写操作会同时影响企业侧列表与平台台账，两侧一起刷新。 */
const REFRESH = [SITE, "admin-geo-site"];

// ---------- 企业侧 ----------
export const useGeoSiteMeta = () =>
  useBusinessQuery(SITE, "meta", {}, (signal) => geoSiteApi.meta({}, { signal }));

export const useGeoSites = () =>
  useBusinessQuery(SITE, "list", {}, (signal) => geoSiteApi.list({}, { signal }));

export const useGeoSiteDetail = (id: number) =>
  useBusinessQuery(
    SITE,
    "detail",
    { id },
    (signal) => geoSiteApi.detail({ query: { id } }, { signal }),
    "all",
    id > 0,
  );

export const useGeoSiteDomains = (siteId: number) =>
  useBusinessQuery(
    SITE,
    "domains",
    { siteId },
    (signal) => geoSiteApi.domains({ query: { siteId } }, { signal }),
    "all",
    siteId > 0,
  );

export const useGeoSiteBilling = (siteId: number) =>
  useBusinessQuery(
    SITE,
    "billing",
    { siteId },
    (signal) => geoSiteApi.billing({ query: { siteId } }, { signal }),
    "all",
    siteId > 0,
  );

export function useGeoSiteActions() {
  return {
    create: useBusinessMutation((input: Parameters<typeof geoSiteApi.create>[0]) => geoSiteApi.create(input), REFRESH),
    update: useBusinessMutation((input: Parameters<typeof geoSiteApi.update>[0]) => geoSiteApi.update(input), REFRESH),
    saveContent: useBusinessMutation((input: Parameters<typeof geoSiteApi.saveContent>[0]) => geoSiteApi.saveContent(input), REFRESH),
    publish: useBusinessMutation((input: Parameters<typeof geoSiteApi.publish>[0]) => geoSiteApi.publish(input), REFRESH),
    unpublish: useBusinessMutation((input: Parameters<typeof geoSiteApi.unpublish>[0]) => geoSiteApi.unpublish(input), REFRESH),
    duplicate: useBusinessMutation((input: Parameters<typeof geoSiteApi.duplicate>[0]) => geoSiteApi.duplicate(input), REFRESH),
    remove: useBusinessMutation((input: Parameters<typeof geoSiteApi.remove>[0]) => geoSiteApi.remove(input), REFRESH),
    bindDomain: useBusinessMutation((input: Parameters<typeof geoSiteApi.bindDomain>[0]) => geoSiteApi.bindDomain(input), REFRESH),
    verifyDomain: useBusinessMutation((input: Parameters<typeof geoSiteApi.verifyDomain>[0]) => geoSiteApi.verifyDomain(input), REFRESH),
    removeDomain: useBusinessMutation((input: Parameters<typeof geoSiteApi.removeDomain>[0]) => geoSiteApi.removeDomain(input), REFRESH),
    setPrimaryDomain: useBusinessMutation((input: Parameters<typeof geoSiteApi.setPrimaryDomain>[0]) => geoSiteApi.setPrimaryDomain(input), REFRESH),
  };
}

// ---------- 平台管理侧 ----------
export const useGeoSiteAdminSettings = (enabled = true) =>
  useBusinessQuery(
    "admin-geo-site",
    "settings",
    {},
    (signal) => geoSiteApi.adminSettings({}, { signal }),
    "all",
    enabled,
  );

export const useGeoSiteAdminPage = (q: string, status: string, page: number) =>
  useBusinessQuery(
    "admin-geo-site",
    "page",
    { q, status, page },
    (signal) =>
      geoSiteApi.adminPage({
        query: { q: q || undefined, status: status || undefined, page, pageSize: 20 },
      }, { signal }),
    "all",
    true,
  );

export const useGeoSiteAdminStats = (enabled = true) =>
  useBusinessQuery(
    "admin-geo-site",
    "stats",
    {},
    (signal) => geoSiteApi.adminStats({}, { signal }),
    "all",
    enabled,
  );

export const useGeoSiteAdminAccessGuide = (enabled = true) =>
  useBusinessQuery(
    "admin-geo-site",
    "domain-guide",
    {},
    (signal) => geoSiteApi.adminDomainGuide({}, { signal }),
    "all",
    enabled,
  );

export const useGeoSiteAdminDomains = (
  q: string,
  status: string,
  page: number,
) =>
  useBusinessQuery(
    "admin-geo-site",
    "domains",
    { q, status, page },
    (signal) =>
      geoSiteApi.adminDomains(
        {
          query: {
            q: q || undefined,
            status: status || undefined,
            page,
            pageSize: 20,
          },
        },
        { signal },
      ),
    "all",
    true,
  );

/** 回源自检：按 host 反查会落到哪个站点，给管理员定位「域名解析对了但站不对」。 */
export const useGeoSiteAdminResolveHost = (host: string, enabled: boolean) =>
  useBusinessQuery(
    "admin-geo-site",
    "resolve-host",
    { host },
    (signal) => geoSiteApi.adminResolveHost({ query: { host } }, { signal }),
    "all",
    enabled && host.trim().length > 0,
  );

export function useGeoSiteAdminActions() {
  return {
    saveSettings: useBusinessMutation(
      (input: Parameters<typeof geoSiteApi.adminSaveSettings>[0]) =>
        geoSiteApi.adminSaveSettings(input),
      ["admin-geo-site"],
    ),
    checkDomain: useBusinessMutation(
      (input: Parameters<typeof geoSiteApi.adminCheckDomain>[0]) =>
        geoSiteApi.adminCheckDomain(input),
      ["admin-geo-site", SITE],
    ),
    removeDomain: useBusinessMutation(
      (input: Parameters<typeof geoSiteApi.adminRemoveDomain>[0]) =>
        geoSiteApi.adminRemoveDomain(input),
      ["admin-geo-site", SITE],
    ),
    offline: useBusinessMutation(
      (input: Parameters<typeof geoSiteApi.adminOffline>[0]) =>
        geoSiteApi.adminOffline(input),
      ["admin-geo-site", SITE],
    ),
    online: useBusinessMutation(
      (input: Parameters<typeof geoSiteApi.adminOnline>[0]) =>
        geoSiteApi.adminOnline(input),
      ["admin-geo-site", SITE],
    ),
  };
}

// ---------- 站点 CMS（页面 / 菜单 / 内容库）----------
// 类型全部从契约返回值推导：后端改字段时这里跟着报错，不会悄悄展示旧字段。
export type GeoSitePageRow = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.pageBootstrap>>
>["pages"][number];
export type GeoSitePageData = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.pageDetail>>
>;
export type GeoSiteMenuRow = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.menuList>>
>[number];
export type GeoSiteContentRow = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.contentList>>
>["items"][number];
export type GeoSiteContentData = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.contentDetail>>
>;
export type GeoSitePickers = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.contentPickers>>
>;
export type GeoSiteTemplateRow = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.templateList>>
>[number];
export type GeoSiteTemplateData = NonNullable<
  Awaited<ReturnType<typeof geoSiteCmsApi.templateDetail>>
>;

/** 发布台账：站点/页面/内容三类发布留痕，只读展示。 */
export const useGeoSitePublishLog = (siteId: number, page = 1) =>
  useBusinessQuery(
    SITE,
    "publish-log",
    { siteId, page },
    (signal) =>
      geoSiteApi.publishLog(
        { query: { siteId, page, pageSize: 20 } },
        { signal },
      ),
    "all",
    siteId > 0,
  );

/** 模板库清单：kind 省略时区块与整页一起返回。 */
export const useGeoSiteTemplates = (siteId: number, kind?: "BLOCK" | "PAGE") =>
  useBusinessQuery(
    SITE,
    "template-list",
    { siteId, kind: kind ?? "" },
    (signal) =>
      geoSiteCmsApi.templateList(
        { query: { siteId, kind } },
        { signal },
      ),
    "all",
    siteId > 0,
  );

export const useGeoSiteTemplate = (id: number) =>
  useBusinessQuery(
    SITE,
    "template-detail",
    { id },
    (signal) => geoSiteCmsApi.templateDetail({ query: { id } }, { signal }),
    "all",
    id > 0,
  );

/** 页面清单 + 可用模板：进工作台一次拿全，新建弹窗直接用同一份模板列表。 */
export const useGeoSitePages = (siteId: number) =>
  useBusinessQuery(
    SITE,
    "page-bootstrap",
    { siteId },
    (signal) => geoSiteCmsApi.pageBootstrap({ query: { siteId } }, { signal }),
    "all",
    siteId > 0,
  );

export const useGeoSitePage = (id: number) =>
  useBusinessQuery(
    SITE,
    "page-detail",
    { id },
    (signal) => geoSiteCmsApi.pageDetail({ query: { id } }, { signal }),
    "all",
    id > 0,
  );

export const useGeoSiteMenus = (siteId: number, lang?: GeoSiteLanguage) =>
  useBusinessQuery(
    SITE,
    "menu-list",
    { siteId, lang: lang ?? "" },
    (signal) => geoSiteCmsApi.menuList({ query: { siteId, lang } }, { signal }),
    "all",
    siteId > 0,
  );

/** 菜单/详情链接的目标候选：页面 + 文章 + 产品三张短表。 */
export const useGeoSitePickers = (siteId: number) =>
  useBusinessQuery(
    SITE,
    "content-pickers",
    { siteId },
    (signal) => geoSiteCmsApi.contentPickers({ query: { siteId } }, { signal }),
    "all",
    siteId > 0,
  );

export const useGeoSiteContents = (
  siteId: number,
  kind: "article" | "product",
  filters: { status?: string; q?: string; lang?: GeoSiteLanguage; page?: number } = {},
) =>
  useBusinessQuery(
    SITE,
    "content-list",
    { siteId, kind, ...filters },
    (signal) =>
      geoSiteCmsApi.contentList(
        {
          query: {
            siteId,
            kind,
            lang: filters.lang || undefined,
            status: filters.status || undefined,
            q: filters.q || undefined,
            page: filters.page ?? 1,
            pageSize: 20,
          },
        },
        { signal },
      ),
    "all",
    siteId > 0,
  );

export const useGeoSiteContent = (id: number, kind: "article" | "product") =>
  useBusinessQuery(
    SITE,
    "content-detail",
    { id, kind },
    (signal) => geoSiteCmsApi.contentDetail({ query: { id, kind } }, { signal }),
    "all",
    id > 0,
  );

/**
 * CMS 写操作一律失效整个 geo-site 模块：页面/菜单/内容互相引用（菜单指向页面、
 * 页面取数于内容库），只刷自己那张表会让别的面板停在旧数据上。
 */
export function useGeoSiteCmsActions() {
  return {
    pageCreate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageCreate>[0]) =>
        geoSiteCmsApi.pageCreate(input),
      REFRESH,
    ),
    pageUpdate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageUpdate>[0]) =>
        geoSiteCmsApi.pageUpdate(input),
      REFRESH,
    ),
    pageCopyToLanguage: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageCopyToLanguage>[0]) =>
        geoSiteCmsApi.pageCopyToLanguage(input),
      REFRESH,
    ),
    pageSaveContent: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageSaveContent>[0]) =>
        geoSiteCmsApi.pageSaveContent(input),
      REFRESH,
    ),
    pageSaveScripts: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageSaveScripts>[0]) =>
        geoSiteCmsApi.pageSaveScripts(input),
      REFRESH,
    ),
    pageReorder: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageReorder>[0]) =>
        geoSiteCmsApi.pageReorder(input),
      REFRESH,
    ),
    pageSetHome: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageSetHome>[0]) =>
        geoSiteCmsApi.pageSetHome(input),
      REFRESH,
    ),
    pagePublish: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pagePublish>[0]) =>
        geoSiteCmsApi.pagePublish(input),
      REFRESH,
    ),
    pageOffline: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageOffline>[0]) =>
        geoSiteCmsApi.pageOffline(input),
      REFRESH,
    ),
    pageRemove: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.pageRemove>[0]) =>
        geoSiteCmsApi.pageRemove(input),
      REFRESH,
    ),
    menuCreate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.menuCreate>[0]) =>
        geoSiteCmsApi.menuCreate(input),
      REFRESH,
    ),
    menuUpdate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.menuUpdate>[0]) =>
        geoSiteCmsApi.menuUpdate(input),
      REFRESH,
    ),
    menuRemove: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.menuRemove>[0]) =>
        geoSiteCmsApi.menuRemove(input),
      REFRESH,
    ),
    menuSaveTree: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.menuSaveTree>[0]) =>
        geoSiteCmsApi.menuSaveTree(input),
      REFRESH,
    ),
    contentCreate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentCreate>[0]) =>
        geoSiteCmsApi.contentCreate(input),
      REFRESH,
    ),
    contentUpdate: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentUpdate>[0]) =>
        geoSiteCmsApi.contentUpdate(input),
      REFRESH,
    ),
    contentSaveBody: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentSaveBody>[0]) =>
        geoSiteCmsApi.contentSaveBody(input),
      REFRESH,
    ),
    contentPublish: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentPublish>[0]) =>
        geoSiteCmsApi.contentPublish(input),
      REFRESH,
    ),
    contentOffline: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentOffline>[0]) =>
        geoSiteCmsApi.contentOffline(input),
      REFRESH,
    ),
    contentRemove: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.contentRemove>[0]) =>
        geoSiteCmsApi.contentRemove(input),
      REFRESH,
    ),
    templateSave: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.templateSave>[0]) =>
        geoSiteCmsApi.templateSave(input),
      REFRESH,
    ),
    templateApply: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.templateApply>[0]) =>
        geoSiteCmsApi.templateApply(input),
      REFRESH,
    ),
    templateRemove: useBusinessMutation(
      (input: Parameters<typeof geoSiteCmsApi.templateRemove>[0]) =>
        geoSiteCmsApi.templateRemove(input),
      REFRESH,
    ),
  };
}
