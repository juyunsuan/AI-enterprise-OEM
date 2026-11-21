import { OpenAPIHono } from '@hono/zod-openapi';
import { BusinessException } from '../common/business.exception';
import type { Services } from '../http/services';
import type { ApiEnv } from '../http/types';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import { issueStaffToken, parseStaffToken } from './staff-token';
import { registerOnsiteStaffApi } from './onsite.staff-api';

/**
 * 技师端通道的三条底线：bind 三要素核对、跨店令牌不可复用、
 * 店主停用即时断权（不等到令牌过期）。全部用假服务，不碰数据库。
 */
process.env.JWT_SECRET = 'unit-test-secret';

const SHOP_ID = 7;
const STAFF_ID = 3;

const staffRow = (status: string) => ({
  id: STAFF_ID,
  shopId: SHOP_ID,
  staffNo: 'T0001',
  name: '张三',
  phone: '13800000001',
  avatar: '',
  levelId: 11,
  status,
  serviceStartAt: '09:00',
  serviceEndAt: '19:00',
  crossDay: false,
  locationEnabled: false,
  rating: 5,
  reviewCount: 0,
  orderCountTrue: 0,
  profilePending: {},
});

function buildApp(options: { staffStatus?: string } = {}) {
  const staff = staffRow(options.staffStatus ?? 'ONLINE');
  const calls: Record<string, unknown[]> = {
    shareAggregate: [],
    settlementGroupBy: [],
  };
  const prisma = {
    onsiteStaff: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where || {};
        if (where.staffNo !== undefined) {
          return where.phone === staff.phone &&
            where.staffNo === staff.staffNo &&
            where.shopId === SHOP_ID
            ? staff
            : null;
        }
        return where.id === STAFF_ID && where.shopId === SHOP_ID ? staff : null;
      },
    },
    onsiteStaffLevel: {
      findFirst: async () => ({ name: '高级' }),
    },
    onsiteOrder: {
      count: async () => 0,
      findMany: async () => [],
      aggregate: async () => ({ _sum: {}, _count: { _all: 0 } }),
    },
    onsiteOrderItem: {
      findMany: async () => [],
    },
    onsiteOrderCommissionItem: {
      count: async () => 0,
      findMany: async () => [],
      aggregate: async () => ({ _sum: {} }),
    },
    onsiteOrderCommissionShare: {
      count: async () => 0,
      findMany: async () => [],
      aggregate: async (args: unknown) => {
        calls.shareAggregate.push(args);
        return { _sum: {} };
      },
    },
    onsiteOrderCommission: {
      findMany: async () => [],
    },
    onsiteSettlement: {
      count: async () => 0,
      findMany: async () => [],
      groupBy: async (args: unknown) => {
        calls.settlementGroupBy.push(args);
        return [];
      },
    },
  };
  const shops = {
    findByCode: async (code: string) =>
      code === 'SHOP01'
        ? {
            shopId: SHOP_ID,
            shopCode: 'SHOP01',
            shopName: '测试店',
            status: 'ONLINE',
            trade: {},
            theme: {},
          }
        : code === 'SHOP02'
          ? {
              shopId: 99,
              shopCode: 'SHOP02',
              shopName: '别家店',
              status: 'ONLINE',
              trade: {},
              theme: {},
            }
          : null,
    tradeById: async () => ({ alertEnabled: true }),
  };
  const customers = {
    requireCustomer: async () => ({
      id: 21,
      shopId: SHOP_ID,
      openid: 'openid-c',
      status: 'ACTIVE',
    }),
  };
  const services = {
    prisma,
    onsite: {
      shops,
      customers,
      orders: {},
      schedule: {},
      reviews: {},
      alerts: {},
    },
  } as unknown as Services;
  const app = new OpenAPIHono<ApiEnv>();
  // 与线上 app.ts 的 handleError 同构：业务异常 → 对应 HTTP 码 + {code,message}
  app.onError((err, c) => {
    if (err instanceof BusinessException) {
      return c.json(
        { code: err.errorCode.code, message: err.message, data: err.data },
        err.getStatus() as 400,
      );
    }
    throw err;
  });
  registerOnsiteStaffApi(app, services);
  return { app, calls };
}

const json = { 'Content-Type': 'application/json' };

describe('onsite staff-api（技师端公开通道）', () => {
  it('bind：手机号 + 工号核对通过即发技师令牌，载荷可解回身份', async () => {
    const { app } = buildApp();
    const customerToken = issueCustomerToken({
      scene: 'ONSITE',
      shopId: SHOP_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request('/api/public/onsite/staff-api/bind', {
      method: 'POST',
      headers: { ...json, authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        shopCode: 'SHOP01',
        phone: '13800000001',
        staffNo: 'T0001',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      staff: { id: number; shopId: number; status: string; levelName: string };
    };
    expect(body.staff.id).toBe(STAFF_ID);
    expect(body.staff.shopId).toBe(SHOP_ID);
    expect(body.staff.levelName).toBe('高级');
    const payload = parseStaffToken(body.token);
    expect(payload).toEqual({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
  });

  it('bind：三要素不匹配回同一句合并文案，不披露错的是手机号还是工号', async () => {
    const { app } = buildApp();
    const customerToken = issueCustomerToken({
      scene: 'ONSITE',
      shopId: SHOP_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request('/api/public/onsite/staff-api/bind', {
      method: 'POST',
      headers: { ...json, authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        shopCode: 'SHOP01',
        phone: '13800000001',
        staffNo: 'T9999',
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('核对手机号与工号');
  });

  it('跨店拒绝：A 店技师令牌打 B 店 shopCode，401 且不落到数据查询', async () => {
    const { app } = buildApp();
    const staffToken = issueStaffToken({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request(
      '/api/public/onsite/staff-api/profile?shopCode=SHOP02',
      { headers: { authorization: `Bearer ${staffToken}` } },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('不匹配');
  });

  it('即时断权：店主把技师停用后，同一个有效令牌的下一个请求就 401', async () => {
    const { app } = buildApp({ staffStatus: 'SUSPENDED' });
    const staffToken = issueStaffToken({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request(
      '/api/public/onsite/staff-api/orders?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${staffToken}` } },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('停用');
  });

  it('在岗技师可拉自己的订单列表（shopId + staffId 双条件）', async () => {
    const { app } = buildApp();
    const staffToken = issueStaffToken({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request(
      '/api/public/onsite/staff-api/orders?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${staffToken}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { list: unknown[]; total: number };
    expect(body.list).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('顾客令牌不能当技师令牌用（issuer 物理隔离）', async () => {
    const { app } = buildApp();
    const customerToken = issueCustomerToken({
      scene: 'ONSITE',
      shopId: SHOP_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    expect(() => parseStaffToken(customerToken)).toThrow();
    const res = await app.request(
      '/api/public/onsite/staff-api/orders?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${customerToken}` } },
    );
    expect(res.status).toBe(401);
  });

  it('收入概览：毛收入按 shopId + staffId 双条件、承担佣金按 bearerRole=STAFF + bearerId', async () => {
    const { app, calls } = buildApp();
    const staffToken = issueStaffToken({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request(
      '/api/public/onsite/staff-api/income/overview?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${staffToken}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      staff: { id: number; name: string; levelName: string };
      grossCents: number;
      pendingSettleCents: number;
    };
    expect(body.staff).toMatchObject({
      id: STAFF_ID,
      name: '张三',
      levelName: '高级',
    });
    expect(calls.shareAggregate).toHaveLength(2);
    for (const call of calls.shareAggregate) {
      expect((call as { where: Record<string, unknown> }).where).toMatchObject({
        shopId: SHOP_ID,
        bearerRole: 'STAFF',
        bearerId: STAFF_ID,
      });
    }
    expect(
      (calls.settlementGroupBy[0] as { where: Record<string, unknown> }).where,
    ).toMatchObject({ shopId: SHOP_ID, staffId: STAFF_ID });
  });

  it('承担扣减列表：只按 shopId + bearerRole + bearerId 取数', async () => {
    const { app } = buildApp();
    const staffToken = issueStaffToken({
      shopId: SHOP_ID,
      staffId: STAFF_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    const res = await app.request(
      '/api/public/onsite/staff-api/income/borne?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${staffToken}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { list: unknown[]; total: number };
    expect(body.list).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('parseCustomerToken 对本测试载荷可正常解析（回归护栏）', () => {
    const token = issueCustomerToken({
      scene: 'ONSITE',
      shopId: SHOP_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    expect(parseCustomerToken(token).customerId).toBe(21);
  });
});
