import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站管理 · 电商小程序工具：
 * `brandMallApi` 是店主侧（`/enterprise/brand-mall/**`，按 shopId 归属校验），
 * `brandMallAdminApi` 是平台侧（`/enterprise/admin/brand-mall/**`）。
 *
 * 只包契约操作，不写业务判断：请求/响应的字段与校验都来自 `@enterprise/contracts` 的
 * `brandMallEndpoints`，后端改字段时这里跟着类型报错。
 * 微信凭据的读接口永远只回 `xxxConfigured` 布尔，密钥不回显（见 `private-mini.ts`）。
 */
export const brandMallApi = {
  // ---------- 元信息与店铺 ----------
  meta: endpoint(endpoints.BrandMall_meta),
  shops: endpoint(endpoints.BrandMall_shops),
  shopCreate: endpoint(endpoints.BrandMall_shopCreate),
  shopDetail: endpoint(endpoints.BrandMall_shopDetail),
  shopUpdate: endpoint(endpoints.BrandMall_shopUpdate),
  shopStatus: endpoint(endpoints.BrandMall_shopStatus),
  shopRemove: endpoint(endpoints.BrandMall_shopRemove),
  shopTrade: endpoint(endpoints.BrandMall_shopTrade),

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=BRAND）----------
  appDetail: endpoint(endpoints.BrandMall_appDetail),
  appSave: endpoint(endpoints.BrandMall_appSave),
  appTest: endpoint(endpoints.BrandMall_appTest),
  payTest: endpoint(endpoints.BrandMall_payTest),

  // ---------- 分类 ----------
  categoryList: endpoint(endpoints.BrandMall_categoryList),
  categorySave: endpoint(endpoints.BrandMall_categorySave),
  categoryRemove: endpoint(endpoints.BrandMall_categoryRemove),
  categorySort: endpoint(endpoints.BrandMall_categorySort),

  // ---------- 商品 ----------
  productList: endpoint(endpoints.BrandMall_productList),
  productDetail: endpoint(endpoints.BrandMall_productDetail),
  productSave: endpoint(endpoints.BrandMall_productSave),
  productStatus: endpoint(endpoints.BrandMall_productStatus),
  productRemove: endpoint(endpoints.BrandMall_productRemove),
  productCopy: endpoint(endpoints.BrandMall_productCopy),

  // ---------- 评价 ----------
  reviewList: endpoint(endpoints.BrandMall_reviewList),
  reviewReply: endpoint(endpoints.BrandMall_reviewReply),
  reviewStatus: endpoint(endpoints.BrandMall_reviewStatus),

  // ---------- 运费模板 ----------
  shippingList: endpoint(endpoints.BrandMall_shippingList),
  shippingSave: endpoint(endpoints.BrandMall_shippingSave),
  shippingRemove: endpoint(endpoints.BrandMall_shippingRemove),

  // ---------- 快递公司 ----------
  expressList: endpoint(endpoints.BrandMall_expressList),
  expressSave: endpoint(endpoints.BrandMall_expressSave),
  expressRemove: endpoint(endpoints.BrandMall_expressRemove),

  // ---------- 顾客 ----------
  customerList: endpoint(endpoints.BrandMall_customerList),
  customerDetail: endpoint(endpoints.BrandMall_customerDetail),
  customerUpdate: endpoint(endpoints.BrandMall_customerUpdate),
  addressList: endpoint(endpoints.BrandMall_addressList),
  customerScrm: endpoint(endpoints.BrandMall_customerScrm),

  // ---------- 企业微信 SCRM 集成（松耦合）----------
  scrmState: endpoint(endpoints.BrandMall_scrmState),
  scrmToggle: endpoint(endpoints.BrandMall_scrmToggle),
  scrmRetry: endpoint(endpoints.BrandMall_scrmRetry),
  scrmReplay: endpoint(endpoints.BrandMall_scrmReplay),

  // ---------- 订单 ----------
  orderList: endpoint(endpoints.BrandMall_orderList),
  orderDetail: endpoint(endpoints.BrandMall_orderDetail),
  orderRemark: endpoint(endpoints.BrandMall_orderRemark),
  orderShip: endpoint(endpoints.BrandMall_orderShip),
  orderFinish: endpoint(endpoints.BrandMall_orderFinish),
  orderClose: endpoint(endpoints.BrandMall_orderClose),

  // ---------- 售后 ----------
  refundList: endpoint(endpoints.BrandMall_refundList),
  refundDetail: endpoint(endpoints.BrandMall_refundDetail),
  refundAgree: endpoint(endpoints.BrandMall_refundAgree),
  refundReject: endpoint(endpoints.BrandMall_refundReject),

  // ---------- 优惠券 ----------
  couponList: endpoint(endpoints.BrandMall_couponList),
  couponSave: endpoint(endpoints.BrandMall_couponSave),
  couponStatus: endpoint(endpoints.BrandMall_couponStatus),
  couponRemove: endpoint(endpoints.BrandMall_couponRemove),
  couponTickets: endpoint(endpoints.BrandMall_couponTickets),

  // ---------- 页面装修 ----------
  diyWidgets: endpoint(endpoints.BrandMall_diyWidgets),
  diyList: endpoint(endpoints.BrandMall_diyList),
  diyDetail: endpoint(endpoints.BrandMall_diyDetail),
  diySave: endpoint(endpoints.BrandMall_diySave),
  diyPublish: endpoint(endpoints.BrandMall_diyPublish),
  diyCopy: endpoint(endpoints.BrandMall_diyCopy),
  diyRemove: endpoint(endpoints.BrandMall_diyRemove),

  // ---------- 小程序码 ----------
  qrcodeGenerate: endpoint(endpoints.BrandMall_qrcodeGenerate),

  // ---------- 经营看板 ----------
  statOverview: endpoint(endpoints.BrandMall_statOverview),
  statTrend: endpoint(endpoints.BrandMall_statTrend),
  statTopProducts: endpoint(endpoints.BrandMall_statTopProducts),
};

/** 平台侧：店铺台账、停服/恢复、全局参数与预置快递（shopId=0，店主侧只读）。 */
export const brandMallAdminApi = {
  shops: endpoint(endpoints.BrandMallAdmin_shops),
  shopDetail: endpoint(endpoints.BrandMallAdmin_shopDetail),
  shopSuspend: endpoint(endpoints.BrandMallAdmin_shopSuspend),
  shopResume: endpoint(endpoints.BrandMallAdmin_shopResume),
  settings: endpoint(endpoints.BrandMallAdmin_settings),
  saveSettings: endpoint(endpoints.BrandMallAdmin_saveSettings),
  expressList: endpoint(endpoints.BrandMallAdmin_expressList),
  saveExpress: endpoint(endpoints.BrandMallAdmin_saveExpress),
  removeExpress: endpoint(endpoints.BrandMallAdmin_removeExpress),
  statOverview: endpoint(endpoints.BrandMallAdmin_statOverview),
};
