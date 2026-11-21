import { safeText } from './text';
import { randomInt } from 'node:crypto';

/**
 * 中台的标识与单号生成。
 *
 * 与 `common/document-number.ts` 的原子取号是两套口径：那套需要登记前缀与编号列、
 * 在事务里锁计数器；商城的单号是「前缀 + 时间戳 + 随机」，唯一性由表上的唯一约束兜底，
 * 撞号由调用方重试。两个业务共用这一份，避免各自再写一遍时间戳拼接。
 */

/** 店铺码字母表去掉 I/O/0/1：小程序码 scene 里手抄歧义最小的字符集。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function commerceCode(length: number = CODE_LENGTH): string {
  const size = Math.min(32, Math.max(4, Math.round(length || CODE_LENGTH)));
  let out = '';
  for (let index = 0; index < size; index += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

/** 时间戳部分单独抽出，便于测试注入时钟。 */
export function commerceStamp(now: Date = new Date()): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * 单号：前缀 + yyyyMMddHHmmss + 6 位随机。
 * `prefix` 由业务给定（自营店与市场各自的 SO / RF / TX 等），引擎不校验其取值。
 */
export function commerceOrderNo(
  prefix: string,
  now: Date = new Date(),
): string {
  let random = '';
  for (let index = 0; index < 6; index += 1) {
    random += String(randomInt(10));
  }
  return `${safeText(prefix)
    .slice(0, 8)
    .toUpperCase()}${commerceStamp(now)}${random}`;
}

/** 规格值拼成稳定 uniqueId：顺序无关，保证同一组合在任何录入顺序下都落到同一 SKU。 */
export function skuUniqueId(specValues: Record<string, string>): string {
  const parts = Object.keys(specValues)
    .sort()
    .map((key) => `${key}:${safeText(specValues[key]).trim()}`)
    .filter((part) => !part.endsWith(':'));
  return parts.join('|').slice(0, 191);
}

export function clip(value: unknown, max: number): string {
  return safeText(value).slice(0, Math.max(0, Math.round(max)));
}

export function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}
