function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

/** 服务端给的是 ISO 串，'' 表示未设置；这里只截到分钟，避免时区二次换算。 */
function dateTime(value) {
  if (!value) return "";
  const text = String(value);
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!matched) return text;
  return (
    matched[1] + "-" + matched[2] + "-" + matched[3] + " " + matched[4] + ":" + matched[5]
  );
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

/** 金额一律两位小数（后端已是普通数字，不是分）。 */
function money(value) {
  const number = Number(value || 0);
  return (Number.isFinite(number) ? number : 0).toFixed(2);
}

function yuan(value) {
  return "¥" + money(value);
}

/** 商品卡片的到手价：SKU 价优先，无 SKU 用主价格。 */
function priceOf(product) {
  if (!product) return "0.00";
  return money(product.price);
}

function stockText(stock) {
  const value = Number(stock || 0);
  return value > 0 ? "库存 " + value : "缺货";
}

/** 倒计时用：到 expireAt 还剩多久（未付款订单取消倒计时）。 */
function countdown(expireAt) {
  if (!expireAt) return "";
  const time = new Date(String(expireAt).replace(" ", "T")).getTime();
  if (!time || Number.isNaN(time)) return "";
  const left = Math.max(0, Math.floor((time - Date.now()) / 1000));
  const minute = Math.floor(left / 60);
  const second = left % 60;
  return pad(minute) + ":" + pad(second);
}

const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "待付款",
  PAID: "待发货",
  SHIPPED: "待收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const REFUND_STATUS_LABELS = {
  NONE: "无售后",
  PENDING: "待处理",
  APPROVED: "待买家退货",
  REJECTED: "售后驳回",
  DONE: "已退款",
};

// 券票状态与订单售后态是两套枚举，别复用：这里是顾客手里那张券的 UNUSED/USED/EXPIRED
const TICKET_STATUS_LABELS = {
  UNUSED: "未使用",
  USED: "已使用",
  EXPIRED: "已过期",
};

const COUPON_SCOPE_LABELS = {
  ALL: "全场通用",
  CATEGORY: "指定分类",
  PRODUCT: "指定商品",
};

const REFUND_TICKET_STATUS_LABELS = {
  PENDING: "待处理",
  AGREED: "已同意",
  REJECTED: "已驳回",
  REFUNDED: "已退款",
  CANCELLED: "已取消",
};

const PAY_STATUS_LABELS = {
  UNPAID: "未支付",
  PAID: "已支付",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

const COUPON_TYPE_LABELS = {
  FULL_REDUCE: "满减券",
  DISCOUNT: "折扣券",
};

const RETURN_TYPE_LABELS = {
  REFUND_ONLY: "仅退款",
  RETURN_REFUND: "退货退款",
};

/** 折扣券的 value 是百分数（88 → 8.8 折），券面文案在端上折算。 */
function couponValueText(coupon) {
  if (!coupon) return "";
  if (coupon.type === "DISCOUNT") {
    const rate = Number(coupon.value || 0);
    return (rate / 10).toFixed(1).replace(/\.0$/, "") + " 折";
  }
  return "¥" + money(coupon.value);
}

function couponRuleText(coupon) {
  if (!coupon) return "";
  const threshold = Number(coupon.threshold || 0);
  return threshold > 0 ? "满 " + money(threshold) + " 元可用" : "无门槛使用";
}

module.exports = {
  pad: pad,
  dateTime: dateTime,
  dateOnly: dateOnly,
  money: money,
  yuan: yuan,
  priceOf: priceOf,
  stockText: stockText,
  countdown: countdown,
  ORDER_STATUS_LABELS: ORDER_STATUS_LABELS,
  REFUND_STATUS_LABELS: REFUND_STATUS_LABELS,
  REFUND_TICKET_STATUS_LABELS: REFUND_TICKET_STATUS_LABELS,
  TICKET_STATUS_LABELS: TICKET_STATUS_LABELS,
  COUPON_SCOPE_LABELS: COUPON_SCOPE_LABELS,
  PAY_STATUS_LABELS: PAY_STATUS_LABELS,
  COUPON_TYPE_LABELS: COUPON_TYPE_LABELS,
  RETURN_TYPE_LABELS: RETURN_TYPE_LABELS,
  couponValueText: couponValueText,
  couponRuleText: couponRuleText,
};
