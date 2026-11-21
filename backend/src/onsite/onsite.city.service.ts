import {
  type OnsiteCityInput,
  type OnsiteCityRow,
  type OnsiteFeeEstimateInput,
  type OnsiteFeeEstimateResult,
  type OnsiteFeeRuleInput,
  type OnsiteFeeRuleRow,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { httpRequest, TransportError } from '../http/transport';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, decimalOf } from './onsite.money';
import {
  computeTravelFee,
  coordinatesUsable,
  straightKilometers,
  type FeeRule,
} from './onsite.fee.engine';
import type { OnsiteShopService } from './onsite.shop.service';

const MAP_API_BASE = 'https://apis.map.qq.com';
const MAP_TIMEOUT_MS = 6000;

type CityRowLike = {
  id: number;
  shopId: number;
  parentId: number;
  name: string;
  level: string;
  provinceCode: string;
  cityCode: string;
  areaCode: string;
  lng: unknown;
  lat: unknown;
  sortOrder: number;
  enabled: boolean;
};

/**
 * 开城与车费规则。
 *
 * 车费取值优先级（与参考源码一致但写明顺序，避免两处实现打架）：
 * 技师自定车费 → 服务固定车费（travelFeeMode=CUSTOM）→ 该城市规则 → 店铺默认规则（cityId=0）→ 兜底金额。
 * 距离取不到时**不静默按 0 计**：降级成直线距离并在结果里标出来源，店主能看见为什么价不一样。
 */
export class OnsiteCityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 城市 ----------

  async cities(user: CurrentUser, shopId: string, keyword: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteCity.findMany({
      where: {
        shopId: shop.shopId,
        ...(keyword.trim()
          ? { name: { contains: keyword.trim().slice(0, 40) } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const [rules, staffRows] = await Promise.all([
      this.prisma.onsiteTravelFeeRule.findMany({
        where: { shopId: shop.shopId },
      }),
      this.prisma.onsiteStaff.findMany({
        where: { shopId: shop.shopId },
        select: { cityId: true },
      }),
    ]);
    const ruleOf = new Map(rules.map((rule) => [rule.cityId, rule.id]));
    const staffCount = new Map<number, number>();
    for (const staff of staffRows) {
      if (!staff.cityId) continue;
      staffCount.set(staff.cityId, (staffCount.get(staff.cityId) || 0) + 1);
    }
    const list: OnsiteCityRow[] = rows.map((row) =>
      this.toCityRow(row, ruleOf, staffCount),
    );
    return { list };
  }

  private toCityRow(
    row: CityRowLike,
    ruleOf: Map<number, number>,
    staffCount: Map<number, number>,
  ): OnsiteCityRow {
    return {
      id: row.id,
      shopId: row.shopId,
      parentId: row.parentId,
      name: row.name,
      level: row.level,
      provinceCode: row.provinceCode,
      cityCode: row.cityCode,
      areaCode: row.areaCode,
      lng: Number(row.lng ?? 0),
      lat: Number(row.lat ?? 0),
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      ruleId: ruleOf.get(row.id) ?? 0,
      staffCount: staffCount.get(row.id) || 0,
    };
  }

  async saveCity(user: CurrentUser, shopId: string, body: OnsiteCityInput) {
    const shop = await this.shops.requireShop(user, shopId);
    const data = {
      parentId: Math.max(0, Math.round(body.parentId || 0)),
      name: body.name.trim().slice(0, 60),
      level: body.level,
      provinceCode: body.provinceCode.trim().slice(0, 12),
      cityCode: body.cityCode.trim().slice(0, 12),
      areaCode: body.areaCode.trim().slice(0, 12),
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      enabled: body.enabled !== false,
      sortOrder: Math.round(body.sortOrder || 0),
    };
    const dup = await this.prisma.onsiteCity.findFirst({
      where: {
        shopId: shop.shopId,
        name: data.name,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `城市「${data.name}」已开通`,
      );
    }
    const row = body.id
      ? await this.prisma.onsiteCity.update({ where: { id: body.id }, data })
      : await this.prisma.onsiteCity.create({
          data: { shopId: shop.shopId, ...data },
        });
    const rules = await this.prisma.onsiteTravelFeeRule.findMany({
      where: { shopId: shop.shopId },
      select: { id: true, cityId: true },
    });
    return this.toCityRow(
      row,
      new Map(rules.map((rule) => [rule.cityId, rule.id])),
      new Map(),
    );
  }

  async removeCity(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteCity.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '城市不存在');
    const [staffCount, orders] = await Promise.all([
      this.prisma.onsiteStaff.count({
        where: { shopId: shop.shopId, cityId: row.id },
      }),
      this.prisma.onsiteOrder.count({
        where: {
          shopId: shop.shopId,
          cityId: row.id,
          status: { not: 'CLOSED' },
        },
      }),
    ]);
    if (staffCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」还有 ${staffCount} 名服务人员挂在下面，请先给他们换城市`,
      );
    }
    if (orders > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」还有 ${orders} 笔进行中的订单，请先处理完订单再关城`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.onsiteTravelFeeRule.deleteMany({
        where: { shopId: shop.shopId, cityId: row.id },
      }),
      this.prisma.onsiteCity.delete({ where: { id: row.id } }),
    ]);
    return { removed: true };
  }

  // ---------- 车费规则 ----------

  async feeRules(user: CurrentUser, shopId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const [rows, cities] = await Promise.all([
      this.prisma.onsiteTravelFeeRule.findMany({
        where: { shopId: shop.shopId },
        orderBy: [{ cityId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.onsiteCity.findMany({
        where: { shopId: shop.shopId },
        select: { id: true, name: true },
      }),
    ]);
    const nameOf = new Map(cities.map((city) => [city.id, city.name]));
    const list: OnsiteFeeRuleRow[] = rows.map((row) => ({
      id: row.id,
      cityId: row.cityId,
      cityName:
        row.cityId === 0
          ? '店铺默认'
          : (nameOf.get(row.cityId) ?? `#${row.cityId}`),
      freeKilometers: Number(row.freeKilometers ?? 0),
      startFeeCents: centsOf(row.startFee),
      startKilometers: Number(row.startKilometers ?? 0),
      pricePerKilometerCents: centsOf(row.pricePerKilometer),
      virtualExtraKilometers: Number(row.virtualExtraKilometers ?? 0),
      publicTransitEnabled: row.publicTransitEnabled,
      minFeeCents: centsOf(row.minFee),
      enabled: row.enabled,
    }));
    return { list };
  }

  async saveFeeRule(
    user: CurrentUser,
    shopId: string,
    body: OnsiteFeeRuleInput,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    if (body.cityId > 0) {
      const city = await this.prisma.onsiteCity.findFirst({
        where: { id: body.cityId, shopId: shop.shopId },
      });
      if (!city) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选城市不在本店铺已开通的城市里，请先到「城市与车费」添加城市',
        );
      }
    }
    if (
      body.startFeeCents <= 0 &&
      body.pricePerKilometerCents <= 0 &&
      body.minFeeCents <= 0
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '起步价、每公里单价、最低车费至少填一项，否则该规则等于不收车费',
      );
    }
    const data = {
      cityId: Math.max(0, Math.round(body.cityId || 0)),
      freeKilometers: Number(body.freeKilometers) || 0,
      startFee: decimalOf(body.startFeeCents),
      startKilometers: Number(body.startKilometers) || 0,
      pricePerKilometer: decimalOf(body.pricePerKilometerCents),
      virtualExtraKilometers: Number(body.virtualExtraKilometers) || 0,
      publicTransitEnabled: body.publicTransitEnabled === true,
      minFee: decimalOf(body.minFeeCents),
      enabled: body.enabled !== false,
    };
    // (shopId, cityId) 唯一：一个城市一条规则，重复保存视为覆盖
    const existing = await this.prisma.onsiteTravelFeeRule.findFirst({
      where: { shopId: shop.shopId, cityId: data.cityId },
    });
    const row = existing
      ? await this.prisma.onsiteTravelFeeRule.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.onsiteTravelFeeRule.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      cityId: row.cityId,
      cityName: row.cityId === 0 ? '店铺默认' : `#${row.cityId}`,
      freeKilometers: Number(row.freeKilometers ?? 0),
      startFeeCents: centsOf(row.startFee),
      startKilometers: Number(row.startKilometers ?? 0),
      pricePerKilometerCents: centsOf(row.pricePerKilometer),
      virtualExtraKilometers: Number(row.virtualExtraKilometers ?? 0),
      publicTransitEnabled: row.publicTransitEnabled,
      minFeeCents: centsOf(row.minFee),
      enabled: row.enabled,
    };
  }

  async removeFeeRule(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteTravelFeeRule.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '车费规则不存在');
    await this.prisma.onsiteTravelFeeRule.delete({ where: { id: row.id } });
    return { removed: true };
  }

  /** C 端按已存地址试算车费：地址必须属于当前顾客，起点取技师常驻坐标。 */
  async publicEstimate(
    shop: Awaited<ReturnType<OnsiteShopService['findByCode']>> & object,
    customerId: number,
    input: { addressId: number; staffId: number; serviceId: number },
  ) {
    const address = await this.prisma.onsiteCustomerAddress.findFirst({
      where: { id: input.addressId, shopId: shop.shopId, customerId },
    });
    if (!address) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '地址不存在，请重新选择服务地址',
      );
    }
    const staff = input.staffId
      ? await this.prisma.onsiteStaff.findFirst({
          where: { id: input.staffId, shopId: shop.shopId },
        })
      : null;
    return this.computeFee(
      {
        ownerUserId: shop.ownerUserId,
        scene: 'ONSITE',
        shopId: shop.shopId,
        shopName: shop.shopName,
      },
      {
        fromLng: staff ? Number(staff.lng) : 0,
        fromLat: staff ? Number(staff.lat) : 0,
        toLng: Number(address.lng),
        toLat: Number(address.lat),
        cityId: address.cityId || (staff ? staff.cityId : 0),
        serviceId: input.serviceId || 0,
        staffId: input.staffId || 0,
      },
    );
  }

  // ---------- 算价 ----------

  /** 引擎用的规则读取：下单与试算都从这里取，保证同一份口径。 */
  async ruleFor(
    shopId: number,
    cityId: number,
  ): Promise<{ rule: FeeRule | null; note: string }> {
    const rows = await this.prisma.onsiteTravelFeeRule.findMany({
      where: { shopId, enabled: true, cityId: { in: [cityId, 0] } },
    });
    const hit = rows.find((row) => row.cityId === cityId) ?? rows[0];
    if (!hit) return { rule: null, note: '未配置车费规则' };
    return {
      rule: {
        freeKilometers: Number(hit.freeKilometers ?? 0),
        startFeeCents: centsOf(hit.startFee),
        startKilometers: Number(hit.startKilometers ?? 0),
        pricePerKilometerCents: centsOf(hit.pricePerKilometer),
        virtualExtraKilometers: Number(hit.virtualExtraKilometers ?? 0),
        minFeeCents: centsOf(hit.minFee),
      },
      note:
        hit.cityId === cityId && cityId > 0
          ? `城市规则 #${cityId}`
          : '店铺默认规则',
    };
  }

  /** 驾车距离（腾讯地图）：没配 key、超时或返回异常都回 null，由调用方降级。 */
  private async drivingKilometers(
    mapKey: string,
    from: { lng: number; lat: number },
    to: { lng: number; lat: number },
  ): Promise<number | null> {
    if (!mapKey) return null;
    const query = new URLSearchParams({
      mode: 'driving',
      from: `${from.lat},${from.lng}`,
      to: `${to.lat},${to.lng}`,
      key: mapKey,
    });
    try {
      const result = await httpRequest<{
        status?: number;
        result?: { elements?: Array<{ distance?: number }> };
      }>(`${MAP_API_BASE}/ws/distance/v1/?${query.toString()}`, {
        method: 'GET',
        timeoutMs: MAP_TIMEOUT_MS,
        readAs: 'json',
        maxBytes: 64 * 1024,
        operation: 'onsite-map-distance',
      });
      const payload = result.data;
      if (!result.ok || Number(payload?.status ?? -1) !== 0) return null;
      const meters = Number(payload?.result?.elements?.[0]?.distance ?? 0);
      if (!Number.isFinite(meters) || meters <= 0) return null;
      return Number((meters / 1000).toFixed(2));
    } catch (error) {
      // 地图配额或网络问题不影响下单：降级路径由调用方决定，这里只留一行原因
      if (error instanceof TransportError || error instanceof BusinessException)
        return null;
      return null;
    }
  }

  async estimate(
    user: CurrentUser,
    shopId: string,
    input: OnsiteFeeEstimateInput,
  ): Promise<OnsiteFeeEstimateResult> {
    const shop = await this.shops.requireShop(user, shopId);
    return this.computeFee(
      {
        ownerUserId: shop.ownerUserId,
        scene: shop.scene,
        shopId: shop.shopId,
        shopName: shop.shopName,
      },
      input,
    );
  }

  /** 公开通道与店主端共用：入参只有店铺与坐标，返回同一份算价结果。 */
  async computeFee(
    subject: {
      ownerUserId: string;
      scene: 'ONSITE';
      shopId: number;
      shopName: string;
    },
    input: OnsiteFeeEstimateInput,
  ): Promise<OnsiteFeeEstimateResult> {
    const from = {
      lng: Number(input.fromLng) || 0,
      lat: Number(input.fromLat) || 0,
    };
    const to = { lng: Number(input.toLng) || 0, lat: Number(input.toLat) || 0 };
    const [trade, service, staff] = await Promise.all([
      this.shops.tradeById(subject.shopId),
      input.serviceId
        ? this.prisma.onsiteService.findFirst({
            where: { id: input.serviceId, shopId: subject.shopId },
          })
        : Promise.resolve(null),
      input.staffId
        ? this.prisma.onsiteStaff.findFirst({
            where: { id: input.staffId, shopId: subject.shopId },
          })
        : Promise.resolve(null),
    ]);
    if (!trade.travelFeeEnabled) {
      return {
        distanceMeters: 0,
        kilometers: 0,
        source: 'SKIPPED',
        ruleHit: '店铺已关闭车费',
        feeCents: 0,
        note: '该店铺不收取车费',
      };
    }
    // 技师自定车费优先：他最清楚自己怎么过去
    if (staff?.carFeeEnabled && centsOf(staff.carFee) > 0) {
      return {
        distanceMeters: 0,
        kilometers: 0,
        source: 'STAFF_FEE',
        ruleHit: `技师自定车费`,
        feeCents: centsOf(staff.carFee),
        note: `${staff.name} 设置了固定上门车费`,
      };
    }
    if (service && service.travelFeeMode === 'CUSTOM') {
      return {
        distanceMeters: 0,
        kilometers: 0,
        source: 'SERVICE_FIXED',
        ruleHit: `服务「${service.title}」固定车费`,
        feeCents: centsOf(service.customTravelFee),
        note: '该服务按固定金额收取车费，不按里程',
      };
    }
    const usable = coordinatesUsable(from.lng, from.lat, to.lng, to.lat);
    const mapKey = await this.miniApp.mapKey(subject);
    const driving = usable
      ? await this.drivingKilometers(mapKey, from, to)
      : null;
    const straight = usable
      ? straightKilometers(from.lng, from.lat, to.lng, to.lat)
      : 0;
    const kilometers = driving ?? straight;
    const source =
      driving !== null ? 'DRIVING' : usable ? 'STRAIGHT' : 'FALLBACK';
    const { rule, note } = await this.ruleFor(
      subject.shopId,
      input.cityId || 0,
    );
    if (!rule || !usable) {
      const fallback = Math.max(0, trade.travelFeeFallbackCents);
      return {
        distanceMeters: Math.round(straight * 1000),
        kilometers: straight,
        source: 'FALLBACK',
        ruleHit: note,
        feeCents: fallback,
        note: usable
          ? '未配置车费规则，按店铺兜底金额计车费'
          : '起点或终点缺少经纬度，按兜底金额计车费（请在地址里选点）',
      };
    }
    const computed = computeTravelFee(kilometers, rule);
    return {
      distanceMeters: Math.round(kilometers * 1000),
      kilometers,
      source,
      ruleHit: `${note}｜${computed.formula}`,
      feeCents: computed.feeCents,
      note:
        source === 'STRAIGHT'
          ? mapKey
            ? '驾车路径接口未返回结果，按直线距离计车费'
            : '未配置腾讯地图 key，按直线距离计车费（在「微信凭据」里填 mapKey 可改用驾车距离）'
          : '',
    };
  }
}
