import { randomInt } from 'node:crypto';
import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';

/** 公开编号字符集：去掉 0/O/1/I 等易混字符，与上门服务/卡密商城的店铺码同一口径。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return out;
}

/**
 * 公开寻址码：市场与店铺各一套，创建后不变（小程序把 market/shop 值写进 config.js，
 * 改了就等于让已发布的代码包全部失联）。碰撞走重试，不做「先查后写」的竞态假设。
 */
export async function uniqueShopCode(
  prisma: PrismaService,
  scope: 'market' | 'shop',
): Promise<string> {
  const prefix = scope === 'market' ? 'MK' : 'SH';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${prefix}${randomCode(6)}`;
    const exists =
      scope === 'market'
        ? await prisma.mpMarket.findUnique({
            where: { shopCode: code },
            select: { id: true },
          })
        : await prisma.mpShop.findUnique({
            where: { shopCode: code },
            select: { id: true },
          });
    if (!exists) return code;
  }
  throw new BusinessException(ErrorCode.CONFLICT, '公开编号生成冲突，请重试');
}

export function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

/** Decimal → 两位小数 number；null/非法一律 null（契约里 nullable）。 */
export function decimalOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

/**
 * Prisma 的 JSON 入参类型（InputJsonValue）不认 `unknown`，而本域所有 JSON 列写前都已过归一化，
 * 这里只做类型桥接，不做二次校验（与 brand-mall / card-shop / kuaidi 的 `jsonInput` 同口径）。
 */
/** 规格名/值这类来自 JSON 列的片段：只接受标量，对象不能 `String()` 成 `[object Object]` 发给前端。 */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

export function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function jsonIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0) seen.add(id);
  }
  return [...seen];
}

export function numberIn(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function themeColorOf(value: unknown): string {
  const raw = jsonObject(value).themeColor;
  const color = typeof raw === 'string' ? raw.trim() : '';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#E93323';
}
