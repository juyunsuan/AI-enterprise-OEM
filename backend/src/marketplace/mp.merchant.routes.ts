import type { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import {
  mpAfterSaleAuditBodySchema,
  mpAfterSaleReceiveBodySchema,
  mpCouponSaveBodySchema,
  mpCouponStatusBodySchema,
  mpDiyPageIdBodySchema,
  mpDiyPageSaveBodySchema,
  mpMerchantPasswordBodySchema,
  mpMerchantShopSaveBodySchema,
  mpMerchantShopStatusBodySchema,
  mpMerchantStaffSaveBodySchema,
  mpMerchantStaffStatusBodySchema,
  mpProductIdBodySchema,
  mpProductSaveBodySchema,
  mpProductStatusBodySchema,
  mpRefundIdBodySchema,
  mpSettlementConfirmBodySchema,
  mpShopOrderRemarkBodySchema,
  mpShopOrderShipBodySchema,
  mpWithdrawalApplyBodySchema,
  mpWithdrawalIdBodySchema,
} from '@enterprise/contracts';
import { ok } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { handleError } from '../http/error-handler';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseMerchantToken, type MpMerchantTokenPayload } from './mp.token';

/**
 * 商户后台通道：`/api/merchant/mp/**`。
 *
 * 独立于站内会话鉴权（`business` 的 `auth.authenticate`），也不进契约总表 handlers —
 * 否则 MCP 会以站内用户身份调用商户接口（跨身份越权）。前端经 `/api/backend/mp-merchant/**`
 * 同源代理访问（两处挂同一个子应用）；挂载必须早于 `app.route('/api/backend', business)`，
 * 否则请求会被 business 的会话鉴权先行 401。
 */
export function registerMarketplaceMerchantApi(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const merchants = services.marketplace.merchant;
  const catalog = services.marketplace.catalog;
  const trade = services.marketplace.trade;
  const aftersale = services.marketplace.aftersale;
  const finance = services.marketplace.finance;
  const diy = services.marketplace.diy;
  const coupons = services.marketplace.coupons;
  const scrm = services.marketplace.scrm;
  const router = new Hono<ApiEnv>();
  router.onError(handleError);

  const idOf = (c: Context) => {
    const id = Number(c.req.query('id'));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少有效的 id');
    }
    return id;
  };

  const payloadOf = (c: Context): MpMerchantTokenPayload =>
    parseMerchantToken(
      c.req.header('x-mp-token') || c.req.header('authorization') || '',
    );

  const bodyOf = async <S extends z.ZodType>(
    c: Context,
    schema: S,
  ): Promise<z.output<S>> => {
    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        parsed.error.issues[0]?.message || '请求参数格式不正确',
      );
    }
    return parsed.data;
  };

  router.get('/profile', async (c) =>
    c.json(ok(await merchants.profile(payloadOf(c)))),
  );

  router.post('/password', async (c) => {
    const input = await bodyOf(c, mpMerchantPasswordBodySchema);
    return c.json(
      ok(
        await merchants.changePassword(
          payloadOf(c),
          input.oldPassword,
          input.newPassword,
        ),
      ),
    );
  });

  router.get('/shop/detail', async (c) =>
    c.json(ok(await merchants.shopDetail(payloadOf(c)))),
  );

  router.post('/shop/save', async (c) => {
    const input = await bodyOf(c, mpMerchantShopSaveBodySchema);
    return c.json(ok(await merchants.shopSave(payloadOf(c), input)));
  });

  router.post('/shop/status', async (c) => {
    const input = await bodyOf(c, mpMerchantShopStatusBodySchema);
    return c.json(ok(await merchants.shopStatus(payloadOf(c), input)));
  });

  router.get('/staff/list', async (c) =>
    c.json(ok(await merchants.staffList(payloadOf(c)))),
  );

  router.post('/staff/save', async (c) => {
    const input = await bodyOf(c, mpMerchantStaffSaveBodySchema);
    return c.json(ok(await merchants.staffSave(payloadOf(c), input)));
  });

  router.post('/staff/status', async (c) => {
    const input = await bodyOf(c, mpMerchantStaffStatusBodySchema);
    return c.json(
      ok(await merchants.staffStatus(payloadOf(c), input.id, input.status)),
    );
  });

  // ---------------------------------------------------------- 商品

  router.get('/product/list', async (c) =>
    c.json(
      ok(
        await catalog.listProducts(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof catalog.listProducts
          >[1],
        ),
      ),
    ),
  );

  router.get('/product/detail', async (c) =>
    c.json(ok(await catalog.productDetail(payloadOf(c), idOf(c)))),
  );

  router.post('/product/save', async (c) => {
    const input = await bodyOf(c, mpProductSaveBodySchema);
    return c.json(ok(await catalog.saveProduct(payloadOf(c), input)));
  });

  router.post('/product/status', async (c) => {
    const input = await bodyOf(c, mpProductStatusBodySchema);
    return c.json(ok(await catalog.setStatus(payloadOf(c), input)));
  });

  router.post('/product/submit', async (c) => {
    const input = await bodyOf(c, mpProductIdBodySchema);
    return c.json(ok(await catalog.submit(payloadOf(c), input.id)));
  });

  router.post('/product/remove', async (c) => {
    const input = await bodyOf(c, mpProductIdBodySchema);
    return c.json(ok(await catalog.remove(payloadOf(c), input.id)));
  });

  // ---------------------------------------------------------- 订单

  router.get('/order/list', async (c) =>
    c.json(
      ok(
        await trade.merchantOrders(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof trade.merchantOrders
          >[1],
        ),
      ),
    ),
  );

  router.get('/order/detail', async (c) =>
    c.json(ok(await trade.merchantOrderDetail(payloadOf(c), idOf(c)))),
  );

  router.post('/order/ship', async (c) => {
    const input = await bodyOf(c, mpShopOrderShipBodySchema);
    return c.json(ok(await trade.ship(payloadOf(c), input)));
  });

  router.post('/order/remark', async (c) => {
    const input = await bodyOf(c, mpShopOrderRemarkBodySchema);
    return c.json(
      ok(await trade.remark(payloadOf(c), input.id, input.sellerRemark)),
    );
  });

  // ---------------------------------------------------------- 售后与退款

  router.get('/aftersale/list', async (c) =>
    c.json(
      ok(
        await aftersale.merchantList(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof aftersale.merchantList
          >[1],
        ),
      ),
    ),
  );

  router.get('/aftersale/detail', async (c) =>
    c.json(ok(await aftersale.merchantDetail(payloadOf(c), idOf(c)))),
  );

  router.post('/aftersale/audit', async (c) => {
    const input = await bodyOf(c, mpAfterSaleAuditBodySchema);
    return c.json(ok(await aftersale.merchantAudit(payloadOf(c), input)));
  });

  router.post('/aftersale/receive', async (c) => {
    const input = await bodyOf(c, mpAfterSaleReceiveBodySchema);
    return c.json(ok(await aftersale.merchantReceive(payloadOf(c), input)));
  });

  router.get('/refund/list', async (c) =>
    c.json(
      ok(
        await aftersale.merchantRefunds(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof aftersale.merchantRefunds
          >[1],
        ),
      ),
    ),
  );

  router.get('/refund/detail', async (c) =>
    c.json(ok(await aftersale.merchantRefundDetail(payloadOf(c), idOf(c)))),
  );

  router.post('/refund/retry', async (c) => {
    const input = await bodyOf(c, mpRefundIdBodySchema);
    return c.json(ok(await aftersale.retryRefund(payloadOf(c), input.id)));
  });

  // ---------------------------------------------------------- 抽佣 / 结算 / 提现

  router.get('/commission', async (c) =>
    c.json(ok(await finance.merchantCommission(payloadOf(c)))),
  );

  router.get('/finance', async (c) =>
    c.json(ok(await finance.merchantFinance(payloadOf(c)))),
  );

  router.get('/settlement/list', async (c) =>
    c.json(
      ok(
        await finance.merchantSettlements(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof finance.merchantSettlements
          >[1],
        ),
      ),
    ),
  );

  router.get('/settlement/detail', async (c) =>
    c.json(ok(await finance.merchantSettlementDetail(payloadOf(c), idOf(c)))),
  );

  router.post('/settlement/confirm', async (c) => {
    const input = await bodyOf(c, mpSettlementConfirmBodySchema);
    return c.json(
      ok(await finance.merchantSettlementConfirm(payloadOf(c), input)),
    );
  });

  router.get('/withdrawal/list', async (c) =>
    c.json(
      ok(
        await finance.merchantWithdrawals(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof finance.merchantWithdrawals
          >[1],
        ),
      ),
    ),
  );

  router.post('/withdrawal/apply', async (c) => {
    const input = await bodyOf(c, mpWithdrawalApplyBodySchema);
    return c.json(
      ok(await finance.merchantWithdrawalApply(payloadOf(c), input)),
    );
  });

  router.post('/withdrawal/cancel', async (c) => {
    const input = await bodyOf(c, mpWithdrawalIdBodySchema);
    return c.json(
      ok(await finance.merchantWithdrawalCancel(payloadOf(c), input.id)),
    );
  });

  // ---------------------------------------------------------- 装修 / 优惠券

  router.get('/diy/widgets', (c) => c.json(ok(diy.widgets())));

  router.get('/diy/list', async (c) => {
    const payload = payloadOf(c);
    const scope = await diy.merchantScope(payload, false);
    return c.json(
      ok(
        await diy.list(scope, {
          shopId: scope.shopId,
          type: String(c.req.query('type') || ''),
        }),
      ),
    );
  });

  router.get('/diy/detail', async (c) => {
    const scope = await diy.merchantScope(payloadOf(c), false);
    return c.json(ok(await diy.detail(scope, idOf(c))));
  });

  router.post('/diy/save', async (c) => {
    const input = await bodyOf(c, mpDiyPageSaveBodySchema);
    const scope = await diy.merchantScope(payloadOf(c), true);
    return c.json(ok(await diy.save(scope, input)));
  });

  router.post('/diy/publish', async (c) => {
    const input = await bodyOf(c, mpDiyPageIdBodySchema);
    const scope = await diy.merchantScope(payloadOf(c), true);
    return c.json(ok(await diy.publish(scope, input.id)));
  });

  router.post('/diy/remove', async (c) => {
    const input = await bodyOf(c, mpDiyPageIdBodySchema);
    const scope = await diy.merchantScope(payloadOf(c), true);
    return c.json(ok(await diy.remove(scope, input.id)));
  });

  router.get('/coupon/list', async (c) =>
    c.json(
      ok(
        await coupons.merchantList(
          payloadOf(c),
          c.req.query() as unknown as Parameters<
            typeof coupons.merchantList
          >[1],
        ),
      ),
    ),
  );

  router.post('/coupon/save', async (c) => {
    const input = await bodyOf(c, mpCouponSaveBodySchema);
    return c.json(ok(await coupons.merchantSave(payloadOf(c), input)));
  });

  router.post('/coupon/status', async (c) => {
    const input = await bodyOf(c, mpCouponStatusBodySchema);
    return c.json(
      ok(await coupons.merchantStatus(payloadOf(c), input.id, input.status)),
    );
  });

  // ---------------------------------------------------------- 企业微信 SCRM（只读）

  router.get('/scrm', async (c) => {
    const payload = payloadOf(c);
    await merchants.session(payload);
    return c.json(ok(await scrm.merchantState(payload)));
  });

  app.route('/api/merchant/mp', router);
  app.route('/api/backend/mp-merchant', router);
}
