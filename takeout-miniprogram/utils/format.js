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

function dateTime(value) {
  if (!value) return "";
  const text = String(value);
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!matched) return text;
  return (
    matched[1] + "-" + matched[2] + "-" + matched[3] + " " + matched[4] + ":" + matched[5]
  );
}

function clock(value) {
  if (!value) return "";
  const text = String(value);
  const matched = text.match(/\d{2}:\d{2}/);
  return matched ? matched[0] : "";
}

function countdown(expireAt) {
  if (!expireAt) return "";
  const time = new Date(String(expireAt).replace(" ", "T")).getTime();
  if (!time || Number.isNaN(time)) return "";
  const left = Math.max(0, Math.floor((time - Date.now()) / 1000));
  return pad(Math.floor(left / 60)) + ":" + pad(left % 60);
}

const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "待支付",
  PAID: "商家备餐中",
  SHIPPED: "待取餐",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const MODE_LABELS = {
  DELIVERY: "外卖配送",
  PICKUP: "到店自取",
  DINEIN: "堂食",
};

/** 状态文案按履约方式细分：同一张订单表，SHIPPED 对外含义不同。 */
function statusText(order) {
  const status = String((order && order.status) || "");
  const mode = String((order && order.orderMode) || "DELIVERY");
  if (status === "SHIPPED") {
    if (mode === "PICKUP") return "待取餐";
    if (mode === "DINEIN") return "已出餐";
    return "配送中";
  }
  if (status === "PAID" && mode === "DINEIN") return "已接单·出餐中";
  return ORDER_STATUS_LABELS[status] || status;
}

function statusHint(order) {
  const status = String((order && order.status) || "");
  const mode = String((order && order.orderMode) || "DELIVERY");
  if (status === "PENDING_PAYMENT") return "请在倒计时内完成支付，超时自动取消";
  if (status === "PAID") return mode === "DINEIN" ? "后厨正在制作，请稍候" : "商家已接单，正在备餐";
  if (status === "SHIPPED") {
    if (mode === "PICKUP") return "餐品已出餐，凭取餐号到店取餐";
    if (mode === "DINEIN") return "餐品已出餐，请慢用";
    return "骑手配送中，请保持电话畅通";
  }
  if (status === "COMPLETED") return "订单已完成，感谢光临";
  if (status === "CANCELLED") return "订单已取消";
  return "";
}

function modeText(mode) {
  return MODE_LABELS[mode] || "外卖配送";
}

module.exports = {
  money: money,
  yuan: yuan,
  dateTime: dateTime,
  clock: clock,
  countdown: countdown,
  statusText: statusText,
  statusHint: statusHint,
  modeText: modeText,
};