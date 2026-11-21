import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 租赁管理后台（店主侧 `/enterprise/rental/**`）。
 * 字段与校验全部来自 `@enterprise/contracts` 的 `rentalEndpoints`；
 * 租客端与员工端走 `/api/public/rental/*` 免登录通道，由小程序包直连。
 */
export const rentalApi = {
  overview: endpoint(endpoints.Rental_overview),

  shops: endpoint(endpoints.Rental_shops),
  createShop: endpoint(endpoints.Rental_createShop),
  shopDetail: endpoint(endpoints.Rental_shopDetail),
  updateShop: endpoint(endpoints.Rental_updateShop),
  saveTrade: endpoint(endpoints.Rental_saveTrade),
  setStatus: endpoint(endpoints.Rental_setStatus),

  wechat: endpoint(endpoints.Rental_wechat),
  saveWechat: endpoint(endpoints.Rental_saveWechat),
  testWechat: endpoint(endpoints.Rental_testWechat),
  package: endpoint(endpoints.Rental_package),

  items: endpoint(endpoints.Rental_items),
  saveItem: endpoint(endpoints.Rental_saveItem),
  removeItem: endpoint(endpoints.Rental_removeItem),

  orders: endpoint(endpoints.Rental_orders),
  createOrder: endpoint(endpoints.Rental_createOrder),
  updateOrder: endpoint(endpoints.Rental_updateOrder),
  orderDetail: endpoint(endpoints.Rental_orderDetail),
  orderAction: endpoint(endpoints.Rental_orderAction),
  saveInspection: endpoint(endpoints.Rental_saveInspection),
  inspections: endpoint(endpoints.Rental_inspections),

  customers: endpoint(endpoints.Rental_customers),
  saveCustomer: endpoint(endpoints.Rental_saveCustomer),
  removeCustomer: endpoint(endpoints.Rental_removeCustomer),
  customerStatus: endpoint(endpoints.Rental_customerStatus),

  staffs: endpoint(endpoints.Rental_staffs),
  saveStaff: endpoint(endpoints.Rental_saveStaff),
  removeStaff: endpoint(endpoints.Rental_removeStaff),

  stats: endpoint(endpoints.Rental_stats),
};