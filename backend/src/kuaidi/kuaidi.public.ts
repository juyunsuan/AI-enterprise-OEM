import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import {
  kuaidiAddressSaveBodySchema,
  kuaidiPublicLoginBodySchema,
  kuaidiPublicOrderCreateBodySchema,
  kuaidiQuoteInputSchema,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { KuaidiPayService } from './kuaidi.pay.service';
import { clip } from './kuaidi.shared';

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

/**
 * 快递寄件小程序顾客端公开通道（`/api/public/kuaidi/**`，免站内鉴权）。
 *
 * 四条边界：
 * 1. 匿名只开放「看店 + 报价 + 单号查单 + 取消未付单」；顾客态读写（我的订单、地址簿）
 *    必须带顾客令牌，令牌由底座按 scene(=EXPRESS)+siteId+customerId 签发，进不了 `/enterprise/**`；
 * 2. 站点一律按 `site`（站点码）或 `appId` 反查，**端上传的 siteId 不当权限依据**；
 * 3. bootstrap/quote 是匿名可访问的最大攻击面：只回展示字段与启用的报价，绝不带凭据，并按 IP 限流；
 * 4. 支付回调只认 URL 里的 siteId 对应的商户号解密，错店报文必然解密失败。
 */
export function registerKuaidiPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { sites, orders, customers, pay } = services.kuaidi;
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
        '寄件点不存在或已关闭，请返回首页重新选择寄件点',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，匿名读通道一并停服
    if (!(await toolOpen('kuaidi', row.ownerUserId))) {
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

  const requireBuyer = async (
    c: Context<ApiEnv, string, Input>,
    siteId: number,
  ) => {
    const token =
      c.req.header('authorization') || c.req.header('x-customer-token') || '';
    const buyer = await customers.identity(token);
    if (buyer.siteId !== siteId) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '登录状态不适用本寄件平台',
      );
    }
    return buyer;
  };

  // ---------------------------------------------------------------- 匿名可读

  /** 账号下营业中的寄件点：小程序启动先拉列表，顾客选点（扫码带 site 时可跳过）。 */
  app.get('/api/public/kuaidi/sites', async (c) => {
    const appId = String(c.req.query('appId') || '')
      .trim()
      .slice(0, 64);
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    return c.json(await sites.publicSites(appId));
  });

  app.get('/api/public/kuaidi/bootstrap', async (c) => {
    const query = siteQuery.parse({
      site: c.req.query('site') || '',
      appId: c.req.query('appId') || '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site, query.appId);
    return c.json(await orders.bootstrap(site));
  });

  app.get('/api/public/kuaidi/quote', async (c) => {
    // 查询串全是字符串，契约按数字校验金额与重量，这里先转换再交给 schema
    const query = kuaidiQuoteInputSchema.parse({
      site: c.req.query('site') || '',
      companyId: Number(c.req.query('companyId') || 0),
      weightKg: Number(c.req.query('weightKg') || 0),
      length: Number(c.req.query('length') || 0),
      width: Number(c.req.query('width') || 0),
      height: Number(c.req.query('height') || 0),
      insuredValue: Number(c.req.query('insuredValue') || 0),
      province: c.req.query('province') || '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(query.site);
    return c.json(await orders.quote(site, query));
  });

  // ---------------------------------------------------------------- 登录

  app.post('/api/public/kuaidi/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = kuaidiPublicLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const site = await siteOf(body.site);
    const session = await customers.loginByCode(body);
    void services.terminalScrm.identify({
      ownerUserId: site.ownerUserId,
      scene: 'EXPRESS',
      sourceId: site.siteId,
      sourceName: site.name || '快递寄件',
      customerId: session.customerId,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.customerId,
    });
    return c.json(session);
  });

  // ---------------------------------------------------------------- 下单与支付

  app.post('/api/public/kuaidi/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const body = kuaidiPublicOrderCreateBodySchema.parse(
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

  app.post('/api/public/kuaidi/order/repay', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = siteQuery
      .extend({
        orderNo: z.string().trim().min(1).max(40),
        mobile: z.string().trim().max(20).default(''),
      })
      .parse(await c.req.json().catch(() => ({})));
    const site = await siteOf(body.site);
    const buyer = await optionalBuyer(c);
    return c.json(
      await orders.repay(site, {
        orderNo: body.orderNo,
        mobile: body.mobile,
        openid: buyer?.openid || '',
      }),
    );
  });

  /** 查单：单号 + 手机号；错误次数进独立窗口，防单号枚举。 */
  app.get('/api/public/kuaidi/order/query', async (c) => {
    queryWindow.consume(clientIp(c) || 'unknown', '查询过于频繁，请稍后再试');
    const query = siteQuery
      .extend({
        orderNo: z.string().trim().max(40).default(''),
        mobile: z.string().trim().max(20).default(''),
      })
      .parse({
        site: c.req.query('site') || '',
        orderNo: c.req.query('orderNo') || '',
        mobile: c.req.query('mobile') || '',
      });
    const site = await siteOf(query.site);
    // 响应体含收寄双方地址与手机号，任何层级都不得缓存
    c.header('Cache-Control', 'no-store');
    return c.json(await orders.query(site, query));
  });

  app.post('/api/public/kuaidi/order/cancel', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = siteQuery
      .extend({
        orderNo: z.string().trim().min(1).max(40),
        mobile: z.string().trim().max(20).default(''),
      })
      .parse(await c.req.json().catch(() => ({})));
    const site = await siteOf(body.site);
    return c.json(
      await orders.cancel(site, { orderNo: body.orderNo, mobile: body.mobile }),
    );
  });

  app.get('/api/public/kuaidi/orders', async (c) => {
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
    const site = await siteOf(query.site);
    const buyer = await requireBuyer(c, site.siteId);
    return c.json(
      await orders.myOrders(site, buyer.openid, {
        payState: query.payState,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  });

  // ---------------------------------------------------------------- 地址簿（需登录）

  app.get('/api/public/kuaidi/address/list', async (c) => {
    const query = siteQuery.parse({ site: c.req.query('site') || '' });
    const site = await siteOf(query.site);
    const buyer = await requireBuyer(c, site.siteId);
    return c.json(await customers.addresses(site, buyer.openid));
  });

  app.post('/api/public/kuaidi/address/save', async (c) => {
    const body = kuaidiAddressSaveBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const site = await siteOf(body.site);
    const buyer = await requireBuyer(c, site.siteId);
    return c.json(
      await customers.saveAddress(site, buyer.customerId, buyer.openid, body),
    );
  });

  app.post('/api/public/kuaidi/address/remove', async (c) => {
    const body = siteQuery
      .extend({ id: z.coerce.number().int().positive() })
      .parse(await c.req.json().catch(() => ({})));
    const site = await siteOf(body.site);
    const buyer = await requireBuyer(c, site.siteId);
    return c.json(await customers.removeAddress(site, buyer.openid, body.id));
  });

  // ---------------------------------------------------------------- 支付回调

  app.post('/api/public/kuaidi/pay/notify/:accountId', async (c) => {
    const accountId = Number(c.req.param('accountId'));
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return c.json({ code: 'FAIL', message: '收款账户参数不合法' }, 400);
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
    // 寄件点用的是企业级多商户号账户，验签要按账户下载平台证书，且本路由按
    // 既有签名只把密文交给 pay.decryptNotify（拿不到 rawBody 与请求头）；
    // 证书拉取失败还会把可重试的 400 变成 5xx。重复回调由 handlePaidNotify
    // 的 payState 判断兜住，不会二次扣款或重复出单。
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    try {
      const decoded = await pay.decryptNotify(accountId, {
        ciphertext: payload.resource.ciphertext,
        nonce: payload.resource.nonce || '',
        associated_data: payload.resource.associated_data || '',
      });
      const result = await orders.handlePaidNotify(
        {
          accountId,
          outTradeNo: decoded.outTradeNo,
          transactionId: decoded.transactionId,
          tradeState: decoded.tradeState,
          amountCents: decoded.amountCents,
          mchId: decoded.mchId,
        },
        clientIp(c),
      );
      // 只有「单号暂时查不到」值得让微信继续重投；金额不符、单已关闭都是确定性结果。
      if (!result.handled && result.retryable) {
        return c.json(
          { code: 'FAIL', message: clip(result.message, 180) },
          400,
        );
      }
      if (result.handled) {
        const order = await services.prisma.kuaidiOrder.findUnique({
          where: { orderNo: decoded.outTradeNo },
          select: { id: true, siteId: true, customerId: true },
        });
        if (order) {
          void services.terminalScrm.identify({
            scene: 'EXPRESS',
            sourceId: order.siteId,
            customerId: order.customerId,
            kind: 'ORDER_PAID',
            recordKey: order.id,
          });
        }
      }
      return c.json(KuaidiPayService.notifyOk());
    } catch (error) {
      const message = error instanceof Error ? error.message : '回调处理失败';
      return c.json({ code: 'FAIL', message: clip(message, 180) }, 400);
    }
  });
}
