import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import {
  errandAddressSaveBodySchema,
  errandBankCardSaveBodySchema,
  errandPublicCancelBodySchema,
  errandPublicCouponClaimBodySchema,
  errandPublicExtraPayBodySchema,
  errandPublicLoginBodySchema,
  errandPublicProfileSaveBodySchema,
  errandPublicOrderCreateBodySchema,
  errandPublicOrderQuerySchema,
  errandPublicRepayBodySchema,
  errandQuoteInputSchema,
  errandRiderActionBodySchema,
  errandPublicRateBodySchema,
  errandRiderLocationBodySchema,
  errandRiderLoginBodySchema,
  errandRiderOnlineBodySchema,
  errandRiderRegisterBodySchema,
  errandRiderWithdrawBodySchema,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { clip } from './errand.shared';

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

const tokenOf = (c: Context<ApiEnv, string, Input>) =>
  (
    c.req.header('authorization') ||
    c.req.header('x-customer-token') ||
    ''
  ).trim();

const okJson = (data: unknown) => ({ code: 0, message: 'ok', data });

const riderTokenOf = (c: Context<ApiEnv, string, Input>) =>
  (c.req.header('x-rider-token') || c.req.header('authorization') || '').trim();

/**
 * 浏览量去重：同一访客（IP+UA）同一天同一路径只记一次。
 * 进程内近似去重足够把「刷新页面」从浏览量里剔掉；跨实例不共享，属已知边界。
 */
const viewSeen = new Map<string, string>();
function firstViewToday(
  ownerUserId: string,
  ip: string,
  ua: string,
  path: string,
): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ownerUserId}|${day}|${ip}|${ua.slice(0, 40)}|${path}`;
  if (viewSeen.has(key)) return false;
  if (viewSeen.size > 50_000) viewSeen.clear();
  viewSeen.set(key, day);
  return true;
}

/**
 * 跑腿小程序公开通道（`/api/public/errand/**`，免站内鉴权）。
 *
 * 四条边界：
 * 1. 匿名只开放「看店 + 报价 + 单号查单 + 取消未接单」；顾客态读写必须带顾客令牌，
 *    令牌由底座按 scene(=ERRAND)+siteId+customerId 签发，进不了 `/enterprise/**`；
 * 2. 站点一律按 `site`（站点码）或 `appId` 反查，端上传的 siteId 不当权限依据；
 * 3. 骑手令牌使用独立 issuer（`x-rider-token`），与顾客令牌互不串用；
 * 4. 支付回调只认 URL 里的 siteId 对应的主体凭据解密，错站点报文必然解密失败。
 */
export function registerErrandPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { sites, orders, customers, riders, wallet, pay, agents } =
    services.errand;
  const meter = services.toolLaunch.meter;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const orderWindow = new RateWindow(30, 60_000);
  const queryWindow = new RateWindow(30, 60_000);
  const riderWindow = new RateWindow(60, 60_000);

  const siteOf = async (code?: string, appId?: string) => {
    const found = code
      ? await sites.byCode(code)
      : appId
        ? await sites.byAppId(appId)
        : null;
    if (!found) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '跑腿站点不存在或已关闭，请返回首页重新进入',
      );
    }
    await sites.ensureToolOpen(found.row.ownerUserId);
    return found;
  };

  /** 可选顾客登录态：令牌有效就带身份，无效按匿名处理（匿名单也要能查单）。 */
  const optionalCustomer = async (c: Context<ApiEnv, string, Input>) => {
    const token = tokenOf(c);
    if (!token) return null;
    return customers.identity(token).catch(() => null);
  };

  const requireCustomer = async (c: Context<ApiEnv, string, Input>) => {
    const token = tokenOf(c);
    if (!token) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先微信登录后再操作',
      );
    }
    return customers.identity(token);
  };

  const requireAgent = async (c: Context<ApiEnv, string, Input>) => {
    const token = (
      c.req.header('x-agent-token') ||
      c.req.header('authorization') ||
      ''
    ).trim();
    if (!token)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录代理后台');
    return agents.identity(token);
  };

  const requireRider = async (c: Context<ApiEnv, string, Input>) => {
    const token = riderTokenOf(c);
    if (!token) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录骑手工作台');
    }
    return riders.identity(token);
  };

  // ---------------------------------------------------------------- 匿名可读

  app.get('/api/public/errand/sites', async (c) => {
    const appId = String(c.req.query('appId') || '')
      .trim()
      .slice(0, 64);
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    return c.json(await sites.publicSites(appId));
  });

  app.get('/api/public/errand/bootstrap', async (c) => {
    const query = siteQuery
      .extend({ cityId: z.coerce.number().int().nonnegative().default(0) })
      .parse({
        site: c.req.query('site') || '',
        appId: c.req.query('appId') || '',
        cityId: c.req.query('cityId') || 0,
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const found = await siteOf(query.site, query.appId);
    // 浏览量口径：同一访客同一天只记一次（访问量仍由通道中间件计 PV）
    if (
      firstViewToday(
        found.row.ownerUserId,
        clientIp(c),
        c.req.header('user-agent') || '',
        'bootstrap',
      )
    ) {
      void meter.view('errand', found.row.ownerUserId).catch(() => undefined);
    }
    return c.json(
      await sites.publicContext(found.row, found.rule, query.cityId),
    );
  });

  app.post('/api/public/errand/quote', async (c) => {
    const body = errandQuoteInputSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    anonWindow.consume(clientIp(c) || 'unknown', '报价过于频繁，请稍后重试');
    const found = await siteOf(body.site);
    const identity = await optionalCustomer(c);
    if (identity && identity.siteId !== found.row.id) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '登录状态不适用本站点');
    }
    const city = await sites.publicContext(found.row, found.rule, body.cityId);
    return c.json(
      await orders.quote(
        {
          row: {
            id: found.row.id,
            ownerUserId: found.row.ownerUserId,
            name: found.row.name,
          },
          rule: city.rule,
          cityId: city.cityId,
        },
        body,
        identity,
      ),
    );
  });

  // ---------------------------------------------------------------- 顾客登录

  app.post('/api/public/errand/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = errandPublicLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const ctx = await siteOf(body.site);
    const site = ctx.row;
    const session = await customers.loginByCode(body);
    void services.terminalScrm.identify({
      ownerUserId: site.ownerUserId,
      scene: 'ERRAND',
      sourceId: site.id,
      sourceName: site.name,
      customerId: session.customerId,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.customerId,
    });
    return c.json(session);
  });

  app.post('/api/public/errand/profile/save', async (c) => {
    const identity = await requireCustomer(c);
    const body = errandPublicProfileSaveBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await customers.saveProfile(identity, body));
  });

  // ---------------------------------------------------------------- 下单与支付

  app.post('/api/public/errand/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const body = errandPublicOrderCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const found = await siteOf(body.site);
    const identity = await optionalCustomer(c);
    if (identity && identity.siteId !== found.row.id) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '登录状态不适用本站点');
    }
    const publicSite = await sites.publicContext(
      found.row,
      found.rule,
      body.cityId,
    );
    return c.json(
      await orders.create(
        {
          id: found.row.id,
          ownerUserId: found.row.ownerUserId,
          name: found.row.name,
          siteCode: found.row.siteCode,
          cityId: publicSite.cityId,
          cityName: publicSite.cityName,
          protocolText: found.row.protocolText,
          toggles: publicSite.toggles,
        },
        publicSite.rule,
        body,
        {
          ip: clientIp(c),
          openid: identity?.openid || '',
          customerId: identity?.customerId || 0,
          identity,
        },
      ),
    );
  });

  app.post('/api/public/errand/order/repay', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = errandPublicRepayBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const found = await siteOf(body.site);
    const identity = await optionalCustomer(c);
    return c.json(
      await orders.repay(
        {
          id: found.row.id,
          ownerUserId: found.row.ownerUserId,
          name: found.row.name,
          siteCode: found.row.siteCode,
        },
        {
          orderNo: body.orderNo,
          openid: identity?.openid || '',
          customerId: identity?.customerId || 0,
        },
      ),
    );
  });

  app.post('/api/public/errand/order/extra/pay', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = errandPublicExtraPayBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const found = await siteOf(body.site);
    const identity = await requireCustomer(c);
    if (identity.siteId !== found.row.id) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '登录状态不适用本站点');
    }
    return c.json(
      await orders.payExtra(
        {
          id: found.row.id,
          ownerUserId: found.row.ownerUserId,
          name: found.row.name,
          siteCode: found.row.siteCode,
        },
        body,
        identity.openid,
      ),
    );
  });

  app.get('/api/public/errand/order/query', async (c) => {
    queryWindow.consume(clientIp(c) || 'unknown', '查询过于频繁，请稍后再试');
    const query = errandPublicOrderQuerySchema.parse({
      site: c.req.query('site') || '',
      orderNo: c.req.query('orderNo') || '',
      mobile: c.req.query('mobile') || '',
    });
    const found = await siteOf(query.site);
    const identity = await optionalCustomer(c);
    c.header('Cache-Control', 'no-store');
    const result = await orders.query(found.row.id, query, identity);
    // 订单详情被查询＝一次业务浏览，按浏览量口径可单独出账（同访客同日去重）
    if (
      firstViewToday(
        found.row.ownerUserId,
        clientIp(c),
        c.req.header('user-agent') || '',
        'order-query',
      )
    ) {
      void meter.view('errand', found.row.ownerUserId).catch(() => undefined);
    }
    return c.json(result);
  });

  app.post('/api/public/errand/order/cancel', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = errandPublicCancelBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const found = await siteOf(body.site);
    const identity = tokenOf(c) ? await optionalCustomer(c) : null;
    return c.json(await orders.cancelPublic(found.row.id, body, identity));
  });

  app.post('/api/public/errand/order/rate', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const identity = await requireCustomer(c);
    const body = errandPublicRateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const found = await siteOf(body.site);
    if (identity.siteId !== found.row.id) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '登录状态不适用本站点');
    }
    return c.json(await orders.rate(found.row.id, body, identity));
  });

  app.get('/api/public/errand/order/my', async (c) => {
    queryWindow.consume(clientIp(c) || 'unknown', '查询过于频繁，请稍后再试');
    const identity = await requireCustomer(c);
    return c.json(await orders.myOrders(identity));
  });

  // ---------------------------------------------------------------- 地址簿与优惠券

  app.get('/api/public/errand/address/list', async (c) => {
    const identity = await requireCustomer(c);
    return c.json(await customers.addresses(identity));
  });

  app.post('/api/public/errand/address/save', async (c) => {
    const identity = await requireCustomer(c);
    const body = errandAddressSaveBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await customers.saveAddress(identity, body));
  });

  app.post('/api/public/errand/address/remove', async (c) => {
    const identity = await requireCustomer(c);
    const body = z
      .object({ id: z.number().int().positive() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(await customers.removeAddress(identity, body.id));
  });

  app.get('/api/public/errand/coupon/my', async (c) => {
    const identity = await requireCustomer(c);
    return c.json(await customers.myCoupons(identity));
  });

  app.post('/api/public/errand/coupon/claim', async (c) => {
    const identity = await requireCustomer(c);
    const body = errandPublicCouponClaimBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await customers.claimCoupon(identity, body));
  });

  // ---------------------------------------------------------------- 骑手端

  app.post('/api/public/errand/rider/register', async (c) => {
    riderWindow.consume(clientIp(c) || 'unknown', '提交过于频繁，请稍后再试');
    const body = errandRiderRegisterBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await riders.register(body));
  });

  app.post('/api/public/errand/rider/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = errandRiderLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await riders.login(body));
  });

  app.get('/api/public/errand/rider/profile', async (c) => {
    const identity = await requireRider(c);
    return c.json(riders.profile(identity.rider));
  });

  app.get('/api/public/errand/rider/workbench', async (c) => {
    const identity = await requireRider(c);
    const work = await orders.riderWorkbench(identity.siteId, identity.rider);
    return c.json({ rider: riders.profile(identity.rider), ...work });
  });

  app.post('/api/public/errand/rider/online', async (c) => {
    const identity = await requireRider(c);
    const body = errandRiderOnlineBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await riders.setOnline(identity.rider, body));
  });

  app.post('/api/public/errand/rider/location', async (c) => {
    const identity = await requireRider(c);
    const body = errandRiderLocationBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await riders.setLocation(identity.rider, body));
  });

  app.post('/api/public/errand/rider/accept', async (c) => {
    const identity = await requireRider(c);
    const body = z
      .object({ orderId: z.number().int().positive() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(
      await orders.acceptOrder(
        identity.siteId,
        identity.rider.id,
        body.orderId,
      ),
    );
  });

  app.post('/api/public/errand/rider/action', async (c) => {
    const identity = await requireRider(c);
    const body = errandRiderActionBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await orders.riderAction(identity.siteId, identity.rider.id, body),
    );
  });

  app.get('/api/public/errand/rider/bank-cards', async (c) => {
    const identity = await requireRider(c);
    return c.json(await riders.bankCards(identity.rider));
  });

  app.post('/api/public/errand/rider/bank-card/save', async (c) => {
    const identity = await requireRider(c);
    const body = errandBankCardSaveBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(await riders.saveBankCard(identity.rider, body));
  });

  app.post('/api/public/errand/rider/bank-card/remove', async (c) => {
    const identity = await requireRider(c);
    const body = z
      .object({ id: z.number().int().positive() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(await riders.removeBankCard(identity.rider, body.id));
  });

  app.get('/api/public/errand/rider/incomes', async (c) => {
    const identity = await requireRider(c);
    return c.json(
      await wallet.riderIncomes(identity.siteId, identity.rider.id),
    );
  });

  app.get('/api/public/errand/rider/withdrawals', async (c) => {
    const identity = await requireRider(c);
    return c.json(
      await wallet.riderWithdrawals(identity.siteId, identity.rider.id),
    );
  });

  app.post('/api/public/errand/rider/withdraw', async (c) => {
    const identity = await requireRider(c);
    const body = errandRiderWithdrawBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await riders.requestWithdrawal(
        identity.rider,
        body.amount,
        body.bankInfo,
      ),
    );
  });

  // ---------------------------------------------------------------- 骑手资料上传

  /** 骑手证件照/车辆照：先登录顾客态拿到 openid，再把图片登记进平台数字资产。 */
  app.post('/api/public/errand/upload', async (c) => {
    const identity = await requireCustomer(c);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要上传的图片');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '图片不能超过 5MB',
      );
    }
    const name = String(file.name || 'image.jpg');
    const ext = (name.split('.').pop() || 'jpg').toLowerCase().slice(0, 8);
    if (!/^(png|jpg|jpeg|webp)$/.test(ext)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只支持 png / jpg / jpeg / webp 图片',
      );
    }
    const path = `errand/upload/${identity.siteId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const uploaded = await services.systemAsset.put({
      ownerUserId: identity.ownerUserId,
      path,
      bytes: Buffer.from(await file.arrayBuffer()),
      name,
      assetType: 'image',
      bizRef: `errand:${identity.siteId}`,
    });
    return c.json({ url: uploaded.url, name, size: uploaded.size });
  });

  // ---------------------------------------------------------------- 代理端

  app.post('/api/public/errand/agent/login', async (c) => {
    loginWindow.consume(clientIp(c) || 'unknown', '登录过于频繁，请稍后再试');
    const body = z
      .object({
        site: z.string().trim().max(16).default(''),
        mobile: z.string().trim().min(5).max(20),
        password: z.string().trim().min(1).max(64),
      })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(okJson(await agents.login(body)));
  });

  app.get('/api/public/errand/agent/me', async (c) => {
    const identity = await requireAgent(c);
    return c.json(okJson(await agents.me(identity.agent)));
  });

  app.get('/api/public/errand/agent/orders', async (c) => {
    const identity = await requireAgent(c);
    return c.json(
      okJson(
        await agents.orders(identity.agent, {
          page: c.req.query('page') || 1,
          pageSize: c.req.query('pageSize') || 20,
          status: c.req.query('status') || '',
        }),
      ),
    );
  });

  app.get('/api/public/errand/agent/wallet', async (c) => {
    const identity = await requireAgent(c);
    return c.json(okJson(await agents.wallet(identity.agent)));
  });

  app.post('/api/public/errand/agent/withdraw', async (c) => {
    const identity = await requireAgent(c);
    const body = z
      .object({
        amount: z.number().min(0.01),
        bankInfo: z.string().trim().max(200).default(''),
      })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(
      await agents.requestWithdrawal(
        identity.agent,
        body.amount,
        body.bankInfo,
      ),
    );
  });

  // ---------------------------------------------------------------- 支付回调

  app.post('/api/public/errand/pay/notify/:siteId', async (c) => {
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
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    try {
      const decoded = await pay.decryptNotify(siteId, {
        ciphertext: payload.resource.ciphertext,
        nonce: payload.resource.nonce || '',
        associated_data: payload.resource.associated_data || '',
      });
      await orders.handlePaid(siteId, decoded);
      const order = await services.prisma.errandOrder.findUnique({
        where: { orderNo: decoded.outTradeNo },
        select: { id: true, siteId: true, customerId: true },
      });
      if (order) {
        void services.terminalScrm.identify({
          scene: 'ERRAND',
          sourceId: order.siteId,
          customerId: order.customerId,
          kind: 'ORDER_PAID',
          recordKey: order.id,
        });
      }
      return c.json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
      return c.json(
        {
          code: 'FAIL',
          message: clip(
            error instanceof Error ? error.message : '回调处理失败',
            180,
          ),
        },
        400,
      );
    }
  });
}
