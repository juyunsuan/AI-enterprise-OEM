import {
  BRAND_DIY_PAGE_TYPES,
  BRAND_PRODUCT_STATUSES,
  BRAND_SHOP_STATUSES,
  type BrandDiyPageType,
  type BrandProductStatus,
  type BrandShopStatus,
  type BrandTradeConfig,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
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

/**
 * 品牌商城的公共入口。金额、单号、JSON 归一化这些口径全部来自 `commerce-core`，
 * 这里只做本模块的名字适配与商城独有的枚举回落，不再留第二份实现。
 */

/** 自营小程序主体场景：电商工具固定 BRAND，与上门服务（ONSITE）分主体、分店铺。 */
export const BRAND_SCENE = 'BRAND' as const;

/**
 * 小程序 web-view 打开 AI 客服会话的页面路径。
 * 商城只存站点 key，会话、坐席、AI 模式全部留在 service-desk 侧。
 */
export const BRAND_DESK_EMBED_PATH = '/embed/service-desk';

export function brandShopCode(): string {
  return commerceCode(8);
}

export function shopStatus(value: string): BrandShopStatus {
  for (const status of BRAND_SHOP_STATUSES) {
    if (status === value) return status;
  }
  return 'DRAFT';
}

export function productStatus(value: string): BrandProductStatus {
  for (const status of BRAND_PRODUCT_STATUSES) {
    if (status === value) return status;
  }
  return 'DRAFT';
}

export function diyPageType(value: string): BrandDiyPageType {
  for (const type of BRAND_DIY_PAGE_TYPES) {
    if (type === value) return type;
  }
  return 'ACTIVITY';
}

/** JSON 列在 MySQL/PG 两侧取回形状不一致（PG 可能给字符串），统一按默认值合并。 */
export function mergeJson<T extends object>(value: unknown, base: T): T {
  return jsonRecord(value, base);
}

export {
  amountOut as amount,
  jsonList,
  toCents,
  fromCents,
  clip,
  iso,
  skuUniqueId,
  intIn,
};

export function decIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 店铺交易参数（元）→ 中台规则（分）。
 *
 * 引擎只认「分」，契约与库里存的是「元」，这层换算是品牌商城接中台的唯一适配点；
 * 新增交易字段时只需在这里补一行，算价与状态机自动跟上。
 */
export function commerceRulesOf(trade: BrandTradeConfig): CommerceTradeRules {
  return commerceTradeRules({
    autoCancelMinutes: trade.autoCancelMinutes,
    freightCents: toCents(trade.freightAmount),
    freeFreightCents: toCents(trade.freeFreightAmount),
    minOrderCents: toCents(trade.minOrderAmount),
    refundEnabled: trade.refundEnabled,
    refundDaysLimit: trade.refundDaysLimit,
    buyerMessageEnabled: trade.buyerMessageEnabled,
    pointsEnabled: trade.pointsEnabled,
    pointsReturnRate: trade.pointsReturnRate,
    pointsPerYuan: trade.pointsPerYuan,
    pointsDeductMaxPercent: trade.pointsDeductMaxPercent,
    selfCancelEnabled: trade.selfCancelEnabled,
  });
}

/** 单号：前缀 + yyyyMMddHHmmss + 6 位随机；唯一约束兜底重试由调用方负责。 */
export function brandOrderNo(prefix: string): string {
  return commerceOrderNo(prefix);
}

export function notReady(domain: string): never {
  throw new BusinessException(
    ErrorCode.FEATURE_CLOSED,
    `${domain}还没开放，将在后续阶段上线`,
  );
}

export function requireShopId(value: unknown): number {
  const shopId = Number(value);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少店铺 id');
  }
  return shopId;
}

/**
 * Prisma 的 JSON 入参类型（InputJsonValue）不认 `unknown`，
 * 而我们所有 JSON 列写前都已经过归一化，这里只做类型桥接，不做二次校验。
 */
export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

/** 契约把 query 收成 `Record<string, unknown>`，这里统一转成 pageParam 认得的类型。 */
export function pageArgs(query: Record<string, unknown>) {
  const pick = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return pageParam(pick(query.page), pick(query.pageSize));
}
