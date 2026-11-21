import { createHash, randomInt } from 'node:crypto';
import {
  ERRAND_ORDER_STATES,
  ERRAND_PAY_STATES,
  ERRAND_RIDER_STATUSES,
  ERRAND_SERVICE_TYPES,
  ERRAND_SITE_STATUSES,
  ERRAND_VEHICLE_TYPES,
  type ErrandContact,
  type ErrandOrderState,
  type ErrandParty,
  type ErrandPayState,
  type ErrandRiderStatus,
  type ErrandServiceType,
  type ErrandSiteStatus,
  type ErrandVehicleType,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Prisma } from '../../generated/prisma';

/** 私域底座场景常量：凭据与出包台账都在 miniprogram_* 上按此 scene 归属。 */
export const ERRAND_SCENE = 'ERRAND' as const;

export const ERRAND_CONTACT_BASE: ErrandContact = {
  phone: '',
  wechat: '',
  email: '',
};

export const ERRAND_PARTY_BASE: ErrandParty = {
  name: '',
  mobile: '',
  province: '',
  city: '',
  district: '',
  address: '',
  lng: 0,
  lat: 0,
};

/** 站点码字母表去掉 I/O/0/1，和小程序 config 手抄口径一致。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function errandSiteCode(): string {
  let out = '';
  for (let index = 0; index < 8; index += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** 订单号：PT + yyyyMMddHHmmss + 6 位随机；唯一约束兜底重试由调用方负责。 */
export function errandOrderNo(): string {
  let random = '';
  for (let index = 0; index < 6; index += 1) random += String(randomInt(10));
  return `PT${stamp()}${random}`;
}

/** 骑手编号：RD + yyyyMMddHHmmss + 4 位随机。 */
export function errandRiderNo(): string {
  let random = '';
  for (let index = 0; index < 4; index += 1) random += String(randomInt(10));
  return `RD${stamp()}${random}`;
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  for (const item of allowed) {
    if (item === value) return item;
  }
  return fallback;
}

export function siteStatus(value: unknown): ErrandSiteStatus {
  return pick(toText(value), ERRAND_SITE_STATUSES, 'DRAFT');
}

export function orderState(value: unknown): ErrandOrderState {
  return pick(toText(value), ERRAND_ORDER_STATES, 'PENDING_PAY');
}

export function payState(value: unknown): ErrandPayState {
  return pick(toText(value), ERRAND_PAY_STATES, 'PENDING');
}

export function riderStatus(value: unknown): ErrandRiderStatus {
  return pick(toText(value), ERRAND_RIDER_STATUSES, 'PENDING');
}

export function vehicleType(value: unknown): ErrandVehicleType {
  return pick(toText(value), ERRAND_VEHICLE_TYPES, 'EBIKE');
}

export function serviceType(value: unknown): ErrandServiceType {
  return pick(toText(value), ERRAND_SERVICE_TYPES, 'SEND');
}

/** 金额换算：库里 DECIMAL，Prisma 给回 Decimal；算术全部走「分」的整数。 */
export function toCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const parsed = Number(toText(value).trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function fromCents(cents: number): number {
  return Math.round(Number.isFinite(cents) ? cents : 0) / 100;
}

export function amount(value: unknown): number {
  return fromCents(toCents(value));
}

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

export function numberIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

export function clip(value: unknown, max: number): string {
  return toText(value).slice(0, max);
}

export function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

export function mergeJson<T extends object>(value: unknown, base: T): T {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  return { ...base, ...(raw as Partial<T>) };
}

export function jsonList<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

export function pageArgs(query: Record<string, unknown>) {
  const pickValue = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return pageParam(pickValue(query.page), pickValue(query.pageSize));
}

export function normalizeTheme(value: unknown): string {
  const text = clip(toText(value).trim(), 16);
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : '#3370FF';
}

export function partyOf(value: unknown): ErrandParty {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    name: clip(toText(raw.name).trim(), 40),
    mobile: clip(toText(raw.mobile).trim(), 20),
    province: clip(toText(raw.province).trim(), 40),
    city: clip(toText(raw.city).trim(), 40),
    district: clip(toText(raw.district).trim(), 40),
    address: clip(toText(raw.address).trim(), 200),
    lng: numberIn(raw.lng, -180, 180, 0),
    lat: numberIn(raw.lat, -90, 90, 0),
  };
}

export function contactOf(value: unknown): ErrandContact {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    phone: clip(raw.phone, 32),
    wechat: clip(raw.wechat, 64),
    email: clip(raw.email, 120),
  };
}

/** 列表日期筛选：`YYYY-MM-DD` 转成 [起, 止]，止日取当天 23:59:59.999。 */
export function dayRange(
  from: unknown,
  to: unknown,
): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  const start = toText(from).trim();
  const end = toText(to).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const date = new Date(`${start}T00:00:00`);
    if (!Number.isNaN(date.getTime())) out.gte = date;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const date = new Date(`${end}T23:59:59.999`);
    if (!Number.isNaN(date.getTime())) out.lte = date;
  }
  return out;
}

/** 身份证只存掩码与哈希：台账排障需要辨认，明文没有任何业务必要性。 */
export function maskIdCard(value: unknown): string {
  const text = toText(value)
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
  if (text.length < 6) return '';
  return `${text.slice(0, 3)}********${text.slice(-2)}`;
}

export function hashIdCard(value: unknown): string {
  const text = toText(value)
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
  return text ? createHash('sha256').update(text).digest('hex') : '';
}

/** 银行卡只展示尾号：台账排障够用，明文没有业务必要性。 */
export function maskCardNo(value: unknown): string {
  const digits = toText(value).replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `**** **** **** ${digits.slice(-4)}`;
}

export function hashCardNo(value: unknown): string {
  const digits = toText(value).replace(/\D/g, '');
  return digits ? createHash('sha256').update(digits).digest('hex') : '';
}

// ---------------------------------------------------------------- 计价引擎

export type ErrandRuleValues = {
  baseFee: number;
  baseDistanceKm: number;
  perKmFee: number;
  baseWeightKg: number;
  perKgFee: number;
  nightStart: string;
  nightEnd: string;
  nightFee: number;
  buyServiceRate: number;
  minOrderAmount: number;
  maxDistanceKm: number;
  maxWeightKg: number;
  tipPresets: number[];
  couponEnabled: boolean;
  acceptRadiusKm: number;
  autoDispatch: boolean;
  riderShareRate: number;
  pointsEarnRate: number;
  pointsDeductRate: number;
  maxPointsDiscountRate: number;
};

export type ErrandCouponInfo = {
  type: 'FIXED' | 'PERCENT';
  discountValue: number;
  minAmount: number;
};

export type ErrandQuoteInput = {
  serviceType: ErrandServiceType;
  distanceKm: number;
  weightKg: number;
  goodsAmount: number;
  tip: number;
  at?: string;
  coupon?: ErrandCouponInfo | null;
  pointsUsed?: number;
  fromLng?: number;
  fromLat?: number;
  toLng?: number;
  toLat?: number;
  /** 距离来源：服务端算出来时由调用方传入。 */
  distanceSource?: 'DRIVING' | 'STRAIGHT' | 'INPUT';
};

export type ErrandQuote = {
  serviceType: ErrandServiceType;
  distanceKm: number;
  weightKg: number;
  baseFee: number;
  distanceFee: number;
  weightFee: number;
  timeFee: number;
  goodsFee: number;
  tip: number;
  couponDiscount: number;
  pointsDiscount: number;
  pointsUsed: number;
  pointsEarned: number;
  totalAmount: number;
  night: boolean;
  minOrderAdjusted: boolean;
  distanceSource: 'DRIVING' | 'STRAIGHT' | 'INPUT';
};

function minutesOf(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(toText(value).trim());
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return -1;
  return hour * 60 + minute;
}

/** 夜间时段判断：支持跨零点（22:00-06:00）；任一端不合法视为没有夜间加价。 */
export function isNightAt(
  rule: Pick<ErrandRuleValues, 'nightStart' | 'nightEnd'>,
  at?: Date,
): boolean {
  const start = minutesOf(rule.nightStart);
  const end = minutesOf(rule.nightEnd);
  if (start < 0 || end < 0 || start === end) return false;
  const date = at ?? new Date();
  const now = date.getHours() * 60 + date.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** 折扣券按百分比、满减券按固定金额；都受门槛与订单可优惠额度约束。 */
export function couponDiscountOf(
  coupon: ErrandCouponInfo | null | undefined,
  cents: number,
): number {
  if (!coupon || cents <= 0) return 0;
  const minCents = toCents(coupon.minAmount);
  if (minCents > 0 && cents < minCents) return 0;
  if (coupon.type === 'PERCENT') {
    const percent = Math.min(
      100,
      Math.max(0, Number(coupon.discountValue) || 0),
    );
    return Math.min(cents, Math.round((cents * percent) / 100));
  }
  return Math.min(cents, Math.max(0, toCents(coupon.discountValue)));
}

/**
 * 报价引擎（唯一计价入口）：起步价 + 超距 + 超重 + 夜间 + 帮买服务费 + 小费 - 优惠券。
 *
 * 端上传来的距离/重量只是输入；金额全在「分」上算完再回元，任何前端金额都不参与本函数。
 * 小费不参与优惠券折扣；保底金额只抬升服务费小计，不对小费生效。
 */
export function quoteOrder(
  rule: ErrandRuleValues,
  input: ErrandQuoteInput,
): ErrandQuote {
  const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
  const weightKg = Math.max(0, Number(input.weightKg) || 0);
  const baseCents = Math.max(0, toCents(rule.baseFee));
  const extraDistance = Math.max(
    0,
    distanceKm - Math.max(0, rule.baseDistanceKm),
  );
  const distanceCents = Math.ceil(
    Math.max(0, toCents(rule.perKmFee)) * extraDistance - 1e-9,
  );
  const extraWeight = Math.max(0, weightKg - Math.max(0, rule.baseWeightKg));
  const weightCents = Math.ceil(
    Math.max(0, toCents(rule.perKgFee)) * extraWeight - 1e-9,
  );
  const night = isNightAt(rule, input.at ? new Date(input.at) : new Date());
  const timeCents = night ? Math.max(0, toCents(rule.nightFee)) : 0;
  const goodsCents =
    input.serviceType === 'BUY'
      ? Math.ceil(
          Math.max(0, toCents(input.goodsAmount)) *
            Math.max(0, rule.buyServiceRate) -
            1e-9,
        )
      : 0;
  const serviceCents =
    baseCents + distanceCents + weightCents + timeCents + goodsCents;
  const minCents = Math.max(0, toCents(rule.minOrderAmount));
  const minOrderAdjusted = minCents > 0 && serviceCents < minCents;
  const adjustedService = minOrderAdjusted ? minCents : serviceCents;
  const discountCents = couponDiscountOf(input.coupon, adjustedService);
  const payableService = Math.max(0, adjustedService - discountCents);
  const requestedPoints = Math.max(
    0,
    Math.floor(Number(input.pointsUsed) || 0),
  );
  const deductRate = Math.max(1, Number(rule.pointsDeductRate) || 100);
  const maxPointsCents = Math.floor(
    payableService *
      Math.min(1, Math.max(0, Number(rule.maxPointsDiscountRate) || 0)),
  );
  const requestedCents = Math.floor((requestedPoints * 100) / deductRate);
  const pointsDiscountCents = Math.min(
    payableService,
    maxPointsCents,
    requestedCents,
  );
  const pointsUsed =
    pointsDiscountCents > 0
      ? Math.min(
          requestedPoints,
          Math.ceil((pointsDiscountCents * deductRate) / 100),
        )
      : 0;
  const appliedPointsCents =
    pointsUsed > 0 ? Math.floor((pointsUsed * 100) / deductRate) : 0;
  const tipCents = Math.max(0, toCents(input.tip));
  const totalCents =
    Math.max(
      0,
      payableService - Math.min(pointsDiscountCents, appliedPointsCents),
    ) + tipCents;

  return {
    serviceType: input.serviceType,
    distanceKm: Math.round(distanceKm * 100) / 100,
    weightKg: Math.round(weightKg * 100) / 100,
    // 保底调整只体现在总额里，不把起步价本身改写，账单拆项仍可解释
    baseFee: fromCents(baseCents),
    distanceFee: fromCents(distanceCents),
    weightFee: fromCents(weightCents),
    timeFee: fromCents(timeCents),
    goodsFee: fromCents(goodsCents),
    tip: fromCents(tipCents),
    couponDiscount: fromCents(discountCents),
    pointsDiscount: fromCents(
      Math.min(pointsDiscountCents, appliedPointsCents),
    ),
    pointsUsed,
    pointsEarned: Math.max(
      0,
      Math.floor(
        fromCents(totalCents) * Math.max(0, Number(rule.pointsEarnRate) || 0),
      ),
    ),
    totalAmount: fromCents(totalCents),
    night,
    minOrderAdjusted,
    distanceSource: input.distanceSource || 'INPUT',
  };
}

export function requireOrderId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少跑腿订单 id');
  }
  return id;
}

/** 骑手完成一单的劳务收入：基础服务费中扣除起步价与帮买代购费，再加小费。 */
export function riderIncomeOf(
  order: {
    distanceFee: unknown;
    weightFee: unknown;
    timeFee: unknown;
    tip: unknown;
  },
  shareRate = 1,
): number {
  const rate = Math.min(1, Math.max(0, Number(shareRate) || 0));
  const serviceCents =
    toCents(order.distanceFee) +
    toCents(order.weightFee) +
    toCents(order.timeFee);
  return fromCents(Math.round(serviceCents * rate) + toCents(order.tip));
}
/** 经纬度是否可用于算距：有限数、在合法范围，且不是 (0,0) 这种未定位占位。 */
export function coordinatesUsable(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): boolean {
  const valid = (lng: number, lat: number) =>
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90 &&
    !(lng === 0 && lat === 0);
  return valid(lng1, lat1) && valid(lng2, lat2);
}

/** 两点球面直线距离（公里）：地图 Key 不可用时的降级口径。 */
export function straightKilometers(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return (
    Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
  );
}
