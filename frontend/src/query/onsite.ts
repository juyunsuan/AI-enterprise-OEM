"use client";
// 上门服务小程序工具的取数层：页签组件只认这里的钩子，不直接拼 URL、也不跨板块取数。
import { useBusinessMutation, useBusinessQuery } from "./business";
import { onsiteApi } from "@/api/onsite";

const MODULE = "onsite";
const REFRESH = [MODULE];

/** 所有资源都挂在具体店铺下，未选店（shopId<=0）时一律不发请求。 */
type Scope = { shopId: number };

type QueryOf<F> = F extends (...args: infer A) => unknown
  ? NonNullable<A[0]> extends { query?: infer Q }
    ? NonNullable<Q>
    : never
  : never;
/** 列表筛选类型 = 契约 query schema 去掉店铺与分页后的剩余字段。 */
type FilterOf<F> = Partial<Omit<QueryOf<F>, "shopId" | "page" | "pageSize">>;

const shopParam = (shopId: number) => ({ id: String(shopId) });

/** 统一走 REFRESH 失效，避免每个变更钩子重复声明同一串资源名。 */
function useOnsiteAction<TInput, TResult>(
  call: (input: TInput) => Promise<TResult>,
) {
  return useBusinessMutation((input: TInput) => call(input), REFRESH);
}

// ---------------------------------------------------------------- 店铺总览

export const useOnsiteOverview = (enabled = true) =>
  useBusinessQuery(
    MODULE,
    "overview",
    {},
    (signal) => onsiteApi.overview(undefined, { signal }),
    "all",
    enabled,
  );

export const useOnsiteShops = (enabled = true) =>
  useBusinessQuery(
    MODULE,
    "shop-list",
    {},
    (signal) => onsiteApi.shops(undefined, { signal }),
    "all",
    enabled,
  );

export const useOnsiteShop = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "shop-detail",
    { shopId },
    (signal) => onsiteApi.shopDetail({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteShopActions = () => ({
  createShop: useOnsiteAction(onsiteApi.createShop),
  updateShop: useOnsiteAction(onsiteApi.updateShop),
  closeShop: useOnsiteAction(onsiteApi.closeShop),
  setStatus: useOnsiteAction(onsiteApi.setStatus),
  saveTrade: useOnsiteAction(onsiteApi.saveTrade),
  saveTheme: useOnsiteAction(onsiteApi.saveTheme),
});

// ---------------------------------------------------------------- 微信凭据与代码包

export const useOnsiteWechat = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "wechat",
    { shopId },
    (signal) => onsiteApi.wechat({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteReleaseActions = () => ({
  saveWechat: useOnsiteAction(onsiteApi.saveWechat),
  testWechat: useOnsiteAction(onsiteApi.testWechat),
  qrcode: useOnsiteAction(onsiteApi.qrcode),
});

// ---------------------------------------------------------------- 服务目录

export const useOnsiteCategories = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "category-list",
    { shopId },
    (signal) => onsiteApi.categories({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteLabels = ({ shopId }: Scope, type = "all") =>
  useBusinessQuery(
    MODULE,
    "label-list",
    { shopId, type },
    (signal) =>
      onsiteApi.labels({ params: shopParam(shopId), query: { type } }, { signal }),
    "all",
    shopId > 0,
  );

export type OnsiteServiceFilter = FilterOf<typeof onsiteApi.services>;

export const useOnsiteServices = (
  { shopId }: Scope,
  filter: OnsiteServiceFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "service-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.services(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteService = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "service-detail",
    { shopId, id },
    (signal) =>
      onsiteApi.serviceDetail(
        { params: { id: String(shopId), serviceId: String(id) } },
        { signal },
      ),
    "all",
    shopId > 0 && id > 0,
  );

export const useOnsiteStaffPrices = ({ shopId }: Scope, serviceId: number) =>
  useBusinessQuery(
    MODULE,
    "staff-price",
    { shopId, serviceId },
    (signal) =>
      onsiteApi.staffPrices(
        { params: { id: String(shopId), serviceId: String(serviceId) } },
        { signal },
      ),
    "all",
    shopId > 0 && serviceId > 0,
  );

export const useOnsiteCatalogActions = () => ({
  saveCategory: useOnsiteAction(onsiteApi.saveCategory),
  removeCategory: useOnsiteAction(onsiteApi.removeCategory),
  saveService: useOnsiteAction(onsiteApi.saveService),
  removeService: useOnsiteAction(onsiteApi.removeService),
  setServiceStatus: useOnsiteAction(onsiteApi.setServiceStatus),
  copyService: useOnsiteAction(onsiteApi.copyService),
  saveStaffPrices: useOnsiteAction(onsiteApi.saveStaffPrices),
  saveLabel: useOnsiteAction(onsiteApi.saveLabel),
  removeLabel: useOnsiteAction(onsiteApi.removeLabel),
});

// ---------------------------------------------------------------- 技师与等级

export const useOnsiteStaffLevels = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "staff-level-list",
    { shopId },
    (signal) => onsiteApi.staffLevels({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export type OnsiteStaffFilter = FilterOf<typeof onsiteApi.staff>;

export const useOnsiteStaff = (
  { shopId }: Scope,
  filter: OnsiteStaffFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "staff-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.staff(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteStaffDetail = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "staff-detail",
    { shopId, id },
    (signal) =>
      onsiteApi.staffDetail(
        { params: { id: String(shopId), staffId: String(id) } },
        { signal },
      ),
    "all",
    shopId > 0 && id > 0,
  );

/** 休息日：day 传 YYYY-MM-DD 只取当天，空串取全部未来排班。 */
export const useOnsiteStaffRest = ({ shopId }: Scope, staffId: number, day = "") =>
  useBusinessQuery(
    MODULE,
    "staff-rest",
    { shopId, staffId, day },
    (signal) =>
      onsiteApi.staffRest(
        { params: { id: String(shopId), staffId: String(staffId) }, query: { day } },
        { signal },
      ),
    "all",
    shopId > 0 && staffId > 0,
  );

export const useOnsiteStaffWorkLogs = ({ shopId }: Scope, staffId: number, days = 14) =>
  useBusinessQuery(
    MODULE,
    "staff-work-log",
    { shopId, staffId, days },
    (signal) =>
      onsiteApi.staffWorkLogs(
        {
          params: { id: String(shopId), staffId: String(staffId) },
          query: { days: String(days) },
        },
        { signal },
      ),
    "all",
    shopId > 0 && staffId > 0,
  );

export const useOnsiteStaffActions = () => ({
  saveStaff: useOnsiteAction(onsiteApi.saveStaff),
  removeStaff: useOnsiteAction(onsiteApi.removeStaff),
  setStaffStatus: useOnsiteAction(onsiteApi.setStaffStatus),
  reviewStaffProfile: useOnsiteAction(onsiteApi.reviewStaffProfile),
  saveStaffLevel: useOnsiteAction(onsiteApi.saveStaffLevel),
  removeStaffLevel: useOnsiteAction(onsiteApi.removeStaffLevel),
  saveStaffRest: useOnsiteAction(onsiteApi.saveStaffRest),
  removeStaffRest: useOnsiteAction(onsiteApi.removeStaffRest),
});

// ---------------------------------------------------------------- 排期看板

export type OnsiteTimelineQuery = NonNullable<
  Parameters<typeof onsiteApi.timeline>[0]
>["query"];

export const useOnsiteTimeline = (
  { shopId }: Scope,
  query: OnsiteTimelineQuery = {},
) =>
  useBusinessQuery(
    MODULE,
    "timeline",
    { shopId, ...query },
    (signal) =>
      onsiteApi.timeline({ params: shopParam(shopId), query }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteScheduleDays = (
  { shopId }: Scope,
  query: NonNullable<Parameters<typeof onsiteApi.scheduleDays>[0]>["query"] = {},
) =>
  useBusinessQuery(
    MODULE,
    "schedule-days",
    { shopId, ...query },
    (signal) =>
      onsiteApi.scheduleDays({ params: shopParam(shopId), query }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 城市与车费

export const useOnsiteCities = ({ shopId }: Scope, keyword = "") =>
  useBusinessQuery(
    MODULE,
    "city-list",
    { shopId, keyword },
    (signal) =>
      onsiteApi.cities({ params: shopParam(shopId), query: { keyword } }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteFeeRules = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "fee-rule-list",
    { shopId },
    (signal) => onsiteApi.feeRules({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteCityActions = () => ({
  saveCity: useOnsiteAction(onsiteApi.saveCity),
  removeCity: useOnsiteAction(onsiteApi.removeCity),
  saveFeeRule: useOnsiteAction(onsiteApi.saveFeeRule),
  removeFeeRule: useOnsiteAction(onsiteApi.removeFeeRule),
  estimateFee: useOnsiteAction(onsiteApi.estimateFee),
});

// ---------------------------------------------------------------- 内容与留资

export const useOnsiteBanners = ({ shopId }: Scope, position = "all") =>
  useBusinessQuery(
    MODULE,
    "banner-list",
    { shopId, position },
    (signal) =>
      onsiteApi.banners(
        { params: shopParam(shopId), query: { position } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export type OnsiteArticleFilter = FilterOf<typeof onsiteApi.articles>;

export const useOnsiteArticles = (
  { shopId }: Scope,
  filter: OnsiteArticleFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "article-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.articles(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteFormFields = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "form-field-list",
    { shopId },
    (signal) => onsiteApi.formFields({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export type OnsiteSubmissionFilter = FilterOf<typeof onsiteApi.submissions>;

export const useOnsiteSubmissions = (
  { shopId }: Scope,
  filter: OnsiteSubmissionFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "submission-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.submissions(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteSubmission = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "submission-detail",
    { shopId, id },
    (signal) =>
      onsiteApi.submissionDetail(
        { params: { id: String(shopId), submissionId: String(id) } },
        { signal },
      ),
    "all",
    shopId > 0 && id > 0,
  );

/** 手机号中间四位留痕：只有被解除隐藏的挡板行才带完整号码，列表默认不请求。 */
export const useOnsiteShields = ({ shopId }: Scope, staffId = "") =>
  useBusinessQuery(
    MODULE,
    "shield-list",
    { shopId, staffId },
    (signal) =>
      onsiteApi.shields({ params: shopParam(shopId), query: { staffId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteContentActions = () => ({
  saveBanner: useOnsiteAction(onsiteApi.saveBanner),
  removeBanner: useOnsiteAction(onsiteApi.removeBanner),
  saveArticle: useOnsiteAction(onsiteApi.saveArticle),
  removeArticle: useOnsiteAction(onsiteApi.removeArticle),
  saveFormField: useOnsiteAction(onsiteApi.saveFormField),
  removeFormField: useOnsiteAction(onsiteApi.removeFormField),
  auditSubmission: useOnsiteAction(onsiteApi.auditSubmission),
  removeShield: useOnsiteAction(onsiteApi.removeShield),
});

// ---------------------------------------------------------------- 订单与履约

export type OnsiteOrderFilter = FilterOf<typeof onsiteApi.orders>;

export const useOnsiteOrders = (
  { shopId }: Scope,
  filter: OnsiteOrderFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "order-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.orders(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteOrder = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "order-detail",
    { shopId, id },
    (signal) =>
      onsiteApi.orderDetail(
        { params: { id: String(shopId), orderId: String(id) } },
        { signal },
      ),
    "all",
    shopId > 0 && id > 0,
  );

export const useOnsiteOrderActions = () => ({
  createOrder: useOnsiteAction(onsiteApi.createOrder),
  dispatchOrder: useOnsiteAction(onsiteApi.dispatchOrder),
  advanceOrder: useOnsiteAction(onsiteApi.advanceOrder),
  orderPayParams: useOnsiteAction(onsiteApi.orderPayParams),
  orderPayOffline: useOnsiteAction(onsiteApi.orderPayOffline),
  orderSign: useOnsiteAction(onsiteApi.orderSign),
  orderAddon: useOnsiteAction(onsiteApi.orderAddon),
  cancelOrder: useOnsiteAction(onsiteApi.cancelOrder),
  orderRemark: useOnsiteAction(onsiteApi.orderRemark),
});

// ---------------------------------------------------------------- 售后

export type OnsiteRefundFilter = FilterOf<typeof onsiteApi.refunds>;

export const useOnsiteRefunds = (
  { shopId }: Scope,
  filter: OnsiteRefundFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "refund-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.refunds(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteRefund = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "refund-detail",
    { shopId, id },
    (signal) =>
      onsiteApi.refundDetail(
        { params: { id: String(shopId), refundId: String(id) } },
        { signal },
      ),
    "all",
    shopId > 0 && id > 0,
  );

export const useOnsiteRefundActions = () => ({
  refundQuote: useOnsiteAction(onsiteApi.refundQuote),
  applyRefund: useOnsiteAction(onsiteApi.applyRefund),
  agreeRefund: useOnsiteAction(onsiteApi.agreeRefund),
  rejectRefund: useOnsiteAction(onsiteApi.rejectRefund),
});

// ---------------------------------------------------------------- 评价 / 申诉 / 反馈

export type OnsiteReviewFilter = FilterOf<typeof onsiteApi.reviews>;

export const useOnsiteReviews = (
  { shopId }: Scope,
  filter: OnsiteReviewFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "review-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.reviews(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export type OnsiteAppealFilter = FilterOf<typeof onsiteApi.appeals>;

export const useOnsiteAppeals = (
  { shopId }: Scope,
  filter: OnsiteAppealFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "appeal-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.appeals(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export type OnsiteFeedbackFilter = FilterOf<typeof onsiteApi.feedbacks>;

export const useOnsiteFeedbacks = (
  { shopId }: Scope,
  filter: OnsiteFeedbackFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "feedback-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.feedbacks(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteReviewActions = () => ({
  replyReview: useOnsiteAction(onsiteApi.replyReview),
  setReviewStatus: useOnsiteAction(onsiteApi.setReviewStatus),
  handleAppeal: useOnsiteAction(onsiteApi.handleAppeal),
  handleFeedback: useOnsiteAction(onsiteApi.handleFeedback),
});

// ---------------------------------------------------------------- 顾客

export type OnsiteCustomerFilter = FilterOf<typeof onsiteApi.customers>;

export const useOnsiteCustomers = (
  { shopId }: Scope,
  filter: OnsiteCustomerFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "customer-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.customers(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteCustomerActions = () => ({
  setCustomerStatus: useOnsiteAction(onsiteApi.setCustomerStatus),
});

// ---------------------------------------------------------------- 安全（一键报警）

export type OnsiteAlertFilter = FilterOf<typeof onsiteApi.alerts>;

export const useOnsiteAlerts = (
  { shopId }: Scope,
  filter: OnsiteAlertFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "alert-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.alerts(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteAlertConfig = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "alert-config",
    { shopId },
    (signal) => onsiteApi.alertConfig({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteAlertActions = () => ({
  handleAlert: useOnsiteAction(onsiteApi.handleAlert),
  raiseAlert: useOnsiteAction(onsiteApi.raiseAlert),
  saveAlertConfig: useOnsiteAction(onsiteApi.saveAlertConfig),
});

// ---------------------------------------------------------------- 客服与私域

export const useOnsiteServiceConfig = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "service-config",
    { shopId },
    (signal) => onsiteApi.serviceConfig({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteServiceOptions = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "service-options",
    { shopId },
    (signal) => onsiteApi.serviceOptions({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteServiceConfigActions = () => ({
  saveServiceConfig: useOnsiteAction(onsiteApi.saveServiceConfig),
});

// ---------------------------------------------------------------- P2 营销：券 / 活动 / 邀请

export type OnsiteCouponFilter = FilterOf<typeof onsiteApi.coupons>;
export type OnsiteActivityFilter = FilterOf<typeof onsiteApi.activities>;

export const useOnsiteCoupons = (
  { shopId }: Scope,
  filter: OnsiteCouponFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "coupon-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.coupons(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteCouponTickets = (
  { shopId }: Scope,
  couponId: number,
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "coupon-tickets",
    { shopId, couponId, page, pageSize },
    (signal) =>
      onsiteApi.couponTickets(
        {
          params: { id: String(shopId), couponId: String(couponId) },
          query: { page, pageSize },
        },
        { signal },
      ),
    "all",
    shopId > 0 && couponId > 0,
  );

export const useOnsiteCouponActions = () => ({
  saveCoupon: useOnsiteAction(onsiteApi.saveCoupon),
  removeCoupon: useOnsiteAction(onsiteApi.removeCoupon),
  setCouponStatus: useOnsiteAction(onsiteApi.setCouponStatus),
  issueCoupon: useOnsiteAction(onsiteApi.issueCoupon),
});

export const useOnsiteActivities = (
  { shopId }: Scope,
  filter: OnsiteActivityFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "activity-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.activities(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteActivityRecords = (
  { shopId }: Scope,
  activityId: number,
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "activity-records",
    { shopId, activityId, page, pageSize },
    (signal) =>
      onsiteApi.activityRecords(
        {
          params: { id: String(shopId), activityId: String(activityId) },
          query: { page, pageSize },
        },
        { signal },
      ),
    "all",
    shopId > 0 && activityId > 0,
  );

export const useOnsiteActivityActions = () => ({
  saveActivity: useOnsiteAction(onsiteApi.saveActivity),
  setActivityStatus: useOnsiteAction(onsiteApi.setActivityStatus),
});

export const useOnsiteInvites = ({ shopId }: Scope, page = 1, pageSize = 20) =>
  useBusinessQuery(
    MODULE,
    "invite-list",
    { shopId, page, pageSize },
    (signal) =>
      onsiteApi.invites(
        { params: shopParam(shopId), query: { page, pageSize } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- P2 财务

export const useOnsiteIncomeOverview = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "income-overview",
    { shopId },
    (signal) => onsiteApi.incomeOverview({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export const useOnsiteCommissionRules = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "commission-rules",
    { shopId },
    (signal) => onsiteApi.commissionRules({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export type OnsiteCommissionFilter = FilterOf<typeof onsiteApi.orderCommissions>;

export const useOnsiteOrderCommissions = (
  { shopId }: Scope,
  filter: OnsiteCommissionFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "order-commissions",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.orderCommissions(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteCommissionActions = () => ({
  saveRule: useOnsiteAction(onsiteApi.saveCommissionRule),
});

export const useOnsiteBalanceCards = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "balance-cards",
    { shopId },
    (signal) => onsiteApi.balanceCards({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0,
  );

export type OnsiteRechargeFilter = FilterOf<typeof onsiteApi.rechargeOrders>;

export const useOnsiteRechargeOrders = (
  { shopId }: Scope,
  filter: OnsiteRechargeFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "recharge-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.rechargeOrders(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteBalanceFlows = (
  { shopId }: Scope,
  page = 1,
  pageSize = 20,
  customerId = 0,
) =>
  useBusinessQuery(
    MODULE,
    "balance-flows",
    { shopId, page, pageSize, customerId },
    (signal) =>
      onsiteApi.balanceFlows(
        { params: shopParam(shopId), query: { page, pageSize, customerId } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export type OnsiteSettlementFilter = FilterOf<typeof onsiteApi.settlements>;
export type OnsiteWithdrawalFilter = FilterOf<typeof onsiteApi.withdrawals>;

export const useOnsiteSettlements = (
  { shopId }: Scope,
  filter: OnsiteSettlementFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "settlement-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.settlements(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteWithdrawals = (
  { shopId }: Scope,
  filter: OnsiteWithdrawalFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "withdrawal-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.withdrawals(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0,
  );

export const useOnsiteWalletActions = () => ({
  saveBalanceCard: useOnsiteAction(onsiteApi.saveBalanceCard),
  removeBalanceCard: useOnsiteAction(onsiteApi.removeBalanceCard),
  confirmRecharge: useOnsiteAction(onsiteApi.confirmRecharge),
  adjustBalance: useOnsiteAction(onsiteApi.adjustBalance),
  adjustPoints: useOnsiteAction(onsiteApi.adjustPoints),
  createSettlement: useOnsiteAction(onsiteApi.createSettlement),
  paySettlement: useOnsiteAction(onsiteApi.paySettlement),
  handleWithdrawal: useOnsiteAction(onsiteApi.handleWithdrawal),
});

// ---------------------------------------------------------------- P2 代理体系

export type OnsiteAgentFilter = FilterOf<typeof onsiteApi.agents>;

export const useOnsiteAgents = (
  { shopId }: Scope,
  filter: OnsiteAgentFilter = {},
  enabled = true,
) =>
  useBusinessQuery(
    MODULE,
    "agent-list",
    { shopId, ...filter },
    (signal) =>
      onsiteApi.agents(
        { params: shopParam(shopId), query: { ...filter } },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsiteSalesmen = ({ shopId }: Scope, enabled = true) =>
  useBusinessQuery(
    MODULE,
    "salesman-list",
    { shopId },
    (signal) =>
      onsiteApi.salesmen(
        { params: shopParam(shopId), query: {} },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsiteChannelCategories = ({ shopId }: Scope, enabled = true) =>
  useBusinessQuery(
    MODULE,
    "channel-category-list",
    { shopId },
    (signal) =>
      onsiteApi.channelCategories({ params: shopParam(shopId) }, { signal }),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsiteChannels = ({ shopId }: Scope, enabled = true) =>
  useBusinessQuery(
    MODULE,
    "channel-list",
    { shopId },
    (signal) =>
      onsiteApi.channels(
        { params: shopParam(shopId), query: {} },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsitePartners = ({ shopId }: Scope, enabled = true) =>
  useBusinessQuery(
    MODULE,
    "partner-list",
    { shopId },
    (signal) =>
      onsiteApi.partners(
        { params: shopParam(shopId), query: {} },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export type OnsiteDistributorFilter = FilterOf<typeof onsiteApi.distributors>;

export const useOnsiteDistributors = (
  { shopId }: Scope,
  filter: OnsiteDistributorFilter = {},
  page = 1,
  pageSize = 20,
  enabled = true,
) =>
  useBusinessQuery(
    MODULE,
    "distributor-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      onsiteApi.distributors(
        { params: shopParam(shopId), query: { page, pageSize, ...filter } },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsiteRelations = (
  { shopId }: Scope,
  page = 1,
  pageSize = 20,
  enabled = true,
) =>
  useBusinessQuery(
    MODULE,
    "relation-list",
    { shopId, page, pageSize },
    (signal) =>
      onsiteApi.relations(
        { params: shopParam(shopId), query: { page, pageSize } },
        { signal },
      ),
    "all",
    shopId > 0 && enabled,
  );

export const useOnsiteAgentActions = () => ({
  saveAgent: useOnsiteAction(onsiteApi.saveAgent),
  setAgentStatus: useOnsiteAction(onsiteApi.setAgentStatus),
  saveSalesman: useOnsiteAction(onsiteApi.saveSalesman),
  setSalesmanStatus: useOnsiteAction(onsiteApi.setSalesmanStatus),
  saveChannelCategory: useOnsiteAction(onsiteApi.saveChannelCategory),
  removeChannelCategory: useOnsiteAction(onsiteApi.removeChannelCategory),
  saveChannel: useOnsiteAction(onsiteApi.saveChannel),
  setChannelStatus: useOnsiteAction(onsiteApi.setChannelStatus),
  savePartner: useOnsiteAction(onsiteApi.savePartner),
  reviewDistributor: useOnsiteAction(onsiteApi.reviewDistributor),
  bindRelation: useOnsiteAction(onsiteApi.bindRelation),
});
