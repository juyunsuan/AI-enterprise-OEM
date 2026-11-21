const ORDER_STATUS = {
  PENDING_PAYMENT: "待付款",
  PAID: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const AFTER_SALE_STATUS = {
  PENDING: "待审核",
  AGREED: "待退货",
  REJECTED: "已驳回",
  REFUNDED: "已退款",
  CANCELLED: "已撤销",
};

const AFTER_SALE_TYPE = {
  REFUND_ONLY: "仅退款",
  RETURN_REFUND: "退货退款",
};

function money(value) {
  return "¥" + (Number(value) || 0).toFixed(2);
}

function time(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function addressText(address) {
  if (!address) return "";
  return [address.province, address.city, address.district, address.detail]
    .filter(Boolean)
    .join("");
}

function orderStatusText(status) {
  return ORDER_STATUS[status] || status || "";
}

function orderStatusColor(status) {
  if (status === "PENDING_PAYMENT") return "#d97706";
  if (status === "COMPLETED") return "#059669";
  if (status === "CANCELLED") return "#8a8f99";
  return "#1f6feb";
}

function afterSaleStatusText(status) {
  return AFTER_SALE_STATUS[status] || status || "";
}

function afterSaleTypeText(type) {
  return AFTER_SALE_TYPE[type] || type || "";
}

/** 列表与详情共用一份金额摘要，避免两处口径不一致。 */
function orderAmountText(order) {
  if (!order) return "";
  return "实付 " + money(order.payAmount);
}

module.exports = {
  ORDER_STATUS,
  AFTER_SALE_STATUS,
  AFTER_SALE_TYPE,
  money,
  time,
  addressText,
  orderStatusText,
  orderStatusColor,
  afterSaleStatusText,
  afterSaleTypeText,
  orderAmountText,
};
