/**
 * 端上展示用的中文标签。
 *
 * 小程序的字典不在契约里下发（`Health_meta` 只给站内工作台），这里按契约常量
 * 维护一份等价文案；新增枚举时同步这里，界面上任何时候都不把英文原样甩给顾客。
 */
const ENTRY_LABELS = {
  register: "预约挂号",
  consultText: "图文问诊",
  consultPhone: "电话问诊",
  consultVideo: "视频问诊",
  exam: "体检套餐",
  guidance: "快速导诊",
  green: "绿通/手术快约",
  concierge: "私人医生",
  reportRead: "报告解读",
  signPkg: "家庭医生签约",
  yearCard: "医生年卡",
  goods: "医药商城",
  metrics: "指标监测",
  followup: "慢病随访",
  medication: "用药打卡",
  articles: "健康科普",
  question: "健康问答",
  community: "病友圈",
  member: "会员中心",
  coupon: "我的优惠券",
  wallet: "我的钱包",
  serviceDesk: "在线客服",
  tongue: "舌象分析",
};

const BIZ_LABELS = {
  REGISTER: "挂号预约",
  CONSULT_TEXT: "图文问诊",
  CONSULT_PHONE: "电话问诊",
  CONSULT_VIDEO: "视频问诊",
  EXAM: "体检套餐",
  GOODS: "商品订单",
  SIGN_PKG: "家医签约",
  YEAR_CARD: "医生年卡",
  MEMBER_CARD: "会员卡",
  GREEN: "绿通/手术快约",
  CONCIERGE: "私人医生",
  REPORT_READ: "报告解读",
  GUIDANCE: "快速导诊",
  RECHARGE: "余额充值",
};

const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "待付款",
  PAID: "已付款待接单",
  ACCEPTED: "已接单",
  ASSIGNED: "已派单",
  SERVING: "服务中",
  DELIVERED: "已发货",
  COMPLETED: "已完成",
  VERIFIED: "已核销",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "已超时",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
  AFTER_SALE_PENDING: "售后处理中",
  AFTER_SALE_DONE: "售后完成",
};

const CONSULT_STATUS_LABELS = {
  PENDING_PAYMENT: "待付款",
  WAIT_ACCEPT: "待接诊",
  IN_SESSION: "问诊中",
  PRACTITIONER_REPLIED: "医生已回复",
  CUSTOMER_DONE: "已结束（待医生确认）",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

const CONSULT_WAY_LABELS = {
  TEXT: "图文问诊",
  PHONE: "电话问诊",
  VIDEO: "视频问诊",
};

const AFTERSALE_KIND_LABELS = {
  REFUND: "仅退款",
  RETURN_REFUND: "退货退款",
  EXCHANGE: "换货",
  RESEND: "补寄",
};

const AFTERSALE_STATUS_LABELS = {
  PENDING: "待处理",
  APPROVED: "已同意",
  REJECTED: "已拒绝",
  RETURNED: "已退货",
  DONE: "已完成",
  CLOSED: "已关闭",
};

const PATIENT_RELATION_LABELS = {
  SELF: "本人",
  SPOUSE: "配偶",
  CHILD: "子女",
  PARENT: "父母",
  OTHER: "其他",
};

const GENDER_LABELS = { MALE: "男", FEMALE: "女", UNKNOWN: "未填", "": "未填" };

const RECORD_TYPE_LABELS = {
  PAST: "既往史",
  ALLERGY: "过敏史",
  FAMILY: "家族史",
  LIFESTYLE: "生活方式",
  SYMPTOM: "症状",
  IMMUNE: "接种史",
};

const MEDICATION_STATUS_LABELS = {
  TAKEN: "已服用",
  MISSED: "漏服",
  SKIPPED: "跳过",
};

const FOLLOWUP_STATUS_LABELS = {
  PENDING: "待随访",
  DUE: "待随访",
  DONE: "已完成",
  SKIPPED: "已跳过",
  MISSED: "已逾期",
  OVERDUE: "已逾期",
  CANCELED: "已取消",
  CANCELLED: "已取消",
};

const FOLLOWUP_WAY_LABELS = {
  PHONE: "电话随访",
  TEXT: "文字随访",
  OUTPATIENT: "门诊随访",
  SELF_FILL: "居家自填",
};

const PAY_STATUS_LABELS = { UNPAID: "未支付", PAID: "已支付", REFUNDING: "退款中", REFUNDED: "已退款" };

const REPORT_TYPE_LABELS = {
  EXAM: "体检报告",
  LAB: "化验单",
  IMAGING: "影像报告",
  PATHOLOGY: "病理报告",
  OTHER: "其他报告",
};

const REPORT_FLAG_LABELS = {
  NORMAL: "正常",
  HIGH: "偏高",
  LOW: "偏低",
  ABNORMAL: "异常",
};

const COUPON_KIND_LABELS = {
  FULL_REDUCE: "满减券",
  DISCOUNT: "折扣券",
  CASH: "代金券",
  SPECIFIED: "商品券",
};

const COUPON_STATUS_LABELS = {
  AVAILABLE: "可使用",
  USED: "已使用",
  EXPIRED: "已过期",
};

const WALLET_KIND_LABELS = {
  RECHARGE: "充值",
  PAY: "消费",
  REFUND: "退款",
  ADMIN_ADJUST: "调整",
};

const POINT_SCENE_LABELS = {
  ORDER: "下单赠送",
  SIGN_IN: "签到",
  REVIEW: "评价",
  PROFILE: "完善资料",
  ADMIN: "店铺调整",
};

function pick(map, value, fallback) {
  return map[value] || fallback || "—";
}

module.exports = {
  ENTRY_LABELS,
  BIZ_LABELS,
  ORDER_STATUS_LABELS,
  CONSULT_STATUS_LABELS,
  CONSULT_WAY_LABELS,
  AFTERSALE_KIND_LABELS,
  AFTERSALE_STATUS_LABELS,
  PATIENT_RELATION_LABELS,
  GENDER_LABELS,
  RECORD_TYPE_LABELS,
  MEDICATION_STATUS_LABELS,
  FOLLOWUP_STATUS_LABELS,
  FOLLOWUP_WAY_LABELS,
  PAY_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  REPORT_FLAG_LABELS,
  COUPON_KIND_LABELS,
  COUPON_STATUS_LABELS,
  WALLET_KIND_LABELS,
  POINT_SCENE_LABELS,
  pick,
};
