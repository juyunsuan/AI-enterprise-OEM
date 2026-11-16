import type { OverseasNavItemNode } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';

type CategoryInput = {
  id?: number;
  name: string;
  parentId?: number | null;
  sortOrder?: number;
  visible?: boolean;
};

type ItemInput = {
  id?: number;
  categoryId: number;
  title: string;
  description?: string;
  url: string;
  logoUrl?: string;
  sortOrder?: number;
  visible?: boolean;
};

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

const normalizeHttpUrl = (raw: string) => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '网址格式不正确');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '只支持 http(s) 网址');
  }
  return parsed.toString().slice(0, 500);
};

/**
 * 出海导航：两级分类 + 站点卡片。
 * 用户端只读取可见数据；管理端读写全部数据，删除分类会连带删除其子分类和站点。
 */
export class OverseasNavService {
  constructor(private readonly prisma: PrismaService) {}

  private toItem(row: {
    id: number;
    categoryId: number;
    title: string;
    description: string;
    url: string;
    logoUrl: string;
    sortOrder: number;
    visible: boolean;
  }): OverseasNavItemNode {
    return {
      id: row.id,
      categoryId: row.categoryId,
      title: row.title,
      description: row.description,
      url: row.url,
      logoUrl: row.logoUrl,
      sortOrder: row.sortOrder,
      visible: row.visible,
    };
  }

  async tree(includeHidden: boolean) {
    const [categories, items] = await Promise.all([
      this.prisma.overseasNavCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.overseasNavItem.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const visibleCategories = categories.filter(
      (row) => includeHidden || row.visible,
    );
    const visibleItems = items.filter((row) => includeHidden || row.visible);
    const counts = new Map<number, number>();
    for (const item of visibleItems) {
      counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1);
    }
    return {
      categories: visibleCategories.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        sortOrder: row.sortOrder,
        visible: row.visible,
        itemCount: counts.get(row.id) || 0,
      })),
      items: visibleItems.map((item) => this.toItem(item)),
    };
  }

  async saveCategory(input: CategoryInput) {
    const name = text(input.name, 100);
    if (!name) throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写分类名称');
    const parentId =
      input.parentId === null || input.parentId === undefined
        ? null
        : Number(input.parentId);

    if (parentId !== null) {
      const parent = await this.prisma.overseasNavCategory.findUnique({
        where: { id: parentId },
      });
      if (!parent) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '父分类不存在');
      }
      if (parent.parentId !== null) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '仅支持两级分类');
      }
    }

    if (input.id) {
      const current = await this.prisma.overseasNavCategory.findUnique({
        where: { id: input.id },
      });
      if (!current) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
      }
      if (parentId === current.id) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '分类不能以自己为父级');
      }
      if (parentId !== null) {
        const children = await this.prisma.overseasNavCategory.count({
          where: { parentId: current.id },
        });
        if (children > 0) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '该分类下还有子分类，不能改成二级分类',
          );
        }
      }
      const duplicate = await this.prisma.overseasNavCategory.findFirst({
        where: { parentId, name, id: { not: current.id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new BusinessException(ErrorCode.CONFLICT, '同一层级下已有同名分类');
      }
      await this.prisma.overseasNavCategory.update({
        where: { id: current.id },
        data: {
          name,
          parentId,
          sortOrder: input.sortOrder ?? current.sortOrder,
          visible: input.visible ?? current.visible,
        },
      });
      return { saved: true, id: current.id };
    }

    const duplicate = await this.prisma.overseasNavCategory.findFirst({
      where: { parentId, name },
      select: { id: true },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '同一层级下已有同名分类');
    }
    const max = await this.prisma.overseasNavCategory.aggregate({
      where: { parentId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.overseasNavCategory.create({
      data: {
        name,
        parentId,
        sortOrder: input.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
        visible: input.visible ?? true,
      },
    });
    return { saved: true, id: created.id };
  }

  async removeCategory(id: number) {
    const current = await this.prisma.overseasNavCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    }
    const children = await this.prisma.overseasNavCategory.findMany({
      where: { parentId: id },
      select: { id: true },
    });
    const ids = [id, ...children.map((row) => row.id)];
    const removedItems = await this.prisma.overseasNavItem.deleteMany({
      where: { categoryId: { in: ids } },
    });
    await this.prisma.overseasNavCategory.deleteMany({
      where: { parentId: id },
    });
    await this.prisma.overseasNavCategory.delete({ where: { id } });
    return { removed: true, removedItems: removedItems.count };
  }

  async saveItem(input: ItemInput) {
    const categoryId = Number(input.categoryId);
    const category = await this.prisma.overseasNavCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '分类不存在');
    }
    const title = text(input.title, 200);
    if (!title) throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写标题');
    const url = normalizeHttpUrl(text(input.url, 500));
    const description = text(input.description, 500);
    const logoUrl = text(input.logoUrl, 500);

    if (input.id) {
      const current = await this.prisma.overseasNavItem.findUnique({
        where: { id: input.id },
      });
      if (!current) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
      const duplicate = await this.prisma.overseasNavItem.findFirst({
        where: { categoryId, url, id: { not: current.id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new BusinessException(ErrorCode.CONFLICT, '该分类下已存在相同网址');
      }
      try {
        await this.prisma.overseasNavItem.update({
          where: { id: current.id },
          data: {
            categoryId,
            title,
            description,
            url,
            logoUrl,
            sortOrder: input.sortOrder ?? current.sortOrder,
            visible: input.visible ?? current.visible,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new BusinessException(ErrorCode.CONFLICT, '该分类下已存在相同网址');
        }
        throw error;
      }
      return { saved: true, id: current.id };
    }

    const duplicate = await this.prisma.overseasNavItem.findFirst({
      where: { categoryId, url },
      select: { id: true },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该分类下已存在相同网址');
    }
    const max = await this.prisma.overseasNavItem.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    try {
      const created = await this.prisma.overseasNavItem.create({
        data: {
          categoryId,
          title,
          description,
          url,
          logoUrl,
          sortOrder: input.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
          visible: input.visible ?? true,
        },
      });
      return { saved: true, id: created.id };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new BusinessException(ErrorCode.CONFLICT, '该分类下已存在相同网址');
      }
      throw error;
    }
  }

  async removeItem(id: number) {
    const removed = await this.prisma.overseasNavItem.deleteMany({
      where: { id },
    });
    if (!removed.count) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    }
    return { removed: true };
  }
}