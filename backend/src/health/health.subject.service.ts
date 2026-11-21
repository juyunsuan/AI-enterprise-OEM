import {
  HEALTH_ORDER_BIZ_TYPES,
  type HealthApplicationRow,
  type HealthCityRow,
  type HealthCitySaveBody,
  type HealthDepartmentRow,
  type HealthDepartmentSaveBody,
  type HealthHospitalRow,
  type HealthHospitalSaveBody,
  type HealthOrganRow,
  type HealthOrganSaveBody,
  type HealthPractitionerRow,
  type HealthPractitionerServiceSaveBody,
  type HealthPractitionerSaveBody,
  type HealthTeamJoinRow,
  type HealthTeamMemberRow,
  type HealthTeamNoticeRow,
  type HealthTeamRow,
  type HealthTeamSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  audit,
  clip,
  emptyPage,
  intIn,
  jsonArr,
  jsonObj,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';

/** 列表通用查询解码：page/pageSize/keyword/status 以外由各方法自己取。 */
function pager(query: Record<string, unknown>) {
  const page = intIn(query.page, 1, 10_000, 1);
  const pageSize = intIn(query.pageSize, 1, 200, 20);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    keyword: clip(query.keyword, 60),
    status: strOf(query.status, 24, 'all'),
  };
}

/** status=all 表示不过滤；其它值只接受 ON/OFF，非法值按 all 处理（列表页不应因参数报错）。 */
function statusFilter(status: string): string | undefined {
  return status === 'ON' || status === 'OFF' ? status : undefined;
}

function nameMap(rows: { id: number; name: string }[]): Map<number, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}

const ratingOf = (sum: number, count: number) =>
  count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

/**
 * 主体角色域（C2）：医院/科室/城市字典、机构与医护入驻审核、医护可接服务、团队。
 *
 * 口径：
 * 1. 店内直录（店主/运营在后台填的）默认审核通过，审核字段只记录「谁录的」；
 *    自助入驻走 `health_applications` 的 PENDING，审核动作回写申请台账。
 * 2. 医护与机构的分成比例是**店内自营账**：0 表示跟随店铺默认分账规则，不在此处兜底。
 * 3. 删除一律用「同店 findFirst 再删」，跨店 id 表现为不存在，不泄露他店数据存在性。
 */
export class HealthSubjectService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 写映射 ----------

  private hospitalRow(
    row: {
      id: number;
      name: string;
      level: string;
      city: string;
      address: string;
      lng: unknown;
      lat: unknown;
      intro: string;
      partnered: boolean;
      status: string;
    },
    counts?: { departmentCount: number; practitionerCount: number },
  ): HealthHospitalRow {
    return {
      id: row.id,
      name: row.name,
      level: row.level as HealthHospitalRow['level'],
      city: row.city,
      address: row.address,
      lng: Number(row.lng ?? 0),
      lat: Number(row.lat ?? 0),
      intro: row.intro,
      partnered: row.partnered,
      status: row.status as HealthHospitalRow['status'],
      departmentCount: counts?.departmentCount ?? 0,
      practitionerCount: counts?.practitionerCount ?? 0,
    };
  }

  private async hospitalRowsOf(
    rows: Parameters<HealthSubjectService['hospitalRow']>[0][],
  ): Promise<HealthHospitalRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [departments, practitioners] = await Promise.all([
      this.prisma.healthDepartment.groupBy({
        by: ['hospitalId'],
        where: { hospitalId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.healthPractitioner.groupBy({
        by: ['hospitalId'],
        where: { hospitalId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const departmentCount = new Map(
      departments.map((row) => [row.hospitalId, row._count._all]),
    );
    const practitionerCount = new Map(
      practitioners.map((row) => [row.hospitalId, row._count._all]),
    );
    return rows.map((row) =>
      this.hospitalRow(row, {
        departmentCount: departmentCount.get(row.id) ?? 0,
        practitionerCount: practitionerCount.get(row.id) ?? 0,
      }),
    );
  }

  private async organRow(
    row: {
      id: number;
      name: string;
      kind: string;
      city: string;
      address: string;
      contactName: string;
      contactPhone: string;
      licenseNo: string;
      commissionPercent: number;
      auditStatus: string;
      auditReason: string;
      auditAt: Date | null;
      createdAt: Date;
    },
    practitionerCount?: number,
  ): Promise<HealthOrganRow> {
    const count =
      practitionerCount ??
      (await this.prisma.healthPractitioner.count({
        where: { organId: row.id },
      }));
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as HealthOrganRow['kind'],
      city: row.city,
      address: row.address,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      licenseNo: row.licenseNo,
      commissionPercent: row.commissionPercent,
      auditStatus: row.auditStatus as HealthOrganRow['auditStatus'],
      auditReason: row.auditReason,
      auditAt: toIso(row.auditAt),
      practitionerCount: count,
      createdAt: toIso(row.createdAt),
    };
  }

  private practitionerRow(
    row: {
      id: number;
      organId: number;
      hospitalId: number;
      departmentId: number;
      name: string;
      role: string;
      title: string;
      avatar: string;
      phone: string;
      city: string;
      intro: string;
      goodAtJson: unknown;
      licenseNo: string;
      commissionPercent: number;
      auditStatus: string;
      auditReason: string;
      auditAt: Date | null;
      status: string;
      scoreSum: number;
      scoreCount: number;
      createdAt: Date;
    },
    names?: {
      organ?: Map<number, string>;
      hospital?: Map<number, string>;
      department?: Map<number, string>;
    },
    extra?: {
      services?: HealthPractitionerRow['services'];
      patientCount?: number;
    },
  ): HealthPractitionerRow {
    return {
      id: row.id,
      organId: row.organId,
      organName: names?.organ?.get(row.organId) ?? '',
      hospitalId: row.hospitalId,
      hospitalName: names?.hospital?.get(row.hospitalId) ?? '',
      departmentId: row.departmentId,
      departmentName: names?.department?.get(row.departmentId) ?? '',
      name: row.name,
      role: row.role as HealthPractitionerRow['role'],
      title: row.title,
      avatar: row.avatar,
      phone: row.phone,
      city: row.city,
      intro: row.intro,
      goodAt: jsonArr<string>(row.goodAtJson)
        .map((item) => String(item))
        .slice(0, 20),
      licenseNo: row.licenseNo,
      commissionPercent: row.commissionPercent,
      auditStatus: row.auditStatus as HealthPractitionerRow['auditStatus'],
      auditReason: row.auditReason,
      auditAt: toIso(row.auditAt),
      status: row.status as HealthPractitionerRow['status'],
      services: extra?.services ?? [],
      ratings: {
        score: ratingOf(row.scoreSum, row.scoreCount),
        count: row.scoreCount,
      },
      patientCount: extra?.patientCount ?? 0,
      createdAt: toIso(row.createdAt),
    };
  }

  /** 批量补齐医护行所需的名称字典、可接服务与接诊人数（列表与详情共用）。 */
  private async practitionerExtras(
    shopId: number,
    rows: {
      id: number;
      organId: number;
      hospitalId: number;
      departmentId: number;
    }[],
  ) {
    const ids = rows.map((row) => row.id);
    const organIds = [
      ...new Set(rows.map((row) => row.organId).filter((id) => id > 0)),
    ];
    const hospitalIds = [
      ...new Set(rows.map((row) => row.hospitalId).filter((id) => id > 0)),
    ];
    const departmentIds = [
      ...new Set(rows.map((row) => row.departmentId).filter((id) => id > 0)),
    ];
    const [organs, hospitals, departments, links, patients] = await Promise.all(
      [
        organIds.length
          ? this.prisma.healthOrgan.findMany({
              where: { id: { in: organIds } },
              select: { id: true, name: true },
            })
          : [],
        hospitalIds.length
          ? this.prisma.healthHospital.findMany({
              where: { id: { in: hospitalIds } },
              select: { id: true, name: true },
            })
          : [],
        departmentIds.length
          ? this.prisma.healthDepartment.findMany({
              where: { id: { in: departmentIds } },
              select: { id: true, name: true },
            })
          : [],
        ids.length
          ? this.prisma.healthPractitionerService.findMany({
              where: { shopId, practitionerId: { in: ids } },
            })
          : [],
        ids.length
          ? this.prisma.healthPatient.groupBy({
              by: ['ownerPractitionerId'],
              where: { shopId, ownerPractitionerId: { in: ids } },
              _count: { _all: true },
            })
          : [],
      ],
    );
    const serviceIds = [...new Set(links.map((link) => link.serviceId))];
    const services = serviceIds.length
      ? await this.prisma.healthService.findMany({
          where: { shopId, id: { in: serviceIds } },
          select: { id: true, name: true, bizType: true },
        })
      : [];
    const serviceMap = new Map(services.map((row) => [row.id, row]));
    const servicesOf = new Map<number, HealthPractitionerRow['services']>();
    for (const link of links) {
      const service = serviceMap.get(link.serviceId);
      const list = servicesOf.get(link.practitionerId) ?? [];
      list.push({
        id: link.id,
        serviceId: link.serviceId,
        serviceName: service?.name ?? '',
        bizType: (service?.bizType ??
          'REGISTER') as (typeof HEALTH_ORDER_BIZ_TYPES)[number],
        priceCents: link.priceCents,
        instant: link.instant,
        status:
          link.status as HealthPractitionerRow['services'][number]['status'],
      });
      servicesOf.set(link.practitionerId, list);
    }
    const patientMap = new Map(
      patients.map((row) => [row.ownerPractitionerId, row._count._all]),
    );
    return {
      names: {
        organ: nameMap(organs),
        hospital: nameMap(hospitals),
        department: nameMap(departments),
      },
      servicesOf,
      patientMap,
    };
  }

  // ---------- 医院 ----------

  async hospitals(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const city = clip(query.city, 60);
    const where = {
      shopId: context.shop.id,
      ...(statusFilter(status) ? { status: statusFilter(status) } : {}),
      ...(city ? { city } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthHospital.count({ where }),
      this.prisma.healthHospital.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);
    if (!rows.length) return emptyPage<HealthHospitalRow>(page, pageSize);
    return {
      list: await this.hospitalRowsOf(rows),
      total,
      page,
      pageSize,
    };
  }

  async hospitalSave(user: CurrentUser, body: HealthHospitalSaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const data = {
      name: body.name,
      level: body.level,
      city: body.city,
      address: body.address,
      lng: body.lng.toFixed(6),
      lat: body.lat.toFixed(6),
      intro: body.intro,
      partnered: body.partnered,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthHospital.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '医院不存在或已删除');
    }
    const saved = row
      ? await this.prisma.healthHospital.update({ where: { id: row.id }, data })
      : await this.prisma.healthHospital.create({
          data: { shopId: context.shop.id, ...data },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.hospital.save',
      `shop=${context.shop.id} hospital=${saved.id}`,
    );
    const [result] = await this.hospitalRowsOf([saved]);
    return result;
  }

  async hospitalRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthHospital.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '医院已不存在' };
    await this.prisma.healthHospital.delete({ where: { id: row.id } });
    // 科室与医护保留（历史问诊/排班要能回查），只把失去归属的引用置空。
    await this.prisma.healthDepartment.updateMany({
      where: { shopId: context.shop.id, hospitalId: row.id },
      data: { hospitalId: 0 },
    });
    await this.prisma.healthPractitioner.updateMany({
      where: { shopId: context.shop.id, hospitalId: row.id },
      data: { hospitalId: 0, departmentId: 0 },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.hospital.remove',
      `shop=${context.shop.id} hospital=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  // ---------- 科室 ----------

  async departments(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const hospitalId = intIn(query.hospitalId, 0, Number.MAX_SAFE_INTEGER, 0);
    const where = {
      shopId: context.shop.id,
      ...(statusFilter(status) ? { status: statusFilter(status) } : {}),
      ...(hospitalId > 0 ? { hospitalId } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthDepartment.count({ where }),
      this.prisma.healthDepartment.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);
    if (!rows.length) return emptyPage<HealthDepartmentRow>(page, pageSize);
    const hospitalIds = [
      ...new Set(rows.map((row) => row.hospitalId).filter((id) => id > 0)),
    ];
    const [hospitals, counts] = await Promise.all([
      hospitalIds.length
        ? this.prisma.healthHospital.findMany({
            where: { id: { in: hospitalIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthPractitioner.groupBy({
        by: ['departmentId'],
        where: { departmentId: { in: rows.map((row) => row.id) } },
        _count: { _all: true },
      }),
    ]);
    const hospitalMap = nameMap(hospitals);
    const countMap = new Map(
      counts.map((row) => [row.departmentId, row._count._all]),
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        hospitalId: row.hospitalId,
        hospitalName: hospitalMap.get(row.hospitalId) ?? '',
        name: row.name,
        category: row.category,
        intro: row.intro,
        sort: row.sort,
        status: row.status as HealthDepartmentRow['status'],
        practitionerCount: countMap.get(row.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async departmentSave(user: CurrentUser, body: HealthDepartmentSaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    if (body.hospitalId > 0) {
      const hospital = await this.prisma.healthHospital.findFirst({
        where: { id: body.hospitalId, shopId: context.shop.id },
        select: { id: true },
      });
      if (!hospital) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所属医院不存在');
      }
    }
    const data = {
      hospitalId: body.hospitalId,
      name: body.name,
      category: body.category,
      intro: body.intro,
      sort: body.sort,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthDepartment.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '科室不存在或已删除');
    }
    const saved = row
      ? await this.prisma.healthDepartment.update({
          where: { id: row.id },
          data,
        })
      : await this.prisma.healthDepartment.create({
          data: { shopId: context.shop.id, ...data },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.department.save',
      `shop=${context.shop.id} department=${saved.id}`,
    );
    const hospital = saved.hospitalId
      ? await this.prisma.healthHospital.findUnique({
          where: { id: saved.hospitalId },
          select: { name: true },
        })
      : null;
    return {
      id: saved.id,
      hospitalId: saved.hospitalId,
      hospitalName: hospital?.name ?? '',
      name: saved.name,
      category: saved.category,
      intro: saved.intro,
      sort: saved.sort,
      status: saved.status as HealthDepartmentRow['status'],
      practitionerCount: await this.prisma.healthPractitioner.count({
        where: { departmentId: saved.id },
      }),
    };
  }

  async departmentRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthDepartment.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '科室已不存在' };
    await this.prisma.healthDepartment.delete({ where: { id: row.id } });
    await this.prisma.healthPractitioner.updateMany({
      where: { shopId: context.shop.id, departmentId: row.id },
      data: { departmentId: 0 },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.department.remove',
      `shop=${context.shop.id} department=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  // ---------- 开通城市 ----------

  async cities(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(this.prisma, user, query.shopId);
    const rows = await this.prisma.healthCity.findMany({
      where: { shopId: context.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    if (!rows.length) return [];
    const hospitals = await this.prisma.healthHospital.groupBy({
      by: ['city'],
      where: {
        shopId: context.shop.id,
        city: { in: rows.map((row) => row.name) },
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      hospitals.map((row) => [row.city, row._count._all]),
    );
    return rows.map<HealthCityRow>((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      sort: row.sort,
      status: row.status as HealthCityRow['status'],
      hospitalCount: countMap.get(row.name) ?? 0,
    }));
  }

  async citySave(user: CurrentUser, body: HealthCitySaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const duplicate = await this.prisma.healthCity.findFirst({
      where: {
        shopId: context.shop.id,
        name: body.name,
        ...(body.id ? { NOT: { id: body.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `城市「${body.name}」已开通`,
      );
    }
    const data = {
      name: body.name,
      code: body.code,
      sort: body.sort,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthCity.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '城市记录不存在');
    }
    const saved = row
      ? await this.prisma.healthCity.update({ where: { id: row.id }, data })
      : await this.prisma.healthCity.create({
          data: { shopId: context.shop.id, ...data },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.city.save',
      `shop=${context.shop.id} city=${saved.id}`,
    );
    return {
      id: saved.id,
      name: saved.name,
      code: saved.code,
      sort: saved.sort,
      status: saved.status as HealthCityRow['status'],
      hospitalCount: await this.prisma.healthHospital.count({
        where: { shopId: context.shop.id, city: saved.name },
      }),
    };
  }

  async cityRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthCity.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '城市记录已不存在' };
    await this.prisma.healthCity.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.city.remove',
      `shop=${context.shop.id} city=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  // ---------- 机构 ----------

  async organs(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const kind = strOf(query.kind, 24, 'all');
    const auditStatus =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? status
        : undefined;
    const where = {
      shopId: context.shop.id,
      ...(kind !== 'all' ? { kind } : {}),
      ...(auditStatus ? { auditStatus } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthOrgan.count({ where }),
      this.prisma.healthOrgan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    if (!rows.length) return emptyPage<HealthOrganRow>(page, pageSize);
    const counts = await this.prisma.healthPractitioner.groupBy({
      by: ['organId'],
      where: { organId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((row) => [row.organId, row._count._all]),
    );
    return {
      list: await Promise.all(
        rows.map((row) => this.organRow(row, countMap.get(row.id) ?? 0)),
      ),
      total,
      page,
      pageSize,
    };
  }

  async organDetail(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const row = await this.prisma.healthOrgan.findFirst({
      where: { id: Number(query.id), shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '机构不存在或已删除');
    return this.organRow(row);
  }

  async organSave(user: CurrentUser, body: HealthOrganSaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const data = {
      name: body.name,
      kind: body.kind,
      city: body.city,
      address: body.address,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      licenseNo: body.licenseNo,
      licenseImagesJson: body.licenseImages,
      commissionPercent: body.commissionPercent,
      intro: body.intro,
    };
    const row = body.id
      ? await this.prisma.healthOrgan.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '机构不存在或已删除');
    }
    // 后台直录视为已核验；自助入驻的 PENDING 行在这里被人工修正时同样落审核trace。
    const saved = row
      ? await this.prisma.healthOrgan.update({
          where: { id: row.id },
          data: {
            ...data,
            auditStatus: 'APPROVED',
            auditReason: '',
            auditBy: user.userId,
            auditAt: new Date(),
          },
        })
      : await this.prisma.healthOrgan.create({
          data: {
            shopId: context.shop.id,
            ...data,
            auditStatus: 'APPROVED',
            auditBy: user.userId,
            auditAt: new Date(),
          },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.organ.save',
      `shop=${context.shop.id} organ=${saved.id}`,
    );
    return this.organRow(saved);
  }

  async organAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthOrgan.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '机构不存在或已删除');
    const saved = await this.prisma.healthOrgan.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
        auditAt: new Date(),
      },
    });
    await this.prisma.healthApplication.updateMany({
      where: {
        shopId: context.shop.id,
        kind: 'ORGAN',
        targetId: row.id,
        auditStatus: 'PENDING',
      },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
        auditAt: new Date(),
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.organ.audit',
      `shop=${context.shop.id} organ=${row.id} ${body.approved ? 'approved' : 'rejected'}`,
    );
    return this.organRow(saved);
  }

  async organRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthOrgan.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '机构已不存在' };
    const practitionerCount = await this.prisma.healthPractitioner.count({
      where: { shopId: context.shop.id, organId: row.id },
    });
    if (practitionerCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该机构下还有 ${practitionerCount} 位医护，请先解绑或转移后再删除`,
      );
    }
    await this.prisma.healthOrgan.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.organ.remove',
      `shop=${context.shop.id} organ=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  async applications(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const kind = strOf(query.kind, 24, 'all');
    const auditStatus =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? status
        : undefined;
    const where = {
      shopId: context.shop.id,
      ...(kind !== 'all' ? { kind } : {}),
      ...(auditStatus ? { auditStatus } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthApplication.count({ where }),
      this.prisma.healthApplication.findMany({
        where,
        orderBy: [{ auditStatus: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map<HealthApplicationRow>((row) => ({
        id: row.id,
        kind: row.kind,
        targetId: row.targetId,
        name: row.name,
        phone: row.phone,
        city: row.city,
        submitAt: toIso(row.createdAt),
        auditStatus: row.auditStatus as HealthApplicationRow['auditStatus'],
        auditReason: row.auditReason,
        materials: jsonArr<string>(row.materialsJson).map((item) =>
          String(item),
        ),
        extras: jsonObj<Record<string, string>>(row.extrasJson, {}),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ---------- 医护 ----------

  async practitioners(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const role = strOf(query.role, 20, 'all');
    const organId = intIn(query.organId, 0, Number.MAX_SAFE_INTEGER, 0);
    const hospitalId = intIn(query.hospitalId, 0, Number.MAX_SAFE_INTEGER, 0);
    const departmentId = intIn(
      query.departmentId,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    );
    const auditStatus =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? status
        : undefined;
    const where = {
      shopId: context.shop.id,
      ...(role !== 'all' ? { role } : {}),
      ...(organId > 0 ? { organId } : {}),
      ...(hospitalId > 0 ? { hospitalId } : {}),
      ...(departmentId > 0 ? { departmentId } : {}),
      ...(auditStatus ? { auditStatus } : {}),
      ...(statusFilter(status) ? { status: statusFilter(status) } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthPractitioner.count({ where }),
      this.prisma.healthPractitioner.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);
    if (!rows.length) return emptyPage<HealthPractitionerRow>(page, pageSize);
    const extras = await this.practitionerExtras(context.shop.id, rows);
    return {
      list: rows.map((row) =>
        this.practitionerRow(row, extras.names, {
          services: extras.servicesOf.get(row.id) ?? [],
          patientCount: extras.patientMap.get(row.id) ?? 0,
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async practitionerDetail(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: Number(query.id), shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '医护不存在或已删除');
    const extras = await this.practitionerExtras(context.shop.id, [row]);
    return this.practitionerRow(row, extras.names, {
      services: extras.servicesOf.get(row.id) ?? [],
      patientCount: extras.patientMap.get(row.id) ?? 0,
    });
  }

  async practitionerSave(user: CurrentUser, body: HealthPractitionerSaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const [organ, hospital, department] = await Promise.all([
      body.organId
        ? this.prisma.healthOrgan.findFirst({
            where: { id: body.organId, shopId: context.shop.id },
            select: { id: true },
          })
        : { id: 0 },
      body.hospitalId
        ? this.prisma.healthHospital.findFirst({
            where: { id: body.hospitalId, shopId: context.shop.id },
            select: { id: true },
          })
        : { id: 0 },
      body.departmentId
        ? this.prisma.healthDepartment.findFirst({
            where: { id: body.departmentId, shopId: context.shop.id },
            select: { id: true },
          })
        : { id: 0 },
    ]);
    if (body.organId && !organ) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所属机构不存在');
    }
    if (body.hospitalId && !hospital) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所属医院不存在');
    }
    if (body.departmentId && !department) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所属科室不存在');
    }
    const data = {
      organId: body.organId,
      hospitalId: body.hospitalId,
      departmentId: body.departmentId,
      name: body.name,
      role: body.role,
      title: body.title,
      avatar: body.avatar,
      phone: body.phone,
      city: body.city,
      intro: body.intro,
      goodAtJson: body.goodAt,
      licenseNo: body.licenseNo,
      licenseImagesJson: body.licenseImages,
      commissionPercent: body.commissionPercent,
    };
    const row = body.id
      ? await this.prisma.healthPractitioner.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '医护不存在或已删除');
    }
    const saved = row
      ? await this.prisma.healthPractitioner.update({
          where: { id: row.id },
          data: {
            ...data,
            auditStatus: 'APPROVED',
            auditReason: '',
            auditBy: user.userId,
            auditAt: new Date(),
          },
        })
      : await this.prisma.healthPractitioner.create({
          data: {
            shopId: context.shop.id,
            ...data,
            auditStatus: 'APPROVED',
            auditBy: user.userId,
            auditAt: new Date(),
          },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.save',
      `shop=${context.shop.id} practitioner=${saved.id}`,
    );
    const extras = await this.practitionerExtras(context.shop.id, [saved]);
    return this.practitionerRow(saved, extras.names, {
      services: extras.servicesOf.get(saved.id) ?? [],
      patientCount: extras.patientMap.get(saved.id) ?? 0,
    });
  }

  async practitionerAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '医护不存在或已删除');
    const saved = await this.prisma.healthPractitioner.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
        auditAt: new Date(),
      },
    });
    await this.prisma.healthApplication.updateMany({
      where: {
        shopId: context.shop.id,
        kind: 'PRACTITIONER',
        targetId: row.id,
        auditStatus: 'PENDING',
      },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
        auditAt: new Date(),
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.audit',
      `shop=${context.shop.id} practitioner=${row.id} ${body.approved ? 'approved' : 'rejected'}`,
    );
    const extras = await this.practitionerExtras(context.shop.id, [saved]);
    return this.practitionerRow(saved, extras.names, {
      services: extras.servicesOf.get(saved.id) ?? [],
      patientCount: extras.patientMap.get(saved.id) ?? 0,
    });
  }

  async practitionerStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string; reason: string },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    if (body.status !== 'ON' && body.status !== 'OFF') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '状态只能是 ON 或 OFF',
      );
    }
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '医护不存在或已删除');
    const saved = await this.prisma.healthPractitioner.update({
      where: { id: row.id },
      data: { status: body.status },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.status',
      `shop=${context.shop.id} practitioner=${row.id} ${body.status} ${clip(body.reason, 120)}`,
    );
    const extras = await this.practitionerExtras(context.shop.id, [saved]);
    return this.practitionerRow(saved, extras.names, {
      services: extras.servicesOf.get(saved.id) ?? [],
      patientCount: extras.patientMap.get(saved.id) ?? 0,
    });
  }

  async practitionerRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '医护已不存在' };
    await this.prisma.healthPractitioner.delete({ where: { id: row.id } });
    await this.prisma.healthPractitionerService.deleteMany({
      where: { shopId: context.shop.id, practitionerId: row.id },
    });
    await this.prisma.healthTeamMember.deleteMany({
      where: { shopId: context.shop.id, practitionerId: row.id },
    });
    await this.prisma.healthTeam.updateMany({
      where: { shopId: context.shop.id, leaderPractitionerId: row.id },
      data: { leaderPractitionerId: 0 },
    });
    // 就诊人保留（档案与历史问诊需要），只解除归属。
    await this.prisma.healthPatient.updateMany({
      where: { shopId: context.shop.id, ownerPractitionerId: row.id },
      data: { ownerPractitionerId: 0 },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.remove',
      `shop=${context.shop.id} practitioner=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  async practitionerServiceSave(
    user: CurrentUser,
    body: HealthPractitionerServiceSaveBody,
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const [practitioner, service] = await Promise.all([
      this.prisma.healthPractitioner.findFirst({
        where: { id: body.practitionerId, shopId: context.shop.id },
        select: { id: true },
      }),
      this.prisma.healthService.findFirst({
        where: { id: body.serviceId, shopId: context.shop.id },
        select: { id: true, priceCents: true },
      }),
    ]);
    if (!practitioner) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '医护不存在');
    }
    if (!service) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '服务项目不存在，请先到「服务项目」里创建',
      );
    }
    const data = {
      priceCents: body.priceCents || service.priceCents,
      instant: body.instant,
      maxDailyCount: body.maxDailyCount,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthPractitionerService.findFirst({
          where: {
            id: body.id,
            shopId: context.shop.id,
            practitionerId: body.practitionerId,
          },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该医护的服务配置不存在',
      );
    }
    await this.prisma.healthPractitionerService.upsert({
      where: {
        practitionerId_serviceId: {
          practitionerId: body.practitionerId,
          serviceId: body.serviceId,
        },
      },
      create: {
        shopId: context.shop.id,
        practitionerId: body.practitionerId,
        serviceId: body.serviceId,
        ...data,
      },
      update: data,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.service.save',
      `shop=${context.shop.id} practitioner=${body.practitionerId} service=${body.serviceId}`,
    );
    return this.practitionerDetail(user, {
      shopId: context.shop.id,
      id: body.practitionerId,
    });
  }

  async practitionerServiceRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthPractitionerService.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该医护的服务配置不存在',
      );
    }
    await this.prisma.healthPractitionerService.delete({
      where: { id: row.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.practitioner.service.remove',
      `shop=${context.shop.id} link=${row.id}`,
    );
    return this.practitionerDetail(user, {
      shopId: context.shop.id,
      id: row.practitionerId,
    });
  }

  // ---------- 团队 ----------

  private teamRow(
    row: {
      id: number;
      name: string;
      organId: number;
      leaderPractitionerId: number;
      intro: string;
      qrcodeUrl: string;
      status: string;
      createdAt: Date;
    },
    extras: {
      organ?: Map<number, string>;
      memberCount?: Map<number, number>;
      patientCount?: Map<number, number>;
      practitioner?: Map<number, string>;
    },
  ): HealthTeamRow {
    return {
      id: row.id,
      name: row.name,
      organId: row.organId,
      organName: extras.organ?.get(row.organId) ?? '',
      leaderPractitionerId: row.leaderPractitionerId,
      leaderName: extras.practitioner?.get(row.leaderPractitionerId) ?? '',
      intro: row.intro,
      qrcodeUrl: row.qrcodeUrl,
      memberCount: extras.memberCount?.get(row.id) ?? 0,
      patientCount: extras.patientCount?.get(row.id) ?? 0,
      status: row.status as HealthTeamRow['status'],
      createdAt: toIso(row.createdAt),
    };
  }

  async teams(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const { page, pageSize, skip, keyword, status } = pager(query);
    const organId = intIn(query.organId, 0, Number.MAX_SAFE_INTEGER, 0);
    const where = {
      shopId: context.shop.id,
      ...(organId > 0 ? { organId } : {}),
      ...(statusFilter(status) ? { status: statusFilter(status) } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthTeam.count({ where }),
      this.prisma.healthTeam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    if (!rows.length) return emptyPage<HealthTeamRow>(page, pageSize);
    const extras = await this.teamExtras(context.shop.id, rows);
    return {
      list: rows.map((row) => this.teamRow(row, extras)),
      total,
      page,
      pageSize,
    };
  }

  private async teamExtras(
    shopId: number,
    rows: { id: number; organId: number; leaderPractitionerId: number }[],
  ) {
    const ids = rows.map((row) => row.id);
    const organIds = [
      ...new Set(rows.map((row) => row.organId).filter((id) => id > 0)),
    ];
    const leaderIds = [
      ...new Set(
        rows.map((row) => row.leaderPractitionerId).filter((id) => id > 0),
      ),
    ];
    const [organs, leaders, members, patients] = await Promise.all([
      organIds.length
        ? this.prisma.healthOrgan.findMany({
            where: { shopId, id: { in: organIds } },
            select: { id: true, name: true },
          })
        : [],
      leaderIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: leaderIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthTeamMember.groupBy({
        by: ['teamId'],
        where: { shopId, teamId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.healthPatient.groupBy({
        by: ['teamId'],
        where: { shopId, teamId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    return {
      organ: nameMap(organs),
      practitioner: nameMap(leaders),
      memberCount: new Map(members.map((row) => [row.teamId, row._count._all])),
      patientCount: new Map(
        patients.map((row) => [row.teamId, row._count._all]),
      ),
    };
  }

  async teamDetail(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'subject',
    );
    const row = await this.prisma.healthTeam.findFirst({
      where: { id: Number(query.id), shopId: context.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '团队不存在或已删除');
    const [extras, memberRows, noticeRows, joinRows] = await Promise.all([
      this.teamExtras(context.shop.id, [row]),
      this.prisma.healthTeamMember.findMany({
        where: { shopId: context.shop.id, teamId: row.id },
        orderBy: [{ isLeader: 'desc' }, { joinedAt: 'asc' }],
      }),
      this.prisma.healthTeamNotice.findMany({
        where: { shopId: context.shop.id, teamId: row.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.healthTeamJoin.findMany({
        where: { shopId: context.shop.id, teamId: row.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const practitionerIds = [
      ...new Set([
        ...memberRows.map((item) => item.practitionerId),
        ...joinRows.map((item) => item.practitionerId),
      ]),
    ];
    const practitioners = practitionerIds.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId: context.shop.id, id: { in: practitionerIds } },
          select: { id: true, name: true, role: true, title: true },
        })
      : [];
    const practitionerMap = new Map(
      practitioners.map((item) => [item.id, item]),
    );
    const members: HealthTeamMemberRow[] = memberRows.map((item) => {
      const practitioner = practitionerMap.get(item.practitionerId);
      return {
        id: item.id,
        teamId: item.teamId,
        practitionerId: item.practitionerId,
        name: practitioner?.name ?? '',
        role: (practitioner?.role ?? 'DOCTOR') as HealthTeamMemberRow['role'],
        title: practitioner?.title ?? '',
        isLeader: item.isLeader,
        joinedAt: toIso(item.joinedAt),
      };
    });
    const notices: HealthTeamNoticeRow[] = noticeRows.map((item) => ({
      id: item.id,
      teamId: item.teamId,
      title: item.title,
      content: item.content,
      authorName: item.authorName,
      createdAt: toIso(item.createdAt),
    }));
    const joins: HealthTeamJoinRow[] = joinRows.map((item) => ({
      id: item.id,
      teamId: item.teamId,
      teamName: row.name,
      practitionerId: item.practitionerId,
      name: practitionerMap.get(item.practitionerId)?.name ?? '',
      message: item.message,
      auditStatus: item.auditStatus as HealthTeamJoinRow['auditStatus'],
      auditReason: item.auditReason,
      createdAt: toIso(item.createdAt),
    }));
    return {
      team: this.teamRow(row, extras),
      members,
      notices,
      joins,
    };
  }

  async teamSave(user: CurrentUser, body: HealthTeamSaveBody) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    if (body.leaderPractitionerId > 0) {
      const leader = await this.prisma.healthPractitioner.findFirst({
        where: { id: body.leaderPractitionerId, shopId: context.shop.id },
        select: { id: true },
      });
      if (!leader) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '团长医护不存在');
      }
    }
    if (body.organId > 0) {
      const organ = await this.prisma.healthOrgan.findFirst({
        where: { id: body.organId, shopId: context.shop.id },
        select: { id: true },
      });
      if (!organ) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所属机构不存在');
      }
    }
    const data = {
      name: body.name,
      organId: body.organId,
      leaderPractitionerId: body.leaderPractitionerId,
      intro: body.intro,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthTeam.findFirst({
          where: { id: body.id, shopId: context.shop.id },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '团队不存在或已删除');
    }
    const saved = row
      ? await this.prisma.healthTeam.update({ where: { id: row.id }, data })
      : await this.prisma.healthTeam.create({
          data: { shopId: context.shop.id, ...data },
        });
    if (body.leaderPractitionerId > 0) {
      await this.prisma.healthPractitioner.update({
        where: { id: body.leaderPractitionerId },
        data: { teamId: saved.id },
      });
      await this.prisma.healthTeamMember.upsert({
        where: {
          teamId_practitionerId: {
            teamId: saved.id,
            practitionerId: body.leaderPractitionerId,
          },
        },
        create: {
          shopId: context.shop.id,
          teamId: saved.id,
          practitionerId: body.leaderPractitionerId,
          isLeader: true,
        },
        update: { isLeader: true },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.team.save',
      `shop=${context.shop.id} team=${saved.id}`,
    );
    const extras = await this.teamExtras(context.shop.id, [saved]);
    return this.teamRow(saved, extras);
  }

  async teamRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthTeam.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '团队已不存在' };
    await this.prisma.healthTeam.delete({ where: { id: row.id } });
    await this.prisma.healthTeamMember.deleteMany({
      where: { shopId: context.shop.id, teamId: row.id },
    });
    await this.prisma.healthTeamNotice.deleteMany({
      where: { shopId: context.shop.id, teamId: row.id },
    });
    await this.prisma.healthTeamJoin.deleteMany({
      where: { shopId: context.shop.id, teamId: row.id },
    });
    await this.prisma.healthPractitioner.updateMany({
      where: { shopId: context.shop.id, teamId: row.id },
      data: { teamId: 0 },
    });
    await this.prisma.healthPatient.updateMany({
      where: { shopId: context.shop.id, teamId: row.id },
      data: { teamId: 0 },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.team.remove',
      `shop=${context.shop.id} team=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  async teamMemberAdd(
    user: CurrentUser,
    body: {
      shopId: number;
      teamId: number;
      practitionerId: number;
      isLeader: boolean;
    },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const [team, practitioner] = await Promise.all([
      this.prisma.healthTeam.findFirst({
        where: { id: body.teamId, shopId: context.shop.id },
        select: { id: true },
      }),
      this.prisma.healthPractitioner.findFirst({
        where: { id: body.practitionerId, shopId: context.shop.id },
        select: { id: true, name: true, role: true, title: true },
      }),
    ]);
    if (!team) throw new BusinessException(ErrorCode.BAD_REQUEST, '团队不存在');
    if (!practitioner)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '医护不存在');
    const row = await this.prisma.healthTeamMember.upsert({
      where: {
        teamId_practitionerId: {
          teamId: body.teamId,
          practitionerId: body.practitionerId,
        },
      },
      create: {
        shopId: context.shop.id,
        teamId: body.teamId,
        practitionerId: body.practitionerId,
        isLeader: body.isLeader,
      },
      update: { isLeader: body.isLeader },
    });
    if (body.isLeader) {
      await this.prisma.healthTeam.update({
        where: { id: body.teamId },
        data: { leaderPractitionerId: body.practitionerId },
      });
    }
    await this.prisma.healthPractitioner.update({
      where: { id: body.practitionerId },
      data: { teamId: body.teamId },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.team.member.add',
      `shop=${context.shop.id} team=${body.teamId} practitioner=${body.practitionerId}`,
    );
    return {
      id: row.id,
      teamId: row.teamId,
      practitionerId: row.practitionerId,
      name: practitioner.name,
      role: practitioner.role as HealthTeamMemberRow['role'],
      title: practitioner.title,
      isLeader: row.isLeader,
      joinedAt: toIso(row.joinedAt),
    };
  }

  async teamMemberRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthTeamMember.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '成员已不在团队中' };
    await this.prisma.healthTeamMember.delete({ where: { id: row.id } });
    await this.prisma.healthPractitioner.updateMany({
      where: {
        shopId: context.shop.id,
        id: row.practitionerId,
        teamId: row.teamId,
      },
      data: { teamId: 0 },
    });
    await this.prisma.healthTeam.updateMany({
      where: {
        shopId: context.shop.id,
        id: row.teamId,
        leaderPractitionerId: row.practitionerId,
      },
      data: { leaderPractitionerId: 0 },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.team.member.remove',
      `shop=${context.shop.id} member=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  async teamNoticeSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      teamId: number;
      title: string;
      content: string;
    },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const team = await this.prisma.healthTeam.findFirst({
      where: { id: body.teamId, shopId: context.shop.id },
      select: { id: true },
    });
    if (!team) throw new BusinessException(ErrorCode.BAD_REQUEST, '团队不存在');
    const row = body.id
      ? await this.prisma.healthTeamNotice.findFirst({
          where: { id: body.id, shopId: context.shop.id, teamId: body.teamId },
        })
      : null;
    if (body.id && !row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '公告不存在');
    }
    const saved = row
      ? await this.prisma.healthTeamNotice.update({
          where: { id: row.id },
          data: { title: body.title, content: body.content },
        })
      : await this.prisma.healthTeamNotice.create({
          data: {
            shopId: context.shop.id,
            teamId: body.teamId,
            title: body.title,
            content: body.content,
            authorName: clip(user.username, 60),
          },
        });
    await audit(
      this.prisma,
      user.userId,
      'health.team.notice.save',
      `shop=${context.shop.id} notice=${saved.id}`,
    );
    return {
      id: saved.id,
      teamId: saved.teamId,
      title: saved.title,
      content: saved.content,
      authorName: saved.authorName,
      createdAt: toIso(saved.createdAt),
    };
  }

  async teamNoticeRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthTeamNotice.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) return { ok: true, message: '公告已不存在' };
    await this.prisma.healthTeamNotice.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.team.notice.remove',
      `shop=${context.shop.id} notice=${row.id}`,
    );
    return { ok: true, message: '' };
  }

  async teamJoinAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'subject',
    );
    await requireShopWritable(context);
    const row = await this.prisma.healthTeamJoin.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '申请不存在');
    const saved = await this.prisma.healthTeamJoin.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
      },
    });
    const team = await this.prisma.healthTeam.findUnique({
      where: { id: row.teamId },
      select: { name: true },
    });
    const practitioner = await this.prisma.healthPractitioner.findUnique({
      where: { id: row.practitionerId },
      select: { name: true },
    });
    if (body.approved) {
      await this.prisma.healthTeamMember.upsert({
        where: {
          teamId_practitionerId: {
            teamId: row.teamId,
            practitionerId: row.practitionerId,
          },
        },
        create: {
          shopId: context.shop.id,
          teamId: row.teamId,
          practitionerId: row.practitionerId,
          isLeader: false,
        },
        update: {},
      });
      await this.prisma.healthPractitioner.update({
        where: { id: row.practitionerId },
        data: { teamId: row.teamId },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.team.join.audit',
      `shop=${context.shop.id} join=${row.id} ${body.approved ? 'approved' : 'rejected'}`,
    );
    return {
      id: saved.id,
      teamId: saved.teamId,
      teamName: team?.name ?? '',
      practitionerId: saved.practitionerId,
      name: practitioner?.name ?? '',
      message: saved.message,
      auditStatus: saved.auditStatus as HealthTeamJoinRow['auditStatus'],
      auditReason: saved.auditReason,
      createdAt: toIso(saved.createdAt),
    };
  }
}
