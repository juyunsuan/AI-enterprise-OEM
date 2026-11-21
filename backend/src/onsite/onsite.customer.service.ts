import type { Prisma } from '../../generated/prisma';
import type { OnsiteCustomerRow } from '@enterprise/contracts';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import {
  issueCustomerToken,
  type CustomerTokenPayload,
} from '../private-mini/customer-token';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { centsOf } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';
import { ONSITE_SCENE } from './onsite.shop.service';

export type CustomerProfile = {
  customerId: number;
  nickname: string;
  avatar: string;
  phone: string;
  shopCode: string;
  shopName: string;
};

/**
 * C 端顾客：与站内账号无关，一个店铺一套顾客。
 *
 * 与参考源码不同的一点：那里顾客与代理商共用一张表，本站把「店铺顾客」独立成
 * `onsite_customers`，唯一键是 `(shopId, openid)`——同一微信号在 A 店和 B 店
 * 是两个独立顾客，互不可见，这是租户隔离的地基。
 */
export class OnsiteCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly shops: OnsiteShopService,
  ) {}

  /** 首次进入即建档：上门服务的顾客没有「先注册」这一步，扫小程序码就是注册。 */
  async loginByCode(shopCode: string, code: string) {
    const shop = await this.shops.findByCode(shopCode);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺码不存在，请确认小程序来源',
      );
    }
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已被平台暂停服务，请联系店铺方处理',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('onsite', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: shop.ownerUserId,
      scene: ONSITE_SCENE,
      shopId: shop.shopId,
      shopName: shop.shopName,
    });
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.onsiteCustomer.upsert({
      where: {
        shopId_openid: { shopId: shop.shopId, openid: session.openId },
      },
      create: {
        shopId: shop.shopId,
        openid: session.openId,
        unionId: session.unionId,
        nickname: '',
        lastLoginAt: new Date(),
      },
      update: {
        ...(session.unionId ? { unionId: session.unionId } : {}),
        lastLoginAt: new Date(),
      },
    });
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被店铺方限制下单，如需恢复请联系店铺客服',
      );
    }
    const token = issueCustomerToken({
      scene: ONSITE_SCENE,
      shopId: shop.shopId,
      customerId: row.id,
      openid: row.openid,
    });
    const profile: CustomerProfile = {
      customerId: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      shopCode: shop.shopCode,
      shopName: shop.shopName,
    };
    return { token, profile };
  }

  // ---------- 服务地址簿（一店一套，双条件过滤）----------

  async listAddresses(shopId: number, customerId: number) {
    const rows = await this.prisma.onsiteCustomerAddress.findMany({
      where: { shopId, customerId },
      orderBy: [{ isDefault: 'desc' }, { isTop: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toAddress(row));
  }

  private toAddress(row: {
    id: number;
    contactName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    lng: unknown;
    lat: unknown;
    cityId: number;
    tag: string;
    isDefault: boolean;
    isTop: boolean;
  }) {
    return {
      id: row.id,
      contactName: row.contactName,
      phone: row.phone,
      province: row.province,
      city: row.city,
      district: row.district,
      detail: row.detail,
      lng: Number(row.lng ?? 0),
      lat: Number(row.lat ?? 0),
      cityId: row.cityId,
      tag: row.tag,
      isDefault: row.isDefault,
      isTop: row.isTop,
    };
  }

  async saveAddress(
    shopId: number,
    customerId: number,
    body: {
      id: number;
      contactName: string;
      phone: string;
      province: string;
      city: string;
      district: string;
      detail: string;
      lng: number;
      lat: number;
      cityId: number;
      tag: string;
      isDefault: boolean;
    },
  ) {
    if (!body.detail.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写详细地址（门牌号要写清）',
      );
    }
    const data = {
      contactName: body.contactName.trim().slice(0, 60),
      phone: body.phone.trim().slice(0, 32),
      province: body.province.trim().slice(0, 60),
      city: body.city.trim().slice(0, 60),
      district: body.district.trim().slice(0, 60),
      detail: body.detail.trim().slice(0, 200),
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      cityId: Math.max(0, Math.round(body.cityId) || 0),
      tag: body.tag.trim().slice(0, 20),
      isDefault: body.isDefault === true,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.onsiteCustomerAddress.updateMany({
          where: { shopId, customerId },
          data: { isDefault: false },
        });
      }
      if (body.id) {
        const owned = await tx.onsiteCustomerAddress.findFirst({
          where: { id: body.id, shopId, customerId },
        });
        if (!owned) {
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            '地址不存在或不属于当前账号',
          );
        }
        return tx.onsiteCustomerAddress.update({
          where: { id: body.id },
          data,
        });
      }
      const count = await tx.onsiteCustomerAddress.count({
        where: { shopId, customerId },
      });
      return tx.onsiteCustomerAddress.create({
        data: {
          shopId,
          customerId,
          ...data,
          // 第一条地址默认设为常用，省掉顾客一次点击
          isDefault: data.isDefault || count === 0,
        },
      });
    });
    return this.toAddress(row);
  }

  async removeAddress(shopId: number, customerId: number, id: number) {
    const row = await this.prisma.onsiteCustomerAddress.findFirst({
      where: { id, shopId, customerId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '地址不存在或不属于当前账号',
      );
    await this.prisma.onsiteCustomerAddress.delete({ where: { id: row.id } });
    return { removed: true };
  }

  /** 下单要用地址：必须同时命中 shopId + customerId，防跨店跨人取址。 */
  async requireAddress(shopId: number, customerId: number, addressId: number) {
    const row = await this.prisma.onsiteCustomerAddress.findFirst({
      where: { id: addressId, shopId, customerId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '地址不存在，请重新选择服务地址',
      );
    }
    return row;
  }

  /** 令牌换顾客行：所有 C 端读写都必须带上 shopId + customerId 双条件。 */
  async requireCustomer(payload: CustomerTokenPayload) {
    if (payload.scene !== ONSITE_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态无效，请重新进入小程序',
      );
    }
    const row = await this.prisma.onsiteCustomer.findUnique({
      where: { id: payload.customerId },
    });
    if (
      !row ||
      row.shopId !== payload.shopId ||
      row.openid !== payload.openid
    ) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被店铺方限制使用',
      );
    }
    return row;
  }

  /** 成交统计：只取已支付订单，按顾客聚合单量、金额与最近成交时间。 */
  private async paidStats(shopId: number, customerIds: number[]) {
    const orders = await this.prisma.onsiteOrder.findMany({
      where: {
        shopId,
        customerId: { in: customerIds },
        payStatus: 'PAID',
      },
      select: { customerId: true, payAmount: true, paidAt: true },
    });
    const stats = new Map<
      number,
      { count: number; cents: number; lastAt: Date }
    >();
    for (const order of orders) {
      const hit = stats.get(order.customerId) ?? {
        count: 0,
        cents: 0,
        lastAt: new Date(0),
      };
      hit.count += 1;
      hit.cents += centsOf(order.payAmount);
      if (order.paidAt && order.paidAt > hit.lastAt) hit.lastAt = order.paidAt;
      stats.set(order.customerId, hit);
    }
    return stats;
  }

  private customerRow(
    row: Prisma.OnsiteCustomerGetPayload<Record<string, never>>,
    stat?: { count: number; cents: number; lastAt: Date },
  ): OnsiteCustomerRow {
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      gender: row.gender,
      city: row.city,
      status: row.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      orderCount: stat?.count ?? 0,
      paidAmountCents: stat?.cents ?? 0,
      lastOrderAt:
        stat && stat.lastAt.getTime() ? stat.lastAt.toISOString() : '',
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 店主侧顾客列表：成交单量与金额只算已支付订单，
   * 「下过单但没付」不能算进复购，否则顾客价值会被高估。
   */
  async list(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const keyword = text(query.keyword, '');
    const status = text(query.status, 'ALL');
    const where = {
      shopId: shop.shopId,
      ...(status === 'ACTIVE' || status === 'BLOCKED' ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { phone: { contains: keyword } },
              { nickname: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteCustomer.count({ where }),
      this.prisma.onsiteCustomer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const stats = await this.paidStats(
      shop.shopId,
      rows.map((row) => row.id),
    );
    return pageOf(
      rows.map((row) => this.customerRow(row, stats.get(row.id))),
      total,
      page,
      pageSize,
    );
  }

  /** 拉黑/恢复：只影响后续下单，历史订单与评价都不动。 */
  async setStatus(
    user: CurrentUser,
    shopId: string,
    input: { id: number; status: string; remark: string },
  ): Promise<OnsiteCustomerRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const exist = await this.prisma.onsiteCustomer.findFirst({
      where: { id: input.id, shopId: shop.shopId },
    });
    if (!exist) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const status = input.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE';
    if (status === 'BLOCKED' && !input.remark.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写拉黑原因：限制顾客使用要留下依据，也方便后续恢复',
      );
    }
    const row = await this.prisma.onsiteCustomer.update({
      where: { id: exist.id },
      data: { status },
    });
    await this.audit(
      user.userId,
      'onsite.customer.status',
      `#${row.id}（${row.phone || row.nickname || '未填手机号'}）→ ${status} ${input.remark.trim()}`,
    );
    const stats = await this.paidStats(shop.shopId, [row.id]);
    return this.customerRow(row, stats.get(row.id));
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
