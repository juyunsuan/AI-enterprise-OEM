const request = require("./request");

/**
 * 站内业务接口的薄封装。方法名对齐后端契约，路径一律复用现有站内契约
 * （小程序不新增业务后端，只换一个承载会话的客户端）。
 */
module.exports = {
  // ---------- 公开侧（免登录） ----------
  bootstrap() {
    return request({ path: "/api/public/miniprogram/bootstrap" });
  },
  login(payload) {
    return request({
      path: "/api/public/miniprogram/login",
      method: "POST",
      data: payload,
    });
  },

  // ---------- 我的任务 ----------
  myTasks(query) {
    return request({ path: "/enterprise/my-tasks", query });
  },
  myTask(id) {
    return request({ path: "/enterprise/my-tasks/" + id });
  },
  closeTask(id, note) {
    return request({
      path: "/enterprise/my-tasks/" + id + "/close",
      method: "POST",
      data: { note: note || "" },
    });
  },
  reopenTask(id) {
    return request({
      path: "/enterprise/my-tasks/" + id + "/reopen",
      method: "POST",
      data: {},
    });
  },
  submitTaskForm(id, values, note) {
    return request({
      path: "/enterprise/my-tasks/" + id + "/form",
      method: "POST",
      data: { values: values, note: note || "" },
    });
  },

  // ---------- OA 审批 ----------
  oaTasks(query) {
    return request({ path: "/enterprise/oa/tasks", query });
  },
  oaInbox() {
    return request({ path: "/enterprise/oa/approval-inbox" });
  },
  oaApplication(id) {
    return request({ path: "/enterprise/oa/applications/" + id });
  },
  oaApprove(id, comment) {
    return request({
      path: "/enterprise/oa/tasks/" + id + "/approve",
      method: "POST",
      data: { comment: comment || "" },
    });
  },
  oaReject(id, comment) {
    return request({
      path: "/enterprise/oa/tasks/" + id + "/reject",
      method: "POST",
      data: { comment: comment || "" },
    });
  },
  oaTransfer(id, targetUserId, comment) {
    return request({
      path: "/enterprise/oa/tasks/" + id + "/transfer",
      method: "POST",
      data: { targetUserId: targetUserId, comment: comment || "" },
    });
  },

  // ---------- 客服会话 ----------
  conversations(query) {
    return request({ path: "/enterprise/service-desk/conversations", query });
  },
  conversation(id) {
    return request({ path: "/enterprise/service-desk/conversations/" + id });
  },
  sendMessage(id, content) {
    return request({
      path: "/enterprise/service-desk/conversations/" + id + "/messages",
      method: "POST",
      data: { content: content, contentType: "text" },
    });
  },

  // ---------- 系统消息 ----------
  notifications(query) {
    return request({ path: "/enterprise/notifications", query });
  },
  unreadNotifications() {
    return request({ path: "/enterprise/notifications/unread" });
  },
  notification(id) {
    return request({ path: "/enterprise/notifications/" + id });
  },
  readNotification(id) {
    return request({
      path: "/enterprise/notifications/" + id + "/read",
      method: "POST",
      data: {},
    });
  },
  readAllNotifications(category) {
    return request({
      path: "/enterprise/notifications/read-all",
      method: "POST",
      data: category ? { category: category } : {},
    });
  },

  // ---------- 身份 ----------
  me() {
    return request({ path: "/enterprise/me" });
  },
  switchIdentity(identity) {
    return request({
      path: "/enterprise/me/identity",
      method: "POST",
      data: { identity: identity },
    });
  },

  // ---------- 小程序绑定 ----------
  miniStatus() {
    return request({ path: "/enterprise/miniprogram/status" });
  },
  bindMiniProgram(code) {
    return request({
      path: "/enterprise/miniprogram/binding",
      method: "POST",
      data: { code: code },
    });
  },
};
