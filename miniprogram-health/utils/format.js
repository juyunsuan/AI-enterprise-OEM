/**
 * 端上只做展示格式化，不参与任何计价：金额一律由后端以「分」下发，
 * 这里只负责把分换成带两位小数的字符串，绝不在此做加减乘除。
 */

/** 分 → "123.45"；空值统一显示破折号，避免列表里出现 "¥NaN"。 */
function money(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return "—";
  return (value / 100).toFixed(2);
}

/** 分 → "¥123.45"。 */
function yuan(cents) {
  return "¥" + money(cents);
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

/** 时间戳 / ISO / Date → Date；解析不了返回 null，让调用方决定兜底文案。 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-11-18 14:05" */
function dateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

/** "11-18 14:05"，列表里省掉年份 */
function shortTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return (
    pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes())
  );
}

/** "11-18" / 今天、明天：号源与随访统一用这个口径 */
function dayLabel(value) {
  const date = toDate(value);
  if (!date) return "—";
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(today)) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  return pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

/** "2026-11-18" */
function dateOnly(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

/** 时长（分钟）→ "90分钟" / "1小时30分" */
function duration(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return value + "分钟";
  const rest = value % 60;
  return Math.floor(value / 60) + "小时" + (rest ? rest + "分" : "");
}

/** 体重等数值：去掉多余的 0，保留至多 2 位小数。 */
function number(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return String(Math.round(num * 100) / 100);
}

module.exports = { money, yuan, dateTime, shortTime, dayLabel, dateOnly, duration, number, toDate };
