import { z } from "@enterprise/contracts";
import {
  apiEnvelope,
  endpoints,
  mpAfterSaleAuditBodySchema,
  mpAfterSaleManageListQuerySchema,
  mpAfterSaleReceiveBodySchema,
  mpMerchantApplyBodySchema,
  mpMerchantEndpoints,
  mpMerchantLoginBodySchema,
  mpMerchantOptionsSchema,
  mpMerchantPasswordBodySchema,
  mpMerchantSessionSchema,
  mpMerchantShopSaveBodySchema,
  mpMerchantShopStatusBodySchema,
  mpMerchantStaffSaveBodySchema,
  mpMerchantStaffStatusBodySchema,
  mpOrderListQuerySchema,
  mpProductIdBodySchema,
  mpProductListQuerySchema,
  mpProductSaveBodySchema,
  mpProductStatusBodySchema,
  mpRefundIdBodySchema,
  mpRefundListQuerySchema,
  mpSettlementConfirmBodySchema,
  mpSettlementListQuerySchema,
  mpShopOrderRemarkBodySchema,
  mpShopOrderShipBodySchema,
  mpCouponListQuerySchema,
  mpCouponSaveBodySchema,
  mpCouponStatusBodySchema,
  mpDiyListQuerySchema,
  mpDiyPageIdBodySchema,
  mpDiyPageSaveBodySchema,
  mpWithdrawalApplyBodySchema,
  mpWithdrawalIdBodySchema,
  mpWithdrawalListQuerySchema,
} from "@enterprise/contracts";
import { endpoint } from "./endpoint";
import { http } from "./http";

/**
 * 多店铺商城平台（B2B2C）三套客户端：
 * 1. `marketplaceApi`：市场运营方（站内会话，`/enterprise/marketplace/**`）；
 * 2. `marketplaceAdminApi`：平台管理员台账（`/enterprise/admin/marketplace/**`）；
 * 3. `mpMerchantApi` / `mpPublicApi`：商户后台与入驻（商户令牌 / 免登录公开通道）。
 *
 * 商户通道刻意不走 `endpoint()`：它给路径统一加 `/api/backend` 前缀，
 * 而商户端点挂在 `/api/backend/mp-merchant/**`（同源代理到 `/api/merchant/mp/**`）。
 */
/**
 * 分页 query 序列化：空串/0 也一并带上，后端契约有默认值兜底。
 */
function qs(input: Record<string, unknown>): string {
  return new URLSearchParams(
    Object.entries(input).map(([key, value]) => [key, value == null ? "" : String(value)]),
  ).toString();
}

export const marketplaceApi = {
  overview: endpoint(endpoints.Market_overview),
  detail: endpoint(endpoints.Market_detail),
  create: endpoint(endpoints.Market_create),
  save: endpoint(endpoints.Market_save),
  status: endpoint(endpoints.Market_status),

  appDetail: endpoint(endpoints.Market_appDetail),
  appSave: endpoint(endpoints.Market_appSave),
  appTest: endpoint(endpoints.Market_appTest),
  payTest: endpoint(endpoints.Market_payTest),
  qrcodeGenerate: endpoint(endpoints.Market_qrcodeGenerate),

  categories: endpoint(endpoints.Market_categories),
  categorySave: endpoint(endpoints.Market_categorySave),
  categoryRemove: endpoint(endpoints.Market_categoryRemove),

  merchants: endpoint(endpoints.Market_merchants),
  merchantDetail: endpoint(endpoints.Market_merchantDetail),
  merchantAudit: endpoint(endpoints.Market_merchantAudit),
  merchantStatus: endpoint(endpoints.Market_merchantStatus),

  shops: endpoint(endpoints.Market_shops),
  shopStatus: endpoint(endpoints.Market_shopStatus),

  products: endpoint(endpoints.Market_products),
  productAudits: endpoint(endpoints.Market_productAudits),
  productAudit: endpoint(endpoints.Market_productAudit),

  afterSales: endpoint(endpoints.Market_afterSales),
  afterSaleDetail: endpoint(endpoints.Market_afterSaleDetail),
  afterSaleArbitrate: endpoint(endpoints.Market_afterSaleArbitrate),
  refunds: endpoint(endpoints.Market_refunds),
  refundDetail: endpoint(endpoints.Market_refundDetail),
  payRecords: endpoint(endpoints.Market_payRecords),

  commissionRules: endpoint(endpoints.Market_commissionRules),
  commissionRuleSave: endpoint(endpoints.Market_commissionRuleSave),
  commissionRuleStatus: endpoint(endpoints.Market_commissionRuleStatus),
  settlements: endpoint(endpoints.Market_settlements),
  settlementDetail: endpoint(endpoints.Market_settlementDetail),
  settlementGenerate: endpoint(endpoints.Market_settlementGenerate),
  settlementPaid: endpoint(endpoints.Market_settlementPaid),
  withdrawals: endpoint(endpoints.Market_withdrawals),
  withdrawalAudit: endpoint(endpoints.Market_withdrawalAudit),
  withdrawalPaid: endpoint(endpoints.Market_withdrawalPaid),

  diyWidgets: endpoint(endpoints.Market_diyWidgets),
  diyList: endpoint(endpoints.Market_diyList),
  diyDetail: endpoint(endpoints.Market_diyDetail),
  diySave: endpoint(endpoints.Market_diySave),
  diyPublish: endpoint(endpoints.Market_diyPublish),
  diyRemove: endpoint(endpoints.Market_diyRemove),
  coupons: endpoint(endpoints.Market_coupons),
  couponSave: endpoint(endpoints.Market_couponSave),
  couponStatus: endpoint(endpoints.Market_couponStatus),

  scrm: endpoint(endpoints.Market_scrm),
  scrmToggle: endpoint(endpoints.Market_scrmToggle),
  scrmRetry: endpoint(endpoints.Market_scrmRetry),
  scrmReplay: endpoint(endpoints.Market_scrmReplay),
};

export const marketplaceAdminApi = {
  overview: endpoint(endpoints.MpAdmin_overview),
  markets: endpoint(endpoints.MpAdmin_markets),
  marketStatus: endpoint(endpoints.MpAdmin_marketStatus),
};

const MP_TOKEN_KEY = "mp.merchant.token";

export function readMerchantToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(MP_TOKEN_KEY) || "";
}

export function writeMerchantToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(MP_TOKEN_KEY, token);
  else window.localStorage.removeItem(MP_TOKEN_KEY);
}

type MerchantEnvelope = z.ZodType<{ data: unknown }>;

async function merchantCall<R extends MerchantEnvelope>(
  path: string,
  method: "GET" | "POST",
  response: R,
  options: { body?: unknown; token?: string } = {},
): Promise<z.output<R>["data"]> {
  const token = options.token ?? readMerchantToken();
  const result = await http(`/api/backend/mp-merchant${path}`, response, {
    method,
    body: options.body,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  return result.data.data;
}

const profileDef = mpMerchantEndpoints.MpMerchant_profile;
const passwordDef = mpMerchantEndpoints.MpMerchant_password;
const shopDetailDef = mpMerchantEndpoints.MpMerchant_shopDetail;
const shopSaveDef = mpMerchantEndpoints.MpMerchant_shopSave;
const shopStatusDef = mpMerchantEndpoints.MpMerchant_shopStatus;
const staffListDef = mpMerchantEndpoints.MpMerchant_staffList;
const staffSaveDef = mpMerchantEndpoints.MpMerchant_staffSave;
const staffStatusDef = mpMerchantEndpoints.MpMerchant_staffStatus;
const productListDef = mpMerchantEndpoints.MpMerchant_products;
const productDetailDef = mpMerchantEndpoints.MpMerchant_productDetail;
const productSaveDef = mpMerchantEndpoints.MpMerchant_productSave;
const productStatusDef = mpMerchantEndpoints.MpMerchant_productStatus;
const productSubmitDef = mpMerchantEndpoints.MpMerchant_productSubmit;
const productRemoveDef = mpMerchantEndpoints.MpMerchant_productRemove;
const orderListDef = mpMerchantEndpoints.MpMerchant_orders;
const orderDetailDef = mpMerchantEndpoints.MpMerchant_orderDetail;
const orderShipDef = mpMerchantEndpoints.MpMerchant_orderShip;
const orderRemarkDef = mpMerchantEndpoints.MpMerchant_orderRemark;
const afterSaleListDef = mpMerchantEndpoints.MpMerchant_afterSales;
const afterSaleDetailDef = mpMerchantEndpoints.MpMerchant_afterSaleDetail;
const afterSaleAuditDef = mpMerchantEndpoints.MpMerchant_afterSaleAudit;
const afterSaleReceiveDef = mpMerchantEndpoints.MpMerchant_afterSaleReceive;
const refundListDef = mpMerchantEndpoints.MpMerchant_refunds;
const refundDetailDef = mpMerchantEndpoints.MpMerchant_refundDetail;
const refundRetryDef = mpMerchantEndpoints.MpMerchant_refundRetry;
const commissionDef = mpMerchantEndpoints.MpMerchant_commission;
const financeDef = mpMerchantEndpoints.MpMerchant_finance;
const settlementListDef = mpMerchantEndpoints.MpMerchant_settlements;
const settlementDetailDef = mpMerchantEndpoints.MpMerchant_settlementDetail;
const settlementConfirmDef = mpMerchantEndpoints.MpMerchant_settlementConfirm;
const withdrawalListDef = mpMerchantEndpoints.MpMerchant_withdrawals;
const withdrawalApplyDef = mpMerchantEndpoints.MpMerchant_withdrawalApply;
const withdrawalCancelDef = mpMerchantEndpoints.MpMerchant_withdrawalCancel;
const diyWidgetsDef = mpMerchantEndpoints.MpMerchant_diyWidgets;
const diyListDef = mpMerchantEndpoints.MpMerchant_diyList;
const diyDetailDef = mpMerchantEndpoints.MpMerchant_diyDetail;
const diySaveDef = mpMerchantEndpoints.MpMerchant_diySave;
const diyPublishDef = mpMerchantEndpoints.MpMerchant_diyPublish;
const diyRemoveDef = mpMerchantEndpoints.MpMerchant_diyRemove;
const couponListDef = mpMerchantEndpoints.MpMerchant_coupons;
const couponSaveDef = mpMerchantEndpoints.MpMerchant_couponSave;
const couponStatusDef = mpMerchantEndpoints.MpMerchant_couponStatus;
const scrmDef = mpMerchantEndpoints.MpMerchant_scrm;

export const mpMerchantApi = {
  profile: () =>
    merchantCall(profileDef.path, "GET", profileDef.response),
  changePassword: (body: z.input<typeof mpMerchantPasswordBodySchema>) =>
    merchantCall(passwordDef.path, "POST", passwordDef.response, {
      body: mpMerchantPasswordBodySchema.parse(body),
    }),
  shopDetail: () =>
    merchantCall(shopDetailDef.path, "GET", shopDetailDef.response),
  shopSave: (body: z.input<typeof mpMerchantShopSaveBodySchema>) =>
    merchantCall(shopSaveDef.path, "POST", shopSaveDef.response, {
      body: mpMerchantShopSaveBodySchema.parse(body),
    }),
  shopStatus: (body: z.input<typeof mpMerchantShopStatusBodySchema>) =>
    merchantCall(shopStatusDef.path, "POST", shopStatusDef.response, {
      body: mpMerchantShopStatusBodySchema.parse(body),
    }),
  staffList: () =>
    merchantCall(staffListDef.path, "GET", staffListDef.response),
  staffSave: (body: z.input<typeof mpMerchantStaffSaveBodySchema>) =>
    merchantCall(staffSaveDef.path, "POST", staffSaveDef.response, {
      body: mpMerchantStaffSaveBodySchema.parse(body),
    }),
  staffStatus: (body: z.input<typeof mpMerchantStaffStatusBodySchema>) =>
    merchantCall(staffStatusDef.path, "POST", staffStatusDef.response, {
      body: mpMerchantStaffStatusBodySchema.parse(body),
    }),

  products: (query: z.input<typeof mpProductListQuerySchema>) =>
    merchantCall(
      `${productListDef.path}?${new URLSearchParams(
        Object.entries(mpProductListQuerySchema.parse(query)).map(([key, value]) => [
          key,
          String(value),
        ]),
      )}`,
      "GET",
      productListDef.response,
    ),
  productDetail: (id: number) =>
    merchantCall(`${productDetailDef.path}?id=${id}`, "GET", productDetailDef.response),
  productSave: (body: z.input<typeof mpProductSaveBodySchema>) =>
    merchantCall(productSaveDef.path, "POST", productSaveDef.response, {
      body: mpProductSaveBodySchema.parse(body),
    }),
  productStatus: (body: z.input<typeof mpProductStatusBodySchema>) =>
    merchantCall(productStatusDef.path, "POST", productStatusDef.response, {
      body: mpProductStatusBodySchema.parse(body),
    }),
  productSubmit: (id: number) =>
    merchantCall(productSubmitDef.path, "POST", productSubmitDef.response, {
      body: mpProductIdBodySchema.parse({ id }),
    }),
  productRemove: (id: number) =>
    merchantCall(productRemoveDef.path, "POST", productRemoveDef.response, {
      body: mpProductIdBodySchema.parse({ id }),
    }),

  orders: (query: z.input<typeof mpOrderListQuerySchema>) =>
    merchantCall(
      `${orderListDef.path}?${new URLSearchParams(
        Object.entries(mpOrderListQuerySchema.parse(query)).map(([key, value]) => [
          key,
          String(value),
        ]),
      )}`,
      "GET",
      orderListDef.response,
    ),
  orderDetail: (id: number) =>
    merchantCall(`${orderDetailDef.path}?id=${id}`, "GET", orderDetailDef.response),
  orderShip: (body: z.input<typeof mpShopOrderShipBodySchema>) =>
    merchantCall(orderShipDef.path, "POST", orderShipDef.response, {
      body: mpShopOrderShipBodySchema.parse(body),
    }),
  orderRemark: (body: z.input<typeof mpShopOrderRemarkBodySchema>) =>
    merchantCall(orderRemarkDef.path, "POST", orderRemarkDef.response, {
      body: mpShopOrderRemarkBodySchema.parse(body),
    }),

  afterSales: (query: z.input<typeof mpAfterSaleManageListQuerySchema>) =>
    merchantCall(
      `${afterSaleListDef.path}?${qs(mpAfterSaleManageListQuerySchema.parse(query))}`,
      "GET",
      afterSaleListDef.response,
    ),
  afterSaleDetail: (id: number) =>
    merchantCall(
      `${afterSaleDetailDef.path}?id=${id}`,
      "GET",
      afterSaleDetailDef.response,
    ),
  afterSaleAudit: (body: z.input<typeof mpAfterSaleAuditBodySchema>) =>
    merchantCall(afterSaleAuditDef.path, "POST", afterSaleAuditDef.response, {
      body: mpAfterSaleAuditBodySchema.parse(body),
    }),
  afterSaleReceive: (body: z.input<typeof mpAfterSaleReceiveBodySchema>) =>
    merchantCall(afterSaleReceiveDef.path, "POST", afterSaleReceiveDef.response, {
      body: mpAfterSaleReceiveBodySchema.parse(body),
    }),

  refunds: (query: z.input<typeof mpRefundListQuerySchema>) =>
    merchantCall(
      `${refundListDef.path}?${qs(mpRefundListQuerySchema.parse(query))}`,
      "GET",
      refundListDef.response,
    ),
  refundDetail: (id: number) =>
    merchantCall(
      `${refundDetailDef.path}?id=${id}`,
      "GET",
      refundDetailDef.response,
    ),
  refundRetry: (id: number) =>
    merchantCall(refundRetryDef.path, "POST", refundRetryDef.response, {
      body: mpRefundIdBodySchema.parse({ id }),
    }),

  commission: () =>
    merchantCall(commissionDef.path, "GET", commissionDef.response),
  finance: () =>
    merchantCall(financeDef.path, "GET", financeDef.response),
  settlements: (query: z.input<typeof mpSettlementListQuerySchema>) =>
    merchantCall(
      `${settlementListDef.path}?${qs(mpSettlementListQuerySchema.parse(query))}`,
      "GET",
      settlementListDef.response,
    ),
  settlementDetail: (id: number) =>
    merchantCall(
      `${settlementDetailDef.path}?id=${id}`,
      "GET",
      settlementDetailDef.response,
    ),
  settlementConfirm: (body: z.input<typeof mpSettlementConfirmBodySchema>) =>
    merchantCall(
      settlementConfirmDef.path,
      "POST",
      settlementConfirmDef.response,
      { body: mpSettlementConfirmBodySchema.parse(body) },
    ),
  withdrawals: (query: z.input<typeof mpWithdrawalListQuerySchema>) =>
    merchantCall(
      `${withdrawalListDef.path}?${qs(mpWithdrawalListQuerySchema.parse(query))}`,
      "GET",
      withdrawalListDef.response,
    ),
  withdrawalApply: (body: z.input<typeof mpWithdrawalApplyBodySchema>) =>
    merchantCall(
      withdrawalApplyDef.path,
      "POST",
      withdrawalApplyDef.response,
      { body: mpWithdrawalApplyBodySchema.parse(body) },
    ),
  withdrawalCancel: (id: number) =>
    merchantCall(withdrawalCancelDef.path, "POST", withdrawalCancelDef.response, {
      body: mpWithdrawalIdBodySchema.parse({ id }),
    }),

  diyWidgets: () =>
    merchantCall(diyWidgetsDef.path, "GET", diyWidgetsDef.response),
  diyList: (query: z.input<typeof mpDiyListQuerySchema>) =>
    merchantCall(
      `${diyListDef.path}?${qs(mpDiyListQuerySchema.parse(query))}`,
      "GET",
      diyListDef.response,
    ),
  diyDetail: (id: number) =>
    merchantCall(`${diyDetailDef.path}?id=${id}`, "GET", diyDetailDef.response),
  diySave: (body: z.input<typeof mpDiyPageSaveBodySchema>) =>
    merchantCall(diySaveDef.path, "POST", diySaveDef.response, {
      body: mpDiyPageSaveBodySchema.parse(body),
    }),
  diyPublish: (id: number) =>
    merchantCall(diyPublishDef.path, "POST", diyPublishDef.response, {
      body: mpDiyPageIdBodySchema.parse({ id }),
    }),
  diyRemove: (id: number) =>
    merchantCall(diyRemoveDef.path, "POST", diyRemoveDef.response, {
      body: mpDiyPageIdBodySchema.parse({ id }),
    }),
  coupons: (query: z.input<typeof mpCouponListQuerySchema>) =>
    merchantCall(
      `${couponListDef.path}?${qs(mpCouponListQuerySchema.parse(query))}`,
      "GET",
      couponListDef.response,
    ),
  couponSave: (body: z.input<typeof mpCouponSaveBodySchema>) =>
    merchantCall(couponSaveDef.path, "POST", couponSaveDef.response, {
      body: mpCouponSaveBodySchema.parse(body),
    }),
  couponStatus: (body: z.input<typeof mpCouponStatusBodySchema>) =>
    merchantCall(couponStatusDef.path, "POST", couponStatusDef.response, {
      body: mpCouponStatusBodySchema.parse(body),
    }),
  scrm: () => merchantCall(scrmDef.path, "GET", scrmDef.response),
};

const optionsSchema = apiEnvelope(mpMerchantOptionsSchema);
const sessionSchema = apiEnvelope(mpMerchantSessionSchema);
const applyResultSchema = apiEnvelope(
  z.object({ ok: z.boolean(), message: z.string() }),
);

/** 入驻页：市场编号 → 市场名 + 可经营类目。 */
export async function fetchMerchantOptions(marketCode: string) {
  const result = await http(
    `/api/public/market/merchant/options?marketCode=${encodeURIComponent(marketCode)}`,
    optionsSchema,
  );
  return result.data.data;
}

export async function submitMerchantApply(
  body: z.input<typeof mpMerchantApplyBodySchema>,
) {
  const result = await http(
    "/api/public/market/merchant/apply",
    applyResultSchema,
    {
      method: "POST",
      body: mpMerchantApplyBodySchema.parse(body),
    },
  );
  return result.data.data;
}

export async function merchantLogin(
  body: z.input<typeof mpMerchantLoginBodySchema>,
) {
  const result = await http("/api/public/market/merchant/login", sessionSchema, {
    method: "POST",
    body: mpMerchantLoginBodySchema.parse(body),
  });
  return result.data.data;
}
