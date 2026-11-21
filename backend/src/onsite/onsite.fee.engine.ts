/**
 * 车费引擎（纯函数）。
 *
 * 参考源码 `service_car_price` 同时有 `distance_free`（免费公里）与 `start_distance`
 * （起步价内含公里），两者叠加语义含糊。这里定死一条可测口径：
 *
 *   实际里程 + 虚拟加成 ≤ 免费里程        → 不收车费（免费上门）
 *   否则 计费里程 = max(0, 实际里程 + 虚拟加成 − 免费里程 − 起步内含里程)
 *        车费 = max(起步价 + 计费里程 × 每公里单价, 最低车费)
 *
 * 全程用「分」与「百分之一公里」整数运算，避免出现 0.1 + 0.2 那类误差进订单。
 */

export type FeeRule = {
  /** 免费里程（公里） */
  freeKilometers: number;
  /** 起步价（分） */
  startFeeCents: number;
  /** 起步价内含里程（公里） */
  startKilometers: number;
  /** 超出后每公里单价（分） */
  pricePerKilometerCents: number;
  /** 虚拟里程加成（公里）：把实际里程人为抬高 */
  virtualExtraKilometers: number;
  /** 最低车费（分） */
  minFeeCents: number;
};

export type FeeResult = {
  feeCents: number;
  /** 计费里程（公里，两位小数） */
  billedKilometers: number;
  formula: string;
};

const round2 = (value: number) =>
  Number((Math.round(value * 100) / 100).toFixed(2));

export function computeTravelFee(kilometers: number, rule: FeeRule): FeeResult {
  const total =
    Math.max(0, Number(kilometers) || 0) +
    Math.max(0, rule.virtualExtraKilometers);
  const free = Math.max(0, rule.freeKilometers);
  if (total <= free) {
    return {
      feeCents: 0,
      billedKilometers: 0,
      formula: `${round2(total)}km ≤ 免费 ${round2(free)}km，不收车费`,
    };
  }
  const billed = Math.max(0, total - free - Math.max(0, rule.startKilometers));
  const raw =
    Math.max(0, rule.startFeeCents) +
    Math.round(billed * Math.max(0, rule.pricePerKilometerCents));
  const feeCents = Math.max(raw, Math.max(0, rule.minFeeCents));
  return {
    feeCents,
    billedKilometers: round2(billed),
    formula: `起步 ${round2(rule.startKilometers)}km 内 ${Math.round(
      rule.startFeeCents,
    )} 分 + 计费 ${round2(billed)}km × ${Math.round(
      rule.pricePerKilometerCents,
    )} 分/km${
      feeCents > raw
        ? `（抬到最低车费 ${Math.round(rule.minFeeCents)} 分）`
        : ''
    }`,
  };
}

const EARTH_RADIUS_METERS = 6_371_000;

/** 直线距离（Haversine）：地图配额用完或未配 key 时的降级路径。 */
export function straightKilometers(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
  return round2(meters / 1000);
}

export const coordinatesUsable = (
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
) =>
  [fromLng, fromLat, toLng, toLat].every(
    (value) => Number.isFinite(value) && Math.abs(value) > 0.000001,
  );
