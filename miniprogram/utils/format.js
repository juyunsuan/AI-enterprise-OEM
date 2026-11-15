function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

/** 服务端返回的是本地时区 ISO 串，这里直接截取到分钟，避免时区二次换算。 */
function dateTime(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return text;
  return match[1] + "-" + match[2] + "-" + match[3] + " " + match[4] + ":" + match[5];
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / 日期。 */
function relative(value) {
  if (!value) return "";
  const time = new Date(String(value).replace(" ", "T")).getTime();
  if (!time || Number.isNaN(time)) return dateTime(value);
  const diff = Date.now() - time;
  if (diff < 0) return dateTime(value);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return Math.floor(diff / minute) + " 分钟前";
  if (diff < day) return Math.floor(diff / hour) + " 小时前";
  if (diff < 2 * day) return "昨天";
  return dateOnly(value);
}

function amount(value) {
  const number = Number(value || 0);
  if (!number) return "";
  return "¥" + number.toFixed(2);
}

function fileSize(bytes) {
  const size = Number(bytes || 0);
  if (size <= 0) return "";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

module.exports = {
  pad: pad,
  dateTime: dateTime,
  dateOnly: dateOnly,
  relative: relative,
  amount: amount,
  fileSize: fileSize,
};
