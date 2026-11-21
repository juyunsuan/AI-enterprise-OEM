function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function money(value) {
  const number = Number(value || 0);
  return (Number.isFinite(number) ? number : 0).toFixed(2);
}

function yuan(value) {
  return "¥" + money(value);
}

/** 服务端给 ISO 串；这里只截到分钟，避免二次时区换算。 */
function dateTime(value) {
  if (!value) return "";
  const text = String(value);
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!matched) return text;
  return (
    matched[1] +
    "-" +
    matched[2] +
    "-" +
    matched[3] +
    " " +
    matched[4] +
    ":" +
    matched[5]
  );
}

/** 展示库存：ACTUAL 给数字，RANGE 给区间档位（后端 stock.levelLabel 已算好）。 */
function stockText(stock, mode) {
  if (!stock) return "";
  if (mode === "ACTUAL") {
    return Number(stock.available || 0) > 0
      ? "库存 " + stock.available
      : "已售罄";
  }
  return stock.levelLabel || "库存紧张";
}

function countdown(expireAt) {
  if (!expireAt) return "";
  const time = new Date(String(expireAt).replace(" ", "T")).getTime();
  if (!time || Number.isNaN(time)) return "";
  const left = Math.max(0, Math.floor((time - Date.now()) / 1000));
  return pad(Math.floor(left / 60)) + ":" + pad(left % 60);
}

var PAY_STATE_LABELS = {
  PENDING: "待支付",
  PAID: "已支付",
  CLOSED: "已关闭",
  REFUNDED: "已退款",
};

module.exports = {
  money: money,
  yuan: yuan,
  dateTime: dateTime,
  stockText: stockText,
  countdown: countdown,
  PAY_STATE_LABELS: PAY_STATE_LABELS,
};
