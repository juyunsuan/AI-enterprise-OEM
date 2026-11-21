import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 租赁小程序·员工令牌。
 *
 * 与顾客令牌同构但物理隔离：issuer 单独一个，载荷带 shopId + staffId，
 * 所有员工端读写必须按 shopId + staffId 双条件过滤。后台管理员仍走站内会话与 RBAC。
 */
export const RENTAL_STAFF_ISSUER = 'private-mini-rental-staff';

export type RentalStaffTokenPayload = {
  shopId: number;
  staffId: number;
  customerId: number;
  openid: string;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;

const staffToken = createMiniToken<RentalStaffTokenPayload>({
  name: '员工',
  issuer: RENTAL_STAFF_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: 10,
  expiredMessage: '员工登录已过期，请重新绑定身份',
  invalidMessage: '员工身份已失效，请重新绑定（手机号 + 工号）',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发员工令牌',
  toClaims: (payload) => ({
    shopId: payload.shopId,
    staffId: payload.staffId,
    customerId: payload.customerId,
    openid: payload.openid,
    type: 'rental-staff',
  }),
  fromClaims: (claims) => {
    if (claims.type !== 'rental-staff' || !claims.shopId || !claims.staffId) {
      return null;
    }
    return {
      shopId: Number(claims.shopId),
      staffId: Number(claims.staffId),
      customerId: Number(claims.customerId) || 0,
      openid: String(claims.openid || ''),
    };
  },
});

export function issueRentalStaffToken(
  payload: RentalStaffTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return staffToken.issue(payload, ttlSeconds);
}

export function parseRentalStaffToken(token: string): RentalStaffTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      '请先在员工中心绑定身份（手机号 + 工号）',
    );
  }
  return staffToken.verify(raw);
}
