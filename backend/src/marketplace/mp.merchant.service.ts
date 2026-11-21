import type {
  MpCategory,
  MpMerchant,
  MpMerchantApplyBody,
  MpMerchantAuditBody,
  MpMerchantDetail,
  MpMerchantProfile,
  MpMerchantSession,
  MpMerchantShopSaveBody,
  MpMerchantStaffSaveBody,
  MpMerchantStatusBody,
  MpMerchantUser,
  MpShop,
  MpShopStatusBody,
} from '@enterprise/contracts';
import { mpMerchantListQuerySchema } from '@enterprise/contracts';
import { z } from 'zod';
import type { PageResponse } from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { decimalOf, iso, jsonIds, uniqueShopCode } from './mp.shared';
import {
  hashPassword,
  issueMerchantToken,
  type MpMerchantTokenPayload,
  verifyPassword,
} from './mp.token';

type MerchantListQuery = z.input<typeof mpMerchantListQuerySchema>;
type MerchantRow =
  Awaited<ReturnType<PrismaService['mpMerchant']['findUnique']>> extends infer R
    ? NonNullable<R>
    : never;
type MerchantUserRow = NonNullable<
  Awaited<ReturnType<PrismaService['mpMerchantUser']['findUnique']>>
>;
type MarketRow = NonNullable<
  Awaited<ReturnType<PrismaService['mpMarket']['findUnique']>>
>;
type ShopRow = NonNullable<
  Awaited<ReturnType<PrismaService['mpShop']['findUnique']>>
>;

export type MerchantContext = {
  user: MerchantUserRow;
  merchant: MerchantRow;
  market: MarketRow;
  shop: ShopRow | null;
};

/**
 * 商户主体与账号：入驻申请、审核、商户后台会话、店铺与店员。
 *
 * 所有读写都以「市场 id + 商户 id」双条件收口（`mpMerchantToken` 载荷里的两个 id
 * 只是入口，真正的授权状态每次请求都回库重读，停用/封禁即时生效）。
 */
export class MpMerchantService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ 入驻（公开）

  async apply(
    body: MpMerchantApplyBody,
  ): Promise<{ ok: boolean; message: string }> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { shopCode: body.marketCode },
    });
    if (!market) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '市场编号不存在，请向市场运营方确认后重试',
      );
    }
    if (market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        market.status === 'DRAFT'
          ? '该市场还在筹备中，暂未开放入驻'
          : '该市场当前已停服，暂不接受入驻申请',
      );
    }
    const categories = await this.requireCategories(
      market.id,
      body.categoryIds,
    );
    const duplicatedUsername = await this.prisma.mpMerchantUser.findUnique({
      where: { username: body.username },
      select: { id: true },
    });
    if (duplicatedUsername) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '登录账号已被占用，请换一个账号名',
      );
    }
    if (body.licenseNo) {
      const duplicatedLicense = await this.prisma.mpMerchant.findFirst({
        where: {
          marketId: market.id,
          licenseNo: body.licenseNo,
          auditStatus: { in: ['PENDING', 'APPROVED'] },
        },
        select: { id: true },
      });
      if (duplicatedLicense) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该营业执照已提交过入驻申请，请直接使用原账号登录或联系市场运营方',
        );
      }
    }
    const { salt, hash } = hashPassword(body.password);
    await this.prisma.$transaction(async (tx) => {
      const merchant = await tx.mpMerchant.create({
        data: {
          marketId: market.id,
          name: body.name,
          licenseNo: body.licenseNo,
          licenseImage: body.licenseImage,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          categoryIds: categories.map((item) => item.id),
          auditStatus: 'PENDING',
          status: 'ACTIVE',
        },
      });
      await tx.mpMerchantUser.create({
        data: {
          marketId: market.id,
          merchantId: merchant.id,
          username: body.username,
          passwordHash: hash,
          salt,
          role: 'OWNER',
          phone: body.phone || body.contactPhone,
          status: 'ACTIVE',
        },
      });
    });
    return {
      ok: true,
      message: '入驻申请已提交，市场运营方审核通过后可登录商户后台',
    };
  }

  /** 入驻页下拉：市场信息 + 可经营类目（只回公开字段）。 */
  async options(marketCode: string) {
    const market = await this.prisma.mpMarket.findUnique({
      where: { shopCode: marketCode },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场编号不存在');
    }
    const categories = await this.prisma.mpCategory.findMany({
      where: { marketId: market.id, status: 'ONLINE' },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, parentId: true },
    });
    return {
      marketName: market.name,
      marketCode: market.shopCode,
      categories,
    };
  }

  // ------------------------------------------------------------ 登录与会话

  async login(username: string, password: string): Promise<MpMerchantSession> {
    const user = await this.prisma.mpMerchantUser.findUnique({
      where: { username },
    });
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号或密码不正确');
    }
    if (user.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已停用，请联系商户负责人或市场运营方',
      );
    }
    const merchant = await this.prisma.mpMerchant.findUnique({
      where: { id: user.merchantId },
    });
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: user.marketId },
    });
    if (!merchant || !market || merchant.marketId !== market.id) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '商户主体或市场已不存在，请联系市场运营方',
      );
    }
    if (merchant.auditStatus !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        merchant.auditStatus === 'PENDING'
          ? '入驻申请审核中，通过后即可登录商户后台'
          : merchant.auditStatus === 'REJECTED'
            ? `入驻申请已被驳回：${merchant.auditNote || '请联系市场运营方'}`
            : '商户已被封禁，请联系市场运营方',
      );
    }
    if (merchant.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '商户已退出市场，如需恢复请联系市场运营方',
      );
    }
    if (market.status === 'CLOSED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '所属市场已关闭，无法登录',
      );
    }
    const shop = await this.firstShop(user.merchantId);
    await this.prisma.mpMerchantUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const token = issueMerchantToken({
      marketId: user.marketId,
      merchantId: user.merchantId,
      userId: user.id,
      role: user.role === 'OWNER' ? 'OWNER' : 'STAFF',
    });
    return {
      token,
      merchantId: merchant.id,
      marketId: market.id,
      marketName: market.name,
      marketShopCode: market.shopCode,
      shopId: shop?.id ?? 0,
      shopCode: shop?.shopCode ?? '',
      shopName: shop?.name ?? merchant.name,
      username: user.username,
      role: user.role === 'OWNER' ? 'OWNER' : 'STAFF',
      auditStatus: merchant.auditStatus as MpMerchantSession['auditStatus'],
      auditNote: merchant.auditNote,
    };
  }

  private async firstShop(merchantId: number) {
    return this.prisma.mpShop.findFirst({
      where: { merchantId },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 每次请求回库校验：账号/商户/市场三层状态 + 载荷与库内 marketId 一致。
   * `write` 另要求市场处于营业中（停服期间只读，避免商户在平台停服时继续改数据）。
   */
  private async context(
    payload: MpMerchantTokenPayload,
    write = false,
  ): Promise<MerchantContext> {
    const user = await this.prisma.mpMerchantUser.findUnique({
      where: { id: payload.userId },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '商户账号已停用，请重新登录或联系负责人',
      );
    }
    if (
      user.merchantId !== payload.merchantId ||
      user.marketId !== payload.marketId
    ) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '商户登录状态已变化，请重新登录',
      );
    }
    const merchant = await this.prisma.mpMerchant.findUnique({
      where: { id: user.merchantId },
    });
    if (!merchant) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '商户主体不存在，请联系市场运营方',
      );
    }
    if (merchant.auditStatus !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '商户资质未通过审核，暂不可进入后台',
      );
    }
    if (merchant.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '商户已退出市场，暂不可操作',
      );
    }
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: merchant.marketId },
    });
    if (!market || market.id !== payload.marketId) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '所属市场不存在或已变更',
      );
    }
    if (market.status === 'CLOSED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '所属市场已关闭，暂不可操作',
      );
    }
    if (write && market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '市场当前未营业（筹备中或平台停服），暂不可修改数据',
      );
    }
    const shop = await this.firstShop(user.merchantId);
    return { user, merchant, market, shop };
  }

  /**
   * 供商品 / 订单等服务复用的会话校验入口（与后台其余接口同一套回库校验）。
   */
  session(payload: MpMerchantTokenPayload, write = false) {
    return this.context(payload, write);
  }

  async profile(payload: MpMerchantTokenPayload): Promise<MpMerchantProfile> {
    const { user, merchant, market, shop } = await this.context(payload);
    const categories = await this.categoryNames(merchant.marketId);
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      marketId: market.id,
      marketName: market.name,
      marketShopCode: market.shopCode,
      marketStatus: market.status as MpMerchantProfile['marketStatus'],
      auditStatus: merchant.auditStatus as MpMerchantProfile['auditStatus'],
      auditNote: merchant.auditNote,
      userId: user.id,
      username: user.username,
      role: user.role === 'OWNER' ? 'OWNER' : 'STAFF',
      phone: user.phone,
      lastLoginAt: iso(user.lastLoginAt),
      shop: shop ? this.shopView(shop, merchant.name, categories) : null,
    };
  }

  async changePassword(
    payload: MpMerchantTokenPayload,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; message: string }> {
    const { user } = await this.context(payload);
    if (!verifyPassword(oldPassword, user.salt, user.passwordHash)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '原密码不正确');
    }
    const { salt, hash } = hashPassword(newPassword);
    await this.prisma.mpMerchantUser.update({
      where: { id: user.id },
      data: { salt, passwordHash: hash },
    });
    return { ok: true, message: '密码已更新' };
  }

  // ------------------------------------------------------------ 店铺（商户侧）

  async shopDetail(payload: MpMerchantTokenPayload): Promise<MpShop> {
    const { merchant, shop } = await this.context(payload);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺尚未创建，请联系市场运营方',
      );
    }
    const categories = await this.categoryNames(merchant.marketId);
    return this.shopView(shop, merchant.name, categories);
  }

  async shopSave(
    payload: MpMerchantTokenPayload,
    body: MpMerchantShopSaveBody,
  ): Promise<MpShop> {
    const { user, merchant, shop } = await this.context(payload, true);
    this.assertOwner(user);
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺尚未创建');
    }
    if (body.categoryIds.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请至少选择一个经营类目',
      );
    }
    await this.requireCategories(merchant.marketId, body.categoryIds);
    if (body.payEnabled && !body.mchId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '开启微信支付前请先填写商户号（mchId）',
      );
    }
    const updated = await this.prisma.mpShop.update({
      where: { id: shop.id },
      data: {
        name: body.name,
        logo: body.logo,
        intro: body.intro,
        categoryIds: body.categoryIds,
        mchId: body.mchId,
        payEnabled: body.payEnabled,
      },
    });
    const categories = await this.categoryNames(merchant.marketId);
    return this.shopView(updated, merchant.name, categories);
  }

  async shopStatus(
    payload: MpMerchantTokenPayload,
    body: { status: 'DRAFT' | 'ONLINE' },
  ): Promise<MpShop> {
    const { user, merchant, shop } = await this.context(payload, true);
    this.assertOwner(user);
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺尚未创建');
    }
    if (body.status === 'ONLINE' && jsonIds(shop.categoryIds).length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在店铺设置里选择经营类目再开店',
      );
    }
    const updated = await this.prisma.mpShop.update({
      where: { id: shop.id },
      data: { status: body.status },
    });
    const categories = await this.categoryNames(merchant.marketId);
    return this.shopView(updated, merchant.name, categories);
  }

  // ------------------------------------------------------------ 店员（商户侧）

  async staffList(payload: MpMerchantTokenPayload): Promise<MpMerchantUser[]> {
    const { merchant } = await this.context(payload);
    const rows = await this.prisma.mpMerchantUser.findMany({
      where: { merchantId: merchant.id },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.userView(row));
  }

  async staffSave(
    payload: MpMerchantTokenPayload,
    body: MpMerchantStaffSaveBody,
  ): Promise<MpMerchantUser> {
    const { user, merchant } = await this.context(payload, true);
    this.assertOwner(user);
    if (body.id > 0) {
      const target = await this.prisma.mpMerchantUser.findFirst({
        where: { id: body.id, merchantId: merchant.id },
      });
      if (!target) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '店员不存在');
      }
      if (target.username !== body.username) {
        await this.assertUsernameFree(body.username, target.id);
      }
      const patch: Record<string, unknown> = {
        username: body.username,
        phone: body.phone,
      };
      if (body.password) {
        if (body.password.length < 8) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '重置密码至少 8 位',
          );
        }
        const { salt, hash } = hashPassword(body.password);
        patch.salt = salt;
        patch.passwordHash = hash;
      }
      const updated = await this.prisma.mpMerchantUser.update({
        where: { id: target.id },
        // 角色不允许改：避免把店员提权成负责人或反过来
        data: patch,
      });
      return this.userView(updated);
    }
    await this.assertUsernameFree(body.username, 0);
    if (body.password.length < 8) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '新账号密码至少 8 位');
    }
    const { salt, hash } = hashPassword(body.password);
    const created = await this.prisma.mpMerchantUser.create({
      data: {
        marketId: merchant.marketId,
        merchantId: merchant.id,
        username: body.username,
        passwordHash: hash,
        salt,
        role: 'STAFF',
        phone: body.phone,
        status: 'ACTIVE',
      },
    });
    return this.userView(created);
  }

  async staffStatus(
    payload: MpMerchantTokenPayload,
    id: number,
    status: 'ACTIVE' | 'DISABLED',
  ): Promise<MpMerchantUser> {
    const { user, merchant } = await this.context(payload, true);
    this.assertOwner(user);
    const target = await this.prisma.mpMerchantUser.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!target) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店员不存在');
    }
    if (target.id === user.id) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '不能停用当前登录的账号',
      );
    }
    if (target.role === 'OWNER') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '负责人账号不能被店员停用',
      );
    }
    const updated = await this.prisma.mpMerchantUser.update({
      where: { id: target.id },
      data: { status },
    });
    return this.userView(updated);
  }

  private assertOwner(user: MerchantUserRow) {
    if (user.role !== 'OWNER') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该操作仅限商户负责人');
    }
  }

  private async assertUsernameFree(username: string, selfId: number) {
    const duplicated = await this.prisma.mpMerchantUser.findUnique({
      where: { username },
      select: { id: true },
    });
    if (duplicated && duplicated.id !== selfId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '登录账号已被占用，请换一个账号名',
      );
    }
  }

  // ------------------------------------------------------------ 市场运营方侧

  async list(
    marketId: number,
    query: MerchantListQuery,
  ): Promise<PageResponse<MpMerchant>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.auditStatus ? { auditStatus: String(query.auditStatus) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { contactName: { contains: keyword } },
              { contactPhone: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpMerchant.count({ where }),
      this.prisma.mpMerchant.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [categories, shopCounts] = await Promise.all([
      this.categoryMap(marketId),
      this.shopCounts(
        marketId,
        rows.map((row) => row.id),
      ),
    ]);
    return {
      list: rows.map((row) =>
        this.merchantView(row, categories, shopCounts.get(row.id) ?? 0),
      ),
      total,
      page,
      pageSize,
    };
  }

  async detail(marketId: number, id: number): Promise<MpMerchantDetail> {
    const row = await this.prisma.mpMerchant.findFirst({
      where: { id, marketId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商户不存在');
    }
    const [categories, shops, users] = await Promise.all([
      this.categoryMap(marketId),
      this.prisma.mpShop.findMany({
        where: { merchantId: id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.mpMerchantUser.findMany({
        where: { merchantId: id },
        orderBy: [{ role: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      merchant: this.merchantView(row, categories, shops.length),
      shops: shops.map((shop) => ({
        id: shop.id,
        shopCode: shop.shopCode,
        name: shop.name,
        logo: shop.logo,
        status: shop.status as MpShop['status'],
        payEnabled: shop.payEnabled,
        createdAt: iso(shop.createdAt),
      })),
      users: users.map((user) => this.userView(user)),
    };
  }

  async audit(
    marketId: number,
    auditor: string,
    body: MpMerchantAuditBody,
  ): Promise<MpMerchant> {
    const merchant = await this.prisma.mpMerchant.findFirst({
      where: { id: body.id, marketId },
    });
    if (!merchant) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商户不存在');
    }
    const hasShop = await this.prisma.mpShop.findFirst({
      where: { merchantId: merchant.id },
      select: { id: true },
    });
    if (body.action === 'APPROVE') {
      if (merchant.auditStatus === 'APPROVED') {
        throw new BusinessException(ErrorCode.CONFLICT, '该商户已通过审核');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.mpMerchant.update({
          where: { id: merchant.id },
          data: {
            auditStatus: 'APPROVED',
            auditAt: new Date(),
            auditBy: auditor,
            auditNote: body.note,
            status: 'ACTIVE',
            ...(body.commissionRate === undefined
              ? {}
              : { commissionRate: body.commissionRate }),
          },
        });
        await tx.mpMerchantUser.updateMany({
          where: { merchantId: merchant.id },
          data: { status: 'ACTIVE' },
        });
        if (!hasShop) {
          const shopCode = await uniqueShopCode(this.prisma, 'shop');
          await tx.mpShop.create({
            data: {
              marketId,
              merchantId: merchant.id,
              name: merchant.name,
              categoryIds: jsonIds(merchant.categoryIds),
              shopCode,
              status: 'DRAFT',
              payEnabled: false,
            },
          });
        }
      });
    } else if (body.action === 'REJECT') {
      if (!body.note) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '驳回必须填写原因，让商户知道下一步怎么改',
        );
      }
      if (merchant.auditStatus === 'APPROVED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '已通过的商户请使用封禁，而不是驳回',
        );
      }
      await this.prisma.mpMerchant.update({
        where: { id: merchant.id },
        data: {
          auditStatus: 'REJECTED',
          auditAt: new Date(),
          auditBy: auditor,
          auditNote: body.note,
        },
      });
    } else if (body.action === 'BAN') {
      if (!body.note) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '封禁必须填写原因');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.mpMerchant.update({
          where: { id: merchant.id },
          data: {
            auditStatus: 'BANNED',
            auditAt: new Date(),
            auditBy: auditor,
            auditNote: body.note,
            status: 'CLOSED',
          },
        });
        await tx.mpMerchantUser.updateMany({
          where: { merchantId: merchant.id },
          data: { status: 'DISABLED' },
        });
        await tx.mpShop.updateMany({
          where: { merchantId: merchant.id, status: { not: 'SUSPENDED' } },
          data: { status: 'SUSPENDED' },
        });
      });
    } else {
      if (merchant.auditStatus !== 'BANNED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有被封禁的商户才能解封',
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.mpMerchant.update({
          where: { id: merchant.id },
          data: {
            auditStatus: 'APPROVED',
            auditAt: new Date(),
            auditBy: auditor,
            auditNote: body.note,
            status: 'ACTIVE',
          },
        });
        await tx.mpMerchantUser.updateMany({
          where: { merchantId: merchant.id },
          data: { status: 'ACTIVE' },
        });
        await tx.mpShop.updateMany({
          where: { merchantId: merchant.id, status: 'SUSPENDED' },
          data: { status: 'DRAFT' },
        });
      });
    }
    const updated = await this.prisma.mpMerchant.findUniqueOrThrow({
      where: { id: merchant.id },
    });
    const [categories, shopCount] = await Promise.all([
      this.categoryMap(marketId),
      this.prisma.mpShop.count({ where: { merchantId: merchant.id } }),
    ]);
    return this.merchantView(updated, categories, shopCount);
  }

  async setStatus(
    marketId: number,
    body: MpMerchantStatusBody,
  ): Promise<MpMerchant> {
    const merchant = await this.prisma.mpMerchant.findFirst({
      where: { id: body.id, marketId },
    });
    if (!merchant) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商户不存在');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mpMerchant.update({
        where: { id: merchant.id },
        data: { status: body.status },
      });
      const active = body.status === 'ACTIVE';
      await tx.mpMerchantUser.updateMany({
        where: { merchantId: merchant.id },
        data: { status: active ? 'ACTIVE' : 'DISABLED' },
      });
      if (!active) {
        await tx.mpShop.updateMany({
          where: { merchantId: merchant.id },
          data: { status: 'CLOSED' },
        });
      }
    });
    const updated = await this.prisma.mpMerchant.findUniqueOrThrow({
      where: { id: merchant.id },
    });
    const [categories, shopCount] = await Promise.all([
      this.categoryMap(marketId),
      this.prisma.mpShop.count({ where: { merchantId: merchant.id } }),
    ]);
    return this.merchantView(updated, categories, shopCount);
  }

  // ------------------------------------------------------------ 视图辅助

  private async categoryMap(
    marketId: number,
  ): Promise<Map<number, MpCategory>> {
    const rows = await this.prisma.mpCategory.findMany({
      where: { marketId },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          marketId: row.marketId,
          parentId: row.parentId,
          name: row.name,
          icon: row.icon,
          sortOrder: row.sortOrder,
          status: row.status as MpCategory['status'],
          merchantTotal: 0,
          createdAt: iso(row.createdAt),
        },
      ]),
    );
  }

  private async categoryNames(marketId: number): Promise<Map<number, string>> {
    const rows = await this.prisma.mpCategory.findMany({
      where: { marketId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async requireCategories(marketId: number, ids: number[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.mpCategory.findMany({
      where: { marketId, id: { in: ids }, status: 'ONLINE' },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '经营类目包含不存在或已停用的类目，请刷新后重选',
      );
    }
    return rows;
  }

  private async shopCounts(
    marketId: number,
    merchantIds: number[],
  ): Promise<Map<number, number>> {
    if (merchantIds.length === 0) return new Map();
    const grouped = await this.prisma.mpShop.groupBy({
      by: ['merchantId'],
      where: { marketId, merchantId: { in: merchantIds } },
      _count: { _all: true },
    });
    return new Map(
      grouped.map((row) => [row.merchantId, row._count._all] as const),
    );
  }

  private merchantView(
    row: MerchantRow,
    categories: Map<number, MpCategory>,
    shopCount: number,
  ): MpMerchant {
    const categoryIds = jsonIds(row.categoryIds);
    return {
      id: row.id,
      marketId: row.marketId,
      name: row.name,
      licenseNo: row.licenseNo,
      licenseImage: row.licenseImage,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      categoryIds,
      categoryNames: categoryIds
        .map((id) => categories.get(id)?.name ?? '')
        .filter(Boolean),
      auditStatus: row.auditStatus as MpMerchant['auditStatus'],
      auditNote: row.auditNote,
      auditAt: iso(row.auditAt),
      auditBy: row.auditBy,
      status: row.status as MpMerchant['status'],
      commissionRate: decimalOf(row.commissionRate),
      expireAt: iso(row.expireAt),
      shopCount,
      createdAt: iso(row.createdAt),
    };
  }

  private userView(row: MerchantUserRow): MpMerchantUser {
    return {
      id: row.id,
      username: row.username,
      role: row.role === 'OWNER' ? 'OWNER' : 'STAFF',
      phone: row.phone,
      status: row.status as MpMerchantUser['status'],
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: iso(row.createdAt),
    };
  }

  private shopView(
    row: ShopRow,
    merchantName: string,
    categories: Map<number, string>,
  ): MpShop {
    const categoryIds = jsonIds(row.categoryIds);
    return {
      id: row.id,
      marketId: row.marketId,
      merchantId: row.merchantId,
      merchantName,
      name: row.name,
      logo: row.logo,
      intro: row.intro,
      categoryIds,
      categoryNames: categoryIds
        .map((id) => categories.get(id) ?? '')
        .filter(Boolean),
      shopCode: row.shopCode,
      mchId: row.mchId,
      payEnabled: row.payEnabled,
      status: row.status as MpShop['status'],
      sortOrder: row.sortOrder,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  // ------------------------------------------------------------ 店铺台账（运营方）

  async shopList(
    marketId: number,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: string;
    },
  ): Promise<PageResponse<MpShop>> {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.status ? { status: String(query.status) } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { shopCode: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpShop.count({ where }),
      this.prisma.mpShop.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [categories, merchants] = await Promise.all([
      this.categoryNames(marketId),
      this.prisma.mpMerchant.findMany({
        where: { marketId, id: { in: rows.map((row) => row.merchantId) } },
        select: { id: true, name: true },
      }),
    ]);
    const names = new Map(merchants.map((row) => [row.id, row.name] as const));
    return {
      list: rows.map((row) =>
        this.shopView(row, names.get(row.merchantId) ?? '', categories),
      ),
      total,
      page,
      pageSize,
    };
  }

  async setShopStatus(
    marketId: number,
    body: MpShopStatusBody,
  ): Promise<MpShop> {
    const shop = await this.prisma.mpShop.findFirst({
      where: { id: body.id, marketId },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
    if (body.status === 'CLOSED') {
      const merchant = await this.prisma.mpMerchant.findUnique({
        where: { id: shop.merchantId },
        select: { auditStatus: true },
      });
      if (merchant?.auditStatus === 'APPROVED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '正常商户的店铺请走「商户停业」或商户自助关店，不能由运营方单独关闭',
        );
      }
    }
    const updated = await this.prisma.mpShop.update({
      where: { id: shop.id },
      data: { status: body.status },
    });
    const [categories, merchant] = await Promise.all([
      this.categoryNames(marketId),
      this.prisma.mpMerchant.findUnique({
        where: { id: shop.merchantId },
        select: { name: true },
      }),
    ]);
    return this.shopView(updated, merchant?.name ?? '', categories);
  }
}
