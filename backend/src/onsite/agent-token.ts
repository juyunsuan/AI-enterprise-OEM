import { createMiniToken } from '../auth/mini-token-factory';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 上门服务小程序·代理/业务员/渠道令牌。
 *
 * 与顾客令牌、技师令牌三方物理隔离（独立 issuer + 派生密钥）：代理令牌换不开
 * 顾客或技师接口，反过来也一样。载荷带 `shopId + role + refId`：
 *   1. `role` 决定这张令牌能看哪一类佣金（佣金明细的 `sourceRole`）；
 *   2. `refId` 是业务主体 id（代理 / 业务员 / 渠道），所有读写必须
 *      `shopId + role + refId` 三条件过滤，禁止用请求体里的 id 直接查。
 * 代理没有站内账号也不占顾客身份：绑定只认「店铺码 + 手机号」，
 * 手机号是店主在后台录入的业务联系方式，改号即等于换人。
 *
 * 骨架在 `auth/mini-token-factory`；issuer、hmac-issuer 派生口径、30 天 TTL、
 * 10 秒时钟容差、载荷字段名（含 `type: 'agent'`）、三种 role 的取值校验与
 * 「过期 / 身份失效」两句文案全部逐字沿用历史实现。
 */
export const AGENT_ISSUER = 'private-mini-onsite-agent';

export type AgentRole = 'AGENT' | 'SALESMAN' | 'CHANNEL';

export type AgentTokenPayload = {
  shopId: number;
  role: AgentRole;
  refId: number;
  phone: string;
};

const DEFAULT_TTL_SECONDS = 30 * 86400;
const CLOCK_TOLERANCE_SECONDS = 10;
const AGENT_ROLES: readonly string[] = ['AGENT', 'SALESMAN', 'CHANNEL'];
const agentToken = createMiniToken<AgentTokenPayload>({
  name: '代理',
  issuer: AGENT_ISSUER,
  derive: 'hmac-issuer',
  ttlSeconds: DEFAULT_TTL_SECONDS,
  stripBearer: true,
  clockTolerance: CLOCK_TOLERANCE_SECONDS,
  expiredMessage: '代理登录已过期，请重新绑定身份',
  invalidMessage: '代理身份已失效，请重新绑定手机号',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，无法签发代理令牌',
  toClaims: (payload) => ({
    shopId: payload.shopId,
    role: payload.role,
    refId: payload.refId,
    phone: payload.phone,
    type: 'agent',
  }),
  fromClaims: (claims) => {
    const role = String(claims.role || '');
    if (
      claims.type !== 'agent' ||
      !claims.shopId ||
      !claims.refId ||
      !AGENT_ROLES.includes(role)
    ) {
      return null;
    }
    return {
      shopId: Number(claims.shopId),
      role: role as AgentRole,
      refId: Number(claims.refId),
      phone: String(claims.phone || ''),
    };
  },
});

export function issueAgentToken(
  payload: AgentTokenPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  return agentToken.issue(payload, ttlSeconds);
}

/** 验签取代理身份；异常一律 401 并给出下一步（重新绑定），端上清本地态回绑定页。 */
export function parseAgentToken(token: string): AgentTokenPayload {
  const raw = String(token || '').trim();
  if (!raw) {
    throw new BusinessException(
      ErrorCode.UNAUTHORIZED,
      '请先在代理中心绑定身份（手机号）',
    );
  }
  return agentToken.verify(raw);
}
