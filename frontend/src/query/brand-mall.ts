"use client";
import { brandMallApi, brandMallAdminApi } from "@/api/brand-mall";
import { useBusinessMutation, useBusinessQueries, useBusinessQuery } from "./business";

/**
 * 电商小程序工具的取数与失效。
 *
 * 店铺是多租户边界：所有店维度查询都把 `shopId` 放进 queryKey，
 * 切店时自然重新取数，不会把上一家的商品/订单留在缓存里。
 * 写操作统一失效 `brand` 模块：店铺计数、看板、列表三者互相影响
 * （上架商品改 productCount，发货改 pendingShipCount），只刷一张表会留下旧徽标。
 *
 * 筛选参数类型一律从契约的 query schema 反推（`FilterOf<typeof brandMallApi.xxx>`），
 * 后端加枚举值时这里直接报类型错，不会悄悄传一个接口不认的值。
 */
const MODULE = "brand";
const ADMIN_MODULE = "brand-admin";
const REFRESH = [MODULE];
const ADMIN_REFRESH = [ADMIN_MODULE, MODULE];

type Scope = { shopId: number };
type QueryOf<F> = F extends (...args: infer A) => unknown
  ? NonNullable<A[0]> extends { query?: infer Q }
    ? NonNullable<Q>
    : never
  : never;
/** 列表筛选类型 = 契约 query schema 去掉店铺与分页后的剩余字段。 */
type FilterOf<F> = Partial<Omit<QueryOf<F>, "shopId" | "page" | "pageSize">>;

// ---------------------------------------------------------------- 元信息与店铺

export const useBrandMeta = () =>
  useBusinessQuery(MODULE, "meta", {}, (signal) =>
    brandMallApi.meta({}, { signal }),
  );

export const useBrandShops = () =>
  useBusinessQuery(MODULE, "shops", {}, (signal) =>
    brandMallApi.shops({}, { signal }),
  );

export const useBrandShopDetail = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "shop-detail",
    { shopId },
    (signal) => brandMallApi.shopDetail({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 多店聚合

/**
 * 总览页要看账号下每一家店的自检清单：一家店一个查询、各自成功或失败，
 * 某一家读挂了不把整页拖成空白（配额也就几家，不值得后端再加聚合口）。
 */
export const useBrandShopDetails = (shopIds: number[]) =>
  useBusinessQueries(
    MODULE,
    shopIds.map((shopId) => ({
      resource: "shop-detail",
      params: { shopId },
      load: (signal: AbortSignal) =>
        brandMallApi.shopDetail({ query: { shopId } }, { signal }),
    })),
  );

// ---------------------------------------------------------------- 商品域

export const useBrandCategories = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "category-list",
    { shopId },
    (signal) => brandMallApi.categoryList({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export type BrandProductFilter = FilterOf<typeof brandMallApi.productList>;

export const useBrandProducts = (
  { shopId }: Scope,
  filter: BrandProductFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "product-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.productList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

/** 商品编辑抽屉取详情：id<=0 表示新建，不发起请求。 */
export const useBrandProduct = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "product-detail",
    { shopId, id },
    (signal) => brandMallApi.productDetail({ query: { shopId, id } }, { signal }),
    "all",
    shopId > 0 && id > 0,
  );

export type BrandReviewFilter = FilterOf<typeof brandMallApi.reviewList>;

export const useBrandReviews = (
  { shopId }: Scope,
  filter: BrandReviewFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "review-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.reviewList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 顾客

export type BrandCustomerFilter = FilterOf<typeof brandMallApi.customerList>;

export const useBrandCustomers = (
  { shopId }: Scope,
  filter: BrandCustomerFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "customer-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.customerList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandCustomer = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "customer-detail",
    { shopId, id },
    (signal) => brandMallApi.customerDetail({ query: { shopId, id } }, { signal }),
    "all",
    shopId > 0 && id > 0,
  );

/**
 * 顾客的企微画像：未开启 SCRM 也返回降级对象（bound=false + 原因），
 * 所以这里不按开关做条件请求，详情页永远有值可渲染。
 */
export const useBrandCustomerScrm = ({ shopId }: Scope, customerId: number) =>
  useBusinessQuery(
    MODULE,
    "customer-scrm",
    { shopId, customerId },
    (signal) => brandMallApi.customerScrm({ query: { shopId, customerId } }, { signal }),
    "all",
    shopId > 0 && customerId > 0,
  );

// ---------------------------------------------------------------- 企业微信 SCRM 集成

export const useBrandScrmState = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "scrm-state",
    { shopId },
    (signal) => brandMallApi.scrmState({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 订单与售后

export type BrandOrderFilter = FilterOf<typeof brandMallApi.orderList>;

export const useBrandOrders = (
  { shopId }: Scope,
  filter: BrandOrderFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "order-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.orderList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandOrder = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "order-detail",
    { shopId, id },
    (signal) => brandMallApi.orderDetail({ query: { shopId, id } }, { signal }),
    "all",
    shopId > 0 && id > 0,
  );

export type BrandRefundFilter = FilterOf<typeof brandMallApi.refundList>;

export const useBrandRefunds = (
  { shopId }: Scope,
  filter: BrandRefundFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "refund-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.refundList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandRefund = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "refund-detail",
    { shopId, id },
    (signal) => brandMallApi.refundDetail({ query: { shopId, id } }, { signal }),
    "all",
    shopId > 0 && id > 0,
  );

// ---------------------------------------------------------------- 运费模板、快递与优惠券

export const useBrandShipping = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "shipping-list",
    { shopId },
    (signal) => brandMallApi.shippingList({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandExpress = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "express-list",
    { shopId },
    (signal) => brandMallApi.expressList({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export type BrandCouponFilter = FilterOf<typeof brandMallApi.couponList>;

export const useBrandCoupons = (
  { shopId }: Scope,
  filter: BrandCouponFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "coupon-list",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.couponList({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

export type BrandTicketFilter = FilterOf<typeof brandMallApi.couponTickets>;

export const useBrandCouponTickets = (
  { shopId }: Scope,
  filter: BrandTicketFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    MODULE,
    "coupon-tickets",
    { shopId, ...filter, page, pageSize },
    (signal) =>
      brandMallApi.couponTickets({ query: { shopId, page, pageSize, ...filter } }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 装修

export const useBrandDiyWidgets = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "diy-widgets",
    { shopId },
    (signal) => brandMallApi.diyWidgets({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandDiyPages = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "diy-list",
    { shopId },
    (signal) => brandMallApi.diyList({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandDiyPage = ({ shopId }: Scope, id: number) =>
  useBusinessQuery(
    MODULE,
    "diy-detail",
    { shopId, id },
    (signal) => brandMallApi.diyDetail({ query: { shopId, id } }, { signal }),
    "all",
    shopId > 0 && id > 0,
  );

// ---------------------------------------------------------------- 发布与看板

export const useBrandApp = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "app-detail",
    { shopId },
    (signal) => brandMallApi.appDetail({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandStatOverview = ({ shopId }: Scope) =>
  useBusinessQuery(
    MODULE,
    "stat-overview",
    { shopId },
    (signal) => brandMallApi.statOverview({ query: { shopId } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandStatTrend = ({ shopId }: Scope, days = 30) =>
  useBusinessQuery(
    MODULE,
    "stat-trend",
    { shopId, days },
    (signal) => brandMallApi.statTrend({ query: { shopId, days } }, { signal }),
    "all",
    shopId > 0,
  );

export const useBrandTopProducts = ({ shopId }: Scope, limit = 10) =>
  useBusinessQuery(
    MODULE,
    "stat-top-products",
    { shopId, limit },
    (signal) => brandMallApi.statTopProducts({ query: { shopId, limit } }, { signal }),
    "all",
    shopId > 0,
  );

// ---------------------------------------------------------------- 写操作

/** 店铺：开通、改资料、改状态、交易参数。 */
export function useBrandShopActions() {
  return {
    create: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shopCreate>[0]) => brandMallApi.shopCreate(input),
      REFRESH,
    ),
    update: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shopUpdate>[0]) => brandMallApi.shopUpdate(input),
      REFRESH,
    ),
    setStatus: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shopStatus>[0]) => brandMallApi.shopStatus(input),
      REFRESH,
    ),
    remove: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shopRemove>[0]) => brandMallApi.shopRemove(input),
      REFRESH,
    ),
    saveTrade: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shopTrade>[0]) => brandMallApi.shopTrade(input),
      REFRESH,
    ),
  };
}

/** 商品与分类：上下架/删除是批量操作，失效整个模块以刷新各页签计数与看板。 */
export function useBrandGoodsActions() {
  return {
    saveCategory: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.categorySave>[0]) =>
        brandMallApi.categorySave(input),
      REFRESH,
    ),
    removeCategory: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.categoryRemove>[0]) =>
        brandMallApi.categoryRemove(input),
      REFRESH,
    ),
    sortCategories: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.categorySort>[0]) =>
        brandMallApi.categorySort(input),
      REFRESH,
    ),
    saveProduct: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.productSave>[0]) => brandMallApi.productSave(input),
      REFRESH,
    ),
    setProductStatus: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.productStatus>[0]) =>
        brandMallApi.productStatus(input),
      REFRESH,
    ),
    removeProducts: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.productRemove>[0]) =>
        brandMallApi.productRemove(input),
      REFRESH,
    ),
    copyProducts: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.productCopy>[0]) => brandMallApi.productCopy(input),
      REFRESH,
    ),
    replyReview: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.reviewReply>[0]) => brandMallApi.reviewReply(input),
      REFRESH,
    ),
    setReviewStatus: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.reviewStatus>[0]) => brandMallApi.reviewStatus(input),
      REFRESH,
    ),
  };
}

/** 运费模板：商品改绑模板与模板本身都会影响结算价，统一失效整个模块。 */
export function useBrandShippingActions() {
  return {
    save: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shippingSave>[0]) =>
        brandMallApi.shippingSave(input),
      REFRESH,
    ),
    remove: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.shippingRemove>[0]) =>
        brandMallApi.shippingRemove(input),
      REFRESH,
    ),
  };
}

export function useBrandOrderActions() {
  return {
    ship: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.orderShip>[0]) => brandMallApi.orderShip(input),
      REFRESH,
    ),
    finish: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.orderFinish>[0]) => brandMallApi.orderFinish(input),
      REFRESH,
    ),
    close: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.orderClose>[0]) => brandMallApi.orderClose(input),
      REFRESH,
    ),
    remark: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.orderRemark>[0]) => brandMallApi.orderRemark(input),
      REFRESH,
    ),
    agreeRefund: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.refundAgree>[0]) => brandMallApi.refundAgree(input),
      REFRESH,
    ),
    rejectRefund: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.refundReject>[0]) => brandMallApi.refundReject(input),
      REFRESH,
    ),
  };
}

export function useBrandCustomerActions() {
  return {
    update: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.customerUpdate>[0]) =>
        brandMallApi.customerUpdate(input),
      REFRESH,
    ),
  };
}

/** SCRM 开关与补发都会改健康度计数，动作完统一失效整个商城模块。 */
export function useBrandScrmActions() {
  return {
    toggle: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.scrmToggle>[0]) => brandMallApi.scrmToggle(input),
      REFRESH,
    ),
    retry: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.scrmRetry>[0]) => brandMallApi.scrmRetry(input),
      REFRESH,
    ),
    replay: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.scrmReplay>[0]) => brandMallApi.scrmReplay(input),
      REFRESH,
    ),
  };
}

export function useBrandMarketingActions() {
  return {
    saveCoupon: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.couponSave>[0]) => brandMallApi.couponSave(input),
      REFRESH,
    ),
    statusCoupon: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.couponStatus>[0]) => brandMallApi.couponStatus(input),
      REFRESH,
    ),
    removeCoupon: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.couponRemove>[0]) => brandMallApi.couponRemove(input),
      REFRESH,
    ),
    saveExpress: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.expressSave>[0]) => brandMallApi.expressSave(input),
      REFRESH,
    ),
    removeExpress: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.expressRemove>[0]) =>
        brandMallApi.expressRemove(input),
      REFRESH,
    ),
  };
}

/** 装修：保存草稿与发布是两个动作，发布后列表与详情页的 status 都要跟着变。 */
export function useBrandDiyActions() {
  return {
    save: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.diySave>[0]) => brandMallApi.diySave(input),
      REFRESH,
    ),
    publish: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.diyPublish>[0]) => brandMallApi.diyPublish(input),
      REFRESH,
    ),
    copy: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.diyCopy>[0]) => brandMallApi.diyCopy(input),
      REFRESH,
    ),
    remove: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.diyRemove>[0]) => brandMallApi.diyRemove(input),
      REFRESH,
    ),
  };
}

/**
 * 发布页写操作：自检会改写后端的 `status`（未自检/可用/失败）与 `verifiedAt`，
 * 所以自检也走失效，页面读到的是最新状态而不是点完按钮停在旧徽标。
 */
export function useBrandPublishActions() {
  return {
    saveApp: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.appSave>[0]) => brandMallApi.appSave(input),
      REFRESH,
    ),
    appTest: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.appTest>[0]) => brandMallApi.appTest(input),
      REFRESH,
    ),
    payTest: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.payTest>[0]) => brandMallApi.payTest(input),
      REFRESH,
    ),
    qrcode: useBusinessMutation(
      (input: Parameters<typeof brandMallApi.qrcodeGenerate>[0]) =>
        brandMallApi.qrcodeGenerate(input),
      REFRESH,
    ),
  };
}

export function useBrandAdminActions() {
  return {
    saveSettings: useBusinessMutation(
      (input: Parameters<typeof brandMallAdminApi.saveSettings>[0]) =>
        brandMallAdminApi.saveSettings(input),
      ADMIN_REFRESH,
    ),
    suspend: useBusinessMutation(
      (input: Parameters<typeof brandMallAdminApi.shopSuspend>[0]) =>
        brandMallAdminApi.shopSuspend(input),
      ADMIN_REFRESH,
    ),
    resume: useBusinessMutation(
      (input: Parameters<typeof brandMallAdminApi.shopResume>[0]) =>
        brandMallAdminApi.shopResume(input),
      ADMIN_REFRESH,
    ),
    saveExpress: useBusinessMutation(
      (input: Parameters<typeof brandMallAdminApi.saveExpress>[0]) =>
        brandMallAdminApi.saveExpress(input),
      ADMIN_REFRESH,
    ),
    removeExpress: useBusinessMutation(
      (input: Parameters<typeof brandMallAdminApi.removeExpress>[0]) =>
        brandMallAdminApi.removeExpress(input),
      ADMIN_REFRESH,
    ),
  };
}

export const useBrandAdminSettings = () =>
  useBusinessQuery(ADMIN_MODULE, "settings", {}, (signal) =>
    brandMallAdminApi.settings({}, { signal }),
  );

export type BrandAdminShopFilter = FilterOf<typeof brandMallAdminApi.shops>;

export const useBrandAdminShops = (
  filter: BrandAdminShopFilter = {},
  page = 1,
  pageSize = 20,
) =>
  useBusinessQuery(
    ADMIN_MODULE,
    "shop-list",
    { ...filter, page, pageSize },
    (signal) =>
      brandMallAdminApi.shops({ query: { page, pageSize, ...filter } }, { signal }),
  );

/** 代码包下载已统一到「小程序发布说明」直下，这里不再保留按店铺签直链的入口。 */
