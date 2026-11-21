import {
  type ErrandCoupon,
  type ErrandCouponSaveBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { ErrandSiteService } from './errand.site.service';
import { type ErrandServiceType } from '@enterprise/contracts';
import { amount, clip, iso, jsonList } from './errand.shared';

type CouponRow = {
  id: number;
  name: string;
  type: string;
  discountValue: unknown;
  minAmount: unknown;
  total: number;
  claimed: number;
  used: number;
  startAt: Date | null;
  endAt: Date | null;
  enabled: boolean;
  cityId: number;
  serviceTypes: unknown;
  firstOrderOnly: boolean;
  autoIssue: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function parseDate(value: string): Date | null {
  const text = clip(value, 40).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 优惠券管理：满减/折扣、领取上限与有效期；领取与核销在顾客/订单服务里。 */
export class ErrandCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
  ) {}

  private toCoupon(row: CouponRow): ErrandCoupon {
    return {
      id: row.id,
      name: row.name,
      type: row.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
      discountValue: Number(row.discountValue) || 0,
      minAmount: amount(row.minAmount),
      total: row.total,
      claimed: row.claimed,
      used: row.used,
      startAt: row.startAt ? iso(row.startAt) : '',
      endAt: row.endAt ? iso(row.endAt) : '',
      enabled: row.enabled,
      cityId: row.cityId,
      serviceTypes: jsonList<ErrandServiceType>(row.serviceTypes),
      firstOrderOnly: row.firstOrderOnly,
      autoIssue: row.autoIssue,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async list(user: CurrentUser): Promise<ErrandCoupon[]> {
    const ctx = await this.sites.require(user);
    const rows = await this.prisma.errandCoupon.findMany({
      where: { siteId: ctx.row.id },
      orderBy: [{ id: 'desc' }],
      take: 200,
    });
    return (rows as unknown as CouponRow[]).map((row) => this.toCoupon(row));
  }

  async save(
    user: CurrentUser,
    body: ErrandCouponSaveBody,
  ): Promise<ErrandCoupon> {
    const ctx = await this.sites.require(user);
    const name = clip(body.name, 60).trim();
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写优惠券名称');
    if (
      body.type === 'PERCENT' &&
      (body.discountValue <= 0 || body.discountValue > 100)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '折扣券的折扣值应在 1–100 之间（按百分比抵扣）',
      );
    }
    const cityId = Math.max(0, body.cityId || 0);
    if (cityId > 0) {
      const city = await this.prisma.errandCity.findFirst({
        where: { id: cityId, siteId: ctx.row.id },
        select: { id: true },
      });
      if (!city) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选城市不存在或不属于当前站点',
        );
      }
    }
    const startAt = parseDate(body.startAt);
    const endAt = parseDate(body.endAt);
    if (startAt && endAt && startAt >= endAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '结束时间必须晚于开始时间',
      );
    }
    const data = {
      name,
      type: body.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
      discountValue: Math.max(0, body.discountValue),
      minAmount: Math.max(0, body.minAmount),
      total: Math.max(0, Math.floor(body.total)),
      startAt,
      endAt,
      enabled: body.enabled !== false,
      cityId,
      serviceTypes: body.serviceTypes ?? [],
      firstOrderOnly: body.firstOrderOnly === true,
      autoIssue: body.autoIssue === true,
    };
    let row: CouponRow;
    if (body.id > 0) {
      const current = await this.prisma.errandCoupon.findFirst({
        where: { id: body.id, siteId: ctx.row.id },
      });
      if (!current)
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
      row = await this.prisma.errandCoupon.update({
        where: { id: current.id },
        data,
      });
    } else {
      row = await this.prisma.errandCoupon.create({
        data: { ...data, siteId: ctx.row.id, ownerUserId: user.userId },
      });
    }
    return this.toCoupon(row);
  }

  async setStatus(
    user: CurrentUser,
    id: number,
    enabled: boolean,
  ): Promise<ErrandCoupon> {
    const ctx = await this.sites.require(user);
    const current = await this.prisma.errandCoupon.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!current)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    const row = (await this.prisma.errandCoupon.update({
      where: { id: current.id },
      data: { enabled },
    })) as unknown as CouponRow;
    return this.toCoupon(row);
  }

  async remove(user: CurrentUser, id: number) {
    const ctx = await this.sites.require(user);
    const current = await this.prisma.errandCoupon.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!current)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    if (current.claimed > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `已有 ${current.claimed} 位顾客领过这张券，不能删除；请改为「停用」，已领取的券仍可使用到过期`,
      );
    }
    await this.prisma.errandCoupon.delete({ where: { id: current.id } });
    return { ok: true, message: '优惠券已删除' };
  }
}
