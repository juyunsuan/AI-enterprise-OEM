import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 多店铺商城平台·商户令牌与口令。
 *
 * 与站内会话、顾客令牌、技师令牌三方物理隔离：issuer 与派生密钥都单独一套，
 * 载荷带 `marketId + merchantId`——**跨市场不可互解**，同一平台下不同市场的商户
 * 即使拿到对方令牌也进不了对方后台（每次请求还会回库校验商户与账号状态）。
 * 口令按 schema 约定 scrypt(salt, 64B) 分列存储。
 *
 * 令牌骨架在 `auth/mini-token-factory`；issuer、hmac-issuer 派生口径、7 天 TTL、
 * 10 秒时钟容差、载荷字段名（含 `type: 'mp-merchant'`）、`role` 只认 OWNER/STAFF
 * 的归一化与两句失效文案逐字沿用历史实现。口令哈希与本次收口无关，原样留在这里。
 */
export const MP_MERCHANT_ISSUER = 'mp-merchant';

export type MpMerchantRole = 'OWNER' | 'STAFF';

export type MpMerchantTokenPayload = {
  marketId: number;
  merchantId: number;
  userId: number;
  role: MpMerchantRole;
};

const DEFAULT_TTL_SECONDS = 7 * 86400;
const CLOCK_TOLERANCE_SECONDS = 10;
const merchantToken = createMiniToken<MpMerchantTokenPayload>({
  name: '商户',
  issuer: MP_MERCHANT_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: CLOCK_TOLERANCE_SECONDS,
  expiredMessage: '商户登录已过期，请重新登录',
  invalidMessage: '商户登录状态无效，请重新登录',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发商户令牌',
  toClaims: (payload) => ({
    marketId: payload.marketId,
    merchantId: payload.merchantId,
    userId: payload.userId,
    role: payload.role,
    type: 'mp-merchant',
  }),
  fromClaims: (claims) => {
    if (
      claims.type !== 'mp-merchant' ||
      !claims.marketId ||
      !claims.merchantId ||
      !claims.userId
    ) {
      return null;
    }
    return {
      marketId: Number(claims.marketId),
      merchantId: Number(claims.merchantId),
      userId: Number(claims.userId),
      role: claims.role === 'OWNER' ? 'OWNER' : 'STAFF',
    };
  },
});

export function issueMerchantToken(
  payload: MpMerchantTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return merchantToken.issue(payload, ttlSeconds);
}

export function parseMerchantToken(token: string): MpMerchantTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录商户后台');
  }
  return merchantToken.verify(raw);
}

export function hashPassword(password: string): {
  salt: string;
  hash: string;
} {
  const salt = randomBytes(16).toString('hex');
  // 64B → hex 128 字符，正好落 schema 的 VarChar(128)
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(
  password: string,
  salt: string,
  hash: string,
): boolean {
  const expected = Buffer.from(String(hash || ''), 'hex');
  if (!salt || expected.length === 0) return false;
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
