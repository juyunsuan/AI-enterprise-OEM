import type {
  TakeoutAppSaveBody,
  TakeoutCategorySaveBody,
  TakeoutCouponSaveBody,
  TakeoutOrderAdvanceBody,
  TakeoutProductSaveBody,
  TakeoutShopCreateBody,
  TakeoutShopTradeBody,
  TakeoutShopUpdateBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { TakeoutCouponService } from './takeout.coupon.service';
import type { TakeoutGoodsService } from './takeout.goods.service';
import type { TakeoutOrderService } from './takeout.order.service';
import type { TakeoutShopService } from './takeout.shop.service';

/**
 * 外卖门店管理端：契约 `Takeout_*` 一一对应；每个入口先按 ownerUserId 反查门店，
 * 请求体里的 shopId 只当筛选条件，权限判定走 `requireShop`。
 */
function requireShopId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少外卖门店 id');
  }
  return id;
}

export class TakeoutController {
  constructor(
    private readonly shops: TakeoutShopService,
    private readonly goods: TakeoutGoodsService,
    private readonly orders: TakeoutOrderService,
    private readonly coupons: TakeoutCouponService,
    private readonly miniApp: MiniAppService,
  ) {}

  private async args(user: CurrentUser, shopId: unknown) {
    const shop = await this.shops.requireShop(user, requireShopId(shopId));
    return { ownerUserId: user.userId, shopId: shop.id };
  }

  async shopList(user: CurrentUser) {
    return this.shops.shops(user);
  }

  async shopCreate(user: CurrentUser, body: TakeoutShopCreateBody) {
    return this.shops.create(user, body);
  }

  async shopDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.shops.detail(user, requireShopId(query.shopId));
  }

  async shopUpdate(user: CurrentUser, body: TakeoutShopUpdateBody) {
    return this.shops.update(user, body);
  }

  async shopTrade(user: CurrentUser, body: TakeoutShopTradeBody) {
    return this.shops.saveTrade(user, body);
  }

  async shopStatus(
    user: CurrentUser,
    body: { shopId: number; status: 'ONLINE' | 'OFFLINE' },
  ) {
    return this.shops.setStatus(user, Number(body.shopId), body.status);
  }

  private appSubject(shop: { id: number; ownerUserId: string; name: string }) {
    return {
      ownerUserId: shop.ownerUserId,
      scene: 'TAKEOUT' as const,
      shopId: shop.id,
      shopName: shop.name,
    };
  }

  async appDetail(user: CurrentUser, query: Record<string, unknown>) {
    const shop = await this.shops.requireShop(
      user,
      requireShopId(query.shopId),
    );
    return this.miniApp.view(this.appSubject(shop));
  }

  async appSave(user: CurrentUser, body: TakeoutAppSaveBody) {
    const { shopId, ...input } = body;
    const shop = await this.shops.requireShop(user, requireShopId(shopId));
    return this.miniApp.save(this.appSubject(shop), input);
  }

  async appTest(user: CurrentUser, query: Record<string, unknown>) {
    const shop = await this.shops.requireShop(
      user,
      requireShopId(query.shopId),
    );
    const result = await this.miniApp.test(this.appSubject(shop));
    return {
      ...result,
      nextAction: result.ok
        ? ''
        : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把本机 IP 加入白名单',
      nextPath: result.ok ? '' : `/takeout?shopId=${shop.id}`,
      serverIp: String(process.env.PUBLIC_SERVER_IP || '').slice(0, 64),
    };
  }

  async scrmState(user: CurrentUser, query: Record<string, unknown>) {
    return this.shops.scrmState(user, requireShopId(query.shopId));
  }

  async scrmToggle(
    user: CurrentUser,
    body: { shopId: number; enabled: boolean },
  ) {
    await this.shops.setScrmEnabled(
      user,
      requireShopId(body.shopId),
      body.enabled === true,
    );
    return { ok: true };
  }

  async categoryList(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.categories(await this.args(user, query.shopId));
  }

  async categorySave(user: CurrentUser, body: TakeoutCategorySaveBody) {
    return this.goods.saveCategory(await this.args(user, body.shopId), body);
  }

  async categoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.goods.removeCategory(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async productList(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.products(await this.args(user, query.shopId), query);
  }

  async productDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.goods.productDetail(
      await this.args(user, query.shopId),
      Number(query.id),
    );
  }

  async productSave(user: CurrentUser, body: TakeoutProductSaveBody) {
    return this.goods.saveProduct(await this.args(user, body.shopId), body);
  }

  async productRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.goods.removeProduct(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async orderList(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.list(await this.args(user, query.shopId), query);
  }

  async orderDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.orders.detail(
      await this.args(user, query.shopId),
      Number(query.id),
    );
  }

  async orderRemark(
    user: CurrentUser,
    body: { shopId: number; id: number; sellerRemark: string },
  ) {
    return this.orders.remark(
      await this.args(user, body.shopId),
      Number(body.id),
      String(body.sellerRemark || ''),
    );
  }

  async orderAdvance(user: CurrentUser, body: TakeoutOrderAdvanceBody) {
    return this.orders.advance(
      await this.args(user, body.shopId),
      Number(body.id),
      body.action,
    );
  }

  async orderFinish(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.orders.finish(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async orderMarkPaid(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.orders.markOfflinePaid(
      await this.args(user, body.shopId),
      Number(body.id),
    );
  }

  async couponList(user: CurrentUser, query: Record<string, unknown>) {
    return this.coupons.list(await this.args(user, query.shopId), query);
  }

  async couponSave(user: CurrentUser, body: TakeoutCouponSaveBody) {
    return this.coupons.save(await this.args(user, body.shopId), body);
  }

  async couponStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ) {
    return this.coupons.setStatus(
      await this.args(user, body.shopId),
      Number(body.id),
      body.status,
    );
  }
}
