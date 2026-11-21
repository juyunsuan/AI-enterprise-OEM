import { createHash, randomBytes } from 'node:crypto';
import {
  RENTAL_INSPECTION_KIND_LABELS,
  RENTAL_ITEM_STATUS_LABELS,
  RENTAL_ORDER_STATUS_LABELS,
  RENTAL_PAY_STATUS_LABELS,
  RENTAL_SCENE,
  RENTAL_SHOP_STATUS_LABELS,
  RENTAL_STAFF_ROLE_LABELS,
  RENTAL_STAFF_STATUS_LABELS,
  rentalTradeSchema,
  type MiniAppInput,
  type RentalCustomerInput,
  type RentalInspectionInput,
  type RentalItemInput,
  type RentalOrderActionInput,
  type RentalOrderCreateInput,
  type RentalOrderUpdateInput,
  type RentalShopInput,
  type RentalStaffInput,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import {
  buildStoreZip,
  collectTemplate,
  templateDirFrom,
} from '../private-mini/package-builder';
import {
  issueCustomerToken,
  type CustomerTokenPayload,
} from '../private-mini/customer-token';
import {
  RENTAL_OCCUPYING_STATUSES,
  RENTAL_SCENE as SCENE,
  transitRentalOrder,
} from './rental.order.rules';
import type { RentalPayService } from './rental.pay.service';
import type { RentalScrmService } from './rental.scrm.service';
import {
  issueRentalStaffToken,
  parseRentalStaffToken,
} from './rental-staff-token';

const round2 = (value: number) => Math.round(value * 100) / 100;
const centsOf = (value: number) => Math.round(Number(value) * 100);

type ShopRow = {
  id: number;
  ownerUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  servicePhone: string;
  address: string;
  status: string;
  themeJson: unknown;
  tradeJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type Actor = { staffId?: number; staffName?: string };

export class RentalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly pay: RentalPayService,
    private readonly scrm: RentalScrmService,
    private readonly storage: StorageService,
    private readonly toggle: {
      isOpen(code: string, orgUserId: string): Promise<boolean>;
    },
  ) {}

  // ------------------------------------------------------------ 门店

  private tradeOf(shop: { tradeJson: unknown }) {
    try {
      return rentalTradeSchema.parse(shop.tradeJson || {});
    } catch {
      return rentalTradeSchema.parse({});
    }
  }

  private themeOf(shop: { themeJson: unknown }) {
    const value = (shop.themeJson || {}) as Record<string, unknown>;
    return {
      themeColor: text(value.themeColor, '#3370ff'),
      navigationTitle: text(value.navigationTitle, '租赁管理'),
    };
  }

  private async ownedShop(user: CurrentUser, id: number): Promise<ShopRow> {
    const shop = await this.prisma.rentalShop.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '租赁门店不存在或不属于当前账号',
      );
    }
    return shop;
  }

  private async shopByCode(shopCode: string) {
    const code = String(shopCode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少门店码：请确认小程序 config.js 已填写 shopCode',
      );
    }
    const shop = await this.prisma.rentalShop.findUnique({
      where: { shopCode: code },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '门店不存在或尚未开通，请让店主在后台完成开通后再试',
      );
    }
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该门店已被平台暂停服务',
      );
    }
    return shop;
  }

  private async shopRow(shop: ShopRow) {
    const [itemCount, orderCount, app] = await Promise.all([
      this.prisma.rentalItem.count({ where: { shopId: shop.id } }),
      this.prisma.rentalOrder.count({ where: { shopId: shop.id } }),
      this.prisma.miniProgramApp.findUnique({
        where: {
          ownerUserId_scene_shopId: {
            ownerUserId: shop.ownerUserId,
            scene: SCENE,
            shopId: shop.id,
          },
        },
        select: {
          appId: true,
          appSecretCipher: true,
          payEnabled: true,
          mchId: true,
        },
      }),
    ]);
    const theme = this.themeOf(shop);
    return {
      id: shop.id,
      name: shop.name,
      shopCode: shop.shopCode,
      logo: shop.logo,
      servicePhone: shop.servicePhone,
      address: shop.address,
      status: shop.status,
      statusLabel: RENTAL_SHOP_STATUS_LABELS[shop.status] || shop.status,
      themeColor: theme.themeColor,
      navigationTitle: theme.navigationTitle,
      trade: this.tradeOf(shop),
      wechatConfigured: Boolean(app?.appId && app?.appSecretCipher),
      payEnabled: Number(app?.payEnabled || 0) === 1 && Boolean(app?.mchId),
      itemCount,
      orderCount,
      createdAt: shop.createdAt.toISOString(),
      updatedAt: shop.updatedAt.toISOString(),
    };
  }

  private newShopCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'R';
    for (let i = 0; i < 6; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  async overview(user: CurrentUser) {
    const shops = await this.prisma.rentalShop.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    if (!shops.length) {
      return {
        shops: 0,
        itemsOnline: 0,
        activeRentals: 0,
        pendingPickup: 0,
        pendingReturn: 0,
        todayOrders: 0,
        todayRevenue: 0,
        depositHeld: 0,
        totalCustomers: 0,
      };
    }
    const ids = shops.map((shop) => shop.id);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [
      itemsOnline,
      activeRentals,
      pendingPickup,
      pendingReturn,
      todayOrders,
      todayPaid,
      held,
      totalCustomers,
    ] = await Promise.all([
      this.prisma.rentalItem.count({
        where: { shopId: { in: ids }, status: 'ONLINE' },
      }),
      this.prisma.rentalOrder.count({
        where: { shopId: { in: ids }, status: 'PICKED_UP' },
      }),
      this.prisma.rentalOrder.count({
        where: { shopId: { in: ids }, status: 'PAID' },
      }),
      this.prisma.rentalOrder.count({
        where: { shopId: { in: ids }, status: 'RETURNED' },
      }),
      this.prisma.rentalOrder.count({
        where: { shopId: { in: ids }, createdAt: { gte: start } },
      }),
      this.prisma.rentalOrder.findMany({
        where: {
          shopId: { in: ids },
          paidAt: { gte: start },
          payStatus: { in: ['PAID', 'REFUNDED'] },
        },
        select: { payAmount: true },
      }),
      this.prisma.rentalOrder.findMany({
        where: {
          shopId: { in: ids },
          OR: [
            { status: { in: ['PAID', 'PICKED_UP', 'RETURNED'] } },
            { status: 'COMPLETED', payStatus: 'PAID' },
          ],
        },
        select: { depositAmount: true },
      }),
      this.prisma.rentalCustomer.count({ where: { shopId: { in: ids } } }),
    ]);
    return {
      shops: shops.length,
      itemsOnline,
      activeRentals,
      pendingPickup,
      pendingReturn,
      todayOrders,
      todayRevenue: round2(
        todayPaid.reduce((sum, row) => sum + Number(row.payAmount), 0),
      ),
      depositHeld: round2(
        held.reduce((sum, row) => sum + Number(row.depositAmount), 0),
      ),
      totalCustomers,
    };
  }

  async shops(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const status = text(query.status, 'all');
    const where = {
      ownerUserId: user.userId,
      ...(keyword ? { name: { contains: keyword } } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalShop.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalShop.count({ where }),
    ]);
    return pageOf(
      await Promise.all(rows.map((row) => this.shopRow(row))),
      total,
      page,
      pageSize,
    );
  }

  async createShop(user: CurrentUser, body: RentalShopInput) {
    const name = body.name.trim();
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写门店名称');
    let shopCode = this.newShopCode();
    for (let i = 0; i < 20; i += 1) {
      const exists = await this.prisma.rentalShop.findUnique({
        where: { shopCode },
      });
      if (!exists) break;
      shopCode = this.newShopCode();
    }
    const created = await this.prisma.rentalShop.create({
      data: {
        ownerUserId: user.userId,
        name,
        shopCode,
        logo: body.logo,
        servicePhone: body.servicePhone,
        address: body.address,
        themeJson: {
          themeColor: body.themeColor || '#3370ff',
          navigationTitle: body.navigationTitle || '租赁管理',
        },
        tradeJson: rentalTradeSchema.parse({}),
      },
    });
    return this.shopRow(created);
  }

  async shopDetail(user: CurrentUser, id: string) {
    return this.shopRow(await this.ownedShop(user, Number(id)));
  }

  async updateShop(user: CurrentUser, id: string, body: RentalShopInput) {
    const shop = await this.ownedShop(user, Number(id));
    const updated = await this.prisma.rentalShop.update({
      where: { id: shop.id },
      data: {
        name: body.name.trim() || shop.name,
        logo: body.logo,
        servicePhone: body.servicePhone,
        address: body.address,
        themeJson: {
          themeColor: body.themeColor || '#3370ff',
          navigationTitle: body.navigationTitle || '租赁管理',
        },
      },
    });
    return this.shopRow(updated);
  }

  async saveTrade(user: CurrentUser, id: string, body: unknown) {
    const shop = await this.ownedShop(user, Number(id));
    const trade = rentalTradeSchema.parse(body || {});
    if (trade.deskSiteKey) {
      const site = await this.prisma.serviceDeskSite.findFirst({
        where: { siteKey: trade.deskSiteKey, ownerUserId: shop.ownerUserId },
        select: { id: true },
      });
      if (!site) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '客服站点不存在或不属于当前账号，请到「AI客服 › 站点管理」复制正确的 siteKey',
        );
      }
    }
    if (trade.scrmCodeId > 0) {
      const code = await this.prisma.scrmCode.findFirst({
        where: { id: trade.scrmCodeId, orgUserId: shop.ownerUserId },
        select: { id: true },
      });
      if (!code) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '企业微信活码不存在或不属于当前账号，请到「营销工具 › 企微 SCRM › 活码」核对',
        );
      }
    }
    const updated = await this.prisma.rentalShop.update({
      where: { id: shop.id },
      data: { tradeJson: trade },
    });
    return this.shopRow(updated);
  }

  async setStatus(user: CurrentUser, id: string, body: { status: string }) {
    const shop = await this.ownedShop(user, Number(id));
    const status = text(body.status).trim().toUpperCase();
    if (!['DRAFT', 'ONLINE', 'CLOSED'].includes(status)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只能切换未上线 / 营业中 / 已关闭',
      );
    }
    const updated = await this.prisma.rentalShop.update({
      where: { id: shop.id },
      data: { status },
    });
    return this.shopRow(updated);
  }

  wechatView(user: CurrentUser, id: string) {
    return this.ownedShop(user, Number(id)).then((shop) =>
      this.pay.view({
        ownerUserId: user.userId,
        shopId: shop.id,
        shopName: shop.name,
      }),
    );
  }

  saveWechat(user: CurrentUser, id: string, body: MiniAppInput) {
    return this.ownedShop(user, Number(id)).then((shop) =>
      this.pay.save(
        { ownerUserId: user.userId, shopId: shop.id, shopName: shop.name },
        body,
      ),
    );
  }

  testWechat(user: CurrentUser, id: string) {
    return this.ownedShop(user, Number(id)).then((shop) =>
      this.pay.test({
        ownerUserId: user.userId,
        shopId: shop.id,
        shopName: shop.name,
      }),
    );
  }

  /** 源码分发包：按当前模板现打 zip，不含账号参数；运营在微信开发者工具里填 config.js。 */
  async package(user: CurrentUser, id: string) {
    const shop = await this.ownedShop(user, Number(id));
    const dir = templateDirFrom('MINIPROGRAM_RENTAL_DIR', 'miniprogram-rental');
    const entries: Awaited<ReturnType<typeof collectTemplate>> =
      await collectTemplate(dir).catch(
        () => [] as Awaited<ReturnType<typeof collectTemplate>>,
      );
    if (!entries.some((entry) => entry.name === 'app.json')) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `租赁小程序模板暂不可用（模板目录 ${dir}），请确认仓库模板完整后重试`,
      );
    }
    const bytes = buildStoreZip(entries);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = `rental-miniprogram-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}.zip`;
    const stored = await this.storage.put(
      `enterprise/${user.userId}/rental/${shop.shopCode}/${sha256.slice(0, 16)}.zip`,
      bytes,
    );
    return {
      url: this.storage.urlOf(stored.key),
      fileName,
      fileSize: bytes.length,
      sha256,
    };
  }

  // ------------------------------------------------------------ 租品

  private itemRow(row: {
    id: number;
    shopId: number;
    category: string;
    name: string;
    cover: string;
    imagesJson: unknown;
    description: string;
    attributesJson: unknown;
    dailyRate: unknown;
    deposit: unknown;
    stock: number;
    status: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      shopId: row.shopId,
      category: row.category,
      name: row.name,
      cover: row.cover,
      images: Array.isArray(row.imagesJson)
        ? row.imagesJson.map((item) => String(item))
        : [],
      description: row.description,
      attributes: attributesOf(row.attributesJson),
      dailyRate: Number(row.dailyRate),
      deposit: Number(row.deposit),
      stock: row.stock,
      status: row.status,
      statusLabel: RENTAL_ITEM_STATUS_LABELS[row.status] || row.status,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async items(user: CurrentUser, id: string, query: Record<string, unknown>) {
    const shop = await this.ownedShop(user, Number(id));
    return this.itemsOf(shop.id, query);
  }

  private async itemsOf(shopId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const status = text(query.status, 'all');
    const category = text(query.category).trim();
    const where = {
      shopId,
      ...(keyword ? { name: { contains: keyword } } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(category ? { category } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalItem.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.itemRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async saveItem(user: CurrentUser, id: string, body: RentalItemInput) {
    const shop = await this.ownedShop(user, Number(id));
    if (!body.name.trim()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写租品名称');
    }
    const data = {
      shopId: shop.id,
      category: body.category,
      name: body.name.trim(),
      cover: body.cover,
      imagesJson: body.images,
      description: body.description,
      attributesJson: body.attributes,
      dailyRate: round2(body.dailyRate),
      deposit: round2(body.deposit),
      stock: body.stock,
      status: body.status,
      sortOrder: body.sortOrder,
    };
    if (body.id) {
      const existing = await this.prisma.rentalItem.findFirst({
        where: { id: body.id, shopId: shop.id },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '租品不存在');
      const updated = await this.prisma.rentalItem.update({
        where: { id: existing.id },
        data,
      });
      return this.itemRow(updated);
    }
    const created = await this.prisma.rentalItem.create({ data });
    return this.itemRow(created);
  }

  async removeItem(user: CurrentUser, id: string, body: { id: number }) {
    const shop = await this.ownedShop(user, Number(id));
    const item = await this.prisma.rentalItem.findFirst({
      where: { id: body.id, shopId: shop.id },
    });
    if (!item) throw new BusinessException(ErrorCode.NOT_FOUND, '租品不存在');
    // 历史租单持有快照；删除租品用下架保留可追溯性
    await this.prisma.rentalItem.update({
      where: { id: item.id },
      data: { status: 'OFFLINE' },
    });
    return { removed: true };
  }

  async shopIdByCode(shopCode: string) {
    return (await this.shopByCode(shopCode)).id;
  }

  async staffItems(shopId: number, query: Record<string, unknown>) {
    return this.itemsOf(shopId, query);
  }

  async publicItems(shopId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const category = text(query.category).trim();
    const where = {
      shopId,
      status: 'ONLINE',
      ...(keyword ? { name: { contains: keyword } } : {}),
      ...(category ? { category } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalItem.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.publicItemRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async publicItem(shopId: number, itemId: number) {
    const row = await this.prisma.rentalItem.findFirst({
      where: { id: itemId, shopId, status: 'ONLINE' },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '租品已下架或不存在');
    return this.publicItemRow(row);
  }

  private publicItemRow(row: Parameters<RentalService['itemRow']>[0]) {
    const item = this.itemRow(row);
    return {
      id: item.id,
      category: item.category,
      name: item.name,
      cover: item.cover,
      images: item.images,
      description: item.description,
      attributes: item.attributes,
      dailyRateCents: centsOf(item.dailyRate),
      depositCents: centsOf(item.deposit),
      stock: item.stock,
      status: item.status,
    };
  }

  // ------------------------------------------------------------ 租单

  private orderRow(row: {
    id: number;
    orderNo: string;
    shopId: number;
    customerId: number;
    customerName: string;
    customerPhone: string;
    itemId: number;
    itemName: string;
    startAt: Date;
    endAt: Date;
    days: number;
    dailyRate: unknown;
    rentAmount: unknown;
    depositAmount: unknown;
    discount: unknown;
    payAmount: unknown;
    damageFee: unknown;
    refundAmount: unknown;
    salesStaffId: number;
    salesStaffName: string;
    pickupStaffName: string;
    returnStaffName: string;
    status: string;
    payStatus: string;
    paidAt: Date | null;
    pickupAt: Date | null;
    returnAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      orderNo: row.orderNo,
      shopId: row.shopId,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      itemId: row.itemId,
      itemName: row.itemName,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      days: row.days,
      dailyRate: Number(row.dailyRate),
      rentAmount: Number(row.rentAmount),
      depositAmount: Number(row.depositAmount),
      discount: Number(row.discount),
      payAmount: Number(row.payAmount),
      damageFee: Number(row.damageFee),
      refundAmount: Number(row.refundAmount),
      salesStaffId: row.salesStaffId,
      salesStaffName: row.salesStaffName,
      pickupStaffName: row.pickupStaffName,
      returnStaffName: row.returnStaffName,
      status: row.status,
      statusLabel: RENTAL_ORDER_STATUS_LABELS[row.status] || row.status,
      payStatus: row.payStatus,
      payStatusLabel: RENTAL_PAY_STATUS_LABELS[row.payStatus] || row.payStatus,
      paidAt: row.paidAt ? row.paidAt.toISOString() : '',
      pickupAt: row.pickupAt ? row.pickupAt.toISOString() : '',
      returnAt: row.returnAt ? row.returnAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private inspectionRow(row: {
    id: number;
    orderId: number;
    kind: string;
    mileage: number;
    fuelPercent: number;
    damage: string;
    damageFee: unknown;
    imagesJson: unknown;
    note: string;
    operatorName: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      orderId: row.orderId,
      kind: row.kind,
      kindLabel: RENTAL_INSPECTION_KIND_LABELS[row.kind] || row.kind,
      mileage: row.mileage,
      fuelPercent: row.fuelPercent,
      damage: row.damage,
      damageFee: Number(row.damageFee),
      images: Array.isArray(row.imagesJson)
        ? row.imagesJson.map((item) => String(item))
        : [],
      note: row.note,
      operatorName: row.operatorName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private orderWhere(shopId: number, query: Record<string, unknown>) {
    const keyword = text(query.keyword).trim();
    const status = text(query.status, 'all');
    const payStatus = text(query.payStatus, 'all');
    const itemId = Number(query.itemId || 0);
    return {
      shopId,
      ...(keyword
        ? {
            OR: [
              { orderNo: { contains: keyword } },
              { customerName: { contains: keyword } },
              { customerPhone: { contains: keyword } },
              { itemName: { contains: keyword } },
            ],
          }
        : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(payStatus && payStatus !== 'all' ? { payStatus } : {}),
      ...(itemId > 0 ? { itemId } : {}),
    };
  }

  async orders(user: CurrentUser, id: string, query: Record<string, unknown>) {
    const shop = await this.ownedShop(user, Number(id));
    return this.ordersOf(shop.id, query);
  }

  private async ordersOf(shopId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const where = this.orderWhere(shopId, query);
    const [rows, total] = await Promise.all([
      this.prisma.rentalOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalOrder.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.orderRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async orderDetail(user: CurrentUser, id: string, orderId: string) {
    const shop = await this.ownedShop(user, Number(id));
    return this.orderDetailOf(shop.id, Number(orderId));
  }

  private async orderDetailOf(shopId: number, orderId: number) {
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    const [inspections, customer] = await Promise.all([
      this.prisma.rentalInspection.findMany({
        where: { shopId, orderId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.rentalCustomer.findUnique({
        where: { id: order.customerId },
      }),
    ]);
    return {
      ...this.orderRow(order),
      itemSnapshot: (order.itemSnapshot || {}) as Record<string, unknown>,
      remark: order.customerRemark,
      staffNote: order.staffNote,
      customer: {
        id: customer?.id || order.customerId,
        nickname: customer?.nickname || '',
        phone: customer?.phone || order.customerPhone,
        status: customer?.status || 'ACTIVE',
      },
      inspections: inspections.map((row) => this.inspectionRow(row)),
    };
  }

  async createOrder(
    user: CurrentUser,
    id: string,
    body: RentalOrderCreateInput,
  ) {
    const shop = await this.ownedShop(user, Number(id));
    const customer = body.customerId
      ? await this.prisma.rentalCustomer.findFirst({
          where: { id: body.customerId, shopId: shop.id },
        })
      : null;
    const salesStaff = body.salesStaffId
      ? await this.prisma.rentalStaff.findFirst({
          where: { id: body.salesStaffId, shopId: shop.id, status: 'ACTIVE' },
        })
      : null;
    const order = await this.buildOrder(shop, {
      customerId: customer?.id || 0,
      customerName: body.customerName || customer?.nickname || '',
      customerPhone: body.customerPhone || customer?.phone || '',
      itemId: body.itemId,
      startAt: body.startAt,
      endAt: body.endAt,
      discount: body.discount,
      remark: body.remark,
      openid: customer?.openid || '',
      salesStaffId: salesStaff?.id || 0,
      salesStaffName: salesStaff?.name || '',
    });
    return this.orderRow(order);
  }

  /** 租单修改：待付款可改租期与优惠并重算；已支付只允许改备注，金额快照不回溯。 */
  async updateOrder(
    user: CurrentUser,
    id: string,
    orderId: string,
    body: RentalOrderUpdateInput,
  ) {
    const shop = await this.ownedShop(user, Number(id));
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: Number(orderId), shopId: shop.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    if (order.status !== 'PENDING_PAYMENT') {
      const updated = await this.prisma.rentalOrder.update({
        where: { id: order.id },
        data: { customerRemark: body.remark.slice(0, 500) },
      });
      return this.orderRow(updated);
    }
    const start = body.startAt ? new Date(body.startAt) : order.startAt;
    const end = body.endAt ? new Date(body.endAt) : order.endAt;
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择正确的租期起止时间',
      );
    }
    const trade = this.tradeOf(shop);
    const days = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
    );
    if (days > trade.maxRentDays) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单次最长可租 ${trade.maxRentDays} 天，请缩短租期`,
      );
    }
    const overlapping = await this.prisma.rentalOrder.count({
      where: {
        id: { not: order.id },
        shopId: shop.id,
        itemId: order.itemId,
        status: { in: [...RENTAL_OCCUPYING_STATUSES] },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    const item = await this.prisma.rentalItem.findUnique({
      where: { id: order.itemId },
      select: { stock: true },
    });
    if (!item || overlapping >= item.stock) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该时段已被租出，请选择其他日期',
      );
    }
    const dailyRate = Number(order.dailyRate);
    const rentAmount = round2(dailyRate * days);
    const discount = Math.min(round2(Math.max(0, body.discount)), rentAmount);
    const payAmount = round2(
      rentAmount - discount + Number(order.depositAmount),
    );
    const updated = await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: {
        startAt: start,
        endAt: end,
        days,
        rentAmount,
        discount,
        payAmount,
        customerRemark: body.remark.slice(0, 500),
      },
    });
    return this.orderRow(updated);
  }

  private async buildOrder(
    shop: ShopRow,
    input: {
      customerId: number;
      customerName: string;
      customerPhone: string;
      itemId: number;
      startAt: string;
      endAt: string;
      discount: number;
      remark: string;
      openid: string;
      salesStaffId?: number;
      salesStaffName?: string;
    },
  ) {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择正确的租期起止时间',
      );
    }
    const trade = this.tradeOf(shop);
    const days = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
    );
    if (days > trade.maxRentDays) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单次最长可租 ${trade.maxRentDays} 天，请缩短租期`,
      );
    }
    const item = await this.prisma.rentalItem.findFirst({
      where: { id: input.itemId, shopId: shop.id, status: 'ONLINE' },
    });
    if (!item)
      throw new BusinessException(ErrorCode.NOT_FOUND, '租品已下架或不存在');
    if (item.stock <= 0)
      throw new BusinessException(ErrorCode.CONFLICT, '该租品暂时无库存');
    const overlapping = await this.prisma.rentalOrder.count({
      where: {
        shopId: shop.id,
        itemId: item.id,
        status: { in: [...RENTAL_OCCUPYING_STATUSES] },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (overlapping >= item.stock) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该时段已被租出，请选择其他日期或租品',
      );
    }
    const dailyRate = Number(item.dailyRate);
    const deposit = Number(item.deposit);
    const rentAmount = round2(dailyRate * days);
    const discount = Math.min(round2(Math.max(0, input.discount)), rentAmount);
    const payAmount = round2(rentAmount - discount + deposit);
    const now = new Date();
    const orderNo = `RN${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes(),
    ).padStart(
      2,
      '0',
    )}${String(now.getSeconds()).padStart(2, '0')}${randomBytes(3).toString('hex').toUpperCase()}`;
    const created = await this.prisma.rentalOrder.create({
      data: {
        orderNo,
        shopId: shop.id,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        itemId: item.id,
        itemName: item.name,
        itemSnapshot: {
          id: item.id,
          name: item.name,
          cover: item.cover,
          category: item.category,
          attributes: attributesOf(item.attributesJson),
          dailyRateCents: centsOf(dailyRate),
          depositCents: centsOf(deposit),
        },
        startAt: start,
        endAt: end,
        days,
        dailyRate,
        rentAmount,
        depositAmount: deposit,
        discount,
        payAmount,
        customerRemark: input.remark,
        salesStaffId: input.salesStaffId || 0,
        salesStaffName: input.salesStaffName || '',
        expireAt: new Date(now.getTime() + trade.autoCancelMinutes * 60_000),
      },
    });
    if (input.customerId) {
      const count = await this.prisma.rentalOrder.count({
        where: { shopId: shop.id, customerId: input.customerId },
      });
      await this.scrm.enqueue({
        shopId: shop.id,
        ownerUserId: shop.ownerUserId,
        customerId: input.customerId,
        kind: count <= 1 ? 'CUSTOMER_REGISTER' : 'ORDER_PAID',
        recordKey:
          count <= 1
            ? `register:${input.customerId}`
            : `created:${created.orderNo}`,
        payload: {
          shopName: shop.name,
          orderNo: created.orderNo,
          itemName: created.itemName,
          amount: payAmount,
        },
      });
    }
    return created;
  }

  async publicCreateOrder(
    shopCode: string,
    customerToken: CustomerTokenPayload,
    input: {
      itemId: number;
      startAt: string;
      endAt: string;
      name: string;
      phone: string;
      remark: string;
    },
  ) {
    const shop = await this.shopByCode(shopCode);
    if (shop.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '门店暂停接单，请稍后再试',
      );
    }
    if (customerToken.shopId !== shop.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态与门店不一致，请重新进入小程序',
      );
    }
    const customer = await this.prisma.rentalCustomer.findUnique({
      where: { id: customerToken.customerId },
    });
    if (!customer || customer.shopId !== shop.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '顾客身份无效，请重新进入小程序',
      );
    }
    if (customer.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被门店限制下单，请联系门店',
      );
    }
    const phone = input.phone.trim().slice(0, 32);
    const nickname = input.name.trim().slice(0, 60);
    if (phone && phone !== customer.phone) {
      await this.prisma.rentalCustomer.update({
        where: { id: customer.id },
        data: { phone, ...(nickname ? { nickname } : {}) },
      });
    }
    await this.linkCrm(
      shop,
      customer.id,
      nickname || customer.nickname,
      phone || customer.phone,
    );
    const order = await this.buildOrder(shop, {
      customerId: customer.id,
      customerName: nickname || customer.nickname,
      customerPhone: phone || customer.phone,
      itemId: input.itemId,
      startAt: input.startAt,
      endAt: input.endAt,
      discount: 0,
      remark: input.remark,
      openid: customer.openid,
    });
    return this.publicOrder(order);
  }

  /**
   * 把租客回挂到站内 CRM：同一店主下按手机号找联系人，找不到才建客户 + 联系人。
   * 失败只降级为空转——CRM 是旁路，不能阻断租单。
   */
  private async linkCrm(
    shop: ShopRow,
    rentalCustomerId: number,
    name: string,
    phone: string,
  ) {
    const phoneNorm = String(phone || '')
      .replace(/\D/g, '')
      .slice(0, 40);
    if (!phoneNorm) return;
    try {
      const customer = await this.prisma.rentalCustomer.findUnique({
        where: { id: rentalCustomerId },
        select: { crmCustomerId: true },
      });
      if (!customer || customer.crmCustomerId > 0) return;
      const contact = await this.prisma.crmContact.findFirst({
        where: { ownerUserId: shop.ownerUserId, phoneNorm },
        select: { customerId: true },
      });
      let crmCustomerId = contact?.customerId || 0;
      if (!crmCustomerId) {
        const crmCustomer = await this.prisma.crmCustomer.create({
          data: {
            ownerUserId: shop.ownerUserId,
            name: name.trim() || `租赁顾客 ${phoneNorm.slice(-4)}`,
            remark: `租赁小程序顾客（门店 ${shop.name}）`,
            custom: { rentalShopId: shop.id, rentalCustomerId },
          },
        });
        crmCustomerId = crmCustomer.id;
        await this.prisma.crmContact.create({
          data: {
            ownerUserId: shop.ownerUserId,
            customerId: crmCustomerId,
            name: name.trim() || `租赁顾客 ${phoneNorm.slice(-4)}`,
            phone,
            phoneNorm,
          },
        });
      }
      await this.prisma.rentalCustomer.update({
        where: { id: rentalCustomerId },
        data: { crmCustomerId },
      });
    } catch {
      // CRM 旁路失败不影响下单
    }
  }

  private publicOrder(row: Parameters<RentalService['orderRow']>[0]) {
    const order = this.orderRow(row);
    return {
      id: order.id,
      orderNo: order.orderNo,
      itemId: order.itemId,
      itemName: order.itemName,
      startAt: order.startAt,
      endAt: order.endAt,
      days: order.days,
      rentCents: centsOf(order.rentAmount),
      depositCents: centsOf(order.depositAmount),
      discountCents: centsOf(order.discount),
      payCents: centsOf(order.payAmount),
      damageFeeCents: centsOf(order.damageFee),
      refundCents: centsOf(order.refundAmount),
      status: order.status,
      statusLabel: order.statusLabel,
      payStatus: order.payStatus,
      payStatusLabel: order.payStatusLabel,
      createdAt: order.createdAt,
    };
  }

  async publicOrders(
    shopId: number,
    customerId: number,
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const status = text(query.status, 'all');
    const where = {
      shopId,
      customerId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalOrder.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.publicOrder(row)),
      total,
      page,
      pageSize,
    );
  }

  async publicOrderDetail(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    const inspections = await this.prisma.rentalInspection.findMany({
      where: { shopId, orderId, kind: 'RETURN' },
      orderBy: { id: 'desc' },
      take: 1,
    });
    return {
      ...this.publicOrder(order),
      itemSnapshot: (order.itemSnapshot || {}) as Record<string, unknown>,
      remark: order.customerRemark,
      returnInspection: inspections[0]
        ? this.inspectionRow(inspections[0])
        : null,
    };
  }

  async publicCancel(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.ORDER_STATE,
        '已支付订单请联系门店取消并退款',
      );
    }
    transitRentalOrder('cancel', order.status);
    await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return { cancelled: true };
  }

  async orderAction(
    user: CurrentUser | null,
    shopId: number,
    orderId: number,
    body: RentalOrderActionInput,
    actor?: Actor,
  ) {
    if (user) await this.ownedShop(user, shopId);
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    if (!user && !actor) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '缺少操作人');
    }
    const action = body.action;
    if (action === 'refundDeposit') {
      return this.refundDeposit(shopId, order);
    }
    if (action === 'complete') {
      return this.completeOrder(shopId, order, body.note);
    }
    if (action === 'cancel') {
      return this.cancelOrder(shopId, order, actor);
    }
    const next = transitRentalOrder(action, order.status);
    const data: Record<string, unknown> = {
      status: next,
      staffNote: body.note ? body.note.slice(0, 500) : order.staffNote,
    };
    if (action === 'pickup') {
      data.pickupAt = new Date();
      if (actor?.staffId) {
        data.pickupStaffId = actor.staffId;
        data.pickupStaffName = actor.staffName || '';
      }
      await this.ensureInspection(shopId, order, 'HANDOVER', actor);
    }
    if (action === 'return') {
      data.returnAt = new Date();
      if (actor?.staffId) {
        data.returnStaffId = actor.staffId;
        data.returnStaffName = actor.staffName || '';
      }
      await this.ensureInspection(shopId, order, 'RETURN', actor);
    }
    if (action === 'expire') data.cancelledAt = new Date();
    await this.prisma.rentalOrder.update({ where: { id: order.id }, data });
    return this.orderDetailOf(shopId, order.id);
  }

  private async ensureInspection(
    shopId: number,
    order: { id: number },
    kind: 'HANDOVER' | 'RETURN',
    actor?: Actor,
  ) {
    const existing = await this.prisma.rentalInspection.findFirst({
      where: { shopId, orderId: order.id, kind },
    });
    if (existing) return existing;
    return this.prisma.rentalInspection.create({
      data: {
        shopId,
        orderId: order.id,
        kind,
        operatorStaffId: actor?.staffId || 0,
        operatorName: actor?.staffName || '',
      },
    });
  }

  private async completeOrder(
    shopId: number,
    order: {
      id: number;
      orderNo: string;
      status: string;
      payStatus: string;
      payAmount: unknown;
      depositAmount: unknown;
      damageFee: unknown;
      customerId: number;
      itemName: string;
    },
    note: string,
  ) {
    if (order.status === 'COMPLETED') {
      return this.orderDetailOf(shopId, order.id);
    }
    transitRentalOrder('complete', order.status);
    const inspection = await this.prisma.rentalInspection.findFirst({
      where: { shopId, orderId: order.id, kind: 'RETURN' },
      orderBy: { id: 'desc' },
    });
    const damageFee = round2(
      Number(inspection?.damageFee || order.damageFee || 0),
    );
    const deposit = Number(order.depositAmount);
    const refund = round2(Math.max(0, deposit - damageFee));
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true, name: true, tradeJson: true },
    });
    const autoRefund = shop ? this.tradeOf(shop).depositRefundAuto : false;
    const refundNow = autoRefund && refund > 0 && order.payStatus === 'PAID';
    if (refundNow) {
      try {
        await this.pay.refund(shopId, {
          orderNo: order.orderNo,
          totalCents: centsOf(Number(order.payAmount)),
          refundCents: centsOf(refund),
          reason: '租赁押金结算退还',
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : '微信退款失败';
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          `押金退款未完成：${reason}。订单保持「待结算」，处理后可再次结算`,
        );
      }
    }
    await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        damageFee,
        refundAmount: refundNow ? refund : 0,
        payStatus: refundNow ? 'REFUNDED' : order.payStatus,
        staffNote: note ? note.slice(0, 500) : undefined,
      },
    });
    await this.scrm.enqueue({
      shopId,
      ownerUserId: shop?.ownerUserId || '',
      customerId: order.customerId,
      kind: 'ORDER_COMPLETED',
      recordKey: `complete:${order.orderNo}`,
      payload: {
        shopName: shop?.name || '',
        orderNo: order.orderNo,
        itemName: order.itemName,
        amount: deposit,
      },
    });
    if (refundNow) {
      await this.scrm.enqueue({
        shopId,
        ownerUserId: shop?.ownerUserId || '',
        customerId: order.customerId,
        kind: 'ORDER_REFUNDED',
        recordKey: `deposit-refund:${order.orderNo}`,
        payload: {
          shopName: shop?.name || '',
          orderNo: order.orderNo,
          itemName: order.itemName,
          amount: refund,
        },
      });
    }
    return this.orderDetailOf(shopId, order.id);
  }

  /** 手动退押金：结算时关闭自动退款的门店，由店主在确认车况后单独触发。 */
  private async refundDeposit(
    shopId: number,
    order: {
      id: number;
      orderNo: string;
      status: string;
      payStatus: string;
      payAmount: unknown;
      depositAmount: unknown;
      damageFee: unknown;
      refundAmount: unknown;
      customerId: number;
      itemName: string;
    },
  ) {
    if (order.status !== 'COMPLETED') {
      throw new BusinessException(ErrorCode.ORDER_STATE, '请先完成还回结算');
    }
    if (order.payStatus !== 'PAID' || Number(order.refundAmount) > 0) {
      throw new BusinessException(
        ErrorCode.ORDER_STATE,
        '该订单押金已退或未支付',
      );
    }
    const inspection = await this.prisma.rentalInspection.findFirst({
      where: { shopId, orderId: order.id, kind: 'RETURN' },
      orderBy: { id: 'desc' },
    });
    const damageFee = round2(
      Number(inspection?.damageFee || order.damageFee || 0),
    );
    const refund = round2(Math.max(0, Number(order.depositAmount) - damageFee));
    if (refund <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '扣除车损后无可退押金',
      );
    }
    await this.pay.refund(shopId, {
      orderNo: order.orderNo,
      totalCents: centsOf(Number(order.payAmount)),
      refundCents: centsOf(refund),
      reason: '租赁押金手动退还',
    });
    await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: { payStatus: 'REFUNDED', refundAmount: refund },
    });
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true, name: true },
    });
    await this.scrm.enqueue({
      shopId,
      ownerUserId: shop?.ownerUserId || '',
      customerId: order.customerId,
      kind: 'ORDER_REFUNDED',
      recordKey: `deposit-manual:${order.orderNo}`,
      payload: {
        shopName: shop?.name || '',
        orderNo: order.orderNo,
        itemName: order.itemName,
        amount: refund,
      },
    });
    return this.orderDetailOf(shopId, order.id);
  }

  private async cancelOrder(
    shopId: number,
    order: {
      id: number;
      orderNo: string;
      status: string;
      payStatus: string;
      payAmount: unknown;
      customerId: number;
      itemName: string;
    },
    actor?: Actor,
  ) {
    const next = transitRentalOrder('cancel', order.status);
    if (order.status === 'PAID') {
      await this.pay.refund(shopId, {
        orderNo: order.orderNo,
        totalCents: centsOf(Number(order.payAmount)),
        refundCents: centsOf(Number(order.payAmount)),
        reason: '租赁订单取消退款',
      });
    }
    await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: {
        status: next,
        payStatus: order.status === 'PAID' ? 'REFUNDED' : order.payStatus,
        refundAmount: order.status === 'PAID' ? Number(order.payAmount) : 0,
        cancelledAt: new Date(),
        staffNote: actor?.staffName ? `由 ${actor.staffName} 取消` : undefined,
      },
    });
    if (order.status === 'PAID') {
      const shop = await this.prisma.rentalShop.findUnique({
        where: { id: shopId },
        select: { ownerUserId: true, name: true },
      });
      await this.scrm.enqueue({
        shopId,
        ownerUserId: shop?.ownerUserId || '',
        customerId: order.customerId,
        kind: 'ORDER_REFUNDED',
        recordKey: `cancel-refund:${order.orderNo}`,
        payload: {
          shopName: shop?.name || '',
          orderNo: order.orderNo,
          itemName: order.itemName,
          amount: Number(order.payAmount),
        },
      });
    }
    return this.orderDetailOf(shopId, order.id);
  }

  async saveInspection(
    shopId: number,
    orderId: number,
    body: RentalInspectionInput,
    actor?: Actor,
    user?: CurrentUser | null,
  ) {
    if (user) await this.ownedShop(user, shopId);
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '租单不存在');
    if (
      body.kind === 'HANDOVER' &&
      !['PAID', 'PICKED_UP'].includes(order.status)
    ) {
      throw new BusinessException(
        ErrorCode.ORDER_STATE,
        '当前状态不能登记取车验车',
      );
    }
    if (
      body.kind === 'RETURN' &&
      !['PICKED_UP', 'RETURNED'].includes(order.status)
    ) {
      throw new BusinessException(
        ErrorCode.ORDER_STATE,
        '当前状态不能登记还回验车',
      );
    }
    const existing = await this.prisma.rentalInspection.findFirst({
      where: { shopId, orderId, kind: body.kind },
    });
    const data = {
      shopId,
      orderId,
      kind: body.kind,
      mileage: body.mileage,
      fuelPercent: body.fuelPercent,
      damage: body.damage,
      damageFee: round2(body.damageFee),
      imagesJson: body.images,
      note: body.note,
      operatorStaffId: actor?.staffId || 0,
      operatorName: actor?.staffName || '',
    };
    const row = existing
      ? await this.prisma.rentalInspection.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.rentalInspection.create({ data });
    if (body.kind === 'RETURN') {
      await this.prisma.rentalOrder.update({
        where: { id: orderId },
        data: { damageFee: round2(body.damageFee) },
      });
    }
    return this.inspectionRow(row);
  }

  async inspections(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.ownedShop(user, Number(id));
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const kind = text(query.kind, 'all');
    const orderNo = text(query.orderNo).trim();
    const orderIds = orderNo
      ? (
          await this.prisma.rentalOrder.findMany({
            where: { shopId: shop.id, orderNo: { contains: orderNo } },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [];
    const where = {
      shopId: shop.id,
      ...(kind && kind !== 'all' ? { kind } : {}),
      ...(orderNo ? { orderId: { in: orderIds } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalInspection.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalInspection.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.inspectionRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async autoExpire() {
    const result = await this.prisma.rentalOrder.updateMany({
      where: { status: 'PENDING_PAYMENT', expireAt: { lt: new Date() } },
      data: { status: 'EXPIRED', cancelledAt: new Date() },
    });
    return result.count;
  }

  // ------------------------------------------------------------ 顾客

  private async customerRowOf(shopId: number, customerId: number) {
    const row = await this.prisma.rentalCustomer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const agg = await this.prisma.rentalOrder.aggregate({
      where: { shopId, customerId: row.id },
      _count: { _all: true },
      _sum: { payAmount: true },
      _max: { createdAt: true },
    });
    return {
      id: row.id,
      openid: row.openid,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      source: row.source,
      gender: row.gender,
      city: row.city,
      remark: row.remark,
      status: row.status,
      orderCount: agg._count._all,
      totalSpend: round2(Number(agg._sum.payAmount || 0)),
      lastOrderAt: agg._max.createdAt ? agg._max.createdAt.toISOString() : '',
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  async customers(
    user: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.ownedShop(user, Number(id));
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.id,
      ...(keyword
        ? {
            OR: [
              { nickname: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          }
        : {}),
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalCustomer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalCustomer.count({ where }),
    ]);
    const list = await Promise.all(
      rows.map((row) => this.customerRowOf(shop.id, row.id)),
    );
    return pageOf(list, total, page, pageSize);
  }

  async saveCustomer(user: CurrentUser, id: string, body: RentalCustomerInput) {
    const shop = await this.ownedShop(user, Number(id));
    if (body.id) {
      const existing = await this.prisma.rentalCustomer.findFirst({
        where: { id: body.id, shopId: shop.id },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
      const row = await this.prisma.rentalCustomer.update({
        where: { id: existing.id },
        data: {
          nickname: body.nickname,
          phone: body.phone,
          gender: body.gender,
          city: body.city,
          remark: body.remark,
          status: body.status,
        },
      });
      await this.linkCrm(shop, row.id, row.nickname, row.phone);
      return this.customerRowOf(shop.id, row.id);
    }
    const duplicate = await this.prisma.rentalCustomer.findFirst({
      where: { shopId: shop.id, phone: body.phone },
    });
    if (duplicate) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该手机号已有顾客档案，请直接编辑现有顾客',
      );
    }
    const row = await this.prisma.rentalCustomer.create({
      data: {
        shopId: shop.id,
        openid: `MANUAL:${randomBytes(8).toString('hex')}`,
        nickname: body.nickname,
        phone: body.phone,
        gender: body.gender,
        city: body.city,
        remark: body.remark,
        source: 'ADMIN',
        status: body.status,
      },
    });
    await this.linkCrm(shop, row.id, row.nickname, row.phone);
    return this.customerRowOf(shop.id, row.id);
  }

  async removeCustomer(user: CurrentUser, id: string, body: { id: number }) {
    const shop = await this.ownedShop(user, Number(id));
    const customer = await this.prisma.rentalCustomer.findFirst({
      where: { id: body.id, shopId: shop.id },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const orderCount = await this.prisma.rentalOrder.count({
      where: { shopId: shop.id, customerId: customer.id },
    });
    if (orderCount > 0) {
      await this.prisma.rentalCustomer.update({
        where: { id: customer.id },
        data: { status: 'BLOCKED' },
      });
      return { removed: false, blocked: true };
    }
    await this.prisma.rentalCustomer.delete({ where: { id: customer.id } });
    return { removed: true, blocked: false };
  }

  async customerStatus(
    user: CurrentUser,
    id: string,
    customerId: string,
    body: { status: 'ACTIVE' | 'BLOCKED' },
  ) {
    const shop = await this.ownedShop(user, Number(id));
    const customer = await this.prisma.rentalCustomer.findFirst({
      where: { id: Number(customerId), shopId: shop.id },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    await this.prisma.rentalCustomer.update({
      where: { id: customer.id },
      data: { status: body.status },
    });
    return this.customerRowOf(shop.id, customer.id);
  }

  async publicLogin(shopCode: string, code: string) {
    const shop = await this.shopByCode(shopCode);
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: shop.ownerUserId,
      scene: SCENE,
      shopId: shop.id,
      shopName: shop.name,
    });
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.rentalCustomer.upsert({
      where: { shopId_openid: { shopId: shop.id, openid: session.openId } },
      create: {
        shopId: shop.id,
        openid: session.openId,
        unionId: session.unionId,
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
        '该账号已被门店限制下单，请联系门店',
      );
    }
    const token = issueCustomerToken({
      scene: RENTAL_SCENE,
      shopId: shop.id,
      customerId: row.id,
      openid: row.openid,
    });
    return {
      token,
      profile: {
        customerId: row.id,
        nickname: row.nickname,
        avatar: row.avatar,
        phone: row.phone,
        shopCode: shop.shopCode,
        shopName: shop.name,
      },
    };
  }

  async requireCustomer(payload: CustomerTokenPayload) {
    if (payload.scene !== SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '顾客身份不属于租赁门店',
      );
    }
    const customer = await this.prisma.rentalCustomer.findFirst({
      where: { id: payload.customerId, shopId: payload.shopId },
    });
    if (!customer) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '顾客身份无效，请重新进入小程序',
      );
    }
    if (customer.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该账号已被门店限制下单，请联系门店',
      );
    }
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: payload.shopId },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '门店不存在');
    }
    return { customer, shop };
  }

  // ------------------------------------------------------------ 员工

  private staffRow(row: {
    id: number;
    shopId: number;
    name: string;
    phone: string;
    staffCode: string;
    role: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      shopId: row.shopId,
      name: row.name,
      phone: row.phone,
      staffCode: row.staffCode,
      role: row.role,
      roleLabel: RENTAL_STAFF_ROLE_LABELS[row.role] || row.role,
      status: row.status,
      statusLabel: RENTAL_STAFF_STATUS_LABELS[row.status] || row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async staffs(user: CurrentUser, id: string, query: Record<string, unknown>) {
    const shop = await this.ownedShop(user, Number(id));
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.id,
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { phone: { contains: keyword } },
              { staffCode: { contains: keyword } },
            ],
          }
        : {}),
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalStaff.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalStaff.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.staffRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async saveStaff(user: CurrentUser, id: string, body: RentalStaffInput) {
    const shop = await this.ownedShop(user, Number(id));
    const data = {
      shopId: shop.id,
      name: body.name.trim(),
      phone: body.phone.trim(),
      staffCode: body.staffCode.trim().toUpperCase(),
      role: body.role,
      status: body.status,
    };
    const duplicate = await this.prisma.rentalStaff.findFirst({
      where: {
        shopId: shop.id,
        staffCode: data.staffCode,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (duplicate) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该工号已被本店其他员工使用',
      );
    }
    if (body.id) {
      const existing = await this.prisma.rentalStaff.findFirst({
        where: { id: body.id, shopId: shop.id },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '员工不存在');
      const updated = await this.prisma.rentalStaff.update({
        where: { id: existing.id },
        data,
      });
      return this.staffRow(updated);
    }
    const created = await this.prisma.rentalStaff.create({ data });
    return this.staffRow(created);
  }

  async removeStaff(user: CurrentUser, id: string, body: { id: number }) {
    const shop = await this.ownedShop(user, Number(id));
    const staff = await this.prisma.rentalStaff.findFirst({
      where: { id: body.id, shopId: shop.id },
    });
    if (!staff) throw new BusinessException(ErrorCode.NOT_FOUND, '员工不存在');
    await this.prisma.rentalStaff.update({
      where: { id: staff.id },
      data: { status: 'SUSPENDED' },
    });
    return { removed: true };
  }

  async staffBind(
    customerToken: CustomerTokenPayload,
    input: { shopCode: string; phone: string; staffCode: string },
  ) {
    const shop = await this.shopByCode(input.shopCode);
    if (customerToken.shopId !== shop.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请在员工所属门店的小程序内绑定',
      );
    }
    const staff = await this.prisma.rentalStaff.findFirst({
      where: {
        shopId: shop.id,
        phone: input.phone.trim().slice(0, 32),
        staffCode: input.staffCode.trim().toUpperCase().slice(0, 32),
      },
    });
    if (!staff) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '未找到匹配的员工档案：请核对手机号与工号，或让店长在后台确认你已在岗',
      );
    }
    if (staff.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '你已被门店停用，请联系店长恢复后再绑定',
      );
    }
    return {
      token: issueRentalStaffToken({
        shopId: shop.id,
        staffId: staff.id,
        customerId: customerToken.customerId,
        openid: customerToken.openid,
      }),
      staff: { ...this.staffRow(staff), shopName: shop.name },
    };
  }

  async requireStaff(token: string) {
    const payload = parseRentalStaffToken(token);
    const staff = await this.prisma.rentalStaff.findFirst({
      where: { id: payload.staffId, shopId: payload.shopId },
    });
    if (!staff || staff.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '员工身份已失效，请重新绑定',
      );
    }
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: payload.shopId },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '门店不存在');
    return { staff, shop, payload };
  }

  async staffWorkbench(staffId: number, shopId: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [pendingPickup, inUse, pendingReturn, todayOrders, itemsOnline] =
      await Promise.all([
        this.prisma.rentalOrder.count({ where: { shopId, status: 'PAID' } }),
        this.prisma.rentalOrder.count({
          where: { shopId, status: 'PICKED_UP' },
        }),
        this.prisma.rentalOrder.count({
          where: { shopId, status: 'RETURNED' },
        }),
        this.prisma.rentalOrder.count({
          where: { shopId, createdAt: { gte: start } },
        }),
        this.prisma.rentalItem.count({ where: { shopId, status: 'ONLINE' } }),
      ]);
    return {
      staffId,
      pendingPickup,
      inUse,
      pendingReturn,
      todayOrders,
      itemsOnline,
    };
  }

  async staffOrders(shopId: number, query: Record<string, unknown>) {
    return this.ordersOf(shopId, query);
  }

  async staffOrderDetail(shopId: number, orderId: number) {
    return this.orderDetailOf(shopId, orderId);
  }

  async staffOrderAction(
    shopId: number,
    orderId: number,
    body: RentalOrderActionInput,
    actor: Actor,
  ) {
    return this.orderAction(null, shopId, orderId, body, actor);
  }

  async staffCustomers(shopId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      text(query.page, '1'),
      text(query.pageSize, '20'),
    );
    const keyword = text(query.keyword).trim();
    const where = {
      shopId,
      ...(keyword
        ? {
            OR: [
              { nickname: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rentalCustomer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.rentalCustomer.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        phone: row.phone,
        status: row.status,
        lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : '',
      })),
      total,
      page,
      pageSize,
    );
  }

  // ------------------------------------------------------------ 看板

  async publicBootstrap(shopCode: string) {
    const shop = await this.shopByCode(shopCode);
    const trade = this.tradeOf(shop);
    const theme = this.themeOf(shop);
    const [payEnabled, desk, scrm] = await Promise.all([
      this.pay.payEnabled(shop.id),
      this.deskEntry(shop.ownerUserId, trade.deskSiteKey),
      this.scrmEntry(shop.ownerUserId, trade.scrmCodeId),
    ]);
    return {
      scene: SCENE,
      shopCode: shop.shopCode,
      shopName: shop.name,
      logo: shop.logo,
      servicePhone: shop.servicePhone,
      address: shop.address,
      themeColor: theme.themeColor,
      navigationTitle: theme.navigationTitle,
      shopStatus: shop.status,
      desk,
      scrm,
      payEnabled,
      notice: trade.notice,
      trade: {
        maxRentDays: trade.maxRentDays,
        depositRefundHours: trade.depositRefundHours,
        autoCancelMinutes: trade.autoCancelMinutes,
      },
      features: { booking: shop.status === 'ONLINE' },
    };
  }

  private async deskEntry(ownerUserId: string, siteKey: string) {
    if (!siteKey) return { enabled: false, siteKey: '', name: '' };
    if (!(await this.toggle.isOpen('service-desk', ownerUserId))) {
      return { enabled: false, siteKey: '', name: '' };
    }
    const site = await this.prisma.serviceDeskSite.findFirst({
      where: { siteKey, ownerUserId },
      select: { name: true, enabled: true },
    });
    return {
      enabled: Boolean(site?.enabled),
      siteKey: site?.enabled ? siteKey : '',
      name: site?.name || '',
    };
  }

  private async scrmEntry(ownerUserId: string, codeId: number) {
    if (!codeId) return { enabled: false, qrUrl: '', name: '' };
    if (!(await this.toggle.isOpen('wecom-scrm', ownerUserId))) {
      return { enabled: false, qrUrl: '', name: '' };
    }
    const code = await this.prisma.scrmCode.findFirst({
      where: { id: codeId, orgUserId: ownerUserId },
      select: { name: true, qrUrl: true, status: true },
    });
    return {
      enabled: code?.status === 'ACTIVE' && Boolean(code?.qrUrl),
      qrUrl: code?.qrUrl || '',
      name: code?.name || '',
    };
  }

  async stats(user: CurrentUser, id: string, query: Record<string, unknown>) {
    const shop = await this.ownedShop(user, Number(id));
    const days = Math.min(90, Math.max(7, Number(query.days || 30)));
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);
    const [orders, statusGroups, customers] = await Promise.all([
      this.prisma.rentalOrder.findMany({
        where: { shopId: shop.id, createdAt: { gte: since } },
        select: {
          createdAt: true,
          payAmount: true,
          status: true,
          itemId: true,
          itemName: true,
          itemSnapshot: true,
          salesStaffName: true,
          pickupStaffName: true,
        },
      }),
      this.prisma.rentalOrder.groupBy({
        by: ['status'],
        where: { shopId: shop.id },
        _count: { _all: true },
      }),
      this.prisma.rentalCustomer.findMany({
        where: { shopId: shop.id },
        select: { gender: true, city: true },
      }),
    ]);
    const trendMap = new Map<string, { orders: number; revenue: number }>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(since);
      date.setDate(since.getDate() + i);
      trendMap.set(dayKey(date), { orders: 0, revenue: 0 });
    }
    const itemMap = new Map<
      number,
      { itemName: string; orders: number; revenue: number }
    >();
    const categoryMap = new Map<string, number>();
    const staffMap = new Map<
      string,
      { staffName: string; orders: number; revenue: number }
    >();
    for (const order of orders) {
      const key = dayKey(order.createdAt);
      const bucket = trendMap.get(key);
      if (bucket) {
        bucket.orders += 1;
        if (order.status !== 'CANCELLED' && order.status !== 'EXPIRED') {
          bucket.revenue = round2(bucket.revenue + Number(order.payAmount));
        }
      }
      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') continue;
      const item = itemMap.get(order.itemId) || {
        itemName: order.itemName,
        orders: 0,
        revenue: 0,
      };
      item.orders += 1;
      item.revenue = round2(item.revenue + Number(order.payAmount));
      itemMap.set(order.itemId, item);
      const snapshot = (order.itemSnapshot || {}) as Record<string, unknown>;
      const category = text(snapshot.category, '未分类') || '未分类';
      categoryMap.set(
        category,
        round2((categoryMap.get(category) || 0) + Number(order.payAmount)),
      );
      const staffName =
        order.pickupStaffName || order.salesStaffName || '未指派员工';
      const staff = staffMap.get(staffName) || {
        staffName,
        orders: 0,
        revenue: 0,
      };
      staff.orders += 1;
      staff.revenue = round2(staff.revenue + Number(order.payAmount));
      staffMap.set(staffName, staff);
    }
    const genderLabels: Record<number, string> = {
      0: '未填写',
      1: '男',
      2: '女',
    };
    const genderCount = new Map<string, number>();
    const cityCount = new Map<string, number>();
    for (const customer of customers) {
      const gender = genderLabels[customer.gender] || '未填写';
      genderCount.set(gender, (genderCount.get(gender) || 0) + 1);
      const city = customer.city || '未填写';
      cityCount.set(city, (cityCount.get(city) || 0) + 1);
    }
    return {
      trend: [...trendMap.entries()].map(([date, value]) => ({
        date,
        ...value,
      })),
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
      topItems: [...itemMap.entries()]
        .map(([itemId, value]) => ({ itemId, ...value }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      categoryRevenue: [...categoryMap.entries()]
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      staffPerformance: [...staffMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      customerGender: [...genderCount.entries()].map(([key, count]) => ({
        key,
        count,
      })),
      customerCities: [...cityCount.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}

function attributesOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      out[key] = String(item);
    }
  }
  return out;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
