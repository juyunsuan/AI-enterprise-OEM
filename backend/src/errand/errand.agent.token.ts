import { createMiniToken } from '../auth/mini-token-factory';
import { ERRAND_SCENE } from './errand.shared';

/** 代理令牌：独立 issuer，只用于代理后台，不进平台站内接口。 */
export type ErrandAgentTokenPayload = {
  scene: typeof ERRAND_SCENE;
  siteId: number;
  agentId: number;
};

const agentToken = createMiniToken<ErrandAgentTokenPayload>({
  name: '代理',
  issuer: 'private-mini-errand-agent',
  derive: 'hmac-issuer',
  ttlSeconds: 7 * 86400,
  stripBearer: true,
  clockTolerance: 10,
  expiredMessage: '代理登录已过期，请重新登录',
  invalidMessage: '代理登录状态无效，请重新登录',
  unconfiguredMessage: '服务端未配置 JWT_SECRET，代理登录暂不可用',
  scenes: [ERRAND_SCENE],
  sceneOf: (payload) => payload.scene,
  toClaims: (payload) => ({
    scene: payload.scene,
    siteId: payload.siteId,
    agentId: payload.agentId,
    type: 'errand-agent',
  }),
  fromClaims: (claims) => {
    if (claims.type !== 'errand-agent' || !claims.siteId || !claims.agentId)
      return null;
    return {
      scene: ERRAND_SCENE,
      siteId: Number(claims.siteId),
      agentId: Number(claims.agentId),
    };
  },
});

export function issueAgentToken(payload: ErrandAgentTokenPayload): string {
  return agentToken.issue(payload);
}

export function parseAgentToken(token: string): ErrandAgentTokenPayload {
  return agentToken.verify(String(token || ''));
}
