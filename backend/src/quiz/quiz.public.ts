import type { Context, Input } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { ok } from '../common/api';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  ).slice(0, 64);
}

/**
 * 答题小程序公开通道（`/api/public/quiz/**`，免站内登录）：
 * - 站点码 = QuizSite.code（小程序 config.js 的 siteCode），题库码 = QuizBank.code；
 * - 题面与判分全部服务端完成，公开题面不带答案与解析；
 * - AI 解析/复盘按 IP 限流，走统一模型网关记账；
 * - AI 客服不在这里另建通道，小程序直接复用 `/api/public/service-desk/open/*`。
 */
export function registerQuizPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const readWindow = new RateWindow(240, 60_000);
  const writeWindow = new RateWindow(60, 60_000);
  const aiWindow = new RateWindow(10, 60_000);
  const quiz = services.quiz;

  const guard = (
    window: InstanceType<typeof RateWindow>,
    c: Context<ApiEnv, string, Input>,
    message: string,
  ) => window.consume(clientIp(c), message);

  app.get('/api/public/quiz/bootstrap', async (c) => {
    guard(readWindow, c, '访问过于频繁，请稍后重试');
    const code = String(c.req.query('code') || '').trim();
    const participantId = String(c.req.query('participantId') || '').trim();
    return c.json(ok(await quiz.publicBootstrap(code, participantId)));
  });

  app.post('/api/public/quiz/:siteCode/register', async (c) => {
    guard(writeWindow, c, '提交过于频繁，请稍后再试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(ok(await quiz.publicRegister(c.req.param('siteCode'), body)));
  });

  app.post('/api/public/quiz/:bankCode/start', async (c) => {
    guard(readWindow, c, '访问过于频繁，请稍后重试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(ok(await quiz.publicStart(c.req.param('bankCode'), body)));
  });

  app.post('/api/public/quiz/:bankCode/check', async (c) => {
    guard(writeWindow, c, '提交过于频繁，请稍后再试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(ok(await quiz.publicCheck(c.req.param('bankCode'), body)));
  });

  app.post('/api/public/quiz/:bankCode/submit', async (c) => {
    guard(writeWindow, c, '提交过于频繁，请稍后再试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(ok(await quiz.publicSubmit(c.req.param('bankCode'), body)));
  });

  app.get('/api/public/quiz/:bankCode/attempts', async (c) => {
    guard(readWindow, c, '访问过于频繁，请稍后重试');
    const participantId = String(c.req.query('participantId') || '').trim();
    const limit = Number(c.req.query('limit') || 20);
    return c.json(
      ok(
        await quiz.publicAttempts(
          c.req.param('bankCode'),
          participantId,
          limit,
        ),
      ),
    );
  });

  app.get('/api/public/quiz/:bankCode/rank', async (c) => {
    guard(readWindow, c, '访问过于频繁，请稍后重试');
    const limit = Number(c.req.query('limit') || 20);
    return c.json(ok(await quiz.publicRank(c.req.param('bankCode'), limit)));
  });

  app.get('/api/public/quiz/:bankCode/wrong', async (c) => {
    guard(readWindow, c, '访问过于频繁，请稍后重试');
    const participantId = String(c.req.query('participantId') || '').trim();
    return c.json(
      ok(await quiz.publicWrong(c.req.param('bankCode'), participantId)),
    );
  });

  app.post('/api/public/quiz/:bankCode/explain', async (c) => {
    guard(aiWindow, c, 'AI 解析请求过于频繁，请稍后再试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(ok(await quiz.publicExplain(c.req.param('bankCode'), body)));
  });

  app.post('/api/public/quiz/:bankCode/attempts/:id/analysis', async (c) => {
    guard(aiWindow, c, 'AI 复盘请求过于频繁，请稍后再试');
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(
      ok(
        await quiz.publicAttemptAnalysis(
          c.req.param('bankCode'),
          Number(c.req.param('id')),
          body,
        ),
      ),
    );
  });
}
