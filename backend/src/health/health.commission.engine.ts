import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/** 分账作用域：服务 > 医护 > 机构 > 团队 > 店铺默认。 */
export const COMMISSION_SCOPES = [
  'SERVICE',
  'PRACTITIONER',
  'ORGAN',
  'TEAM',
  'DEFAULT',
] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

export type CommissionRuleLike = {
  scope: string;
  scopeId: number;
  bizTypes: string[];
  organPercent: number;
  practitionerPercent: number;
  promoterPercent: number;
  teamPercent: number;
  shopPercent: number;
};

export type ShareDraft = {
  earnerKind: 'ORGAN' | 'PRACTITIONER' | 'PROMOTER' | 'TEAM' | 'SHOP';
  earnerId: number;
  ratePercent: number;
  shareCents: number;
};

export type SplitInput = {
  baseCents: number;
  rule: CommissionRuleLike;
  organId: number;
  practitionerId: number;
  promoterId: number;
  teamId: number;
};

const round = (value: number): number =>
  Math.round(Number.isFinite(value) ? value : 0);

/** 规则是否适用于该业务类型（空数组 = 全部）。 */
export function ruleMatchesBizType(
  rule: CommissionRuleLike,
  bizType: string,
): boolean {
  return rule.bizTypes.length === 0 || rule.bizTypes.includes(bizType);
}

/**
 * 按作用域优先级取规则：SERVICE > PRACTITIONER > ORGAN > TEAM > DEFAULT。
 *
 * 只返回命中的第一条；调用方负责按 `scopeId` 精确匹配。
 */
export function pickRule(
  rules: CommissionRuleLike[],
  scopeIdOf: Partial<Record<CommissionScope, number>>,
): CommissionRuleLike | null {
  for (const scope of COMMISSION_SCOPES) {
    const scopeId = scopeIdOf[scope] ?? 0;
    if (scope !== 'DEFAULT' && scopeId <= 0) continue;
    const hit = rules.find(
      (rule) =>
        rule.scope === scope &&
        (scope === 'DEFAULT' || rule.scopeId === scopeId),
    );
    if (hit) return hit;
  }
  return null;
}

/**
 * 分账计算：比例来自规则，基数 = 实付金额。
 *
 * 各方比例之和允许小于 100，差额归店铺；大于 100 直接拒绝（不能把订单分穿）。
 * 逐方四舍五入，店铺兜底吸收舍入误差，保证 `Σ shareCents === baseCents`。
 */
export function splitShares(input: SplitInput): ShareDraft[] {
  const base = Math.max(0, round(input.baseCents));
  const { rule } = input;
  const organPercent = Math.min(100, Math.max(0, rule.organPercent));
  const practitionerPercent = Math.min(
    100,
    Math.max(0, rule.practitionerPercent),
  );
  const promoterPercent =
    input.promoterId > 0 ? Math.min(100, Math.max(0, rule.promoterPercent)) : 0;
  const teamPercent =
    input.teamId > 0 ? Math.min(100, Math.max(0, rule.teamPercent)) : 0;
  const sum =
    organPercent + practitionerPercent + promoterPercent + teamPercent;
  if (sum > 100) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '分账比例合计不能超过 100%（机构/医护/推客/团队）',
    );
  }
  if (base <= 0) return [];
  const drafts: ShareDraft[] = [];
  const push = (
    earnerKind: ShareDraft['earnerKind'],
    earnerId: number,
    percent: number,
  ): void => {
    if (earnerId <= 0 || percent <= 0) return;
    const shareCents = round((base * percent) / 100);
    if (shareCents <= 0) return;
    drafts.push({ earnerKind, earnerId, ratePercent: percent, shareCents });
  };
  push('ORGAN', input.organId, organPercent);
  push('PRACTITIONER', input.practitionerId, practitionerPercent);
  push('PROMOTER', input.promoterId, promoterPercent);
  push('TEAM', input.teamId, teamPercent);
  const distributed = drafts.reduce(
    (sumCents, draft) => sumCents + draft.shareCents,
    0,
  );
  const shopCents = base - distributed;
  if (shopCents > 0) {
    drafts.push({
      earnerKind: 'SHOP',
      earnerId: 0,
      ratePercent: Math.max(0, 100 - sum),
      shareCents: shopCents,
    });
  }
  return drafts;
}

/** 退款冲销：按退款比例把该单分账行冲成负数（状态 REVERSED）。 */
export function reverseShareCents(
  shareCents: number,
  refundCents: number,
  payCents: number,
): number {
  if (shareCents <= 0 || refundCents <= 0 || payCents <= 0) return 0;
  return Math.min(shareCents, round((shareCents * refundCents) / payCents));
}
