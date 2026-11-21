import {
  buildOrderCommission,
  percentOf,
  reverseCommission,
  splitBorne,
  type CommissionLine,
  type CommissionRule,
} from './onsite.commission.engine';

/**
 * 算例基线（方案 §五.4 默认模板）：分销 10% / 业务员 15% / 渠道 8%，
 * 技师与店主各担 50%，平台 0。
 * 一单一行实付 298.00 元 → 佣金合计 98.34 元，其中技师承担 49.17、店主承担 49.17。
 */
const rules: CommissionRule[] = [
  {
    role: 'DISTRIBUTOR',
    totalRate: 10,
    staffBorneRate: 50,
    ownerBorneRate: 50,
    platformBorneRate: 0,
  },
  {
    role: 'SALESMAN',
    totalRate: 15,
    staffBorneRate: 50,
    ownerBorneRate: 50,
    platformBorneRate: 0,
  },
  {
    role: 'CHANNEL',
    totalRate: 8,
    staffBorneRate: 50,
    ownerBorneRate: 50,
    platformBorneRate: 0,
  },
  {
    role: 'PARTNER',
    totalRate: 5,
    staffBorneRate: 100,
    ownerBorneRate: 0,
    platformBorneRate: 0,
  },
];

const line: CommissionLine = {
  orderItemId: 501,
  serviceId: 88,
  baseCents: 29800,
  staffId: 7,
  agentId: 3,
  actors: [
    { role: 'DISTRIBUTOR', sourceId: 101 },
    { role: 'SALESMAN', sourceId: 11 },
    { role: 'CHANNEL', sourceId: 21 },
  ],
};

describe('percentOf / splitBorne', () => {
  it('按分整数四舍五入，只在最后一步取整', () => {
    expect(percentOf(999, 12.5)).toBe(125);
    expect(percentOf(29800, 10)).toBe(2980);
    expect(percentOf(0, 10)).toBe(0);
    expect(percentOf(100, 0)).toBe(0);
  });

  it('平台吸收尾差：50/50 拆分 125 分 → 63 + 62', () => {
    expect(
      splitBorne(125, {
        staffBorneRate: 50,
        ownerBorneRate: 50,
        platformBorneRate: 0,
      }),
    ).toEqual({
      staffCents: 63,
      ownerCents: 62,
      platformCents: 0,
    });
  });

  it('三方才合计 100 时按比例拆，平台份额独立记账', () => {
    expect(
      splitBorne(1000, {
        staffBorneRate: 40,
        ownerBorneRate: 40,
        platformBorneRate: 20,
      }),
    ).toEqual({ staffCents: 400, ownerCents: 400, platformCents: 200 });
  });

  it('承担比例合计超过 100 时等比压缩，不凭空多扣', () => {
    const borne = splitBorne(1000, {
      staffBorneRate: 80,
      ownerBorneRate: 80,
      platformBorneRate: 0,
    });
    expect(borne.staffCents + borne.ownerCents + borne.platformCents).toBe(
      1000,
    );
    expect(borne.staffCents).toBe(500);
    expect(borne.ownerCents).toBe(500);
  });
});

describe('buildOrderCommission：三层佣金算得平', () => {
  const result = buildOrderCommission([line], rules);

  it('三条佣金明细金额与承担方拆分正确', () => {
    const byRole = Object.fromEntries(
      result.items.map((item) => [item.sourceRole, item]),
    );
    expect(byRole.DISTRIBUTOR.totalCents).toBe(2980);
    expect(byRole.DISTRIBUTOR.staffBorneCents).toBe(1490);
    expect(byRole.DISTRIBUTOR.ownerBorneCents).toBe(1490);
    expect(byRole.SALESMAN.totalCents).toBe(4470);
    expect(byRole.SALESMAN.staffBorneCents).toBe(2235);
    expect(byRole.CHANNEL.totalCents).toBe(2384);
    expect(byRole.CHANNEL.ownerBorneCents).toBe(1192);
    expect(byRole.DISTRIBUTOR.sourceId).toBe(101);
  });

  it('汇总：佣金 98.34 元，技师担 49.17、店主担 49.17、平台 0', () => {
    expect(result.baseCents).toBe(29800);
    expect(result.totalCents).toBe(9834);
    expect(result.staffBorneCents).toBe(4917);
    expect(result.ownerBorneCents).toBe(4917);
    expect(result.platformBorneCents).toBe(0);
    expect(
      result.staffBorneCents +
        result.ownerBorneCents +
        result.platformBorneCents,
    ).toBe(result.totalCents);
  });

  it('承担方拆分行：技师 7 与代理 3 各记一笔，退款时能按人回滚', () => {
    expect(result.shares).toEqual([
      { bearerRole: 'STAFF', bearerId: 7, cents: 4917 },
      { bearerRole: 'AGENT', bearerId: 3, cents: 4917 },
    ]);
  });

  it('个人覆盖比例优先于规则默认值', () => {
    const custom = buildOrderCommission(
      [{ ...line, actors: [{ role: 'DISTRIBUTOR', sourceId: 101, rate: 6 }] }],
      rules,
    );
    expect(custom.items[0].totalRate).toBe(6);
    expect(custom.items[0].totalCents).toBe(1788);
    expect(custom.staffBorneCents).toBe(894);
  });

  it('规则停用或缺规则时跳过并留痕，不静默少算', () => {
    const disabled = buildOrderCommission(
      [line],
      [{ ...rules[0], enabled: false }, rules[1]],
    );
    expect(disabled.items).toHaveLength(1);
    expect(disabled.skipped).toEqual([
      { orderItemId: 501, role: 'DISTRIBUTOR', reason: '规则已停用' },
      { orderItemId: 501, role: 'CHANNEL', reason: '未配置佣金规则' },
    ]);
  });

  it('同角色重复绑定只算一次', () => {
    const dup = buildOrderCommission(
      [
        {
          ...line,
          actors: [
            { role: 'DISTRIBUTOR', sourceId: 101 },
            { role: 'DISTRIBUTOR', sourceId: 102 },
          ],
        },
      ],
      rules,
    );
    expect(dup.items).toHaveLength(1);
    expect(dup.items[0].sourceId).toBe(101);
    expect(dup.skipped[0]).toEqual({
      orderItemId: 501,
      role: 'DISTRIBUTOR',
      reason: '同角色重复绑定',
    });
  });

  it('佣金不超过该行基数（比例配置大于 100 时也不倒贴）', () => {
    const capped = buildOrderCommission(
      [line],
      [
        {
          role: 'DISTRIBUTOR',
          totalRate: 120,
          staffBorneRate: 50,
          ownerBorneRate: 50,
          platformBorneRate: 0,
        },
      ],
    );
    expect(capped.items[0].totalCents).toBe(29800);
  });
});

describe('reverseCommission：退款按行按比例冲销', () => {
  const { items } = buildOrderCommission([line], rules);

  it('部分退款按占比冲销，各方承担额同步冲掉', () => {
    const reversed = reverseCommission(items, [
      { orderItemId: 501, refundBaseCents: 10000 },
    ]);
    const distributor = reversed.find(
      (row) => row.item.sourceRole === 'DISTRIBUTOR',
    );
    expect(distributor?.reversedCents).toBe(1000);
    expect(distributor?.reversedStaffCents).toBe(500);
    expect(distributor?.reversedOwnerCents).toBe(500);
    const total = reversed.reduce((sum, row) => sum + row.reversedCents, 0);
    expect(total).toBe(3300);
  });

  it('全额退款冲掉整行，冲销额等于原佣金', () => {
    const reversed = reverseCommission(items, [
      { orderItemId: 501, refundBaseCents: 29800 },
    ]);
    const total = reversed.reduce((sum, row) => sum + row.reversedCents, 0);
    const staff = reversed.reduce(
      (sum, row) => sum + row.reversedStaffCents,
      0,
    );
    expect(total).toBe(9834);
    expect(staff).toBe(4917);
  });

  it('没退款的行不产生冲销记录', () => {
    expect(
      reverseCommission(items, [{ orderItemId: 999, refundBaseCents: 500 }]),
    ).toEqual([]);
  });
});
