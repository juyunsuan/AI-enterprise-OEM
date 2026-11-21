import type { Context, MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../http/types';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RBAC_MODULES } from '@enterprise/contracts';
import type { RbacService } from './rbac.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 子账号一律不可访问的主账号专属前缀（人员管理、平台后台）。 */
const OWNER_ONLY_PREFIXES = ['/enterprise/rbac/', '/enterprise/admin/'];

const canonical = (path: string) => path.replace(/^\/api\/backend(?=\/|$)/, '');

/** 按最长前缀匹配业务模块；未登记的路径返回 null（不做模块级限制）。 */
export function moduleOfPath(path: string) {
  let best: { key: string; name: string } | null = null;
  let bestLength = 0;
  for (const module of RBAC_MODULES) {
    for (const prefix of module.prefixes) {
      if (path.startsWith(prefix) && prefix.length > bestLength) {
        best = { key: module.key, name: module.name };
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

const clientIp = (c: { req: { header(name: string): string | undefined } }) =>
  (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);

/**
 * 子账号模块守卫 + 租户写操作留痕：鉴权之后、业务路由之前。
 * 主账号不受模块限制；子账号超出授权范围的请求直接 403 并留痕。
 */
export function rbacMiddleware(rbac: RbacService): MiddlewareHandler<ApiEnv> {
  return async (c: Context<ApiEnv>, next) => {
    const user = c.get('user');
    if (!user) return next();
    const path = canonical(c.req.path);
    const method = c.req.method.toUpperCase();
    const isWrite = WRITE_METHODS.has(method);
    const module = moduleOfPath(path);
    const ownerOnly = OWNER_ONLY_PREFIXES.some((prefix) =>
      path.startsWith(prefix),
    );

    if (user.isSubAccount()) {
      if (ownerOnly) {
        if (isWrite) {
          void rbac
            .record(
              user,
              method,
              path,
              module?.key || '',
              'DENIED',
              clientIp(c),
            )
            .catch(() => undefined);
        }
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '该功能仅主账号可用，子账号无权访问',
        );
      }
      if (module && !(user.scopes || []).includes(module.key)) {
        if (isWrite) {
          void rbac
            .record(user, method, path, module.key, 'DENIED', clientIp(c))
            .catch(() => undefined);
        }
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          `子账号未被授权访问「${module.name}」，请联系主账号开通`,
        );
      }
    }

    await next();

    if (!isWrite || ownerOnly || !module) return;
    if (c.res.status >= 400) return;
    void rbac
      .record(user, method, path, module.key, 'OK', clientIp(c))
      .catch(() => undefined);
  };
}
