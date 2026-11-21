import { safeText } from '../common/safe-text';
import {
  KUAIDI_ADDRESS_TYPE_LABELS,
  KUAIDI_DEFAULT_TOGGLES,
  KUAIDI_ORDER_ACTION_LABELS,
  KUAIDI_ORDER_STATE_LABELS,
  KUAIDI_PAY_MODE_LABELS,
  KUAIDI_PAY_STATE_LABELS,
  KUAIDI_PRESET_COMPANIES,
  KUAIDI_SITE_STATUS_LABELS,
  KUAIDI_TOGGLE_KEYS,
  KUAIDI_TOGGLE_LABELS,
  type KuaidiContact,
  type KuaidiMeta,
  type KuaidiOverview,
  type KuaidiPublicSite,
  type KuaidiSite,
  type KuaidiSiteSaveBody,
  type KuaidiSiteStatus,
  type KuaidiToggles,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import {
  KUAIDI_CONTACT_BASE,
  KUAIDI_SCENE,
  amount,
  clip,
  intIn,
  iso,
  jsonInput,
  jsonList,
  kuaidiSiteCode,
  mergeJson,
  normalizeTheme,
  numberIn,
  siteStatus,
  toCents,
} from './kuaidi.shared';
import type { KuaidiPlatformService } from './kuaidi.platform.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';

/** service-desk 嵌入页路径：小程序 web-view 打开它，会话数据全留在 service_desk_* 里。 */
export const KUAIDI_DESK_EMBED_PATH = '/embed/service-desk';

type SiteRow = {
  id: number;
  ownerUserId: string;
  enterpriseId: number;
  siteCode: string;
  name: string;
  logo: string;
  slogan: string;
  themeColor: string;
  notice: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  lng: number;
  lat: number;
  businessHours: string;
  phone: string;
  pickupNote: string;
  payAccountId: number;
  serviceContact: unknown;
  deskSiteKey: string;
  toggles: unknown;
  insuranceEnabled: boolean;
  insuranceRate: unknown;
  insuranceMax: unknown;
  maxWeightKg: unknown;
  payMinutes: number;
  pickupSlots: unknown;
  protocolText: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type KuaidiSiteContext = {
  siteId: number;
  ownerUserId: string;
  siteCode: string;
  name: string;
  logo: string;
  slogan: string;
  themeColor: string;
  notice: string;
  addressLine: string;
  businessHours: string;
  phone: string;
  pickupNote: string;
  status: KuaidiSiteStatus;
  toggles: KuaidiToggles;
  serviceContact: KuaidiContact;
  deskSiteKey: string;
  deskEmbedUrl: string;
  apiBase: string;
  insuranceEnabled: boolean;
  insuranceRate: number;
  insuranceMax: number;
  maxWeightKg: number;
  payMinutes: number;
  pickupSlots: string[];
  protocolEnabled: boolean;
  protocolText: string;
};

const CONTACT_BASE: KuaidiContact = KUAIDI_CONTACT_BASE;

/**
 * 快递寄件站点（＝一个寄件点）与其元信息、概览。
 *
 * 2026-11-18 口径：一个账号一部小程序，站点只是寄件点（位置），数量不设上限；
 * 站点上下架与关闭全由店主自助，平台只保留板块开关与收款总闸门。
 *
 * 越权口径：一律按 `ownerUserId` 命中，查不到就是 NOT_FOUND，不暴露「别人的站点存在」；
 * `siteId` 永不信任请求体，都由这里反查后下发给下游服务。
 */
export class KuaidiSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: KuaidiPlatformService,
  ) {}

  async meta(_user: CurrentUser): Promise<KuaidiMeta> {
    void _user;
    const limits = await this.platform.limits();
    return {
      scene: KUAIDI_SCENE,
      siteStatusLabels: KUAIDI_SITE_STATUS_LABELS,
      orderStateLabels: KUAIDI_ORDER_STATE_LABELS,
      payStateLabels: KUAIDI_PAY_STATE_LABELS,
      payModeLabels: KUAIDI_PAY_MODE_LABELS,
      addressTypeLabels: KUAIDI_ADDRESS_TYPE_LABELS,
      actionLabels: KUAIDI_ORDER_ACTION_LABELS,
      toggleLabels: { ...KUAIDI_TOGGLE_LABELS },
      toggleKeys: [...KUAIDI_TOGGLE_KEYS],
      limits,
    };
  }

  async sites(user: CurrentUser): Promise<KuaidiSite[]> {
    const rows = await this.prisma.kuaidiSite.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ id: 'asc' }],
    });
    const payNames = await this.payAccountNames(user.userId);
    return Promise.all(
      rows.map((row) => this.toSiteRow(row as unknown as SiteRow, payNames)),
    );
  }

  /** 账号下收款账户 id → 名称；站点行只回名称，不回凭据。 */
  async payAccountNames(ownerUserId: string): Promise<Map<number, string>> {
    const rows = await this.prisma.kuaidiPayAccount.findMany({
      where: { ownerUserId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async toSiteRow(
    row: SiteRow,
    payNames?: Map<number, string>,
  ): Promise<KuaidiSite> {
    const names = payNames ?? (await this.payAccountNames(row.ownerUserId));
    const [companyTotal, orderTotal, customerTotal, siteUrl, deskSiteName] =
      await Promise.all([
        this.prisma.kuaidiCompany.count({ where: { siteId: row.id } }),
        this.prisma.kuaidiOrder.count({ where: { siteId: row.id } }),
        this.prisma.kuaidiCustomer.count({ where: { siteId: row.id } }),
        resolveSiteUrl(this.prisma),
        this.deskSiteName(row.deskSiteKey),
      ]);
    return {
      id: row.id,
      siteCode: row.siteCode,
      name: row.name,
      logo: row.logo,
      slogan: row.slogan,
      themeColor: row.themeColor,
      notice: row.notice,
      serviceContact: mergeJson<KuaidiContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
      province: clip(row.province, 40),
      city: clip(row.city, 40),
      district: clip(row.district, 40),
      addressLine: clip(row.addressLine, 200),
      lng: numberIn(row.lng, -180, 180, 0),
      lat: numberIn(row.lat, -90, 90, 0),
      businessHours: clip(row.businessHours, 80),
      phone: clip(row.phone, 32),
      pickupNote: clip(row.pickupNote, 300),
      payAccountId: intIn(row.payAccountId, 0, Number.MAX_SAFE_INTEGER, 0),
      payAccountName: names.get(row.payAccountId) ?? '',
      deskSiteKey: row.deskSiteKey,
      deskSiteName,
      toggles: mergeJson<KuaidiToggles>(row.toggles, KUAIDI_DEFAULT_TOGGLES),
      insuranceEnabled: row.insuranceEnabled !== false,
      insuranceRate: numberIn(row.insuranceRate, 0, 0.2, 0.005),
      insuranceMax: amount(row.insuranceMax),
      maxWeightKg: numberIn(row.maxWeightKg, 0.1, 1000, 100),
      payMinutes: intIn(row.payMinutes, 5, 1440, 30),
      pickupSlots: jsonList<string>(row.pickupSlots)
        .map((item) => clip(item, 40))
        .filter(Boolean)
        .slice(0, 20),
      protocolText: row.protocolText,
      status: siteStatus(row.status),
      siteUrl,
      companyTotal,
      orderTotal,
      customerTotal,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  /** 绑定的 AI 客服服务站名称：只认同账号下的站点，跨账号的 siteKey 一律当未绑定。 */
  async deskSiteName(siteKey: string): Promise<string> {
    const key = clip(siteKey, 64);
    if (!key) return '';
    const desk = await this.prisma.serviceDeskSite.findUnique({
      where: { siteKey: key },
      select: { name: true },
    });
    return desk ? clip(desk.name, 80) : '';
  }

  /** 归属校验 + 下游服务要用的站点上下文。 */
  async requireSite(user: CurrentUser, id: string | number) {
    const siteId = Number(id);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '站点 id 不合法');
    }
    const row = await this.prisma.kuaidiSite.findFirst({
      where: { id: siteId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '快递寄件站点不存在或不属于当前账号',
      );
    }
    return {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      siteCode: row.siteCode,
      name: row.name,
      themeColor: row.themeColor,
      scene: KUAIDI_SCENE,
      status: siteStatus(row.status),
      toggles: mergeJson<KuaidiToggles>(row.toggles, KUAIDI_DEFAULT_TOGGLES),
      deskSiteKey: row.deskSiteKey,
      serviceContact: mergeJson<KuaidiContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
      payMinutes: intIn(row.payMinutes, 5, 1440, 30),
      pickupSlots: jsonList<string>(row.pickupSlots)
        .map((item) => clip(item, 40))
        .filter(Boolean)
        .slice(0, 20),
    };
  }

  /** 公开通道用：按站点码反查，已关闭的站点不再对外。 */
  async byCode(code: string) {
    const normalized = clip(code, 16).toUpperCase();
    if (!normalized) return null;
    const row = await this.prisma.kuaidiSite.findUnique({
      where: { siteCode: normalized },
    });
    if (!row || row.status === 'CLOSED') return null;
    return row as unknown as SiteRow;
  }

  /**
   * 公开通道用：扫码只带 AppID 时定位站点。
   * 一个账号一部小程序，AppID 只指向账号；返回该账号第一个营业中的寄件点（老包兼容路径）。
   */
  async byAppId(appId: string) {
    const account = await this.appAccount(appId);
    if (!account) return null;
    const row = await this.prisma.kuaidiSite.findFirst({
      where: { ownerUserId: account.ownerUserId, status: 'ONLINE' },
      orderBy: [{ id: 'asc' }],
    });
    return row ? (row as unknown as SiteRow) : null;
  }

  /** AppID → 账号：底座 scene=EXPRESS / shopId=0 的行。 */
  async appAccount(appId: string) {
    const normalized = clip(appId, 64).trim();
    if (!normalized) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { scene: KUAIDI_SCENE, appId: normalized },
      select: { ownerUserId: true },
    });
    return app ? { ownerUserId: app.ownerUserId } : null;
  }

  /** C 端寄件点列表：同一账号下全部营业中的寄件点，只回展示字段。 */
  async publicSites(appId: string): Promise<KuaidiPublicSite[]> {
    const account = await this.appAccount(appId);
    if (!account) return [];
    // 启动闸门：工具未启动/停服期间，公开列表不下发该账号的寄件点（数据保留）
    if (!(await toolOpen('kuaidi', account.ownerUserId))) {
      return [];
    }
    const rows = await this.prisma.kuaidiSite.findMany({
      where: { ownerUserId: account.ownerUserId, status: 'ONLINE' },
      orderBy: [{ id: 'asc' }],
      select: {
        siteCode: true,
        name: true,
        province: true,
        city: true,
        district: true,
        addressLine: true,
        lng: true,
        lat: true,
        businessHours: true,
        phone: true,
      },
    });
    return rows.map((row) => ({
      siteCode: row.siteCode,
      name: row.name,
      province: clip(row.province, 40),
      city: clip(row.city, 40),
      district: clip(row.district, 40),
      addressLine: clip(row.addressLine, 200),
      lng: numberIn(row.lng, -180, 180, 0),
      lat: numberIn(row.lat, -90, 90, 0),
      businessHours: clip(row.businessHours, 80),
      phone: clip(row.phone, 32),
    }));
  }

  /** C 端上下文：只放可直接下发给匿名买家的展示字段，绝不放凭据与成本。 */
  async publicContext(row: SiteRow): Promise<KuaidiSiteContext> {
    const apiBase = (await resolveSiteUrl(this.prisma)).replace(/\/+$/, '');
    const deskSiteKey = clip(row.deskSiteKey, 64);
    const toggles = mergeJson<KuaidiToggles>(
      row.toggles,
      KUAIDI_DEFAULT_TOGGLES,
    );
    const protocolText = safeText(row.protocolText);
    return {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      siteCode: row.siteCode,
      name: row.name,
      logo: row.logo,
      slogan: row.slogan,
      themeColor: row.themeColor,
      notice: row.notice,
      addressLine: clip(row.addressLine, 200),
      businessHours: clip(row.businessHours, 80),
      phone: clip(row.phone, 32),
      pickupNote: clip(row.pickupNote, 300),
      status: siteStatus(row.status),
      toggles,
      serviceContact: mergeJson<KuaidiContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
      deskSiteKey,
      deskEmbedUrl: deskSiteKey
        ? `${apiBase}${KUAIDI_DESK_EMBED_PATH}?key=${encodeURIComponent(deskSiteKey)}`
        : '',
      apiBase,
      insuranceEnabled: row.insuranceEnabled !== false,
      insuranceRate: numberIn(row.insuranceRate, 0, 0.2, 0.005),
      insuranceMax: amount(row.insuranceMax),
      maxWeightKg: numberIn(row.maxWeightKg, 0.1, 1000, 100),
      payMinutes: intIn(row.payMinutes, 5, 1440, 30),
      pickupSlots: jsonList<string>(row.pickupSlots)
        .map((item) => clip(item, 40))
        .filter(Boolean)
        .slice(0, 20),
      // 开关开着但正文是空的，勾选就等于让买家同意一份看不见的协议——不算开启
      protocolEnabled:
        toggles.protocol !== false && Boolean(protocolText.trim()),
      protocolText: protocolText.slice(0, 200_000),
    };
  }

  /** 底座主体归属：一个账号一部小程序，凭据与出包台账固定 shopId=0。 */
  subject(row: { ownerUserId: string }) {
    return {
      ownerUserId: row.ownerUserId,
      scene: KUAIDI_SCENE,
      shopId: 0,
      shopName: '快递寄件',
    };
  }

  async createSite(
    user: CurrentUser,
    body: KuaidiSiteSaveBody,
  ): Promise<KuaidiSite> {
    await this.platform.requireEnabled();
    const code = await this.uniqueCode();
    const created = await this.prisma.kuaidiSite.create({
      data: {
        ownerUserId: user.userId,
        enterpriseId: 0,
        enterpriseUserId: '',
        siteCode: code,
        name: clip(body.name, 120),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 200),
        themeColor: normalizeTheme(body.themeColor),
        notice: clip(body.notice, 500),
        province: clip(body.province, 40),
        city: clip(body.city, 40),
        district: clip(body.district, 40),
        addressLine: clip(body.addressLine, 200),
        lng: numberIn(body.lng, -180, 180, 0),
        lat: numberIn(body.lat, -90, 90, 0),
        businessHours: clip(body.businessHours, 80),
        phone: clip(body.phone, 32),
        pickupNote: clip(body.pickupNote, 300),
        payAccountId: await this.resolvePayAccountId(user, body.payAccountId),
        serviceContact: jsonInput(mergeJson(body.serviceContact, CONTACT_BASE)),
        deskSiteKey: await this.resolveDeskKey(user, body.deskSiteKey),
        toggles: jsonInput(mergeJson(body.toggles, KUAIDI_DEFAULT_TOGGLES)),
        insuranceEnabled: body.insuranceEnabled !== false,
        insuranceRate: numberIn(body.insuranceRate, 0, 0.2, 0.005),
        insuranceMax: amount(body.insuranceMax),
        maxWeightKg: numberIn(body.maxWeightKg, 0.1, 1000, 100),
        payMinutes: intIn(body.payMinutes, 5, 1440, 30),
        pickupSlots: jsonInput(normalizeSlots(body.pickupSlots, [])),
        protocolText: safeText(body.protocolText).slice(0, 200_000),
        status: 'DRAFT',
      },
    });
    // 建站即铺一份常用快递报价，店主改价即可营业，不必从空表开始
    await this.prisma.kuaidiCompany.createMany({
      data: KUAIDI_PRESET_COMPANIES.map((item) => ({
        siteId: created.id,
        code: item.code,
        name: item.name,
        firstWeightKg: item.firstWeightKg,
        firstPrice: item.firstPrice,
        extraWeightKg: item.extraWeightKg,
        extraPrice: item.extraPrice,
        deliveryDays: item.deliveryDays,
        sort: item.sort,
      })),
    });
    return this.siteDetail(user, created.id);
  }

  async saveSite(
    user: CurrentUser,
    siteId: number,
    body: KuaidiSiteSaveBody,
  ): Promise<KuaidiSite> {
    const current = await this.requireSite(user, siteId);
    const nextDeskKey = await this.resolveDeskKey(user, body.deskSiteKey);
    await this.prisma.kuaidiSite.update({
      where: { id: current.siteId },
      data: {
        name: clip(body.name, 120),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 200),
        themeColor: normalizeTheme(body.themeColor),
        notice: clip(body.notice, 500),
        province: clip(body.province, 40),
        city: clip(body.city, 40),
        district: clip(body.district, 40),
        addressLine: clip(body.addressLine, 200),
        lng: numberIn(body.lng, -180, 180, 0),
        lat: numberIn(body.lat, -90, 90, 0),
        businessHours: clip(body.businessHours, 80),
        phone: clip(body.phone, 32),
        pickupNote: clip(body.pickupNote, 300),
        payAccountId: await this.resolvePayAccountId(user, body.payAccountId),
        serviceContact: jsonInput(mergeJson(body.serviceContact, CONTACT_BASE)),
        deskSiteKey: nextDeskKey,
        toggles: jsonInput(
          mergeJson(
            body.toggles,
            mergeJson(current.toggles, KUAIDI_DEFAULT_TOGGLES),
          ),
        ),
        insuranceEnabled: body.insuranceEnabled !== false,
        insuranceRate: numberIn(body.insuranceRate, 0, 0.2, 0.005),
        insuranceMax: amount(body.insuranceMax),
        maxWeightKg: numberIn(body.maxWeightKg, 0.1, 1000, 100),
        payMinutes: intIn(body.payMinutes, 5, 1440, 30),
        pickupSlots: jsonInput(
          normalizeSlots(body.pickupSlots, current.pickupSlots),
        ),
        protocolText: safeText(body.protocolText).slice(0, 200_000),
      },
    });
    return this.siteDetail(user, current.siteId);
  }

  /** 0 = 用账号默认账户；非 0 必须属于本人且启用。 */
  private async resolvePayAccountId(
    user: CurrentUser,
    value: unknown,
  ): Promise<number> {
    const id = intIn(value, 0, Number.MAX_SAFE_INTEGER, 0);
    if (!id) return 0;
    const account = await this.prisma.kuaidiPayAccount.findFirst({
      where: { id, ownerUserId: user.userId },
      select: { enabled: true },
    });
    if (!account) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '收款账户不存在或不属于当前账号，请先在「收款账户」里新增',
      );
    }
    if (!account.enabled) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该收款账户已停用，请先启用或换一个账户',
      );
    }
    return id;
  }

  private async resolveDeskKey(
    user: CurrentUser,
    siteKey: unknown,
  ): Promise<string> {
    const key = clip(safeText(siteKey).trim(), 64);
    if (!key) return '';
    const desk = await this.prisma.serviceDeskSite.findFirst({
      where: { siteKey: key, ownerUserId: String(user.userId) },
      select: { enabled: true },
    });
    if (!desk) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '在线客服服务站不存在或不属于当前账号，请到「AI 客服」里新建后选择它',
      );
    }
    if (!desk.enabled) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该 AI 客服服务站已停用，请先在「AI 客服」里启用后再绑定',
      );
    }
    return key;
  }

  async siteDetail(user: CurrentUser, siteId: number): Promise<KuaidiSite> {
    const row = await this.prisma.kuaidiSite.findFirst({
      where: { id: siteId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递寄件站点不存在');
    }
    return this.toSiteRow(row);
  }

  /** 店主自助上下架/关闭；平台不参与站点处置（只有板块开关与收款总闸门）。 */
  async setStatus(
    user: CurrentUser,
    siteId: number,
    status: string,
  ): Promise<KuaidiSite> {
    const current = await this.requireSite(user, siteId);
    const next = String(status);
    if (next !== 'DRAFT' && next !== 'ONLINE' && next !== 'CLOSED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点状态只能是未上线 / 营业中 / 已关闭',
      );
    }
    if (next === 'ONLINE') {
      const companyTotal = await this.prisma.kuaidiCompany.count({
        where: { siteId: current.siteId, enabled: true },
      });
      if (companyTotal === 0) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '还没有启用的快递公司报价，买家打开小程序无法下单；请先在「快递报价」启用至少一家',
        );
      }
      const configured = await this.miniApp.configured(
        this.subject({ ownerUserId: current.ownerUserId }),
      );
      if (!configured) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '还没填写微信小程序 AppID 与密钥，寄件点上线后小程序无法启动；请到「发布」页补齐',
        );
      }
    }
    await this.prisma.kuaidiSite.update({
      where: { id: current.siteId },
      data: { status: next },
    });
    return this.siteDetail(user, current.siteId);
  }

  /**
   * 删除站点：非空就硬拦。订单是取证，绝不能跟着站点一起静默消失，
   * 只有关站（CLOSED）这一条路给还有数据的站点。
   */
  async removeSite(user: CurrentUser, siteId: number) {
    const current = await this.requireSite(user, siteId);
    const [orderTotal, customerTotal] = await Promise.all([
      this.prisma.kuaidiOrder.count({ where: { siteId: current.siteId } }),
      this.prisma.kuaidiCustomer.count({ where: { siteId: current.siteId } }),
    ]);
    if (orderTotal + customerTotal > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `本寄件点已有 ${orderTotal} 笔订单、${customerTotal} 位顾客，不能直接删除；` +
          '请改用「关闭寄件点」保留数据（订单留痕，无法删除）',
      );
    }
    await this.prisma.kuaidiSite.delete({ where: { id: current.siteId } });
    return { ok: true, message: '寄件点已删除' };
  }

  /** 概览：店主进来先看「今天多少单、收了多少钱、多少待取件」。 */
  async overview(user: CurrentUser, siteId: number): Promise<KuaidiOverview> {
    const current = await this.requireSite(user, siteId);
    const site = await this.siteDetail(user, current.siteId);
    const dayStart = startOfDay(new Date());
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const [
      todayAgg,
      totalAgg,
      pendingPay,
      pendingPickup,
      inTransit,
      completed,
      totalOrders,
      companyTotal,
      customerTotal,
      weekPaid,
    ] = await Promise.all([
      this.prisma.kuaidiOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: {
          siteId: current.siteId,
          payState: 'PAID',
          paidAt: { gte: dayStart },
        },
      }),
      this.prisma.kuaidiOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { siteId: current.siteId, payState: 'PAID' },
      }),
      this.prisma.kuaidiOrder.count({
        where: { siteId: current.siteId, payState: 'PENDING' },
      }),
      this.prisma.kuaidiOrder.count({
        where: {
          siteId: current.siteId,
          status: 'PENDING_PICKUP',
          payState: 'PAID',
        },
      }),
      this.prisma.kuaidiOrder.count({
        where: { siteId: current.siteId, status: 'IN_TRANSIT' },
      }),
      this.prisma.kuaidiOrder.count({
        where: { siteId: current.siteId, status: 'COMPLETED' },
      }),
      this.prisma.kuaidiOrder.count({ where: { siteId: current.siteId } }),
      this.prisma.kuaidiCompany.count({ where: { siteId: current.siteId } }),
      this.prisma.kuaidiCustomer.count({ where: { siteId: current.siteId } }),
      this.prisma.kuaidiOrder.findMany({
        where: {
          siteId: current.siteId,
          payState: 'PAID',
          paidAt: { gte: weekStart },
        },
        select: { totalAmount: true, paidAt: true },
        take: 20_000,
      }),
    ]);
    const daily = new Map<string, { cents: number; orders: number }>();
    for (let index = 0; index < 7; index += 1) {
      daily.set(dayKey(new Date(dayStart.getTime() - index * 86_400_000)), {
        cents: 0,
        orders: 0,
      });
    }
    for (const row of weekPaid) {
      if (!row.paidAt) continue;
      const bucket = daily.get(dayKey(row.paidAt));
      if (!bucket) continue;
      bucket.cents += toCents(row.totalAmount);
      bucket.orders += 1;
    }
    return {
      site,
      todayOrders: todayAgg._count._all,
      todayRevenue: amount(todayAgg._sum.totalAmount),
      pendingPay,
      pendingPickup,
      inTransit,
      completed,
      totalOrders,
      totalRevenue: amount(totalAgg._sum.totalAmount),
      companyTotal,
      customerTotal,
      dailyTrend: [...daily.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, value]) => ({
          date,
          orders: value.orders,
          revenue: Math.round(value.cents) / 100,
        })),
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = kuaidiSiteCode();
      const taken = await this.prisma.kuaidiSite.findUnique({
        where: { siteCode: code },
      });
      if (!taken) return code;
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '站点标识生成失败，请重试（8 位随机码连续冲突，属于极小概率）',
    );
  }
}

/** 取件时段：去空、去重、限长；空数组回落上一个版本，避免一次保存把时段清空。 */
function normalizeSlots(value: unknown, fallback: string[]): string[] {
  const list = jsonList<string>(value)
    .map((item) => clip(item, 40).trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const item of list) {
    if (!out.includes(item)) out.push(item);
    if (out.length >= 20) break;
  }
  return out.length ? out : fallback;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayKey(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
