import { Prisma } from '../../generated/prisma';
import { pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { botHostOnline, readBotFingerprintCaps } from '@enterprise/contracts';
import {
  computeNextOccurrence,
  readScheduleFields,
  scheduleConfigOf,
} from '../common/schedule';
import { CurrentUser } from '../auth/current-user';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonObject, toJsonArray } from '../shared/json-value';
import {
  RpaAccountService,
  accountIdList,
  type RpaAccountRow,
} from './rpa-account.service';
import { RpaScriptService, type RpaScriptRow } from './rpa-script.service';
import { RpaSettingService } from './rpa-setting.service';
import {
  RpaChromeDeviceService,
  normalizeChromeAction,
} from './chrome-device.service';
import {
  ENV_TYPE_LABELS,
  REPORT_STATUSES,
  SCRIPT_FILE_TYPE_LABELS,
  TASK_STATUSES,
  assertScriptRunnable,
  deviceLabel,
  isPhoneDevice,
  normalizeChoice,
  normalizeDeviceType,
  normalizePhoneFinishAction,
  parseIdList,
  parseWorkflowContent,
  resolveParams,
  scriptRunnableByDevice,
} from './rpa-shared';

/** 一次认领最多翻多少个待办任务去抢：抢不到就返回「暂无可执行任务」。 */
const CLAIM_SCAN_LIMIT = 20;
/** 超时判定单次要扫的执行记录上限。 */
const SWEEP_LIMIT = 50;

/**
 * 过滤错误信息里的敏感片段（key/token/secret/password/URL）+ 截断到 500 字。
 * 界面只展示分类文案，原文进日志；这里做最后一道防线，防止上游报文夹带凭据进库。
 */
function sanitizeErrorMessage(raw: string): string {
  const cleaned = raw
    .replace(
      /(?:key|token|secret|password|apikey|api_key)[=:]\s*[^\s,;"'<>]+/gi,
      '[$1]=***',
    )
    .replace(/https?:\/\/[^\s,;"'<>]+/g, '[url]')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[redacted]');
  return cleaned.trim().slice(0, 500);
}

type TaskRow = {
  id: number;
  createdBy: string;
  name: string;
  scriptId: number;
  deviceType: string;
  /** deviceType=chrome 时绑定的本地 Chrome 设备号；其他设备为空串 */
  chromeClientId: string;
  /** deviceType=botbuddy 时绑定的 BotBuddy 主机 ID；其他设备为 null */
  botHostId: number | null;
  /** deviceType=botbuddy 时指定的指纹窗口档案 ID；空串＝由主机自取默认窗口 */
  fpProfileId: string;
  accountIds: number[];
  params: Record<string, unknown>;
  status: string;
  scheduleType: string;
  scheduleConfig: Record<string, unknown>;
  phoneFinishAction: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastRunAt: Date | null;
  lastError: string;
  maxRetries: number;
  timeoutSeconds: number;
  createdAt: Date;
  updatedAt: Date;
};

/** 任务列表 / 详情里带出的脚本摘要：设备与流程 ID 决定执行端怎么跑。 */
type ScriptBrief = {
  id: number;
  name: string;
  deviceType: string;
  fileType: string;
  vendorFlowId?: string;
  status: string;
};

/** 任务绑定的账号摘要（界面只展示这些，环境标识按需带出）。 */
type AccountBrief = {
  id: number;
  platform: string;
  username: string;
  envType?: number;
};

/**
 * RPA 任务：云端创建时就绑定「脚本 + 账号 + 运行参数」，本地比特浏览器凭 API Key 认领执行。
 *
 * 认领用 `updateMany(status: pending → running)` 做原子抢单：count 不为 1 说明这个任务
 * 已被别的执行端抢走，直接换下一个，不会把同一个任务派给两台机器。
 * 回传结果时按「失败且还有重试次数」决定退回 pending 还是收口为 failed。
 */
export class RpaTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly scripts: RpaScriptService,
    private readonly accounts: RpaAccountService,
    private readonly settings: RpaSettingService,
    private readonly chromeDevices: RpaChromeDeviceService,
  ) {}

  // ---------- 界面侧 CRUD ----------

  async list(
    user: CurrentUser,
    query: {
      status?: string;
      deviceType?: string;
      keyword?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const status = query.status
      ? normalizeChoice(query.status, TASK_STATUSES, '任务状态', 'pending')
      : undefined;
    const deviceType = query.deviceType
      ? normalizeDeviceType(query.deviceType)
      : undefined;
    const keyword = text(query.keyword).trim();
    const where = {
      ...(this.identity.isPlatformAdmin(user)
        ? {}
        : { createdBy: user.userId }),
      ...(status ? { status } : {}),
      ...(deviceType ? { deviceType } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.rpaTask.count({ where }),
      this.prisma.rpaTask.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const scriptIds = [...new Set(rows.map((row) => row.scriptId))];
    const scripts = scriptIds.length
      ? await this.prisma.rpaScript.findMany({
          where: { id: { in: scriptIds } },
          select: {
            id: true,
            name: true,
            deviceType: true,
            fileType: true,
            status: true,
          },
        })
      : [];
    const scriptMap = new Map(scripts.map((item) => [item.id, item]));
    const accountIds = [
      ...new Set(rows.flatMap((row) => accountIdList(row.accountIds))),
    ];
    const accountRows = accountIds.length
      ? await this.prisma.rpaAccount.findMany({
          where: { id: { in: accountIds } },
          select: {
            id: true,
            platform: true,
            username: true,
          },
        })
      : [];
    const accountMap = new Map(accountRows.map((item) => [item.id, item]));
    return {
      total,
      page,
      pageSize,
      list: rows.map((row) =>
        decorateTask(plainTask(row), scriptMap.get(row.scriptId), accountMap),
      ),
    };
  }

  async get(user: CurrentUser, id: number) {
    const row = await this.loadVisible(user, id);
    const [script, accountRows] = await Promise.all([
      this.prisma.rpaScript.findUnique({
        where: { id: row.scriptId },
        select: {
          id: true,
          name: true,
          deviceType: true,
          fileType: true,
          vendorFlowId: true,
          status: true,
        },
      }),
      this.prisma.rpaAccount.findMany({
        where: { id: { in: accountIdList(row.accountIds) } },
        select: {
          id: true,
          platform: true,
          username: true,
          envType: true,
        },
      }),
    ]);
    return decorateTask(
      row,
      script,
      new Map(accountRows.map((item) => [item.id, item])),
    );
  }

  async create(user: CurrentUser, body: Record<string, unknown>) {
    const name = text(body.name).trim();
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写任务名称');
    }
    const scriptId = Number(text(body.scriptId) || 0);
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要执行的 RPA 脚本',
      );
    }
    const script = await this.scripts.loadOwned(user, scriptId);
    // 设备默认跟随脚本；PC 与 BotBuddy 浏览器是同一套 Automa 正文，可以互换，
    // 其余组合仍然按脚本判——执行端拿到对不上的正文只会跑出一个假成功。
    const deviceType =
      body.deviceType === undefined
        ? script.deviceType
        : assertScriptRunnable(script, body.deviceType);
    const isChrome = deviceType === 'chrome';
    const isBotBuddy = deviceType === 'botbuddy';
    const accountIds = parseIdList(body.accountIds, 'RPA 账号');
    // 本地 Chrome 与 BotBuddy 浏览器都跑在用户自己机器、用户本人登录态下，
    // 服务端不中转口令，所以不强制绑 RPA 账号。
    if (!isChrome && !isBotBuddy && !accountIds.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请至少绑定一个 RPA 账号（任务在本地要用它登录平台执行）',
      );
    }
    // 本地 Chrome 任务跑在用户自己的浏览器里，目标平台由用户本人登录，服务端不中转口令，
    // 所以只要求选定一台在线设备；账号可选，仅用于标识「这条任务面向哪个平台」。
    const chromeClientId = isChrome
      ? await this.requireChromeClient(user, body.chromeClientId)
      : '';
    const botBuddy = isBotBuddy
      ? await this.requireBotBuddyTarget(user, body.botHostId, body.fpProfileId)
      : { botHostId: null, fpProfileId: '' };
    await this.bindAccounts(user, deviceType, accountIds);
    const data = {
      createdBy: user.userId,
      name: name.slice(0, 200),
      scriptId,
      deviceType,
      chromeClientId,
      ...botBuddy,
      accountIds: toJsonArray(accountIds),
      params: toJsonObject(resolveParams(script.paramsSchema, body.params)),
      status: 'pending',
      ...readScheduleFields(body),
      phoneFinishAction: this.finishAction(body, deviceType, 'keep'),
      maxRetries: nonNegativeInt(body.maxRetries, 0, '重试次数'),
      timeoutSeconds: positiveInt(body.timeoutSeconds, 3600, '超时秒数'),
    };
    const row = await this.prisma.rpaTask.create({ data });
    await this.identity.audit(
      user.userId,
      'RPA创建任务',
      `#${row.id} ${row.name}`,
    );
    return this.get(user, row.id);
  }

  /**
   * 批量建任务：每个账号一个独立任务（与 create 的「多账号共用一个任务」互补）。
   * 脚本 / 参数 / 排期 / 超时等配置全部共用，只有账号拆开。
   * 任务名自动加后缀 `（账号名）` 区分，用户也可以给一个基础名。
   */
  async createBatch(user: CurrentUser, body: Record<string, unknown>) {
    const baseName = text(body.name).trim();
    const scriptId = Number(text(body.scriptId) || 0);
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要执行的 RPA 脚本',
      );
    }
    const script = await this.scripts.loadOwned(user, scriptId);
    const deviceType =
      body.deviceType === undefined
        ? script.deviceType
        : assertScriptRunnable(script, body.deviceType);
    const isChrome = deviceType === 'chrome';
    const isBotBuddy = deviceType === 'botbuddy';
    const accountIds = parseIdList(body.accountIds, 'RPA 账号');
    if (!isChrome && !isBotBuddy && !accountIds.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请至少绑定一个 RPA 账号',
      );
    }
    if (accountIds.length > 50) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '单次最多选 50 个账号批量建任务，请分批操作',
      );
    }
    if (accountIds.length <= 1) {
      // 无账号（本地 Chrome / BotBuddy 浏览器）或只选一个账号：不需要拆分，直接按单任务建
      return [await this.create(user, body)];
    }
    const chromeClientId = isChrome
      ? await this.requireChromeClient(user, body.chromeClientId)
      : '';
    const botBuddy = isBotBuddy
      ? await this.requireBotBuddyTarget(user, body.botHostId, body.fpProfileId)
      : { botHostId: null, fpProfileId: '' };
    await this.bindAccounts(user, deviceType, accountIds);
    const accounts = await this.prisma.rpaAccount.findMany({
      where: { id: { in: accountIds }, createdBy: user.userId },
      select: { id: true, platform: true, username: true },
    });
    const byId = new Map(accounts.map((item) => [item.id, item]));
    const resolvedParams = toJsonObject(
      resolveParams(script.paramsSchema, body.params),
    );
    const schedule = readScheduleFields(body);
    const phoneFinishAction = this.finishAction(body, deviceType, 'keep');
    const maxRetries = nonNegativeInt(body.maxRetries, 0, '重试次数');
    const timeoutSeconds = positiveInt(body.timeoutSeconds, 3600, '超时秒数');
    const created: Awaited<ReturnType<typeof this.get>>[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const accountId of accountIds) {
        const account = byId.get(accountId);
        const suffix = account
          ? `${account.platform}/${account.username}`
          : `#${accountId}`;
        const taskName = baseName
          ? `${baseName.slice(0, 160)}（${suffix}）`.slice(0, 200)
          : `${script.name} · ${suffix}`.slice(0, 200);
        const row = await tx.rpaTask.create({
          data: {
            createdBy: user.userId,
            name: taskName,
            scriptId,
            deviceType,
            chromeClientId,
            ...botBuddy,
            accountIds: toJsonArray([accountId]),
            params: resolvedParams,
            status: 'pending',
            ...schedule,
            phoneFinishAction,
            maxRetries,
            timeoutSeconds,
          },
        });
        await this.identity.audit(
          user.userId,
          'RPA批量建任务',
          `#${row.id} ${row.name}`,
        );
        created.push(await this.get(user, row.id));
      }
    });
    return created;
  }

  async update(user: CurrentUser, id: number, body: Record<string, unknown>) {
    const row = await this.loadOwned(user, id);
    const data: Prisma.RpaTaskUpdateInput = {};
    if (body.name !== undefined) {
      const name = text(body.name).trim();
      if (!name) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '任务名称不能为空');
      }
      data.name = name.slice(0, 200);
    }
    let scriptId = row.scriptId;
    let script: RpaScriptRow | null = null;
    if (body.scriptId !== undefined) {
      const next = Number(text(body.scriptId) || 0);
      if (!Number.isInteger(next) || next <= 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请选择要执行的 RPA 脚本',
        );
      }
      scriptId = next;
      script = await this.scripts.loadOwned(user, next);
      data.scriptId = next;
    }
    // 设备与脚本互相校验：换脚本要过一遍「这台设备跑不跑得动这份正文」，
    // 只换设备（PC ↔ BotBuddy 共用 Automa 脚本）也一样按当前脚本重判。
    let deviceType = row.deviceType;
    let boundScript = script;
    if (script || body.deviceType !== undefined) {
      boundScript = script || (await this.scripts.loadOwned(user, scriptId));
      deviceType = assertScriptRunnable(
        boundScript,
        body.deviceType ?? boundScript.deviceType,
      );
    }
    if (deviceType !== row.deviceType || script) {
      data.deviceType = deviceType;
    }
    const isChrome = deviceType === 'chrome';
    const isBotBuddy = deviceType === 'botbuddy';
    // 本地 Chrome 任务：设备必须重选一次（换脚本即换设备），换到别的设备类型则清空设备号
    if (isChrome) {
      const clientId =
        body.chromeClientId !== undefined
          ? await this.requireChromeClient(user, body.chromeClientId)
          : row.deviceType === 'chrome'
            ? row.chromeClientId
            : '';
      if (!clientId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '本地 Chrome 任务要选定一台在线的设备',
        );
      }
      if (clientId !== row.chromeClientId) data.chromeClientId = clientId;
    } else if (row.deviceType === 'chrome') {
      data.chromeClientId = '';
    }
    // BotBuddy 浏览器任务：换主机要重选，换到别的设备类型则清空主机与窗口
    if (isBotBuddy) {
      const binding = await this.requireBotBuddyTarget(
        user,
        body.botHostId ?? row.botHostId,
        body.fpProfileId ?? row.fpProfileId,
      );
      if (binding.botHostId !== row.botHostId)
        data.botHostId = binding.botHostId;
      if (binding.fpProfileId !== row.fpProfileId) {
        data.fpProfileId = binding.fpProfileId;
      }
    } else if (row.deviceType === 'botbuddy') {
      data.botHostId = null;
      data.fpProfileId = '';
    }
    let accountIds = row.accountIds;
    let accountsChanged = false;
    if (body.accountIds !== undefined) {
      const ids = parseIdList(body.accountIds, 'RPA 账号');
      if (!ids.length && !isChrome && !isBotBuddy) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '任务至少要绑定一个 RPA 账号',
        );
      }
      accountIds = ids;
      accountsChanged = true;
      data.accountIds = toJsonArray(ids);
    }
    // 换账号或换设备都要重过一遍绑定规则：设备一致、环境标识齐全、云手机计费模式统一
    if (accountsChanged || deviceType !== row.deviceType) {
      await this.bindAccounts(user, deviceType, accountIds);
    }
    if (body.params !== undefined || script) {
      const target = script || (await this.scripts.loadOwned(user, scriptId));
      data.params = toJsonObject(
        resolveParams(target.paramsSchema, body.params ?? row.params),
      );
    }
    const finishAction = this.finishAction(
      body,
      deviceType,
      row.phoneFinishAction,
    );
    if (finishAction !== row.phoneFinishAction) {
      data.phoneFinishAction = finishAction;
    }
    Object.assign(data, readScheduleFields(body, true));
    if (body.maxRetries !== undefined) {
      data.maxRetries = nonNegativeInt(
        body.maxRetries,
        row.maxRetries,
        '重试次数',
      );
    }
    if (body.timeoutSeconds !== undefined) {
      data.timeoutSeconds = positiveInt(
        body.timeoutSeconds,
        row.timeoutSeconds,
        '超时秒数',
      );
    }
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的修改');
    }
    const saved = await this.prisma.rpaTask.update({ where: { id }, data });
    await this.identity.audit(
      user.userId,
      'RPA修改任务',
      `#${id} ${saved.name}`,
    );
    return this.get(user, id);
  }

  /** 删除任务连同它的执行记录（执行记录只在本任务下有意义）。 */
  async remove(user: CurrentUser, id: number) {
    const row = await this.loadOwned(user, id);
    await this.prisma.$transaction([
      this.prisma.rpaTaskExecution.deleteMany({ where: { taskId: id } }),
      this.prisma.rpaTask.delete({ where: { id } }),
    ]);
    await this.identity.audit(user.userId, 'RPA删除任务', `#${id} ${row.name}`);
    return { id };
  }

  /** 取消：只把还没跑完的任务收口为 cancelled，执行记录不动。 */
  async cancel(user: CurrentUser, id: number) {
    const row = await this.loadOwned(user, id);
    if (!['pending', 'running'].includes(row.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务已是「${statusLabel(row.status)}」，无需取消`,
      );
    }
    const saved = await this.prisma.rpaTask.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    await this.identity.audit(
      user.userId,
      'RPA取消任务',
      `#${id} ${saved.name}`,
    );
    return this.get(user, id);
  }

  /**
   * 调度器调用：扫描所有到期的周期任务，计算下一次执行时刻并更新 scheduledAt。
   * 时区 Asia/Shanghai，错过周期不补跑（直接推到下一个未来时刻）。
   */
  async advanceRecurringTasks() {
    const now = new Date();
    const dueTasks = await this.prisma.rpaTask.findMany({
      where: {
        scheduleType: 'recurring',
        status: { not: 'cancelled' },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      select: {
        id: true,
        scheduleConfig: true,
        scheduledAt: true,
      },
    });
    for (const task of dueTasks) {
      const config = scheduleConfigOf(task.scheduleConfig);
      const nextAt = computeNextOccurrence(config, task.scheduledAt ?? now);
      if (nextAt) {
        await this.prisma.rpaTask.update({
          where: { id: task.id },
          data: { scheduledAt: nextAt },
        });
      }
    }
  }

  /** 重新排队：把终态任务退回 pending，等本地执行器再来认领。 */
  async requeue(user: CurrentUser, id: number) {
    const row = await this.loadOwned(user, id);
    if (row.status === 'running') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '任务正在执行中，请等执行端回传结果',
      );
    }
    const saved = await this.prisma.rpaTask.update({
      where: { id },
      data: {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        lastError: '',
      },
    });
    await this.identity.audit(
      user.userId,
      'RPA任务重新排队',
      `#${id} ${saved.name}`,
    );
    return this.get(user, id);
  }

  async listExecutions(user: CurrentUser, taskId?: number, limit = 50) {
    const rows = await this.prisma.rpaTaskExecution.findMany({
      where: {
        ...(this.identity.isPlatformAdmin(user)
          ? {}
          : { createdBy: user.userId }),
        ...(taskId ? { taskId } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(decorateExecution);
  }

  // ---------- 机器通道：本地比特浏览器执行端 ----------

  /**
   * 认领一个可执行任务。返回里带上脚本正文和绑定账号的明文口令：
   * 执行端要真的打开比特浏览器窗口 / 云手机环境登录平台，这是它唯一需要明文的时刻。
   *
   * `deviceType` 是执行端的自我声明（本机只装了比特浏览器 PC，或只开了安卓云手机）：
   * 声明了就只派同设备的任务，定向认领跨设备任务会被拒。
   */
  async claim(
    user: CurrentUser,
    body: { executor?: unknown; taskId?: unknown; deviceType?: unknown },
  ) {
    const deviceType =
      body.deviceType === undefined || text(body.deviceType).trim() === ''
        ? ''
        : normalizeDeviceType(body.deviceType);
    // 本地 Chrome 与 BotBuddy 浏览器都不走一次性认领：它们分别由插件心跳通道、
    // BotBuddy 主机令牌通道驱动，报文里不含口令，与比特浏览器执行端的语义不同，
    // 混在一起会让 PC 执行端抢到跑不了的任务。
    this.rejectChromeClaim(deviceType);
    await this.sweepTimeouts(user.userId);
    const now = new Date();
    const targetId =
      body.taskId === undefined ? 0 : Number(text(body.taskId) || 0);
    if (targetId) {
      const row = await this.loadOwned(user, targetId);
      this.rejectChromeClaim(row.deviceType);
      if (deviceType && row.deviceType !== deviceType) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `任务 #${targetId} 是${deviceLabel(row.deviceType)}任务，执行端声明的是${deviceLabel(deviceType)}`,
        );
      }
      if (row.status !== 'pending') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `任务 #${targetId} 当前是「${statusLabel(row.status)}」，不能认领`,
        );
      }
      if (!(await this.tryGrab(row.id))) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `任务 #${targetId} 刚被其他执行端认领`,
        );
      }
      return this.dispatch(
        user,
        await this.loadOwned(user, targetId),
        text(body.executor),
      );
    }
    const candidates = await this.prisma.rpaTask.findMany({
      where: {
        createdBy: user.userId,
        status: 'pending',
        // 不显式声明设备时，本地 Chrome 与 BotBuddy 浏览器任务都不进比特浏览器执行端的候选
        //（它们分别归插件心跳通道、BotBuddy 主机令牌通道）
        deviceType: deviceType || { notIn: ['chrome', 'botbuddy'] },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: CLAIM_SCAN_LIMIT,
    });
    if (!candidates.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        deviceType
          ? `暂无可执行的${deviceLabel(deviceType)} RPA 任务`
          : '暂无可执行的 RPA 任务',
      );
    }
    for (const candidate of candidates) {
      const grabbed = await this.tryGrab(candidate.id);
      if (!grabbed) continue;
      const row = await this.loadOwned(user, candidate.id);
      return this.dispatch(user, row, text(body.executor));
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '待办任务已被其他执行端认领，请稍后重试',
    );
  }

  /** 执行端回传结果：写终态 + 同步任务状态（失败且有重试次数则退回 pending）。 */
  async finish(
    user: CurrentUser,
    executionId: number,
    body: Record<string, unknown>,
  ) {
    return this.sealExecution(
      user.userId,
      executionId,
      body,
      '该执行记录属于其他账号的执行端',
    );
  }

  /**
   * 本地 Chrome 会话收尾：把会话结果回写成执行终态 + 同步任务状态。
   * 与比特浏览器回传共用同一套「失败且有重试次数则退回 pending」语义（B3 复用台账）；
   * 已收尾 / 不属于本人 / 记录不存在时静默跳过，避免会话收尾路径二次回写抛错。
   */
  async finishChromeExecution(
    userId: string,
    executionId: number,
    outcome: {
      status: string;
      output?: Record<string, unknown>;
      errorMessage?: string;
    },
  ) {
    if (executionId <= 0) return null;
    const run = await this.prisma.rpaTaskExecution.findUnique({
      where: { id: executionId },
      select: { finishedAt: true, createdBy: true },
    });
    if (!run || run.finishedAt || run.createdBy !== userId) return null;
    try {
      return await this.sealExecution(
        userId,
        executionId,
        {
          status: outcome.status,
          output: outcome.output ?? {},
          errorMessage: outcome.errorMessage ?? '',
        },
        '该执行记录不属于本次会话的发起人',
      );
    } catch {
      return null;
    }
  }

  /** 执行记录收口（claim 通道与本地 Chrome 通道共用）：终态落库 + 任务状态同步。 */
  private async sealExecution(
    userId: string,
    executionId: number,
    body: Record<string, unknown>,
    mismatchMessage: string,
  ) {
    const run = await this.prisma.rpaTaskExecution.findUnique({
      where: { id: executionId },
    });
    if (!run) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '执行记录不存在');
    }
    if (run.createdBy !== userId) {
      throw new BusinessException(ErrorCode.ROLE_MISMATCH, mismatchMessage);
    }
    if (run.finishedAt) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `执行 #${executionId} 已回传过结果（${statusLabel(run.status)}）`,
      );
    }
    const status = normalizeChoice(
      body.status,
      REPORT_STATUSES,
      '执行结果状态',
      '',
    );
    const now = new Date();
    const errorMessage = sanitizeErrorMessage(text(body.errorMessage));
    const saved = await this.prisma.$transaction(async (tx) => {
      // CAS：执行端重发同一份结果时，只有一次能把这条记录从「未结束」改成终态
      const sealed = await tx.rpaTaskExecution.updateMany({
        where: { id: executionId, finishedAt: null },
        data: {
          status,
          finishedAt: now,
          durationMs: Math.max(now.getTime() - run.startedAt.getTime(), 0),
          output:
            body.output && typeof body.output === 'object' ? body.output : {},
          errorMessage: status === 'success' ? '' : errorMessage,
          logText: text(body.logText).slice(0, 200_000),
        },
      });
      if (sealed.count !== 1) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `执行 #${executionId} 已回传过结果`,
        );
      }
      const execution = await tx.rpaTaskExecution.findUniqueOrThrow({
        where: { id: executionId },
      });
      const task = await tx.rpaTask.findUnique({ where: { id: run.taskId } });
      if (task && task.status !== 'cancelled') {
        const retryable =
          status === 'failed' && task.maxRetries >= execution.attempt;
        await tx.rpaTask.update({
          where: { id: task.id },
          data: {
            status:
              status === 'success'
                ? 'completed'
                : retryable
                  ? 'pending'
                  : status,
            lastRunAt: now,
            lastError: status === 'success' ? '' : errorMessage || '执行失败',
            // 只有「退回待执行重试」不写完成时间，其余收口（成功/失败/取消）都算结束
            ...(retryable ? {} : { completedAt: now }),
            ...(retryable ? { startedAt: null } : {}),
          },
        });
      }
      return execution;
    });
    await this.identity.audit(
      userId,
      'RPA回传执行结果',
      `执行#${executionId} 任务#${run.taskId} ${status}`,
    );
    return decorateExecution(saved);
  }

  /**
   * 本地 Chrome 会话认领任务：与 `claim` 同一套「原子抢单 + 落执行记录」语义，但有三点不同：
   *   1) 只认 chrome 设备任务，且 clientId 必须与任务绑定的设备一致；
   *   2) 设备必须在线（离线领不到任务）；
   *   3) 不回传任何目标平台口令（D3-A：口令永不经过服务端中转）。
   * 返回执行记录 ID 与确定性动作序列，供会话引擎回放、收尾时按 executionId 回写。
   */
  async claimChrome(userId: string, taskId: number, clientId: string) {
    const row = await this.loadOwnedById(userId, taskId);
    if (row.deviceType !== 'chrome') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `任务 #${taskId} 不是本地 Chrome 任务`,
      );
    }
    if (!row.chromeClientId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `任务 #${taskId} 没有绑定本地 Chrome 设备，请先在任务里补齐`,
      );
    }
    if (row.chromeClientId !== clientId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${taskId} 绑定的是设备「${row.chromeClientId}」，与当前设备「${clientId}」不一致`,
      );
    }
    if (row.status !== 'pending') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${taskId} 当前是「${statusLabel(row.status)}」，不能执行`,
      );
    }
    if (!(await this.chromeDevices.deviceOnline(userId, clientId))) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '设备当前离线（超过心跳阈值没有上报），无法执行任务',
      );
    }
    if (!(await this.tryGrab(row.id))) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${taskId} 刚被其他会话认领`,
      );
    }
    const [script, attempt] = await Promise.all([
      this.prisma.rpaScript.findUnique({ where: { id: row.scriptId } }),
      this.prisma.rpaTaskExecution
        .count({ where: { taskId: row.id } })
        .then((count) => count + 1),
    ]);
    const run = await this.prisma.rpaTaskExecution.create({
      data: {
        taskId: row.id,
        createdBy: userId,
        deviceType: 'chrome',
        status: 'running',
        attempt,
        executor: `chrome:${clientId}`.slice(0, 64),
      },
    });
    return {
      taskId: row.id,
      executionId: run.id,
      attempt,
      goal: row.name,
      startUrl: text(row.params?.startUrl).trim(),
      actions: chromeActionsOf(script?.content ?? ''),
      scriptName: script?.name || '',
    };
  }

  /** 会话没能起来时把已抢到的任务退回 pending，避免设备离线后任务永久卡在「执行中」。 */
  async releaseChrome(userId: string, taskId: number) {
    if (taskId <= 0) return;
    await this.prisma.rpaTask.updateMany({
      where: { id: taskId, createdBy: userId, status: 'running' },
      data: { status: 'pending', startedAt: null, lastError: '' },
    });
  }

  /**
   * BotBuddy 浏览器认领任务：与 `claimChrome` 同一套「原子抢单 + 落执行记录」语义，
   * 差别只在设备位是一台已配对的 BotBuddy 主机（客户端凭主机令牌来领）：
   *   1) 只认 botbuddy 设备任务，且任务绑了主机时必须与来领的主机一致；
   *   2) 没绑主机的任务由第一台来领的主机认领并回写绑定（之后不会漂到另一台机器）；
   *   3) 正文就是 Automa 工作流 JSON，主机令牌通道不回传任何目标平台口令（同 D3-A）。
   */
  async claimBotBuddy(userId: string, hostId: number, taskId?: number) {
    const candidates = taskId
      ? [await this.loadOwnedById(userId, taskId)]
      : await this.scanBotBuddy(userId, hostId);
    for (const row of candidates) {
      this.assertBotBuddyTarget(row, hostId);
      if (!(await this.tryGrab(row.id))) continue;
      try {
        return await this.dispatchBotBuddy(userId, hostId, row);
      } catch (error) {
        // 派发失败不留半成品执行记录：退回 pending，超时自愈才扫得到
        await this.prisma.rpaTask.updateMany({
          where: { id: row.id, status: 'running' },
          data: {
            status: 'pending',
            startedAt: null,
            lastError: (error instanceof Error
              ? error.message
              : '派发失败'
            ).slice(0, 500),
          },
        });
        throw error;
      }
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '待执行的 BotBuddy 任务刚被其他执行端认领，请稍后重试',
    );
  }

  /**
   * 这台主机当下可跑的待办（自动领取路径用）：先按「绑给本机或还没绑过」筛，
   * 再把脚本正文不兼容 Automa 的任务剔掉——一条坏脚本不该堵死整条队列。
   */
  private async scanBotBuddy(
    userId: string,
    hostId: number,
  ): Promise<TaskRow[]> {
    const rows = await this.prisma.rpaTask.findMany({
      where: {
        createdBy: userId,
        deviceType: 'botbuddy',
        status: 'pending',
        OR: [{ botHostId: hostId }, { botHostId: null }],
      },
      orderBy: { createdAt: 'asc' },
      take: CLAIM_SCAN_LIMIT,
    });
    if (!rows.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '这台 BotBuddy 主机当前没有待执行的任务：请到「RPA → RPA 任务」新建一条目标设备为 BotBuddy 浏览器的任务',
      );
    }
    const scripts = await this.prisma.rpaScript.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.scriptId))] } },
    });
    const byId = new Map(scripts.map((item) => [item.id, item]));
    return rows
      .filter((row) => {
        const script = byId.get(row.scriptId);
        return Boolean(script && scriptRunnableByDevice(script, 'botbuddy'));
      })
      .map((row) => plainTask(row));
  }

  /** 抢单前的闸：设备类型、主机归属、当前状态——显式指定任务时这些原因要原样回给用户。 */
  private assertBotBuddyTarget(row: TaskRow, hostId: number) {
    if (row.deviceType !== 'botbuddy') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `任务 #${row.id} 不是 BotBuddy 浏览器任务（当前是${deviceLabel(row.deviceType)}）`,
      );
    }
    if (row.botHostId && row.botHostId !== hostId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 绑定的是另一台 BotBuddy 主机（#${row.botHostId}），本机领不到`,
      );
    }
    if (row.status !== 'pending') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 当前是「${statusLabel(row.status)}」，不能执行`,
      );
    }
  }

  /** 抢单成功后的派发：正文校验、回写主机绑定、落执行记录。 */
  private async dispatchBotBuddy(userId: string, hostId: number, row: TaskRow) {
    const script = await this.prisma.rpaScript.findUnique({
      where: { id: row.scriptId },
    });
    if (!script) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 绑定的脚本已不存在，无法派发`,
      );
    }
    if (!scriptRunnableByDevice(script, 'botbuddy')) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 的脚本「${script.name}」是${SCRIPT_FILE_TYPE_LABELS[script.fileType] || script.fileType}，BotBuddy 浏览器跑不了，请改绑 JSON（Automa 脚本）`,
      );
    }
    const workflow = parseWorkflowContent(script);
    if (!row.botHostId) {
      // 没绑过主机的任务由第一台来领的主机定下来，之后不会漂到另一台机器上跑
      await this.prisma.rpaTask.update({
        where: { id: row.id },
        data: { botHostId: hostId },
      });
    }
    const attempt =
      (await this.prisma.rpaTaskExecution.count({
        where: { taskId: row.id },
      })) + 1;
    const run = await this.prisma.rpaTaskExecution.create({
      data: {
        taskId: row.id,
        createdBy: userId,
        deviceType: 'botbuddy',
        status: 'running',
        attempt,
        executor: `botbuddy:${hostId}`.slice(0, 64),
      },
    });
    return {
      taskId: row.id,
      executionId: run.id,
      attempt,
      taskName: row.name,
      scriptName: script.name,
      /** 指定的指纹窗口档案；空串＝客户端按自己的默认窗口 / 最近使用窗口跑。 */
      profileId: row.fpProfileId,
      startUrl: text(row.params?.startUrl).trim(),
      params: row.params,
      timeoutSeconds: row.timeoutSeconds,
      /** Automa 工作流正文（已校验是 JSON 对象），客户端原样交给插件执行。 */
      workflow,
    };
  }

  /**
   * 这台主机可跑的待办清单（客户端 RPA 页用）：只列 botbuddy 任务，
   * 且是「绑给本机」或「还没绑过主机」的那批——别的机器绑定的任务不显示，避免看着能点其实领不到。
   */
  async botBuddyTasks(userId: string, hostId: number) {
    const rows = await this.prisma.rpaTask.findMany({
      where: {
        createdBy: userId,
        deviceType: 'botbuddy',
        status: 'pending',
        OR: [{ botHostId: hostId }, { botHostId: null }],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (!rows.length) return { list: [] };
    const scriptIds = [...new Set(rows.map((row) => row.scriptId))];
    const scripts = await this.prisma.rpaScript.findMany({
      where: { id: { in: scriptIds } },
      select: { id: true, name: true, fileType: true, deviceType: true },
    });
    const byId = new Map(scripts.map((item) => [item.id, item]));
    return {
      list: rows.map((row) => {
        const script = byId.get(row.scriptId) || null;
        const params = isObject(row.params)
          ? (row.params as Record<string, unknown>)
          : {};
        return {
          taskId: row.id,
          name: row.name,
          scriptName: script?.name || '（脚本已删除）',
          runnable: script ? scriptRunnableByDevice(script, 'botbuddy') : false,
          profileId: row.fpProfileId,
          startUrl: text(params.startUrl).trim(),
          scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
        };
      }),
    };
  }

  /** 客户端起不来窗口 / 用户中断时退回 pending，避免任务永久卡在「执行中」。 */
  async releaseBotBuddy(userId: string, taskId: number) {
    if (taskId <= 0) return;
    await this.prisma.rpaTask.updateMany({
      where: { id: taskId, createdBy: userId, status: 'running' },
      data: { status: 'pending', startedAt: null, lastError: '' },
    });
  }

  /** 执行端一次取多条待办时用的清单（不含口令）。 */
  async openTasks(
    user: CurrentUser,
    query: { status?: string; deviceType?: string; limit?: string },
  ) {
    const status = query.status
      ? normalizeChoice(query.status, TASK_STATUSES, '任务状态', 'pending')
      : undefined;
    const deviceType = query.deviceType
      ? normalizeDeviceType(query.deviceType)
      : undefined;
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
    const rows = await this.prisma.rpaTask.findMany({
      where: {
        createdBy: user.userId,
        ...(status ? { status } : {}),
        // 机器通道的待办清单里不放插件设备与 BotBuddy 浏览器设备（各走自己的通道）
        deviceType: deviceType || { notIn: ['chrome', 'botbuddy'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const scriptIds = [...new Set(rows.map((row) => row.scriptId))];
    const scripts = scriptIds.length
      ? await this.prisma.rpaScript.findMany({
          where: { id: { in: scriptIds } },
          select: {
            id: true,
            name: true,
            deviceType: true,
            fileType: true,
            vendorFlowId: true,
            status: true,
          },
        })
      : [];
    const scriptMap = new Map(scripts.map((item) => [item.id, item]));
    return rows.map((row) =>
      decorateTask(plainTask(row), scriptMap.get(row.scriptId), new Map()),
    );
  }

  // ---------- 内部 ----------

  /**
   * 绑定校验：账号必须与任务同设备，且一批云手机的计费模式统一。
   * 「统一按时计费或套餐计费」是比特浏览器云手机 RPA 的硬要求，混用会让整批任务起不来。
   */
  private async bindAccounts(
    user: CurrentUser,
    deviceType: string,
    accountIds: number[],
  ) {
    const rows: RpaAccountRow[] = [];
    for (const accountId of accountIds) {
      rows.push(await this.accounts.loadOwned(user, accountId));
    }
    if (!isPhoneDevice(deviceType)) return;
    const billings = [...new Set(rows.map((row) => row.envType))];
    if (billings.length > 1) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `绑定的云手机计费模式不一致（${billings.map((item) => ENV_TYPE_LABELS[item] || '未填写').join(' / ')}），同一个任务的云手机要统一按时计费或套餐计费`,
      );
    }
  }

  /** 收尾动作只在云手机任务上有意义：PC 任务一律保持「keep」，界面上也不出这个控件。 */
  private finishAction(
    body: Record<string, unknown>,
    deviceType: string,
    fallback: string,
  ) {
    if (!isPhoneDevice(deviceType)) {
      if (
        body.phoneFinishAction !== undefined &&
        normalizePhoneFinishAction(body.phoneFinishAction) !== 'keep'
      ) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `${deviceLabel(deviceType)}任务没有云手机收尾动作`,
        );
      }
      return 'keep';
    }
    return normalizePhoneFinishAction(body.phoneFinishAction, fallback);
  }

  /** 原子抢单：只有把 pending 改成 running 的那一次返回 true。 */
  private async tryGrab(taskId: number) {
    const result = await this.prisma.rpaTask.updateMany({
      where: { id: taskId, status: 'pending' },
      data: { status: 'running', startedAt: new Date(), lastError: '' },
    });
    return result.count === 1;
  }

  /**
   * 派发给本地执行端。调用方已把任务原子抢成 running，所以这里任何一步失败都必须退回
   * pending：失败的派发不会留下执行记录，而超时自愈只扫执行记录，扫不到就永久卡住。
   */
  private async dispatch(user: CurrentUser, row: TaskRow, executor: string) {
    try {
      return await this.buildDispatch(user, row, executor);
    } catch (error) {
      await this.prisma.rpaTask.updateMany({
        where: { id: row.id, status: 'running' },
        data: {
          status: 'pending',
          startedAt: null,
          lastError: (error instanceof Error
            ? error.message
            : '派发失败'
          ).slice(0, 500),
        },
      });
      throw error;
    }
  }

  private async buildDispatch(
    user: CurrentUser,
    row: TaskRow,
    executor: string,
  ) {
    const [script, setting] = await Promise.all([
      this.prisma.rpaScript.findUnique({ where: { id: row.scriptId } }),
      this.settings.get(user),
    ]);
    if (!script) {
      await this.prisma.rpaTask.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          lastError: '绑定的脚本已不存在',
          completedAt: new Date(),
        },
      });
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 绑定的脚本已不存在，无法派发`,
      );
    }
    // 只取本人账号：accountIds 是任务创建时留存的快照，账号此后可能被删除或被别人重建，
    // 而这里是全系统唯一回传明文口令的地方，不能把不属于自己的凭据推给执行端。
    const boundIds = [...new Set(row.accountIds)];
    const accountRows = await this.prisma.rpaAccount.findMany({
      where: { id: { in: boundIds }, createdBy: user.userId },
    });
    if (accountRows.length !== boundIds.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `任务 #${row.id} 绑定的 RPA 账号已不存在或不归本人，无法派发`,
      );
    }
    // 只有这里回传明文口令：执行端要在比特浏览器窗口 / 云手机里登录目标平台
    const accounts = accountRows.map((account) => ({
      id: account.id,
      platform: account.platform,
      username: account.username,
      nickname: account.nickname,
      password: this.accounts.decryptPassword(account),
      loginUrl: account.loginUrl,
      envType: account.envType,
      // 代理配置：执行端按比特浏览器 /browser/add 的字段结构直接透传
      proxyMethod: account.proxyMethod,
      proxyType: account.proxyType,
      proxyHost: account.proxyHost,
      proxyPort: account.proxyPort,
      proxyUserName: account.proxyUserName,
      proxyPassword: account.proxyPasswordCipher
        ? this.accounts.decryptProxyPassword(account)
        : '',
    }));
    const attempt =
      (await this.prisma.rpaTaskExecution.count({
        where: { taskId: row.id },
      })) + 1;
    // 报文拼完（含口令解密）才落执行记录：拼装失败不该留下一条永远 running 的记录
    const run = await this.prisma.rpaTaskExecution.create({
      data: {
        taskId: row.id,
        createdBy: user.userId,
        deviceType: row.deviceType,
        status: 'running',
        attempt,
        executor: executor.slice(0, 64),
      },
    });
    const lastLoginAt = new Date();
    await this.prisma.rpaAccount.updateMany({
      where: { id: { in: accountRows.map((item) => item.id) } },
      data: { lastLoginAt },
    });
    return {
      executionId: run.id,
      attempt,
      claimedAt: run.startedAt,
      timeoutSeconds: row.timeoutSeconds,
      // 租户的比特浏览器实例配置：执行端按它调本地 API
      settings: {
        bitbrowserApiEndpoint: setting.bitbrowserApiEndpoint,
        bitbrowserGroupId: setting.bitbrowserGroupId,
        bitphoneRegionId: setting.bitphoneRegionId,
        bitphoneComputeType: setting.bitphoneComputeType,
      },
      device: {
        deviceType: row.deviceType,
        deviceLabel: deviceLabel(row.deviceType),
        // 手机任务跑完后执行端按它决定关不关机；pc 恒为 keep
        phoneFinishAction: row.phoneFinishAction,
        // 一批账号的计费模式在绑定校验时已收口成一种，执行端可直接据此开机 / 挂起
        envType: accountRows[0]?.envType ?? 1,
      },
      task: {
        id: row.id,
        name: row.name,
        params: row.params,
        scheduleType: row.scheduleType,
        accountIds: row.accountIds,
      },
      script: {
        id: script.id,
        name: script.name,
        deviceType: script.deviceType,
        fileType: script.fileType,
        // 比特浏览器 RPA 流程靠它调 POST /rpa/run（body.id 就是这个任务 ID）
        vendorFlowId: script.vendorFlowId,
        status: script.status,
        content: script.content,
        paramsSchema: script.paramsSchema,
      },
      accounts,
    };
  }

  /**
   * 超时自愈：认领前先把「跑着但早就超过 timeoutSeconds 还没回传」的执行判为 timeout，
   * 并把所属任务退回 pending，否则执行端中途掉线会把任务永久卡住。
   */
  private async sweepTimeouts(userId: string) {
    const running = await this.prisma.rpaTaskExecution.findMany({
      where: { createdBy: userId, status: 'running' },
      orderBy: { startedAt: 'asc' },
      take: SWEEP_LIMIT,
    });
    if (!running.length) return;
    const tasks = await this.prisma.rpaTask.findMany({
      where: { id: { in: [...new Set(running.map((run) => run.taskId))] } },
    });
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const now = Date.now();
    for (const run of running) {
      const task = taskMap.get(run.taskId);
      const limitMs = (task?.timeoutSeconds || 3600) * 1000;
      if (now - run.startedAt.getTime() < limitMs) continue;
      const message = `超过 ${task?.timeoutSeconds || 3600} 秒未回传结果`;
      await this.prisma.rpaTaskExecution.update({
        where: { id: run.id },
        data: {
          status: 'timeout',
          errorMessage: message,
          finishedAt: new Date(),
          durationMs: now - run.startedAt.getTime(),
        },
      });
      if (task && task.status === 'running') {
        await this.prisma.rpaTask.update({
          where: { id: task.id },
          data: { status: 'pending', startedAt: null, lastError: message },
        });
      }
    }
  }

  private async loadOwned(user: CurrentUser, id: number): Promise<TaskRow> {
    const row = await this.prisma.rpaTask.findUnique({ where: { id } });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'RPA 任务不存在');
    if (row.createdBy !== user.userId) {
      throw new BusinessException(
        ErrorCode.ROLE_MISMATCH,
        '该 RPA 任务归他人所有',
      );
    }
    return plainTask(row);
  }

  private async loadVisible(user: CurrentUser, id: number): Promise<TaskRow> {
    const row = await this.prisma.rpaTask.findUnique({ where: { id } });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'RPA 任务不存在');
    if (row.createdBy !== user.userId && !this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(
        ErrorCode.ROLE_MISMATCH,
        '该 RPA 任务归他人所有',
      );
    }
    return plainTask(row);
  }

  private async loadOwnedById(userId: string, id: number): Promise<TaskRow> {
    const row = await this.prisma.rpaTask.findUnique({ where: { id } });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'RPA 任务不存在');
    if (row.createdBy !== userId) {
      throw new BusinessException(
        ErrorCode.ROLE_MISMATCH,
        '该 RPA 任务归他人所有',
      );
    }
    return plainTask(row);
  }

  /** 本地 Chrome 任务必须选一台在线设备：离线设备领不到任务，也不在候选清单里。 */
  private async requireChromeClient(
    user: CurrentUser,
    raw: unknown,
  ): Promise<string> {
    const clientId = text(raw).trim();
    if (!clientId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本地 Chrome 任务要选定一台在线的设备（在「本地 Chrome」页签里可见）',
      );
    }
    await this.chromeDevices.requireOnlineDevice(user, clientId);
    return clientId;
  }

  /**
   * BotBuddy 浏览器任务的设备位：一台已配对且在线的主机 +（可选）该主机上报的指纹窗口。
   * 与本地 Chrome 同一口径——离线主机领不到任务，也就不能把任务存成指向它；
   * 窗口只认客户端心跳上报的候选表，平台不替用户建窗口（与工作区白名单同一先例）。
   */
  private async requireBotBuddyTarget(
    user: CurrentUser,
    rawHostId: unknown,
    rawProfileId: unknown,
  ): Promise<{ botHostId: number; fpProfileId: string }> {
    const hostId = Number(text(rawHostId).trim() || 0);
    if (!Number.isInteger(hostId) || hostId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'BotBuddy 浏览器任务要选定一台 BotBuddy 主机：请先在客户端「绑定」页填本站地址并配对（主机清单在「Agent-Bot → Bot 主机」页可见）',
      );
    }
    const host = await this.prisma.workbuddyHost.findFirst({
      where: { id: hostId, userId: user.userId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        caps: true,
        clientKind: true,
      },
    });
    if (!host) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `BotBuddy 主机 #${hostId} 不存在或不属于当前账号：请在客户端里重新配对本站`,
      );
    }
    if (host.clientKind !== 'DESKTOP') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${host.name}」是 Mobot 手机，不是 BotBuddy 浏览器：手机任务请选「安卓云手机 / iPhone 云手机」`,
      );
    }
    if (!botHostOnline({ status: host.status, lastSeenAt: host.lastSeenAt })) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `主机「${host.name}」当前离线：请打开 BotBuddy 客户端并保持运行，等它变「在线」后再保存任务`,
      );
    }
    const fpProfileId = text(rawProfileId).trim().slice(0, 64);
    if (fpProfileId) {
      const windows = readBotFingerprintCaps(
        toJsonObject(toJsonObject(host.caps).agent),
      ).list;
      if (!windows.some((item) => item.id === fpProfileId)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `指纹窗口「${fpProfileId}」不在主机「${host.name}」上报的候选里${windows.length ? `（当前候选：${windows.map((item) => item.name).join(' / ')}）` : '（这台客户端还没上报任何窗口，请升级到带指纹浏览器的版本并在「浏览器」页建一个）'}，请重新选择`,
        );
      }
    }
    return { botHostId: host.id, fpProfileId };
  }

  private rejectChromeClaim(deviceType: string) {
    if (deviceType === 'chrome') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '本地 Chrome 任务不通过接口认领：请在「本地 Chrome」页签发起，由插件心跳通道执行',
      );
    }
    if (deviceType === 'botbuddy') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        'BotBuddy 浏览器任务不通过 API Key 通道认领：请在 BotBuddy 客户端的「RPA」页签执行（主机令牌通道）',
      );
    }
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  timeout: '超时',
  success: '成功',
};

export function statusLabel(status: string) {
  return STATUS_LABEL[status] || status;
}

function plainTask(row: {
  id: number;
  createdBy: string;
  name: string;
  scriptId: number;
  deviceType: string;
  chromeClientId: string;
  botHostId: number | null;
  fpProfileId: string;
  accountIds: Prisma.JsonValue;
  params: Prisma.JsonValue;
  status: string;
  scheduleType: string;
  scheduleConfig: Prisma.JsonValue;
  phoneFinishAction: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastRunAt: Date | null;
  lastError: string;
  maxRetries: number;
  timeoutSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}): TaskRow {
  return {
    ...row,
    accountIds: accountIdList(row.accountIds),
    params: isObject(row.params) ? (row.params as Record<string, unknown>) : {},
    scheduleConfig: scheduleConfigOf(row.scheduleConfig),
  };
}

function decorateTask(
  row: TaskRow,
  script: ScriptBrief | null | undefined,
  accountMap: Map<number, AccountBrief>,
) {
  return {
    ...row,
    script: script || null,
    deviceLabel: deviceLabel(row.deviceType),
    accounts: row.accountIds
      .map((id) => accountMap.get(id))
      .filter((item): item is AccountBrief => Boolean(item)),
  };
}

function decorateExecution(row: {
  id: number;
  taskId: number;
  createdBy: string;
  deviceType: string;
  status: string;
  attempt: number;
  executor: string;
  output: Prisma.JsonValue;
  errorMessage: string;
  logText: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}) {
  return {
    ...row,
    output: isObject(row.output) ? (row.output as Record<string, unknown>) : {},
    deviceLabel: deviceLabel(row.deviceType),
    statusLabel: statusLabel(row.status),
  };
}

function isObject(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 从 chrome_actions 脚本正文里取出确定性动作序列（供会话引擎无 LLM 顺序回放）。 */
function chromeActionsOf(content: string): Record<string, unknown>[] {
  const raw = text(content).trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) &&
        Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : [];
  return list
    .map((item) => normalizeChromeAction(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function nonNegativeInt(raw: unknown, fallback: number, label: string): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(text(raw).trim());
  if (!Number.isInteger(value) || value < 0 || value > 20) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `${label}只能是 0-20 的整数`,
    );
  }
  return value;
}

function positiveInt(raw: unknown, fallback: number, label: string): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(text(raw).trim());
  if (!Number.isInteger(value) || value < 60 || value > 86400) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `${label}只能是 60-86400 的整数（秒）`,
    );
  }
  return value;
}
