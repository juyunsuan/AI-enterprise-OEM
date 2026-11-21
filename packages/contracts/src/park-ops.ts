import { z } from "zod";
import { pageSchema } from "./pagination";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });
const text = (max: number) => z.string().trim().max(max);
const page = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const PARK_INVOICE_STATUSES = ["ISSUED", "VOID"] as const;
export const PARK_INVOICE_STATUS_LABELS: Record<string, string> = {
  ISSUED: "已开具",
  VOID: "已作废",
};
export const PARK_INVOICE_BIZ_TYPES = ["ORDER", "BILL"] as const;
export const PARK_INVOICE_BIZ_LABELS: Record<string, string> = {
  ORDER: "订单",
  BILL: "账单",
};

export const parkInvoiceSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  bizType: z.enum(PARK_INVOICE_BIZ_TYPES),
  bizLabel: text(16),
  bizId: z.number(),
  customerId: z.number(),
  tenantId: z.number(),
  title: text(160),
  taxNo: text(32),
  amount: z.number(),
  status: z.enum(PARK_INVOICE_STATUSES),
  statusLabel: text(16),
  issuedAt: text(40),
  note: text(500),
  createdAt: text(40),
});
export type ParkInvoice = z.infer<typeof parkInvoiceSchema>;

export const parkInvoiceInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  bizType: z.enum(PARK_INVOICE_BIZ_TYPES).default("ORDER"),
  bizId: z.number().int().nonnegative().default(0),
  customerId: z.number().int().nonnegative().default(0),
  tenantId: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(1).max(160),
  taxNo: text(32).default(""),
  amount: z.number().min(0).max(99999999).default(0),
  status: z.enum(PARK_INVOICE_STATUSES).default("ISSUED"),
  note: text(500).default(""),
});
export type ParkInvoiceInput = z.infer<typeof parkInvoiceInputSchema>;

export const parkInvoiceListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: text(16).default(""),
  keyword: text(60).default(""),
});

export const PARK_PATROL_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const PARK_PATROL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
};
export const parkPatrolPointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: text(32).default(""),
});
export const parkPatrolPlanInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  points: z.array(parkPatrolPointSchema).min(1).max(100),
  staffIds: z.array(z.number().int().positive()).max(100).default([]),
  status: z.enum(PARK_PATROL_STATUSES).default("ACTIVE"),
  note: text(500).default(""),
});
export type ParkPatrolPlanInput = z.infer<typeof parkPatrolPlanInputSchema>;
export const parkPatrolPlanSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: text(120),
  points: z.array(parkPatrolPointSchema),
  staffIds: z.array(z.number()),
  status: z.enum(PARK_PATROL_STATUSES),
  statusLabel: text(16),
  note: text(500),
  recordCount: z.number(),
  createdAt: text(40),
});
export type ParkPatrolPlan = z.infer<typeof parkPatrolPlanSchema>;
export const parkPatrolRecordSchema = z.object({
  id: z.number(),
  planId: z.number(),
  staffId: z.number(),
  staffName: text(60),
  pointName: text(120),
  result: text(16),
  note: text(500),
  images: z.array(z.string()),
  createdAt: text(40),
});
export type ParkPatrolRecord = z.infer<typeof parkPatrolRecordSchema>;

export const PARK_PARKING_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;
export const PARK_PARKING_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  EXPIRED: "已过期",
};
export const PARK_VEHICLE_TYPES = ["CAR", "BIKE", "TRUCK"] as const;
export const PARK_VEHICLE_TYPE_LABELS: Record<string, string> = {
  CAR: "小型车",
  BIKE: "两轮车",
  TRUCK: "货车",
};
export const parkParkingPermitSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  tenantId: z.number(),
  customerId: z.number(),
  plateNo: text(20),
  vehicleType: z.enum(PARK_VEHICLE_TYPES),
  vehicleTypeLabel: text(16),
  validFrom: text(10),
  validTo: text(10),
  status: z.enum(PARK_PARKING_STATUSES),
  statusLabel: text(16),
  note: text(500),
  createdAt: text(40),
});
export type ParkParkingPermit = z.infer<typeof parkParkingPermitSchema>;
export const parkParkingApplyBodySchema = z.object({
  plateNo: z.string().trim().min(2).max(20),
  vehicleType: z.enum(PARK_VEHICLE_TYPES).default("CAR"),
  validFrom: text(10).default(""),
  validTo: text(10).default(""),
  note: text(500).default(""),
});
export const parkParkingActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
  note: text(500).default(""),
});
export const parkParkingListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  status: text(16).default(""),
  keyword: text(60).default(""),
});

export const PARK_ASSET_STATUSES = ["IN_USE", "IDLE", "REPAIRED", "SCRAPPED"] as const;
export const PARK_ASSET_STATUS_LABELS: Record<string, string> = {
  IN_USE: "在用",
  IDLE: "闲置",
  REPAIRED: "维修中",
  SCRAPPED: "已报废",
};
export const parkAssetInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  category: text(40).default("EQUIPMENT"),
  location: text(200).default(""),
  status: z.enum(PARK_ASSET_STATUSES).default("IN_USE"),
  assigneeStaffId: z.number().int().nonnegative().default(0),
  assigneeName: text(60).default(""),
  purchaseDate: text(10).default(""),
  value: z.number().min(0).max(99999999).default(0),
  note: text(500).default(""),
});
export type ParkAssetInput = z.infer<typeof parkAssetInputSchema>;
export const parkAssetSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: text(120),
  category: text(40),
  location: text(200),
  status: z.enum(PARK_ASSET_STATUSES),
  statusLabel: text(16),
  assigneeStaffId: z.number(),
  assigneeName: text(60),
  purchaseDate: text(10),
  value: z.number(),
  note: text(500),
  createdAt: text(40),
});
export type ParkAsset = z.infer<typeof parkAssetSchema>;

export const PARK_METER_TYPES = ["WATER", "ELECTRIC", "GAS"] as const;
export const PARK_METER_TYPE_LABELS: Record<string, string> = {
  WATER: "水表",
  ELECTRIC: "电表",
  GAS: "燃气表",
};
export const parkMeterInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  meterType: z.enum(PARK_METER_TYPES).default("ELECTRIC"),
  meterNo: text(40).default(""),
  unitId: z.number().int().nonnegative().default(0),
  period: z.string().trim().min(4).max(10),
  reading: z.number().min(0).max(999999999).default(0),
  amount: z.number().min(0).max(99999999).default(0),
  note: text(500).default(""),
});
export type ParkMeterInput = z.infer<typeof parkMeterInputSchema>;
export const parkMeterSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  meterType: z.enum(PARK_METER_TYPES),
  meterTypeLabel: text(16),
  meterNo: text(40),
  unitId: z.number(),
  period: text(10),
  reading: z.number(),
  amount: z.number(),
  note: text(500),
  createdAt: text(40),
});
export type ParkMeter = z.infer<typeof parkMeterSchema>;

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
const idBody = z.object({ id: z.number().int().positive() });

export const parkOpsEndpoints = {
  Park_invoices: get(
    "/enterprise/park/invoice/list",
    parkInvoiceListQuerySchema,
    z.array(parkInvoiceSchema),
  ),
  Park_invoiceIssue: post(
    "/enterprise/park/invoice/issue",
    parkInvoiceInputSchema,
    parkInvoiceSchema,
  ),
  Park_invoiceVoid: post("/enterprise/park/invoice/void", idBody, okResult),

  Park_patrolPlans: get(
    "/enterprise/park/patrol/plan/list",
    z.object({ siteId: z.coerce.number().int().positive() }),
    z.array(parkPatrolPlanSchema),
  ),
  Park_patrolPlanSave: post(
    "/enterprise/park/patrol/plan/save",
    parkPatrolPlanInputSchema,
    parkPatrolPlanSchema,
  ),
  Park_patrolPlanRemove: post(
    "/enterprise/park/patrol/plan/remove",
    idBody,
    okResult,
  ),
  Park_patrolRecords: get(
    "/enterprise/park/patrol/record/list",
    z.object({
      siteId: z.coerce.number().int().positive(),
      planId: z.coerce.number().int().nonnegative().default(0),
      ...page.shape,
    }),
    pageSchema(parkPatrolRecordSchema),
  ),

  Park_parkingPermits: get(
    "/enterprise/park/parking/list",
    parkParkingListQuerySchema,
    z.array(parkParkingPermitSchema),
  ),
  Park_parkingPermitAction: post(
    "/enterprise/park/parking/action",
    parkParkingActionBodySchema,
    parkParkingPermitSchema,
  ),

  Park_assets: get(
    "/enterprise/park/asset/list",
    z.object({ siteId: z.coerce.number().int().positive() }),
    z.array(parkAssetSchema),
  ),
  Park_assetSave: post(
    "/enterprise/park/asset/save",
    parkAssetInputSchema,
    parkAssetSchema,
  ),
  Park_assetRemove: post("/enterprise/park/asset/remove", idBody, okResult),

  Park_meters: get(
    "/enterprise/park/meter/list",
    z.object({ siteId: z.coerce.number().int().positive() }),
    z.array(parkMeterSchema),
  ),
  Park_meterSave: post(
    "/enterprise/park/meter/save",
    parkMeterInputSchema,
    parkMeterSchema,
  ),
  Park_meterRemove: post("/enterprise/park/meter/remove", idBody, okResult),
};
