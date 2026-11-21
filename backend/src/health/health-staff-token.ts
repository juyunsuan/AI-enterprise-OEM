import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 健康管理小程序·医护令牌。
 *
 * 与顾客令牌（`private-mini-customer`）物理隔离：issuer 与派生密钥都单独一个，
 * 顾客令牌换不开医护接口，医护令牌也进不了顾客态接口。载荷带
 * `shopId + practitionerId + customerId + openid`：
 * - `practitionerId` 是越权判定的一半（所有读写必须 `shopId + practitionerId` 双条件过滤）；
 * - `customerId` 只用于 bind 时确认绑定人仍在本店，不参与后续请求鉴权。
 * 每次请求都会回查医护的审核与在岗状态，停用/驳回立即失效，不依赖令牌过期。
 *
 * 骨架在 `auth/mini-token-factory`；issuer、hmac-issuer 派生口径、30 天 TTL、
 * 10 秒时钟容差、载荷字段名与两句失效文案逐字沿用历史实现。
 * 校验口径也原样保留：历史实现只按 `shopId / practitionerId 是正整数` 判身份可用性
 * （不比对 `type`，比对 type 会让线上早已签出的令牌失配），这里不做"顺手收紧"。
 */
export const HEALTH_STAFF_ISSUER = 'private-mini-health-staff';

export type HealthStaffTokenPayload = {
  shopId: number;
  practitionerId: number;
  customerId: number;
  openid: string;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;
const CLOCK_TOLERANCE_SECONDS = 10;
const healthStaffToken = createMiniToken<HealthStaffTokenPayload>({
  name: '医护',
  issuer: HEALTH_STAFF_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: CLOCK_TOLERANCE_SECONDS,
  expiredMessage: '医护登录已过期，请重新绑定身份',
  invalidMessage: '医护登录状态无效，请重新绑定身份',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发医护令牌',
  toClaims: (payload) => ({
    shopId: payload.shopId,
    practitionerId: payload.practitionerId,
    customerId: payload.customerId,
    openid: payload.openid,
    type: 'health-staff',
  }),
  fromClaims: (claims) => {
    const shopId = Number(claims.shopId);
    const practitionerId = Number(claims.practitionerId);
    if (
      !Number.isInteger(shopId) ||
      shopId <= 0 ||
      !Number.isInteger(practitionerId) ||
      practitionerId <= 0
    ) {
      return null;
    }
    return {
      shopId,
      practitionerId,
      customerId: Number(claims.customerId) || 0,
      openid: String(claims.openid || ''),
    };
  },
});

export function issueHealthStaffToken(
  payload: HealthStaffTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return healthStaffToken.issue(payload, ttlSeconds);
}

export function parseHealthStaffToken(token: string): HealthStaffTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      '请先在医护工作台绑定身份（手机号 + 执业证号）',
    );
  }
  return healthStaffToken.verify(raw);
}
