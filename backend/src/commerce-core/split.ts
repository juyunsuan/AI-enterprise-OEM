import { allocateCents, clampCents, sumCents } from './money';
import type { CommerceLine } from './types';

/**
 * 拆单：一笔购物按 `splitKey` 分组，各组独立算运费、独立成单。
 *
 * 品牌商城不拆（所有行的 splitKey 相同），多店铺商城平台按商户拆。
 * 优惠与积分是在整单层面判定后分摊到各组的，所以这里唯一的硬约束是
 * 「分摊后的金额之和 == 整单金额」，任何一行都不许自己四舍五入。
 */

export interface SplitGroup {
  key: string;
  lines: CommerceLine[];
  goodsCents: number;
  /** 本组是否需要发货收货：全虚拟的组不占运费。 */
  requiresShipping: boolean;
  quantity: number;
}

export function splitLines(lines: CommerceLine[]): SplitGroup[] {
  const buckets = new Map<string, CommerceLine[]>();
  for (const line of lines) {
    const key = line.splitKey || '';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(line);
    else buckets.set(key, [line]);
  }
  return [...buckets.entries()].map(([key, groupLines]) => ({
    key,
    lines: groupLines,
    goodsCents: sumCents(
      ...groupLines.map((line) => line.unitCents * line.quantity),
    ),
    requiresShipping: groupLines.some((line) => line.requiresShipping),
    quantity: sumCents(...groupLines.map((line) => line.quantity)),
  }));
}

export interface AllocationInput {
  groups: SplitGroup[];
  couponDiscountCents?: number;
  freightCents?: number;
  pointsDiscountCents?: number;
}

export interface GroupAllocation {
  key: string;
  goodsCents: number;
  couponDiscountCents: number;
  freightCents: number;
  pointsDiscountCents: number;
  payCents: number;
}

/**
 * 整单优惠按各组商品金额权重分摊；运费只落在需要配送的组，
 * 按该组商品金额分摊（全虚拟单不产生运费，天然不会分到）。
 *
 * 每组的实付下限夹到 0：券额理论上不超过整单货款，但并发退款与人工改价
 * 可能给出超额入参，宁可少收也不能让子单出现负数金额。
 */
export function allocateGroups(input: AllocationInput): GroupAllocation[] {
  const groups = input.groups;
  if (groups.length === 0) return [];
  const couponShares = allocateCents(
    clampCents(input.couponDiscountCents ?? 0),
    groups.map((group) => group.goodsCents),
  );
  const pointsShares = allocateCents(
    clampCents(input.pointsDiscountCents ?? 0),
    groups.map((group) => group.goodsCents),
  );
  const shippingGroups = groups.filter((group) => group.requiresShipping);
  const shippingWeights = shippingGroups.map((group) => group.goodsCents);
  const freightTotal = clampCents(input.freightCents ?? 0);
  const freightShares =
    freightTotal > 0 ? allocateCents(freightTotal, shippingWeights) : [];
  const freightByKey = new Map<string, number>();
  shippingGroups.forEach((group, index) => {
    freightByKey.set(group.key, freightShares[index] ?? 0);
  });

  return groups.map((group, index) => {
    const couponDiscountCents = couponShares[index] ?? 0;
    const pointsDiscountCents = pointsShares[index] ?? 0;
    const freightCents = freightByKey.get(group.key) ?? 0;
    return {
      key: group.key,
      goodsCents: group.goodsCents,
      couponDiscountCents,
      pointsDiscountCents,
      freightCents,
      payCents: clampCents(
        group.goodsCents -
          couponDiscountCents -
          pointsDiscountCents +
          freightCents,
      ),
    };
  });
}

export interface OrderTotals {
  couponDiscountCents: number;
  freightCents: number;
  pointsDiscountCents: number;
  payCents: number;
}

/**
 * 拆单落库前的对账：分组金额之和必须等于整单口径，差 1 分就返回不一致项。
 * 引擎不抛业务异常，调用方拿非空结果应当拒写并记日志。
 */
export function checkAllocationConservation(
  allocations: GroupAllocation[],
  totals: OrderTotals,
): string {
  const mismatches: string[] = [];
  const compare = (label: string, groupSum: number, orderCents: number) => {
    if (groupSum !== clampCents(orderCents)) {
      mismatches.push(`${label}：分组合计 ${groupSum} != 整单 ${orderCents}`);
    }
  };
  compare(
    '运费',
    sumCents(...allocations.map((a) => a.freightCents)),
    totals.freightCents,
  );
  compare(
    '券抵扣',
    sumCents(...allocations.map((a) => a.couponDiscountCents)),
    totals.couponDiscountCents,
  );
  compare(
    '积分抵扣',
    sumCents(...allocations.map((a) => a.pointsDiscountCents)),
    totals.pointsDiscountCents,
  );
  const paySum = sumCents(...allocations.map((a) => a.payCents));
  const expectedPay =
    sumCents(...allocations.map((a) => a.goodsCents)) -
    totals.couponDiscountCents -
    totals.pointsDiscountCents +
    totals.freightCents;
  if (paySum < Math.max(0, expectedPay)) {
    mismatches.push(
      `实付：分组合计 ${paySum} 小于应付 ${Math.max(0, expectedPay)}`,
    );
  }
  return mismatches.join('；');
}
