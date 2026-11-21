import type { OnsiteSlot } from '@enterprise/contracts';
import {
  buildTimelineSlots,
  canBookAt,
  resolveWindow,
  type BuildTimelineInput,
} from './onsite.schedule.engine';

const DAY = 24 * 60 * 60 * 1000;
/** 固定基准：2026-03-01 本地 00:00，避免用例随真实时间漂移。 */
const dayStart = new Date(2026, 2, 1).setHours(0, 0, 0, 0);
const now = dayStart + 8 * 60 * 60 * 1000;

const at = (minutes: number) => dayStart + minutes * 60_000;

const base: BuildTimelineInput = {
  dayStartMs: dayStart,
  nowMs: now,
  params: {
    timeUnitMinutes: 30,
    bufferMinutes: 15,
    bookingLeadMinutes: 30,
    allowCrossDay: false,
  },
  serviceStartAt: '09:00',
  serviceEndAt: '12:00',
  staffCrossDay: false,
  durationMinutes: 0,
  orders: [],
  rests: [],
  dailyOrderLimit: 0,
  dayOrderCount: 0,
  viewer: 'CUSTOMER',
};

const reasonOf = (slots: OnsiteSlot[], clock: string) =>
  slots.find((slot) => slot.label.startsWith(clock))?.reason ?? 'MISSING';

describe('onsite/排期引擎', () => {
  it('按时间片切出整段可服务窗口，标签是 HH:mm-HH:mm', () => {
    const slots = buildTimelineSlots(base);
    expect(slots).toHaveLength(6);
    expect(slots[0].label).toBe('09:00-09:30');
    expect(slots[5].label).toBe('11:30-12:00');
    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it('订单占用会连带前后缓冲一起锁住（参考源码 time_interval 语义）', () => {
    const slots = buildTimelineSlots({
      ...base,
      orders: [{ id: 77, startAt: at(10 * 60), endAt: at(10 * 60 + 30) }],
    });
    // 10:00-10:30 本身被占
    expect(reasonOf(slots, '10:00')).toBe('OCCUPIED');
    // 09:30-10:00 与缓冲区间 [09:45,10:45] 相交 → 也被占，并带上订单号便于界面说明原因
    const earlier = slots.find((slot) => slot.label.startsWith('09:30'));
    expect(earlier?.reason).toBe('OCCUPIED');
    expect(earlier?.orderId).toBe(77);
  });

  it('技师本人视角不给缓冲、不判过期，能看到已过去的时段', () => {
    const slots = buildTimelineSlots({
      ...base,
      viewer: 'STAFF',
      orders: [{ id: 1, startAt: at(8 * 60 + 45), endAt: at(9 * 60 + 15) }],
    });
    // 8:45 的订单只压住 09:00 一片（没有 15 分钟缓冲外扩）
    expect(reasonOf(slots, '09:00')).toBe('OCCUPIED');
    expect(reasonOf(slots, '09:30')).toBe('AVAILABLE');
  });

  it('跨零点夜班：end < start 且开启跨天时窗口延长到次日', () => {
    const slots = buildTimelineSlots({
      ...base,
      serviceStartAt: '22:00',
      serviceEndAt: '01:00',
      staffCrossDay: true,
    });
    expect(slots).toHaveLength(6);
    expect(slots[0].label).toBe('22:00-22:30');
    // 次日 00:00 起的时间戳仍排在同一天的时间轴上（dayStart + 分钟数 > 24h）
    expect(slots[4].startAt).toBe(dayStart + DAY);
    expect(slots[4].label).toBe('00:00-00:30');
  });

  it('没开跨天却配了倒挂时段 → 不给时间片，界面据此提示配置有误', () => {
    expect(resolveWindow('22:00', '01:00', false, false)).toBeNull();
    expect(
      buildTimelineSlots({
        ...base,
        serviceStartAt: '22:00',
        serviceEndAt: '01:00',
      }),
    ).toEqual([]);
  });

  it('时长大于单片时要连续占片，尾巴放不下就整片不可选', () => {
    const slots = buildTimelineSlots({ ...base, durationMinutes: 60 });
    // 09:00 起每片都要能再塞下 11:00-12:00；最后一片 11:30 没有后继，放不下 60 分钟
    expect(
      slots.filter((slot) => slot.available).map((slot) => slot.label),
    ).toEqual([
      '09:00-09:30',
      '09:30-10:00',
      '10:00-10:30',
      '10:30-11:00',
      '11:00-11:30',
    ]);
    expect(reasonOf(slots, '11:30')).toBe('AVAILABLE');
    expect(
      slots.find((slot) => slot.label.startsWith('11:30'))?.fitsDuration,
    ).toBe(false);
  });

  it('中间被占一片时，跨越它的长时段全部不可选', () => {
    const slots = buildTimelineSlots({
      ...base,
      durationMinutes: 60,
      orders: [{ id: 9, startAt: at(10 * 60), endAt: at(10 * 60 + 30) }],
    });
    // 订单 10:00-10:30 加 15 分钟缓冲 → 锁住 [09:45, 10:45]，于是 09:30 / 10:00 / 10:30 三片不可用，
    // 能塞下 60 分钟的只剩 11:00 起
    expect(
      slots.filter((slot) => slot.available).map((slot) => slot.label),
    ).toEqual(['11:00-11:30']);
  });

  it('休息段、每日接单上限、最少提前预约各自给出独立原因', () => {
    expect(
      reasonOf(
        buildTimelineSlots({
          ...base,
          rests: [{ id: 0, startAt: at(9 * 60 + 30), endAt: at(10 * 60) }],
        }),
        '09:30',
      ),
    ).toBe('REST');
    expect(
      reasonOf(
        buildTimelineSlots({ ...base, dailyOrderLimit: 2, dayOrderCount: 2 }),
        '09:00',
      ),
    ).toBe('DAILY_LIMIT');
    // 现在 08:00，08:30 之前的片不满足 30 分钟提前量；把窗口提前到 07:00 才能看到 LEAD_TIME
    const lead = buildTimelineSlots({
      ...base,
      serviceStartAt: '07:00',
      serviceEndAt: '09:30',
      nowMs: dayStart + 8 * 60 * 60 * 1000,
    });
    // 07:30 的片已在过去 → EXPIRED；08:00 的片没过期但距现在不足 30 分钟提前量 → LEAD_TIME
    expect(reasonOf(lead, '07:30')).toBe('EXPIRED');
    expect(reasonOf(lead, '08:00')).toBe('LEAD_TIME');
    expect(reasonOf(lead, '08:30')).toBe('AVAILABLE');
  });

  it('下单前的二次校验：窗口外、被占、可约三种结果都给出原因', () => {
    const occupied = {
      ...base,
      orders: [{ id: 3, startAt: at(10 * 60), endAt: at(11 * 60) }],
    };
    expect(canBookAt(base, at(9 * 60))).toEqual({
      ok: true,
      reason: 'AVAILABLE',
    });
    expect(canBookAt(occupied, at(10 * 60)).ok).toBe(false);
    expect(canBookAt(occupied, at(10 * 60)).reason).toBe('OCCUPIED');
    expect(canBookAt(base, at(15 * 60))).toEqual({
      ok: false,
      reason: 'OUT_OF_SERVICE',
    });
  });
});
