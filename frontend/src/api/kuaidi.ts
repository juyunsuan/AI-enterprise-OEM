import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站管理 · 快递寄件小程序工具（店主侧 `/enterprise/kuaidi/**`）。
 *
 * 只包契约操作，字段与校验全部来自 `@enterprise/contracts` 的 `kuaidiEndpoints`；
 * 买家端走 `/api/public/kuaidi/*` 免登录通道，由小程序包直连，不经过这里。
 * 微信凭据读接口只回 `xxxConfigured` 布尔，密钥永不回显（见 `private-mini.ts`）。
 *
 * 主体口径：一个账号一部小程序，小程序凭据、出包、收款账户都在账号级；
 * 站点（寄件点）只隔离报价、订单与顾客。
 */
export const kuaidiApi = {
  // ---------- 元信息与概览 ----------
  meta: endpoint(endpoints.Kuaidi_meta),
  overview: endpoint(endpoints.Kuaidi_overview),

  // ---------- 站点（寄件点）----------
  sites: endpoint(endpoints.Kuaidi_sites),
  siteCreate: endpoint(endpoints.Kuaidi_siteCreate),
  siteDetail: endpoint(endpoints.Kuaidi_siteDetail),
  siteSave: endpoint(endpoints.Kuaidi_siteSave),
  siteStatus: endpoint(endpoints.Kuaidi_siteStatus),
  siteRemove: endpoint(endpoints.Kuaidi_siteRemove),

  // ---------- 小程序主体凭据（账号级）----------
  appDetail: endpoint(endpoints.Kuaidi_appDetail),
  appSave: endpoint(endpoints.Kuaidi_appSave),
  appTest: endpoint(endpoints.Kuaidi_appTest),
  qrcodeGenerate: endpoint(endpoints.Kuaidi_qrcodeGenerate),

  // ---------- 收款账户（企业级，多寄件点共用）----------
  enterprises: endpoint(endpoints.Kuaidi_enterprises),
  payAccounts: endpoint(endpoints.Kuaidi_payAccounts),
  payAccountSave: endpoint(endpoints.Kuaidi_payAccountSave),
  payAccountRemove: endpoint(endpoints.Kuaidi_payAccountRemove),
  payAccountTest: endpoint(endpoints.Kuaidi_payAccountTest),

  // ---------- 快递公司报价 ----------
  companies: endpoint(endpoints.Kuaidi_companies),
  companySave: endpoint(endpoints.Kuaidi_companySave),
  companyStatus: endpoint(endpoints.Kuaidi_companyStatus),
  companyRemove: endpoint(endpoints.Kuaidi_companyRemove),

  // ---------- 订单与履约 ----------
  orders: endpoint(endpoints.Kuaidi_orders),
  orderDetail: endpoint(endpoints.Kuaidi_orderDetail),
  orderAction: endpoint(endpoints.Kuaidi_orderAction),

  // ---------- 顾客 ----------
  customers: endpoint(endpoints.Kuaidi_customers),
  customerStatus: endpoint(endpoints.Kuaidi_customerStatus),
};

/** 平台侧（`/enterprise/admin/kuaidi/**`）：板块总闸与统计。 */
export const kuaidiAdminApi = {
  settings: endpoint(endpoints.KuaidiAdmin_settings),
  saveSettings: endpoint(endpoints.KuaidiAdmin_saveSettings),
};
