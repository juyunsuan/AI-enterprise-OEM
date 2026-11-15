import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Logger } from '../common/logger';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { httpRequest } from '../http/transport';
import {
  GEO_SITE_DOMAIN_STATUS_LABELS,
  newVerifyToken,
  normalizeSiteDomain,
} from './geo-site.shared';
import { GeoSiteSettingsService } from './geo-site.settings.service';

/**
 * 用户自助绑定域名：所有权校验 + 回源校验 + 定期复检 + 公开访问的域名反查。
 *
 * 校验分两步，缺一不可：
 * 1) TXT 所有权：在 `_geo-site-verify.<domain>` 放一条随机令牌，证明提交人确实控制该域名；
 * 2) 回源探针：`https://<domain>/_geo-site/probe?token=…` 必须回到本站并回显同一令牌，
 *    证明解析与回源都通了（否则发布后访客只会看到打不开的页面）。
 *
 * 两条查询都走 DoH（阿里 DNS 优先，Google 兜底），顺带拿到 A/AAAA 记录做私网地址拦截：
 * 绑到 127.0.0.1 / 10.x / 169.254.x 的域名会让后端自己去探内网，必须先拒掉再发探针请求。
 */

const TXT_PREFIX = '_geo-site-verify.';
/** DoH 解析器：境内先试阿里 DNS，失败再试 Google。 */
const DOH_ENDPOINTS = [
  'https://dns.alidns.com/resolve',
  'https://dns.google/resolve',
];
const PROBE_PATH = '/_geo-site/probe';

type DohAnswer = { name?: string; type?: number; data?: string };

export type GeoSiteDomainView = {
  id: number;
  siteId: number;
  domain: string;
  status: string;
  statusLabel: string;
  isPrimary: boolean;
  verifyToken: string;
  txtName: string;
  txtValue: string;
  cnameTarget: string;
  lastError: string;
  lastCheckAt: Date | null;
  createdAt: Date;
};

/** 平台侧域名台账行：带上站点与归属账号，出问题时能直接定位到人。 */
export type GeoSiteAdminDomainView = GeoSiteDomainView & {
  siteTitle: string;
  siteSlug: string;
  siteStatus: string;
  ownerUserId: string;
  ownerLabel: string;
};

export class GeoSiteDomainService {
  private readonly logger = new Logger(GeoSiteDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly settings: GeoSiteSettingsService,
  ) {}

  /* ------------------------------ 用户侧操作 ------------------------------ */

  async list(user: CurrentUser, siteId: number): Promise<GeoSiteDomainView[]> {
    await this.requireSite(user, Number(siteId));
    return this.views(siteId);
  }

  async bind(
    user: CurrentUser,
    body: { siteId: number; domain: string; icpAcknowledged?: boolean },
  ): Promise<GeoSiteDomainView> {
    const site = await this.requireSite(user, Number(body.siteId));
    const config = await this.settings.view();
    if (!config.customDomainEnabled) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前站点未开放自定义域名，可先用平台子域访问；如需开通请联系平台管理员在「平台管理后台 → 独立站设置」中启用',
      );
    }
    if (config.needsIcpAck && !body.icpAcknowledged) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先确认：该域名已由你方完成 ICP 备案（境内解析所需）、HTTPS 证书由平台签发、站点内容责任由你方承担',
      );
    }
    const blocked = await this.settings.blockedHosts();
    const domain = normalizeSiteDomain(body.domain, blocked);
    const exist = await this.prisma.geoSiteDomain.findUnique({
      where: { domain },
    });
    if (exist) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        exist.siteId === site.id
          ? '该域名已绑定到本站点，可在列表里重新校验'
          : '该域名已绑定到其他站点，请先在原站点解绑',
      );
    }
    const count = await this.prisma.geoSiteDomain.count({
      where: { siteId: site.id },
    });
    if (count >= config.maxDomainsPerSite) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单个站点最多绑定 ${config.maxDomainsPerSite} 个域名，请先解绑不再使用的域名`,
      );
    }
    const row = await this.prisma.geoSiteDomain.create({
      data: {
        siteId: site.id,
        ownerUserId: user.userId,
        domain,
        verifyToken: newVerifyToken(),
        status: 'PENDING',
        // 站点还没有主域名时，第一个绑定的域名直接当主域名
        isPrimary: count === 0 ? 1 : 0,
      },
    });
    return this.view(row.id);
  }

  async verify(
    user: CurrentUser,
    domainId: number,
  ): Promise<GeoSiteDomainView> {
    const row = await this.requireDomain(user, Number(domainId));
    await this.check(row);
    return this.view(row.id);
  }

  async remove(user: CurrentUser, domainId: number) {
    const row = await this.requireDomain(user, Number(domainId));
    await this.prisma.geoSiteDomain.delete({ where: { id: row.id } });
    // 删掉的是主域名时把下一个生效域名顶上来，避免站点没有对外的主地址
    if (row.isPrimary === 1) {
      const next = await this.prisma.geoSiteDomain.findFirst({
        where: { siteId: row.siteId, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
      });
      if (next) {
        await this.prisma.geoSiteDomain.update({
          where: { id: next.id },
          data: { isPrimary: 1 },
        });
      }
    }
    return { ok: true, message: '域名已解绑' };
  }

  async setPrimary(
    user: CurrentUser,
    domainId: number,
  ): Promise<GeoSiteDomainView[]> {
    const row = await this.requireDomain(user, Number(domainId));
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '域名尚未校验通过，不能设为主域名：请先按列表里的指引添加 TXT 与解析记录后点「校验」',
      );
    }
    await this.prisma.geoSiteDomain.updateMany({
      where: { siteId: row.siteId },
      data: { isPrimary: 0 },
    });
    await this.prisma.geoSiteDomain.update({
      where: { id: row.id },
      data: { isPrimary: 1 },
    });
    return this.views(row.siteId);
  }

  /* ------------------------------ 平台侧管理 ------------------------------ */

  /**
   * 全平台域名台账：域名、校验状态、最近失败原因、站点与归属账号。
   * 搜索同时命中域名与站点标题/标识，排障时常只记得其中一边。
   */
  async adminList(
    user: CurrentUser,
    query: { page?: number; pageSize?: number; q?: string; status?: string },
  ) {
    this.assertAdmin(user);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const where: Record<string, unknown> = {};
    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (['PENDING', 'VERIFYING', 'ACTIVE', 'ERROR'].includes(status)) {
      where.status = status;
    }
    const q = String(query.q || '').trim();
    if (q) {
      const sites = await this.prisma.geoSite.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { slug: { contains: q.toLowerCase() } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      where.OR = [
        { domain: { contains: q.toLowerCase() } },
        { siteId: { in: sites.map((item) => item.id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.geoSiteDomain.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastCheckAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.geoSiteDomain.count({ where }),
    ]);
    const siteIds = Array.from(new Set(rows.map((row) => row.siteId)));
    const sites = siteIds.length
      ? await this.prisma.geoSite.findMany({
          where: { id: { in: siteIds } },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        })
      : [];
    const siteById = new Map(sites.map((site) => [site.id, site]));
    const accountIds = Array.from(
      new Set(
        sites
          .map((site) => Number(site.ownerUserId))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, username: true },
        })
      : [];
    const nameByUser = new Map(
      accounts.map((item) => [String(item.id), item.username]),
    );
    const cname = await this.settings.cnameTarget();
    return {
      list: rows.map((row): GeoSiteAdminDomainView => {
        const site = siteById.get(row.siteId);
        const ownerUserId = site?.ownerUserId ?? '';
        return {
          ...toView(row, cname),
          siteTitle: site?.title ?? `站点 #${row.siteId}`,
          siteSlug: site?.slug ?? '',
          siteStatus: site?.status ?? '',
          ownerUserId,
          ownerLabel: nameByUser.get(ownerUserId) || ownerUserId,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /** 平台侧手动复检：与用户点「校验」同一条链路，结果写回同一行。 */
  async adminCheck(user: CurrentUser, domainId: number) {
    this.assertAdmin(user);
    const row = await this.prisma.geoSiteDomain.findUnique({
      where: { id: Number(domainId) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '域名不存在');
    await this.check(row);
    return this.view(row.id);
  }

  /** 平台侧解除绑定：用于确认恶意/错误绑定；主域名删除后自动顶下一个生效域名。 */
  async adminRemove(user: CurrentUser, domainId: number) {
    this.assertAdmin(user);
    const row = await this.prisma.geoSiteDomain.findUnique({
      where: { id: Number(domainId) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '域名不存在');
    await this.prisma.geoSiteDomain.delete({ where: { id: row.id } });
    if (row.isPrimary === 1) {
      const next = await this.prisma.geoSiteDomain.findFirst({
        where: { siteId: row.siteId, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
      });
      if (next) {
        await this.prisma.geoSiteDomain.update({
          where: { id: next.id },
          data: { isPrimary: 1 },
        });
      }
    }
    return { ok: true as const, message: `已解除绑定：${row.domain}` };
  }

  /**
   * 回源自检：输入一个 Host，逐层说明「为什么能/不能访问」。
   * 排障时最常错的三处（总开关、子域解析、域名未校验）分别给出明确原因。
   */
  async resolveHost(user: CurrentUser, rawHost: unknown) {
    this.assertAdmin(user);
    const host = (typeof rawHost === 'string' ? rawHost : '')
      .toLowerCase()
      .split(',')[0]
      .trim()
      .split(':')[0]
      .replace(/\.$/, '');
    const config = await this.settings.view();
    if (!config.hostAccessEnabled) {
      return {
        host,
        matched: false,
        reason: 'platform_disabled',
        message:
          '平台已关闭「域名访问」：by-host 投递不会认任何站点，请先在域名接入配置里打开',
        siteId: 0,
        siteTitle: '',
        siteSlug: '',
        siteStatus: '',
        via: '',
        rootDomain: await this.settings.rootDomain(),
      };
    }
    if (!host) {
      return {
        host,
        matched: false,
        reason: 'missing_host',
        message: '请输入要自检的域名，例如 shop.customer.com 或 demo.平台根域',
        siteId: 0,
        siteTitle: '',
        siteSlug: '',
        siteStatus: '',
        via: '',
        rootDomain: await this.settings.rootDomain(),
      };
    }
    const root = await this.settings.rootDomain();
    const resolved = await this.resolveSiteIdByHost(host);
    const site = resolved
      ? await this.prisma.geoSite.findUnique({
          where: { id: resolved.siteId },
          select: { id: true, title: true, slug: true, status: true },
        })
      : null;
    if (resolved && site) {
      return {
        host,
        matched: true,
        reason: 'ok',
        message:
          resolved.via === 'subdomain'
            ? `命中平台子域：站点「${site.title}」`
            : `命中自定义域名：站点「${site.title}」`,
        siteId: site.id,
        siteTitle: site.title,
        siteSlug: site.slug,
        siteStatus: site.status,
        via: resolved.via,
        rootDomain: root,
      };
    }
    // 未命中时给出具体是哪一步断了
    let reason = 'unbound';
    let message =
      '该域名没有绑定到任何站点：请让建站者在「国际独立站 → 域名」里绑定并完成校验';
    if (root && host.endsWith(`.${root}`)) {
      const slug = host.slice(0, -(root.length + 1));
      if (!slug || slug.includes('.')) {
        reason = 'subdomain_invalid';
        message = `平台子域只支持一级：应为 {站点标识}.${root}`;
      } else {
        reason = 'site_not_found';
        message = `子域标识「${slug}」没有对应站点：请检查站点访问标识是否改过`;
      }
    } else {
      const row = await this.prisma.geoSiteDomain.findUnique({
        where: { domain: host },
        select: { status: true, lastError: true },
      });
      if (row && row.status !== 'ACTIVE') {
        reason = 'not_verified';
        message = `域名已绑定但未生效（${GEO_SITE_DOMAIN_STATUS_LABELS[row.status] || row.status}）：${
          row.lastError || '请在域名台账点「复检」查看失败原因'
        }`;
      }
    }
    return {
      host,
      matched: false,
      reason,
      message,
      siteId: 0,
      siteTitle: '',
      siteSlug: '',
      siteStatus: '',
      via: '',
      rootDomain: root,
    };
  }

  private assertAdmin(user: CurrentUser) {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅平台管理员可管理独立站域名',
      );
    }
  }

  /* ------------------------------ 校验实现 ------------------------------ */

  /**
   * 单域名复检：DNS/探针任一不过即写回 ERROR 与原因。
   * 只有 ACTIVE 域名参与公开访问解析，复检失败即自然下线，不影响平台子域入口。
   */
  private async check(row: {
    id: number;
    domain: string;
    verifyToken: string;
    status: string;
  }) {
    const txtName = `${TXT_PREFIX}${row.domain}`;
    const txt = await this.lookup(txtName, 'TXT');
    if (!txt.ok) {
      return this.fail(row.id, `TXT 记录读取失败：${txt.error || '无响应'}`);
    }
    if (!txt.values.some((value) => value.includes(row.verifyToken))) {
      return this.fail(
        row.id,
        `未查到所有权 TXT 记录：请在 ${txtName} 添加内容 ${row.verifyToken}（生效后重试）`,
      );
    }
    const addresses = await this.resolveAddresses(row.domain);
    if (addresses.error) {
      return this.fail(row.id, `域名解析异常：${addresses.error}`);
    }
    if (!addresses.list.length) {
      return this.fail(
        row.id,
        '域名尚未解析：请添加 A 记录或 CNAME 指向平台站点地址后重试',
      );
    }
    if (addresses.privateHit) {
      // CNAME 到平台自己的地址是合法形态（内网部署时解析结果就是私网），
      // 裸 A 记录直指私网则一律拒绝——否则探针请求会变成后端自己打内网
      const platformHost = (await this.settings.cnameTarget()).toLowerCase();
      const chain = await this.lookup(row.domain, 'CNAME');
      const pointsAtPlatform =
        !!platformHost &&
        chain.values.some((value) => {
          const target = value.toLowerCase().replace(/\.$/, '');
          return target === platformHost || target.endsWith(`.${platformHost}`);
        });
      if (!pointsAtPlatform) {
        return this.fail(
          row.id,
          '域名解析到了内网地址（127.x / 10.x / 172.16-31.x / 192.168.x 等），请改为公网地址或 CNAME 指向平台站点地址',
        );
      }
    }
    const probe = await this.probe(row.domain, row.verifyToken);
    if (!probe.ok) {
      return this.fail(row.id, probe.error);
    }
    const updated = await this.prisma.geoSiteDomain.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        lastError: '',
        lastCheckAt: new Date(),
      },
    });
    this.logger.log(`独立站域名校验通过：${updated.domain}`);
    return { status: 'ACTIVE', error: '' };
  }

  private async fail(id: number, error: string) {
    await this.prisma.geoSiteDomain.update({
      where: { id },
      data: {
        status: 'ERROR',
        lastError: error.slice(0, 500),
        lastCheckAt: new Date(),
      },
    });
    return { status: 'ERROR', error };
  }

  /** 回源探针：命中本站公开路由并回显令牌才算通过。 */
  private async probe(domain: string, token: string) {
    try {
      const response = await httpRequest<string>(
        `https://${domain}${PROBE_PATH}?token=${encodeURIComponent(token)}&t=${Date.now()}`,
        {
          method: 'GET',
          readAs: 'text',
          timeoutMs: 8000,
          concurrency: 1,
          limiterKey: 'geo-site:probe',
          operation: 'geo-site:probe',
          redirect: 'follow',
          maxBytes: 64 * 1024,
        },
      );
      if (!response.ok) {
        return {
          ok: false,
          error: `访问 https://${domain} 返回 HTTP ${response.status}：请检查回源 Host 是否已改为该域名`,
        };
      }
      if (!String(response.data).includes(token)) {
        return {
          ok: false,
          error:
            '回源没有到达本站：该域名当前指向了别的服务，请把解析或回源改到平台站点地址',
        };
      }
      return { ok: true, error: '' };
    } catch (error) {
      return {
        ok: false,
        error: `无法通过 HTTPS 访问 ${domain}：${
          (error as Error)?.message || '网络异常'
        }（独立站必须支持 HTTPS）`,
      };
    }
  }

  private async lookup(
    name: string,
    type: 'TXT' | 'A' | 'AAAA' | 'CNAME',
  ): Promise<{ ok: boolean; values: string[]; error: string }> {
    for (const endpoint of DOH_ENDPOINTS) {
      try {
        const response = await httpRequest<string>(
          `${endpoint}?name=${encodeURIComponent(name)}&type=${type}`,
          {
            method: 'GET',
            readAs: 'text',
            timeoutMs: 6000,
            concurrency: 1,
            limiterKey: 'geo-site:doh',
            operation: 'geo-site:doh',
            maxBytes: 256 * 1024,
          },
        );
        if (!response.ok) continue;
        const payload = JSON.parse(String(response.data)) as {
          Status?: number;
          Answer?: DohAnswer[];
        };
        // Status 3 = NXDOMAIN：域名不存在，是明确答案而不是查询失败，不必再问下一个解析器
        if (payload.Status === 3) return { ok: true, values: [], error: '' };
        if (payload.Status !== 0) continue;
        const values = (payload.Answer || [])
          .filter((item) => typeof item.data === 'string')
          .map((item) =>
            String(item.data)
              .replace(/^"|"$/g, '')
              .replace(/\\(?!\\)/g, ''),
          );
        return { ok: true, values, error: '' };
      } catch {
        // 换一个解析器再试
      }
    }
    return { ok: false, values: [], error: 'DNS 查询服务不可用，请稍后重试' };
  }

  /** A/AAAA 记录 + 私网拦截结果。 */
  private async resolveAddresses(
    domain: string,
  ): Promise<{ list: string[]; privateHit: boolean; error: string }> {
    const [a, aaaa] = await Promise.all([
      this.lookup(domain, 'A'),
      this.lookup(domain, 'AAAA'),
    ]);
    if (!a.ok && !aaaa.ok) {
      return { list: [], privateHit: false, error: a.error || 'DNS 查询失败' };
    }
    const list = [...a.values, ...aaaa.values].filter(Boolean);
    return {
      list,
      privateHit: list.some((value) => isPrivateAddress(value)),
      error: '',
    };
  }

  /* ------------------------------ 复检与反查 ------------------------------ */

  /**
   * 定时复检：每次最多抽 5 个超过 24 小时未检测的域名，控制对外请求量。
   * 校验失败的域名只掉「自定义域名」这条入口，平台子域照常访问。
   */
  async recheckStale(now = new Date()) {
    const before = new Date(now.getTime() - 24 * 3600_000);
    const rows = await this.prisma.geoSiteDomain.findMany({
      where: {
        status: { in: ['ACTIVE', 'ERROR', 'VERIFYING'] },
        OR: [{ lastCheckAt: null }, { lastCheckAt: { lt: before } }],
      },
      take: 5,
      orderBy: [{ lastCheckAt: 'asc' }, { id: 'asc' }],
    });
    let checked = 0;
    for (const row of rows) {
      await this.check(row).catch(() => undefined);
      checked += 1;
    }
    return { checked };
  }

  /**
   * 按访问主机名反查站点：平台子域走 slug，其余只认校验通过的自定义域名。
   * 公开路由的入口判定，返回 null 表示这条主机名不属于任何独立站。
   */
  async resolveSiteIdByHost(
    host: string,
  ): Promise<{ siteId: number; via: 'subdomain' | 'domain' } | null> {
    const config = await this.settings.view();
    // 总开关关闭时 by-host 一律不认站：回源尚未就绪的平台先走本站路径，避免半通状态
    if (!config.hostAccessEnabled) return null;
    const normalized = host.toLowerCase().split(':')[0].replace(/\.$/, '');
    if (!normalized) return null;
    const root = await this.settings.rootDomain();
    if (root && normalized.endsWith(`.${root}`)) {
      const slug = normalized.slice(0, -(root.length + 1));
      if (!slug || slug.includes('.')) return null;
      const site = await this.prisma.geoSite.findUnique({
        where: { slug },
        select: { id: true },
      });
      return site ? { siteId: site.id, via: 'subdomain' } : null;
    }
    const domain = await this.prisma.geoSiteDomain.findUnique({
      where: { domain: normalized },
      select: { siteId: true, status: true },
    });
    if (!domain || domain.status !== 'ACTIVE') return null;
    return { siteId: domain.siteId, via: 'domain' };
  }

  /** 站点当前生效的主访问地址：优先生效的主域名，其次平台子域/本站路径。 */
  async canonicalOf(site: { id: number; slug: string }): Promise<string> {
    const primary = await this.prisma.geoSiteDomain.findFirst({
      where: { siteId: site.id, status: 'ACTIVE', isPrimary: 1 },
      select: { domain: true },
    });
    if (primary) return `https://${primary.domain}`;
    const root = await this.settings.rootDomain();
    if (root) return `https://${site.slug}.${root}`;
    return '';
  }

  /* ------------------------------ 内部工具 ------------------------------ */

  private async requireSite(user: CurrentUser, siteId: number) {
    const row = await this.prisma.geoSite.findUnique({ where: { id: siteId } });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    if (this.identity.isPlatformAdmin(user)) return row;
    if (
      row.ownerUserId === user.userId ||
      row.enterpriseUserId === user.userId
    ) {
      return row;
    }
    const enterprises = await this.identity.myEnterprises(user.userId);
    if (
      row.enterpriseId &&
      enterprises.some((item) => item.id === row.enterpriseId)
    ) {
      return row;
    }
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      '该站点不属于当前账号或其企业',
    );
  }

  private async requireDomain(user: CurrentUser, domainId: number) {
    const row = await this.prisma.geoSiteDomain.findUnique({
      where: { id: domainId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '域名不存在');
    await this.requireSite(user, row.siteId);
    return row;
  }

  private async views(siteId: number): Promise<GeoSiteDomainView[]> {
    const rows = await this.prisma.geoSiteDomain.findMany({
      where: { siteId },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    });
    const cname = await this.settings.cnameTarget();
    return rows.map((row) => toView(row, cname));
  }

  private async view(id: number): Promise<GeoSiteDomainView> {
    const row = await this.prisma.geoSiteDomain.findUnique({ where: { id } });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '域名不存在');
    const cname = await this.settings.cnameTarget();
    return toView(row, cname);
  }
}

function toView(
  row: {
    id: number;
    siteId: number;
    domain: string;
    status: string;
    verifyToken: string;
    isPrimary: number;
    lastError: string;
    lastCheckAt: Date | null;
    createdAt: Date;
  },
  cname: string,
): GeoSiteDomainView {
  return {
    id: row.id,
    siteId: row.siteId,
    domain: row.domain,
    status: row.status,
    statusLabel: GEO_SITE_DOMAIN_STATUS_LABELS[row.status] || row.status,
    isPrimary: row.isPrimary === 1,
    verifyToken: row.verifyToken,
    txtName: `${TXT_PREFIX}${row.domain}`,
    txtValue: row.verifyToken,
    cnameTarget: cname,
    lastError: row.lastError,
    lastCheckAt: row.lastCheckAt,
    createdAt: row.createdAt,
  };
}

const PRIVATE_V4_MAX = 255;

/** 私网/环回/链路本地判定：后端要主动访问用户给的域名，必须先挡掉内网地址。 */
export function isPrivateAddress(value: string): boolean {
  const ip = String(value || '')
    .trim()
    .toLowerCase();
  if (!ip) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  const candidate = mapped ? mapped[1] : ip;
  const parts = candidate.split('.');
  if (parts.length === 4 && parts.every((item) => /^\d{1,3}$/.test(item))) {
    const [a = 0, b = 0] = parts.map(Number);
    if (a > PRIVATE_V4_MAX || b > PRIVATE_V4_MAX) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && b >= 18 && b <= 19) return true;
    return false;
  }
  if (ip.includes(':')) {
    return (
      ip === '::' ||
      ip === '::1' ||
      ip.startsWith('fe80') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd')
    );
  }
  // 认不出的写法按不安全处理：这里宁可拒一个合法域名，也不能让后端去戳内网
  return true;
}
