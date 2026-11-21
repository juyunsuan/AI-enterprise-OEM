import { OpenAPIHono } from '@hono/zod-openapi';
import { BusinessException } from '../common/business.exception';
import type { Services } from '../http/services';
import type { ApiEnv } from '../http/types';
import { issueCustomerToken } from '../private-mini/customer-token';
import { issueAgentToken, parseAgentToken } from './agent-token';
import { registerOnsiteAgentApi } from './onsite.agent-api';

/**
 * 代理端通道的四条底线：手机号绑定、跨店令牌不可复用、店主停用即时断权、
 * 佣金明细只按 shopId + role + refId 三条件取数（防止横向越权）。
 * 全部用假服务，不碰数据库。
 */
process.env.JWT_SECRET = 'unit-test-secret';

const SHOP_ID = 7;
const AGENT_ID = 11;
const SALESMAN_ID = 22;

function buildApp(options: { agentStatus?: string } = {}) {
  const agent = {
    id: AGENT_ID,
    shopId: SHOP_ID,
    agentType: 'CITY',
    name: '杭州城市代理',
    phone: '13900000001',
    provinceCode: '330000',
    cityCode: '330100',
    areaCode: '',
    commissionRate: 8,
    parentId: 0,
    status: options.agentStatus ?? 'ACTIVE',
  };
  const salesman = {
    id: SALESMAN_ID,
    shopId: SHOP_ID,
    agentId: AGENT_ID,
    name: '业务员小李',
    phone: '13900000002',
    area: '西湖区',
    rate: 15,
    status: 'ACTIVE',
  };
  const calls: Record<string, unknown[]> = {
    commissionFindMany: [],
    commissionCount: [],
  };
  const prisma = {
    onsiteAgentAccount: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where || {};
        if (where.phone !== undefined) {
          return where.phone === agent.phone && where.shopId === SHOP_ID
            ? agent
            : null;
        }
        return where.id === AGENT_ID && where.shopId === SHOP_ID ? agent : null;
      },
    },
    onsiteSalesman: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where || {};
        return where.phone === salesman.phone && where.shopId === SHOP_ID
          ? salesman
          : null;
      },
    },
    onsiteChannel: {
      findFirst: async () => null,
    },
    onsiteChannelCategory: {
      findFirst: async () => null,
    },
    onsiteOrderCommissionItem: {
      count: async (args: unknown) => {
        calls.commissionCount.push(args);
        return 0;
      },
      findMany: async (args: unknown) => {
        calls.commissionFindMany.push(args);
        return [];
      },
      groupBy: async () => [],
      aggregate: async () => ({ _sum: {} }),
    },
    onsiteOrderCommission: {
      findMany: async () => [],
    },
    onsiteRelation: {
      count: async () => 0,
    },
    onsiteWithdrawal: {
      aggregate: async () => ({ _sum: {} }),
    },
    onsiteRefund: {
      count: async () => 0,
      findMany: async () => [],
    },
    onsiteOrder: {
      findMany: async () => [],
    },
    onsiteStaff: {
      count: async () => 0,
      findMany: async () => [],
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
  };
  const services = {
    prisma,
    onsite: { shops },
  } as unknown as Services;
  const app = new OpenAPIHono<ApiEnv>();
  app.onError((err, c) => {
    if (err instanceof BusinessException) {
      return c.json(
        { code: err.errorCode.code, message: err.message, data: err.data },
        err.getStatus() as 400,
      );
    }
    throw err;
  });
  registerOnsiteAgentApi(app, services);
  return { app, calls };
}

const json = { 'Content-Type': 'application/json' };
const agentToken = () =>
  issueAgentToken({
    shopId: SHOP_ID,
    role: 'AGENT',
    refId: AGENT_ID,
    phone: '13900000001',
  });

describe('onsite agent-api（代理端公开通道）', () => {
  it('bind：手机号命中代理即发代理令牌，载荷可解回 role + refId', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/public/onsite/agent-api/bind', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ shopCode: 'SHOP01', phone: '13900000001' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      identity: { role: string; name: string; shopName: string };
    };
    expect(body.identity).toMatchObject({
      role: 'AGENT',
      name: '杭州城市代理',
      shopName: '测试店',
    });
    expect(parseAgentToken(body.token)).toEqual({
      shopId: SHOP_ID,
      role: 'AGENT',
      refId: AGENT_ID,
      phone: '13900000001',
    });
  });

  it('bind：代理没命中时回落到业务员身份', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/public/onsite/agent-api/bind', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ shopCode: 'SHOP01', phone: '13900000002' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      identity: { role: string; name: string };
    };
    expect(body.identity.role).toBe('SALESMAN');
    expect(body.identity.name).toBe('业务员小李');
    expect(parseAgentToken(body.token)).toMatchObject({
      role: 'SALESMAN',
      refId: SALESMAN_ID,
    });
  });

  it('bind：未登记手机号回 404，并给出找店主录入的下一步', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/public/onsite/agent-api/bind', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ shopCode: 'SHOP01', phone: '13900009999' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('代理分销');
  });

  it('跨店拒绝：A 店代理令牌打 B 店 shopCode，401 且不落到数据查询', async () => {
    const { app } = buildApp();
    const res = await app.request(
      '/api/public/onsite/agent-api/profile?shopCode=SHOP02',
      { headers: { authorization: `Bearer ${agentToken()}` } },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('不匹配');
  });

  it('即时断权：店主停用代理后，同一个有效令牌的下一个请求就 401', async () => {
    const { app } = buildApp({ agentStatus: 'DISABLED' });
    const res = await app.request(
      '/api/public/onsite/agent-api/profile?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${agentToken()}` } },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('停用');
  });

  it('佣金台账：只按 shopId + role + refId 三条件取数', async () => {
    const { app, calls } = buildApp();
    const res = await app.request(
      '/api/public/onsite/agent-api/commissions?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${agentToken()}` } },
    );
    expect(res.status).toBe(200);
    expect(calls.commissionFindMany).toHaveLength(1);
    const where = (
      calls.commissionFindMany[0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({
      shopId: SHOP_ID,
      sourceRole: 'AGENT',
      sourceId: AGENT_ID,
    });
  });

  it('顾客令牌不能当代理令牌用（issuer 物理隔离）', async () => {
    const { app } = buildApp();
    const customerToken = issueCustomerToken({
      scene: 'ONSITE',
      shopId: SHOP_ID,
      customerId: 21,
      openid: 'openid-c',
    });
    expect(() => parseAgentToken(customerToken)).toThrow();
    const res = await app.request(
      '/api/public/onsite/agent-api/profile?shopCode=SHOP01',
      { headers: { authorization: `Bearer ${customerToken}` } },
    );
    expect(res.status).toBe(401);
  });
});
