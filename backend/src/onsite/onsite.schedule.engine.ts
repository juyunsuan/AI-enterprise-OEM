/**
 * 排期时间片引擎（纯函数，不碰数据库）。
 *
 * 算法口径来自参考源码 `ApiRest::getTimeData / getTimeDataV2`，但把它散在控制器里的
 * 判断收敛成一个可测函数——这是上门服务最容易做错的一块：跨零点夜班、前后缓冲、
 * 服务时长连续占片、每日接单上限、提前预约时长五件事交织在一起，
 * 端上、店主派单、技师自看三处必须得到同一个答案，所以只允许这一份实现。
 */
import type { OnsiteSlot } from '@enterprise/contracts';
import { clockOfMinutes, minutesOfClock } from './onsite.money';

export type ScheduleParams = {
  /** 时间片粒度（分钟） */
  timeUnitMinutes: number;
  /** 已订区间两侧的外扩缓冲（分钟）；技师本人视角不生效 */
  bufferMinutes: number;
  /** 顾客下单至少要提前多少分钟 */
  bookingLeadMinutes: number;
  /** 店铺级允许跨零点（技师个人开关优先，见 resolveWindow） */
  allowCrossDay: boolean;
};

export type Interval = { id: number; startAt: number; endAt: number };

export type BuildTimelineInput = {
  /** 本地当日 00:00 的毫秒时间戳 */
  dayStartMs: number;
  nowMs: number;
  params: ScheduleParams;
  /** 技师可服务时段（HH:mm） */
  serviceStartAt: string;
  serviceEndAt: string;
  staffCrossDay: boolean;
  /** 需要容纳的服务时长；0 表示只看单片是否空闲 */
  durationMinutes: number;
  /** 该技师当日已占区间（未支付/已取消的订单不要传进来） */
  orders: Interval[];
  /** 休息与请假区间 */
  rests: Interval[];
  dailyOrderLimit: number;
  dayOrderCount: number;
  viewer: 'CUSTOMER' | 'STAFF';
};

export const DAY_MINUTES = 1440;

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

/** 技师时段的分钟区间：end <= start 且允许跨天时按 +1440 处理（夜班）。 */
export function resolveWindow(
  serviceStartAt: string,
  serviceEndAt: string,
  staffCrossDay: boolean,
  allowCrossDay: boolean,
) {
  const start = minutesOfClock(serviceStartAt);
  let end = minutesOfClock(serviceEndAt);
  if (start < 0 || end < 0) return null;
  if (end <= start) {
    if (!(staffCrossDay || allowCrossDay)) return null;
    end += DAY_MINUTES;
  }
  return { start, end };
}

export function buildTimelineSlots(input: BuildTimelineInput): OnsiteSlot[] {
  const unit = Math.max(5, Math.round(input.params.timeUnitMinutes) || 30);
  const window = resolveWindow(
    input.serviceStartAt,
    input.serviceEndAt,
    input.staffCrossDay,
    input.params.allowCrossDay,
  );
  if (!window) return [];
  // 技师本人要能看到已经过去的时段（改期、补录），所以不给缓冲也不判过期
  const buffer =
    input.viewer === 'STAFF'
      ? 0
      : Math.max(0, Math.round(input.params.bufferMinutes));
  const lead =
    input.viewer === 'STAFF' ? 0 : Math.max(0, input.params.bookingLeadMinutes);
  const duration = Math.max(0, Math.round(input.durationMinutes));
  const needed = duration > 0 ? Math.max(1, Math.ceil(duration / unit)) : 1;

  type Draft = {
    startAt: number;
    endAt: number;
    reason: OnsiteSlot['reason'];
  };
  const drafts: Draft[] = [];
  for (let minute = window.start; minute + unit <= window.end; minute += unit) {
    const startAt = input.dayStartMs + minute * 60_000;
    const endAt = startAt + unit * 60_000;
    let reason: OnsiteSlot['reason'] = 'AVAILABLE';
    if (endAt <= input.nowMs) {
      reason = 'EXPIRED';
    } else if (startAt - input.nowMs < lead * 60_000) {
      reason = 'LEAD_TIME';
    } else if (
      input.orders.some((order) =>
        overlaps(
          startAt,
          endAt,
          order.startAt - buffer * 60_000,
          order.endAt + buffer * 60_000,
        ),
      )
    ) {
      reason = 'OCCUPIED';
    } else if (
      input.rests.some((rest) =>
        overlaps(startAt, endAt, rest.startAt, rest.endAt),
      )
    ) {
      reason = 'REST';
    } else if (
      input.dailyOrderLimit > 0 &&
      input.dayOrderCount >= input.dailyOrderLimit
    ) {
      reason = 'DAILY_LIMIT';
    }
    drafts.push({ startAt, endAt, reason });
  }

  return drafts.map<OnsiteSlot>((draft, index) => {
    // 连续占片：从本片起需要的每一片都必须可约，且落在同一时段窗口内
    let fits = true;
    for (let step = 0; step < needed; step += 1) {
      const next = drafts[index + step];
      if (!next || next.reason !== 'AVAILABLE') {
        fits = false;
        break;
      }
    }
    return {
      startAt: draft.startAt,
      endAt: draft.endAt,
      label: `${clockOfMinutes(Math.floor((draft.startAt - input.dayStartMs) / 60_000))}-${clockOfMinutes(
        Math.floor((draft.endAt - input.dayStartMs) / 60_000),
      )}`,
      available: draft.reason === 'AVAILABLE' && fits,
      reason: draft.reason,
      fitsDuration: fits,
      orderId:
        draft.reason === 'OCCUPIED'
          ? (input.orders.find((order) =>
              overlaps(
                draft.startAt,
                draft.endAt,
                order.startAt - buffer * 60_000,
                order.endAt + buffer * 60_000,
              ),
            )?.id ?? 0)
          : 0,
    };
  });
}

/**
 * 能否按「指定开始时间 + 时长」下单：服务端下单前的最后一道闸。
 * 前端时间片只是展示，真正的占用判定必须在这里再算一次（防止两人抢同一档）。
 */
export function canBookAt(input: BuildTimelineInput, startAt: number) {
  const slots = buildTimelineSlots(input);
  const matched = slots.filter((slot) => slot.startAt === startAt);
  if (!matched.length) {
    return { ok: false as const, reason: 'OUT_OF_SERVICE' as const };
  }
  const slot = matched[0];
  return {
    ok: slot.available,
    reason: slot.reason,
  };
}
