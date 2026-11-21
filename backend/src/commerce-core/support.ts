import { safeText } from './text';
import { clip } from './ident';

/**
 * 客服复用约定：商城不自建会话系统，只把「会话来自哪个店、哪一单」传给本站 AI 客服。
 *
 * 一条必须遵守的边界：客服站点的 `siteKey` 由 service-desk 自己生成并支持轮换，
 * 商城侧只能存站点主键 id，绝不把 siteKey 当业务标识写进自己的表或小程序参数里，
 * 否则店主一轮换密钥，商城的客服入口就全断。
 */

/** 与 service-desk 的 channelExtras 落库口径保持一致：只收字符串，键 40、值 500。 */
export const DESK_META_LIMITS = {
  keyMax: 40,
  valueMax: 500,
} as const;

export interface DeskContext {
  /** 业务标识：自营品牌店与市场各填自己的短码，便于客服侧按来源过滤。 */
  biz: string;
  shopId: number | string;
  shopName?: string;
  /** B2B2C 才有：按商户过滤会话视图。 */
  merchantId?: number | string;
  merchantName?: string;
  orderId?: number | string;
  orderNo?: string;
  productId?: number | string;
  /** 进线页面，座席一眼看到顾客从哪儿点的客服。 */
  page?: string;
}

export function deskExternalMeta(ctx: DeskContext): Record<string, string> {
  const pairs: Array<[string, unknown]> = [
    ['biz', ctx.biz],
    ['shopId', ctx.shopId],
    ['shopName', ctx.shopName],
    ['merchantId', ctx.merchantId],
    ['merchantName', ctx.merchantName],
    ['orderId', ctx.orderId],
    ['orderNo', ctx.orderNo],
    ['productId', ctx.productId],
    ['page', ctx.page],
  ];
  const meta: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (value === null || value === undefined) continue;
    const text = safeText(value).trim();
    if (text === '') continue;
    meta[clip(key, DESK_META_LIMITS.keyMax)] = clip(
      text,
      DESK_META_LIMITS.valueMax,
    );
  }
  return meta;
}

/** 会话列表按商户过滤用的谓词，客服侧的数据结构不需要为此改动。 */
export function deskBelongsToMerchant(
  meta: Record<string, string> | null | undefined,
  merchantId: number | string,
): boolean {
  if (merchantId === 0 || merchantId === '0' || merchantId === '') return true;
  return safeText((meta || {}).merchantId) === String(merchantId);
}

/** 会话列表按店铺过滤；平台管理员看全站时传空。 */
export function deskBelongsToShop(
  meta: Record<string, string> | null | undefined,
  shopId: number | string,
): boolean {
  if (shopId === 0 || shopId === '0' || shopId === '') return true;
  return safeText((meta || {}).shopId) === String(shopId);
}

/**
 * 客服入口未绑定时的阻断口径：既说明缺什么，也给出可点的下一步，
 * 避免只报「未配置」把用户堵在原地。
 */
export function deskBindingHint(actionPath: string): {
  message: string;
  action: string;
} {
  return {
    message:
      '还没有绑定在线客服站点，请到「AI 客服 · 接入站点」新建站点后回到这里选择',
    action: actionPath,
  };
}

/** 客服站点配额（service-desk 侧每账号 20 个站点）用尽时的提示。 */
export const DESK_SITE_QUOTA_MESSAGE =
  '客服站点数量已达上限（每账号 20 个），请先删除不再使用的站点，或复用已有站点';
