import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';

/**
 * 启动策略：跨工具的三条平台级参数，存 system_settings 单行 JSON（与独立站设置同一底座）。
 * 单价与计费口径不在这里——那是每个工具各自的 `module_pricing` 行，价目页唯一真源。
 */
const SETTINGS_KEY = 'tool_launch_settings';

export type ToolLaunchSettings = {
  /** 欠费后停服宽限小时数：期内只提醒不停服（与独立站同口径）。 */
  graceHours: number;
  /** 存量已上线账号的免费过渡天数：到期后才开始首期出账。 */
  transitionDays: number;
  /** 关闭后欠费只记欠费、不停服（灰度期或大促期用）。 */
  suspendOnArrears: boolean;
  /** 过渡期锚点：本方案首次被读取时落定，之后改配置不会把已过期的过渡期重新点亮。 */
  legacyAnchor: string;
};

export const TOOL_LAUNCH_SETTINGS_DEFAULTS: ToolLaunchSettings = {
  graceHours: 72,
  transitionDays: 15,
  suspendOnArrears: true,
  legacyAnchor: '',
};

function intOf(value: unknown, fallback: number, min: number, max: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function boolOf(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalize(raw: unknown): ToolLaunchSettings {
  const d = TOOL_LAUNCH_SETTINGS_DEFAULTS;
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    graceHours: intOf(input.graceHours, d.graceHours, 0, 720),
    transitionDays: intOf(input.transitionDays, d.transitionDays, 0, 365),
    suspendOnArrears: boolOf(input.suspendOnArrears, d.suspendOnArrears),
    legacyAnchor:
      typeof input.legacyAnchor === 'string'
        ? input.legacyAnchor.slice(0, 40)
        : '',
  };
}

export class ToolLaunchSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  /**
   * 读取生效值；首次读取时把过渡期锚点落定。
   * 锚点只在缺行时写入，写失败不影响业务（回落默认过渡天数）。
   */
  async view(): Promise<ToolLaunchSettings> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    if (row?.value) {
      try {
        const parsed = normalize(JSON.parse(row.value));
        return parsed.legacyAnchor
          ? parsed
          : { ...parsed, legacyAnchor: new Date().toISOString() };
      } catch {
        return { ...TOOL_LAUNCH_SETTINGS_DEFAULTS };
      }
    }
    const anchor = new Date().toISOString();
    const seeded = { ...TOOL_LAUNCH_SETTINGS_DEFAULTS, legacyAnchor: anchor };
    await this.prisma.systemSetting
      .upsert({
        where: { key: SETTINGS_KEY },
        update: { value: JSON.stringify(seeded) },
        create: { key: SETTINGS_KEY, value: JSON.stringify(seeded) },
      })
      .catch(() => undefined);
    return seeded;
  }

  /** 过渡期截止：锚点 + 过渡天数；锚点缺失时按「现在 + 过渡天数」兜底。 */
  static trialEndsAt(settings: ToolLaunchSettings, now = new Date()): Date {
    const anchorRaw = settings.legacyAnchor
      ? Date.parse(settings.legacyAnchor)
      : Number.NaN;
    const anchor = Number.isFinite(anchorRaw) ? anchorRaw : now.getTime();
    return new Date(anchor + settings.transitionDays * 86400_000);
  }

  async save(
    user: CurrentUser,
    body: Record<string, unknown>,
  ): Promise<ToolLaunchSettings> {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅平台管理员可配置启动策略',
      );
    }
    const current = await this.view();
    const next = normalize({ ...current, ...body });
    const anchor = next.legacyAnchor || current.legacyAnchor;
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify({ ...next, legacyAnchor: anchor }) },
      create: {
        key: SETTINGS_KEY,
        value: JSON.stringify({
          ...next,
          legacyAnchor: new Date().toISOString(),
        }),
      },
    });
    // 锚点不随管理员改天数回拨：过渡期起点是本方案上线时刻，只能顺延、不能重算
    return { ...next, legacyAnchor: anchor };
  }
}
