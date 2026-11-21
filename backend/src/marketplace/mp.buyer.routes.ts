import type { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import {
  mpAddressIdBodySchema,
  mpAddressSaveBodySchema,
  mpAfterSaleCreateBodySchema,
  mpAfterSaleIdBodySchema,
  mpAfterSaleReturnBodySchema,
  mpCartAddBodySchema,
  mpCartQuantityBodySchema,
  mpCartRemoveBodySchema,
  mpCartSelectBodySchema,
  mpCouponClaimBodySchema,
  mpCustomerLoginBodySchema,
  mpFollowBodySchema,
  mpOrderCreateBodySchema,
  mpOrderIdBodySchema,
  mpSettlePreviewBodySchema,
} from '@enterprise/contracts';
import { ok } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { handleError } from '../http/error-handler';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

/**
 * 多店铺商城·买家通道（免登录 + 顾客令牌）。
 *
 * 与商户后台同一段 `/api/public/market/**` 前缀：浏览、地址、购物车、结算、
 * 支付回调、订单都在这里；身份用 `x-customer-token`（scene=MARKET），
 * 令牌里的 marketId 只作入口，具体归属每次回库校验。
 */
export function registerMarketplaceBuyerApi(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const trade = services.marketplace.trade;
  const aftersale = services.marketplace.aftersale;
  const coupons = services.marketplace.coupons;
  const follows = services.marketplace.follows;
  const router = new Hono<ApiEnv>();
  router.onError(handleError);

  const loginWindow = new RateWindow(20, 60_000);

  const tokenOf = (c: Context) =>
    c.req.header('x-customer-token') || c.req.header('authorization') || '';

  const bodyOf = async <S extends z.ZodType>(
    c: Context,
    schema: S,
  ): Promise<z.output<S>> => {
    const raw = await c.req.json<unknown>().catch(() => undefined);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        parsed.error.issues[0]?.message || '请求参数格式不正确',
      );
    }
    return parsed.data;
  };

  const idOf = (c: Context) => {
    const id = Number(c.req.query('id'));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少有效的 id');
    }
    return id;
  };

  const idOfShop = (c: Context) => {
    const id = Number(c.req.query('shopId'));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少有效的店铺编号');
    }
    return id;
  };

  // ---------------------------------------------------------- 公开浏览

  router.get('/bootstrap', async (c) => {
    const marketCode = String(c.req.query('marketCode') || '').trim();
    if (!marketCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请提供市场编号');
    }
    const customerId = trade.optionalCustomerId(tokenOf(c));
    return c.json(ok(await trade.bootstrap(marketCode, customerId)));
  });

  /** 店铺首页装修：未发布过返回 null。 */
  router.get('/diy/shop', async (c) => {
    const marketCode = String(c.req.query('marketCode') || '').trim();
    if (!marketCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请提供市场编号');
    }
    return c.json(ok(await trade.shopDiy(marketCode, idOfShop(c))));
  });

  router.get('/product/list', async (c) =>
    c.json(
      ok(
        await trade.products(
          c.req.query() as unknown as Parameters<typeof trade.products>[0],
        ),
      ),
    ),
  );

  router.get('/product/detail', async (c) => {
    const marketCode = String(c.req.query('marketCode') || '').trim();
    if (!marketCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请提供市场编号');
    }
    return c.json(ok(await trade.productDetail(marketCode, idOf(c))));
  });

  // ---------------------------------------------------------- 顾客会话

  router.post('/login', async (c) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';
    loginWindow.consume(`login:${ip}`, '登录尝试过于频繁，请稍后再试');
    const input = await bodyOf(c, mpCustomerLoginBodySchema);
    return c.json(ok(await trade.login(input)));
  });

  router.get('/profile', async (c) =>
    c.json(ok(await trade.profile(tokenOf(c)))),
  );

  // ---------------------------------------------------------- 地址

  router.get('/address/list', async (c) =>
    c.json(ok(await trade.addresses(tokenOf(c)))),
  );

  router.post('/address/save', async (c) => {
    const input = await bodyOf(c, mpAddressSaveBodySchema);
    return c.json(ok(await trade.addressSave(tokenOf(c), input)));
  });

  router.post('/address/remove', async (c) => {
    const input = await bodyOf(c, mpAddressIdBodySchema);
    return c.json(ok(await trade.addressRemove(tokenOf(c), input.id)));
  });

  // ---------------------------------------------------------- 购物车

  router.get('/cart/list', async (c) =>
    c.json(ok(await trade.cart(tokenOf(c)))),
  );

  router.post('/cart/add', async (c) => {
    const input = await bodyOf(c, mpCartAddBodySchema);
    return c.json(ok(await trade.cartAdd(tokenOf(c), input)));
  });

  router.post('/cart/quantity', async (c) => {
    const input = await bodyOf(c, mpCartQuantityBodySchema);
    return c.json(
      ok(await trade.cartQuantity(tokenOf(c), input.id, input.quantity)),
    );
  });

  router.post('/cart/select', async (c) => {
    const input = await bodyOf(c, mpCartSelectBodySchema);
    return c.json(
      ok(await trade.cartSelect(tokenOf(c), input.id, input.selected)),
    );
  });

  router.post('/cart/remove', async (c) => {
    const input = await bodyOf(c, mpCartRemoveBodySchema);
    return c.json(ok(await trade.cartRemove(tokenOf(c), input.ids)));
  });

  // ---------------------------------------------------------- 结算与订单

  router.post('/order/settle', async (c) => {
    const input = await bodyOf(c, mpSettlePreviewBodySchema);
    return c.json(
      ok(await trade.settle(tokenOf(c), input.cartIds, input.couponTicketId)),
    );
  });

  router.post('/order/create', async (c) => {
    const input = await bodyOf(c, mpOrderCreateBodySchema);
    return c.json(ok(await trade.createOrder(tokenOf(c), input)));
  });

  router.post('/order/repay', async (c) => {
    const input = await bodyOf(c, mpOrderIdBodySchema);
    return c.json(ok(await trade.repay(tokenOf(c), input.id)));
  });

  router.get('/order/list', async (c) =>
    c.json(
      ok(
        await trade.orders(
          tokenOf(c),
          c.req.query() as unknown as Parameters<typeof trade.orders>[1],
        ),
      ),
    ),
  );

  router.get('/order/detail', async (c) =>
    c.json(ok(await trade.orderDetail(tokenOf(c), idOf(c)))),
  );

  router.post('/order/cancel', async (c) => {
    const input = await bodyOf(c, mpOrderIdBodySchema);
    return c.json(ok(await trade.cancel(tokenOf(c), input.id)));
  });

  router.post('/order/confirm', async (c) => {
    const input = await bodyOf(c, mpOrderIdBodySchema);
    return c.json(ok(await trade.confirm(tokenOf(c), input.id)));
  });

  // ---------------------------------------------------------- 优惠券 / 关注

  router.get('/coupon/list', async (c) => {
    const marketCode = String(c.req.query('marketCode') || '').trim();
    if (!marketCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请提供市场编号');
    }
    const market = await trade.requireMarket(marketCode);
    const shopId = Number(c.req.query('shopId') || 0);
    const customerId = trade.optionalCustomerId(tokenOf(c));
    return c.json(
      ok(
        await coupons.publicList(
          market.id,
          Number.isInteger(shopId) && shopId > 0 ? shopId : 0,
          customerId,
        ),
      ),
    );
  });

  router.post('/coupon/claim', async (c) => {
    const input = await bodyOf(c, mpCouponClaimBodySchema);
    const { market, customer } = await trade.requireBuyer(tokenOf(c), true);
    return c.json(
      ok(await coupons.claim(market.id, customer.id, input.couponId)),
    );
  });

  router.get('/coupon/tickets', async (c) => {
    const { market, customer } = await trade.requireBuyer(tokenOf(c));
    return c.json(
      ok(
        await coupons.tickets(
          market.id,
          customer.id,
          String(c.req.query('status') || '').trim(),
        ),
      ),
    );
  });

  router.get('/follow/list', async (c) => {
    const { market, customer } = await trade.requireBuyer(tokenOf(c));
    return c.json(ok(await follows.list(market.id, customer.id)));
  });

  router.post('/follow', async (c) => {
    const input = await bodyOf(c, mpFollowBodySchema);
    const { market, customer } = await trade.requireBuyer(tokenOf(c), true);
    return c.json(
      ok(await follows.follow(market.id, customer.id, input.shopId)),
    );
  });

  router.post('/follow/cancel', async (c) => {
    const input = await bodyOf(c, mpFollowBodySchema);
    const { market, customer } = await trade.requireBuyer(tokenOf(c), true);
    return c.json(
      ok(await follows.unfollow(market.id, customer.id, input.shopId)),
    );
  });

  // ---------------------------------------------------------- 售后

  router.get('/aftersale/list', async (c) =>
    c.json(
      ok(
        await aftersale.list(
          tokenOf(c),
          c.req.query() as unknown as Parameters<typeof aftersale.list>[1],
        ),
      ),
    ),
  );

  router.get('/aftersale/detail', async (c) =>
    c.json(ok(await aftersale.detail(tokenOf(c), idOf(c)))),
  );

  router.post('/aftersale/apply', async (c) => {
    const input = await bodyOf(c, mpAfterSaleCreateBodySchema);
    return c.json(ok(await aftersale.apply(tokenOf(c), input)));
  });

  router.post('/aftersale/cancel', async (c) => {
    const input = await bodyOf(c, mpAfterSaleIdBodySchema);
    return c.json(ok(await aftersale.cancel(tokenOf(c), input.id)));
  });

  router.post('/aftersale/return', async (c) => {
    const input = await bodyOf(c, mpAfterSaleReturnBodySchema);
    return c.json(ok(await aftersale.returnBack(tokenOf(c), input)));
  });

  // ---------------------------------------------------------- 支付回调

  router.post('/pay/notify/:marketId', async (c) => {
    const marketId = Number(c.req.param('marketId'));
    if (!Number.isInteger(marketId) || marketId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '市场编号无效');
    }
    const raw = (await c.req.json().catch(() => undefined)) as
      | {
          resource?: {
            ciphertext?: string;
            nonce?: string;
            associated_data?: string;
          };
        }
      | undefined;
    const resource = raw?.resource;
    if (!resource?.ciphertext || !resource.nonce) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '回调报文缺少 resource',
      );
    }
    // 防重放：Wechatpay-Timestamp 必须落在 ±5 分钟窗口内（复用统一客户端的
    // notifyTimestampOk，与 parseNotify 同一口径）。不复用 parseNotify 整段：本路由
    // 按既有签名只把密文交给 trade.payNotify → pay.decryptNotify（拿不到 rawBody
    // 与四个请求头），而 parseNotify 要先下载市场商户号的平台证书做 RSA 验签，
    // 拉取失败会把可重试的 400 变成 5xx。父单出账的幂等由 payNotify 里
    // 「payStatus: UNPAID 条件更新 + count===0 直接返回」保证，重复回调不重复拆单。
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '回调时间戳异常');
    }
    await trade.payNotify(marketId, {
      ciphertext: resource.ciphertext,
      nonce: resource.nonce,
      associated_data: resource.associated_data,
    });
    return c.json({ code: 'SUCCESS', message: '成功' });
  });

  app.route('/api/public/market', router);
}
