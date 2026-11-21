import type {
  CardShopCardOrder,
  CardShopContact,
  CardShopSiteStatus,
  CardShopToggles,
} from '@enterprise/contracts';

/**
 * C 端（小程序公开通道）用的站点上下文。
 *
 * 与店主侧 `requireSite()` 返回的上下文分开：这里带的是**可以直接下发给匿名买家**的展示字段
 * （外观、开关、客服指向），因此绝不放凭据、成本、卡密这类只该店主看见的东西。
 * `apiBase` / `deskEmbedUrl` 在构造时一次算好，公开路由不再各自拼 URL。
 */
export type CardShopSiteContext = {
  siteId: number;
  ownerUserId: string;
  siteCode: string;
  name: string;
  logo: string;
  slogan: string;
  themeColor: string;
  notice: string;
  status: CardShopSiteStatus;
  offReason: string;
  toggles: CardShopToggles;
  stockDisplayMode: 'ACTUAL' | 'RANGE';
  cardOrderMode: CardShopCardOrder;
  lockMinutes: number;
  serviceContact: CardShopContact;
  deskSiteKey: string;
  deskEmbedUrl: string;
  apiBase: string;
  protocolEnabled: boolean;
  protocolText: string;
};
