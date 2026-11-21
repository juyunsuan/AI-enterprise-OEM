import { createMiniToken } from '../auth/mini-token-factory';

/**
 * 数字人小程序「终端会员」令牌：与平台账号会话彻底分离（同 kp-member 口径）。
 * 会员是站点方私域用户，只拿得到 `/api/public/digital-human/*`，进不了 `/enterprise/**`。
 *
 * 骨架在 `auth/mini-token-factory`；issuer、派生上下文串、TTL 与载荷字段名（mid/sid/type）
 * 全部沿用历史值——动任何一个都会把线上已签出的会员令牌作废，顾客会被集体踢下线。
 */
export const DH_MEMBER_ISSUER = 'dh-member';

const memberToken = createMiniToken<{ memberId: number; siteId: number }>({
  name: '数字人会员',
  issuer: DH_MEMBER_ISSUER,
  derive: 'sha256-concat',
  context: 'oem-digital-human-member',
  ttlSeconds: 90 * 86_400,
  stripBearer: true,
  expiredMessage: '登录已过期，请重新进入小程序',
  toClaims: (payload) => ({
    mid: payload.memberId,
    sid: payload.siteId,
    type: 'dh-member',
  }),
  fromClaims: (claims) =>
    'mid' in claims && 'sid' in claims
      ? { memberId: Number(claims.mid), siteId: Number(claims.sid) }
      : null,
});

export function issueDhMemberToken(payload: {
  memberId: number;
  siteId: number;
}): string {
  return memberToken.issue(payload);
}

export function verifyDhMemberToken(token: string): {
  memberId: number;
  siteId: number;
} {
  return memberToken.verify(token);
}
