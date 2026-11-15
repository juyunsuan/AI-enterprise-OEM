import { randomBytes, randomInt, createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma';
import {
  BOT_COMMAND_DEFAULT_TIMEOUT_SEC,
  BOT_COMMAND_STATUS_LABELS,
  BOT_HEARTBEAT_BATCH,
  BOT_HEARTBEAT_SECONDS,
  BOT_HOST_STATUS_LABELS,
  BOT_HOST_TOKEN_PREFIX,
  BOT_PENDING_QUEUE_LIMIT,
  BOT_SCHEDULE_LAST_STATUS_LABELS,
  BOT_SCHEDULE_STATUS_LABELS,
  BOT_TERMINAL_COMMAND_STATUSES,
  botHostOnline,
  type BotChannelView,
  type BotCommandView,
  type BotHostView,
  type BotMessageView,
  type BotScheduleRunView,
  type BotScheduleView,
  type BotWorkspaceDetail,
  type BotWorkspaceView,
} from '@enterprise/contracts';
import { CurrentUser } from '../auth/current-user';
import { text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { aipddApiKey, loadChannelCredentials } from '../ai/ai-channels';
import { ContentCrypto } from '../content/content-crypto';
import { aipddBaseUrl } from '../content/content-shared';
import { parseId } from '../common/parse-id';
import {
  computeNextOccurrence,
  readScheduleFields,
  scheduleConfigOf,
  SCHEDULE_TYPE_LABELS,
} from '../common/schedule';
import type { HrmScopeService } from '../hrm/hrm.scope';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonObject } from '../shared/json-value';

/**
 * Agent-Bot · Bot 主机（docs/Agent-Bot方案.md）：
 * 用户本机装 WorkBuddy（执行本体）+ BotBuddy 客户端（通信壳）。客户端与本站配对后
 * 按心跳领取指令，调本机 WorkBuddy 的 ACP 网关串行执行，再流式回传。
 *
 * 与本地 Chrome 插件设备通道同一套口径：令牌只存 sha256（D3-A 的等价约束——目标机器的凭据
 * 永不出站，平台只传「做什么」）、commandCode 幂等回执、取用前复权（离职即失效）、
 * 心跳顺带领取（不引入 WebSocket，二期再升级 wss）。
 */

/** 主机终态指令：心跳不再下发、重复回执按幂等处理。 */
const TERMINAL_COMMAND = new Set<string>(BOT_TERMINAL_COMMAND_STATUSES);
/** 配对码：6 位数字、单次有效、10 分钟过期。 */
const PAIR_CODE_TTL_MS = 10 * 60_000;
const PROGRESS_MAX = 20_000;
const INSTRUCTION_MAX = 4_000;
/** 一次列表拉取的会话消息/指令上限：对话框不做无限滚动。 */
const CONVERSATION_MESSAGE_LIMIT = 200;
const CONVERSATION_COMMAND_LIMIT = 50;
const SCHEDULE_DUE_LIMIT = 10;
const PLATFORMS = ['win', 'mac'];
/** 平台模型来源：跟随默认槽位 / 平台授权 / 客户端同步。 */
type GrantSource = 'default' | 'platform' | 'client';
type GrantSummary = NonNullable<BotHostView['modelGrant']>;
/** 客户端同步上来的渠道在平台「模型设置」里的名字前缀（按主机识别，重名即更新）。 */
const CLIENT_CHANNEL_PREFIX = 'BotBuddy · ';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function newHostToken() {
  return `${BOT_HOST_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

function newCommandCode() {
  return `wb${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
}

function newPairCode() {
  return String(randomInt(100000, 1000000));
}

function clip(value: unknown, max: number) {
  return text(value).trim().slice(0, max);
}

function normalizePlatform(raw: unknown) {
  const value = clip(raw, 16).toLowerCase();
  return PLATFORMS.includes(value) ? value : '';
}

function timeoutSecOf(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return BOT_COMMAND_DEFAULT_TIMEOUT_SEC;
  }
  return Math.min(3600, Math.max(10, Math.round(value)));
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : text(error) || '执行失败';
}

/** 设备主体：主机令牌 → 归属账号，下游按这个身份取数与写台账。 */
export type BotHostPrincipal = {
  id: number;
  userId: string;
  name: string;
};

export type BotHostCommandPayload = {
  instruction: string;
  cwd: string;
  timeoutSec: number;
  /** 本机权限档：deny | allow-edits | allow-all（客户端按它裁决本地工具） */
  mode: string;
};

/**
 * 心跳 caps.agent 里只取工作区：默认目录与候选表。
 * 模型、技能、数字分身这类客户端本地配置平台不看、不存、不校验，
 * 客户端没上报过就是空表（界面显示"未上报"，不臆造）。
 */
type WorkspaceCaps = {
  defaultPath: string;
  list: BotWorkspaceView[];
};

/** 工作区比对口径：大小写不敏感、忽略尾分隔符——与客户端 resolveWorkspace 保持一致。 */
function workspaceKey(raw: unknown): string {
  return clip(raw, 300)
    .toLowerCase()
    .replace(/[\\/]+$/, '');
}

function readWorkspaceCaps(caps: Record<string, unknown>): WorkspaceCaps {
  const raw = toJsonObject(caps.agent);
  const list: BotWorkspaceView[] = [];
  const rows = Array.isArray(raw.workspaces)
    ? raw.workspaces.slice(0, 200)
    : [];
  for (const item of rows) {
    const ws = toJsonObject(item);
    const path = clip(ws.path, 300);
    if (!path) continue;
    const lastUsed = ws.lastUsedAt;
    list.push({
      path,
      label:
        clip(ws.label, 120) ||
        path.split(/[\\/]/).filter(Boolean).pop() ||
        path,
      exists: ws.exists !== false,
      isGit: ws.isGit === true,
      trust: clip(ws.trust, 16),
      source: clip(ws.source, 32),
      lastUsedAt:
        typeof lastUsed === 'number'
          ? new Date(lastUsed).toISOString()
          : clip(lastUsed, 40) || null,
    });
  }
  return { defaultPath: clip(raw.workspace, 300), list };
}

export class BotHostService {
  private contentCryptoSingleton: ContentCrypto | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmScopeService,
  ) {}

  /** 渠道凭据加解密与内容创作同源；延迟构造，避免未配置密钥时影响其它接口启动。 */
  private contentCrypto() {
    if (!this.contentCryptoSingleton) {
      this.contentCryptoSingleton = new ContentCrypto();
    }
    return this.contentCryptoSingleton;
  }

  // ---------------------------------------------------------------- 主机台账（界面侧）

  async list(user: CurrentUser) {
    const rows = await this.prisma.workbuddyHost.findMany({
      where: { userId: user.userId },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    });
    const pending = await this.prisma.workbuddyHostCommand.groupBy({
      by: ['hostId'],
      where: { userId: user.userId, status: 'PENDING' },
      _count: { _all: true },
    });
    const channels = await this.prisma.workbuddyHostChannel.groupBy({
      by: ['hostId'],
      where: { userId: user.userId },
      _count: { _all: true },
    });
    const pendingMap = new Map(
      pending.map((row) => [row.hostId, row._count._all]),
    );
    const channelMap = new Map(
      channels.map((row) => [row.hostId, row._count._all]),
    );
    const grants = await this.prisma.workbuddyHostModelGrant.findMany({
      where: { userId: user.userId },
    });
    const channelsById = new Map(
      (
        await this.prisma.contentModelChannel.findMany({
          where: { userId: user.userId },
          select: { id: true, name: true, enabled: true },
        })
      ).map((row) => [row.id, row]),
    );
    const grantMap = new Map(
      grants.map((row) => {
        const channel = channelsById.get(row.channelId);
        return [
          row.hostId,
          {
            channelId: row.channelId,
            channelName:
              channel?.name ||
              (row.channelId === -1 ? '本站内置渠道' : '渠道已删除'),
            model: row.model,
            available: row.channelId === -1 || Boolean(channel?.enabled),
            source: this.grantSource(row.source),
          } satisfies GrantSummary,
        ] as const;
      }),
    );
    // 没有独立授权的主机跟随平台「模型设置 → 文本」默认槽位：只查一次，所有主机共用。
    const inherited = await this.defaultGrant(user.userId);
    return {
      list: rows.map((row) =>
        this.hostView(
          row,
          pendingMap.get(row.id) || 0,
          channelMap.get(row.id) || 0,
          grantMap.get(row.id) || inherited,
        ),
      ),
    };
  }

  /**
   * 配对：两条入口并存。
   * · 设备码：客户端先申请 6 位码，用户在平台输码 → 平台建主机并把令牌挂在码上，客户端轮询取回；
   * · 令牌粘贴：平台直接建主机并回一次令牌，用户粘贴进客户端。
   * 令牌明文只在这个响应里出现一次，库内只存 sha256。
   */
  async pair(user: CurrentUser, body: Record<string, unknown>) {
    const code = clip(body.code, 12);
    const deviceInfo = toJsonObject(body.deviceInfo);
    const platform = normalizePlatform(
      body.platform ?? deviceInfo.os ?? deviceInfo.platform,
    );
    const hostname = clip(deviceInfo.hostname, 40);
    const fallback = hostname
      ? `Workbuddy · ${hostname}`
      : `Bot 主机 · ${randomBytes(2).toString('hex')}`;
    const name = clip(body.name, 80) || fallback;
    if (code) {
      return this.pairByCode(user, code, name, platform);
    }
    return this.createHost(user, name, platform);
  }

  private async pairByCode(
    user: CurrentUser,
    code: string,
    name: string,
    platform: string,
  ) {
    const row = await this.prisma.workbuddyHostPairCode.findUnique({
      where: { code },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '配对码无效或已过期，请在客户端重新申请',
      );
    }
    // 账号 + 连接码双重绑定：码在客户端登录后签发，只认同一个账号来认领。
    if (row.userId !== user.userId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该连接码由其他账号在客户端生成，请用同一账号登录平台后再配对',
      );
    }
    const created = await this.createHost(user, name, platform);
    await this.prisma.workbuddyHostPairCode.update({
      where: { id: row.id },
      data: { hostId: created.host.id, issuedToken: created.token },
    });
    return { host: created.host, token: created.token };
  }

  private async createHost(user: CurrentUser, name: string, platform: string) {
    const token = newHostToken();
    const row = await this.prisma.workbuddyHost.create({
      data: {
        userId: user.userId,
        name,
        platform,
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, 10),
        status: 'NEVER',
      },
    });
    await this.prisma.workbuddyHostChannel.create({
      data: { hostId: row.id, userId: user.userId, name: `${name} · 通信` },
    });
    return { host: this.hostView(row, 0, 1), token };
  }

  async setStatus(user: CurrentUser, hostIdRaw: string, enabled: boolean) {
    const row = await this.loadHost(user, hostIdRaw);
    const updated = await this.prisma.workbuddyHost.update({
      where: { id: row.id },
      data: {
        enabled,
        // 停用即作废令牌通道：状态落 DISABLED，心跳再也领不到指令。
        status: enabled ? row.status : 'DISABLED',
      },
    });
    return { host: this.hostView(updated, 0, 1) };
  }

  async remove(user: CurrentUser, hostIdRaw: string) {
    const row = await this.loadHost(user, hostIdRaw);
    const conversation = await this.prisma.workbuddyHostConversation.findUnique(
      { where: { hostId: row.id } },
    );
    await this.prisma.$transaction([
      this.prisma.workbuddyHostScheduleRun.deleteMany({
        where: { hostId: row.id },
      }),
      this.prisma.workbuddyHostSchedule.deleteMany({
        where: { hostId: row.id },
      }),
      this.prisma.workbuddyHostCommand.deleteMany({
        where: { hostId: row.id },
      }),
      this.prisma.workbuddyHostChannel.deleteMany({
        where: { hostId: row.id },
      }),
      ...(conversation
        ? [
            this.prisma.contentAgentMessage.deleteMany({
              where: { conversationId: conversation.conversationId },
            }),
            this.prisma.contentAgentConversation.deleteMany({
              where: { id: conversation.conversationId },
            }),
          ]
        : []),
      this.prisma.workbuddyHostConversation.deleteMany({
        where: { hostId: row.id },
      }),
      this.prisma.workbuddyHost.delete({ where: { id: row.id } }),
    ]);
    return { removed: true };
  }

  async rotateToken(user: CurrentUser, hostIdRaw: string) {
    const row = await this.loadHost(user, hostIdRaw);
    const token = newHostToken();
    await this.prisma.workbuddyHost.update({
      where: { id: row.id },
      data: { tokenHash: hashToken(token), tokenPrefix: token.slice(0, 10) },
    });
    return { token, tokenPrefix: token.slice(0, 10) };
  }

  async channels(user: CurrentUser, hostIdRaw: string) {
    const row = await this.loadHost(user, hostIdRaw);
    const rows = await this.prisma.workbuddyHostChannel.findMany({
      where: { hostId: row.id },
      orderBy: { id: 'asc' },
    });
    return { list: rows.map((item) => this.channelView(item)) };
  }

  // ---------------------------------------------------------------- 平台模型授权

  private grantSource(raw: unknown): GrantSource {
    const value = text(raw);
    return value === 'client' || value === 'default' ? value : 'platform';
  }

  private channelLabel(channelId: number, name?: string | null) {
    if (channelId === -1) return '本站内置渠道';
    if (channelId === 0) return 'AIPDD';
    return name || '渠道已删除';
  }

  /**
   * 平台「模型设置 → 文本」默认槽位：主机没有独立授权时跟随它。
   * 客户端绑定后自动拿到的模型就是这里配的默认模型；平台改默认模型，主机的下一次心跳即生效。
   */
  private async defaultGrant(userId: string): Promise<GrantSummary | null> {
    const slot = await this.prisma.contentModelSlot
      .findUnique({
        where: { userId_mediaType: { userId, mediaType: 'text' } },
      })
      .catch(() => null);
    if (!slot || !slot.model) return null;
    const channel =
      slot.channelId > 0
        ? await this.prisma.contentModelChannel.findFirst({
            where: { id: slot.channelId, userId },
            select: { name: true, enabled: true },
          })
        : null;
    return {
      channelId: slot.channelId,
      channelName: this.channelLabel(slot.channelId, channel?.name),
      model: slot.model,
      // AIPDD 内置渠道（0）没有渠道行，「可用」取决于本人绑定 Key 或平台 Key 能否解出。
      available:
        slot.channelId === -1 ||
        (slot.channelId === 0
          ? Boolean(await aipddApiKey(this.prisma, userId))
          : Boolean(channel?.enabled)),
      source: 'default',
    };
  }

  /**
   * 平台模型设置（B 方案）：没有独立授权时显示平台默认文本模型；
   * 平台为本机授权（source=platform）或客户端改模型后同步上来（source=client）时以那一条为准。
   */
  async modelGrant(user: CurrentUser, hostIdRaw: string) {
    const host = await this.loadHost(user, hostIdRaw);
    const row = await this.prisma.workbuddyHostModelGrant.findUnique({
      where: { hostId: host.id },
    });
    if (!row) {
      const inherited = await this.defaultGrant(user.userId);
      return {
        grant: inherited
          ? { hostId: host.id, ...inherited, enabled: true, updatedAt: '' }
          : null,
      };
    }
    const channel = await this.prisma.contentModelChannel.findFirst({
      where: { id: row.channelId, userId: user.userId },
      select: { id: true, name: true, provider: true, enabled: true },
    });
    return {
      grant: {
        hostId: row.hostId,
        channelId: row.channelId,
        // 内置渠道（-1 / 0）没有渠道行，名字固定
        channelName: this.channelLabel(row.channelId, channel?.name),
        model: row.model,
        enabled: row.enabled,
        available: row.channelId <= 0 || Boolean(channel?.enabled),
        source: this.grantSource(row.source),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }

  /** 保存/覆盖授权；channelId=-1 表示本站内置渠道（按积分计费，不需要用户 Key）。 */
  async saveModelGrant(
    user: CurrentUser,
    hostIdRaw: string,
    body: Record<string, unknown>,
  ) {
    const host = await this.loadHost(user, hostIdRaw);
    const channelId = Number(body.channelId);
    const model = clip(body.model, 128);
    if (!Number.isInteger(channelId) || channelId < -1) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择模型渠道');
    }
    if (channelId === 0 && !(await aipddApiKey(this.prisma, user.userId))) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'AIPDD 渠道还没有可用的 Key：请先在「模型服务 → API Key 管理」绑定，或在平台后台配置平台 AIPDD Key',
      );
    }
    if (!model) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要用的模型');
    }
    if (channelId > 0) {
      const channel = await this.prisma.contentModelChannel.findFirst({
        where: { id: channelId, userId: user.userId },
        select: { enabled: true },
      });
      if (!channel) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '模型渠道不存在');
      }
      if (!channel.enabled) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '该模型渠道已停用');
      }
    }
    await this.prisma.workbuddyHostModelGrant.upsert({
      where: { hostId: host.id },
      create: {
        userId: user.userId,
        hostId: host.id,
        channelId,
        model,
        enabled: true,
        source: 'platform',
      },
      update: { channelId, model, enabled: true, source: 'platform' },
    });
    return { grant: (await this.modelGrant(user, hostIdRaw)).grant };
  }

  /** 撤销独立授权：主机回到「跟随平台默认文本模型」，而不是失去模型。 */
  async removeModelGrant(user: CurrentUser, hostIdRaw: string) {
    const host = await this.loadHost(user, hostIdRaw);
    await this.prisma.workbuddyHostModelGrant.deleteMany({
      where: { hostId: host.id, userId: user.userId },
    });
    return {
      removed: true,
      grant: (await this.modelGrant(user, hostIdRaw)).grant,
    };
  }

  /**
   * 客户端改了本地模型设置后同步到平台：写一条该主机的专属渠道 + 覆盖授权。
   * 渠道按「BotBuddy · 主机名」落在平台「模型设置」里，之后平台任意入口看到的都是这份设置。
   */
  async syncModelFromClient(
    host: BotHostPrincipal,
    body: Record<string, unknown>,
  ) {
    const baseUrl = clip(body.baseUrl, 300).replace(/\/+$/, '');
    const model = clip(body.model, 128);
    const apiKey = text(body.apiKey).trim().slice(0, 500);
    const protocol =
      clip(body.protocol, 16) === 'anthropic' ? 'anthropic' : 'openai';
    if (!/^https?:\/\/\S+$/i.test(baseUrl)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '模型渠道地址必须以 http:// 或 https:// 开头',
      );
    }
    if (!model) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '模型名不能为空');
    }
    if (!apiKey) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, 'API Key 不能为空');
    }
    const current = await this.prisma.workbuddyHostModelGrant.findUnique({
      where: { hostId: host.id },
    });
    const channelName =
      `${CLIENT_CHANNEL_PREFIX}${host.name || `#${host.id}`}`.slice(0, 64);
    let channel =
      current && current.source === 'client' && current.channelId > 0
        ? await this.prisma.contentModelChannel.findFirst({
            where: { id: current.channelId, userId: host.userId },
          })
        : null;
    if (!channel) {
      channel = await this.prisma.contentModelChannel.findFirst({
        where: {
          userId: host.userId,
          provider: 'custom',
          name: channelName,
        },
      });
    }
    const data = {
      provider: 'custom',
      name: channelName,
      baseUrl,
      keyCipher: this.contentCrypto().encrypt(apiKey),
      preset: protocol,
      enabled: true,
      verifiedAt: new Date(),
    };
    const saved = channel
      ? await this.prisma.contentModelChannel.update({
          where: { id: channel.id },
          data,
        })
      : await this.prisma.contentModelChannel.create({
          data: { userId: host.userId, ...data },
        });
    await this.prisma.workbuddyHostModelGrant.upsert({
      where: { hostId: host.id },
      create: {
        userId: host.userId,
        hostId: host.id,
        channelId: saved.id,
        model,
        enabled: true,
        source: 'client',
      },
      update: {
        channelId: saved.id,
        model,
        enabled: true,
        source: 'client',
      },
    });
    return {
      synced: true,
      channelId: saved.id,
      channelName: saved.name,
      model,
    };
  }

  /** 客户端清空了模型设置：删掉客户端同步的覆盖授权，回到跟随平台默认模型。 */
  async clearClientModel(host: BotHostPrincipal) {
    const res = await this.prisma.workbuddyHostModelGrant.deleteMany({
      where: { hostId: host.id, userId: host.userId, source: 'client' },
    });
    return { removed: res.count > 0 };
  }

  // ---------------------------------------------------------------- 对话与指令

  async conversation(user: CurrentUser, hostIdRaw: string) {
    const host = await this.loadHost(user, hostIdRaw);
    const conversationId = await this.conversationIdOf(host);
    const [messages, commands, fresh] = await Promise.all([
      this.prisma.contentAgentMessage.findMany({
        where: { conversationId },
        orderBy: { id: 'asc' },
        take: CONVERSATION_MESSAGE_LIMIT,
      }),
      this.prisma.workbuddyHostCommand.findMany({
        // 连通握手是内部指令，不混进用户看得到的指令清单。
        where: { hostId: host.id, kind: { not: 'connect' } },
        orderBy: { id: 'desc' },
        take: CONVERSATION_COMMAND_LIMIT,
      }),
      this.prisma.workbuddyHost.findUnique({ where: { id: host.id } }),
    ]);
    return {
      host: this.hostView(fresh || host, 0, 1),
      messages: messages.map((row) => this.messageView(row)),
      commands: commands.map((row) => this.commandView(row)),
    };
  }

  /** 发一条指令：先落用户气泡，再入队等主机心跳领取（主机离线也照落，上线即跑）。 */
  async send(
    user: CurrentUser,
    hostIdRaw: string,
    body: Record<string, unknown>,
  ) {
    const host = await this.loadHost(user, hostIdRaw);
    const instruction = clip(body.text ?? body.instruction, INSTRUCTION_MAX);
    if (!instruction) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写要交给主机做的事',
      );
    }
    const pending = await this.prisma.workbuddyHostCommand.count({
      where: { hostId: host.id, status: 'PENDING' },
    });
    if (pending >= BOT_PENDING_QUEUE_LIMIT) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该主机待执行队列已满（${BOT_PENDING_QUEUE_LIMIT} 条），请等它跑完或先删除排队中的任务`,
      );
    }
    const conversationId = await this.conversationIdOf(host);
    const target = this.resolveDispatchTarget(host, body);
    const command = await this.enqueue(host, {
      instruction,
      cwd: target.cwd,
      timeoutSec: timeoutSecOf(body.timeoutSec),
      mode: target.mode,
      kind: 'prompt',
      conversationId,
    });
    return { command: this.commandView(command) };
  }

  /** 取消：未派发即置 CANCELED；已在跑的置取消标记，由客户端下一次心跳/进度回传时中断。 */
  async cancel(user: CurrentUser, commandCodeRaw: string) {
    const commandCode = clip(commandCodeRaw, 40);
    const row = await this.prisma.workbuddyHostCommand.findFirst({
      where: { userId: user.userId, commandCode },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '指令不存在');
    }
    if (TERMINAL_COMMAND.has(row.status)) return { canceled: true };
    if (row.status === 'PENDING') {
      await this.prisma.workbuddyHostCommand.update({
        where: { id: row.id },
        data: { status: 'CANCELED', finishedAt: new Date() },
      });
    } else {
      await this.prisma.workbuddyHostCommand.update({
        where: { id: row.id },
        data: { cancelRequested: true },
      });
    }
    return { canceled: true };
  }

  // ---------------------------------------------------------------- 定时任务

  async schedules(user: CurrentUser) {
    const rows = await this.prisma.workbuddyHostSchedule.findMany({
      where: { userId: user.userId },
      orderBy: { id: 'desc' },
      take: 200,
    });
    const names = await this.hostNames(
      user.userId,
      rows.map((row) => row.hostId),
    );
    return { list: rows.map((row) => this.scheduleView(row, names)) };
  }

  async createSchedule(user: CurrentUser, body: Record<string, unknown>) {
    const hostId = parseId(body.hostId, '主机 ID');
    const host = await this.loadHost(user, String(hostId));
    const title = clip(body.title, 80);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写任务名称');
    const instruction = clip(body.instruction, INSTRUCTION_MAX);
    if (!instruction) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写每轮要交给主机做的事',
      );
    }
    const fields = readScheduleFields(body);
    const scheduleType = text(fields.scheduleType).trim();
    if (scheduleType !== 'scheduled' && scheduleType !== 'recurring') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '计划任务要么「定时一次」，要么「周期重复」',
      );
    }
    // 建计划时就校验工作区：目录不在客户端白名单里，到点也只会白跑一轮。
    const target = this.resolveDispatchTarget(host, body);
    const now = new Date();
    const scheduledAt =
      scheduleType === 'recurring'
        ? computeNextOccurrence(scheduleConfigOf(fields.scheduleConfig), now)
        : (fields.scheduledAt ?? null);
    if (scheduleType === 'recurring' && !scheduledAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '周期配置算不出下一次执行时刻，请检查频率与时刻',
      );
    }
    const row = await this.prisma.workbuddyHostSchedule.create({
      data: {
        userId: user.userId,
        hostId: host.id,
        title,
        instruction,
        payload: toJsonObject({
          cwd: target.cwd,
          timeoutSec: timeoutSecOf(body.timeoutSec),
          mode: target.mode,
        }),
        scheduleType,
        scheduleConfig: fields.scheduleConfig ?? {},
        scheduledAt,
        status: body.status === 'paused' ? 'paused' : 'enabled',
      },
    });
    const names = await this.hostNames(user.userId, [row.hostId]);
    return { schedule: this.scheduleView(row, names) };
  }

  async updateSchedule(
    user: CurrentUser,
    idRaw: string,
    body: Record<string, unknown>,
  ) {
    const id = parseId(idRaw, '计划任务 ID');
    const row = await this.loadSchedule(user, id);
    const host = await this.loadHost(user, String(row.hostId));
    const data: Prisma.WorkbuddyHostScheduleUpdateInput = {};
    const title = clip(body.title, 80);
    if (title) data.title = title;
    const instruction = clip(body.instruction, INSTRUCTION_MAX);
    if (instruction) data.instruction = instruction;
    if (
      body.workspace !== undefined ||
      body.cwd !== undefined ||
      body.mode !== undefined
    ) {
      const current = toJsonObject(row.payload);
      const target = this.resolveDispatchTarget(host, {
        workspace: body.workspace ?? body.cwd ?? current.cwd,
        mode: body.mode ?? current.mode,
      });
      data.payload = toJsonObject({
        cwd: target.cwd,
        timeoutSec: timeoutSecOf(current.timeoutSec),
        mode: target.mode,
      });
    }
    if (body.status !== undefined) {
      data.status = body.status === 'paused' ? 'paused' : 'enabled';
    }
    if (
      body.scheduleType !== undefined ||
      body.scheduleConfig !== undefined ||
      body.scheduledAt !== undefined
    ) {
      const fields = readScheduleFields(body, true);
      const scheduleType = text(fields.scheduleType).trim() || row.scheduleType;
      if (scheduleType !== 'scheduled' && scheduleType !== 'recurring') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '计划任务要么「定时一次」，要么「周期重复」',
        );
      }
      data.scheduleType = scheduleType;
      // JSON 列要的是 Prisma 的入参形状，排期推算要的是普通对象：一份值两种视图。
      const configInput = toJsonObject(
        fields.scheduleConfig ?? row.scheduleConfig,
      );
      data.scheduleConfig = configInput;
      data.scheduledAt =
        scheduleType === 'recurring'
          ? computeNextOccurrence(scheduleConfigOf(configInput), new Date())
          : (fields.scheduledAt ?? row.scheduledAt);
      if (scheduleType === 'recurring' && !data.scheduledAt) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '周期配置算不出下一次执行时刻，请检查频率与时刻',
        );
      }
    }
    const updated = await this.prisma.workbuddyHostSchedule.update({
      where: { id: row.id },
      data,
    });
    const names = await this.hostNames(user.userId, [updated.hostId]);
    return { schedule: this.scheduleView(updated, names) };
  }

  async removeSchedule(user: CurrentUser, idRaw: string) {
    const id = parseId(idRaw, '计划任务 ID');
    const result = await this.prisma.workbuddyHostSchedule.deleteMany({
      where: { id, userId: user.userId },
    });
    if (!result.count) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '计划任务不存在');
    }
    return { removed: true };
  }

  /** 「立即执行」：不动 scheduledAt，只补跑一轮。 */
  async runSchedule(user: CurrentUser, idRaw: string) {
    const id = parseId(idRaw, '计划任务 ID');
    const row = await this.loadSchedule(user, id);
    const command = await this.dispatchSchedule(row, 'manual');
    return { command: this.commandView(command) };
  }

  async scheduleRuns(user: CurrentUser, idRaw: string) {
    const id = parseId(idRaw, '计划任务 ID');
    const row = await this.loadSchedule(user, id);
    const rows = await this.prisma.workbuddyHostScheduleRun.findMany({
      where: { scheduleId: row.id },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const codes = rows.map((item) => item.commandCode).filter(Boolean);
    const commands = codes.length
      ? await this.prisma.workbuddyHostCommand.findMany({
          where: { commandCode: { in: codes } },
        })
      : [];
    const byCode = new Map(commands.map((item) => [item.commandCode, item]));
    return {
      list: rows.map((item) =>
        this.scheduleRunView(item, byCode.get(item.commandCode)),
      ),
    };
  }

  /**
   * 调度器调用：把到点的计划各下发一轮。
   * 先把下一次执行时刻推走再跑，避免一轮没跑完就被下一个 tick 重复接走；
   * 定时一次跑完即没有下一次。主机离线不当轮跳过而是照排队列——
   * 与浏览器代理不同，这里的队列由主机自己按序消费，回来就补上。
   */
  async advanceDue() {
    const now = new Date();
    const due = await this.prisma.workbuddyHostSchedule.findMany({
      where: {
        status: 'enabled',
        scheduleType: { in: ['scheduled', 'recurring'] },
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: SCHEDULE_DUE_LIMIT,
    });
    if (!due.length) return 0;
    for (const row of due) {
      const nextAt =
        row.scheduleType === 'recurring'
          ? computeNextOccurrence(scheduleConfigOf(row.scheduleConfig), now)
          : null;
      await this.prisma.workbuddyHostSchedule.update({
        where: { id: row.id },
        data: { scheduledAt: nextAt },
      });
      try {
        await this.dispatchSchedule(row, 'schedule');
      } catch (error) {
        // 下发前的闸门拒单已在 dispatchSchedule 里记成 skipped，别在这里覆盖成 failed。
        const fresh = await this.prisma.workbuddyHostSchedule.findUnique({
          where: { id: row.id },
          select: { lastStatus: true },
        });
        if (fresh?.lastStatus === 'skipped') continue;
        await this.prisma.workbuddyHostSchedule.update({
          where: { id: row.id },
          data: {
            lastRunAt: now,
            lastStatus: 'failed',
            lastError: messageOf(error).slice(0, 500),
          },
        });
      }
    }
    return due.length;
  }

  /**
   * 收口「主机领走了却没回话」的指令：按各自 timeoutSec 再加 3 分钟宽限判超时。
   * 不收的话，客户端一次崩溃就让指令永远挂在执行中，队列与对话框都收不了尾。
   */
  async sweepTimeouts() {
    const now = new Date();
    const rows = await this.prisma.workbuddyHostCommand.findMany({
      where: {
        status: 'DISPATCHED',
        dispatchedAt: { lt: new Date(now.getTime() - 60_000) },
      },
      orderBy: { id: 'asc' },
      take: 100,
    });
    let swept = 0;
    for (const row of rows) {
      const started = row.dispatchedAt?.getTime() ?? now.getTime();
      const budget =
        timeoutSecOf(toJsonObject(row.payload).timeoutSec) * 1000 + 180_000;
      if (now.getTime() - started < budget) continue;
      const reason = '主机超时未回传结果';
      await this.prisma.workbuddyHostCommand.update({
        where: { id: row.id },
        data: {
          status: 'TIMEOUT',
          finishedAt: now,
          error: reason,
          result: toJsonObject({
            text: '',
            errorMessage: reason,
            elapsedMs: now.getTime() - started,
          }),
        },
      });
      if (row.conversationId) {
        await this.prisma.contentAgentMessage.create({
          data: {
            conversationId: row.conversationId,
            userId: row.userId,
            role: 'assistant',
            content: `⚠️ ${reason}，请检查客户端与 WorkBuddy 是否在跑`,
            status: 'failed',
          },
        });
        await this.touchConversation(row.conversationId, row.userId);
      }
      if (row.scheduleId) {
        await this.prisma.workbuddyHostScheduleRun.updateMany({
          where: { scheduleId: row.scheduleId, commandCode: row.commandCode },
          data: { status: 'failed', error: reason, finishedAt: now },
        });
      }
      swept += 1;
    }
    return swept;
  }

  /** 一轮定时下发：落运行记录 + 入队指令，账号停用则自动暂停计划。 */
  private async dispatchSchedule(
    row: Prisma.WorkbuddyHostScheduleGetPayload<object>,
    kind: 'schedule' | 'manual',
  ) {
    const standing = await this.scope.isStanding(row.userId);
    if (!standing) {
      await this.prisma.workbuddyHostSchedule.update({
        where: { id: row.id },
        data: {
          status: 'paused',
          scheduledAt: null,
          lastRunAt: new Date(),
          lastStatus: 'skipped',
          lastError: '账号已停用，计划任务已自动暂停',
        },
      });
      throw new BusinessException(ErrorCode.FORBIDDEN, '账号已停用');
    }
    const host = await this.prisma.workbuddyHost.findFirst({
      where: { id: row.hostId, userId: row.userId },
    });
    if (!host) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '目标主机已被删除');
    }
    const payload = toJsonObject(row.payload);
    // 到点再校验一次工作区：建计划时存在的目录，到点可能已经被删或移出白名单。
    let target: { cwd: string; mode: string };
    try {
      target = this.resolveDispatchTarget(host, {
        workspace: payload.cwd,
        mode: payload.mode,
      });
    } catch (error) {
      const reason = messageOf(error);
      await this.prisma.workbuddyHostSchedule.update({
        where: { id: row.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'skipped',
          lastError: reason.slice(0, 500),
        },
      });
      throw error;
    }
    const conversationId = await this.conversationIdOf(host);
    const command = await this.enqueue(host, {
      instruction: row.instruction,
      cwd: target.cwd,
      timeoutSec: timeoutSecOf(payload.timeoutSec),
      mode: target.mode,
      kind: kind === 'schedule' ? 'schedule' : 'prompt',
      title: row.title,
      conversationId,
      scheduleId: row.id,
    });
    await this.prisma.workbuddyHostScheduleRun.create({
      data: {
        scheduleId: row.id,
        hostId: host.id,
        userId: row.userId,
        commandCode: command.commandCode,
        conversationId,
        startedAt: new Date(),
      },
    });
    await this.prisma.workbuddyHostSchedule.update({
      where: { id: row.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'queued',
        lastError: '',
        runCount: { increment: 1 },
      },
    });
    return command;
  }

  // ---------------------------------------------------------------- 设备通道（客户端）

  /**
   * 客户端申请配对码：必须先在客户端登录本站账号，码直接绑到该账号上；
   * 之后只有同一账号在站内「Bot 主机」页能认领（账号 + 连接码双重绑定）。
   */
  async requestPairCode(user: CurrentUser, body: Record<string, unknown>) {
    const deviceInfo = toJsonObject(body.deviceInfo);
    let code = newPairCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await this.prisma.workbuddyHostPairCode.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) break;
      code = newPairCode();
    }
    const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS);
    await this.prisma.workbuddyHostPairCode.create({
      data: { code, deviceInfo, expiresAt, userId: user.userId },
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }

  /** 客户端轮询配对结果：只认生成该码的账号，命中即取走一次性令牌并作废该码。 */
  async pollPairCode(user: CurrentUser, body: Record<string, unknown>) {
    const code = clip(body.code, 12);
    const row = await this.prisma.workbuddyHostPairCode.findUnique({
      where: { code },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '配对码无效或已过期，请重新申请',
      );
    }
    if (row.userId !== user.userId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这个连接码不是当前账号生成的，请退出后重新登录',
      );
    }
    if (!row.hostId || !row.issuedToken) {
      return { paired: false, token: '', hostName: '', hostId: 0 };
    }
    const host = await this.prisma.workbuddyHost.findUnique({
      where: { id: row.hostId },
      select: { name: true },
    });
    await this.prisma.workbuddyHostPairCode.update({
      where: { id: row.id },
      data: { issuedToken: '', usedAt: new Date() },
    });
    return {
      paired: true,
      token: row.issuedToken,
      hostName: host?.name || '',
      hostId: row.hostId,
    };
  }

  /** 令牌 → 主机主体：查库 + 复权（账号注销/停用即作废令牌），失败一律 null。 */
  async hostByToken(raw: string): Promise<BotHostPrincipal | null> {
    const token = text(raw).trim();
    // 更名前已配对的客户端手里是 wb_ 令牌，继续认；新签发的都是 bot_。
    if (!token.startsWith(BOT_HOST_TOKEN_PREFIX) && !token.startsWith('wb_')) {
      return null;
    }
    const row = await this.prisma.workbuddyHost.findFirst({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || !row.enabled || row.status === 'DISABLED') return null;
    const standing = await this.scope.isStanding(row.userId).catch(() => false);
    if (!standing) {
      await this.prisma.workbuddyHost
        .update({
          where: { id: row.id },
          data: { enabled: false, status: 'DISABLED', tokenHash: '' },
        })
        .catch(() => undefined);
      return null;
    }
    return { id: row.id, userId: row.userId, name: row.name };
  }

  /** 心跳：刷新在线态 + 领取待执行指令 + 回带需要中断的指令码。 */
  async heartbeat(
    host: BotHostPrincipal,
    body: Record<string, unknown>,
    ip: string,
  ) {
    const now = new Date();
    const caps = toJsonObject(body.caps);
    const platform = normalizePlatform(body.platform);
    const clientVersion = clip(body.clientVersion, 24);
    const workingDir = clip(body.workingDir, 300);
    await this.prisma.workbuddyHost.update({
      where: { id: host.id },
      data: {
        status: 'ONLINE',
        lastSeenAt: now,
        lastIp: clip(ip, 64),
        // 自报字段只在客户端真的带上时才改写：漏带不等于「清空本机登记的工作区」。
        ...(workingDir ? { workingDir } : {}),
        ...(Object.keys(caps).length ? { caps } : {}),
        ...(platform ? { platform } : {}),
        ...(clientVersion ? { clientVersion } : {}),
      },
    });
    const commands = await this.prisma.workbuddyHostCommand.findMany({
      where: { hostId: host.id, status: 'PENDING' },
      orderBy: { id: 'asc' },
      take: BOT_HEARTBEAT_BATCH,
    });
    if (commands.length) {
      await this.prisma.workbuddyHostCommand.updateMany({
        where: { id: { in: commands.map((row) => row.id) } },
        data: { status: 'DISPATCHED', dispatchedAt: now },
      });
    }
    const stopped = await this.prisma.workbuddyHostCommand.findMany({
      where: { hostId: host.id, status: 'DISPATCHED', cancelRequested: true },
      select: { commandCode: true },
      take: BOT_HEARTBEAT_BATCH,
    });
    await this.prisma.workbuddyHostChannel.updateMany({
      where: { hostId: host.id },
      data: { lastEventAt: now, eventCount: { increment: 1 } },
    });
    return {
      received: true,
      serverTime: now.toISOString(),
      heartbeatSeconds: BOT_HEARTBEAT_SECONDS,
      commands: commands.map((row) => this.dispatchOf(row)),
      stop: stopped.map((row) => row.commandCode),
      // 平台模型授权：客户端收到就当成「平台渠道」使用；为空表示平台没授权。
      modelGrant: await this.modelGrantForHost(host),
    };
  }

  /** 该主机当下生效的模型设置：独立授权优先，没有就跟随平台默认文本槽位。 */
  private async resolveHostGrant(host: { id: number; userId: string }) {
    const grant = await this.prisma.workbuddyHostModelGrant.findUnique({
      where: { hostId: host.id },
    });
    if (grant && grant.enabled) {
      return {
        channelId: grant.channelId,
        model: grant.model,
        source: this.grantSource(grant.source),
      };
    }
    const inherited = await this.defaultGrant(host.userId);
    if (!inherited || !inherited.available) return null;
    return {
      channelId: inherited.channelId,
      model: inherited.model,
      source: 'default' as const,
    };
  }

  /**
   * 心跳下发的模型授权：把渠道的真实密钥解密后交给本机客户端。
   * 独立授权 / 平台默认文本模型都按同一口径下发；任何一环不满足都返回 null，
   * 客户端据此清掉平台渠道，回到「自己配」的状态。
   */
  private async modelGrantForHost(host: { id: number; userId: string }) {
    const grant = await this.resolveHostGrant(host);
    if (!grant) return null;
    try {
      const creds = await loadChannelCredentials({
        prisma: this.prisma,
        userId: host.userId,
        channelId: grant.channelId,
        mediaType: 'text',
      });
      return {
        channelId: grant.channelId,
        baseUrl: creds.baseUrl,
        // 与客户端 model-client 的协议名对齐：openai / anthropic
        protocol: creds.protocol === 'anthropic' ? 'anthropic' : 'openai',
        apiKey: creds.apiKey,
        model: grant.model,
        source: grant.source,
      };
    } catch {
      // AIPDD 内置渠道在本人未绑 Key 时改用平台 Key（与站内 AI 调用同口径），
      // 让「平台默认文本模型=AIPDD」在客户端登录后无需手动授权即可用。
      if (grant.channelId === 0) {
        const apiKey = await aipddApiKey(this.prisma, host.userId);
        if (apiKey) {
          return {
            channelId: 0,
            baseUrl: aipddBaseUrl(),
            apiKey,
            protocol: 'openai',
            model: grant.model,
            source: grant.source,
          };
        }
      }
      // 渠道被删/停用/Key 解不开：授权视为不可用，客户端回落本地配置。
      return null;
    }
  }

  /** 流式进度：累积片段并回带取消标记，客户端据此中断本机执行。 */
  async progress(host: BotHostPrincipal, body: Record<string, unknown>) {
    const command = await this.loadHostCommand(host, body.commandCode);
    const chunk = text(body.text).slice(0, 4_000);
    const acpSessionId = clip(body.acpSessionId, 80);
    const data: Prisma.WorkbuddyHostCommandUpdateInput = {};
    if (chunk && command.status === 'DISPATCHED') {
      const next = `${command.progressText}${chunk}`.slice(-PROGRESS_MAX);
      if (next !== command.progressText) data.progressText = next;
    }
    if (acpSessionId && acpSessionId !== command.acpSessionId) {
      data.acpSessionId = acpSessionId;
    }
    if (Object.keys(data).length) {
      await this.prisma.workbuddyHostCommand.update({
        where: { id: command.id },
        data,
      });
    }
    return { received: true, cancelRequested: command.cancelRequested };
  }

  /**
   * 终结回执：按 commandCode 幂等。
   * 结果文本写回会话气泡（assistant），并把关联的定时运行记录收成同一次终态。
   */
  async result(host: BotHostPrincipal, body: Record<string, unknown>) {
    const command = await this.loadHostCommand(host, body.commandCode);
    if (TERMINAL_COMMAND.has(command.status)) {
      return { received: true, duplicate: true };
    }
    const now = new Date();
    const canceled = command.cancelRequested || body.canceled === true;
    const okFlag = body.ok === true;
    const status = canceled ? 'CANCELED' : okFlag ? 'DONE' : 'FAILED';
    const resultText = text(body.text).slice(0, 20_000);
    const errorMessage = text(body.errorMessage).slice(0, 500);
    const effectiveWorkspace = clip(body.effectiveWorkspace, 300);
    const failReason = clip(body.failReason, 64);
    await this.prisma.workbuddyHostCommand.update({
      where: { id: command.id },
      data: {
        status,
        finishedAt: now,
        acpSessionId: clip(body.acpSessionId, 80) || command.acpSessionId,
        result: toJsonObject({
          text: resultText,
          errorMessage,
          elapsedMs: Math.max(0, Math.round(Number(body.elapsedMs) || 0)),
          effectiveWorkspace,
          failReason,
        }),
        error: status === 'DONE' ? '' : errorMessage || '主机执行未回传结果',
      },
    });
    if (command.conversationId && command.kind !== 'connect') {
      const bubble = resultText || `⚠️ ${errorMessage || '本轮执行失败'}`;
      await this.prisma.contentAgentMessage.create({
        data: {
          conversationId: command.conversationId,
          userId: host.userId,
          role: 'assistant',
          content: bubble,
          status:
            status === 'DONE'
              ? 'ok'
              : status === 'CANCELED'
                ? 'canceled'
                : 'failed',
        },
      });
      await this.touchConversation(command.conversationId, host.userId);
    }
    if (command.scheduleId) {
      await this.prisma.workbuddyHostScheduleRun.updateMany({
        where: {
          scheduleId: command.scheduleId,
          commandCode: command.commandCode,
        },
        data: {
          status:
            status === 'DONE'
              ? 'succeeded'
              : status === 'CANCELED'
                ? 'skipped'
                : 'failed',
          error: status === 'DONE' ? '' : errorMessage.slice(0, 500),
          finishedAt: now,
        },
      });
      await this.prisma.workbuddyHostSchedule.updateMany({
        where: { id: command.scheduleId, userId: host.userId },
        data: {
          lastStatus: status === 'DONE' ? 'succeeded' : 'failed',
          lastError: status === 'DONE' ? '' : errorMessage.slice(0, 500),
        },
      });
    }
    return { received: true, duplicate: false };
  }

  async logout(host: BotHostPrincipal) {
    await this.prisma.workbuddyHost.update({
      where: { id: host.id },
      data: { status: 'OFFLINE', lastSeenAt: null },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------- 本地 Agent

  /** 单主机工作区详情：默认目录 + 候选表，供对话框/定时表单的工作区下拉。 */
  async workspaces(
    user: CurrentUser,
    hostIdRaw: string,
  ): Promise<BotWorkspaceDetail> {
    const host = await this.loadHost(user, hostIdRaw);
    const caps = readWorkspaceCaps(toJsonObject(host.caps));
    return {
      defaultPath: caps.defaultPath,
      count: caps.list.length,
      list: caps.list,
    };
  }

  // ---------------------------------------------------------------- 内部

  /**
   * 下发前的目标校验只收口工作区：
   *   · 指定了工作区就必须命中客户端上报的候选表（平台不替用户猜路径）；
   *   · 没指定则回落到客户端默认工作区。
   * 客户端本地 Agent 怎么配模型、技能、分身与它能不能跑，是客户端自己的事：
   * 平台不拦也不提示，指令照常入队，跑不起来由客户端回执失败原因。
   */
  private resolveDispatchTarget(
    host: { caps: Prisma.JsonValue; workingDir: string; name: string },
    body: Record<string, unknown>,
  ): { cwd: string; mode: string } {
    const caps = readWorkspaceCaps(toJsonObject(host.caps));
    const requested = clip(body.workspace ?? body.cwd, 300);
    if (requested) {
      const key = workspaceKey(requested);
      const allowed = caps.list.some((ws) => workspaceKey(ws.path) === key);
      if (!allowed) {
        throw new BusinessException(
          ErrorCode.WORKSPACE_NOT_ALLOWED,
          `工作区「${requested}」不在这台主机的白名单里，请先在客户端里添加`,
        );
      }
    }
    const cwd = requested || caps.defaultPath || host.workingDir;
    return { cwd, mode: clip(body.mode, 24) };
  }

  private async loadHost(user: CurrentUser, hostIdRaw: string) {
    const id = parseId(hostIdRaw, '主机 ID');
    const row = await this.prisma.workbuddyHost.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '主机不存在');
    return row;
  }

  private async loadSchedule(user: CurrentUser, id: number) {
    const row = await this.prisma.workbuddyHostSchedule.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '计划任务不存在');
    return row;
  }

  private async loadHostCommand(host: BotHostPrincipal, raw: unknown) {
    const commandCode = clip(raw, 40);
    const row = await this.prisma.workbuddyHostCommand.findFirst({
      where: { commandCode, hostId: host.id },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '指令不存在或不属于本主机',
      );
    }
    return row;
  }

  private async enqueue(
    host: BotHostRowLike,
    input: BotHostCommandPayload & {
      kind: string;
      conversationId: number;
      title?: string;
      scheduleId?: number;
    },
  ) {
    const payload = toJsonObject({
      instruction: input.instruction,
      cwd: input.cwd || host.workingDir,
      timeoutSec: input.timeoutSec,
      mode: input.mode,
    });
    const row = await this.prisma.workbuddyHostCommand.create({
      data: {
        userId: host.userId,
        hostId: host.id,
        conversationId: input.conversationId,
        commandCode: newCommandCode(),
        kind: input.kind,
        title: (input.title || input.instruction).slice(0, 200),
        payload,
        status: 'PENDING',
        scheduleId: input.scheduleId || 0,
      },
    });
    // 用户气泡在入队时落一条，回执时补 assistant 气泡：对话框顺序即「说 → 做 → 回」。
    await this.prisma.contentAgentMessage.create({
      data: {
        conversationId: input.conversationId,
        userId: host.userId,
        role: 'user',
        content: input.instruction,
        status: 'ok',
      },
    });
    await this.touchConversation(input.conversationId, host.userId);
    return row;
  }

  /** 一台主机一个对话框：首用时建，并发下靠 hostId 唯一索引收敛回同一行。 */
  private async conversationIdOf(host: BotHostRowLike) {
    const existing = await this.prisma.workbuddyHostConversation.findUnique({
      where: { hostId: host.id },
      select: { conversationId: true },
    });
    if (existing) return existing.conversationId;
    const conversation = await this.prisma.contentAgentConversation.create({
      data: {
        userId: host.userId,
        title: host.name || 'Bot 主机',
        // 与 Agent 页的会话隔开：Agent 只列 scene=agent，主机对话只在自己的台面出现。
        scene: 'workbuddy_host',
      },
    });
    try {
      await this.prisma.workbuddyHostConversation.create({
        data: {
          hostId: host.id,
          userId: host.userId,
          conversationId: conversation.id,
          title: conversation.title,
        },
      });
    } catch {
      // 并发首用：另一路已建行，本次多出的会话空无消息，直接回收不落台账。
      await this.prisma.contentAgentMessage
        .deleteMany({ where: { conversationId: conversation.id } })
        .catch(() => undefined);
      await this.prisma.contentAgentConversation
        .deleteMany({ where: { id: conversation.id } })
        .catch(() => undefined);
      const fresh = await this.prisma.workbuddyHostConversation.findUnique({
        where: { hostId: host.id },
        select: { conversationId: true },
      });
      return fresh?.conversationId || conversation.id;
    }
    return conversation.id;
  }

  private async touchConversation(conversationId: number, userId: string) {
    await this.prisma.contentAgentConversation
      .update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })
      .catch(() => undefined);
    await this.prisma.workbuddyHostConversation
      .updateMany({
        where: { userId, conversationId },
        data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
      })
      .catch(() => undefined);
  }

  private async hostNames(userId: string, hostIds: number[]) {
    const unique = [...new Set(hostIds.filter(Boolean))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.workbuddyHost.findMany({
      where: { userId, id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** 下发给客户端的指令形状：只带执行所需的最小信息。 */
  private dispatchOf(row: Prisma.WorkbuddyHostCommandGetPayload<object>) {
    const payload = toJsonObject(row.payload);
    return {
      commandCode: row.commandCode,
      kind: row.kind,
      title: row.title,
      instruction: text(payload.instruction),
      cwd: text(payload.cwd),
      mode: text(payload.mode),
      timeoutSec: Number(payload.timeoutSec) || BOT_COMMAND_DEFAULT_TIMEOUT_SEC,
    };
  }

  private hostView(
    row: {
      id: number;
      name: string;
      platform: string;
      status: string;
      tokenPrefix: string;
      clientVersion: string;
      caps: Prisma.JsonValue;
      lastSeenAt: Date | null;
      lastIp: string;
      updatedAt: Date;
      createdAt: Date;
    },
    pendingCount: number,
    channelCount: number,
    grant: BotHostView['modelGrant'] = null,
  ): BotHostView {
    const online = botHostOnline({
      status: row.status,
      lastSeenAt: row.lastSeenAt,
    });
    // 落库只有 ONLINE/NEVER/DISABLED 三态；OFFLINE 由「心跳超时」现算，不写回库。
    const status =
      row.status === 'DISABLED'
        ? 'DISABLED'
        : row.status === 'NEVER'
          ? 'NEVER'
          : online
            ? 'ONLINE'
            : 'OFFLINE';
    const caps = readWorkspaceCaps(toJsonObject(row.caps));
    return {
      id: row.id,
      name: row.name || `Bot 主机 #${row.id}`,
      platform: row.platform,
      status,
      statusLabel: BOT_HOST_STATUS_LABELS[status] || status,
      online,
      lastSeenAt: iso(row.lastSeenAt),
      lastIp: row.lastIp,
      clientVersion: row.clientVersion,
      tokenPrefix: row.tokenPrefix,
      pendingCount,
      channelCount,
      // 列表只带摘要：N 台主机 × 每台最多 200 条工作区候选会把列表载荷撑爆。
      workspace: { defaultPath: caps.defaultPath, count: caps.list.length },
      modelGrant: grant,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private channelView(row: {
    id: number;
    kind: string;
    name: string;
    enabled: boolean;
    lastEventAt: Date | null;
    eventCount: number;
  }): BotChannelView {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      enabled: row.enabled,
      lastEventAt: iso(row.lastEventAt),
      eventCount: row.eventCount,
    };
  }

  private commandView(row: {
    id: number;
    commandCode: string;
    hostId: number;
    kind: string;
    title: string;
    payload: Prisma.JsonValue;
    status: string;
    error: string;
    result: Prisma.JsonValue;
    cancelRequested: boolean;
    createdAt: Date;
    dispatchedAt: Date | null;
    finishedAt: Date | null;
  }): BotCommandView {
    const statusLabel = BOT_COMMAND_STATUS_LABELS[row.status] || row.status;
    const payload = toJsonObject(row.payload);
    return {
      id: row.id,
      commandCode: row.commandCode,
      hostId: row.hostId,
      // 历史行可能还是已下线的 connect 类指令，视图按普通下发处理。
      kind: row.kind === 'schedule' ? 'schedule' : 'prompt',
      workspace: text(payload.cwd),
      effectiveWorkspace: text(toJsonObject(row.result).effectiveWorkspace),
      mode: text(payload.mode),
      title: row.title,
      instruction: text(payload.instruction),
      status: row.status,
      statusLabel,
      resultText: text(toJsonObject(row.result).text),
      error: row.error,
      canceled: row.cancelRequested,
      createdAt: row.createdAt.toISOString(),
      dispatchedAt: iso(row.dispatchedAt),
      finishedAt: iso(row.finishedAt),
    };
  }

  private messageView(row: {
    id: number;
    role: string;
    content: string;
    status: string;
    createdAt: Date;
  }): BotMessageView {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private scheduleView(
    row: Prisma.WorkbuddyHostScheduleGetPayload<object>,
    names: Map<number, string>,
  ): BotScheduleView {
    const payload = toJsonObject(row.payload);
    return {
      id: row.id,
      hostId: row.hostId,
      hostName: names.get(row.hostId) || `Bot 主机 #${row.hostId}`,
      workspace: text(payload.cwd),
      title: row.title,
      instruction: row.instruction,
      scheduleType: row.scheduleType,
      scheduleTypeLabel:
        SCHEDULE_TYPE_LABELS[row.scheduleType] || row.scheduleType,
      scheduleConfig: scheduleConfigOf(row.scheduleConfig),
      scheduledAt: iso(row.scheduledAt),
      status: row.status,
      statusLabel: BOT_SCHEDULE_STATUS_LABELS[row.status] || row.status,
      lastRunAt: iso(row.lastRunAt),
      lastStatus: row.lastStatus,
      lastStatusLabel:
        BOT_SCHEDULE_LAST_STATUS_LABELS[row.lastStatus] || row.lastStatus,
      lastError: row.lastError,
      runCount: row.runCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private scheduleRunView(
    row: {
      id: number;
      status: string;
      commandCode: string;
      error: string;
      startedAt: Date | null;
      finishedAt: Date | null;
    },
    command?: { status: string; error: string; finishedAt: Date | null },
  ): BotScheduleRunView {
    // 运行记录只在起轮时写 queued，终态由指令回执收口；回执前查询时按指令现算，避免状态挂住。
    const derived =
      command && !TERMINAL_COMMAND.has(row.status)
        ? command.status === 'DONE'
          ? 'succeeded'
          : command.status === 'CANCELED'
            ? 'skipped'
            : command.status === 'DISPATCHED'
              ? 'dispatched'
              : 'failed'
        : row.status;
    return {
      id: row.id,
      status: derived,
      commandCode: row.commandCode,
      error: row.error || (derived === 'succeeded' ? '' : command?.error || ''),
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt || command?.finishedAt || null),
    };
  }
}

/** 入队只需要这几列，定时下发与界面发送共用同一条路径。 */
type BotHostRowLike = {
  id: number;
  userId: string;
  name: string;
  workingDir: string;
};

// 供调度器与路由复用：指令终态判定收口在这里，避免各处再手写一份状态清单。
export function botCommandTerminal(status: string) {
  return TERMINAL_COMMAND.has(status);
}
