import {
  type KuaidiAppSaveBody,
  type KuaidiAppTestResult,
  type KuaidiCompanySaveBody,
  type KuaidiOrderActionBody,
  type KuaidiOrderListQuery,
  type KuaidiPayAccountSaveBody,
  type KuaidiSiteSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { KuaidiCompanyService } from './kuaidi.company.service';
import type { KuaidiCustomerService } from './kuaidi.customer.service';
import type { KuaidiOrderService } from './kuaidi.order.service';
import type { KuaidiPayService } from './kuaidi.pay.service';
import type { KuaidiPlatformService } from './kuaidi.platform.service';
import type { KuaidiReleaseService } from './kuaidi.release.service';
import type { KuaidiSiteService } from './kuaidi.site.service';
import { clip, requireSiteId } from './kuaidi.shared';

/** 本机公网出口 IP：微信「代码上传」白名单要填它，容器内取不到就只能显式配置。 */
function serverIp(): string {
  return clip(process.env.PUBLIC_SERVER_IP || '', 64);
}

/**
 * 快递寄件小程序工具·店主侧。
 * 方法名与契约 `Kuaidi_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）。
 *
 * 主体口径：一个账号一部小程序，AppID/密钥、出包台账、收款账户都挂在账号级；
 * 站点只是寄件点，订单、报价、顾客仍按站点归属。
 */
export class KuaidiController {
  constructor(
    private readonly siteService: KuaidiSiteService,
    private readonly companyService: KuaidiCompanyService,
    private readonly orderService: KuaidiOrderService,
    private readonly customerService: KuaidiCustomerService,
    private readonly releases: KuaidiReleaseService,
    private readonly platform: KuaidiPlatformService,
    private readonly miniApp: MiniAppService,
    private readonly pay: KuaidiPayService,
  ) {}

  // ---------- 元信息与站点 ----------

  async meta(user: CurrentUser) {
    return this.siteService.meta(user);
  }

  async overview(user: CurrentUser, query: Record<string, unknown>) {
    return this.siteService.overview(user, requireSiteId(query.siteId));
  }

  async sites(user: CurrentUser) {
    return this.siteService.sites(user);
  }

  async siteCreate(user: CurrentUser, body: KuaidiSiteSaveBody) {
    return this.siteService.createSite(user, body);
  }

  async siteDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.siteService.siteDetail(user, requireSiteId(query.siteId));
  }

  async siteSave(user: CurrentUser, body: KuaidiSiteSaveBody) {
    return this.siteService.saveSite(user, body.id, body);
  }

  async siteStatus(user: CurrentUser, body: { id: number; status: string }) {
    return this.siteService.setStatus(
      user,
      requireSiteId(body.id),
      String(body.status),
    );
  }

  async siteRemove(user: CurrentUser, body: { siteId: number }) {
    return this.siteService.removeSite(user, requireSiteId(body.siteId));
  }

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=EXPRESS / shopId=0）----------

  private subject(user: CurrentUser) {
    return this.siteService.subject({ ownerUserId: user.userId });
  }

  async appDetail(user: CurrentUser) {
    return this.miniApp.view(this.subject(user));
  }

  async appSave(user: CurrentUser, body: KuaidiAppSaveBody) {
    return this.miniApp.save(this.subject(user), body);
  }

  /**
   * 连通自检。失败时必须给出下一步动作与页面入口，不能只把微信的错误码抛给用户。
   */
  async appTest(user: CurrentUser): Promise<KuaidiAppTestResult> {
    const subject = this.subject(user);
    try {
      const result = await this.miniApp.test(subject);
      return {
        ...result,
        nextAction: result.ok
          ? ''
          : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把本机 IP 加入白名单',
        nextPath: result.ok ? '' : '/kuaidi?tab=publish',
        serverIp: serverIp(),
      };
    } catch (error) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: error instanceof Error ? error.message : '自检失败',
        nextAction: '到「小程序发布」补齐 AppID 与 AppSecret 后再试',
        nextPath: '/kuaidi?tab=publish',
        serverIp: serverIp(),
      };
    }
  }

  async qrcodeGenerate(user: CurrentUser, body: { path?: string }) {
    return this.releases.qrcode(user, String(body.path || ''));
  }

  // ---------- 收款账户（企业级，多寄件点共用）----------

  async enterprises(user: CurrentUser) {
    return this.pay.enterprises(user);
  }

  async payAccounts(user: CurrentUser) {
    return this.pay.accounts(user);
  }

  async payAccountSave(user: CurrentUser, body: KuaidiPayAccountSaveBody) {
    return this.pay.saveAccount(user, body);
  }

  async payAccountRemove(user: CurrentUser, body: { id: number }) {
    return this.pay.removeAccount(user, Number(body.id));
  }

  async payAccountTest(user: CurrentUser, body: { id: number }) {
    return this.pay.testAccount(user, Number(body.id));
  }

  // ---------- 快递公司报价 ----------

  async companies(user: CurrentUser, query: Record<string, unknown>) {
    return this.companyService.list(user, requireSiteId(query.siteId));
  }

  async companySave(user: CurrentUser, body: KuaidiCompanySaveBody) {
    return this.companyService.save(user, body);
  }

  async companyStatus(
    user: CurrentUser,
    body: { siteId: number; id: number; enabled: boolean },
  ) {
    return this.companyService.setStatus(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
      body.enabled !== false,
    );
  }

  async companyRemove(user: CurrentUser, body: { siteId: number; id: number }) {
    return this.companyService.remove(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
    );
  }

  // ---------- 订单 ----------

  async orders(user: CurrentUser, query: KuaidiOrderListQuery) {
    return this.orderService.list(user, requireSiteId(query.siteId), query);
  }

  async orderDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.orderService.detail(
      user,
      requireSiteId(query.siteId),
      Number(query.id),
    );
  }

  async orderAction(user: CurrentUser, body: KuaidiOrderActionBody) {
    return this.orderService.action(user, body);
  }

  // ---------- 顾客 ----------

  async customers(user: CurrentUser, query: Record<string, unknown>) {
    return this.customerService.list(user, requireSiteId(query.siteId), query);
  }

  async customerStatus(
    user: CurrentUser,
    body: { siteId: number; id: number; status: boolean },
  ) {
    return this.customerService.setStatus(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
      body.status !== false,
    );
  }
}
