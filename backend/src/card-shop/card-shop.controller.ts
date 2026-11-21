import {
  type CardShopAppSaveBody,
  type CardShopAppTestResult,
  type CardShopCategorySaveBody,
  type CardShopCardBatchRemoveBody,
  type CardShopCardExportBody,
  type CardShopCardImportBody,
  type CardShopCardSaveBody,
  type CardShopCardStatusBody,
  type CardShopContentSaveBody,
  type CardShopCouponGenerateBody,
  type CardShopCouponRemoveBody,
  type CardShopCouponSaveBody,
  type CardShopGoodsSaveBody,
  type CardShopOrderCloseBody,
  type CardShopOrderReissueBody,
  type CardShopSiteSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { CardShopCardService } from './card-shop.card.service';
import type { CardShopContentService } from './card-shop.content.service';
import type { CardShopCouponService } from './card-shop.coupon.service';
import type { CardShopCustomerService } from './card-shop.customer.service';
import type { CardShopGoodsService } from './card-shop.goods.service';
import type { CardShopOrderService } from './card-shop.order.service';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopReleaseService } from './card-shop.release.service';
import type { CardShopSiteService } from './card-shop.site.service';
import { CARD_SHOP_SCENE, clip, requireSiteId } from './card-shop.shared';

/** 本机公网出口 IP：微信「代码上传」白名单要填它，容器内取不到就只能显式配置。 */
function serverIp(): string {
  return clip(process.env.PUBLIC_SERVER_IP || '', 64);
}

/**
 * 卡密商城小程序工具·店主侧。
 * 方法名与契约 `CardShop_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）。
 * 平台侧端点走 `CardShopAdminController`，与电商工具/上门服务同一套分工。
 */
export class CardShopController {
  constructor(
    private readonly siteService: CardShopSiteService,
    private readonly goods: CardShopGoodsService,
    private readonly cards: CardShopCardService,
    private readonly releases: CardShopReleaseService,
    private readonly platform: CardShopPlatformService,
    private readonly miniApp: MiniAppService,
    private readonly orders: CardShopOrderService,
    private readonly coupons: CardShopCouponService,
    private readonly customers: CardShopCustomerService,
    private readonly contents: CardShopContentService,
  ) {}

  // ---------- 元信息与站点 ----------

  async meta() {
    return this.siteService.meta();
  }

  async overview(user: CurrentUser, query: Record<string, unknown>) {
    return this.siteService.overview(user, requireSiteId(query.siteId));
  }

  async sites(user: CurrentUser) {
    return this.siteService.sites(user);
  }

  async siteCreate(user: CurrentUser, body: CardShopSiteSaveBody) {
    return this.siteService.createSite(user, body);
  }

  async siteDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.siteService.siteDetail(user, requireSiteId(query.siteId));
  }

  async siteSave(user: CurrentUser, body: CardShopSiteSaveBody) {
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

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=CARD_SHOP）----------

  private async subject(user: CurrentUser, siteId: number | string) {
    const site = await this.siteService.requireSite(user, siteId);
    return {
      ownerUserId: site.ownerUserId,
      scene: CARD_SHOP_SCENE,
      shopId: site.siteId,
      shopName: site.name,
    };
  }

  async appDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.miniApp.view(
      await this.subject(user, requireSiteId(query.siteId)),
    );
  }

  async appSave(user: CurrentUser, body: CardShopAppSaveBody) {
    const { siteId, ...input } = body;
    return this.miniApp.save(
      await this.subject(user, requireSiteId(siteId)),
      input,
    );
  }

  /**
   * 连通自检。失败时必须给出下一步动作与页面入口，不能只把微信的错误码抛给用户。
   */
  async appTest(
    user: CurrentUser,
    body: { siteId: number },
  ): Promise<CardShopAppTestResult> {
    const siteId = requireSiteId(body.siteId);
    const subject = await this.subject(user, siteId);
    try {
      const result = await this.miniApp.test(subject);
      return {
        ...result,
        nextAction: result.ok
          ? ''
          : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把本机 IP 加入白名单',
        nextPath: result.ok ? '' : `/card-shop?siteId=${siteId}&tab=publish`,
        serverIp: serverIp(),
      };
    } catch (error) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: error instanceof Error ? error.message : '自检失败',
        nextAction: '到「小程序发布」补齐 AppID 与 AppSecret 后再试',
        nextPath: `/card-shop?siteId=${siteId}&tab=publish`,
        serverIp: serverIp(),
      };
    }
  }

  /**
   * 支付凭据自检：本站不发起真实下单，只做「字段齐不齐」核对。
   * 真正的签名问题会在第一笔支付回调时暴露，所以这里不谎称「支付可用」。
   */
  async payTest(
    user: CurrentUser,
    body: { siteId: number },
  ): Promise<CardShopAppTestResult> {
    const siteId = requireSiteId(body.siteId);
    const subject = await this.subject(user, siteId);
    const [limits, view] = await Promise.all([
      this.platform.limits(),
      this.miniApp.view(subject),
    ]);
    if (!limits.payAllowed) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: '平台已关闭在线收款，下单只会落线下标记',
        nextAction: '需要开通在线收款请联系平台管理员',
        nextPath: '',
        serverIp: serverIp(),
      };
    }
    const missing: string[] = [];
    if (!view.appId) missing.push('小程序 AppID');
    if (!view.mchId) missing.push('微信支付商户号');
    if (!view.payKeyConfigured) missing.push('APIv3 密钥');
    if (!view.payCertConfigured) missing.push('商户 API 证书私钥');
    if (!view.payEnabled) missing.push('「开启在线收款」开关');
    if (missing.length > 0) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: `支付配置还缺：${missing.join('、')}`,
        nextAction: '在「小程序发布」补齐后保存，再回来自检',
        nextPath: `/card-shop?siteId=${siteId}&tab=publish`,
        serverIp: serverIp(),
      };
    }
    return {
      ok: true,
      shopName: subject.shopName,
      message: `商户号 ${view.mchId} 的凭据已齐；卡款直接进你自己的微信商户账户，平台不经手`,
      nextAction: '',
      nextPath: '',
      serverIp: serverIp(),
    };
  }

  async qrcodeGenerate(
    user: CurrentUser,
    body: { siteId: number; path?: string },
  ) {
    return this.releases.qrcode(
      user,
      requireSiteId(body.siteId),
      String(body.path || ''),
    );
  }

  // ---------- 分类 ----------

  async categories(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.categories(user, requireSiteId(query.siteId));
  }

  async categorySave(user: CurrentUser, body: CardShopCategorySaveBody) {
    return this.goods.saveCategory(user, body);
  }

  async categoryRemove(
    user: CurrentUser,
    body: { siteId: number; id: number },
  ) {
    return this.goods.removeCategory(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
    );
  }

  // ---------- 商品 ----------

  async goodsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.goodsList(user, query);
  }

  async goodsDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.goodsDetail(
      user,
      requireSiteId(query.siteId),
      Number(query.id),
    );
  }

  async goodsSave(user: CurrentUser, body: CardShopGoodsSaveBody) {
    return this.goods.saveGoods(user, body);
  }

  async goodsStatus(
    user: CurrentUser,
    body: { siteId: number; ids: number[]; status: string },
  ) {
    return this.goods.setGoodsStatus(
      user,
      requireSiteId(body.siteId),
      body.ids || [],
      String(body.status),
    );
  }

  async goodsRemove(
    user: CurrentUser,
    body: { siteId: number; ids: number[] },
  ) {
    return this.goods.removeGoods(
      user,
      requireSiteId(body.siteId),
      body.ids || [],
    );
  }

  async goodsRestore(
    user: CurrentUser,
    body: { siteId: number; ids: number[] },
  ) {
    return this.goods.restoreGoods(
      user,
      requireSiteId(body.siteId),
      body.ids || [],
    );
  }

  // ---------- 卡密 ----------

  async cardList(user: CurrentUser, query: Record<string, unknown>) {
    return this.cards.cards(user, query);
  }

  async cardImport(user: CurrentUser, body: CardShopCardImportBody) {
    return this.cards.importCards(user, body);
  }

  async cardSave(user: CurrentUser, body: CardShopCardSaveBody) {
    return this.cards.saveCard(user, body);
  }

  async cardStatus(user: CurrentUser, body: CardShopCardStatusBody) {
    return this.cards.setCardStatus(user, body);
  }

  async cardRemove(
    user: CurrentUser,
    body: { siteId: number; ids: number[]; hard?: number },
  ) {
    return this.cards.removeCards(user, body);
  }

  async cardRestore(
    user: CurrentUser,
    body: { siteId: number; ids: number[] },
  ) {
    return this.cards.restoreCards(
      user,
      requireSiteId(body.siteId),
      body.ids || [],
    );
  }

  async batchList(user: CurrentUser, query: Record<string, unknown>) {
    return this.cards.batches(
      user,
      requireSiteId(query.siteId),
      query.goodsId === undefined || query.goodsId === ''
        ? undefined
        : Number(query.goodsId),
    );
  }

  async batchRemove(user: CurrentUser, body: CardShopCardBatchRemoveBody) {
    return this.cards.removeBatch(user, body);
  }

  async cardExport(user: CurrentUser, body: CardShopCardExportBody) {
    return this.cards.exportCards(user, body);
  }

  async stock(user: CurrentUser, query: Record<string, unknown>) {
    return this.cards.stock(user, requireSiteId(query.siteId));
  }

  // ---------- 订单 ----------

  async orderList(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.list(user, requireSiteId(query.siteId), query);
  }

  async orderDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.detail(
      user,
      requireSiteId(query.siteId),
      Number(query.id),
    );
  }

  async orderClose(user: CurrentUser, body: CardShopOrderCloseBody) {
    return this.orders.close(
      user,
      requireSiteId(body.siteId),
      body.orderId,
      body.reason,
    );
  }

  async orderReissue(user: CurrentUser, body: CardShopOrderReissueBody) {
    return this.orders.reissue(
      user,
      requireSiteId(body.siteId),
      body.orderId,
      body.email,
    );
  }

  // ---------- 券码 ----------

  async couponList(user: CurrentUser, query: Record<string, unknown>) {
    return this.coupons.list(user, requireSiteId(query.siteId), query);
  }

  async couponGenerate(user: CurrentUser, body: CardShopCouponGenerateBody) {
    return this.coupons.generate(user, body);
  }

  async couponSave(user: CurrentUser, body: CardShopCouponSaveBody) {
    return this.coupons.save(user, body);
  }

  async couponRemove(user: CurrentUser, body: CardShopCouponRemoveBody) {
    return this.coupons.remove(
      user,
      requireSiteId(body.siteId),
      body.ids || [],
    );
  }

  // ---------- 顾客 ----------

  async customerList(user: CurrentUser, query: Record<string, unknown>) {
    return this.customers.list(user, requireSiteId(query.siteId), query);
  }

  async customerStatus(
    user: CurrentUser,
    body: { siteId: number; id: number; status: boolean },
  ) {
    return this.customers.setStatus(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
      body.status !== false,
    );
  }

  // ---------- 内容（公告 / 资讯 / 单页）----------

  async contentList(user: CurrentUser, query: Record<string, unknown>) {
    return this.contents.list(user, requireSiteId(query.siteId), query);
  }

  async contentDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.contents.detail(
      user,
      requireSiteId(query.siteId),
      Number(query.id),
    );
  }

  async contentSave(user: CurrentUser, body: CardShopContentSaveBody) {
    return this.contents.save(user, body);
  }

  async contentRemove(user: CurrentUser, body: { siteId: number; id: number }) {
    return this.contents.remove(
      user,
      requireSiteId(body.siteId),
      Number(body.id),
    );
  }
}
