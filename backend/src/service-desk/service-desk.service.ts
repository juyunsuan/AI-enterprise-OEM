import { createHash, randomBytes } from 'node:crypto';
import {
  SERVICE_DESK_AGENT_STATUS_LABELS,
  SERVICE_DESK_AI_MODE_LABELS,
  SERVICE_DESK_CHANNEL_KINDS,
  SERVICE_DESK_CHANNEL_SPECS,
  SERVICE_DESK_CONVERSATION_STATUS_LABELS,
  SERVICE_DESK_ROLE_LABELS,
  type ServiceDeskChannelKind,
} from '@enterprise/contracts';
import {
  createAssistantToken,
  receiveAssistantMessage,
  sendAssistantMessage,
  testAssistantChannel,
  type AssistantInbound,
  type AssistantRequest,
  type AssistantReceive,
} from '../content/agent-assistant.channel';
import { ServiceDeskCrypto } from './service-desk-crypto';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { assertOutboundUrlSync } from '../http/outbound-guard';
import { CurrentUser } from '../auth/current-user';
import { IdentityService } from '../identity/identity.service';
import { UserLookupService } from '../directory/user-lookup.service';
import { NotificationService } from '../notifications/notification.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma';
import { toJsonInput } from '../common/json-input';
import { geoChatMulti, type ChatMessage } from '../geo/geo-llm.client';
import { meterChatCall } from '../ai/ai-gateway';

type Emit = (
  event: string,
  data: Record<string, unknown>,
) => void | Promise<void>;
type Listener = (event: string, data: Record<string, unknown>) => void;

/** 获客接待上下文（A8）：剧本段落 + 转人工触发词 + 回复后的档案写回。 */
export type AcqReceptionInput = {
  ownerUserId: string;
  conversationId: number;
  channelId: number;
  externalUserId: string;
  externalUserName: string;
  message: string;
};

export type AcqReceptionContext = {
  sections: { name: string; text: string }[];
  handoffTriggers: string[];
  handoffText: string;
  afterReply: (reply: string) => Promise<void>;
};

const MAX_MESSAGE = 4000;

/** 一次 AI 应答引用的知识出处（业主端问答与业务工具引用同一份结构）。 */
export type AiAnswerReference = { title: string; ref: string };

/** 知识库召回结果：拼进提示词的文本 + 可展示的出处清单。 */
export type AiKnowledgeResult = {
  text: string;
  references: AiAnswerReference[];
};

/**
 * 纯AI客服员工的一次应答（通用问答口，业务工具按 agentId 引用时同形返回）。
 * handoff=true 表示这条命中了转人工口径、按规则应交真人接手。
 */
export type AiAgentAnswer = {
  agentId: number;
  agentName: string;
  answer: string;
  references: AiAnswerReference[];
  handoff: boolean;
};

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const newToken = () => randomBytes(24).toString('hex');

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value))
    return value.map((item) => text(item)).filter(Boolean);
  return [];
};

/** AI 员工的接待台账（会话量/满意度/转人工），团队页签与概览卡共用。 */
export type AiAgentStats = {
  handledCount: number;
  activeCount: number;
  handoffCount: number;
  /** 0~1，转人工量 / 接待会话量 */
  handoffRate: number;
  ratingCount: number;
  /** 1~5，一位小数；无评分为 0 */
  ratingAvg: number;
};

/** 纯AI客服员工的接待时段（空对象＝全天）。 */
export type ServiceDeskWorkingHours = {
  days?: unknown;
  start?: unknown;
  end?: unknown;
};

/**
 * 会话应答模式口径：
 * - 由在岗 AI 员工接待时，以员工自己的 AUTO|BOT 为准——因为会话创建时会把当时的账号 `aiMode`
 *   快照写进 `row.aiMode`（永远非空），直接 `row.aiMode || 员工mode` 会让员工配置永远不生效；
 * - 例外只有两个：转人工（SUGGEST）与显式关停（OFF）是会话级动作，必须压过员工配置；
 * - 没有员工在岗时沿用原口径：会话快照优先，缺省回落账号设置。
 */
export function effectiveAiMode(
  rowAiMode: string,
  agentOrSettingMode: string,
  agentOnDuty: boolean,
) {
  if (!agentOnDuty) return rowAiMode || agentOrSettingMode;
  if (rowAiMode === 'SUGGEST' || rowAiMode === 'OFF') return rowAiMode;
  return agentOrSettingMode;
}

/** 试问接口带的上下文：只取文本消息，最多留 10 轮，防止把整段会话灌进提示词。 */
const asChatHistory = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-20)
    .map((item) => {
      const row = (item || {}) as { role?: unknown; content?: unknown };
      const role: ChatMessage['role'] =
        row.role === 'assistant' ? 'assistant' : 'user';
      return { role, content: text(row.content).trim().slice(0, 2000) };
    })
    .filter((item) => item.content);
};

const asIntList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 20);
};

/**
 * AI客服（账号级 SaaS）。
 * - 一个账号多个站点；访客只来自挂了接入代码的官网（匿名，凭访客令牌）；
 * - 真人接待：排队 → 接入 → 转接 → 结束邀评；
 * - AI 四种模式：固定文案 / 手动建议 / 自动回复（可转人工） / 纯AI接待（不转人工）。
 * - 纯AI客服员工（service_desk_ai_agents）是团队里的一类员工：人设、模型、知识库范围与转人工口径都挂在员工身上，
 *   自动分配可以把它派给会话；其它业务域要用 AI，只引用它的 id 走 answerForAgent，不在各自域内再造 AI。
 * 实时：进程内事件总线 + SSE，断线前端降级轮询；不引入 Redis / WebSocket。
 */
export class ServiceDeskService {
  private readonly listeners = new Map<string, Set<Listener>>();

  private readonly crypto = new ServiceDeskCrypto();

  /** 新会话建立后的计费钩子（services.ts 装配）：扣费失败不影响会话。 */
  pointsChargeSafely?: (
    userId: string,
    code: string,
    quantity: number,
    refId?: string,
  ) => Promise<void>;

  /**
   * 知识库召回钩子（AI 底座 §5 P1-A 统一挂载，services.ts 装配）：
   * - 传 spaceIds = 只在指定空间召回（纯AI客服员工自带的知识库范围）；
   * - 留空 = 按账号级 SERVICE_DESK 消费者绑定召回（老配置行为不变）。
   * 未装配或召回失败时静默跳过，不影响回复。
   */
  kbRecall?: (
    ownerUserId: string,
    query: string,
    spaceIds?: number[],
  ) => Promise<AiKnowledgeResult>;

  /**
   * 获客接待钩子（A8）：按渠道会话解析销售剧本与客户档案，
   * 返回要并入系统提示的段落，以及回复后的档案/跟进写回。未装配时保持原客服行为。
   */
  acqReception?: (
    input: AcqReceptionInput,
  ) => Promise<AcqReceptionContext | null>;

  /** 任务中心派单口（服务转任务）：只依赖 assign，避免客服反向依赖任务中心实现。 */
  tasks?: {
    assign(draft: {
      assigneeUserId: string;
      assigneeType?: 'USER' | 'ORG';
      orgType?: string;
      orgUserId?: string;
      assignedBy?: string;
      source: string;
      sourceId: string;
      title: string;
      description?: string;
      link: string;
      category: string;
      priority?: string;
      dueAt?: Date | string | null;
      createdBy?: string;
      sourceStatus?: string;
      sourceStatusLabel?: string;
      terminal?: boolean;
    }): Promise<unknown>;
  };

  /** 知识库写入口（解决稿→知识草稿）：按账号工作空间或 agent 默认空间写 PENDING_REVIEW 页。 */
  kbDraft?: (input: {
    ownerUserId: string;
    actorId: string;
    slug: string;
    title: string;
    body: string;
    spaceId?: number;
  }) => Promise<{ pageId: number; spaceId: number } | null>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly users: UserLookupService,
    private readonly notifications: NotificationService,
    private readonly assets: SystemAssetService,
    private readonly models: {
      resolveTarget: (
        user: CurrentUser,
        mediaType: 'text',
        token?: string,
        override?: { channelId: number; model: string },
      ) => Promise<{
        baseUrl: string;
        apiKey?: string;
        protocol?: string;
        model?: string;
      }>;
    },
  ) {}

  // ---------------------------------------------------------------- 事件总线

  subscribe(key: string, listener: Listener) {
    const set = this.listeners.get(key) || new Set<Listener>();
    set.add(listener);
    this.listeners.set(key, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(key);
    };
  }

  private publish(key: string, event: string, data: Record<string, unknown>) {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event, data);
      } catch {
        // 单个连接异常不影响其他订阅者
      }
    }
  }

  // ---------------------------------------------------------------- 组织与权限

  /** 客服成员必须是该账号组织内的在职成员（企业主本人始终可用）。 */
  async isOrgMember(ownerUserId: string, userId: string) {
    if (ownerUserId === userId) return true;
    const [enterpriseMember, providerMember] = await Promise.all([
      this.prisma.orgStaff.findFirst({
        where: {
          orgType: 'ENTERPRISE',
          orgUserId: ownerUserId,
          memberUserId: userId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.providerStaff.findFirst({
        where: {
          providerUserId: ownerUserId,
          staffUserId: userId,
          status: 'ACTIVE',
        },
      }),
    ]);
    return Boolean(enterpriseMember || providerMember);
  }

  async requireMember(user: CurrentUser, ownerUserId: string) {
    if (ownerUserId === user.userId) return { isOwner: true };
    const member = await this.isOrgMember(ownerUserId, user.userId);
    if (!member && !user.isAdmin()) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '你不是该账号的组织成员',
      );
    }
    return { isOwner: false };
  }

  private async ensureSetting(ownerUserId: string) {
    const exist = await this.prisma.serviceDeskSetting.findUnique({
      where: { ownerUserId },
    });
    if (exist) return exist;
    return this.prisma.serviceDeskSetting.create({ data: { ownerUserId } });
  }

  private settingView(row: {
    businessHours: unknown;
    welcomeText: string;
    queueText: string;
    offlineText: string;
    autoAssign: boolean;
    maxConcurrent: number;
    ratingEnabled: boolean;
    aiMode: string;
    aiChannelId: number;
    aiModel: string;
    aiHandoffKeywords: unknown;
    libraryIds: unknown;
    requireContact: boolean;
    retentionDays: number;
  }) {
    return {
      businessHours:
        row.businessHours && typeof row.businessHours === 'object'
          ? (row.businessHours as Record<string, unknown>)
          : {},
      welcomeText: row.welcomeText,
      queueText: row.queueText,
      offlineText: row.offlineText,
      autoAssign: row.autoAssign,
      maxConcurrent: row.maxConcurrent,
      ratingEnabled: row.ratingEnabled,
      aiMode: row.aiMode,
      aiModeLabel: SERVICE_DESK_AI_MODE_LABELS[row.aiMode] || row.aiMode,
      aiChannelId: row.aiChannelId,
      aiModel: row.aiModel,
      aiHandoffKeywords: asStringArray(row.aiHandoffKeywords),
      libraryIds: asStringArray(row.libraryIds)
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item)),
      requireContact: row.requireContact,
      retentionDays: row.retentionDays,
    };
  }

  async settings(user: CurrentUser) {
    const row = await this.ensureSetting(user.userId);
    return this.settingView(row);
  }

  async saveSettings(user: CurrentUser, body: Record<string, unknown>) {
    const row = await this.ensureSetting(user.userId);
    const updated = await this.prisma.serviceDeskSetting.update({
      where: { id: row.id },
      data: {
        ...(body.businessHours !== undefined
          ? { businessHours: toJsonInput(body.businessHours) }
          : {}),
        ...(typeof body.welcomeText === 'string'
          ? { welcomeText: body.welcomeText.slice(0, 1000) }
          : {}),
        ...(typeof body.queueText === 'string'
          ? { queueText: body.queueText.slice(0, 1000) }
          : {}),
        ...(typeof body.offlineText === 'string'
          ? { offlineText: body.offlineText.slice(0, 1000) }
          : {}),
        ...(typeof body.autoAssign === 'boolean'
          ? { autoAssign: body.autoAssign }
          : {}),
        ...(typeof body.maxConcurrent === 'number'
          ? { maxConcurrent: Math.min(50, Math.max(1, body.maxConcurrent)) }
          : {}),
        ...(typeof body.ratingEnabled === 'boolean'
          ? { ratingEnabled: body.ratingEnabled }
          : {}),
        ...(typeof body.aiMode === 'string' &&
        ['OFF', 'CANNED', 'SUGGEST', 'AUTO', 'BOT'].includes(body.aiMode)
          ? { aiMode: body.aiMode }
          : {}),
        ...(typeof body.aiChannelId === 'number'
          ? { aiChannelId: body.aiChannelId }
          : {}),
        ...(typeof body.aiModel === 'string'
          ? { aiModel: body.aiModel.slice(0, 128) }
          : {}),
        ...(Array.isArray(body.aiHandoffKeywords)
          ? { aiHandoffKeywords: toJsonInput(body.aiHandoffKeywords) }
          : {}),
        ...(Array.isArray(body.libraryIds)
          ? { libraryIds: toJsonInput(body.libraryIds) }
          : {}),
        ...(typeof body.requireContact === 'boolean'
          ? { requireContact: body.requireContact }
          : {}),
        ...(typeof body.retentionDays === 'number'
          ? {
              retentionDays: Math.min(3650, Math.max(7, body.retentionDays)),
            }
          : {}),
      },
    });
    return this.settingView(updated);
  }

  // ---------------------------------------------------------------- 站点

  private siteView(row: {
    id: number;
    siteKey: string;
    name: string;
    allowedOrigins: unknown;
    appearance: unknown;
    enabled: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      siteKey: row.siteKey,
      name: row.name,
      allowedOrigins: asStringArray(row.allowedOrigins),
      appearance:
        row.appearance && typeof row.appearance === 'object'
          ? (row.appearance as Record<string, unknown>)
          : {},
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async sites(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskSite.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.siteView(row));
  }

  /** 业务模块（品牌商城等）按 id 取本人站点；不存在或不属于本人返回 null。 */
  async siteRef(ownerUserId: string, id: number) {
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await this.prisma.serviceDeskSite.findFirst({
      where: { id, ownerUserId },
      select: { id: true, siteKey: true, name: true, enabled: true },
    });
    return row ?? null;
  }

  /**
   * 业务模块首次接入时幂等开通站点：同账号同名的复用，避免一次请求超时后重复建。
   * 来源白名单留空＝不限制，小程序 web-view 不携带浏览器 Origin。
   */
  async ensureSite(ownerUserId: string, name: string) {
    const siteName = text(name).trim().slice(0, 80) || '在线客服';
    const exist = await this.prisma.serviceDeskSite.findFirst({
      where: { ownerUserId, name: siteName },
      select: { id: true, siteKey: true, name: true, enabled: true },
    });
    if (exist) return exist;
    const count = await this.prisma.serviceDeskSite.count({
      where: { ownerUserId },
    });
    if (count >= 20) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '一个账号最多 20 个客服站点，已占满：请到「AI 客服 › 站点」删除不用的站点后重启商城，或直接在那里手动新建一个站点',
      );
    }
    const row = await this.prisma.serviceDeskSite.create({
      data: {
        ownerUserId,
        siteKey: `sk_${randomBytes(12).toString('hex')}`,
        name: siteName,
        allowedOrigins: toJsonInput([]),
        appearance: toJsonInput({ title: `${siteName} · 在线客服` }),
      },
      select: { id: true, siteKey: true, name: true, enabled: true },
    });
    return row;
  }

  /** 访客窗口外观：只按 siteKey 暴露名称/标题/主色/图标，不含来源白名单等配置。 */
  async publicSite(siteKey: string) {
    const site = await this.prisma.serviceDeskSite.findUnique({
      where: { siteKey: text(siteKey) },
    });
    if (!site || !site.enabled) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '客服站点不存在或已停用',
      );
    }
    const appearance =
      site.appearance && typeof site.appearance === 'object'
        ? (site.appearance as Record<string, unknown>)
        : {};
    return {
      name: site.name,
      appearance: {
        title: text(appearance.title),
        color: text(appearance.color),
        avatar: text(appearance.avatar),
      },
    };
  }

  async saveSite(user: CurrentUser, body: Record<string, unknown>) {
    const name = text(body.name).trim().slice(0, 80);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写站点名称');
    const origins = asStringArray(body.allowedOrigins)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
    const appearance =
      body.appearance && typeof body.appearance === 'object'
        ? (body.appearance as Record<string, unknown>)
        : {};
    const id = Number(body.id || 0);
    if (id) {
      const exist = await this.prisma.serviceDeskSite.findFirst({
        where: { id, ownerUserId: user.userId },
      });
      if (!exist)
        throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
      const row = await this.prisma.serviceDeskSite.update({
        where: { id: exist.id },
        data: {
          name,
          allowedOrigins: toJsonInput(origins),
          appearance: toJsonInput(appearance),
          ...(typeof body.enabled === 'boolean'
            ? { enabled: body.enabled }
            : {}),
        },
      });
      return this.siteView(row);
    }
    const count = await this.prisma.serviceDeskSite.count({
      where: { ownerUserId: user.userId },
    });
    if (count >= 20) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '一个账号最多 20 个站点',
      );
    }
    const row = await this.prisma.serviceDeskSite.create({
      data: {
        ownerUserId: user.userId,
        siteKey: `sk_${randomBytes(12).toString('hex')}`,
        name,
        allowedOrigins: toJsonInput(origins),
        appearance: toJsonInput(appearance),
      },
    });
    return this.siteView(row);
  }

  async removeSite(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskSite.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    await this.prisma.serviceDeskSite.delete({ where: { id: exist.id } });
    return { removed: true };
  }

  async rotateSiteKey(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskSite.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    const row = await this.prisma.serviceDeskSite.update({
      where: { id: exist.id },
      data: { siteKey: `sk_${randomBytes(12).toString('hex')}` },
    });
    return this.siteView(row);
  }

  /** 客户自传客服入口图标：PNG/JPG/WEBP/GIF，单件 2MB，存入 OSS 后写进站点外观。 */
  async uploadIcon(user: CurrentUser, body: Record<string, unknown>) {
    const name = text(body.name).trim().slice(0, 120) || 'icon.png';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const normalized = ext === 'jpeg' ? 'jpg' : ext;
    if (!/^(png|jpg|webp|gif)$/.test(normalized)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '图标仅支持 PNG / JPG / WEBP / GIF',
      );
    }
    const content = Buffer.from(
      text(body.contentBase64).replace(/^data:[^,]+,/, ''),
      'base64',
    );
    if (!content.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '图标内容为空');
    }
    if (content.length > 2 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '图标不能超过 2MB',
      );
    }
    // 站点图标字节入账到操作人账号：不再产生无账字节
    const uploaded = await this.assets.put({
      ownerUserId: user.userId,
      path: `service-desk/site-icon/${user.userId}/${Date.now()}-${randomBytes(
        4,
      ).toString('hex')}.${normalized}`,
      bytes: content,
      name,
      assetType: 'image',
      bizRef: 'service-desk-site-icon',
    });
    return { url: uploaded.url, name, size: uploaded.size };
  }

  // ---------------------------------------------------------------- 渠道接入

  private channelSpec(kind: string) {
    return SERVICE_DESK_CHANNEL_SPECS.find((item) => item.kind === kind);
  }

  /** 自定义渠道在保存时就把必然发送失败/解析不了的配置挡掉。 */
  private assertCustomChannel(config: Record<string, string>) {
    const fail = (message: string): never => {
      throw new BusinessException(ErrorCode.BAD_REQUEST, message);
    };
    assertOutboundUrlSync(config.outboundUrl || '');
    let mapping: unknown;
    try {
      mapping = JSON.parse(config.inboundMapping || '{}');
    } catch {
      fail('入站映射不是合法 JSON');
    }
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      fail('入站映射必须是 JSON 对象');
    }
    const map = mapping as Record<string, unknown>;
    if (!text(map.chatId).trim() || !text(map.text).trim()) {
      fail('入站映射必须包含 chatId 与 text 两个路径');
    }
    if (map.extra !== undefined) {
      const extra = map.extra;
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
        fail('入站映射的 extra 必须是「字段名 → JSON 路径」的对象');
      }
      const entries = Object.entries(extra as Record<string, unknown>);
      if (entries.length > 20) fail('入站映射的 extra 最多 20 个字段');
      for (const [key, path] of entries) {
        if (!key.trim()) fail('入站映射的 extra 不能有空字段名');
        if (!text(path).trim()) fail(`入站映射 extra.${key} 需要填 JSON 路径`);
      }
    }
    const headers = text(config.outboundHeaders).trim();
    if (headers) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(headers);
      } catch {
        fail('出站请求头不是合法 JSON');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail('出站请求头必须是 JSON 对象');
      }
    }
    const method = (text(config.outboundMethod).trim() || 'POST').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fail('出站方法只支持 GET/POST/PUT/PATCH/DELETE');
    }
    const mode = (text(config.securityMode).trim() || 'none').toLowerCase();
    if (!['none', 'header', 'hmac'].includes(mode)) {
      fail('校验方式只能是 none / header / hmac');
    }
    if (mode !== 'none' && !text(config.securitySecret).trim()) {
      fail('请填写「校验密钥」，或把校验方式改成 none');
    }
    const ack = Number(text(config.ackStatus).trim() || 200);
    if (!Number.isInteger(ack) || ack < 200 || ack > 599) {
      fail('回执状态码需要 200–599 之间的整数');
    }
    if (text(config.ackBody).length > 500) fail('回执内容最多 500 字');
  }

  private channelView(row: {
    id: number;
    kind: string;
    name: string;
    config: string;
    callbackToken: string;
    enabled: boolean;
    lastEventAt: Date | null;
    lastError: string;
    createdAt: Date;
  }) {
    const spec = this.channelSpec(row.kind);
    let config: Record<string, string> = {};
    try {
      config = this.crypto.openConfig(row.config);
    } catch {
      config = {};
    }
    const fields = spec?.fields || [];
    const publicConfig: Record<string, string> = {};
    for (const field of fields) {
      if (!field.secret && config[field.key])
        publicConfig[field.key] = config[field.key];
    }
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: spec?.label || row.kind,
      name: row.name,
      enabled: row.enabled,
      callbackPath: `/api/public/service-desk/channel/${row.callbackToken}`,
      config: publicConfig,
      configured: fields
        .map((field) => field.key)
        .filter((key) => Boolean(config[key])),
      secretKeys: fields
        .filter((field) => field.secret)
        .map((field) => field.key),
      lastEventAt: row.lastEventAt ? row.lastEventAt.toISOString() : '',
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async channels(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskChannel.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.channelView(row));
  }

  async saveChannel(user: CurrentUser, body: Record<string, unknown>) {
    const id = Number(body.id || 0);
    const exist = id
      ? await this.prisma.serviceDeskChannel.findFirst({
          where: { id, ownerUserId: user.userId },
        })
      : null;
    if (id && !exist) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    }
    const kind = exist ? exist.kind : text(body.kind);
    if (!SERVICE_DESK_CHANNEL_KINDS.includes(kind as ServiceDeskChannelKind)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的渠道类型');
    }
    const spec = this.channelSpec(kind);
    if (!spec) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的渠道类型');
    }
    const name = text(body.name).trim().slice(0, 80) || spec.label;
    const incoming =
      body.config &&
      typeof body.config === 'object' &&
      !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {};
    let stored: Record<string, string> = {};
    if (exist) {
      try {
        stored = this.crypto.openConfig(exist.config);
      } catch {
        stored = {};
      }
    }
    for (const field of spec.fields) {
      const value = text(incoming[field.key]).trim();
      if (value) {
        stored[field.key] = value.slice(0, field.multiline ? 8000 : 500);
      }
    }
    const config: Record<string, string> = {};
    for (const field of spec.fields) {
      if (stored[field.key]) config[field.key] = stored[field.key];
    }
    const missing = spec.fields.filter(
      (field) => field.required && !config[field.key],
    );
    if (missing.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `请填写「${missing.map((field) => field.label).join('、')}」`,
      );
    }
    if (kind === 'custom') this.assertCustomChannel(config);
    const enabled =
      typeof body.enabled === 'boolean'
        ? body.enabled
        : (exist?.enabled ?? true);
    if (exist) {
      const row = await this.prisma.serviceDeskChannel.update({
        where: { id: exist.id },
        data: {
          name,
          config: this.crypto.sealConfig(config),
          enabled,
        },
      });
      return this.channelView(row);
    }
    const count = await this.prisma.serviceDeskChannel.count({
      where: { ownerUserId: user.userId },
    });
    if (count >= 20) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '一个账号最多 20 条渠道接入',
      );
    }
    const row = await this.prisma.serviceDeskChannel.create({
      data: {
        ownerUserId: user.userId,
        kind,
        name,
        config: this.crypto.sealConfig(config),
        callbackToken: createAssistantToken(),
        enabled,
      },
    });
    return this.channelView(row);
  }

  async removeChannel(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskChannel.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    }
    await this.prisma.serviceDeskChannel.delete({ where: { id: exist.id } });
    return { removed: true };
  }

  async testChannel(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskChannel.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    }
    const config = this.crypto.openConfig(exist.config);
    return testAssistantChannel(exist.kind as ServiceDeskChannelKind, config);
  }

  /**
   * 官方平台回调：按回调地址里的随机串定位渠道，解密凭据后交给同一套通道适配层。
   * 平台要求的原始响应（echostr / challenge / success）原样返回。
   */
  async receiveChannel(
    token: string,
    request: AssistantRequest,
  ): Promise<AssistantReceive> {
    const channel = await this.prisma.serviceDeskChannel.findUnique({
      where: { callbackToken: token },
    });
    if (!channel) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    }
    if (!channel.enabled) {
      return { response: { status: 200, body: '' }, events: [] };
    }
    try {
      const config = this.crypto.openConfig(channel.config);
      const received = await receiveAssistantMessage(
        channel.kind as ServiceDeskChannelKind,
        config,
        request,
        channel.cursor,
      );
      for (const event of received.events) {
        await this.bridgeChannelEvent(channel, event);
      }
      await this.prisma.serviceDeskChannel.update({
        where: { id: channel.id },
        data: {
          lastEventAt: new Date(),
          lastError: '',
          ...(received.cursor !== undefined &&
          received.cursor !== channel.cursor
            ? { cursor: received.cursor }
            : {}),
        },
      });
      return received;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '渠道回调处理失败';
      await this.prisma.serviceDeskChannel
        .update({
          where: { id: channel.id },
          data: { lastError: message.slice(0, 500) },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  /** 外部消息 → 客服会话：按（渠道 + 外部会话）复用未结束的会话，消息 ID 去重。 */
  private async bridgeChannelEvent(
    channel: { id: number; ownerUserId: string; name: string },
    event: AssistantInbound,
  ) {
    const setting = await this.ensureSetting(channel.ownerUserId);
    const displayName = (event.userName || event.userId || '外部访客').slice(
      0,
      120,
    );
    const tokenHash = hashToken(`channel|${channel.id}|${event.chatId}`);
    let visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { tokenHash },
    });
    visitor = visitor
      ? await this.prisma.serviceDeskVisitor.update({
          where: { id: visitor.id },
          data: { lastSeenAt: new Date(), nickname: displayName.slice(0, 60) },
        })
      : await this.prisma.serviceDeskVisitor.create({
          data: {
            ownerUserId: channel.ownerUserId,
            siteId: 0,
            tokenHash,
            nickname: displayName.slice(0, 60),
          },
        });
    let conversation = await this.prisma.serviceDeskConversation.findFirst({
      where: {
        ownerUserId: channel.ownerUserId,
        channelId: channel.id,
        externalChatId: event.chatId,
        status: { in: ['waiting', 'active'] },
      },
      orderBy: { id: 'desc' },
    });
    const eventExtras = this.channelExtras(event.extra);
    if (!conversation) {
      const pureAi = setting.aiMode === 'BOT';
      conversation = await this.prisma.serviceDeskConversation.create({
        data: {
          ownerUserId: channel.ownerUserId,
          orgType: 'ENTERPRISE',
          orgUserId: channel.ownerUserId,
          siteId: 0,
          visitorId: visitor.id,
          channelId: channel.id,
          externalChatId: event.chatId.slice(0, 191),
          externalUserId: event.userId.slice(0, 191),
          externalUserName: displayName.slice(0, 120),
          externalMessageId: event.messageId.slice(0, 191),
          externalMeta: eventExtras,
          aiMode: setting.aiMode,
          status: pureAi ? 'active' : 'waiting',
          subject: channel.name.slice(0, 120),
        },
      });
      if (!pureAi) {
        await this.assignIfPossible(channel.ownerUserId, conversation.id);
      }
      if (this.pointsChargeSafely) {
        await this.pointsChargeSafely(
          channel.ownerUserId,
          'ai_customer',
          1,
          String(conversation.id),
        ).catch(() => undefined);
      }
    } else if (Object.keys(eventExtras).length) {
      // 自定义渠道的会话级额外字段随每条入站消息刷新，出站模板据此带回
      conversation = await this.prisma.serviceDeskConversation.update({
        where: { id: conversation.id },
        data: {
          externalMeta: {
            ...this.channelExtras(conversation.externalMeta),
            ...eventExtras,
          },
        },
      });
    }
    const externalMsgId = event.messageId.slice(0, 191);
    if (externalMsgId) {
      const exist = await this.prisma.serviceDeskMessage.findFirst({
        where: { conversationId: conversation.id, externalMsgId },
      });
      if (exist) return;
    }
    const content = event.text.slice(0, MAX_MESSAGE);
    const message = await this.prisma.serviceDeskMessage.create({
      data: {
        conversationId: conversation.id,
        senderType: 'visitor',
        content,
        externalMsgId,
      },
    });
    await this.touchConversation(conversation.id, {
      lastMessageAt: new Date(),
      unreadForAgent: { increment: 1 },
      externalUserId: event.userId.slice(0, 191),
      externalUserName: displayName.slice(0, 120),
      externalMessageId: externalMsgId,
    });
    this.publish(`conv:${conversation.id}`, 'message', {
      message: this.messageView(message, new Map()),
    });
    this.publish(`owner:${channel.ownerUserId}`, 'conversation', {
      id: conversation.id,
      visitorMessage: true,
    });
    await this.notifyAgents(
      channel.ownerUserId,
      `${channel.name}收到新消息`,
      content.slice(0, 80),
      `/service-desk?conversation=${conversation.id}`,
    );
    void this.autoReply(channel.ownerUserId, conversation.id).catch(
      () => undefined,
    );
  }

  /** 会话级额外字段只保留字符串值，出站模板按 {{extra.key}} 取用。 */
  private channelExtras(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const extras: Record<string, string> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (typeof item === 'string') {
        extras[key.slice(0, 40)] = item.slice(0, 500);
      }
    }
    return extras;
  }

  private channelTargetOf(row: {
    channelId: number;
    externalChatId: string;
    externalUserId: string;
    externalUserName?: string;
    externalMeta?: unknown;
  }) {
    if (row.channelId <= 0 || !row.externalChatId) return null;
    return {
      channelId: row.channelId,
      chatId: row.externalChatId,
      userId: row.externalUserId || row.externalChatId,
      userName: row.externalUserName || '',
      extra: this.channelExtras(row.externalMeta),
    };
  }

  /**
   * 会话回复回流到外部平台。辅助链路：失败只记渠道 lastError 并提示一次，
   * 不阻断工作台里已经落库的回复。
   */
  private async deliverChannel(
    ownerUserId: string,
    conversationId: number,
    target: {
      channelId: number;
      chatId: string;
      userId: string;
      userName?: string;
      extra?: Record<string, string>;
    },
    content: string,
    throwOnError = false,
  ) {
    if (!content.trim()) return;
    const channel = await this.prisma.serviceDeskChannel.findFirst({
      where: { id: target.channelId, ownerUserId },
    });
    if (!channel || !channel.enabled) return;
    try {
      const config = this.crypto.openConfig(channel.config);
      await sendAssistantMessage(
        channel.kind as ServiceDeskChannelKind,
        config,
        {
          chatId: target.chatId,
          userId: target.userId,
          userName: target.userName || '',
          extra: target.extra || {},
          replyTarget: {},
          messageId: '',
        },
        content,
      );
      if (channel.lastError) {
        await this.prisma.serviceDeskChannel.update({
          where: { id: channel.id },
          data: { lastError: '' },
        });
      }
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : '渠道发送失败'
      ).slice(0, 500);
      await this.prisma.serviceDeskChannel
        .update({
          where: { id: channel.id },
          data: { lastError: message },
        })
        .catch(() => undefined);
      if (throwOnError) throw error;
      if (!channel.lastError) {
        await this.prisma.serviceDeskMessage
          .create({
            data: {
              conversationId,
              senderType: 'system',
              content: `渠道派发失败：${message}（后续同类失败不再提示）`,
            },
          })
          .catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------- 客服组 / 成员

  async groups(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskGroup.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      categories: asStringArray(row.categories),
      enabled: row.enabled,
    }));
  }

  async saveGroup(user: CurrentUser, body: Record<string, unknown>) {
    const name = text(body.name).trim().slice(0, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写客服组名称');
    const categories = asStringArray(body.categories).slice(0, 30);
    const id = Number(body.id || 0);
    if (id) {
      const exist = await this.prisma.serviceDeskGroup.findFirst({
        where: { id, ownerUserId: user.userId },
      });
      if (!exist)
        throw new BusinessException(ErrorCode.NOT_FOUND, '客服组不存在');
      const row = await this.prisma.serviceDeskGroup.update({
        where: { id: exist.id },
        data: {
          name,
          categories: toJsonInput(categories),
          ...(typeof body.enabled === 'boolean'
            ? { enabled: body.enabled }
            : {}),
        },
      });
      return {
        id: row.id,
        name: row.name,
        categories: asStringArray(row.categories),
        enabled: row.enabled,
      };
    }
    const row = await this.prisma.serviceDeskGroup.create({
      data: {
        ownerUserId: user.userId,
        name,
        categories: toJsonInput(categories),
      },
    });
    return {
      id: row.id,
      name: row.name,
      categories: asStringArray(row.categories),
      enabled: row.enabled,
    };
  }

  async removeGroup(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskGroup.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist)
      throw new BusinessException(ErrorCode.NOT_FOUND, '客服组不存在');
    await this.prisma.serviceDeskGroup.delete({ where: { id: exist.id } });
    return { removed: true };
  }

  private async agentNames(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Map<string, string>();
    const directory = await this.users.lookup(ids);
    return new Map(
      directory.map((item) => [
        item.id,
        text(item.displayName) || text(item.username) || item.id,
      ]),
    );
  }

  async agents(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskAgent.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
    });
    const names = await this.agentNames(rows.map((row) => row.memberUserId));
    const counts = await this.prisma.serviceDeskConversation.groupBy({
      by: ['assigneeUserId'],
      where: { ownerUserId: user.userId, status: 'active' },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((item) => [item.assigneeUserId, item._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      memberUserId: row.memberUserId,
      memberName: names.get(row.memberUserId) || row.memberUserId,
      role: row.role,
      roleLabel: SERVICE_DESK_ROLE_LABELS[row.role] || row.role,
      groupId: row.groupId,
      status: row.status,
      statusLabel: SERVICE_DESK_AGENT_STATUS_LABELS[row.status] || row.status,
      maxConcurrent: row.maxConcurrent,
      activeCount: countMap.get(row.memberUserId) || 0,
      online: row.status === 'ONLINE' || row.status === 'AWAY',
    }));
  }

  async saveAgent(user: CurrentUser, body: Record<string, unknown>) {
    const memberUserId = text(body.memberUserId).trim();
    if (!memberUserId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择客服成员');
    }
    if (!(await this.isOrgMember(user.userId, memberUserId))) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只能添加本组织的职员或代理人作为客服',
      );
    }
    const role = ['owner', 'lead', 'agent'].includes(text(body.role))
      ? text(body.role)
      : 'agent';
    const groupId = Number(body.groupId || 0);
    const maxConcurrent = Math.min(
      50,
      Math.max(1, Number(body.maxConcurrent || 5)),
    );
    const row = await this.prisma.serviceDeskAgent.upsert({
      where: {
        ownerUserId_memberUserId: {
          ownerUserId: user.userId,
          memberUserId,
        },
      },
      create: {
        ownerUserId: user.userId,
        memberUserId,
        role,
        groupId,
        maxConcurrent,
        status: 'OFFLINE',
      },
      update: { role, groupId, maxConcurrent },
    });
    const names = await this.agentNames([row.memberUserId]);
    return {
      id: row.id,
      memberUserId: row.memberUserId,
      memberName: names.get(row.memberUserId) || row.memberUserId,
      role: row.role,
      roleLabel: SERVICE_DESK_ROLE_LABELS[row.role] || row.role,
      groupId: row.groupId,
      status: row.status,
      statusLabel: SERVICE_DESK_AGENT_STATUS_LABELS[row.status] || row.status,
      maxConcurrent: row.maxConcurrent,
      activeCount: 0,
      online: row.status === 'ONLINE' || row.status === 'AWAY',
    };
  }

  async removeAgent(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskAgent.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist)
      throw new BusinessException(ErrorCode.NOT_FOUND, '客服成员不存在');
    await this.prisma.serviceDeskAgent.delete({ where: { id: exist.id } });
    return { removed: true };
  }

  async setStatus(user: CurrentUser, ownerUserId: string, status: string) {
    const next = ['ONLINE', 'AWAY', 'OFFLINE'].includes(status)
      ? status
      : 'OFFLINE';
    const row = await this.prisma.serviceDeskAgent.upsert({
      where: {
        ownerUserId_memberUserId: {
          ownerUserId,
          memberUserId: user.userId,
        },
      },
      create: {
        ownerUserId,
        memberUserId: user.userId,
        role: ownerUserId === user.userId ? 'owner' : 'agent',
        status: next,
      },
      update: { status: next },
    });
    this.publish(`owner:${ownerUserId}`, 'agent-status', {
      userId: user.userId,
      status: next,
    });
    return { status: row.status };
  }

  /** 自己这一侧的客服身份（当前账号的客服工作台）。 */
  async myAgent(user: CurrentUser, ownerUserId?: string) {
    const owner = ownerUserId || user.userId;
    return this.prisma.serviceDeskAgent.findUnique({
      where: {
        ownerUserId_memberUserId: {
          ownerUserId: owner,
          memberUserId: user.userId,
        },
      },
    });
  }

  private async isManager(ownerUserId: string, userId: string) {
    if (ownerUserId === userId) return true;
    const agent = await this.prisma.serviceDeskAgent.findUnique({
      where: {
        ownerUserId_memberUserId: { ownerUserId, memberUserId: userId },
      },
    });
    return agent?.role === 'owner' || agent?.role === 'lead';
  }

  // ---------------------------------------------------------------- 会话

  private async namesFor(rows: { assigneeUserId: string }[]) {
    return this.agentNames(rows.map((row) => row.assigneeUserId));
  }

  private conversationView(
    row: {
      id: number;
      siteId: number;
      channelId: number;
      groupId: number;
      assigneeUserId: string;
      assigneeType?: string;
      aiAgentId?: number;
      visitorId: number;
      status: string;
      crmLeadId: number;
      subject: string;
      sourceUrl: string;
      unreadForAgent: number;
      lastMessageAt: Date;
      rating: number;
      aiMode: string;
      createdAt: Date;
    },
    meta: {
      siteNames: Map<number, string>;
      channelNames: Map<number, string>;
      agentNames: Map<string, string>;
      aiAgentNames?: Map<number, string>;
      visitorNames: Map<number, { nickname: string; contact: string }>;
      lastMessages: Map<number, string>;
    },
  ) {
    const visitor = meta.visitorNames.get(row.visitorId);
    return {
      id: row.id,
      siteId: row.siteId,
      siteName:
        row.channelId > 0
          ? meta.channelNames.get(row.channelId) || '外部渠道'
          : meta.siteNames.get(row.siteId) || '',
      groupId: row.groupId,
      assigneeUserId: row.assigneeUserId,
      assigneeName: meta.agentNames.get(row.assigneeUserId) || '',
      // 接待方：真人坐席或纯AI客服员工，前端据此显示「AI 接待中 / 真人接待」。
      assigneeType: row.assigneeType || (row.aiAgentId ? 'AI' : 'USER'),
      aiAgentId: row.aiAgentId || 0,
      aiAgentName: meta.aiAgentNames?.get(row.aiAgentId || 0) || '',
      visitorName: visitor?.nickname || `访客 #${row.visitorId}`,
      visitorContact: visitor?.contact || '',
      status: row.status,
      statusLabel:
        SERVICE_DESK_CONVERSATION_STATUS_LABELS[row.status] || row.status,
      crmLeadId: row.crmLeadId,
      subject: row.subject,
      sourceUrl: row.sourceUrl,
      unread: row.unreadForAgent,
      lastMessageAt: row.lastMessageAt.toISOString(),
      lastMessage: meta.lastMessages.get(row.id) || '',
      rating: row.rating,
      aiMode: row.aiMode,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async buildMeta(
    rows: {
      id: number;
      siteId: number;
      channelId: number;
      assigneeUserId: string;
      visitorId: number;
      aiAgentId?: number;
    }[],
  ) {
    const channelIds = [...new Set(rows.map((row) => row.channelId))].filter(
      (id) => id > 0,
    );
    const aiAgentIds = [
      ...new Set(rows.map((row) => row.aiAgentId || 0)),
    ].filter((id) => id > 0);
    const [sites, channels, agents, visitors, lastMessages, aiAgents] =
      await Promise.all([
        this.prisma.serviceDeskSite.findMany({
          where: { id: { in: [...new Set(rows.map((row) => row.siteId))] } },
        }),
        channelIds.length
          ? this.prisma.serviceDeskChannel.findMany({
              where: { id: { in: channelIds } },
            })
          : Promise.resolve([] as { id: number; name: string }[]),
        this.agentNames(rows.map((row) => row.assigneeUserId)),
        this.prisma.serviceDeskVisitor.findMany({
          where: { id: { in: [...new Set(rows.map((row) => row.visitorId))] } },
        }),
        Promise.all(
          rows.map(async (row) => {
            const message = await this.prisma.serviceDeskMessage.findFirst({
              where: { conversationId: row.id },
              orderBy: { id: 'desc' },
            });
            return [row.id, message?.content || ''] as const;
          }),
        ),
        aiAgentIds.length
          ? this.prisma.serviceDeskAiAgent.findMany({
              where: { id: { in: aiAgentIds } },
              select: { id: true, name: true },
            })
          : Promise.resolve([] as { id: number; name: string }[]),
      ]);
    return {
      siteNames: new Map(sites.map((item) => [item.id, item.name])),
      channelNames: new Map(channels.map((item) => [item.id, item.name])),
      agentNames: agents,
      aiAgentNames: new Map(aiAgents.map((item) => [item.id, item.name])),
      visitorNames: new Map(
        visitors.map((item) => [
          item.id,
          { nickname: item.nickname, contact: item.contact },
        ]),
      ),
      lastMessages: new Map(lastMessages),
    };
  }

  async conversations(
    user: CurrentUser,
    query: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      mine?: boolean | string;
    },
  ) {
    const ownerUserId = user.userId;
    const manager = await this.isManager(ownerUserId, user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const mine = query.mine === true || query.mine === 'true';
    const where = {
      ownerUserId,
      ...(query.status ? { status: query.status } : {}),
      ...(!manager || mine
        ? {
            OR: [{ assigneeUserId: user.userId }, { status: 'waiting' }],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.serviceDeskConversation.count({ where }),
      this.prisma.serviceDeskConversation.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const meta = await this.buildMeta(rows);
    return pageOf(
      rows.map((row) => this.conversationView(row, meta)),
      total,
      page,
      pageSize,
    );
  }

  private messageView(
    row: {
      id: number;
      conversationId: number;
      senderType: string;
      senderUserId: string;
      contentType: string;
      content: string;
      attachmentUrl: string;
      attachmentName: string;
      attachmentSize: number;
      createdAt: Date;
    },
    names: Map<string, string>,
  ) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderType: row.senderType,
      senderName:
        row.senderType === 'visitor'
          ? '访客'
          : row.senderType === 'ai'
            ? 'AI 助手'
            : row.senderType === 'system'
              ? '系统'
              : names.get(row.senderUserId) || row.senderUserId,
      contentType: row.contentType,
      content: row.content,
      attachmentUrl: row.attachmentUrl,
      attachmentName: row.attachmentName,
      attachmentSize: row.attachmentSize,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async conversation(user: CurrentUser, ownerUserId: string, id: number) {
    await this.requireMember(user, ownerUserId);
    const manager = await this.isManager(ownerUserId, user.userId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    if (
      !manager &&
      row.assigneeUserId !== user.userId &&
      row.status !== 'waiting'
    ) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该会话已由其他客服接待',
      );
    }
    const [messages, visitor, meta] = await Promise.all([
      this.prisma.serviceDeskMessage.findMany({
        where: { conversationId: id },
        orderBy: { id: 'asc' },
        take: 500,
      }),
      this.prisma.serviceDeskVisitor.findUnique({
        where: { id: row.visitorId },
      }),
      this.buildMeta([row]),
    ]);
    const names = meta.agentNames;
    return {
      conversation: this.conversationView(row, meta),
      visitor: {
        nickname: visitor?.nickname || '',
        contact: visitor?.contact || '',
        firstSeenAt: visitor ? visitor.firstSeenAt.toISOString() : '',
        lastSeenAt: visitor ? visitor.lastSeenAt.toISOString() : '',
      },
      messages: messages.map((item) => this.messageView(item, names)),
    };
  }

  private async touchConversation(
    id: number,
    patch: Prisma.ServiceDeskConversationUncheckedUpdateInput,
  ) {
    return this.prisma.serviceDeskConversation.update({
      where: { id },
      data: patch,
    });
  }

  /**
   * 客服会话转 CRM 线索：同一会话幂等，访客昵称/联系方式直接带入线索，
   * 会话主题与最近消息进备注，方便销售接着聊。需要 CRM 成员（或账号所有者）权限。
   */
  async convertToCrm(
    user: CurrentUser,
    ownerUserId: string,
    id: number,
    body: Record<string, unknown>,
  ) {
    await this.requireMember(user, ownerUserId);
    if (ownerUserId !== user.userId) {
      const member = await this.prisma.crmMember.findUnique({
        where: {
          ownerUserId_memberUserId: {
            ownerUserId,
            memberUserId: user.userId,
          },
        },
      });
      if (!member || member.status !== 'ACTIVE' || member.role === 'READONLY') {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '需要 CRM 成员权限才能转线索',
        );
      }
    }
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    if (row.crmLeadId > 0) {
      return { conversationId: row.id, crmLeadId: row.crmLeadId };
    }
    const visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { id: row.visitorId },
    });
    const rawContact = text(visitor?.contact).trim();
    const digits = rawContact.replace(/\D/g, '');
    const phone =
      text(body.phone).trim() || (/^1\d{10}$/.test(digits) ? digits : '');
    const email =
      text(body.email).trim() ||
      (rawContact.includes('@') ? rawContact.slice(0, 120) : '');
    const name =
      text(body.name).trim() ||
      visitor?.nickname ||
      row.externalUserName ||
      row.subject ||
      `访客 #${row.visitorId}`;
    const latest = await this.prisma.serviceDeskMessage.findFirst({
      where: { conversationId: row.id, senderType: 'visitor' },
      orderBy: { id: 'desc' },
    });
    const lead = await this.prisma.crmLead.create({
      data: {
        ownerUserId,
        orgType: row.orgType || 'ENTERPRISE',
        orgUserId: row.orgUserId || ownerUserId,
        name: name.slice(0, 120),
        contactName: name.slice(0, 60),
        phone: phone.slice(0, 40),
        phoneNorm: phone.replace(/\D/g, '').slice(0, 40),
        email: email.slice(0, 120),
        emailNorm: email.toLowerCase().slice(0, 160),
        source: '在线客服',
        stage: 'NEW',
        ownerId: row.assigneeUserId || user.userId,
        remark: [
          row.subject ? `会话主题：${row.subject}` : '',
          latest ? `最近咨询：${latest.content.slice(0, 500)}` : '',
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000),
        custom: toJsonInput({
          serviceDeskConversationId: row.id,
          externalChatId: row.externalChatId,
          externalUserId: row.externalUserId,
        }),
      },
    });
    await this.prisma.serviceDeskConversation.update({
      where: { id: row.id },
      data: { crmLeadId: lead.id },
    });
    return { conversationId: row.id, crmLeadId: lead.id };
  }

  /**
   * 服务转任务：把会话里需要交付的问题派给任务中心，形成「会话 → 任务 → 交付」链。
   * 幂等锚＝会话号，重复派单更新同一条任务；交付链接直回该会话，方便按来访上下文回访。
   */
  async createTask(
    user: CurrentUser,
    ownerUserId: string,
    id: number,
    body: Record<string, unknown>,
  ) {
    await this.requireMember(user, ownerUserId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    if (!this.tasks) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '任务中心尚未就绪，稍后再试',
      );
    }
    const assignee = text(body.assigneeUserId).trim().slice(0, 64);
    if (assignee && !(await this.isOrgMember(ownerUserId, assignee))) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '承办人不是本组织在职成员',
      );
    }
    const visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { id: row.visitorId },
      select: { nickname: true },
    });
    const latest = await this.prisma.serviceDeskMessage.findFirst({
      where: { conversationId: row.id, senderType: 'visitor' },
      orderBy: { id: 'desc' },
    });
    const title =
      text(body.title).trim().slice(0, 200) ||
      `跟进客服会话 #${row.id}${row.subject ? `：${row.subject}` : ''}`;
    const description = [
      visitor?.nickname || row.externalUserName
        ? `来访：${visitor?.nickname || row.externalUserName}`
        : '',
      latest ? `最近咨询：${latest.content.slice(0, 500)}` : '',
      text(body.note).trim().slice(0, 500),
    ]
      .filter(Boolean)
      .join('\n');
    const task = await this.tasks.assign({
      assigneeUserId: assignee,
      orgType: row.orgType || 'ENTERPRISE',
      orgUserId: row.orgUserId || ownerUserId,
      assignedBy: user.userId,
      source: 'desk',
      sourceId: String(row.id),
      title,
      description,
      link: `/service-desk?conversation=${row.id}`,
      category: 'task',
      priority: text(body.priority).slice(0, 16) || 'NORMAL',
      createdBy: user.userId,
      sourceStatus: row.status,
      sourceStatusLabel:
        SERVICE_DESK_CONVERSATION_STATUS_LABELS[row.status] || row.status,
    });
    const taskId = Number((task as { id?: number } | null)?.id || 0);
    if (taskId) {
      await this.prisma.serviceDeskMessage.create({
        data: {
          conversationId: row.id,
          senderType: 'system',
          content: `已派发交付任务 #${taskId}（${title}）`,
        },
      });
    }
    if (assignee) {
      await this.notifications
        .notify(assignee, {
          category: 'task',
          title: `客服会话派单：${title}`,
          body: description,
          link: `/service-desk?conversation=${row.id}`,
          entityType: 'my_task',
          entityId: taskId,
        })
        .catch(() => null);
    }
    return { conversationId: row.id, taskId };
  }

  /**
   * 解决稿 → 知识库草稿：把接待结论写成 PENDING_REVIEW 页，进人在环审核后才对外召回。
   * 未绑定知识空间时写进本人 agent 默认空间；已存在同名页时追加不覆盖（保留两说）。
   */
  async draftSolution(
    user: CurrentUser,
    ownerUserId: string,
    id: number,
    body: Record<string, unknown>,
  ) {
    await this.requireMember(user, ownerUserId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    if (!this.kbDraft) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '知识库尚未就绪，稍后再试',
      );
    }
    const answer = text(body.answer).trim().slice(0, 8000);
    if (!answer) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '解决稿正文不能为空');
    }
    const latest = await this.prisma.serviceDeskMessage.findFirst({
      where: { conversationId: row.id, senderType: 'visitor' },
      orderBy: { id: 'desc' },
    });
    const question =
      text(body.question).trim().slice(0, 200) ||
      row.subject ||
      latest?.content.slice(0, 200) ||
      `客服会话 #${row.id}`;
    const saved = await this.kbDraft({
      ownerUserId,
      actorId: user.userId,
      slug: `desk-conversation-${row.id}`,
      title: question,
      body: [`## 问题`, question, '', '## 解决方案', answer].join('\n'),
      spaceId: Number(body.spaceId) || undefined,
    });
    if (!saved) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '没有可写入的知识空间',
      );
    }
    return {
      conversationId: row.id,
      pageId: saved.pageId,
      spaceId: saved.spaceId,
      status: 'PENDING_REVIEW',
    };
  }

  async send(
    user: CurrentUser,
    ownerUserId: string,
    id: number,
    body: Record<string, unknown>,
  ) {
    await this.requireMember(user, ownerUserId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    if (row.status === 'closed') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '会话已结束，不能继续回复',
      );
    }
    const content = text(body.content).slice(0, MAX_MESSAGE);
    const contentType = ['text', 'image', 'file'].includes(
      text(body.contentType),
    )
      ? text(body.contentType)
      : 'text';
    if (!content && contentType === 'text') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '回复内容不能为空');
    }
    const message = await this.prisma.serviceDeskMessage.create({
      data: {
        conversationId: id,
        senderType: 'agent',
        senderUserId: user.userId,
        contentType,
        content,
        attachmentUrl: text(body.attachmentUrl).slice(0, 500),
        attachmentName: text(body.attachmentName).slice(0, 200),
        attachmentSize: Number(body.attachmentSize || 0),
        clientMsgId: text(body.clientMsgId).slice(0, 64),
      },
    });
    await this.touchConversation(id, {
      assigneeUserId: row.assigneeUserId || user.userId,
      status: 'active',
      lastMessageAt: new Date(),
      unreadForRequester: { increment: 1 },
      ...(row.firstResponseAt ? {} : { firstResponseAt: new Date() }),
    });
    const names = await this.agentNames([user.userId]);
    const view = this.messageView(message, names);
    this.publish(`conv:${id}`, 'message', { message: view, status: 'active' });
    this.publish(`owner:${ownerUserId}`, 'conversation', {
      id,
      status: 'active',
    });
    const target = this.channelTargetOf(row);
    if (target && contentType === 'text' && content) {
      void this.deliverChannel(ownerUserId, id, target, content);
    }
    return view;
  }

  private async notifyAgents(
    ownerUserId: string,
    title: string,
    body: string,
    link: string,
  ) {
    const agents = await this.prisma.serviceDeskAgent.findMany({
      where: { ownerUserId, status: { in: ['ONLINE', 'AWAY'] } },
    });
    const ids = agents.length
      ? agents.map((item) => item.memberUserId)
      : [ownerUserId];
    await this.notifications.notifyMany(ids, {
      category: 'service_desk',
      title,
      body,
      link,
    });
  }

  async claim(user: CurrentUser, id: number) {
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    await this.requireMember(user, row.ownerUserId);
    if (row.assigneeUserId && row.assigneeUserId !== user.userId) {
      throw new BusinessException(ErrorCode.CONFLICT, '该会话已被其他客服接入');
    }
    const updated = await this.touchConversation(id, {
      assigneeUserId: user.userId,
      // 真人接入即改接待方；aiAgentId 保留，作为「先前由哪位 AI 客服接待」的留痕。
      assigneeType: 'USER',
      status: 'active',
      ...(row.firstResponseAt ? {} : { firstResponseAt: new Date() }),
    });
    await this.prisma.serviceDeskAgent.updateMany({
      where: {
        ownerUserId: row.ownerUserId,
        memberUserId: user.userId,
      },
      data: { lastAssignedAt: new Date() },
    });
    const meta = await this.buildMeta([updated]);
    this.publish(`owner:${row.ownerUserId}`, 'conversation', {
      id,
      status: 'active',
      assigneeUserId: user.userId,
    });
    return this.conversationView(updated, meta);
  }

  async transfer(
    user: CurrentUser,
    id: number,
    toUserId: string,
    note: string,
  ) {
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    await this.requireMember(user, row.ownerUserId);
    if (!(await this.isOrgMember(row.ownerUserId, toUserId))) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只能转接给本组织成员',
      );
    }
    const updated = await this.touchConversation(id, {
      assigneeUserId: toUserId,
      status: 'active',
      transferCount: { increment: 1 },
      unreadForAgent: 0,
    });
    if (note.trim()) {
      await this.prisma.serviceDeskMessage.create({
        data: {
          conversationId: id,
          senderType: 'system',
          content: `已转接：${note.trim().slice(0, 200)}`,
        },
      });
    }
    await this.notifications.notify(toUserId, {
      category: 'service_desk',
      title: '有会话转接给你',
      body: note.trim() || '请尽快接入',
      link: `/service-desk?conversation=${id}`,
    });
    const meta = await this.buildMeta([updated]);
    this.publish(`owner:${row.ownerUserId}`, 'conversation', {
      id,
      status: 'active',
      assigneeUserId: toUserId,
    });
    return this.conversationView(updated, meta);
  }

  async close(user: CurrentUser, id: number, inviteRating: boolean) {
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    await this.requireMember(user, row.ownerUserId);
    const updated = await this.touchConversation(id, {
      status: 'closed',
      closedAt: new Date(),
      unreadForAgent: 0,
    });
    if (inviteRating) {
      await this.prisma.serviceDeskMessage.create({
        data: {
          conversationId: id,
          senderType: 'system',
          content: '会话已结束，欢迎对本次服务评分（1–5 星）',
        },
      });
    }
    this.publish(`conv:${id}`, 'closed', { id });
    this.publish(`owner:${row.ownerUserId}`, 'conversation', {
      id,
      status: 'closed',
    });
    const meta = await this.buildMeta([updated]);
    return this.conversationView(updated, meta);
  }

  // ---------------------------------------------------------------- 常用语 / 固定问答

  async canned(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskCannedReply.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      take: 300,
    });
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      userId: row.userId,
      title: row.title,
      content: row.content,
      category: row.category,
      sort: row.sort,
    }));
  }

  async saveCanned(user: CurrentUser, body: Record<string, unknown>) {
    const title = text(body.title).trim().slice(0, 80);
    const content = text(body.content).trim().slice(0, 2000);
    if (!title || !content) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '常用语标题和内容不能为空',
      );
    }
    const id = Number(body.id || 0);
    if (id) {
      const exist = await this.prisma.serviceDeskCannedReply.findFirst({
        where: { id, ownerUserId: user.userId },
      });
      if (!exist)
        throw new BusinessException(ErrorCode.NOT_FOUND, '常用语不存在');
      const row = await this.prisma.serviceDeskCannedReply.update({
        where: { id: exist.id },
        data: {
          title,
          content,
          category: text(body.category).slice(0, 40),
          sort: Number(body.sort || 0),
        },
      });
      return { id: row.id };
    }
    const row = await this.prisma.serviceDeskCannedReply.create({
      data: {
        ownerUserId: user.userId,
        scope: text(body.scope) === 'personal' ? 'personal' : 'shared',
        userId: text(body.scope) === 'personal' ? user.userId : '',
        title,
        content,
        category: text(body.category).slice(0, 40),
        sort: Number(body.sort || 0),
      },
    });
    return { id: row.id };
  }

  async removeCanned(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskCannedReply.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist)
      throw new BusinessException(ErrorCode.NOT_FOUND, '常用语不存在');
    await this.prisma.serviceDeskCannedReply.delete({
      where: { id: exist.id },
    });
    return { removed: true };
  }

  async faqs(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskFaq.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'desc' },
      take: 300,
    });
    return rows.map((row) => ({
      id: row.id,
      question: row.question,
      keywords: row.keywords,
      answer: row.answer,
      enabled: row.enabled,
    }));
  }

  async saveFaq(user: CurrentUser, body: Record<string, unknown>) {
    const question = text(body.question).trim().slice(0, 300);
    const answer = text(body.answer).trim().slice(0, 4000);
    if (!question || !answer) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '问题和答案不能为空');
    }
    const id = Number(body.id || 0);
    if (id) {
      const exist = await this.prisma.serviceDeskFaq.findFirst({
        where: { id, ownerUserId: user.userId },
      });
      if (!exist)
        throw new BusinessException(ErrorCode.NOT_FOUND, '问答不存在');
      const row = await this.prisma.serviceDeskFaq.update({
        where: { id: exist.id },
        data: {
          question,
          answer,
          keywords: text(body.keywords).slice(0, 300),
          enabled: body.enabled !== false,
        },
      });
      return { id: row.id };
    }
    const row = await this.prisma.serviceDeskFaq.create({
      data: {
        ownerUserId: user.userId,
        question,
        answer,
        keywords: text(body.keywords).slice(0, 300),
        enabled: body.enabled !== false,
      },
    });
    return { id: row.id };
  }

  async removeFaq(user: CurrentUser, id: number) {
    const exist = await this.prisma.serviceDeskFaq.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!exist) throw new BusinessException(ErrorCode.NOT_FOUND, '问答不存在');
    await this.prisma.serviceDeskFaq.delete({ where: { id: exist.id } });
    return { removed: true };
  }

  // ---------------------------------------------------------------- 概览 / 统计

  /** 当前账号的「工作台所属账号」：自己当老板就是自己；被别的账号加为客服就用那个账号。 */
  async workOwner(user: CurrentUser) {
    const own = await this.prisma.serviceDeskAgent.findUnique({
      where: {
        ownerUserId_memberUserId: {
          ownerUserId: user.userId,
          memberUserId: user.userId,
        },
      },
    });
    if (own) return user.userId;
    const membership = await this.prisma.serviceDeskAgent.findFirst({
      where: { memberUserId: user.userId, status: { not: 'DISABLED' } },
      orderBy: { id: 'asc' },
    });
    return membership?.ownerUserId || user.userId;
  }

  async overview(user: CurrentUser, deskOwner?: string) {
    const ownerUserId = deskOwner || (await this.workOwner(user));
    const agent = await this.myAgent(user, ownerUserId);
    const isManager = await this.isManager(ownerUserId, user.userId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [waiting, active, today, mine, sites] = await Promise.all([
      this.prisma.serviceDeskConversation.count({
        where: { ownerUserId, status: 'waiting' },
      }),
      this.prisma.serviceDeskConversation.count({
        where: { ownerUserId, status: 'active' },
      }),
      this.prisma.serviceDeskConversation.count({
        where: { ownerUserId, createdAt: { gte: todayStart } },
      }),
      this.prisma.serviceDeskConversation.count({
        where: {
          ownerUserId,
          status: 'active',
          assigneeUserId: user.userId,
        },
      }),
      this.prisma.serviceDeskSite.count({ where: { ownerUserId } }),
    ]);
    return {
      waiting,
      active,
      todayConvos: today,
      myStatus: agent?.status || 'OFFLINE',
      myActive: mine,
      isAgent: Boolean(agent),
      isManager,
      siteCount: sites,
    };
  }

  async stats(
    user: CurrentUser,
    ownerUserIdArg: string | undefined,
    days: number,
  ) {
    const ownerUserId = ownerUserIdArg || (await this.workOwner(user));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const [conversations, messages, agents] = await Promise.all([
      this.prisma.serviceDeskConversation.findMany({
        where: { ownerUserId, createdAt: { gte: since } },
        take: 5000,
      }),
      this.prisma.serviceDeskMessage.findMany({
        where: {
          createdAt: { gte: since },
          conversationId: {
            in: (
              await this.prisma.serviceDeskConversation.findMany({
                where: { ownerUserId },
                select: { id: true },
                take: 5000,
              })
            ).map((item) => item.id),
          },
        },
        take: 20000,
      }),
      this.prisma.serviceDeskAgent.findMany({ where: { ownerUserId } }),
    ]);
    const closed = conversations.filter((item) => item.status === 'closed');
    const firstResponse = conversations
      .filter((item) => item.firstResponseAt)
      .map(
        (item) =>
          (item.firstResponseAt as Date).getTime() - item.createdAt.getTime(),
      );
    const durations = closed
      .filter((item) => item.closedAt)
      .map(
        (item) => (item.closedAt as Date).getTime() - item.createdAt.getTime(),
      );
    const rated = conversations.filter((item) => item.rating > 0);
    const aiMessages = messages.filter((item) => item.senderType === 'ai');
    const aiResolved = conversations.filter(
      (item) =>
        item.status === 'closed' &&
        !messages.some(
          (msg) => msg.conversationId === item.id && msg.senderType === 'agent',
        ),
    ).length;
    const perDayMap = new Map<
      string,
      { conversations: number; aiReplies: number }
    >();
    for (const item of conversations) {
      const key = item.createdAt.toISOString().slice(0, 10);
      const bucket = perDayMap.get(key) || { conversations: 0, aiReplies: 0 };
      bucket.conversations += 1;
      perDayMap.set(key, bucket);
    }
    const convIds = new Map(conversations.map((item) => [item.id, item]));
    for (const msg of aiMessages) {
      const conv = convIds.get(msg.conversationId);
      if (!conv) continue;
      const key = msg.createdAt.toISOString().slice(0, 10);
      const bucket = perDayMap.get(key) || { conversations: 0, aiReplies: 0 };
      bucket.aiReplies += 1;
      perDayMap.set(key, bucket);
    }
    const names = await this.agentNames(
      agents.map((item) => item.memberUserId),
    );
    const perAgent = agents.map((agent) => {
      const rows = conversations.filter(
        (item) => item.assigneeUserId === agent.memberUserId,
      );
      const ratings = rows.filter((item) => item.rating > 0);
      return {
        userId: agent.memberUserId,
        name: names.get(agent.memberUserId) || agent.memberUserId,
        handled: rows.length,
        rating: ratings.length
          ? Number(
              (
                ratings.reduce((sum, item) => sum + item.rating, 0) /
                ratings.length
              ).toFixed(1),
            )
          : 0,
      };
    });
    return {
      days,
      conversations: conversations.length,
      closed: closed.length,
      waiting: conversations.filter((item) => item.status === 'waiting').length,
      avgFirstResponseSeconds: firstResponse.length
        ? Math.round(
            firstResponse.reduce((sum, item) => sum + item, 0) /
              firstResponse.length /
              1000,
          )
        : 0,
      avgDurationSeconds: durations.length
        ? Math.round(
            durations.reduce((sum, item) => sum + item, 0) /
              durations.length /
              1000,
          )
        : 0,
      avgRating: rated.length
        ? Number(
            (
              rated.reduce((sum, item) => sum + item.rating, 0) / rated.length
            ).toFixed(1),
          )
        : 0,
      aiReplies: aiMessages.length,
      aiAutoResolved: aiResolved,
      perDay: [...perDayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, ...value })),
      perAgent,
    };
  }

  // ---------------------------------------------------------------- AI

  private async ownerTarget(
    ownerUserId: string,
    override?: { channelId?: number; model?: string },
  ) {
    const setting = await this.ensureSetting(ownerUserId);
    // 员工级覆盖（纯AI客服自带模型/渠道）优先于账号级设置；都没配就走模型网关默认目标。
    const model = text(override?.model) || setting.aiModel.trim();
    const channelId = Number(override?.channelId || 0) || setting.aiChannelId;
    const targetOverride =
      model && channelId >= 0 ? { channelId, model } : undefined;
    const owner = new CurrentUser(ownerUserId, '', '');
    const target = await this.models.resolveTarget(
      owner,
      'text',
      undefined,
      targetOverride,
    );
    return { setting, target };
  }

  private knowledge(
    faqs: {
      question: string;
      keywords: string;
      answer: string;
      enabled: boolean;
    }[],
  ) {
    return faqs
      .filter((item) => item.enabled)
      .slice(0, 50)
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join('\n\n');
  }

  private async callModel(
    ownerUserId: string,
    system: string,
    history: ChatMessage[],
    override?: { channelId?: number; model?: string },
  ) {
    const { setting, target } = await this.ownerTarget(ownerUserId, override);
    const reply = await geoChatMulti({
      baseUrl: target.baseUrl,
      apiKey: target.apiKey || '',
      model:
        text(override?.model).trim() ||
        setting.aiModel.trim() ||
        target.model ||
        '',
      messages: [{ role: 'system', content: system }, ...history],
      maxTokens: 800,
      timeoutMs: 60000,
      userId: ownerUserId,
      purpose: 'chat',
    });
    // 直连模型也要留用量事实（只记录不扣费），否则成本报表永远看不到这条链路
    await meterChatCall(ownerUserId, reply, {
      module: 'service-desk',
      operation: 'ai-reply',
      model: target.model || '',
    });
    return reply.reply;
  }

  async aiSuggest(
    user: CurrentUser,
    ownerUserId: string,
    id: number,
    instruction: string,
  ) {
    await this.requireMember(user, ownerUserId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    const [messages, faqs] = await Promise.all([
      this.prisma.serviceDeskMessage.findMany({
        where: { conversationId: id },
        orderBy: { id: 'desc' },
        take: 20,
      }),
      this.prisma.serviceDeskFaq.findMany({
        where: { ownerUserId, enabled: true },
      }),
    ]);
    const history: ChatMessage[] = messages
      .reverse()
      .filter((item) => item.senderType !== 'system' && item.content)
      .map((item) => ({
        role: item.senderType === 'visitor' ? 'user' : 'assistant',
        content: item.content,
      }));
    const lastVisitor = [...messages]
      .reverse()
      .find((item) => item.senderType === 'visitor');
    const acq = lastVisitor
      ? await this.acqContext(row, lastVisitor.content)
      : null;
    const system = `${this.systemPrompt(
      false,
      this.knowledge(faqs),
      acq?.sections || [],
    )}\n\n请给出：1) 建议回复（可直接发送）；2) 一句话会话摘要。用「回复：」「摘要：」两段输出。${
      instruction ? `\n客服补充要求：${instruction}` : ''
    }`;
    const replyText = await this.callModel(ownerUserId, system, history);
    const summaryMatch = replyText.match(/摘要[:：]\s*([\s\S]+)/);
    const replyMatch = replyText.match(
      /回复[:：]\s*([\s\S]+?)(?:\n\s*摘要[:：]|$)/,
    );
    const suggestion = (replyMatch?.[1] || replyText).trim().slice(0, 2000);
    const summary = (summaryMatch?.[1] || '').trim().slice(0, 200);
    if (summary && !row.subject) {
      await this.touchConversation(id, { subject: summary });
    }
    return { suggestion, summary };
  }

  private async findFaqAnswer(ownerUserId: string, content: string) {
    const faqs = await this.prisma.serviceDeskFaq.findMany({
      where: { ownerUserId, enabled: true },
      take: 200,
    });
    const lower = content.toLowerCase();
    for (const faq of faqs) {
      const keys = [faq.question, ...faq.keywords.split(/[,，\s]+/)]
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2);
      if (keys.some((key) => lower.includes(key))) return faq.answer;
    }
    return '';
  }

  /* ------------------------------------------------------------- 纯AI客服员工 */

  /** 员工知识库空间名：只认本账号的空间，越权 id 不落名，避免拿别人的库撑门面。 */
  private async kbSpaceNames(ownerUserId: string, ids: number[]) {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.kbSpace.findMany({
      where: { id: { in: unique }, ownerUserId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** 接待时段判定：空对象＝全天；days 用 0=周日；start/end 为 "HH:mm"。 */
  private inWorkingHours(value: unknown, at = new Date()) {
    const hours = (
      value && typeof value === 'object' ? value : {}
    ) as ServiceDeskWorkingHours;
    const days = Array.isArray(hours.days)
      ? hours.days
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
      : [];
    if (days.length && !days.includes(at.getDay())) return false;
    const start = text(hours.start).trim();
    const end = text(hours.end).trim();
    if (!start || !end) return true;
    const now = `${String(at.getHours()).padStart(2, '0')}:${String(
      at.getMinutes(),
    ).padStart(2, '0')}`;
    return now >= start && now <= end;
  }

  /**
   * AI 员工接待台账：会话量、当前在处理、满意度与转人工量。
   * 口径说明：转人工＝该会话最初由这位 AI 员工接入（ai_agent_id 留痕）、后来改由真人接待
   * （assignee_type=USER），不依赖关键词命中记录，避免与「AI 应答失败转人工」的其它入口口径打架。
   */
  private async aiAgentStats(ownerUserId: string, ids: number[]) {
    const empty = new Map<number, AiAgentStats>();
    if (!ids.length) return empty;
    const [handled, active, handedOff, rated] = await Promise.all([
      this.prisma.serviceDeskConversation.groupBy({
        by: ['aiAgentId'],
        where: { ownerUserId, aiAgentId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.serviceDeskConversation.groupBy({
        by: ['aiAgentId'],
        where: { ownerUserId, aiAgentId: { in: ids }, status: 'active' },
        _count: { _all: true },
      }),
      this.prisma.serviceDeskConversation.groupBy({
        by: ['aiAgentId'],
        where: {
          ownerUserId,
          aiAgentId: { in: ids },
          assigneeType: 'USER',
        },
        _count: { _all: true },
      }),
      this.prisma.serviceDeskConversation.groupBy({
        by: ['aiAgentId'],
        where: { ownerUserId, aiAgentId: { in: ids }, rating: { gt: 0 } },
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);
    const map = new Map<number, AiAgentStats>();
    const touch = (id: number) => {
      if (!map.has(id))
        map.set(id, {
          handledCount: 0,
          activeCount: 0,
          handoffCount: 0,
          handoffRate: 0,
          ratingCount: 0,
          ratingAvg: 0,
        });
      return map.get(id)!;
    };
    handled.forEach((item) => {
      touch(item.aiAgentId).handledCount = item._count._all;
    });
    active.forEach((item) => {
      touch(item.aiAgentId).activeCount = item._count._all;
    });
    handedOff.forEach((item) => {
      const stats = touch(item.aiAgentId);
      stats.handoffCount = item._count._all;
      stats.handoffRate = stats.handledCount
        ? Math.round((stats.handoffCount / stats.handledCount) * 100) / 100
        : 0;
    });
    rated.forEach((item) => {
      const stats = touch(item.aiAgentId);
      stats.ratingCount = item._count._all;
      stats.ratingAvg = Math.round((item._avg.rating || 0) * 10) / 10;
    });
    return map;
  }

  private async aiAgentView(
    ownerUserId: string,
    row: {
      id: number;
      name: string;
      avatar: string;
      intro: string;
      groupId: number;
      status: string;
      mode: string;
      persona: string;
      aiChannelId: number;
      aiModel: string;
      kbSpaceIds: Prisma.JsonValue;
      handoffKeywords: Prisma.JsonValue;
      handoffGroupId: number;
      maxConcurrent: number;
      workingHours: Prisma.JsonValue;
      greetingText: string;
      createdAt: Date;
    },
    stats?: AiAgentStats,
  ) {
    const spaceIds = asIntList(row.kbSpaceIds);
    const spaceNames = await this.kbSpaceNames(ownerUserId, spaceIds);
    const ledger =
      stats || (await this.aiAgentStats(ownerUserId, [row.id])).get(row.id);
    return {
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      intro: row.intro,
      groupId: row.groupId,
      status: row.status,
      statusLabel: row.status === 'ON' ? '在岗' : '已停用',
      mode: row.mode,
      modeLabel:
        row.mode === 'BOT' ? '纯AI接待（不转人工）' : 'AI 先接（可转人工）',
      persona: row.persona,
      aiChannelId: row.aiChannelId,
      aiModel: row.aiModel,
      kbSpaceIds: spaceIds,
      kbSpaces: spaceIds.map((id) => spaceNames.get(id) || `#${id}`),
      handoffKeywords: asStringArray(row.handoffKeywords),
      handoffGroupId: row.handoffGroupId,
      maxConcurrent: row.maxConcurrent,
      workingHours: row.workingHours,
      greetingText: row.greetingText,
      activeCount: ledger?.activeCount || 0,
      handledCount: ledger?.handledCount || 0,
      handoffCount: ledger?.handoffCount || 0,
      handoffRate: ledger?.handoffRate || 0,
      ratingCount: ledger?.ratingCount || 0,
      ratingAvg: ledger?.ratingAvg || 0,
      onDuty: row.status === 'ON' && this.inWorkingHours(row.workingHours),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** AI 员工列表：团队页签与业务工具的「选一个纯AI客服」下拉共用同一份数据。 */
  async aiAgents(user: CurrentUser) {
    const rows = await this.prisma.serviceDeskAiAgent.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ status: 'asc' }, { id: 'asc' }],
    });
    // 台账一次批量取回，避免每个员工各发一组聚合查询。
    const ledger = await this.aiAgentStats(
      user.userId,
      rows.map((row) => row.id),
    );
    const views = await Promise.all(
      rows.map((row) => this.aiAgentView(user.userId, row, ledger.get(row.id))),
    );
    return views;
  }

  async saveAiAgent(user: CurrentUser, body: Record<string, unknown>) {
    const id = Number(body.id || 0);
    const name = text(body.name).trim().slice(0, 60);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写 AI 客服名称');
    }
    const mode = ['AUTO', 'BOT'].includes(text(body.mode))
      ? text(body.mode)
      : 'AUTO';
    const spaceIds = asIntList(body.kbSpaceIds);
    if (spaceIds.length) {
      const owned = await this.prisma.kbSpace.count({
        where: { id: { in: spaceIds }, ownerUserId: user.userId },
      });
      if (owned !== spaceIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '绑定的知识库不存在或不属于本账号',
        );
      }
    }
    const data = {
      name,
      avatar: text(body.avatar).trim().slice(0, 500),
      intro: text(body.intro).trim().slice(0, 200),
      groupId: Math.max(0, Number(body.groupId || 0)),
      mode,
      persona: text(body.persona).slice(0, 6000),
      aiChannelId: Math.max(0, Number(body.aiChannelId || 0)),
      aiModel: text(body.aiModel).trim().slice(0, 128),
      kbSpaceIds: toJsonInput(spaceIds),
      handoffKeywords: toJsonInput(
        asStringArray(body.handoffKeywords).slice(0, 20),
      ),
      handoffGroupId: Math.max(0, Number(body.handoffGroupId || 0)),
      maxConcurrent: Math.min(
        500,
        Math.max(1, Number(body.maxConcurrent || 50)),
      ),
      workingHours: toJsonInput(body.workingHours || {}),
      greetingText: text(body.greetingText).slice(0, 2000),
    };
    if (id) {
      const updated = await this.prisma.serviceDeskAiAgent.updateMany({
        where: { id, ownerUserId: user.userId },
        data,
      });
      if (!updated.count) {
        throw new BusinessException(ErrorCode.NOT_FOUND, 'AI 客服不存在');
      }
    } else {
      const created = await this.prisma.serviceDeskAiAgent.create({
        data: { ownerUserId: user.userId, ...data },
      });
      return this.aiAgentView(user.userId, created);
    }
    const row = await this.prisma.serviceDeskAiAgent.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, 'AI 客服不存在');
    return this.aiAgentView(user.userId, row);
  }

  async setAiAgentStatus(user: CurrentUser, id: number, status: string) {
    const next = status === 'DISABLED' ? 'DISABLED' : 'ON';
    const updated = await this.prisma.serviceDeskAiAgent.updateMany({
      where: { id, ownerUserId: user.userId },
      data: { status: next },
    });
    if (!updated.count) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'AI 客服不存在');
    }
    return { id, status: next };
  }

  /** 删除只收配置：历史会话仍保留 ai_agent_id，接待记录不能因为删员工而失真。 */
  async deleteAiAgent(user: CurrentUser, id: number) {
    const active = await this.prisma.serviceDeskConversation.count({
      where: { ownerUserId: user.userId, aiAgentId: id, status: 'active' },
    });
    if (active) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该 AI 客服还在接待 ${active} 个会话，请先停用或等会话结束`,
      );
    }
    const deleted = await this.prisma.serviceDeskAiAgent.deleteMany({
      where: { id, ownerUserId: user.userId },
    });
    if (!deleted.count) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'AI 客服不存在');
    }
    return { id };
  }

  /**
   * 员工运行配置：员工自带的人设/模型/知识库/转人工口径优先，账号级 AI 设置只做回落。
   * mode 为员工自己的 AUTO|BOT；账号级 aiMode 只在没有员工接待该会话时才起作用。
   */
  private aiRuntime(
    setting: { aiMode: string; aiHandoffKeywords: unknown },
    agent: null | {
      name: string;
      mode: string;
      persona: string;
      kbSpaceIds: unknown;
      handoffKeywords: unknown;
      aiChannelId: number;
      aiModel: string;
    },
  ) {
    const agentKeywords = agent ? asStringArray(agent.handoffKeywords) : [];
    return {
      agentName: agent?.name || '',
      mode: agent ? agent.mode : setting.aiMode,
      pureAi: (agent ? agent.mode : setting.aiMode) === 'BOT',
      persona: agent ? text(agent.persona) : '',
      spaceIds: agent ? asIntList(agent.kbSpaceIds) : [],
      handoffKeywords: agentKeywords.length
        ? agentKeywords
        : asStringArray(setting.aiHandoffKeywords),
      model: {
        channelId: agent?.aiChannelId || 0,
        model: agent ? text(agent.aiModel).trim() : '',
      },
    };
  }

  /** 知识召回：给了空间就按空间召，没给回落账号级客服绑定；召回失败按「无知识」继续应答。 */
  private async aiKnowledge(
    ownerUserId: string,
    query: string,
    spaceIds: number[],
  ): Promise<AiKnowledgeResult> {
    if (!this.kbRecall) return { text: '', references: [] };
    try {
      return await this.kbRecall(ownerUserId, query, spaceIds);
    } catch {
      return { text: '', references: [] };
    }
  }

  /**
   * 通用问答口：任何业务域引用某个纯AI客服员工时都走这里（健康小程序的 AI 医护即由此接入）。
   * 本方法只出答案与知识出处，不写会话、不认识任何业务域；转人工口径以 handoff 返回给调用方。
   */
  async answerForAgent(input: {
    ownerUserId: string;
    agentId: number;
    question: string;
    history?: ChatMessage[];
  }): Promise<AiAgentAnswer> {
    const question = text(input.question).trim().slice(0, 2000);
    if (!question) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写要提问的内容');
    }
    const agent = await this.prisma.serviceDeskAiAgent.findFirst({
      where: { id: input.agentId, ownerUserId: input.ownerUserId },
    });
    if (!agent) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '绑定的 AI 客服不存在，或不属于本账号',
      );
    }
    if (agent.status !== 'ON') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${agent.name}」已停用，请先在 AI客服 → 团队 里启用`,
      );
    }
    const setting = await this.ensureSetting(input.ownerUserId);
    const runtime = this.aiRuntime(setting, agent);
    const canned = await this.findFaqAnswer(input.ownerUserId, question);
    if (canned) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        answer: canned,
        references: [],
        handoff: false,
      };
    }
    const lower = question.toLowerCase();
    const handoff =
      !runtime.pureAi &&
      runtime.handoffKeywords.some((key) => key && lower.includes(key));
    const [knowledge, faqs] = await Promise.all([
      this.aiKnowledge(input.ownerUserId, question, runtime.spaceIds),
      this.prisma.serviceDeskFaq.findMany({
        where: { ownerUserId: input.ownerUserId, enabled: true },
      }),
    ]);
    const system = this.systemPrompt(
      runtime.pureAi,
      [this.knowledge(faqs), knowledge.text.trim()]
        .filter(Boolean)
        .join('\n\n'),
      [],
      runtime.persona,
      agent.name,
    );
    const reply = await this.callModel(
      input.ownerUserId,
      system,
      [...(input.history || []), { role: 'user', content: question }],
      runtime.model,
    );
    return {
      agentId: agent.id,
      agentName: agent.name,
      answer: reply.trim().slice(0, 2000),
      references: knowledge.references,
      handoff,
    };
  }

  /** 业主端「试问一句」：与自动回复同一套员工配置，用来验人设与知识库效果。 */
  async askAiAgent(user: CurrentUser, body: Record<string, unknown>) {
    const agentId = Number(body.agentId || 0);
    if (!agentId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要试问的 AI 客服',
      );
    }
    const answer = await this.answerForAgent({
      ownerUserId: user.userId,
      agentId,
      question: text(body.question),
      history: asChatHistory(body.history),
    });
    return answer;
  }

  private async autoReply(ownerUserId: string, conversationId: number) {
    const setting = await this.ensureSetting(ownerUserId);
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id: conversationId, ownerUserId },
    });
    if (!row || row.status === 'closed') return;
    // 会话由哪个纯AI客服员工接待，就用那个员工的人设/模型/知识库/转人工口径；没绑员工才走账号级 AI 设置。
    const agentRow = row.aiAgentId
      ? await this.prisma.serviceDeskAiAgent.findFirst({
          where: { id: row.aiAgentId, ownerUserId },
        })
      : null;
    const runtime = this.aiRuntime(
      setting,
      agentRow && agentRow.status === 'ON' ? agentRow : null,
    );
    // 会话创建时会把当时的账号 aiMode 写进 row.aiMode（永远非空），所以由在岗 AI 员工接待的会话
    // 必须以员工自己的 AUTO|BOT 为准；只有转人工（SUGGEST）与显式关停（OFF）这两种会话级例外压得过它。
    const aiOnDuty = Boolean(agentRow && agentRow.status === 'ON');
    const mode = effectiveAiMode(
      row.aiMode,
      aiOnDuty ? runtime.mode : setting.aiMode,
      aiOnDuty,
    );
    if (mode === 'OFF') return;
    // AI 员工接待时消息署名用它，真人看得清是哪位 AI 在说话。
    const label = runtime.agentName;
    const channelTarget = this.channelTargetOf(row);
    const messages = await this.prisma.serviceDeskMessage.findMany({
      where: { conversationId },
      orderBy: { id: 'desc' },
      take: 12,
    });
    const lastVisitor = messages.find((item) => item.senderType === 'visitor');
    if (!lastVisitor) return;
    // 获客接待：有销售剧本时，剧本边界优先于 FAQ 与知识库
    const acq = await this.acqContext(row, lastVisitor.content);
    const faqAnswer = acq?.sections.length
      ? ''
      : await this.findFaqAnswer(ownerUserId, lastVisitor.content);
    if (faqAnswer && mode !== 'OFF') {
      await this.appendAi(
        ownerUserId,
        conversationId,
        faqAnswer,
        'ai',
        channelTarget,
        label,
      );
      return;
    }
    if (mode !== 'AUTO' && mode !== 'BOT') return;
    const pureAi = mode === 'BOT';
    if (!pureAi) {
      const keywords = runtime.handoffKeywords.map((item) =>
        item.toLowerCase(),
      );
      const content = lastVisitor.content.toLowerCase();
      const triggerHit = (acq?.handoffTriggers || []).some(
        (word) => word && lastVisitor.content.includes(word),
      );
      if (triggerHit || keywords.some((key) => key && content.includes(key))) {
        await this.handoff(
          ownerUserId,
          conversationId,
          triggerHit ? '命中剧本转人工触发词' : '命中转人工关键词',
        );
        return;
      }
    }
    const faqs = await this.prisma.serviceDeskFaq.findMany({
      where: { ownerUserId, enabled: true },
    });
    // 知识召回：员工自带的知识库范围优先，没绑空间才回落账号级客服绑定；未装配钩子则跳过
    const kb = await this.aiKnowledge(
      ownerUserId,
      lastVisitor.content,
      runtime.spaceIds,
    );
    const knowledge = [this.knowledge(faqs), kb.text.trim()]
      .filter(Boolean)
      .join('\n\n');
    const history: ChatMessage[] = messages
      .reverse()
      .filter((item) => item.senderType !== 'system' && item.content)
      .map((item) => ({
        role: item.senderType === 'visitor' ? 'user' : 'assistant',
        content: item.content,
      }));
    const system = this.systemPrompt(
      pureAi,
      knowledge,
      acq?.sections || [],
      runtime.persona,
      label,
    );
    let reply = '';
    try {
      reply = await this.callModel(ownerUserId, system, history, runtime.model);
    } catch (error) {
      if (pureAi) {
        await this.appendAi(
          ownerUserId,
          conversationId,
          '抱歉，这个问题我暂时回答不了。你可以补充一些细节，或留下联系方式，我们会尽快回复你。',
          'ai',
          channelTarget,
          label,
        );
        return;
      }
      await this.handoff(
        ownerUserId,
        conversationId,
        `AI 无法应答：${(error as Error)?.message || '模型调用失败'}`,
      );
      return;
    }
    if (!reply.trim() || /转接人工|转人工/.test(reply)) {
      if (pureAi) {
        await this.appendAi(
          ownerUserId,
          conversationId,
          '抱歉，这个问题我暂时回答不了。你可以补充一些细节，或留下联系方式，我们会尽快回复你。',
          'ai',
          channelTarget,
          label,
        );
        return;
      }
      await this.handoff(ownerUserId, conversationId, 'AI 判断需要人工');
      return;
    }
    const finalText = reply.trim().slice(0, 2000);
    await this.appendAi(
      ownerUserId,
      conversationId,
      finalText,
      'ai',
      channelTarget,
      label,
    );
    if (acq) await acq.afterReply(finalText).catch(() => undefined);
  }

  private async acqContext(
    row: {
      id: number;
      ownerUserId: string;
      channelId: number;
      externalUserId: string;
      externalUserName: string;
    },
    message: string,
  ): Promise<AcqReceptionContext | null> {
    if (!this.acqReception) return null;
    try {
      return await this.acqReception({
        ownerUserId: row.ownerUserId,
        conversationId: row.id,
        channelId: row.channelId,
        externalUserId: row.externalUserId,
        externalUserName: row.externalUserName,
        message,
      });
    } catch {
      return null;
    }
  }

  /** 组装顺序：平台安全约束 →（员工人设）→ 剧本边界 → 知识 → 客户档案 → 最近会话（会话走 history）。 */
  private systemPrompt(
    pureAi: boolean,
    knowledge: string,
    sections: { name: string; text: string }[],
    persona = '',
    speaker = '',
  ) {
    const base = pureAi
      ? '你是企业官网客服助手。不承诺价格/合同/赔付/时效，不编造；不要承诺转接人工客服，遇到不确定的问题就请访客补充信息或留下联系方式，说明会尽快回复。'
      : '你是企业官网客服助手。不承诺价格/合同/赔付/时效，不编造；不确定就回答「我帮你转接人工客服」。';
    // 人设是「这个员工是谁、按什么口径说话」，安全约束永远在人设之前，不能被员工配置绕过。
    const identity = persona
      ? `\n\n岗位设定：${persona.trim().slice(0, 2000)}`
      : '';
    const named = speaker ? `\n\n对外署名：${speaker.trim().slice(0, 60)}` : '';
    if (!sections.length)
      return `${base}${identity}${named}\n\n知识：\n${knowledge}`;
    const playbook = sections
      .map((item) => `## ${item.name}\n${item.text}`)
      .join('\n\n');
    const tail = pureAi
      ? '按上面的销售剧本接待：剧本边界优先于知识，剧本没写到的按知识回答；仍不确定就请对方补充信息或留下联系方式。'
      : '按上面的销售剧本接待：剧本边界优先于知识，剧本没写到的按知识回答；仍不确定就使用转人工话术并请求人工介入。';
    return `${base}${identity}${named}\n\n${tail}\n\n${playbook}\n\n知识：\n${knowledge}`;
  }

  private async appendAi(
    ownerUserId: string,
    conversationId: number,
    content: string,
    senderType: 'ai' | 'system',
    channelTarget?: {
      channelId: number;
      chatId: string;
      userId: string;
      userName?: string;
      extra?: Record<string, string>;
    } | null,
    label = '',
  ) {
    const message = await this.prisma.serviceDeskMessage.create({
      data: { conversationId, senderType, content },
    });
    await this.touchConversation(conversationId, {
      lastMessageAt: new Date(),
      unreadForRequester: { increment: senderType === 'system' ? 0 : 1 },
    });
    this.publish(`conv:${conversationId}`, 'message', {
      message: {
        id: message.id,
        conversationId,
        senderType,
        senderName: senderType === 'ai' ? label || 'AI 助手' : '系统',
        contentType: 'text',
        content,
        attachmentUrl: '',
        attachmentName: '',
        attachmentSize: 0,
        createdAt: message.createdAt.toISOString(),
      },
    });
    this.publish(`owner:${ownerUserId}`, 'conversation', {
      id: conversationId,
      aiReplied: senderType === 'ai',
    });
    if (channelTarget) {
      void this.deliverChannel(
        ownerUserId,
        conversationId,
        channelTarget,
        content,
      );
    }
  }

  /**
   * 获客跟进借用服务台外发通道（企微）：按外部用户找最近未关闭会话，
   * 用同一条送达逻辑把跟进消息发出去；失败如实返回原因，不假装已发。
   */
  async sendFollowUpText(input: {
    ownerUserId: string;
    channel: string;
    externalUserId: string;
    text: string;
  }): Promise<{ ok: boolean; ref?: string; error?: string }> {
    const ownerUserId = input.ownerUserId;
    const channels = await this.prisma.serviceDeskChannel.findMany({
      where: { ownerUserId, enabled: true },
      select: { id: true, kind: true },
    });
    const ids = channels
      .filter((item) => String(item.kind).startsWith('wecom'))
      .map((item) => item.id);
    if (!ids.length) {
      return { ok: false, error: '未配置企业微信客服渠道' };
    }
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: {
        ownerUserId,
        channelId: { in: ids },
        externalUserId: input.externalUserId,
        status: { not: 'closed' },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (!row) {
      return {
        ok: false,
        error: '找不到该客户的企微会话：请等客户先发消息，或改用其他渠道跟进',
      };
    }
    const target = this.channelTargetOf(row);
    if (!target) return { ok: false, error: '会话缺少渠道信息' };
    const content = input.text.slice(0, 2000);
    const message = await this.prisma.serviceDeskMessage.create({
      data: { conversationId: row.id, senderType: 'system', content },
    });
    await this.touchConversation(row.id, { lastMessageAt: new Date() });
    this.publish(`conv:${row.id}`, 'message', {
      message: {
        id: message.id,
        conversationId: row.id,
        senderType: 'system',
        senderName: '系统',
        contentType: 'text',
        content,
        attachmentUrl: '',
        attachmentName: '',
        attachmentSize: 0,
        createdAt: message.createdAt.toISOString(),
      },
    });
    this.publish(`owner:${ownerUserId}`, 'conversation', {
      id: row.id,
      aiReplied: false,
    });
    try {
      await this.deliverChannel(ownerUserId, row.id, target, content, true);
      return { ok: true, ref: `conv:${row.id}` };
    } catch (error) {
      return {
        ok: false,
        error: (error instanceof Error
          ? error.message
          : '企微通道发送失败'
        ).slice(0, 300),
      };
    }
  }

  private async handoff(
    ownerUserId: string,
    conversationId: number,
    reason: string,
  ) {
    const row = await this.prisma.serviceDeskConversation.findFirst({
      where: { id: conversationId, ownerUserId },
    });
    if (!row) return;
    await this.touchConversation(conversationId, {
      aiMode: 'SUGGEST',
      status: row.assigneeUserId ? 'active' : 'waiting',
      unreadForAgent: { increment: 1 },
    });
    await this.appendAi(
      ownerUserId,
      conversationId,
      `已为你转接人工客服（${reason}）`,
      'system',
      this.channelTargetOf(row),
    );
    await this.notifyAgents(
      ownerUserId,
      '有会话需要人工接待',
      reason,
      `/service-desk?conversation=${conversationId}`,
    );
  }

  // ---------------------------------------------------------------- 访客公开通道

  async openSession(input: {
    siteKey: string;
    token?: string;
    nickname?: string;
    contact?: string;
    sourceUrl?: string;
    userAgent?: string;
    origin?: string;
  }) {
    const site = await this.prisma.serviceDeskSite.findUnique({
      where: { siteKey: input.siteKey },
    });
    if (!site || !site.enabled) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '客服站点不存在或已停用',
      );
    }
    const allowed = asStringArray(site.allowedOrigins);
    if (allowed.length && input.origin) {
      const okOrigin = allowed.some((item) => {
        try {
          return new URL(item).origin === new URL(input.origin || '').origin;
        } catch {
          return item === input.origin;
        }
      });
      if (!okOrigin) {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '该站点未允许当前来源引用',
        );
      }
    }
    const setting = await this.ensureSetting(site.ownerUserId);
    const plainToken = input.token || newToken();
    const tokenHash = hashToken(plainToken);
    let visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { tokenHash },
    });
    if (!visitor) {
      if (setting.requireContact && !text(input.contact)) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '请先填写联系方式');
      }
      visitor = await this.prisma.serviceDeskVisitor.create({
        data: {
          ownerUserId: site.ownerUserId,
          siteId: site.id,
          tokenHash,
          nickname: text(input.nickname).slice(0, 60),
          contact: text(input.contact).slice(0, 120),
          userAgent: text(input.userAgent).slice(0, 255),
        },
      });
    } else {
      visitor = await this.prisma.serviceDeskVisitor.update({
        where: { id: visitor.id },
        data: {
          lastSeenAt: new Date(),
          ...(text(input.nickname)
            ? { nickname: text(input.nickname).slice(0, 60) }
            : {}),
          ...(text(input.contact)
            ? { contact: text(input.contact).slice(0, 120) }
            : {}),
        },
      });
    }
    let conversation = await this.prisma.serviceDeskConversation.findFirst({
      where: {
        visitorId: visitor.id,
        ownerUserId: site.ownerUserId,
        status: { in: ['waiting', 'active'] },
      },
      orderBy: { id: 'desc' },
    });
    if (!conversation) {
      const pureAi = setting.aiMode === 'BOT';
      conversation = await this.prisma.serviceDeskConversation.create({
        data: {
          ownerUserId: site.ownerUserId,
          orgType: 'ENTERPRISE',
          orgUserId: site.ownerUserId,
          siteId: site.id,
          visitorId: visitor.id,
          sourceUrl: text(input.sourceUrl).slice(0, 500),
          aiMode: setting.aiMode,
          status: pureAi ? 'active' : 'waiting',
          subject: text(input.sourceUrl).slice(0, 120),
        },
      });
      if (setting.welcomeText) {
        await this.prisma.serviceDeskMessage.create({
          data: {
            conversationId: conversation.id,
            senderType: 'system',
            content: setting.welcomeText.slice(0, 1000),
          },
        });
      }
      if (!pureAi) {
        await this.assignIfPossible(site.ownerUserId, conversation.id);
      }
      if (this.pointsChargeSafely) {
        await this.pointsChargeSafely(
          site.ownerUserId,
          'ai_customer',
          1,
          String(conversation.id),
        ).catch(() => undefined);
      }
    }
    const messages = await this.prisma.serviceDeskMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { id: 'asc' },
      take: 200,
    });
    return {
      token: plainToken,
      site: { name: site.name, appearance: site.appearance },
      conversationId: conversation.id,
      settings: {
        welcomeText: setting.welcomeText,
        queueText: setting.queueText,
        offlineText: setting.offlineText,
        ratingEnabled: setting.ratingEnabled,
        requireContact: setting.requireContact,
      },
      messages: messages.map((item) => this.messageView(item, new Map())),
    };
  }

  /**
   * 选一个可接单的纯AI客服员工：先按会话所属客服组匹配（groupId=0 的员工接全局），
   * 再要求启用 + 在接待时段内 + 未满负荷，负载低的优先。没有可用员工返回 null，交回真人分流。
   */
  private async pickAiAgent(ownerUserId: string, groupId: number) {
    const rows = await this.prisma.serviceDeskAiAgent.findMany({
      where: { ownerUserId, status: 'ON' },
      orderBy: { id: 'asc' },
    });
    const candidates = rows.filter(
      (row) =>
        (!row.groupId || !groupId || row.groupId === groupId) &&
        this.inWorkingHours(row.workingHours),
    );
    if (!candidates.length) return null;
    const counts = await this.prisma.serviceDeskConversation.groupBy({
      by: ['aiAgentId'],
      where: {
        ownerUserId,
        status: 'active',
        aiAgentId: { in: candidates.map((row) => row.id) },
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((item) => [item.aiAgentId, item._count._all]),
    );
    return (
      candidates
        .filter((row) => (countMap.get(row.id) || 0) < row.maxConcurrent)
        .sort(
          (a, b) =>
            (countMap.get(a.id) || 0) / a.maxConcurrent -
            (countMap.get(b.id) || 0) / b.maxConcurrent,
        )[0] || null
    );
  }

  private async assignIfPossible(ownerUserId: string, conversationId: number) {
    const setting = await this.ensureSetting(ownerUserId);
    if (!setting.autoAssign) return;
    const conversation = await this.prisma.serviceDeskConversation.findFirst({
      where: { id: conversationId, ownerUserId },
      select: { groupId: true },
    });
    // 纯AI客服员工是团队里的一类员工：有可用员工就先接，接不住再排真人。
    const ai = await this.pickAiAgent(ownerUserId, conversation?.groupId || 0);
    if (ai) {
      await this.touchConversation(conversationId, {
        assigneeType: 'AI',
        aiAgentId: ai.id,
        assigneeUserId: '',
        status: 'active',
      });
      if (ai.greetingText) {
        await this.appendAi(
          ownerUserId,
          conversationId,
          ai.greetingText,
          'ai',
          null,
          ai.name,
        );
      }
      // 首条访客消息进来时由 openSend 触发 autoReply，这里不重复应答，只打招呼。
      return;
    }
    const online = await this.prisma.serviceDeskAgent.findMany({
      where: { ownerUserId, status: 'ONLINE', role: { not: 'owner' } },
      orderBy: { lastAssignedAt: 'asc' },
    });
    if (!online.length) {
      await this.notifyAgents(
        ownerUserId,
        '有访客等待接入',
        '当前没有在线客服，请尽快处理',
        `/service-desk?conversation=${conversationId}`,
      );
      return;
    }
    const counts = await this.prisma.serviceDeskConversation.groupBy({
      by: ['assigneeUserId'],
      where: { ownerUserId, status: 'active' },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((item) => [item.assigneeUserId, item._count._all]),
    );
    const picked = online
      .filter(
        (agent) =>
          (countMap.get(agent.memberUserId) || 0) < agent.maxConcurrent,
      )
      .sort(
        (a, b) =>
          (countMap.get(a.memberUserId) || 0) -
          (countMap.get(b.memberUserId) || 0),
      )[0];
    if (!picked) {
      await this.notifyAgents(
        ownerUserId,
        '有访客等待接入',
        '在线客服均已满负荷',
        `/service-desk?conversation=${conversationId}`,
      );
      return;
    }
    await this.touchConversation(conversationId, {
      assigneeUserId: picked.memberUserId,
      status: 'active',
    });
    await this.prisma.serviceDeskAgent.update({
      where: { id: picked.id },
      data: { lastAssignedAt: new Date() },
    });
    await this.notifications.notify(picked.memberUserId, {
      category: 'service_desk',
      title: '有新的客服会话分配给你',
      body: '请尽快接入',
      link: `/service-desk?conversation=${conversationId}`,
    });
  }

  private async visitorConversation(token: string, conversationId: number) {
    const visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!visitor)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '访客身份已失效');
    const conversation = await this.prisma.serviceDeskConversation.findFirst({
      where: { id: conversationId, visitorId: visitor.id },
    });
    if (!conversation) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '会话不存在');
    }
    return { visitor, conversation };
  }

  async openMessages(token: string, conversationId: number, afterId = 0) {
    await this.visitorConversation(token, conversationId);
    const messages = await this.prisma.serviceDeskMessage.findMany({
      where: { conversationId, id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: 200,
    });
    await this.prisma.serviceDeskConversation.update({
      where: { id: conversationId },
      data: { unreadForRequester: 0 },
    });
    return {
      messages: messages.map((item) => this.messageView(item, new Map())),
    };
  }

  async openSend(
    token: string,
    conversationId: number,
    body: Record<string, unknown>,
  ) {
    const { visitor, conversation } = await this.visitorConversation(
      token,
      conversationId,
    );
    if (conversation.status === 'closed') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '会话已结束，请重新发起咨询',
      );
    }
    const content = text(body.content).slice(0, MAX_MESSAGE);
    const contentType = ['text', 'image', 'file'].includes(
      text(body.contentType),
    )
      ? text(body.contentType)
      : 'text';
    if (!content) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '消息不能为空');
    }
    const clientMsgId = text(body.clientMsgId).slice(0, 64);
    if (clientMsgId) {
      const exist = await this.prisma.serviceDeskMessage.findFirst({
        where: { conversationId, clientMsgId },
      });
      if (exist) return this.messageView(exist, new Map());
    }
    const message = await this.prisma.serviceDeskMessage.create({
      data: {
        conversationId,
        senderType: 'visitor',
        contentType,
        content,
        attachmentUrl: text(body.attachmentUrl).slice(0, 500),
        attachmentName: text(body.attachmentName).slice(0, 200),
        attachmentSize: Number(body.attachmentSize || 0),
        clientMsgId,
      },
    });
    await this.prisma.serviceDeskVisitor.update({
      where: { id: visitor.id },
      data: { lastSeenAt: new Date() },
    });
    await this.touchConversation(conversationId, {
      lastMessageAt: new Date(),
      unreadForAgent: { increment: 1 },
    });
    const view = this.messageView(message, new Map());
    this.publish(`conv:${conversationId}`, 'message', { message: view });
    this.publish(`owner:${conversation.ownerUserId}`, 'conversation', {
      id: conversationId,
      visitorMessage: true,
    });
    await this.notifications.notify(conversation.ownerUserId, {
      category: 'service_desk',
      title: '访客发来新消息',
      body: content.slice(0, 80),
      link: `/service-desk?conversation=${conversationId}`,
    });
    void this.autoReply(conversation.ownerUserId, conversationId).catch(
      () => undefined,
    );
    return view;
  }

  async openRate(
    token: string,
    conversationId: number,
    rating: number,
    comment: string,
  ) {
    const { conversation } = await this.visitorConversation(
      token,
      conversationId,
    );
    const value = Math.min(5, Math.max(1, Math.round(rating)));
    await this.prisma.serviceDeskConversation.update({
      where: { id: conversation.id },
      data: { rating: value, ratingComment: comment.slice(0, 500) },
    });
    if (conversation.assigneeUserId) {
      await this.notifications.notify(conversation.assigneeUserId, {
        category: 'service_desk',
        title: '收到一条会话评价',
        body: `${value} 星${comment ? `：${comment.slice(0, 60)}` : ''}`,
        link: `/service-desk?conversation=${conversationId}`,
      });
    }
    return { rating: value };
  }

  async visitorByToken(token: string) {
    const visitor = await this.prisma.serviceDeskVisitor.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!visitor) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '访客身份已失效');
    }
    return visitor;
  }

  async visitorConversationOf(token: string, conversationId: number) {
    const { conversation } = await this.visitorConversation(
      token,
      conversationId,
    );
    return conversation;
  }

  stream(ownerUserId: string, conversationId: number | null, emit: Emit) {
    const keys = conversationId
      ? [`owner:${ownerUserId}`, `conv:${conversationId}`]
      : [`owner:${ownerUserId}`];
    const unsubscribes = keys.map((key) =>
      this.subscribe(key, (event, data) => void emit(event, data)),
    );
    return () => unsubscribes.forEach((fn) => fn());
  }
}
