import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 园区管理后台（`/enterprise/park/**`）。
 * 字段与校验全部来自 `@enterprise/contracts` 的 `parkEndpoints`；
 * C 端与员工端走 `/api/public/park/*` 免登录通道，由小程序包直连。
 */
export const parkApi = {
  meta: endpoint(endpoints.Park_meta),
  overview: endpoint(endpoints.Park_overview),

  sites: endpoint(endpoints.Park_sites),
  siteSave: endpoint(endpoints.Park_siteSave),
  siteStatus: endpoint(endpoints.Park_siteStatus),

  buildings: endpoint(endpoints.Park_buildings),
  buildingSave: endpoint(endpoints.Park_buildingSave),
  buildingRemove: endpoint(endpoints.Park_buildingRemove),

  units: endpoint(endpoints.Park_units),
  unitSave: endpoint(endpoints.Park_unitSave),
  unitRemove: endpoint(endpoints.Park_unitRemove),

  tenants: endpoint(endpoints.Park_tenants),
  tenantSave: endpoint(endpoints.Park_tenantSave),
  tenantRemove: endpoint(endpoints.Park_tenantRemove),

  staffs: endpoint(endpoints.Park_staffs),
  staffSave: endpoint(endpoints.Park_staffSave),
  staffStatus: endpoint(endpoints.Park_staffStatus),

  customers: endpoint(endpoints.Park_customers),
  customerRole: endpoint(endpoints.Park_customerRole),

  announcements: endpoint(endpoints.Park_announcements),
  announcementSave: endpoint(endpoints.Park_announcementSave),
  announcementStatus: endpoint(endpoints.Park_announcementStatus),
  announcementRemove: endpoint(endpoints.Park_announcementRemove),

  approvals: endpoint(endpoints.Park_approvals),
  approvalDetail: endpoint(endpoints.Park_approvalDetail),
  approvalAction: endpoint(endpoints.Park_approvalAction),

  resources: endpoint(endpoints.Park_resources),
  resourceSave: endpoint(endpoints.Park_resourceSave),
  resourceStatus: endpoint(endpoints.Park_resourceStatus),
  resourceRemove: endpoint(endpoints.Park_resourceRemove),
  resourceSlots: endpoint(endpoints.Park_resourceSlots),
  resourceGenerateSlots: endpoint(endpoints.Park_resourceGenerateSlots),

  reservations: endpoint(endpoints.Park_reservations),
  reservationDetail: endpoint(endpoints.Park_reservationDetail),
  reservationAction: endpoint(endpoints.Park_reservationAction),

  workOrders: endpoint(endpoints.Park_workOrders),
  workOrderDetail: endpoint(endpoints.Park_workOrderDetail),
  workOrderAssign: endpoint(endpoints.Park_workOrderAssign),
  workOrderAction: endpoint(endpoints.Park_workOrderAction),

  activities: endpoint(endpoints.Park_activities),
  activitySave: endpoint(endpoints.Park_activitySave),
  activityStatus: endpoint(endpoints.Park_activityStatus),
  activityRemove: endpoint(endpoints.Park_activityRemove),
  activitySignups: endpoint(endpoints.Park_activitySignups),

  leases: endpoint(endpoints.Park_leases),
  leaseSave: endpoint(endpoints.Park_leaseSave),
  leaseStatus: endpoint(endpoints.Park_leaseStatus),
  leaseRemove: endpoint(endpoints.Park_leaseRemove),
  bills: endpoint(endpoints.Park_bills),
  billGenerate: endpoint(endpoints.Park_billGenerate),
  billAction: endpoint(endpoints.Park_billAction),

  invoices: endpoint(endpoints.Park_invoices),
  invoiceIssue: endpoint(endpoints.Park_invoiceIssue),
  invoiceVoid: endpoint(endpoints.Park_invoiceVoid),
  patrolPlans: endpoint(endpoints.Park_patrolPlans),
  patrolPlanSave: endpoint(endpoints.Park_patrolPlanSave),
  patrolPlanRemove: endpoint(endpoints.Park_patrolPlanRemove),
  patrolRecords: endpoint(endpoints.Park_patrolRecords),
  parkingPermits: endpoint(endpoints.Park_parkingPermits),
  parkingPermitAction: endpoint(endpoints.Park_parkingPermitAction),
  assets: endpoint(endpoints.Park_assets),
  assetSave: endpoint(endpoints.Park_assetSave),
  assetRemove: endpoint(endpoints.Park_assetRemove),
  meters: endpoint(endpoints.Park_meters),
  meterSave: endpoint(endpoints.Park_meterSave),
  meterRemove: endpoint(endpoints.Park_meterRemove),

  orders: endpoint(endpoints.Park_orders),
  orderAction: endpoint(endpoints.Park_orderAction),

  flow: endpoint(endpoints.Park_flow),
  flowSave: endpoint(endpoints.Park_flowSave),

  wechat: endpoint(endpoints.Park_wechat),
  saveWechat: endpoint(endpoints.Park_saveWechat),
  testWechat: endpoint(endpoints.Park_testWechat),
};
