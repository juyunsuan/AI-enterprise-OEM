import { Prisma } from '../../generated/prisma';
import { LIST_ALL_LIMIT, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { CurrentUser } from '../auth/current-user';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiCallCrypto } from './ai-call-crypto';

export const AI_CALL_STATUSES = ['active', 'disabled'] as const;
export type AiCallPrincipalKind = 'DESKTOP' | 'MOBOT' | 'WORKBUDDY';
export const AI_CALL_PRINCIPAL_KINDS: readonly AiCallPrincipalKind[] = [
  'DESKTOP',
  'MOBOT',
  'WORKBUDDY',
];

/**
 * 「其他字段」在库里和接口里都是明文，所以键名一旦像凭据就得拦下来，
 * 逼用户把口令改填进会加密、且不回显的专用字段。
 */
const SECRET_LIKE_EXTRA_KEY =
  /(pass(word)?|passwd|pwd|token|secret|cookie|api[-_]?key|access[-_]?key|private[-_]?key|credential)/i;

/**
 * AI 调用账号：AI 自动化任务要登录第三方平台时来这里取凭据。
 *
 * 凭据（口令 / API Key / Cookie）只存密文，界面与列表一律只回「存过没有」；
 * 明文只在机器通道读取时解密一次并记审计。
 *
 * 取用按「Agent 绑定」放行：每条凭据绑定到若干设备主体（BotBuddy 主机 / MoBot 手机 /
 * WorkBuddy 企业账号，设备粒度，设备内的细分 Agent 不再单独管理）。客户端带着自己的
 * 主体类型 + 设备 ID 来取，只拿得到绑定给该设备的凭据；未绑定的取不到。
 */
export class AiCallAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly crypto: AiCallCrypto,
  ) {}

  async list(user: CurrentUser, query: { keyword?: string }) {
    const keyword = text(query.keyword).trim();
    const rows = await this.prisma.aiCallAccount.findMany({
      where: {
        createdBy: user.userId,
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword } },
                { platform: { contains: keyword } },
                { username: { contains: keyword } },
              ],
            }
          : {}),
      },
      include: { bindings: true },
      orderBy: { updatedAt: 'desc' },
      // 界面侧没有分页参数：一次读取封顶（与 pageQuery 上限一致）
      take: LIST_ALL_LIMIT + 1,
    });
    const truncated = rows.length > LIST_ALL_LIMIT;
    const visible = truncated ? rows.slice(0, LIST_ALL_LIMIT) : rows;
    const names = await this.principalNames(visible);
    return visible.map((row) => this.decorate(row, names));
  }

  async get(user: CurrentUser, id: number) {
    const row = await this.loadOwned(user, id);
    const names = await this.principalNames([row]);
    return this.decorate(row, names);
  }

  async create(user: CurrentUser, body: Record<string, unknown>) {
    const name = text(body.name).trim().slice(0, 128);
    if (!name) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请给这个账号起个名字（如「淘宝-运营店」）',
      );
    }
    const platform = text(body.platform).trim();
    if (!platform) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写平台名称或站点地址',
      );
    }
    const username = text(body.username).trim();
    const password = text(body.password);
    const apiKey = text(body.apiKey).trim();
    const cookie = text(body.cookie).trim();
    if (!password && !apiKey && !cookie) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '至少要填一种凭据：登录口令 / API Key / Cookie',
      );
    }
    const extra = this.readExtra(body.extra);
    const row = await this.prisma.aiCallAccount.create({
      data: {
        createdBy: user.userId,
        name,
        platform: platform.slice(0, 191),
        loginUrl: text(body.loginUrl).trim().slice(0, 500),
        username: username.slice(0, 191),
        passwordCipher: password ? this.crypto.encrypt(password) : '',
        apiKeyCipher: apiKey ? this.crypto.encrypt(apiKey) : '',
        cookieCipher: cookie ? this.crypto.encrypt(cookie) : '',
        extra,
        status: this.normalizeStatus(body.status, 'active'),
        notes: text(body.notes).trim().slice(0, 500),
      },
      include: { bindings: true },
    });
    await this.identity.audit(
      user.userId,
      'AI调用登记账号',
      `#${row.id} ${row.platform}/${row.name}`,
    );
    const names = await this.principalNames([row]);
    return this.decorate(row, names);
  }

  async update(user: CurrentUser, id: number, body: Record<string, unknown>) {
    const row = await this.loadOwned(user, id);
    const data: Prisma.AiCallAccountUpdateInput = {};
    if (body.name !== undefined) {
      const name = text(body.name).trim().slice(0, 128);
      if (!name) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '名称不能为空');
      }
      data.name = name;
    }
    if (body.platform !== undefined) {
      const platform = text(body.platform).trim();
      if (!platform) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '平台名称不能为空');
      }
      data.platform = platform.slice(0, 191);
    }
    if (body.loginUrl !== undefined) {
      data.loginUrl = text(body.loginUrl).trim().slice(0, 500);
    }
    if (body.username !== undefined) {
      data.username = text(body.username).trim().slice(0, 191);
    }
    // 凭据留空＝不动已存密文（界面不回显旧值）
    const password = text(body.password);
    if (password) data.passwordCipher = this.crypto.encrypt(password);
    const apiKey = text(body.apiKey).trim();
    if (apiKey) data.apiKeyCipher = this.crypto.encrypt(apiKey);
    const cookie = text(body.cookie).trim();
    if (cookie) data.cookieCipher = this.crypto.encrypt(cookie);
    if (body.extra !== undefined) {
      data.extra = this.readExtra(body.extra);
    }
    if (body.status !== undefined) {
      data.status = this.normalizeStatus(body.status, row.status);
    }
    if (body.notes !== undefined) {
      data.notes = text(body.notes).trim().slice(0, 500);
    }
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的修改');
    }
    await this.prisma.aiCallAccount.update({ where: { id }, data });
    await this.identity.audit(
      user.userId,
      'AI调用修改账号',
      `#${id} ${row.platform}/${row.name}`,
    );
    return this.get(user, id);
  }

  async remove(user: CurrentUser, id: number) {
    const row = await this.loadOwned(user, id);
    await this.prisma.aiCallAccount.delete({ where: { id } });
    await this.identity.audit(
      user.userId,
      'AI调用删除账号',
      `#${id} ${row.platform}/${row.name}`,
    );
    return { id };
  }

  /** 「Agent 绑定账号」页签：查某台设备已绑定的凭据库账号 id。 */
  async bindings(
    user: CurrentUser,
    kind: AiCallPrincipalKind,
    principalId: number,
  ) {
    await this.loadPrincipal(user, kind, principalId);
    const rows = await this.prisma.aiCallAccountBinding.findMany({
      where: { principalKind: kind, principalId },
      select: { accountId: true },
      orderBy: { accountId: 'asc' },
    });
    return { accountIds: rows.map((row) => row.accountId) };
  }

  /** 整组替换某台设备绑定的 AI 调用账号清单（空数组＝全部解绑）。 */
  async saveBindings(
    user: CurrentUser,
    kind: AiCallPrincipalKind,
    principalId: number,
    accountIds: number[],
  ) {
    await this.loadPrincipal(user, kind, principalId);
    const ids = [...new Set(accountIds)].filter(
      (item) => Number.isInteger(item) && item > 0,
    );
    if (ids.length) {
      const owned = await this.prisma.aiCallAccount.count({
        where: { id: { in: ids }, createdBy: user.userId },
      });
      if (owned !== ids.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '有 AI 调用账号不存在或不属于当前账号',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.aiCallAccountBinding.deleteMany({
        where: { principalKind: kind, principalId },
      });
      if (ids.length) {
        await tx.aiCallAccountBinding.createMany({
          data: ids.map((accountId) => ({
            accountId,
            principalKind: kind,
            principalId,
          })),
        });
      }
    });
    const principal = await this.loadPrincipal(user, kind, principalId);
    await this.identity.audit(
      user.userId,
      'AI调用绑定账号',
      `Agent ${principal.kind}/${principal.name} → ${ids.length} 个`,
    );
    return { accountIds: ids };
  }

  /**
   * 凭据侧的绑定：整组替换某个 AI 调用账号授权给的 Agent 清单（一份凭据可同时给多台设备用）。
   * 与 saveBindings 写同一张表，方向相反；空数组＝全部解绑。
   */
  async saveAgents(
    user: CurrentUser,
    accountId: number,
    bindings: { kind: AiCallPrincipalKind; principalId: number }[],
  ) {
    const row = await this.loadOwned(user, accountId);
    const wanted = new Map<
      string,
      { kind: AiCallPrincipalKind; principalId: number }
    >();
    for (const item of bindings) {
      if (!AI_CALL_PRINCIPAL_KINDS.includes(item.kind)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          'Agent 类型只能是 DESKTOP / MOBOT / WORKBUDDY',
        );
      }
      if (!Number.isInteger(item.principalId) || item.principalId <= 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          'Agent ID 必须是正整数',
        );
      }
      wanted.set(`${item.kind}:${item.principalId}`, {
        kind: item.kind,
        principalId: item.principalId,
      });
    }
    // 逐台校验归属：绑给别人的设备等于把凭据送到他人 Agent 的取用列表里，必须拦下。
    const principals: { kind: AiCallPrincipalKind; principalId: number }[] = [];
    for (const item of wanted.values()) {
      await this.loadPrincipal(user, item.kind, item.principalId);
      principals.push(item);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.aiCallAccountBinding.deleteMany({ where: { accountId } });
      if (principals.length) {
        await tx.aiCallAccountBinding.createMany({
          data: principals.map((item) => ({
            accountId,
            principalKind: item.kind,
            principalId: item.principalId,
          })),
        });
      }
    });
    await this.identity.audit(
      user.userId,
      'AI调用绑定账号',
      `#${accountId} ${row.platform}/${row.name} → ${principals.length} 台 Agent`,
    );
    return this.get(user, accountId);
  }

  /** 机器通道：按设备主体列已绑定且启用的账号（不含任何明文凭据）。 */
  async openList(
    user: CurrentUser,
    kind: AiCallPrincipalKind,
    principalId: number,
    platform?: string,
  ) {
    const principal = await this.loadPrincipal(user, kind, principalId, true);
    const keyword = text(platform).trim();
    const bindings = await this.prisma.aiCallAccountBinding.findMany({
      where: { principalKind: principal.kind, principalId: principal.id },
      select: { accountId: true },
      take: LIST_ALL_LIMIT + 1,
    });
    const accountIds = bindings.map((row) => row.accountId);
    if (!accountIds.length) return [];
    const rows = await this.prisma.aiCallAccount.findMany({
      where: {
        createdBy: user.userId,
        status: 'active',
        id: { in: accountIds },
        ...(keyword ? { platform: { contains: keyword } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: LIST_ALL_LIMIT + 1,
    });
    const truncated = rows.length > LIST_ALL_LIMIT;
    const visible = truncated ? rows.slice(0, LIST_ALL_LIMIT) : rows;
    // 机器通道只拿凭据行本体：绑给了哪些其它 Agent 是站内界面的事，不出站。
    return visible.map((row) => this.decorate(row, undefined, false));
  }

  /**
   * 机器通道：解密一次给 AI 任务用。
   * 必须同时满足：账号归本人、AI 账号启用、设备主体归本人且启用、且已绑定该主体。
   */
  async openCredentials(
    user: CurrentUser,
    id: number,
    kind: AiCallPrincipalKind,
    principalId: number,
  ) {
    const principal = await this.loadPrincipal(user, kind, principalId, true);
    const row = await this.loadOwned(user, id);
    if (row.status !== 'active') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '这个 AI 调用账号已停用，请先在「AI 调用账号」里启用',
      );
    }
    const binding = await this.prisma.aiCallAccountBinding.findUnique({
      where: {
        accountId_principalKind_principalId: {
          accountId: id,
          principalKind: principal.kind,
          principalId: principal.id,
        },
      },
    });
    if (!binding) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        `这个 AI 调用账号没有绑定当前 Agent（${principal.kind} #${principal.id}）`,
      );
    }
    await this.identity.audit(
      user.userId,
      'AI调用读取凭据',
      `#${id} ${row.platform}/${row.name}（Agent ${principal.name}）`,
    );
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      loginUrl: row.loginUrl,
      username: row.username,
      password: this.decrypt(row.passwordCipher),
      apiKey: this.decrypt(row.apiKeyCipher),
      cookie: this.decrypt(row.cookieCipher),
      extra: row.extra ?? {},
    };
  }

  private decrypt(sealed: string) {
    return sealed ? this.crypto.decrypt(sealed) : '';
  }

  private async loadOwned(user: CurrentUser, id: number) {
    const row = await this.prisma.aiCallAccount.findUnique({
      where: { id },
      include: { bindings: true },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'AI 调用账号不存在');
    }
    if (row.createdBy !== user.userId) {
      throw new BusinessException(
        ErrorCode.ROLE_MISMATCH,
        '该 AI 调用账号归他人所有',
      );
    }
    return row;
  }

  /**
   * 设备主体（Agent 绑定与机器通道取用的锚点）：主机 / 手机查 workbuddy_hosts
   * （clientKind 必须与 kind 一致），WorkBuddy 企业账号查 workbuddy_accounts；
   * 一律要求归本人。requireActive＝机器通道额外要求启用中。
   */
  private async loadPrincipal(
    user: CurrentUser,
    kind: AiCallPrincipalKind,
    principalId: number,
    requireActive = false,
  ): Promise<{ id: number; kind: AiCallPrincipalKind; name: string }> {
    if (kind === 'WORKBUDDY') {
      const row = await this.prisma.workbuddyAccount.findUnique({
        where: { id: principalId },
        select: { id: true, name: true, createdBy: true, status: true },
      });
      if (!row || row.createdBy !== user.userId) {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          'WorkBuddy 企业账号不存在',
        );
      }
      if (requireActive && row.status !== 'active') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `WorkBuddy 企业账号「${row.name}」已停用，请先启用`,
        );
      }
      return { id: row.id, kind, name: row.name };
    }
    const row = await this.prisma.workbuddyHost.findUnique({
      where: { id: principalId },
      select: {
        id: true,
        name: true,
        userId: true,
        clientKind: true,
        enabled: true,
        status: true,
      },
    });
    if (!row || row.userId !== user.userId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agent 设备不存在');
    }
    if (row.clientKind !== kind) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        kind === 'MOBOT'
          ? '这台设备不是 MoBot 手机'
          : '这台设备不是 BotBuddy 主机',
      );
    }
    if (requireActive && (!row.enabled || row.status === 'DISABLED')) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `设备「${row.name || `#${row.id}`}」已停用，请先启用`,
      );
    }
    return { id: row.id, kind, name: row.name || `#${row.id}` };
  }

  /** 批量解析绑定主体名称（主机名 / WorkBuddy 账号名）；查不到（已删）落回 `kind #id`。 */
  private async principalNames(
    rows: { bindings: { principalKind: string; principalId: number }[] }[],
  ): Promise<Map<string, string>> {
    const wanted = new Map<string, Set<number>>();
    for (const row of rows) {
      for (const binding of row.bindings) {
        const bucket = wanted.get(binding.principalKind) ?? new Set<number>();
        bucket.add(binding.principalId);
        wanted.set(binding.principalKind, bucket);
      }
    }
    const names = new Map<string, string>();
    const hostIds = [
      ...(wanted.get('DESKTOP') ?? []),
      ...(wanted.get('MOBOT') ?? []),
    ];
    if (hostIds.length) {
      const hosts = await this.prisma.workbuddyHost.findMany({
        where: { id: { in: hostIds } },
        select: { id: true, name: true, clientKind: true },
      });
      for (const host of hosts) {
        names.set(`${host.clientKind}:${host.id}`, host.name || `#${host.id}`);
      }
    }
    const wbIds = [...(wanted.get('WORKBUDDY') ?? [])];
    if (wbIds.length) {
      const accounts = await this.prisma.workbuddyAccount.findMany({
        where: { id: { in: wbIds } },
        select: { id: true, name: true },
      });
      for (const account of accounts) {
        names.set(`WORKBUDDY:${account.id}`, account.name);
      }
    }
    return names;
  }

  private normalizeStatus(raw: unknown, fallback: string) {
    const value = text(raw).trim();
    if (!value) return fallback;
    if (!(AI_CALL_STATUSES as readonly string[]).includes(value)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '账号状态只能是 active（启用）或 disabled（停用）',
      );
    }
    return value;
  }

  /** 平台特有字段：只收一层键值对，值统一转成字符串。 */
  private readExtra(raw: unknown): Prisma.InputJsonValue {
    if (raw === undefined || raw === null || raw === '') return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '其他字段必须是键值对',
      );
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const name = key.trim().slice(0, 64);
      if (!name || value === undefined || value === null) continue;
      if (SECRET_LIKE_EXTRA_KEY.test(name)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `「${name}」是凭据，请填在登录口令 / API Key / Cookie 里（其他字段不明文存凭据）`,
        );
      }
      result[name] = (
        typeof value === 'object' ? JSON.stringify(value) : text(value)
      ).slice(0, 1000);
    }
    if (JSON.stringify(result).length > 4000) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '其他字段合计不能超过 4000 字符',
      );
    }
    return result;
  }

  private decorate(
    row: {
      id: number;
      createdBy: string;
      name: string;
      platform: string;
      loginUrl: string;
      username: string;
      passwordCipher: string;
      apiKeyCipher: string;
      cookieCipher: string;
      extra: Prisma.JsonValue;
      status: string;
      notes: string;
      createdAt: Date;
      updatedAt: Date;
      bindings?: { principalKind: string; principalId: number }[];
    },
    names?: Map<string, string>,
    withBindings = true,
  ) {
    return {
      id: row.id,
      createdBy: row.createdBy,
      name: row.name,
      platform: row.platform,
      loginUrl: row.loginUrl,
      username: row.username,
      extra: row.extra ?? {},
      status: row.status,
      notes: row.notes,
      hasPassword: Boolean(row.passwordCipher),
      hasApiKey: Boolean(row.apiKeyCipher),
      hasCookie: Boolean(row.cookieCipher),
      ...(withBindings
        ? {
            bindings: (row.bindings ?? []).map((binding) => ({
              principalKind: binding.principalKind as AiCallPrincipalKind,
              principalId: binding.principalId,
              name:
                names?.get(`${binding.principalKind}:${binding.principalId}`) ??
                `${binding.principalKind} #${binding.principalId}`,
            })),
          }
        : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
