/**
 * 分账引擎（纯函数）。
 *
 * 参考源码最复杂的一块，也是 P2 最容易做错的地方：佣金不是平台掏钱，
 * 而是按 `totalRate` 从「技师收入」与「店主/代理收入」里按承担比例扣出来
 * 再分给分销商/业务员/渠道/合伙人。口径定死三条，禁止改成别的：
 *
 *   1. 下单即预生成（PENDING），支付才生效（ACTIVE），退款按行按比例冲销；
 *   2. 一条规则 = 角色拿 totalRate，出资构成 staffBorneRate / ownerBorneRate / platformBorneRate；
 *   3. 金额一律用「分」整数运算，四舍五入只在最后一步，平台承担额吸收尾差。
 *
 * 佣金的基数（base）取订单行实付金额（已扣券与余额抵扣），不含车费与物料费——
 * 车费是跑腿成本、物料费是代购成本，拿去抽佣会让技师白干。
 */

export const ONSITE_COMMISSION_ROLES = [
  'DISTRIBUTOR',
  'SALESMAN',
  'CHANNEL',
  'PARTNER',
  'AGENT',
] as const;
export type OnsiteCommissionRole = (typeof ONSITE_COMMISSION_ROLES)[number];

export const ONSITE_COMMISSION_ROLE_LABELS: Record<string, string> = {
  DISTRIBUTOR: '分销商',
  SALESMAN: '业务员',
  CHANNEL: '渠道商',
  PARTNER: '合伙人',
  AGENT: '代理',
};

export type CommissionRule = {
  role: string;
  /** 该角色拿多少（%） */
  totalRate: number;
  /** 这笔佣金的出资构成（% of total），三者应合计 100 */
  staffBorneRate: number;
  ownerBorneRate: number;
  platformBorneRate: number;
  enabled?: boolean;
};

export type CommissionActor = {
  role: string;
  /** 业务主体 id：分销商=顾客 id，业务员/渠道/代理=各自表 id，合伙人=技师 id */
  sourceId: number;
  /** 个人覆盖比例（%），0 或未给 = 用规则表 totalRate */
  rate?: number;
};

export type CommissionLine = {
  orderItemId: number;
  serviceId: number;
  /** 该行参与分账的实付金额（分） */
  baseCents: number;
  /** 履约技师：技师承担额记在他名下 */
  staffId: number;
  /** 该单归属代理（0 = 无代理），代理承担额记在代理名下 */
  agentId?: number;
  actors: CommissionActor[];
};

export type CommissionItem = {
  orderItemId: number;
  serviceId: number;
  sourceRole: string;
  sourceId: number;
  totalRate: number;
  staffBorneRate: number;
  ownerBorneRate: number;
  platformBorneRate: number;
  baseCents: number;
  totalCents: number;
  staffBorneCents: number;
  ownerBorneCents: number;
  platformBorneCents: number;
};

export type CommissionShare = {
  bearerRole: 'STAFF' | 'AGENT' | 'PLATFORM';
  bearerId: number;
  cents: number;
};

export type CommissionResult = {
  baseCents: number;
  totalCents: number;
  staffBorneCents: number;
  ownerBorneCents: number;
  platformBorneCents: number;
  items: CommissionItem[];
  shares: CommissionShare[];
  skipped: Array<{ orderItemId: number; role: string; reason: string }>;
};

/** 百分数取整：只在最后一步四舍五入，避免逐项累加漂移。 */
export const percentOf = (baseCents: number, ratePercent: number): number => {
  const base = Math.trunc(baseCents);
  const rate = Number(ratePercent) || 0;
  if (base <= 0 || rate <= 0) return 0;
  return Math.round((base * rate) / 100);
};

/**
 * 承担方拆分：技师与店主按各自比例出资，平台吸收尾差（比例合计不足 100 时，
 * 尾差留在店主侧，不凭空造钱；超过 100 时按技师/店主比例等比压缩）。
 */
export const splitBorne = (
  totalCents: number,
  rule: Pick<
    CommissionRule,
    'staffBorneRate' | 'ownerBorneRate' | 'platformBorneRate'
  >,
): { staffCents: number; ownerCents: number; platformCents: number } => {
  const total = Math.max(0, Math.trunc(totalCents));
  if (total === 0) return { staffCents: 0, ownerCents: 0, platformCents: 0 };
  const staffRate = Math.max(0, Number(rule.staffBorneRate) || 0);
  const ownerRate = Math.max(0, Number(rule.ownerBorneRate) || 0);
  const platformRate = Math.max(0, Number(rule.platformBorneRate) || 0);
  const sum = staffRate + ownerRate + platformRate;
  if (sum <= 0) return { staffCents: 0, ownerCents: 0, platformCents: total };
  if (sum > 100) {
    const staffCents = percentOf(total, (staffRate * 100) / sum);
    const platformCents = percentOf(total, (platformRate * 100) / sum);
    return {
      staffCents,
      ownerCents: total - staffCents - platformCents,
      platformCents,
    };
  }
  const staffCents = percentOf(total, staffRate);
  const platformCents = percentOf(total, platformRate);
  return {
    staffCents,
    ownerCents: total - staffCents - platformCents,
    platformCents,
  };
};

/**
 * 生成一单的佣金明细与承担方拆分。
 *
 * 同一行同一角色只记一次（渠道重复绑定取第一条，由调用方负责去重）；
 * 规则停用或个人比例 ≤ 0 的角色跳过并留痕到 `skipped`，方便后台解释"为什么没算佣"。
 */
export const buildOrderCommission = (
  lines: CommissionLine[],
  rules: CommissionRule[],
): CommissionResult => {
  const ruleMap = new Map<string, CommissionRule>();
  for (const rule of rules) ruleMap.set(rule.role, rule);
  const items: CommissionItem[] = [];
  const skipped: CommissionResult['skipped'] = [];

  for (const line of lines) {
    const baseCents = Math.max(0, Math.trunc(line.baseCents));
    if (baseCents === 0) continue;
    const seen = new Set<string>();
    for (const actor of line.actors) {
      if (seen.has(actor.role)) {
        skipped.push({
          orderItemId: line.orderItemId,
          role: actor.role,
          reason: '同角色重复绑定',
        });
        continue;
      }
      seen.add(actor.role);
      const rule = ruleMap.get(actor.role);
      if (!rule) {
        skipped.push({
          orderItemId: line.orderItemId,
          role: actor.role,
          reason: '未配置佣金规则',
        });
        continue;
      }
      if (rule.enabled === false) {
        skipped.push({
          orderItemId: line.orderItemId,
          role: actor.role,
          reason: '规则已停用',
        });
        continue;
      }
      const totalRate =
        Number(actor.rate) > 0 ? Number(actor.rate) : Number(rule.totalRate);
      if (!(totalRate > 0)) {
        skipped.push({
          orderItemId: line.orderItemId,
          role: actor.role,
          reason: '比例为 0',
        });
        continue;
      }
      const totalCents = Math.min(baseCents, percentOf(baseCents, totalRate));
      const borne = splitBorne(totalCents, rule);
      items.push({
        orderItemId: line.orderItemId,
        serviceId: line.serviceId,
        sourceRole: actor.role,
        sourceId: actor.sourceId,
        totalRate,
        staffBorneRate: rule.staffBorneRate,
        ownerBorneRate: rule.ownerBorneRate,
        platformBorneRate: rule.platformBorneRate,
        baseCents,
        totalCents,
        staffBorneCents: borne.staffCents,
        ownerBorneCents: borne.ownerCents,
        platformBorneCents: borne.platformCents,
      });
    }
  }

  const totals = summarize(items);
  const shares = buildShares(items, lines);
  return { ...totals, items, shares, skipped };
};

/** 汇总：基数去重（同一行被多个角色分佣时基数只算一次）。 */
export const summarize = (items: CommissionItem[]) => {
  const baseCents = [...new Set(items.map((item) => item.orderItemId))].reduce(
    (sum, orderItemId) => {
      const first = items.find((item) => item.orderItemId === orderItemId);
      return sum + (first ? first.baseCents : 0);
    },
    0,
  );
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  const staffBorneCents = items.reduce(
    (sum, item) => sum + item.staffBorneCents,
    0,
  );
  const ownerBorneCents = items.reduce(
    (sum, item) => sum + item.ownerBorneCents,
    0,
  );
  const platformBorneCents = items.reduce(
    (sum, item) => sum + item.platformBorneCents,
    0,
  );
  return {
    baseCents,
    totalCents,
    staffBorneCents,
    ownerBorneCents,
    platformBorneCents,
  };
};

/**
 * 承担方拆分行：技师按 order 的履约技师聚合，代理按该行代理聚合，平台固定 bearerId=0。
 * 店主承担额不单列一行——它体现为店主净收入变少，可从 total − 其余三方反推。
 */
export const buildShares = (
  items: CommissionItem[],
  lines: CommissionLine[],
): CommissionShare[] => {
  const staffByItem = new Map(
    lines.map((line) => [line.orderItemId, line.staffId]),
  );
  const agentByItem = new Map(
    lines.map((line) => [line.orderItemId, line.agentId ?? 0]),
  );
  const staff = new Map<number, number>();
  const agent = new Map<number, number>();
  let platform = 0;
  for (const item of items) {
    const staffId = staffByItem.get(item.orderItemId) ?? 0;
    if (item.staffBorneCents !== 0 && staffId > 0) {
      staff.set(staffId, (staff.get(staffId) ?? 0) + item.staffBorneCents);
    }
    const agentId = agentByItem.get(item.orderItemId) ?? 0;
    if (item.ownerBorneCents !== 0 && agentId > 0) {
      agent.set(agentId, (agent.get(agentId) ?? 0) + item.ownerBorneCents);
    }
    platform += item.platformBorneCents;
  }
  const shares: CommissionShare[] = [];
  for (const [bearerId, cents] of staff)
    shares.push({ bearerRole: 'STAFF', bearerId, cents });
  for (const [bearerId, cents] of agent)
    shares.push({ bearerRole: 'AGENT', bearerId, cents });
  if (platform !== 0)
    shares.push({ bearerRole: 'PLATFORM', bearerId: 0, cents: platform });
  return shares;
};

/**
 * 退款冲销：按该行已退金额占比反算要冲掉的佣金与各方承担额。
 * 全额退 → 冲掉整行；部分退 → 按比例四舍五入，冲销额不超过原额。
 */
export const reverseCommission = (
  items: CommissionItem[],
  refunds: Array<{ orderItemId: number; refundBaseCents: number }>,
): Array<{
  item: CommissionItem;
  reversedCents: number;
  reversedStaffCents: number;
  reversedOwnerCents: number;
  reversedPlatformCents: number;
}> => {
  const refundMap = new Map(
    refunds.map((row) => [
      row.orderItemId,
      Math.max(0, Math.trunc(row.refundBaseCents)),
    ]),
  );
  const out: Array<{
    item: CommissionItem;
    reversedCents: number;
    reversedStaffCents: number;
    reversedOwnerCents: number;
    reversedPlatformCents: number;
  }> = [];
  for (const item of items) {
    const refundBase = Math.min(
      refundMap.get(item.orderItemId) ?? 0,
      item.baseCents,
    );
    if (refundBase <= 0 || item.baseCents <= 0) continue;
    const ratio = refundBase / item.baseCents;
    const clamp = (value: number, max: number) =>
      Math.min(max, Math.max(0, Math.round(value)));
    const reversedCents = clamp(item.totalCents * ratio, item.totalCents);
    const reversedStaffCents = clamp(
      item.staffBorneCents * ratio,
      item.staffBorneCents,
    );
    const reversedOwnerCents = clamp(
      item.ownerBorneCents * ratio,
      item.ownerBorneCents,
    );
    out.push({
      item,
      reversedCents,
      reversedStaffCents,
      reversedOwnerCents,
      reversedPlatformCents: Math.max(
        0,
        reversedCents - reversedStaffCents - reversedOwnerCents,
      ),
    });
  }
  return out;
};
