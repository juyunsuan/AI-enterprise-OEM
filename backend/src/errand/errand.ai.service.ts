import {
  type ErrandAiDispatchResult,
  type ErrandAiOpsResult,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { aiJson } from '../ai/ai-gateway';
import type { PrismaService } from '../prisma/prisma.service';
import type { ErrandPlatformService } from './errand.platform.service';
import type { ErrandSiteService } from './errand.site.service';
import { amount, jsonList, partyOf, toCents, toText } from './errand.shared';

type Candidate = {
  id: number;
  riderNo: string;
  name: string;
  rating: number;
  orderCount: number;
  activeCount: number;
  online: boolean;
  score: number;
  distanceKm: number | null;
};

/**
 * 跑腿 AI 辅助：调度建议与经营复盘。
 *
 * 两件事都走平台统一模型网关（`aiJson`）：模型、渠道、Key 全部沿用账号在
 * 「模型设置」里的配置，未配置或调用失败时退回规则式结论，绝不把业务卡死；
 * 用量按 module=errand 记入 usage_events，是否扣分由平台科目配置决定，不在这里开新扣费。
 */
export class ErrandAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly platform: ErrandPlatformService,
  ) {}

  private scoreOf(
    rating: number,
    orderCount: number,
    activeCount: number,
    distanceKm: number | null,
  ): number {
    // 距离优先、评分次之、在途单越多越不该再压单
    return (
      Math.round(
        (rating * 10 +
          Math.min(orderCount, 200) * 0.15 -
          activeCount * 4 -
          (distanceKm ?? 30) * 2) *
          10,
      ) / 10
    );
  }

  private distance(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
  ): number | null {
    if (!fromLng || !fromLat || !toLng || !toLat) return null;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(toLat - fromLat);
    const dLng = toRad(toLng - fromLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(fromLat)) *
        Math.cos(toRad(toLat)) *
        Math.sin(dLng / 2) ** 2;
    return (
      Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) /
      100
    );
  }

  private async candidates(
    siteId: number,
    cityId: number,
    serviceType: string,
    pickup: { fromLng: number; fromLat: number },
  ): Promise<Candidate[]> {
    const riders = await this.prisma.errandRider.findMany({
      where: { siteId, cityId, status: 'APPROVED' },
      orderBy: [{ online: 'desc' }, { rating: 'desc' }, { id: 'asc' }],
      take: 40,
    });
    if (!riders.length) return [];
    const active = await this.prisma.errandOrder.groupBy({
      by: ['riderId'],
      where: {
        siteId,
        riderId: { in: riders.map((row) => row.id) },
        status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
      },
      _count: { _all: true },
    });
    const activeMap = new Map(
      active.map((row) => [row.riderId, row._count._all]),
    );
    const rule = await this.prisma.errandRule.findUnique({ where: { cityId } });
    const radius = Number(rule?.acceptRadiusKm) || 0;
    return riders
      .filter((row) => {
        const types = jsonList<unknown>(row.serviceTypes).map((item) =>
          String(item),
        );
        return types.length === 0 || types.includes(serviceType);
      })
      .map((row) => {
        const activeCount = activeMap.get(row.id) ?? 0;
        const distanceKm = this.distance(
          Number(row.lng) || 0,
          Number(row.lat) || 0,
          pickup.fromLng,
          pickup.fromLat,
        );
        return {
          id: row.id,
          riderNo: row.riderNo,
          name: row.name,
          rating: Number(row.rating) || 5,
          orderCount: row.orderCount,
          activeCount,
          online: row.online,
          distanceKm,
          score: this.scoreOf(
            Number(row.rating) || 5,
            row.orderCount,
            activeCount,
            distanceKm,
          ),
        };
      })
      .filter(
        (item) =>
          radius <= 0 || item.distanceKm === null || item.distanceKm <= radius,
      )
      .sort((a, b) => b.score - a.score);
  }

  async dispatch(
    user: CurrentUser,
    orderId: number,
  ): Promise<ErrandAiDispatchResult> {
    await this.platform.requireAi();
    const ctx = await this.sites.require(user);
    const order = await this.prisma.errandOrder.findFirst({
      where: { id: orderId, siteId: ctx.row.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const city = await this.prisma.errandCity.findFirst({
      where: { id: order.cityId, siteId: ctx.row.id, status: 'ENABLED' },
      select: { id: true },
    });
    if (!city) {
      return {
        orderNo: order.orderNo,
        candidates: [],
        advice: '该服务城市已停用，暂不能派单；请先到「服务城市」重新开通。',
        model: '',
        aiGenerated: false,
      };
    }
    const pickup = partyOf(order.fromParty);
    const pool = await this.candidates(
      ctx.row.id,
      order.cityId,
      order.serviceType,
      {
        fromLng: pickup.lng,
        fromLat: pickup.lat,
      },
    );
    const online = pool.filter((item) => item.online);
    if (!online.length) {
      return {
        orderNo: order.orderNo,
        candidates: [],
        advice:
          '当前没有在接单中的骑手：先让骑手把工作台切到「接单中」，或人工电话联系骑手接单。',
        model: '',
        aiGenerated: false,
      };
    }
    const fallback = () => ({
      orderNo: order.orderNo,
      candidates: online.slice(0, 3).map((item) => ({
        riderId: item.id,
        riderNo: item.riderNo,
        name: item.name,
        score: item.score,
        reason: `评分 ${item.rating.toFixed(1)}、累计 ${item.orderCount} 单、在途 ${item.activeCount} 单${
          item.activeCount === 0 ? '（可立即接单）' : ''
        }`,
      })),
      advice:
        '按「评分优先、在途单越少越优先」的规则给出候选；规则只用于排序，最终派单仍由你决定。',
      model: '',
      aiGenerated: false,
    });
    const prompt = [
      '你是同城跑腿调度员。请根据订单与在线骑手情况，给出前 3 名候选骑手与派单建议。',
      '只输出 JSON：{"ranking":[{"riderId":数字,"score":数字,"reason":"不超过60字"}],"advice":"不超过120字"}。',
      `订单：${JSON.stringify({
        orderNo: order.orderNo,
        serviceType: order.serviceType,
        distanceKm: Number(order.distanceKm),
        weightKg: Number(order.weightKg),
        tip: amount(order.tip),
        from: order.fromParty,
        to: order.toParty,
        goodsDesc: order.goodsDesc,
      })}`,
      `在线骑手：${JSON.stringify(
        online.map((item) => ({
          riderId: item.id,
          name: item.name,
          rating: item.rating,
          orderCount: item.orderCount,
          activeCount: item.activeCount,
          distanceKm: item.distanceKm,
        })),
      )}`,
    ].join('\n');
    const ai = await aiJson<{
      ranking: { riderId: number; score?: number; reason?: string }[];
      advice: string;
    }>(this.prisma, {
      userId: user.userId,
      module: 'errand',
      operation: 'dispatch',
      messages: [
        {
          role: 'system',
          content: '你只输出合法 JSON，不输出解释或 Markdown。',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 600,
      validate: (data) => {
        const ranking = Array.isArray(data.ranking) ? data.ranking : [];
        const byId = new Map(online.map((item) => [item.id, item]));
        const parsed = ranking
          .map((item: { riderId?: unknown; reason?: unknown }) => {
            const riderId = Number(item?.riderId);
            const candidate = byId.get(riderId);
            if (!candidate) return null;
            return {
              riderId,
              reason: toText(item?.reason).slice(0, 300),
            };
          })
          .filter((item): item is { riderId: number; reason: string } => !!item)
          .slice(0, 3);
        if (!parsed.length) return null;
        return {
          ranking: parsed,
          advice: toText(data.advice).slice(0, 1000),
        };
      },
    });
    if (!ai) return fallback();
    const byId = new Map(online.map((item) => [item.id, item]));
    return {
      orderNo: order.orderNo,
      candidates: ai.data.ranking.map((item) => {
        const candidate = byId.get(item.riderId)!;
        return {
          riderId: candidate.id,
          riderNo: candidate.riderNo,
          name: candidate.name,
          score: candidate.score,
          reason:
            item.reason ||
            `评分 ${candidate.rating.toFixed(1)}，在途 ${candidate.activeCount} 单`,
        };
      }),
      advice: toText(ai.data.advice) || '按候选顺序联系骑手派单。',
      model: ai.model,
      aiGenerated: true,
    };
  }

  async ops(user: CurrentUser, days: number): Promise<ErrandAiOpsResult> {
    await this.platform.requireAi();
    const ctx = await this.sites.require(user);
    const from = new Date(Date.now() - Math.max(1, days) * 86400_000);
    const [total, paid, completed, cancelled, pending, online, amountAgg] =
      await Promise.all([
        this.prisma.errandOrder.count({
          where: { siteId: ctx.row.id, createdAt: { gte: from } },
        }),
        this.prisma.errandOrder.count({
          where: {
            siteId: ctx.row.id,
            createdAt: { gte: from },
            payState: 'PAID',
          },
        }),
        this.prisma.errandOrder.count({
          where: {
            siteId: ctx.row.id,
            createdAt: { gte: from },
            status: 'COMPLETED',
          },
        }),
        this.prisma.errandOrder.count({
          where: {
            siteId: ctx.row.id,
            createdAt: { gte: from },
            status: 'CANCELLED',
          },
        }),
        this.prisma.errandOrder.count({
          where: {
            siteId: ctx.row.id,
            status: {
              in: [
                'PENDING_PAY',
                'PENDING_ACCEPT',
                'ACCEPTED',
                'PICKED_UP',
                'DELIVERING',
                'ARRIVED',
              ],
            },
          },
        }),
        this.prisma.errandRider.count({
          where: { siteId: ctx.row.id, status: 'APPROVED', online: true },
        }),
        this.prisma.errandOrder.aggregate({
          where: {
            siteId: ctx.row.id,
            createdAt: { gte: from },
            payState: 'PAID',
          },
          _sum: { totalAmount: true },
        }),
      ]);
    const gmv = amount(amountAgg._sum.totalAmount);
    const stats = {
      days,
      total,
      paid,
      completed,
      cancelled,
      pending,
      onlineRiders: online,
      gmv,
      completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
      cancelRate: total ? Math.round((cancelled / total) * 1000) / 10 : 0,
    };
    const fallback = (): ErrandAiOpsResult => {
      const suggestions: string[] = [];
      if (!online)
        suggestions.push(
          '当前没有在线骑手：优先让通过审核的骑手切换「接单中」，避免新单无人接。',
        );
      if (stats.cancelRate >= 15)
        suggestions.push(
          `近 ${days} 天取消率 ${stats.cancelRate}%，建议核对计价与接单时效。`,
        );
      if (stats.pending >= 5)
        suggestions.push(
          `在途与待处理订单 ${stats.pending} 笔，建议安排专人盯超时单。`,
        );
      if (!suggestions.length)
        suggestions.push('保持当前接单节奏，关注高峰时段是否加派骑手。');
      return {
        summary: `近 ${days} 天共 ${total} 单，已支付 ${paid} 单、完成 ${completed} 单、取消 ${cancelled} 单；已支付金额 ${gmv} 元，当前在线骑手 ${online} 人。`,
        suggestions,
        model: '',
        aiGenerated: false,
      };
    };
    const ai = await aiJson<{ summary: string; suggestions: string[] }>(
      this.prisma,
      {
        userId: user.userId,
        module: 'errand',
        operation: 'ops_report',
        messages: [
          {
            role: 'system',
            content:
              '你是同城跑腿运营顾问。只输出 JSON，不输出解释或 Markdown。',
          },
          {
            role: 'user',
            content: [
              '根据以下经营数据写一段中文复盘，并给出 2-4 条可执行建议。',
              '输出 JSON：{"summary":"不超过160字","suggestions":["不超过50字"]}。',
              `数据：${JSON.stringify(stats)}`,
            ].join('\n'),
          },
        ],
        maxTokens: 700,
        validate: (data) => {
          const summary = toText(data.summary).slice(0, 2000);
          const suggestions = Array.isArray(data.suggestions)
            ? data.suggestions
                .map((item) => String(item || '').slice(0, 300))
                .filter(Boolean)
                .slice(0, 4)
            : [];
          if (!summary) return null;
          return { summary, suggestions };
        },
      },
    );
    if (!ai) return fallback();
    return {
      summary: ai.data.summary,
      suggestions: ai.data.suggestions.length
        ? ai.data.suggestions
        : fallback().suggestions,
      model: ai.model,
      aiGenerated: true,
    };
  }

  /** 未使用但保留：页面若需要把「今日收入」拆成分账口径，可直接复用。 */
  centsOf(value: unknown): number {
    return toCents(value);
  }
}
