/**
 * 商城中台的领域类型。
 *
 * 这些类型刻意不带业务色彩：品牌商城（一店一主体、自营）与多店铺商城平台
 * （商户入驻、跨商户拆单）各自把库里的行映射成这里的形状，再交给引擎算价、
 * 拆单、推状态。引擎不 import 任何业务 model，也不认识任何表名。
 */

/** 一行待结算的购物条目，已由业务侧完成「取价、判失效」的数据装配。 */
export interface CommerceLine {
  productId: number;
  skuId: number;
  quantity: number;
  title: string;
  skuName: string;
  image: string;
  /** 成交单价（分）：来自 SKU 或商品本身，一律不信任端上传的金额。 */
  unitCents: number;
  stock: number;
  /** 商品形态（NORMAL / VIRTUAL / …）；是否占用物流由 requiresShipping 表达。 */
  productType: string;
  categoryId: number;
  /** 本行是否需要发货收货：false 表示虚拟交付，参与免运费与状态机分支。 */
  requiresShipping: boolean;
  /** 本行选用的运费模板 id；0/未传表示走店铺默认模板或统一运费。 */
  freightTemplateId?: number;
  /**
   * 拆单归属键：B2C 恒为同一个键（不拆），B2B2C 用商户 id。
   * 引擎只按字符串分组，不认识「商户」这个概念。
   */
  splitKey: string;
  valid: boolean;
  invalidReason: string;
}

/** 下单收货地区的粗粒度口径，运费模板按市匹配。 */
export interface CommerceRegion {
  province: string;
  city: string;
  district: string;
}

/**
 * 交易参数：店铺（或平台默认）里那份 tradeJson 的中台视图。
 * 金额字段在这里已经是「分」，业务侧负责从元转过来。
 */
export interface CommerceTradeRules {
  /** 未付款自动取消分钟数。 */
  autoCancelMinutes: number;
  /** 统一运费（分），未配运费模板时用它。 */
  freightCents: number;
  /** 满额包邮门槛（分），0 = 永不包邮。 */
  freeFreightCents: number;
  /** 最低下单金额（分），0 = 不限。 */
  minOrderCents: number;
  /** 是否允许顾客申请售后。 */
  refundEnabled: boolean;
  /** 售后申请时限（确认收货后 N 天，0 = 不限）。 */
  refundDaysLimit: number;
  /** 下单确认页是否显示买家留言。 */
  buyerMessageEnabled: boolean;
  /** 积分总开关（关闭时不返分、不可抵扣）。 */
  pointsEnabled: boolean;
  /** 每消费 1 元返多少积分。 */
  pointsReturnRate: number;
  /** 抵扣 1 元所需积分数，0 = 不允许抵扣。 */
  pointsPerYuan: number;
  /** 单笔最多用积分抵扣实付金额的百分比。 */
  pointsDeductMaxPercent: number;
  /** 允许顾客自助取消未付款订单。 */
  selfCancelEnabled: boolean;
}

export const DEFAULT_COMMERCE_TRADE_RULES: CommerceTradeRules = {
  autoCancelMinutes: 30,
  freightCents: 0,
  freeFreightCents: 0,
  minOrderCents: 0,
  refundEnabled: true,
  refundDaysLimit: 7,
  buyerMessageEnabled: true,
  pointsEnabled: false,
  pointsReturnRate: 1,
  pointsPerYuan: 0,
  pointsDeductMaxPercent: 0,
  selfCancelEnabled: true,
};

/** 缺省值与业务存的片段合并：JSON 列两侧形状不一致，先归一化再取值。 */
export function commerceTradeRules(
  overrides?: Partial<CommerceTradeRules> | null,
): CommerceTradeRules {
  if (!overrides || typeof overrides !== 'object') {
    return { ...DEFAULT_COMMERCE_TRADE_RULES };
  }
  return { ...DEFAULT_COMMERCE_TRADE_RULES, ...overrides };
}

/** JSON 列在 MySQL / PG 两侧取回形状不一致，统一按数组读出来。 */
export function jsonList<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** JSON 对象列的同等归一化。 */
export function jsonRecord<T extends object>(value: unknown, base: T): T {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  return { ...base, ...(raw as Partial<T>) };
}

/** 整数入参夹进闭区间，非法输入落回缺省值。 */
export function intIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
