const request = require("./request");

/**
 * 上门服务小程序的接口封装。
 *
 * 顾客侧走免登录公开通道 `/api/public/onsite/**`（身份只来自顾客令牌）；
 * 技师侧走 `/api/public/onsite/staff-api/**`（顾客令牌 + 技师绑定令牌双条件）。
 * 这里的 path 与参数名必须和 backend/src/onsite/onsite.public.ts、
 * onsite.staff-api.ts 逐字一致：端上不另设口径，也不自己算价。
 */

/** 每个请求都带店铺码：一部小程序只属于一个店铺。 */
function withShop(query) {
  const session = require("./session");
  return Object.assign({ shopCode: session.getShopCode() }, query || {});
}

module.exports = {
  // ---------- 店铺与登录 ----------
  bootstrap(query) {
    return request({ path: "/api/public/onsite/bootstrap", query });
  },
  /** wx.login 的 code 换顾客令牌：首次进入即建档。 */
  login(shopCode, code) {
    return request({
      path: "/api/public/onsite/login",
      method: "POST",
      data: { shopCode: shopCode, code: code },
    });
  },

  // ---------- 浏览 ----------
  services(query) {
    return request({ path: "/api/public/onsite/services", query: withShop(query) });
  },
  serviceDetail(serviceId) {
    return request({
      path: "/api/public/onsite/services/detail",
      query: withShop({ serviceId: serviceId }),
    });
  },
  staffList(query) {
    return request({ path: "/api/public/onsite/staff", query: withShop(query) });
  },
  staffDetail(staffId) {
    return request({
      path: "/api/public/onsite/staff/detail",
      query: withShop({ staffId: staffId }),
    });
  },
  scheduleDays(query) {
    return request({
      path: "/api/public/onsite/schedule/days",
      query: withShop(query),
    });
  },
  scheduleTimeline(query) {
    return request({
      path: "/api/public/onsite/schedule/timeline",
      query: withShop(query),
    });
  },
  articles(query) {
    return request({ path: "/api/public/onsite/articles", query: withShop(query) });
  },
  articleDetail(articleId) {
    return request({
      path: "/api/public/onsite/articles/detail",
      query: withShop({ articleId: articleId }),
    });
  },  /** 报名表单（技师入驻 / 留资）：字段定义随文章下发，提交值按字段 id 组装。 */
  submitArticle(data) {
    return request({
      path: "/api/public/onsite/articles/submit",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },

  // ---------- 地址簿 ----------
  addresses() {
    return request({ path: "/api/public/onsite/addresses", query: withShop({}) });
  },
  saveAddress(data) {
    return request({
      path: "/api/public/onsite/addresses",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  removeAddress(id) {
    return request({
      path: "/api/public/onsite/addresses/remove",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), id: id },
    });
  },

  // ---------- 试算与下单 ----------
  /** 车费试算：按地址 + 技师（可空）算，坐标由服务端取，端上不自行测距。 */
  estimateFee(data) {
    return request({
      path: "/api/public/onsite/fee/estimate",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  previewOrder(data) {
    return request({
      path: "/api/public/onsite/orders/preview",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  createOrder(data) {
    return request({
      path: "/api/public/onsite/orders",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  orders(query) {
    return request({ path: "/api/public/onsite/orders", query: withShop(query) });
  },
  orderDetail(orderId) {
    return request({
      path: "/api/public/onsite/orders/detail",
      query: withShop({ orderId: orderId }),
    });
  },
  cancelOrder(orderId, reason) {
    return request({
      path: "/api/public/onsite/orders/cancel",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), orderId: orderId, reason: reason || "" },
    });
  },
  payParams(orderId) {
    return request({
      path: "/api/public/onsite/orders/pay-params",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), orderId: orderId },
    });
  },
  /** 手写签名：image 是签名图上传后的公网直链（见 upload）。 */
  signOrder(orderId, image) {
    return request({
      path: "/api/public/onsite/orders/sign",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), orderId: orderId, image: image },
    });
  },
  /** 加钟单支付参数：加钟是独立待付单，用加钟单 id 而不是订单 id。 */
  addonPayParams(addonId) {
    return request({
      path: "/api/public/onsite/addons/pay-params",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), addonId: addonId },
    });
  },
  /** 加钟：对订单里的某一条服务明细追加数量。 */
  addonOrder(orderId, orderItemId, quantity) {
    return request({
      path: "/api/public/onsite/orders/addon",
      method: "POST",
      data: {
        shopCode: require("./session").getShopCode(),
        orderId: orderId,
        orderItemId: orderItemId,
        quantity: quantity || 1,
      },
    });
  },

  // ---------- 评价 / 退款 / 反馈 ----------
  submitReview(data) {
    return request({
      path: "/api/public/onsite/reviews",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  reviewDetail(orderId) {
    return request({
      path: "/api/public/onsite/reviews/detail",
      query: withShop({ orderId: orderId }),
    });
  },
  refundQuote(data) {
    return request({
      path: "/api/public/onsite/refunds/quote",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  applyRefund(data) {
    return request({
      path: "/api/public/onsite/refunds",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  refunds(query) {
    return request({ path: "/api/public/onsite/refunds", query: withShop(query) });
  },
  refundDetail(refundId) {
    return request({
      path: "/api/public/onsite/refunds/detail",
      query: withShop({ refundId: refundId }),
    });
  },
  cancelRefund(refundId) {
    return request({
      path: "/api/public/onsite/refunds/cancel",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), refundId: refundId },
    });
  },
  feedbacks(query) {
    return request({ path: "/api/public/onsite/feedbacks", query: withShop(query) });
  },
  submitFeedback(data) {
    return request({
      path: "/api/public/onsite/feedbacks",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },

  // ---------- 技师侧（顾客令牌 + 绑定态双条件） ----------
  staffBind(data) {
    return request({
      path: "/api/public/onsite/staff-api/bind",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  staffUnbind() {
    return request({
      path: "/api/public/onsite/staff-api/unbind",
      method: "POST",
      data: Object.assign(withShop({}), {}),
    });
  },
  staffProfile() {
    return request({
      path: "/api/public/onsite/staff-api/profile",
      query: withShop({}),
      staff: true,
    });
  },
  /** 改资料落到待审副本，店主审核通过才对外生效。 */
  staffUpdateProfile(data) {
    return request({
      path: "/api/public/onsite/staff-api/profile/update",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffOrders(query) {
    return request({
      path: "/api/public/onsite/staff-api/orders",
      query: withShop(query),
      staff: true,
    });
  },
  staffOrderDetail(orderId) {
    return request({
      path: "/api/public/onsite/staff-api/order/detail",
      query: withShop({ orderId: orderId }),
      staff: true,
    });
  },
  /** action：accept / reject / depart / arrive / start / complete。 */
  staffOrderAdvance(data) {
    return request({
      path: "/api/public/onsite/staff-api/order/advance",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffLocation(data) {
    return request({
      path: "/api/public/onsite/staff-api/location",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffSchedule(query) {
    return request({
      path: "/api/public/onsite/staff-api/schedule",
      query: withShop(query),
      staff: true,
    });
  },
  staffRestList(query) {
    return request({
      path: "/api/public/onsite/staff-api/rest",
      query: withShop(query),
      staff: true,
    });
  },
  staffRestSave(data) {
    return request({
      path: "/api/public/onsite/staff-api/rest/save",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffRestRemove(id) {
    return request({
      path: "/api/public/onsite/staff-api/rest/remove",
      method: "POST",
      data: Object.assign(withShop({ id: id }), {}),
      staff: true,
    });
  },
  /** 差评申诉：只针对自己订单的评价，处理结果由店主给出。 */
  staffAppeal(data) {
    return request({
      path: "/api/public/onsite/staff-api/appeal",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffAppeals(query) {
    return request({
      path: "/api/public/onsite/staff-api/appeals",
      query: withShop(query),
      staff: true,
    });
  },
  /** 一键求救：定位与联系方式按原样上报，店主与平台留痕。 */
  staffAlert(data) {
    return request({
      path: "/api/public/onsite/staff-api/alert",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  /** 技师意见反馈：orderId 可空，填了也只在属于自己订单时落库。 */
  staffFeedback(data) {
    return request({
      path: "/api/public/onsite/staff-api/feedback",
      method: "POST",
      data: Object.assign(withShop({}), data),
      staff: true,
    });
  },
  staffFeedbacks(query) {
    return request({
      path: "/api/public/onsite/staff-api/feedbacks",
      query: withShop(query),
      staff: true,
    });
  },

  // ---------- 技师收入（P2） ----------
  /** 概览：服务毛收入、承担佣金、合伙人佣金、结算应发四本账分开给。 */
  staffIncomeOverview() {
    return request({
      path: "/api/public/onsite/staff-api/income/overview",
      query: withShop({}),
      staff: true,
    });
  },
  staffIncomeCommissions(query) {
    return request({
      path: "/api/public/onsite/staff-api/income/commissions",
      query: withShop(query),
      staff: true,
    });
  },
  /** 我承担的佣金：这单按分账规则从我收入里扣出去的部分。 */
  staffIncomeBorne(query) {
    return request({
      path: "/api/public/onsite/staff-api/income/borne",
      query: withShop(query),
      staff: true,
    });
  },
  staffIncomeSettlements(query) {
    return request({
      path: "/api/public/onsite/staff-api/income/settlements",
      query: withShop(query),
      staff: true,
    });
  },

  // ---------- 代理侧（店铺码 + 手机号换代理令牌） ----------
  agentBind(phone) {
    return request({
      path: "/api/public/onsite/agent-api/bind",
      method: "POST",
      data: { shopCode: require("./session").getShopCode(), phone: phone },
    });
  },
  agentUnbind() {
    return request({
      path: "/api/public/onsite/agent-api/unbind",
      method: "POST",
      data: Object.assign(withShop({}), {}),
      agent: true,
    });
  },
  agentProfile() {
    return request({
      path: "/api/public/onsite/agent-api/profile",
      query: withShop({}),
      agent: true,
    });
  },
  agentCommissions(query) {
    return request({
      path: "/api/public/onsite/agent-api/commissions",
      query: withShop(query),
      agent: true,
    });
  },
  /** 我的订单：按「有我的佣金明细」反查，佣金为 0 的单不出现。 */
  agentOrders(query) {
    return request({
      path: "/api/public/onsite/agent-api/orders",
      query: withShop(query),
      agent: true,
    });
  },
  agentRefunds(query) {
    return request({
      path: "/api/public/onsite/agent-api/refunds",
      query: withShop(query),
      agent: true,
    });
  },
  agentTechnicians(query) {
    return request({
      path: "/api/public/onsite/agent-api/technicians",
      query: withShop(query),
      agent: true,
    });
  },
  /** 待接单订单改派：后端按店主派单同一套车费重算，操作者记为代理。 */
  agentChangeStaff(data) {
    return request({
      path: "/api/public/onsite/agent-api/orders/change-staff",
      method: "POST",
      data: Object.assign(withShop({}), data),
      agent: true,
    });
  },
  /** 代理招募技师：建档为待审核，店主通过后才能登录技师端。 */
  agentTechnicianApply(data) {
    return request({
      path: "/api/public/onsite/agent-api/technicians/apply",
      method: "POST",
      data: Object.assign(withShop({}), data),
      agent: true,
    });
  },
  /** 代理分享海报文案 + 小程序码，端上用 canvas 合成。 */
  agentPoster() {
    return request({
      path: "/api/public/onsite/agent-api/poster",
      query: withShop({}),
      agent: true,
    });
  },

  // ---------- 文件上传 ----------
  /** 打卡照片 / 签名图 / 评价图：multipart 单文件，返回 { url }。 */
  upload(filePath, kind) {
    const session = require("./session");
    const token = session.getStaffToken() || session.getToken();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: session.getApiBase() + "/api/public/onsite/upload?kind=" + encodeURIComponent(kind || "image"),
        filePath: filePath,
        name: "file",
        header: token ? { Authorization: "Bearer " + token } : {},
        success(res) {
          let body = {};
          try {
            body = JSON.parse(res.data) || {};
          } catch (e) {
            reject(new Error("上传返回内容无法解析，请重试"));
            return;
          }
          if (res.statusCode >= 400 || (body.code && body.code !== 0)) {
            reject(new Error(body.message || "上传失败，请稍后重试"));
            return;
          }
          resolve(body.data);
        },
        fail() {
          reject(new Error("上传失败：请检查网络与服务器地址白名单"));
        },
      });
    });
  },
};
