import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 外卖点餐门店端：只包 `Takeout_*` 契约操作。
 * 数据落在 takeout_* 表，与品牌商城互不共享；请求响应形状全部来自契约。
 */
export const takeoutApi = {
  shops: endpoint(endpoints.Takeout_shopList),
  shopCreate: endpoint(endpoints.Takeout_shopCreate),
  shopDetail: endpoint(endpoints.Takeout_shopDetail),
  shopUpdate: endpoint(endpoints.Takeout_shopUpdate),
  shopTrade: endpoint(endpoints.Takeout_shopTrade),
  shopStatus: endpoint(endpoints.Takeout_shopStatus),
  scrmState: endpoint(endpoints.Takeout_scrmState),
  scrmToggle: endpoint(endpoints.Takeout_scrmToggle),
  appDetail: endpoint(endpoints.Takeout_appDetail),
  appSave: endpoint(endpoints.Takeout_appSave),
  appTest: endpoint(endpoints.Takeout_appTest),

  categoryList: endpoint(endpoints.Takeout_categoryList),
  categorySave: endpoint(endpoints.Takeout_categorySave),
  categoryRemove: endpoint(endpoints.Takeout_categoryRemove),

  productList: endpoint(endpoints.Takeout_productList),
  productDetail: endpoint(endpoints.Takeout_productDetail),
  productSave: endpoint(endpoints.Takeout_productSave),
  productRemove: endpoint(endpoints.Takeout_productRemove),

  orderList: endpoint(endpoints.Takeout_orderList),
  orderDetail: endpoint(endpoints.Takeout_orderDetail),
  orderRemark: endpoint(endpoints.Takeout_orderRemark),
  orderAdvance: endpoint(endpoints.Takeout_orderAdvance),
  orderFinish: endpoint(endpoints.Takeout_orderFinish),
  orderMarkPaid: endpoint(endpoints.Takeout_orderMarkPaid),

  couponList: endpoint(endpoints.Takeout_couponList),
  couponSave: endpoint(endpoints.Takeout_couponSave),
  couponStatus: endpoint(endpoints.Takeout_couponStatus),
};