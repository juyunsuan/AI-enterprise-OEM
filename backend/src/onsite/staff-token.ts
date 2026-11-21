import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 上门服务小程序·技师令牌。
 *
 * 与顾客令牌（`customer-token.ts`）同构但物理隔离：issuer 与派生密钥都单独一个，
 * 所以顾客令牌换不开技师接口、技师令牌也进不了站内任何会话。载荷带
 * `shopId + staffId + customerId + openid`：`staffId` 是越权判定的一半（所有读写
 * 必须 `shopId + staffId` 双条件过滤），`customerId` 只用于 bind 时确认
 * 「绑定人仍是本店有效顾客」这条身份链，不参与后续请求鉴权。
 * 令牌只在 bind 成功时签发一次，任何 GET 接口永不回传令牌。
 *
 * 骨架在 `auth/mini-token-factory`；issuer、hmac-issuer 派生口径、30 天 TTL、
 * 10 秒时钟容差、载荷字段名（含 `type: 'staff'`）与「过期 / 身份失效」两句文案
 * 全部逐字沿用历史实现。
 */
export const STAFF_ISSUER = 'private-mini-onsite-staff';

export type StaffTokenPayload = {
  shopId: number;
  staffId: number;
  customerId: number;
  openid: string;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;
const CLOCK_TOLERANCE_SECONDS = 10;
const staffToken = createMiniToken<StaffTokenPayload>({
  name: '技师',
  issuer: STAFF_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: CLOCK_TOLERANCE_SECONDS,
  expiredMessage: '技师登录已过期，请重新绑定身份',
  invalidMessage: '技师身份已失效，请重新绑定（手机号 + 工号）',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发技师令牌',
  toClaims: (payload) => ({
    shopId: payload.shopId,
    staffId: payload.staffId,
    customerId: payload.customerId,
    openid: payload.openid,
    type: 'staff',
  }),
  fromClaims: (claims) => {
    if (claims.type !== 'staff' || !claims.shopId || !claims.staffId) {
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

export function issueStaffToken(
  payload: StaffTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return staffToken.issue(payload, ttlSeconds);
}

/**
 * 验签取技师身份；任何异常一律 401 且文案给下一步动作（重新绑定），
 * 让小程序端清掉本地令牌回到绑定页，而不是停留在「刷新试试」。
 */
export function parseStaffToken(token: string): StaffTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      '请先在技师中心绑定身份（手机号 + 工号）',
    );
  }
  return staffToken.verify(raw);
}
