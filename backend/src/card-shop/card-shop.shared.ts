import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CARD_SHOP_CARD_ORDERS,
  CARD_SHOP_CARD_STATUSES,
  CARD_SHOP_CONTACT_MODES,
  CARD_SHOP_CONTENT_KINDS,
  CARD_SHOP_COUPON_KINDS,
  CARD_SHOP_COUPON_STATUSES,
  CARD_SHOP_GOODS_STATUSES,
  CARD_SHOP_ORDER_STATES,
  CARD_SHOP_SITE_STATUSES,
  CARD_SHOP_STOCK_DISPLAYS,
  CARD_SHOP_TAKE_CARD_MODES,
  type CardShopCardFormat,
  type CardShopCardOrder,
  type CardShopCardStatus,
  type CardShopContactMode,
  type CardShopContentKind,
  type CardShopCouponKind,
  type CardShopCouponStatus,
  type CardShopGoodsStatus,
  type CardShopOrderState,
  type CardShopSiteStatus,
  type CardShopStockDisplay,
  type CardShopStockLevel,
  type CardShopTakeCardMode,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/** 私域底座场景常量：凭据与出包台账都在 miniprogram_* 上按此 scene + shopId 归属。 */
export const CARD_SHOP_SCENE = 'CARD_SHOP' as const;

/** 站点码字母表去掉 I/O/0/1：小程序 config 里手抄歧义最小的字符集。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function cardShopSiteCode(): string {
  let out = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** 单号 / 批次号：前缀 + yyyyMMddHHmmss + 6 位数字；唯一约束兜底重试由调用方负责。 */
export function cardShopNo(prefix: string): string {
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

/** 入参取字符串：只认标量，对象一律当空——否则会被默认 String 化成 '[object Object]' 落库。 */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
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

export function siteStatus(value: unknown): CardShopSiteStatus {
  return pick(value, CARD_SHOP_SITE_STATUSES, 'DRAFT');
}

export function goodsStatus(value: unknown): CardShopGoodsStatus {
  return pick(value, CARD_SHOP_GOODS_STATUSES, 'DRAFT');
}

export function cardStatus(value: unknown): CardShopCardStatus {
  return pick(value, CARD_SHOP_CARD_STATUSES, 'AVAILABLE');
}

export function orderState(value: unknown): CardShopOrderState {
  return pick(value, CARD_SHOP_ORDER_STATES, 'PENDING');
}

export function takeCardMode(value: unknown): CardShopTakeCardMode {
  return pick(value, CARD_SHOP_TAKE_CARD_MODES, 'OFF');
}

export function contactMode(value: unknown): CardShopContactMode {
  return pick(value, CARD_SHOP_CONTACT_MODES, 'ANY');
}

export function cardOrderMode(value: unknown): CardShopCardOrder {
  return pick(value, CARD_SHOP_CARD_ORDERS, 'OLDEST');
}

export function stockDisplay(value: unknown): CardShopStockDisplay {
  return pick(value, CARD_SHOP_STOCK_DISPLAYS, 'RANGE');
}

export function cardFormat(value: unknown): CardShopCardFormat {
  return value === 'PAIR' ? 'PAIR' : 'SINGLE';
}

/**
 * 库存档位（RANGE 口径给买家看的三档）。
 * 阈值取「商品预警值」与兜底 10 的较大者：既尊重店主设置，也不让 0 预警值的小店
 * 在只剩 1 张时还显示「库存充足」。
 */
export const STOCK_TIGHT_FLOOR = 10;

export function stockLevel(
  available: number,
  warnThreshold = 0,
): CardShopStockLevel {
  const count = Math.max(0, Math.round(Number(available) || 0));
  if (count <= 0) return 'SOLD_OUT';
  const tight = Math.max(
    STOCK_TIGHT_FLOOR,
    Math.round(Number(warnThreshold) || 0),
  );
  return count <= tight ? 'TIGHT' : 'FULL';
}

export const STOCK_LEVEL_LABELS: Record<CardShopStockLevel, string> = {
  FULL: '库存充足',
  TIGHT: '库存紧张',
  SOLD_OUT: '已售罄',
};

/**
 * 金额换算：库里是 DECIMAL(18,2)，Prisma 给回 Decimal 对象。
 * 一切算术走「分」的整数——卡密商城一单能买上万张卡，浮点累加必然丢分。
 */
export function toCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function fromCents(cents: number): number {
  return Math.round(Number.isFinite(cents) ? cents : 0) / 100;
}

/** 出参用的金额：把 Decimal / number / string 一律收敛成两位小数的 number。 */
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

export function clip(value: unknown, max: number): string {
  return textOf(value).slice(0, max);
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

/**
 * Prisma 的 JSON 入参类型（InputJsonValue）不认 `unknown`，
 * 而我们所有 JSON 列写前都已经过归一化，这里只做类型桥接，不做二次校验。
 */
export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

/** 契约把 query 收成 `Record<string, unknown>`，这里统一转成 pageParam 认得的类型。 */
export function pageArgs(query: Record<string, unknown>) {
  const pickValue = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return pageParam(pickValue(query.page), pickValue(query.pageSize));
}

export function requireSiteId(value: unknown): number {
  const siteId = Number(value);
  if (!Number.isInteger(siteId) || siteId <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少卡密商城站点 id');
  }
  return siteId;
}

/**
 * 口令摘要：把单号/站点码当盐，离线拿到库也无法穷举买家自设的 4-16 位取卡密码。
 * 明文永不落库、不进日志。
 */
export function hashSecret(salt: string, plain: string): string {
  return createHash('sha256')
    .update(`${salt}:${plain.trim()}`, 'utf8')
    .digest('hex');
}

export function verifySecret(
  salt: string,
  plain: string,
  storedHash: string,
): boolean {
  const normalized = String(storedHash ?? '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false;
  return timingSafeEqual(
    Buffer.from(hashSecret(salt, plain || ''), 'hex'),
    Buffer.from(normalized, 'hex'),
  );
}

/** 卡密掩码：列表与日志一律用它，明文只出现在取卡页与明文导出。 */
export function maskSecret(value: unknown): string {
  const text = textOf(value);
  if (text.length <= 4) return text ? '****' : '';
  if (text.length <= 8) return `${text.slice(0, 2)}****${text.slice(-2)}`;
  return `${text.slice(0, 3)}****${text.slice(-2)}`;
}

/** 联系方式按站点口径校验：口径写死在商品上，买家侧给一句能照着改的错。 */
export function checkContact(
  mode: CardShopContactMode,
  contact: string,
): string {
  const value = contact.trim();
  if (mode === 'NONE') return '';
  if (!value) {
    return mode === 'ANY'
      ? '请填写联系方式（手机 / 邮箱 / QQ 任一）'
      : `请填写${CARD_SHOP_CONTACT_MODE_HINT[mode]}`;
  }
  if (mode === 'ANY' || mode === 'QQ') return '';
  if (mode === 'MOBILE' && !/^1[3-9]\d{9}$/.test(value)) {
    return '手机号格式不正确';
  }
  if (mode === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return '邮箱格式不正确';
  }
  return '';
}

const CARD_SHOP_CONTACT_MODE_HINT: Record<CardShopContactMode, string> = {
  NONE: '',
  ANY: '联系方式',
  MOBILE: '手机号',
  EMAIL: '邮箱',
  QQ: 'QQ 号',
};

export function contentKind(value: unknown): CardShopContentKind {
  return pick(value, CARD_SHOP_CONTENT_KINDS, 'NOTICE');
}

export function couponKind(value: unknown): CardShopCouponKind {
  return pick(value, CARD_SHOP_COUPON_KINDS, 'FIXED');
}

export function couponStatus(value: unknown): CardShopCouponStatus {
  return pick(value, CARD_SHOP_COUPON_STATUSES, 'UNUSED');
}

/**
 * 到期时间入参：前端给 ISO 串或 `YYYY-MM-DD HH:mm:ss`，空串＝不过期。
 * 只认「能解析成时间」的值，其余按不过期处理——把 NaN 写进 DateTime 列会让整条 insert 失败。
 */
export function parseExpire(value: unknown): Date | null {
  const raw = textOf(value).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw} 23:59:59` : raw;
  const date = new Date(normalized.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 列表日期筛选：`YYYY-MM-DD` 转成 [起, 止]，止日取当天 23:59:59.999。 */
export function dayRange(
  from: unknown,
  to: unknown,
): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  const start = textOf(from).trim();
  const end = textOf(to).trim();
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

/**
 * 券码字表：去掉 I/O/0/1 后手写歧义最小；一位不加前缀也会因为长度而可辨。
 */
const COUPON_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function couponCode(prefix: string, length = 10): string {
  const head = clip(
    String(prefix ?? '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, ''),
    12,
  );
  let out = '';
  for (let index = 0; index < Math.max(4, length); index += 1) {
    out += COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)];
  }
  return `${head}${out}`;
}

/**
 * 富文本净化：只保留「能被小程序 rich-text / 网页安全渲染」的部分。
 *
 * 卡密商城的内容（详情、说明、资讯正文）由店主手写或从别处粘贴，里面很容易带进
 * `<script>`、`onerror=` 或 `javascript:` 链接；这些一旦原样下发就是在买家页面上执行脚本。
 * 因此入库前统一剥掉脚本标签与事件属性、危险的 URL 协议，其余标签（含内联 style）保留——
 * 图文详情需要排版，但不能需要可执行代码。
 */
export function sanitizeRichText(value: unknown): string {
  let html = textOf(value);
  if (html.length > RICH_TEXT_MAX) html = html.slice(0, RICH_TEXT_MAX);
  html = html.replace(DANGEROUS_TAGS, '');
  html = html.replace(EVENT_ATTRIBUTES, '');
  return html.replace(URL_ATTRIBUTES, (match, name: string, raw: string) =>
    isSafeUrl(raw) ? match : ` ${name}="#"`,
  );
}

const RICH_TEXT_MAX = 200_000;
/** 成对或自闭合都删：`<script>` 里的正文留在页面上只会显示成文字，但标签本身必须没。 */
const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|link|meta|base)\b[^>]*>/gi;
const EVENT_ATTRIBUTES = /\son[a-z0-9_:-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTRIBUTES =
  /\s(href|src|xlink:href|data-src|poster|background|action|formaction|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * URL 属性取值白名单：相对路径与 # 锚点直接放行，带协议的只认 http(s)/mailto/tel。
 *
 * 判断前先把 `&#106;` 这类数字实体还原、再压掉空白与控制符——浏览器会做同样的事，
 * 只做字面匹配的话 `href="&#106;avascript:alert(1)"` 就能绕过。
 */
export function isSafeUrl(raw: string): boolean {
  const decoded = raw
    .replace(/^["']|["']$/g, '')
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
      charOf(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_m, dec: string) => charOf(Number(dec)))
    // 控制符必须一起压掉：浏览器会忽略它，`java\tscript:` 只做字面匹配就能绕过。
    // eslint-disable-next-line no-control-regex
    .replace(/[\s\u0000-\u001f]/g, '')
    .toLowerCase();
  if (!decoded || decoded.startsWith('#') || decoded.startsWith('/'))
    return true;
  const scheme = /^([a-z0-9+.-]+):/.exec(decoded);
  if (!scheme) return true;
  return SAFE_URL_PROTOCOLS.includes(`${scheme[1]}:`);
}

function charOf(code: number): string {
  return Number.isInteger(code) && code > 0 && code < 0xffff
    ? String.fromCharCode(code)
    : '';
}

const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** 外链字段用（内容表的 link）：非空就必须是安全协议，空串表示「不跳」。 */
export function safeLink(value: unknown): string {
  const raw = clip(value, 500).trim();
  if (!raw) return '';
  if (!isSafeUrl(`"${raw}"`)) return '';
  return raw;
}

/** 图片地址数组入库：过 URL 白名单并限条数，端上直接渲染这些地址。 */
export function imageList(value: unknown, max = 9): string[] {
  const list = Array.isArray(value) ? value : jsonList<string>(value);
  const out: string[] = [];
  for (const item of list) {
    const url = clip(String(item ?? '').trim(), 500);
    if (!url || !isSafeUrl(`"${url}"`)) continue;
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}
