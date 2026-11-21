import {
  ERRAND_CITY_STATUSES,
  type ErrandCity,
  type ErrandCitySaveBody,
  type ErrandCityStatus,
  type ErrandRule,
  type ErrandRuleUpdateBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { ErrandSiteService } from './errand.site.service';
import { ruleView, type RuleRow } from './errand.site.service';
import { clip, iso, jsonInput, numberIn } from './errand.shared';

type CityRow = {
  id: number;
  siteId: number;
  name: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  lng: number;
  lat: number;
  status: string;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

function cityStatus(value: unknown): ErrandCityStatus {
  return String(value) === 'DISABLED' ? 'DISABLED' : 'ENABLED';
}

/**
 * 服务城市：同一平台账号（站点）下的业务分区。
 *
 * 不新增账号体系：城市只隔离计价、骑手与订单；顾客/骑手仍是小程序微信身份，
 * 所有城市数据都归当前平台账号所有。一个城市一条计价规则，报价只用这条规则。
 */
export class ErrandCityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
  ) {}

  private async ruleOf(cityId: number): Promise<ErrandRule> {
    const row = (await this.prisma.errandRule.findUnique({
      where: { cityId },
    })) as unknown as RuleRow | null;
    return ruleView(row);
  }

  async list(user: CurrentUser): Promise<ErrandCity[]> {
    const ctx = await this.sites.require(user);
    const rows = await this.prisma.errandCity.findMany({
      where: { siteId: ctx.row.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return this.rowsToView(rows);
  }

  private async rowsToView(rows: CityRow[]): Promise<ErrandCity[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [rules, riderCounts, orderCounts] = await Promise.all([
      this.prisma.errandRule.findMany({ where: { cityId: { in: ids } } }),
      this.prisma.errandRider.groupBy({
        by: ['cityId'],
        where: { cityId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.errandOrder.groupBy({
        by: ['cityId'],
        where: { cityId: { in: ids } },
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
      status: cityStatus(row.status),
      sort: row.sort,
      rule: ruleView(ruleByCity.get(row.id) ?? null),
      riderCount: riderByCity.get(row.id) ?? 0,
      orderCount: orderByCity.get(row.id) ?? 0,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));
  }

  async save(user: CurrentUser, body: ErrandCitySaveBody): Promise<ErrandCity> {
    const ctx = await this.sites.require(user);
    const name = clip(body.name, 60).trim();
    if (!name)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写城市/服务区名称',
      );
    const current =
      body.id > 0
        ? await this.prisma.errandCity.findFirst({
            where: { id: body.id, siteId: ctx.row.id },
          })
        : null;
    if (body.id > 0 && !current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '城市不存在');
    }
    const dup = await this.prisma.errandCity.findFirst({
      where: {
        siteId: ctx.row.id,
        name,
        ...(current ? { NOT: { id: current.id } } : {}),
      },
      select: { id: true },
    });
    if (dup)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '同一站点下城市名称不能重复',
      );
    const data = {
      siteId: ctx.row.id,
      name,
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      addressLine: clip(body.addressLine, 200),
      lng: numberIn(body.lng, -180, 180, 0),
      lat: numberIn(body.lat, -90, 90, 0),
      status: body.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
      sort: Math.max(0, Math.floor(body.sort || 0)),
    };
    const city = await this.prisma.$transaction(async (tx) => {
      const row = current
        ? await tx.errandCity.update({ where: { id: current.id }, data })
        : await tx.errandCity.create({ data });
      const rule = body.rule;
      const ruleData = {
        baseFee: Math.max(0, rule.baseFee),
        baseDistanceKm: numberIn(rule.baseDistanceKm, 0, 200, 3),
        perKmFee: Math.max(0, rule.perKmFee),
        baseWeightKg: numberIn(rule.baseWeightKg, 0, 1000, 5),
        perKgFee: Math.max(0, rule.perKgFee),
        nightStart: clip(rule.nightStart, 5) || '22:00',
        nightEnd: clip(rule.nightEnd, 5) || '06:00',
        nightFee: Math.max(0, rule.nightFee),
        buyServiceRate: numberIn(rule.buyServiceRate, 0, 1, 0.1),
        minOrderAmount: Math.max(0, rule.minOrderAmount),
        maxDistanceKm: numberIn(rule.maxDistanceKm, 0.1, 500, 30),
        maxWeightKg: numberIn(rule.maxWeightKg, 0.1, 1000, 30),
        tipPresets: jsonInput(
          rule.tipPresets.map((item) => Math.max(0, item)).slice(0, 10),
        ),
        couponEnabled: rule.couponEnabled !== false,
        acceptRadiusKm: numberIn(rule.acceptRadiusKm, 0, 100, 5),
        autoDispatch: rule.autoDispatch === true,
        riderShareRate: numberIn(rule.riderShareRate, 0, 1, 1),
        maxActiveOrders: Math.min(
          20,
          Math.max(1, Math.round(rule.maxActiveOrders || 3)),
        ),
      };
      await tx.errandRule.upsert({
        where: { cityId: row.id },
        create: { cityId: row.id, siteId: ctx.row.id, ...ruleData },
        update: ruleData,
      });
      return row;
    });
    const [view] = await this.rowsToView([city]);
    return view;
  }

  async setStatus(
    user: CurrentUser,
    id: number,
    status: ErrandCityStatus,
  ): Promise<ErrandCity> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandCity.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '城市不存在');
    const updated = await this.prisma.errandCity.update({
      where: { id: row.id },
      data: { status: status === 'DISABLED' ? 'DISABLED' : 'ENABLED' },
    });
    const [view] = await this.rowsToView([updated]);
    return view;
  }

  async remove(user: CurrentUser, id: number) {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandCity.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '城市不存在');
    const [orders, riders] = await Promise.all([
      this.prisma.errandOrder.count({
        where: { siteId: ctx.row.id, cityId: row.id },
      }),
      this.prisma.errandRider.count({
        where: { siteId: ctx.row.id, cityId: row.id },
      }),
    ]);
    if (orders || riders) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该城市已有 ${orders} 笔订单、${riders} 名骑手，不能删除；请改为「停用」`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.errandRule.deleteMany({ where: { cityId: row.id } });
      await tx.errandCity.delete({ where: { id: row.id } });
    });
    return { ok: true, message: '城市已删除' };
  }

  async updateRule(
    user: CurrentUser,
    body: ErrandRuleUpdateBody,
  ): Promise<ErrandRule> {
    const ctx = await this.sites.require(user);
    const cityId =
      body.cityId > 0
        ? body.cityId
        : (await this.defaultCityId(ctx.row.id)) || 0;
    if (!cityId)
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点还没有服务城市');
    const city = await this.prisma.errandCity.findFirst({
      where: { id: cityId, siteId: ctx.row.id },
      select: { id: true },
    });
    if (!city) throw new BusinessException(ErrorCode.NOT_FOUND, '城市不存在');
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
        body.tipPresets.map((item) => Math.max(0, item)).slice(0, 10),
      ),
      couponEnabled: body.couponEnabled !== false,
      acceptRadiusKm: numberIn(body.acceptRadiusKm, 0, 100, 5),
      autoDispatch: body.autoDispatch === true,
      riderShareRate: numberIn(body.riderShareRate, 0, 1, 1),
      maxActiveOrders: Math.min(
        20,
        Math.max(1, Math.round(body.maxActiveOrders || 3)),
      ),
    };
    const row = (await this.prisma.errandRule.upsert({
      where: { cityId: city.id },
      create: { cityId: city.id, siteId: ctx.row.id, ...data },
      update: data,
    })) as unknown as RuleRow;
    return ruleView(row);
  }

  /** 默认城市：排序最前/最早创建的开通城市；没有城市返回 null。 */
  async defaultCityId(siteId: number): Promise<number | null> {
    const row = await this.prisma.errandCity.findFirst({
      where: { siteId, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findEnabled(siteId: number, cityId: number): Promise<CityRow | null> {
    if (cityId > 0) {
      return await this.prisma.errandCity.findFirst({
        where: { id: cityId, siteId, status: 'ENABLED' },
      });
    }
    const id = await this.defaultCityId(siteId);
    if (!id) return null;
    return await this.prisma.errandCity.findUnique({
      where: { id },
    });
  }

  async publicCities(siteId: number) {
    const rows = await this.prisma.errandCity.findMany({
      where: { siteId, status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return (rows as unknown as CityRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      province: row.province,
      city: row.city,
      district: row.district,
      addressLine: row.addressLine,
      lng: Number(row.lng) || 0,
      lat: Number(row.lat) || 0,
    }));
  }

  /** 站点首次保存时创建默认城市，并把原来的站点级计价规则迁到该城市。 */
  async ensureDefaultCity(
    site: {
      id: number;
      name: string;
      province: string;
      city: string;
      district: string;
      addressLine: string;
      lng: number;
      lat: number;
    },
    ruleRow: { id: number } | null,
  ): Promise<number> {
    const exists = await this.prisma.errandCity.findFirst({
      where: { siteId: site.id },
      select: { id: true },
    });
    if (exists) return exists.id;
    const name =
      site.city && site.district
        ? `${site.city}·${site.district}`
        : site.city || site.district || site.name.slice(0, 60);
    const city = await this.prisma.errandCity.create({
      data: {
        siteId: site.id,
        name,
        province: site.province,
        city: site.city,
        district: site.district,
        addressLine: site.addressLine,
        lng: site.lng,
        lat: site.lat,
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
          cityId: city.id,
          siteId: site.id,
          tipPresets: jsonInput([0, 2, 5, 10]),
        },
      });
    }
    return city.id;
  }

  statusLabel(value: unknown): string {
    return cityStatus(value) === 'DISABLED' ? '停用' : '开通';
  }
}

/** 城市状态枚举兜底：只用于契约类型的运行时校验。 */
export function cityStatusOf(value: unknown): ErrandCityStatus {
  for (const item of ERRAND_CITY_STATUSES) {
    if (item === value) return item;
  }
  return 'ENABLED';
}
