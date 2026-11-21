import type { MpCategory, MpCategorySaveBody } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { iso, jsonIds } from './mp.shared';

/**
 * 平台统一类目：商户只能选不能造（CRMEB 的「平台分类」口径）。
 * 两级树，停用（OFFLINE）后不可再被新入驻/新商品选中，存量引用保持可读。
 */
export class MpCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async merchantCounts(marketId: number): Promise<Map<number, number>> {
    const rows = await this.prisma.mpMerchant.findMany({
      where: { marketId },
      select: { categoryIds: true },
    });
    const counts = new Map<number, number>();
    for (const row of rows) {
      for (const id of jsonIds(row.categoryIds)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }

  async list(marketId: number): Promise<MpCategory[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.mpCategory.findMany({
        where: { marketId },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.merchantCounts(marketId),
    ]);
    return rows.map((row) => ({
      id: row.id,
      marketId: row.marketId,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sortOrder,
      status: row.status as MpCategory['status'],
      merchantTotal: counts.get(row.id) ?? 0,
      createdAt: iso(row.createdAt),
    }));
  }

  async save(marketId: number, body: MpCategorySaveBody): Promise<MpCategory> {
    if (body.parentId > 0) {
      const parent = await this.prisma.mpCategory.findFirst({
        where: { id: body.parentId, marketId },
      });
      if (!parent) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '上级类目不存在');
      }
      if (parent.parentId !== 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '类目最多两级，请选择一级类目作为上级',
        );
      }
    }
    if (body.id > 0) {
      const current = await this.prisma.mpCategory.findFirst({
        where: { id: body.id, marketId },
      });
      if (!current) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '类目不存在');
      }
      const child = await this.prisma.mpCategory.findFirst({
        where: { marketId, parentId: body.id },
        select: { id: true },
      });
      if (child && body.parentId !== 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该类目下已有子类目，不能改为二级类目',
        );
      }
      const updated = await this.prisma.mpCategory.update({
        where: { id: current.id },
        data: {
          parentId: body.parentId,
          name: body.name,
          icon: body.icon,
          sortOrder: body.sortOrder,
          status: body.status,
        },
      });
      return this.view(updated, marketId);
    }
    const created = await this.prisma.mpCategory.create({
      data: {
        marketId,
        parentId: body.parentId,
        name: body.name,
        icon: body.icon,
        sortOrder: body.sortOrder,
        status: body.status,
      },
    });
    return this.view(created, marketId);
  }

  private async view(
    row: {
      id: number;
      marketId: number;
      parentId: number;
      name: string;
      icon: string;
      sortOrder: number;
      status: string;
      createdAt: Date;
    },
    marketId: number,
  ): Promise<MpCategory> {
    const counts = await this.merchantCounts(marketId);
    return {
      id: row.id,
      marketId: row.marketId,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sortOrder,
      status: row.status as MpCategory['status'],
      merchantTotal: counts.get(row.id) ?? 0,
      createdAt: iso(row.createdAt),
    };
  }

  async remove(
    marketId: number,
    id: number,
  ): Promise<{ ok: boolean; message: string }> {
    const category = await this.prisma.mpCategory.findFirst({
      where: { id, marketId },
    });
    if (!category) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '类目不存在');
    }
    const child = await this.prisma.mpCategory.findFirst({
      where: { marketId, parentId: id },
      select: { id: true },
    });
    if (child) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '请先删除该类目下的子类目',
      );
    }
    const [merchants, shops] = await Promise.all([
      this.prisma.mpMerchant.findMany({
        where: { marketId },
        select: { categoryIds: true },
      }),
      this.prisma.mpShop.findMany({
        where: { marketId },
        select: { categoryIds: true },
      }),
    ]);
    const referenced =
      merchants.some((row) => jsonIds(row.categoryIds).includes(id)) ||
      shops.some((row) => jsonIds(row.categoryIds).includes(id));
    if (referenced) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该类目仍被商户或店铺的经营范围引用，请先调整后再删除',
      );
    }
    await this.prisma.mpCategory.delete({ where: { id } });
    return { ok: true, message: '类目已删除' };
  }
}
