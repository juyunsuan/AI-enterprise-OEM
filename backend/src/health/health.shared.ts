import { randomInt } from 'node:crypto';
import {
  HEALTH_DEFAULT_TRADE,
  HEALTH_MINI_SCENE,
  healthThemeSchema,
  healthTradeSchema,
  type HealthTheme,
  type HealthTrade,
  type PrivateMiniScene,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppSubject } from '../private-mini/mini-app.service';

/** 建站管理 · 健康管理小程序工具的场景码（底座按 scene + shopId 存凭据与出包台账）。 */
export const HEALTH_SCENE = HEALTH_MINI_SCENE satisfies PrivateMiniScene;

/** 店铺码字母表：去掉 0/O/1/I/L 等易混字符，用户口头/手抄也能对上。 */
const SHOP_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const clip = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

export const strOf = (value: unknown, max: number, fallback = ''): string => {
  const out = clip(value, max);
  return out || fallback;
};

export const intIn = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(num)));
};

export const jsonObj = <T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...fallback, ...(value as Record<string, unknown>) };
  }
  return { ...fallback };
};

export const jsonArr = <T>(value: unknown): T[] => {
  return Array.isArray(value) ? (value as T[]) : [];
};

export const toIso = (value: Date | null | undefined): string =>
  value ? value.toISOString() : '';

/** 分 → 元（写库用 DECIMAL(12,2)）。负数在退款场景合法。 */
export const yuan = (cents: number): string =>
  (Math.round(cents) / 100).toFixed(2);

/** 元（Prisma Decimal | number | string）→ 分，四舍五入到分。 */
export const cents = (value: unknown): number => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : value && typeof value === 'object' && 'toNumber' in value
          ? Number((value as { toNumber: () => number }).toNumber())
          : Number(value ?? 0);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
};

export const requireShopId = (value: unknown): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少店铺标识 shopId');
  }
  return id;
};

/** 单号前缀：订单/处方/售后/提现各用各的，人工排查时一眼能分出是哪类单。 */
export const makeNo = (prefix: string): string => {
  const now = new Date();
  const stamp =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `${prefix}${stamp}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
};

export const makeShopCode = (): string => {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += SHOP_CODE_ALPHABET[randomInt(0, SHOP_CODE_ALPHABET.length)];
  }
  return out;
};

/** 交易参数：缺项用默认、越界夹紧、非法枚举回默认。唯一归一化实现点。 */
export const normalizeTrade = (value: unknown): HealthTrade => {
  const parsed = healthTradeSchema.partial().safeParse(value ?? {});
  return { ...HEALTH_DEFAULT_TRADE, ...(parsed.success ? parsed.data : {}) };
};

export const normalizeTheme = (value: unknown): HealthTheme => {
  const parsed = healthThemeSchema.partial().safeParse(value ?? {});
  const merged = {
    ...healthThemeSchema.parse({}),
    ...(parsed.success ? parsed.data : {}),
  };
  const labels = merged.tabBarLabels.slice(0, 4);
  while (labels.length < 4)
    labels.push(['首页', '服务', '问诊', '我的'][labels.length]);
  return { ...merged, tabBarLabels: labels };
};

/** 店铺主体（底座凭据/出包/二维码都按它寻址）。 */
export type HealthShopRowLite = {
  id: number;
  ownerUserId: string;
  name: string;
};

export const subjectOfShop = (shop: HealthShopRowLite): MiniAppSubject => ({
  ownerUserId: shop.ownerUserId,
  scene: HEALTH_SCENE,
  shopId: shop.id,
  shopName: shop.name,
});

/** 审计留痕：失败不阻断业务（日志表不是业务真相源）。 */
export const audit = async (
  prisma: PrismaService,
  userId: string,
  action: string,
  detail: string,
): Promise<void> => {
  await prisma.auditLog
    .create({ data: { userId, action, detail: detail.slice(0, 500) } })
    .catch(() => undefined);
};

/** 分页响应里的空页（Prisma 查询短路时用）。 */
export const emptyPage = <T>(page: number, pageSize: number) => ({
  list: [] as T[],
  total: 0,
  page,
  pageSize,
});

/** 店铺归属校验：店主本人，或在店内被授予该权限面的成员。 */
export type HealthShopContext = {
  shop: {
    id: number;
    ownerUserId: string;
    name: string;
    shopCode: string;
    status: string;
    themeJson: unknown;
    tradeJson: unknown;
    serviceDeskSiteKey: string;
  };
  isOwner: boolean;
  scopes: string[];
};

/**
 * 店铺访问闸门。
 *
 * 口径：店铺是「本站账号自营」的资产，只有店主本人与店内成员可见；
 * 平台侧另走 `HealthAdmin_*`（`identity.requireAdmin`），不复用本函数。
 */
export async function requireShop(
  prisma: PrismaService,
  user: CurrentUser,
  shopId: unknown,
  scope?: string,
): Promise<HealthShopContext> {
  const id = requireShopId(shopId);
  const shop = await prisma.healthShop.findFirst({
    where: { id },
    select: {
      id: true,
      ownerUserId: true,
      name: true,
      shopCode: true,
      status: true,
      themeJson: true,
      tradeJson: true,
      serviceDeskSiteKey: true,
    },
  });
  if (!shop) {
    throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已删除');
  }
  const isOwner = shop.ownerUserId === user.userId;
  if (isOwner) return { shop, isOwner, scopes: ['*'] };
  const member = await prisma.healthShopStaff.findFirst({
    where: { shopId: id, userId: user.userId, status: 'ON' },
    select: { scopesJson: true },
  });
  if (!member) {
    // 不提示存在性：非本店成员一律按不存在处理。
    throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已删除');
  }
  const scopes = jsonArr<string>(member.scopesJson).map((item) => String(item));
  if (
    scope &&
    scopes.length &&
    !scopes.includes(scope) &&
    !scopes.includes('*')
  ) {
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      '当前账号在本店没有该操作权限',
    );
  }
  return { shop, isOwner, scopes };
}

/** 店铺端开关：平台关闭后所有店主侧写操作都被拒绝，但数据仍可读。 */
export async function requireShopWritable(
  context: HealthShopContext,
): Promise<void> {
  await Promise.resolve();
  if (context.shop.status === 'CLOSED') {
    throw new BusinessException(
      ErrorCode.FEATURE_CLOSED,
      '店铺已关闭，如需继续经营请在店铺设置里重新启用',
    );
  }
}
