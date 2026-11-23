import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { sign } from 'jsonwebtoken';
import type { ApiEnv } from '../http/types';
import { issueSsoSession, isSsoSession } from './token';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  sessionToken,
  writeSessionCookie,
} from './session';

// 会话令牌靠 JWT_SECRET 签发与验签；单测自带一把固定密钥，不依赖 backend/.env。
process.env.JWT_SECRET = 'unit-session-secret';

/**
 * 会话 Cookie 的名字与旧名兜底口径。
 *
 * 旧名 `aiworkin_token` 与同机运行的 AIworkin 同名：Cookie 只按 host 分罐、不分端口，
 * 对方写进去的上游 2 小时令牌会顶掉本站会话，表现为「刚登录就 401」反复循环。
 * 现在本站会话用独立名字，旧名只在确实是本站自签会话时才承认。
 */
function ssoToken() {
  return issueSsoSession('42', 'unit_user', 'user', 0);
}

function upstreamToken() {
  return sign({ userId: '42', type: 'access' }, 'unit-session-secret', {
    algorithm: 'HS256',
    issuer: 'aipdd-java-core',
    expiresIn: 7200,
  });
}

function appWith(handler: (c: Context<ApiEnv>) => Response) {
  const app = new Hono<ApiEnv>();
  app.get('/probe', handler);
  return app;
}

async function probe(cookie: string, header?: string) {
  const app = appWith((c) => new Response(sessionToken(c) ?? ''));
  const response = await app.request('/probe', {
    headers: { cookie, ...(header ? { authorization: header } : {}) },
  });
  return await response.text();
}

describe('会话 Cookie 名字与旧名兜底', () => {
  it('本站会话用独立名字，不再与 AIworkin 的 aiworkin_token 同名', () => {
    expect(SESSION_COOKIE).toBe('enterprise_token');
    expect(LEGACY_SESSION_COOKIE).toBe('aiworkin_token');
  });

  it('新名 Cookie 当作会话', async () => {
    const token = ssoToken();
    expect(await probe(`${SESSION_COOKIE}=${token}`)).toBe(token);
  });

  it('旧名里是本站自签会话时仍承认（存量用户不被踢下线）', async () => {
    const token = ssoToken();
    expect(await probe(`${LEGACY_SESSION_COOKIE}=${token}`)).toBe(token);
  });

  it('旧名里是上游签发令牌时一律忽略——这正是反复掉线的那一枚', async () => {
    expect(await probe(`${LEGACY_SESSION_COOKIE}=${upstreamToken()}`)).toBe('');
  });

  it('两枚同名并存时取本站那枚，不受对方令牌遮蔽', async () => {
    const token = ssoToken();
    expect(
      await probe(
        `${LEGACY_SESSION_COOKIE}=${upstreamToken()}; ${SESSION_COOKIE}=${token}`,
      ),
    ).toBe(token);
  });

  it('Authorization 头优先于 Cookie', async () => {
    const headerToken = ssoToken();
    expect(
      await probe(`${SESSION_COOKIE}=${ssoToken()}`, `Bearer ${headerToken}`),
    ).toBe(headerToken);
  });

  it('写会话只写新名，并清掉旧名里属于本站的那一枚', async () => {
    const app = new Hono<ApiEnv>();
    app.get('/login', (c) => {
      writeSessionCookie(c, ssoToken());
      return c.text('ok');
    });
    async function setCookies(cookie: string) {
      const response = await app.request('/login', { headers: { cookie } });
      return response.headers.getSetCookie();
    }

    const migrated = await setCookies(`${LEGACY_SESSION_COOKIE}=${ssoToken()}`);
    expect(migrated.some((item) => item.startsWith(`${SESSION_COOKIE}=`))).toBe(
      true,
    );
    expect(
      migrated.some((item) => item.startsWith(`${LEGACY_SESSION_COOKIE}=;`)),
    ).toBe(true);

    // 不是本站签的就不替用户删：那是别人 host 罐子里的合法会话，本站无权覆盖。
    const foreign = await setCookies(
      `${LEGACY_SESSION_COOKIE}=${upstreamToken()}`,
    );
    expect(
      foreign.some((item) => item.startsWith(`${LEGACY_SESSION_COOKIE}=;`)),
    ).toBe(false);
  });

  it('旧名兜底只在签发方是本站时生效，签发方判定不依赖密钥', () => {
    expect(isSsoSession(ssoToken())).toBe(true);
    expect(isSsoSession(upstreamToken())).toBe(false);
    expect(isSsoSession('not-a-token')).toBe(false);
  });
});

describe('会话 Cookie 读取口径', () => {
  it('读取新名时值原样返回（含 URI 编码还原）', async () => {
    const app = new Hono<ApiEnv>();
    app.get('/read', (c) => new Response(getCookie(c, SESSION_COOKIE) ?? ''));
    const token = ssoToken();
    const response = await app.request('/read', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
    });
    expect(await response.text()).toBe(token);
  });
});
