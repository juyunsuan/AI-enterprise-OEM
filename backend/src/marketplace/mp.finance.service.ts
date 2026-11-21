import type {
  MpCommissionRule as MpCommissionRuleView,
  MpCommissionRuleSaveBody,
  MpCommissionRuleStatus,
  MpFinanceSummary,
  MpMerchantCommission,
  MpSettlement,
  MpSettlementDetail,
  MpSettlementGenerateBody,
  MpSettlementItem,
  MpWithdrawal as MpWithdrawalView,
  PageResponse,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { commerceOrderNo } from '../commerce-core/ident';
import type {
  MpCommissionRule as MpCommissionRuleRow,
  MpMarket as MpMarketRow,
  MpMerchant as MpMerchantRow,
  MpRefund as MpRefundRow,
  MpSettlement as MpSettlementRow,
  MpSettlementItem as MpSettlementItemRow,
  MpShopOrder as MpShopOrderRow,
  MpWithdrawal as MpWithdrawalRow,
} from '../../generated/prisma';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import { jsonIds, numberIn } from './mp.shared';
import { iso, decimalOf, jsonObject } from './mp.shared';

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 费率解析结果：商户专属 > 类目 > 平台默认 > 市场结算参数。 */
export type MpResolvedRate = {
  rate: number;
  scopeType: 'PLATFORM' | 'CATEGORY' | 'MERCHANT';
  scopeId: number;
};

/**
 * 多店铺商城·资金域（B2）。
 *
 * 抽佣规则 → 结算单 → 提现三段一条线：规则只影响下单时的费率快照；
 * 结算只认「已完成子单 + 成功退款」，同一子单靠 `mp_settlement_items.shop_order_id`
 * 唯一键保证不重复入账；提现只动台账，不触碰商户真实资金（平台不经手资金）。
 */
export class MpFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
  ) {}

  // ------------------------------------------------------------ 抽佣规则

  /** 下单算价用：一次取本市场全部生效规则，按商户逐个解析。 */
  async resolveRates(
    market: MpMarketRow,
    merchantIds: number[],
  ): Promise<Map<number, MpResolvedRate>> {
    const ids = [...new Set(merchantIds.filter((id) => id > 0))];
    if (ids.length === 0) return new Map();
    const [merchants, rules] = await Promise.all([
      this.prisma.mpMerchant.findMany({ where: { id: { in: ids } } }),
      this.prisma.mpCommissionRule.findMany({
        where: { marketId: market.id, status: 'ACTIVE' },
      }),
    ]);
    const defaultRate = numberIn(
      jsonObject(market.settleJson).defaultCommissionRate,
      0,
      0,
      100,
    );
    return new Map(
      merchants.map((merchant) => [
        merchant.id,
        this.pickRate(merchant, rules, defaultRate),
      ]),
    );
  }

  /** 商户后台展示：实际生效费率与来源。 */
  async merchantCommission(
    payload: MpMerchantTokenPayload,
  ): Promise<MpMerchantCommission> {
    const { market, merchant } = await this.merchants.session(payload);
    const rules = await this.prisma.mpCommissionRule.findMany({
      where: { marketId: market.id, status: 'ACTIVE' },
    });
    const defaultRate = numberIn(
      jsonObject(market.settleJson).defaultCommissionRate,
      0,
      0,
      100,
    );
    const resolved = this.pickRate(merchant, rules, defaultRate);
    return {
      rate: resolved.rate,
      scopeType: resolved.scopeType,
      scopeName: await this.scopeName(market.id, resolved),
    };
  }

  async commissionRules(ownerUserId: string): Promise<MpCommissionRuleView[]> {
    const market = await this.requireMarket(ownerUserId);
    const rows = await this.prisma.mpCommissionRule.findMany({
      where: { marketId: market.id },
      orderBy: [{ scopeType: 'asc' }, { id: 'asc' }],
    });
    const names = await this.scopeNames(
      market.id,
      rows.map((row) => ({
        scopeType: row.scopeType as MpResolvedRate['scopeType'],
        scopeId: row.scopeId,
      })),
    );
    return rows.map((row) => this.ruleView(row, names));
  }

  async commissionRuleSave(
    ownerUserId: string,
    body: MpCommissionRuleSaveBody,
  ): Promise<MpCommissionRuleView> {
    const market = await this.requireMarket(ownerUserId);
    const scopeId = body.scopeType === 'PLATFORM' ? 0 : body.scopeId;
    if (body.scopeType !== 'PLATFORM' && scopeId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        body.scopeType === 'CATEGORY' ? '请选择类目' : '请选择商户',
      );
    }
    if (body.scopeType === 'CATEGORY') {
      const category = await this.prisma.mpCategory.findFirst({
        where: { id: scopeId, marketId: market.id },
        select: { id: true },
      });
      if (!category) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '类目不存在');
      }
    }
    if (body.scopeType === 'MERCHANT') {
      const merchant = await this.prisma.mpMerchant.findFirst({
        where: { id: scopeId, marketId: market.id },
        select: { id: true },
      });
      if (!merchant) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '商户不存在');
      }
    }
    const duplicated = await this.prisma.mpCommissionRule.findFirst({
      where: {
        marketId: market.id,
        scopeType: body.scopeType,
        scopeId,
        ...(body.id > 0 ? { id: { not: body.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该范围的抽佣规则已存在，请直接编辑',
      );
    }
    const existing = body.id
      ? await this.prisma.mpCommissionRule.findFirst({
          where: { id: body.id, marketId: market.id },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '抽佣规则不存在');
    }
    const row = existing
      ? await this.prisma.mpCommissionRule.update({
          where: { id: existing.id },
          data: {
            scopeType: body.scopeType,
            scopeId,
            rate: money(body.rate),
            remark: body.remark,
          },
        })
      : await this.prisma.mpCommissionRule.create({
          data: {
            marketId: market.id,
            scopeType: body.scopeType,
            scopeId,
            rate: money(body.rate),
            remark: body.remark,
          },
        });
    const names = await this.scopeNames(market.id, [
      {
        scopeType: row.scopeType as MpResolvedRate['scopeType'],
        scopeId: row.scopeId,
      },
    ]);
    return this.ruleView(row, names);
  }

  async commissionRuleStatus(
    ownerUserId: string,
    body: { id: number; status: MpCommissionRuleStatus },
  ): Promise<MpCommissionRuleView> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpCommissionRule.findFirst({
      where: { id: body.id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '抽佣规则不存在');
    }
    const updated = await this.prisma.mpCommissionRule.update({
      where: { id: row.id },
      data: { status: body.status },
    });
    const names = await this.scopeNames(market.id, [
      {
        scopeType: updated.scopeType as MpResolvedRate['scopeType'],
        scopeId: updated.scopeId,
      },
    ]);
    return this.ruleView(updated, names);
  }

  // ------------------------------------------------------------ 结算（平台侧）

  async settlements(
    ownerUserId: string,
    query: {
      merchantId?: number;
      shopId?: number;
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpSettlement>> {
    const market = await this.requireMarket(ownerUserId);
    return this.settlementPage(market.id, query);
  }

  async settlementDetail(
    ownerUserId: string,
    id: number,
  ): Promise<MpSettlementDetail> {
    const market = await this.requireMarket(ownerUserId);
    return this.settlementDetailOf(market.id, id);
  }

  /** 平台归集：按商户 + 周期把已完成且未入账的子单汇成一张待确认结算单。 */
  async settlementGenerate(
    ownerUserId: string,
    body: MpSettlementGenerateBody,
  ): Promise<MpSettlementDetail> {
    const market = await this.requireMarket(ownerUserId);
    const merchant = await this.prisma.mpMerchant.findFirst({
      where: { id: body.merchantId, marketId: market.id },
    });
    if (!merchant) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商户不存在');
    }
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime())
    ) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '结算周期格式不正确');
    }
    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '结束时间必须晚于开始时间',
      );
    }
    const settled = await this.prisma.mpSettlementItem.findMany({
      where: { marketId: market.id, merchantId: merchant.id },
      select: { shopOrderId: true },
    });
    const candidates = await this.prisma.mpShopOrder.findMany({
      where: {
        marketId: market.id,
        merchantId: merchant.id,
        ...(body.shopId > 0 ? { shopId: body.shopId } : {}),
        status: 'COMPLETED',
        completedAt: { gte: periodStart, lte: periodEnd },
        id: { notIn: settled.map((row) => row.shopOrderId) },
      },
      orderBy: { id: 'asc' },
    });
    if (candidates.length === 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该周期没有可结算的已完成子单',
      );
    }
    const refunds = await this.prisma.mpRefund.findMany({
      where: {
        marketId: market.id,
        shopOrderId: { in: candidates.map((row) => row.id) },
        status: 'SUCCESS',
      },
    });
    const lines = candidates.map((row) => this.settlementLine(row, refunds));
    const settleNo = commerceOrderNo('ST');
    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mpSettlement.create({
        data: {
          marketId: market.id,
          merchantId: merchant.id,
          shopId: body.shopId > 0 ? body.shopId : candidates[0].shopId,
          settleNo,
          periodStart,
          periodEnd,
          orderCount: lines.length,
          grossAmount: money(
            lines.reduce((sum, row) => sum + row.payAmount, 0),
          ),
          refundAmount: money(
            lines.reduce((sum, row) => sum + row.refundAmount, 0),
          ),
          commissionAmount: money(
            lines.reduce((sum, row) => sum + row.commissionAmount, 0),
          ),
          netAmount: money(lines.reduce((sum, row) => sum + row.netAmount, 0)),
          status: 'PENDING',
        },
      });
      for (const line of lines) {
        await tx.mpSettlementItem.create({
          data: {
            settlementId: created.id,
            marketId: market.id,
            merchantId: merchant.id,
            ...line,
          },
        });
      }
      return created;
    });
    return this.settlementDetailOf(market.id, settlement.id);
  }

  async settlementPaid(
    ownerUserId: string,
    body: { id: number; voucher: string },
  ): Promise<MpSettlement> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpSettlement.findFirst({
      where: { id: body.id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '结算单不存在');
    }
    if (row.status !== 'CONFIRMED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        row.status === 'PAID' ? '结算单已打款' : '商户尚未确认结算单',
      );
    }
    const updated = await this.prisma.mpSettlement.update({
      where: { id: row.id },
      data: { status: 'PAID', voucher: body.voucher, paidAt: new Date() },
    });
    return this.settlementView(updated);
  }

  // ------------------------------------------------------------ 结算（商户侧）

  async merchantSettlements(
    payload: MpMerchantTokenPayload,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpSettlement>> {
    const { market, merchant } = await this.merchants.session(payload);
    return this.settlementPage(market.id, {
      ...query,
      merchantId: merchant.id,
    });
  }

  async merchantSettlementDetail(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpSettlementDetail> {
    const { market, merchant } = await this.merchants.session(payload);
    const row = await this.prisma.mpSettlement.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '结算单不存在');
    }
    return this.settlementDetailOf(market.id, id);
  }

  async merchantSettlementConfirm(
    payload: MpMerchantTokenPayload,
    body: { id: number; remark: string },
  ): Promise<MpSettlement> {
    const { market, merchant } = await this.merchants.session(payload, true);
    const row = await this.prisma.mpSettlement.findFirst({
      where: { id: body.id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '结算单不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        row.status === 'PAID' ? '结算单已打款' : '结算单已确认',
      );
    }
    const updated = await this.prisma.mpSettlement.update({
      where: { id: row.id },
      data: {
        status: 'CONFIRMED',
        remark: body.remark,
        confirmedAt: new Date(),
      },
    });
    return this.settlementView(updated);
  }

  // ------------------------------------------------------------ 提现

  async withdrawals(
    ownerUserId: string,
    query: {
      status?: string;
      merchantId?: number;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpWithdrawalView>> {
    const market = await this.requireMarket(ownerUserId);
    return this.withdrawalPage(market.id, query);
  }

  async withdrawalAudit(
    ownerUserId: string,
    body: {
      id: number;
      action: 'APPROVE' | 'REJECT';
      auditNote: string;
      fee: number;
    },
  ): Promise<MpWithdrawalView> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpWithdrawal.findFirst({
      where: { id: body.id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该提现申请已处理');
    }
    if (body.action === 'REJECT') {
      if (!body.auditNote.trim()) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写驳回原因');
      }
      const rejected = await this.prisma.mpWithdrawal.update({
        where: { id: row.id },
        data: {
          status: 'REJECTED',
          auditNote: body.auditNote,
          auditedAt: new Date(),
        },
      });
      return this.withdrawalView(rejected);
    }
    const applyAmount = Number(row.applyAmount);
    const fee = money(Math.min(Math.max(0, body.fee), applyAmount));
    const approved = await this.prisma.mpWithdrawal.update({
      where: { id: row.id },
      data: {
        status: 'APPROVED',
        fee,
        actualAmount: money(applyAmount - fee),
        auditNote: body.auditNote,
        auditedAt: new Date(),
      },
    });
    return this.withdrawalView(approved);
  }

  async withdrawalPaid(
    ownerUserId: string,
    body: { id: number; voucher: string },
  ): Promise<MpWithdrawalView> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpWithdrawal.findFirst({
      where: { id: body.id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    }
    if (row.status !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        row.status === 'PAID' ? '提现已打款' : '提现尚未审核通过',
      );
    }
    const updated = await this.prisma.mpWithdrawal.update({
      where: { id: row.id },
      data: {
        status: 'PAID',
        voucher: body.voucher,
        paidAt: new Date(),
      },
    });
    return this.withdrawalView(updated);
  }

  async merchantFinance(
    payload: MpMerchantTokenPayload,
  ): Promise<MpFinanceSummary> {
    const { market, merchant } = await this.merchants.session(payload);
    return this.financeOf(market.id, merchant.id);
  }

  async financeOf(
    marketId: number,
    merchantId: number,
  ): Promise<MpFinanceSummary> {
    const [settlements, withdrawals] = await Promise.all([
      this.prisma.mpSettlement.findMany({
        where: { marketId, merchantId },
        select: { status: true, netAmount: true },
      }),
      this.prisma.mpWithdrawal.findMany({
        where: { marketId, merchantId },
        select: { status: true, applyAmount: true },
      }),
    ]);
    const settledSum = (statuses: string[]) =>
      money(
        settlements
          .filter((row) => statuses.includes(row.status))
          .reduce((total, row) => total + (decimalOf(row.netAmount) ?? 0), 0),
      );
    const withdrawalSum = (statuses: string[]) =>
      money(
        withdrawals
          .filter((row) => statuses.includes(row.status))
          .reduce((total, row) => total + (decimalOf(row.applyAmount) ?? 0), 0),
      );
    const settledAmount = settledSum(['CONFIRMED', 'PAID']);
    const pendingAmount = settledSum(['PENDING']);
    const withdrawalAmount = withdrawalSum(['PAID']);
    const frozenAmount = withdrawalSum(['PENDING', 'APPROVED']);
    return {
      pendingAmount,
      settledAmount,
      withdrawalAmount,
      frozenAmount,
      availableAmount: money(
        Math.max(0, settledAmount - withdrawalAmount - frozenAmount),
      ),
    };
  }

  async merchantWithdrawals(
    payload: MpMerchantTokenPayload,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpWithdrawalView>> {
    const { market, merchant } = await this.merchants.session(payload);
    return this.withdrawalPage(market.id, {
      ...query,
      merchantId: merchant.id,
    });
  }

  async merchantWithdrawalApply(
    payload: MpMerchantTokenPayload,
    body: {
      applyAmount: number;
      bankName: string;
      bankAccount: string;
      accountName: string;
    },
  ): Promise<MpWithdrawalView> {
    const { market, merchant, shop } = await this.merchants.session(
      payload,
      true,
    );
    const summary = await this.financeOf(market.id, merchant.id);
    const applyAmount = money(body.applyAmount);
    if (applyAmount <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '提现金额必须大于 0');
    }
    if (applyAmount > summary.availableAmount) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `可提现余额不足，当前可提 ${summary.availableAmount.toFixed(2)} 元`,
      );
    }
    const created = await this.prisma.mpWithdrawal.create({
      data: {
        marketId: market.id,
        merchantId: merchant.id,
        shopId: shop?.id ?? 0,
        withdrawNo: commerceOrderNo('WD'),
        applyAmount,
        actualAmount: applyAmount,
        bankName: body.bankName,
        bankAccount: body.bankAccount,
        accountName: body.accountName,
        status: 'PENDING',
      },
    });
    return this.withdrawalView(created);
  }

  async merchantWithdrawalCancel(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpWithdrawalView> {
    const { market, merchant } = await this.merchants.session(payload, true);
    const row = await this.prisma.mpWithdrawal.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '仅待审核的提现申请可以撤销',
      );
    }
    const updated = await this.prisma.mpWithdrawal.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        auditNote: '商户主动撤销',
        auditedAt: new Date(),
      },
    });
    return this.withdrawalView(updated);
  }

  // ------------------------------------------------------------ 内部

  private async requireMarket(ownerUserId: string): Promise<MpMarketRow> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { ownerUserId },
    });
    if (!market) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '还没有创建多店铺商城平台，请先在概览页创建市场',
      );
    }
    return market;
  }

  private pickRate(
    merchant: MpMerchantRow,
    rules: MpCommissionRuleRow[],
    defaultRate: number,
  ): MpResolvedRate {
    const own = rules.find(
      (rule) => rule.scopeType === 'MERCHANT' && rule.scopeId === merchant.id,
    );
    if (own) {
      return {
        rate: decimalOf(own.rate) ?? 0,
        scopeType: 'MERCHANT',
        scopeId: own.scopeId,
      };
    }
    const categoryIds = new Set(jsonIds(merchant.categoryIds));
    const category = rules.find(
      (rule) => rule.scopeType === 'CATEGORY' && categoryIds.has(rule.scopeId),
    );
    if (category) {
      return {
        rate: decimalOf(category.rate) ?? 0,
        scopeType: 'CATEGORY',
        scopeId: category.scopeId,
      };
    }
    const platform = rules.find((rule) => rule.scopeType === 'PLATFORM');
    if (platform) {
      return {
        rate: decimalOf(platform.rate) ?? 0,
        scopeType: 'PLATFORM',
        scopeId: 0,
      };
    }
    const merchantRate = decimalOf(merchant.commissionRate);
    return {
      rate: merchantRate ?? defaultRate,
      scopeType: 'MERCHANT',
      scopeId: merchant.id,
    };
  }

  private async scopeName(
    marketId: number,
    ref: { scopeType: MpResolvedRate['scopeType']; scopeId: number },
  ): Promise<string> {
    const names = await this.scopeNames(marketId, [ref]);
    return names.get(`${ref.scopeType}:${ref.scopeId}`) ?? '';
  }

  private async scopeNames(
    marketId: number,
    refs: Array<{ scopeType: MpResolvedRate['scopeType']; scopeId: number }>,
  ): Promise<Map<string, string>> {
    const categoryIds = refs
      .filter((ref) => ref.scopeType === 'CATEGORY')
      .map((ref) => ref.scopeId);
    const merchantIds = refs
      .filter((ref) => ref.scopeType === 'MERCHANT')
      .map((ref) => ref.scopeId);
    const [categories, merchants] = await Promise.all([
      categoryIds.length
        ? this.prisma.mpCategory.findMany({
            where: { id: { in: categoryIds }, marketId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      merchantIds.length
        ? this.prisma.mpMerchant.findMany({
            where: { id: { in: merchantIds }, marketId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const names = new Map<string, string>();
    for (const row of categories) names.set(`CATEGORY:${row.id}`, row.name);
    for (const row of merchants) names.set(`MERCHANT:${row.id}`, row.name);
    for (const ref of refs) {
      if (ref.scopeType === 'PLATFORM') names.set('PLATFORM:0', '平台默认');
    }
    return names;
  }

  private ruleView(
    row: MpCommissionRuleRow,
    names: Map<string, string>,
  ): MpCommissionRuleView {
    return {
      id: row.id,
      marketId: row.marketId,
      scopeType: row.scopeType as MpCommissionRuleView['scopeType'],
      scopeId: row.scopeId,
      scopeName: names.get(`${row.scopeType}:${row.scopeId}`) ?? '',
      rate: decimalOf(row.rate) ?? 0,
      remark: row.remark,
      status: row.status as MpCommissionRuleView['status'],
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private async settlementPage(
    marketId: number,
    query: {
      merchantId?: number;
      shopId?: number;
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpSettlement>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.merchantId ? { merchantId: Number(query.merchantId) } : {}),
      ...(query.shopId ? { shopId: Number(query.shopId) } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { settleNo: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpSettlement.count({ where }),
      this.prisma.mpSettlement.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const shopNames = await this.shopNames(
      marketId,
      rows.map((row) => row.shopId),
    );
    return {
      list: rows.map((row) => this.settlementView(row, shopNames)),
      total,
      page,
      pageSize,
    };
  }

  private async settlementDetailOf(
    marketId: number,
    id: number,
  ): Promise<MpSettlementDetail> {
    const row = await this.prisma.mpSettlement.findFirst({
      where: { id, marketId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '结算单不存在');
    }
    const items = await this.prisma.mpSettlementItem.findMany({
      where: { settlementId: row.id },
      orderBy: { id: 'asc' },
    });
    const shopNames = await this.shopNames(marketId, [row.shopId]);
    return {
      ...this.settlementView(row, shopNames),
      items: items.map((item) => this.settlementItemView(item)),
    };
  }

  private settlementView(
    row: MpSettlementRow,
    shopNames?: Map<number, string>,
  ): MpSettlement {
    return {
      id: row.id,
      settleNo: row.settleNo,
      marketId: row.marketId,
      merchantId: row.merchantId,
      shopId: row.shopId,
      shopName: shopNames?.get(row.shopId) ?? '',
      periodStart: iso(row.periodStart),
      periodEnd: iso(row.periodEnd),
      orderCount: row.orderCount,
      grossAmount: decimalOf(row.grossAmount) ?? 0,
      refundAmount: decimalOf(row.refundAmount) ?? 0,
      commissionAmount: decimalOf(row.commissionAmount) ?? 0,
      netAmount: decimalOf(row.netAmount) ?? 0,
      status: row.status as MpSettlement['status'],
      remark: row.remark,
      voucher: row.voucher,
      confirmedAt: iso(row.confirmedAt),
      paidAt: iso(row.paidAt),
      createdAt: iso(row.createdAt),
    };
  }

  private settlementItemView(row: MpSettlementItemRow): MpSettlementItem {
    return {
      id: row.id,
      settlementId: row.settlementId,
      shopOrderId: row.shopOrderId,
      subOrderNo: row.subOrderNo,
      completedAt: iso(row.completedAt),
      payAmount: decimalOf(row.payAmount) ?? 0,
      refundAmount: decimalOf(row.refundAmount) ?? 0,
      commissionAmount: decimalOf(row.commissionAmount) ?? 0,
      netAmount: decimalOf(row.netAmount) ?? 0,
    };
  }

  /** 一张子单的结算口径：退款按成功退款单汇总，佣金按退款金额同比例冲销。 */
  private settlementLine(row: MpShopOrderRow, refunds: MpRefundRow[]) {
    const payAmount = decimalOf(row.payAmount) ?? 0;
    const rate = decimalOf(row.commissionRate) ?? 0;
    const refundAmount = money(
      refunds
        .filter((refund) => refund.shopOrderId === row.id)
        .reduce((sum, refund) => sum + (decimalOf(refund.amount) ?? 0), 0),
    );
    const commission = decimalOf(row.commissionAmount) ?? 0;
    const revoked = money((refundAmount * rate) / 100);
    const commissionAmount = money(Math.max(0, commission - revoked));
    return {
      shopId: row.shopId,
      shopOrderId: row.id,
      subOrderNo: row.subOrderNo,
      completedAt: row.completedAt,
      payAmount,
      refundAmount,
      commissionAmount,
      netAmount: money(
        Math.max(0, payAmount - refundAmount - commissionAmount),
      ),
    };
  }

  private async withdrawalPage(
    marketId: number,
    query: {
      status?: string;
      merchantId?: number;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpWithdrawalView>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.merchantId ? { merchantId: Number(query.merchantId) } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { withdrawNo: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpWithdrawal.count({ where }),
      this.prisma.mpWithdrawal.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [merchantNames, shopNames] = await Promise.all([
      this.merchantNames(rows.map((row) => row.merchantId)),
      this.shopNames(
        marketId,
        rows.map((row) => row.shopId),
      ),
    ]);
    return {
      list: rows.map((row) =>
        this.withdrawalView(
          row,
          merchantNames.get(row.merchantId) ?? '',
          shopNames.get(row.shopId) ?? '',
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  private withdrawalView(
    row: MpWithdrawalRow,
    merchantName = '',
    shopName = '',
  ): MpWithdrawalView {
    return {
      id: row.id,
      withdrawNo: row.withdrawNo,
      marketId: row.marketId,
      merchantId: row.merchantId,
      merchantName,
      shopId: row.shopId,
      shopName,
      applyAmount: decimalOf(row.applyAmount) ?? 0,
      fee: decimalOf(row.fee) ?? 0,
      actualAmount: decimalOf(row.actualAmount) ?? 0,
      bankName: row.bankName,
      bankAccount: row.bankAccount,
      accountName: row.accountName,
      status: row.status as MpWithdrawalView['status'],
      auditNote: row.auditNote,
      voucher: row.voucher,
      auditedAt: iso(row.auditedAt),
      auditedBy: row.auditedBy,
      paidAt: iso(row.paidAt),
      createdAt: iso(row.createdAt),
    };
  }

  private async merchantNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.mpMerchant.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name] as const));
  }

  private async shopNames(
    marketId: number,
    ids: number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.mpShop.findMany({
      where: { id: { in: unique }, marketId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name] as const));
  }
}
