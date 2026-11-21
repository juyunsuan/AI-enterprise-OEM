import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 上门服务小程序工具（工作台 → 建站管理）店主侧调用。
 *
 * C 端顾客接口在 `/api/public/onsite/*`，由生成的代码包直连、走独立顾客令牌，不经这里；
 * 平台侧台账与参数在 `onsiteAdminApi`（`/enterprise/admin/onsite/*`）。
 */
export const onsiteApi = {
  overview: endpoint(endpoints.Onsite_overview),
  shops: endpoint(endpoints.Onsite_shops),
  createShop: endpoint(endpoints.Onsite_createShop),
  shopDetail: endpoint(endpoints.Onsite_shopDetail),
  updateShop: endpoint(endpoints.Onsite_updateShop),
  closeShop: endpoint(endpoints.Onsite_closeShop),
  saveTrade: endpoint(endpoints.Onsite_saveTrade),
  saveTheme: endpoint(endpoints.Onsite_saveTheme),
  setStatus: endpoint(endpoints.Onsite_setStatus),

  wechat: endpoint(endpoints.Onsite_wechat),
  saveWechat: endpoint(endpoints.Onsite_saveWechat),
  testWechat: endpoint(endpoints.Onsite_testWechat),

  qrcode: endpoint(endpoints.Onsite_qrcode),
  poster: endpoint(endpoints.Onsite_poster),

  // ---------- 服务目录 ----------
  categories: endpoint(endpoints.Onsite_categories),
  saveCategory: endpoint(endpoints.Onsite_saveCategory),
  removeCategory: endpoint(endpoints.Onsite_removeCategory),
  services: endpoint(endpoints.Onsite_services),
  serviceDetail: endpoint(endpoints.Onsite_serviceDetail),
  saveService: endpoint(endpoints.Onsite_saveService),
  removeService: endpoint(endpoints.Onsite_removeService),
  setServiceStatus: endpoint(endpoints.Onsite_setServiceStatus),
  copyService: endpoint(endpoints.Onsite_copyService),
  staffPrices: endpoint(endpoints.Onsite_staffPrices),
  saveStaffPrices: endpoint(endpoints.Onsite_saveStaffPrices),
  labels: endpoint(endpoints.Onsite_labels),
  saveLabel: endpoint(endpoints.Onsite_saveLabel),
  removeLabel: endpoint(endpoints.Onsite_removeLabel),

  // ---------- 技师与等级 ----------
  staff: endpoint(endpoints.Onsite_staff),
  staffDetail: endpoint(endpoints.Onsite_staffDetail),
  saveStaff: endpoint(endpoints.Onsite_saveStaff),
  removeStaff: endpoint(endpoints.Onsite_removeStaff),
  setStaffStatus: endpoint(endpoints.Onsite_setStaffStatus),
  reviewStaffProfile: endpoint(endpoints.Onsite_reviewStaffProfile),
  staffLevels: endpoint(endpoints.Onsite_staffLevels),
  saveStaffLevel: endpoint(endpoints.Onsite_saveStaffLevel),
  removeStaffLevel: endpoint(endpoints.Onsite_removeStaffLevel),
  staffRest: endpoint(endpoints.Onsite_staffRest),
  saveStaffRest: endpoint(endpoints.Onsite_saveStaffRest),
  removeStaffRest: endpoint(endpoints.Onsite_removeStaffRest),
  staffWorkLogs: endpoint(endpoints.Onsite_staffWorkLogs),

  // ---------- 排期看板 ----------
  timeline: endpoint(endpoints.Onsite_timeline),
  scheduleDays: endpoint(endpoints.Onsite_scheduleDays),

  // ---------- 城市与车费 ----------
  cities: endpoint(endpoints.Onsite_cities),
  saveCity: endpoint(endpoints.Onsite_saveCity),
  removeCity: endpoint(endpoints.Onsite_removeCity),
  feeRules: endpoint(endpoints.Onsite_feeRules),
  saveFeeRule: endpoint(endpoints.Onsite_saveFeeRule),
  removeFeeRule: endpoint(endpoints.Onsite_removeFeeRule),
  estimateFee: endpoint(endpoints.Onsite_estimateFee),

  // ---------- 内容与留资 ----------
  banners: endpoint(endpoints.Onsite_banners),
  saveBanner: endpoint(endpoints.Onsite_saveBanner),
  removeBanner: endpoint(endpoints.Onsite_removeBanner),
  articles: endpoint(endpoints.Onsite_articles),
  saveArticle: endpoint(endpoints.Onsite_saveArticle),
  removeArticle: endpoint(endpoints.Onsite_removeArticle),
  formFields: endpoint(endpoints.Onsite_formFields),
  saveFormField: endpoint(endpoints.Onsite_saveFormField),
  removeFormField: endpoint(endpoints.Onsite_removeFormField),
  submissions: endpoint(endpoints.Onsite_submissions),
  submissionDetail: endpoint(endpoints.Onsite_submissionDetail),
  auditSubmission: endpoint(endpoints.Onsite_auditSubmission),
  shields: endpoint(endpoints.Onsite_shields),
  removeShield: endpoint(endpoints.Onsite_removeShield),

  // ---------- 订单与履约 ----------
  orders: endpoint(endpoints.Onsite_orders),
  orderDetail: endpoint(endpoints.Onsite_orderDetail),
  createOrder: endpoint(endpoints.Onsite_createOrder),
  dispatchOrder: endpoint(endpoints.Onsite_dispatchOrder),
  advanceOrder: endpoint(endpoints.Onsite_advanceOrder),
  orderPayParams: endpoint(endpoints.Onsite_orderPayParams),
  orderPayOffline: endpoint(endpoints.Onsite_orderPayOffline),
  orderSign: endpoint(endpoints.Onsite_orderSign),
  orderAddon: endpoint(endpoints.Onsite_orderAddon),
  cancelOrder: endpoint(endpoints.Onsite_cancelOrder),
  orderRemark: endpoint(endpoints.Onsite_orderRemark),

  // ---------- 售后 ----------
  refunds: endpoint(endpoints.Onsite_refunds),
  refundDetail: endpoint(endpoints.Onsite_refundDetail),
  refundQuote: endpoint(endpoints.Onsite_refundQuote),
  applyRefund: endpoint(endpoints.Onsite_applyRefund),
  agreeRefund: endpoint(endpoints.Onsite_agreeRefund),
  rejectRefund: endpoint(endpoints.Onsite_rejectRefund),

  // ---------- 评价 / 申诉 / 反馈 ----------
  reviews: endpoint(endpoints.Onsite_reviews),
  replyReview: endpoint(endpoints.Onsite_replyReview),
  setReviewStatus: endpoint(endpoints.Onsite_setReviewStatus),
  appeals: endpoint(endpoints.Onsite_appeals),
  handleAppeal: endpoint(endpoints.Onsite_handleAppeal),
  feedbacks: endpoint(endpoints.Onsite_feedbacks),
  handleFeedback: endpoint(endpoints.Onsite_handleFeedback),

  // ---------- 顾客 ----------
  customers: endpoint(endpoints.Onsite_customers),
  setCustomerStatus: endpoint(endpoints.Onsite_setCustomerStatus),

  // ---------- 安全（一键报警）----------
  alerts: endpoint(endpoints.Onsite_alerts),
  handleAlert: endpoint(endpoints.Onsite_handleAlert),
  raiseAlert: endpoint(endpoints.Onsite_raiseAlert),
  alertConfig: endpoint(endpoints.Onsite_alertConfig),
  saveAlertConfig: endpoint(endpoints.Onsite_saveAlertConfig),

  // ---------- 客服与私域（AI 客服站点 / 企微 SCRM 活码，两条链路互不依赖）----------
  serviceConfig: endpoint(endpoints.Onsite_serviceConfig),
  saveServiceConfig: endpoint(endpoints.Onsite_saveServiceConfig),
  serviceOptions: endpoint(endpoints.Onsite_serviceOptions),

  // ---------- P2 营销：券 / 活动 / 邀请 ----------
  coupons: endpoint(endpoints.Onsite_coupons),
  saveCoupon: endpoint(endpoints.Onsite_saveCoupon),
  removeCoupon: endpoint(endpoints.Onsite_removeCoupon),
  setCouponStatus: endpoint(endpoints.Onsite_setCouponStatus),
  issueCoupon: endpoint(endpoints.Onsite_issueCoupon),
  couponTickets: endpoint(endpoints.Onsite_couponTickets),
  activities: endpoint(endpoints.Onsite_activities),
  saveActivity: endpoint(endpoints.Onsite_saveActivity),
  setActivityStatus: endpoint(endpoints.Onsite_setActivityStatus),
  activityRecords: endpoint(endpoints.Onsite_activityRecords),
  invites: endpoint(endpoints.Onsite_invites),

  // ---------- P2 财务：分账 / 结算 / 提现 / 余额 ----------
  incomeOverview: endpoint(endpoints.Onsite_incomeOverview),
  commissionRules: endpoint(endpoints.Onsite_commissionRules),
  saveCommissionRule: endpoint(endpoints.Onsite_saveCommissionRule),
  orderCommissions: endpoint(endpoints.Onsite_orderCommissions),
  balanceCards: endpoint(endpoints.Onsite_balanceCards),
  saveBalanceCard: endpoint(endpoints.Onsite_saveBalanceCard),
  removeBalanceCard: endpoint(endpoints.Onsite_removeBalanceCard),
  rechargeOrders: endpoint(endpoints.Onsite_rechargeOrders),
  confirmRecharge: endpoint(endpoints.Onsite_confirmRecharge),
  balanceFlows: endpoint(endpoints.Onsite_balanceFlows),
  adjustBalance: endpoint(endpoints.Onsite_adjustBalance),
  adjustPoints: endpoint(endpoints.Onsite_adjustPoints),
  settlements: endpoint(endpoints.Onsite_settlements),
  createSettlement: endpoint(endpoints.Onsite_createSettlement),
  paySettlement: endpoint(endpoints.Onsite_paySettlement),
  withdrawals: endpoint(endpoints.Onsite_withdrawals),
  handleWithdrawal: endpoint(endpoints.Onsite_handleWithdrawal),

  // ---------- P2 代理 / 业务员 / 渠道 / 合伙人 / 分销商 ----------
  agents: endpoint(endpoints.Onsite_agents),
  saveAgent: endpoint(endpoints.Onsite_saveAgent),
  setAgentStatus: endpoint(endpoints.Onsite_setAgentStatus),
  salesmen: endpoint(endpoints.Onsite_salesmen),
  saveSalesman: endpoint(endpoints.Onsite_saveSalesman),
  setSalesmanStatus: endpoint(endpoints.Onsite_setSalesmanStatus),
  channelCategories: endpoint(endpoints.Onsite_channelCategories),
  saveChannelCategory: endpoint(endpoints.Onsite_saveChannelCategory),
  removeChannelCategory: endpoint(endpoints.Onsite_removeChannelCategory),
  channels: endpoint(endpoints.Onsite_channels),
  saveChannel: endpoint(endpoints.Onsite_saveChannel),
  setChannelStatus: endpoint(endpoints.Onsite_setChannelStatus),
  partners: endpoint(endpoints.Onsite_partners),
  savePartner: endpoint(endpoints.Onsite_savePartner),
  distributors: endpoint(endpoints.Onsite_distributors),
  reviewDistributor: endpoint(endpoints.Onsite_reviewDistributor),
  relations: endpoint(endpoints.Onsite_relations),
  bindRelation: endpoint(endpoints.Onsite_bindRelation),
};

export const onsiteAdminApi = {
  shops: endpoint(endpoints.OnsiteAdmin_shops),
  suspendShop: endpoint(endpoints.OnsiteAdmin_suspendShop),
  resumeShop: endpoint(endpoints.OnsiteAdmin_resumeShop),
  settings: endpoint(endpoints.OnsiteAdmin_settings),
  saveSettings: endpoint(endpoints.OnsiteAdmin_saveSettings),
};
