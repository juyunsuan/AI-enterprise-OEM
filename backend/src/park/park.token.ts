import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 园区员工令牌：独立 issuer + 固定场景 PARK，与其它小程序员工/顾客令牌物理隔离。
 *
 * 载荷只带 parkId + staffId；园区端所有员工态读写必须按 parkId + staffId 双条件过滤。
 */
export const PARK_STAFF_ISSUER = 'private-mini-park-staff';

export type ParkStaffTokenPayload = {
  scene: 'PARK';
  parkId: number;
  staffId: number;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;

const staffToken = createMiniToken<ParkStaffTokenPayload>({
  name: '园区员工',
  issuer: PARK_STAFF_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: 10,
  scenes: ['PARK'],
  sceneOf: (payload) => payload.scene,
  expiredMessage: '员工登录已过期，请重新绑定身份',
  invalidMessage: '员工身份已失效，请重新绑定（手机号 + 工号）',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发园区员工令牌',
  toClaims: (payload) => ({
    scene: payload.scene,
    parkId: payload.parkId,
    staffId: payload.staffId,
    type: 'park-staff',
  }),
  fromClaims: (claims) => {
    if (
      claims.type !== 'park-staff' ||
      claims.scene !== 'PARK' ||
      !claims.parkId ||
      !claims.staffId
    ) {
      return null;
    }
    return {
      scene: 'PARK',
      parkId: Number(claims.parkId),
      staffId: Number(claims.staffId),
    };
  },
});

export function issueParkStaffToken(
  payload: ParkStaffTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return staffToken.issue(payload, ttlSeconds);
}

export function parseParkStaffToken(token: string): ParkStaffTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      '请先绑定园区员工身份（手机号 + 工号）',
    );
  }
  return staffToken.verify(raw);
}
