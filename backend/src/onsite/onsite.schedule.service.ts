import {
  type OnsiteScheduleDaysResult,
  type OnsiteTimelineResult,
  type OnsiteTimelineRow,
  type OnsiteSlot,
} from '@enterprise/contracts';
import { text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import {
  buildTimelineSlots,
  canBookAt,
  type BuildTimelineInput,
  type Interval,
} from './onsite.schedule.engine';
import { dayKey, parseDay, startOfDay } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';

/**
 * 会占住档期的订单状态。
 *
 * 与参考源码不同的一点：那边「未支付不占位」（`pay_type not in (-1,7)`），
 * 结果是两个人能在同一个 15 分钟窗口里抢走同一档，谁先付款谁得。
 * 上门服务的档期是稀缺资源（技师那段时间啥也干不了），所以这里让待支付也占位，
 * 由超时取消任务释放——宁可短暂占档，也不要双订纠纷。
 */
const OCCUPYING_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_SITE',
  'SERVING',
  'COMPLETED',
  'SIGNED',
  'REVIEWED',
  'REFUND_PENDING',
];

const CACHE_TTL_MS = 30_000;
const MAX_STAFF_PER_TIMELINE = 40;

type StaffLike = {
  id: number;
  name: string;
  avatar: string;
  levelId: number;
  serviceStartAt: string;
  serviceEndAt: string;
  crossDay: boolean;
  dailyOrderLimit: number;
  rating: unknown;
  status: string;
};

/**
 * 排期服务：把「哪几档能约」这一件事只在这里算一次。
 * 店主派单看板、C 端选时间、技师改自己的档，全部走 `timelineFor`，
 * 参数（时间片粒度、缓冲、可约天数、提前量）只从店铺 tradeJson 取。
 */
export class OnsiteScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  private async occupancy(
    shopId: number,
    staffIds: number[],
    from: Date,
    to: Date,
  ): Promise<Map<number, Interval[]>> {
    const orders = staffIds.length
      ? await this.prisma.onsiteOrder.findMany({
          where: {
            shopId,
            staffId: { in: staffIds },
            status: { in: OCCUPYING_STATUSES },
            startAt: { lt: to },
            endAt: { gt: from },
          },
          select: { id: true, staffId: true, startAt: true, endAt: true },
        })
      : [];
    const map = new Map<number, Interval[]>();
    for (const order of orders) {
      const bucket = map.get(order.staffId) ?? [];
      bucket.push({
        id: order.id,
        startAt: order.startAt.getTime(),
        endAt: Math.max(
          order.endAt.getTime(),
          order.startAt.getTime() + 60_000,
        ),
      });
      map.set(order.staffId, bucket);
    }
    return map;
  }

  private async rests(
    shopId: number,
    staffIds: number[],
    from: Date,
    to: Date,
  ): Promise<Map<number, Interval[]>> {
    const rows = staffIds.length
      ? await this.prisma.onsiteStaffRestPeriod.findMany({
          where: {
            shopId,
            staffId: { in: staffIds },
            startAt: { lt: to },
            endAt: { gt: from },
          },
          select: { id: true, staffId: true, startAt: true, endAt: true },
        })
      : [];
    const map = new Map<number, Interval[]>();
    for (const row of rows) {
      const bucket = map.get(row.staffId) ?? [];
      bucket.push({
        id: 0,
        startAt: row.startAt.getTime(),
        endAt: row.endAt.getTime(),
      });
      map.set(row.staffId, bucket);
    }
    return map;
  }

  /** 当日订单数（技师每日接单上限判定）。 */
  private async dayCounts(
    shopId: number,
    staffIds: number[],
    dayStart: Date,
  ): Promise<Map<number, number>> {
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const map = new Map<number, number>();
    if (!staffIds.length) return map;
    const grouped = await this.prisma.onsiteOrder.groupBy({
      by: ['staffId'],
      where: {
        shopId,
        staffId: { in: staffIds },
        startAt: { gte: dayStart, lt: nextDay },
        status: { in: OCCUPYING_STATUSES },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      map.set(row.staffId, (map.get(row.staffId) ?? 0) + row._count._all);
    }
    return map;
  }

  /**
   * 计算某店某天（可含多技师）的时间轴。
   * `viewer=STAFF` 时不判过期、不加缓冲（技师要能看到并补录已过去的档）。
   */
  async timelineFor(input: {
    shopId: number;
    day?: string;
    staffId?: number;
    serviceId?: number;
    viewer?: 'CUSTOMER' | 'STAFF';
    /** 免会话场景直接传参，避免再查一次店铺 */
    trade?: Awaited<ReturnType<OnsiteShopService['tradeById']>>;
  }): Promise<OnsiteTimelineResult> {
    const trade = input.trade ?? (await this.shops.tradeById(input.shopId));
    const today = startOfDay(new Date());
    const requested = input.day ? parseDay(input.day) : today;
    if (!requested) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '日期格式需为 YYYY-MM-DD，例如 2026-11-20',
      );
    }
    const day = startOfDay(requested);
    const dayText = dayKey(day);
    const maxDay = new Date(
      today.getTime() + Math.max(0, trade.maxDays - 1) * 24 * 60 * 60 * 1000,
    );
    if (day.getTime() > maxDay.getTime()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `最多只能约到 ${dayKey(maxDay)}（店铺设置的可约天数 ${trade.maxDays} 天）`,
      );
    }
    const service = input.serviceId
      ? await this.prisma.onsiteService.findFirst({
          where: { id: input.serviceId, shopId: input.shopId },
          select: { id: true, title: true, durationMinutes: true },
        })
      : null;
    if (input.serviceId && !service) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在');
    }
    const duration = service?.durationMinutes ?? 0;

    // 服务如果配置了「只有部分技师可做」，按差异价表收敛候选；没配就是全员可服务
    let candidateIds: number[] = [];
    if (input.staffId) {
      candidateIds = [input.staffId];
    } else if (service) {
      const priced = await this.prisma.onsiteServiceStaffPrice.findMany({
        where: { shopId: input.shopId, serviceId: service.id },
        select: { staffId: true },
      });
      candidateIds = priced.map((row) => row.staffId);
    }
    const staffRows: StaffLike[] = await this.prisma.onsiteStaff.findMany({
      where: {
        shopId: input.shopId,
        status: 'ONLINE',
        ...(candidateIds.length ? { id: { in: candidateIds } } : {}),
      },
      orderBy: [{ recommendTop: 'desc' }, { sortTop: 'desc' }, { id: 'asc' }],
      take: MAX_STAFF_PER_TIMELINE,
    });
    const staffIds = staffRows.map((row) => row.id);
    const from = new Date(day.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(day.getTime() + 48 * 60 * 60 * 1000);
    const [orderMap, restMap, countMap, levels] = await Promise.all([
      this.occupancy(input.shopId, staffIds, from, to),
      this.rests(input.shopId, staffIds, from, to),
      this.dayCounts(input.shopId, staffIds, day),
      this.prisma.onsiteStaffLevel.findMany({
        where: { shopId: input.shopId },
        select: { id: true, name: true },
      }),
    ]);
    const levelName = new Map(levels.map((level) => [level.id, level.name]));

    const timelines: OnsiteTimelineRow[] = staffRows.map((row) => {
      const buildInput: BuildTimelineInput = {
        dayStartMs: day.getTime(),
        nowMs: Date.now(),
        params: {
          timeUnitMinutes: trade.timeUnitMinutes,
          bufferMinutes: trade.bufferMinutes,
          bookingLeadMinutes: trade.bookingLeadMinutes,
          allowCrossDay: trade.allowCrossDay,
        },
        serviceStartAt: row.serviceStartAt,
        serviceEndAt: row.serviceEndAt,
        staffCrossDay: row.crossDay,
        durationMinutes: duration,
        orders: orderMap.get(row.id) ?? [],
        rests: restMap.get(row.id) ?? [],
        dailyOrderLimit: row.dailyOrderLimit,
        dayOrderCount: countMap.get(row.id) ?? 0,
        viewer: input.viewer ?? 'CUSTOMER',
      };
      const slots = this.cachedSlots(
        input.shopId,
        row.id,
        dayText,
        trade.timeUnitMinutes,
        () => buildTimelineSlots(buildInput),
      );
      return {
        staffId: row.id,
        staffName: row.name,
        avatar: row.avatar,
        levelName: levelName.get(row.levelId) ?? '',
        rating: Number(row.rating ?? 5),
        serviceStartAt: row.serviceStartAt,
        serviceEndAt: row.serviceEndAt,
        availableCount: slots.filter((slot) => slot.available).length,
        slots,
      };
    });

    const note = !timelines.length
      ? service
        ? `没有可服务「${service.title}」的在岗服务人员，请先在「服务人员」里给他配上这个服务`
        : '还没有在岗的服务人员，请先到「服务人员」添加并设为在岗'
      : '';
    return {
      day: dayText,
      timeUnitMinutes: trade.timeUnitMinutes,
      durationMinutes: duration,
      bufferMinutes: trade.bufferMinutes,
      timelines,
      note,
    };
  }

  /**
   * 时间轴缓存（对应参考源码 coach_time）：只缓存「与当前时刻无关的部分」是不成立的，
   * 因为过期判定依赖 now。所以这里做的是**短 TTL 复读缓存**，用来扛住看板反复切日期，
   * 一旦有订单变化由 `invalidate` 主动清掉。
   */
  private cachedSlots(
    shopId: number,
    staffId: number,
    day: string,
    timeUnitMinutes: number,
    compute: () => OnsiteSlot[],
  ): OnsiteSlot[] {
    const key = `${shopId}:${staffId}:${day}:${timeUnitMinutes}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.slots;
    const slots = compute();
    this.cache.set(key, { slots, at: Date.now() });
    void this.persist(shopId, staffId, day, timeUnitMinutes, slots);
    return slots;
  }

  private readonly cache = new Map<
    string,
    { slots: OnsiteSlot[]; at: number }
  >();

  private async persist(
    shopId: number,
    staffId: number,
    day: string,
    timeUnitMinutes: number,
    slots: OnsiteSlot[],
  ) {
    // 落一份到库里：排期看板的「按周回看」不重算历史档，也便于排查某天人肉核对
    await this.prisma.onsiteStaffScheduleCache
      .upsert({
        where: {
          staffId_day_timeUnitMinutes: { staffId, day, timeUnitMinutes },
        },
        create: { shopId, staffId, day, timeUnitMinutes, slots },
        update: { slots, generatedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** 订单、休息段、技师时段变化后调用：清掉内存缓存，下次重算。 */
  invalidate(staffId: number) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.split(':')[1] === String(staffId)) this.cache.delete(key);
    }
  }

  invalidateShop(shopId: number) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.split(':')[0] === String(shopId)) this.cache.delete(key);
    }
  }

  async timeline(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<OnsiteTimelineResult> {
    const shop = await this.shops.requireShop(user, shopId);
    return this.timelineFor({
      shopId: shop.shopId,
      day: text(query.day),
      staffId: Number(query.staffId) || undefined,
      serviceId: Number(query.serviceId) || undefined,
      trade: shop.trade,
    });
  }

  /** 未来 N 天的可约概览：C 端日期条与店主看板头部用。 */
  async days(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<OnsiteScheduleDaysResult> {
    const shop = await this.shops.requireShop(user, shopId);
    const trade = shop.trade;
    const staffId = Number(query.staffId) || undefined;
    const serviceId = Number(query.serviceId) || undefined;
    const days: OnsiteScheduleDaysResult['days'] = [];
    for (let offset = 0; offset < trade.maxDays; offset += 1) {
      const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      const result = await this.timelineFor({
        shopId: shop.shopId,
        day: dayKey(date),
        staffId,
        serviceId,
        trade,
      });
      days.push({
        day: result.day,
        availableCount: result.timelines.reduce(
          (sum, row) => sum + row.availableCount,
          0,
        ),
        totalSlots: result.timelines.reduce(
          (sum, row) => sum + row.slots.length,
          0,
        ),
      });
    }
    return { days, timeUnitMinutes: trade.timeUnitMinutes };
  }

  /** C 端日期条：按店铺码取未来可约概览（免会话）。 */
  async publicDays(
    shop: Awaited<ReturnType<OnsiteShopService['findByCode']>> & object,
    options: { staffId?: number; serviceId?: number },
  ): Promise<OnsiteScheduleDaysResult> {
    const trade = shop.trade;
    const days: OnsiteScheduleDaysResult['days'] = [];
    for (let offset = 0; offset < trade.maxDays; offset += 1) {
      const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      const result = await this.timelineFor({
        shopId: shop.shopId,
        day: dayKey(date),
        staffId: options.staffId,
        serviceId: options.serviceId,
        viewer: 'CUSTOMER',
        trade,
      });
      days.push({
        day: result.day,
        availableCount: result.timelines.reduce(
          (sum, row) => sum + row.availableCount,
          0,
        ),
        totalSlots: result.timelines.reduce(
          (sum, row) => sum + row.slots.length,
          0,
        ),
      });
    }
    return { days, timeUnitMinutes: trade.timeUnitMinutes };
  }

  /** 下单前的二次校验：不能信前端传来的「这档可约」。 */
  async assertBookable(input: {
    shopId: number;
    staffId: number;
    startAt: Date;
    durationMinutes: number;
    trade: Awaited<ReturnType<OnsiteShopService['tradeById']>>;
  }) {
    const day = startOfDay(input.startAt);
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: input.staffId, shopId: input.shopId },
    });
    if (!staff)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    if (staff.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${staff.name}」当前不在岗，请换一位或先让店主给他排班`,
      );
    }
    const from = new Date(day.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(day.getTime() + 48 * 60 * 60 * 1000);
    const [orderMap, restMap, countMap] = await Promise.all([
      this.occupancy(input.shopId, [input.staffId], from, to),
      this.rests(input.shopId, [input.staffId], from, to),
      this.dayCounts(input.shopId, [input.staffId], day),
    ]);
    const result = canBookAt(
      {
        dayStartMs: day.getTime(),
        nowMs: Date.now(),
        params: {
          timeUnitMinutes: input.trade.timeUnitMinutes,
          bufferMinutes: input.trade.bufferMinutes,
          bookingLeadMinutes: input.trade.bookingLeadMinutes,
          allowCrossDay: input.trade.allowCrossDay,
        },
        serviceStartAt: staff.serviceStartAt,
        serviceEndAt: staff.serviceEndAt,
        staffCrossDay: staff.crossDay,
        durationMinutes: input.durationMinutes,
        orders: orderMap.get(input.staffId) ?? [],
        rests: restMap.get(input.staffId) ?? [],
        dailyOrderLimit: staff.dailyOrderLimit,
        dayOrderCount: countMap.get(input.staffId) ?? 0,
        viewer: 'CUSTOMER',
      },
      input.startAt.getTime(),
    );
    if (!result.ok) {
      const label = new Date(input.startAt).toLocaleString('zh-CN', {
        hour12: false,
      });
      const reasonText =
        result.reason === 'OCCUPIED'
          ? '该时段已被预约'
          : result.reason === 'REST'
            ? '服务人员这段时间休息'
            : result.reason === 'DAILY_LIMIT'
              ? '服务人员当日接单已达上限'
              : result.reason === 'LEAD_TIME'
                ? `需至少提前 ${input.trade.bookingLeadMinutes} 分钟预约`
                : result.reason === 'EXPIRED'
                  ? '该时段已过'
                  : '超出服务人员可服务时段';
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `${label} ${reasonText}，请重新选择时间`,
      );
    }
    return staff;
  }
}
