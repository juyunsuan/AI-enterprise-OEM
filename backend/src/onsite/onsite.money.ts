/**
 * 上门服务金额与证件号的读写口径。
 *
 * 库里金额是 `DECIMAL(12,2)`（元），契约与前端一律走「分」整数：
 * 浮点只在展示层出现，算价、退款上限、分账三条链路上不出现小数相加。
 */
/** Decimal 列读回来是 Prisma.Decimal 对象，`Number()` 会走它的 valueOf，这里统一收口。 */
export const centsOf = (value: unknown) => Math.round(Number(value ?? 0) * 100);

/** 分 → 写库用的元（两位小数，避免 0.1+0.2 类误差进库）；Prisma 的 Decimal 列接受 number。 */
export const yuanOf = (cents: number) =>
  Number((Math.round(cents) / 100).toFixed(2));

export const decimalOf = (cents: number) => yuanOf(cents);

/** 百分比字段（费率/分成）只保留两位小数，四舍五入后写库。 */
export const rateOf = (value: number) => Number(Number(value || 0).toFixed(2));

export function maskIdCard(value: string) {
  const raw = String(value || '').trim();
  if (raw.length <= 8) return raw ? `${raw.slice(0, 2)}****` : '';
  return `${raw.slice(0, 4)}${'*'.repeat(Math.max(4, raw.length - 8))}${raw.slice(-4)}`;
}

/** 手机号展示掩码：C 端与台账列表用，店主侧详情仍可看全号。 */
export function maskPhone(value: string) {
  const raw = String(value || '').trim();
  if (raw.length < 7) return raw;
  return `${raw.slice(0, 3)}****${raw.slice(-4)}`;
}

/** Prisma JSON 列在两侧库返回形状不一致，统一成字符串数组。 */
export function stringArray(value: unknown): string[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter((item) => item !== '')
    .slice(0, 30);
}

export function numberArray(value: unknown): number[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 30);
}

/** HH:mm → 当日分钟数（排期与工时判定用）。 */
export function minutesOfClock(value: string) {
  const [hour, minute] = String(value || '')
    .split(':')
    .map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
  return hour * 60 + minute;
}

export const clockOfMinutes = (total: number) => {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** 本地日期的 YYYY-MM-DD（排期按日切，不能用 UTC 串日）。 */
export function dayKey(at: Date) {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfDay(at: Date) {
  const copy = new Date(at);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** `YYYY-MM-DD` → 当日 00:00（本地时区）；非法输入返回 null 由调用方给提示。 */
export function parseDay(value: string) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!matched) return null;
  const date = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
