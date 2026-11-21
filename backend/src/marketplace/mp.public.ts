import type { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  mpMerchantApplyBodySchema,
  mpMerchantLoginBodySchema,
} from '@enterprise/contracts';
import { ok } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { handleError } from '../http/error-handler';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

/**
 * 多店铺商城平台公开通道（免登录）：入驻申请、商户登录、入驻页所需的市场与类目。
 *
 * 走 `/api/public/market/**`，不进功能开关拦截（商户入驻是市场的外部入口，
 * 运营方关板块时应改市场状态而不是让入驻页 500）；限流按 IP + 账号双键。
 * 买家侧（B1 起）的商品/购物车/订单/支付回调也挂在这段前缀下。
 */
export function registerMarketplacePublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const merchants = services.marketplace.merchant;
  const router = new Hono<ApiEnv>();
  router.onError(handleError);

  const applyWindow = new RateWindow(5, 10 * 60_000);
  const loginWindow = new RateWindow(10, 60_000);

  const ipOf = (c: Context) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';

  const bodyOf = async <
    S extends {
      safeParse: (v: unknown) => {
        success: boolean;
        data?: unknown;
        error?: { issues: Array<{ message: string }> };
      };
    },
  >(
    c: Context,
    schema: S,
  ) => {
    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        parsed.error?.issues[0]?.message || '请求参数格式不正确',
      );
    }
    return parsed.data;
  };

  /** 入驻页下拉：输入市场编号后拉市场名与可经营类目。 */
  router.get('/merchant/options', async (c) => {
    const code = String(c.req.query('marketCode') || '').trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先填写市场编号');
    }
    return c.json(ok(await merchants.options(code)));
  });

  router.post('/merchant/apply', async (c) => {
    const key = `apply:${ipOf(c)}`;
    applyWindow.consume(key, '提交过于频繁，请 10 分钟后再试');
    const input = (await bodyOf(c, mpMerchantApplyBodySchema)) as Parameters<
      typeof merchants.apply
    >[0];
    try {
      return c.json(ok(await merchants.apply(input)));
    } catch (error) {
      // 校验类失败不该占入驻额度，只在真正落库成功时计一次
      if (error instanceof BusinessException) applyWindow.refund(key);
      throw error;
    }
  });

  router.post('/merchant/login', async (c) => {
    const ip = ipOf(c);
    loginWindow.consume(`login:${ip}`, '登录尝试过于频繁，请稍后再试');
    const input = (await bodyOf(c, mpMerchantLoginBodySchema)) as {
      username: string;
      password: string;
    };
    loginWindow.consume(
      `login-user:${input.username}`,
      '该账号登录尝试过于频繁，请 1 分钟后再试',
    );
    return c.json(ok(await merchants.login(input.username, input.password)));
  });

  app.route('/api/public/market', router);
}
