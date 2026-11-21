import type { NotificationRow } from '@enterprise/contracts';
import { AipddKeyService } from '../account/aipdd-key.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Logger } from '../common/logger';
import { httpRequest } from '../http/transport';
import { aiworkinBaseUrl } from '../aiworkin/aiworkin.config';
import { aiSocialWebTarget, aiSocialWebUrl } from './ai-social.target';

const logger = new Logger('AiSocialNotifications');
const CACHE_TTL_MS = 15_000;
const PAGE_SIZE = 50;

type UpstreamRow = Record<string, unknown>;

/** 只接受标量文本；对象/数组一律回落空串，避免 `[object Object]` 进标题或链接。 */
const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};
type Envelope<T> = { code: number; message: string; data: T };
type Snapshot = {
  rows: NotificationRow[];
  unread: number;
  available: boolean;
};
type AccountGroup = {
  account: string;
  keys: Array<{ keyId: number; plain: string }>;
};

/**
 * DSH 社交插件通知（API Key 鉴权）→ 本站铃铛。
 *
 * 插件用一把 AIPDD Key 调 `/api/v1/notifications`；一个本地账号可能绑定多把 Key，
 * 因此这里按「Key 所属 AIPDD 账号」分组：同一账号多把 Key 只拉一次（优先最新绑定的 Key），
 * 不同账号分别拉取后合并去重。外部编号写成 `keyId:通知id`，标记已读时据此回到对应 Key。
 */
export class AiSocialNotificationsService {
  private readonly cache = new Map<string, { at: number; data: Snapshot }>();

  constructor(private readonly keys: AipddKeyService) {}

  /** 插件通知后端：优先 AIWORKIN_NOTIFY_BASE_URL（与 DSH 插件同名），否则用 AIworkin API 地址。 */
  private base(): string {
    return (process.env.AIWORKIN_NOTIFY_BASE_URL || aiworkinBaseUrl()).replace(
      /\/+$/,
      '',
    );
  }

  private async call<T>(
    path: string,
    plain: string,
    init: { method?: string } = {},
  ): Promise<T> {
    let response;
    try {
      response = await httpRequest<Envelope<T>>(`${this.base()}${path}`, {
        method: init.method || 'GET',
        headers: {
          authorization: `Bearer ${plain}`,
          accept: 'application/json',
        },
        timeoutMs: 4000,
        operation: 'ai-social:notifications',
      });
    } catch (error) {
      logger.warn({ path, error: this.errorInfo(error) });
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'AIworkin 通知暂时不可用，请稍后重试',
      );
    }
    const payload = response.data;
    if (!response.ok || !payload || payload.code !== 0) {
      throw new BusinessException(
        response.status === 401
          ? ErrorCode.UNAUTHORIZED
          : ErrorCode.SERVICE_UNAVAILABLE,
        payload?.message && /[\u4e00-\u9fa5]/.test(payload.message)
          ? payload.message
          : 'AIworkin 通知暂时不可用，请稍后重试',
      );
    }
    return payload.data;
  }

  private view(raw: UpstreamRow, keyId: number): NotificationRow | null {
    const id = text(raw.id).trim();
    if (!id) return null;
    const payload =
      raw.payload &&
      typeof raw.payload === 'object' &&
      !Array.isArray(raw.payload)
        ? (raw.payload as Record<string, unknown>)
        : {};
    const target = aiSocialWebTarget();
    const link = text(
      raw.link ?? raw.actionTarget ?? raw.url ?? payload.link,
    ).trim();
    return {
      id: 0,
      category: 'sns',
      categoryLabel: 'AIworkin 社交',
      level: text(raw.level ?? payload.level) || 'info',
      title: (text(raw.title) || 'AIworkin 通知').slice(0, 200),
      body: text(
        raw.content ?? raw.body ?? payload.message ?? payload.summary,
      ).slice(0, 500),
      link: link ? aiSocialWebUrl(link, target) : '',
      entityType:
        `ai_social_${text(raw.eventType ?? raw.sourceType) || 'notice'}`.slice(
          0,
          32,
        ),
      entityId: text(raw.sourceId ?? raw.entityId).slice(0, 64),
      read: raw.readAt != null || raw.read === true,
      createdAt: text(raw.createdAt) || new Date().toISOString(),
      source: 'sns',
      externalId: `${keyId}:${id}`,
    };
  }

  private async fetchAccount(
    group: AccountGroup,
  ): Promise<{ rows: NotificationRow[]; unread: number } | null> {
    for (const key of group.keys) {
      try {
        const list = await this.call<{ list?: UpstreamRow[] }>(
          `/api/v1/notifications?page=1&pageSize=${PAGE_SIZE}`,
          key.plain,
        );
        const rows = (Array.isArray(list?.list) ? list.list : [])
          .map((row) => this.view(row, key.keyId))
          .filter((row): row is NotificationRow => Boolean(row));
        let unread = rows.filter((row) => !row.read).length;
        try {
          const count = await this.call<{ count?: number }>(
            '/api/v1/notifications/unread-count',
            key.plain,
          );
          if (typeof count?.count === 'number') unread = count.count;
        } catch {
          // 未读数单独失败时用当前页结果兜底，不影响通知列表。
        }
        return { rows, unread };
      } catch (error) {
        // 同一账号多把 Key 时，某把失效就换下一把；全部失败才放弃该账号。
        logger.warn({
          account: group.account,
          keyId: key.keyId,
          error: this.errorInfo(error),
        });
        continue;
      }
    }
    return null;
  }

  private groupsOf(
    bindings: Awaited<ReturnType<AipddKeyService['activeBindings']>>,
  ): AccountGroup[] {
    const groups = new Map<string, AccountGroup>();
    for (const binding of bindings) {
      const account = binding.aipddUserId || `key:${binding.keyId}`;
      const group = groups.get(account) || { account, keys: [] };
      group.keys.push({ keyId: binding.keyId, plain: binding.plain });
      groups.set(account, group);
    }
    // 每个账号优先用最新绑定的 Key 拉取；失败再回退到更早的 Key。
    for (const group of groups.values()) group.keys.reverse();
    return [...groups.values()];
  }

  /** 合并后的通知快照（15 秒缓存，已读/全部已读后立即失效）。 */
  async snapshot(userId: string): Promise<Snapshot> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
    const bindings = await this.keys.activeBindings(userId);
    const groups = this.groupsOf(bindings);
    const rows: NotificationRow[] = [];
    const seen = new Set<string>();
    let unread = 0;
    let available = false;
    for (const group of groups) {
      const result = await this.fetchAccount(group);
      if (!result) continue;
      available = true;
      unread += result.unread;
      for (const row of result.rows) {
        const sourceId = row.externalId.split(':').slice(1).join(':');
        const dedupe = `${group.account}:${sourceId}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        rows.push(row);
      }
    }
    rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const data = { rows, unread, available };
    this.cache.set(userId, { at: Date.now(), data });
    return data;
  }

  /** 标记一条外部通知已读：`keyId:通知id` → 对应 Key 调插件通知接口。 */
  async read(userId: string, externalId: string) {
    const raw = String(externalId || '').trim();
    const split = raw.indexOf(':');
    const keyId = Number(split > 0 ? raw.slice(0, split) : '');
    const id = split > 0 ? raw.slice(split + 1) : '';
    if (!id || !Number.isInteger(keyId) || keyId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '通知编号无效');
    }
    const bindings = await this.keys.activeBindings(userId);
    const binding = bindings.find((item) => item.keyId === keyId);
    if (!binding) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '通知所属的 API Key 已解绑，无法标记已读',
      );
    }
    await this.call(
      `/api/v1/notifications/${encodeURIComponent(id)}/read`,
      binding.plain,
      { method: 'POST' },
    );
    this.cache.delete(userId);
    return { id: raw, read: true };
  }

  /** 全部已读：每个账号挑一把可用 Key 调 read-all，单账号失败不影响其他账号。 */
  async readAll(userId: string) {
    const bindings = await this.keys.activeBindings(userId);
    const groups = this.groupsOf(bindings);
    let updated = 0;
    for (const group of groups) {
      for (const key of group.keys) {
        try {
          const result = await this.call<{ updated?: number }>(
            '/api/v1/notifications/read-all',
            key.plain,
            { method: 'POST' },
          );
          updated += Number(result?.updated || 0);
          break;
        } catch {
          continue;
        }
      }
    }
    this.cache.delete(userId);
    return { updated };
  }

  private errorInfo(error: unknown) {
    if (error instanceof Error)
      return { name: error.name, message: error.message };
    return { message: String(error) };
  }
}
