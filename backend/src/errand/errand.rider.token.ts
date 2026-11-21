import { createMiniToken } from '../auth/mini-token-factory';
import { ERRAND_SCENE } from './errand.shared';

/**
 * 跑腿骑手令牌：与顾客令牌分属不同 issuer，即使载荷形状接近也不会被对方通道当成顾客身份。
 * 载荷只有 scene + shopId + riderId，越权判定由业务层按 (riderId, shopId) 双条件过滤。
 */
export type ErrandRiderTokenPayload = {
  scene: typeof ERRAND_SCENE;
  shopId: number;
  riderId: number;
};

const riderToken = createMiniToken<ErrandRiderTokenPayload>({
  name: '骑手',
  issuer: 'private-mini-errand-rider',
  derive: 'hmac-issuer',
  ttlSeconds: 30 * 86400,
  stripBearer: true,
  clockTolerance: 10,
  expiredMessage: '骑手登录已过期，请重新进入小程序',
  invalidMessage: '骑手登录状态无效，请重新进入小程序',
  unconfiguredMessage:
    '服务端未配置 JWT_SECRET，骑手登录暂不可用，请联系平台管理员',
  scenes: [ERRAND_SCENE],
  sceneOf: (payload) => payload.scene,
  toClaims: (payload) => ({
    scene: payload.scene,
    shopId: payload.shopId,
    riderId: payload.riderId,
    type: 'errand-rider',
  }),
  fromClaims: (claims) => {
    if (claims.type !== 'errand-rider' || !claims.shopId || !claims.riderId)
      return null;
    return {
      scene: ERRAND_SCENE,
      shopId: Number(claims.shopId),
      riderId: Number(claims.riderId),
    };
  },
});

export function issueRiderToken(payload: ErrandRiderTokenPayload): string {
  return riderToken.issue(payload);
}

export function parseRiderToken(token: string): ErrandRiderTokenPayload {
  return riderToken.verify(String(token || ''));
}
