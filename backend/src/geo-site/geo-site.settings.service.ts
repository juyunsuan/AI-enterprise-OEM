import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  GEO_SITE_LIMITS,
  GEO_SITE_SCRIPT_PRESETS,
  GEO_SITE_SCRIPT_PRESET_HOSTS,
} from './geo-site.shared';

/**
 * GEO 独立站平台设置：存 system_settings 的单行 JSON（与站点域名、OSS 配置同一套底座），
 * 只有平台管理员能改；业务侧读取时统一过一遍归一化，脏值一律回落到安全默认。
 */
const SETTINGS_KEY = 'geo_site_settings';

export type GeoSiteSettings = {
  /** 是否允许用户绑定自有域名（关闭时只保留平台子域访问）。 */
  customDomainEnabled: boolean;
  /**
   * 域名访问总开关：关闭后 by-host 投递一律不认站（含平台子域与已生效自定义域名），
   * 全部回落到本站路径 `/geo-site/{标识}`。用于回源未就绪时先挡住错误域名。
   */
  hostAccessEnabled: boolean;
  /** 平台子域根域名覆盖：留空时取「站点域名」的主机名（去 www.）。 */
  rootDomainOverride: string;
  /** 自定义域名 CNAME 目标覆盖：留空时取「站点域名」的主机名。 */
  cnameTargetOverride: string;
  /** 绑域名前是否必须勾选备案/证书/内容责任承诺（与活码同口径）。 */
  needsIcpAck: boolean;
  maxSitesPerOwner: number;
  maxDomainsPerSite: number;
  /** 欠费后停服宽限小时数：期内只提醒不下线，过期才 SUSPENDED。 */
  graceHours: number;
  /** 关闭后欠费只记欠费不中断公开访问（用于灰度或重要活动期）。 */
  suspendOnArrears: boolean;
  /** 第三方脚本总开关：关闭后所有站点的自定义脚本一律不注入（保存也拒绝）。 */
  customScriptEnabled: boolean;
  /**
   * 脚本域名白名单：支持 `*.example.com` 后缀通配，空数组＝全禁。
   * 只放已知厂商 CDN，绝不允许 `*` 或整域通配，否则注入面等于向任意第三方开放。
   */
  scriptHostWhitelist: string[];
  /** 单页脚本条数上限：兜住首屏请求数，超出部分保存时直接拒回。 */
  maxScriptsPerPage: number;
};

export const GEO_SITE_SETTINGS_DEFAULTS: GeoSiteSettings = {
  customDomainEnabled: true,
  hostAccessEnabled: true,
  rootDomainOverride: '',
  cnameTargetOverride: '',
  needsIcpAck: true,
  maxSitesPerOwner: GEO_SITE_LIMITS.maxSitesDefault,
  maxDomainsPerSite: GEO_SITE_LIMITS.maxDomainsPerSiteDefault,
  graceHours: 72,
  suspendOnArrears: true,
  customScriptEnabled: true,
  scriptHostWhitelist: [...GEO_SITE_SCRIPT_PRESET_HOSTS],
  maxScriptsPerPage: GEO_SITE_LIMITS.maxScriptsPerPage,
};

/**
 * 白名单条目归一化：去协议、去路径、转小写、去重，非法项丢弃。
 * 明确拒绝裸通配（`*`、`*.com` 这类）与顶级域通配——一条写坏就等于全站 CSP 失效。
 */
function normalizeHostPatterns(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;\n]+/)
      : [];
  const out: string[] = [];
  for (const item of list) {
    const raw = String(item ?? '')
      .trim()
      .toLowerCase();
    if (!raw) continue;
    const host = raw
      .replace(/^https?:\/\//, '')
      .replace(/^\.+/, '')
      .replace(/\/.*$/, '')
      .replace(/\s.*$/, '');
    if (!host || host === '*') continue;
    const bare = host.replace(/^\*\./, '');
    // 至少两段且末段是字母后缀：拦掉 *.com、*.cn 这类一刀切通配
    const labels = bare.split('.');
    if (labels.length < 2 || !/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
      continue;
    }
    if (!/^[a-z0-9.*-]+$/.test(host)) continue;
    const entry = host.startsWith('*.') ? host : bare;
    if (out.includes(entry)) continue;
    out.push(entry);
    if (out.length >= 100) break;
  }
  return out;
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 主机名归一化：去协议/路径/端口、转小写；本地调试或非法值直接落空串（回落到自动推导）。
 * 只接受标准域名，不接受 IP 字面量——泛子域与证书都按域名签发。
 */
function hostOf(value: unknown): string {
  const raw = (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (!raw) return '';
  if (raw === 'localhost' || !raw.includes('.')) return '';
  if (!/^[a-z0-9.-]{4,253}$/.test(raw) || raw.includes('..')) return '';
  const labels = raw.split('.');
  if (labels.some((label) => !label || label.length > 63)) return '';
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return '';
  return raw;
}

function intOf(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

export class GeoSiteSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  private normalize(raw: unknown): GeoSiteSettings {
    const d = GEO_SITE_SETTINGS_DEFAULTS;
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<
      string,
      unknown
    >;
    return {
      customDomainEnabled: boolOf(
        input.customDomainEnabled,
        d.customDomainEnabled,
      ),
      hostAccessEnabled: boolOf(input.hostAccessEnabled, d.hostAccessEnabled),
      rootDomainOverride: hostOf(input.rootDomainOverride),
      cnameTargetOverride: hostOf(input.cnameTargetOverride),
      needsIcpAck: boolOf(input.needsIcpAck, d.needsIcpAck),
      maxSitesPerOwner: intOf(
        input.maxSitesPerOwner,
        d.maxSitesPerOwner,
        1,
        500,
      ),
      maxDomainsPerSite: intOf(
        input.maxDomainsPerSite,
        d.maxDomainsPerSite,
        1,
        20,
      ),
      graceHours: intOf(input.graceHours, d.graceHours, 0, 720),
      suspendOnArrears: boolOf(input.suspendOnArrears, d.suspendOnArrears),
      customScriptEnabled: boolOf(
        input.customScriptEnabled,
        d.customScriptEnabled,
      ),
      scriptHostWhitelist: normalizeHostPatterns(input.scriptHostWhitelist),
      maxScriptsPerPage: intOf(
        input.maxScriptsPerPage,
        d.maxScriptsPerPage,
        1,
        50,
      ),
    };
  }

  async view(): Promise<GeoSiteSettings> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    if (!row?.value) return { ...GEO_SITE_SETTINGS_DEFAULTS };
    try {
      return this.normalize(JSON.parse(row.value));
    } catch {
      return { ...GEO_SITE_SETTINGS_DEFAULTS };
    }
  }

  /** 管理后台读取：企业侧需要的字段走 GeoSite_meta，这里只服务管理端。 */
  async viewForAdmin(user: CurrentUser): Promise<GeoSiteSettings> {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '仅平台管理员可访问');
    }
    return this.view();
  }

  async save(
    user: CurrentUser,
    body: Record<string, unknown>,
  ): Promise<GeoSiteSettings> {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅平台管理员可配置独立站参数',
      );
    }
    const current = await this.view();
    const next = this.normalize({ ...current, ...body });
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
    });
    return next;
  }

  /**
   * 平台子域根域名：取「站点域名」配置的主机名（去掉 www. 前缀）。
   * 未配置时返回空串，调用方回落到本站路径访问，绝不硬编码任何域名。
   */
  async rootDomain(): Promise<string> {
    const config = await this.view();
    if (config.rootDomainOverride) return config.rootDomainOverride;
    const origin = await resolveSiteUrl(this.prisma);
    if (!origin) return '';
    try {
      const host = new URL(origin).hostname.toLowerCase();
      // 本地调试用 localhost 时没法签发子域证书，退回「不启用子域」形态
      if (!host.includes('.') || host === 'localhost') return '';
      return host.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * 平台预置的常用第三方脚本（统计/客服/广告）。
   * 这里只回答「哪些厂商的域名已经在默认白名单里」，脚本外链本身仍由站长自己粘贴并过白名单校验。
   */
  scriptPresets() {
    return GEO_SITE_SCRIPT_PRESETS.map((item) => ({
      ...item,
      hosts: [...item.hosts],
    }));
  }

  /** 禁止绑定的主机：平台自身域名与站点根域，防用他人/平台域名伪造站点。 */
  async blockedHosts(): Promise<string[]> {
    const hosts = [await this.rootDomain()];
    const origin = await resolveSiteUrl(this.prisma);
    if (origin) {
      try {
        hosts.push(new URL(origin).hostname.toLowerCase());
      } catch {
        // 配置异常时只拦根域，不影响主流程
      }
    }
    const envHost = String(process.env.SITE_DOMAIN || '')
      .trim()
      .toLowerCase();
    if (envHost) hosts.push(envHost);
    return hosts.filter(Boolean);
  }

  /** CNAME 目标：绑域名指引里展示的期望指向地址（平台站点 origin 的主机名）。 */
  async cnameTarget(): Promise<string> {
    const config = await this.view();
    if (config.cnameTargetOverride) return config.cnameTargetOverride;
    const origin = await resolveSiteUrl(this.prisma);
    if (!origin) return '';
    try {
      return new URL(origin).hostname;
    } catch {
      return '';
    }
  }

  /**
   * 管理端「域名接入」配置卡：把生效值一次算全，页面直接复制到 DNS/反代配置里。
   * 生效值优先取覆盖项，其次才从「站点域名」推导——两者都没有时页面会提示先配站点域名。
   */
  async accessGuide() {
    const config = await this.view();
    const [rootDomain, cnameTarget] = await Promise.all([
      this.rootDomain(),
      this.cnameTarget(),
    ]);
    return {
      hostAccessEnabled: config.hostAccessEnabled,
      customDomainEnabled: config.customDomainEnabled,
      needsIcpAck: config.needsIcpAck,
      maxDomainsPerSite: config.maxDomainsPerSite,
      rootDomain,
      cnameTarget,
      wildcardDomain: rootDomain ? `*.${rootDomain}` : '',
      probePath: '/_geo-site/probe',
      txtPrefix: '_geo-site-verify.',
    };
  }
}
