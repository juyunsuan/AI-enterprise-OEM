import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站管理 · 卡密商城小程序工具（店主侧 `/enterprise/card-shop/**`）。
 *
 * 只包契约操作，字段与校验全部来自 `@enterprise/contracts` 的 `cardShopEndpoints`；
 * 买家端走 `/api/public/card-shop/*` 免登录通道，由小程序包直连，不经过这里。
 * 微信凭据读接口只回 `xxxConfigured` 布尔，密钥永不回显（见 `private-mini.ts`）。
 */
export const cardShopApi = {
  // ---------- 元信息与概览 ----------
  meta: endpoint(endpoints.CardShop_meta),
  overview: endpoint(endpoints.CardShop_overview),

  // ---------- 站点 ----------
  sites: endpoint(endpoints.CardShop_sites),
  siteCreate: endpoint(endpoints.CardShop_siteCreate),
  siteDetail: endpoint(endpoints.CardShop_siteDetail),
  siteSave: endpoint(endpoints.CardShop_siteSave),
  siteStatus: endpoint(endpoints.CardShop_siteStatus),
  siteRemove: endpoint(endpoints.CardShop_siteRemove),

  // ---------- 小程序主体凭据 ----------
  appDetail: endpoint(endpoints.CardShop_appDetail),
  appSave: endpoint(endpoints.CardShop_appSave),
  appTest: endpoint(endpoints.CardShop_appTest),
  payTest: endpoint(endpoints.CardShop_payTest),
  qrcodeGenerate: endpoint(endpoints.CardShop_qrcodeGenerate),

  // ---------- 分类 ----------
  categories: endpoint(endpoints.CardShop_categories),
  categorySave: endpoint(endpoints.CardShop_categorySave),
  categoryRemove: endpoint(endpoints.CardShop_categoryRemove),

  // ---------- 商品 ----------
  goodsList: endpoint(endpoints.CardShop_goodsList),
  goodsDetail: endpoint(endpoints.CardShop_goodsDetail),
  goodsSave: endpoint(endpoints.CardShop_goodsSave),
  goodsStatus: endpoint(endpoints.CardShop_goodsStatus),
  goodsRemove: endpoint(endpoints.CardShop_goodsRemove),
  goodsRestore: endpoint(endpoints.CardShop_goodsRestore),

  // ---------- 卡密 ----------
  cardList: endpoint(endpoints.CardShop_cardList),
  cardImport: endpoint(endpoints.CardShop_cardImport),
  cardSave: endpoint(endpoints.CardShop_cardSave),
  cardStatus: endpoint(endpoints.CardShop_cardStatus),
  cardRemove: endpoint(endpoints.CardShop_cardRemove),
  cardRestore: endpoint(endpoints.CardShop_cardRestore),
  batchList: endpoint(endpoints.CardShop_batchList),
  batchRemove: endpoint(endpoints.CardShop_batchRemove),
  cardExport: endpoint(endpoints.CardShop_cardExport),
  stock: endpoint(endpoints.CardShop_stock),

  // ---------- 订单 ----------
  orderList: endpoint(endpoints.CardShop_orderList),
  orderDetail: endpoint(endpoints.CardShop_orderDetail),
  orderClose: endpoint(endpoints.CardShop_orderClose),
  orderReissue: endpoint(endpoints.CardShop_orderReissue),

  // ---------- 券码 ----------
  couponList: endpoint(endpoints.CardShop_couponList),
  couponGenerate: endpoint(endpoints.CardShop_couponGenerate),
  couponSave: endpoint(endpoints.CardShop_couponSave),
  couponRemove: endpoint(endpoints.CardShop_couponRemove),

  // ---------- 顾客 ----------
  customerList: endpoint(endpoints.CardShop_customerList),
  customerStatus: endpoint(endpoints.CardShop_customerStatus),

  // ---------- 内容 ----------
  contentList: endpoint(endpoints.CardShop_contentList),
  contentDetail: endpoint(endpoints.CardShop_contentDetail),
  contentSave: endpoint(endpoints.CardShop_contentSave),
  contentRemove: endpoint(endpoints.CardShop_contentRemove),
};

/**
 * 平台侧（`/enterprise/admin/card-shop/**`）：只留板块与合规闸门（收款开关、敏感词、上限）
 * 和违规取证用的跨站订单检索；店铺的开、关与上下线全由店主自己完成。
 */
export const cardShopAdminApi = {
  settings: endpoint(endpoints.CardShopAdmin_settings),
  saveSettings: endpoint(endpoints.CardShopAdmin_saveSettings),
  orderSearch: endpoint(endpoints.CardShopAdmin_orderSearch),
};
