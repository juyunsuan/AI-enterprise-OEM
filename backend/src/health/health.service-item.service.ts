import {
  type HealthServiceRow,
  type HealthServiceSaveBody,
  type HealthShiftGenerateBody,
  type HealthShiftTemplateRow,
  type HealthShiftTemplateSaveBody,
  type HealthSlotCalendar,
  type HealthSlotRow,
  type HealthSlotKind,
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
  requireShop,
  requireShopWritable,
  strOf,
} from './health.shared';

const SLOT_KINDS = new Set(['OUTPATIENT', 'EXAM', 'HOME']);

const pad = (value: number): string => String(value).padStart(2, '0');

const dayTextOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseDay = (text: string): Date | null => {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text || '').trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const weekdayOf = (date: Date): number =>
  date.getDay() === 0 ? 7 : date.getDay();

const minutesOf = (text: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return -1;
  return hour * 60 + minute;
};

const timeTextOf = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * 服务项目与号源排班（C6）。
 *
 * 口径：
 * 1. 号源是「模板 → 具体日期时段」两层：模板按星期展开，生成器只补新增，
 *    已存在的时段不覆盖额度（`overwriteQuota` 才动），避免把已售出的号改没。
 * 2. 号源可约 = 状态 AVAILABLE 且余量 > 0；停诊走 BLOCKED + 原因，不删行。
 * 3. 机构/科室名称从医护档案取（医护绑定医院与科室），号源本身只存 id。
 */
export class HealthServiceItemService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 服务项目 ----------

  private async serviceRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      bizType: string;
      category: string;
      coverImage: string;
      desc: string;
      needSlot: boolean;
      needPatient: boolean;
      durationMinutes: number;
      priceCents: number;
      originPriceCents: number;
      cityIdsJson: unknown;
      crowdKindsJson: unknown;
      auditStatus: string;
      status: string;
      sort: number;
    }[],
  ): Promise<HealthServiceRow[]> {
    if (!rows.length) return [];
    const counts = await this.prisma.healthOrder.groupBy({
      by: ['serviceId'],
      where: { shopId, serviceId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((row) => [row.serviceId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      bizType: row.bizType as HealthServiceRow['bizType'],
      category: row.category,
      cover: row.coverImage,
      intro: row.desc,
      needSlot: row.needSlot,
      needPatient: row.needPatient,
      durationMinutes: row.durationMinutes,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      cityIds: jsonArr<unknown>(row.cityIdsJson)
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
      crowdKinds: jsonArr<unknown>(row.crowdKindsJson)
        .map((kind) => String(kind))
        .filter((kind): kind is HealthServiceRow['crowdKinds'][number] =>
          [
            'ALL',
            'ELDERLY',
            'HYPERTENSION',
            'DIABETES',
            'MATERNAL',
            'CHILD',
            'POST_OPERATION',
            'CHRONIC_OTHER',
          ].includes(kind),
        ),
      auditStatus: (['PENDING', 'APPROVED', 'REJECTED', 'OFFLINE'].includes(
        row.auditStatus,
      )
        ? row.auditStatus
        : 'APPROVED') as HealthServiceRow['auditStatus'],
      status: row.status === 'ON' ? 'ON' : 'OFF',
      sort: row.sort,
      orderCount: countMap.get(row.id) ?? 0,
    }));
  }

  async services(user: CurrentUser, query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'service');
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    const bizType = strOf(query.bizType, 24, 'all');
    if (bizType && bizType !== 'all') where.bizType = bizType;
    const category = clip(query.category, 40);
    if (category) where.category = category;
    const keyword = clip(query.keyword, 60);
    if (keyword) where.name = { contains: keyword };
    const status = strOf(query.status, 8, 'all');
    if (status === 'ON' || status === 'OFF') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthService.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.healthService.count({ where }),
    ]);
    return {
      list: await this.serviceRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async serviceSave(
    user: CurrentUser,
    body: HealthServiceSaveBody,
  ): Promise<HealthServiceRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthService.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务项目不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      bizType: body.bizType,
      category: body.category,
      coverImage: body.cover,
      desc: body.intro,
      needSlot: body.needSlot,
      needPatient: body.needPatient,
      durationMinutes: body.durationMinutes,
      priceCents: body.priceCents,
      originPriceCents: body.originPriceCents,
      crowdKindsJson: body.crowdKinds,
      status: body.status,
      sort: body.sort,
    };
    const row = existing
      ? await this.prisma.healthService.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthService.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.service.update' : 'health.service.create',
      `shop=${ctx.shop.id} service=${row.id} bizType=${row.bizType}`,
    );
    const [mapped] = await this.serviceRows(ctx.shop.id, [row]);
    return mapped;
  }

  async serviceStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ): Promise<HealthServiceRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthService.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务项目不存在');
    const updated = await this.prisma.healthService.update({
      where: { id: row.id },
      data: { status: body.status === 'OFF' ? 'OFF' : 'ON' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.service.status',
      `shop=${ctx.shop.id} service=${row.id} status=${updated.status}`,
    );
    const [mapped] = await this.serviceRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async serviceRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthService.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务项目不存在');
    const orders = await this.prisma.healthOrder.count({
      where: { shopId: ctx.shop.id, serviceId: row.id },
    });
    if (orders > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该服务已产生订单，不能删除，请改为下架',
      );
    }
    await this.prisma.healthService.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.service.remove',
      `shop=${ctx.shop.id} service=${row.id}`,
    );
    return { ok: true, message: '服务项目已删除' };
  }

  // ---------- 排班模板 ----------

  private async shiftRows(
    shopId: number,
    rows: {
      id: number;
      practitionerId: number;
      hospitalId: number;
      departmentId: number;
      kind: string;
      weekdaysJson: unknown;
      startText: string;
      endText: string;
      slotMinutes: number;
      quotaPerSlot: number;
      priceCents: number;
      status: string;
    }[],
  ): Promise<HealthShiftTemplateRow[]> {
    if (!rows.length) return [];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const practitioners = practitionerIds.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId, id: { in: practitionerIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(practitioners.map((row) => [row.id, row.name]));
    return rows.map((row) => {
      const span = minutesOf(row.endText) - minutesOf(row.startText);
      const warnings: string[] = [];
      if (span <= 0) warnings.push('结束时间需晚于开始时间');
      else if (span % row.slotMinutes !== 0) {
        warnings.push(
          `时段跨度 ${span} 分钟不能被号源粒度 ${row.slotMinutes} 分钟整除，末尾不足一格的时段不会生成`,
        );
      }
      return {
        id: row.id,
        practitionerId: row.practitionerId,
        practitionerName: nameMap.get(row.practitionerId) ?? '',
        hospitalId: row.hospitalId,
        departmentId: row.departmentId,
        kind: (SLOT_KINDS.has(row.kind)
          ? row.kind
          : 'OUTPATIENT') as HealthSlotKind,
        weekdays: jsonArr<unknown>(row.weekdaysJson)
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
        startAt: row.startText,
        endAt: row.endText,
        slotMinutes: row.slotMinutes,
        quotaPerSlot: row.quotaPerSlot,
        priceCents: row.priceCents,
        status: row.status === 'ON' ? 'ON' : 'OFF',
        configWarning: warnings.join('；'),
      };
    });
  }

  async shiftTemplates(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'service');
    const practitionerId = intIn(query.practitionerId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (practitionerId > 0) where.practitionerId = practitionerId;
    const rows = await this.prisma.healthShiftTemplate.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return this.shiftRows(ctx.shop.id, rows);
  }

  async shiftTemplateSave(
    user: CurrentUser,
    body: HealthShiftTemplateSaveBody,
  ): Promise<HealthShiftTemplateRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const practitioner = await this.prisma.healthPractitioner.findFirst({
      where: { id: body.practitionerId, shopId: ctx.shop.id },
      select: { id: true, name: true, hospitalId: true, departmentId: true },
    });
    if (!practitioner)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '排班医护不存在');
    const start = minutesOf(body.startAt);
    const end = minutesOf(body.endAt);
    if (start < 0 || end < 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '排班时间请按 HH:mm 填写',
      );
    }
    if (end <= start) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '结束时间需晚于开始时间',
      );
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthShiftTemplate.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '排班模板不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: `${practitioner.name}·${body.startAt}-${body.endAt}`.slice(0, 40),
      practitionerId: practitioner.id,
      hospitalId: body.hospitalId || practitioner.hospitalId,
      departmentId: body.departmentId || practitioner.departmentId,
      kind: body.kind,
      weekdaysJson: body.weekdays,
      startText: body.startAt,
      endText: body.endAt,
      slotMinutes: body.slotMinutes,
      quotaPerSlot: body.quotaPerSlot,
      priceCents: body.priceCents,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthShiftTemplate.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthShiftTemplate.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.shift.update' : 'health.shift.create',
      `shop=${ctx.shop.id} shift=${row.id} practitioner=${row.practitionerId}`,
    );
    const [mapped] = await this.shiftRows(ctx.shop.id, [row]);
    return mapped;
  }

  async shiftTemplateRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthShiftTemplate.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '排班模板不存在');
    const used = await this.prisma.healthSlot.count({
      where: {
        shopId: ctx.shop.id,
        shiftId: row.id,
        status: { not: 'CANCELED' },
      },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该模板已生成号源，不能删除，请改为停用',
      );
    }
    await this.prisma.healthShiftTemplate.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.shift.remove',
      `shop=${ctx.shop.id} shift=${row.id}`,
    );
    return { ok: true, message: '排班模板已删除' };
  }

  /** 模板 × 日期展开成具体时段；只补新增，已占号源不动。 */
  async shiftGenerate(user: CurrentUser, body: HealthShiftGenerateBody) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const from = parseDay(body.from);
    if (!from)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写开始日期（YYYY-MM-DD）',
      );
    const where: Record<string, unknown> = {
      shopId: ctx.shop.id,
      status: 'ON',
    };
    if (body.practitionerId > 0) where.practitionerId = body.practitionerId;
    const templates = await this.prisma.healthShiftTemplate.findMany({ where });
    if (!templates.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '没有可用的排班模板，请先新增排班',
      );
    }
    const days = Array.from(
      { length: Math.max(1, Number(body.days)) },
      (_, index) => addDays(from, index),
    );
    const candidates: {
      practitionerId: number;
      shiftId: number;
      kind: string;
      workDate: string;
      startTime: string;
      endTime: string;
      quota: number;
      priceCents: number;
    }[] = [];
    for (const template of templates) {
      const weekdays = jsonArr<unknown>(template.weekdaysJson).map((day) =>
        Number(day),
      );
      const start = minutesOf(template.startText);
      const end = minutesOf(template.endText);
      if (start < 0 || end <= start || template.slotMinutes <= 0) continue;
      for (const day of days) {
        if (!weekdays.includes(weekdayOf(day))) continue;
        const workDate = dayTextOf(day);
        for (
          let cursor = start;
          cursor + template.slotMinutes <= end;
          cursor += template.slotMinutes
        ) {
          candidates.push({
            practitionerId: template.practitionerId,
            shiftId: template.id,
            kind: template.kind,
            workDate,
            startTime: timeTextOf(cursor),
            endTime: timeTextOf(cursor + template.slotMinutes),
            quota: template.quotaPerSlot,
            priceCents: template.priceCents,
          });
        }
      }
    }
    if (!candidates.length) {
      return {
        createdSlots: 0,
        updatedSlots: 0,
        skippedSlots: 0,
        message: '所选日期没有匹配的排班星期',
      };
    }
    const practitionerIds = [
      ...new Set(candidates.map((item) => item.practitionerId)),
    ];
    const existing = await this.prisma.healthSlot.findMany({
      where: {
        shopId: ctx.shop.id,
        practitionerId: { in: practitionerIds },
        workDate: { in: [...new Set(candidates.map((item) => item.workDate))] },
      },
      select: {
        id: true,
        practitionerId: true,
        workDate: true,
        startTime: true,
        kind: true,
        quota: true,
      },
    });
    const existingMap = new Map(
      existing.map((row) => [
        `${row.practitionerId}:${row.workDate}:${row.startTime}:${row.kind}`,
        row,
      ]),
    );
    const fresh: typeof candidates = [];
    const updates: { id: number; quota: number }[] = [];
    let skipped = 0;
    for (const candidate of candidates) {
      const key = `${candidate.practitionerId}:${candidate.workDate}:${candidate.startTime}:${candidate.kind}`;
      const hit = existingMap.get(key);
      if (!hit) {
        fresh.push(candidate);
        continue;
      }
      if (body.overwriteQuota && hit.quota !== candidate.quota) {
        updates.push({ id: hit.id, quota: candidate.quota });
      } else {
        skipped += 1;
      }
    }
    if (fresh.length) {
      await this.prisma.healthSlot.createMany({
        data: fresh.map((item) => ({
          shopId: ctx.shop.id,
          ...item,
          status: 'AVAILABLE',
        })),
        skipDuplicates: true,
      });
    }
    for (const item of updates) {
      await this.prisma.healthSlot.update({
        where: { id: item.id },
        data: { quota: item.quota },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.shift.generate',
      `shop=${ctx.shop.id} from=${body.from} days=${body.days} created=${fresh.length} updated=${updates.length}`,
    );
    return {
      createdSlots: fresh.length,
      updatedSlots: updates.length,
      skippedSlots: skipped,
      message: `生成号源 ${fresh.length} 个，更新额度 ${updates.length} 个，跳过已存在 ${skipped} 个`,
    };
  }

  // ---------- 号源日历 ----------

  private async slotRows(
    shopId: number,
    rows: {
      id: number;
      practitionerId: number;
      kind: string;
      workDate: string;
      startTime: string;
      endTime: string;
      status: string;
      quota: number;
      occupied: number;
      priceCents: number;
      blockedReason: string;
    }[],
  ): Promise<HealthSlotRow[]> {
    if (!rows.length) return [];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const practitioners = practitionerIds.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId, id: { in: practitionerIds } },
          select: {
            id: true,
            name: true,
            hospitalId: true,
            departmentId: true,
          },
        })
      : [];
    const hospitalIds = [
      ...new Set(
        practitioners.map((row) => row.hospitalId).filter((id) => id > 0),
      ),
    ];
    const departmentIds = [
      ...new Set(
        practitioners.map((row) => row.departmentId).filter((id) => id > 0),
      ),
    ];
    const [hospitals, departments] = await Promise.all([
      hospitalIds.length
        ? this.prisma.healthHospital.findMany({
            where: { shopId, id: { in: hospitalIds } },
            select: { id: true, name: true },
          })
        : [],
      departmentIds.length
        ? this.prisma.healthDepartment.findMany({
            where: { shopId, id: { in: departmentIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const practitionerMap = new Map(practitioners.map((row) => [row.id, row]));
    const hospitalMap = new Map(hospitals.map((row) => [row.id, row.name]));
    const departmentMap = new Map(departments.map((row) => [row.id, row.name]));
    return rows.map((row) => {
      const practitioner = practitionerMap.get(row.practitionerId);
      const remain = Math.max(0, row.quota - row.occupied);
      const past =
        row.status === 'AVAILABLE' && row.workDate < dayTextOf(new Date());
      const bookable = row.status === 'AVAILABLE' && remain > 0 && !past;
      return {
        id: row.id,
        day: row.workDate,
        startAt: row.startTime,
        endAt: row.endTime,
        practitionerId: row.practitionerId,
        practitionerName: practitioner?.name ?? '',
        departmentName: practitioner
          ? (departmentMap.get(practitioner.departmentId) ?? '')
          : '',
        hospitalName: practitioner
          ? (hospitalMap.get(practitioner.hospitalId) ?? '')
          : '',
        kind: (SLOT_KINDS.has(row.kind)
          ? row.kind
          : 'OUTPATIENT') as HealthSlotKind,
        quota: row.quota,
        occupied: row.occupied,
        remain,
        priceCents: row.priceCents,
        bookable,
        blockedReason:
          row.status === 'BLOCKED'
            ? row.blockedReason || '已停诊'
            : past
              ? '已过就诊时间'
              : remain <= 0
                ? '已约满'
                : '',
      };
    });
  }

  async slotCalendar(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthSlotCalendar> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'service');
    const from = parseDay(strOf(query.from, 20, '')) ?? new Date();
    const days = intIn(query.days, 1, 60, 7);
    const practitionerId = intIn(query.practitionerId, 0, 2_000_000_000, 0);
    const departmentId = intIn(query.departmentId, 0, 2_000_000_000, 0);
    const hospitalId = intIn(query.hospitalId, 0, 2_000_000_000, 0);
    const kind = strOf(query.kind, 16, 'all');
    const dateList = Array.from(
      { length: Math.max(1, Number(days)) },
      (_, index) => addDayTexts(from, index),
    );
    const where: Record<string, unknown> = {
      shopId: ctx.shop.id,
      workDate: { in: dateList },
      status: { not: 'CANCELED' },
    };
    if (practitionerId > 0) where.practitionerId = practitionerId;
    if (kind !== 'all' && SLOT_KINDS.has(kind)) where.kind = kind;
    if (departmentId > 0 || hospitalId > 0) {
      const practitioners = await this.prisma.healthPractitioner.findMany({
        where: {
          shopId: ctx.shop.id,
          ...(departmentId > 0 ? { departmentId } : {}),
          ...(hospitalId > 0 ? { hospitalId } : {}),
        },
        select: { id: true },
      });
      where.practitionerId = { in: practitioners.map((row) => row.id) };
    }
    const slots = await this.prisma.healthSlot.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
    });
    const rows = await this.slotRows(ctx.shop.id, slots);
    const byDay = new Map<string, HealthSlotRow[]>();
    for (const row of rows) {
      const list = byDay.get(row.day) ?? [];
      list.push(row);
      byDay.set(row.day, list);
    }
    return {
      days: dateList.map((day) => {
        const date = parseDay(day) as Date;
        const list = byDay.get(day) ?? [];
        return {
          day,
          weekday: weekdayOf(date),
          slots: list,
          remainTotal: list.reduce((sum, slot) => sum + slot.remain, 0),
        };
      }),
      timezone: '+08:00',
    };
  }

  async slotBlock(
    user: CurrentUser,
    body: { shopId: number; slotId: number; blocked: boolean; reason: string },
  ): Promise<HealthSlotRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'service');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthSlot.findFirst({
      where: { id: body.slotId, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '号源不存在');
    if (body.blocked && row.status === 'BOOKED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该时段已有预约，不能停诊，请先取消对应预约',
      );
    }
    const updated = await this.prisma.healthSlot.update({
      where: { id: row.id },
      data: body.blocked
        ? {
            status: 'BLOCKED',
            blockedReason: clip(body.reason, 100) || '已停诊',
          }
        : {
            status: row.occupied >= row.quota ? 'BOOKED' : 'AVAILABLE',
            blockedReason: '',
          },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.slot.block',
      `shop=${ctx.shop.id} slot=${row.id} blocked=${body.blocked}`,
    );
    const [mapped] = await this.slotRows(ctx.shop.id, [updated]);
    return mapped;
  }
}

const addDayTexts = (from: Date, offset: number): string =>
  dayTextOf(addDays(from, offset));
