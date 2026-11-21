import { z } from 'zod';
import type { Context, Input } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { ok } from '../common/api';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

/**
 * 知识付费云课堂公开通道（免登录）：小程序端唯一入口，不进 JSON 契约 / OpenAPI / 功能开关拦截。
 *
 * 匿名读接口靠 `site`（站点编码）寻址；写动作与个人数据一律带会员令牌
 *（`Authorization: Bearer <kpToken>`，由 /login 签发）。限流按「IP+站点」固定窗口：
 * 读 120/分钟、登录 10/分钟、资金类动作（解锁/兑换/购买/签到/收藏）30/分钟。
 */

const readLimiter = new RateWindow(120, 60_000);
const loginLimiter = new RateWindow(10, 60_000);
const writeLimiter = new RateWindow(30, 60_000);

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

function siteCode(c: Context<ApiEnv, string, Input>) {
  return String(c.req.query('site') || '')
    .trim()
    .toUpperCase()
    .slice(0, 16);
}

async function bodyOf<T>(
  c: Context<ApiEnv, string, Input>,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => ({}));
  return schema.parse(raw);
}

function pageQuerySchema(defaultSize = 10) {
  return z.object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(defaultSize),
  });
}

const loginSchema = z.object({
  code: z.string().trim().min(1).max(128),
  nickname: z.string().trim().max(60).optional(),
  avatar: z.string().trim().max(512).optional(),
});
const resourceIdSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
});
const cardCodeSchema = z.object({ code: z.string().trim().min(1).max(32) });
const vipPlanSchema = z.object({ plan: z.coerce.number().int().positive() });
const progressSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  lessonId: z.coerce.number().int().positive(),
  positionSec: z.coerce.number().int().min(0).max(86400).optional(),
  durationSec: z.coerce.number().int().min(0).max(86400).optional(),
  completed: z.boolean().optional(),
});
const reviewSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  content: z.string().trim().max(2000).optional(),
});
const payPrepaySchema = z.object({
  kind: z.enum(['course', 'vip']),
  resourceId: z.coerce.number().int().positive().optional(),
  plan: z.coerce.number().int().positive().optional(),
});

export function registerKnowledgePayPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { member, pay } = services.knowledgePay;

  app.get('/api/public/knowledge-pay/config', async (c) => {
    const ip = clientIp(c);
    readLimiter.consume(`${ip}|cfg`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.publicConfig(siteCode(c))));
  });

  app.post('/api/public/knowledge-pay/login', async (c) => {
    const ip = clientIp(c);
    loginLimiter.consume(`${ip}|login`, '登录过于频繁，请稍后再试');
    const body = await bodyOf(c, loginSchema);
    const code = siteCode(c);
    const site = await services.knowledgePay.service.siteByCode(code);
    const session = await member.login(code, body);
    void services.terminalScrm.identify({
      ownerUserId: site.userId,
      scene: 'KNOWLEDGE_PAY',
      sourceId: site.id,
      sourceName: site.siteName,
      customerId: session.member.id,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.member.id,
    });
    return c.json(ok(session));
  });

  const withMember = async (c: Context<ApiEnv, string, Input>) => {
    const code = siteCode(c);
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少站点编码 site');
    }
    return member.authenticate(code, c.req.header('authorization'));
  };

  app.get('/api/public/knowledge-pay/member', async (c) => {
    const { site, member: row } = await withMember(c);
    return c.json(ok(await member.memberView(row.id, site.id)));
  });

  app.post('/api/public/knowledge-pay/sign-in', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|sign`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    return c.json(ok(await member.signIn(row.id, site.id)));
  });

  app.get('/api/public/knowledge-pay/categories', async (c) => {
    readLimiter.consume(`${clientIp(c)}|cat`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.categoryList(siteCode(c))));
  });

  app.get('/api/public/knowledge-pay/banners', async (c) => {
    readLimiter.consume(`${clientIp(c)}|ban`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.bannerList(siteCode(c))));
  });

  app.get('/api/public/knowledge-pay/notices', async (c) => {
    readLimiter.consume(`${clientIp(c)}|not`, '操作太频繁，请稍后再试');
    return c.json(
      ok(
        await member.noticeList(siteCode(c), Number(c.req.query('limit')) || 6),
      ),
    );
  });

  app.get('/api/public/knowledge-pay/notice', async (c) => {
    readLimiter.consume(`${clientIp(c)}|notx`, '操作太频繁，请稍后再试');
    return c.json(
      ok(await member.noticeDetail(siteCode(c), Number(c.req.query('id')))),
    );
  });

  app.get('/api/public/knowledge-pay/links', async (c) => {
    readLimiter.consume(`${clientIp(c)}|lnk`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.linkList(siteCode(c))));
  });

  app.get('/api/public/knowledge-pay/teachers', async (c) => {
    readLimiter.consume(`${clientIp(c)}|tch`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.teacherList(siteCode(c))));
  });

  app.get('/api/public/knowledge-pay/teacher', async (c) => {
    readLimiter.consume(`${clientIp(c)}|tchx`, '操作太频繁，请稍后再试');
    return c.json(
      ok(await member.teacherDetail(siteCode(c), Number(c.req.query('id')))),
    );
  });

  app.get('/api/public/knowledge-pay/navs', async (c) => {
    readLimiter.consume(`${clientIp(c)}|nav`, '操作太频繁，请稍后再试');
    return c.json(ok(await member.navList(siteCode(c))));
  });

  app.get('/api/public/knowledge-pay/page', async (c) => {
    readLimiter.consume(`${clientIp(c)}|pg`, '操作太频繁，请稍后再试');
    return c.json(
      ok(
        await member.pageDetail(
          siteCode(c),
          Number(c.req.query('id')) || 0,
          String(c.req.query('slug') || ''),
        ),
      ),
    );
  });

  app.get('/api/public/knowledge-pay/resources', async (c) => {
    readLimiter.consume(`${clientIp(c)}|feed`, '操作太频繁，请稍后再试');
    const query = pageQuerySchema(10).parse({
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    return c.json(
      ok(
        await member.feed(siteCode(c), {
          ...query,
          categoryId: Number(c.req.query('categoryId')) || undefined,
          kind: String(c.req.query('kind') || 'all'),
          keyword: String(c.req.query('keyword') || ''),
        }),
      ),
    );
  });

  app.get('/api/public/knowledge-pay/resource', async (c) => {
    readLimiter.consume(`${clientIp(c)}|res`, '操作太频繁，请稍后再试');
    const authorization = c.req.header('authorization');
    const code = siteCode(c);
    // 带令牌则解析解锁状态；不带令牌按匿名看（未解锁）
    const ctx = authorization
      ? await member.authenticate(code, authorization)
      : null;
    return c.json(
      ok(
        await member.resourceDetail(
          code,
          Number(c.req.query('id')),
          ctx ? ctx.member : null,
        ),
      ),
    );
  });

  app.post('/api/public/knowledge-pay/unlock', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|unlock`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, resourceIdSchema);
    return c.json(ok(await member.unlock(row.id, site.id, body.resourceId)));
  });

  app.post('/api/public/knowledge-pay/favorite', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|fav`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, resourceIdSchema);
    return c.json(
      ok(await member.toggleFavorite(row.id, site.id, body.resourceId)),
    );
  });

  app.get('/api/public/knowledge-pay/orders', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuerySchema(10).parse({
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    return c.json(
      ok(await member.myOrders(site.id, row.id, query.page, query.pageSize)),
    );
  });

  app.get('/api/public/knowledge-pay/favorites', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuerySchema(10).parse({
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    return c.json(
      ok(await member.myFavorites(site.id, row.id, query.page, query.pageSize)),
    );
  });

  /** 我的学习：按课程聚合最近进度，用于「继续学习」。 */
  app.get('/api/public/knowledge-pay/my-learning', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuerySchema(10).parse({
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    return c.json(
      ok(await member.myLearning(site.id, row.id, query.page, query.pageSize)),
    );
  });

  /** 学习进度上报：播放器节流调用，未解锁课程只允许试看课时上报。 */
  app.post('/api/public/knowledge-pay/progress', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|progress`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, progressSchema);
    return c.json(ok(await member.reportProgress(row.id, site.id, body)));
  });

  /** 课程评价：需已解锁，同一会员对同一课程再次提交即更新。 */
  app.post('/api/public/knowledge-pay/review', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|review`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, reviewSchema);
    return c.json(ok(await member.saveReview(site.id, row.id, body)));
  });

  app.get('/api/public/knowledge-pay/cash-orders', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuerySchema(10).parse({
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    return c.json(
      ok(
        await member.myCashOrders(site.id, row.id, query.page, query.pageSize),
      ),
    );
  });

  /** 微信支付下单：返回 wx.requestPayment 需要的五个参数。 */
  app.post('/api/public/knowledge-pay/pay/prepay', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|prepay`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, payPrepaySchema);
    return c.json(ok(await pay.prepay(site, row, body)));
  });

  app.get('/api/public/knowledge-pay/pay/query', async (c) => {
    const { site, member: row } = await withMember(c);
    return c.json(
      ok(await pay.query(site, row.id, String(c.req.query('orderNo') || ''))),
    );
  });

  /** 微信支付回调：时间戳防重放 + APIv3 解密验真；只回 SUCCESS 才停止重试。 */
  app.post('/api/public/knowledge-pay/pay/notify', async (c) => {
    const ts = c.req.header('wechatpay-timestamp') || '';
    if (!notifyTimestampOk(ts)) {
      return c.json({ code: 'FAIL', message: '回调时间戳异常' }, 400);
    }
    const raw = await c.req.text().catch(() => '');
    let resource: {
      ciphertext?: string;
      nonce?: string;
      associated_data?: string;
    } = {};
    try {
      const payload = JSON.parse(raw || '{}') as {
        resource?: {
          ciphertext?: string;
          nonce?: string;
          associated_data?: string;
        };
      };
      resource = payload.resource || {};
    } catch {
      return c.json({ code: 'FAIL', message: '回调报文不是合法 JSON' }, 400);
    }
    try {
      const site = await services.knowledgePay.service.siteByCode(siteCode(c));
      const decoded = pay.decryptNotify(site, resource);
      const result = await pay.markPaid(site, decoded);
      if (!result.ok) {
        return c.json(
          { code: 'FAIL', message: result.message || '入账失败' },
          400,
        );
      }
      const order = await services.prisma.knowledgePayCashOrder.findFirst({
        where: { outTradeNo: decoded.outTradeNo, siteId: site.id },
        select: { id: true, memberId: true },
      });
      if (order) {
        void services.terminalScrm.identify({
          scene: 'KNOWLEDGE_PAY',
          sourceId: site.id,
          customerId: order.memberId,
          kind: 'ORDER_PAID',
          recordKey: order.id,
        });
      }
      return c.json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
      const message =
        error instanceof BusinessException ? error.message : '回调处理失败';
      return c.json({ code: 'FAIL', message: message.slice(0, 180) }, 400);
    }
  });

  app.post('/api/public/knowledge-pay/card/redeem', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|card`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, cardCodeSchema);
    const result = await member.redeemCard(site.id, row.id, body.code);
    return c.json(
      ok({ ...result, member: await member.memberView(row.id, site.id) }),
    );
  });

  app.post('/api/public/knowledge-pay/vip/buy', async (c) => {
    const ip = clientIp(c);
    writeLimiter.consume(`${ip}|vip`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, vipPlanSchema);
    const result = await member.buyVip(site.id, row.id, body.plan);
    return c.json(
      ok({ ...result, member: await member.memberView(row.id, site.id) }),
    );
  });
}
