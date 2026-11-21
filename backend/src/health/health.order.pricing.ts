import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/** 算价明细（下单时由商品 SKU / 服务价 / 套餐价展开）。 */
export type PriceLine = {
  /** 商品时是 goodsId；服务/套餐时是对应业务 id，用于券的指定范围命中。 */
  refId: number;
  priceCents: number;
  quantity: number;
};

export type PriceCoupon = {
  kind: string;
  valueCents: number;
  discountPercent: number;
  minAmountCents: number;
  goodsIds: number[];
  bizTypes: string[];
};

export type PriceQuoteInput = {
  bizType: string;
  lines: PriceLine[];
  /** 会员折扣的「实付百分比」：100 表示无折扣。 */
  memberDiscountPercent: number;
  coupon?: PriceCoupon | null;
  points?: {
    enabled: boolean;
    /** 本次使用的积分数（顾客勾选）。 */
    usePoints: number;
    /** 顾客可用积分余额。 */
    availablePoints: number;
    /** 1 积分抵多少分（店内积分，不与平台积分互通）。 */
    centsPerPoint: number;
    /** 积分抵扣上限占「商品应付」的百分比。 */
    maxPercent: number;
  } | null;
  shipping?: {
    feeCents: number;
    /** 包邮门槛（分），0 表示不包邮。 */
    freeOverCents: number;
  } | null;
};

export type PriceFlow = {
  step: string;
  label: string;
  amountCents: number;
  refLabel: string;
};

export type PriceQuote = {
  goodsCents: number;
  memberDiscountCents: number;
  couponCents: number;
  pointDeductCents: number;
  pointsUsed: number;
  shippingCents: number;
  payCents: number;
  flows: PriceFlow[];
};

const round = (value: number): number =>
  Math.round(Number.isFinite(value) ? value : 0);

/**
 * 统一算价引擎（唯一实现点）。
 *
 * 顺序：明细合计 → 会员折扣 → 券（满减/折扣，作用域命中）→ 积分抵扣（比例与余额双上限）
 * → 运费（包邮门槛）→ 实付。每一步都落 `health_order_price_flows` 快照，
 * 之后改配置不影响历史单。
 */
export function quoteOrder(input: PriceQuoteInput): PriceQuote {
  const goodsCents = round(
    input.lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0),
  );
  if (goodsCents <= 0 && input.bizType !== 'RECHARGE') {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '订单金额必须大于 0');
  }
  const flows: PriceFlow[] = [
    {
      step: 'GOODS',
      label: '商品/服务合计',
      amountCents: goodsCents,
      refLabel: '',
    },
  ];

  const memberPercent = Math.min(
    100,
    Math.max(0, input.memberDiscountPercent || 100),
  );
  const memberDiscountCents =
    memberPercent < 100 ? round((goodsCents * (100 - memberPercent)) / 100) : 0;
  const afterMember = Math.max(0, goodsCents - memberDiscountCents);
  if (memberDiscountCents > 0) {
    flows.push({
      step: 'MEMBER',
      label: `会员折扣 ${memberPercent}%`,
      amountCents: -memberDiscountCents,
      refLabel: '',
    });
  }

  let couponCents = 0;
  if (input.coupon) {
    couponCents = computeCoupon(
      input.coupon,
      input.bizType,
      input.lines,
      goodsCents,
      afterMember,
    );
    if (couponCents > 0) {
      flows.push({
        step: 'COUPON',
        label: '优惠券',
        amountCents: -couponCents,
        refLabel: input.coupon.kind,
      });
    }
  }
  const afterCoupon = Math.max(0, afterMember - couponCents);

  let pointDeductCents = 0;
  let pointsUsed = 0;
  if (input.points?.enabled && input.points.usePoints > 0 && afterCoupon > 0) {
    const maxPercent = Math.min(100, Math.max(0, input.points.maxPercent));
    const capCents = round((afterCoupon * maxPercent) / 100);
    const usablePoints = Math.min(
      input.points.usePoints,
      input.points.availablePoints,
    );
    const wantedCents = round(
      usablePoints * Math.max(0, input.points.centsPerPoint),
    );
    pointDeductCents = Math.min(capCents, wantedCents, afterCoupon);
    pointsUsed =
      input.points.centsPerPoint > 0
        ? Math.ceil(pointDeductCents / input.points.centsPerPoint)
        : 0;
    if (pointDeductCents > 0) {
      flows.push({
        step: 'POINT',
        label: `积分抵扣 ${pointsUsed} 分`,
        amountCents: -pointDeductCents,
        refLabel: '',
      });
    }
  }
  const afterPoints = Math.max(0, afterCoupon - pointDeductCents);

  let shippingCents = 0;
  if (input.shipping && input.bizType === 'GOODS') {
    const free =
      input.shipping.freeOverCents > 0 &&
      afterPoints >= input.shipping.freeOverCents;
    shippingCents = free ? 0 : Math.max(0, input.shipping.feeCents);
    if (shippingCents > 0) {
      flows.push({
        step: 'SHIPPING',
        label: '运费',
        amountCents: shippingCents,
        refLabel: '',
      });
    }
  }

  const payCents = Math.max(0, afterPoints + shippingCents);
  flows.push({
    step: 'PAY',
    label: '应付合计',
    amountCents: payCents,
    refLabel: '',
  });
  return {
    goodsCents,
    memberDiscountCents,
    couponCents,
    pointDeductCents,
    pointsUsed,
    shippingCents,
    payCents,
    flows,
  };
}

/**
 * 券的作用域命中：
 * - `bizTypes` 为空表示全部业务；
 * - `goodsIds` 为空表示全店商品；非空时只有命中商品金额参与优惠；
 * - 门槛按「会员折扣后」的命中金额判断（与主流电商口径一致）。
 */
function computeCoupon(
  coupon: PriceCoupon,
  bizType: string,
  lines: PriceLine[],
  goodsCents: number,
  afterMemberCents: number,
): number {
  if (coupon.bizTypes.length && !coupon.bizTypes.includes(bizType)) return 0;
  const scoped =
    coupon.goodsIds.length > 0
      ? goodsCents === 0
        ? 0
        : round(
            (afterMemberCents *
              lines
                .filter((line) => coupon.goodsIds.includes(line.refId))
                .reduce(
                  (sum, line) => sum + line.priceCents * line.quantity,
                  0,
                )) /
              goodsCents,
          )
      : afterMemberCents;
  if (scoped <= 0) return 0;
  if (scoped < coupon.minAmountCents) return 0;
  switch (coupon.kind) {
    case 'DISCOUNT': {
      const payPercent = Math.min(
        100,
        Math.max(1, coupon.discountPercent || 100),
      );
      return Math.min(scoped, round((scoped * (100 - payPercent)) / 100));
    }
    case 'FULL_REDUCE':
    case 'SPECIFIED':
    case 'CASH':
    default:
      return Math.min(scoped, Math.max(0, coupon.valueCents));
  }
}
