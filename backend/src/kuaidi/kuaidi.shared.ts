import { safeText } from '../common/safe-text';
import { randomInt } from 'node:crypto';
import {
  KUAIDI_ORDER_STATES,
  KUAIDI_PAY_STATES,
  KUAIDI_SITE_STATUSES,
  type KuaidiContact,
  type KuaidiOrderState,
  type KuaidiPayState,
  type KuaidiParty,
  type KuaidiQuoteItem,
  type KuaidiSiteStatus,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/** 私域底座场景常量：凭据与出包台账都在 miniprogram_* 上按此 scene + shopId 归属。 */
export const KUAIDI_SCENE = 'EXPRESS' as const;

export const KUAIDI_CONTACT_BASE: KuaidiContact = {
  phone: '',
  wechat: '',
  email: '',
};

/** 站点码字母表去掉 I/O/0/1：小程序 config 里手抄歧义最小的字符集。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function kuaidiSiteCode(): string {
  let out = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** 单号：KD + yyyyMMddHHmmss + 6 位数字；唯一约束兜底重试由调用方负责。 */
export function kuaidiNo(prefix = 'KD'): string {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let random = '';
  for (let index = 0; index < 6; index += 1) {
    random += String(randomInt(10));
  }
  return `${prefix}${stamp}${random}`;
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

export function siteStatus(value: unknown): KuaidiSiteStatus {
  return pick(safeText(value), KUAIDI_SITE_STATUSES, 'DRAFT');
}

export function orderState(value: unknown): KuaidiOrderState {
  return pick(safeText(value), KUAIDI_ORDER_STATES, 'PENDING_PICKUP');
}

export function payState(value: unknown): KuaidiPayState {
  return pick(safeText(value), KUAIDI_PAY_STATES, 'PENDING');
}

/**
 * 金额换算：库里是 DECIMAL(18,2)，Prisma 给回 Decimal 对象。
 * 一切算术走「分」的整数，避免浮点累加丢分。
 */
export function toCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const parsed = Number(safeText(value).trim());
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

export function clip(value: unknown, max: number): string {
  return safeText(value).slice(0, max);
}

export function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

/** JSON 列在 MySQL/PG 两侧取回形状不一致（PG 可能给字符串），统一按默认值合并。 */
export function mergeJson<T extends object>(value: unknown, base: T): T {
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

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

export function pageArgs(query: Record<string, unknown>) {
  const pickValue = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return pageParam(pickValue(query.page), pickValue(query.pageSize));
}

export function requireSiteId(value: unknown): number {
  const siteId = Number(value);
  if (!Number.isInteger(siteId) || siteId <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少快递寄件站点 id');
  }
  return siteId;
}

export function normalizeTheme(value: unknown): string {
  const text = clip(safeText(value).trim(), 16);
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : '#3370FF';
}

/** 地址簿/下单里的地址快照：只留契约声明的字段，避免把端上的多余字段写进 JSON。 */
export function partyOf(value: unknown): KuaidiParty {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    name: clip(safeText(raw.name).trim(), 40),
    mobile: clip(safeText(raw.mobile).trim(), 20),
    province: clip(safeText(raw.province).trim(), 40),
    city: clip(safeText(raw.city).trim(), 40),
    district: clip(safeText(raw.district).trim(), 40),
    address: clip(safeText(raw.address).trim(), 200),
  };
}

/** 列表日期筛选：`YYYY-MM-DD` 转成 [起, 止]，止日取当天 23:59:59.999。 */
export function dayRange(
  from: unknown,
  to: unknown,
): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  const start = safeText(from).trim();
  const end = safeText(to).trim();
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

/** 体积重除数（顺丰/通达系通用 6000，单位 cm³/kg）。 */
const VOLUME_DIVISOR = 6000;

/** 计费重量向上取整到 0.1kg：快递按区间收费，不足一个单位也按一个单位算。 */
export function ceilWeight(value: number): number {
  return Math.ceil(Math.max(0, value) * 10 - 1e-9) / 10;
}

export type KuaidiFeeInput = {
  weightKg: number;
  length: number;
  width: number;
  height: number;
  insuredValue: number;
  province: string;
};

export type KuaidiFeeRule = {
  companyId: number;
  code: string;
  name: string;
  logo: string;
  deliveryDays: string;
  firstWeightKg: number;
  firstPrice: number;
  extraWeightKg: number;
  extraPrice: number;
  remoteProvinces: string[];
  remoteExtra: number;
  remark: string;
};

export type KuaidiFeeSite = {
  insuranceEnabled: boolean;
  insuranceRate: number;
  insuranceMax: number;
};

/**
 * 报价引擎（唯一计价入口）：首重 + 续重 + 偏远 + 保价。
 *
 * 端上传的重量尺寸只作为输入：体积重按 长×宽×高/6000 与实重取大，再向上取整到 0.1kg；
 * 金额全在「分」上算完再回元。任何前端传来的金额都不参与本函数。
 */
export function quoteFees(
  site: KuaidiFeeSite,
  rule: KuaidiFeeRule,
  input: KuaidiFeeInput,
): Omit<
  KuaidiQuoteItem,
  | 'companyId'
  | 'code'
  | 'name'
  | 'logo'
  | 'deliveryDays'
  | 'firstWeightKg'
  | 'firstPrice'
  | 'extraWeightKg'
  | 'extraPrice'
  | 'remark'
> {
  const actualWeightKg = Math.max(0, Number(input.weightKg) || 0);
  const volume = Math.max(
    0,
    (Math.max(0, Number(input.length) || 0) *
      Math.max(0, Number(input.width) || 0) *
      Math.max(0, Number(input.height) || 0)) /
      VOLUME_DIVISOR,
  );
  const volumeWeightKg = Math.round(volume * 100) / 100;
  const chargeWeightKg = ceilWeight(Math.max(actualWeightKg, volumeWeightKg));

  const firstWeight = Math.max(0.1, Number(rule.firstWeightKg) || 1);
  const extraWeight = Math.max(0.1, Number(rule.extraWeightKg) || 1);
  const firstCents = Math.max(0, toCents(rule.firstPrice));
  const extraUnitCents = Math.max(0, toCents(rule.extraPrice));
  const extraUnits =
    chargeWeightKg > firstWeight
      ? Math.ceil((chargeWeightKg - firstWeight) / extraWeight - 1e-9)
      : 0;
  const baseFeeCents = firstCents;
  const extraFeeCents = extraUnits * extraUnitCents;

  const province = safeText(input.province).trim();
  const remote =
    Boolean(province) &&
    rule.remoteProvinces.some((item) => safeText(item).trim() === province);
  const remoteFeeCents = remote ? Math.max(0, toCents(rule.remoteExtra)) : 0;

  let insuranceFeeCents = 0;
  const insured = Math.max(0, toCents(input.insuredValue));
  if (site.insuranceEnabled && insured > 0) {
    const maxCents = Math.max(0, toCents(site.insuranceMax));
    // insuranceMax=0 表示不限；有上限时按上限覆盖，费率只对覆盖金额计
    const covered = maxCents > 0 ? Math.min(insured, maxCents) : insured;
    insuranceFeeCents = Math.ceil(
      covered * Math.max(0, site.insuranceRate) - 1e-9,
    );
    insuranceFeeCents = Math.max(0, insuranceFeeCents);
  }

  return {
    chargeWeightKg,
    baseFee: fromCents(baseFeeCents),
    extraFee: fromCents(extraFeeCents),
    remoteFee: fromCents(remoteFeeCents),
    insuranceFee: fromCents(insuranceFeeCents),
    totalFee: fromCents(
      baseFeeCents + extraFeeCents + remoteFeeCents + insuranceFeeCents,
    ),
    remote,
  };
}

/** 报价行：把公司规则与费用拼成契约里的完整形状。 */
export function quoteItem(
  rule: KuaidiFeeRule,
  fees: ReturnType<typeof quoteFees>,
): KuaidiQuoteItem {
  return {
    companyId: rule.companyId,
    code: rule.code,
    name: rule.name,
    logo: rule.logo,
    deliveryDays: rule.deliveryDays,
    firstWeightKg: rule.firstWeightKg,
    firstPrice: rule.firstPrice,
    extraWeightKg: rule.extraWeightKg,
    extraPrice: rule.extraPrice,
    remark: rule.remark,
    ...fees,
  };
}
