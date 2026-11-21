import { createHash, createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 小程序侧令牌的唯一实现（顾客 / 会员 / 技师 / 代理共用一套签发与验签骨架）。
 *
 * 为什么不是"立刻统一密钥派生算法"：派生算法一换，此前签出去的所有令牌立即验不过，
 * 等于把 8 个在营业的小程序的顾客全部踢下线。所以这里统一的是**实现**（签名、有效期、
 * 错误语义、场景白名单），派生算法做成显式策略：
 * - `hmac-issuer`：`HMAC_SHA256(JWT_SECRET, issuer)`（顾客/技师/代理/医护令牌的历史口径）；
 * - `sha256-concat`：`SHA256("oem-xxx|" + JWT_SECRET)`（数字人/知识付费/多店铺会员的历史口径）。
 * 各 profile 原样传入自己历史上的 issuer / context / TTL / 载荷字段名，**一个字节都不改**；
 * 将来要收口成一种，用 `legacyDerive` 开一个双读窗口，验签通过后再切写路径。
 *
 * 顺带把"越权判定交业务层"这条约定升级成代码约束：给了 `scenes` 的 profile，
 * 验签时场景不在白名单里直接拒，漏写 WHERE 也不至于跨场景串数据。
 */

export type TokenDerive = 'hmac-issuer' | 'sha256-concat';

export type MiniTokenProfile<TPayload> = {
  /** 业务名，只用于错误文案，便于用户和客服对上号 */
  name: string;
  issuer: string;
  derive: TokenDerive;
  /** `sha256-concat` 的历史上下文串（如 `oem-digital-human-member`） */
  context?: string;
  ttlSeconds: number;
  toClaims: (payload: TPayload) => Record<string, unknown>;
  fromClaims: (claims: jwt.JwtPayload) => TPayload | null;
  /** 场景白名单：非空则验签强制校验 */
  scenes?: readonly string[];
  sceneOf?: (payload: TPayload) => string | undefined;
  /** 迁移期的旧口径（配 `legacyContext`），验签兼容、签发不变 */
  legacyDerive?: TokenDerive;
  legacyContext?: string;
  /** 令牌取自 Authorization 头时要不要剥掉 `Bearer `（各端历史行为不同，必须原样保留） */
  stripBearer?: boolean;
  /** 验签不过（非过期）时的文案，与 expiredMessage 分开，客服话术才对得上 */
  invalidMessage?: string;
  /** 时钟容差秒数：个别端历史上允许少量漂移，保留以免影响边缘用户 */
  clockTolerance?: number;
  /** 缺 `JWT_SECRET` 时的文案：各端历史上带业务名（顾客/技师/代理/医护），客服据此判断哪条链路配错 */
  unconfiguredMessage?: string;
  /** 失效提示文案：沿用各端原句，避免改了文案让客服话术对不上 */
  expiredMessage?: string;
};

export type MiniToken<TPayload> = {
  issuer: string;
  issue(payload: TPayload, ttlSeconds?: number): string;
  /** 严格版：任何异常都翻译成 UNAUTHORIZED，并带上可读的重进提示 */
  verify(token: string): TPayload;
  /** 静默版：令牌不可用时返回 null，供"有则用、无则匿名"的接口使用 */
  tryVerify(token: string): TPayload | null;
};

function jwtSecret(message?: string): string {
  const secret = String(process.env.JWT_SECRET ?? '').trim();
  if (!secret) {
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      message ??
        '服务器未配置 JWT_SECRET，小程序登录暂不可用，请联系平台管理员',
    );
  }
  return secret;
}

function deriveKey(
  derive: TokenDerive,
  issuer: string,
  context?: string,
  unconfiguredMessage?: string,
): string | Buffer {
  const secret = jwtSecret(unconfiguredMessage);
  if (derive === 'sha256-concat') {
    return createHash('sha256')
      .update(`${context ?? issuer}|${secret}`)
      .digest('hex');
  }
  return createHmac('sha256', secret).update(issuer).digest();
}

type DecodeResult = { claims: jwt.JwtPayload | null; expired: boolean };

function decode(
  token: string,
  key: string | Buffer,
  issuer: string,
  stripBearer = false,
  tolerance = 0,
): DecodeResult {
  try {
    const raw = jwt.verify(
      stripBearer
        ? String(token || '')
            .replace(/^Bearer\s+/i, '')
            .trim()
        : String(token || '').trim(),
      key,
      { algorithms: ['HS256'], issuer, clockTolerance: tolerance },
    ) as jwt.JwtPayload;
    return { claims: raw ?? null, expired: false };
  } catch (error) {
    // 只有真过期才说"登录已过期"；签名不对/issuer 不符/载荷缺字段都说"身份无效"，
    // 两种话术各端历史上不同（重新进入 vs 重新绑定），混用会把用户引到错的自救路径上。
    return {
      claims: null,
      expired: error instanceof Error && error.name === 'TokenExpiredError',
    };
  }
}

export function createMiniToken<TPayload>(
  profile: MiniTokenProfile<TPayload>,
): MiniToken<TPayload> {
  const fallback = `${profile.name}登录状态已失效，请重新进入小程序再试`;
  const reject = (reason: 'expired' | 'invalid') =>
    new BusinessException(
      ErrorCode.UNAUTHORIZED,
      (reason === 'expired'
        ? profile.expiredMessage
        : (profile.invalidMessage ?? profile.expiredMessage)) ?? fallback,
    );

  const accept = (claims: jwt.JwtPayload | null): TPayload | null => {
    if (!claims) return null;
    const payload = profile.fromClaims(claims);
    if (!payload) return null;
    if (profile.scenes && profile.sceneOf) {
      const scene = profile.sceneOf(payload);
      if (scene && !profile.scenes.includes(scene)) return null;
    }
    return payload;
  };

  /**
   * 验签的唯一实现：`tryVerify` 直接用（只回答能不能用），
   * `verify` 走 `attempt` 拿到失败原因后挑对应文案抛错。
   */
  const attempt = (
    token: string,
  ): { payload: TPayload | null; reason: 'expired' | 'invalid' } => {
    const first = decode(
      token,
      deriveKey(
        profile.derive,
        profile.issuer,
        profile.context,
        profile.unconfiguredMessage,
      ),
      profile.issuer,
      profile.stripBearer ?? false,
      profile.clockTolerance ?? 0,
    );
    const payload = accept(first.claims);
    if (payload) return { payload, reason: 'invalid' };
    if (!profile.legacyDerive)
      return { payload: null, reason: first.expired ? 'expired' : 'invalid' };
    // 双读窗口：只在新旧派生口径并存的过渡期开启，切完就删掉 legacy 两个字段
    const second = decode(
      token,
      deriveKey(
        profile.legacyDerive,
        profile.issuer,
        profile.legacyContext,
        profile.unconfiguredMessage,
      ),
      profile.issuer,
      profile.stripBearer ?? false,
      profile.clockTolerance ?? 0,
    );
    const legacyPayload = accept(second.claims);
    if (legacyPayload) return { payload: legacyPayload, reason: 'invalid' };
    return {
      payload: null,
      reason: first.expired || second.expired ? 'expired' : 'invalid',
    };
  };

  const read = (token: string): TPayload | null => attempt(token).payload;

  return {
    issuer: profile.issuer,
    issue(payload, ttlSeconds = profile.ttlSeconds) {
      return jwt.sign(
        profile.toClaims(payload),
        deriveKey(
          profile.derive,
          profile.issuer,
          profile.context,
          profile.unconfiguredMessage,
        ),
        {
          algorithm: 'HS256',
          issuer: profile.issuer,
          expiresIn: Math.max(1, Math.floor(ttlSeconds)),
        },
      );
    },
    tryVerify: read,
    verify(token) {
      const { payload, reason } = attempt(token);
      if (!payload) throw reject(reason);
      return payload;
    },
  };
}
