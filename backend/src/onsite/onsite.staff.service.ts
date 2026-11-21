import type { Prisma } from '../../generated/prisma';
import {
  type OnsiteRestInput,
  type OnsiteRestRow,
  type OnsiteStaffInput,
  type OnsiteStaffLevelInput,
  type OnsiteStaffLevelRow,
  type OnsiteStaffRow,
  type OnsiteStaffStatus,
  type OnsiteWorkLogRow,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { MiniAppCrypto } from '../private-mini/mini-app-crypto';
import type { PrismaService } from '../prisma/prisma.service';
import {
  centsOf,
  decimalOf,
  maskIdCard,
  minutesOfClock,
  stringArray,
} from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';

const STAFF_STATUSES = [
  'PENDING',
  'ONLINE',
  'OFF_DUTY',
  'SUSPENDED',
  'LEFT',
] as const;

/** 资料修改待审副本里允许出现的键：越界的键直接丢弃，避免端上塞进价格/状态等敏感列。 */
const PENDING_KEYS = [
  'name',
  'avatar',
  'intro',
  'images',
  'phone',
  'serviceStartAt',
  'serviceEndAt',
  'crossDay',
  'serviceCity',
  'address',
] as const;

const LABELS: Record<string, string> = {
  name: '姓名',
  avatar: '头像',
  intro: '简介',
  images: '相册',
  phone: '手机号',
  serviceStartAt: '可服务开始',
  serviceEndAt: '可服务结束',
  crossDay: '跨零点夜班',
  serviceCity: '服务城市',
  address: '常驻地址',
};

const statusOf = (value: string): OnsiteStaffStatus => {
  for (const status of STAFF_STATUSES) {
    if (status === value) return status;
  }
  return 'PENDING';
};

type StaffRowLike = {
  id: number;
  staffNo: string;
  name: string;
  gender: number;
  phone: string;
  avatar: string;
  idCardCipher: string;
  licenseImages: unknown;
  workYears: number;
  intro: string;
  images: unknown;
  video: string;
  levelId: number;
  cityId: number;
  serviceCity: string;
  lng: unknown;
  lat: unknown;
  address: string;
  serviceStartAt: string;
  serviceEndAt: string;
  crossDay: boolean;
  dailyOrderLimit: number;
  selfPriceEnabled: boolean;
  carFeeEnabled: boolean;
  carFee: unknown;
  rating: unknown;
  reviewCount: number;
  orderCountVirtual: number;
  orderCountTrue: number;
  recommendTop: boolean;
  sortTop: number;
  locationEnabled: boolean;
  lastLocationAt: Date | null;
  status: string;
  authStatus: string;
  reviewRemark: string;
  profilePending: unknown;
  source: string;
  createdAt: Date;
};

/**
 * 服务人员档案、等级、休息段与工时。
 *
 * 参考源码把「技师自助改资料」写成整行拷贝到 coach_update 副本表，审核后再覆盖回主表；
 * 本实现只把**允许自助改的白名单字段**存进 `profile_pending`（含旧值快照），
 * 审核通过逐字段合并——避免副本表结构漂移后覆盖掉店主设置的分成、状态等字段。
 */
export class OnsiteStaffService {
  private readonly crypto = new MiniAppCrypto();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  private scope(shopId: number, staffId: number) {
    return `ONSITE:${shopId}:staff:${staffId}:idCard`;
  }

  // ---------- 档案 ----------

  private async toRow(
    shopId: number,
    row: StaffRowLike,
  ): Promise<OnsiteStaffRow> {
    const level = row.levelId
      ? await this.prisma.onsiteStaffLevel.findUnique({
          where: { id: row.levelId },
        })
      : null;
    const city = row.cityId
      ? await this.prisma.onsiteCity.findUnique({ where: { id: row.cityId } })
      : null;
    const serviceCount = await this.prisma.onsiteServiceStaffPrice.count({
      where: { shopId, staffId: row.id },
    });
    const pending = this.pendingOf(row.profilePending);
    const idCard = this.crypto.decrypt(
      this.scope(shopId, row.id),
      row.idCardCipher,
    );
    return {
      id: row.id,
      staffNo: row.staffNo,
      name: row.name,
      gender: row.gender,
      phone: row.phone,
      avatar: row.avatar,
      idCardConfigured: Boolean(row.idCardCipher),
      idCardMasked: maskIdCard(idCard),
      licenseImages: stringArray(row.licenseImages),
      workYears: row.workYears,
      intro: row.intro,
      images: stringArray(row.images),
      video: row.video,
      levelId: row.levelId,
      levelName: level?.name ?? '',
      cityId: row.cityId,
      cityName: city?.name ?? '',
      serviceCity: row.serviceCity,
      lng: Number(row.lng ?? 0),
      lat: Number(row.lat ?? 0),
      address: row.address,
      serviceStartAt: row.serviceStartAt,
      serviceEndAt: row.serviceEndAt,
      crossDay: row.crossDay,
      dailyOrderLimit: row.dailyOrderLimit,
      selfPriceEnabled: row.selfPriceEnabled,
      carFeeEnabled: row.carFeeEnabled,
      carFeeCents: centsOf(row.carFee),
      rating: Number(row.rating ?? 5),
      reviewCount: row.reviewCount,
      orderCountVirtual: row.orderCountVirtual,
      orderCountTrue: row.orderCountTrue,
      recommendTop: row.recommendTop,
      sortTop: row.sortTop,
      locationEnabled: row.locationEnabled,
      lastLocationAt: row.lastLocationAt
        ? row.lastLocationAt.toISOString()
        : '',
      status: statusOf(row.status),
      authStatus: row.authStatus,
      reviewRemark: row.reviewRemark,
      hasPendingProfile: Object.keys(pending.values).length > 0,
      pendingDiff: Object.entries(pending.values).map(([key, value]) => ({
        label: LABELS[key] ?? key,
        // 变更项给新值；旧值不落界面，避免手机号/身份证等历史值外泄
        value: typeof value === 'string' ? value : String(value),
      })),
      source: row.source,
      serviceCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private pendingOf(raw: unknown): { values: Record<string, unknown> } {
    let parsed = raw;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { values: {} };
    }
    const source = parsed as { values?: unknown };
    const values =
      source.values &&
      typeof source.values === 'object' &&
      !Array.isArray(source.values)
        ? (source.values as Record<string, unknown>)
        : {};
    const kept: Record<string, unknown> = {};
    for (const key of PENDING_KEYS) {
      if (values[key] !== undefined) kept[key] = values[key];
    }
    return { values: kept };
  }

  async staff(
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
    const status = text(query.status, 'all');
    const keyword = text(query.keyword).trim().slice(0, 40);
    const levelId = Number(query.levelId) || 0;
    const cityId = Number(query.cityId) || 0;
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(levelId ? { levelId } : {}),
      ...(cityId ? { cityId } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { phone: { contains: keyword } },
              { staffNo: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteStaff.count({ where }),
      this.prisma.onsiteStaff.findMany({
        where,
        // 推荐位与手工排序优先，其次按评分与真实单量（参考源码 recommend + index_top 口径）
        orderBy: [
          { recommendTop: 'desc' },
          { sortTop: 'desc' },
          { rating: 'desc' },
          { id: 'asc' },
        ],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const list: OnsiteStaffRow[] = [];
    for (const row of rows) list.push(await this.toRow(shop.shopId, row));
    return pageOf(list, total, page, pageSize);
  }

  async staffDetail(user: CurrentUser, shopId: string, staffId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteStaff.findFirst({
      where: { id: Number(staffId), shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    return this.toRow(shop.shopId, row);
  }

  async saveStaff(
    user: CurrentUser,
    shopId: string,
    body: OnsiteStaffInput,
  ): Promise<OnsiteStaffRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const phone = body.phone.trim().slice(0, 32);
    const dup = await this.prisma.onsiteStaff.findFirst({
      where: {
        shopId: shop.shopId,
        phone,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `手机号 ${phone} 已属于本店铺的「${dup.name}」，请确认后更换号码`,
      );
    }
    const startMinutes = minutesOfClock(body.serviceStartAt);
    const endMinutes = minutesOfClock(body.serviceEndAt);
    if (!body.crossDay && endMinutes <= startMinutes) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '可服务时段结束必须晚于开始；夜班跨零点请打开「允许跨零点」开关',
      );
    }
    if (body.levelId) {
      const level = await this.prisma.onsiteStaffLevel.findFirst({
        where: { id: body.levelId, shopId: shop.shopId },
      });
      if (!level) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选等级不存在，请重新选择',
        );
      }
    }
    const data = {
      name: body.name.trim().slice(0, 60),
      gender: body.gender,
      phone,
      avatar: body.avatar.trim().slice(0, 500),
      licenseImages: body.licenseImages.slice(0, 9),
      workYears: body.workYears,
      intro: body.intro.slice(0, 2000),
      images: body.images.slice(0, 12),
      video: body.video.trim().slice(0, 500),
      levelId: body.levelId,
      cityId: body.cityId,
      serviceCity: body.serviceCity.trim().slice(0, 60),
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      address: body.address.trim().slice(0, 200),
      serviceStartAt: body.serviceStartAt,
      serviceEndAt: body.serviceEndAt,
      crossDay: body.crossDay,
      dailyOrderLimit: body.dailyOrderLimit,
      selfPriceEnabled: body.selfPriceEnabled,
      carFeeEnabled: body.carFeeEnabled,
      carFee: decimalOf(body.carFeeCents),
      recommendTop: body.recommendTop,
      sortTop: body.sortTop,
      locationEnabled: body.locationEnabled,
      orderCountVirtual: body.orderCountVirtual,
      status: body.status,
    };
    if (body.id) {
      const current = await this.prisma.onsiteStaff.findFirst({
        where: { id: body.id, shopId: shop.shopId },
      });
      if (!current)
        throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
      const row = await this.prisma.onsiteStaff.update({
        where: { id: current.id },
        data: {
          ...data,
          ...(String(body.idCard || '').trim()
            ? {
                idCardCipher: this.crypto.encrypt(
                  this.scope(shop.shopId, current.id),
                  String(body.idCard).trim().toUpperCase(),
                ),
                authStatus: 'VERIFIED',
              }
            : {}),
        },
      });
      await this.audit(user.userId, 'onsite.staff.update', row.name);
      return this.toRow(shop.shopId, row);
    }
    const created = await this.prisma.onsiteStaff.create({
      data: {
        shopId: shop.shopId,
        staffNo: await this.nextStaffNo(shop.shopId),
        ...data,
        idCardCipher: String(body.idCard || '').trim()
          ? this.crypto.encrypt(
              this.scope(shop.shopId, 0),
              String(body.idCard).trim().toUpperCase(),
            )
          : '',
        authStatus: String(body.idCard || '').trim()
          ? 'VERIFIED'
          : 'UNVERIFIED',
      },
    });
    // 新建后 id 才存在，身份证密文按含 id 的 scope 重写一次，确保跨技师不可解
    if (String(body.idCard || '').trim()) {
      await this.prisma.onsiteStaff.update({
        where: { id: created.id },
        data: {
          idCardCipher: this.crypto.encrypt(
            this.scope(shop.shopId, created.id),
            String(body.idCard).trim().toUpperCase(),
          ),
        },
      });
    }
    await this.audit(user.userId, 'onsite.staff.create', created.name);
    return this.toRow(shop.shopId, created);
  }

  private async nextStaffNo(shopId: number) {
    const count = await this.prisma.onsiteStaff.count({ where: { shopId } });
    return `T${String(count + 1).padStart(4, '0')}`;
  }

  async setStaffStatus(
    user: CurrentUser,
    shopId: string,
    id: number,
    status: string,
    remark: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const target = statusOf(status);
    const row = await this.prisma.onsiteStaff.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const updated = await this.prisma.onsiteStaff.update({
      where: { id: row.id },
      data: {
        status: target,
        reviewRemark: remark.slice(0, 200),
        reviewedAt: new Date(),
      },
    });
    await this.audit(
      user.userId,
      'onsite.staff.status',
      `${row.name} → ${target}`,
    );
    return this.toRow(shop.shopId, updated);
  }

  /**
   * 移除服务人员 = 置为「已离场」，不物理删行。
   * 历史订单要能显示当时的服务人员姓名与电话，物理删除会把台账变成孤儿；
   * 有进行中的订单时直接拒绝，先交接完再离场。
   */
  async removeStaff(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteStaff.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const active = await this.prisma.onsiteOrder.count({
      where: {
        shopId: shop.shopId,
        staffId: row.id,
        status: {
          in: [
            'PENDING_PAYMENT',
            'PAID',
            'ACCEPTED',
            'EN_ROUTE',
            'ON_SITE',
            'SERVING',
            'REFUND_PENDING',
          ],
        },
      },
    });
    if (active > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」还有 ${active} 笔进行中的订单，请先在「订单」里改派给其它服务人员或退款，再让他离场`,
      );
    }
    await this.prisma.onsiteStaff.update({
      where: { id: row.id },
      data: { status: 'LEFT', locationEnabled: false, reviewedAt: new Date() },
    });
    await this.audit(user.userId, 'onsite.staff.remove', row.name);
    return { removed: true };
  }

  /** 技师自助报名（C 端提交）后由店主审核：通过即在岗，驳回留原因。 */
  async applyFromSubmission(
    shopId: number,
    input: { name: string; phone: string; city?: string; intro?: string },
  ) {
    const exists = await this.prisma.onsiteStaff.findFirst({
      where: { shopId, phone: input.phone.trim() },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该手机号已是本店服务人员「${exists.name}」，请直接联系店主更新资料`,
      );
    }
    return this.prisma.onsiteStaff.create({
      data: {
        shopId,
        staffNo: await this.nextStaffNo(shopId),
        name: input.name.trim().slice(0, 60),
        phone: input.phone.trim().slice(0, 32),
        serviceCity: (input.city || '').slice(0, 60),
        intro: (input.intro || '').slice(0, 2000),
        status: 'PENDING',
        source: 'APPLY',
      },
    });
  }

  /** 审核资料变更：通过则把白名单字段合并回主行，驳回只清副本。 */
  async reviewProfile(
    user: CurrentUser,
    shopId: string,
    id: number,
    approved: boolean,
    remark: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteStaff.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const pending = this.pendingOf(row.profilePending);
    if (!Object.keys(pending.values).length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该服务人员没有待审核的资料变更',
      );
    }
    const values = pending.values;
    const merged: Record<string, unknown> = {
      profilePending: {},
      reviewRemark: remark.slice(0, 200),
      reviewedAt: new Date(),
    };
    if (approved) {
      for (const key of PENDING_KEYS) {
        if (values[key] !== undefined) merged[key] = values[key];
      }
    }
    const updated = await this.prisma.onsiteStaff.update({
      where: { id: row.id },
      data: merged,
    });
    await this.audit(
      user.userId,
      'onsite.staff.review-profile',
      `${row.name} ${approved ? '通过' : '驳回'}`,
    );
    return this.toRow(shop.shopId, updated);
  }

  // ---------- 等级 ----------

  async staffLevels(user: CurrentUser, shopId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const [rows, staffRows] = await Promise.all([
      this.prisma.onsiteStaffLevel.findMany({
        where: { shopId: shop.shopId },
        orderBy: [{ rank: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.onsiteStaff.findMany({
        where: { shopId: shop.shopId },
        select: { levelId: true },
      }),
    ]);
    const counts = new Map<number, number>();
    for (const staff of staffRows) {
      if (!staff.levelId) continue;
      counts.set(staff.levelId, (counts.get(staff.levelId) || 0) + 1);
    }
    const list: OnsiteStaffLevelRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      rank: row.rank,
      commissionRate: Number(row.commissionRate),
      addonRate: Number(row.addonRate),
      minPerformanceCents: centsOf(row.minPerformance),
      onlineHoursRequired: row.onlineHoursRequired,
      points: row.points,
      agreementArticleId: row.agreementArticleId,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      staffCount: counts.get(row.id) || 0,
    }));
    return { list };
  }

  async saveStaffLevel(
    user: CurrentUser,
    shopId: string,
    body: OnsiteStaffLevelInput,
  ): Promise<OnsiteStaffLevelRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const data = {
      name: body.name.trim().slice(0, 40),
      rank: body.rank,
      commissionRate: Number(body.commissionRate) || 0,
      addonRate: Number(body.addonRate) || 0,
      minPerformance: decimalOf(body.minPerformanceCents),
      onlineHoursRequired: body.onlineHoursRequired,
      points: body.points,
      agreementArticleId: body.agreementArticleId,
      sortOrder: body.sortOrder,
      enabled: body.enabled !== false,
    };
    const dup = await this.prisma.onsiteStaffLevel.findFirst({
      where: {
        shopId: shop.shopId,
        name: data.name,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `等级「${data.name}」已存在`,
      );
    }
    const row = body.id
      ? await this.prisma.onsiteStaffLevel.update({
          where: { id: body.id },
          data,
        })
      : await this.prisma.onsiteStaffLevel.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      name: row.name,
      rank: row.rank,
      commissionRate: Number(row.commissionRate),
      addonRate: Number(row.addonRate),
      minPerformanceCents: centsOf(row.minPerformance),
      onlineHoursRequired: row.onlineHoursRequired,
      points: row.points,
      agreementArticleId: row.agreementArticleId,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      staffCount: 0,
    };
  }

  async removeStaffLevel(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteStaffLevel.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '等级不存在');
    const used = await this.prisma.onsiteStaff.count({
      where: { shopId: shop.shopId, levelId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.name}」下还有 ${used} 名服务人员，请先给他们换等级`,
      );
    }
    await this.prisma.onsiteStaffLevel.delete({ where: { id: row.id } });
    return { removed: true };
  }

  // ---------- 休息段与工时 ----------

  async restList(
    user: CurrentUser,
    shopId: string,
    staffId: string,
    day: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const where = {
      shopId: shop.shopId,
      staffId: Number(staffId),
      ...(day ? { startAt: { gte: new Date(`${day}T00:00:00`) } } : {}),
    };
    const rows = await this.prisma.onsiteStaffRestPeriod.findMany({
      where,
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    const list: OnsiteRestRow[] = rows.map((row) => ({
      id: row.id,
      staffId: row.staffId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      allDay: row.allDay,
      reason: row.reason,
      createdByRole: row.createdByRole,
    }));
    return { list };
  }

  async saveRest(
    user: CurrentUser,
    shopId: string,
    staffId: string,
    body: OnsiteRestInput,
  ): Promise<OnsiteRestRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: Number(staffId), shopId: shop.shopId },
    });
    if (!staff)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '休息时段请选择具体的开始与结束时间',
      );
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '休息结束时间必须晚于开始时间',
      );
    }
    const row = await this.prisma.onsiteStaffRestPeriod.upsert({
      where: { id: body.id || 0 },
      create: {
        shopId: shop.shopId,
        staffId: staff.id,
        startAt,
        endAt,
        allDay: body.allDay,
        reason: body.reason.trim().slice(0, 200),
        createdByRole: 'OWNER',
        createdBy: user.userId,
      },
      update: {
        startAt,
        endAt,
        allDay: body.allDay,
        reason: body.reason.trim().slice(0, 200),
      },
    });
    return {
      id: row.id,
      staffId: row.staffId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      allDay: row.allDay,
      reason: row.reason,
      createdByRole: row.createdByRole,
    };
  }

  async removeRest(
    user: CurrentUser,
    shopId: string,
    staffId: string,
    id: number,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteStaffRestPeriod.findFirst({
      where: { id, staffId: Number(staffId), shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '休息时段不存在');
    await this.prisma.onsiteStaffRestPeriod.delete({ where: { id: row.id } });
    return { removed: true };
  }

  async workLogs(
    user: CurrentUser,
    shopId: string,
    staffId: string,
    days: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const limit = Math.min(90, Math.max(1, Number(days) || 14));
    const rows = await this.prisma.onsiteStaffWorkLog.findMany({
      where: { shopId: shop.shopId, staffId: Number(staffId) },
      orderBy: { day: 'desc' },
      take: limit * 4,
    });
    const merged = new Map<string, OnsiteWorkLogRow>();
    for (const row of rows) {
      const bucket = merged.get(row.day) ?? {
        day: row.day,
        serviceMinutes: 0,
        travelMinutes: 0,
        orderCount: 0,
      };
      if (row.type === 'TRAVEL') bucket.travelMinutes += row.minutes;
      else {
        bucket.serviceMinutes += row.minutes;
        if (row.orderId) bucket.orderCount += 1;
      }
      merged.set(row.day, bucket);
    }
    return { list: Array.from(merged.values()).slice(0, limit) };
  }

  /** 完成订单时写工时（P1-2 的履约链路调用），服务时长扣除退款部分。 */
  async recordWork(input: {
    shopId: number;
    staffId: number;
    orderId: number;
    day: string;
    serviceMinutes: number;
    travelMinutes: number;
  }) {
    const rows = [
      {
        shopId: input.shopId,
        staffId: input.staffId,
        orderId: input.orderId,
        day: input.day,
        minutes: Math.max(0, Math.round(input.serviceMinutes)),
        trueMinutes: Math.max(0, Math.round(input.serviceMinutes)),
        type: 'SERVICE',
      },
    ];
    if (input.travelMinutes > 0) {
      rows.push({
        shopId: input.shopId,
        staffId: input.staffId,
        orderId: input.orderId,
        day: input.day,
        minutes: Math.round(input.travelMinutes),
        trueMinutes: Math.round(input.travelMinutes),
        type: 'TRAVEL',
      });
    }
    await this.prisma.onsiteStaffWorkLog
      .createMany({ data: rows })
      .catch(() => undefined);
  }

  /**
   * C 端技师列表：不给手机号与常驻地址（成单后由订单详情按需提供），
   * 销量按参考源码口径展示「虚拟 + 真实」。
   */
  async publicList(
    shopId: number,
    query: {
      page: number;
      pageSize: number;
      serviceId: number;
      keyword: string;
    },
  ) {
    let restrictIds: number[] | null = null;
    if (query.serviceId > 0) {
      const links = await this.prisma.onsiteServiceStaffPrice.findMany({
        where: { shopId, serviceId: query.serviceId },
        select: { staffId: true },
      });
      restrictIds = links.map((link) => link.staffId);
    }
    const where = {
      shopId,
      status: 'ONLINE',
      ...(query.keyword
        ? { name: { contains: query.keyword.slice(0, 40) } }
        : {}),
      // 服务限定了可做技师却一个都没指定时，列表必须为空，而不是把全员端出去
      ...(restrictIds
        ? { id: { in: restrictIds.length ? restrictIds : [-1] } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteStaff.count({ where }),
      this.prisma.onsiteStaff.findMany({
        where,
        orderBy: [
          { recommendTop: 'desc' },
          { sortTop: 'desc' },
          { rating: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const levels = await this.prisma.onsiteStaffLevel.findMany({
      where: {
        id: {
          in: Array.from(
            new Set(rows.map((row) => row.levelId).filter(Boolean)),
          ),
        },
      },
      select: { id: true, name: true },
    });
    const levelName = new Map(levels.map((level) => [level.id, level.name]));
    const list = rows.map((row) =>
      this.publicRow(row, levelName.get(row.levelId) ?? ''),
    );
    return { list, total, page: query.page, pageSize: query.pageSize };
  }

  /** C 端单个技师详情：字段口径与列表一致，只放行在岗人员。 */
  async publicDetail(shopId: number, staffId: number) {
    if (!staffId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少服务人员编号');
    const row = await this.prisma.onsiteStaff.findFirst({
      where: { id: staffId, shopId, status: 'ONLINE' },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '这位服务人员当前不在岗或已下线',
      );
    const level = row.levelId
      ? await this.prisma.onsiteStaffLevel.findUnique({
          where: { id: row.levelId },
          select: { name: true },
        })
      : null;
    return this.publicRow(row, level?.name ?? '');
  }

  private publicRow(
    row: Prisma.OnsiteStaffGetPayload<Record<string, never>>,
    levelName: string,
  ) {
    return {
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      gender: row.gender,
      workYears: row.workYears,
      intro: row.intro,
      images: stringArray(row.images),
      levelName,
      serviceCity: row.serviceCity,
      rating: Number(row.rating ?? 5),
      reviewCount: row.reviewCount,
      orderCount: row.orderCountVirtual + row.orderCountTrue,
      recommend: row.recommendTop,
      serviceStartAt: row.serviceStartAt,
      serviceEndAt: row.serviceEndAt,
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
