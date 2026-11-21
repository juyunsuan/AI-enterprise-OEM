import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { parseHealthStaffToken } from './health-staff-token';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

const qs = (c: Context<ApiEnv, string, Input>, name: string, max = 64) =>
  String(c.req.query(name) || '')
    .trim()
    .slice(0, max);

const qn = (c: Context<ApiEnv, string, Input>, name: string) => {
  const value = Number(c.req.query(name) || 0);
  return Number.isFinite(value) ? value : 0;
};

/**
 * 健康管理小程序 · 医护工作台公开通道（`/api/public/health/staff/**`）。
 *
 * 与顾客通道同一免登录入口，但身份来自医护令牌（`private-mini-health-staff`）：
 * - `bind` 需要顾客令牌 + 手机号 + 执业证号三板同验，签发的令牌与顾客令牌互不通用；
 * - 其余接口只认医护令牌，服务层每次回查 `shopId + practitionerId` 并校验审核/在岗；
 * - 端上仍随请求带 shopCode：店铺闸门（平台开关、店铺暂停）与顾客端一致生效。
 */
export function registerHealthStaffPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const staffService = services.health.staffService;
  const publicService = services.health.publicService;
  const bindWindow = new RateWindow(12, 60_000);
  const anonWindow = new RateWindow(240, 60_000);
  const writeWindow = new RateWindow(90, 60_000);

  const bodyOf = async <T extends z.ZodTypeAny>(
    c: Context<ApiEnv, string, Input>,
    schema: T,
  ) => schema.parse(await c.req.json().catch(() => ({})));
  const tokenOf = (c: Context<ApiEnv, string, Input>) =>
    c.req.header('authorization') || c.req.header('x-customer-token') || '';
  const guard = (c: Context<ApiEnv, string, Input>, write = false): void => {
    if (write)
      writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    else
      anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
  };
  const authed = async (
    c: Context<ApiEnv, string, Input>,
    shopCode: string,
  ) => {
    const shop = await publicService.requireShop(shopCode);
    const identity = await staffService.identify(
      shop.shopId,
      parseHealthStaffToken(tokenOf(c)),
    );
    return { shop, identity };
  };

  // ---------------------------------------------------------------- 绑定 / 身份

  app.post('/api/public/health/staff/bind', async (c) => {
    bindWindow.consume(
      clientIp(c) || 'unknown',
      '绑定尝试过于频繁，请一分钟后再试',
    );
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        phone: z.string().trim().min(6).max(32),
        licenseNo: z.string().trim().min(4).max(64),
      }),
    );
    const shop = await publicService.requireShop(body.shopCode);
    const customer = await publicService.requireCustomer(
      parseCustomerToken(tokenOf(c)),
    );
    return c.json(await staffService.bind(shop, customer, body));
  });

  app.get('/api/public/health/staff/profile', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await staffService.profile(identity));
  });

  app.get('/api/public/health/staff/workbench', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await staffService.workbench(identity));
  });

  // ---------------------------------------------------------------- 就诊人 / 档案 / 指标

  app.get('/api/public/health/staff/patients', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.patients(identity, {
        keyword: qs(c, 'keyword', 40),
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.get('/api/public/health/staff/patient', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.patientDetail(identity, {
        patientId: qn(c, 'patientId'),
      }),
    );
  });

  app.get('/api/public/health/staff/metrics', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.metrics(identity, { patientId: qn(c, 'patientId') }),
    );
  });

  app.post('/api/public/health/staff/metrics/log', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        patientId: z.number().int().positive(),
        metricId: z.number().int().positive(),
        value: z.number(),
        measuredAt: z.string().trim().max(32).default(''),
        note: z.string().trim().max(200).default(''),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.saveMetricLog(identity, body));
  });

  // ---------------------------------------------------------------- 随访

  app.get('/api/public/health/staff/followups', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.followups(identity, {
        status: qs(c, 'status', 24),
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.get('/api/public/health/staff/followup', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.followupDetail(identity, { id: qn(c, 'id') }),
    );
  });

  app.post('/api/public/health/staff/followup/save', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        taskId: z.number().int().positive(),
        status: z.enum(['DONE', 'SKIPPED', 'CANCELLED']),
        conclusion: z.string().trim().max(500).default(''),
        reason: z.string().trim().max(500).default(''),
        nextAt: z.string().trim().max(32).default(''),
        metrics: z
          .array(
            z.object({
              metricId: z.number().int().positive(),
              value: z.number(),
              measuredAt: z.string().trim().max(32).default(''),
            }),
          )
          .max(10)
          .default([]),
        attachments: z
          .array(
            z.object({
              name: z.string().trim().max(60).default(''),
              url: z.string().trim().max(500),
            }),
          )
          .max(9)
          .default([]),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.saveFollowup(identity, body));
  });

  // ---------------------------------------------------------------- 问诊接单

  app.get('/api/public/health/staff/consults', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.consults(identity, {
        status: qs(c, 'status', 24),
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.post('/api/public/health/staff/consults/action', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().positive(),
        action: z.enum(['ACCEPT', 'FINISH', 'REJECT']),
        reason: z.string().trim().max(500).default(''),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.consultAction(identity, body));
  });

  // ---------------------------------------------------------------- 处方复核

  app.get('/api/public/health/staff/prescriptions', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.prescriptions(identity, {
        status: qs(c, 'status', 24),
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.post('/api/public/health/staff/prescriptions/review', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().positive(),
        approved: z.boolean(),
        reason: z.string().trim().max(200).default(''),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.reviewPrescription(identity, body));
  });

  // ---------------------------------------------------------------- 排班 / 号源

  app.get('/api/public/health/staff/schedule', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.schedule(identity, {
        from: qs(c, 'from', 10),
        to: qs(c, 'to', 10),
      }),
    );
  });

  app.post('/api/public/health/staff/slots/block', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        slotId: z.number().int().positive(),
        blocked: z.boolean(),
        reason: z.string().trim().max(100).default(''),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.blockSlot(identity, body));
  });

  // ---------------------------------------------------------------- 核销

  app.post('/api/public/health/staff/verify', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        code: z.string().trim().min(1).max(32),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.verify(identity, body));
  });

  // ---------------------------------------------------------------- 收益 / 银行卡 / 提现

  app.get('/api/public/health/staff/income', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await staffService.income(identity));
  });

  app.post('/api/public/health/staff/bank-cards/save', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        accountName: z.string().trim().min(1).max(60),
        bankName: z.string().trim().min(1).max(60),
        branchName: z.string().trim().max(80).default(''),
        cardNo: z.string().trim().min(12).max(32),
        phone: z.string().trim().max(32).default(''),
        isDefault: z.boolean().default(false),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.saveBankCard(identity, body));
  });

  app.post('/api/public/health/staff/withdrawals/apply', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        amountCents: z.number().int().positive(),
        bankCardId: z.number().int().positive(),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.applyWithdrawal(identity, body));
  });

  // ---------------------------------------------------------------- 科普投稿

  app.get('/api/public/health/staff/articles', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.articles(identity, {
        status: qs(c, 'status', 24),
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.get('/api/public/health/staff/articles/detail', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await staffService.articleDetail(identity, { id: qn(c, 'id') }),
    );
  });

  app.post('/api/public/health/staff/articles/save', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().min(0).default(0),
        categoryId: z.number().int().min(0).default(0),
        title: z.string().trim().min(1).max(120),
        kind: z.enum(['ARTICLE', 'VIDEO', 'AUDIO', 'LIVE']).default('ARTICLE'),
        coverImage: z.string().trim().max(500).default(''),
        mediaUrl: z.string().trim().max(1000).default(''),
        summary: z.string().trim().max(300).default(''),
        contentHtml: z.string().max(60000).default(''),
        tags: z.array(z.string().trim().max(20)).max(8).default([]),
        visibility: z
          .enum(['PUBLIC', 'MEMBER', 'CROWD', 'SIGNED'])
          .default('PUBLIC'),
        crowdKinds: z.array(z.string().trim().max(24)).max(8).default([]),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.saveArticle(identity, body));
  });

  app.post('/api/public/health/staff/articles/offline', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().positive(),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.offlineArticle(identity, body));
  });

  // ---------------------------------------------------------------- AI 医护
  // 口径：这里只做身份与闸门，问答本身引用 AI客服的纯AI客服员工，健康域不存人设与知识。

  app.get('/api/public/health/staff/ai/status', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await staffService.aiStatus(identity));
  });

  app.get('/api/public/health/staff/ai/agents', async (c) => {
    guard(c);
    const { identity } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await staffService.aiAgents(identity));
  });

  app.post('/api/public/health/staff/ai/ask', async (c) => {
    // 提问要调模型，按写接口限流，避免个别医护把额度刷满。
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        question: z.string().max(4000).default(''),
        history: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant']),
              content: z.string().max(4000),
            }),
          )
          .max(40)
          .default([]),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.aiAsk(identity, body));
  });

  app.post('/api/public/health/staff/ai/enabled', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        enabled: z.boolean(),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.aiEnabledSave(identity, body));
  });

  app.post('/api/public/health/staff/ai/binding', async (c) => {
    guard(c, true);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        practitionerId: z.number().int().positive(),
        agentId: z.number().int().min(0),
      }),
    );
    const { identity } = await authed(c, body.shopCode);
    return c.json(await staffService.aiBindingSave(identity, body));
  });
}
