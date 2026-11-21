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

const bootstrapQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
});
const loginBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  code: z.string().trim().min(1).max(128),
});
const pageQuery = z.object({
  shopCode: z.string().trim().max(16).min(1),
  page: z.string().default('1'),
  pageSize: z.string().default('20'),
  keyword: z.string().default(''),
  category: z.string().default(''),
  status: z.string().default('all'),
  itemId: z.string().default(''),
  orderId: z.string().default(''),
});
const createOrderBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  itemId: z.number().int().positive(),
  startAt: z.string().trim().min(1).max(40),
  endAt: z.string().trim().min(1).max(40),
  name: z.string().trim().max(60).default(''),
  phone: z.string().trim().max(32).default(''),
  remark: z.string().trim().max(500).default(''),
});
const orderActionBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().positive(),
});
const staffBindBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  phone: z.string().trim().min(3).max(32),
  staffCode: z.string().trim().min(1).max(32),
});
const staffActionBody = z.object({
  orderId: z.number().int().positive(),
  action: z.enum(['pickup', 'return', 'complete', 'cancel']),
  note: z.string().trim().max(500).default(''),
});
const staffInspectionBody = z.object({
  orderId: z.number().int().positive(),
  kind: z.enum(['HANDOVER', 'RETURN']),
  mileage: z.number().int().min(0).max(10000000).default(0),
  fuelPercent: z.number().int().min(0).max(100).default(100),
  damage: z.string().trim().max(2000).default(''),
  damageFee: z.number().min(0).max(10000000).default(0),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  note: z.string().trim().max(1000).default(''),
});

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    ''
  );
}

/**
 * 租赁小程序 C 端公开通道：免站内鉴权，顾客态一律按 shopId + customerId 双条件过滤。
 * 员工端在 bind 后换员工令牌，后续读写按 shopId + staffId 过滤。
 */
export function registerRentalPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { orders, pay } = services.rental;
  const browseWindow = new RateWindow(240, 60_000);
  const writeWindow = new RateWindow(60, 60_000);
  const bindWindow = new RateWindow(10, 60_000);

  const requireCustomer = async (c: Context<ApiEnv, string, Input>) => {
    const payload = parseCustomerToken(c.req.header('authorization') || '');
    const { customer, shop } = await orders.requireCustomer(payload);
    return { payload, customer, shop };
  };

  const requireStaff = async (c: Context<ApiEnv, string, Input>) => {
    return orders.requireStaff(c.req.header('authorization') || '');
  };

  app.get('/api/public/rental/bootstrap', async (c) => {
    const query = bootstrapQuery.parse({
      shopCode: c.req.query('shopCode') || '',
    });
    browseWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    return c.json(await orders.publicBootstrap(query.shopCode));
  });

  app.post('/api/public/rental/login', async (c) => {
    writeWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = loginBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await orders.publicLogin(body.shopCode, body.code));
  });

  app.get('/api/public/rental/items', async (c) => {
    const query = pageQuery.parse(c.req.query());
    browseWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const shopId = await orders.shopIdByCode(query.shopCode);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await orders.publicItems(shopId, { ...query, page, pageSize }),
    );
  });

  app.get('/api/public/rental/items/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shopId = await orders.shopIdByCode(query.shopCode);
    const itemId = Number(query.itemId || 0);
    if (!itemId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少租品标识');
    return c.json(await orders.publicItem(shopId, itemId));
  });

  app.post('/api/public/rental/orders', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = createOrderBody.parse(await c.req.json().catch(() => ({})));
    const { payload, shop } = await requireCustomer(c);
    if (payload.shopId !== shop.id) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '登录门店不一致');
    }
    return c.json(await orders.publicCreateOrder(body.shopCode, payload, body));
  });

  app.get('/api/public/rental/orders', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const { payload, shop } = await requireCustomer(c);
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await orders.publicOrders(shop.id, payload.customerId, {
        ...query,
        page,
        pageSize,
      }),
    );
  });

  app.get('/api/public/rental/orders/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const orderId = Number(query.orderId || 0);
    if (!orderId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少租单标识');
    const { payload, shop } = await requireCustomer(c);
    return c.json(
      await orders.publicOrderDetail(shop.id, payload.customerId, orderId),
    );
  });

  app.post('/api/public/rental/orders/cancel', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    const { payload, shop } = await requireCustomer(c);
    return c.json(
      await orders.publicCancel(shop.id, payload.customerId, body.orderId),
    );
  });

  app.post('/api/public/rental/orders/pay-params', async (c) => {
    const body = orderActionBody.parse(await c.req.json().catch(() => ({})));
    const { payload, shop } = await requireCustomer(c);
    await orders.publicOrderDetail(shop.id, payload.customerId, body.orderId);
    return c.json(await pay.payParams(shop.id, body.orderId, payload.openid));
  });

  app.post('/api/public/rental/pay/notify/:shopId', async (c) => {
    const shopId = Number(c.req.param('shopId'));
    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '门店标识不合法');
    }
    const raw = await c.req.text();
    const credentials = await pay.credentials(shopId);
    if (!credentials) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该门店未配置微信支付',
      );
    }
    const transaction = await pay.parseNotify(
      credentials,
      {
        'wechatpay-serial': c.req.header('wechatpay-serial') || '',
        'wechatpay-nonce-str': c.req.header('wechatpay-nonce-str') || '',
        'wechatpay-timestamp': c.req.header('wechatpay-timestamp') || '',
        'wechatpay-signature': c.req.header('wechatpay-signature') || '',
      },
      raw,
    );
    const result = await pay.markPaid(shopId, transaction);
    return c.json(
      result.handled
        ? { code: 'SUCCESS', message: '成功' }
        : { code: 'FAIL', message: result.reason || '未处理' },
      200,
    );
  });

  // ------------------------------------------------------------ 员工端

  app.post('/api/public/rental/staff/bind', async (c) => {
    const body = staffBindBody.parse(await c.req.json().catch(() => ({})));
    const payload = parseCustomerToken(c.req.header('authorization') || '');
    bindWindow.consume(
      `${payload.shopId}:staff-bind:${payload.customerId}`,
      '绑定尝试过于频繁，请一分钟后再试',
    );
    return c.json(await orders.staffBind(payload, body));
  });

  app.get('/api/public/rental/staff/workbench', async (c) => {
    const { staff, shop } = await requireStaff(c);
    return c.json(await orders.staffWorkbench(staff.id, shop.id));
  });

  app.get('/api/public/rental/staff/orders', async (c) => {
    const { shop } = await requireStaff(c);
    const query = z
      .object({
        page: z.string().default('1'),
        pageSize: z.string().default('20'),
        status: z.string().default('all'),
        keyword: z.string().default(''),
      })
      .parse(c.req.query());
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await orders.staffOrders(shop.id, { ...query, page, pageSize }),
    );
  });

  app.get('/api/public/rental/staff/orders/detail', async (c) => {
    const { shop } = await requireStaff(c);
    const orderId = Number(c.req.query('orderId') || 0);
    if (!orderId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少租单标识');
    return c.json(await orders.staffOrderDetail(shop.id, orderId));
  });

  app.post('/api/public/rental/staff/orders/action', async (c) => {
    const body = staffActionBody.parse(await c.req.json().catch(() => ({})));
    const { staff, shop } = await requireStaff(c);
    return c.json(
      await orders.staffOrderAction(shop.id, body.orderId, body, {
        staffId: staff.id,
        staffName: staff.name,
      }),
    );
  });

  app.post('/api/public/rental/staff/orders/inspection', async (c) => {
    const body = staffInspectionBody.parse(
      await c.req.json().catch(() => ({})),
    );
    const { staff, shop } = await requireStaff(c);
    return c.json(
      await orders.saveInspection(shop.id, body.orderId, body, {
        staffId: staff.id,
        staffName: staff.name,
      }),
    );
  });

  app.get('/api/public/rental/staff/customers', async (c) => {
    const { shop } = await requireStaff(c);
    const query = z
      .object({
        page: z.string().default('1'),
        pageSize: z.string().default('20'),
        keyword: z.string().default(''),
      })
      .parse(c.req.query());
    const { page, pageSize } = pageParam(query.page, query.pageSize, 20);
    return c.json(
      await orders.staffCustomers(shop.id, { ...query, page, pageSize }),
    );
  });

  app.get('/api/public/rental/staff/items', async (c) => {
    const { shop } = await requireStaff(c);
    const query = z
      .object({
        page: z.string().default('1'),
        pageSize: z.string().default('50'),
        keyword: z.string().default(''),
      })
      .parse(c.req.query());
    const { page, pageSize } = pageParam(query.page, query.pageSize, 50);
    return c.json(
      await orders.staffItems(shop.id, { ...query, page, pageSize }),
    );
  });
}
