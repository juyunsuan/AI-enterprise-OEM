import {
  ERRAND_DEFAULT_TOGGLES,
  ERRAND_CITY_STATUS_LABELS,
  ERRAND_ORDER_ACTION_LABELS,
  ERRAND_ORDER_STATE_LABELS,
  ERRAND_PAY_MODE_LABELS,
  ERRAND_PAY_STATE_LABELS,
  ERRAND_RIDER_STATUS_LABELS,
  ERRAND_SERVICE_TYPE_LABELS,
  ERRAND_SITE_STATUS_LABELS,
  ERRAND_TOGGLE_KEYS,
  ERRAND_TOGGLE_LABELS,
  ERRAND_VEHICLE_TYPE_LABELS,
  type ErrandContact,
  type ErrandMeta,
  type ErrandOverview,
  type ErrandPublicSite,
  type ErrandPublicSiteListItem,
  type ErrandRule,
  type ErrandRuleSaveBody,
  type ErrandSite,
  type ErrandSiteSaveBody,
  type ErrandSiteStatus,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniAppSubject } from '../private-mini/mini-app.service';
import {
  ERRAND_CONTACT_BASE as CONTACT_BASE,
  ERRAND_SCENE,
  amount,
  clip,
  contactOf,
  errandSiteCode,
  fromCents,
  iso,
  jsonInput,
  jsonList,
  mergeJson,
  normalizeTheme,
  numberIn,
  intIn,
  toText,
  siteStatus,
  toCents,
} from './errand.shared';
import type { ErrandPlatformService } from './errand.platform.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';

/** service-desk 嵌入页路径：小程序 web-view 打开它，会话数据全留在 service_desk_* 里。 */
export const ERRAND_DESK_EMBED_PATH = '/embed/service-desk';

type SiteRow = {
  id: number;
  ownerUserId: string;
  siteCode: string;
  name: string;
  logo: string;
  banner: string;
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
  contact: unknown;
  deskSiteKey: string;
  toggles: unknown;
  protocolText: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RuleRow = {
  id: number;
  siteId: number;
  baseFee: unknown;
  baseDistanceKm: unknown;
  perKmFee: unknown;
  baseWeightKg: unknown;
  perKgFee: unknown;
  nightStart: string;
  nightEnd: string;
  nightFee: unknown;
  buyServiceRate: unknown;
  minOrderAmount: unknown;
  maxDistanceKm: unknown;
  maxWeightKg: unknown;
  tipPresets: unknown;
  couponEnabled: boolean;
  acceptRadiusKm: unknown;
  autoDispatch: boolean;
  riderShareRate: unknown;
  maxActiveOrders: number;
  pointsEarnRate: unknown;
  pointsDeductRate: unknown;
  maxPointsDiscountRate: unknown;
  updatedAt: Date;
};

export type ErrandSiteContext = {
  site: ErrandSite;
  row: SiteRow;
  rule: ErrandRule;
  ruleRow: RuleRow;
  subject: MiniAppSubject;
};

const RULE_DEFAULT: ErrandRule = {
  baseFee: 5,
  baseDistanceKm: 3,
  perKmFee: 2,
  baseWeightKg: 5,
  perKgFee: 1,
  nightStart: '22:00',
  nightEnd: '06:00',
  nightFee: 3,
  buyServiceRate: 0.1,
  minOrderAmount: 0,
  maxDistanceKm: 30,
  maxWeightKg: 30,
  tipPresets: [0, 2, 5, 10],
  couponEnabled: true,
  acceptRadiusKm: 5,
  autoDispatch: false,
  riderShareRate: 1,
  maxActiveOrders: 3,
  pointsEarnRate: 1,
  pointsDeductRate: 100,
  maxPointsDiscountRate: 0.2,
  updatedAt: '',
};

export function ruleView(row: RuleRow | null): ErrandRule {
  if (!row) return { ...RULE_DEFAULT };
  return {
    baseFee: amount(row.baseFee),
    baseDistanceKm: numberIn(row.baseDistanceKm, 0, 200, 3),
    perKmFee: amount(row.perKmFee),
    baseWeightKg: numberIn(row.baseWeightKg, 0, 1000, 5),
    perKgFee: amount(row.perKgFee),
    nightStart: clip(row.nightStart, 5) || '22:00',
    nightEnd: clip(row.nightEnd, 5) || '06:00',
    nightFee: amount(row.nightFee),
    buyServiceRate: numberIn(row.buyServiceRate, 0, 1, 0.1),
    minOrderAmount: amount(row.minOrderAmount),
    maxDistanceKm: numberIn(row.maxDistanceKm, 0.1, 500, 30),
    maxWeightKg: numberIn(row.maxWeightKg, 0.1, 1000, 30),
    tipPresets: jsonList<unknown>(row.tipPresets)
      .map((item) => amount(item))
      .filter((item) => item >= 0)
      .slice(0, 10),
    couponEnabled: row.couponEnabled !== false,
    acceptRadiusKm: numberIn(row.acceptRadiusKm, 0, 100, 5),
    autoDispatch: row.autoDispatch === true,
    riderShareRate: numberIn(row.riderShareRate, 0, 1, 1),
    maxActiveOrders: intIn(row.maxActiveOrders, 1, 20, 3),
    pointsEarnRate: numberIn(row.pointsEarnRate, 0, 100, 1),
    pointsDeductRate: numberIn(row.pointsDeductRate, 1, 10000, 100),
    maxPointsDiscountRate: numberIn(row.maxPointsDiscountRate, 0, 1, 0.2),
    updatedAt: iso(row.updatedAt),
  };
}

export function togglesOf(value: unknown): Record<string, boolean> {
  const stored = mergeJson<Record<string, unknown>>(value, {});
  const out: Record<string, boolean> = {};
  for (const key of ERRAND_TOGGLE_KEYS) {
    out[key] = stored[key] === false ? false : ERRAND_DEFAULT_TOGGLES[key];
  }
  return out;
}

/**
 * 跑腿站点（一个账号一个）与其元信息、概览、公开上下文。
 *
 * 越权口径：一律按 `ownerUserId` 命中，查不到就是 NOT_FOUND；
 * `siteId` 永不信任请求体，顾客/骑手公开通道一律按站点码反查。
 */
export class ErrandSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: ErrandPlatformService,
  ) {}

  async meta(): Promise<ErrandMeta> {
    const limits = await this.platform.limits();
    return {
      scene: 'ERRAND',
      siteStatusLabels: ERRAND_SITE_STATUS_LABELS,
      cityStatusLabels: ERRAND_CITY_STATUS_LABELS,
      orderStateLabels: ERRAND_ORDER_STATE_LABELS,
      payStateLabels: ERRAND_PAY_STATE_LABELS,
      payModeLabels: ERRAND_PAY_MODE_LABELS,
      riderStatusLabels: ERRAND_RIDER_STATUS_LABELS,
      vehicleLabels: ERRAND_VEHICLE_TYPE_LABELS,
      serviceTypeLabels: ERRAND_SERVICE_TYPE_LABELS,
      actionLabels: ERRAND_ORDER_ACTION_LABELS,
      couponTypeLabels: { FIXED: '满减券', PERCENT: '折扣券' },
      withdrawalStatusLabels: {
        PENDING: '待打款',
        PAID: '已打款',
        REJECTED: '已驳回',
      },
      toggleLabels: { ...ERRAND_TOGGLE_LABELS },
      toggleKeys: [...ERRAND_TOGGLE_KEYS],
      limits,
    };
  }

  subject(site: {
    ownerUserId: string;
    id: number;
    name: string;
  }): MiniAppSubject {
    return {
      ownerUserId: site.ownerUserId,
      scene: ERRAND_SCENE,
      shopId: site.id,
      shopName: site.name,
    };
  }

  private async ruleOf(siteId: number): Promise<RuleRow | null> {
    const city = await this.prisma.errandCity.findFirst({
      where: { siteId, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!city) return null;
    return await this.prisma.errandRule.findUnique({
      where: { cityId: city.id },
    });
  }

  async ruleOfCity(cityId: number): Promise<ErrandRule> {
    const row = (await this.prisma.errandRule.findUnique({
      where: { cityId },
    })) as unknown as RuleRow | null;
    return ruleView(row);
  }

  /** 站点所有服务城市（含规则与计数），站点详情与首屏共用。 */
  private async cityViews(siteId: number): Promise<ErrandSite['cities']> {
    const rows = await this.prisma.errandCity.findMany({
      where: { siteId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [rules, riderCounts, orderCounts] = await Promise.all([
      this.prisma.errandRule.findMany({ where: { cityId: { in: ids } } }),
      this.prisma.errandRider.groupBy({
        by: ['cityId'],
        where: { siteId, cityId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.errandOrder.groupBy({
        by: ['cityId'],
        where: { siteId, cityId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const ruleByCity = new Map(
      rules.map((row) => [row.cityId, row as unknown as RuleRow]),
    );
    const riderByCity = new Map(
      riderCounts.map((row) => [row.cityId, row._count._all]),
    );
    const orderByCity = new Map(
      orderCounts.map((row) => [row.cityId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      province: row.province,
      city: row.city,
      district: row.district,
      addressLine: row.addressLine,
      lng: Number(row.lng) || 0,
      lat: Number(row.lat) || 0,
      status: row.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
      sort: row.sort,
      rule: ruleView(ruleByCity.get(row.id) ?? null),
      riderCount: riderByCity.get(row.id) ?? 0,
      orderCount: orderByCity.get(row.id) ?? 0,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));
  }

  /** 绑定客服站名：只认同账号下的站点，跨账号的 siteKey 一律当未绑定。 */
  async deskSiteName(ownerUserId: string, siteKey: string): Promise<string> {
    const key = clip(siteKey, 64);
    if (!key) return '';
    const desk = await this.prisma.serviceDeskSite.findFirst({
      where: { siteKey: key, ownerUserId },
      select: { name: true },
    });
    return desk ? clip(desk.name, 80) : '';
  }

  private async view(row: SiteRow, rule: ErrandRule): Promise<ErrandSite> {
    const [
      siteUrl,
      deskSiteName,
      orderTotal,
      riderTotal,
      customerTotal,
      cities,
    ] = await Promise.all([
      resolveSiteUrl(this.prisma),
      this.deskSiteName(row.ownerUserId, row.deskSiteKey),
      this.prisma.errandOrder.count({ where: { siteId: row.id } }),
      this.prisma.errandRider.count({ where: { siteId: row.id } }),
      this.prisma.errandCustomer.count({ where: { siteId: row.id } }),
      this.cityViews(row.id),
    ]);
    return {
      id: row.id,
      siteCode: row.siteCode,
      name: row.name,
      logo: clip(row.logo, 500),
      banner: clip(row.banner, 500),
      slogan: clip(row.slogan, 200),
      themeColor: normalizeTheme(row.themeColor),
      notice: clip(row.notice, 500),
      province: clip(row.province, 40),
      city: clip(row.city, 40),
      district: clip(row.district, 40),
      addressLine: clip(row.addressLine, 200),
      lng: numberIn(row.lng, -180, 180, 0),
      lat: numberIn(row.lat, -90, 90, 0),
      businessHours: clip(row.businessHours, 80),
      phone: clip(row.phone, 32),
      contact: mergeJson<ErrandContact>(row.contact, CONTACT_BASE),
      deskSiteKey: clip(row.deskSiteKey, 64),
      deskSiteName,
      toggles: togglesOf(row.toggles),
      protocolText: row.protocolText,
      status: siteStatus(row.status),
      siteUrl,
      rule,
      defaultCityId: cities[0]?.id ?? 0,
      cities,
      orderTotal,
      riderTotal,
      customerTotal,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async find(user: CurrentUser): Promise<SiteRow | null> {
    return await this.prisma.errandSite.findUnique({
      where: { ownerUserId: user.userId },
    });
  }

  async site(user: CurrentUser): Promise<ErrandSite | null> {
    const row = await this.find(user);
    if (!row) return null;
    return this.view(row, ruleView(await this.ruleOf(row.id)));
  }

  /** 归属校验 + 下游服务要用的上下文。 */
  async require(user: CurrentUser): Promise<ErrandSiteContext> {
    const row = await this.find(user);
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '还没有跑腿站点：先在「站点设置」填写名称并保存，即可生成小程序寻址码',
      );
    }
    const ruleRow = await this.ruleOf(row.id);
    const rule = ruleView(ruleRow);
    const site = await this.view(row, rule);
    return {
      site,
      row,
      rule,
      ruleRow: ruleRow ?? {
        id: 0,
        siteId: row.id,
        baseFee: 0,
        baseDistanceKm: 0,
        perKmFee: 0,
        baseWeightKg: 0,
        perKgFee: 0,
        nightStart: '',
        nightEnd: '',
        nightFee: 0,
        buyServiceRate: 0,
        minOrderAmount: 0,
        maxDistanceKm: 0,
        maxWeightKg: 0,
        tipPresets: [],
        couponEnabled: true,
        acceptRadiusKm: 5,
        autoDispatch: false,
        riderShareRate: 1,
        maxActiveOrders: 3,
        pointsEarnRate: 1,
        pointsDeductRate: 100,
        maxPointsDiscountRate: 0.2,
        updatedAt: new Date(),
      },
      subject: this.subject(row),
    };
  }

  private async resolveDeskKey(
    user: CurrentUser,
    siteKey: unknown,
  ): Promise<string> {
    const key = clip(toText(siteKey).trim(), 64);
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

  /** 首次保存建站并铺默认计价规则；之后只更新资料，站点码不重建。 */
  async save(user: CurrentUser, body: ErrandSiteSaveBody): Promise<ErrandSite> {
    await this.platform.requireEnabled();
    const name = clip(body.name, 120).trim();
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写跑腿站点名称');
    }
    const deskSiteKey = await this.resolveDeskKey(user, body.deskSiteKey);
    const current = await this.find(user);
    const data = {
      ownerUserId: user.userId,
      name,
      logo: clip(body.logo, 500),
      banner: clip(body.banner, 500),
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
      contact: jsonInput(contactOf(body.contact)),
      deskSiteKey,
      toggles: jsonInput(togglesOf(body.toggles)),
      protocolText: clip(body.protocolText, 4000),
    };
    let row: SiteRow;
    if (current) {
      row = await this.prisma.errandSite.update({
        where: { id: current.id },
        data,
      });
    } else {
      row = await this.prisma.errandSite.create({
        data: { ...data, siteCode: errandSiteCode(), status: 'DRAFT' },
      });
    }
    const legacyRule = (await this.prisma.errandRule.findFirst({
      where: { siteId: row.id },
    })) as unknown as RuleRow | null;
    await this.ensureCity(row, legacyRule);
    const ruleRow = await this.ruleOf(row.id);
    return this.view(row, ruleView(ruleRow));
  }

  /** 站点首次保存/老数据升级：至少有一个默认城市，并把旧站点规则迁到城市上。 */
  private async ensureCity(
    row: SiteRow,
    ruleRow: RuleRow | null,
  ): Promise<number> {
    const exists = await this.prisma.errandCity.findFirst({
      where: { siteId: row.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (exists) {
      if (
        ruleRow &&
        Number((ruleRow as unknown as { cityId?: number }).cityId) === 0
      ) {
        await this.prisma.errandRule.update({
          where: { id: ruleRow.id },
          data: { cityId: exists.id },
        });
      }
      return exists.id;
    }
    const name =
      row.city && row.district
        ? `${row.city}·${row.district}`
        : row.city || row.district || row.name.slice(0, 60);
    const city = await this.prisma.errandCity.create({
      data: {
        siteId: row.id,
        name,
        province: row.province,
        city: row.city,
        district: row.district,
        addressLine: row.addressLine,
        lng: Number(row.lng) || 0,
        lat: Number(row.lat) || 0,
      },
    });
    if (ruleRow) {
      await this.prisma.errandRule.update({
        where: { id: ruleRow.id },
        data: { cityId: city.id },
      });
    } else {
      await this.prisma.errandRule.create({
        data: {
          siteId: row.id,
          cityId: city.id,
          tipPresets: jsonInput(RULE_DEFAULT.tipPresets),
        },
      });
    }
    return city.id;
  }

  /** 计价规则保存：一店一条，金额全部按元保存，服务层统一转「分」计算。 */
  async saveRule(
    user: CurrentUser,
    body: ErrandRuleSaveBody,
  ): Promise<ErrandRule> {
    const ctx = await this.require(user);
    const data = {
      baseFee: Math.max(0, body.baseFee),
      baseDistanceKm: numberIn(body.baseDistanceKm, 0, 200, 3),
      perKmFee: Math.max(0, body.perKmFee),
      baseWeightKg: numberIn(body.baseWeightKg, 0, 1000, 5),
      perKgFee: Math.max(0, body.perKgFee),
      nightStart: clip(body.nightStart, 5) || '22:00',
      nightEnd: clip(body.nightEnd, 5) || '06:00',
      nightFee: Math.max(0, body.nightFee),
      buyServiceRate: numberIn(body.buyServiceRate, 0, 1, 0.1),
      minOrderAmount: Math.max(0, body.minOrderAmount),
      maxDistanceKm: numberIn(body.maxDistanceKm, 0.1, 500, 30),
      maxWeightKg: numberIn(body.maxWeightKg, 0.1, 1000, 30),
      tipPresets: jsonInput(
        body.tipPresets
          .map((item) => amount(item))
          .filter((item) => item >= 0)
          .slice(0, 10),
      ),
      couponEnabled: body.couponEnabled !== false,
      acceptRadiusKm: numberIn(body.acceptRadiusKm, 0, 100, 5),
      autoDispatch: body.autoDispatch === true,
      riderShareRate: numberIn(body.riderShareRate, 0, 1, 1),
      maxActiveOrders: intIn(body.maxActiveOrders, 1, 20, 3),
      pointsEarnRate: numberIn(body.pointsEarnRate, 0, 100, 1),
      pointsDeductRate: numberIn(body.pointsDeductRate, 1, 10000, 100),
      maxPointsDiscountRate: numberIn(body.maxPointsDiscountRate, 0, 1, 0.2),
    };
    await this.ensureCity(
      ctx.row,
      await this.prisma.errandRule.findFirst({
        where: { siteId: ctx.row.id },
      }),
    );
    const city = (await this.prisma.errandCity.findFirst({
      where: { siteId: ctx.row.id, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true },
    }))!;
    const row = (await this.prisma.errandRule.upsert({
      where: { cityId: city.id },
      create: { siteId: ctx.row.id, cityId: city.id, ...data },
      update: data,
    })) as unknown as RuleRow;
    return ruleView(row);
  }

  async setStatus(
    user: CurrentUser,
    status: ErrandSiteStatus,
  ): Promise<ErrandSite> {
    const ctx = await this.require(user);
    const next = String(status);
    if (next !== 'DRAFT' && next !== 'ONLINE' && next !== 'CLOSED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点状态只能是「未上线 / 营业中 / 已关闭」',
      );
    }
    if (
      (next === 'ONLINE' || next === 'CLOSED') &&
      !(await this.miniApp.configured(ctx.subject))
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在「小程序发布」填写小程序 AppID 与 AppSecret 并自检通过，再上线站点',
      );
    }
    const row = (await this.prisma.errandSite.update({
      where: { id: ctx.row.id },
      data: { status: next },
    })) as unknown as SiteRow;
    return this.view(row, ctx.rule);
  }

  /** 账号概览：今日流水、各状态单量与近 7 天趋势。 */
  async overview(user: CurrentUser): Promise<ErrandOverview> {
    const ctx = await this.require(user);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const weekStart = new Date(start.getTime() - 6 * 86400_000);
    const [
      todayPaid,
      pendingPay,
      pendingAccept,
      inProgress,
      completedToday,
      onlineRiders,
      pendingRiders,
      totalOrders,
      totalPaid,
    ] = await Promise.all([
      this.prisma.errandOrder.aggregate({
        where: {
          siteId: ctx.row.id,
          payState: 'PAID',
          createdAt: { gte: start },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.errandOrder.count({
        where: { siteId: ctx.row.id, status: 'PENDING_PAY' },
      }),
      this.prisma.errandOrder.count({
        where: { siteId: ctx.row.id, status: 'PENDING_ACCEPT' },
      }),
      this.prisma.errandOrder.count({
        where: {
          siteId: ctx.row.id,
          status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
        },
      }),
      this.prisma.errandOrder.count({
        where: {
          siteId: ctx.row.id,
          status: 'COMPLETED',
          completedAt: { gte: start },
        },
      }),
      this.prisma.errandRider.count({
        where: { siteId: ctx.row.id, online: true, status: 'APPROVED' },
      }),
      this.prisma.errandRider.count({
        where: { siteId: ctx.row.id, status: 'PENDING' },
      }),
      this.prisma.errandOrder.count({ where: { siteId: ctx.row.id } }),
      this.prisma.errandOrder.aggregate({
        where: { siteId: ctx.row.id, payState: 'PAID' },
        _sum: { totalAmount: true },
      }),
    ]);
    const rows = await this.prisma.errandOrder.findMany({
      where: {
        siteId: ctx.row.id,
        payState: 'PAID',
        createdAt: { gte: weekStart },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });
    const buckets = new Map<string, { orders: number; cents: number }>();
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(weekStart.getTime() + index * 86400_000);
      buckets.set(this.dayKey(day), { orders: 0, cents: 0 });
    }
    for (const row of rows) {
      const key = this.dayKey(row.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
      bucket.cents += toCents(row.totalAmount);
    }
    const [cityRows, todayCity, pendingCity, activeCity, onlineCity] =
      await Promise.all([
        this.prisma.errandCity.findMany({
          where: { siteId: ctx.row.id },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.errandOrder.groupBy({
          by: ['cityId'],
          where: {
            siteId: ctx.row.id,
            payState: 'PAID',
            createdAt: { gte: start },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
        this.prisma.errandOrder.groupBy({
          by: ['cityId'],
          where: { siteId: ctx.row.id, status: 'PENDING_ACCEPT' },
          _count: { _all: true },
        }),
        this.prisma.errandOrder.groupBy({
          by: ['cityId'],
          where: {
            siteId: ctx.row.id,
            status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
          },
          _count: { _all: true },
        }),
        this.prisma.errandRider.groupBy({
          by: ['cityId'],
          where: { siteId: ctx.row.id, status: 'APPROVED', online: true },
          _count: { _all: true },
        }),
      ]);
    const todayMap = new Map(todayCity.map((row) => [row.cityId, row]));
    const pendingMap = new Map(
      pendingCity.map((row) => [row.cityId, row._count._all]),
    );
    const activeMap = new Map(
      activeCity.map((row) => [row.cityId, row._count._all]),
    );
    const onlineMap = new Map(
      onlineCity.map((row) => [row.cityId, row._count._all]),
    );
    return {
      todayOrders: todayPaid._count._all,
      todayGmv: amount(todayPaid._sum.totalAmount),
      pendingPay,
      pendingAccept,
      inProgress,
      completedToday,
      onlineRiders,
      pendingRiders,
      totalOrders,
      totalGmv: amount(totalPaid._sum.totalAmount),
      trend: [...buckets.entries()].map(([day, value]) => ({
        day,
        orders: value.orders,
        amount: fromCents(value.cents),
      })),
      cityStats: cityRows.map((city) => ({
        cityId: city.id,
        cityName: city.name,
        todayOrders: todayMap.get(city.id)?._count._all ?? 0,
        todayGmv: amount(todayMap.get(city.id)?._sum.totalAmount),
        pending: pendingMap.get(city.id) ?? 0,
        inProgress: activeMap.get(city.id) ?? 0,
        onlineRiders: onlineMap.get(city.id) ?? 0,
      })),
    };
  }

  private dayKey(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // ---------------------------------------------------------------- 公开通道

  /** 站点码 → 公开上下文；已关闭站点在这里就是「不存在」。 */
  async byCode(
    code: string,
  ): Promise<{ row: SiteRow; rule: ErrandRule } | null> {
    const siteCode = clip(code, 16).trim().toUpperCase();
    if (!siteCode) return null;
    const row = (await this.prisma.errandSite.findUnique({
      where: { siteCode },
    })) as unknown as SiteRow | null;
    if (!row || row.status !== 'ONLINE') return null;
    return { row, rule: ruleView(await this.ruleOf(row.id)) };
  }

  async byAppId(
    appId: string,
  ): Promise<{ row: SiteRow; rule: ErrandRule } | null> {
    const value = clip(appId, 64).trim();
    if (!value) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { appId: value, scene: ERRAND_SCENE },
      select: { ownerUserId: true },
    });
    if (!app) return null;
    const row = (await this.prisma.errandSite.findUnique({
      where: { ownerUserId: app.ownerUserId },
    })) as unknown as SiteRow | null;
    if (!row || row.status !== 'ONLINE') return null;
    return { row, rule: ruleView(await this.ruleOf(row.id)) };
  }

  /** 启动闸门：工具未启动/欠费/平台停服时，匿名读通道一并停服。 */
  async ensureToolOpen(ownerUserId: string) {
    if (!(await toolOpen('errand', ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该跑腿站点尚未启动（或已停服），请店主到「建站管理 → 启动设置」启动后重试',
      );
    }
  }

  /** 公开站点列表：一部小程序一个站点，按 AppID 反查，避免端上硬编码站点码。 */
  async publicSites(appId: string): Promise<ErrandPublicSiteListItem[]> {
    const found = await this.byAppId(appId);
    if (!found) return [];
    await this.ensureToolOpen(found.row.ownerUserId);
    const { row } = found;
    const cities = await this.prisma.errandCity.findMany({
      where: { siteId: row.id, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const first = cities[0];
    return [
      {
        siteCode: row.siteCode,
        cityId: first?.id ?? 0,
        cityName: first?.name ?? '',
        cities: cities.map((city) => ({
          id: city.id,
          name: city.name,
          province: city.province,
          city: city.city,
          district: city.district,
          addressLine: city.addressLine,
          lng: Number(city.lng) || 0,
          lat: Number(city.lat) || 0,
        })),
        name: row.name,
        logo: row.logo,
        province: row.province,
        city: row.city,
        district: row.district,
        addressLine: row.addressLine,
        lng: numberIn(row.lng, -180, 180, 0),
        lat: numberIn(row.lat, -90, 90, 0),
      },
    ];
  }

  /** 公开站点配置：按城市返回展示字段、该城计价与可领券，不带任何凭据。 */
  async publicContext(
    row: SiteRow,
    rule: ErrandRule,
    cityId = 0,
  ): Promise<ErrandPublicSite> {
    await this.ensureToolOpen(row.ownerUserId);
    const cities = await this.prisma.errandCity.findMany({
      where: { siteId: row.id, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const city =
      cityId > 0 ? cities.find((item) => item.id === cityId) : cities[0];
    if (!city) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该服务城市尚未开通或已停用，请切换其他城市',
      );
    }
    const cityRule = await this.ruleOfCity(city.id);
    const [siteUrl, coupons, deskName, templates] = await Promise.all([
      resolveSiteUrl(this.prisma),
      cityRule.couponEnabled
        ? this.prisma.errandCoupon.findMany({
            where: {
              siteId: row.id,
              enabled: true,
              OR: [{ cityId: 0 }, { cityId: city.id }],
              AND: [{ OR: [{ endAt: null }, { endAt: { gt: new Date() } }] }],
            },
            orderBy: [{ id: 'desc' }],
            take: 20,
          })
        : Promise.resolve([]),
      this.deskSiteName(row.ownerUserId, row.deskSiteKey),
      this.miniApp.templates(this.subject(row)).catch(() => ({})),
    ]);
    const embed = row.deskSiteKey
      ? `${siteUrl}${ERRAND_DESK_EMBED_PATH}?key=${row.deskSiteKey}`
      : '';
    void rule;
    return {
      siteId: row.id,
      siteCode: row.siteCode,
      cityId: city.id,
      cityName: city.name,
      cities: cities.map((item) => ({
        id: item.id,
        name: item.name,
        province: item.province,
        city: item.city,
        district: item.district,
        addressLine: item.addressLine,
        lng: Number(item.lng) || 0,
        lat: Number(item.lat) || 0,
      })),
      name: row.name,
      logo: row.logo,
      banner: row.banner,
      slogan: row.slogan,
      themeColor: normalizeTheme(row.themeColor),
      notice: row.notice,
      province: row.province,
      city: row.city,
      district: row.district,
      addressLine: row.addressLine,
      lng: numberIn(row.lng, -180, 180, 0),
      lat: numberIn(row.lat, -90, 90, 0),
      businessHours: row.businessHours,
      phone: row.phone,
      contact: mergeJson<ErrandContact>(row.contact, CONTACT_BASE),
      toggles: togglesOf(row.toggles),
      protocolText: row.protocolText,
      rule: cityRule,
      deskEmbedUrl: deskName ? embed : '',
      templates: templates || {},
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        name: coupon.name,
        type: coupon.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
        discountValue: Number(coupon.discountValue),
        minAmount: amount(coupon.minAmount),
      })),
    };
  }
}
