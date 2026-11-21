const request = require("./request");
const session = require("./session");

function ownAppId() {
  try {
    const info =
      typeof wx.getAccountInfoSync === "function"
        ? wx.getAccountInfoSync()
        : null;
    return String((info && info.miniProgram && info.miniProgram.appId) || "");
  } catch (error) {
    return "";
  }
}

function park() {
  return session.getParkCode();
}

module.exports = {
  bootstrap() {
    return request({
      path: "/api/public/park/bootstrap",
      query: { park: park(), appId: ownAppId() },
    });
  },

  login(code) {
    return request({
      path: "/api/public/park/login",
      method: "POST",
      data: { park: park(), code },
    });
  },

  profile() {
    return request({ path: "/api/public/park/profile" });
  },

  updateProfile(body) {
    return request({
      path: "/api/public/park/profile/update",
      method: "POST",
      data: body || {},
    });
  },

  bindTenant(code) {
    return request({
      path: "/api/public/park/profile/bind",
      method: "POST",
      data: { code },
    });
  },

  activities() {
    return request({
      path: "/api/public/park/activities",
      query: { park: park(), appId: ownAppId() },
    });
  },

  activityDetail(id) {
    return request({
      path: "/api/public/park/activity/detail",
      query: { park: park(), appId: ownAppId(), id },
    });
  },

  activityMy() {
    return request({ path: "/api/public/park/activity/my" });
  },

  activitySignup(activityId, name, phone, note) {
    return request({
      path: "/api/public/park/activity/signup",
      method: "POST",
      data: { activityId, name, phone, note },
    });
  },

  activityCancel(activityId) {
    return request({
      path: "/api/public/park/activity/cancel",
      method: "POST",
      data: { activityId },
    });
  },

  invoices() {
    return request({ path: "/api/public/park/invoice/my" });
  },

  parking() {
    return request({ path: "/api/public/park/parking/my" });
  },

  applyParking(body) {
    return request({
      path: "/api/public/park/parking/apply",
      method: "POST",
      data: body || {},
    });
  },

  staffPatrolPlans() {
    return request({ path: "/api/public/park/staff/patrol/plans", staff: true });
  },

  staffPatrolRecord(body) {
    return request({
      path: "/api/public/park/staff/patrol/record",
      method: "POST",
      data: body || {},
      staff: true,
    });
  },

  bills() {
    return request({ path: "/api/public/park/bill/my" });
  },

  uploadImage(filePath, kind) {
    const token = session.getToken();
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: session.getApiBase() + "/api/public/park/upload?kind=" + (kind || "repair"),
        filePath: filePath,
        name: "file",
        header: token ? { Authorization: "Bearer " + token } : {},
        success: function (res) {
          try {
            const data = JSON.parse(res.data || "{}");
            if (data.url) resolve(data);
            else reject(new Error(data.message || "上传失败"));
          } catch (error) {
            reject(new Error("上传失败"));
          }
        },
        fail: function () {
          reject(new Error("上传失败，请检查网络"));
        },
      });
    });
  },

  myApprovals() {
    return request({ path: "/api/public/park/approval/my" });
  },

  approvalAct(id, action, comment) {
    return request({
      path: "/api/public/park/approval/act",
      method: "POST",
      data: { id, action, comment: comment || "" },
    });
  },

  orders() {
    return request({ path: "/api/public/park/order/my" });
  },

  orderPayParams(orderId) {
    return request({
      path: "/api/public/park/order/pay-params",
      method: "POST",
      data: { orderId },
    });
  },

  resources() {
    return request({
      path: "/api/public/park/resources",
      query: { park: park(), appId: ownAppId() },
    });
  },

  resourceDetail(id) {
    return request({
      path: "/api/public/park/resource/detail",
      query: { park: park(), appId: ownAppId(), id },
    });
  },

  reservations() {
    return request({ path: "/api/public/park/reservation/my" });
  },

  createReservation(body) {
    return request({
      path: "/api/public/park/reservation/create",
      method: "POST",
      data: body || {},
    });
  },

  cancelReservation(id) {
    return request({
      path: "/api/public/park/reservation/cancel",
      method: "POST",
      data: { id },
    });
  },

  workOrders() {
    return request({ path: "/api/public/park/workorder/my" });
  },

  workOrderDetail(id) {
    return request({
      path: "/api/public/park/workorder/detail",
      query: { id },
    });
  },

  createWorkOrder(body) {
    return request({
      path: "/api/public/park/workorder/create",
      method: "POST",
      data: body || {},
    });
  },

  rateWorkOrder(id, rating, comment) {
    return request({
      path: "/api/public/park/workorder/rate",
      method: "POST",
      data: { id, rating, comment: comment || "" },
    });
  },

  staffBind(phone, staffCode) {
    return request({
      path: "/api/public/park/staff/bind",
      method: "POST",
      data: { park: park(), phone, staffCode },
    });
  },

  staffWorkbench() {
    return request({ path: "/api/public/park/staff/workbench", staff: true });
  },

  staffApprovals() {
    return request({ path: "/api/public/park/staff/approvals", staff: true });
  },

  staffApprovalAct(id, action, comment) {
    return request({
      path: "/api/public/park/staff/approval/act",
      method: "POST",
      data: { id, action, comment: comment || "" },
      staff: true,
    });
  },

  staffReservations() {
    return request({
      path: "/api/public/park/staff/reservations",
      query: { page: 1, pageSize: 50, kind: "", status: "", keyword: "" },
      staff: true,
    });
  },

  staffCheckin(code) {
    return request({
      path: "/api/public/park/staff/reservation/checkin",
      method: "POST",
      data: { code },
      staff: true,
    });
  },

  staffWorkOrders() {
    return request({
      path: "/api/public/park/staff/workorders",
      query: { page: 1, pageSize: 50, category: "", status: "", keyword: "" },
      staff: true,
    });
  },

  staffWorkOrderAct(id, action, note, result, feeAmount) {
    return request({
      path: "/api/public/park/staff/workorder/act",
      method: "POST",
      data: {
        id,
        action,
        note: note || "",
        result: result || "",
        images: [],
        feeAmount: Number(feeAmount) || 0,
      },
      staff: true,
    });
  },
};
