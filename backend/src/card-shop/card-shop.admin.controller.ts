import {
  type CardShopAdminSettings,
  type CardShopAdminSettingsBody,
  type CardShopOrder,
} from '@enterprise/contracts';
import type { PageResponse } from '../common/api';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { CardShopOrderService } from './card-shop.order.service';
import type { CardShopPlatformService } from './card-shop.platform.service';

/**
 * 卡密商城小程序工具·平台侧：只保留板块与合规闸门。
 *
 * 平台不碰资金（款项直进店主自己的微信商户号），也不介入单个店铺的审核与停服：
 * 店主自己开店、自己上下线、自己关店。这里只剩「板块开不开、允不允许收款、
 * 商品敏感词与导入上限」这些全站参数，以及违规取证用的跨站订单检索。
 */
export class CardShopAdminController {
  constructor(
    private readonly platform: CardShopPlatformService,
    private readonly identity: IdentityService,
    private readonly orders: CardShopOrderService,
  ) {}

  async settings(user: CurrentUser): Promise<CardShopAdminSettings> {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }

  async saveSettings(user: CurrentUser, body: CardShopAdminSettingsBody) {
    return this.platform.saveSettings(user, body);
  }

  /**
   * 跨站订单检索：违规取证用。
   * 只给订单台账字段，卡密明文一律不出现在平台侧——店主与买家之间的交付物不由平台代持。
   */
  async orderSearch(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopOrder>> {
    this.identity.requireAdmin(user);
    return this.orders.adminSearch(query);
  }
}
