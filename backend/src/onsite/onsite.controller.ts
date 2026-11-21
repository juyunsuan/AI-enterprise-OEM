import type {
  MiniAppInput,
  OnsiteAlertConfigInput,
  OnsiteArticleInput,
  OnsiteBannerInput,
  OnsiteCategoryInput,
  OnsiteCityInput,
  OnsiteFeeEstimateInput,
  OnsiteFeeRuleInput,
  OnsiteFormFieldInput,
  OnsiteLabelInput,
  OnsiteRestInput,
  OnsiteCustomerStatusInput,
  OnsiteServiceConfigInput,
  OnsiteServiceInput,
  OnsiteShopInput,
  OnsiteStaffInput,
  OnsiteStaffLevelInput,
  OnsiteOrderAdvanceInput,
  OnsiteOrderCreateInput,
  OnsiteRefundApplyInput,
  OnsiteReviewStatus,
  OnsiteSubmissionAuditInput,
  OnsiteTheme,
  OnsiteTrade,
  OnsiteActivitySave,
  OnsiteAgentSave,
  OnsiteBalanceAdjust,
  OnsiteBalanceCardSave,
  OnsiteChannelCategorySave,
  OnsiteChannelSave,
  OnsiteCommissionRuleSave,
  OnsiteCouponSave,
  OnsiteDistributorReview,
  OnsitePartnerSave,
  OnsitePointsAdjust,
  OnsiteRelationBind,
  OnsiteSalesmanSave,
  OnsiteSettlementCreate,
  OnsiteStatusToggle,
  OnsiteWithdrawalHandle,
} from '@enterprise/contracts';
import { text } from '../common/api';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { OnsiteAlertService } from './onsite.alert.service';
import type { OnsiteAssistService } from './onsite.assist.service';
import type { OnsiteCustomerService } from './onsite.customer.service';
import type { OnsiteCatalogService } from './onsite.catalog.service';
import type { OnsiteCityService } from './onsite.city.service';
import type { OnsiteContentService } from './onsite.content.service';
import type { OnsiteOrderService } from './onsite.order.service';
import type { OnsitePosterService } from './onsite.poster.service';
import type { OnsiteReleaseService } from './onsite.release.service';
import type { OnsiteReviewService } from './onsite.review.service';
import type { OnsiteRefundService } from './onsite.refund.service';
import type { OnsiteAgentService } from './onsite.agent.service';
import type { OnsiteCommissionService } from './onsite.commission.service';
import type { OnsiteMarketingService } from './onsite.marketing.service';
import type { OnsiteWalletService } from './onsite.wallet.service';
import type { OnsiteScheduleService } from './onsite.schedule.service';
import type { OnsiteShopService } from './onsite.shop.service';
import type { OnsiteStaffService } from './onsite.staff.service';

const idOf = (body: unknown) => {
  const value = Number((body as { id?: unknown } | undefined)?.id ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

/**
 * 上门服务小程序工具·店主侧。
 * 方法名与契约 `Onsite_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）；
 * 参数顺序固定「会话 → 路径参数 → 查询 → 请求体」。
 * 平台侧端点在 `OnsiteAdminController`：两组都有 `shops`，共用一个实例会互相覆盖。
 */
export class OnsiteController {
  constructor(
    private readonly shopService: OnsiteShopService,
    private readonly miniApp: MiniAppService,
    private readonly releaseService: OnsiteReleaseService,
    private readonly posterService: OnsitePosterService,
    private readonly catalog: OnsiteCatalogService,
    private readonly staffService: OnsiteStaffService,
    private readonly schedule: OnsiteScheduleService,
    private readonly cityService: OnsiteCityService,
    private readonly content: OnsiteContentService,
    private readonly orderService: OnsiteOrderService,
    private readonly refundService: OnsiteRefundService,
    private readonly reviewService: OnsiteReviewService,
    private readonly alertService: OnsiteAlertService,
    private readonly assistService: OnsiteAssistService,
    private readonly customerService: OnsiteCustomerService,
    private readonly marketing: OnsiteMarketingService,
    private readonly wallet: OnsiteWalletService,
    private readonly commission: OnsiteCommissionService,
    private readonly agentsService: OnsiteAgentService,
  ) {}

  // ---------- 店铺与主体 ----------

  async overview(user: CurrentUser) {
    return this.shopService.overview(user);
  }

  async shops(user: CurrentUser) {
    return this.shopService.shops(user);
  }

  async createShop(user: CurrentUser, body: OnsiteShopInput) {
    return this.shopService.createShop(user, body);
  }

  async shopDetail(user: CurrentUser, id: string) {
    return this.shopService.shopDetail(user, id);
  }

  async updateShop(user: CurrentUser, id: string, body: OnsiteShopInput) {
    return this.shopService.updateShop(user, id, body);
  }

  async closeShop(user: CurrentUser, id: string, body: { reason?: string }) {
    return this.shopService.closeShop(user, id, String(body?.reason || ''));
  }

  async saveTrade(user: CurrentUser, id: string, body: OnsiteTrade) {
    return this.shopService.saveTrade(user, id, body);
  }

  async saveTheme(user: CurrentUser, id: string, body: OnsiteTheme) {
    return this.shopService.saveTheme(user, id, body);
  }

  async setStatus(user: CurrentUser, id: string, body: { status: string }) {
    return this.shopService.setStatus(user, id, String(body?.status || ''));
  }

  private async subject(user: CurrentUser, id: string) {
    const shop = await this.shopService.requireShop(user, id);
    return {
      ownerUserId: shop.ownerUserId,
      scene: shop.scene,
      shopId: shop.shopId,
      shopName: shop.shopName,
    };
  }

  async wechat(user: CurrentUser, id: string) {
    return this.miniApp.view(await this.subject(user, id));
  }

  async saveWechat(user: CurrentUser, id: string, body: MiniAppInput) {
    return this.miniApp.save(await this.subject(user, id), body);
  }

  async testWechat(user: CurrentUser, id: string) {
    return this.miniApp.test(await this.subject(user, id));
  }

  // ---------- 小程序码 ----------

  async qrcode(user: CurrentUser, id: string, body: { page?: string }) {
    return this.releaseService.qrcode(user, id, String(body?.page || ''));
  }

  async poster(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.posterService.poster(user, id, {
      kind: query.kind === 'AGENT' ? 'AGENT' : 'SHOP',
      agentId: Number(query.agentId) || 0,
    });
  }

  // ---------- 分类与服务 ----------

  async categories(user: CurrentUser, id: string) {
    return this.catalog.categories(user, id);
  }

  async saveCategory(user: CurrentUser, id: string, body: OnsiteCategoryInput) {
    return this.catalog.saveCategory(user, id, body);
  }

  async removeCategory(user: CurrentUser, id: string, body: unknown) {
    return this.catalog.removeCategory(user, id, idOf(body));
  }

  async services(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.catalog.services(user, id, query);
  }

  async serviceDetail(user: CurrentUser, id: string, serviceId: string) {
    return this.catalog.serviceDetail(user, id, serviceId);
  }

  async saveService(user: CurrentUser, id: string, body: OnsiteServiceInput) {
    return this.catalog.saveService(user, id, body);
  }

  async removeService(user: CurrentUser, id: string, body: unknown) {
    return this.catalog.removeService(user, id, idOf(body));
  }

  async setServiceStatus(
    user: CurrentUser,
    id: string,
    body: { ids: number[]; status: OnsiteServiceInput['status'] },
  ) {
    return this.catalog.setServiceStatus(
      user,
      id,
      body?.ids ?? [],
      body?.status,
    );
  }

  async copyService(user: CurrentUser, id: string, body: unknown) {
    return this.catalog.copyService(user, id, idOf(body));
  }

  async staffPrices(user: CurrentUser, id: string, serviceId: string) {
    return this.catalog.staffPrices(user, id, serviceId);
  }

  async saveStaffPrices(
    user: CurrentUser,
    id: string,
    serviceId: string,
    body: {
      rows: { staffId: number; priceCents: number; durationMinutes?: number }[];
    },
  ) {
    return this.catalog.saveStaffPrices(user, id, serviceId, body?.rows ?? []);
  }

  async labels(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.catalog.labels(user, id, text(query.type, 'all'));
  }

  async saveLabel(user: CurrentUser, id: string, body: OnsiteLabelInput) {
    return this.catalog.saveLabel(user, id, body);
  }

  async removeLabel(user: CurrentUser, id: string, body: unknown) {
    return this.catalog.removeLabel(user, id, idOf(body));
  }

  async banners(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.catalog.banners(user, id, text(query.position, 'all'));
  }

  async saveBanner(user: CurrentUser, id: string, body: OnsiteBannerInput) {
    return this.catalog.saveBanner(user, id, body);
  }

  async removeBanner(user: CurrentUser, id: string, body: unknown) {
    return this.catalog.removeBanner(user, id, idOf(body));
  }

  // ---------- 服务人员 ----------

  async staff(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.staffService.staff(user, id, query);
  }

  async staffDetail(user: CurrentUser, id: string, staffId: string) {
    return this.staffService.staffDetail(user, id, staffId);
  }

  async saveStaff(user: CurrentUser, id: string, body: OnsiteStaffInput) {
    return this.staffService.saveStaff(user, id, body);
  }

  async removeStaff(user: CurrentUser, id: string, body: unknown) {
    return this.staffService.removeStaff(user, id, idOf(body));
  }

  async setStaffStatus(
    user: CurrentUser,
    id: string,
    body: { id: number; status: string; remark?: string },
  ) {
    return this.staffService.setStaffStatus(
      user,
      id,
      idOf(body),
      String(body?.status ?? ''),
      String(body?.remark ?? ''),
    );
  }

  async reviewStaffProfile(
    user: CurrentUser,
    id: string,
    body: { id: number; approved: boolean; remark?: string },
  ) {
    return this.staffService.reviewProfile(
      user,
      id,
      idOf(body),
      body?.approved === true,
      String(body?.remark ?? ''),
    );
  }

  async staffLevels(user: CurrentUser, id: string) {
    return this.staffService.staffLevels(user, id);
  }

  async saveStaffLevel(
    user: CurrentUser,
    id: string,
    body: OnsiteStaffLevelInput,
  ) {
    return this.staffService.saveStaffLevel(user, id, body);
  }

  async removeStaffLevel(user: CurrentUser, id: string, body: unknown) {
    return this.staffService.removeStaffLevel(user, id, idOf(body));
  }

  async staffRest(
    user: CurrentUser,
    id: string,
    staffId: string,
    query: Record<string, unknown>,
  ) {
    return this.staffService.restList(user, id, staffId, text(query.day));
  }

  async saveStaffRest(
    user: CurrentUser,
    id: string,
    staffId: string,
    body: OnsiteRestInput,
  ) {
    return this.staffService.saveRest(user, id, staffId, body);
  }

  async removeStaffRest(
    user: CurrentUser,
    id: string,
    staffId: string,
    body: unknown,
  ) {
    return this.staffService.removeRest(user, id, staffId, idOf(body));
  }

  async staffWorkLogs(
    user: CurrentUser,
    id: string,
    staffId: string,
    query: Record<string, unknown>,
  ) {
    return this.staffService.workLogs(
      user,
      id,
      staffId,
      text(query.days, '14'),
    );
  }

  // ---------- 排期 ----------

  async timeline(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.schedule.timeline(user, id, query);
  }

  async scheduleDays(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.schedule.days(user, id, query);
  }

  // ---------- 城市与车费 ----------

  async cities(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.cityService.cities(user, id, text(query.keyword));
  }

  async saveCity(user: CurrentUser, id: string, body: OnsiteCityInput) {
    return this.cityService.saveCity(user, id, body);
  }

  async removeCity(user: CurrentUser, id: string, body: unknown) {
    return this.cityService.removeCity(user, id, idOf(body));
  }

  async feeRules(user: CurrentUser, id: string) {
    return this.cityService.feeRules(user, id);
  }

  async saveFeeRule(user: CurrentUser, id: string, body: OnsiteFeeRuleInput) {
    return this.cityService.saveFeeRule(user, id, body);
  }

  async removeFeeRule(user: CurrentUser, id: string, body: unknown) {
    return this.cityService.removeFeeRule(user, id, idOf(body));
  }

  async estimateFee(
    user: CurrentUser,
    id: string,
    body: OnsiteFeeEstimateInput,
  ) {
    return this.cityService.estimate(user, id, body);
  }

  // ---------- 内容、表单与屏蔽 ----------

  async articles(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.content.articles(user, id, query);
  }

  async saveArticle(user: CurrentUser, id: string, body: OnsiteArticleInput) {
    return this.content.saveArticle(user, id, body);
  }

  async removeArticle(user: CurrentUser, id: string, body: unknown) {
    return this.content.removeArticle(user, id, idOf(body));
  }

  async formFields(user: CurrentUser, id: string) {
    return this.content.formFields(user, id);
  }

  async saveFormField(
    user: CurrentUser,
    id: string,
    body: OnsiteFormFieldInput,
  ) {
    return this.content.saveFormField(user, id, body);
  }

  async removeFormField(user: CurrentUser, id: string, body: unknown) {
    return this.content.removeFormField(user, id, idOf(body));
  }

  async submissions(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.content.submissions(user, id, query);
  }

  async submissionDetail(user: CurrentUser, id: string, submissionId: string) {
    return this.content.submissionDetail(user, id, submissionId);
  }

  async auditSubmission(
    user: CurrentUser,
    id: string,
    body: OnsiteSubmissionAuditInput,
  ) {
    return this.content.auditSubmission(user, id, body);
  }

  async shields(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.content.shields(user, id, text(query.staffId));
  }

  async removeShield(user: CurrentUser, id: string, body: unknown) {
    return this.content.removeShield(user, id, idOf(body));
  }
  // ---------- 交易与履约 ----------

  async orders(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.orderService.list(user, id, query);
  }

  async orderDetail(user: CurrentUser, id: string, orderId: string) {
    return this.orderService.detail(user, id, orderId);
  }

  async createOrder(
    user: CurrentUser,
    id: string,
    body: OnsiteOrderCreateInput,
  ) {
    const shop = await this.shopService.requireShop(user, id);
    const customerId =
      body.customerId ||
      (await this.orderService.resolveCustomerByPhone(
        shop.shopId,
        body.customerPhone,
      ));
    return this.orderService.create(
      shop,
      customerId,
      {
        staffId: body.staffId,
        addressId: body.addressId,
        startAt: body.startAt,
        items: body.items,
        customerRemark: body.customerRemark,
        customerPhone: body.customerPhone,
      },
      { role: 'OWNER', operatorId: user.userId },
    );
  }

  async dispatchOrder(
    user: CurrentUser,
    id: string,
    body: { orderId: number; staffId: number },
  ) {
    return this.orderService.dispatch(user, id, body.orderId, body.staffId);
  }

  async advanceOrder(
    user: CurrentUser,
    id: string,
    body: OnsiteOrderAdvanceInput,
  ) {
    return this.orderService.advance(user, id, body);
  }

  async orderPayParams(
    user: CurrentUser,
    id: string,
    body: { orderId: number },
  ) {
    const shop = await this.shopService.requireShop(user, id);
    const order = await this.orderService.customerView(
      shop.shopId,
      body.orderId,
    );
    return this.orderService.payParams(shop.shopId, order.id, order.openid);
  }

  async orderPayOffline(
    user: CurrentUser,
    id: string,
    body: { orderId: number; remark?: string },
  ) {
    return this.orderService.markPaidOffline(
      user,
      id,
      body.orderId,
      String(body.remark ?? ''),
    );
  }

  async orderSign(
    user: CurrentUser,
    id: string,
    body: { orderId: number; image: string },
  ) {
    const shop = await this.shopService.requireShop(user, id);
    return this.orderService.sign(shop.shopId, body.orderId, {
      image: body.image,
      role: 'OWNER',
      operatorId: user.userId,
    });
  }

  async orderAddon(
    user: CurrentUser,
    id: string,
    body: { orderId: number; orderItemId: number; quantity: number },
  ) {
    const shop = await this.shopService.requireShop(user, id);
    return this.orderService.addon(shop.shopId, body.orderId, {
      orderItemId: body.orderItemId,
      quantity: body.quantity,
      role: 'OWNER',
      operatorId: user.userId,
    });
  }

  async cancelOrder(
    user: CurrentUser,
    id: string,
    body: { orderId: number; reason?: string },
  ) {
    return this.orderService.cancel(
      user,
      id,
      body.orderId,
      String(body.reason ?? ''),
    );
  }

  async orderRemark(
    user: CurrentUser,
    id: string,
    body: { orderId: number; note: string },
  ) {
    return this.orderService.remark(user, id, body.orderId, body.note);
  }

  // ---------- 售后（退款） ----------

  async refunds(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.refundService.list(user, id, query);
  }

  async refundDetail(user: CurrentUser, id: string, refundId: string) {
    return this.refundService.detail(user, id, refundId);
  }

  async refundQuote(user: CurrentUser, id: string, body: { orderId: number }) {
    const shop = await this.shopService.requireShop(user, id);
    return this.refundService.quote(shop.shopId, body.orderId);
  }

  /** 店主代顾客发起退款申请：退款单仍挂在该订单的顾客名下，便于顾客侧查看进度。 */
  async applyRefund(
    user: CurrentUser,
    id: string,
    body: OnsiteRefundApplyInput,
  ) {
    const shop = await this.shopService.requireShop(user, id);
    return this.refundService.apply(shop, {
      orderId: body.orderId,
      customerId: 0,
      reason: body.reason,
      description: body.description,
      evidenceImages: body.evidenceImages,
      items: body.items,
      role: 'OWNER',
      operatorId: user.userId,
    });
  }

  async agreeRefund(
    user: CurrentUser,
    id: string,
    body: { refundId: number; remark?: string; offline?: boolean },
  ) {
    return this.refundService.agree(user, id, {
      refundId: body.refundId,
      remark: String(body.remark ?? ''),
      offline: body.offline === true,
    });
  }

  async rejectRefund(
    user: CurrentUser,
    id: string,
    body: { refundId: number; remark: string },
  ) {
    return this.refundService.reject(user, id, {
      refundId: body.refundId,
      remark: body.remark,
    });
  }

  // ---------- 评价与口碑 ----------

  async reviews(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.reviewService.reviews(user, id, query);
  }

  async replyReview(
    user: CurrentUser,
    id: string,
    body: { id: number; reply: string },
  ) {
    return this.reviewService.reply(user, id, body.id, body.reply);
  }

  async setReviewStatus(
    user: CurrentUser,
    id: string,
    body: { id: number; status: OnsiteReviewStatus },
  ) {
    return this.reviewService.setStatus(user, id, body.id, body.status);
  }

  async appeals(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.reviewService.appeals(user, id, query);
  }

  async handleAppeal(
    user: CurrentUser,
    id: string,
    body: { id: number; accepted: boolean; reply: string },
  ) {
    return this.reviewService.handleAppeal(user, id, body);
  }

  async feedbacks(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.reviewService.feedbacks(user, id, query);
  }

  async handleFeedback(
    user: CurrentUser,
    id: string,
    body: { id: number; reply: string; status: string },
  ) {
    return this.reviewService.handleFeedback(user, id, body);
  }

  // ---------- 安全（一键报警） ----------

  async alerts(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.alertService.list(user, id, query);
  }

  async handleAlert(
    user: CurrentUser,
    id: string,
    body: { id: number; status: string; remark: string },
  ) {
    return this.alertService.handle(user, id, body);
  }

  /** 求救发起：店主代报（必传 staffId），绑定账号的技师报自己。 */
  async raiseAlert(
    user: CurrentUser,
    id: string,
    body: {
      staffId?: number;
      orderId?: number;
      lng: number;
      lat: number;
      address: string;
      content: string;
      audioUrl?: string;
    },
  ) {
    return this.alertService.raiseByActor(user, id, {
      staffId: body.staffId || 0,
      orderId: body.orderId || 0,
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      address: String(body.address || ''),
      content: String(body.content || ''),
      audioUrl: String(body.audioUrl || ''),
    });
  }

  async alertConfig(user: CurrentUser, id: string) {
    const shop = await this.shopService.requireShop(user, id);
    return this.alertService.config(shop.shopId);
  }

  /** 在线客服（AI客服站点）与企微 SCRM 活码的绑定配置，两侧各自独立。 */
  async serviceConfig(user: CurrentUser, id: string) {
    return this.assistService.config(user, id);
  }

  async saveServiceConfig(
    user: CurrentUser,
    id: string,
    body: OnsiteServiceConfigInput,
  ) {
    return this.assistService.save(user, id, body);
  }

  /** 下拉候选：客服站点与活码都由本域直读，避免前端跨板块调用被开关拦掉。 */
  async serviceOptions(user: CurrentUser, id: string) {
    return this.assistService.options(user, id);
  }

  async customers(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.customerService.list(user, id, query);
  }

  async setCustomerStatus(
    user: CurrentUser,
    id: string,
    body: OnsiteCustomerStatusInput,
  ) {
    return this.customerService.setStatus(user, id, body);
  }

  async saveAlertConfig(
    user: CurrentUser,
    id: string,
    body: OnsiteAlertConfigInput,
  ) {
    return this.alertService.saveConfig(user, id, body);
  }

  // ---------- P2 营销：券 / 活动 / 邀请 ----------

  async coupons(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.marketing.coupons(user, id, query);
  }

  async saveCoupon(user: CurrentUser, id: string, body: OnsiteCouponSave) {
    return this.marketing.saveCoupon(user, id, body);
  }

  async removeCoupon(user: CurrentUser, id: string, couponId: string) {
    return this.marketing.removeCoupon(user, id, couponId);
  }

  async setCouponStatus(
    user: CurrentUser,
    id: string,
    couponId: string,
    body: OnsiteStatusToggle,
  ) {
    return this.marketing.setCouponStatus(user, id, couponId, body);
  }

  async issueCoupon(
    user: CurrentUser,
    id: string,
    couponId: string,
    body: { customerIds: number[] },
  ) {
    return this.marketing.issueCoupon(
      user,
      id,
      couponId,
      body?.customerIds ?? [],
    );
  }

  async couponTickets(
    user: CurrentUser,
    id: string,
    couponId: string,
    query: Record<string, unknown>,
  ) {
    return this.marketing.couponTickets(user, id, couponId, query);
  }

  async activities(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.marketing.activities(user, id, query);
  }

  async saveActivity(user: CurrentUser, id: string, body: OnsiteActivitySave) {
    return this.marketing.saveActivity(user, id, body);
  }

  async setActivityStatus(
    user: CurrentUser,
    id: string,
    activityId: string,
    body: OnsiteStatusToggle,
  ) {
    return this.marketing.setActivityStatus(user, id, activityId, body);
  }

  async activityRecords(
    user: CurrentUser,
    id: string,
    activityId: string,
    query: Record<string, unknown>,
  ) {
    return this.marketing.activityRecords(user, id, activityId, query);
  }

  async invites(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.marketing.invites(user, id, query);
  }

  // ---------- P2 财务：分账 / 结算 / 提现 / 余额 ----------

  async incomeOverview(user: CurrentUser, id: string) {
    return this.commission.overview(user, id);
  }

  async commissionRules(user: CurrentUser, id: string) {
    return this.commission.rules(user, id);
  }

  async saveCommissionRule(
    user: CurrentUser,
    id: string,
    body: OnsiteCommissionRuleSave,
  ) {
    return this.commission.saveRule(user, id, body);
  }

  async orderCommissions(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.commission.ledger(user, id, query);
  }

  async balanceCards(user: CurrentUser, id: string) {
    return this.wallet.balanceCards(user, id);
  }

  async saveBalanceCard(
    user: CurrentUser,
    id: string,
    body: OnsiteBalanceCardSave,
  ) {
    return this.wallet.saveBalanceCard(user, id, body);
  }

  async removeBalanceCard(user: CurrentUser, id: string, cardId: string) {
    return this.wallet.removeBalanceCard(user, id, cardId);
  }

  async rechargeOrders(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.wallet.rechargeOrders(user, id, query);
  }

  async confirmRecharge(
    user: CurrentUser,
    id: string,
    rechargeId: string,
    body: { remark: string },
  ) {
    return this.wallet.confirmRecharge(
      user,
      id,
      rechargeId,
      String(body?.remark || ''),
    );
  }

  async balanceFlows(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.wallet.balanceFlows(user, id, query);
  }

  async adjustBalance(
    user: CurrentUser,
    id: string,
    body: OnsiteBalanceAdjust,
  ) {
    return this.wallet.adjustBalance(user, id, body);
  }

  async adjustPoints(user: CurrentUser, id: string, body: OnsitePointsAdjust) {
    return this.wallet.adjustPoints(user, id, body);
  }

  async settlements(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.wallet.settlements(user, id, query);
  }

  async createSettlement(
    user: CurrentUser,
    id: string,
    body: OnsiteSettlementCreate,
  ) {
    return this.wallet.createSettlement(user, id, body);
  }

  async paySettlement(
    user: CurrentUser,
    id: string,
    settlementId: string,
    body: { remark: string },
  ) {
    return this.wallet.paySettlement(
      user,
      id,
      settlementId,
      String(body?.remark || ''),
    );
  }

  async withdrawals(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.wallet.withdrawals(user, id, query);
  }

  async handleWithdrawal(
    user: CurrentUser,
    id: string,
    withdrawalId: string,
    body: OnsiteWithdrawalHandle,
  ) {
    return this.wallet.handleWithdrawal(user, id, withdrawalId, body);
  }

  // ---------- P2 代理 / 业务员 / 渠道 / 合伙人 / 分销商 ----------

  async agents(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.agentsService.agents(user, id, query);
  }

  async saveAgent(user: CurrentUser, id: string, body: OnsiteAgentSave) {
    return this.agentsService.saveAgent(user, id, body);
  }

  async setAgentStatus(
    user: CurrentUser,
    id: string,
    agentId: string,
    body: OnsiteStatusToggle,
  ) {
    return this.agentsService.setAgentStatus(user, id, agentId, body);
  }

  async salesmen(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.agentsService.salesmen(user, id, query);
  }

  async saveSalesman(user: CurrentUser, id: string, body: OnsiteSalesmanSave) {
    return this.agentsService.saveSalesman(user, id, body);
  }

  async setSalesmanStatus(
    user: CurrentUser,
    id: string,
    salesmanId: string,
    body: OnsiteStatusToggle,
  ) {
    return this.agentsService.setSalesmanStatus(user, id, salesmanId, body);
  }

  async channelCategories(user: CurrentUser, id: string) {
    return this.agentsService.channelCategories(user, id);
  }

  async saveChannelCategory(
    user: CurrentUser,
    id: string,
    body: OnsiteChannelCategorySave,
  ) {
    return this.agentsService.saveChannelCategory(user, id, body);
  }

  async removeChannelCategory(
    user: CurrentUser,
    id: string,
    categoryId: string,
  ) {
    return this.agentsService.removeChannelCategory(user, id, categoryId);
  }

  async channels(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.agentsService.channels(user, id, query);
  }

  async saveChannel(user: CurrentUser, id: string, body: OnsiteChannelSave) {
    return this.agentsService.saveChannel(user, id, body);
  }

  async setChannelStatus(
    user: CurrentUser,
    id: string,
    channelId: string,
    body: OnsiteStatusToggle,
  ) {
    return this.agentsService.setChannelStatus(user, id, channelId, body);
  }

  async partners(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.agentsService.partners(user, id, query);
  }

  async savePartner(user: CurrentUser, id: string, body: OnsitePartnerSave) {
    return this.agentsService.savePartner(user, id, body);
  }

  async distributors(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.agentsService.distributors(user, id, query);
  }

  async reviewDistributor(
    user: CurrentUser,
    id: string,
    body: OnsiteDistributorReview,
  ) {
    return this.agentsService.reviewDistributor(user, id, body);
  }

  async relations(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    return this.agentsService.relations(user, id, query);
  }

  async bindRelation(user: CurrentUser, id: string, body: OnsiteRelationBind) {
    return this.agentsService.bindRelation(user, id, body);
  }
}
