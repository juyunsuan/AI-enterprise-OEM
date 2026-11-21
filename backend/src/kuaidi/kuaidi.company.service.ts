import {
  type KuaidiCompany,
  type KuaidiCompanySaveBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { KuaidiSiteService } from './kuaidi.site.service';
import {
  amount,
  clip,
  intIn,
  iso,
  jsonInput,
  jsonList,
  numberIn,
  requireSiteId,
} from './kuaidi.shared';

type CompanyRow = {
  id: number;
  siteId: number;
  code: string;
  name: string;
  logo: string;
  firstWeightKg: unknown;
  firstPrice: unknown;
  extraWeightKg: unknown;
  extraPrice: unknown;
  remoteProvinces: unknown;
  remoteExtra: unknown;
  deliveryDays: string;
  remark: string;
  enabled: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 快递公司报价：站点内可多条（同一公司也可拆不同产品线）。
 * 这是全站唯一的价格来源——小程序端的报价与下单金额都只从这里算。
 */
export class KuaidiCompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: KuaidiSiteService,
  ) {}

  private toRow(row: CompanyRow): KuaidiCompany {
    return {
      id: row.id,
      siteId: row.siteId,
      code: row.code,
      name: row.name,
      logo: row.logo,
      firstWeightKg: numberIn(row.firstWeightKg, 0.1, 100, 1),
      firstPrice: amount(row.firstPrice),
      extraWeightKg: numberIn(row.extraWeightKg, 0.1, 100, 1),
      extraPrice: amount(row.extraPrice),
      remoteProvinces: jsonList<string>(row.remoteProvinces)
        .map((item) => clip(item, 20).trim())
        .filter(Boolean)
        .slice(0, 40),
      remoteExtra: amount(row.remoteExtra),
      deliveryDays: row.deliveryDays,
      remark: row.remark,
      enabled: row.enabled !== false,
      sort: row.sort,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async list(
    user: CurrentUser,
    siteId: string | number,
  ): Promise<KuaidiCompany[]> {
    const site = await this.sites.requireSite(user, siteId);
    const rows = await this.prisma.kuaidiCompany.findMany({
      where: { siteId: site.siteId },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return (rows as unknown as CompanyRow[]).map((row) => this.toRow(row));
  }

  async save(
    user: CurrentUser,
    body: KuaidiCompanySaveBody,
  ): Promise<KuaidiCompany> {
    const site = await this.sites.requireSite(user, requireSiteId(body.siteId));
    const data = {
      code: clip(body.code, 20).trim().toUpperCase(),
      name: clip(body.name, 60).trim(),
      logo: clip(body.logo, 500),
      firstWeightKg: numberIn(body.firstWeightKg, 0.1, 100, 1),
      firstPrice: amount(body.firstPrice),
      extraWeightKg: numberIn(body.extraWeightKg, 0.1, 100, 1),
      extraPrice: amount(body.extraPrice),
      remoteProvinces: jsonInput(normalizeProvinces(body.remoteProvinces)),
      remoteExtra: amount(body.remoteExtra),
      deliveryDays: clip(body.deliveryDays, 40).trim(),
      remark: clip(body.remark, 200).trim(),
      enabled: body.enabled !== false,
      sort: intIn(body.sort, -9999, 9999, 0),
    };
    if (body.id > 0) {
      const row = await this.prisma.kuaidiCompany.findFirst({
        where: { id: body.id, siteId: site.siteId },
        select: { id: true },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '快递公司报价不存在');
      const updated = await this.prisma.kuaidiCompany.update({
        where: { id: row.id },
        data,
      });
      return this.toRow(updated);
    }
    const created = await this.prisma.kuaidiCompany.create({
      data: { siteId: site.siteId, ...data },
    });
    return this.toRow(created);
  }

  async setStatus(
    user: CurrentUser,
    siteId: string | number,
    id: number,
    enabled: boolean,
  ): Promise<KuaidiCompany> {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.kuaidiCompany.findFirst({
      where: { id: Number(id), siteId: site.siteId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递公司报价不存在');
    const updated = await this.prisma.kuaidiCompany.update({
      where: { id: row.id },
      data: { enabled },
    });
    return this.toRow(updated);
  }

  async remove(user: CurrentUser, siteId: string | number, id: number) {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.kuaidiCompany.findFirst({
      where: { id: Number(id), siteId: site.siteId },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '快递公司报价不存在');
    const used = await this.prisma.kuaidiOrder.count({
      where: { siteId: site.siteId, companyId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `这家快递公司已有 ${used} 笔订单，不能删除；请改用「停用」，历史订单与价格快照不受影响`,
      );
    }
    await this.prisma.kuaidiCompany.delete({ where: { id: row.id } });
    return { ok: true, message: '报价已删除' };
  }

  /** 公开报价用：只取启用的公司，按 sort 大者靠前。 */
  async enabledRules(siteId: number) {
    const rows = await this.prisma.kuaidiCompany.findMany({
      where: { siteId, enabled: true },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      companyId: row.id,
      code: row.code,
      name: row.name,
      logo: row.logo,
      deliveryDays: row.deliveryDays,
      firstWeightKg: numberIn(row.firstWeightKg, 0.1, 100, 1),
      firstPrice: amount(row.firstPrice),
      extraWeightKg: numberIn(row.extraWeightKg, 0.1, 100, 1),
      extraPrice: amount(row.extraPrice),
      remoteProvinces: jsonList<string>(row.remoteProvinces)
        .map((item) => clip(item, 20).trim())
        .filter(Boolean),
      remoteExtra: amount(row.remoteExtra),
      remark: row.remark,
    }));
  }
}

function normalizeProvinces(value: unknown): string[] {
  const out: string[] = [];
  for (const item of jsonList<string>(value)) {
    const name = clip(item, 20).trim();
    if (!name || out.includes(name)) continue;
    out.push(name);
    if (out.length >= 40) break;
  }
  return out;
}
