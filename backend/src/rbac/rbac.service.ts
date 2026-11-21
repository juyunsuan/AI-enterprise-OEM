import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { CurrentUser } from '../auth/current-user';
import {
  RBAC_MODULES,
  RBAC_ROLES,
  RBAC_ROLE_DEFAULT_SCOPES,
  RBAC_SCOPE_KEYS,
} from '@enterprise/contracts';

const MAX_MEMBERS = 20;
const MODULE_NAMES: Record<string, string> = Object.fromEntries(
  RBAC_MODULES.map((item) => [item.key, item.name]),
);

type SaveMemberInput = {
  id?: number;
  name: string;
  username?: string;
  password?: string;
  roleCode: string;
  scopes: string[];
};

/** 主账号专属：子账号本身不能管理成员或查看操作日志。 */
function requireOwner(user: CurrentUser) {
  if (user.isSubAccount()) {
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      '该功能仅主账号可用，子账号无权访问',
    );
  }
}

function normalizeScopes(scopes: string[], roleCode: string) {
  const allowed = new Set<string>(RBAC_SCOPE_KEYS);
  const picked = scopes.filter((key) => allowed.has(key));
  if (picked.length === 0) {
    return (
      RBAC_ROLE_DEFAULT_SCOPES[
        roleCode as keyof typeof RBAC_ROLE_DEFAULT_SCOPES
      ] || []
    );
  }
  return Array.from(new Set(picked));
}

export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  context(user: CurrentUser) {
    return {
      ownerUserId: user.userId,
      isSubAccount: user.isSubAccount(),
      subAccountId: user.subAccountId ?? null,
      subAccountName: user.subAccountName || '',
      roleCode: '',
      scopes: user.isSubAccount() ? (user.scopes ?? []) : null,
    };
  }

  private row(row: {
    id: number;
    name: string;
    roleCode: string;
    scopesJson: unknown;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    accountId: number;
  }) {
    return {
      id: row.id,
      name: row.name,
      roleCode: row.roleCode,
      scopes: Array.isArray(row.scopesJson)
        ? (row.scopesJson as unknown[]).filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      status: row.status,
      lastLoginAt: row.lastLoginAt?.toISOString() || null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async members(user: CurrentUser) {
    requireOwner(user);
    const rows = await this.prisma.subAccount.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'asc' },
    });
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: rows.map((row) => row.accountId) } },
      select: { id: true, username: true },
    });
    const usernames = new Map(accounts.map((item) => [item.id, item.username]));
    return {
      roles: RBAC_ROLES.map((role) => ({
        code: role.code,
        name: role.name,
        desc: role.desc,
        defaultScopes: RBAC_ROLE_DEFAULT_SCOPES[role.code] || [],
      })),
      modules: RBAC_MODULES.map((item) => ({ key: item.key, name: item.name })),
      items: rows.map((row) => ({
        ...this.row(row),
        username: usernames.get(row.accountId) || '',
      })),
    };
  }

  async member(user: CurrentUser, id: number) {
    requireOwner(user);
    const row = await this.findOwned(user, id);
    const account = await this.prisma.account.findUnique({
      where: { id: row.accountId },
      select: { username: true },
    });
    return { ...this.row(row), username: account?.username || '' };
  }

  private async findOwned(user: CurrentUser, id: number) {
    const row = await this.prisma.subAccount.findUnique({ where: { id } });
    if (!row || row.ownerUserId !== user.userId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '子账号不存在');
    }
    return row;
  }

  async saveMember(user: CurrentUser, input: SaveMemberInput) {
    requireOwner(user);
    const name = input.name.trim();
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写成员姓名');
    }
    if (!RBAC_ROLES.some((role) => role.code === input.roleCode)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '角色不合法');
    }
    const scopes = normalizeScopes(input.scopes, input.roleCode);
    if (input.id) {
      const row = await this.findOwned(user, input.id);
      const data: Record<string, unknown> = {
        name,
        roleCode: input.roleCode,
        scopesJson: scopes,
      };
      if (input.password) {
        this.assertPassword(input.password);
        await this.prisma.account.update({
          where: { id: row.accountId },
          data: {
            passwordHash: await bcrypt.hash(input.password, 10),
            tokenVersion: { increment: 1 },
          },
        });
      }
      const updated = await this.prisma.subAccount.update({
        where: { id: row.id },
        data,
      });
      const account = await this.prisma.account.findUnique({
        where: { id: updated.accountId },
        select: { username: true },
      });
      return { ...this.row(updated), username: account?.username || '' };
    }
    const username = (input.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,64}$/.test(username)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '登录名需为 3-64 位字母、数字或 _ . -',
      );
    }
    if (!input.password) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请设置初始密码');
    }
    this.assertPassword(input.password);
    const count = await this.prisma.subAccount.count({
      where: { ownerUserId: user.userId },
    });
    if (count >= MAX_MEMBERS) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `子账号数量已达上限（${MAX_MEMBERS} 个）`,
      );
    }
    const clash = await this.prisma.account.findFirst({
      where: {
        OR: [{ username }, { email: username }, { phone: username }],
      },
      select: { id: true },
    });
    if (clash) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该登录名已被占用，请换一个',
      );
    }
    const account = await this.prisma.account.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: 'USER',
      },
    });
    const row = await this.prisma.subAccount.create({
      data: {
        ownerUserId: user.userId,
        accountId: account.id,
        name,
        roleCode: input.roleCode,
        scopesJson: scopes,
        createdBy: user.userId,
      },
    });
    return { ...this.row(row), username: account.username };
  }

  async setStatus(
    user: CurrentUser,
    id: number,
    status: 'ACTIVE' | 'DISABLED',
  ) {
    requireOwner(user);
    const row = await this.findOwned(user, id);
    const updated = await this.prisma.subAccount.update({
      where: { id: row.id },
      data: { status },
    });
    if (status === 'DISABLED') {
      // 停用后旧会话即时作废（下次请求即 401）。
      await this.prisma.account.update({
        where: { id: row.accountId },
        data: { tokenVersion: { increment: 1 } },
      });
    }
    return { id: updated.id, status: updated.status };
  }

  async removeMember(user: CurrentUser, id: number) {
    requireOwner(user);
    const row = await this.findOwned(user, id);
    await this.prisma.subAccount.delete({ where: { id: row.id } });
    await this.prisma.account.update({
      where: { id: row.accountId },
      data: { status: 'BANNED', banReason: '子账号已被主账号删除' },
    });
    return { removed: true };
  }

  async operationLogs(
    user: CurrentUser,
    filters: {
      module?: string;
      actorUserId?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    requireOwner(user);
    const page = Math.max(filters.page || 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize || 20, 1), 100);
    const where = {
      ownerUserId: user.userId,
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenantOperationLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenantOperationLog.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        subAccountId: row.subAccountId,
        module: row.module,
        moduleName:
          MODULE_NAMES[row.module] || (row.module ? row.module : '其他'),
        action: row.action,
        method: row.method,
        path: row.path,
        status: row.status,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 写操作留痕（守卫内调用；失败不影响业务）。 */
  async record(
    user: CurrentUser,
    method: string,
    path: string,
    module: string,
    status: 'OK' | 'DENIED',
    ip: string,
  ) {
    await this.prisma.tenantOperationLog.create({
      data: {
        ownerUserId: user.userId,
        actorUserId: user.actorUserId,
        actorName: user.subAccountName || user.username,
        subAccountId: user.subAccountId ?? null,
        module,
        action: method,
        method,
        path: path.slice(0, 200),
        status,
        ip: ip.slice(0, 64),
      },
    });
  }

  private assertPassword(password: string) {
    if (password.length < 8 || password.length > 64) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '密码长度需为 8-64 位',
      );
    }
  }
}
