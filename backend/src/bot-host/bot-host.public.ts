import type { Context } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  BOT_HOST_TOKEN_HEADER,
  type BotClientKind,
} from '@enterprise/contracts';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import type { AccountModule } from '../account/account.routes';
import type { AuthService } from '../auth/auth.service';
import type { PlatformModule } from '../platform/platform.routes';
import { CurrentUser } from '../auth/current-user';
import { issueSsoSession, REMEMBER_TTL_SECONDS } from '../auth/token';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { BotHostPrincipal } from './bot-host.service';

/**
 * Bot 主机的客户端通道：`/api/public/bot-host/**`，挂在根 app 上
 * （与硬件设备、本地 Chrome 插件同一套），免登录、不进功能开关。
 *
 * 两种身份分开：
 *  - 账号会话（Bearer <SSO JWT>）：只在登录、会话续期、申请/轮询配对码与模型设置同步时用；
 *  - 主机令牌（x-bot-token: bot_...）：配对成功后心跳/进度/回执沿用，账号退出不影响已配对的主机。
 *
 * 与设备通道同一条底线（D3-A 的等价约束）：本机凭据与目标站点口令永不出站，
 * 本通道只传「做什么」与「做到哪了」。应答刻意保持极简 { ok, ... }。
 */

export interface BotHostPublicDeps {
  account: AccountModule;
  auth: AuthService;
  platform: PlatformModule;
}

function clientIp(c: Context<ApiEnv>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') || '';
}

function denied(message: string) {
  return { ok: false, message } as Record<string, unknown>;
}

/** 请求体只接受对象：数组与标量一律当空表（与设备通道同一宽松口径）。 */
async function bodyOf(c: Context<ApiEnv>): Promise<Record<string, unknown>> {
  const parsed = await c.req
    .json<Record<string, unknown>>()
    .catch((): null => null);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : {};
}

function text(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export interface BotHostPublicOptions {
  /** 通道前缀：桌面 /api/public/bot-host，Mobot /api/public/mobot。 */
  basePath?: string;
  /** 该通道只接受此类型的设备令牌；不传＝桌面通道。 */
  clientKind?: BotClientKind;
}

export function registerBotHostPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
  deps: BotHostPublicDeps,
  options: BotHostPublicOptions = {},
) {
  const hosts = services.botHost;
  const basePath = options.basePath || '/api/public/bot-host';
  const requiredKind: BotClientKind =
    options.clientKind === 'MOBOT' ? 'MOBOT' : 'DESKTOP';
  // 客户端登录按 IP 兜底限流；账号维度的连续失败锁定仍在 AccountService 里。
  const loginLimit = new RateWindow(30, 10 * 60_000);

  const authenticate = async (
    c: Context<ApiEnv>,
  ): Promise<BotHostPrincipal | Response> => {
    const host = await hosts.hostByToken(
      c.req.header(BOT_HOST_TOKEN_HEADER) || '',
    );
    if (!host || host.clientKind !== requiredKind) {
      return c.json(
        denied('主机令牌无效或已失效，请在客户端里重新配对本站账号'),
        401,
      );
    }
    return host;
  };

  /** 账号会话：只认 Authorization: Bearer，不落 Cookie（客户端是独立进程）。 */
  const sessionUser = async (
    c: Context<ApiEnv>,
  ): Promise<CurrentUser | null> => {
    const raw = (c.req.header('authorization') || '')
      .trim()
      .replace(/^Bearer\s+/i, '');
    if (!raw) return null;
    try {
      return (
        (await deps.auth.authenticate(
          'POST',
          '/enterprise/bot-hosts/pair',
          raw,
        )) || null
      );
    } catch {
      return null;
    }
  };

  /** 登录/会话接口共用的账号侧信息：昵称、站点名、积分余额。 */
  const profileOf = async (user: CurrentUser) => {
    const [account, site, balance] = await Promise.all([
      services.prisma.account
        .findUnique({
          where: { id: Number(user.userId) },
          select: { username: true, avatar: true, email: true },
        })
        .catch(() => null),
      deps.platform.site.view().catch(() => null),
      services.points.ledger.balance(user.userId).catch(() => 0),
    ]);
    return {
      user: {
        userId: user.userId,
        username: account?.username || user.username,
        avatar: account?.avatar || '',
        email: account?.email || '',
        role: user.role,
      },
      site: {
        name: site?.siteName || '',
        logo: site?.siteLogo || '',
        url: site?.siteUrl || '',
      },
      points: { balance },
    };
  };

  const handle = async (
    c: Context<ApiEnv>,
    run: (
      host: BotHostPrincipal,
      body: Record<string, unknown>,
    ) => Promise<object>,
  ) => {
    const host = await authenticate(c);
    if (host instanceof Response) return host;
    try {
      return c.json({ ok: true, ...(await run(host, await bodyOf(c))) });
    } catch (error) {
      if (error instanceof BusinessException) {
        return c.json(denied(error.message), error.getStatus());
      }
      return c.json(denied('主机通道处理失败'), 500);
    }
  };

  const open = async (
    c: Context<ApiEnv>,
    run: (body: Record<string, unknown>) => Promise<object>,
  ) => {
    try {
      return c.json({ ok: true, ...(await run(await bodyOf(c))) });
    } catch (error) {
      if (error instanceof BusinessException) {
        return c.json(denied(error.message), error.getStatus());
      }
      return c.json(denied('主机通道处理失败'), 500);
    }
  };

  /** 需要账号会话的开放接口：没登录直接 401，客户端据此把绑定区锁上。 */
  const signedIn = async (
    c: Context<ApiEnv>,
    run: (user: CurrentUser, body: Record<string, unknown>) => Promise<object>,
  ) => {
    const user = await sessionUser(c);
    if (!user) {
      return c.json(denied('请先在客户端登录平台账号'), 401);
    }
    return open(c, (body) => run(user, body));
  };

  // 客户端登录：平台账号密码换 30 天会话令牌。绑定连接码必须先走到这一步。
  app.post(basePath + '/login', async (c) => {
    const ip = clientIp(c) || 'unknown';
    try {
      loginLimit.consume(ip, '登录尝试过于频繁，请 10 分钟后再试');
    } catch (error) {
      if (error instanceof BusinessException) {
        return c.json(denied(error.message), error.getStatus());
      }
      return c.json(denied('登录失败'), 500);
    }
    return open(c, async (body) => {
      const username = text(body.username, 64);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!username || !password) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '请输入账号和密码');
      }
      const session = await deps.account.account.login(username, password, {
        ip,
        userAgent: c.req.header('user-agent') || 'BotBuddy',
      });
      const token = issueSsoSession(
        session.userId,
        session.username,
        session.role,
        session.tokenVersion,
        REMEMBER_TTL_SECONDS,
      );
      return {
        token,
        mustChangePassword: session.mustChangePassword,
        ...(await profileOf(
          new CurrentUser(session.userId, session.username, session.role),
        )),
      };
    });
  });

  // 会话续期/校验：客户端启动时带旧令牌来换最新的昵称、站点名与积分余额。
  app.post(basePath + '/session', async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json(denied('登录已失效，请重新登录'), 401);
    return open(c, async () => profileOf(user));
  });

  // 申请配对码：客户端展示 6 位码，用户在站内「Bot 主机」页输入认领。
  // 码与账号绑定：谁登录客户端谁申请，站内必须用同一账号认领。
  app.post(basePath + '/pair', (c) =>
    signedIn(c, (user, body) =>
      // 通道即设备类型：桌面通道只能申请桌面码，Mobot 通道只能申请 MOBOT 码。
      hosts.requestPairCode(user, { ...body, clientKind: requiredKind }),
    ),
  );

  // 轮询配对结果：用户认领后取回一次性令牌并作废该码。
  app.post(basePath + '/pair/poll', (c) =>
    signedIn(c, (user, body) => hosts.pollPairCode(user, body)),
  );

  // 心跳：刷新在线态，顺带领取待执行指令、需要中断的指令码与积分余额。
  app.post(basePath + '/heartbeat', (c) =>
    handle(c, async (host, body) => ({
      ...(await hosts.heartbeat(host, body, clientIp(c))),
      points: await services.points.ledger.balance(host.userId).catch(() => 0),
    })),
  );

  // 流式进度：回传 ACP 片段，并取回平台的取消标记。
  app.post(basePath + '/progress', (c) =>
    handle(c, (host, body) => hosts.progress(host, body)),
  );

  // 终结回执：按 commandCode 幂等。
  app.post(basePath + '/result', (c) =>
    handle(c, (host, body) => hosts.result(host, body)),
  );

  // 本机改完模型设置同步到平台（平台侧落一条「BotBuddy · 主机名」渠道并授权给本机）。
  app.post(basePath + '/model-settings', (c) =>
    handle(c, (host, body) => hosts.syncModelFromClient(host, body)),
  );

  // 本机清空模型设置：撤掉客户端同步的覆盖项，主机回到跟随平台默认模型。
  app.delete(basePath + '/model-settings', (c) =>
    handle(c, (host) => hosts.clearClientModel(host)),
  );

  // 客户端退出配对：本机令牌保留，仅转离线（重新配对才换令牌）。
  app.post(basePath + '/logout', (c) =>
    handle(c, (host) => hosts.logout(host)),
  );
}

/**
 * Mobot 手机通道：与 Bot 主机共用登录、配对、心跳、指令与模型授权实现；
 * 独立前缀 + 强制 MOBOT 设备类型，桌面令牌进不来、Mobot 令牌也进不了桌面通道。
 */
export function registerMobotPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
  deps: BotHostPublicDeps,
) {
  registerBotHostPublic(app, services, deps, {
    basePath: '/api/public/mobot',
    clientKind: 'MOBOT',
  });
}
