/** 展示格式化：金额一律由后端给「分」，端上只换算字符串，不参与计价。 */
function money(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return "—";
  return (value / 100).toFixed(2);
}

function yuan(cents) {
  return "¥" + money(cents);
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

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

function day(value) {
  const date = toDate(value);
  if (!date) return "—";
  return monthDay(date);
}

function monthDay(date) {
  return pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function daysBetween(startAt, endAt) {
  const start = toDate(startAt);
  const end = toDate(endAt);
  if (!start || !end || end <= start) return 1;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
}

function today() {
  const date = new Date();
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

module.exports = { money, yuan, dateTime, day, monthDay, daysBetween, today, toDate };