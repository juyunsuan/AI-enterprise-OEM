import {
  geoSiteAdminSettingsBodySchema,
  geoSiteContentBodySchema,
  geoSiteCreateBodySchema,
  geoSiteDomainBindBodySchema,
  geoSiteDomainIdBodySchema,
  geoSiteOfflineBodySchema,
  geoSiteUpdateBodySchema,
  type z,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { GeoSiteDomainService } from './geo-site-domain.service';
import { GeoSiteSettingsService } from './geo-site.settings.service';
import { GeoSiteService } from './geo-site.service';

/**
 * GEO 独立站契约处理器：`GeoSite_*` 企业侧、`GeoSiteAdmin_*` 平台管理侧，
 * 由 automation-routes 的 moduleHandlers 按 operationId 映射；
 * 参数顺序＝用户、路径参数、查询、请求体，返回裸数据，信封由 moduleHandlers 统一包。
 * 请求体已由 createRoute 的 zod schema 校验过，这里的类型只描述形状。
 */
type CreateBody = z.infer<typeof geoSiteCreateBodySchema>;
type UpdateBody = z.infer<typeof geoSiteUpdateBodySchema>;
type ContentBody = z.infer<typeof geoSiteContentBodySchema>;
type BindBody = z.infer<typeof geoSiteDomainBindBodySchema>;
type DomainIdBody = z.infer<typeof geoSiteDomainIdBodySchema>;
type OfflineBody = z.infer<typeof geoSiteOfflineBodySchema>;
type AdminSettingsBody = z.infer<typeof geoSiteAdminSettingsBodySchema>;

export class GeoSiteController {
  constructor(
    private readonly siteService: GeoSiteService,
    private readonly domainService: GeoSiteDomainService,
    private readonly settingsService: GeoSiteSettingsService,
  ) {}

  // ---------- 企业侧：站点 ----------

  meta(user: CurrentUser) {
    return this.siteService.meta(user);
  }

  list(user: CurrentUser) {
    return this.siteService.list(user);
  }

  create(user: CurrentUser, body: CreateBody) {
    return this.siteService.create(user, body);
  }

  detail(user: CurrentUser, query: { id: number }) {
    return this.siteService.detail(user, Number(query.id));
  }

  update(user: CurrentUser, body: UpdateBody) {
    return this.siteService.update(user, body);
  }

  saveContent(user: CurrentUser, body: ContentBody) {
    return this.siteService.saveContent(user, body);
  }

  publish(user: CurrentUser, body: { id: number }) {
    return this.siteService.publish(user, Number(body.id));
  }

  unpublish(user: CurrentUser, body: { id: number }) {
    return this.siteService.unpublish(user, Number(body.id));
  }

  duplicate(user: CurrentUser, body: { id: number }) {
    return this.siteService.duplicate(user, Number(body.id));
  }

  remove(user: CurrentUser, body: { id: number }) {
    return this.siteService.remove(user, Number(body.id));
  }

  billing(user: CurrentUser, query: { siteId: number }) {
    return this.siteService.billing(user, Number(query.siteId));
  }

  /** 发布台账：站点/页面/内容三类发布留痕，只读。 */
  publishLog(
    user: CurrentUser,
    query: { siteId: number; page?: number; pageSize?: number },
  ) {
    return this.siteService.publishLog(user, query);
  }

  // ---------- 企业侧：自定义域名 ----------

  domains(user: CurrentUser, query: { siteId: number }) {
    return this.domainService.list(user, Number(query.siteId));
  }

  bindDomain(user: CurrentUser, body: BindBody) {
    return this.domainService.bind(user, body);
  }

  verifyDomain(user: CurrentUser, body: DomainIdBody) {
    return this.domainService.verify(user, Number(body.domainId));
  }

  removeDomain(user: CurrentUser, body: DomainIdBody) {
    return this.domainService.remove(user, Number(body.domainId));
  }

  setPrimaryDomain(user: CurrentUser, body: DomainIdBody) {
    return this.domainService.setPrimary(user, Number(body.domainId));
  }

  // ---------- 平台管理侧（管理端鉴权在服务层收口） ----------

  getSettings(user: CurrentUser) {
    return this.settingsService.viewForAdmin(user);
  }

  saveSettings(user: CurrentUser, body: AdminSettingsBody) {
    return this.settingsService.save(user, body);
  }

  page(
    user: CurrentUser,
    query: { page?: number; pageSize?: number; q?: string; status?: string },
  ) {
    return this.siteService.adminPage(user, query);
  }

  offline(user: CurrentUser, body: OfflineBody) {
    return this.siteService.adminOffline(user, body);
  }

  online(user: CurrentUser, body: { id: number }) {
    return this.siteService.adminOnline(user, Number(body.id));
  }

  stats(user: CurrentUser) {
    return this.siteService.adminStats(user);
  }

  domainGuide() {
    return this.settingsService.accessGuide();
  }

  domainList(
    user: CurrentUser,
    query: { page?: number; pageSize?: number; q?: string; status?: string },
  ) {
    return this.domainService.adminList(user, query);
  }

  domainCheck(user: CurrentUser, body: DomainIdBody) {
    return this.domainService.adminCheck(user, Number(body.domainId));
  }

  domainRemove(user: CurrentUser, body: DomainIdBody) {
    return this.domainService.adminRemove(user, Number(body.domainId));
  }

  domainResolve(user: CurrentUser, query: { host: string }) {
    return this.domainService.resolveHost(user, query.host);
  }
}
