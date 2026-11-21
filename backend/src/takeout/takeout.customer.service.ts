import type {
  TakeoutAddress,
  TakeoutAddressBody,
  TakeoutCartItem,
  TakeoutCustomer,
  TakeoutLoginBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import type { PrismaService } from '../prisma/prisma.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import type { TakeoutScrmService } from './takeout.scrm.service';
import { TAKEOUT_SCENE, amountOut, clip, iso } from './takeout.shared';
import type { TakeoutShopView as ShopView } from './takeout.shop.service';

export type TakeoutIdentity = {
  shopId: number;
  customerId: number;
  ownerUserId: string;
  openid: string;
};

type CustomerRecord = {
  id: number;
  shopId: number;
  openid: string;
  unionId: string;
  nickname: string;
  avatar: string;
  phone: string;
  points: number;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/**
 * 外卖顾客：一店一套，与商城顾客、站内 User 都不共享行。
 * 复用的只是 wx.login → code2Session 与顾客令牌签发服务。
 */
export class TakeoutCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly scrm: TakeoutScrmService,
  ) {}

  async loginByCode(shop: ShopView, body: TakeoutLoginBody) {
    if (!(await toolOpen('takeout', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该外卖门店尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    if (shop.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该外卖门店尚未上线营业，暂时无法登录',
      );
    }
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: shop.ownerUserId,
      scene: TAKEOUT_SCENE,
      shopId: shop.id,
      shopName: shop.name,
    });
    const session = await this.client.code2Session(
      runtime,
      clip(body.code, 128),
    );
    const existed = await this.prisma.takeoutCustomer.findUnique({
      where: {
        shopId_openid: { shopId: shop.id, openid: session.openId },
      },
      select: { id: true },
    });
    const row = await this.prisma.takeoutCustomer.upsert({
      where: {
        shopId_openid: { shopId: shop.id, openid: session.openId },
      },
      create: {
        shopId: shop.id,
        openid: session.openId,
        unionId: session.unionId || '',
        nickname: clip(body.nickname, 60),
        avatar: clip(body.avatar, 500),
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
        '该账号已被门店限制下单，如需恢复请联系门店客服',
      );
    }
    if (!existed) {
      await this.scrm.enqueue({
        shopId: shop.id,
        ownerUserId: shop.ownerUserId,
        customerId: row.id,
        kind: 'CUSTOMER_REGISTER',
        recordKey: row.id,
        payload: {
          customerLabel: row.nickname || '外卖顾客',
        },
      });
    }
    const token = issueCustomerToken({
      scene: TAKEOUT_SCENE,
      shopId: shop.id,
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
      shopId: shop.id,
    };
  }

  async identity(token: string): Promise<TakeoutIdentity> {
    const payload = parseCustomerToken(token);
    if (payload.scene !== TAKEOUT_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态无效，请重新进入小程序',
      );
    }
    const row = await this.prisma.takeoutCustomer.findFirst({
      where: { id: payload.customerId, shopId: payload.shopId },
      select: { id: true, status: true },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被门店限制下单',
      );
    }
    const shop = await this.prisma.takeoutShop.findUnique({
      where: { id: payload.shopId },
      select: { ownerUserId: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '门店不存在');
    }
    return {
      shopId: payload.shopId,
      customerId: payload.customerId,
      ownerUserId: shop.ownerUserId,
      openid: payload.openid,
    };
  }

  async customer(shopId: number, customerId: number) {
    const row = await this.prisma.takeoutCustomer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    return row as unknown as CustomerRecord;
  }

  async profile(shopId: number, customerId: number): Promise<TakeoutCustomer> {
    const row = await this.customer(shopId, customerId);
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      points: row.points,
      status: row.status,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: iso(row.createdAt),
    };
  }

  async bills(shopId: number, customerId: number) {
    const rows = await this.prisma.takeoutCustomerBill.findMany({
      where: { shopId, customerId },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      points: row.points,
      pointsAfter: row.pointsAfter,
      remark: row.remark,
      createdAt: iso(row.createdAt),
    }));
  }

  async addPoints(
    shopId: number,
    customerId: number,
    points: number,
    type: 'POINT_EARN' | 'POINT_USE',
    related: { type: string; id: number },
    remark: string,
  ): Promise<boolean> {
    if (!points) return true;
    if (points > 0) {
      const updated = await this.prisma.takeoutCustomer.update({
        where: { id: customerId },
        data: { points: { increment: points } },
      });
      await this.prisma.takeoutCustomerBill.create({
        data: {
          shopId,
          customerId,
          type,
          points,
          pointsAfter: updated.points,
          relatedType: related.type,
          relatedId: related.id,
          remark: clip(remark, 200),
        },
      });
      return true;
    }
    const changed = await this.prisma.takeoutCustomer.updateMany({
      where: { id: customerId, shopId, points: { gte: -points } },
      data: { points: { increment: points } },
    });
    if (changed.count === 0) return false;
    const row = await this.prisma.takeoutCustomer.findFirst({
      where: { id: customerId, shopId },
      select: { points: true },
    });
    await this.prisma.takeoutCustomerBill.create({
      data: {
        shopId,
        customerId,
        type,
        points,
        pointsAfter: row?.points ?? 0,
        relatedType: related.type,
        relatedId: related.id,
        remark: clip(remark, 200),
      },
    });
    return true;
  }

  async addresses(
    shopId: number,
    customerId: number,
  ): Promise<TakeoutAddress[]> {
    const rows = await this.prisma.takeoutCustomerAddress.findMany({
      where: { shopId, customerId },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      realName: row.realName,
      phone: row.phone,
      province: row.province,
      city: row.city,
      district: row.district,
      detail: row.detail,
      isDefault: row.isDefault,
      tag: row.tag,
    }));
  }

  async saveAddress(
    shopId: number,
    customerId: number,
    body: TakeoutAddressBody,
  ) {
    const data = {
      realName: clip(body.realName, 30),
      phone: clip(body.phone, 20),
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      detail: clip(body.detail, 200),
      isDefault: body.isDefault,
      tag: clip(body.tag, 10),
    };
    if (body.isDefault) {
      await this.prisma.takeoutCustomerAddress.updateMany({
        where: { shopId, customerId },
        data: { isDefault: false },
      });
    }
    if (body.id) {
      const changed = await this.prisma.takeoutCustomerAddress.updateMany({
        where: { id: body.id, shopId, customerId },
        data,
      });
      if (changed.count === 0) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
      }
      return { id: body.id };
    }
    const row = await this.prisma.takeoutCustomerAddress.create({
      data: { ...data, shopId, customerId },
    });
    return { id: row.id };
  }

  async removeAddress(shopId: number, customerId: number, id: number) {
    await this.prisma.takeoutCustomerAddress.deleteMany({
      where: { id, shopId, customerId },
    });
    return { ok: true, message: '地址已删除' };
  }

  async cart(shopId: number, customerId: number) {
    const rows = await this.prisma.takeoutCartItem.findMany({
      where: { shopId, customerId },
      orderBy: { id: 'desc' },
      take: 200,
    });
    if (!rows.length) {
      return {
        items: [] as TakeoutCartItem[],
        totalQuantity: 0,
        selectedAmount: 0,
      };
    }
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const skuIds = rows.map((row) => row.skuId).filter((id) => id > 0);
    const [products, skus] = await Promise.all([
      this.prisma.takeoutProduct.findMany({
        where: { shopId, id: { in: productIds } },
        select: {
          id: true,
          title: true,
          coverImage: true,
          status: true,
          price: true,
          stock: true,
        },
      }),
      skuIds.length
        ? this.prisma.takeoutProductSku.findMany({
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
      const price = amountOut(sku?.price ?? product?.price);
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
        title: product?.title || '（菜品已下架或删除）',
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
    const product = await this.prisma.takeoutProduct.findFirst({
      where: { id: productId, shopId, status: 'ONLINE' },
    });
    if (!product)
      throw new BusinessException(ErrorCode.NOT_FOUND, '菜品已下架');
    if (skuId > 0) {
      const sku = await this.prisma.takeoutProductSku.findFirst({
        where: { id: skuId, productId, shopId, enabled: true },
      });
      if (!sku) throw new BusinessException(ErrorCode.NOT_FOUND, '规格已下架');
      if (sku.stock < quantity) {
        throw new BusinessException(ErrorCode.CONFLICT, '库存不足');
      }
    } else if (product.stock < quantity) {
      throw new BusinessException(ErrorCode.CONFLICT, '库存不足');
    }
    const row = await this.prisma.takeoutCartItem.upsert({
      where: {
        shopId_customerId_skuId: { shopId, customerId, skuId },
      },
      create: { shopId, customerId, productId, skuId, quantity },
      update: { quantity: { increment: quantity } },
    });
    return { id: row.id };
  }

  async updateCartQuantity(
    shopId: number,
    customerId: number,
    id: number,
    quantity: number,
  ) {
    if (quantity <= 0) {
      await this.prisma.takeoutCartItem.deleteMany({
        where: { id, shopId, customerId },
      });
      return { ok: true };
    }
    await this.prisma.takeoutCartItem.updateMany({
      where: { id, shopId, customerId },
      data: { quantity },
    });
    return { ok: true };
  }

  async selectCart(
    shopId: number,
    customerId: number,
    ids: number[],
    selected: boolean,
  ) {
    const where: Record<string, unknown> = { shopId, customerId };
    if (ids.length) where.id = { in: ids };
    await this.prisma.takeoutCartItem.updateMany({
      where,
      data: { selected },
    });
    return { ok: true };
  }

  async removeCart(shopId: number, customerId: number, ids: number[]) {
    await this.prisma.takeoutCartItem.deleteMany({
      where: { shopId, customerId, id: { in: ids } },
    });
    return { ok: true };
  }
}
