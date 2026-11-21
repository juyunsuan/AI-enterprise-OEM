import { z } from "zod";
import { pageSchema } from "./pagination";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

/**
 * 园区管理：独立身份、独立令牌、独立数据域。
 *
 * 与租赁/跑腿/商城等小程序**不共用顾客表、员工表、订单表**：
 * - 园区顾客 `park_customers` 以 (siteId, openid) 唯一；
 * - 园区员工 `park_staffs` 以 (siteId, staffCode) 唯一；
 * - 所有园区业务表都带 `siteId`，读写一律双条件过滤；
 * - 小程序令牌沿用平台顾客令牌骨架，但场景固定为 `PARK`，其它场景令牌进不来。
 *
 * C 端与员工端走 `/api/public/park/**` 免登录公开通道（路由手写在 park.public.ts），
 * 管理端走 `Park_` 前缀，身份仍复用站内账号体系。
 */

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });
const text = (max: number) => z.string().trim().max(max);

export const PARK_SCENE = "PARK" as const;

export const PARK_SITE_STATUSES = ["DRAFT", "ONLINE", "SUSPENDED", "CLOSED"] as const;
export type ParkSiteStatus = (typeof PARK_SITE_STATUSES)[number];
export const PARK_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "运营中",
  SUSPENDED: "已停用",
  CLOSED: "已关闭",
};

export const PARK_UNIT_STATUSES = ["VACANT", "OCCUPIED", "DISABLED"] as const;
export type ParkUnitStatus = (typeof PARK_UNIT_STATUSES)[number];
export const PARK_UNIT_STATUS_LABELS: Record<string, string> = {
  VACANT: "空置",
  OCCUPIED: "已租",
  DISABLED: "停用",
};

export const PARK_TENANT_STATUSES = ["ACTIVE", "LEFT", "DISABLED"] as const;
export type ParkTenantStatus = (typeof PARK_TENANT_STATUSES)[number];
export const PARK_TENANT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "在园",
  LEFT: "已退园",
  DISABLED: "停用",
};

export const PARK_STAFF_ROLES = ["OWNER", "CLERK", "GUARD", "APPROVER", "INSPECTOR"] as const;
export type ParkStaffRole = (typeof PARK_STAFF_ROLES)[number];
export const PARK_STAFF_ROLE_LABELS: Record<string, string> = {
  OWNER: "园区管理员",
  CLERK: "运营",
  GUARD: "门岗",
  APPROVER: "审批人",
  INSPECTOR: "巡检",
};

export const PARK_STAFF_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type ParkStaffStatus = (typeof PARK_STAFF_STATUSES)[number];
export const PARK_STAFF_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "在岗",
  SUSPENDED: "停用",
};

export const PARK_CUSTOMER_ROLES = ["EMPLOYEE", "TENANT_ADMIN", "VISITOR"] as const;
export type ParkCustomerRole = (typeof PARK_CUSTOMER_ROLES)[number];
export const PARK_CUSTOMER_ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "企业员工",
  TENANT_ADMIN: "企业管理员",
  VISITOR: "访客",
};

export const PARK_APPROVAL_STATUSES = [
  "APPROVING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export type ParkApprovalStatus = (typeof PARK_APPROVAL_STATUSES)[number];
export const PARK_APPROVAL_STATUS_LABELS: Record<string, string> = {
  APPROVING: "审批中",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  WITHDRAWN: "已撤回",
  EXPIRED: "已过期",
};

export const PARK_APPROVAL_BIZ_TYPES = [
  "VISITOR",
  "VENUE",
  "MOVE_IN",
  "DECORATION",
  "WORK_ORDER",
  "EQUIPMENT",
] as const;
export type ParkApprovalBizType = (typeof PARK_APPROVAL_BIZ_TYPES)[number];
export const PARK_APPROVAL_BIZ_LABELS: Record<string, string> = {
  VISITOR: "访客预约",
  VENUE: "场地预约",
  MOVE_IN: "入园申请",
  DECORATION: "装修申请",
  WORK_ORDER: "工单审批",
  EQUIPMENT: "设备租赁",
};

export const PARK_RESERVATION_KINDS = ["VISITOR", "VENUE", "MEETING", "EQUIPMENT"] as const;
export type ParkReservationKind = (typeof PARK_RESERVATION_KINDS)[number];
export const PARK_RESERVATION_KIND_LABELS: Record<string, string> = {
  VISITOR: "访客预约",
  VENUE: "场地预约",
  MEETING: "会议室预约",
  EQUIPMENT: "设备租赁",
};

export const PARK_RESOURCE_KINDS = ["VENUE", "MEETING", "EQUIPMENT"] as const;
export type ParkResourceKind = (typeof PARK_RESOURCE_KINDS)[number];
export const PARK_RESOURCE_KIND_LABELS: Record<string, string> = {
  VENUE: "场地",
  MEETING: "会议室",
  EQUIPMENT: "设备",
};

export const PARK_RESOURCE_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type ParkResourceStatus = (typeof PARK_RESOURCE_STATUSES)[number];
export const PARK_RESOURCE_STATUS_LABELS: Record<string, string> = {
  ONLINE: "开放",
  OFFLINE: "关闭",
};

export const PARK_RESERVATION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELED",
  "CHECKED_IN",
  "COMPLETED",
  "EXPIRED",
] as const;
export type ParkReservationStatus = (typeof PARK_RESERVATION_STATUSES)[number];
export const PARK_RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  CANCELED: "已取消",
  CHECKED_IN: "已核验",
  COMPLETED: "已完成",
  EXPIRED: "已过期",
};

export const PARK_WORK_ORDER_CATEGORIES = ["REPAIR", "COMPLAINT", "CLEANING", "OTHER"] as const;
export type ParkWorkOrderCategory = (typeof PARK_WORK_ORDER_CATEGORIES)[number];
export const PARK_WORK_ORDER_CATEGORY_LABELS: Record<string, string> = {
  REPAIR: "报修",
  COMPLAINT: "投诉建议",
  CLEANING: "保洁",
  OTHER: "其他",
};

export const PARK_WORK_ORDER_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "PROCESSING",
  "DONE",
  "CLOSED",
  "CANCELED",
] as const;
export type ParkWorkOrderStatus = (typeof PARK_WORK_ORDER_STATUSES)[number];
export const PARK_WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "待派单",
  ASSIGNED: "已派单",
  PROCESSING: "处理中",
  DONE: "已完成",
  CLOSED: "已关闭",
  CANCELED: "已取消",
};

export const PARK_ANNOUNCEMENT_CATEGORIES = ["NOTICE", "POLICY", "PARTY", "ACTIVITY"] as const;
export type ParkAnnouncementCategory = (typeof PARK_ANNOUNCEMENT_CATEGORIES)[number];
export const PARK_ANNOUNCEMENT_CATEGORY_LABELS: Record<string, string> = {
  NOTICE: "园区公告",
  POLICY: "政策信息",
  PARTY: "党建园地",
  ACTIVITY: "园区活动",
};

export const PARK_ANNOUNCEMENT_STATUSES = ["DRAFT", "PUBLISHED", "OFFLINE"] as const;
export type ParkAnnouncementStatus = (typeof PARK_ANNOUNCEMENT_STATUSES)[number];
export const PARK_ANNOUNCEMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  OFFLINE: "已下线",
};

// ---------------------------------------------------------------- 站点

export const parkSiteInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  logo: text(500).default(""),
  themeColor: text(16).default("#3370FF"),
  province: text(40).default(""),
  city: text(40).default(""),
  district: text(40).default(""),
  addressLine: text(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  phone: text(32).default(""),
  notice: text(500).default(""),
  deskSiteKey: text(64).default(""),
});
export type ParkSiteInput = z.infer<typeof parkSiteInputSchema>;

export const parkSiteSchema = z.object({
  id: z.number(),
  parkCode: text(16),
  name: text(120),
  logo: text(500),
  themeColor: text(16),
  province: text(40),
  city: text(40),
  district: text(40),
  addressLine: text(200),
  lng: z.number(),
  lat: z.number(),
  phone: text(32),
  notice: text(500),
  deskSiteKey: text(64),
  status: z.enum(PARK_SITE_STATUSES),
  statusLabel: text(16),
  buildingCount: z.number(),
  unitCount: z.number(),
  tenantCount: z.number(),
  createdAt: text(40),
});
export type ParkSite = z.infer<typeof parkSiteSchema>;

export const parkSiteStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PARK_SITE_STATUSES),
});
export type ParkSiteStatusBody = z.infer<typeof parkSiteStatusBodySchema>;

// ---------------------------------------------------------------- 楼宇 / 房间

export const parkBuildingInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  floors: z.number().int().min(1).max(200).default(1),
  addressLine: text(200).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
});
export type ParkBuildingInput = z.infer<typeof parkBuildingInputSchema>;

export const parkBuildingSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: text(80),
  floors: z.number(),
  addressLine: text(200),
  sort: z.number(),
  status: text(16),
  unitCount: z.number(),
  createdAt: text(40),
});
export type ParkBuilding = z.infer<typeof parkBuildingSchema>;

export const parkUnitInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  buildingId: z.number().int().positive(),
  roomNo: z.string().trim().min(1).max(40),
  floor: z.number().int().min(-10).max(200).default(1),
  area: z.number().min(0).max(99999999).default(0),
  usage: text(24).default("OFFICE"),
  status: z.enum(PARK_UNIT_STATUSES).default("VACANT"),
  attributes: z.record(z.string(), z.unknown()).default({}),
});
export type ParkUnitInput = z.infer<typeof parkUnitInputSchema>;

export const parkUnitSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  buildingId: z.number(),
  buildingName: text(80),
  roomNo: text(40),
  floor: z.number(),
  area: z.number(),
  usage: text(24),
  status: z.enum(PARK_UNIT_STATUSES),
  statusLabel: text(16),
  tenantId: z.number(),
  tenantName: text(120),
  attributes: z.record(z.string(), z.unknown()),
  createdAt: text(40),
});
export type ParkUnit = z.infer<typeof parkUnitSchema>;

export const parkIdBodySchema = z.object({
  id: z.number().int().positive(),
});

// ---------------------------------------------------------------- 租户 / 员工 / 顾客

export const parkTenantInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  creditCode: text(32).default(""),
  industry: text(40).default(""),
  contactName: text(64).default(""),
  contactPhone: text(32).default(""),
  unitIds: z.array(z.number().int().positive()).max(100).default([]),
  status: z.enum(PARK_TENANT_STATUSES).default("ACTIVE"),
  note: text(500).default(""),
});
export type ParkTenantInput = z.infer<typeof parkTenantInputSchema>;

export const parkTenantSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: text(120),
  creditCode: text(32),
  industry: text(40),
  contactName: text(64),
  contactPhone: text(32),
  unitIds: z.array(z.number()),
  unitNames: z.array(z.string()),
  joinCode: text(12),
  status: z.enum(PARK_TENANT_STATUSES),
  statusLabel: text(16),
  memberCount: z.number(),
  note: text(500),
  createdAt: text(40),
});
export type ParkTenant = z.infer<typeof parkTenantSchema>;

export const parkStaffInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(5).max(32),
  staffCode: z.string().trim().min(3).max(32),
  role: z.enum(PARK_STAFF_ROLES).default("CLERK"),
  department: text(40).default(""),
  status: z.enum(PARK_STAFF_STATUSES).default("ACTIVE"),
});
export type ParkStaffInput = z.infer<typeof parkStaffInputSchema>;

export const parkStaffSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: text(60),
  phone: text(32),
  staffCode: text(32),
  role: z.enum(PARK_STAFF_ROLES),
  roleLabel: text(20),
  department: text(40),
  status: z.enum(PARK_STAFF_STATUSES),
  statusLabel: text(16),
  createdAt: text(40),
});
export type ParkStaff = z.infer<typeof parkStaffSchema>;

export const parkStaffStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PARK_STAFF_STATUSES),
});

export const parkCustomerSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  nickname: text(60),
  phone: text(32),
  avatar: text(500),
  tenantId: z.number(),
  tenantName: text(120),
  memberRole: z.enum(PARK_CUSTOMER_ROLES),
  memberRoleLabel: text(20),
  status: text(16),
  lastLoginAt: text(40),
  createdAt: text(40),
});
export type ParkCustomer = z.infer<typeof parkCustomerSchema>;

export const PARK_ACTIVITY_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export type ParkActivityStatus = (typeof PARK_ACTIVITY_STATUSES)[number];
export const PARK_ACTIVITY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "报名中",
  CLOSED: "已结束",
};

export const PARK_ACTIVITY_SIGNUP_STATUSES = ["SIGNED", "CANCELED"] as const;
export type ParkActivitySignupStatus =
  (typeof PARK_ACTIVITY_SIGNUP_STATUSES)[number];
export const PARK_ACTIVITY_SIGNUP_STATUS_LABELS: Record<string, string> = {
  SIGNED: "已报名",
  CANCELED: "已取消",
};

export const PARK_LEASE_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type ParkLeaseStatus = (typeof PARK_LEASE_STATUSES)[number];
export const PARK_LEASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "生效中",
  ENDED: "已结束",
};

export const PARK_BILL_STATUSES = ["OPEN", "PAID", "OVERDUE", "CANCELED"] as const;
export type ParkBillStatus = (typeof PARK_BILL_STATUSES)[number];
export const PARK_BILL_STATUS_LABELS: Record<string, string> = {
  OPEN: "待收款",
  PAID: "已收款",
  OVERDUE: "已逾期",
  CANCELED: "已取消",
};

export const parkLeaseInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  startDate: z.string().trim().min(8).max(10),
  endDate: z.string().trim().min(8).max(10),
  rentAmount: z.number().min(0).max(99999999).default(0),
  deposit: z.number().min(0).max(99999999).default(0),
  /// MONTH | QUARTER | YEAR
  billingCycle: z.enum(["MONTH", "QUARTER", "YEAR"]).default("MONTH"),
  status: z.enum(PARK_LEASE_STATUSES).default("DRAFT"),
  note: text(500).default(""),
});
export type ParkLeaseInput = z.infer<typeof parkLeaseInputSchema>;

export const parkLeaseSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  tenantId: z.number(),
  tenantName: text(120),
  title: text(160),
  startDate: text(10),
  endDate: text(10),
  rentAmount: z.number(),
  deposit: z.number(),
  billingCycle: text(16),
  status: z.enum(PARK_LEASE_STATUSES),
  statusLabel: text(16),
  note: text(500),
  billCount: z.number(),
  createdAt: text(40),
});
export type ParkLease = z.infer<typeof parkLeaseSchema>;

export const parkBillSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  leaseId: z.number(),
  tenantId: z.number(),
  tenantName: text(120),
  billNo: text(32),
  periodStart: text(10),
  periodEnd: text(10),
  dueDate: text(10),
  amount: z.number(),
  status: z.enum(PARK_BILL_STATUSES),
  statusLabel: text(16),
  paidAt: text(40),
  erpReceivableId: z.number(),
  note: text(500),
  createdAt: text(40),
});
export type ParkBill = z.infer<typeof parkBillSchema>;

export const parkLeaseListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
});

export const parkBillListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  leaseId: z.coerce.number().int().nonnegative().default(0),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkBillGenerateBodySchema = z.object({
  leaseId: z.number().int().positive(),
  periodStart: z.string().trim().min(8).max(10),
  periodEnd: z.string().trim().min(8).max(10),
  dueDate: z.string().trim().min(8).max(10),
  amount: z.number().min(0).max(99999999).optional(),
  note: text(500).default(""),
});
export type ParkBillGenerateBody = z.infer<typeof parkBillGenerateBodySchema>;

export const parkBillActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["paid", "cancel"]),
  note: text(500).default(""),
});
export type ParkBillActionBody = z.infer<typeof parkBillActionBodySchema>;

export const PARK_ORDER_STATUSES = ["PENDING", "PAID", "CANCELED", "REFUNDED"] as const;
export type ParkOrderStatus = (typeof PARK_ORDER_STATUSES)[number];
export const PARK_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "待支付",
  PAID: "已收款",
  CANCELED: "已取消",
  REFUNDED: "已退款",
};

export const PARK_ORDER_BIZ_TYPES = ["VENUE", "WORK_ORDER", "SERVICE", "EQUIPMENT"] as const;
export type ParkOrderBizType = (typeof PARK_ORDER_BIZ_TYPES)[number];
export const PARK_ORDER_BIZ_LABELS: Record<string, string> = {
  VENUE: "场地预约",
  WORK_ORDER: "工单费用",
  SERVICE: "园区服务",
  EQUIPMENT: "设备租赁",
};

export const parkOrderSchema = z.object({
  id: z.number(),
  orderNo: text(32),
  siteId: z.number(),
  customerId: z.number(),
  tenantId: z.number(),
  bizType: z.enum(PARK_ORDER_BIZ_TYPES),
  bizLabel: text(20),
  bizId: z.number(),
  title: text(160),
  amount: z.number(),
  status: z.enum(PARK_ORDER_STATUSES),
  statusLabel: text(16),
  payMethod: text(16),
  paidAt: text(40),
  note: text(500),
  createdAt: text(40),
});
export type ParkOrder = z.infer<typeof parkOrderSchema>;

export const parkOrderListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: z.string().trim().max(16).default(""),
  bizType: z.string().trim().max(24).default(""),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkOrderActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["paid", "refund", "cancel"]),
  note: text(500).default(""),
});
export type ParkOrderActionBody = z.infer<typeof parkOrderActionBodySchema>;

export const parkActivityInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  cover: text(500).default(""),
  summary: text(300).default(""),
  content: z.string().max(200_000).default(""),
  location: text(200).default(""),
  startAt: z.string().trim().min(1).max(40),
  endAt: z.string().trim().min(1).max(40),
  signupDeadline: text(40).default(""),
  capacity: z.number().int().min(0).max(100000).default(0),
  status: z.enum(PARK_ACTIVITY_STATUSES).default("DRAFT"),
});
export type ParkActivityInput = z.infer<typeof parkActivityInputSchema>;

export const parkActivitySchema = z.object({
  id: z.number(),
  siteId: z.number(),
  title: text(160),
  cover: text(500),
  summary: text(300),
  content: z.string(),
  location: text(200),
  startAt: text(40),
  endAt: text(40),
  signupDeadline: text(40),
  capacity: z.number(),
  signupCount: z.number(),
  remaining: z.number(),
  status: z.enum(PARK_ACTIVITY_STATUSES),
  statusLabel: text(16),
  createdAt: text(40),
});
export type ParkActivity = z.infer<typeof parkActivitySchema>;

export const parkActivitySignupSchema = z.object({
  id: z.number(),
  activityId: z.number(),
  name: text(60),
  phone: text(32),
  tenantId: z.number(),
  status: z.enum(PARK_ACTIVITY_SIGNUP_STATUSES),
  statusLabel: text(16),
  note: text(500),
  createdAt: text(40),
});
export type ParkActivitySignup = z.infer<typeof parkActivitySignupSchema>;

export const parkActivityStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PARK_ACTIVITY_STATUSES),
});

export const parkActivityListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
});

export const parkActivitySignupsQuerySchema = z.object({
  activityId: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------- 公告

export const parkAnnouncementInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  category: z.enum(PARK_ANNOUNCEMENT_CATEGORIES).default("NOTICE"),
  title: z.string().trim().min(1).max(160),
  summary: text(300).default(""),
  content: z.string().max(200_000).default(""),
  cover: text(500).default(""),
  pinned: z.boolean().default(false),
  status: z.enum(PARK_ANNOUNCEMENT_STATUSES).default("DRAFT"),
});
export type ParkAnnouncementInput = z.infer<typeof parkAnnouncementInputSchema>;

export const parkAnnouncementSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  category: z.enum(PARK_ANNOUNCEMENT_CATEGORIES),
  categoryLabel: text(20),
  title: text(160),
  summary: text(300),
  content: z.string(),
  cover: text(500),
  pinned: z.boolean(),
  status: z.enum(PARK_ANNOUNCEMENT_STATUSES),
  statusLabel: text(16),
  publishedAt: text(40),
  createdAt: text(40),
});
export type ParkAnnouncement = z.infer<typeof parkAnnouncementSchema>;

export const parkAnnouncementStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PARK_ANNOUNCEMENT_STATUSES),
});

// ---------------------------------------------------------------- 审批

export const parkApprovalNodeSchema = z.object({
  name: text(60).default("审批"),
  approverType: z.enum(["STAFF", "TENANT_ADMIN"]).default("STAFF"),
  role: z.enum(PARK_STAFF_ROLES).default("APPROVER"),
  staffIds: z.array(z.number().int().positive()).max(50).default([]),
  mode: z.enum(["ANY", "ALL", "SEQUENTIAL"]).default("ANY"),
});
export type ParkApprovalNode = z.infer<typeof parkApprovalNodeSchema>;

export const parkApprovalFlowInputSchema = z.object({
  siteId: z.number().int().positive(),
  bizType: z.enum(PARK_APPROVAL_BIZ_TYPES),
  name: z.string().trim().min(1).max(80),
  nodes: z.array(parkApprovalNodeSchema).min(1).max(10),
  enabled: z.boolean().default(true),
});
export type ParkApprovalFlowInput = z.infer<typeof parkApprovalFlowInputSchema>;

export const parkApprovalFlowSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  bizType: z.enum(PARK_APPROVAL_BIZ_TYPES),
  bizLabel: text(20),
  name: text(80),
  nodes: z.array(parkApprovalNodeSchema),
  enabled: z.boolean(),
  version: z.number(),
  updatedAt: text(40),
});
export type ParkApprovalFlow = z.infer<typeof parkApprovalFlowSchema>;

export const parkApprovalTaskSchema = z.object({
  id: z.number(),
  nodeIndex: z.number(),
  nodeName: text(60),
  approverType: text(16),
  approverId: z.number(),
  approverName: text(60),
  status: text(16),
  action: text(16),
  comment: text(500),
  actedAt: text(40),
});

export const parkApprovalLogSchema = z.object({
  id: z.number(),
  action: text(16),
  operatorName: text(60),
  comment: text(500),
  createdAt: text(40),
});

export const parkApprovalSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  bizType: z.enum(PARK_APPROVAL_BIZ_TYPES),
  bizLabel: text(20),
  bizId: z.number(),
  title: text(160),
  applicantType: text(16),
  applicantName: text(60),
  tenantId: z.number(),
  status: z.enum(PARK_APPROVAL_STATUSES),
  statusLabel: text(16),
  currentNode: z.number(),
  submittedAt: text(40),
  createdAt: text(40),
});
export type ParkApproval = z.infer<typeof parkApprovalSchema>;

export const parkApprovalDetailSchema = parkApprovalSchema.extend({
  formData: z.record(z.string(), z.unknown()),
  tasks: z.array(parkApprovalTaskSchema),
  logs: z.array(parkApprovalLogSchema),
});
export type ParkApprovalDetail = z.infer<typeof parkApprovalDetailSchema>;

export const parkApprovalActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject", "withdraw"]),
  comment: text(500).default(""),
});
export type ParkApprovalActionBody = z.infer<typeof parkApprovalActionBodySchema>;

// ---------------------------------------------------------------- 预约 / 访客

export const parkReservationSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  kind: z.enum(PARK_RESERVATION_KINDS),
  kindLabel: text(20),
  applicantName: text(60),
  applicantPhone: text(32),
  visitorName: text(60),
  visitorPhone: text(32),
  visitorCompany: text(120),
  plateNo: text(20),
  companions: z.number(),
  quantity: z.number(),
  depositAmount: z.number(),
  buildingId: z.number(),
  unitId: z.number(),
  resourceName: text(120),
  startAt: text(40),
  endAt: text(40),
  purpose: text(200),
  note: text(500),
  status: z.enum(PARK_RESERVATION_STATUSES),
  statusLabel: text(16),
  approvalId: z.number(),
  checkedInAt: text(40),
  createdAt: text(40),
});
export type ParkReservation = z.infer<typeof parkReservationSchema>;

export const parkResourceScheduleSchema = z.object({
  start: text(5).default("09:00"),
  end: text(5).default("18:00"),
  stepMin: z.number().int().min(15).max(480).default(60),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
});
export type ParkResourceSchedule = z.infer<typeof parkResourceScheduleSchema>;

export const parkResourceInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  buildingId: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PARK_RESOURCE_KINDS).default("MEETING"),
  capacity: z.number().int().min(1).max(10000).default(1),
  location: text(200).default(""),
  description: z.string().max(2000).default(""),
  cover: text(500).default(""),
  /// 单次预约/日租费用；0 = 免费
  feeAmount: z.number().min(0).max(99999999).default(0),
  stock: z.number().int().min(1).max(100000).default(1),
  deposit: z.number().min(0).max(99999999).default(0),
  approvalRequired: z.boolean().default(true),
  schedule: parkResourceScheduleSchema.default(() => ({
    start: "09:00",
    end: "18:00",
    stepMin: 60,
    weekdays: [1, 2, 3, 4, 5],
  })),
  status: z.enum(PARK_RESOURCE_STATUSES).default("ONLINE"),
  sort: z.number().int().min(0).max(9999).default(0),
});
export type ParkResourceInput = z.infer<typeof parkResourceInputSchema>;

export const parkResourceSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  buildingId: z.number(),
  buildingName: text(80),
  name: text(120),
  kind: z.enum(PARK_RESOURCE_KINDS),
  kindLabel: text(20),
  capacity: z.number(),
  location: text(200),
  description: z.string(),
  cover: text(500),
  feeAmount: z.number(),
  stock: z.number(),
  deposit: z.number(),
  approvalRequired: z.boolean(),
  schedule: parkResourceScheduleSchema,
  status: z.enum(PARK_RESOURCE_STATUSES),
  statusLabel: text(16),
  eventId: z.number(),
  slug: text(48),
  slots: z.array(z.object({
    id: z.number(),
    startAt: text(40),
    endAt: text(40),
    label: text(40),
    booked: z.boolean(),
  })).default([]),
  createdAt: text(40),
});
export type ParkResource = z.infer<typeof parkResourceSchema>;

export const parkResourceStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PARK_RESOURCE_STATUSES),
});

export const parkResourceGenerateBodySchema = z.object({
  resourceId: z.number().int().positive(),
  date: z.string().trim().min(8).max(10),
  startTime: text(5).default("09:00"),
  endTime: text(5).default("18:00"),
  stepMin: z.number().int().min(15).max(480).default(60),
});
export type ParkResourceGenerateBody = z.infer<typeof parkResourceGenerateBodySchema>;

export const parkResourceListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
});

export const parkResourceSlotsQuerySchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  from: text(40).optional(),
  to: text(40).optional(),
});

export const parkResourceIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const parkCustomerRoleBodySchema = z.object({
  id: z.number().int().positive(),
  memberRole: z.enum(PARK_CUSTOMER_ROLES),
});
export type ParkCustomerRoleBody = z.infer<typeof parkCustomerRoleBodySchema>;

export const parkReservationActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject", "cancel", "checkin", "complete"]),
  comment: text(500).default(""),
});
export type ParkReservationActionBody = z.infer<typeof parkReservationActionBodySchema>;

// ---------------------------------------------------------------- 工单

export const parkWorkOrderSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  orderNo: text(32),
  category: z.enum(PARK_WORK_ORDER_CATEGORIES),
  categoryLabel: text(20),
  title: text(120),
  reporterName: text(60),
  reporterPhone: text(32),
  buildingId: z.number(),
  unitId: z.number(),
  location: text(200),
  urgency: text(16),
  status: z.enum(PARK_WORK_ORDER_STATUSES),
  statusLabel: text(16),
  assigneeStaffId: z.number(),
  assigneeName: text(60),
  rating: z.number(),
  finishedAt: text(40),
  createdAt: text(40),
});
export type ParkWorkOrder = z.infer<typeof parkWorkOrderSchema>;

export const parkWorkOrderLogSchema = z.object({
  id: z.number(),
  action: text(24),
  operatorName: text(60),
  note: text(500),
  createdAt: text(40),
});

export const parkWorkOrderDetailSchema = parkWorkOrderSchema.extend({
  description: z.string(),
  images: z.array(z.string()),
  result: z.string(),
  feeAmount: z.number(),
  ratingComment: text(300),
  logs: z.array(parkWorkOrderLogSchema),
});
export type ParkWorkOrderDetail = z.infer<typeof parkWorkOrderDetailSchema>;

export const parkWorkOrderAssignBodySchema = z.object({
  id: z.number().int().positive(),
  staffId: z.number().int().positive(),
  note: text(500).default(""),
});
export type ParkWorkOrderAssignBody = z.infer<typeof parkWorkOrderAssignBodySchema>;

export const parkWorkOrderActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["accept", "process", "done", "close", "cancel"]),
  note: text(500).default(""),
  result: text(3000).default(""),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  feeAmount: z.number().min(0).max(99999999).default(0),
});
export type ParkWorkOrderActionBody = z.infer<typeof parkWorkOrderActionBodySchema>;

// ---------------------------------------------------------------- 概览 / 查询

export const parkOverviewSchema = z.object({
  siteCount: z.number(),
  onlineSiteCount: z.number(),
  tenantCount: z.number(),
  customerCount: z.number(),
  pendingReservations: z.number(),
  pendingWorkOrders: z.number(),
  todayCheckins: z.number(),
  recentReservations: z.array(parkReservationSchema),
  recentWorkOrders: z.array(parkWorkOrderSchema),
});
export type ParkOverview = z.infer<typeof parkOverviewSchema>;

export const parkSiteListQuerySchema = z.object({
  status: z.string().trim().max(16).default(""),
});

export const parkBuildingListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
});

export const parkUnitListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  buildingId: z.coerce.number().int().nonnegative().default(0),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
});

export const parkTenantListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
});

export const parkStaffListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: z.string().trim().max(16).default(""),
  role: z.string().trim().max(20).default(""),
  keyword: text(60).default(""),
});

export const parkCustomerListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  tenantId: z.coerce.number().int().nonnegative().default(0),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkAnnouncementListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  category: z.string().trim().max(24).default(""),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
});

export const parkApprovalListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  bizType: z.string().trim().max(24).default(""),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkReservationListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  kind: z.string().trim().max(16).default(""),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkReservationDetailQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const parkWorkOrderListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  category: z.string().trim().max(24).default(""),
  status: z.string().trim().max(16).default(""),
  keyword: text(60).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const parkWorkOrderDetailQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const parkFlowQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  bizType: z.enum(PARK_APPROVAL_BIZ_TYPES),
});

export const parkPageSchema = <T extends z.ZodType>(row: T) =>
  pageSchema(row);

// ---------------------------------------------------------------- 端点清单

const get = <Q extends z.ZodType, R extends z.ZodType>(
  path: string,
  query: Q,
  response: R,
) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query,
  body: z.undefined(),
  response: envelope(response),
});

const post = <B extends z.ZodType, R extends z.ZodType>(
  path: string,
  body: B,
  response: R,
) => ({
  method: "post" as const,
  path,
  params: z.object({}),
  query: emptyQuery,
  body,
  response: envelope(response),
});

const getWithId = <R extends z.ZodType>(
  path: string,
  query: z.ZodObject<z.ZodRawShape>,
  response: R,
) => ({
  method: "get" as const,
  path,
  params: z.object({ id: z.string() }),
  query,
  body: z.undefined(),
  response: envelope(response),
});

/**
 * 园区管理端点：`Park_` 前缀由 `moduleHandlers` 按 operationId 后缀自动挂到
 * `ParkController` 同名方法；C 端与员工端公开通道手写在 `park.public.ts`。
 */
export const parkEndpoints = {
  Park_meta: get("/enterprise/park/meta", emptyQuery, z.object({
    sites: z.array(parkSiteSchema),
    siteStatuses: z.array(z.object({
      value: z.enum(PARK_SITE_STATUSES),
      label: text(16),
    })),
    staffRoles: z.array(z.object({
      value: z.enum(PARK_STAFF_ROLES),
      label: text(20),
    })),
  })),

  Park_overview: get(
    "/enterprise/park/overview",
    z.object({ siteId: z.coerce.number().int().positive().optional() }),
    parkOverviewSchema,
  ),

  Park_sites: get("/enterprise/park/site/list", parkSiteListQuerySchema, z.array(parkSiteSchema)),
  Park_siteSave: post("/enterprise/park/site/save", parkSiteInputSchema, parkSiteSchema),
  Park_siteStatus: post("/enterprise/park/site/status", parkSiteStatusBodySchema, parkSiteSchema),

  Park_buildings: get(
    "/enterprise/park/building/list",
    parkBuildingListQuerySchema,
    z.array(parkBuildingSchema),
  ),
  Park_buildingSave: post(
    "/enterprise/park/building/save",
    parkBuildingInputSchema,
    parkBuildingSchema,
  ),
  Park_buildingRemove: post("/enterprise/park/building/remove", parkIdBodySchema, okResult),

  Park_units: get("/enterprise/park/unit/list", parkUnitListQuerySchema, z.array(parkUnitSchema)),
  Park_unitSave: post("/enterprise/park/unit/save", parkUnitInputSchema, parkUnitSchema),
  Park_unitRemove: post("/enterprise/park/unit/remove", parkIdBodySchema, okResult),

  Park_tenants: get(
    "/enterprise/park/tenant/list",
    parkTenantListQuerySchema,
    z.array(parkTenantSchema),
  ),
  Park_tenantSave: post("/enterprise/park/tenant/save", parkTenantInputSchema, parkTenantSchema),
  Park_tenantRemove: post("/enterprise/park/tenant/remove", parkIdBodySchema, okResult),

  Park_staffs: get(
    "/enterprise/park/staff/list",
    parkStaffListQuerySchema,
    z.array(parkStaffSchema),
  ),
  Park_staffSave: post("/enterprise/park/staff/save", parkStaffInputSchema, parkStaffSchema),
  Park_staffStatus: post("/enterprise/park/staff/status", parkStaffStatusBodySchema, parkStaffSchema),

  Park_customers: get(
    "/enterprise/park/customer/list",
    parkCustomerListQuerySchema,
    parkPageSchema(parkCustomerSchema),
  ),

  Park_customerRole: post(
    "/enterprise/park/customer/role",
    parkCustomerRoleBodySchema,
    parkCustomerSchema,
  ),

  Park_announcements: get(
    "/enterprise/park/announcement/list",
    parkAnnouncementListQuerySchema,
    z.array(parkAnnouncementSchema),
  ),
  Park_announcementSave: post(
    "/enterprise/park/announcement/save",
    parkAnnouncementInputSchema,
    parkAnnouncementSchema,
  ),
  Park_announcementStatus: post(
    "/enterprise/park/announcement/status",
    parkAnnouncementStatusBodySchema,
    parkAnnouncementSchema,
  ),
  Park_announcementRemove: post(
    "/enterprise/park/announcement/remove",
    parkIdBodySchema,
    okResult,
  ),

  Park_approvals: get(
    "/enterprise/park/approval/list",
    parkApprovalListQuerySchema,
    parkPageSchema(parkApprovalSchema),
  ),
  Park_approvalDetail: getWithId(
    "/enterprise/park/approval/:id",
    emptyQuery,
    parkApprovalDetailSchema,
  ),
  Park_approvalAction: post(
    "/enterprise/park/approval/action",
    parkApprovalActionBodySchema,
    parkApprovalDetailSchema,
  ),

  Park_resources: get(
    "/enterprise/park/resource/list",
    parkResourceListQuerySchema,
    z.array(parkResourceSchema),
  ),
  Park_resourceSave: post(
    "/enterprise/park/resource/save",
    parkResourceInputSchema,
    parkResourceSchema,
  ),
  Park_resourceStatus: post(
    "/enterprise/park/resource/status",
    parkResourceStatusBodySchema,
    parkResourceSchema,
  ),
  Park_resourceRemove: post(
    "/enterprise/park/resource/remove",
    parkResourceIdBodySchema,
    okResult,
  ),
  Park_resourceSlots: get(
    "/enterprise/park/resource/slots",
    parkResourceSlotsQuerySchema,
    parkResourceSchema.shape.slots,
  ),
  Park_resourceGenerateSlots: post(
    "/enterprise/park/resource/slots/generate",
    parkResourceGenerateBodySchema,
    parkResourceSchema.shape.slots,
  ),

  Park_reservations: get(
    "/enterprise/park/reservation/list",
    parkReservationListQuerySchema,
    parkPageSchema(parkReservationSchema),
  ),
  Park_reservationDetail: get(
    "/enterprise/park/reservation/detail",
    parkReservationDetailQuerySchema,
    parkReservationSchema,
  ),
  Park_reservationAction: post(
    "/enterprise/park/reservation/action",
    parkReservationActionBodySchema,
    parkReservationSchema,
  ),

  Park_workOrders: get(
    "/enterprise/park/work-order/list",
    parkWorkOrderListQuerySchema,
    parkPageSchema(parkWorkOrderSchema),
  ),
  Park_workOrderDetail: get(
    "/enterprise/park/work-order/detail",
    parkWorkOrderDetailQuerySchema,
    parkWorkOrderDetailSchema,
  ),
  Park_workOrderAssign: post(
    "/enterprise/park/work-order/assign",
    parkWorkOrderAssignBodySchema,
    parkWorkOrderDetailSchema,
  ),
  Park_workOrderAction: post(
    "/enterprise/park/work-order/action",
    parkWorkOrderActionBodySchema,
    parkWorkOrderDetailSchema,
  ),

  Park_activities: get(
    "/enterprise/park/activity/list",
    parkActivityListQuerySchema,
    z.array(parkActivitySchema),
  ),
  Park_activitySave: post(
    "/enterprise/park/activity/save",
    parkActivityInputSchema,
    parkActivitySchema,
  ),
  Park_activityStatus: post(
    "/enterprise/park/activity/status",
    parkActivityStatusBodySchema,
    parkActivitySchema,
  ),
  Park_activityRemove: post(
    "/enterprise/park/activity/remove",
    parkIdBodySchema,
    okResult,
  ),
  Park_activitySignups: get(
    "/enterprise/park/activity/signup/list",
    parkActivitySignupsQuerySchema,
    z.array(parkActivitySignupSchema),
  ),

  Park_leases: get(
    "/enterprise/park/lease/list",
    parkLeaseListQuerySchema,
    z.array(parkLeaseSchema),
  ),
  Park_leaseSave: post(
    "/enterprise/park/lease/save",
    parkLeaseInputSchema,
    parkLeaseSchema,
  ),
  Park_leaseStatus: post(
    "/enterprise/park/lease/status",
    z.object({ id: z.number().int().positive(), status: z.enum(PARK_LEASE_STATUSES) }),
    parkLeaseSchema,
  ),
  Park_leaseRemove: post(
    "/enterprise/park/lease/remove",
    parkIdBodySchema,
    okResult,
  ),
  Park_bills: get(
    "/enterprise/park/bill/list",
    parkBillListQuerySchema,
    parkPageSchema(parkBillSchema),
  ),
  Park_billGenerate: post(
    "/enterprise/park/bill/generate",
    parkBillGenerateBodySchema,
    parkBillSchema,
  ),
  Park_billAction: post(
    "/enterprise/park/bill/action",
    parkBillActionBodySchema,
    parkBillSchema,
  ),

  Park_orders: get(
    "/enterprise/park/order/list",
    parkOrderListQuerySchema,
    parkPageSchema(parkOrderSchema),
  ),
  Park_orderAction: post(
    "/enterprise/park/order/action",
    parkOrderActionBodySchema,
    parkOrderSchema,
  ),

  Park_flow: get(
    "/enterprise/park/approval-flow",
    parkFlowQuerySchema,
    parkApprovalFlowSchema.nullable(),
  ),
  Park_flowSave: post(
    "/enterprise/park/approval-flow/save",
    parkApprovalFlowInputSchema,
    parkApprovalFlowSchema,
  ),

  Park_wechat: (() => {
    const schema = miniAppViewSchema;
    return {
      method: "get" as const,
      path: "/enterprise/park/sites/:id/wechat",
      params: z.object({ id: z.string() }),
      query: emptyQuery,
      body: z.undefined(),
      response: envelope(schema),
    };
  })(),
  Park_saveWechat: (() => {
    const schema = miniAppViewSchema;
    return {
      method: "post" as const,
      path: "/enterprise/park/sites/:id/wechat",
      params: z.object({ id: z.string() }),
      query: emptyQuery,
      body: miniAppInputSchema,
      response: envelope(schema),
    };
  })(),
  Park_testWechat: (() => {
    const schema = miniAppTestResultSchema;
    return {
      method: "post" as const,
      path: "/enterprise/park/sites/:id/wechat/test",
      params: z.object({ id: z.string() }),
      query: emptyQuery,
      body: z.undefined(),
      response: envelope(schema),
    };
  })(),
  /** 源码分发包：按当前模板现打 zip，包内不含账号参数；园区码与 AppID 由用户自己填。 */
  Park_package: (() => {
    const schema = z.object({
      url: z.string(),
      fileName: z.string(),
      fileSize: z.number(),
      sha256: z.string(),
    });
    return {
      method: "get" as const,
      path: "/enterprise/park/sites/:id/package",
      params: z.object({ id: z.string() }),
      query: emptyQuery,
      body: z.undefined(),
      response: envelope(schema),
    };
  })(),
};
