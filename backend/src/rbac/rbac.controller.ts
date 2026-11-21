import { safeText } from '../common/safe-text';
import { parseId } from '../common/parse-id';
import { CurrentUser } from '../auth/current-user';
import { RbacService } from './rbac.service';

/** 子账号与操作日志；方法名与契约 `Rbac_` 后缀一一对应。 */
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  context(user: CurrentUser) {
    return this.rbac.context(user);
  }

  async members(user: CurrentUser) {
    return this.rbac.members(user);
  }

  async member(user: CurrentUser, id: string) {
    return this.rbac.member(user, parseId(id));
  }

  async saveMember(user: CurrentUser, body: Record<string, unknown>) {
    return this.rbac.saveMember(user, {
      id: body.id === undefined ? undefined : Number(body.id),
      name: safeText(body.name),
      username: safeText(body.username) || undefined,
      password: safeText(body.password) || undefined,
      roleCode: safeText(body.roleCode) || 'VIEWER',
      scopes: Array.isArray(body.scopes)
        ? body.scopes.filter((item): item is string => typeof item === 'string')
        : [],
    });
  }

  async setMemberStatus(
    user: CurrentUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    return this.rbac.setStatus(
      user,
      parseId(id),
      body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    );
  }

  async removeMember(user: CurrentUser, id: string) {
    return this.rbac.removeMember(user, parseId(id));
  }

  async operationLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.rbac.operationLogs(user, {
      module: safeText(query.module) || undefined,
      actorUserId: safeText(query.actorUserId) || undefined,
      status: safeText(query.status) || undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
  }
}
