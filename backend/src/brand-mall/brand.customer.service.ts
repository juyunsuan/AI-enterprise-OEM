import type {
  BrandCartItem,
  BrandCustomer,
  BrandCustomerAddress,
  BrandCustomerBill,
  BrandCustomerDetail,
  BrandPublicAddressBody,
  BrandPublicLoginBody,
  BrandPublicSession,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import {
  issueCustomerToken,
  parseCustomerToken,
  type CustomerTokenPayload,
} from '../private-mini/customer-token';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { ordersOf } from './brand.order.mapper';
import type { BrandShopService } from './brand.shop.service';
import { noopScrmSink, type BrandScrmSink } from './brand.scrm.service';
import { scrmCustomerLabel } from '../commerce-core/scrm-port';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { amount, clip, intIn, iso, BRAND_SCENE } from './brand.shared';

/** C 端顾客在库里的形状（Prisma 的 Decimal 在类型上是 unknown，这里统一收口）。 */
type CustomerRecord = {
  id: number;
  shopId: number;
  nickname: string;
  avatar: string;
  phone: string;
  gender: number;
  level: string;
  points: number;
  balance: unknown;
  remark: string;
  source: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

type AddressRecord = {
  id: number;
  customerId: number;
  realName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  postalCode: string;
  isDefault: boolean;
  tag: string;
};

const SOURCE_LABELS = new Set(['MINIPROGRAM', 'H5', 'QR', 'MANUAL']);

function sourceOf(value: string): BrandCustomer['source'] {
  return SOURCE_LABELS.has(value)
    ? (value as BrandCustomer['source'])
    : 'MINIPROGRAM';
}

/**
 * C 端顾客域：登录建档、地址簿、购物车，以及店主侧的顾客运营读接口。
 *
 * 两条不可越的线：
 * 1. 顾客令牌只在本模块有效（底座按 issuer 派生密钥），进不了 `/enterprise/**`；
 * 2. 一切读写都带 `shopId + customerId` 双条件，**端上传的 id 只当筛选条件用**，
 *    绝不拿它单独定位数据，否则跨店串号。
 */
export class BrandCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly shops: BrandShopService,
    private readonly scrm: BrandScrmSink = noopScrmSink,
  ) {}

  // ---------- 令牌与会话 ----------

  /** 解析并校验顾客令牌：scene 必须是 BRAND，店铺必须还在。 */
  async identity(token: string) {
    const payload: CustomerTokenPayload = parseCustomerToken(token);
    if (payload.scene !== BRAND_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不适用本商城，请重新进入小程序',
      );
    }
    const shop = await this.prisma.brandShop.findUnique({
      where: { id: payload.shopId },
    });
    if (!shop || shop.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已关闭');
    }
    const customer = await this.prisma.brandCustomer.findFirst({
      where: { id: payload.customerId, shopId: payload.shopId },
    });
    if (!customer) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (customer.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被店铺方限制使用，如需恢复请联系店铺客服',
      );
    }
    return {
      shopId: payload.shopId,
      customerId: payload.customerId,
      openid: payload.openid,
      ownerUserId: shop.ownerUserId,
    };
  }

  /** wx.login 的 code → openid → 建档 → 顾客令牌。 */
  async loginByCode(body: BrandPublicLoginBody): Promise<BrandPublicSession> {
    const code = clip(body.code, 128).trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    }
    const shop = await this.resolveShop(body.shopCode, body.shopId);
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该商城已被平台暂停服务，请联系店铺方处理',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('brand-mall', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    if (shop.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该商城尚未上线营业，暂时无法登录',
      );
    }
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: shop.ownerUserId,
      scene: BRAND_SCENE,
      shopId: shop.shopId,
      shopName: shop.shopName,
    });
    const session = await this.client.code2Session(runtime, code);
    const existed = await this.prisma.brandCustomer.findUnique({
      where: {
        shopId_openid: { shopId: shop.shopId, openid: session.openId },
      },
      select: { id: true },
    });
    const row = await this.prisma.brandCustomer.upsert({
      where: {
        shopId_openid: { shopId: shop.shopId, openid: session.openId },
      },
      create: {
        shopId: shop.shopId,
        openid: session.openId,
        unionId: session.unionId || '',
        nickname: clip(body.nickname, 60),
        avatar: clip(body.avatar, 500),
        source: 'MINIPROGRAM',
        lastLoginAt: new Date(),
      },
      update: {
        ...(session.unionId ? { unionId: session.unionId } : {}),
        ...(body.nickname ? { nickname: clip(body.nickname, 60) } : {}),
        ...(body.avatar ? { avatar: clip(body.avatar, 500) } : {}),
        lastLoginAt: new Date(),
      },
    });
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被店铺方限制下单，如需恢复请联系店铺客服',
      );
    }
    if (!existed) {
      await this.scrm.enqueue({
        shopId: shop.shopId,
        customerId: row.id,
        kind: 'CUSTOMER_REGISTER',
        recordKey: row.id,
        ownerUserId: shop.ownerUserId,
        payload: {
          customerLabel: scrmCustomerLabel({
            mobile: row.phone,
            nickname: row.nickname,
          }),
        },
      });
    }
    const token = issueCustomerToken({
      scene: BRAND_SCENE,
      shopId: shop.shopId,
      customerId: row.id,
      openid: row.openid,
    });
    return {
      token,
      customerId: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      points: row.points,
      balance: amount(row.balance),
      shopId: shop.shopId,
    };
  }

  /** 店铺解析：优先店铺码，其次按 AppID 反查（用户直接扫码进来时没有店铺码）。 */
  async resolveShop(shopCode?: string, shopId?: number) {
    const byCode = shopCode ? await this.shops.findByCode(shopCode) : null;
    if (byCode) {
      return {
        shopId: byCode.id,
        ownerUserId: byCode.ownerUserId,
        shopName: byCode.name,
        shopCode: byCode.shopCode,
        status: byCode.status,
      };
    }
    if (shopId && shopId > 0) {
      const row = await this.prisma.brandShop.findUnique({
        where: { id: shopId },
      });
      if (row) {
        return {
          shopId: row.id,
          ownerUserId: row.ownerUserId,
          shopName: row.name,
          shopCode: row.shopCode,
          status: row.status,
        };
      }
    }
    throw new BusinessException(
      ErrorCode.NOT_FOUND,
      '店铺不存在：请确认小程序包的 config.js 已注入 shopCode',
    );
  }

  async profile(
    shopId: number,
    customerId: number,
  ): Promise<BrandPublicSession> {
    const row = (await this.customer(shopId, customerId)) as CustomerRecord;
    return {
      token: '',
      customerId: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      points: row.points,
      balance: amount(row.balance),
      shopId,
    };
  }

  private async customer(shopId: number, customerId: number) {
    const row = await this.prisma.brandCustomer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    return row;
  }

  // ---------- 地址簿 ----------

  async addresses(
    shopId: number,
    customerId: number,
  ): Promise<BrandCustomerAddress[]> {
    const rows = (await this.prisma.brandCustomerAddress.findMany({
      where: { shopId, customerId },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      take: 100,
    })) as unknown as AddressRecord[];
    return rows.map((row) => this.toAddress(row));
  }

  private toAddress(row: AddressRecord): BrandCustomerAddress {
    return {
      id: row.id,
      customerId: row.customerId,
      realName: row.realName,
      phone: row.phone,
      province: row.province,
      city: row.city,
      district: row.district,
      detail: row.detail,
      postalCode: row.postalCode,
      isDefault: row.isDefault,
      tag: row.tag,
    };
  }

  async saveAddress(
    shopId: number,
    customerId: number,
    body: BrandPublicAddressBody,
  ): Promise<BrandCustomerAddress> {
    const realName = clip(body.realName, 30).trim();
    const phone = clip(body.phone, 20).trim();
    const detail = clip(body.detail, 200).trim();
    if (!realName || !phone || !detail) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '收货人、手机号与详细地址都必填',
      );
    }
    const data = {
      realName,
      phone,
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      detail,
      postalCode: clip(body.postalCode, 10),
      isDefault: body.isDefault === true,
      tag: clip(body.tag, 10),
    };
    let id = Number(body.id || 0);
    if (id > 0) {
      const row = await this.prisma.brandCustomerAddress.findFirst({
        where: { id, shopId, customerId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
      await this.prisma.brandCustomerAddress.update({ where: { id }, data });
    } else {
      const created = await this.prisma.brandCustomerAddress.create({
        data: { shopId, customerId, ...data },
      });
      id = created.id;
    }
    if (data.isDefault) {
      await this.prisma.brandCustomerAddress.updateMany({
        where: { shopId, customerId, id: { not: id } },
        data: { isDefault: false },
      });
    } else {
      const stillAny = await this.prisma.brandCustomerAddress.count({
        where: { shopId, customerId, isDefault: true },
      });
      if (stillAny === 0) {
        await this.prisma.brandCustomerAddress.update({
          where: { id },
          data: { isDefault: true },
        });
      }
    }
    const saved = await this.prisma.brandCustomerAddress.findUnique({
      where: { id },
    });
    return this.toAddress(saved as unknown as AddressRecord);
  }

  async removeAddress(shopId: number, customerId: number, id: number) {
    const row = await this.prisma.brandCustomerAddress.findFirst({
      where: { id, shopId, customerId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
    await this.prisma.brandCustomerAddress.delete({ where: { id: row.id } });
    return { ok: true, message: '地址已删除' };
  }

  // ---------- 购物车 ----------

  async cart(
    shopId: number,
    customerId: number,
  ): Promise<{
    items: BrandCartItem[];
    totalQuantity: number;
    selectedAmount: number;
  }> {
    const rows = await this.prisma.brandCartItem.findMany({
      where: { shopId, customerId },
      orderBy: [{ id: 'desc' }],
      take: 200,
    });
    if (rows.length === 0) {
      return { items: [], totalQuantity: 0, selectedAmount: 0 };
    }
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const skuIds = rows.map((row) => row.skuId).filter((id) => id > 0);
    const [products, skus] = await Promise.all([
      this.prisma.brandProduct.findMany({
        where: { shopId, id: { in: productIds } },
        select: {
          id: true,
          title: true,
          coverImage: true,
          status: true,
          price: true,
          stock: true,
          type: true,
        },
      }),
      skuIds.length
        ? this.prisma.brandProductSku.findMany({
            where: { shopId, id: { in: skuIds } },
            select: {
              id: true,
              productId: true,
              skuName: true,
              image: true,
              price: true,
              stock: true,
              enabled: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const productMap = new Map(products.map((row) => [row.id, row]));
    const skuMap = new Map(skus.map((row) => [row.id, row]));
    const items = rows.map((row) => {
      const product = productMap.get(row.productId);
      const sku = row.skuId ? skuMap.get(row.skuId) : undefined;
      const price = amount(sku?.price ?? product?.price);
      const stock = sku ? sku.stock : Number(product?.stock || 0);
      const valid =
        Boolean(product) &&
        product?.status === 'ONLINE' &&
        (sku ? sku.enabled === true : true) &&
        stock > 0;
      return {
        id: row.id,
        productId: row.productId,
        skuId: row.skuId,
        title: product?.title || '（商品已下架或删除）',
        skuName: sku?.skuName || '',
        image: sku?.image || product?.coverImage || '',
        price,
        quantity: row.quantity,
        stock,
        selected: row.selected,
        valid,
      };
    });
    return {
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      selectedAmount:
        Math.round(
          items
            .filter((item) => item.selected && item.valid)
            .reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
        ) / 100,
    };
  }

  async addCart(
    shopId: number,
    customerId: number,
    productId: number,
    skuId: number,
    quantity: number,
  ) {
    const product = await this.prisma.brandProduct.findFirst({
      where: { id: productId, shopId },
      select: { id: true, status: true, stock: true },
    });
    if (!product || product.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '商品已下架，换一件试试',
      );
    }
    const add = intIn(quantity, 1, 999, 1);
    let stock = product.stock;
    if (skuId > 0) {
      const sku = await this.prisma.brandProductSku.findFirst({
        where: { id: skuId, shopId, productId },
        select: { id: true, stock: true, enabled: true },
      });
      if (!sku || !sku.enabled) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选规格已下架，请重新选择',
        );
      }
      stock = sku.stock;
    }
    const existing = await this.prisma.brandCartItem.findUnique({
      where: {
        shopId_customerId_skuId: { shopId, customerId, skuId },
      },
    });
    const next = Math.min(999, (existing?.quantity || 0) + add);
    if (next > stock) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `库存只剩 ${stock} 件，购物车里已有 ${existing?.quantity || 0} 件`,
      );
    }
    await this.prisma.brandCartItem.upsert({
      where: { shopId_customerId_skuId: { shopId, customerId, skuId } },
      create: {
        shopId,
        customerId,
        productId,
        skuId,
        quantity: next,
        selected: true,
      },
      update: { quantity: next, productId, selected: true },
    });
    return { ok: true, message: '已加入购物车', quantity: next };
  }

  async updateCartQuantity(
    shopId: number,
    customerId: number,
    id: number,
    quantity: number,
  ) {
    const row = await this.prisma.brandCartItem.findFirst({
      where: { id, shopId, customerId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '购物车条目不存在');
    const next = intIn(quantity, 0, 999, row.quantity);
    if (next === 0) {
      await this.prisma.brandCartItem.delete({ where: { id: row.id } });
      return { ok: true, message: '已从购物车移除' };
    }
    await this.prisma.brandCartItem.update({
      where: { id: row.id },
      data: { quantity: next },
    });
    return { ok: true, message: '已更新数量', quantity: next };
  }

  async selectCart(
    shopId: number,
    customerId: number,
    ids: number[],
    selected: boolean,
  ) {
    if (ids.length === 0) {
      await this.prisma.brandCartItem.updateMany({
        where: { shopId, customerId },
        data: { selected },
      });
      return { ok: true, message: selected ? '已全选' : '已取消全选' };
    }
    await this.prisma.brandCartItem.updateMany({
      where: { shopId, customerId, id: { in: ids.slice(0, 200) } },
      data: { selected },
    });
    return { ok: true, message: '已更新勾选状态' };
  }

  async removeCart(shopId: number, customerId: number, ids: number[]) {
    if (ids.length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要移除的商品');
    }
    await this.prisma.brandCartItem.deleteMany({
      where: { shopId, customerId, id: { in: ids.slice(0, 200) } },
    });
    return { ok: true, message: '已移除' };
  }

  // ---------- 积分流水 ----------

  /**
   * 记一笔积分流水并同步顾客积分余额。
   * 扣减用 `updateMany + 余额条件`，避免并发下单把积分扣成负数。
   */
  async addPoints(
    shopId: number,
    customerId: number,
    points: number,
    type: 'POINT_EARN' | 'POINT_USE',
    related: { type: string; id: number },
    remark: string,
  ): Promise<boolean> {
    if (points === 0) return true;
    const customer = await this.prisma.brandCustomer.findFirst({
      where: { id: customerId, shopId },
      select: { points: true },
    });
    if (!customer) return false;
    const after = customer.points + points;
    if (after < 0) return false;
    const changed = await this.prisma.brandCustomer.updateMany({
      where: { id: customerId, shopId, points: customer.points },
      data: { points: after },
    });
    if (changed.count === 0) return false;
    await this.prisma.brandCustomerBill.create({
      data: {
        shopId,
        customerId,
        type,
        points,
        pointsAfter: after,
        amount: 0,
        relatedType: clip(related.type, 20),
        relatedId: Number(related.id) || 0,
        remark: clip(remark, 200),
      },
    });
    return true;
  }

  async bills(
    shopId: number,
    customerId: number,
  ): Promise<BrandCustomerBill[]> {
    const rows = await this.prisma.brandCustomerBill.findMany({
      where: { shopId, customerId },
      orderBy: [{ id: 'desc' }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type as BrandCustomerBill['type'],
      points: row.points,
      pointsAfter: row.pointsAfter,
      amount: amount(row.amount),
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      remark: row.remark,
      createdAt: iso(row.createdAt),
    }));
  }

  // ---------- 店主侧顾客运营 ----------

  async list(
    args: { ownerUserId: string; shopId: number },
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: string;
      source?: string;
      orderFilter?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (query.orderFilter === 'HAS_ORDER' || query.orderFilter === 'NO_ORDER') {
      const ids = (
        await this.prisma.brandOrder.findMany({
          where: { shopId: args.shopId },
          select: { customerId: true },
          distinct: ['customerId'],
          take: 5_000,
        })
      ).map((row) => row.customerId);
      where.id =
        query.orderFilter === 'HAS_ORDER' ? { in: ids } : { notIn: ids };
    }
    const [rows, total] = await Promise.all([
      this.prisma.brandCustomer.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandCustomer.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const grouped = ids.length
      ? await this.prisma.brandOrder.groupBy({
          by: ['customerId'],
          where: {
            shopId: args.shopId,
            customerId: { in: ids },
            payStatus: { in: ['PAID', 'REFUNDING'] },
          },
          _count: { _all: true },
          _sum: { payAmount: true },
        })
      : [];
    const statMap = new Map(grouped.map((row) => [row.customerId, row]));
    const ticketCounts = ids.length
      ? await this.prisma.brandCouponTicket.groupBy({
          by: ['customerId'],
          where: {
            shopId: args.shopId,
            customerId: { in: ids },
            status: 'UNUSED',
          },
          _count: { _all: true },
        })
      : [];
    const ticketMap = new Map(
      ticketCounts.map((row) => [row.customerId, row._count._all]),
    );
    const list = (
      rows as unknown as (CustomerRecord & { openid: string })[]
    ).map((row) => ({
      ...this.toCustomer(row),
      orderCount: statMap.get(row.id)?._count._all || 0,
      orderAmount: amount(statMap.get(row.id)?._sum.payAmount),
      couponCount: ticketMap.get(row.id) || 0,
    }));
    return pageOf(list, total, page, pageSize);
  }

  private toCustomer(row: CustomerRecord): BrandCustomer {
    return {
      id: row.id,
      shopId: row.shopId,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      gender: row.gender,
      level: row.level,
      points: row.points,
      balance: amount(row.balance),
      status: row.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      source: sourceOf(row.source),
      orderCount: 0,
      orderAmount: 0,
      couponCount: 0,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: iso(row.createdAt),
    };
  }

  async detail(
    args: { ownerUserId: string; shopId: number },
    customerId: number,
  ): Promise<BrandCustomerDetail> {
    const row = (await this.prisma.brandCustomer.findFirst({
      where: { id: customerId, shopId: args.shopId },
    })) as unknown as (CustomerRecord & { remark: string }) | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const [orders, tickets] = await Promise.all([
      this.prisma.brandOrder.findMany({
        where: { shopId: args.shopId, customerId: row.id },
        orderBy: [{ id: 'desc' }],
        take: 10,
      }),
      this.prisma.brandCouponTicket.count({
        where: { shopId: args.shopId, customerId: row.id, status: 'UNUSED' },
      }),
    ]);
    const grouped = await this.prisma.brandOrder.groupBy({
      by: ['customerId'],
      where: {
        shopId: args.shopId,
        customerId: row.id,
        payStatus: { in: ['PAID', 'REFUNDING'] },
      },
      _count: { _all: true },
      _sum: { payAmount: true },
    });
    const stat = grouped[0];
    const [addresses, bills] = await Promise.all([
      this.addresses(args.shopId, row.id),
      this.bills(args.shopId, row.id),
    ]);
    return {
      ...this.toCustomer(row),
      remark: row.remark,
      orderCount: stat?._count._all || 0,
      orderAmount: amount(stat?._sum.payAmount),
      couponCount: tickets,
      addresses,
      bills,
      recentOrders: ordersOf(orders),
    };
  }

  async update(
    args: { ownerUserId: string; shopId: number },
    body: {
      id: number;
      nickname?: string;
      level?: string;
      remark?: string;
      status?: string;
    },
  ): Promise<BrandCustomer> {
    const row = await this.prisma.brandCustomer.findFirst({
      where: { id: Number(body.id), shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const data: Record<string, unknown> = {};
    if (typeof body.nickname === 'string')
      data.nickname = clip(body.nickname, 60);
    if (typeof body.level === 'string') data.level = clip(body.level, 30);
    if (typeof body.remark === 'string') data.remark = clip(body.remark, 500);
    if (body.status === 'ACTIVE' || body.status === 'BLOCKED')
      data.status = body.status;
    if (Object.keys(data).length === 0) return this.toCustomer(row);
    await this.prisma.brandCustomer.update({ where: { id: row.id }, data });
    const saved = await this.prisma.brandCustomer.findUnique({
      where: { id: row.id },
    });
    return this.toCustomer(saved as unknown as CustomerRecord);
  }

  /** 店主侧看某顾客的地址（隐私字段只在需要发货时按需读）。 */
  async addressesOfCustomer(
    args: { ownerUserId: string; shopId: number },
    customerId: number,
  ) {
    const row = await this.prisma.brandCustomer.findFirst({
      where: { id: Number(customerId), shopId: args.shopId },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    return this.addresses(args.shopId, row.id);
  }
}

/** 顾客行转会话摘要（下单成功等场景回给端上刷新余额）。 */
export function sessionOf(
  row: CustomerRecord,
  shopId: number,
): BrandPublicSession {
  return {
    token: '',
    customerId: row.id,
    nickname: row.nickname,
    avatar: row.avatar,
    phone: row.phone,
    points: row.points,
    balance: amount(row.balance),
    shopId,
  };
}
