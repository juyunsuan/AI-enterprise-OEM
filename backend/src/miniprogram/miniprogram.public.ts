import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { miniprogramLoginInputSchema } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { issueSsoSession } from '../auth/token';
import type { AccountService } from '../account/account.service';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

/**
 * 用户版小程序公开通道（免登录）：
 * - `/api/public/miniprogram/bootstrap`：启动读取功能开关与站点配置，客户端据此决定渲染哪些 tab。
 * - `/api/public/miniprogram/login`：wx.login 的 code 换会话（已绑定免登），或账号密码登录后绑定。
 * 业务数据（任务 / 审批 / 客服 / 消息）复用站内契约，令牌放 Authorization 头。
 */
export function registerMiniProgramPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
  options: { account: AccountService },
) {
  const { settings, client, service } = services.miniprogram;

  const tokenFor = async (userId: string) => {
    const row = await options.account.activeAccount(userId);
    if (!row) return null;
    return {
      token: issueSsoSession(
        String(row.id),
        row.username,
        row.role === 'PLATFORM_ADMIN' ? 'admin' : 'user',
        row.tokenVersion,
      ),
      profile: {
        userId: String(row.id),
        username: row.username,
        nickname: row.username,
      },
    };
  };

  app.get('/api/public/miniprogram/bootstrap', async (c) => {
    const value = await settings.load();
    return c.json({
      enabled: value.enabled,
      appName: value.appName,
      siteDomain: value.siteDomain,
      themeColor: value.themeColor,
      features: value.features,
    });
  });

  app.post('/api/public/miniprogram/login', async (c) => {
    const value = await settings.load();
    if (!value.enabled) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '用户版小程序尚未启用，请联系平台管理员',
      );
    }
    const body = miniprogramLoginInputSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const code = String(body.code || '').trim();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!code && (!username || !password)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请提供微信登录 code 或账号密码',
      );
    }

    // 账号密码登录：可与 code 一起提交，登录后顺带绑定当前小程序 openId。
    if (username && password) {
      const session = await options.account.login(username, password, {
        ip: clientIp(c),
        userAgent: c.req.header('user-agent'),
      });
      if (code) {
        const runtime = await settings.requireRuntime();
        const wxSession = await client.code2Session(runtime, code);
        await service.upsertBinding(
          session.userId,
          wxSession.openId,
          wxSession.unionId,
        );
      }
      return c.json({
        bound: Boolean(code),
        token: issueSsoSession(
          session.userId,
          session.username,
          session.role,
          session.tokenVersion,
        ),
        profile: {
          userId: session.userId,
          username: session.username,
          nickname: session.public.username,
        },
      });
    }

    // 仅 code：已绑定则免登，未绑定回 bound=false 交由客户端引导账号密码登录。
    const runtime = await settings.requireRuntime();
    const wxSession = await client.code2Session(runtime, code);
    const binding =
      (await service.findByOpenId(wxSession.openId)) ||
      (wxSession.unionId
        ? await service.findByUnionId(wxSession.unionId)
        : null);
    if (!binding) return c.json({ bound: false, token: '', profile: null });
    const issued = await tokenFor(binding.userId);
    if (!issued) return c.json({ bound: false, token: '', profile: null });
    return c.json({
      bound: true,
      token: issued.token,
      profile: issued.profile,
    });
  });
}
