const session = require("./session");

const TASK_STATUS_LABELS = {
  PENDING: "待随访",
  OVERDUE: "已逾期",
  DONE: "已完成",
  SKIPPED: "已跳过",
  CANCELED: "已取消",
};

const RX_STATUS_LABELS = {
  DRAFT: "草稿",
  SUBMITTED: "待复核",
  PHARMACY_APPROVED: "已通过",
  PHARMACY_REJECTED: "已驳回",
  DISPENSED: "已发药",
  REVOKED: "已作废",
  EXPIRED: "已过期",
};

const CONSULT_STATUS_LABELS = {
  PENDING_PAYMENT: "待支付",
  WAIT_ACCEPT: "待接诊",
  IN_SESSION: "问诊中",
  PRACTITIONER_REPLIED: "已回复",
  CUSTOMER_DONE: "顾客结束",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

const CONSULT_TYPE_LABELS = {
  CONSULT_TEXT: "图文问诊",
  CONSULT_PHONE: "电话问诊",
  CONSULT_VIDEO: "视频问诊",
};

const ARTICLE_STATUS_LABELS = {
  ON: "展示中",
  OFF: "已下线",
};

const AUDIT_STATUS_LABELS = {
  PENDING: "待店主审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  OFFLINE: "已下线",
};

const SLOT_STATUS_LABELS = {
  AVAILABLE: "可预约",
  LOCKED: "锁定中",
  BOOKED: "已预约",
  CANCELED: "已取消",
  BLOCKED: "已停诊",
};

const WITHDRAWAL_STATUS_LABELS = {
  PENDING: "待店主审核",
  APPROVED: "待打款",
  PAID: "已打款",
  REJECTED: "已驳回",
  FAILED: "打款失败",
};

const ROLE_LABELS = {
  DOCTOR: "医生",
  MANAGER: "健管师",
  PHARMACIST: "药师",
  GUIDE: "导诊师",
};

/** 纯 AI 客服员工的接待方式（与 AI客服那侧的口径一致）。 */
const AI_AGENT_MODE_LABELS = {
  AUTO: "AI 先接待，需要时转人工",
  BOT: "纯 AI 接待，不转人工",
};

function pick(map, key) {
  return map[key] || key || "";
}

/** 医护页面统一入口：无医护令牌时回绑定页，业务错误只弹提示。 */
function requireStaff() {
  if (session.getStaffToken()) return Promise.resolve(session.getStaffProfile());
  wx.redirectTo({ url: "/practitioner/bind/index" });
  return Promise.reject(Object.assign(new Error("请先绑定医护身份"), { code: 401 }));
}

function handleError(error, fallback) {
  if (!error) return;
  if (error.code === 401) {
    session.clearStaffToken();
    wx.redirectTo({ url: "/practitioner/bind/index" });
    return;
  }
  wx.showToast({ title: error.message || fallback || "操作失败", icon: "none" });
}

/**
 * AI 医护入口是否显示：
 * - 管理员（可开关、可绑人）始终显示，否则关掉了就进不去设置；
 * - 普通医护只在「已开启且自己已绑定 AI 客服」时看到入口；
 * - 状态没取到（网络失败等）保留入口，不因为一次请求失败把功能藏起来。
 */
function aiEntryVisible(status) {
  if (!status) return true;
  if (status.canManage) return true;
  return status.enabled === true && Number(status.agentId || 0) > 0;
}

module.exports = {
  TASK_STATUS_LABELS,
  CONSULT_STATUS_LABELS,
  CONSULT_TYPE_LABELS,
  RX_STATUS_LABELS,
  ARTICLE_STATUS_LABELS,
  AUDIT_STATUS_LABELS,
  SLOT_STATUS_LABELS,
  WITHDRAWAL_STATUS_LABELS,
  ROLE_LABELS,
  AI_AGENT_MODE_LABELS,
  pick,
  requireStaff,
  handleError,
  aiEntryVisible,
};
