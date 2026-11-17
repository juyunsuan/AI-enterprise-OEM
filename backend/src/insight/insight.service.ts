import {
  INSIGHT_PRESET_TABLES,
  INSIGHT_SCORE_DEFAULTS,
  INSIGHT_HARVEST_RECIPES,
  insightDedupKeys,
} from '@enterprise/contracts';
import type { Prisma } from '../../generated/prisma';
import { LIST_ALL_LIMIT, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { CurrentUser } from '../auth/current-user';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataTableService } from '../data-table/data-table.service';
import { toJsonObject } from '../shared/json-value';
import { aiJson } from '../ai/ai-gateway';
import type { DeliverableSink } from '../content/deliverable';
import type { AssetVisionService } from '../content/vision.service';
import type { RpaChromeScheduleService } from '../rpa/chrome-schedule.service';

/**
 * 智慧分析板块服务（全域内容热点分析 + 流行趋势分析）。
 *
 * 口径（`docs/智慧分析板块设计方案.md`）：
 * - 采集行不落本模块表，统一落预置多维表格「热点内容」（走既有 landRows）；
 * - 热点是「热点内容」表的聚合产物，删了可重算，MVP 分组＝话题∪关键词（D2=A）；
 * - 三热度分列（interaction/visual/commercial），趋势只读消费既有数字资产与采集结果；
 * - 一切按账号（userId）归属；AI 全走统一网关，产物经 deliverable 通道入数字资产；
 * - 采集派发复用浏览器代理计划任务（D4 主备），失败一律降级为「目标 + 手动入口」，不阻断订阅主流程。
 */

type PresetKey = keyof typeof INSIGHT_PRESET_TABLES;

const DAY_MS = 86_400_000;
const REPORT_MAX_TOKENS = 3000;
const REPORT_TIMEOUT_MS = 90_000;
const TAG_BATCH_LIMIT = 50;

/** 数字列取值：兼容采集行里数字被存成字符串的情况。 */
function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return text(value).trim();
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => str(item)).filter(Boolean);
}

function isoOrEmpty(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

export class InsightService {
  /** 产物登记通道（services.ts 装配）：快报归档入数字资产。 */
  deliverableSink?: DeliverableSink;
  /** 采集派发通道（services.ts 装配）：订阅→浏览器代理计划任务。 */
  schedule?: RpaChromeScheduleService;
  /** 视觉理解通道（services.ts 装配）：资产批量打标→元素趋势指标。 */
  vision?: AssetVisionService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly dataTable: DataTableService,
  ) {}

  // ---------- 设置与预置表 ----------

  async ensureSetting(user: CurrentUser) {
    const existing = await this.prisma.insightSetting.findUnique({
      where: { userId: user.userId },
    });
    if (existing) return existing;
    try {
      return await this.prisma.insightSetting.create({
        data: { userId: user.userId, scoreConfig: toJsonObject({}) },
      });
    } catch {
      // 并发首建撞唯一键：回读即可
      const row = await this.prisma.insightSetting.findUnique({
        where: { userId: user.userId },
      });
      if (!row) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '智慧分析初始化失败',
        );
      }
      return row;
    }
  }

  /** 预置表 id 有效且表仍在则复用，否则按模板新建并记回设置。 */
  private async ensurePresetTable(
    user: CurrentUser,
    key: PresetKey,
    currentId: number,
  ) {
    if (currentId > 0) {
      const table = await this.prisma.dataTable.findUnique({
        where: { id: currentId },
        select: { id: true, name: true },
      });
      if (table) return table.id;
    }
    const definition = INSIGHT_PRESET_TABLES[key];
    const created = await this.dataTable.create(user, {
      name: definition.tableName,
      description: definition.tableDescription,
    });
    const tableId = Number((created as { id: number }).id);
    await this.dataTable.addFields(
      user,
      tableId,
      definition.columns.map((column) => ({
        name: column.name,
        fieldKey: column.fieldKey,
        fieldType: column.fieldType,
      })),
    );
    return tableId;
  }

  async ensurePresetTables(user: CurrentUser) {
    const setting = await this.ensureSetting(user);
    const contentTableId = await this.ensurePresetTable(
      user,
      'content',
      setting.contentTableId,
    );
    const ledgerTableId = await this.ensurePresetTable(
      user,
      'hotspotLedger',
      setting.ledgerTableId,
    );
    if (
      contentTableId !== setting.contentTableId ||
      ledgerTableId !== setting.ledgerTableId
    ) {
      await this.prisma.insightSetting.update({
        where: { id: setting.id },
        data: { contentTableId, ledgerTableId },
      });
    }
    return { contentTableId, ledgerTableId };
  }

  private async tableInfo(tableId: number) {
    if (tableId <= 0) {
      return { id: 0, exists: false, name: '', fieldCount: 0 };
    }
    const table = await this.prisma.dataTable.findUnique({
      where: { id: tableId },
      select: { id: true, name: true },
    });
    const fieldCount = table
      ? await this.prisma.dataTableField.count({ where: { tableId } })
      : 0;
    return {
      id: tableId,
      exists: Boolean(table),
      name: table?.name ?? '',
      fieldCount,
    };
  }

  // ---------- 采集通道健康度（D4：托管为主、本机备用）----------

  private async deviceChannels(user: CurrentUser) {
    const fresh = Date.now() - 90_000;
    const [host, local] = await Promise.all([
      this.prisma.workbuddyHost.count({
        where: {
          userId: user.userId,
          clientKind: 'DESKTOP',
          enabled: true,
          status: 'ONLINE',
          lastSeenAt: { gte: new Date(fresh) },
        },
      }),
      this.prisma.rpaChromeDevice.count({
        where: {
          createdBy: user.userId,
          status: 'ONLINE',
          lastSeenAt: { gte: new Date(fresh) },
        },
      }),
    ]);
    return [
      {
        kind: 'managed',
        label: 'BotBuddy 主机托管窗口（主通道）',
        online: host > 0,
      },
      {
        kind: 'local',
        label: '本机 Chrome 浏览器代理（备用通道）',
        online: local > 0,
      },
    ];
  }

  // ---------- 总览 ----------

  async overview(user: CurrentUser) {
    const { contentTableId, ledgerTableId } =
      await this.ensurePresetTables(user);
    const [subscriptions, hotspotCount, contentCount, stageRows, topTrends] =
      await Promise.all([
        this.prisma.insightSubscription.findMany({
          where: { userId: user.userId },
          select: { status: true },
        }),
        this.prisma.insightHotspot.count({ where: { userId: user.userId } }),
        this.prisma.dataTableRow.count({
          where: { tableId: contentTableId, createdBy: user.userId },
        }),
        this.prisma.insightHotspot.groupBy({
          by: ['stage'],
          where: { userId: user.userId },
          _count: { _all: true },
        }),
        this.prisma.insightMetric.findMany({
          where: { userId: user.userId, metricType: 'interaction' },
          orderBy: [{ period: 'desc' }, { value: 'desc' }],
          take: 5,
        }),
      ]);
    const stageCounts: Record<string, number> = {};
    for (const row of stageRows) {
      stageCounts[row.stage] = row._count._all;
    }
    const [contentInfo, ledgerInfo] = await Promise.all([
      this.tableInfo(contentTableId),
      this.tableInfo(ledgerTableId),
    ]);
    return {
      subscriptionCount: subscriptions.length,
      activeSubscriptionCount: subscriptions.filter(
        (item) => item.status === 'ACTIVE',
      ).length,
      contentCount,
      hotspotCount,
      stageCounts,
      topTrends: topTrends.map((item) => this.shapeMetric(item)),
      deviceChannels: await this.deviceChannels(user),
      presetTables: [
        {
          key: 'content',
          tableName: INSIGHT_PRESET_TABLES.content.tableName,
          dataTableId: contentInfo.id,
          exists: contentInfo.exists,
          fieldCount: contentInfo.fieldCount,
        },
        {
          key: 'hotspotLedger',
          tableName: INSIGHT_PRESET_TABLES.hotspotLedger.tableName,
          dataTableId: ledgerInfo.id,
          exists: ledgerInfo.exists,
          fieldCount: ledgerInfo.fieldCount,
        },
      ],
      ready: contentInfo.exists && ledgerInfo.exists,
    };
  }

  // ---------- 订阅 CRUD ----------

  async listSubscriptions(user: CurrentUser) {
    const setting = await this.ensureSetting(user);
    const rows = await this.prisma.insightSubscription.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
    // 内容计数按订阅来源统计：读「热点内容」表本账号行，在内存里按 subscription_id 归并，
    // 避免对 Json 列做 path 过滤（MySQL / PostgreSQL 行为不一致）。
    const tally = new Map<number, number>();
    if (rows.length && setting.contentTableId > 0) {
      const contentRows = await this.prisma.dataTableRow.findMany({
        where: { tableId: setting.contentTableId, createdBy: user.userId },
        select: { data: true },
        take: 2000,
      });
      for (const row of contentRows) {
        const data = (row.data ?? {}) as Record<string, unknown>;
        const sid = num(data.subscription_id);
        if (sid > 0) tally.set(sid, (tally.get(sid) ?? 0) + 1);
      }
    }
    return rows.map((row) =>
      this.shapeSubscription(row, tally.get(row.id) ?? 0),
    );
  }

  async saveSubscription(user: CurrentUser, body: Record<string, unknown>) {
    const name = str(body.name).slice(0, 120);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '订阅名称必填');
    }
    const platforms = strArray(body.platforms);
    const keywords = strArray(body.keywords);
    const topics = strArray(body.topics);
    const creators = strArray(body.creators);
    if (!platforms.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请至少选择一个平台');
    }
    if (!keywords.length && !topics.length && !creators.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请至少配置一个关键词 / 话题 / 博主',
      );
    }
    const data = {
      name,
      platforms,
      keywords,
      topics,
      creators,
      frequency: ['hourly', 'daily', 'weekly'].includes(str(body.frequency))
        ? str(body.frequency)
        : 'daily',
      excludeWords: strArray(body.excludeWords),
      minEngagement: Math.max(0, num(body.minEngagement)),
      alertGrowthPct: Math.max(
        0,
        Math.min(1000, num(body.alertGrowthPct) || 50),
      ),
      quota: toJsonObject({
        perRun: Math.max(
          0,
          num(
            typeof body.quota === 'object' && body.quota !== null
              ? (body.quota as Record<string, unknown>).perRun
              : 0,
          ),
        ),
        perDay: Math.max(
          0,
          num(
            typeof body.quota === 'object' && body.quota !== null
              ? (body.quota as Record<string, unknown>).perDay
              : 0,
          ),
        ),
      }),
    };
    const id = num(body.id);
    let row;
    if (id > 0) {
      const existing = await this.prisma.insightSubscription.findFirst({
        where: { id, userId: user.userId },
      });
      if (!existing) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '订阅不存在');
      }
      row = await this.prisma.insightSubscription.update({
        where: { id },
        data,
      });
    } else {
      row = await this.prisma.insightSubscription.create({
        data: {
          userId: user.userId,
          ...data,
          status: 'ACTIVE',
          scheduleIds: toJsonObject([]),
        },
      });
    }
    await this.identity.audit(
      user.userId,
      '智慧分析订阅保存',
      `订阅「${name}」(${platforms.join('/')})`,
    );
    // S2：保存后尽力派发周期采集任务；前置不满足只记日志，不影响订阅落库。
    await this.syncSchedule(user, row.id).catch(() => undefined);
    const refreshed = await this.prisma.insightSubscription.findUnique({
      where: { id: row.id },
    });
    return this.shapeSubscription(refreshed ?? row, 0);
  }

  async removeSubscription(user: CurrentUser, id: number) {
    const row = await this.prisma.insightSubscription.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订阅不存在');
    await this.dropSchedule(user, strArray(row.scheduleIds).map(Number));
    await this.prisma.insightSubscription.delete({ where: { id } });
    await this.identity.audit(
      user.userId,
      '智慧分析订阅删除',
      `订阅「${row.name}」`,
    );
    return { id, deleted: true };
  }

  async toggleSubscription(user: CurrentUser, id: number, status: string) {
    const next = status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
    const row = await this.prisma.insightSubscription.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订阅不存在');
    const updated = await this.prisma.insightSubscription.update({
      where: { id },
      data: { status: next },
    });
    await this.identity.audit(
      user.userId,
      '智慧分析订阅启停',
      `订阅「${row.name}」→ ${next}`,
    );
    // S2：启用即补派采集任务，停用即收口任务（不影响订阅本身）。
    if (next === 'ACTIVE') {
      await this.syncSchedule(user, id).catch(() => undefined);
    } else {
      await this.dropSchedule(user, strArray(row.scheduleIds).map(Number));
      await this.prisma.insightSubscription
        .update({ where: { id }, data: { scheduleIds: [] } })
        .catch(() => undefined);
    }
    const refreshed = await this.prisma.insightSubscription.findUnique({
      where: { id },
    });
    return this.shapeSubscription(refreshed ?? updated, 0);
  }

  /**
   * 立即采集（S1）：按 D4 主备通道择优生成采集目标与去向。
   * 真实的计划任务派发到 BotBuddy 主机 / 浏览器代理属 S2；这里先把配方与
   * 阻断出口如实交回，未接通时不静默报成功。
   */
  async collectNow(user: CurrentUser, id: number) {
    const row = await this.prisma.insightSubscription.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订阅不存在');
    const platforms = strArray(row.platforms);
    const recipe = platforms
      .map(
        (platform) =>
          (
            INSIGHT_HARVEST_RECIPES as Record<
              string,
              { goalTemplate: string } | undefined
            >
          )[platform],
      )
      .find(Boolean);
    const firstKeyword =
      strArray(row.keywords)[0] ||
      strArray(row.topics)[0] ||
      strArray(row.creators)[0] ||
      row.name;
    const goal = recipe
      ? recipe.goalTemplate.replace('{keyword}', firstKeyword)
      : `按订阅「${row.name}」在 ${platforms.join('/')} 采集 ${firstKeyword} 的公开内容进「热点内容」表`;
    // S2 已接通：有周期任务就直接跑一轮；没有则先建再跑（仍需要在线设备）。
    const scheduleIds = strArray(row.scheduleIds).map(Number);
    if (this.schedule) {
      let scheduleId = scheduleIds.find((value) => value > 0) ?? 0;
      if (!scheduleId) {
        const synced = await this.syncSchedule(user, id).catch(() => ({
          ok: false,
        }));
        scheduleId = Number(
          (synced as { scheduleId?: number }).scheduleId ?? 0,
        );
      }
      if (scheduleId > 0) {
        const ran = await this.schedule
          .runNow(user, String(scheduleId))
          .then(() => true)
          .catch(() => false);
        if (ran) {
          return {
            dispatched: true,
            reason:
              '已向在线采集设备下发一轮任务（结果幂等写回「热点内容」表）',
            goal,
            entryPath: '/rpa?tab=schedule',
          };
        }
      }
    }
    const channels = await this.deviceChannels(user);
    const online = channels.some((channel) => channel.online);
    return {
      dispatched: false,
      reason: online
        ? '已有在线设备但本轮派发失败，请用下方目标手动跑一轮'
        : '主备采集通道均离线：请在 BotBuddy 主机开托管窗口，或本机安装浏览器代理',
      goal,
      entryPath: online ? '/rpa?tab=schedule' : '/agent-bot',
    };
  }

  // ---------- 热点聚合（MVP：话题∪关键词分组）----------

  async listHotspots(user: CurrentUser, query: Record<string, unknown>) {
    const page = Math.max(1, num(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, num(query.pageSize) || 30));
    const where: Prisma.InsightHotspotWhereInput = { userId: user.userId };
    if (num(query.subscriptionId) > 0) {
      where.subscriptionId = num(query.subscriptionId);
    }
    if (str(query.stage)) where.stage = str(query.stage);
    const platform = str(query.platform);
    // 平台过滤放在内存里做：hotspots 每账号数量有限，避免对 Json 数组用 array_contains
    // （MySQL 支持、PostgreSQL 语义不同，会踩双库兼容坑）。
    const rows = await this.prisma.insightHotspot.findMany({
      where,
      orderBy: [{ hotScore: 'desc' }, { growthRate: 'desc' }],
    });
    const filtered = platform
      ? rows.filter((row) =>
          strArray(row.platforms)
            .map((item) => item.toLowerCase())
            .includes(platform.toLowerCase()),
        )
      : rows;
    return {
      list: filtered
        .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
        .map((row) => this.shapeHotspot(row)),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async hotspotDetail(user: CurrentUser, id: number) {
    const hotspot = await this.prisma.insightHotspot.findFirst({
      where: { id, userId: user.userId },
    });
    if (!hotspot)
      throw new BusinessException(ErrorCode.NOT_FOUND, '热点不存在');
    const links = await this.prisma.insightHotspotContent.findMany({
      where: { hotspotId: id },
      orderBy: { representative: 'desc' },
      take: LIST_ALL_LIMIT,
    });
    const contents = await Promise.all(
      links.map(async (link) => {
        const row = await this.prisma.dataTableRow.findUnique({
          where: { id: link.rowId },
        });
        const data = (row?.data ?? {}) as Record<string, unknown>;
        return {
          rowId: link.rowId,
          tableId: link.tableId,
          title: str(data.title),
          url: str(data.url),
          platform: str(data.platform),
          author: str(data.author),
          likes: num(data.likes),
          comments: num(data.comments),
          collects: num(data.collects),
          publishAt: str(data.publish_at),
          representative: link.representative,
        };
      }),
    );
    return { hotspot: this.shapeHotspot(hotspot), contents };
  }

  async listMetrics(user: CurrentUser, query: Record<string, unknown>) {
    const where: Prisma.InsightMetricWhereInput = { userId: user.userId };
    if (str(query.metricType)) where.metricType = str(query.metricType);
    if (str(query.metricKey)) where.metricKey = str(query.metricKey);
    const rows = await this.prisma.insightMetric.findMany({
      where,
      orderBy: [{ period: 'desc' }, { value: 'desc' }],
      take: 200,
    });
    return rows.map((row) => this.shapeMetric(row));
  }

  /**
   * 重算热点：读「热点内容」表本账号行 → 分组 → 打分分层 → upsert 热点与时序指标。
   * 可重复执行：先清空本账号自动热点（subscriptionId=0，未人工纠偏），再重建。
   */
  async recomputeHotspots(user: CurrentUser) {
    const setting = await this.ensureSetting(user);
    const { contentTableId } = await this.ensurePresetTables(user);
    const rows = await this.prisma.dataTableRow.findMany({
      where: { tableId: contentTableId, createdBy: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const config = this.scoreConfig(setting);
    const now = Date.now();
    const windowStart = now - config.timeWindowDays * DAY_MS;

    // 分组：话题优先，其次首个关键词，再退标题前缀。
    type Group = {
      key: string;
      name: string;
      platforms: Set<string>;
      keywords: Set<string>;
      interaction: number;
      recent: number;
      prev: number;
      contentCount: number;
      rows: { rowId: number; interaction: number; at: number }[];
      firstAt: number;
    };
    const groups = new Map<string, Group>();
    for (const row of rows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const at = row.createdAt.getTime();
      if (at < windowStart) continue;
      const engagement =
        num(data.likes) +
        num(data.comments) +
        num(data.collects) +
        num(data.shares);
      const topic = str(data.topic);
      const keyword = strArray([data.keywords])[0] || str(data.keywords);
      const title = str(data.title);
      const name = topic || keyword || title.slice(0, 8);
      if (!name) continue;
      const key = name.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name,
          platforms: new Set(),
          keywords: new Set(),
          interaction: 0,
          recent: 0,
          prev: 0,
          contentCount: 0,
          rows: [],
          firstAt: at,
        };
        groups.set(key, group);
      }
      const platform = str(data.platform);
      if (platform) group.platforms.add(platform);
      if (keyword) group.keywords.add(keyword);
      group.interaction += engagement;
      group.contentCount += 1;
      group.firstAt = Math.min(group.firstAt, at);
      group.rows.push({ rowId: row.id, interaction: engagement, at });
      const seven = now - 7 * DAY_MS;
      if (at >= seven) group.recent += engagement;
      else if (at >= seven - 7 * DAY_MS) group.prev += engagement;
    }

    const list = [...groups.values()];
    const sortedInteractions = list
      .map((group) => group.interaction)
      .sort((a, b) => a - b);
    const percentile = (value: number) => {
      if (!sortedInteractions.length) return 0;
      let idx = 0;
      while (idx < sortedInteractions.length && sortedInteractions[idx] < value)
        idx += 1;
      return Math.round((idx / sortedInteractions.length) * 100);
    };
    const maxInteraction = Math.max(1, ...sortedInteractions);

    // 先清自动热点（保留人工纠偏 reviewNote 非空的组）：无关系字段，两步删除。
    const autoIds = await this.prisma.insightHotspot.findMany({
      where: { userId: user.userId, reviewNote: '' },
      select: { id: true },
    });
    if (autoIds.length) {
      await this.prisma.insightHotspotContent.deleteMany({
        where: { hotspotId: { in: autoIds.map((item) => item.id) } },
      });
      await this.prisma.insightHotspot.deleteMany({
        where: { id: { in: autoIds.map((item) => item.id) } },
      });
    }

    let upserted = 0;
    for (const group of list) {
      if (group.contentCount < 2) continue;
      const growth =
        group.prev > 0
          ? ((group.recent - group.prev) / group.prev) * 100
          : group.recent > 0
            ? 100
            : 0;
      const basePct = percentile(group.interaction);
      const normalized = (group.interaction / maxInteraction) * 100;
      const diffusion = Math.min(100, group.platforms.size * 25);
      const volume = Math.min(
        100,
        (group.contentCount / Math.max(1, list.length)) * 100,
      );
      const w = config.weights;
      const hotScore =
        normalized * w.interaction +
        Math.max(0, Math.min(100, growth)) * w.growth +
        diffusion * w.diffusion +
        volume * w.volume;
      const stage = this.classifyStage(growth, basePct, hotScore, config);
      const representative = group.rows.reduce(
        (best, item) => (item.interaction > best.interaction ? item : best),
        group.rows[0],
      );
      const firstAt = new Date(group.firstAt);
      const hotspot = await this.prisma.insightHotspot.create({
        data: {
          userId: user.userId,
          subscriptionId: 0,
          name: group.name.slice(0, 200),
          platforms: [...group.platforms],
          stage,
          hotScore,
          growthRate: growth,
          contentCount: group.contentCount,
          sentiment: toJsonObject({}),
          keywords: [...group.keywords].slice(0, 20),
          firstPlatform: [...group.platforms][0] ?? '',
          firstPublishAt: firstAt,
          windowStart: new Date(windowStart),
          windowEnd: new Date(now),
        },
      });
      upserted += 1;
      for (const item of group.rows) {
        await this.prisma.insightHotspotContent.create({
          data: {
            hotspotId: hotspot.id,
            tableId: contentTableId,
            rowId: item.rowId,
            representative: item.rowId === representative.rowId,
          },
        });
      }
      // 互动时序：按天写归一值（同一天多条取累计后覆盖）
      const byDay = new Map<string, number>();
      for (const item of group.rows) {
        const day = new Date(item.at).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + item.interaction);
      }
      const dayTotals = [...byDay.values()];
      const dayMax = Math.max(1, ...dayTotals);
      for (const [period, totalValue] of byDay) {
        await this.prisma.insightMetric.upsert({
          where: {
            userId_metricKey_metricType_period: {
              userId: user.userId,
              metricKey: group.name,
              metricType: 'interaction',
              period,
            },
          },
          create: {
            userId: user.userId,
            metricKey: group.name,
            metricType: 'interaction',
            period,
            value: (totalValue / dayMax) * 100,
            rawValue: toJsonObject({ interaction: totalValue }),
            growthRate: growth,
          },
          update: {
            value: (totalValue / dayMax) * 100,
            rawValue: toJsonObject({ interaction: totalValue }),
            growthRate: growth,
          },
        });
      }
    }
    return { groups: list.length, upserted };
  }

  // ---------- 趋势只读视图（S7 前只回既有资产与指标）----------

  async trendsOverview(user: CurrentUser) {
    const setting = await this.ensureSetting(user);
    const [assetCount, assetRows] = await Promise.all([
      this.prisma.digitalAssetEntry.count({ where: { userId: user.userId } }),
      this.prisma.digitalAssetEntry.findMany({
        where: { userId: user.userId, type: 'image' },
        select: { labels: true },
        take: 1000,
      }),
    ]);
    const taggedCount = assetRows.filter(
      (row) => strArray(row.labels).length > 0,
    ).length;
    const [visual, commercial] = await Promise.all([
      this.prisma.insightMetric.findMany({
        where: { userId: user.userId, metricType: 'visual' },
        orderBy: { value: 'desc' },
        take: 20,
      }),
      this.prisma.insightMetric.findMany({
        where: { userId: user.userId, metricType: 'commercial' },
        orderBy: { value: 'desc' },
        take: 50,
      }),
    ]);
    const commercialByKey = new Map(
      commercial.map((row) => [row.metricKey.toLowerCase(), Number(row.value)]),
    );
    const hotspots =
      setting.linkageEnabled === 1
        ? await this.prisma.insightHotspot.findMany({
            where: { userId: user.userId },
            orderBy: { hotScore: 'desc' },
            take: 30,
          })
        : [];
    const quadrant = hotspots.map((row) => ({
      concept: row.name,
      interaction: Number(row.hotScore),
      commercial: commercialByKey.get(row.name.toLowerCase()) ?? 0,
    }));
    return {
      assetCount,
      taggedCount,
      elementTrends: visual.map((row) => this.shapeMetric(row)),
      colorTrends: [] as {
        metricKey: string;
        metricType: string;
        period: string;
        value: number;
        growthRate: number;
      }[],
      quadrant,
      linkageEnabled: setting.linkageEnabled === 1,
    };
  }

  // ---------- S2 采集派发（复用浏览器代理计划任务，失败降级不阻断）----------

  /** 选一台在线设备：BotBuddy 托管窗口优先（名称含「托管/洞察/fingerprint」线索），否则最近心跳的本机插件。 */
  private async pickOnlineDevice(userId: string) {
    const devices = await this.prisma.rpaChromeDevice.findMany({
      where: { createdBy: userId, status: 'ONLINE' },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    });
    if (!devices.length) return null;
    const managed = devices.find((device) =>
      /托管|洞察|fingerprint|managed|botbuddy/i.test(device.name),
    );
    return managed ?? devices[0];
  }

  private scheduleConfigFor(frequency: string): Record<string, unknown> {
    if (frequency === 'hourly') return { freq: 'hourly' };
    if (frequency === 'weekly')
      return { freq: 'weekly', time: '03:00', weekdays: [1] };
    return { freq: 'daily', time: '03:00' };
  }

  /**
   * 为订阅建/更一条周期采集计划任务（D4：托管窗口优先，本机插件备用）。
   * 任何前置不满足（无通道服务 / 无在线设备 / 无配方 / 落表参数被上游拒）都只记日志并跳过，
   * 采集仍可在「垂类订阅 → 立即采集」里手动跑，绝不因此让订阅保存失败。
   */
  async syncSchedule(user: CurrentUser, subscriptionId: number) {
    if (!this.schedule) return { ok: false, reason: 'no_channel' };
    const row = await this.prisma.insightSubscription.findFirst({
      where: { id: subscriptionId, userId: user.userId },
    });
    if (!row || row.status !== 'ACTIVE')
      return { ok: false, reason: 'inactive' };
    const device = await this.pickOnlineDevice(user.userId);
    if (!device) return { ok: false, reason: 'no_device' };
    const { contentTableId } = await this.ensurePresetTables(user);
    const platforms = strArray(row.platforms);
    const recipe = platforms
      .map(
        (platform) =>
          (
            INSIGHT_HARVEST_RECIPES as Record<
              string,
              | {
                  goalTemplate: string;
                  fieldMapping: Record<string, string>;
                  dedupBy: string[];
                }
              | undefined
            >
          )[platform],
      )
      .find(Boolean);
    const firstKeyword =
      strArray(row.keywords)[0] ||
      strArray(row.topics)[0] ||
      strArray(row.creators)[0] ||
      row.name;
    const goal = recipe
      ? recipe.goalTemplate.replace('{keyword}', firstKeyword)
      : `按订阅「${row.name}」在 ${platforms.join('/')} 采集「${firstKeyword}」的公开内容进「热点内容」表（内容链接去重）`;
    const dedupBy = recipe?.dedupBy ?? insightDedupKeys('content');
    const existingIds = strArray(row.scheduleIds).map(Number);
    try {
      const saved = (await this.schedule.save(user, {
        id: existingIds[0] || undefined,
        title: `智慧分析·${row.name}`.slice(0, 60),
        goal,
        clientId: device.clientId,
        mode: 'extract',
        persist: 'table',
        tableId: contentTableId,
        dedupBy,
        scheduleType: 'recurring',
        scheduleConfig: this.scheduleConfigFor(row.frequency),
        status: 'enabled',
      })) as { id?: number };
      const scheduleId = Number(saved?.id ?? existingIds[0] ?? 0);
      if (scheduleId > 0) {
        await this.prisma.insightSubscription.update({
          where: { id: row.id },
          data: { scheduleIds: [scheduleId] },
        });
      }
      return { ok: true, scheduleId };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'dispatch_failed',
      };
    }
  }

  /** 停用/删除订阅时收口其采集任务（尽力而为）。 */
  private async dropSchedule(user: CurrentUser, scheduleIds: number[]) {
    if (!this.schedule) return;
    for (const id of scheduleIds) {
      if (id > 0) {
        await this.schedule.remove(user, String(id)).catch(() => undefined);
      }
    }
  }

  // ---------- S5 AI 快报（统一网关 + 产物入数字资产）----------

  async generateReport(
    user: CurrentUser,
    body: Record<string, unknown>,
    token?: string,
  ) {
    const kind = body.kind === 'trend' ? 'trend' : 'hotspot';
    const windowDays = Math.max(1, Math.min(90, num(body.windowDays) || 7));
    const now = new Date();
    const from = new Date(now.getTime() - windowDays * DAY_MS);
    const report = await this.prisma.insightReport.create({
      data: {
        userId: user.userId,
        kind,
        window: toJsonObject({
          from: from.toISOString(),
          to: now.toISOString(),
        }),
        status: 'running',
      },
    });
    const digest = await this.buildReportDigest(user, kind, from, now);
    const generated = await aiJson<{
      title: string;
      sections: { heading: string; body: string }[];
    }>(this.prisma, {
      userId: user.userId,
      token,
      module: 'insight',
      operation: kind === 'trend' ? 'trend.report' : 'hotspot.report',
      messages: [
        {
          role: 'system',
          content:
            '你是企业情报分析师。基于给定的热点/趋势数据摘要，输出一份结构化快报 JSON：' +
            '{"title":string,"sections":[{"heading":string,"body":string}]}，' +
            'sections 至少含「榜单TopN」「解读」「选题建议」「风险提示」，只用给定数据、不编造。',
        },
        { role: 'user', content: digest.slice(0, 6000) },
      ],
      maxTokens: REPORT_MAX_TOKENS,
      timeoutMs: REPORT_TIMEOUT_MS,
      purpose: 'batch',
      validate: (data) => {
        const title = str(data.title);
        const sectionsRaw = Array.isArray(data.sections) ? data.sections : [];
        const sections = sectionsRaw
          .map((item) => {
            const row = item as Record<string, unknown>;
            return { heading: str(row.heading), body: str(row.body) };
          })
          .filter((item) => item.heading || item.body);
        if (!title && !sections.length) return null;
        return { title: title || '智慧分析快报', sections };
      },
    });
    const markdown = this.renderReport(
      kind,
      from,
      now,
      generated?.data ?? null,
      digest,
    );
    let assetId = '';
    if (this.deliverableSink && markdown) {
      try {
        const filename = `insight-${kind}-${now.toISOString().slice(0, 10)}.md`;
        const registered = (await this.deliverableSink(user.userId, {
          bytes: Buffer.from(markdown, 'utf-8'),
          filename,
          labels: ['智慧分析', kind === 'trend' ? '趋势快报' : '热点快报'],
          dir: 'insight',
          source: `insight_report#${report.id}`,
        })) as Record<string, unknown>;
        assetId = str(registered?.id ?? registered?.assetId ?? '');
      } catch {
        // 归档失败不丢正文：正文仍回前端，报告标记 success 但 assetId 空
      }
    }
    const updated = await this.prisma.insightReport.update({
      where: { id: report.id },
      data: {
        status: generated ? 'success' : 'success',
        content: markdown.slice(0, 60000),
        assetId: assetId.slice(0, 64),
        error: generated
          ? ''
          : '未绑定模型 Key 或模型未产出，已按数据摘要生成规则式快报',
      },
    });
    await this.identity.audit(
      user.userId,
      '智慧分析快报生成',
      `${kind} 快报 · ${windowDays} 天窗口`,
    );
    return this.shapeReport(updated);
  }

  async listReports(user: CurrentUser, kind?: string) {
    const where: Prisma.InsightReportWhereInput = { userId: user.userId };
    if (kind === 'trend' || kind === 'hotspot') where.kind = kind;
    const rows = await this.prisma.insightReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.shapeReport(row));
  }

  private async buildReportDigest(
    user: CurrentUser,
    kind: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    if (kind === 'trend') {
      const metrics = await this.prisma.insightMetric.findMany({
        where: {
          userId: user.userId,
          metricType: 'visual',
          updatedAt: { gte: from },
        },
        orderBy: { value: 'desc' },
        take: 20,
      });
      return [
        `【趋势数据窗口 ${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)}】`,
        ...metrics.map(
          (m) =>
            `- 元素「${m.metricKey}」热度 ${Number(m.value).toFixed(1)}（增速 ${Number(m.growthRate).toFixed(1)}%）`,
        ),
      ].join('\n');
    }
    const hotspots = await this.prisma.insightHotspot.findMany({
      where: { userId: user.userId, updatedAt: { gte: from } },
      orderBy: { hotScore: 'desc' },
      take: 15,
    });
    const lines = [
      `【热点窗口 ${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)}】`,
      hotspots.length
        ? hotspots
            .map(
              (h) =>
                `- ${h.name}（阶段 ${h.stage}，得分 ${Number(h.hotScore).toFixed(1)}，增速 ${Number(h.growthRate).toFixed(1)}%，内容 ${h.contentCount}，平台 ${strArray(h.platforms).join('/')}）`,
            )
            .join('\n')
        : '（窗口内暂无热点，请先到「垂类订阅」配置并采集）',
    ];
    return lines.join('\n');
  }

  private renderReport(
    kind: string,
    from: Date,
    to: Date,
    data: {
      title: string;
      sections: { heading: string; body: string }[];
    } | null,
    digest: string,
  ): string {
    const title =
      data?.title ?? `${kind === 'trend' ? '流行趋势' : '全域内容热点'}快报`;
    const head = `# ${title}\n\n> 数据窗口：${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)}\n`;
    if (data?.sections?.length) {
      const body = data.sections
        .map((section) => `## ${section.heading}\n\n${section.body}\n`)
        .join('\n');
      return `${head}\n${body}\n---\n\n### 数据附录\n\n\`\`\`\n${digest}\n\`\`\`\n`;
    }
    return `${head}\n\n### 数据摘要\n\n\`\`\`\n${digest}\n\`\`\`\n`;
  }

  // ---------- S7 资产批量 VLM 打标 → 元素趋势指标 ----------

  async tagAssets(
    user: CurrentUser,
    body: Record<string, unknown>,
    token?: string,
  ) {
    if (!this.vision) {
      return {
        scanned: 0,
        tagged: 0,
        model: '',
        mode: 'unavailable',
        reason: '视觉理解通道未装配',
      };
    }
    const limit = Math.max(1, Math.min(TAG_BATCH_LIMIT, num(body.limit) || 20));
    const assets = await this.prisma.digitalAssetEntry.findMany({
      where: { userId: user.userId, type: 'image' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    if (!assets.length) {
      return {
        scanned: 0,
        tagged: 0,
        model: '',
        mode: 'empty',
        reason: '暂无图片资产可打标',
      };
    }
    const period = new Date().toISOString().slice(0, 10);
    const elementTally = new Map<string, number>();
    let tagged = 0;
    let firstModel = '';
    let anyLlm = false;
    for (const asset of assets) {
      const outcome = await this.vision.understand(
        user.userId,
        {
          name: asset.name,
          type: asset.type,
          url: asset.url,
          text: asset.text,
        },
        token,
      );
      const aiLabels = (outcome.labels ?? []).filter(Boolean).slice(0, 10);
      if (!aiLabels.length) continue;
      if (outcome.mode === 'llm') anyLlm = true;
      if (outcome.model && !firstModel) firstModel = outcome.model;
      // 合并标签：人工在前、AI 候选在后，去重限 20，仅更新本地台账镜像（不覆盖平台原始文件）
      const base = strArray(asset.labels);
      const merged = base
        .concat(aiLabels)
        .filter((label, index, arr) => label && arr.indexOf(label) === index)
        .slice(0, 20);
      await this.prisma.digitalAssetEntry.update({
        where: { id: asset.id },
        data: { labels: merged },
      });
      tagged += 1;
      for (const label of aiLabels) {
        elementTally.set(label, (elementTally.get(label) ?? 0) + 1);
      }
    }
    // 写视觉时序：本日每个元素出现次数归一到 0–100
    const maxCount = Math.max(1, ...elementTally.values());
    for (const [element, count] of elementTally) {
      await this.prisma.insightMetric.upsert({
        where: {
          userId_metricKey_metricType_period: {
            userId: user.userId,
            metricKey: element,
            metricType: 'visual',
            period,
          },
        },
        create: {
          userId: user.userId,
          metricKey: element,
          metricType: 'visual',
          period,
          value: (count / maxCount) * 100,
          rawValue: toJsonObject({ count }),
          growthRate: 0,
        },
        update: {
          value: (count / maxCount) * 100,
          rawValue: toJsonObject({ count }),
        },
      });
    }
    await this.identity.audit(
      user.userId,
      '智慧分析资产打标',
      `扫描 ${assets.length} 图，打标 ${tagged}（${anyLlm ? '模型' : '规则'}）`,
    );
    return {
      scanned: assets.length,
      tagged,
      model: firstModel,
      mode: anyLlm ? 'llm' : 'rule',
      reason: anyLlm ? '' : '未绑定模型 Key 或模型不可用，已按规则式标签兜底',
    };
  }

  // ---------- S4 台账同步（系统列 upsert，不覆盖用户列）----------

  async syncLedger(user: CurrentUser) {
    const { ledgerTableId } = await this.ensurePresetTables(user);
    const hotspots = await this.prisma.insightHotspot.findMany({
      where: { userId: user.userId },
      orderBy: { hotScore: 'desc' },
      take: 100,
    });
    const rows = hotspots.map((row) => ({
      hotspot_name: row.name,
      subscription: row.subscriptionName,
      platforms: strArray(row.platforms).join('/'),
      stage: row.stage,
      hot_score: Number(row.hotScore),
      growth_rate: Number(row.growthRate),
      content_count: row.contentCount,
      sentiment: strArray(row.keywords).slice(0, 5).join('、'),
      keywords: strArray(row.keywords).join('、'),
      synced_at: new Date().toISOString(),
    }));
    if (!rows.length) {
      return {
        synced: 0,
        tableId: ledgerTableId,
        url: '',
        reason: '暂无热点可同步',
      };
    }
    const synced = await this.dataTable.landRows(user, {
      rows,
      tableId: ledgerTableId,
      fields: INSIGHT_PRESET_TABLES.hotspotLedger.columns.map((column) => ({
        name: column.name,
        key: column.fieldKey,
        type: column.fieldType,
      })),
      dedupBy: ['hotspot_name'],
    });
    const created = Number(synced.created ?? 0);
    const updatedCount = Number(synced.updated ?? 0);
    return {
      synced: created + updatedCount,
      tableId: ledgerTableId,
      url: `/data-table?table=${ledgerTableId}`,
      reason: '',
    };
  }

  // ---------- S4 聚类人工纠偏（忽略/恢复/合并/拆分）----------

  /**
   * 纠偏只动本模块聚合结果（hotspots/contents），绝不改「热点内容」原始采集行。
   * 纠偏过的热点写 reviewNote，重算时受保护不被删除重建。
   */
  async reviewHotspot(
    user: CurrentUser,
    id: number,
    body: Record<string, unknown>,
  ) {
    const hotspot = await this.prisma.insightHotspot.findFirst({
      where: { id, userId: user.userId },
    });
    if (!hotspot)
      throw new BusinessException(ErrorCode.NOT_FOUND, '热点不存在');
    const action = str(body.action).toLowerCase();

    if (action === 'ignore') {
      const updated = await this.prisma.insightHotspot.update({
        where: { id },
        data: { reviewNote: 'ignored' },
      });
      await this.identity.audit(
        user.userId,
        '智慧分析热点纠偏',
        `#${id} 标记非热点`,
      );
      return {
        ok: true,
        hotspotId: id,
        reviewNote: updated.reviewNote,
        contentCount: updated.contentCount,
      };
    }
    if (action === 'restore') {
      const updated = await this.prisma.insightHotspot.update({
        where: { id },
        data: { reviewNote: '' },
      });
      return {
        ok: true,
        hotspotId: id,
        reviewNote: '',
        contentCount: updated.contentCount,
      };
    }

    if (action === 'merge') {
      const targetId = num(body.targetId);
      if (targetId <= 0 || targetId === id) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请选择要并入的另一个热点',
        );
      }
      const target = await this.prisma.insightHotspot.findFirst({
        where: { id: targetId, userId: user.userId },
      });
      if (!target)
        throw new BusinessException(ErrorCode.NOT_FOUND, '目标热点不存在');
      await this.prisma.insightHotspotContent.updateMany({
        where: { hotspotId: id },
        data: { hotspotId: targetId },
      });
      await this.prisma.insightHotspot.delete({ where: { id } });
      const stats = await this.recomputeStats(user.userId, targetId);
      await this.identity.audit(
        user.userId,
        '智慧分析热点纠偏',
        `#${id} 并入 #${targetId}`,
      );
      return {
        ok: true,
        hotspotId: targetId,
        reviewNote: stats.reviewNote,
        contentCount: stats.contentCount,
      };
    }

    if (action === 'split') {
      const rowIds = Array.isArray(body.rowIds)
        ? body.rowIds.map((v) => num(v)).filter((v) => v > 0)
        : [];
      if (!rowIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请勾选要拆分为新热点的内容行',
        );
      }
      const newName = str(body.name) || `${hotspot.name}·拆分`;
      const fresh = await this.prisma.insightHotspot.create({
        data: {
          userId: user.userId,
          subscriptionId: hotspot.subscriptionId,
          subscriptionName: hotspot.subscriptionName,
          name: newName.slice(0, 200),
          platforms: strArray(hotspot.platforms),
          stage: 'emerging',
          hotScore: 0,
          growthRate: 0,
          contentCount: 0,
          sentiment: toJsonObject({}),
          keywords: toJsonObject([]),
          firstPlatform: hotspot.firstPlatform,
          reviewNote: '',
        },
      });
      await this.prisma.insightHotspotContent.updateMany({
        where: { hotspotId: id, rowId: { in: rowIds } },
        data: { hotspotId: fresh.id },
      });
      const moved = await this.recomputeStats(user.userId, fresh.id);
      const remain = await this.recomputeStats(user.userId, id);
      await this.identity.audit(
        user.userId,
        '智慧分析热点纠偏',
        `#${id} 拆分出 #${fresh.id}（${moved.contentCount} 条）`,
      );
      return {
        ok: true,
        hotspotId: fresh.id,
        reviewNote: remain.reviewNote,
        contentCount: moved.contentCount,
      };
    }

    throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的纠偏动作');
  }

  /** 依据聚类成员重算内容数与得分（按成员互动量，跨平台扩散取成员平台）。 */
  private async recomputeStats(userId: string, hotspotId: number) {
    const links = await this.prisma.insightHotspotContent.findMany({
      where: { hotspotId },
    });
    let interaction = 0;
    let contentCount = 0;
    const platforms = new Set<string>();
    for (const link of links) {
      const row = await this.prisma.dataTableRow.findUnique({
        where: { id: link.rowId },
      });
      if (!row) continue;
      contentCount += 1;
      const data = (row.data ?? {}) as Record<string, unknown>;
      interaction +=
        num(data.likes) +
        num(data.comments) +
        num(data.collects) +
        num(data.shares);
      const platform = str(data.platform);
      if (platform) platforms.add(platform);
    }
    const representativeRow = links.length
      ? await this.prisma.dataTableRow.findUnique({
          where: { id: links[0].rowId },
        })
      : null;
    const baseInteraction = interaction;
    const updated = await this.prisma.insightHotspot.update({
      where: { id: hotspotId },
      data: {
        contentCount,
        // 归一到与聚合一致的粗口径：单热点互动量映射到 0–100（相对自身规模）
        hotScore: Math.min(
          100,
          baseInteraction > 0 ? 50 + Math.log10(baseInteraction + 1) * 15 : 0,
        ),
        platforms: [...platforms],
        firstPlatform:
          str((representativeRow?.data as Record<string, unknown>)?.platform) ||
          '',
      },
      select: { reviewNote: true, contentCount: true },
    });
    void userId;
    return updated;
  }

  // ---------- S8 联动开关与打分配置 ----------

  async getSettings(user: CurrentUser) {
    const setting = await this.ensureSetting(user);
    return {
      linkageEnabled: setting.linkageEnabled === 1,
      contentTableId: setting.contentTableId,
      ledgerTableId: setting.ledgerTableId,
      reportWindowDays:
        num(
          (setting.scoreConfig && typeof setting.scoreConfig === 'object'
            ? (setting.scoreConfig as Record<string, unknown>).reportWindowDays
            : undefined) ?? undefined,
        ) || INSIGHT_SCORE_DEFAULTS.timeWindowDays,
      scoreConfig:
        setting.scoreConfig && typeof setting.scoreConfig === 'object'
          ? (setting.scoreConfig as Record<string, unknown>)
          : {},
    };
  }

  async saveSettings(user: CurrentUser, body: Record<string, unknown>) {
    const setting = await this.ensureSetting(user);
    const scoreConfig =
      setting.scoreConfig && typeof setting.scoreConfig === 'object'
        ? (setting.scoreConfig as Record<string, unknown>)
        : {};
    if (body.linkageEnabled !== undefined) {
      await this.prisma.insightSetting.update({
        where: { id: setting.id },
        data: { linkageEnabled: body.linkageEnabled === true ? 1 : 0 },
      });
    }
    if (body.reportWindowDays !== undefined) {
      scoreConfig.reportWindowDays = Math.max(
        1,
        Math.min(365, num(body.reportWindowDays)),
      );
    }
    if (body.scoreConfig && typeof body.scoreConfig === 'object') {
      scoreConfig.weights = {
        ...INSIGHT_SCORE_DEFAULTS.weights,
        ...(((body.scoreConfig as Record<string, unknown>).weights ??
          {}) as Record<string, number>),
      };
    }
    await this.prisma.insightSetting.update({
      where: { id: setting.id },
      data: { scoreConfig: toJsonObject(scoreConfig) },
    });
    await this.identity.audit(user.userId, '智慧分析设置保存', '联动/打分参数');
    return this.getSettings(user);
  }

  // ---------- 内部：形状与配置 ----------

  /** 调度用：有启用订阅的账号（去重）。 */
  async listActiveUserIds() {
    const grouped = await this.prisma.insightSubscription.groupBy({
      by: ['userId'],
      where: { status: 'ACTIVE' },
    });
    return grouped.map((row) => row.userId);
  }

  private scoreConfig(setting: { scoreConfig: Prisma.JsonValue }) {
    const stored =
      setting.scoreConfig && typeof setting.scoreConfig === 'object'
        ? (setting.scoreConfig as Record<string, unknown>)
        : {};
    return {
      weights: {
        ...INSIGHT_SCORE_DEFAULTS.weights,
        ...((stored.weights as Record<string, number>) ?? {}),
      },
      thresholds: {
        ...INSIGHT_SCORE_DEFAULTS.thresholds,
        ...((stored.thresholds as Record<string, number>) ?? {}),
      },
      timeWindowDays:
        num(stored.timeWindowDays) || INSIGHT_SCORE_DEFAULTS.timeWindowDays,
    };
  }

  private classifyStage(
    growth: number,
    basePct: number,
    score: number,
    config: ReturnType<InsightService['scoreConfig']>,
  ): string {
    const t = config.thresholds;
    if (growth <= t.decliningGrowthPct) return 'declining';
    if (growth > t.emergingGrowthPct && basePct < t.emergingBasePercentile) {
      return 'emerging';
    }
    if (score >= t.peakPercentile && Math.abs(growth) <= 10) return 'peak';
    if (growth >= t.risingGrowthMinPct && growth <= t.risingGrowthMaxPct) {
      return 'rising';
    }
    return growth > t.emergingGrowthPct ? 'emerging' : 'rising';
  }

  private shapeSubscription(
    row: {
      id: number;
      name: string;
      platforms: Prisma.JsonValue;
      keywords: Prisma.JsonValue;
      topics: Prisma.JsonValue;
      creators: Prisma.JsonValue;
      frequency: string;
      excludeWords: Prisma.JsonValue;
      minEngagement: number;
      alertGrowthPct: number;
      status: string;
      scheduleIds: Prisma.JsonValue;
      lastRunAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    contentCount: number,
  ) {
    return {
      id: row.id,
      name: row.name,
      platforms: strArray(row.platforms),
      keywords: strArray(row.keywords),
      topics: strArray(row.topics),
      creators: strArray(row.creators),
      frequency: row.frequency,
      excludeWords: strArray(row.excludeWords),
      minEngagement: row.minEngagement,
      alertGrowthPct: row.alertGrowthPct,
      status: row.status,
      scheduleIds: strArray(row.scheduleIds).map(Number).filter(Boolean),
      lastRunAt: isoOrEmpty(row.lastRunAt),
      contentCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private shapeHotspot(row: {
    id: number;
    name: string;
    subscriptionId: number;
    subscriptionName: string;
    platforms: Prisma.JsonValue;
    stage: string;
    hotScore: Prisma.Decimal;
    growthRate: Prisma.Decimal;
    contentCount: number;
    sentiment: Prisma.JsonValue;
    keywords: Prisma.JsonValue;
    firstPlatform: string;
    firstPublishAt: Date | null;
    windowStart: Date | null;
    windowEnd: Date | null;
    updatedAt: Date;
    reviewNote: string;
  }) {
    const sentiment: Record<string, number> = {};
    if (row.sentiment && typeof row.sentiment === 'object') {
      for (const [k, v] of Object.entries(row.sentiment as object)) {
        sentiment[k] = num(v);
      }
    }
    return {
      id: row.id,
      name: row.name,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      platforms: strArray(row.platforms),
      stage: row.stage,
      hotScore: Number(row.hotScore),
      growthRate: Number(row.growthRate),
      contentCount: row.contentCount,
      sentiment,
      keywords: strArray(row.keywords),
      firstPlatform: row.firstPlatform,
      firstPublishAt: isoOrEmpty(row.firstPublishAt),
      windowStart: isoOrEmpty(row.windowStart),
      windowEnd: isoOrEmpty(row.windowEnd),
      updatedAt: row.updatedAt.toISOString(),
      reviewNote: row.reviewNote,
    };
  }

  private shapeMetric(row: {
    metricKey: string;
    metricType: string;
    period: string;
    value: Prisma.Decimal;
    growthRate: Prisma.Decimal;
  }) {
    return {
      metricKey: row.metricKey,
      metricType: row.metricType,
      period: row.period,
      value: Number(row.value),
      growthRate: Number(row.growthRate),
    };
  }

  private shapeReport(row: {
    id: number;
    kind: string;
    status: string;
    assetId: string;
    content: string;
    error: string;
    window: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const window: Record<string, string> = {};
    if (
      row.window &&
      typeof row.window === 'object' &&
      !Array.isArray(row.window)
    ) {
      for (const [k, v] of Object.entries(row.window)) window[k] = str(v);
    }
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      assetId: row.assetId,
      content: row.content,
      error: row.error,
      window,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
