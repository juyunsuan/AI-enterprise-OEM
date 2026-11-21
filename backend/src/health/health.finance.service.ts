import {
  HEALTH_WITHDRAWAL_STATUSES,
  type HealthBankCardRow,
  type HealthBankCardSaveBody,
  type HealthCommissionRuleRow,
  type HealthCommissionRuleSaveBody,
  type HealthEarnerRow,
  type HealthOrderShareRow,
  type HealthWalletLogRow,
  type HealthWithdrawalHandleBody,
  type HealthWithdrawalRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { HealthCrypto } from './health-crypto';
import {
  audit,
  intIn,
  jsonArr,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';

const EARNER_KINDS = new Set([
  'SHOP',
  'ORGAN',
  'PRACTITIONER',
  'PROMOTER',
  'TEAM',
]);

/**
 * 资金域（C11）：钱包流水、分账规则与流水、收益汇总、银行卡与提现。
 *
 * 口径：
 * 1. 资金都在店铺自有商户号，本域只是站内账本，不触碰平台资金；
 * 2. 分账规则四类比例合计不得超过 100%，差额归店铺，保存时直接算好 `shopPercent`；
 * 3. 银行卡号密文存储（`oem-health` 上下文 + 店铺 scope），列表只回后四位；
 * 4. 提现状态机：PENDING → APPROVED → PAID，旁路 REJECTED；已打款不可再改。
 */
export class HealthFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: HealthCrypto,
  ) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  // ---------- 钱包流水 ----------

  async walletLogs(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthWalletLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const customerId = intIn(query.customerId, 0, 1_000_000_000, 0);
    const where = {
      shopId: ctx.shop.id,
      ...(customerId > 0 ? { customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthWalletLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthWalletLog.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const customers = await this.prisma.healthCustomer.findMany({
      where: {
        shopId: ctx.shop.id,
        id: { in: [...new Set(rows.map((row) => row.customerId))] },
      },
      select: { id: true, nickname: true, phone: true },
    });
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    return {
      list: rows.map((row) => {
        const customer = customerMap.get(row.customerId);
        return {
          id: row.id,
          customerId: row.customerId,
          customerLabel:
            customer?.nickname || customer?.phone || `顾客${row.customerId}`,
          kind: row.kind,
          amountCents: row.amountCents,
          balanceCents: row.balanceCents,
          refType: row.orderId > 0 ? 'ORDER' : '',
          refId: row.orderId,
          note: row.note,
          createdAt: toIso(row.createdAt),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // ---------- 分账规则 ----------

  private ruleRow(
    row: {
      id: number;
      scope: string;
      scopeId: number;
      bizTypesJson: unknown;
      organPercent: number;
      practitionerPercent: number;
      promoterPercent: number;
      teamPercent: number;
      shopPercent: number;
      status: string;
    },
    scopeName: string,
  ): HealthCommissionRuleRow {
    const sum =
      row.organPercent +
      row.practitionerPercent +
      row.promoterPercent +
      row.teamPercent +
      row.shopPercent;
    return {
      id: row.id,
      scope: (['DEFAULT', 'ORGAN', 'PRACTITIONER', 'SERVICE', 'TEAM'].includes(
        row.scope,
      )
        ? row.scope
        : 'DEFAULT') as HealthCommissionRuleRow['scope'],
      scopeId: row.scopeId,
      scopeName,
      bizTypes: jsonArr<string>(
        row.bizTypesJson,
      ) as HealthCommissionRuleRow['bizTypes'],
      organPercent: row.organPercent,
      practitionerPercent: row.practitionerPercent,
      promoterPercent: row.promoterPercent,
      teamPercent: row.teamPercent,
      shopPercent: row.shopPercent,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      validateMessage: sum === 100 ? '' : `各方比例合计 ${sum}%，不等于 100%`,
    };
  }

  async commissionRules(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthCommissionRuleRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const rows = await this.prisma.healthCommissionRule.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: [{ scope: 'asc' }, { id: 'asc' }],
    });
    const names = await this.scopeNames(ctx.shop.id, rows);
    return rows.map((row) =>
      this.ruleRow(row, names.get(`${row.scope}:${row.scopeId}`) ?? ''),
    );
  }

  private async scopeNames(
    shopId: number,
    rows: { scope: string; scopeId: number }[],
  ): Promise<Map<string, string>> {
    const idsOf = (scope: string) =>
      rows
        .filter((row) => row.scope === scope)
        .map((row) => row.scopeId)
        .filter((id) => id > 0);
    const organIds = idsOf('ORGAN');
    const practitionerIds = idsOf('PRACTITIONER');
    const serviceIds = idsOf('SERVICE');
    const teamIds = idsOf('TEAM');
    const [organs, practitioners, services, teams] = await Promise.all([
      organIds.length
        ? this.prisma.healthOrgan.findMany({
            where: { shopId, id: { in: organIds } },
            select: { id: true, name: true },
          })
        : [],
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      serviceIds.length
        ? this.prisma.healthService.findMany({
            where: { shopId, id: { in: serviceIds } },
            select: { id: true, name: true },
          })
        : [],
      teamIds.length
        ? this.prisma.healthTeam.findMany({
            where: { shopId, id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const out = new Map<string, string>();
    out.set('DEFAULT:0', '店铺默认');
    for (const row of organs) out.set(`ORGAN:${row.id}`, row.name);
    for (const row of practitioners)
      out.set(`PRACTITIONER:${row.id}`, row.name);
    for (const row of services) out.set(`SERVICE:${row.id}`, row.name);
    for (const row of teams) out.set(`TEAM:${row.id}`, row.name);
    return out;
  }

  async commissionRuleSave(
    user: CurrentUser,
    body: HealthCommissionRuleSaveBody,
  ): Promise<HealthCommissionRuleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'finance');
    await requireShopWritable(ctx);
    if (body.scope !== 'DEFAULT' && body.scopeId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择该分账规则作用的对象',
      );
    }
    const sum =
      body.organPercent +
      body.practitionerPercent +
      body.promoterPercent +
      body.teamPercent;
    if (sum > 100) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '各方分账比例合计不能超过 100%',
      );
    }
    const data = {
      scope: body.scope,
      scopeId: body.scope === 'DEFAULT' ? 0 : body.scopeId,
      bizTypesJson: body.bizTypes as never,
      organPercent: body.organPercent,
      practitionerPercent: body.practitionerPercent,
      promoterPercent: body.promoterPercent,
      teamPercent: body.teamPercent,
      shopPercent: 100 - sum,
      status: body.status,
    };
    let row =
      body.id > 0
        ? await this.prisma.healthCommissionRule.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : await this.prisma.healthCommissionRule.findFirst({
            where: {
              shopId: ctx.shop.id,
              scope: data.scope,
              scopeId: data.scopeId,
            },
          });
    if (row) {
      row = await this.prisma.healthCommissionRule.update({
        where: { id: row.id },
        data: data as never,
      });
    } else {
      row = await this.prisma.healthCommissionRule.create({
        data: { ...data, shopId: ctx.shop.id } as never,
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.commission.save',
      `shop=${ctx.shop.id} id=${row.id}`,
    );
    const names = await this.scopeNames(ctx.shop.id, [row]);
    return this.ruleRow(row, names.get(`${row.scope}:${row.scopeId}`) ?? '');
  }

  async commissionRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'finance');
    await requireShopWritable(ctx);
    await this.prisma.healthCommissionRule.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.commission.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '分账规则已删除' };
  }

  // ---------- 分账流水 ----------

  async orderShares(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthOrderShareRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const orderId = intIn(query.orderId, 0, 1_000_000_000, 0);
    const earnerKind = strOf(query.earnerKind, 20, 'all');
    const where = {
      shopId: ctx.shop.id,
      ...(orderId > 0 ? { orderId } : {}),
      ...(earnerKind && earnerKind !== 'all' ? { earnerKind } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthOrderShare.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthOrderShare.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const orders = await this.prisma.healthOrder.findMany({
      where: {
        shopId: ctx.shop.id,
        id: { in: [...new Set(rows.map((row) => row.orderId))] },
      },
      select: { id: true, orderNo: true },
    });
    const orderMap = new Map(orders.map((row) => [row.id, row.orderNo]));
    return {
      list: rows.map((row) => {
        const reversed = row.status === 'REVERSED' || row.shareCents < 0;
        return {
          id: row.id,
          orderId: row.orderId,
          orderNo: orderMap.get(row.orderId) ?? '',
          earnerKind: (EARNER_KINDS.has(row.earnerKind)
            ? row.earnerKind
            : 'SHOP') as HealthOrderShareRow['earnerKind'],
          earnerId: row.earnerId,
          earnerName: row.earnerName,
          percent: row.ratePercent,
          baseCents: Math.abs(row.baseCents),
          shareCents: Math.abs(row.shareCents),
          deductedCents: reversed ? Math.abs(row.shareCents) : 0,
          actualCents: reversed ? 0 : row.shareCents,
          settleableAt: toIso(row.settleableAt),
          settled: Boolean(row.settleableAt && row.settleableAt <= new Date()),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // ---------- 收益汇总 ----------

  async earners(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthEarnerRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const kind = strOf(query.earnerKind, 20, 'all');
    const shares = await this.prisma.healthOrderShare.findMany({
      where: {
        shopId: ctx.shop.id,
        status: 'SETTLED',
        earnerKind: kind && kind !== 'all' ? kind : { not: 'SHOP' },
      },
      select: {
        earnerKind: true,
        earnerId: true,
        earnerName: true,
        shareCents: true,
        settleableAt: true,
        orderId: true,
      },
    });
    const withdrawals = await this.prisma.healthWithdrawal.findMany({
      where: { shopId: ctx.shop.id },
      select: {
        earnerKind: true,
        earnerId: true,
        amountCents: true,
        status: true,
      },
    });
    const cards = await this.prisma.healthBankCard.findMany({
      where: { shopId: ctx.shop.id, status: 'ON' },
      select: {
        holderType: true,
        holderId: true,
        bankName: true,
        cardNoTail: true,
        isDefault: true,
      },
    });
    const cardMap = new Map<string, string>();
    for (const card of cards) {
      const key = `${card.holderType}:${card.holderId}`;
      if (!cardMap.has(key) || card.isDefault) {
        cardMap.set(key, `${card.bankName} 尾号${card.cardNoTail}`);
      }
    }
    type Bucket = {
      earnerKind: string;
      earnerId: number;
      earnerName: string;
      totalCents: number;
      settleableCents: number;
      withdrawingCents: number;
      withdrawnCents: number;
      orders: Set<number>;
    };
    const buckets = new Map<string, Bucket>();
    const ensure = (
      earnerKind: string,
      earnerId: number,
      earnerName: string,
    ): Bucket => {
      const key = `${earnerKind}:${earnerId}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          earnerKind,
          earnerId,
          earnerName,
          totalCents: 0,
          settleableCents: 0,
          withdrawingCents: 0,
          withdrawnCents: 0,
          orders: new Set<number>(),
        };
        buckets.set(key, bucket);
      }
      if (!bucket.earnerName && earnerName) bucket.earnerName = earnerName;
      return bucket;
    };
    const now = new Date();
    for (const share of shares) {
      const bucket = ensure(share.earnerKind, share.earnerId, share.earnerName);
      bucket.totalCents += share.shareCents;
      bucket.orders.add(share.orderId);
      if (!share.settleableAt || share.settleableAt <= now) {
        bucket.settleableCents += share.shareCents;
      }
    }
    for (const row of withdrawals) {
      const bucket = ensure(row.earnerKind, row.earnerId, '');
      if (
        row.status === 'PENDING' ||
        row.status === 'APPROVED' ||
        row.status === 'FAILED'
      ) {
        bucket.withdrawingCents += row.amountCents;
      } else if (row.status === 'PAID') {
        bucket.withdrawnCents += row.amountCents;
      }
    }
    return [...buckets.values()]
      .filter((bucket) => bucket.totalCents > 0 || bucket.withdrawnCents > 0)
      .map((bucket) => ({
        earnerKind: bucket.earnerKind as HealthEarnerRow['earnerKind'],
        earnerId: bucket.earnerId,
        earnerName: bucket.earnerName,
        totalCents: bucket.totalCents,
        settleableCents: Math.max(
          0,
          bucket.settleableCents -
            bucket.withdrawingCents -
            bucket.withdrawnCents,
        ),
        withdrawingCents: bucket.withdrawingCents,
        withdrawnCents: bucket.withdrawnCents,
        pendingCents: Math.max(0, bucket.totalCents - bucket.settleableCents),
        orderCount: bucket.orders.size,
        bankLabel: cardMap.get(`${bucket.earnerKind}:${bucket.earnerId}`) ?? '',
      }));
  }

  // ---------- 银行卡 ----------

  async bankCards(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthBankCardRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const earnerKind = strOf(query.earnerKind, 20, 'all');
    const earnerId = intIn(query.earnerId, 0, 1_000_000_000, 0);
    const rows = await this.prisma.healthBankCard.findMany({
      where: {
        shopId: ctx.shop.id,
        ...(earnerKind && earnerKind !== 'all'
          ? { holderType: earnerKind }
          : {}),
        ...(earnerId > 0 ? { holderId: earnerId } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      earnerKind: row.holderType as HealthBankCardRow['earnerKind'],
      earnerId: row.holderId,
      holderName: row.accountName,
      bankName: row.bankName,
      branchName: row.branchName,
      cardTail: row.cardNoTail,
      isDefault: row.isDefault,
      createdAt: toIso(row.createdAt),
    }));
  }

  async bankCardSave(
    user: CurrentUser,
    body: HealthBankCardSaveBody,
  ): Promise<HealthBankCardRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'finance');
    await requireShopWritable(ctx);
    if (body.earnerKind !== 'SHOP' && body.earnerId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择收款对象');
    }
    const cardNo = body.cardNo.replace(/\s+/g, '');
    if (body.id <= 0 && cardNo.length < 8) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写完整银行卡号');
    }
    const data: Record<string, unknown> = {
      holderType: body.earnerKind,
      holderId: body.earnerId,
      accountName: body.holderName,
      bankName: body.bankName,
      branchName: body.branchName,
      isDefault: body.isDefault,
    };
    if (cardNo) {
      data.cardNoCipher = this.crypto.encrypt(`bank:${ctx.shop.id}`, cardNo);
      data.cardNoTail = cardNo.slice(-4);
    }
    let id = body.id;
    if (id > 0) {
      const row = await this.prisma.healthBankCard.findFirst({
        where: { id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '银行卡不存在');
      await this.prisma.healthBankCard.update({
        where: { id },
        data: data as never,
      });
    } else {
      const row = await this.prisma.healthBankCard.create({
        data: { ...data, shopId: ctx.shop.id } as never,
      });
      id = row.id;
    }
    if (body.isDefault) {
      await this.prisma.healthBankCard.updateMany({
        where: {
          shopId: ctx.shop.id,
          holderType: body.earnerKind,
          holderId: body.earnerId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.bank.save',
      `shop=${ctx.shop.id} id=${id}`,
    );
    const row = await this.prisma.healthBankCard.findUniqueOrThrow({
      where: { id },
    });
    return {
      id: row.id,
      earnerKind: row.holderType as HealthBankCardRow['earnerKind'],
      earnerId: row.holderId,
      holderName: row.accountName,
      bankName: row.bankName,
      branchName: row.branchName,
      cardTail: row.cardNoTail,
      isDefault: row.isDefault,
      createdAt: toIso(row.createdAt),
    };
  }

  async bankCardRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'finance');
    await requireShopWritable(ctx);
    const used = await this.prisma.healthWithdrawal.count({
      where: {
        shopId: ctx.shop.id,
        bankCardId: body.id,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该卡有处理中的提现，不能删除',
      );
    }
    await this.prisma.healthBankCard.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.bank.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '银行卡已删除' };
  }

  // ---------- 提现 ----------

  async withdrawals(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthWithdrawalRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'finance');
    const status = strOf(query.withdrawalStatus, 24, 'all');
    const earnerKind = strOf(query.earnerKind, 20, 'all');
    const where = {
      shopId: ctx.shop.id,
      ...(status && status !== 'all' ? { status } : {}),
      ...(earnerKind && earnerKind !== 'all' ? { earnerKind } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthWithdrawal.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthWithdrawal.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    return {
      list: await this.withdrawalRowsOf(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  private async withdrawalRowsOf(
    shopId: number,
    rows: {
      id: number;
      no: string;
      earnerKind: string;
      earnerId: number;
      earnerName: string;
      amountCents: number;
      taxCents: number;
      realCents: number;
      bankCardId: number;
      status: string;
      auditNote: string;
      auditAt: Date | null;
      paidAt: Date | null;
      voucherImage: string;
      createdAt: Date;
    }[],
  ): Promise<HealthWithdrawalRow[]> {
    if (!rows.length) return [];
    const cardIds = [
      ...new Set(rows.map((row) => row.bankCardId).filter((id) => id > 0)),
    ];
    const cards = cardIds.length
      ? await this.prisma.healthBankCard.findMany({
          where: { shopId, id: { in: cardIds } },
          select: { id: true, bankName: true, cardNoTail: true },
        })
      : [];
    const cardMap = new Map(cards.map((row) => [row.id, row]));
    return rows.map((row) => {
      const card = cardMap.get(row.bankCardId);
      return {
        id: row.id,
        withdrawalNo: row.no,
        earnerKind: row.earnerKind as HealthWithdrawalRow['earnerKind'],
        earnerId: row.earnerId,
        earnerName: row.earnerName,
        amountCents: row.amountCents,
        taxCents: row.taxCents,
        feeCents: Math.max(0, row.amountCents - row.taxCents - row.realCents),
        actualCents: row.realCents,
        status: (HEALTH_WITHDRAWAL_STATUSES.includes(
          row.status as (typeof HEALTH_WITHDRAWAL_STATUSES)[number],
        )
          ? row.status
          : 'PENDING') as HealthWithdrawalRow['status'],
        bankLabel: card ? `${card.bankName} 尾号${card.cardNoTail}` : '',
        applyAt: toIso(row.createdAt),
        handledAt: toIso(row.auditAt ?? row.paidAt),
        handleNote: row.auditNote,
        paidVoucher: row.voucherImage,
      };
    });
  }

  async withdrawalHandle(
    user: CurrentUser,
    body: HealthWithdrawalHandleBody,
  ): Promise<HealthWithdrawalRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'finance');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthWithdrawal.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    const now = new Date();
    const operator = user.username ?? String(user.userId);
    const data: Record<string, unknown> = { auditBy: operator, auditAt: now };
    if (body.note) data.auditNote = body.note;
    if (body.action === 'APPROVE') {
      if (row.status !== 'PENDING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有待审核的提现可以同意',
        );
      }
      data.status = 'APPROVED';
    } else if (body.action === 'REJECT') {
      if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该提现已打款或已关闭，不能驳回',
        );
      }
      if (!body.note) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '驳回提现需填写原因',
        );
      }
      data.status = 'REJECTED';
    } else if (body.action === 'PAID') {
      if (row.status !== 'APPROVED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '请先同意提现，再登记打款',
        );
      }
      data.status = 'PAID';
      data.paidAt = now;
      if (body.paidVoucher) data.voucherImage = body.paidVoucher;
    } else {
      if (row.status === 'PAID') {
        throw new BusinessException(ErrorCode.CONFLICT, '已打款的提现不能取消');
      }
      data.status = 'FAILED';
    }
    const updated = await this.prisma.healthWithdrawal.update({
      where: { id: row.id },
      data: data as never,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.withdrawal.handle',
      `shop=${ctx.shop.id} id=${row.id} action=${body.action}`,
    );
    const [mapped] = await this.withdrawalRowsOf(ctx.shop.id, [updated]);
    return mapped;
  }
}
