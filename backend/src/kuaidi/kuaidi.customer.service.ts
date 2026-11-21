import {
  type KuaidiAddress,
  type KuaidiAddressSaveBody,
  type KuaidiCustomer,
  type KuaidiPublicLoginBody,
  type KuaidiPublicLoginResult,
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
import type { KuaidiSiteService } from './kuaidi.site.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import {
  KUAIDI_SCENE,
  amount,
  clip,
  fromCents,
  iso,
  pageArgs,
} from './kuaidi.shared';

type CustomerRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  openid: string;
  unionid: string;
  nickname: string;
  avatar: string;
  orderCount: number;
  paidOrderCount: number;
  totalAmount: unknown;
  lastOrderAt: Date | null;
  status: boolean;
  createdAt: Date;
};

type AddressRow = {
  id: number;
  siteId: number;
  type: string;
  name: string;
  mobile: string;
  province: string;
  city: string;
  district: string;
  address: string;
  isDefault: boolean;
  createdAt: Date;
};

/**
 * C 端顾客：小程序微信登录建档 + 店主侧顾客台账 + 地址簿。
 *
 * 顾客令牌按 scene(=EXPRESS)+siteId+customerId 签发，进不了 `/enterprise/**`；
 * 反向的店主查询也一律带 `siteId` 双条件，互不越权。匿名下单不建档。
 */
export class KuaidiCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: KuaidiSiteService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 店主侧台账 ----------

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<PageResponse<KuaidiCustomer>> {
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
      this.prisma.kuaidiCustomer.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.kuaidiCustomer.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as CustomerRow[]).map((row) => ({
        id: row.id,
        siteId: row.siteId,
        openid: row.openid,
        nickname: row.nickname,
        avatar: row.avatar,
        orderCount: row.orderCount,
        paidOrderCount: row.paidOrderCount,
        totalAmount: amount(row.totalAmount),
        lastOrderAt: row.lastOrderAt ? iso(row.lastOrderAt) : null,
        status: row.status,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  /** 停用顾客：只挡后续登录与下单，历史订单与已寄出的件不受影响。 */
  async setStatus(
    user: CurrentUser,
    siteId: number,
    id: number,
    status: boolean,
  ) {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.kuaidiCustomer.findFirst({
      where: { id: Number(id), siteId: site.siteId },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    await this.prisma.kuaidiCustomer.update({
      where: { id: row.id },
      data: { status },
    });
    return {
      ok: true,
      message: status
        ? '已恢复该顾客的登录与下单'
        : '已停用该顾客：不能再用微信登录下单，历史订单不受影响',
    };
  }

  // ---------- C 端登录 ----------

  /** wx.login 的 code → openid → 建档 → 顾客令牌。 */
  async loginByCode(
    body: KuaidiPublicLoginBody,
  ): Promise<KuaidiPublicLoginResult> {
    const code = clip(body.code, 128).trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    }
    const site = await this.sites.byCode(String(body.site ?? ''));
    if (!site) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '寄件点不存在或已关闭，请返回首页重新选择寄件点',
      );
    }
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该寄件平台尚未上线营业，暂时无法登录',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('kuaidi', site.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const runtime = await this.miniApp.requireRuntime(this.sites.subject(site));
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.kuaidiCustomer.upsert({
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
        scene: KUAIDI_SCENE,
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
    if (payload.scene !== KUAIDI_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不适用本寄件平台，请重新进入小程序',
      );
    }
    const site = await this.prisma.kuaidiSite.findUnique({
      where: { id: payload.shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!site || site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在或已关闭');
    }
    // 启动闸门：令牌通道与匿名浏览同一口径，未启动时一并停服
    if (!(await toolOpen('kuaidi', site.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const customer = (await this.prisma.kuaidiCustomer.findFirst({
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
    const row = await this.prisma.kuaidiCustomer.upsert({
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

  async touchOrder(
    db: PrismaService | Prisma.TransactionClient,
    siteId: number,
    customerId: number,
  ): Promise<void> {
    if (!customerId) return;
    await db.kuaidiCustomer.updateMany({
      where: { id: customerId, siteId },
      data: { orderCount: { increment: 1 }, lastOrderAt: new Date() },
    });
  }

  /** 支付成功后累计消费：只加不减，退款由店主在订单上单独登记。 */
  async touchPaid(
    db: PrismaService | Prisma.TransactionClient,
    siteId: number,
    customerId: number,
    cents: number,
  ): Promise<void> {
    if (!customerId) return;
    await db.kuaidiCustomer.updateMany({
      where: { id: customerId, siteId },
      data: {
        paidOrderCount: { increment: 1 },
        totalAmount: { increment: fromCents(Math.max(0, cents)) },
      },
    });
  }

  // ---------- 公开：地址簿 ----------

  async addresses(
    site: { siteId: number },
    openid: string,
  ): Promise<KuaidiAddress[]> {
    const rows = await this.prisma.kuaidiAddress.findMany({
      where: { siteId: site.siteId, openid: clip(openid, 64) },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return (rows as unknown as AddressRow[]).map((row) => this.toAddress(row));
  }

  async saveAddress(
    site: { siteId: number },
    customerId: number,
    openid: string,
    body: KuaidiAddressSaveBody,
  ): Promise<KuaidiAddress> {
    const key = clip(openid, 64);
    if (!key) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先用微信登录后再保存地址',
      );
    }
    const data = {
      type: body.type,
      name: clip(body.name, 40),
      mobile: clip(body.mobile, 20),
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      address: clip(body.address, 200),
      isDefault: Boolean(body.isDefault),
    };
    const row =
      body.id > 0
        ? await (async () => {
            const current = await this.prisma.kuaidiAddress.findFirst({
              where: { id: body.id, siteId: site.siteId, openid: key },
              select: { id: true },
            });
            if (!current)
              throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
            return this.prisma.kuaidiAddress.update({
              where: { id: current.id },
              data,
            });
          })()
        : await this.prisma.kuaidiAddress.create({
            data: { siteId: site.siteId, customerId, openid: key, ...data },
          });
    if (data.isDefault) {
      await this.prisma.kuaidiAddress.updateMany({
        where: {
          siteId: site.siteId,
          openid: key,
          type: data.type,
          id: { not: row.id },
        },
        data: { isDefault: false },
      });
    }
    return this.toAddress(row);
  }

  async removeAddress(site: { siteId: number }, openid: string, id: number) {
    const key = clip(openid, 64);
    const row = await this.prisma.kuaidiAddress.findFirst({
      where: { id: Number(id), siteId: site.siteId, openid: key },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
    await this.prisma.kuaidiAddress.delete({ where: { id: row.id } });
    return { ok: true, message: '地址已删除' };
  }

  private toAddress(row: AddressRow): KuaidiAddress {
    return {
      id: row.id,
      type: row.type === 'RECEIVER' ? 'RECEIVER' : 'SENDER',
      name: row.name,
      mobile: row.mobile,
      province: row.province,
      city: row.city,
      district: row.district,
      address: row.address,
      isDefault: row.isDefault,
      createdAt: iso(row.createdAt),
    };
  }
}
