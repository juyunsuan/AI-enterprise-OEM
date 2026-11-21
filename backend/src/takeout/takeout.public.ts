import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import {
  takeoutAddressBodySchema,
  takeoutLoginBodySchema,
  takeoutOrderCreateBodySchema,
  takeoutPreviewBodySchema,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { resolveSiteUrl } from '../common/site-url';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { withinBusinessHours } from './takeout.shared';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

const shopQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  appId: z.string().trim().max(64).optional(),
});

const idBody = z.object({ id: z.number().int().positive() });
const cartAddBody = z.object({
  productId: z.number().int().positive(),
  skuId: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).max(99).default(1),
});
const cartUpdateBody = z.object({
  id: z.number().int().positive(),
  quantity: z.number().int().min(0).max(99),
});
const cartSelectBody = z.object({
  ids: z.array(z.number().int().positive()).max(200).default([]),
  selected: z.boolean().default(true),
});
const cartRemoveBody = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

/**
 * 外卖小程序顾客端公开通道（`/api/public/takeout/**`，免站内鉴权）。
 *
 * 所有顾客态读写都按 `shopId + customerId` 双条件过滤；店铺码只用于定位门店，
 * 绝不能拿请求里的 id 单独查数据。数据全部落 `takeout_*` 表，不读商城。
 */
export function registerTakeoutPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { shops, goods, customers, coupons, orders, pay } = services.takeout;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const orderWindow = new RateWindow(30, 60_000);

  const shopOf = async (shopCode: string, appId?: string) => {
    const shop = shopCode
      ? await shops.findByCode(shopCode)
      : appId
        ? await shops.findByAppId(appId)
        : null;
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '外卖门店不存在：请确认小程序包的 config.js 已注入 shopCode',
      );
    }
    if (!(await toolOpen('takeout', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该外卖门店尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return shop;
  };

  const buyer = async (c: Context<ApiEnv, string, Input>) => {
    return customers.identity(
      c.req.header('authorization') || c.req.header('x-customer-token') || '',
    );
  };

  // ---------------------------------------------------------------- 匿名读

  app.get('/api/public/takeout/bootstrap', async (c) => {
    const query = shopQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: c.req.query('appId') || undefined,
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode, query.appId);
    if (shop.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '该门店已关闭');
    }
    const payEnabled = await pay.available(shop.id);
    const desk = await shops.deskSiteOf(shop);
    const apiBase = desk
      ? (await resolveSiteUrl(services.prisma)).replace(/\/+$/, '')
      : '';
    const modes = [
      shop.takeout.deliveryEnabled ? 'DELIVERY' : '',
      shop.takeout.pickupEnabled ? 'PICKUP' : '',
      shop.takeout.dineInEnabled ? 'DINEIN' : '',
    ].filter(Boolean);
    return c.json({
      shopId: shop.id,
      name: shop.name,
      shopCode: shop.shopCode,
      logo: shop.logo,
      slogan: shop.slogan,
      servicePhone: shop.servicePhone,
      themeColor: shop.themeColor,
      status: shop.status,
      open:
        shop.status === 'ONLINE' &&
        withinBusinessHours(shop.takeout.businessHours),
      businessHours: shop.takeout.businessHours,
      announcement: shop.takeout.announcement || shop.slogan,
      minOrderAmount: shop.trade.minOrderAmount,
      deliveryFee: shop.trade.deliveryFee,
      freeDeliveryAmount: shop.trade.freeDeliveryAmount,
      autoCancelMinutes: shop.trade.autoCancelMinutes,
      estimatedMinutes: shop.takeout.estimatedMinutes,
      pointsEnabled: shop.trade.pointsEnabled,
      buyerMessageEnabled: shop.trade.buyerMessageEnabled,
      payEnabled,
      deskSiteKey: desk?.siteKey || '',
      deskEmbedUrl:
        desk && apiBase
          ? `${apiBase}/embed/service-desk?key=${encodeURIComponent(desk.siteKey)}`
          : '',
      modes: modes.length ? modes : ['DELIVERY'],
    });
  });

  app.get('/api/public/takeout/menu', async (c) => {
    const query = shopQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: c.req.query('appId') || undefined,
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode, query.appId);
    return c.json(await goods.menu(shop.id));
  });

  // ---------------------------------------------------------------- 登录

  app.post('/api/public/takeout/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = takeoutLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const shop = await shopOf(body.shopCode);
    return c.json(await customers.loginByCode(shop, body));
  });

  // ---------------------------------------------------------------- 顾客态

  app.get('/api/public/takeout/profile', async (c) => {
    const identity = await buyer(c);
    return c.json(
      await customers.profile(identity.shopId, identity.customerId),
    );
  });

  app.get('/api/public/takeout/points', async (c) => {
    const identity = await buyer(c);
    return c.json(await customers.bills(identity.shopId, identity.customerId));
  });

  app.get('/api/public/takeout/addresses', async (c) => {
    const identity = await buyer(c);
    return c.json(
      await customers.addresses(identity.shopId, identity.customerId),
    );
  });

  app.post('/api/public/takeout/address/save', async (c) => {
    const identity = await buyer(c);
    const body = takeoutAddressBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await customers.saveAddress(identity.shopId, identity.customerId, body),
    );
  });

  app.post('/api/public/takeout/address/remove', async (c) => {
    const identity = await buyer(c);
    const body = idBody.parse(await c.req.json());
    return c.json(
      await customers.removeAddress(
        identity.shopId,
        identity.customerId,
        body.id,
      ),
    );
  });

  app.get('/api/public/takeout/cart', async (c) => {
    const identity = await buyer(c);
    return c.json(await customers.cart(identity.shopId, identity.customerId));
  });

  app.post('/api/public/takeout/cart/add', async (c) => {
    const identity = await buyer(c);
    const body = cartAddBody.parse(await c.req.json());
    return c.json(
      await customers.addCart(
        identity.shopId,
        identity.customerId,
        body.productId,
        body.skuId,
        body.quantity,
      ),
    );
  });

  app.post('/api/public/takeout/cart/update', async (c) => {
    const identity = await buyer(c);
    const body = cartUpdateBody.parse(await c.req.json());
    return c.json(
      await customers.updateCartQuantity(
        identity.shopId,
        identity.customerId,
        body.id,
        body.quantity,
      ),
    );
  });

  app.post('/api/public/takeout/cart/select', async (c) => {
    const identity = await buyer(c);
    const body = cartSelectBody.parse(await c.req.json());
    return c.json(
      await customers.selectCart(
        identity.shopId,
        identity.customerId,
        body.ids,
        body.selected,
      ),
    );
  });

  app.post('/api/public/takeout/cart/remove', async (c) => {
    const identity = await buyer(c);
    const body = cartRemoveBody.parse(await c.req.json());
    return c.json(
      await customers.removeCart(
        identity.shopId,
        identity.customerId,
        body.ids,
      ),
    );
  });

  app.get('/api/public/takeout/coupons', async (c) => {
    const identity = await buyer(c);
    return c.json(await coupons.mine(identity.shopId, identity.customerId));
  });

  app.get('/api/public/takeout/coupon/shop', async (c) => {
    const query = shopQuery.parse({ shopCode: c.req.query('shopCode') || '' });
    const shop = await shopOf(query.shopCode);
    return c.json(await coupons.shopList(shop.id));
  });

  app.post('/api/public/takeout/coupon/receive', async (c) => {
    const identity = await buyer(c);
    const body = z
      .object({ couponId: z.number().int().positive() })
      .parse(await c.req.json());
    return c.json(
      await coupons.receive(
        identity.shopId,
        identity.customerId,
        body.couponId,
      ),
    );
  });

  // ---------------------------------------------------------------- 下单

  app.post('/api/public/takeout/order/preview', async (c) => {
    const identity = await buyer(c);
    const body = takeoutPreviewBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await orders.preview(identity, body));
  });

  app.post('/api/public/takeout/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const identity = await buyer(c);
    const body = takeoutOrderCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await orders.create(identity, body));
  });

  app.get('/api/public/takeout/orders', async (c) => {
    const identity = await buyer(c);
    const { page, pageSize } = pageParam(
      c.req.query('page'),
      c.req.query('pageSize'),
      10,
    );
    return c.json(
      await orders.publicList(
        identity.shopId,
        identity.customerId,
        String(c.req.query('status') || 'ALL'),
        page,
        pageSize,
      ),
    );
  });

  app.get('/api/public/takeout/order', async (c) => {
    const identity = await buyer(c);
    const id = Number(c.req.query('id') || 0);
    return c.json(
      await orders.publicDetail(identity.shopId, identity.customerId, id),
    );
  });

  app.post('/api/public/takeout/order/cancel', async (c) => {
    const identity = await buyer(c);
    const body = idBody.parse(await c.req.json());
    return c.json(
      await orders.cancelByCustomer(
        identity.shopId,
        identity.customerId,
        body.id,
      ),
    );
  });

  app.post('/api/public/takeout/order/receive', async (c) => {
    const identity = await buyer(c);
    const body = idBody.parse(await c.req.json());
    return c.json(
      await orders.receive(identity.shopId, identity.customerId, body.id),
    );
  });

  app.get('/api/public/takeout/order/pay-params', async (c) => {
    const identity = await buyer(c);
    return c.json(
      await orders.repayParams({
        shopId: identity.shopId,
        customerId: identity.customerId,
        ownerUserId: identity.ownerUserId,
        orderId: Number(c.req.query('id') || 0),
        openid: identity.openid,
      }),
    );
  });

  // ---------------------------------------------------------------- 支付回调

  app.post('/api/public/takeout/pay/notify/:shopId', async (c) => {
    const shopId = Number(c.req.param('shopId'));
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return c.json({ code: 'FAIL', message: '门店参数不合法' }, 400);
    }
    const payload = (await c.req.json().catch(() => ({}))) as {
      resource?: {
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    };
    const exists = await services.prisma.takeoutShop.findUnique({
      where: { id: shopId },
      select: { id: true },
    });
    if (!exists) return c.json({ code: 'FAIL', message: '门店不存在' }, 404);
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    if (!payload.resource?.ciphertext) {
      return c.json({ code: 'FAIL', message: '回调缺少密文' }, 400);
    }
    try {
      const decoded = await pay.decryptNotify(shopId, {
        ciphertext: payload.resource.ciphertext,
        nonce: payload.resource.nonce || '',
        associated_data: payload.resource.associated_data || '',
      });
      if (decoded.tradeState !== 'SUCCESS') {
        return c.json({ code: 'SUCCESS', message: '成功' });
      }
      const result = await orders.markPaid(
        shopId,
        decoded.outTradeNo,
        decoded.transactionId,
        decoded.amountCents,
      );
      if (!result.ok) {
        return c.json({ code: 'FAIL', message: result.message }, 400);
      }
      return c.json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
      return c.json(
        {
          code: 'FAIL',
          message: error instanceof Error ? error.message : '回调处理失败',
        },
        400,
      );
    }
  });
}
