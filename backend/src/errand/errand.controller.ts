import {
  type ErrandAdminSettings,
  type ErrandAdminSettingsBody,
  type ErrandAiDispatchBody,
  type ErrandAiDispatchResult,
  type ErrandAiOpsBody,
  type ErrandAiOpsResult,
  type ErrandAppSaveBody,
  type ErrandAppTestResult,
  type ErrandAsset,
  type ErrandCity,
  type ErrandCitySaveBody,
  type ErrandAgent,
  type ErrandAgentSaveBody,
  type ErrandAgentStatus,
  type ErrandAgentWithdrawal,
  type ErrandAgentWithdrawalActionBody,
  type ErrandCityStatus,
  type ErrandCoupon,
  type ErrandCouponSaveBody,
  type ErrandMeta,
  type ErrandOrderActionBody,
  type ErrandOrderDetail,
  type ErrandOrderListQuery,
  type ErrandOverview,
  type ErrandRider,
  type ErrandRiderRoster,
  type ErrandRiderSaveBody,
  type ErrandRiderStatusBody,
  type ErrandRule,
  type ErrandRuleUpdateBody,
  type ErrandSite,
  type ErrandSiteSaveBody,
  type ErrandSiteStatus,
  type ErrandWalletSummary,
  type ErrandWithdrawal,
  type ErrandWithdrawalActionBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { ErrandPlatformService } from './errand.platform.service';
import type { ErrandSiteService } from './errand.site.service';
import type { ErrandCityService } from './errand.city.service';
import type { ErrandAgentService } from './errand.agent.service';
import type { ErrandOrderService } from './errand.order.service';
import type { ErrandRiderService } from './errand.rider.service';
import type { ErrandCustomerService } from './errand.customer.service';
import type { ErrandCouponService } from './errand.coupon.service';
import type { ErrandWalletService } from './errand.wallet.service';
import type { ErrandReleaseService } from './errand.release.service';
import type { ErrandAiService } from './errand.ai.service';
import { clip } from './errand.shared';

function serverIp(): string {
  return clip(process.env.PUBLIC_SERVER_IP || '', 64);
}

/**
 * 跑腿小程序工具·店主侧。
 * 方法名与契约 `Errand_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）。
 */
export class ErrandController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly cityService: ErrandCityService,
    private readonly agentService: ErrandAgentService,
    private readonly orderService: ErrandOrderService,
    private readonly riderService: ErrandRiderService,
    private readonly customerService: ErrandCustomerService,
    private readonly couponService: ErrandCouponService,
    private readonly walletService: ErrandWalletService,
    private readonly releaseService: ErrandReleaseService,
    private readonly aiService: ErrandAiService,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 元信息与概览 ----------
  meta(): Promise<ErrandMeta> {
    return this.sites.meta();
  }

  overview(user: CurrentUser): Promise<ErrandOverview> {
    return this.sites.overview(user);
  }

  // ---------- 站点与计价 ----------
  site(user: CurrentUser): Promise<ErrandSite | null> {
    return this.sites.site(user);
  }

  siteSave(user: CurrentUser, body: ErrandSiteSaveBody): Promise<ErrandSite> {
    return this.sites.save(user, body);
  }

  siteStatus(
    user: CurrentUser,
    body: { status: ErrandSiteStatus },
  ): Promise<ErrandSite> {
    return this.sites.setStatus(user, body.status);
  }

  cities(user: CurrentUser): Promise<ErrandCity[]> {
    return this.cityService.list(user);
  }

  citySave(user: CurrentUser, body: ErrandCitySaveBody): Promise<ErrandCity> {
    return this.cityService.save(user, body);
  }

  cityStatus(
    user: CurrentUser,
    body: { id: number; status: ErrandCityStatus },
  ): Promise<ErrandCity> {
    return this.cityService.setStatus(user, Number(body.id), body.status);
  }

  cityRemove(user: CurrentUser, body: { id: number }) {
    return this.cityService.remove(user, Number(body.id));
  }

  ruleSave(user: CurrentUser, body: ErrandRuleUpdateBody): Promise<ErrandRule> {
    return this.cityService.updateRule(user, body);
  }

  // ---------- 订单 ----------
  orders(user: CurrentUser, query: ErrandOrderListQuery) {
    return this.orderService.list(user, query);
  }

  orderDetail(
    user: CurrentUser,
    query: { id: number },
  ): Promise<ErrandOrderDetail> {
    return this.orderService.adminDetail(user, Number(query.id));
  }

  orderAction(
    user: CurrentUser,
    body: ErrandOrderActionBody,
  ): Promise<ErrandOrderDetail> {
    return this.orderService.action(user, body);
  }

  // ---------- 骑手 ----------
  riders(user: CurrentUser, query: Record<string, unknown>) {
    return this.riderService.list(user, query);
  }

  riderRoster(user: CurrentUser): Promise<ErrandRiderRoster[]> {
    return this.riderService.roster(user);
  }

  riderSave(
    user: CurrentUser,
    body: ErrandRiderSaveBody,
  ): Promise<ErrandRider> {
    return this.riderService.save(user, body);
  }

  riderStatus(
    user: CurrentUser,
    body: ErrandRiderStatusBody,
  ): Promise<ErrandRider> {
    return this.riderService.setStatus(user, body);
  }

  // ---------- 顾客 ----------
  customers(user: CurrentUser, query: Record<string, unknown>) {
    return this.customerService.list(user, query);
  }

  customerStatus(user: CurrentUser, body: { id: number; status: boolean }) {
    return this.customerService.setStatus(
      user,
      Number(body.id),
      body.status === true,
    );
  }

  // ---------- 优惠券 ----------
  coupons(user: CurrentUser): Promise<ErrandCoupon[]> {
    return this.couponService.list(user);
  }

  couponSave(
    user: CurrentUser,
    body: ErrandCouponSaveBody,
  ): Promise<ErrandCoupon> {
    return this.couponService.save(user, body);
  }

  couponStatus(
    user: CurrentUser,
    body: { id: number; enabled: boolean },
  ): Promise<ErrandCoupon> {
    return this.couponService.setStatus(
      user,
      Number(body.id),
      body.enabled === true,
    );
  }

  couponRemove(user: CurrentUser, body: { id: number }) {
    return this.couponService.remove(user, Number(body.id));
  }

  // ---------- 代理 ----------
  agents(user: CurrentUser): Promise<ErrandAgent[]> {
    return this.agentService.list(user);
  }

  agentSave(
    user: CurrentUser,
    body: ErrandAgentSaveBody,
  ): Promise<ErrandAgent> {
    return this.agentService.save(user, body);
  }

  agentStatus(
    user: CurrentUser,
    body: { id: number; status: ErrandAgentStatus },
  ): Promise<ErrandAgent> {
    return this.agentService.setStatus(user, Number(body.id), body.status);
  }

  agentRemove(user: CurrentUser, body: { id: number }) {
    return this.agentService.remove(user, Number(body.id));
  }

  agentWithdrawals(user: CurrentUser, query: Record<string, unknown>) {
    return this.agentService.withdrawals(user, query);
  }

  agentWithdrawalAction(
    user: CurrentUser,
    body: ErrandAgentWithdrawalActionBody,
  ): Promise<ErrandAgentWithdrawal> {
    return this.agentService.actionWithdrawal(user, body);
  }

  // ---------- 钱包与提现 ----------
  wallet(user: CurrentUser): Promise<ErrandWalletSummary> {
    return this.walletService.summary(user);
  }

  withdrawals(user: CurrentUser, query: Record<string, unknown>) {
    return this.walletService.withdrawals(user, query);
  }

  withdrawalAction(
    user: CurrentUser,
    body: ErrandWithdrawalActionBody,
  ): Promise<ErrandWithdrawal> {
    return this.walletService.actionWithdrawal(user, body);
  }

  // ---------- 平台底座：数字资产 / AI ----------
  async assets(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<ErrandAsset[]> {
    const take = Math.min(100, Math.max(1, Number(query.take) || 40));
    const keyword = clip(query.keyword, 60).trim();
    const rows = await this.prisma.digitalAssetEntry.findMany({
      where: {
        userId: user.userId,
        type: 'image',
        url: { not: '' },
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take,
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        fileSize: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type,
      sizeBytes: Math.round((Number(row.fileSize) || 0) * 1024 * 1024),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  aiDispatch(
    user: CurrentUser,
    body: ErrandAiDispatchBody,
  ): Promise<ErrandAiDispatchResult> {
    return this.aiService.dispatch(user, Number(body.orderId));
  }

  aiOps(user: CurrentUser, body: ErrandAiOpsBody): Promise<ErrandAiOpsResult> {
    return this.aiService.ops(user, Number(body.days) || 7);
  }

  // ---------- 小程序主体与发布 ----------
  async appDetail(user: CurrentUser) {
    const ctx = await this.sites.require(user);
    return this.miniApp.view(ctx.subject);
  }

  async appSave(user: CurrentUser, body: ErrandAppSaveBody) {
    const ctx = await this.sites.require(user);
    return this.miniApp.save(ctx.subject, body);
  }

  async appTest(user: CurrentUser): Promise<ErrandAppTestResult> {
    const ctx = await this.sites.require(user);
    try {
      const result = await this.miniApp.test(ctx.subject);
      return {
        ...result,
        nextAction: result.ok
          ? ''
          : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把本机 IP 加入白名单',
        nextPath: result.ok ? '' : '/errand?tab=publish',
        serverIp: serverIp(),
      };
    } catch (error) {
      return {
        ok: false,
        shopName: ctx.subject.shopName,
        message: error instanceof Error ? error.message : '自检失败',
        nextAction: '到「小程序发布」补齐 AppID 与 AppSecret 后再试',
        nextPath: '/errand?tab=publish',
        serverIp: serverIp(),
      };
    }
  }

  qrcodeGenerate(
    user: CurrentUser,
    body: { path: string },
  ): Promise<{ url: string }> {
    return this.releaseService.qrcode(user, body.path);
  }
}

/**
 * 平台侧：板块总闸与统计。客户端方法与 `ErrandAdmin_` 后缀一一对应。
 */
export class ErrandAdminController {
  constructor(
    private readonly platform: ErrandPlatformService,
    private readonly identity: IdentityService,
  ) {}

  settings(user: CurrentUser): Promise<ErrandAdminSettings> {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }

  saveSettings(
    user: CurrentUser,
    body: ErrandAdminSettingsBody,
  ): Promise<ErrandAdminSettings> {
    return this.platform.saveSettings(user, body);
  }
}
