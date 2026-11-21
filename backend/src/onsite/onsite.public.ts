import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { pageParam } from '../common/api';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { registerOnsiteUpload } from './onsite.upload';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { ONSITE_SCENE } from './onsite.shop.service';

const bootstrapQuery = z.object({
  shopCode: z.string().trim().max(16).optional(),
  appId: z.string().trim().max(64).optional(),
});
const loginBody = z.object({
  shopCode: z.string().trim().max(16).default(''),
  code: z.string().trim().max(128).default(''),
});
const pageQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  page: z.string().default('1'),
  pageSize: z.string().default('20'),
  keyword: z.string().default(''),
  categoryId: z.string().default(''),
  staffId: z.string().default(''),
  serviceId: z.string().default(''),
  id: z.string().default(''),
  orderId: z.string().default(''),
  refundId: z.string().default(''),
  status: z.string().default(''),
  articleId: z.string().default(''),
  day: z.string().default(''),
  cityId: z.string().default(''),
});
const createOrderBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  staffId: z.number().int().min(0).default(0),
  addressId: z.number().int().positive(),
  startAt: z.string().trim().min(1).max(32),
  items: z
    .array(
      z.object({
        serviceId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1)
    .max(20),
  customerRemark: z.string().trim().max(300).default(''),
  couponTicketId: z.number().int().min(0).default(0),
  useBalance: z.boolean().default(false),
});
const addressBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  id: z.number().int().min(0).default(0),
  contactName: z.string().trim().max(60).default(''),
  phone: z.string().trim().min(3).max(32),
  province: z.string().trim().max(60).default(''),
  city: z.string().trim().max(60).default(''),
  district: z.string().trim().max(60).default(''),
  detail: z.string().trim().max(200).default(''),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  cityId: z.number().int().min(0).default(0),
  tag: z.string().trim().max(20).default(''),
  isDefault: z.boolean().default(false),
});
const orderActionBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().positive(),
  reason: z.string().trim().max(200).default(''),
  image: z.string().trim().max(500).default(''),
});
/** 顾客评价：总分 + 服务/态度分项 + 按服务打分的明细行（与店主端展示口径一致）。 */
const reviewBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  serviceRating: z.number().int().min(1).max(5).default(5),
  attitudeRating: z.number().int().min(1).max(5).default(5),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),
  content: z.string().trim().max(2000).default(''),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  anonymous: z.boolean().default(false),
  items: z
    .array(
      z.object({
        serviceId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .max(20)
    .default([]),
});
const couponReceiveBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  couponId: z.number().int().positive(),
});
const rechargeBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  cardId: z.number().int().positive(),
});
const inviteBindBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  code: z.string().trim().min(1).max(32),
});
const withdrawalBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  amountCents: z.number().int().positive(),
  method: z.string().trim().max(20).default('OFFLINE'),
  payInfo: z.record(z.string(), z.unknown()).default({}),
});
const refundApplyBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  evidenceImages: z.array(z.string().trim().max(500)).max(9).default([]),
  items: z
    .array(
      z.object({
        orderItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .max(20)
    .default([]),
});
const feedbackBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().min(0).default(0),
  staffId: z.number().int().min(0).default(0),
  category: z.string().trim().max(40).default('other'),
  content: z.string().trim().min(1).max(2000),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  video: z.string().trim().max(500).default(''),
});

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

/**
 * 上门服务小程序公开通道（免站内鉴权）。
 *
 * 两条不可商量的隔离规则：
 * 1. 顾客身份只来自 `parseCustomerToken`（载荷带 shopId），所有读写一律
 *    `shopId + customerId` 双条件过滤，**绝不拿请求体里的 id 直接查**；
 * 2. 出参不含任何凭据痕迹：技师手机号只在成单后由订单详情给出，列表页只给昵称与评分。
 */
export function registerOnsitePublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const {
    shops,
    miniApp,
    customers,
    catalog,
    staff,
    schedule,
    cities,
    content,
    orders,
    refunds,
    reviews,
    assist,
    marketing,
    wallet,
  } = services.onsite;
  const browseWindow = new RateWindow(240, 60_000);
  const writeWindow = new RateWindow(30, 60_000);
  // 公开上传（打卡照片/签名/评价图）：顾客或技师令牌任一有效，见 onsite.upload.ts
  registerOnsiteUpload(app, services);

  /** 按 shopCode 取店铺 + 校验可营业。 */
  const requireShop = async (shopCode: string) => {
    const shop = await shops.findByCode(shopCode);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或尚未开通，请让店主在后台完成开通后再试',
      );
    }
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已被平台暂停服务',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('onsite', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return shop;
  };

  /** 取顾客身份（写操作用）。 */
  const requireCustomer = async (c: Context<ApiEnv, string, Input>) => {
    const token = c.req.header('authorization') || '';
    const payload = parseCustomerToken(token);
    const customer = await customers.requireCustomer(payload);
    return { payload, customer };
  };

  app.get('/api/public/onsite/bootstrap', async (c) => {
    const query = bootstrapQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: c.req.query('appId') || '',
    });
    browseWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = query.shopCode
      ? await shops.findByCode(query.shopCode)
      : await shops.findByAppId(query.appId || '');
    if (!shop)
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或尚未开通');
    const settings = await services.onsite.platform.settings();
    if (!settings.enabled) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '上门服务小程序已由平台关闭，暂时无法使用',
      );
    }
    const stats = await catalog.shopStats(shop.shopId);
    const payEnabled =
      settings.allowOnlinePay &&
      (await miniApp.payEnabled({
        ownerUserId: shop.ownerUserId,
        scene: ONSITE_SCENE,
        shopId: shop.shopId,
        shopName: shop.shopName,
      }));
    // 客服与 SCRM 两个入口各自独立判定：任一侧板块被关或对象失效，另一个照常下发
    const entry = await assist.publicEntry(
      shop.ownerUserId,
      await shops.tradeById(shop.shopId),
    );
    return c.json({
      scene: ONSITE_SCENE,
      shopCode: shop.shopCode,
      shopName: shop.shopName,
      slogan: shop.slogan,
      logo: shop.logo,
      themeColor: shop.theme.themeColor,
      navigationTitle: shop.theme.navigationTitle,
      servicePhone: shop.servicePhone,
      /** 在线客服：端上用 apiBase 拼 `${apiBase}/embed/service-desk?key=${siteKey}` 打开同域会话窗。 */
      desk: entry.desk,
      /** 私域顾问：展示企微活码二维码，扫码加微后由 SCRM 侧接管，本域不落会话数据。 */
      scrm: entry.scrm,
      features: {
        // booking 关掉等于小程序里没有下单入口，服务与技师都为空时直接不给约
        booking: stats.serviceCount > 0 && stats.staffCount > 0,
        addon: true,
        store: false,
        dynamic: false,
        distribution: false,
        marketing: false,
      },
      payEnabled,
      shopStatus: shop.status,
    });
  });

  app.post('/api/public/onsite/login', async (c) => {
    const ip = clientIp(c) || 'unknown';
    writeWindow.consume(ip, '登录过于频繁，请一分钟后再试');
    const body = loginBody.parse(await c.req.json().catch(() => ({})));
    const code = String(body.code || '').trim();
    if (!code)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    if (!body.shopCode) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少店铺码：请确认小程序包的 config.js 已注入 shopCode',
      );
    }
    const shop = await requireShop(body.shopCode);
    const session = await customers.loginByCode(body.shopCode, code);
    void services.terminalScrm.identify({
      ownerUserId: shop.ownerUserId,
      scene: 'ONSITE',
      sourceId: shop.shopId,
      sourceName: shop.shopName,
      customerId: session.profile.customerId,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.profile.customerId,
    });
    return c.json(session);
  });

  // ---------- 浏览 ----------

  app.get('/api/public/onsite/services', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    const result = await catalog.publicServices(shop.shopId, {
      page,
      pageSize,
      keyword: query.keyword,
      categoryId: Number(query.categoryId) || 0,
    });
    return c.json(result);
  });

  app.get('/api/public/onsite/services/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    return c.json(
      await catalog.publicServiceDetail(
        shop.shopId,
        Number(query.serviceId) || 0,
      ),
    );
  });

  app.get('/api/public/onsite/staff', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await staff.publicList(shop.shopId, {
        page,
        pageSize,
        serviceId: Number(query.serviceId) || 0,
        keyword: query.keyword,
      }),
    );
  });

  app.get('/api/public/onsite/staff/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    return c.json(
      await staff.publicDetail(shop.shopId, Number(query.staffId) || 0),
    );
  });

  app.get('/api/public/onsite/schedule/days', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    return c.json(
      await schedule.publicDays(shop, {
        staffId: Number(query.staffId) || undefined,
        serviceId: Number(query.serviceId) || undefined,
      }),
    );
  });

  app.get('/api/public/onsite/schedule/timeline', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    return c.json(
      await schedule.timelineFor({
        shopId: shop.shopId,
        day: query.day,
        staffId: Number(query.staffId) || undefined,
        serviceId: Number(query.serviceId) || undefined,
        viewer: 'CUSTOMER',
        trade: shop.trade,
      }),
    );
  });

  // ---------- 地址簿 ----------

  app.get('/api/public/onsite/addresses', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json({
      list: await customers.listAddresses(shop.shopId, customer.id),
    });
  });

  app.post('/api/public/onsite/addresses', async (c) => {
    const body = addressBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await customers.saveAddress(shop.shopId, customer.id, body));
  });

  app.post('/api/public/onsite/addresses/remove', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        id: z.number().int().positive(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await customers.removeAddress(shop.shopId, customer.id, body.id),
    );
  });

  // ---------- 试算与下单 ----------

  app.post('/api/public/onsite/orders/preview', async (c) => {
    const body = createOrderBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicPreview(shop, customer.id, {
        staffId: body.staffId,
        addressId: body.addressId,
        startAt: body.startAt,
        items: body.items,
        couponTicketId: body.couponTicketId,
        useBalance: body.useBalance,
      }),
    );
  });

  app.post('/api/public/onsite/orders', async (c) => {
    const body = createOrderBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:${customer.id}`,
      '下单过于频繁，请确认后再试',
    );
    return c.json(
      await orders.create(
        shop,
        customer.id,
        {
          staffId: body.staffId,
          addressId: body.addressId,
          startAt: body.startAt,
          items: body.items,
          customerRemark: body.customerRemark,
          couponTicketId: body.couponTicketId,
          useBalance: body.useBalance,
        },
        { role: 'CUSTOMER', operatorId: String(customer.id), ip: clientIp(c) },
      ),
    );
  });

  app.get('/api/public/onsite/orders', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 10);
    return c.json(
      await orders.publicList(shop.shopId, customer.id, page, pageSize),
    );
  });

  app.get('/api/public/onsite/orders/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicDetail(
        shop.shopId,
        customer.id,
        Number(query.orderId || query.serviceId) || 0,
      ),
    );
  });

  app.post('/api/public/onsite/orders/cancel', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicCancel(
        shop.shopId,
        customer.id,
        body.orderId,
        body.reason,
      ),
    );
  });

  app.post('/api/public/onsite/orders/pay-params', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicPayParams(
        shop.shopId,
        customer.id,
        body.orderId,
        customer.openid,
      ),
    );
  });

  /** 加钟单支付参数：加钟是独立待付记录，不能借主单的支付入口。 */
  app.post('/api/public/onsite/addons/pay-params', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        addonId: z.number().int().positive(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicAddonPayParams(
        shop.shopId,
        customer.id,
        body.addonId,
        customer.openid,
      ),
    );
  });

  app.post('/api/public/onsite/orders/sign', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    if (!body.image.trim()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先完成手写签名');
    }
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await orders.publicSign(
        shop.shopId,
        customer.id,
        body.orderId,
        body.image,
        String(customer.id),
      ),
    );
  });

  app.post('/api/public/onsite/orders/addon', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        orderId: z.number().int().positive(),
        orderItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(10).default(1),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await orders.publicAddon(shop.shopId, customer.id, body));
  });

  app.post('/api/public/onsite/fee/estimate', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        addressId: z.number().int().positive(),
        staffId: z.number().int().min(0).default(0),
        serviceId: z.number().int().min(0).default(0),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await cities.publicEstimate(shop, customer.id, body));
  });

  // ---------- 内容 ----------

  app.get('/api/public/onsite/articles', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(await content.publicArticles(shop.shopId, page, pageSize));
  });

  app.get('/api/public/onsite/articles/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    return c.json(
      await content.publicArticleDetail(
        shop.shopId,
        Number(query.articleId || query.serviceId || query.id) || 0,
      ),
    );
  });

  app.post('/api/public/onsite/articles/submit', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        articleId: z.number().int().positive(),
        answers: z.record(z.string(), z.string()).default({}),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:form:${customer.id}`,
      '提交过于频繁，请稍后再试',
    );
    return c.json(
      await content.submitForm({
        shopId: shop.shopId,
        articleId: body.articleId,
        customerId: customer.id,
        answers: body.answers,
      }),
    );
  });

  // ---------- 评价与售后 ----------

  app.post('/api/public/onsite/reviews', async (c) => {
    const body = reviewBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:review:${customer.id}`,
      '提交过于频繁，请稍后再试',
    );
    return c.json(
      await reviews.create(shop, customer.id, {
        orderId: body.orderId,
        rating: body.rating,
        serviceRating: body.serviceRating,
        attitudeRating: body.attitudeRating,
        tags: body.tags,
        content: body.content,
        images: body.images,
        anonymous: body.anonymous,
        items: body.items,
      }),
    );
  });

  /** 顾客查看自己某单的评价（也用于「已评价」态的回显，避免重复入口）。 */
  app.get('/api/public/onsite/reviews/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await reviews.byOrder(
        shop.shopId,
        customer.id,
        Number(query.orderId || query.serviceId) || 0,
      ),
    );
  });

  // ---------- P2：我的券 / 余额 / 邀请（一律顾客令牌 + 店铺双条件） ----------

  app.get('/api/public/onsite/coupons', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await marketing.customerCoupons(shop.shopId, customer.id));
  });

  app.post('/api/public/onsite/coupons/receive', async (c) => {
    const body = couponReceiveBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:${customer.id}`,
      '操作过于频繁，请稍后再试',
    );
    return c.json(
      await marketing.receiveCoupon(shop.shopId, customer.id, body.couponId),
    );
  });

  app.get('/api/public/onsite/balance', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await wallet.customerBalance(shop.shopId, customer.id));
  });

  app.get('/api/public/onsite/balance/cards', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    await requireCustomer(c);
    return c.json(await wallet.customerCards(shop.shopId));
  });

  app.get('/api/public/onsite/balance/flows', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await wallet.customerBalanceFlows(
        shop.shopId,
        customer.id,
        page,
        pageSize,
      ),
    );
  });

  app.post('/api/public/onsite/balance/recharge', async (c) => {
    const body = rechargeBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:${customer.id}`,
      '操作过于频繁，请稍后再试',
    );
    return c.json(
      await wallet.createRecharge(shop.shopId, customer.id, body.cardId),
    );
  });

  app.get('/api/public/onsite/invite', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await marketing.inviteCode(shop.shopId, customer.id));
  });

  app.post('/api/public/onsite/invite/bind', async (c) => {
    const body = inviteBindBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:${customer.id}`,
      '操作过于频繁，请稍后再试',
    );
    return c.json(
      await marketing.bindInvite(shop.shopId, customer.id, body.code),
    );
  });

  app.post('/api/public/onsite/withdrawals', async (c) => {
    const body = withdrawalBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:${customer.id}`,
      '操作过于频繁，请稍后再试',
    );
    return c.json(
      await wallet.requestWithdrawal({
        shopId: shop.shopId,
        ownerType: 'DISTRIBUTOR',
        ownerId: customer.id,
        amountCents: body.amountCents,
        method: body.method,
        payInfo: body.payInfo,
      }),
    );
  });

  app.post('/api/public/onsite/refunds/quote', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(await refunds.quote(shop.shopId, body.orderId, customer.id));
  });

  app.post('/api/public/onsite/refunds', async (c) => {
    const body = refundApplyBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:refund:${customer.id}`,
      '退款申请提交过于频繁，请稍后再试',
    );
    return c.json(
      await refunds.apply(shop, {
        orderId: body.orderId,
        customerId: customer.id,
        reason: body.reason,
        description: body.description,
        evidenceImages: body.evidenceImages,
        items: body.items,
        role: 'CUSTOMER',
        operatorId: String(customer.id),
      }),
    );
  });

  /** 退款进度：只列本人订单产生的退款单，金额与状态由退款服务统一口径给出。 */
  app.get('/api/public/onsite/refunds', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 10);
    return c.json(
      await refunds.publicList(
        shop.shopId,
        customer.id,
        page,
        pageSize,
        query.status,
      ),
    );
  });

  /** 退款详情：公开通道按本人退款单查，含按行拆分与被驳回原因。 */
  app.get('/api/public/onsite/refunds/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await refunds.publicDetail(
        shop.shopId,
        customer.id,
        Number(query.refundId) || 0,
      ),
    );
  });

  app.post('/api/public/onsite/refunds/cancel', async (c) => {
    const body = z
      .object({
        shopCode: z.string().trim().max(16).min(1),
        refundId: z.number().int().positive(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    return c.json(
      await refunds.cancel(shop.shopId, customer.id, body.refundId),
    );
  });

  /** 我的反馈列表：只列本人提交的，店主回复一并带回。 */
  app.get('/api/public/onsite/feedbacks', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { customer } = await requireCustomer(c);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 10);
    return c.json(
      await reviews.publicFeedbacks(shop.shopId, customer.id, page, pageSize),
    );
  });

  /** 顾客投诉/反馈：与评价分开，差评申诉走技师端，这里只进店主反馈列表。 */
  app.post('/api/public/onsite/feedbacks', async (c) => {
    const body = feedbackBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { customer } = await requireCustomer(c);
    writeWindow.consume(
      `${shop.shopId}:feedback:${customer.id}`,
      '提交过于频繁，请稍后再试',
    );
    return c.json(
      await reviews.submitFeedback(shop.shopId, {
        customerId: customer.id,
        staffId: body.staffId,
        orderId: body.orderId,
        category: body.category,
        content: body.content,
        images: body.images,
        video: body.video,
      }),
    );
  });

  /**
   * 微信支付回调：`/api/public/onsite/pay/notify/:shopId`。
   * 验签用**该店自己的**商户凭据；金额不符只留痕不改状态，永远回 200 之外的错误码让微信重试。
   */
  app.post('/api/public/onsite/pay/notify/:shopId', async (c) => {
    const shopId = Number(c.req.param('shopId'));
    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '店铺标识不合法');
    }
    const raw = await c.req.text();
    const credentials = await orders.notifyCredentials(shopId);
    if (!credentials) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺未配置微信支付',
      );
    }
    const transaction = await services.onsite.pay.parseNotify(
      credentials,
      {
        'wechatpay-serial': c.req.header('wechatpay-serial') || '',
        'wechatpay-nonce-str': c.req.header('wechatpay-nonce-str') || '',
        'wechatpay-timestamp': c.req.header('wechatpay-timestamp') || '',
        'wechatpay-signature': c.req.header('wechatpay-signature') || '',
      },
      raw,
    );
    const result = await orders.markPaid(shopId, transaction);
    if (result.handled) {
      void services.terminalScrm.identifyOrderPaid({
        scene: 'ONSITE',
        sourceId: shopId,
        orderNo: transaction.out_trade_no || '',
      });
    }
    return c.json(
      result.handled
        ? { code: 'SUCCESS', message: '成功' }
        : { code: 'FAIL', message: result.reason || '未处理' },
      200,
    );
  });
}
