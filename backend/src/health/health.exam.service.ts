import { safeText } from '../common/safe-text';
import {
  type HealthExamItemRow,
  type HealthExamItemSaveBody,
  type HealthExamPackageRow,
  type HealthExamPackageSaveBody,
  type HealthReportAdviceSaveBody,
  type HealthReportDetail,
  type HealthReportRow,
  type HealthReportSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  makeNo,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';

const CROWD_KINDS = new Set([
  'ALL',
  'ELDERLY',
  'HYPERTENSION',
  'DIABETES',
  'MATERNAL',
  'CHILD',
  'POST_OPERATION',
  'CHRONIC_OTHER',
]);

const dateOf = (text: string): Date | null => {
  const value = safeText(text).trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T09:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** 数值从文本里抽（体检指标常写成「5.6」「<0.01」）。 */
const valueFromText = (text: string): number => {
  const match = /-?\d+(?:\.\d+)?/.exec(safeText(text));
  return match ? Number(match[0]) : 0;
};

const sourceOf = (value: string): HealthReportRow['source'] => {
  if (value === 'ORGAN_IMPORT' || value === 'EXAM_ORDER') return value;
  if (value === 'ORGAN') return 'ORGAN_IMPORT';
  if (value === 'ORDER') return 'EXAM_ORDER';
  return 'CUSTOMER_UPLOAD';
};

/**
 * 体检项目、套餐与报告（C8）。
 *
 * 口径：
 * 1. 套餐 = 项目组合 + 加项标记（INCLUDE 内含 / ADDON 可加价），价格与划线价在套餐上，
 *    项目价只用于加项计价，不重复累加进套餐价。
 * 2. 报告指标值以文本为准（兼容「<0.01」「阴性」），数值列仅在能解析时回填，
 *    异常标记来自上传方/导入方的 flag，不由本域推断。
 * 3. 报告解读建议是独立记录，沟通仍走 AI客服；本域只留结论与 consultId。
 */
export class HealthExamService {
  constructor(private readonly prisma: PrismaService) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      keyword: clip(query.keyword, 60),
    };
  }

  private crowdOf(value: unknown): HealthExamItemRow['crowdKinds'] {
    return jsonArr<unknown>(value)
      .map((kind) => String(kind))
      .filter((kind): kind is HealthExamItemRow['crowdKinds'][number] =>
        CROWD_KINDS.has(kind),
      );
  }

  // ---------- 体检项目 ----------

  private itemRow(row: {
    id: number;
    name: string;
    category: string;
    unit: string;
    reference: string;
    priceCents: number;
    genderType: string;
    crowdKindsJson: unknown;
    desc: string;
    status: string;
  }): HealthExamItemRow {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      reference: row.reference,
      priceCents: row.priceCents,
      genderLimit: ['ALL', 'MALE', 'FEMALE'].includes(row.genderType)
        ? row.genderType
        : 'ALL',
      crowdKinds: this.crowdOf(row.crowdKindsJson),
      desc: row.desc,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    };
  }

  async examItems(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'exam');
    const category = clip(query.category, 40);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (category) where.category = category;
    if (keyword) where.name = { contains: keyword };
    const status = strOf(query.status, 8, 'all');
    if (status === 'ON' || status === 'OFF') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthExamItem.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthExamItem.count({ where }),
    ]);
    return {
      list: rows.map((row) => this.itemRow(row)),
      total,
      page,
      pageSize,
    };
  }

  async examItemSave(
    user: CurrentUser,
    body: HealthExamItemSaveBody,
  ): Promise<HealthExamItemRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthExamItem.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检项目不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      category: body.category,
      unit: body.unit,
      reference: body.reference,
      genderType: body.genderLimit,
      crowdKindsJson: body.crowdKinds,
      priceCents: body.priceCents,
      desc: body.desc,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthExamItem.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthExamItem.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.examItem.update' : 'health.examItem.create',
      `shop=${ctx.shop.id} item=${row.id}`,
    );
    return this.itemRow(row);
  }

  async examItemRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthExamItem.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检项目不存在');
    const used = await this.prisma.healthExamPackageItem.count({
      where: { shopId: ctx.shop.id, itemId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该项目已被套餐引用，请先从套餐里移除',
      );
    }
    await this.prisma.healthExamItem.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.examItem.remove',
      `shop=${ctx.shop.id} item=${row.id}`,
    );
    return { ok: true, message: '体检项目已删除' };
  }

  // ---------- 体检套餐 ----------

  private async packageRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      coverImage: string;
      cityId: number;
      organId: number;
      crowdKind: string;
      crowdKindsJson: unknown;
      genderType: string;
      marriedLimit: string;
      priceCents: number;
      originPriceCents: number;
      intro: string;
      notice: string;
      hot: boolean;
      desc: string;
      status: string;
    }[],
  ): Promise<HealthExamPackageRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const cityIds = [
      ...new Set(rows.map((row) => row.cityId).filter((id) => id > 0)),
    ];
    const organIds = [
      ...new Set(rows.map((row) => row.organId).filter((id) => id > 0)),
    ];
    const [links, cities, organs, counts] = await Promise.all([
      this.prisma.healthExamPackageItem.findMany({
        where: { shopId, packageId: { in: ids } },
        orderBy: { id: 'asc' },
      }),
      cityIds.length
        ? this.prisma.healthCity.findMany({
            where: { shopId, id: { in: cityIds } },
            select: { id: true, name: true },
          })
        : [],
      organIds.length
        ? this.prisma.healthOrgan.findMany({
            where: { shopId, id: { in: organIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthOrder.groupBy({
        by: ['bizRefId'],
        where: { shopId, bizRefType: 'EXAM_PKG', bizRefId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const itemIds = [...new Set(links.map((row) => row.itemId))];
    const items = itemIds.length
      ? await this.prisma.healthExamItem.findMany({
          where: { shopId, id: { in: itemIds } },
          select: { id: true, name: true, category: true, priceCents: true },
        })
      : [];
    const itemMap = new Map(items.map((row) => [row.id, row]));
    const linkByPackage = new Map<number, typeof links>();
    for (const link of links) {
      const list = linkByPackage.get(link.packageId) ?? [];
      list.push(link);
      linkByPackage.set(link.packageId, list);
    }
    const cityMap = new Map(cities.map((row) => [row.id, row.name]));
    const organMap = new Map(organs.map((row) => [row.id, row.name]));
    const countMap = new Map(
      counts.map((row) => [row.bizRefId, row._count._all]),
    );
    return rows.map((row) => {
      const crowdKinds = this.crowdOf(row.crowdKindsJson);
      return {
        id: row.id,
        name: row.name,
        cover: row.coverImage,
        cityId: row.cityId,
        cityName: cityMap.get(row.cityId) ?? '',
        organId: row.organId,
        organName: organMap.get(row.organId) ?? '',
        crowdKinds: crowdKinds.length
          ? crowdKinds
          : ((CROWD_KINDS.has(row.crowdKind)
              ? [row.crowdKind]
              : []) as HealthExamPackageRow['crowdKinds']),
        genderLimit: ['ALL', 'MALE', 'FEMALE'].includes(row.genderType)
          ? row.genderType
          : 'ALL',
        marriedLimit: row.marriedLimit,
        priceCents: row.priceCents,
        originPriceCents: row.originPriceCents,
        itemCount: (linkByPackage.get(row.id) ?? []).length,
        items: (linkByPackage.get(row.id) ?? []).map((link) => {
          const item = itemMap.get(link.itemId);
          return {
            itemId: link.itemId,
            name: item?.name ?? '',
            category: item?.category ?? '',
            priceCents: item?.priceCents ?? 0,
            mode: link.mode === 'ADDON' ? 'ADDON' : 'INCLUDE',
          };
        }),
        intro: row.intro || row.desc,
        notice: row.notice,
        hot: row.hot,
        status: row.status === 'ON' ? 'ON' : 'OFF',
        orderCount: countMap.get(row.id) ?? 0,
      };
    });
  }

  async examPackages(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'exam');
    const cityId = intIn(query.cityId, 0, 2_000_000_000, 0);
    const crowdKind = strOf(query.crowdKind, 24, 'all');
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (cityId > 0) where.cityId = cityId;
    if (keyword) where.name = { contains: keyword };
    const status = strOf(query.status, 8, 'all');
    if (status === 'ON' || status === 'OFF') where.status = status;
    const rows = await this.prisma.healthExamPackage.findMany({
      where,
      orderBy: [{ hot: 'desc' }, { sort: 'asc' }, { id: 'desc' }],
      take: 1000,
    });
    const filtered =
      crowdKind && crowdKind !== 'all'
        ? rows.filter((row) => {
            const kinds = this.crowdOf(row.crowdKindsJson);
            return (
              kinds.includes(crowdKind as never) ||
              (!kinds.length && row.crowdKind === crowdKind)
            );
          })
        : rows;
    const limited = filtered.slice(skip, skip + pageSize);
    return {
      list: await this.packageRows(ctx.shop.id, limited),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async examPackageDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthExamPackageRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'exam');
    const row = await this.prisma.healthExamPackage.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检套餐不存在');
    const [mapped] = await this.packageRows(ctx.shop.id, [row]);
    return mapped;
  }

  async examPackageSave(
    user: CurrentUser,
    body: HealthExamPackageSaveBody,
  ): Promise<HealthExamPackageRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    if (body.cityId > 0) {
      const city = await this.prisma.healthCity.findFirst({
        where: { id: body.cityId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!city)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '城市不存在');
    }
    if (body.organId > 0) {
      const organ = await this.prisma.healthOrgan.findFirst({
        where: { id: body.organId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!organ)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '体检机构不存在');
    }
    const itemIds = [...new Set(body.items.map((item) => item.itemId))];
    if (itemIds.length) {
      const found = await this.prisma.healthExamItem.count({
        where: { shopId: ctx.shop.id, id: { in: itemIds } },
      });
      if (found !== itemIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '部分体检项目不存在',
        );
      }
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthExamPackage.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检套餐不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      coverImage: body.cover,
      cityId: body.cityId,
      organId: body.organId,
      crowdKind: body.crowdKinds[0] ?? 'ALL',
      crowdKindsJson: body.crowdKinds,
      genderType: body.genderLimit,
      marriedLimit: body.marriedLimit,
      priceCents: body.priceCents,
      originPriceCents: body.originPriceCents,
      intro: body.intro,
      notice: body.notice,
      hot: body.hot,
      desc: clip(body.intro, 2000),
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthExamPackage.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthExamPackage.create({ data });
    await this.prisma.$transaction([
      this.prisma.healthExamPackageItem.deleteMany({
        where: { shopId: ctx.shop.id, packageId: row.id },
      }),
      ...(body.items.length
        ? [
            this.prisma.healthExamPackageItem.createMany({
              data: body.items.map((item) => ({
                shopId: ctx.shop.id,
                packageId: row.id,
                itemId: item.itemId,
                mode: item.mode,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.examPackage.update' : 'health.examPackage.create',
      `shop=${ctx.shop.id} package=${row.id} items=${body.items.length}`,
    );
    const [mapped] = await this.packageRows(ctx.shop.id, [row]);
    return mapped;
  }

  async examPackageRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthExamPackage.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检套餐不存在');
    const orders = await this.prisma.healthOrder.count({
      where: { shopId: ctx.shop.id, bizRefType: 'EXAM_PKG', bizRefId: row.id },
    });
    if (orders > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该套餐已产生订单，不能删除，请改为下架',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthExamPackageItem.deleteMany({
        where: { shopId: ctx.shop.id, packageId: row.id },
      }),
      this.prisma.healthExamPackage.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.examPackage.remove',
      `shop=${ctx.shop.id} package=${row.id}`,
    );
    return { ok: true, message: '体检套餐已删除' };
  }

  // ---------- 体检报告 ----------

  private async reportRows(
    shopId: number,
    rows: {
      id: number;
      patientId: number;
      title: string;
      type: string;
      source: string;
      hospitalName: string;
      reportAt: Date | null;
      conclusion: string;
      abnormalCount: number;
      filesJson: unknown;
      readStatus: string;
      createdAt: Date;
    }[],
  ): Promise<HealthReportRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const [patients, itemCounts, adviceCounts] = await Promise.all([
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthReportItem.groupBy({
        by: ['reportId'],
        where: { shopId, reportId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.healthReportAdvice.groupBy({
        by: ['reportId'],
        where: { shopId, reportId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const itemMap = new Map(
      itemCounts.map((row) => [row.reportId, row._count._all]),
    );
    const adviceMap = new Map(
      adviceCounts.map((row) => [row.reportId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      patientName: patientMap.get(row.patientId) ?? '',
      title: row.title,
      kind: row.type,
      source: sourceOf(row.source),
      hospitalName: row.hospitalName,
      reportAt: toIso(row.reportAt),
      conclusion: row.conclusion,
      itemCount: itemMap.get(row.id) ?? 0,
      abnormalCount: row.abnormalCount,
      files: jsonArr<{ name?: unknown; url?: unknown }>(row.filesJson)
        .map((item) => ({
          name: safeText(item.name),
          url: safeText(item.url),
        }))
        .filter((item) => item.url),
      readCount: row.readStatus === 'READ' ? 1 : 0,
      adviceCount: adviceMap.get(row.id) ?? 0,
      createdAt: toIso(row.createdAt),
    }));
  }

  async reports(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'exam');
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const kind = strOf(query.kind, 24, 'all');
    const abnormalOnly = intIn(query.abnormalOnly, 0, 1, 0) === 1;
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (kind && kind !== 'all') where.type = kind;
    if (abnormalOnly) where.abnormalCount = { gt: 0 };
    if (keyword) where.title = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthReport.findMany({
        where,
        orderBy: [{ reportAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthReport.count({ where }),
    ]);
    return {
      list: await this.reportRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  private async reportDetailOf(
    shopId: number,
    reportId: number,
  ): Promise<HealthReportDetail> {
    const row = await this.prisma.healthReport.findFirst({
      where: { id: reportId, shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检报告不存在');
    const [items, advices] = await Promise.all([
      this.prisma.healthReportItem.findMany({
        where: { shopId, reportId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthReportAdvice.findMany({
        where: { shopId, reportId },
        orderBy: { id: 'asc' },
      }),
    ]);
    const [report] = await this.reportRows(shopId, [row]);
    return {
      report,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        valueText: item.valueText,
        value: valueFromText(item.valueText),
        unit: item.unit,
        reference: item.refRange,
        abnormal: item.flag !== 'NORMAL',
        direction: item.flag === 'HIGH' ? '↑' : item.flag === 'LOW' ? '↓' : '',
      })),
      advices: advices.map((advice) => ({
        id: advice.id,
        content: advice.adviceText,
        doctorName: advice.doctorName,
        consultId: advice.consultId,
        createdAt: toIso(advice.createdAt),
      })),
    };
  }

  async reportDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthReportDetail> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'exam');
    return this.reportDetailOf(
      ctx.shop.id,
      intIn(query.id, 1, 2_000_000_000, 0),
    );
  }

  async reportSave(
    user: CurrentUser,
    body: HealthReportSaveBody,
  ): Promise<HealthReportRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: body.patientId, shopId: ctx.shop.id },
      select: { id: true, customerId: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '就诊人不存在');
    const existing =
      body.id > 0
        ? await this.prisma.healthReport.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检报告不存在');
    }
    const abnormalCount = body.items.filter((item) => item.abnormal).length;
    const data = {
      shopId: ctx.shop.id,
      patientId: patient.id,
      customerId: patient.customerId,
      type: body.kind || 'EXAM',
      title: body.title,
      hospitalName: body.hospitalName,
      reportAt: dateOf(body.reportAt),
      conclusion: body.conclusion,
      filesJson: body.files,
      abnormalCount,
      source: existing ? existing.source : 'ORGAN_IMPORT',
      metricsJson: body.items
        .filter((item) => item.abnormal)
        .map((item) => ({
          name: item.name,
          value: item.value,
          unit: item.unit,
          reference: item.reference,
          direction: item.direction,
        })),
    };
    const row = existing
      ? await this.prisma.healthReport.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthReport.create({
          data: { ...data, reportNo: makeNo('RP'), readStatus: 'UNREAD' },
        });
    await this.prisma.$transaction([
      this.prisma.healthReportItem.deleteMany({
        where: { shopId: ctx.shop.id, reportId: row.id },
      }),
      ...(body.items.length
        ? [
            this.prisma.healthReportItem.createMany({
              data: body.items.map((item, index) => ({
                shopId: ctx.shop.id,
                reportId: row.id,
                name: item.name,
                valueText:
                  item.valueText || (item.value ? String(item.value) : ''),
                unit: item.unit,
                refRange: item.reference,
                flag: item.abnormal
                  ? item.direction === '↑' || item.direction === 'HIGH'
                    ? 'HIGH'
                    : item.direction === '↓' || item.direction === 'LOW'
                      ? 'LOW'
                      : 'ABNORMAL'
                  : 'NORMAL',
                sort: index,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.report.update' : 'health.report.create',
      `shop=${ctx.shop.id} report=${row.id} items=${body.items.length} abnormal=${abnormalCount}`,
    );
    const [mapped] = await this.reportRows(ctx.shop.id, [row]);
    return mapped;
  }

  async reportRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthReport.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检报告不存在');
    await this.prisma.$transaction([
      this.prisma.healthReportItem.deleteMany({
        where: { shopId: ctx.shop.id, reportId: row.id },
      }),
      this.prisma.healthReportAdvice.deleteMany({
        where: { shopId: ctx.shop.id, reportId: row.id },
      }),
      this.prisma.healthReport.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.report.remove',
      `shop=${ctx.shop.id} report=${row.id}`,
    );
    return { ok: true, message: '体检报告已删除' };
  }

  async reportAdviceSave(
    user: CurrentUser,
    body: HealthReportAdviceSaveBody,
  ): Promise<HealthReportDetail> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'exam');
    await requireShopWritable(ctx);
    const report = await this.prisma.healthReport.findFirst({
      where: { id: body.reportId, shopId: ctx.shop.id },
      select: { id: true, patientId: true },
    });
    if (!report)
      throw new BusinessException(ErrorCode.NOT_FOUND, '体检报告不存在');
    let practitionerId = 0;
    let doctorName = user.username ?? '';
    if (body.consultId > 0) {
      const consult = await this.prisma.healthConsult.findFirst({
        where: { id: body.consultId, shopId: ctx.shop.id },
        select: { id: true, practitionerId: true, practitionerName: true },
      });
      if (!consult)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '关联问诊单不存在');
      practitionerId = consult.practitionerId;
      doctorName = consult.practitionerName || doctorName;
    }
    await this.prisma.healthReportAdvice.create({
      data: {
        shopId: ctx.shop.id,
        reportId: report.id,
        patientId: report.patientId,
        consultId: body.consultId,
        practitionerId,
        doctorName,
        adviceText: body.content,
      },
    });
    await this.prisma.healthReport.update({
      where: { id: report.id },
      data: { readStatus: 'READ' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.report.advice',
      `shop=${ctx.shop.id} report=${report.id} consult=${body.consultId}`,
    );
    return this.reportDetailOf(ctx.shop.id, report.id);
  }
}
