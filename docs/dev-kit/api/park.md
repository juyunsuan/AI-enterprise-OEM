<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：park（`park`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Park_activities` | GET | `/enterprise/park/activity/list` | ACTIVITIES | 读 | session(会话) |  | siteId, status, keyword |  | data |
| `Park_activityRemove` | POST | `/enterprise/park/activity/remove` | 删除ACTIVITY | 写 | session(会话) |  |  | id | data |
| `Park_activitySave` | POST | `/enterprise/park/activity/save` | 保存ACTIVITY | 写 | session(会话) |  |  | id, siteId, title, cover, summary, content, location, startAt, endAt, signupDeadline, capacity, status | data |
| `Park_activitySignups` | GET | `/enterprise/park/activity/signup/list` | ACTIVITYSIGNUPS | 读 | session(会话) |  | activityId |  | data |
| `Park_activityStatus` | POST | `/enterprise/park/activity/status` | ACTIVITY状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_announcements` | GET | `/enterprise/park/announcement/list` | ANNOUNCEMENTS | 读 | session(会话) |  | siteId, category, status, keyword |  | data |
| `Park_announcementRemove` | POST | `/enterprise/park/announcement/remove` | 删除ANNOUNCEMENT | 写 | session(会话) |  |  | id | data |
| `Park_announcementSave` | POST | `/enterprise/park/announcement/save` | 保存ANNOUNCEMENT | 写 | session(会话) |  |  | id, siteId, category, title, summary, content, cover, pinned, status | data |
| `Park_announcementStatus` | POST | `/enterprise/park/announcement/status` | ANNOUNCEMENT状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_flow` | GET | `/enterprise/park/approval-flow` | 流程 | 读 | session(会话) |  | siteId, bizType |  | data |
| `Park_flowSave` | POST | `/enterprise/park/approval-flow/save` | 保存流程 | 写 | session(会话) |  |  | siteId, bizType, name, nodes, enabled | data |
| `Park_approvalDetail` | GET | `/enterprise/park/approval/:id` | APPROVAL详情 | 读 | session(会话) | id |  |  | data |
| `Park_approvalAction` | POST | `/enterprise/park/approval/action` | APPROVALACTION | 写 | session(会话) |  |  | id, action, comment | data |
| `Park_approvals` | GET | `/enterprise/park/approval/list` | APPROVALS | 读 | session(会话) |  | siteId, bizType, status, keyword, page, pageSize |  | data |
| `Park_assets` | GET | `/enterprise/park/asset/list` | 资产 | 读 | session(会话) |  | siteId |  | data |
| `Park_assetRemove` | POST | `/enterprise/park/asset/remove` | 删除资产 | 写 | session(会话) |  |  | id | data |
| `Park_assetSave` | POST | `/enterprise/park/asset/save` | 保存资产 | 写 | session(会话) |  |  | id, siteId, name, category, location, status, assigneeStaffId, assigneeName, purchaseDate, value, note | data |
| `Park_billAction` | POST | `/enterprise/park/bill/action` | BILLACTION | 写 | session(会话) |  |  | id, action, note | data |
| `Park_billGenerate` | POST | `/enterprise/park/bill/generate` | 生成BILL | 写 | session(会话) |  |  | leaseId, periodStart, periodEnd, dueDate, amount, note | data |
| `Park_bills` | GET | `/enterprise/park/bill/list` | BILLS | 读 | session(会话) |  | siteId, leaseId, status, keyword, page, pageSize |  | data |
| `Park_buildings` | GET | `/enterprise/park/building/list` | BUILDINGS | 读 | session(会话) |  | siteId |  | data |
| `Park_buildingRemove` | POST | `/enterprise/park/building/remove` | 删除BUILDING | 写 | session(会话) |  |  | id | data |
| `Park_buildingSave` | POST | `/enterprise/park/building/save` | 保存BUILDING | 写 | session(会话) |  |  | id, siteId, name, floors, addressLine, sort | data |
| `Park_customers` | GET | `/enterprise/park/customer/list` | 客户 | 读 | session(会话) |  | siteId, tenantId, keyword, page, pageSize |  | data |
| `Park_customerRole` | POST | `/enterprise/park/customer/role` | 客户身份 | 写 | session(会话) |  |  | id, memberRole | data |
| `Park_invoiceIssue` | POST | `/enterprise/park/invoice/issue` | 开票发放 | 写 | session(会话) |  |  | id, siteId, bizType, bizId, customerId, tenantId, title, taxNo, amount, status, note | data |
| `Park_invoices` | GET | `/enterprise/park/invoice/list` | 开票 | 读 | session(会话) |  | siteId, status, keyword |  | data |
| `Park_invoiceVoid` | POST | `/enterprise/park/invoice/void` | 开票VOID | 写 | session(会话) |  |  | id | data |
| `Park_leases` | GET | `/enterprise/park/lease/list` | LEASES | 读 | session(会话) |  | siteId, status, keyword |  | data |
| `Park_leaseRemove` | POST | `/enterprise/park/lease/remove` | 删除LEASE | 写 | session(会话) |  |  | id | data |
| `Park_leaseSave` | POST | `/enterprise/park/lease/save` | 保存LEASE | 写 | session(会话) |  |  | id, siteId, tenantId, title, startDate, endDate, rentAmount, deposit, billingCycle, status, note | data |
| `Park_leaseStatus` | POST | `/enterprise/park/lease/status` | LEASE状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_meta` | GET | `/enterprise/park/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Park_meters` | GET | `/enterprise/park/meter/list` | METERS | 读 | session(会话) |  | siteId |  | data |
| `Park_meterRemove` | POST | `/enterprise/park/meter/remove` | 删除METER | 写 | session(会话) |  |  | id | data |
| `Park_meterSave` | POST | `/enterprise/park/meter/save` | 保存METER | 写 | session(会话) |  |  | id, siteId, meterType, meterNo, unitId, period, reading, amount, note | data |
| `Park_orderAction` | POST | `/enterprise/park/order/action` | 订单ACTION | 写 | session(会话) |  |  | id, action, note | data |
| `Park_orders` | GET | `/enterprise/park/order/list` | 订单 | 读 | session(会话) |  | siteId, status, bizType, keyword, page, pageSize |  | data |
| `Park_overview` | GET | `/enterprise/park/overview` | 概览 | 读 | session(会话) |  | siteId |  | data |
| `Park_parkingPermitAction` | POST | `/enterprise/park/parking/action` | PARKINGPERMITACTION | 写 | session(会话) |  |  | id, action, note | data |
| `Park_parkingPermits` | GET | `/enterprise/park/parking/list` | PARKINGPERMITS | 读 | session(会话) |  | siteId, status, keyword |  | data |
| `Park_patrolPlans` | GET | `/enterprise/park/patrol/plan/list` | PATROL计划 | 读 | session(会话) |  | siteId |  | data |
| `Park_patrolPlanRemove` | POST | `/enterprise/park/patrol/plan/remove` | 删除PATROL计划 | 写 | session(会话) |  |  | id | data |
| `Park_patrolPlanSave` | POST | `/enterprise/park/patrol/plan/save` | 保存PATROL计划 | 写 | session(会话) |  |  | id, siteId, name, points, staffIds, status, note | data |
| `Park_patrolRecords` | GET | `/enterprise/park/patrol/record/list` | PATROL记录 | 读 | session(会话) |  | siteId, planId, page, pageSize |  | data |
| `Park_reservationAction` | POST | `/enterprise/park/reservation/action` | RESERVATIONACTION | 写 | session(会话) |  |  | id, action, comment | data |
| `Park_reservationDetail` | GET | `/enterprise/park/reservation/detail` | RESERVATION详情 | 读 | session(会话) |  | id |  | data |
| `Park_reservations` | GET | `/enterprise/park/reservation/list` | RESERVATIONS | 读 | session(会话) |  | siteId, kind, status, keyword, page, pageSize |  | data |
| `Park_resources` | GET | `/enterprise/park/resource/list` | 资源 | 读 | session(会话) |  | siteId |  | data |
| `Park_resourceRemove` | POST | `/enterprise/park/resource/remove` | 删除资源 | 写 | session(会话) |  |  | id | data |
| `Park_resourceSave` | POST | `/enterprise/park/resource/save` | 保存资源 | 写 | session(会话) |  |  | id, siteId, buildingId, name, kind, capacity, location, description, cover, feeAmount, stock, deposit, approvalRequired, schedule, status, sort | data |
| `Park_resourceSlots` | GET | `/enterprise/park/resource/slots` | 资源时段 | 读 | session(会话) |  | resourceId, from, to |  | data |
| `Park_resourceGenerateSlots` | POST | `/enterprise/park/resource/slots/generate` | 生成资源时段 | 写 | session(会话) |  |  | resourceId, date, startTime, endTime, stepMin | data |
| `Park_resourceStatus` | POST | `/enterprise/park/resource/status` | 资源状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_sites` | GET | `/enterprise/park/site/list` | SITES | 读 | session(会话) |  | status |  | data |
| `Park_siteSave` | POST | `/enterprise/park/site/save` | 保存SITE | 写 | session(会话) |  |  | id, name, logo, themeColor, province, city, district, addressLine, lng, lat, phone, notice, deskSiteKey | data |
| `Park_siteStatus` | POST | `/enterprise/park/site/status` | SITE状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_package` | GET | `/enterprise/park/sites/:id/package` | PACKAGE | 读 | session(会话) | id |  |  | data |
| `Park_wechat` | GET | `/enterprise/park/sites/:id/wechat` | WECHAT | 读 | session(会话) | id |  |  | data |
| `Park_saveWechat` | POST | `/enterprise/park/sites/:id/wechat` | 保存WECHAT | 写 | session(会话) | id |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Park_testWechat` | POST | `/enterprise/park/sites/:id/wechat/test` | 测试WECHAT | 写 | session(会话) | id |  |  | data |
| `Park_staffs` | GET | `/enterprise/park/staff/list` | 职员 | 读 | session(会话) |  | siteId, status, role, keyword |  | data |
| `Park_staffSave` | POST | `/enterprise/park/staff/save` | 保存职员 | 写 | session(会话) |  |  | id, siteId, name, phone, staffCode, role, department, status | data |
| `Park_staffStatus` | POST | `/enterprise/park/staff/status` | 职员状态 | 写 | session(会话) |  |  | id, status | data |
| `Park_tenants` | GET | `/enterprise/park/tenant/list` | TENANTS | 读 | session(会话) |  | siteId, status, keyword |  | data |
| `Park_tenantRemove` | POST | `/enterprise/park/tenant/remove` | 删除TENANT | 写 | session(会话) |  |  | id | data |
| `Park_tenantSave` | POST | `/enterprise/park/tenant/save` | 保存TENANT | 写 | session(会话) |  |  | id, siteId, name, creditCode, industry, contactName, contactPhone, unitIds, status, note | data |
| `Park_units` | GET | `/enterprise/park/unit/list` | UNITS | 读 | session(会话) |  | siteId, buildingId, status, keyword |  | data |
| `Park_unitRemove` | POST | `/enterprise/park/unit/remove` | 删除UNIT | 写 | session(会话) |  |  | id | data |
| `Park_unitSave` | POST | `/enterprise/park/unit/save` | 保存UNIT | 写 | session(会话) |  |  | id, siteId, buildingId, roomNo, floor, area, usage, status, attributes | data |
| `Park_workOrderAction` | POST | `/enterprise/park/work-order/action` | 工单ACTION | 写 | session(会话) |  |  | id, action, note, result, images, feeAmount | data |
| `Park_workOrderAssign` | POST | `/enterprise/park/work-order/assign` | 指派工单 | 写 | session(会话) |  |  | id, staffId, note | data |
| `Park_workOrderDetail` | GET | `/enterprise/park/work-order/detail` | 工单详情 | 读 | session(会话) |  | id |  | data |
| `Park_workOrders` | GET | `/enterprise/park/work-order/list` | 工单 | 读 | session(会话) |  | siteId, category, status, keyword, page, pageSize |  | data |

返回 `INDEX.md`。

