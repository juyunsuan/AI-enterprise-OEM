import { randomBytes } from 'node:crypto';

/** 圈子社区在 private-mini / tool-launch / 顾客令牌里的场景码。 */
export const CIRCLE_SCENE = 'CIRCLE' as const;
export const CIRCLE_TOOL = 'circle' as const;
/** service-desk 访客嵌入页：小程序用 web-view 打开，会话数据全留在 service_desk_*。 */
export const CIRCLE_DESK_EMBED_PATH = '/embed/service-desk';
export const CIRCLE_PLATFORM_SETTINGS_KEY = 'circle_platform_settings';

export type CirclePlatformSettings = {
  enabled: boolean;
  defaultPostReview: boolean;
  defaultCommentReview: boolean;
  maxGroupsPerUser: number;
  maxPostsPerDay: number;
};

export const CIRCLE_DEFAULT_SETTINGS: CirclePlatformSettings = {
  enabled: true,
  defaultPostReview: true,
  defaultCommentReview: false,
  maxGroupsPerUser: 20,
  maxPostsPerDay: 20,
};

export function clip(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, max);
  }
  return '';
}

export function iso(value: Date | string | null | undefined): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

export function jsonList(value: unknown, max = 9): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = clip(item, 500);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function pageArgs(query: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(query.pageSize) || 20)),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function dayKey(value = new Date()): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function communityCode(): string {
  return randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
}

/** 匿名浏览量去重键：没有 openid 时用 IP 哈希，刷新页面不会刷量。 */
export function visitorKeyOf(openid: string, ip: string): string {
  const id = clip(openid, 64);
  if (id) return `u:${id}`;
  return `ip:${clip(ip, 60) || 'unknown'}`;
}

export function boolOf(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string')
    return value === '1' || value.toLowerCase() === 'true';
  return fallback;
}

export function numberIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function viewerOf(row: {
  id: number;
  nickname: string;
  avatar: string;
}) {
  return {
    id: row.id,
    nickname: row.nickname || '社区用户',
    avatar: row.avatar || '',
  };
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'P2002' || code === '23505';
}

export function settingsOf(raw: unknown): CirclePlatformSettings {
  const value =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolOf(value.enabled, CIRCLE_DEFAULT_SETTINGS.enabled),
    defaultPostReview: boolOf(
      value.defaultPostReview,
      CIRCLE_DEFAULT_SETTINGS.defaultPostReview,
    ),
    defaultCommentReview: boolOf(
      value.defaultCommentReview,
      CIRCLE_DEFAULT_SETTINGS.defaultCommentReview,
    ),
    maxGroupsPerUser: numberIn(
      value.maxGroupsPerUser,
      0,
      1000,
      CIRCLE_DEFAULT_SETTINGS.maxGroupsPerUser,
    ),
    maxPostsPerDay: numberIn(
      value.maxPostsPerDay,
      0,
      10000,
      CIRCLE_DEFAULT_SETTINGS.maxPostsPerDay,
    ),
  };
}
