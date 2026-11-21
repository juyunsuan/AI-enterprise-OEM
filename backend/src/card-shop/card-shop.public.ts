import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import {
  cardShopPublicLoginBodySchema,
  cardShopPublicOrderCreateBodySchema,
  cardShopPublicQuerySchema,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { CardShopPayService } from './card-shop.pay.service';
import { clip } from './card-shop.shared';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

const siteQuery = z.object({
  site: z.string().trim().max(16).default(''),
  appId: z.string().trim().max(64).default(''),
});

const goodsQuery = z.object({
  site: z.string().trim().max(16).default(''),
  keyword: z.string().trim().max(60).optional(),
  categoryId: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['default', 'newest']).default('default'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

/**
 * 卡密商城小程序顾客端公开通道（`/api/public/card-shop/**`，免站内鉴权）。
 *
 * 四条边界：
 * 1. 匿名只开放「看店 + 看商品 + 按单号查卡」；顾客态读写（我的订单）必须带顾客令牌，
 *    令牌由底座按 scene(=CARD_SHOP)+siteId+customerId 签发，进不了 `/enterprise/**`；
 * 2. 站点一律按 `site`（站点码）或 `appId` 反查，**端上传的 siteId 不当权限依据**；
 * 3. bootstrap 是匿名可访问的最大攻击面：只回展示字段，绝不带凭据痕迹，并按 IP 限流；
 * 4. 支付回调只认 URL 里的 siteId 对应的商户号解密，错店报文必然解密失败。
 */
export function registerCardShopPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { sites, goods, orders, customers, contents, pay } = services.cardShop;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const orderWindow = new RateWindow(30, 60_000);
  const queryWindow = new RateWindow(30, 60_000);

  /** 站点码 / AppID → C 端上下文（已关闭的站点在这里就是「不存在」）。 */
  const siteOf = async (code?: string, appId?: string) => {
    const row = code
      ? await sites.byCode(code)
      : appId
        ? await sites.byAppId(appId)
        : null;
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '商店不存在：请确认小程序包的 config.js 已注入站点码',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用「暂停营业」同一停服形状
    if (!(await toolOpen('card-shop', row.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return sites.publicContext(row);
  };

  /** 可选登录态：令牌有效就带上顾客身份，无效按匿名处理（匿名单也要能查）。 */
  const optionalBuyer = async (c: Context<ApiEnv, string, Input>) => {
    const token =
      c.req.header('authorization') || c.req.header('x-customer-token') || '';
    if (!token.trim()) return null;
    return customers.identity(token).catch(() => null);
  };

  // ---------------------------------------------------------------- 匿名可读

  app.get('/api/public/card-shop/bootstrap', async (c) => {
    const query = siteQuery.parse({
      site: c.req.query('site') || '',
      appId: c.req.query('appId') || '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site, query.appId);
    return c.json(await orders.bootstrap(site));
  });

  app.get('/api/public/card-shop/categories', async (c) => {
    const query = siteQuery.parse({ site: c.req.query('site') || '' });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(await goods.publicCategories(site));
  });

  app.get('/api/public/card-shop/goods', async (c) => {
    const query = goodsQuery.parse({
      site: c.req.query('site') || '',
      keyword: c.req.query('keyword') || undefined,
      categoryId: c.req.query('categoryId') || undefined,
      sort: c.req.query('sort') || undefined,
      page: c.req.query('page') || undefined,
      pageSize: c.req.query('pageSize') || undefined,
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(await orders.goodsList(site, query));
  });

  app.get('/api/public/card-shop/goods/detail', async (c) => {
    const query = siteQuery
      .extend({
        id: z.coerce.number().int().positive(),
        visitPassword: z.string().trim().max(64).default(''),
      })
      .parse({
        site: c.req.query('site') || '',
        id: c.req.query('id') || '0',
        visitPassword: c.req.query('visitPassword') || '',
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(
      await orders.goodsDetail(site, query.id, query.visitPassword),
    );
  });

  app.get('/api/public/card-shop/coupon/check', async (c) => {
    const query = siteQuery
      .extend({
        goodsId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(100000).default(1),
        code: z.string().trim().max(40).default(''),
      })
      .parse({
        site: c.req.query('site') || '',
        goodsId: c.req.query('goodsId') || '0',
        quantity: c.req.query('quantity') || undefined,
        code: c.req.query('code') || '',
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(
      await orders.quote(site, {
        goodsId: query.goodsId,
        quantity: query.quantity,
        couponCode: query.code,
      }),
    );
  });

  app.get('/api/public/card-shop/content', async (c) => {
    const query = siteQuery
      .extend({
        kind: z.enum(['NOTICE', 'ARTICLE', 'PAGE']).default('ARTICLE'),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(50).default(20),
      })
      .parse({
        site: c.req.query('site') || '',
        kind: c.req.query('kind') || undefined,
        page: c.req.query('page') || undefined,
        pageSize: c.req.query('pageSize') || undefined,
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(await contents.publicList(site, query.kind, query));
  });

  app.get('/api/public/card-shop/content/detail', async (c) => {
    const query = siteQuery
      .extend({
        id: z.coerce.number().int().positive(),
      })
      .parse({
        site: c.req.query('site') || '',
        id: c.req.query('id') || '0',
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    const row = await contents.publicDetail(site.siteId, query.id);
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下架');
    return c.json(row);
  });

  // ---------------------------------------------------------------- 登录

  app.post('/api/public/card-shop/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = cardShopPublicLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const site = await siteOf(body.site);
    const session = await customers.loginByCode(body);
    void services.terminalScrm.identify({
      ownerUserId: site.ownerUserId,
      scene: 'CARD_SHOP',
      sourceId: site.siteId,
      sourceName: site.name,
      customerId: session.customerId,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.customerId,
    });
    return c.json(session);
  });

  // ---------------------------------------------------------------- 下单与支付

  app.post('/api/public/card-shop/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const body = cardShopPublicOrderCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const site = await siteOf(body.site);
    const buyer = await optionalBuyer(c);
    return c.json(
      await orders.create(site, body, {
        ip: clientIp(c),
        openid: buyer?.openid || '',
        customerId: buyer?.siteId === site.siteId ? buyer.customerId : 0,
      }),
    );
  });

  app.post('/api/public/card-shop/order/repay', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = siteQuery
      .extend({
        orderNo: z.string().trim().min(1).max(40),
        contact: z.string().trim().max(120).default(''),
      })
      .parse(await c.req.json().catch(() => ({})));
    const site = await siteOf(body.site);
    const buyer = await optionalBuyer(c);
    return c.json(
      await orders.repay(site, {
        orderNo: body.orderNo,
        contact: body.contact,
        openid: buyer?.openid || '',
      }),
    );
  });

  /** 查单取卡：单号 + 联系方式（+ 取卡密码）；错误次数进独立窗口，防单号枚举。 */
  app.get('/api/public/card-shop/order/query', async (c) => {
    queryWindow.consume(clientIp(c) || 'unknown', '查询过于频繁，请稍后再试');
    const query = siteQuery.extend(cardShopPublicQuerySchema.shape).parse({
      site: c.req.query('site') || '',
      orderNo: c.req.query('orderNo') || '',
      contact: c.req.query('contact') || '',
      takeCardPassword: c.req.query('takeCardPassword') || '',
    });
    const site = await siteOf(query.site);
    // 响应体含卡密明文（支付后），任何层级都不得缓存
    c.header('Cache-Control', 'no-store');
    return c.json(await orders.query(site, query));
  });

  app.get('/api/public/card-shop/orders', async (c) => {
    const query = siteQuery
      .extend({
        payState: z.string().trim().max(20).default(''),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(50).default(10),
      })
      .parse({
        site: c.req.query('site') || '',
        payState: c.req.query('payState') || '',
        page: c.req.query('page') || undefined,
        pageSize: c.req.query('pageSize') || undefined,
      });
    const token =
      c.req.header('authorization') || c.req.header('x-customer-token') || '';
    const buyer = await customers.identity(token);
    const site = await siteOf(query.site);
    if (buyer.siteId !== site.siteId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '登录状态不适用本商店');
    }
    return c.json(await orders.myOrders(site, buyer.openid, query));
  });

  // ---------------------------------------------------------------- 支付回调

  app.post('/api/public/card-shop/pay/notify/:siteId', async (c) => {
    const siteId = Number(c.req.param('siteId'));
    if (!Number.isInteger(siteId) || siteId <= 0) {
      return c.json({ code: 'FAIL', message: '站点参数不合法' }, 400);
    }
    const payload = (await c.req.json().catch(() => ({}))) as {
      resource?: {
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    };
    if (!payload.resource?.ciphertext) {
      return c.json({ code: 'FAIL', message: '回调缺少密文' }, 400);
    }
    // 防重放：Wechatpay-Timestamp 必须落在 ±5 分钟窗口内（复用统一客户端的
    // notifyTimestampOk，与 parseNotify 同一口径）。不复用 parseNotify 本身：
    // 本路由按既有签名只把密文交给 pay.decryptNotify，而 parseNotify 需要
    // rawBody + 四个请求头做 RSA 验签并先下载平台证书，证书拉取失败会把可
    // 重试的 400 变成 5xx。出卡幂等由 handlePaidNotify 的 payState 条件更新保证。
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    try {
      const row = await sites.byId(siteId);
      if (!row) return c.json({ code: 'FAIL', message: '商店不存在' }, 404);
      const decoded = await pay.decryptNotify(siteId, {
        ciphertext: payload.resource.ciphertext,
        nonce: payload.resource.nonce || '',
        associated_data: payload.resource.associated_data || '',
      });
      const site = await sites.publicContext(row);
      const result = await orders.handlePaidNotify(
        site,
        {
          outTradeNo: decoded.outTradeNo,
          transactionId: decoded.transactionId,
          tradeState: decoded.tradeState,
          amountCents: decoded.amountCents,
          mchId: decoded.mchId,
        },
        clientIp(c),
      );
      // 只有「单号暂时查不到」值得让微信继续重投；金额不符、单已关闭都是确定性结果，
      // 回 FAIL 只会换来一整天的无效重试，且服务层已把处置写进订单备注并通知店主。
      if (!result.handled && result.retryable) {
        return c.json(
          { code: 'FAIL', message: clip(result.message, 180) },
          400,
        );
      }
      if (result.handled) {
        void services.terminalScrm.identifyOrderPaid({
          scene: 'CARD_SHOP',
          sourceId: siteId,
          orderNo: decoded.outTradeNo,
        });
      }
      return c.json(CardShopPayService.notifyOk());
    } catch (error) {
      const message = error instanceof Error ? error.message : '回调处理失败';
      return c.json({ code: 'FAIL', message: clip(message, 180) }, 400);
    }
  });
}
