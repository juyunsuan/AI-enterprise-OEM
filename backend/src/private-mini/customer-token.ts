import type { PrivateMiniScene } from '@enterprise/contracts';
import { PRIVATE_MINI_SCENES } from '@enterprise/contracts';
import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 建站管理·C 端顾客令牌。
 *
 * 与站内会话（`issueSsoSession`）物理隔离：签发密钥按 issuer 派生、issuer 单独一个，
 * 所以顾客令牌进不了 `/enterprise/**` 任何站内接口，站内令牌也不会被当成顾客身份。
 * 载荷只带 `scene + shopId + customerId`，越权判定由业务侧按这三个值做双条件过滤。
 *
 * 签名与验签骨架在 `auth/mini-token-factory`；issuer（`private-mini-customer`）、
 * 派生口径（hmac-issuer）、30 天 TTL、载荷字段名（scene/shopId/customerId/openid/type）
 * 与两句失效文案全部沿用历史值——动任何一个都会把线上七个场景已签出的顾客集体踢下线。
 *
 * `scenes` 取契约里的全部 `PRIVATE_MINI_SCENES`：验签时场景不在白名单直接拒，
 * 这样「共用 issuer、越权判定交给业务层双条件过滤」这条约定升级成代码约束
 * （业务层的 `scene === XXX_SCENE` 判断照旧保留，两层都在）。
 */
export const CUSTOMER_ISSUER = 'private-mini-customer';

export type CustomerTokenPayload = {
  scene: PrivateMiniScene;
  shopId: number;
  customerId: number;
  openid: string;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;
const CLOCK_TOLERANCE_SECONDS = 10;
const customerToken = createMiniToken<CustomerTokenPayload>({
  name: '顾客',
  issuer: CUSTOMER_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: CLOCK_TOLERANCE_SECONDS,
  expiredMessage: '登录已过期，请重新进入小程序',
  invalidMessage: '登录状态无效，请重新进入小程序',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发顾客令牌',
  scenes: PRIVATE_MINI_SCENES,
  sceneOf: (payload) => payload.scene,
  toClaims: (payload) => ({
    scene: payload.scene,
    shopId: payload.shopId,
    customerId: payload.customerId,
    openid: payload.openid,
    type: 'customer',
  }),
  fromClaims: (claims) => {
    if (
      claims.type !== 'customer' ||
      !claims.scene ||
      !claims.shopId ||
      !claims.customerId
    ) {
      return null;
    }
    return {
      scene: String(claims.scene) as PrivateMiniScene,
      shopId: Number(claims.shopId),
      customerId: Number(claims.customerId),
      openid: String(claims.openid || ''),
    };
  },
});

export function issueCustomerToken(
  payload: CustomerTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return customerToken.issue(payload, ttlSeconds);
}

/** 验签取顾客身份；任何异常一律 401，让小程序端走静默重登。 */
export function parseCustomerToken(token: string): CustomerTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
  }
  return customerToken.verify(raw);
}
