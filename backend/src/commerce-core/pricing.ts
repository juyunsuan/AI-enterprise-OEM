import { clampCents, fromCents, sumCents } from './money';
import type { CommerceLine, CommerceRegion, CommerceTradeRules } from './types';

/**
 * 唯一算价入口：试算与下单必须走同一个函数，端上传的金额一律不信。
 *
 * 引擎只做纯计算——购物行的取价与失效判定、券的落库状态、积分余额都由业务侧
 * 查好后传进来。两个业务因此共用同一套优先级与夹取规则，但各自的表与数据完全分开。
 */

// ---------------------------------------------------------------- 优惠券

export type CouponType = 'FULL_REDUCE' | 'DISCOUNT';
export type CouponScope = 'ALL' | 'CATEGORY' | 'PRODUCT';

/** 券的规则面（不含库存与领取状态，那些由业务侧判定后决定是否传入）。 */
export interface CouponSpec {
  name: string;
  type: CouponType;
  /** 满减券：减免金额（分）；折扣券：折扣百分比（88 表示 8.8 折）。 */
  value: number;
  thresholdCents: number;
  scope: CouponScope;
  scopeIds: number[];
}

/** 券判定用的行摘要：只关心归属与行金额。 */
export interface CouponLine {
  productId: number;
  categoryId: number;
  totalCents: number;
}

export interface CouponEvaluation {
  name: string;
  /** 可抵扣金额（分）；`reason` 非空时为 0。 */
  discountCents: number;
  /** 不可用原因，空串表示可用。 */
  reason: string;
}

function inScope(coupon: CouponSpec, line: CouponLine): boolean {
  if (coupon.scope === 'CATEGORY')
    return coupon.scopeIds.includes(line.categoryId);
  if (coupon.scope === 'PRODUCT')
    return coupon.scopeIds.includes(line.productId);
  return true;
}

/** 命中范围的行金额合计：全场券全命中，指定范围券不能蹭别的商品。 */
export function couponScopeCents(
  coupon: CouponSpec,
  lines: CouponLine[],
): number {
  if (coupon.scope === 'ALL')
    return sumCents(...lines.map((line) => line.totalCents));
  return sumCents(
    ...lines
      .filter((line) => inScope(coupon, line))
      .map((line) => line.totalCents),
  );
}

export function evaluateCoupon(
  coupon: CouponSpec,
  lines: CouponLine[],
): CouponEvaluation {
  const goodsCents = sumCents(...lines.map((line) => line.totalCents));
  if (goodsCents < clampCents(coupon.thresholdCents)) {
    return {
      name: coupon.name,
      discountCents: 0,
      reason: `满 ${fromCents(clampCents(coupon.thresholdCents))} 元可用`,
    };
  }
  if (coupon.scope !== 'ALL') {
    const hit = lines.some((line) => inScope(coupon, line));
    if (!hit) {
      return {
        name: coupon.name,
        discountCents: 0,
        reason: '本单没有可用这张券的商品',
      };
    }
  }
  const scopeCents = couponScopeCents(coupon, lines);
  const discountCents =
    coupon.type === 'DISCOUNT'
      ? Math.floor(
          (scopeCents * (100 - Math.min(99.99, Math.max(0, coupon.value)))) /
            100,
        )
      : Math.min(scopeCents, clampCents(coupon.value));
  return {
    name: coupon.name,
    discountCents: clampCents(discountCents),
    reason: '',
  };
}

// ---------------------------------------------------------------- 运费

/** 运费模板的一条地区规则：首件 + 续件，可选满件包邮。 */
export interface ShippingZone {
  id: number;
  templateId: number;
  name: string;
  /** 收货市名列表；空数组表示全国。 */
  regions: string[];
  firstPiece: number;
  firstFeeCents: number;
  /** 每增加多少件收一次续件费，0 = 不计续件。 */
  additionalPiece: number;
  additionalFeeCents: number;
  /** 满 N 件包邮，0 = 不启用。 */
  freePiece: number;
}

export function matchShippingZone(
  zones: ShippingZone[],
  region: CommerceRegion | null | undefined,
): ShippingZone | null {
  const city = String(region?.city || '').trim();
  const named = zones.find(
    (zone) => zone.regions.length > 0 && zone.regions.includes(city),
  );
  if (named) return named;
  return zones.find((zone) => zone.regions.length === 0) || null;
}

export function freightFromZone(zone: ShippingZone, quantity: number): number {
  const pieces = Math.max(0, Math.round(quantity));
  if (zone.freePiece > 0 && pieces >= zone.freePiece) return 0;
  const first = clampCents(zone.firstFeeCents);
  const additional = Math.max(0, zone.additionalPiece);
  if (additional <= 0 || pieces <= Math.max(0, zone.firstPiece)) return first;
  const extraGroups = Math.ceil(
    (pieces - Math.max(0, zone.firstPiece)) / additional,
  );
  return first + extraGroups * clampCents(zone.additionalFeeCents);
}

export interface FreightResult {
  cents: number;
  /** 展示口径：为什么是这个数，确认页直接贴出来。 */
  reason: string;
  /** 命中的模板规则 id，0 = 走统一运费或免运费。 */
  zoneId: number;
}

export interface FreightInput {
  lines: CommerceLine[];
  rules: CommerceTradeRules;
  /** A1 起的运费模板；命中优先于统一运费。 */
  zones?: ShippingZone[] | null;
  region?: CommerceRegion | null;
}

/**
 * 运费优先级：全虚拟免运费 → 满额包邮 → 运费模板 → 统一运费。
 */
export function resolveFreight(input: FreightInput): FreightResult {
  const shippingLines = input.lines.filter((line) => line.requiresShipping);
  if (shippingLines.length === 0) {
    return { cents: 0, reason: '虚拟商品无需配送，免运费', zoneId: 0 };
  }
  const goodsCents = sumCents(
    ...input.lines.map((line) => line.unitCents * line.quantity),
  );
  const freeLimit = clampCents(input.rules.freeFreightCents);
  if (freeLimit > 0 && goodsCents >= freeLimit) {
    return {
      cents: 0,
      reason: `满 ${fromCents(freeLimit)} 元包邮`,
      zoneId: 0,
    };
  }
  const zone = input.zones?.length
    ? matchShippingZone(input.zones, input.region)
    : null;
  if (zone) {
    const pieces = sumCents(...shippingLines.map((line) => line.quantity));
    return {
      cents: clampCents(freightFromZone(zone, pieces)),
      reason: `按运费模板（${zone.name || '默认'}）计算`,
      zoneId: zone.id,
    };
  }
  return {
    cents: clampCents(input.rules.freightCents),
    reason: input.rules.freightCents > 0 ? '统一运费' : '未配置运费',
    zoneId: 0,
  };
}

export interface FreightTemplatesInput {
  lines: CommerceLine[];
  rules: CommerceTradeRules;
  /** 键为模板 id；0 键是店铺默认模板（商品未指定模板时回落到它）。 */
  zonesByTemplate: Map<number, ShippingZone[]>;
  region?: CommerceRegion | null;
}

/**
 * 多模板运费：一件商品可各自选模板，按模板分组累加。
 * 满额包邮是整单口径，只判一次；某组没有可用模板时该组回落统一运费，
 * 模板被删或商品从未选过模板都不会把整单运费算丢。
 */
export function resolveFreightByTemplates(
  input: FreightTemplatesInput,
): FreightResult {
  const shippingLines = input.lines.filter((line) => line.requiresShipping);
  if (shippingLines.length === 0) {
    return { cents: 0, reason: '虚拟商品无需配送，免运费', zoneId: 0 };
  }
  const goodsCents = sumCents(
    ...input.lines.map((line) => line.unitCents * line.quantity),
  );
  const freeLimit = clampCents(input.rules.freeFreightCents);
  if (freeLimit > 0 && goodsCents >= freeLimit) {
    return { cents: 0, reason: `满 ${fromCents(freeLimit)} 元包邮`, zoneId: 0 };
  }
  const groups = new Map<number, CommerceLine[]>();
  for (const line of shippingLines) {
    const key = Math.max(0, Math.round(line.freightTemplateId || 0));
    const rows = groups.get(key) ?? [];
    rows.push(line);
    groups.set(key, rows);
  }
  let cents = 0;
  let zoneId = 0;
  const zoneNames: string[] = [];
  let unifiedGroups = 0;
  for (const [templateId, rows] of groups) {
    const zones =
      input.zonesByTemplate.get(templateId) ??
      input.zonesByTemplate.get(0) ??
      [];
    const zone = zones.length ? matchShippingZone(zones, input.region) : null;
    if (zone) {
      const pieces = sumCents(...rows.map((line) => line.quantity));
      cents += clampCents(freightFromZone(zone, pieces));
      zoneId = groups.size === 1 ? zone.id : 0;
      if (!zoneNames.includes(zone.name || '默认')) {
        zoneNames.push(zone.name || '默认');
      }
    } else {
      cents += clampCents(input.rules.freightCents);
      unifiedGroups += 1;
    }
  }
  if (zoneNames.length > 0 && unifiedGroups === 0) {
    return {
      cents: clampCents(cents),
      reason: `按运费模板（${zoneNames.join('、')}）计算`,
      zoneId,
    };
  }
  if (zoneNames.length > 0) {
    return {
      cents: clampCents(cents),
      reason: `按运费模板（${zoneNames.join('、')}）+ 统一运费计算`,
      zoneId: 0,
    };
  }
  return {
    cents: clampCents(cents),
    reason: input.rules.freightCents > 0 ? '统一运费' : '未配置运费',
    zoneId: 0,
  };
}

// ---------------------------------------------------------------- 积分

/**
 * 本单最多可用积分数：受余额、抵扣上限百分比、以及「抵扣额不超过应付」共同约束。
 */
export function maxUsablePoints(
  ownedPoints: number,
  payableCents: number,
  pointsPerYuan: number,
  maxPercent: number,
): number {
  if (pointsPerYuan <= 0 || maxPercent <= 0) return 0;
  const capCents = Math.floor((Math.max(0, payableCents) * maxPercent) / 100);
  return Math.min(
    Math.max(0, Math.round(ownedPoints || 0)),
    Math.floor((capCents * pointsPerYuan) / 100),
  );
}

/** 积分折成的金额（分）：向下取整，宁少不多，避免顾客多扣。 */
export function pointsToCents(points: number, pointsPerYuan: number): number {
  if (pointsPerYuan <= 0) return 0;
  return Math.floor((Math.max(0, Math.round(points)) * 100) / pointsPerYuan);
}

/** 实付金额应返的积分（含 0 关闭态）。 */
export function pointsEarned(
  payCents: number,
  pointsReturnRate: number,
): number {
  if (!(pointsReturnRate > 0)) return 0;
  return Math.floor(fromCents(Math.max(0, payCents)) * pointsReturnRate);
}

// ---------------------------------------------------------------- 算价

export interface PriceInput {
  lines: CommerceLine[];
  rules: CommerceTradeRules;
  /** 券的规则面；未选券传 null，业务侧负责判定领取状态与过期。 */
  coupon?: CouponSpec | null;
  /** 运费模板；没有模板时留空，按统一运费。 */
  zones?: ShippingZone[] | null;
  /** 按商品所选模板分组的运费；传入时优先于 zones。 */
  zonesByTemplate?: Map<number, ShippingZone[]> | null;
  region?: CommerceRegion | null;
  /** 顾客当前积分余额；未开启积分抵扣时可不传。 */
  pointsOwned?: number;
  /** 顾客申请使用的积分数，超出上限会被夹到上限。 */
  pointsRequested?: number;
  /** 是否已选定收货地址。 */
  addressSelected?: boolean;
}

export interface PriceResult {
  lines: CommerceLine[];
  /** 失效行：引擎不抛错，由业务决定是阻断还是提示。 */
  invalidLines: CommerceLine[];
  goodsCents: number;
  freightCents: number;
  freightReason: string;
  zoneId: number;
  couponName: string;
  couponReason: string;
  couponDiscountCents: number;
  pointsDeduct: number;
  pointsDiscountCents: number;
  maxUsablePoints: number;
  /** 券 + 积分的合计优惠（出参的 discountAmount 口径）。 */
  discountCents: number;
  payCents: number;
  pointsReturn: number;
  requiresShipping: boolean;
  /** 阻断下单的原因，空串表示可以下单。 */
  blockReason: string;
}

export function priceOrder(input: PriceInput): PriceResult {
  const lines = input.lines;
  const invalidLines = lines.filter((line) => !line.valid);
  const goodsCents = sumCents(
    ...lines.map((line) => line.unitCents * line.quantity),
  );
  const requiresShipping = lines.some((line) => line.requiresShipping);

  let couponDiscountCents = 0;
  let couponName = '';
  let couponReason = '';
  if (input.coupon) {
    const evaluation = evaluateCoupon(input.coupon, lines.map(couponLineOf));
    couponName = evaluation.name;
    couponReason = evaluation.reason;
    couponDiscountCents = clampCents(
      Math.min(evaluation.discountCents, goodsCents),
    );
  }

  const freight = input.zonesByTemplate?.size
    ? resolveFreightByTemplates({
        lines,
        rules: input.rules,
        zonesByTemplate: input.zonesByTemplate,
        region: input.region,
      })
    : resolveFreight({
        lines,
        rules: input.rules,
        zones: input.zones,
        region: input.region,
      });

  let pointsDeduct = 0;
  let pointsDiscountCents = 0;
  let usablePoints = 0;
  if (
    input.rules.pointsEnabled &&
    input.rules.pointsPerYuan > 0 &&
    input.rules.pointsDeductMaxPercent > 0
  ) {
    const payableCents = Math.max(
      0,
      goodsCents - couponDiscountCents + freight.cents,
    );
    usablePoints = maxUsablePoints(
      input.pointsOwned ?? 0,
      payableCents,
      input.rules.pointsPerYuan,
      input.rules.pointsDeductMaxPercent,
    );
    pointsDeduct = clampCents(
      Math.min(Math.round(input.pointsRequested || 0), usablePoints),
      0,
      usablePoints,
    );
    pointsDiscountCents = Math.min(
      pointsToCents(pointsDeduct, input.rules.pointsPerYuan),
      Math.max(0, payableCents),
    );
  }

  const payCents = clampCents(
    goodsCents - couponDiscountCents - pointsDiscountCents + freight.cents,
  );
  const minOrderCents = clampCents(input.rules.minOrderCents);
  let blockReason = '';
  if (invalidLines.length > 0) {
    blockReason = `无法结算：${invalidLines
      .map((line) => `${line.title || '商品'}（${line.invalidReason}）`)
      .join('；')}`;
  } else if (goodsCents === 0) {
    blockReason = '没有可结算的商品';
  } else if (minOrderCents > 0 && goodsCents < minOrderCents) {
    blockReason = `不满最低下单金额 ${fromCents(minOrderCents)} 元`;
  } else if (couponReason) {
    blockReason = `优惠券不可用：${couponReason}`;
  } else if (requiresShipping && input.addressSelected === false) {
    blockReason = '请先选择收货地址';
  }

  return {
    lines,
    invalidLines,
    goodsCents,
    freightCents: freight.cents,
    freightReason: freight.reason,
    zoneId: freight.zoneId,
    couponName,
    couponReason,
    couponDiscountCents,
    pointsDeduct,
    pointsDiscountCents,
    maxUsablePoints: usablePoints,
    discountCents: couponDiscountCents + pointsDiscountCents,
    payCents,
    pointsReturn: input.rules.pointsEnabled
      ? pointsEarned(payCents, input.rules.pointsReturnRate)
      : 0,
    requiresShipping,
    blockReason,
  };
}

function couponLineOf(line: CommerceLine): CouponLine {
  return {
    productId: line.productId,
    categoryId: line.categoryId,
    totalCents: line.unitCents * line.quantity,
  };
}
