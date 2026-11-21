const ORDER_STATE = {
  PENDING_PICKUP: "待取件",
  ACCEPTED: "已接单",
  PICKED_UP: "已取件",
  IN_TRANSIT: "运输中",
  DELIVERED: "已签收",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXCEPTION: "异常",
};

const PAY_STATE = {
  PENDING: "待支付",
  PAID: "已支付",
  REFUNDED: "已退款",
  CLOSED: "已关闭",
};

const PAY_MODE = {
  ONLINE: "微信在线支付",
  OFFLINE: "线下收款",
};

function money(value) {
  return "¥" + (Number(value) || 0).toFixed(2);
}

function time(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function partyText(party) {
  if (!party) return "";
  return [party.province, party.city, party.district, party.address]
    .filter(Boolean)
    .join("");
}

/** 列表上优先展示「待支付」，否则展示履约状态——和店主后台台账同一口径。 */
function orderStateText(order) {
  if (!order) return "";
  if (order.payState === "PENDING") return "待支付";
  if (order.payState === "CLOSED") return "已关闭";
  if (order.payState === "REFUNDED") return "已退款";
  return ORDER_STATE[order.status] || order.status;
}

function stateColor(order) {
  if (!order) return "#8a8f99";
  if (order.payState === "PENDING") return "#d97706";
  if (order.status === "CANCELLED") return "#8a8f99";
  if (order.status === "EXCEPTION") return "#dc2626";
  if (order.status === "COMPLETED") return "#059669";
  return "#1f6feb";
}

module.exports = {
  ORDER_STATE,
  PAY_STATE,
  PAY_MODE,
  money,
  time,
  partyText,
  orderStateText,
  stateColor,
};
