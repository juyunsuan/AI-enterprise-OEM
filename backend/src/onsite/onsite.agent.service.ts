import type {
  OnsiteAgentRow,
  OnsiteAgentSave,
  OnsiteChannelCategoryRow,
  OnsiteChannelCategorySave,
  OnsiteChannelRow,
  OnsiteChannelSave,
  OnsiteDistributorReview,
  OnsiteDistributorRow,
  OnsitePartnerRow,
  OnsitePartnerSave,
  OnsiteRelationBind,
  OnsiteRelationRow,
  OnsiteSalesmanRow,
  OnsiteSalesmanSave,
  OnsiteStatusToggle,
} from '@enterprise/contracts';
import { ONSITE_AGENT_TYPES } from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, rateOf } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';

type Agg = { orderCount: number; commissionCents: number };

/**
 * 代理体系：省/市/区县代、业务员、渠道商（含分类）、技师合伙人、分销商审核、扫码绑定关系。
 *
 * 参考源码是「省代→市代→区县代→门店→业务员→渠道商→分销商→上级用户」八层，
 * 本方案 P2 只落「代理（三级，靠 parentId 串）+ 业务员 + 渠道 + 合伙人 + 分销商 + 上级顾客」，
 * 门店层随 P3 的到店形态一起做。绑定关系带有效期，过期视为无上级（见 commission.resolveActors）。
 */
export class OnsiteAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  // ---------- 代理 ----------

  async agents(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{ list: OnsiteAgentRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const status = text(query.status, 'ALL');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(text(query.keyword)
        ? {
            OR: [
              { name: { contains: text(query.keyword) } },
              { phone: { contains: text(query.keyword) } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.onsiteAgentAccount.findMany({
      where,
      orderBy: [{ agentType: 'asc' }, { id: 'desc' }],
      take: 500,
    });
    const parents = await this.prisma.onsiteAgentAccount.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: rows.map((row) => row.parentId).filter(Boolean) },
      },
      select: { id: true, name: true },
    });
    const parentName = new Map(parents.map((row) => [row.id, row.name]));
    const agg = await this.aggregate('AGENT', shop.shopId);
    return {
      list: rows.map((row) => ({
        id: row.id,
        agentType: (ONSITE_AGENT_TYPES as readonly string[]).includes(
          row.agentType,
        )
          ? (row.agentType as OnsiteAgentRow['agentType'])
          : 'CITY',
        name: row.name,
        phone: row.phone,
        provinceCode: row.provinceCode,
        cityCode: row.cityCode,
        areaCode: row.areaCode,
        commissionRate: Number(row.commissionRate),
        parentId: row.parentId,
        parentName: parentName.get(row.parentId) ?? '',
        status: row.status,
        orderCount: agg.get(row.id)?.orderCount ?? 0,
        commissionCents: agg.get(row.id)?.commissionCents ?? 0,
      })),
    };
  }

  async saveAgent(
    user: CurrentUser,
    shopId: string,
    input: OnsiteAgentSave,
  ): Promise<OnsiteAgentRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.parentId > 0) {
      const parent = await this.prisma.onsiteAgentAccount.findFirst({
        where: { shopId: shop.shopId, id: input.parentId },
      });
      if (!parent)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '上级代理不存在');
      if (input.id && input.parentId === input.id) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '上级代理不能选自己',
        );
      }
    }
    const data = {
      agentType: input.agentType,
      name: input.name,
      phone: input.phone,
      provinceCode: input.provinceCode,
      cityCode: input.cityCode,
      areaCode: input.areaCode,
      commissionRate: rateOf(input.commissionRate),
      parentId: input.parentId,
    };
    const row = input.id
      ? await this.assertAgent(shop.shopId, input.id).then((existing) =>
          this.prisma.onsiteAgentAccount.update({
            where: { id: existing.id },
            data,
          }),
        )
      : await this.prisma.onsiteAgentAccount.create({
          data: { shopId: shop.shopId, ...data },
        });
    const agg = await this.aggregate('AGENT', shop.shopId);
    const parent = row.parentId
      ? await this.prisma.onsiteAgentAccount.findFirst({
          where: { id: row.parentId },
        })
      : null;
    return {
      id: row.id,
      agentType: row.agentType as OnsiteAgentRow['agentType'],
      name: row.name,
      phone: row.phone,
      provinceCode: row.provinceCode,
      cityCode: row.cityCode,
      areaCode: row.areaCode,
      commissionRate: Number(row.commissionRate),
      parentId: row.parentId,
      parentName: parent?.name ?? '',
      status: row.status,
      orderCount: agg.get(row.id)?.orderCount ?? 0,
      commissionCents: agg.get(row.id)?.commissionCents ?? 0,
    };
  }

  async setAgentStatus(
    user: CurrentUser,
    shopId: string,
    agentId: string,
    input: OnsiteStatusToggle,
  ): Promise<OnsiteAgentRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const existing = await this.assertAgent(shop.shopId, agentId);
    await this.prisma.onsiteAgentAccount.update({
      where: { id: existing.id },
      data: { status: normalizeStatus(input.status, ['ACTIVE', 'DISABLED']) },
    });
    const rows = await this.agents(user, shopId, { status: 'ALL' });
    const row = rows.list.find((item) => item.id === existing.id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    return row;
  }

  // ---------- 业务员 ----------

  async salesmen(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{ list: OnsiteSalesmanRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const status = text(query.status, 'ALL');
    const rows = await this.prisma.onsiteSalesman.findMany({
      where: {
        shopId: shop.shopId,
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(text(query.keyword)
          ? {
              OR: [
                { name: { contains: text(query.keyword) } },
                { phone: { contains: text(query.keyword) } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
    const agents = await this.prisma.onsiteAgentAccount.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: rows.map((row) => row.agentId).filter(Boolean) },
      },
      select: { id: true, name: true },
    });
    const agentName = new Map(agents.map((row) => [row.id, row.name]));
    const agg = await this.aggregate('SALESMAN', shop.shopId);
    return {
      list: rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        agentName: agentName.get(row.agentId) ?? '',
        name: row.name,
        phone: row.phone,
        area: row.area,
        rate: Number(row.rate),
        status: row.status,
        commissionCents: agg.get(row.id)?.commissionCents ?? 0,
      })),
    };
  }

  async saveSalesman(
    user: CurrentUser,
    shopId: string,
    input: OnsiteSalesmanSave,
  ): Promise<OnsiteSalesmanRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.agentId > 0)
      await this.assertAgent(shop.shopId, String(input.agentId));
    const data = {
      agentId: input.agentId,
      name: input.name,
      phone: input.phone,
      area: input.area,
      rate: rateOf(input.rate),
    };
    if (input.id) {
      const existing = await this.assertSalesman(shop.shopId, String(input.id));
      await this.prisma.onsiteSalesman.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.onsiteSalesman.create({
        data: { shopId: shop.shopId, ...data },
      });
    }
    const rows = await this.salesmen(user, shopId, { status: 'ALL' });
    const row = rows.list.find(
      (item) => item.name === input.name && item.phone === input.phone,
    );
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '业务员保存后读取失败');
    return row;
  }

  async setSalesmanStatus(
    user: CurrentUser,
    shopId: string,
    salesmanId: string,
    input: OnsiteStatusToggle,
  ): Promise<OnsiteSalesmanRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const existing = await this.assertSalesman(shop.shopId, salesmanId);
    await this.prisma.onsiteSalesman.update({
      where: { id: existing.id },
      data: { status: normalizeStatus(input.status, ['ACTIVE', 'DISABLED']) },
    });
    const rows = await this.salesmen(user, shopId, { status: 'ALL' });
    const row = rows.list.find((item) => item.id === existing.id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '业务员不存在');
    return row;
  }

  // ---------- 渠道与渠道分类 ----------

  async channelCategories(
    user: CurrentUser,
    shopId: string,
  ): Promise<{ list: OnsiteChannelCategoryRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteChannelCategory.findMany({
      where: { shopId: shop.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
      })),
    };
  }

  async saveChannelCategory(
    user: CurrentUser,
    shopId: string,
    input: OnsiteChannelCategorySave,
  ): Promise<OnsiteChannelCategoryRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.id) {
      const owned = await this.prisma.onsiteChannelCategory.findFirst({
        where: { id: input.id, shopId: shop.shopId },
      });
      if (!owned)
        throw new BusinessException(ErrorCode.NOT_FOUND, '渠道分类不存在');
    }
    const row = input.id
      ? await this.prisma.onsiteChannelCategory.update({
          where: { id: input.id },
          data: { name: input.name, sortOrder: input.sortOrder },
        })
      : await this.prisma.onsiteChannelCategory.create({
          data: {
            shopId: shop.shopId,
            name: input.name,
            sortOrder: input.sortOrder,
          },
        });
    return { id: row.id, name: row.name, sortOrder: row.sortOrder };
  }

  async removeChannelCategory(
    user: CurrentUser,
    shopId: string,
    categoryId: string,
  ): Promise<{ id: number }> {
    const shop = await this.shops.requireShop(user, shopId);
    const existing = await this.prisma.onsiteChannelCategory.findFirst({
      where: { id: Number(categoryId) || 0, shopId: shop.shopId },
    });
    if (!existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道分类不存在');
    const used = await this.prisma.onsiteChannel.count({
      where: { shopId: shop.shopId, categoryId: existing.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该分类下还有 ${used} 个渠道商，请先调整归属`,
      );
    }
    await this.prisma.onsiteChannelCategory.delete({
      where: { id: existing.id },
    });
    return { id: existing.id };
  }

  async channels(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{ list: OnsiteChannelRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const status = text(query.status, 'ALL');
    const rows = await this.prisma.onsiteChannel.findMany({
      where: {
        shopId: shop.shopId,
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(text(query.keyword)
          ? {
              OR: [
                { name: { contains: text(query.keyword) } },
                { contact: { contains: text(query.keyword) } },
                { phone: { contains: text(query.keyword) } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
    const categories = await this.prisma.onsiteChannelCategory.findMany({
      where: { shopId: shop.shopId },
      select: { id: true, name: true },
    });
    const categoryName = new Map(categories.map((row) => [row.id, row.name]));
    const agg = await this.aggregate('CHANNEL', shop.shopId);
    return {
      list: rows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        categoryName: categoryName.get(row.categoryId) ?? '',
        name: row.name,
        contact: row.contact,
        phone: row.phone,
        rate: Number(row.rate),
        status: row.status,
        orderCount: agg.get(row.id)?.orderCount ?? 0,
        commissionCents: agg.get(row.id)?.commissionCents ?? 0,
      })),
    };
  }

  async saveChannel(
    user: CurrentUser,
    shopId: string,
    input: OnsiteChannelSave,
  ): Promise<OnsiteChannelRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const data = {
      categoryId: input.categoryId,
      name: input.name,
      contact: input.contact,
      phone: input.phone,
      rate: rateOf(input.rate),
    };
    let id = input.id ?? 0;
    if (id) {
      const existing = await this.prisma.onsiteChannel.findFirst({
        where: { id, shopId: shop.shopId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '渠道商不存在');
      await this.prisma.onsiteChannel.update({ where: { id }, data });
    } else {
      const created = await this.prisma.onsiteChannel.create({
        data: { shopId: shop.shopId, ...data },
      });
      id = created.id;
    }
    const rows = await this.channels(user, shopId, { status: 'ALL' });
    const row = rows.list.find((item) => item.id === id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '渠道商不存在');
    return row;
  }

  async setChannelStatus(
    user: CurrentUser,
    shopId: string,
    channelId: string,
    input: OnsiteStatusToggle,
  ): Promise<OnsiteChannelRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const existing = await this.prisma.onsiteChannel.findFirst({
      where: { id: Number(channelId) || 0, shopId: shop.shopId },
    });
    if (!existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道商不存在');
    await this.prisma.onsiteChannel.update({
      where: { id: existing.id },
      data: { status: normalizeStatus(input.status, ['ACTIVE', 'DISABLED']) },
    });
    const rows = await this.channels(user, shopId, { status: 'ALL' });
    const row = rows.list.find((item) => item.id === existing.id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '渠道商不存在');
    return row;
  }

  // ---------- 合伙人 ----------

  async partners(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{ list: OnsitePartnerRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const status = text(query.status, 'ALL');
    const rows = await this.prisma.onsitePartner.findMany({
      where: {
        shopId: shop.shopId,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
    const staff = await this.prisma.onsiteStaff.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: rows.map((row) => row.staffId) },
      },
      select: { id: true, name: true },
    });
    const staffName = new Map(staff.map((row) => [row.id, row.name]));
    const agg = await this.aggregate('PARTNER', shop.shopId);
    return {
      list: rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        staffName: staffName.get(row.staffId) ?? '',
        name: row.name,
        rate: Number(row.rate),
        status: row.status,
        commissionCents: agg.get(row.staffId)?.commissionCents ?? 0,
      })),
    };
  }

  async savePartner(
    user: CurrentUser,
    shopId: string,
    input: OnsitePartnerSave,
  ): Promise<OnsitePartnerRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: input.staffId, shopId: shop.shopId },
    });
    if (!staff)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '技师不存在，请先添加技师',
      );
    const row = await this.prisma.onsitePartner.upsert({
      where: {
        shopId_staffId: { shopId: shop.shopId, staffId: input.staffId },
      },
      update: { name: input.name || staff.name, rate: rateOf(input.rate) },
      create: {
        shopId: shop.shopId,
        staffId: input.staffId,
        name: input.name || staff.name,
        rate: rateOf(input.rate),
      },
    });
    const agg = await this.aggregate('PARTNER', shop.shopId);
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: staff.name,
      name: row.name,
      rate: Number(row.rate),
      status: row.status,
      commissionCents: agg.get(row.staffId)?.commissionCents ?? 0,
    };
  }

  // ---------- 分销商 ----------

  async distributors(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteDistributorRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const status = text(query.status, 'ALL');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(text(query.keyword)
        ? {
            OR: [
              { realName: { contains: text(query.keyword) } },
              { phone: { contains: text(query.keyword) } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteDistributorProfile.count({ where }),
      this.prisma.onsiteDistributorProfile.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: rows.map((row) => row.customerId) },
      },
      select: { id: true, nickname: true, phone: true },
    });
    const customerName = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    const agg = await this.aggregate('DISTRIBUTOR', shop.shopId);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        customerName: customerName.get(row.customerId) ?? '',
        realName: row.realName,
        phone: row.phone,
        levelName: row.levelName,
        rate: Number(row.rate),
        status: row.status,
        pid: row.pid,
        rejectReason: row.rejectReason,
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : '',
        orderCount: agg.get(row.customerId)?.orderCount ?? 0,
        commissionCents: agg.get(row.customerId)?.commissionCents ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async reviewDistributor(
    user: CurrentUser,
    shopId: string,
    input: OnsiteDistributorReview,
  ): Promise<OnsiteDistributorRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const profile = await this.prisma.onsiteDistributorProfile.findFirst({
      where: { id: input.profileId, shopId: shop.shopId },
    });
    if (!profile)
      throw new BusinessException(ErrorCode.NOT_FOUND, '分销申请不存在');
    if (profile.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该申请已处理，刷新后查看最新状态',
      );
    }
    if (!input.approve && !input.rejectReason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '驳回必须写明原因（申请人可见）',
      );
    }
    await this.prisma.onsiteDistributorProfile.update({
      where: { id: profile.id },
      data: {
        status: input.approve ? 'APPROVED' : 'REJECTED',
        levelName: input.levelName || profile.levelName,
        rate: input.approve
          ? rateOf(input.rate || Number(profile.rate))
          : profile.rate,
        rejectReason: input.approve ? '' : input.rejectReason,
        reviewedAt: new Date(),
      },
    });
    const rows = await this.distributors(user, shopId, {
      page: 1,
      pageSize: 200,
      status: 'ALL',
    });
    const row = rows.list.find((item) => item.id === profile.id);
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '分销申请不存在');
    return row;
  }

  // ---------- 绑定关系 ----------

  async relations(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteRelationRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const where = { shopId: shop.shopId };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteRelation.count({ where }),
      this.prisma.onsiteRelation.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [customers, channels, salesmen, agents] = await Promise.all([
      this.prisma.onsiteCustomer.findMany({
        where: {
          shopId: shop.shopId,
          id: {
            in: [
              ...new Set(
                rows
                  .flatMap((row) => [row.customerId, row.pid])
                  .filter(Boolean),
              ),
            ],
          },
        },
        select: { id: true, nickname: true, phone: true },
      }),
      this.prisma.onsiteChannel.findMany({
        where: {
          shopId: shop.shopId,
          id: { in: rows.map((row) => row.channelId).filter(Boolean) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.onsiteSalesman.findMany({
        where: {
          shopId: shop.shopId,
          id: { in: rows.map((row) => row.salesmanId).filter(Boolean) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.onsiteAgentAccount.findMany({
        where: {
          shopId: shop.shopId,
          id: { in: rows.map((row) => row.agentId).filter(Boolean) },
        },
        select: { id: true, name: true },
      }),
    ]);
    const customerName = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    const channelName = new Map(channels.map((row) => [row.id, row.name]));
    const salesmanName = new Map(salesmen.map((row) => [row.id, row.name]));
    const agentName = new Map(agents.map((row) => [row.id, row.name]));
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        customerName: customerName.get(row.customerId) ?? '',
        pid: row.pid,
        channelId: row.channelId,
        channelName: channelName.get(row.channelId) ?? '',
        salesmanId: row.salesmanId,
        salesmanName: salesmanName.get(row.salesmanId) ?? '',
        agentId: row.agentId,
        agentName: agentName.get(row.agentId) ?? '',
        source: row.source,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async bindRelation(
    user: CurrentUser,
    shopId: string,
    input: OnsiteRelationBind,
  ): Promise<OnsiteRelationRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const customer = await this.prisma.onsiteCustomer.findFirst({
      where: { id: input.customerId, shopId: shop.shopId },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '顾客不存在');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '有效期格式不对（例：2026-12-31T23:59:59）',
      );
    }
    const row = await this.prisma.onsiteRelation.create({
      data: {
        shopId: shop.shopId,
        customerId: input.customerId,
        pid: input.pid,
        channelId: input.channelId,
        salesmanId: input.salesmanId,
        agentId: input.agentId,
        source: 'MANUAL',
        expiresAt,
      },
    });
    return {
      id: row.id,
      customerId: row.customerId,
      customerName: customer.nickname || customer.phone || '顾客',
      pid: row.pid,
      channelId: row.channelId,
      channelName: '',
      salesmanId: row.salesmanId,
      salesmanName: '',
      agentId: row.agentId,
      agentName: '',
      source: row.source,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---------- 内部 ----------

  private async aggregate(role: string, shopId: number) {
    const rows = await this.prisma.onsiteOrderCommissionItem.groupBy({
      by: ['sourceId'],
      where: { shopId, sourceRole: role, status: 'ACTIVE' },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });
    const map = new Map<number, Agg>();
    for (const row of rows) {
      map.set(row.sourceId, {
        orderCount: row._count._all,
        commissionCents: centsOf(row._sum.totalAmount),
      });
    }
    return map;
  }

  private async assertAgent(shopId: number, agentId: string | number) {
    const row = await this.prisma.onsiteAgentAccount.findFirst({
      where: { id: Number(agentId) || 0, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    return row;
  }

  private async assertSalesman(shopId: number, salesmanId: string | number) {
    const row = await this.prisma.onsiteSalesman.findFirst({
      where: { id: Number(salesmanId) || 0, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '业务员不存在');
    return row;
  }
}

const normalizeStatus = (value: string, allowed: string[]) => {
  const status = text(value).toUpperCase();
  if (!allowed.includes(status)) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `状态只能是 ${allowed.join(' / ')}`,
    );
  }
  return status;
};
