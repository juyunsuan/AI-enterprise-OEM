import { safeText } from './text';
/**
 * 商城中台的金额底座：金额一律用「分」为单位的整数参与运算，
 * 只在出入口与库里的 Decimal 列互转。
 *
 * 独立于任何业务模块：品牌商城与多店铺商城平台都从这里取同一套口径，
 * 谁也不许再写第二份 `toCents`。
 */

/** Prisma 的 Decimal 是带自定义 toString 的对象；数组与普通对象没有。 */
function isDecimalLike(value: unknown): value is { toString(): string } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.toString !== Object.prototype.toString
  );
}

/** 金额标量的文本口径：Decimal 走自定义 toString，其余未知来源仍按 safeText 收敛。 */
function decimalText(value: unknown): string {
  if (isDecimalLike(value)) return value.toString();
  return safeText(value).trim();
}

/** 未知来源（Decimal / number / string / null）的金额统一转成分。 */
export function toCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const parsed = Number(decimalText(value));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** 分转元：出参用，超过两位小数的输入先四舍五入成分再回推。 */
export function fromCents(cents: number): number {
  return Math.round(Number.isFinite(cents) ? cents : 0) / 100;
}

/** 出参用的金额：把 Decimal / number / string 一律收敛成两位小数的 number。 */
export function amountOut(value: unknown): number {
  return fromCents(toCents(value));
}

export function sumCents(...values: number[]): number {
  return values.reduce((total, value) => total + Math.round(value || 0), 0);
}

export function clampCents(
  value: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const cents = Math.round(Number.isFinite(value) ? value : 0);
  return Math.min(max, Math.max(min, cents));
}

/**
 * 按权重把总额拆成若干份，余数补给小数部分最大的行。
 *
 * 不变量：返回值之和恒等于 `totalCents`（权重合计为 0 时按行序平分）。
 * 跨商户拆单分摊优惠与运费、按行分摊退款额都靠这条不变量对账，
 * 一旦用「每行各自四舍五入」就会在合计上丢分。
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const cents = clampCents(totalCents);
  if (weights.length === 0) return [];
  const positive = weights.map((weight) =>
    Math.max(0, Math.round(weight || 0)),
  );
  const weightSum = sumCents(...positive);
  if (weightSum <= 0) {
    const base = Math.floor(cents / positive.length);
    const remainder = cents - base * positive.length;
    return positive.map((_weight, index) => base + (index < remainder ? 1 : 0));
  }
  const raw = positive.map((weight) => (cents * weight) / weightSum);
  const out = raw.map((value) => Math.floor(value));
  let remainder = cents - sumCents(...out);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let cursor = 0; remainder > 0; cursor += 1) {
    const slot = order[cursor % order.length];
    if (!slot) break;
    out[slot.index] = (out[slot.index] ?? 0) + 1;
    remainder -= 1;
  }
  return out;
}
