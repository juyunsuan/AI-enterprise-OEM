import {
  TAKEOUT_DEFAULT_CONFIG,
  TAKEOUT_DEFAULT_TRADE,
  TAKEOUT_ORDER_MODES,
  TAKEOUT_ORDER_STATUSES,
  TAKEOUT_PAY_STATUSES,
  TAKEOUT_PAY_TYPES,
  TAKEOUT_PRODUCT_STATUSES,
  TAKEOUT_SHOP_STATUSES,
  type TakeoutConfig,
  type TakeoutOrderMode,
  type TakeoutOrderStatus,
  type TakeoutPayStatus,
  type TakeoutPayType,
  type TakeoutProductStatus,
  type TakeoutShopStatus,
  type TakeoutTrade,
} from '@enterprise/contracts';
import { amountOut, fromCents, toCents } from '../commerce-core/money';
import {
  clip,
  commerceCode,
  commerceOrderNo,
  iso,
  skuUniqueId,
} from '../commerce-core/ident';
import {
  commerceTradeRules,
  intIn,
  jsonList,
  jsonRecord,
  type CommerceTradeRules,
} from '../commerce-core/types';

export {
  amountOut,
  clip,
  fromCents,
  iso,
  jsonList,
  jsonRecord,
  skuUniqueId,
  toCents,
};

/** 自营小程序主体场景：外卖与品牌商城分主体、分店铺、分数据。 */
export const TAKEOUT_SCENE = 'TAKEOUT' as const;

export function takeoutShopCode(): string {
  return commerceCode(8);
}

function asObject(value: unknown): Record<string, unknown> {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** 交易参数从库里脏值收敛；金额口径直接复用 commerce-core 的规则结构。 */
export function normalizeTrade(value: unknown): TakeoutTrade {
  const merged = { ...TAKEOUT_DEFAULT_TRADE, ...asObject(value) };
  const pointsPerYuan = intIn(merged.pointsPerYuan, 0, 100000, 0);
  return {
    autoCancelMinutes: intIn(merged.autoCancelMinutes, 5, 10080, 30),
    deliveryFee: moneyOf(merged.deliveryFee),
    freeDeliveryAmount: moneyOf(merged.freeDeliveryAmount),
    minOrderAmount: moneyOf(merged.minOrderAmount),
    buyerMessageEnabled: merged.buyerMessageEnabled !== false,
    selfCancelEnabled: merged.selfCancelEnabled !== false,
    pointsEnabled: merged.pointsEnabled === true,
    pointsReturnRate: rate(merged.pointsReturnRate, 1000),
    pointsPerYuan,
    pointsDeductMaxPercent:
      pointsPerYuan > 0 ? intIn(merged.pointsDeductMaxPercent, 0, 100, 0) : 0,
  };
}

export function normalizeConfig(value: unknown): TakeoutConfig {
  const merged = { ...TAKEOUT_DEFAULT_CONFIG, ...asObject(value) };
  return {
    businessHours:
      clip(String(merged.businessHours || ''), 40) || '10:00-22:00',
    estimatedMinutes: intIn(merged.estimatedMinutes, 5, 180, 30),
    deliveryEnabled: merged.deliveryEnabled !== false,
    pickupEnabled: merged.pickupEnabled !== false,
    dineInEnabled: merged.dineInEnabled !== false,
    announcement: clip(String(merged.announcement || ''), 120),
  };
}

export function commerceRulesOf(trade: TakeoutTrade): CommerceTradeRules {
  return commerceTradeRules({
    autoCancelMinutes: trade.autoCancelMinutes,
    freightCents: toCents(trade.deliveryFee),
    freeFreightCents: toCents(trade.freeDeliveryAmount),
    minOrderCents: toCents(trade.minOrderAmount),
    refundEnabled: false,
    refundDaysLimit: 0,
    buyerMessageEnabled: trade.buyerMessageEnabled,
    pointsEnabled: trade.pointsEnabled,
    pointsReturnRate: trade.pointsReturnRate,
    pointsPerYuan: trade.pointsPerYuan,
    pointsDeductMaxPercent: trade.pointsDeductMaxPercent,
    selfCancelEnabled: trade.selfCancelEnabled,
  });
}

export function shopStatus(value: string): TakeoutShopStatus {
  for (const status of TAKEOUT_SHOP_STATUSES)
    if (status === value) return status;
  return 'DRAFT';
}

export function productStatus(value: string): TakeoutProductStatus {
  for (const status of TAKEOUT_PRODUCT_STATUSES)
    if (status === value) return status;
  return 'DRAFT';
}

export function orderStatus(value: string): TakeoutOrderStatus {
  for (const status of TAKEOUT_ORDER_STATUSES)
    if (status === value) return status;
  return 'PENDING_PAYMENT';
}

export function payStatusOf(value: string): TakeoutPayStatus {
  for (const status of TAKEOUT_PAY_STATUSES)
    if (status === value) return status;
  return 'UNPAID';
}

export function payTypeOf(value: string): TakeoutPayType {
  for (const type of TAKEOUT_PAY_TYPES) if (type === value) return type;
  return 'WECHAT';
}

export function orderModeOf(value: string): TakeoutOrderMode {
  for (const mode of TAKEOUT_ORDER_MODES) if (mode === value) return mode;
  return 'DELIVERY';
}

/** 外卖单号前缀 WM；取餐号取后 4 位，出餐与叫号都够用。 */
export function takeoutOrderNo(): string {
  return commerceOrderNo('WM');
}

export function pickupCodeOf(orderNo: string): string {
  return String(orderNo || '').slice(-4);
}

function moneyOf(value: unknown): number {
  return Math.max(0, Math.round(Number(value) * 100) / 100 || 0);
}

function rate(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(max, Math.round(parsed * 100) / 100);
}

/** "HH:MM-HH:MM" 营业时段；跨零点按两段判断，空/脏值视为不限时段。 */
export function withinBusinessHours(range: string, now = new Date()): boolean {
  const matched = String(range || '').match(
    /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/,
  );
  if (!matched) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = Number(matched[1]) * 60 + Number(matched[2]);
  const end = Number(matched[3]) * 60 + Number(matched[4]);
  if (start === end) return true;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}
