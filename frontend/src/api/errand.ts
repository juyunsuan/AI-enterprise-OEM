import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站管理 · 跑腿小程序工具（店主侧 `/enterprise/errand/**`）。
 *
 * 字段与校验全部来自 `@enterprise/contracts` 的 `errandEndpoints`；
 * 顾客与骑手走 `/api/public/errand/*` 免登录通道，由小程序包直连，不经过这里。
 */
export const errandApi = {
  meta: endpoint(endpoints.Errand_meta),
  overview: endpoint(endpoints.Errand_overview),

  site: endpoint(endpoints.Errand_site),
  siteSave: endpoint(endpoints.Errand_siteSave),
  siteStatus: endpoint(endpoints.Errand_siteStatus),
  cities: endpoint(endpoints.Errand_cities),
  citySave: endpoint(endpoints.Errand_citySave),
  cityStatus: endpoint(endpoints.Errand_cityStatus),
  cityRemove: endpoint(endpoints.Errand_cityRemove),
  ruleSave: endpoint(endpoints.Errand_ruleSave),

  orders: endpoint(endpoints.Errand_orders),
  orderDetail: endpoint(endpoints.Errand_orderDetail),
  orderAction: endpoint(endpoints.Errand_orderAction),

  riders: endpoint(endpoints.Errand_riders),
  riderRoster: endpoint(endpoints.Errand_riderRoster),
  riderSave: endpoint(endpoints.Errand_riderSave),
  riderStatus: endpoint(endpoints.Errand_riderStatus),

  customers: endpoint(endpoints.Errand_customers),
  customerStatus: endpoint(endpoints.Errand_customerStatus),

  coupons: endpoint(endpoints.Errand_coupons),
  couponSave: endpoint(endpoints.Errand_couponSave),
  couponStatus: endpoint(endpoints.Errand_couponStatus),
  couponRemove: endpoint(endpoints.Errand_couponRemove),

  agents: endpoint(endpoints.Errand_agents),
  agentSave: endpoint(endpoints.Errand_agentSave),
  agentStatus: endpoint(endpoints.Errand_agentStatus),
  agentRemove: endpoint(endpoints.Errand_agentRemove),
  agentWithdrawals: endpoint(endpoints.Errand_agentWithdrawals),
  agentWithdrawalAction: endpoint(endpoints.Errand_agentWithdrawalAction),

  wallet: endpoint(endpoints.Errand_wallet),
  withdrawals: endpoint(endpoints.Errand_withdrawals),
  withdrawalAction: endpoint(endpoints.Errand_withdrawalAction),

  assets: endpoint(endpoints.Errand_assets),
  aiDispatch: endpoint(endpoints.Errand_aiDispatch),
  aiOps: endpoint(endpoints.Errand_aiOps),

  appDetail: endpoint(endpoints.Errand_appDetail),
  appSave: endpoint(endpoints.Errand_appSave),
  appTest: endpoint(endpoints.Errand_appTest),
  qrcodeGenerate: endpoint(endpoints.Errand_qrcodeGenerate),
};

/** 平台侧（`/enterprise/admin/errand/**`）：板块总闸与统计。 */
export const errandAdminApi = {
  settings: endpoint(endpoints.ErrandAdmin_settings),
  saveSettings: endpoint(endpoints.ErrandAdmin_saveSettings),
};
