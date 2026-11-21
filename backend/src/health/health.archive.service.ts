import { safeText } from '../common/safe-text';
import { randomInt, randomUUID } from 'node:crypto';
import {
  HEALTH_MEDICAL_EVENT_KIND_LABELS,
  type HealthCustomerDetail,
  type HealthCustomerRow,
  type HealthCustomerSaveBody,
  type HealthCrowdGroupRow,
  type HealthCrowdGroupSaveBody,
  type HealthDictItemRow,
  type HealthDictItemSaveBody,
  type HealthMedicalEventRow,
  type HealthMedicalEventSaveBody,
  type HealthPatientRow,
  type HealthPatientSaveBody,
  type HealthRecordItemSaveBody,
  type HealthRecordRow,
  type HealthRecordSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { HealthCrypto } from './health-crypto';
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
  yuan,
} from './health.shared';
import { ageOf, alertRowsOf, maskPhone, orderRowsOf } from './health.views';

const CSV_BOM = String.fromCharCode(0xfeff);
const EXPORT_MAX_ROWS = 5000;

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

/** 档案 / 表单单选：'all' 与空串都表示「不过滤」，免得前端为两种空值各写一遍。 */
const pickFilter = (value: unknown): string => {
  const text = strOf(value, 32, 'all');
  return text === 'all' ? '' : text;
};

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const dec1 = (value: unknown): number => Math.round(numOf(value) * 10) / 10;

/** 「2024-01-02」「2024-01-02 10:00」都接受；非法文本按未填处理。 */
const dateOf = (text: string): Date | null => {
  const value = safeText(text).trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function csvRow(cells: string[]): string {
  return cells
    .map((cell) => {
      const value = safeText(cell);
      if (
        /[",\r\n]/.test(value) ||
        value.startsWith('=') ||
        value.startsWith('+')
      ) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
    .join(',');
}

const safeFileName = (text: string): string =>
  String(text || 'export')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 40);

/**
 * 档案域（C3）：顾客、就诊人、人群分组、健康档案、医疗事件与店铺字典。
 *
 * 口径：
 * 1. 顾客手机号只在列表脱敏，详情授权后回全量并留审计；导出文件属于店内经营资料，同样留审计。
 * 2. 就诊人证件号只存密文 + 后 4 位，行视图永远只回 `****1234`，明文不出库。
 * 3. 就诊人删除以「无业务记录」为前提：有订单/问诊/处方时不允许删，避免历史订单丢失就诊人姓名；
 *    仅清理档案类附属数据（人群、档案条目、医疗事件、指标读数、预警、随访等）。
 */
export class HealthArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: SystemAssetService,
    private readonly crypto: HealthCrypto,
  ) {}

  // ---------- 行装配 ----------

  private async customerRows(
    shopId: number,
    rows: {
      id: number;
      nickname: string;
      avatar: string;
      phone: string;
      gender: string;
      city: string;
      source: string;
      promoterId: number;
      memberLevelId: number;
      walletAmount: unknown;
      pointValue: number;
      totalPay: unknown;
      status: string;
      lastActiveAt: Date | null;
      createdAt: Date;
    }[],
    maskPhoneOf: boolean,
  ): Promise<HealthCustomerRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const promoterIds = [
      ...new Set(rows.map((row) => row.promoterId).filter((id) => id > 0)),
    ];
    const levelIds = [
      ...new Set(rows.map((row) => row.memberLevelId).filter((id) => id > 0)),
    ];
    const [patientCounts, orderCounts, promoters, levels] = await Promise.all([
      this.prisma.healthPatient.groupBy({
        by: ['customerId'],
        where: { shopId, customerId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.healthOrder.groupBy({
        by: ['customerId'],
        where: { shopId, customerId: { in: ids } },
        _count: { _all: true },
      }),
      promoterIds.length
        ? this.prisma.healthPromoter.findMany({
            where: { shopId, id: { in: promoterIds } },
            select: { id: true, name: true },
          })
        : [],
      levelIds.length
        ? this.prisma.healthMemberLevel.findMany({
            where: { shopId, id: { in: levelIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const patientMap = new Map(
      patientCounts.map((row) => [row.customerId, row._count._all]),
    );
    const orderMap = new Map(
      orderCounts.map((row) => [row.customerId, row._count._all]),
    );
    const promoterMap = new Map(promoters.map((row) => [row.id, row.name]));
    const levelMap = new Map(levels.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: maskPhoneOf ? maskPhone(row.phone) : row.phone,
      gender: row.gender,
      city: row.city,
      source: row.source,
      promoterId: row.promoterId,
      promoterName: promoterMap.get(row.promoterId) ?? '',
      memberLevelId: row.memberLevelId,
      memberLevelName: levelMap.get(row.memberLevelId) ?? '',
      patientCount: patientMap.get(row.id) ?? 0,
      orderCount: orderMap.get(row.id) ?? 0,
      totalPayCents: Math.round(numOf(row.totalPay) * 100),
      walletCents: Math.round(numOf(row.walletAmount) * 100),
      pointValue: row.pointValue,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      lastActiveAt: toIso(row.lastActiveAt),
      createdAt: toIso(row.createdAt),
    }));
  }

  private async patientRows(
    shopId: number,
    rows: {
      id: number;
      customerId: number;
      name: string;
      relation: string;
      gender: string;
      birthday: string;
      phone: string;
      idCardTail: string;
      bloodType: string;
      heightCm: unknown;
      weightKg: unknown;
      ownerPractitionerId: number;
      remark: string;
      createdAt: Date;
    }[],
  ): Promise<HealthPatientRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const ownerIds = [
      ...new Set(
        rows.map((row) => row.ownerPractitionerId).filter((id) => id > 0),
      ),
    ];
    const [members, customers, owners] = await Promise.all([
      this.prisma.healthCrowdMember.findMany({
        where: { shopId, patientId: { in: ids } },
        select: { patientId: true, groupId: true },
      }),
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
      ownerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: ownerIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const groupIds = [...new Set(members.map((row) => row.groupId))];
    const groups = groupIds.length
      ? await this.prisma.healthCrowdGroup.findMany({
          where: { shopId, id: { in: groupIds } },
          select: { id: true, name: true },
        })
      : [];
    const groupNameMap = new Map(groups.map((row) => [row.id, row.name]));
    const crowdByPatient = new Map<number, number[]>();
    for (const member of members) {
      const list = crowdByPatient.get(member.patientId) ?? [];
      list.push(member.groupId);
      crowdByPatient.set(member.patientId, list);
    }
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const ownerMap = new Map(owners.map((row) => [row.id, row.name]));
    return rows.map((row) => {
      const crowdIds = crowdByPatient.get(row.id) ?? [];
      const customer = customerMap.get(row.customerId);
      return {
        id: row.id,
        customerId: row.customerId,
        customerLabel: customer?.nickname || maskPhone(customer?.phone ?? ''),
        name: row.name,
        relation: row.relation as HealthPatientRow['relation'],
        gender: row.gender,
        birthday: row.birthday,
        age: ageOf(row.birthday),
        phone: row.phone,
        idCardMasked: row.idCardTail ? `****${row.idCardTail}` : '',
        bloodType: row.bloodType,
        heightCm: dec1(row.heightCm),
        weightKg: dec1(row.weightKg),
        ownerPractitionerId: row.ownerPractitionerId,
        ownerPractitionerName: ownerMap.get(row.ownerPractitionerId) ?? '',
        crowdIds,
        crowdNames: crowdIds
          .map((id) => groupNameMap.get(id) ?? '')
          .filter(Boolean),
        remark: row.remark,
        createdAt: toIso(row.createdAt),
      };
    });
  }

  private medicalEventRows(
    shopId: number,
    rows: {
      id: number;
      patientId: number;
      kind: string;
      title: string;
      hospitalName: string;
      departmentName: string;
      doctorName: string;
      occurAt: Date | null;
      leaveAt: Date | null;
      diagnosis: string;
      summary: string;
      filesJson: unknown;
      source: string;
      createdAt: Date;
    }[],
  ): HealthMedicalEventRow[] {
    void shopId;
    return rows.map((row) => this.medicalEventRowOf(row));
  }

  private async recordOf(
    shopId: number,
    patientId: number,
  ): Promise<HealthRecordRow> {
    const patient = await this.prisma.healthPatient.findFirst({
      where: { shopId, id: patientId },
      select: { id: true, name: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    const [record, items, events] = await Promise.all([
      this.prisma.healthRecord.findFirst({ where: { shopId, patientId } }),
      this.prisma.healthRecordItem.findMany({
        where: { shopId, patientId },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthMedicalEvent.findMany({
        where: { shopId, patientId },
        orderBy: [{ occurAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    return {
      id: record?.id ?? 0,
      patientId,
      patientName: patient.name,
      completed: record
        ? this.isComplete(record.basicsJson, items.length)
        : false,
      basics: jsonObj<Record<string, unknown>>(record?.basicsJson, {}),
      items: items.map((item) => ({
        id: item.id,
        type: item.type as HealthRecordRow['items'][number]['type'],
        label: item.label,
        value: item.value,
        dictKey: item.dictKey,
        startAt: item.startAt,
        endAt: item.endAt,
        updatedAt: toIso(item.updatedAt),
      })),
      events: this.medicalEventRows(shopId, events),
      updatedAt: toIso(record?.updatedAt ?? null),
    };
  }

  /** 必填项（基本信息至少 3 项有值）+ 至少一条分型条目；口径与 C 端建档引导一致。 */
  private isComplete(basicsJson: unknown, itemCount: number): boolean {
    const basics = jsonObj<Record<string, unknown>>(basicsJson, {});
    const filled = Object.values(basics).filter((value) => {
      if (value === null || value === undefined) return false;
      const text = safeText(value).trim();
      return text !== '' && text !== '0' && text !== 'false';
    }).length;
    return filled >= 3 && itemCount > 0;
  }

  // ---------- 顾客 ----------

  async customers(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword, status } = pager(query);
    const shopId = shopIdOf(query);
    const ctx = await requireShop(this.prisma, user, shopId, 'customer');
    const memberLevelId = intIn(query.memberLevelId, 0, 1_000_000_000, 0);
    const crowdGroupId = intIn(query.crowdGroupId, 0, 1_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (status === 'ON' || status === 'OFF') where.status = status;
    if (memberLevelId > 0) where.memberLevelId = memberLevelId;
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (crowdGroupId > 0) {
      const members = await this.prisma.healthCrowdMember.findMany({
        where: { shopId: ctx.shop.id, groupId: crowdGroupId },
        select: { patientId: true },
      });
      const patientIds = members.map((row) => row.patientId);
      if (!patientIds.length)
        return emptyPage<HealthCustomerRow>(page, pageSize);
      const patients = await this.prisma.healthPatient.findMany({
        where: { shopId: ctx.shop.id, id: { in: patientIds } },
        select: { customerId: true },
      });
      const customerIds = [
        ...new Set(
          patients.map((row) => row.customerId).filter((id) => id > 0),
        ),
      ];
      if (!customerIds.length)
        return emptyPage<HealthCustomerRow>(page, pageSize);
      where.id = { in: customerIds };
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthCustomer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthCustomer.count({ where }),
    ]);
    return {
      list: await this.customerRows(ctx.shop.id, rows, true),
      total,
      page,
      pageSize,
    };
  }

  async customerDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthCustomerDetail> {
    const shopId = shopIdOf(query);
    const id = intIn(query.id, 1, 1_000_000_000, 0);
    const ctx = await requireShop(this.prisma, user, shopId, 'customer');
    const row = await this.prisma.healthCustomer.findFirst({
      where: { id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const [customer] = await this.customerRows(ctx.shop.id, [row], false);
    const [patients, orders, alerts] = await Promise.all([
      this.prisma.healthPatient.findMany({
        where: { shopId: ctx.shop.id, customerId: id },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.healthOrder.findMany({
        where: { shopId: ctx.shop.id, customerId: id },
        orderBy: { id: 'desc' },
        take: 10,
      }),
      this.prisma.healthAlert.findMany({
        where: {
          shopId: ctx.shop.id,
          patientId: { in: await this.patientIdsOf(ctx.shop.id, id) },
        },
        orderBy: { id: 'desc' },
        take: 10,
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.customer.detail',
      `shop=${ctx.shop.id} customer=${id}`,
    );
    return {
      customer,
      patients: await this.patientRows(ctx.shop.id, patients),
      recentOrders: await orderRowsOf(this.prisma, ctx.shop.id, orders),
      recentAlerts: await alertRowsOf(this.prisma, ctx.shop.id, alerts),
      remark: row.remark,
    };
  }

  private async patientIdsOf(
    shopId: number,
    customerId: number,
  ): Promise<number[]> {
    const rows = await this.prisma.healthPatient.findMany({
      where: { shopId, customerId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async customerSave(
    user: CurrentUser,
    body: HealthCustomerSaveBody,
  ): Promise<HealthCustomerRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'customer');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthCustomer.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const data: Record<string, unknown> = {};
    if (body.nickname !== undefined) data.nickname = body.nickname;
    if (body.city !== undefined) data.city = body.city;
    if (body.remark !== undefined) data.remark = body.remark;
    if (body.status !== undefined) data.status = body.status;
    if (body.memberLevelId !== undefined && body.memberLevelId > 0) {
      const level = await this.prisma.healthMemberLevel.findFirst({
        where: { id: body.memberLevelId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!level)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '会员等级不存在');
      data.memberLevelId = body.memberLevelId;
    }
    if (body.phone !== undefined && body.phone !== row.phone) {
      const phone = clip(body.phone, 32);
      if (phone) {
        const used = await this.prisma.healthCustomer.findFirst({
          where: { shopId: ctx.shop.id, phone, id: { not: row.id } },
          select: { id: true },
        });
        if (used) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '该手机号已绑定店内其他顾客',
          );
        }
      }
      data.phone = phone;
    }
    const updated = Object.keys(data).length
      ? await this.prisma.healthCustomer.update({ where: { id: row.id }, data })
      : row;
    await audit(
      this.prisma,
      user.userId,
      'health.customer.save',
      `shop=${ctx.shop.id} customer=${row.id} fields=${Object.keys(data).join(',')}`,
    );
    const [mapped] = await this.customerRows(ctx.shop.id, [updated], true);
    return mapped;
  }

  async customerExport(user: CurrentUser, query: Record<string, unknown>) {
    const shopId = shopIdOf(query);
    const ctx = await requireShop(this.prisma, user, shopId, 'customer');
    const rows = await this.prisma.healthCustomer.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: { id: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
    });
    const limited =
      rows.length > EXPORT_MAX_ROWS ? rows.slice(0, EXPORT_MAX_ROWS) : rows;
    const mapped = await this.customerRows(ctx.shop.id, limited, false);
    const header = [
      '顾客ID',
      '昵称',
      '手机号',
      '性别',
      '城市',
      '来源',
      '推客',
      '会员等级',
      '就诊人数',
      '订单数',
      '累计消费(元)',
      '储值余额(元)',
      '积分',
      '状态',
      '最近活跃',
      '创建时间',
    ];
    const lines = mapped.map((row) => [
      String(row.id),
      row.nickname,
      row.phone,
      row.gender,
      row.city,
      row.source,
      row.promoterName,
      row.memberLevelName,
      String(row.patientCount),
      String(row.orderCount),
      yuan(row.totalPayCents),
      yuan(row.walletCents),
      String(row.pointValue),
      row.status === 'ON' ? '正常' : '停用',
      row.lastActiveAt ? row.lastActiveAt.slice(0, 19).replace('T', ' ') : '',
      row.createdAt.slice(0, 19).replace('T', ' '),
    ]);
    const csv = CSV_BOM + [header, ...lines].map(csvRow).join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `health-customers-${ctx.shop.id}-${stamp}-${mapped.length}.csv`;
    // 导出件入账到店主名下：CSV 含顾客手机号，归属与留存时长都要可追
    const uploaded = await this.assets.put({
      ownerUserId: ctx.shop.ownerUserId,
      path: `health/export/${ctx.shop.id}/${randomUUID()}/${safeFileName(fileName)}`,
      bytes: Buffer.from(csv, 'utf8'),
      name: fileName,
      bizRef: `health-shop:${ctx.shop.id}`,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.customer.export',
      `shop=${ctx.shop.id} count=${mapped.length}`,
    );
    return {
      url: this.assets.urlOf(uploaded.key),
      fileName,
      count: mapped.length,
      message:
        rows.length > EXPORT_MAX_ROWS
          ? `单次最多导出 ${EXPORT_MAX_ROWS} 位顾客，本次已截断，请分批导出`
          : `已导出 ${mapped.length} 位顾客，文件含手机号，请勿外传`,
    };
  }

  // ---------- 就诊人 ----------

  async patients(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = pager(query);
    const shopId = shopIdOf(query);
    const ctx = await requireShop(this.prisma, user, shopId, 'patient');
    const customerId = intIn(query.customerId, 0, 1_000_000_000, 0);
    const practitionerId = intIn(query.practitionerId, 0, 1_000_000_000, 0);
    const crowdGroupId = intIn(query.crowdGroupId, 0, 1_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (customerId > 0) where.customerId = customerId;
    if (practitionerId > 0) where.ownerPractitionerId = practitionerId;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (crowdGroupId > 0) {
      const members = await this.prisma.healthCrowdMember.findMany({
        where: { shopId: ctx.shop.id, groupId: crowdGroupId },
        select: { patientId: true },
      });
      const patientIds = members.map((row) => row.patientId);
      if (!patientIds.length)
        return emptyPage<HealthPatientRow>(page, pageSize);
      where.id = { in: patientIds };
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthPatient.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPatient.count({ where }),
    ]);
    return {
      list: await this.patientRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async patientDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPatientRow> {
    const ctx = await requireShop(
      this.prisma,
      user,
      shopIdOf(query),
      'patient',
    );
    const row = await this.prisma.healthPatient.findFirst({
      where: { id: intIn(query.id, 1, 1_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    const [mapped] = await this.patientRows(ctx.shop.id, [row]);
    return mapped;
  }

  async patientSave(
    user: CurrentUser,
    body: HealthPatientSaveBody,
  ): Promise<HealthPatientRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'patient');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthPatient.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    }
    const customerId = await this.resolveCustomer(
      ctx.shop.id,
      body.customerId,
      body.phone,
      body.name,
    );
    if (body.ownerPractitionerId > 0) {
      const owner = await this.prisma.healthPractitioner.findFirst({
        where: { id: body.ownerPractitionerId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!owner)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '责任医护不存在');
    }
    if (body.crowdIds.length) {
      const groups = await this.prisma.healthCrowdGroup.count({
        where: { shopId: ctx.shop.id, id: { in: body.crowdIds } },
      });
      if (groups !== new Set(body.crowdIds).size) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '人群分组不存在');
      }
    }
    const idCard = clip(body.idCard, 32);
    const data = {
      shopId: ctx.shop.id,
      customerId,
      name: body.name,
      relation: body.relation,
      gender: body.gender,
      birthday: body.birthday,
      phone: body.phone,
      bloodType: body.bloodType,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      ownerPractitionerId: body.ownerPractitionerId,
      remark: body.remark,
      ...(idCard
        ? {
            idCardCipher: this.crypto.encrypt(
              `HEALTH:${ctx.shop.id}:idCard`,
              idCard,
            ),
            idCardTail: idCard.slice(-4),
          }
        : {}),
    };
    const saved = existing
      ? await this.prisma.healthPatient.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthPatient.create({ data });
    await this.prisma.$transaction([
      this.prisma.healthCrowdMember.deleteMany({
        where: { shopId: ctx.shop.id, patientId: saved.id },
      }),
      ...(body.crowdIds.length
        ? [
            this.prisma.healthCrowdMember.createMany({
              data: [...new Set(body.crowdIds)].map((groupId) => ({
                shopId: ctx.shop.id,
                groupId,
                patientId: saved.id,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.patient.update' : 'health.patient.create',
      `shop=${ctx.shop.id} patient=${saved.id}`,
    );
    const [mapped] = await this.patientRows(ctx.shop.id, [saved]);
    return mapped;
  }

  /**
   * 就诊人必须挂在一位顾客下：指定顾客就校验归属；只给了手机号就按手机号找，
   * 都没有时由店主代客建档（`manual:` 开头的假 openid 只表示后台建档，C 端绑定后不冲突）。
   */
  private async resolveCustomer(
    shopId: number,
    customerId: number,
    phone: string,
    name: string,
  ): Promise<number> {
    if (customerId > 0) {
      const customer = await this.prisma.healthCustomer.findFirst({
        where: { id: customerId, shopId },
        select: { id: true },
      });
      if (!customer)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '所属顾客不存在');
      return customer.id;
    }
    const trimmed = clip(phone, 32);
    if (trimmed) {
      const matched = await this.prisma.healthCustomer.findFirst({
        where: { shopId, phone: trimmed },
        select: { id: true },
      });
      if (matched) return matched.id;
    }
    const created = await this.prisma.healthCustomer.create({
      data: {
        shopId,
        openid: `manual:${randomInt(1, 2_000_000_000)}:${Date.now()}`,
        nickname: clip(name, 60) || '到店顾客',
        phone: trimmed,
        source: 'ADMIN',
      },
      select: { id: true },
    });
    return created.id;
  }

  async patientRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'patient');
    await requireShopWritable(ctx);
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true, name: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    const [orders, consults, prescriptions, signOrders, greenOrders, reports] =
      await Promise.all([
        this.prisma.healthOrder.count({
          where: {
            shopId: ctx.shop.id,
            patientIdsJson: { array_contains: body.id },
          },
        }),
        this.prisma.healthConsult.count({
          where: { shopId: ctx.shop.id, patientId: body.id },
        }),
        this.prisma.healthPrescription.count({
          where: { shopId: ctx.shop.id, patientId: body.id },
        }),
        this.prisma.healthSignOrder.count({
          where: { shopId: ctx.shop.id, patientId: body.id },
        }),
        this.prisma.healthGreenOrder.count({
          where: { shopId: ctx.shop.id, patientId: body.id },
        }),
        this.prisma.healthReport.count({
          where: { shopId: ctx.shop.id, patientId: body.id },
        }),
      ]);
    if (
      orders + consults + prescriptions + signOrders + greenOrders + reports >
      0
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该就诊人已有订单或诊疗记录，不能删除；如信息有误请修改，或仅保留档案',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthCrowdMember.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthRecordItem.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthRecord.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthMedicalEvent.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthMetricLog.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthAlert.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthFollowupTask.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthFollowupRecord.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthSurveyAnswer.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthPatientPlan.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthMedication.deleteMany({
        where: { shopId: ctx.shop.id, patientId: body.id },
      }),
      this.prisma.healthPatient.delete({ where: { id: body.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.patient.remove',
      `shop=${ctx.shop.id} patient=${body.id} ${patient.name}`,
    );
    return { ok: true, message: '就诊人已删除' };
  }

  async patientMove(
    user: CurrentUser,
    body: {
      shopId: number;
      patientIds: number[];
      practitionerId: number;
      crowdGroupIds: number[];
      replace: boolean;
    },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'patient');
    await requireShopWritable(ctx);
    const ids = [...new Set(body.patientIds)];
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: ctx.shop.id, id: { in: ids } },
      select: { id: true },
    });
    if (patients.length !== ids.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '部分就诊人不存在或不属于本店',
      );
    }
    if (body.practitionerId > 0) {
      const owner = await this.prisma.healthPractitioner.findFirst({
        where: { id: body.practitionerId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!owner)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '责任医护不存在');
    }
    if (body.crowdGroupIds.length) {
      const groups = await this.prisma.healthCrowdGroup.count({
        where: { shopId: ctx.shop.id, id: { in: body.crowdGroupIds } },
      });
      if (groups !== new Set(body.crowdGroupIds).size) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '人群分组不存在');
      }
    }
    await this.prisma.$transaction([
      this.prisma.healthPatient.updateMany({
        where: { shopId: ctx.shop.id, id: { in: ids } },
        data: { ownerPractitionerId: body.practitionerId },
      }),
      ...(body.replace
        ? [
            this.prisma.healthCrowdMember.deleteMany({
              where: { shopId: ctx.shop.id, patientId: { in: ids } },
            }),
          ]
        : []),
      this.prisma.healthCrowdMember.deleteMany({
        where: {
          shopId: ctx.shop.id,
          patientId: { in: ids },
          ...(body.crowdGroupIds.length
            ? { groupId: { in: body.crowdGroupIds } }
            : {}),
        },
      }),
    ]);
    if (body.crowdGroupIds.length) {
      const exists = await this.prisma.healthCrowdMember.findMany({
        where: {
          shopId: ctx.shop.id,
          patientId: { in: ids },
          groupId: { in: body.crowdGroupIds },
        },
        select: { patientId: true, groupId: true },
      });
      const seen = new Set(
        exists.map((item) => `${item.patientId}:${item.groupId}`),
      );
      const data = ids.flatMap((patientId) =>
        [...new Set(body.crowdGroupIds)]
          .filter((groupId) => !seen.has(`${patientId}:${groupId}`))
          .map((groupId) => ({ shopId: ctx.shop.id, groupId, patientId })),
      );
      if (data.length) await this.prisma.healthCrowdMember.createMany({ data });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.patient.move',
      `shop=${ctx.shop.id} patients=${ids.length} owner=${body.practitionerId} groups=${body.crowdGroupIds.join('|')}`,
    );
    return { ok: true, message: `已移动 ${ids.length} 位就诊人` };
  }

  // ---------- 人群分组 ----------

  async crowdGroups(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthCrowdGroupRow[]> {
    const ctx = await requireShop(this.prisma, user, shopIdOf(query), 'crowd');
    const rows = await this.prisma.healthCrowdGroup.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: { id: 'asc' },
    });
    const counts = rows.length
      ? await this.prisma.healthCrowdMember.groupBy({
          by: ['groupId'],
          where: {
            shopId: ctx.shop.id,
            groupId: { in: rows.map((row) => row.id) },
          },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((row) => [row.groupId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as HealthCrowdGroupRow['kind'],
      desc: row.desc,
      memberCount: countMap.get(row.id) ?? 0,
      createdAt: toIso(row.createdAt),
    }));
  }

  async crowdGroupSave(
    user: CurrentUser,
    body: HealthCrowdGroupSaveBody,
  ): Promise<HealthCrowdGroupRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'crowd');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthCrowdGroup.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '人群分组不存在');
    }
    const clash = await this.prisma.healthCrowdGroup.findFirst({
      where: {
        shopId: ctx.shop.id,
        name: body.name,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new BusinessException(ErrorCode.CONFLICT, '同名的分组已存在');
    const row = existing
      ? await this.prisma.healthCrowdGroup.update({
          where: { id: existing.id },
          data: { name: body.name, kind: body.kind, desc: body.desc },
        })
      : await this.prisma.healthCrowdGroup.create({
          data: {
            shopId: ctx.shop.id,
            name: body.name,
            kind: body.kind,
            desc: body.desc,
          },
        });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.crowd.update' : 'health.crowd.create',
      `shop=${ctx.shop.id} group=${row.id}`,
    );
    const count = await this.prisma.healthCrowdMember.count({
      where: { shopId: ctx.shop.id, groupId: row.id },
    });
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as HealthCrowdGroupRow['kind'],
      desc: row.desc,
      memberCount: count,
      createdAt: toIso(row.createdAt),
    };
  }

  async crowdGroupRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'crowd');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthCrowdGroup.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true, name: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '人群分组不存在');
    await this.prisma.$transaction([
      this.prisma.healthCrowdMember.deleteMany({
        where: { shopId: ctx.shop.id, groupId: row.id },
      }),
      this.prisma.healthCrowdGroup.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.crowd.remove',
      `shop=${ctx.shop.id} group=${row.id} ${row.name}`,
    );
    return { ok: true, message: '分组已删除' };
  }

  // ---------- 健康档案 ----------

  async recordDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthRecordRow> {
    const ctx = await requireShop(this.prisma, user, shopIdOf(query), 'record');
    return this.recordOf(ctx.shop.id, intIn(query.id, 1, 1_000_000_000, 0));
  }

  async recordSave(
    user: CurrentUser,
    body: HealthRecordSaveBody,
  ): Promise<HealthRecordRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    await this.requirePatient(ctx.shop.id, body.patientId);
    const itemCount = await this.prisma.healthRecordItem.count({
      where: { shopId: ctx.shop.id, patientId: body.patientId },
    });
    const completed = this.isComplete(body.basics, itemCount);
    await this.prisma.healthRecord.upsert({
      where: { patientId: body.patientId },
      create: {
        shopId: ctx.shop.id,
        patientId: body.patientId,
        basicsJson: body.basics as never,
        completed,
      },
      update: { basicsJson: body.basics as never, completed },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.record.save',
      `shop=${ctx.shop.id} patient=${body.patientId}`,
    );
    return this.recordOf(ctx.shop.id, body.patientId);
  }

  async recordItemSave(
    user: CurrentUser,
    body: HealthRecordItemSaveBody,
  ): Promise<HealthRecordRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    await this.requirePatient(ctx.shop.id, body.patientId);
    const data = {
      shopId: ctx.shop.id,
      patientId: body.patientId,
      type: body.type,
      label: body.label,
      value: body.value,
      dictKey: body.dictKey,
      startAt: body.startAt,
      endAt: body.endAt,
    };
    if (body.id > 0) {
      const existing = await this.prisma.healthRecordItem.findFirst({
        where: { id: body.id, shopId: ctx.shop.id, patientId: body.patientId },
        select: { id: true },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '档案条目不存在');
      await this.prisma.healthRecordItem.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.healthRecordItem.create({ data });
    }
    await this.syncCompleted(ctx.shop.id, body.patientId);
    await audit(
      this.prisma,
      user.userId,
      body.id > 0 ? 'health.record.item.update' : 'health.record.item.create',
      `shop=${ctx.shop.id} patient=${body.patientId} type=${body.type}`,
    );
    return this.recordOf(ctx.shop.id, body.patientId);
  }

  async recordItemRemove(
    user: CurrentUser,
    body: { shopId: number; patientId: number; id: number },
  ): Promise<HealthRecordRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    const item = await this.prisma.healthRecordItem.findFirst({
      where: { id: body.id, shopId: ctx.shop.id, patientId: body.patientId },
      select: { id: true },
    });
    if (!item)
      throw new BusinessException(ErrorCode.NOT_FOUND, '档案条目不存在');
    await this.prisma.healthRecordItem.delete({ where: { id: item.id } });
    await this.syncCompleted(ctx.shop.id, body.patientId);
    await audit(
      this.prisma,
      user.userId,
      'health.record.item.remove',
      `shop=${ctx.shop.id} patient=${body.patientId} item=${item.id}`,
    );
    return this.recordOf(ctx.shop.id, body.patientId);
  }

  private async syncCompleted(
    shopId: number,
    patientId: number,
  ): Promise<void> {
    const [record, itemCount] = await Promise.all([
      this.prisma.healthRecord.findFirst({ where: { shopId, patientId } }),
      this.prisma.healthRecordItem.count({ where: { shopId, patientId } }),
    ]);
    if (!record) return;
    const completed = this.isComplete(record.basicsJson, itemCount);
    if (completed !== record.completed) {
      await this.prisma.healthRecord.update({
        where: { id: record.id },
        data: { completed },
      });
    }
  }

  private async requirePatient(shopId: number, patientId: number) {
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: patientId, shopId },
      select: { id: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    return patient;
  }

  // ---------- 医疗事件 ----------

  async medicalEventList(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = pager(query);
    const ctx = await requireShop(this.prisma, user, shopIdOf(query), 'record');
    const patientId = intIn(query.patientId, 0, 1_000_000_000, 0);
    const kind = pickFilter(query.kind);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (kind) where.kind = kind;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { hospitalName: { contains: keyword } },
        { doctorName: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthMedicalEvent.findMany({
        where,
        orderBy: [{ occurAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthMedicalEvent.count({ where }),
    ]);
    return {
      list: this.medicalEventRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async medicalEventSave(
    user: CurrentUser,
    body: HealthMedicalEventSaveBody,
  ): Promise<HealthMedicalEventRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    await this.requirePatient(ctx.shop.id, body.patientId);
    const data = {
      shopId: ctx.shop.id,
      patientId: body.patientId,
      kind: body.kind,
      title: body.title,
      hospitalName: body.hospitalName,
      departmentName: body.departmentName,
      doctorName: body.doctorName,
      occurAt: dateOf(body.occurAt),
      leaveAt: dateOf(body.leaveAt),
      diagnosis: body.diagnosis,
      summary: body.summary,
      filesJson: body.attachments,
    };
    const existing =
      body.id > 0
        ? await this.prisma.healthMedicalEvent.findFirst({
            where: {
              id: body.id,
              shopId: ctx.shop.id,
              patientId: body.patientId,
            },
            select: { id: true },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '医疗事件不存在');
    }
    const row = existing
      ? await this.prisma.healthMedicalEvent.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthMedicalEvent.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.medicalEvent.update' : 'health.medicalEvent.create',
      `shop=${ctx.shop.id} patient=${body.patientId} event=${row.id}`,
    );
    return this.medicalEventRowOf(row);
  }

  private medicalEventRowOf(row: {
    id: number;
    patientId: number;
    kind: string;
    title: string;
    hospitalName: string;
    departmentName: string;
    doctorName: string;
    occurAt: Date | null;
    leaveAt: Date | null;
    diagnosis: string;
    summary: string;
    filesJson: unknown;
    source: string;
    createdAt: Date;
  }): HealthMedicalEventRow {
    return {
      id: row.id,
      patientId: row.patientId,
      kind: (HEALTH_MEDICAL_EVENT_KIND_LABELS[row.kind]
        ? row.kind
        : 'OTHER') as HealthMedicalEventRow['kind'],
      title: row.title,
      hospitalName: row.hospitalName,
      departmentName: row.departmentName,
      doctorName: row.doctorName,
      occurAt: toIso(row.occurAt),
      leaveAt: toIso(row.leaveAt),
      diagnosis: row.diagnosis,
      summary: row.summary,
      attachments: jsonArr<{ name?: unknown; url?: unknown }>(row.filesJson)
        .map((item) => ({
          name: safeText(item?.name),
          url: safeText(item?.url),
        }))
        .filter((item) => item.url),
      source: row.source,
      createdAt: toIso(row.createdAt),
    };
  }

  async medicalEventRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMedicalEvent.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true, patientId: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '医疗事件不存在');
    await this.prisma.healthMedicalEvent.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.medicalEvent.remove',
      `shop=${ctx.shop.id} event=${row.id}`,
    );
    return { ok: true, message: '医疗事件已删除' };
  }

  // ---------- 店铺字典 ----------

  async dictList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthDictItemRow[]> {
    const ctx = await requireShop(this.prisma, user, shopIdOf(query), 'record');
    const groupKey = clip(query.groupKey, 40);
    const rows = await this.prisma.healthDictItem.findMany({
      where: { shopId: ctx.shop.id, ...(groupKey ? { groupKey } : {}) },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      groupKey: row.groupKey,
      label: row.label,
      value: row.value,
      sort: row.sort,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
    }));
  }

  async dictSave(
    user: CurrentUser,
    body: HealthDictItemSaveBody,
  ): Promise<HealthDictItemRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthDictItem.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '字典项不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      groupKey: body.groupKey,
      label: body.label,
      value: body.value,
      sort: body.sort,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthDictItem.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthDictItem.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.dict.update' : 'health.dict.create',
      `shop=${ctx.shop.id} dict=${row.id} group=${row.groupKey}`,
    );
    return {
      id: row.id,
      groupKey: row.groupKey,
      label: row.label,
      value: row.value,
      sort: row.sort,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
    };
  }

  async dictRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'record');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthDictItem.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '字典项不存在');
    await this.prisma.healthDictItem.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.dict.remove',
      `shop=${ctx.shop.id} dict=${row.id}`,
    );
    return { ok: true, message: '字典项已删除' };
  }
}

const shopIdOf = (query: Record<string, unknown>): number =>
  intIn(query.shopId, 0, 2_000_000_000, 0);
