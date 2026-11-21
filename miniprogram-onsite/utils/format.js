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

/** 距离（米）→ "1.2km" / "350m"；后端只给米，端上不换算口径。 */
function distance(metres) {
  const value = Number(metres);
  if (!Number.isFinite(value) || value <= 0) return "";
  return value >= 1000 ? (value / 1000).toFixed(1) + "km" : Math.round(value) + "m";
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

/** 时间戳 / ISO / Date → Date；解析不了返回 null，让调用方决定兜底文案。 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // 秒级时间戳与毫秒级都接受：后端有的字段给秒、有的给 ISO
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

/** "11-18" / 今天、明天：排期与时段选择统一用这个口径 */
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

/** "14:05"；时段引擎给的是分钟偏移，端上只用它渲染刻度 */
function clock(hour, minute) {
  return pad(Number(hour) || 0) + ":" + pad(Number(minute) || 0);
}

/** 时长（分钟）→ "90分钟" / "1小时30分" */
function duration(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return value + "分钟";
  const rest = value % 60;
  return Math.floor(value / 60) + "小时" + (rest ? rest + "分" : "");
}

module.exports = { money, yuan, distance, dateTime, shortTime, dayLabel, clock, duration, toDate };
