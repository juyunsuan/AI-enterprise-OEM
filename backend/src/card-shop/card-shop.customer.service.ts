import {
  type CardShopCustomer,
  type CardShopPublicLoginBody,
  type CardShopPublicLoginResult,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { CardShopSiteService } from './card-shop.site.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import {
  CARD_SHOP_SCENE,
  amount,
  clip,
  iso,
  pageArgs,
} from './card-shop.shared';

type CustomerRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  openid: string;
  unionid: string;
  nickname: string;
  avatar: string;
  orderCount: number;
  lastOrderAt: Date | null;
  status: boolean;
  createdAt: Date;
};

/**
 * C 端顾客：小程序微信登录建档 + 店主侧顾客台账。
 *
 * 与站内账号物理隔离——这张表只按 `siteId + openid` 定位，顾客令牌走底座派生的
 * `private-mini-customer` 签发体系，进不了 `/enterprise/**`；反过来店主也拿顾客 id
 * 做不了任何越权读写，因为一切查询都带 `siteId` 双条件。
 *
 * 匿名下单不建档：只有真的用微信登录过（或下过带 openid 的单）才落这张表。
 */
export class CardShopCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 店主侧台账 ----------

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopCustomer>> {
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = { siteId };
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { openid: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cardShopCustomer.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopCustomer.count({ where }),
    ]);
    const list = rows as unknown as CustomerRow[];
    const ids = list.map((row) => row.id);
    const stats = ids.length
      ? await this.prisma.cardShopOrder.groupBy({
          by: ['customerId'],
          where: { siteId, customerId: { in: ids }, payState: 'PAID' },
          _count: { _all: true },
          _sum: { totalAmount: true },
        })
      : [];
    const statMap = new Map(stats.map((row) => [row.customerId, row]));
    return pageOf(
      list.map((row) => ({
        id: row.id,
        siteId: row.siteId,
        openid: row.openid,
        nickname: row.nickname,
        avatar: row.avatar,
        orderCount: row.orderCount,
        paidOrderCount: statMap.get(row.id)?._count._all || 0,
        totalAmount: amount(statMap.get(row.id)?._sum.totalAmount),
        lastOrderAt: row.lastOrderAt ? iso(row.lastOrderAt) : null,
        status: row.status,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  /** 停用顾客：只挡后续登录与下单，历史订单与已出卡密不受影响。 */
  async setStatus(
    user: CurrentUser,
    siteId: number,
    id: number,
    status: boolean,
  ) {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.cardShopCustomer.findFirst({
      where: { id: Number(id), siteId: site.siteId },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    await this.prisma.cardShopCustomer.update({
      where: { id: row.id },
      data: { status },
    });
    return {
      ok: true,
      message: status
        ? '已恢复该顾客的登录与下单'
        : '已停用该顾客：不能再用微信登录下单，历史订单与已发卡密不受影响',
    };
  }

  // ---------- C 端登录 ----------

  /** wx.login 的 code → openid → 建档 → 顾客令牌。 */
  async loginByCode(
    body: CardShopPublicLoginBody,
  ): Promise<CardShopPublicLoginResult> {
    const code = clip(body.code, 128).trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    }
    const site = await this.sites.byCode(String(body.site ?? ''));
    if (!site) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '站点不存在：请确认小程序包的 config.js 已注入站点码',
      );
    }
    if (site.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `该商店已暂停营业${site.offReason ? `（${site.offReason}）` : ''}，请联系店方处理`,
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('card-shop', site.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该商店尚未上线营业，暂时无法登录',
      );
    }
    const runtime = await this.miniApp.requireRuntime(this.sites.subject(site));
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.cardShopCustomer.upsert({
      where: { siteId_openid: { siteId: site.id, openid: session.openId } },
      create: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        openid: session.openId,
        unionid: session.unionId || '',
      },
      update: session.unionId ? { unionid: session.unionId } : {},
    });
    if (!row.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    return {
      token: issueCustomerToken({
        scene: CARD_SHOP_SCENE,
        shopId: site.id,
        customerId: row.id,
        openid: row.openid,
      }),
      customerId: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
    };
  }

  /**
   * 校验顾客令牌并回到站点上下文。
   * 令牌里的 shopId 是唯一可信来源：端上传的站点码只当展示用，越权判定一律以令牌为准。
   */
  async identity(token: string) {
    const payload = parseCustomerToken(token);
    if (payload.scene !== CARD_SHOP_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不适用本商店，请重新进入小程序',
      );
    }
    const site = await this.prisma.cardShopSite.findUnique({
      where: { id: payload.shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!site || site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商店不存在或已关闭');
    }
    // 启动闸门：令牌通道与匿名浏览同一口径，未启动时一并停服
    if (!(await toolOpen('card-shop', site.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const customer = (await this.prisma.cardShopCustomer.findFirst({
      where: { id: payload.customerId, siteId: payload.shopId },
    })) as unknown as CustomerRow | null;
    if (!customer) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (!customer.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    return {
      siteId: payload.shopId,
      customerId: customer.id,
      openid: customer.openid,
      ownerUserId: site.ownerUserId,
    };
  }

  /**
   * 下单时按 openid 建档/更新（未登录的匿名单 openid 为空，不落顾客表）。
   * 返回 0 表示这单是匿名单。
   */
  async ensureForOrder(
    site: { id: number; ownerUserId: string },
    openid: string,
  ): Promise<number> {
    const normalized = clip(openid, 64).trim();
    if (!normalized) return 0;
    const row = await this.prisma.cardShopCustomer.upsert({
      where: { siteId_openid: { siteId: site.id, openid: normalized } },
      create: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        openid: normalized,
      },
      update: {},
    });
    if (!row.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    return row.id;
  }

  /** 成单后累计统计：只在这单确实挂了顾客时执行（出卡在事务里，所以要能传客户端）。 */
  async touchOrder(
    db: PrismaService | Prisma.TransactionClient,
    siteId: number,
    customerId: number,
  ): Promise<void> {
    if (!customerId) return;
    await db.cardShopCustomer.updateMany({
      where: { id: customerId, siteId },
      data: { orderCount: { increment: 1 }, lastOrderAt: new Date() },
    });
  }

  /** 「我的订单」：按顾客取最近订单号，越权由 siteId + customerId 双条件挡住。 */
  async myOrderIds(siteId: number, customerId: number): Promise<number[]> {
    if (!customerId) return [];
    const rows = await this.prisma.cardShopOrder.findMany({
      where: { siteId, customerId },
      select: { id: true },
      orderBy: [{ id: 'desc' }],
      take: 200,
    });
    return rows.map((row) => row.id);
  }
}
