import { randomBytes, randomInt } from 'node:crypto';
import {
  PARK_ANNOUNCEMENT_CATEGORY_LABELS,
  PARK_LEASE_STATUS_LABELS,
  PARK_BILL_STATUS_LABELS,
  PARK_ORDER_BIZ_LABELS,
  PARK_ORDER_STATUS_LABELS,
  PARK_ACTIVITY_STATUS_LABELS,
  PARK_ACTIVITY_SIGNUP_STATUS_LABELS,
  PARK_APPROVAL_BIZ_LABELS,
  PARK_APPROVAL_STATUS_LABELS,
  PARK_CUSTOMER_ROLE_LABELS,
  PARK_RESERVATION_KIND_LABELS,
  PARK_RESOURCE_KIND_LABELS,
  PARK_RESOURCE_STATUS_LABELS,
  PARK_RESERVATION_STATUS_LABELS,
  PARK_SITE_STATUS_LABELS,
  PARK_STAFF_ROLE_LABELS,
  PARK_STAFF_STATUS_LABELS,
  PARK_TENANT_STATUS_LABELS,
  PARK_UNIT_STATUS_LABELS,
  PARK_WORK_ORDER_CATEGORY_LABELS,
  PARK_WORK_ORDER_STATUS_LABELS,
} from '@enterprise/contracts';

export const scalarText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

export const clip = (value: unknown, max: number): string =>
  scalarText(value).trim().slice(0, max);

export const integer = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const decimal = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const iso = (value: Date | null | undefined): string =>
  value ? value.toISOString() : '';

export const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const jsonList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

export const pageArgs = (query: Record<string, unknown>) => {
  const page = Math.max(1, integer(query.page, 1));
  const pageSize = Math.min(100, Math.max(1, integer(query.pageSize, 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const randomCode = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
};

/** 通行码：门岗可手输/扫码；去掉易混字符。 */
export const passCode = (): string => randomCode(10);

/** 企业自助加入码：同一园区内唯一即可。 */
export const joinCode = (): string => randomCode(8);

export const sha256 = async (value: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
};

export const randomToken = (): string => randomBytes(24).toString('hex');

export const siteStatusLabel = (value: string): string =>
  PARK_SITE_STATUS_LABELS[value] || value;
export const unitStatusLabel = (value: string): string =>
  PARK_UNIT_STATUS_LABELS[value] || value;
export const tenantStatusLabel = (value: string): string =>
  PARK_TENANT_STATUS_LABELS[value] || value;
export const staffRoleLabel = (value: string): string =>
  PARK_STAFF_ROLE_LABELS[value] || value;
export const staffStatusLabel = (value: string): string =>
  PARK_STAFF_STATUS_LABELS[value] || value;
export const customerRoleLabel = (value: string): string =>
  PARK_CUSTOMER_ROLE_LABELS[value] || value;
export const approvalStatusLabel = (value: string): string =>
  PARK_APPROVAL_STATUS_LABELS[value] || value;
export const approvalBizLabel = (value: string): string =>
  PARK_APPROVAL_BIZ_LABELS[value] || value;
export const reservationKindLabel = (value: string): string =>
  PARK_RESERVATION_KIND_LABELS[value] || value;
export const reservationStatusLabel = (value: string): string =>
  PARK_RESERVATION_STATUS_LABELS[value] || value;
export const workOrderCategoryLabel = (value: string): string =>
  PARK_WORK_ORDER_CATEGORY_LABELS[value] || value;
export const workOrderStatusLabel = (value: string): string =>
  PARK_WORK_ORDER_STATUS_LABELS[value] || value;
export const announcementCategoryLabel = (value: string): string =>
  PARK_ANNOUNCEMENT_CATEGORY_LABELS[value] || value;
export const leaseStatusLabel = (value: string): string =>
  PARK_LEASE_STATUS_LABELS[value] || value;
export const billStatusLabel = (value: string): string =>
  PARK_BILL_STATUS_LABELS[value] || value;
export const orderStatusLabel = (value: string): string =>
  PARK_ORDER_STATUS_LABELS[value] || value;
export const orderBizLabel = (value: string): string =>
  PARK_ORDER_BIZ_LABELS[value] || value;
export const activityStatusLabel = (value: string): string =>
  PARK_ACTIVITY_STATUS_LABELS[value] || value;
export const activitySignupStatusLabel = (value: string): string =>
  PARK_ACTIVITY_SIGNUP_STATUS_LABELS[value] || value;
export const resourceKindLabel = (value: string): string =>
  PARK_RESOURCE_KIND_LABELS[value] || value;
export const resourceStatusLabel = (value: string): string =>
  PARK_RESOURCE_STATUS_LABELS[value] || value;

export const resourceScheduleOf = (value: unknown) => {
  const row = jsonObject(value);
  const weekdays = Array.isArray(row.weekdays)
    ? row.weekdays
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    : [1, 2, 3, 4, 5];
  return {
    start: clip(row.start, 5) || '09:00',
    end: clip(row.end, 5) || '18:00',
    stepMin: Math.min(480, Math.max(15, integer(row.stepMin, 60))),
    weekdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5],
  };
};

/** 小程序/公众号通用的公开地址：优先站点域名，缺省回落到环境变量。 */
export const publicBaseUrl = (): string =>
  String(
    process.env.PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.APP_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');
