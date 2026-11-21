import { createMiniToken } from '../auth/mini-token-factory';

/**
 * 知识付费云课堂「终端会员」令牌：与平台账号会话彻底分离。
 * 会员只是站点方的私域用户，不应拿到本站 SSO 会话，所以单独签发 HS256 JWT，90 天有效。
 *
 * 派生上下文串 `oem-knowledge-pay-member`、issuer、TTL 与载荷字段名都沿用历史值；
 * 签名、过期与错误语义交给 `auth/mini-token-factory`，不再各端养一份。
 */
export const KP_MEMBER_ISSUER = 'kp-member';

const memberToken = createMiniToken<{ memberId: number; siteId: number }>({
  name: '知识付费会员',
  issuer: KP_MEMBER_ISSUER,
  derive: 'sha256-concat',
  context: 'oem-knowledge-pay-member',
  ttlSeconds: 90 * 86_400,
  stripBearer: true,
  expiredMessage: '登录已过期，请重新进入小程序',
  toClaims: (payload) => ({
    mid: payload.memberId,
    sid: payload.siteId,
    type: 'kp-member',
  }),
  fromClaims: (claims) =>
    'mid' in claims && 'sid' in claims
      ? { memberId: Number(claims.mid), siteId: Number(claims.sid) }
      : null,
});

export function issueMemberToken(payload: {
  memberId: number;
  siteId: number;
}): string {
  return memberToken.issue(payload);
}

export function verifyMemberToken(token: string): {
  memberId: number;
  siteId: number;
} {
  return memberToken.verify(token);
}
