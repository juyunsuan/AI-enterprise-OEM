import type {
  BrandShippingSaveBody,
  BrandShippingTemplate,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { toCents } from '../commerce-core/money';
import type { ShippingZone } from '../commerce-core/pricing';
import { jsonList } from '../commerce-core/types';

type AnyArgs = { ownerUserId: string; shopId: number };

type TemplateRow = {
  id: number;
  shopId: number;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RuleRow = {
  id: number;
  templateId: number;
  shopId: number;
  name: string;
  regions: unknown;
  firstPiece: number;
  firstFee: unknown;
  additionalPiece: number;
  additionalFee: unknown;
  freePiece: number;
  sortOrder: number;
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function regionsOf(value: unknown): string[] {
  return jsonList(value)
    .map((item) =>
      (typeof item === 'string' || typeof item === 'number' ? String(item) : '')
        .trim()
        .slice(0, 30),
    )
    .filter(Boolean)
    .slice(0, 400);
}

/**
 * 运费模板：店铺级配置，商品通过 freightTemplateId 指向模板，
 * 未指定或模板已删时回落店铺统一运费。规则行按收货市匹配，空地区是兜底行。
 */
export class BrandShippingService {
  constructor(private readonly prisma: PrismaService) {}

  private ruleView(row: RuleRow) {
    return {
      id: row.id,
      templateId: row.templateId,
      name: row.name,
      regions: regionsOf(row.regions),
      firstPiece: row.firstPiece,
      firstFee: Math.round(num(row.firstFee) * 100) / 100,
      additionalPiece: row.additionalPiece,
      additionalFee: Math.round(num(row.additionalFee) * 100) / 100,
      freePiece: row.freePiece,
      sortOrder: row.sortOrder,
    };
  }

  async list(args: AnyArgs): Promise<BrandShippingTemplate[]> {
    const [templates, rules] = await Promise.all([
      this.prisma.brandShippingTemplate.findMany({
        where: { shopId: args.shopId },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
      this.prisma.brandShippingTemplateRule.findMany({
        where: { shopId: args.shopId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
    ]);
    const byTemplate = new Map<number, RuleRow[]>();
    for (const row of rules) {
      const rows = byTemplate.get(row.templateId) ?? [];
      rows.push(row);
      byTemplate.set(row.templateId, rows);
    }
    return (templates as TemplateRow[]).map((template) => ({
      id: template.id,
      shopId: template.shopId,
      name: template.name,
      isDefault: template.isDefault,
      rules: (byTemplate.get(template.id) ?? []).map((row) =>
        this.ruleView(row),
      ),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  async save(
    args: AnyArgs,
    body: BrandShippingSaveBody,
  ): Promise<BrandShippingTemplate> {
    const name = String(body.name || '')
      .trim()
      .slice(0, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '模板名称不能为空');
    const rules = Array.isArray(body.rules) ? body.rules.slice(0, 20) : [];
    const templateId = Number(body.id || 0);
    if (templateId > 0) {
      const existing = await this.prisma.brandShippingTemplate.findFirst({
        where: { id: templateId, shopId: args.shopId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '运费模板不存在');
    }
    const makeDefault = body.isDefault === true;
    let savedId = templateId;
    await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.brandShippingTemplate.updateMany({
          where: { shopId: args.shopId, isDefault: true },
          data: { isDefault: false },
        });
      }
      if (templateId > 0) {
        await tx.brandShippingTemplate.update({
          where: { id: templateId },
          data: { name, isDefault: makeDefault },
        });
        await tx.brandShippingTemplateRule.deleteMany({
          where: { templateId, shopId: args.shopId },
        });
      } else {
        const created = await tx.brandShippingTemplate.create({
          data: { shopId: args.shopId, name, isDefault: makeDefault },
        });
        savedId = created.id;
      }
      if (rules.length > 0) {
        await tx.brandShippingTemplateRule.createMany({
          data: rules.map((rule, index) => ({
            templateId: savedId,
            shopId: args.shopId,
            name: String(rule.name || '')
              .trim()
              .slice(0, 60),
            regions: regionsOf(rule.regions),
            firstPiece: Math.max(1, Math.round(rule.firstPiece || 1)),
            firstFee: Math.max(0, num(rule.firstFee)),
            additionalPiece: Math.max(0, Math.round(rule.additionalPiece || 0)),
            additionalFee: Math.max(0, num(rule.additionalFee)),
            freePiece: Math.max(0, Math.round(rule.freePiece || 0)),
            sortOrder: Math.min(
              9999,
              Math.max(0, Math.round(rule.sortOrder ?? index)),
            ),
          })),
        });
      }
    });
    return this.detail(args, savedId);
  }

  async remove(args: AnyArgs, id: number): Promise<void> {
    const existing = await this.prisma.brandShippingTemplate.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '运费模板不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.brandShippingTemplateRule.deleteMany({
        where: { templateId: id, shopId: args.shopId },
      });
      await tx.brandShippingTemplate.delete({ where: { id } });
      // 模板删除后商品回落统一运费，不留悬空 id
      await tx.brandProduct.updateMany({
        where: { shopId: args.shopId, freightTemplateId: id },
        data: { freightTemplateId: 0 },
      });
    });
  }

  private async detail(
    args: AnyArgs,
    id: number,
  ): Promise<BrandShippingTemplate> {
    const template = await this.prisma.brandShippingTemplate.findFirst({
      where: { id, shopId: args.shopId },
    });
    if (!template)
      throw new BusinessException(ErrorCode.NOT_FOUND, '运费模板不存在');
    const rules = (await this.prisma.brandShippingTemplateRule.findMany({
      where: { templateId: id, shopId: args.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 500,
    })) as RuleRow[];
    return {
      id: template.id,
      shopId: template.shopId,
      name: template.name,
      isDefault: template.isDefault,
      rules: rules.map((row) => this.ruleView(row)),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  /** 商品保存时校验模板归属，防止把别家的模板 id 贴到本店商品上。 */
  async assertTemplate(shopId: number, templateId: number): Promise<void> {
    if (!templateId) return;
    const found = await this.prisma.brandShippingTemplate.findFirst({
      where: { id: templateId, shopId },
      select: { id: true },
    });
    if (!found)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所选运费模板不存在');
  }

  /**
   * 算价用的模板分组：0 键是店铺默认模板，商品未指定模板时回落到它。
   * 只查本次订单涉及到的模板 + 默认模板，模板多也不会整店扫一遍。
   */
  async zonesOf(
    shopId: number,
    templateIds: number[],
  ): Promise<Map<number, ShippingZone[]>> {
    const ids = [...new Set(templateIds.filter((id) => id > 0))].slice(0, 50);
    const templates = (await this.prisma.brandShippingTemplate.findMany({
      where: {
        shopId,
        OR: [{ isDefault: true }, ...(ids.length ? [{ id: { in: ids } }] : [])],
      },
      take: 51,
    })) as TemplateRow[];
    if (templates.length === 0) return new Map();
    const rules = (await this.prisma.brandShippingTemplateRule.findMany({
      where: { shopId, templateId: { in: templates.map((row) => row.id) } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 1000,
    })) as RuleRow[];
    const byTemplate = new Map<number, ShippingZone[]>();
    for (const row of rules) {
      const zones = byTemplate.get(row.templateId) ?? [];
      zones.push({
        id: row.id,
        templateId: row.templateId,
        name: row.name,
        regions: regionsOf(row.regions),
        firstPiece: row.firstPiece,
        firstFeeCents: toCents(row.firstFee),
        additionalPiece: row.additionalPiece,
        additionalFeeCents: toCents(row.additionalFee),
        freePiece: row.freePiece,
      });
      byTemplate.set(row.templateId, zones);
    }
    const result = new Map<number, ShippingZone[]>();
    for (const template of templates) {
      result.set(template.id, byTemplate.get(template.id) ?? []);
      if (template.isDefault) result.set(0, byTemplate.get(template.id) ?? []);
    }
    return result;
  }
}
