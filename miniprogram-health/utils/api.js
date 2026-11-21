const request = require("./request");
const session = require("./session");

/**
 * 顾客端与免登录浏览接口（`/api/public/health/**`）。
 *
 * 所有请求自动带上包内店铺码：一部小程序只属于一家店，端上不存在切换店铺。
 * 页面只调这里的函数，不自己拼路径——后端改字段时只有这一处要跟。
 */
const shopCode = () => session.getShopCode();
const withShop = (query) => Object.assign({ shopCode: shopCode() }, query || {});
const withShopBody = (data) => Object.assign({ shopCode: shopCode() }, data || {});

const get = (path, query) => request({ path, query: withShop(query) });
const post = (path, data) => request({ path, method: "POST", data: withShopBody(data) });

/** 医护通道：令牌走 session 的医护槽位，所有请求仍带包内店铺码。 */
const staffGet = (path, query) => request({ path, query: withShop(query), staff: true });
const staffPost = (path, data) =>
  request({ path, method: "POST", data: withShopBody(data), staff: true });

module.exports = {
  // ---------------- 启动 / 登录 / 我的
  bootstrap(query) {
    return request({
      path: "/api/public/health/bootstrap",
      query: Object.assign({ shopCode: shopCode() }, query || {}),
    });
  },
  login(shopCodeValue, code, promoterCode) {
    return request({
      path: "/api/public/health/login",
      method: "POST",
      data: {
        shopCode: shopCodeValue || shopCode(),
        code: code,
        promoterCode: promoterCode || "",
      },
    });
  },
  me() {
    return get("/api/public/health/me");
  },
  saveProfile(data) {
    return post("/api/public/health/profile", data);
  },

  // ---------------- 就诊人 / 档案 / 指标 / 随访 / 用药
  patients() {
    return get("/api/public/health/patients");
  },
  savePatient(data) {
    return post("/api/public/health/patients/save", data);
  },
  removePatient(patientId) {
    return post("/api/public/health/patients/remove", { patientId });
  },
  archive(patientId) {
    return get("/api/public/health/archive", { patientId });
  },
  saveArchiveItem(data) {
    return post("/api/public/health/archive/item/save", data);
  },
  metrics() {
    return get("/api/public/health/metrics");
  },
  metricLogs(patientId) {
    return get("/api/public/health/metrics/logs", { patientId });
  },
  saveMetricLog(data) {
    return post("/api/public/health/metrics/logs/save", data);
  },
  metricTrend(patientId, metricId) {
    return get("/api/public/health/metrics/trend", { patientId, metricId });
  },
  followups() {
    return get("/api/public/health/followups");
  },
  completeFollowup(data) {
    return post("/api/public/health/followups/complete", data);
  },
  medications(patientId) {
    return get("/api/public/health/medications", { patientId });
  },
  medicationLog(data) {
    return post("/api/public/health/medications/log", data);
  },
  prescriptions() {
    return get("/api/public/health/prescriptions");
  },
  reports() {
    return get("/api/public/health/reports");
  },
  reportDetail(id) {
    return get("/api/public/health/reports/detail", { id });
  },

  // ---------------- 服务 / 医护 / 医院 / 号源
  services(query) {
    return get("/api/public/health/services", query);
  },
  serviceDetail(id) {
    return get("/api/public/health/services/detail", { id });
  },
  practitioners(query) {
    return get("/api/public/health/practitioners", query);
  },
  practitionerDetail(id) {
    return get("/api/public/health/practitioners/detail", { id });
  },
  hospitals(query) {
    return get("/api/public/health/hospitals", query);
  },
  departments(hospitalId) {
    return get("/api/public/health/departments", { hospitalId });
  },
  cities() {
    return get("/api/public/health/cities");
  },
  diseases(keyword) {
    return get("/api/public/health/diseases", { keyword });
  },
  drugs(keyword) {
    return get("/api/public/health/drugs", { keyword });
  },
  slotDays(query) {
    return get("/api/public/health/slots/days", query);
  },
  slotTimeline(query) {
    return get("/api/public/health/slots/timeline", query);
  },

  // ---------------- 内容 / 病友圈 / 问答
  articles(query) {
    return get("/api/public/health/articles", query);
  },
  articleDetail(id) {
    return get("/api/public/health/articles/detail", { id });
  },
  articleCategories() {
    return get("/api/public/health/article-categories");
  },
  posts(query) {
    return get("/api/public/health/posts", query);
  },
  postDetail(id) {
    return get("/api/public/health/posts/detail", { id });
  },
  createPost(data) {
    return post("/api/public/health/posts/create", data);
  },
  commentPost(data) {
    return post("/api/public/health/posts/comment", data);
  },
  likePost(postId) {
    return post("/api/public/health/posts/like", { postId });
  },
  questions(query) {
    return get("/api/public/health/questions", query);
  },
  questionDetail(id) {
    return get("/api/public/health/questions/detail", { id });
  },
  createQuestion(data) {
    return post("/api/public/health/questions/create", data);
  },
  hotKeywords() {
    return get("/api/public/health/hot-keywords");
  },
  logSearch(keyword) {
    return post("/api/public/health/search/log", { keyword });
  },

  // ---------------- 商品 / 购物车 / 地址
  goodsCategories() {
    return get("/api/public/health/goods/categories");
  },
  goods(query) {
    return get("/api/public/health/goods", query);
  },
  goodsDetail(id) {
    return get("/api/public/health/goods/detail", { id });
  },
  cart() {
    return get("/api/public/health/cart");
  },
  saveCart(data) {
    return post("/api/public/health/cart/save", data);
  },
  addresses() {
    return get("/api/public/health/addresses");
  },
  saveAddress(data) {
    return post("/api/public/health/addresses/save", data);
  },
  removeAddress(addressId) {
    return post("/api/public/health/addresses/remove", { addressId });
  },

  // ---------------- 营销资产 / 套餐
  coupons() {
    return get("/api/public/health/coupons");
  },
  points() {
    return get("/api/public/health/points");
  },
  wallet() {
    return get("/api/public/health/wallet");
  },
  signPackages(teamId) {
    return get("/api/public/health/sign-packages", { teamId });
  },
  examPackages(query) {
    return get("/api/public/health/exam-packages", query);
  },
  examPackageDetail(id) {
    return get("/api/public/health/exam-packages/detail", { id });
  },

  // ---------------- 统一订单
  previewOrder(data) {
    return post("/api/public/health/order/preview", data);
  },
  createOrder(data) {
    return post("/api/public/health/order/create", data);
  },
  orders(query) {
    return get("/api/public/health/orders", query);
  },
  orderDetail(id) {
    return get("/api/public/health/orders/detail", { id });
  },
  cancelOrder(orderId, reason) {
    return post("/api/public/health/orders/cancel", { orderId, reason });
  },
  payParams(id) {
    return get("/api/public/health/orders/pay", { id });
  },
  verifyCodes() {
    return get("/api/public/health/verify-codes");
  },
  applyAftersale(data) {
    return post("/api/public/health/aftersale/apply", data);
  },
  reviewOrder(data) {
    return post("/api/public/health/orders/review", data);
  },

  // ---------------- 问诊
  consultRules() {
    return get("/api/public/health/consult/rules");
  },
  consults() {
    return get("/api/public/health/consults");
  },
  consultDetail(id) {
    return get("/api/public/health/consults/detail", { id });
  },
  consultAction(data) {
    return post("/api/public/health/consults/action", data);
  },
  consultSession(id) {
    return post("/api/public/health/consults/session", { id });
  },

  // ---------------- 推客
  promoterHit(code) {
    return post("/api/public/health/promoter/hit", { code });
  },
  promoterShare(page) {
    return get("/api/public/health/promoter/share", { page });
  },
  promoterCenter() {
    return get("/api/public/health/promoter/center");
  },
  promoterApply(data) {
    return post("/api/public/health/promoter/apply", data);
  },

  // ---------------- 医护工作台
  staffBind(phone, licenseNo) {
    return post("/api/public/health/staff/bind", { phone, licenseNo });
  },
  staffProfile() {
    return staffGet("/api/public/health/staff/profile");
  },
  staffWorkbench() {
    return staffGet("/api/public/health/staff/workbench");
  },
  staffPatients(query) {
    return staffGet("/api/public/health/staff/patients", query);
  },
  staffPatient(patientId) {
    return staffGet("/api/public/health/staff/patient", { patientId });
  },
  staffMetrics(patientId) {
    return staffGet("/api/public/health/staff/metrics", { patientId });
  },
  staffSaveMetric(data) {
    return staffPost("/api/public/health/staff/metrics/log", data);
  },
  staffFollowups(query) {
    return staffGet("/api/public/health/staff/followups", query);
  },
  staffFollowup(id) {
    return staffGet("/api/public/health/staff/followup", { id });
  },
  staffSaveFollowup(data) {
    return staffPost("/api/public/health/staff/followup/save", data);
  },
  staffConsults(query) {
    return staffGet("/api/public/health/staff/consults", query);
  },
  staffConsultAction(data) {
    return staffPost("/api/public/health/staff/consults/action", data);
  },
  staffPrescriptions(query) {
    return staffGet("/api/public/health/staff/prescriptions", query);
  },
  staffReviewPrescription(data) {
    return staffPost("/api/public/health/staff/prescriptions/review", data);
  },
  staffSchedule(query) {
    return staffGet("/api/public/health/staff/schedule", query);
  },
  staffBlockSlot(data) {
    return staffPost("/api/public/health/staff/slots/block", data);
  },
  staffVerify(code) {
    return staffPost("/api/public/health/staff/verify", { code });
  },
  staffIncome() {
    return staffGet("/api/public/health/staff/income");
  },
  staffSaveBankCard(data) {
    return staffPost("/api/public/health/staff/bank-cards/save", data);
  },
  staffApplyWithdrawal(data) {
    return staffPost("/api/public/health/staff/withdrawals/apply", data);
  },
  staffArticles(query) {
    return staffGet("/api/public/health/staff/articles", query);
  },
  staffArticle(id) {
    return staffGet("/api/public/health/staff/articles/detail", { id });
  },
  staffSaveArticle(data) {
    return staffPost("/api/public/health/staff/articles/save", data);
  },
  staffOfflineArticle(id) {
    return staffPost("/api/public/health/staff/articles/offline", { id });
  },

  // ---------------- 舌象分析（增值服务）
  tongueRecords(page, pageSize) {
    return get("/api/public/health/tongue/records", {
      page: page || 1,
      pageSize: pageSize || 10,
    });
  },
  tongueRecordDetail(id) {
    return get("/api/public/health/tongue/records/detail", { id });
  },
  /** 图片走 wx.uploadFile：multipart 不能走统一 JSON 请求出口。 */
  tongueAnalyze(filePath) {
    const base = session.getApiBase();
    if (!base) {
      return Promise.reject(new Error("未配置服务器地址，请让店主重新出包"));
    }
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: base + "/api/public/health/tongue/analyze",
        filePath: filePath,
        name: "file",
        formData: { shopCode: session.getShopCode() },
        header: { Authorization: "Bearer " + (session.getToken() || "") },
        timeout: 60000,
        success: function (res) {
          let body = {};
          try {
            body = JSON.parse(res.data || "{}");
          } catch (e) {
            body = {};
          }
          if (res.statusCode === 401) {
            session.clearToken();
            const expired = new Error("登录已过期，请重新进入小程序");
            expired.code = 401;
            reject(expired);
            return;
          }
          const code = typeof body.code === "number" ? body.code : 0;
          if (res.statusCode >= 400 || code !== 0) {
            reject(
              new Error(
                body.message || "舌象分析失败（" + res.statusCode + "）",
              ),
            );
            return;
          }
          resolve(code === 0 && body.data ? body.data : body);
        },
        fail: function (err) {
          reject(new Error((err && err.errMsg) || "上传失败，请检查网络"));
        },
      });
    });
  },

  // ---------------- AI 医护
  // 端上只存「哪位医护绑了哪个纯 AI 客服员工」与开关，人设/模型/资料范围都在 AI 客服那侧。
  staffAiStatus() {
    return staffGet("/api/public/health/staff/ai/status");
  },
  staffAiAgents() {
    return staffGet("/api/public/health/staff/ai/agents");
  },
  staffAiAsk(data) {
    return staffPost("/api/public/health/staff/ai/ask", data);
  },
  staffAiEnabled(data) {
    return staffPost("/api/public/health/staff/ai/enabled", data);
  },
  staffAiBinding(data) {
    return staffPost("/api/public/health/staff/ai/binding", data);
  },
};
