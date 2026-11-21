import type {
  BrandAppSaveBody,
  BrandAppTestResult,
  BrandCategorySaveBody,
  BrandCouponSaveBody,
  BrandCategorySortBody,
  BrandDiySaveBody,
  BrandExpressSaveBody,
  BrandProductSaveBody,
  BrandProductStatusBody,
  BrandReviewReplyBody,
  BrandShopCreateBody,
  BrandShopTradeBody,
  BrandShopUpdateBody,
  BrandShippingSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { BrandDiyService } from './brand.diy.service';
import { BRAND_DIY_WIDGET_CATALOG } from './brand.diy-widgets';
import type { BrandGoodsService } from './brand.goods.service';
import type { BrandPlatformService } from './brand.platform.service';
import type { BrandReleaseService } from './brand.release.service';
import type { BrandCouponService } from './brand.coupon.service';
import type { BrandCustomerService } from './brand.customer.service';
import type { BrandOrderService } from './brand.order.service';
import type { BrandScrmService } from './brand.scrm.service';
import type { BrandShopService } from './brand.shop.service';
import type { BrandShippingService } from './brand.shipping.service';
import type { BrandStatService } from './brand.stat.service';
import { clip, requireShopId } from './brand.shared';

/** 本机公网出口 IP：微信「小程序代码上传」白名单要填它，容器内取不到就只能由运维显式配置。 */
function serverIp(): string {
  return clip(process.env.PUBLIC_SERVER_IP || '', 64);
}

/**
 * 电商小程序工具·店主侧。
 * 方法名与契约 `BrandMall_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）。
 * 平台侧端点单独走 `BrandAdminController`，与上门服务同一套分工。
 */
export class BrandController {
  constructor(
    private readonly shopService: BrandShopService,
    private readonly goods: BrandGoodsService,
    private readonly diy: BrandDiyService,
    private readonly releases: BrandReleaseService,
    private readonly stats: BrandStatService,
    private readonly platform: BrandPlatformService,
    private readonly miniApp: MiniAppService,
    private readonly customers: BrandCustomerService,
    private readonly orders: BrandOrderService,
    private readonly coupons: BrandCouponService,
    private readonly shipping: BrandShippingService,
    private readonly scrm: BrandScrmService,
  ) {}

  // ---------- 元信息与店铺 ----------

  async meta(user: CurrentUser) {
    return this.shopService.meta(user);
  }

  async shops(user: CurrentUser) {
    return this.shopService.shops(user);
  }

  async shopCreate(user: CurrentUser, body: BrandShopCreateBody) {
    return this.shopService.createShop(user, body);
  }

  async shopDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.shopDetail(user, requireShopId(query.shopId));
  }

  async shopUpdate(user: CurrentUser, body: BrandShopUpdateBody) {
    return this.shopService.updateShop(user, body.shopId, body);
  }

  async shopStatus(
    user: CurrentUser,
    body: { shopId: number; status: string },
  ) {
    return this.shopService.setStatus(user, body.shopId, String(body.status));
  }

  async shopRemove(user: CurrentUser, body: { shopId: number }) {
    return this.shopService.removeShop(user, requireShopId(body.shopId));
  }

  async shopTrade(user: CurrentUser, body: BrandShopTradeBody) {
    return this.shopService.saveTrade(user, body.shopId, body.trade);
  }

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=BRAND）----------

  private async subject(user: CurrentUser, shopId: number | string) {
    const shop = await this.shopService.requireShop(user, shopId);
    return {
      ownerUserId: shop.ownerUserId,
      scene: shop.scene,
      shopId: shop.shopId,
      shopName: shop.shopName,
    };
  }

  async appDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.miniApp.view(
      await this.subject(user, requireShopId(query.shopId)),
    );
  }

  async appSave(user: CurrentUser, body: BrandAppSaveBody) {
    const { shopId, ...input } = body;
    return this.miniApp.save(
      await this.subject(user, requireShopId(shopId)),
      input,
    );
  }

  /**
   * 连通自检。失败时必须给出下一步动作与页面入口，
   * 不能只把微信的错误码抛给用户。
   */
  async appTest(
    user: CurrentUser,
    body: { shopId: number },
  ): Promise<BrandAppTestResult> {
    const shop = await this.shopService.requireShop(
      user,
      requireShopId(body.shopId),
    );
    const subject = {
      ownerUserId: shop.ownerUserId,
      scene: shop.scene,
      shopId: shop.shopId,
      shopName: shop.shopName,
    };
    try {
      const result = await this.miniApp.test(subject);
      return {
        ...result,
        nextAction: result.ok
          ? ''
          : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把本机 IP 加入白名单',
        nextPath: result.ok ? '' : `/brand-mall/publish?shopId=${shop.shopId}`,
        serverIp: serverIp(),
      };
    } catch (error) {
      return {
        ok: false,
        shopName: shop.shopName,
        message: error instanceof Error ? error.message : '自检失败',
        nextAction: '到「小程序发布」补齐 AppID 与 AppSecret 后再试',
        nextPath: `/brand-mall/publish?shopId=${shop.shopId}`,
        serverIp: serverIp(),
      };
    }
  }

  /**
   * 支付凭据自检：本站不发起真实下单，只做「字段齐不齐 + 私钥能不能解析」。
   * 真正的签名问题会在第一笔支付回调时暴露，所以这里不谎称「支付可用」。
   */
  async payTest(
    user: CurrentUser,
    body: { shopId: number },
  ): Promise<BrandAppTestResult> {
    const shop = await this.shopService.requireShop(
      user,
      requireShopId(body.shopId),
    );
    const limits = await this.platform.limits();
    const subject = {
      ownerUserId: shop.ownerUserId,
      scene: shop.scene,
      shopId: shop.shopId,
      shopName: shop.shopName,
    };
    const view = await this.miniApp.view(subject);
    const missing: string[] = [];
    if (!limits.payAllowed) {
      return {
        ok: false,
        shopName: shop.shopName,
        message: '平台已关闭在线收款，下单只会落线下标记',
        nextAction: '需要开通在线收款请联系平台管理员',
        nextPath: '',
        serverIp: serverIp(),
      };
    }
    if (!view.appId) missing.push('小程序 AppID');
    if (!view.mchId) missing.push('微信支付商户号');
    if (!view.payKeyConfigured) missing.push('APIv3 密钥');
    if (!view.payCertConfigured) missing.push('商户 API 证书私钥');
    if (!view.payEnabled) missing.push('「开启在线收款」开关');
    if (missing.length > 0) {
      return {
        ok: false,
        shopName: shop.shopName,
        message: `支付配置还缺：${missing.join('、')}`,
        nextAction: '在「小程序发布」补齐后保存，再回来自检',
        nextPath: `/brand-mall/publish?shopId=${shop.shopId}`,
        serverIp: serverIp(),
      };
    }
    return {
      ok: true,
      shopName: shop.shopName,
      message: `商户号 ${view.mchId} 的凭据已齐；资金直接进你自己的微信商户账户，平台不经手`,
      nextAction: '',
      nextPath: '',
      serverIp: serverIp(),
    };
  }

  // ---------- 分类 ----------

  async categoryList(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.goods.categoryList(args);
  }

  async categorySave(user: CurrentUser, body: BrandCategorySaveBody) {
    return this.goods.categorySave(await this.args(user, body.shopId), body);
  }

  async categoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.goods.categoryRemove(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async categorySort(user: CurrentUser, body: BrandCategorySortBody) {
    return this.goods.categorySort(
      await this.args(user, body.shopId),
      body.ids,
    );
  }

  // ---------- 商品 ----------

  async productList(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.goods.productList(args, query);
  }

  async productDetail(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.goods.productDetail(args, Number(query.id));
  }

  async productSave(user: CurrentUser, body: BrandProductSaveBody) {
    return this.goods.productSave(await this.args(user, body.shopId), body);
  }

  async productStatus(user: CurrentUser, body: BrandProductStatusBody) {
    return this.goods.productStatus(
      await this.args(user, body.shopId),
      body.ids,
      body.status,
    );
  }

  async productRemove(
    user: CurrentUser,
    body: { shopId: number; ids: number[] },
  ) {
    return this.goods.productRemove(
      await this.args(user, body.shopId),
      body.ids || [],
    );
  }

  async productCopy(
    user: CurrentUser,
    body: { shopId: number; ids: number[] },
  ) {
    return this.goods.productCopy(
      await this.args(user, body.shopId),
      body.ids || [],
    );
  }

  // ---------- 评价 ----------

  async reviewList(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.goods.reviewList(args, query);
  }

  async reviewReply(user: CurrentUser, body: BrandReviewReplyBody) {
    return this.goods.reviewReply(await this.args(user, body.shopId), body);
  }

  async reviewStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ) {
    return this.goods.reviewStatus(
      await this.args(user, body.shopId),
      Number(body.id),
      body.status,
    );
  }

  // ---------- 快递 ----------

  async shippingList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shipping.list(
      await this.args(user, requireShopId(query.shopId)),
    );
  }

  async shippingSave(user: CurrentUser, body: BrandShippingSaveBody) {
    return this.shipping.save(await this.args(user, body.shopId), body);
  }

  async shippingRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const args = await this.args(user, requireShopId(body.shopId));
    await this.shipping.remove(args, Number(body.id));
    return { ok: true };
  }

  async expressList(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.goods.expressList(
      args,
      await this.platform.ensureExpressPresets(),
    );
  }

  async expressSave(user: CurrentUser, body: BrandExpressSaveBody) {
    return this.goods.expressSave(await this.args(user, body.shopId), body);
  }

  async expressRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.goods.expressRemove(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  // ---------- 装修 ----------

  diyWidgets() {
    return BRAND_DIY_WIDGET_CATALOG;
  }

  async diyList(user: CurrentUser, query: Record<string, unknown>) {
    return this.diy.list(await this.args(user, requireShopId(query.shopId)));
  }

  async diyDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.diy.detail(
      await this.args(user, requireShopId(query.shopId)),
      Number(query.id),
    );
  }

  async diySave(user: CurrentUser, body: BrandDiySaveBody) {
    return this.diy.save(await this.args(user, body.shopId), body);
  }

  async diyPublish(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.diy.publish(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async diyCopy(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.diy.copy(await this.args(user, body.shopId), Number(body.id));
  }

  async diyRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.diy.remove(await this.args(user, body.shopId), Number(body.id));
  }

  // ---------- 小程序码 ----------

  async qrcodeGenerate(
    user: CurrentUser,
    body: { shopId: number; path?: string },
  ) {
    return this.releases.qrcode(
      user,
      requireShopId(body.shopId),
      String(body.path || ''),
    );
  }

  // ---------- 看板 ----------

  async statOverview(user: CurrentUser, query: Record<string, unknown>) {
    return this.stats.overview(user, requireShopId(query.shopId));
  }

  async statTrend(user: CurrentUser, query: Record<string, unknown>) {
    return this.stats.trend(
      user,
      requireShopId(query.shopId),
      Number(query.days || 30),
    );
  }

  async statTopProducts(user: CurrentUser, query: Record<string, unknown>) {
    return this.stats.topProducts(
      user,
      requireShopId(query.shopId),
      Number(query.limit || 10),
    );
  }

  // ---------- 顾客运营 ----------

  async customerList(user: CurrentUser, query: Record<string, unknown>) {
    return this.customers.list(
      await this.args(user, requireShopId(query.shopId)),
      query,
    );
  }

  async customerDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.customers.detail(
      await this.args(user, requireShopId(query.shopId)),
      Number(query.id),
    );
  }

  async customerUpdate(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      nickname?: string;
      level?: string;
      remark?: string;
      status?: string;
    },
  ) {
    return this.customers.update(await this.args(user, body.shopId), body);
  }

  async addressList(user: CurrentUser, query: Record<string, unknown>) {
    return this.customers.addressesOfCustomer(
      await this.args(user, requireShopId(query.shopId)),
      Number(query.customerId),
    );
  }

  async customerScrm(user: CurrentUser, query: Record<string, unknown>) {
    return this.scrm.customerProfile(
      await this.args(user, requireShopId(query.shopId)),
      Number(query.customerId),
    );
  }

  // ---------- 企业微信 SCRM 集成 ----------

  async scrmState(user: CurrentUser, query: Record<string, unknown>) {
    return this.scrm.state(await this.args(user, requireShopId(query.shopId)));
  }

  async scrmToggle(
    user: CurrentUser,
    body: { shopId: number; enabled: boolean },
  ) {
    return this.scrm.toggle(
      await this.args(user, body.shopId),
      Boolean(body.enabled),
    );
  }

  async scrmRetry(user: CurrentUser, body: { shopId: number }) {
    return this.scrm.retryNow(await this.args(user, body.shopId));
  }

  async scrmReplay(
    user: CurrentUser,
    body: { shopId: number; ids?: number[] },
  ) {
    const args = await this.args(user, body.shopId);
    return this.scrm.replaySkipped({ ...args, ids: body.ids });
  }

  // ---------- 订单 ----------

  async orderList(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.list(
      await this.args(user, requireShopId(query.shopId)),
      query,
    );
  }

  async orderDetail(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.orders.detail(args, Number(query.id));
  }

  async orderRemark(
    user: CurrentUser,
    body: { shopId: number; id: number; sellerRemark: string },
  ) {
    const args = await this.args(user, body.shopId);
    return this.orders.remark(
      args,
      Number(body.id),
      String(body.sellerRemark || ''),
    );
  }

  async orderShip(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      expressCompany: string;
      expressNo: string;
      remark?: string;
    },
  ) {
    const args = await this.args(user, body.shopId);
    return this.orders.ship(
      args,
      Number(body.id),
      String(body.expressCompany || ''),
      String(body.expressNo || ''),
      String(body.remark || ''),
    );
  }

  async orderFinish(user: CurrentUser, body: { shopId: number; id: number }) {
    const args = await this.args(user, body.shopId);
    return this.orders.finish(args, Number(body.id));
  }

  async orderClose(
    user: CurrentUser,
    body: { shopId: number; id: number; reason?: string },
  ) {
    const args = await this.args(user, body.shopId);
    return this.orders.close(args, Number(body.id), String(body.reason || ''));
  }

  // ---------- 售后 ----------

  async refundList(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.refundList(
      await this.args(user, requireShopId(query.shopId)),
      query,
    );
  }

  async refundDetail(user: CurrentUser, query: Record<string, unknown>) {
    const args = await this.args(user, requireShopId(query.shopId));
    return this.orders.refundDetail(args, Number(query.id));
  }

  async refundAgree(
    user: CurrentUser,
    body: { shopId: number; id: number; adminRemark?: string },
  ) {
    const args = await this.args(user, body.shopId);
    return this.orders.refundAgree(
      args,
      Number(body.id),
      String(body.adminRemark || ''),
    );
  }

  async refundReject(
    user: CurrentUser,
    body: { shopId: number; id: number; rejectReason: string },
  ) {
    const args = await this.args(user, body.shopId);
    return this.orders.refundReject(
      args,
      Number(body.id),
      String(body.rejectReason || ''),
    );
  }

  // ---------- 优惠券 ----------

  async couponList(user: CurrentUser, query: Record<string, unknown>) {
    return this.coupons.list(
      await this.args(user, requireShopId(query.shopId)),
      query,
    );
  }

  async couponSave(user: CurrentUser, body: BrandCouponSaveBody) {
    return this.coupons.save(await this.args(user, body.shopId), body);
  }

  async couponStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ) {
    const args = await this.args(user, body.shopId);
    return this.coupons.setStatus(args, Number(body.id), String(body.status));
  }

  async couponRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const args = await this.args(user, body.shopId);
    return this.coupons.remove(args, Number(body.id));
  }

  async couponTickets(user: CurrentUser, query: Record<string, unknown>) {
    return this.coupons.tickets(
      await this.args(user, requireShopId(query.shopId)),
      query,
    );
  }

  /** 每个业务方法都先过一遍归属校验，拿到 ownerUserId + shopId 才继续。 */
  private async args(user: CurrentUser, shopId: number) {
    const shop = await this.shopService.requireShop(user, shopId);
    return { ownerUserId: shop.ownerUserId, shopId: shop.shopId };
  }
}
