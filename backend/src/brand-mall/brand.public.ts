import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
  brandPublicAddressBodySchema,
  brandPublicLoginBodySchema,
  brandPublicOrderCreateBodySchema,
  brandPublicPreviewBodySchema,
  brandPublicRefundCreateBodySchema,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { pageParam } from '../common/api';
import { resolveSiteUrl } from '../common/site-url';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { BRAND_DESK_EMBED_PATH, clip } from './brand.shared';

type ShopRow = {
  id: number;
  ownerUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  slogan: string;
  servicePhone: string;
  themeColor: string;
  status: string;
  supportSiteId: number;
};

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

const bootstrapQuery = z.object({
  shopCode: z.string().trim().max(16).optional(),
  appId: z.string().trim().max(64).optional(),
});

const productQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  keyword: z.string().trim().max(60).optional(),
  categoryId: z.coerce.number().int().min(0).optional(),
  tag: z.enum(['isHot', 'isNew', 'isGood']).optional(),
  sort: z
    .enum(['DEFAULT', 'PRICE_ASC', 'PRICE_DESC', 'SALES_DESC', 'NEWEST'])
    .default('DEFAULT'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

const idQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  id: z.coerce.number().int().positive(),
});

const cartAddBody = z.object({
  productId: z.number().int().positive(),
  skuId: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).max(999).default(1),
});
const cartUpdateBody = z.object({
  id: z.number().int().positive(),
  quantity: z.number().int().min(0).max(999),
});
const cartSelectBody = z.object({
  ids: z.array(z.number().int().positive()).max(200).default([]),
  selected: z.boolean().default(true),
});
const cartRemoveBody = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
const refundCreateBody = brandPublicRefundCreateBodySchema.extend({
  orderId: z.number().int().positive(),
});

/**
 * 电商小程序顾客端公开通道（`/api/public/brand-mall/**`，免站内鉴权）。
 *
 * 三条边界：
 * 1. 匿名只开放「看店 + 看商品」；一旦涉及身份（购物车/订单/地址/券）就必须带顾客令牌，
 *    令牌由底座按 scene+shopId+customerId 签发，进不了 `/enterprise/**`；
 * 2. 所有读写都以 `shopId + customerId` 双条件过滤，**请求体里的 id 只当筛选条件**，
 *    绝不单独用它定位数据，否则跨店串号；
 * 3. bootstrap 是匿名可访问的最大攻击面，绝不回任何凭据痕迹，并按 IP 限流。
 */
export function registerBrandPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const {
    shops,
    goods,
    diy,
    customers,
    orders,
    coupons,
    pay,
    platform,
    miniApp,
  } = services.brand;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const orderWindow = new RateWindow(30, 60_000);
  const uploadWindow = new RateWindow(20, 60_000);

  const shopOf = async (
    shopCode?: string,
    appId?: string,
  ): Promise<ShopRow> => {
    const row = shopCode
      ? await shops.findByCode(shopCode)
      : appId
        ? await shops.findByAppId(appId)
        : null;
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '商城不存在：请确认小程序包的 config.js 已注入 shopCode',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，与「平台暂停服务」同一停服形状
    if (!(await toolOpen('brand-mall', row.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return row;
  };

  /** 取顾客身份：令牌 + 店铺一致性都在服务层判过。 */
  const buyer = async (c: Context<ApiEnv, string, Input>) => {
    const identity = await customers.identity(
      c.req.header('authorization') || c.req.header('x-customer-token') || '',
    );
    return identity;
  };

  const shopPublicState = async (shop: ShopRow) => {
    const limits = await platform.limits();
    const payEnabled =
      limits.payAllowed &&
      (await miniApp.payEnabled({
        ownerUserId: shop.ownerUserId,
        scene: 'BRAND',
        shopId: shop.id,
        shopName: shop.name,
      }));
    return { payEnabled, limits };
  };

  // ---------------------------------------------------------------- 匿名可读

  app.get('/api/public/brand-mall/bootstrap', async (c) => {
    const query = bootstrapQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: c.req.query('appId') || '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode, query.appId);
    if (shop.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '该商城已关闭');
    }
    const { payEnabled } = await shopPublicState(shop);
    // 客服站点已被停用/删除时不下发地址：C 端回落到 shop.servicePhone，交易链路不受影响
    const desk =
      shop.supportSiteId > 0 &&
      (await services.prisma.serviceDeskSite.findFirst({
        where: {
          id: shop.supportSiteId,
          ownerUserId: shop.ownerUserId,
          enabled: true,
        },
        select: { siteKey: true },
      }));
    const apiBase = desk
      ? (await resolveSiteUrl(services.prisma)).replace(/\/+$/, '')
      : '';
    const pageLabels = ['首页', '分类页', '个人中心'] as const;
    const pageTypes = ['HOME', 'CATEGORY', 'MINE'] as const;
    const snapshots = await Promise.all(
      pageTypes.map((type) => diy.publishedDefault(shop.id, type)),
    );
    const publishedPages = snapshots.flatMap((page, index) =>
      page
        ? [
            {
              id: page.id,
              type: pageTypes[index],
              name: pageLabels[index],
              components: page.components,
              styles: page.styles,
            },
          ]
        : [],
    );
    return c.json({
      shopId: shop.id,
      name: shop.name,
      shopCode: shop.shopCode,
      logo: shop.logo,
      slogan: shop.slogan,
      servicePhone: shop.servicePhone,
      status: shop.status,
      themeColor: shop.themeColor,
      payEnabled,
      pointsEnabled: (await shops.publicTrade(shop.id)).pointsEnabled,
      trade: await shops.publicTrade(shop.id),
      deskSiteKey: desk ? clip(desk.siteKey, 64) : '',
      deskEmbedUrl:
        desk && apiBase
          ? `${apiBase}${BRAND_DESK_EMBED_PATH}?key=${encodeURIComponent(desk.siteKey)}`
          : '',
      pages: publishedPages,
      tabBar: [
        {
          pagePath: 'pages/index/index',
          text: '首页',
          iconPath: '',
          selectedIconPath: '',
        },
        {
          pagePath: 'pages/category/category',
          text: '分类',
          iconPath: '',
          selectedIconPath: '',
        },
        {
          pagePath: 'pages/cart/cart',
          text: '购物车',
          iconPath: '',
          selectedIconPath: '',
        },
        {
          pagePath: 'pages/me/me',
          text: '我的',
          iconPath: '',
          selectedIconPath: '',
        },
      ],
    });
  });

  app.get('/api/public/brand-mall/diy/page', async (c) => {
    const query = idQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      id: c.req.query('id') || '0',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode);
    const page = await diy.publishedActivity(shop.id, query.id);
    if (!page) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动页不存在或未发布');
    }
    return c.json(page);
  });

  app.get('/api/public/brand-mall/categories', async (c) => {
    const query = bootstrapQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: c.req.query('appId') || '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode, query.appId);
    return c.json(
      await goods.categoryList({
        ownerUserId: shop.ownerUserId,
        shopId: shop.id,
      }),
    );
  });

  app.get('/api/public/brand-mall/products', async (c) => {
    const query = productQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      keyword: c.req.query('keyword') || undefined,
      categoryId: c.req.query('categoryId') || undefined,
      tag: c.req.query('tag') || undefined,
      sort: c.req.query('sort') || undefined,
      page: c.req.query('page') || undefined,
      pageSize: c.req.query('pageSize') || undefined,
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode);
    const result = await goods.productList(
      { ownerUserId: shop.ownerUserId, shopId: shop.id },
      { ...query, status: 'ONLINE' },
    );
    return c.json(result);
  });

  app.get('/api/public/brand-mall/product', async (c) => {
    const query = idQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      id: c.req.query('id') || '0',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode);
    const detail = await goods.productDetail(
      { ownerUserId: shop.ownerUserId, shopId: shop.id },
      query.id,
    );
    if (detail.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品已下架');
    }
    const reviews = await goods.reviewList(
      { ownerUserId: shop.ownerUserId, shopId: shop.id },
      { productId: query.id, status: 'PUBLISHED', page: 1, pageSize: 20 },
    );
    const ratings = reviews.list;
    const avgRating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((sum, row) => sum + row.rating, 0) /
              ratings.length) *
              10,
          ) / 10
        : 5;
    return c.json({ ...detail, avgRating });
  });

  app.get('/api/public/brand-mall/reviews', async (c) => {
    const query = idQuery
      .extend({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(50).default(20),
      })
      .parse({
        shopCode: c.req.query('shopCode') || '',
        id: c.req.query('productId') || '0',
        page: c.req.query('page') || undefined,
        pageSize: c.req.query('pageSize') || undefined,
      });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode);
    return c.json(
      await goods.reviewList(
        { ownerUserId: shop.ownerUserId, shopId: shop.id },
        {
          productId: query.id,
          status: 'PUBLISHED',
          page: query.page,
          pageSize: query.pageSize,
        },
      ),
    );
  });

  // ---------------------------------------------------------------- 登录

  app.post('/api/public/brand-mall/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = brandPublicLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const shopCode = String(body.shopCode || '').trim();
    if (!shopCode && !body.shopId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少店铺标识：请确认小程序包的 config.js 已注入 shopCode',
      );
    }
    return c.json(await customers.loginByCode({ ...body, shopCode }));
  });

  // ---------------------------------------------------------------- 顾客态读写

  app.get('/api/public/brand-mall/profile', async (c) => {
    const identity = await buyer(c);
    return c.json(
      await customers.profile(identity.shopId, identity.customerId),
    );
  });

  app.get('/api/public/brand-mall/points', async (c) => {
    const identity = await buyer(c);
    return c.json(await customers.bills(identity.shopId, identity.customerId));
  });

  app.get('/api/public/brand-mall/addresses', async (c) => {
    const identity = await buyer(c);
    return c.json(
      await customers.addresses(identity.shopId, identity.customerId),
    );
  });

  app.post('/api/public/brand-mall/address/save', async (c) => {
    const identity = await buyer(c);
    const body = brandPublicAddressBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await customers.saveAddress(identity.shopId, identity.customerId, body),
    );
  });

  app.post('/api/public/brand-mall/address/remove', async (c) => {
    const identity = await buyer(c);
    const body = z
      .object({ id: z.number().int().positive() })
      .parse(await c.req.json());
    return c.json(
      await customers.removeAddress(
        identity.shopId,
        identity.customerId,
        body.id,
      ),
    );
  });

  app.get('/api/public/brand-mall/cart', async (c) => {
    const identity = await buyer(c);
    return c.json(await customers.cart(identity.shopId, identity.customerId));
  });

  app.post('/api/public/brand-mall/cart/add', async (c) => {
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

  app.post('/api/public/brand-mall/cart/update', async (c) => {
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

  app.post('/api/public/brand-mall/cart/select', async (c) => {
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

  app.post('/api/public/brand-mall/cart/remove', async (c) => {
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

  app.get('/api/public/brand-mall/coupons', async (c) => {
    const identity = await buyer(c);
    const rows = await coupons.mine(identity.shopId, identity.customerId);
    return c.json(rows);
  });

  app.post('/api/public/brand-mall/coupon/receive', async (c) => {
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

  app.get('/api/public/brand-mall/coupon/shop', async (c) => {
    const query = bootstrapQuery.parse({
      shopCode: c.req.query('shopCode') || '',
      appId: '',
    });
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shop = await shopOf(query.shopCode);
    return c.json(await coupons.shopList(shop.id));
  });

  // ---------------------------------------------------------------- 下单与订单

  app.post('/api/public/brand-mall/order/preview', async (c) => {
    const identity = await buyer(c);
    const body = brandPublicPreviewBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await orders.preview(
        {
          shopId: identity.shopId,
          customerId: identity.customerId,
          ownerUserId: identity.ownerUserId,
        },
        body,
      ),
    );
  });

  app.post('/api/public/brand-mall/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const identity = await buyer(c);
    const body = brandPublicOrderCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await orders.create(
        {
          shopId: identity.shopId,
          customerId: identity.customerId,
          ownerUserId: identity.ownerUserId,
        },
        body,
        clientIp(c),
        identity.openid,
      ),
    );
  });

  app.get('/api/public/brand-mall/orders', async (c) => {
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

  app.get('/api/public/brand-mall/order', async (c) => {
    const identity = await buyer(c);
    const id = Number(c.req.query('id') || 0);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少订单 id');
    }
    return c.json(
      await orders.publicDetail(identity.shopId, identity.customerId, id),
    );
  });

  app.post('/api/public/brand-mall/order/cancel', async (c) => {
    const identity = await buyer(c);
    const body = z
      .object({ id: z.number().int().positive() })
      .parse(await c.req.json());
    return c.json(
      await orders.cancelByCustomer(
        identity.shopId,
        identity.customerId,
        body.id,
      ),
    );
  });

  app.post('/api/public/brand-mall/order/receive', async (c) => {
    const identity = await buyer(c);
    const body = z
      .object({ id: z.number().int().positive() })
      .parse(await c.req.json());
    return c.json(
      await orders.receive(identity.shopId, identity.customerId, body.id),
    );
  });

  app.get('/api/public/brand-mall/order/pay-params', async (c) => {
    const identity = await buyer(c);
    const id = Number(c.req.query('id') || 0);
    const result = await orders.repayParams({
      shopId: identity.shopId,
      customerId: identity.customerId,
      ownerUserId: identity.ownerUserId,
      orderId: id,
      openid: identity.openid,
    });
    return c.json(result);
  });

  app.post('/api/public/brand-mall/refund/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const identity = await buyer(c);
    const body = refundCreateBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await orders.refundCreate(
        {
          shopId: identity.shopId,
          customerId: identity.customerId,
          ownerUserId: identity.ownerUserId,
        },
        body,
      ),
    );
  });

  app.get('/api/public/brand-mall/refunds', async (c) => {
    const identity = await buyer(c);
    return c.json(await orders.myRefunds(identity.shopId, identity.customerId));
  });

  /**
   * 售后凭证图片：顾客登录后上传，落自有 OSS 并送内容安全检测。
   * 只接受图片扩展名、限制 8MB；上传结果只回 URL/大小，不登记账号数字资产台账。
   */
  app.post('/api/public/brand-mall/upload', async (c) => {
    uploadWindow.consume(clientIp(c) || 'unknown', '上传过于频繁，请稍后再试');
    const identity = await buyer(c);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要上传的图片');
    }
    const name = clip(file.name, 190) || 'image.jpg';
    const ext = name.toLowerCase().split('.').pop() || 'jpg';
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '仅支持 jpg / png / webp / gif 图片',
      );
    }
    if (!file.size) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '文件内容为空');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '图片不能超过 8MB',
      );
    }
    const key = `brand-mall/${identity.shopId}/${identity.customerId}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await services.storage.service.put(key, bytes);
    const verdict = await services.publishReview.guardImage(uploaded.url);
    if (verdict.status === 'block') {
      await services.storage.service
        .remove(uploaded.key)
        .catch(() => undefined);
      throw new BusinessException(
        ErrorCode.CONTENT_MODERATION_BLOCKED,
        `图片未通过内容安全检测${verdict.note ? `：${verdict.note}` : ''}`,
      );
    }
    return c.json({
      url: uploaded.url,
      key: uploaded.key,
      size: uploaded.size,
      moderation: verdict.status,
    });
  });

  // ---------------------------------------------------------------- 支付回调

  app.post('/api/public/brand-mall/pay/notify/:shopId', async (c) => {
    const shopId = Number(c.req.param('shopId'));
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return c.json({ code: 'FAIL', message: '店铺参数不合法' }, 400);
    }
    const payload = (await c.req.json().catch(() => ({}))) as {
      resource?: {
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
      event_type?: string;
    };
    const shop = await shops.byId(shopId);
    if (!shop) {
      return c.json({ code: 'FAIL', message: '店铺不存在' }, 404);
    }
    // 防重放：微信 v3 回调的 Wechatpay-Timestamp 必须落在 ±5 分钟窗口内，判定函数
    // 直接复用统一客户端的 notifyTimestampOk（与 parseNotify 同一口径）。
    // 之所以不整段复用 parseNotify：本路由按「只把密文交给 pay.decryptNotify」的
    // 既有签名工作，parseNotify 需要 rawBody + 四个请求头做 RSA 验签，且要先下载
    // 平台证书——证书拉取失败会把可重试的 400 变成 5xx。幂等不依赖这里：
    // orders.markPaid 用 payStatus: 'UNPAID' 条件更新，重复回调只会得到「已付忽略」。
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    if (!payload.resource?.ciphertext) {
      return c.json({ code: 'FAIL', message: '回调缺少密文' }, 400);
    }
    try {
      const decoded = await pay.decryptNotify(shopId, shop.ownerUserId, {
        ciphertext: payload.resource.ciphertext,
        nonce: payload.resource.nonce || '',
        associated_data: payload.resource.associated_data || '',
      });
      if (decoded.tradeState !== 'SUCCESS') {
        return c.json(BrandNotifyOk());
      }
      const result = await orders.markPaid(
        shopId,
        decoded.outTradeNo,
        decoded.transactionId,
        decoded.amountCents,
      );
      if (!result.ok) {
        // 金额不符或订单不存在时**不能**回 SUCCESS，否则微信不再重试，人工也无从对账
        return c.json({ code: 'FAIL', message: result.message }, 400);
      }
      return c.json(BrandNotifyOk());
    } catch (error) {
      const message = error instanceof Error ? error.message : '回调处理失败';
      return c.json({ code: 'FAIL', message: clip(message, 180) }, 400);
    }
  });
}

function BrandNotifyOk() {
  return { code: 'SUCCESS', message: '成功' };
}
