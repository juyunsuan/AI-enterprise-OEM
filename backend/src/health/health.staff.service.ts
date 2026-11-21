import { HEALTH_PRACTITIONER_ROLE_LABELS } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { HealthCrypto } from './health-crypto';
import type { HealthMonitorService } from './health.monitor.service';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  jsonObj,
  makeNo,
  strOf,
  toIso,
} from './health.shared';
import {
  issueHealthStaffToken,
  type HealthStaffTokenPayload,
} from './health-staff-token';
import { ageOf, maskPhone } from './health.views';
import { resolveTransition } from './health.order.rules';

const ROLE_LABELS: Record<string, string> = HEALTH_PRACTITIONER_ROLE_LABELS;

const PRACTITIONER_ROLES = new Set([
  'DOCTOR',
  'MANAGER',
  'PHARMACIST',
  'GUIDE',
]);
const REVIEW_ROLES = new Set(['PHARMACIST', 'MANAGER']);

type PractitionerRow = {
  id: number;
  shopId: number;
  organId: number;
  hospitalId: number;
  departmentId: number;
  teamId: number;
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
  /** 绑定的纯AI客服员工编号（service_desk_ai_agents.id），0 = 未绑定。 */
  deskAiAgentId: number;
  auditStatus: string;
  status: string;
  scoreSum: number;
  scoreCount: number;
};

export type HealthStaffIdentity = {
  shopId: number;
  practitioner: PractitionerRow;
  roleLabel: string;
};

/**
 * AI客服板块的纯AI客服员工引用（健康域只认这几项，用来显示名字/接待方式/是否在岗）。
 * 人设、模型、知识库范围、转人工口径一律不在健康域出现。
 */
export type HealthAiAgentRef = {
  id: number;
  name: string;
  mode: string;
  status: string;
  statusLabel: string;
};

/** AI 医护的一次应答：内容与出处全部照搬 AI客服的返回，健康域不加工、不补写。 */
export type HealthStaffAiAnswer = {
  agentName: string;
  answer: string;
  references: { title: string; ref: string }[];
  handoff: boolean;
};

/** 带进上下文的最近问答条数与单条长度上限。 */
const AI_HISTORY_LIMIT = 20;
const AI_HISTORY_ROLES = new Set(['user', 'assistant']);

const asAiHistory = (
  value: unknown,
): { role: 'user' | 'assistant'; content: string }[] =>
  jsonArr<Record<string, unknown>>(value)
    .filter((item) => item && AI_HISTORY_ROLES.has(String(item.role)))
    .map((item) => ({
      role: String(item.role) as 'user' | 'assistant',
      content: clip(item.content, 2000),
    }))
    .filter((item) => item.content)
    .slice(-AI_HISTORY_LIMIT);

const today = (): string => new Date().toISOString().slice(0, 10);

const shiftDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pager = (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(query.pageSize ?? 20) || 20),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
};

/**
 * 健康管理小程序 · 医护工作台（`/api/public/health/staff/**`）。
 *
 * 与店主工作台（站内 `CurrentUser`）完全隔离：医护只凭 `bind` 签发的医护令牌进入，
 * 所有读写按 `shopId + practitionerId` 双条件过滤；每次请求回查审核与在岗状态，
 * 店铺驳回或停用后令牌立即失效。医护不管理店铺、机构与商品，只处理自己名下的
 * 就诊人、随访、排班、处方复核、核销、收益与科普投稿。
 */
export class HealthStaffService {
  /**
   * AI 医护问答钩子（`services.ts` 装配到 AI客服的通用问答口 `answerForAgent`）。
   *
   * 架构口径：健康域不造 AI，只存「绑了哪个纯AI客服员工」和「开没开」；
   * 人设/模型/知识库/转人工口径全在 AI客服板块，这里连提示词都不拼。
   * 命名说明：类内 `aiAsk(ctx, body)` 是医护侧业务方法，钩子因此叫 `aiAnswer`，
   * 二者不能同名（同名会互相覆盖）。
   */
  aiAnswer?: (input: {
    ownerUserId: string;
    agentId: number;
    question: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  }) => Promise<HealthStaffAiAnswer & { agentId: number }>;

  /** AI 客服员工清单钩子：按店铺所属主账号取，含停用项（绑定的名字要能显示出来）。 */
  aiAgentList?: (ownerUserId: string) => Promise<HealthAiAgentRef[]>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: HealthMonitorService,
    private readonly crypto: HealthCrypto,
  ) {}

  // ---------- 绑定与身份 ----------

  async bind(
    shop: { shopId: number; name: string; shopCode: string },
    customer: { id: number; openid: string; phone: string },
    body: { phone: string; licenseNo: string },
  ) {
    const phone = String(body.phone || '').replace(/[\s-]+/g, '');
    const licenseNo = String(body.licenseNo || '')
      .trim()
      .toUpperCase();
    if (!/^\d{6,20}$/.test(phone)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写医护登记的手机号',
      );
    }
    if (!licenseNo) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写执业证号（与店铺审核时登记的一致）',
      );
    }
    const rows = await this.prisma.healthPractitioner.findMany({
      where: { shopId: shop.shopId, phone },
    });
    if (!rows.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '本店没有用该手机号登记的医护，请核对手机号或联系店主',
      );
    }
    const row = rows.find(
      (item) =>
        String(item.licenseNo || '')
          .trim()
          .toUpperCase() === licenseNo,
    );
    if (!row) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '执业证号与店铺登记信息不一致',
      );
    }
    if (row.auditStatus === 'PENDING') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '医护资质还在审核中，请等待店主审核通过',
      );
    }
    if (row.auditStatus !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '医护资质未通过审核，请联系店主',
      );
    }
    if (row.status !== 'ON') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该医护已被店铺停用，请联系店主',
      );
    }
    if (customer.phone && customer.phone.replace(/[\s-]+/g, '') !== phone) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '微信账号绑定的手机号与医护登记手机号不一致，请用登记手机号对应的微信打开',
      );
    }
    const token = issueHealthStaffToken({
      shopId: shop.shopId,
      practitionerId: row.id,
      customerId: customer.id,
      openid: customer.openid,
    });
    await audit(
      this.prisma,
      `health-staff:${row.id}`,
      'health.staff.bind',
      `shop=${shop.shopId} practitioner=${row.id}`,
    );
    return {
      token,
      shop: { name: shop.name, shopCode: shop.shopCode },
      practitioner: this.profileOf(row),
    };
  }

  async identify(
    shopId: number,
    payload: HealthStaffTokenPayload,
  ): Promise<HealthStaffIdentity> {
    if (payload.shopId !== shopId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '医护身份与当前小程序不匹配，请重新绑定',
      );
    }
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: payload.practitionerId, shopId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '医护档案已不存在，请重新绑定身份',
      );
    }
    if (row.auditStatus !== 'APPROVED' || row.status !== 'ON') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '医护资质已失效或被店铺停用，请联系店主',
      );
    }
    if (!PRACTITIONER_ROLES.has(row.role)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前岗位不能使用医护工作台',
      );
    }
    return {
      shopId,
      practitioner: row,
      roleLabel: ROLE_LABELS[row.role] || row.role,
    };
  }

  private profileOf(row: PractitionerRow) {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      roleLabel: ROLE_LABELS[row.role] || row.role,
      title: row.title,
      avatar: row.avatar,
      phoneMasked: maskPhone(row.phone),
      city: row.city,
      intro: row.intro,
      goodAt: jsonArr<string>(row.goodAtJson),
      auditStatus: row.auditStatus,
      status: row.status,
      score:
        row.scoreCount > 0
          ? Math.round((row.scoreSum / row.scoreCount) * 10) / 10
          : 0,
      scoreCount: row.scoreCount,
      commissionPercent: row.commissionPercent,
    };
  }

  /** 名称占位：异步补齐（profile 是 async 的）。 */
  private async nameOf(
    kind: 'organ' | 'hospital' | 'department',
    shopId: number,
    id: number,
  ): Promise<string> {
    if (!id) return '';
    if (kind === 'organ') {
      const row = await this.prisma.healthOrgan.findFirst({
        where: { id, shopId },
        select: { name: true },
      });
      return row?.name ?? '';
    }
    if (kind === 'hospital') {
      const row = await this.prisma.healthHospital.findFirst({
        where: { id, shopId },
        select: { name: true },
      });
      return row?.name ?? '';
    }
    const row = await this.prisma.healthDepartment.findFirst({
      where: { id, shopId },
      select: { name: true },
    });
    return row?.name ?? '';
  }

  async profile(ctx: HealthStaffIdentity) {
    const p = ctx.practitioner;
    const [
      organName,
      hospitalName,
      departmentName,
      pendingFollowups,
      todaySlots,
      monthIncome,
    ] = await Promise.all([
      this.nameOf('organ', ctx.shopId, p.organId),
      this.nameOf('hospital', ctx.shopId, p.hospitalId),
      this.nameOf('department', ctx.shopId, p.departmentId),
      this.prisma.healthFollowupTask.count({
        where: { shopId: ctx.shopId, practitionerId: p.id, status: 'PENDING' },
      }),
      this.prisma.healthSlot.count({
        where: { shopId: ctx.shopId, practitionerId: p.id, workDate: today() },
      }),
      this.incomeSummary(ctx),
    ]);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      roleLabel: ctx.roleLabel,
      title: p.title,
      avatar: p.avatar,
      phoneMasked: maskPhone(p.phone),
      city: p.city,
      intro: p.intro,
      goodAt: jsonArr<string>(p.goodAtJson),
      auditStatus: p.auditStatus,
      score:
        p.scoreCount > 0
          ? Math.round((p.scoreSum / p.scoreCount) * 10) / 10
          : 0,
      scoreCount: p.scoreCount,
      commissionPercent: p.commissionPercent,
      organName,
      hospitalName,
      departmentName,
      pendingFollowups,
      todaySlots,
      settleableCents: monthIncome.settleableCents,
    };
  }

  // ---------- 工作台 ----------

  async workbench(ctx: HealthStaffIdentity) {
    const p = ctx.practitioner;
    const shopId = ctx.shopId;
    const now = new Date();
    const day = today();
    const patientWhere = this.patientScope(ctx);
    const ownedPatients = await this.prisma.healthPatient.findMany({
      where: patientWhere,
      select: { id: true },
    });
    const patientIds = ownedPatients.map((row) => row.id);
    const pendingRxWhere = {
      shopId,
      status: 'SUBMITTED',
      ...(REVIEW_ROLES.has(p.role) ? {} : { doctorId: p.id }),
    };
    const activeConsultWhere = {
      shopId,
      status: {
        in: [
          'WAIT_ACCEPT',
          'IN_SESSION',
          'PRACTITIONER_REPLIED',
          'CUSTOMER_DONE',
        ],
      },
      ...(p.role === 'MANAGER' ? {} : { practitionerId: p.id }),
    };
    const [
      patients,
      pendingFollowups,
      overdueFollowups,
      openAlerts,
      pendingPrescriptions,
      todayShifts,
      todaySlots,
      activeConsults,
      income,
    ] = await Promise.all([
      this.prisma.healthPatient.count({ where: patientWhere }),
      this.prisma.healthFollowupTask.count({
        where: { shopId, practitionerId: p.id, status: 'PENDING' },
      }),
      this.prisma.healthFollowupTask.count({
        where: {
          shopId,
          practitionerId: p.id,
          status: 'PENDING',
          dueAt: { lt: now },
        },
      }),
      patientIds.length
        ? this.prisma.healthAlert.count({
            where: { shopId, patientId: { in: patientIds }, status: 'OPEN' },
          })
        : 0,
      this.prisma.healthPrescription.count({
        where: pendingRxWhere,
      }),
      this.prisma.healthDoctorShift.findMany({
        where: { shopId, practitionerId: p.id, workDate: day, status: 'ON' },
        orderBy: { startText: 'asc' },
      }),
      this.prisma.healthSlot.findMany({
        where: { shopId, practitionerId: p.id, workDate: day },
        orderBy: { startTime: 'asc' },
        take: 60,
      }),
      this.prisma.healthConsult.count({
        where: activeConsultWhere,
      }),
      this.incomeSummary(ctx),
    ]);
    return {
      practitioner: await this.profile(ctx),
      stats: {
        patients,
        pendingFollowups,
        overdueFollowups,
        openAlerts,
        pendingPrescriptions,
        activeConsults,
        todayShiftCount: todayShifts.length,
        todaySlotCount: todaySlots.length,
        settleableCents: income.settleableCents,
      },
      todayShifts: todayShifts.map((row) => ({
        id: row.id,
        startText: row.startText,
        endText: row.endText,
        totalQuota: row.totalQuota,
      })),
      todaySlots: todaySlots.map((row) => ({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        status: row.status,
        patientId: row.patientId,
      })),
    };
  }

  // ---------- 就诊人 / 档案 / 指标 ----------

  private patientScope(ctx: HealthStaffIdentity) {
    const p = ctx.practitioner;
    if (p.teamId > 0) {
      return {
        shopId: ctx.shopId,
        OR: [{ ownerPractitionerId: p.id }, { teamId: p.teamId }],
      };
    }
    return { shopId: ctx.shopId, ownerPractitionerId: p.id };
  }

  private async requirePatient(ctx: HealthStaffIdentity, patientId: unknown) {
    const id = intIn(patientId, 1, 2_000_000_000, 0);
    if (!id) throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择就诊人');
    const p = ctx.practitioner;
    const row = await this.prisma.healthPatient.findFirst({
      where: {
        id,
        shopId: ctx.shopId,
        ...(p.teamId > 0
          ? { OR: [{ ownerPractitionerId: p.id }, { teamId: p.teamId }] }
          : { ownerPractitionerId: p.id }),
      },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '就诊人不存在或不在你的管理范围内',
      );
    }
    return row;
  }

  async patients(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const keyword = clip(query.keyword, 40);
    const scope = this.patientScope(ctx);
    const where = keyword
      ? {
          AND: [
            scope,
            {
              OR: [
                { name: { contains: keyword } },
                { phone: { contains: keyword } },
              ],
            },
          ],
        }
      : scope;
    const [rows, total] = await Promise.all([
      this.prisma.healthPatient.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthPatient.count({ where }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        relation: row.relation,
        gender: row.gender,
        age: ageOf(row.birthday),
        phoneMasked: maskPhone(row.phone),
        bloodType: row.bloodType,
        remark: row.remark,
        updatedAt: toIso(row.updatedAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async patientDetail(
    ctx: HealthStaffIdentity,
    query: Record<string, unknown>,
  ) {
    const patient = await this.requirePatient(ctx, query.patientId);
    const [
      record,
      items,
      medicalEvents,
      tasks,
      prescriptions,
      logRows,
      metrics,
    ] = await Promise.all([
      this.prisma.healthRecord.findFirst({
        where: { shopId: ctx.shopId, patientId: patient.id },
      }),
      this.prisma.healthRecordItem.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthMedicalEvent.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: [{ occurAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      this.prisma.healthFollowupTask.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        take: 20,
      }),
      this.prisma.healthPrescription.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: { id: 'desc' },
        take: 10,
      }),
      this.prisma.healthMetricLog.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: { measuredAt: 'desc' },
        take: 60,
      }),
      this.prisma.healthMetric.findMany({
        where: { shopId: ctx.shopId, status: 'ON' },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const latest = new Map<number, (typeof logRows)[number]>();
    for (const log of logRows) {
      if (!latest.has(log.metricId)) latest.set(log.metricId, log);
    }
    return {
      patient: {
        id: patient.id,
        name: patient.name,
        relation: patient.relation,
        gender: patient.gender,
        birthday: patient.birthday,
        age: ageOf(patient.birthday),
        phoneMasked: maskPhone(patient.phone),
        bloodType: patient.bloodType,
        heightCm: Number(patient.heightCm),
        weightKg: Number(patient.weightKg),
        remark: patient.remark,
        idCardTail: patient.idCardTail,
        updatedAt: toIso(patient.updatedAt),
      },
      record: {
        basics: jsonObj<Record<string, unknown>>(record?.basicsJson, {}),
        completed: !!record?.completed,
        updatedAt: toIso(record?.updatedAt),
      },
      recordItems: items.map((row) => ({
        id: row.id,
        type: row.type,
        label: row.label,
        value: row.value,
        startAt: row.startAt,
        endAt: row.endAt,
      })),
      medicalEvents: medicalEvents.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        hospitalName: row.hospitalName,
        departmentName: row.departmentName,
        doctorName: row.doctorName,
        occurAt: toIso(row.occurAt),
        diagnosis: row.diagnosis,
      })),
      followups: tasks.map((row) => this.taskRow(row)),
      prescriptions: prescriptions.map((row) => ({
        id: row.id,
        rxNo: row.rxNo,
        diagnosis: row.diagnosis,
        totalCents: row.totalCents,
        status: row.status,
        createdAt: toIso(row.createdAt),
      })),
      metrics: metrics.map((metric) => {
        const log = latest.get(metric.id);
        return {
          id: metric.id,
          metricKey: metric.mKey,
          name: metric.name,
          unit: metric.unit,
          normalMin: Number(metric.normalMin),
          normalMax: Number(metric.normalMax),
          decimalScale: metric.decimalScale,
          latestValue: log ? Number(log.value) : null,
          latestAt: log ? toIso(log.measuredAt) : '',
          abnormal: log ? log.abnormal : false,
        };
      }),
    };
  }

  async metrics(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const patient = await this.requirePatient(ctx, query.patientId);
    const [metrics, logs] = await Promise.all([
      this.prisma.healthMetric.findMany({
        where: { shopId: ctx.shopId, status: 'ON' },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthMetricLog.findMany({
        where: { shopId: ctx.shopId, patientId: patient.id },
        orderBy: { measuredAt: 'desc' },
        take: 100,
      }),
    ]);
    const latest = new Map<number, (typeof logs)[number]>();
    for (const log of logs) {
      if (!latest.has(log.metricId)) latest.set(log.metricId, log);
    }
    return {
      patient: { id: patient.id, name: patient.name },
      list: metrics.map((metric) => {
        const log = latest.get(metric.id);
        return {
          id: metric.id,
          metricKey: metric.mKey,
          name: metric.name,
          unit: metric.unit,
          normalMin: Number(metric.normalMin),
          normalMax: Number(metric.normalMax),
          decimalScale: metric.decimalScale,
          latestValue: log ? Number(log.value) : null,
          latestAt: log ? toIso(log.measuredAt) : '',
          abnormal: log ? log.abnormal : false,
          source: log ? log.source : '',
        };
      }),
      logs: logs.slice(0, 30).map((row) => ({
        id: row.id,
        metricId: row.metricId,
        metricKey: row.metricKey,
        name: metrics.find((item) => item.id === row.metricId)?.name ?? '',
        value: Number(row.value),
        unit: metrics.find((item) => item.id === row.metricId)?.unit ?? '',
        measuredAt: toIso(row.measuredAt),
        abnormal: row.abnormal,
      })),
    };
  }

  async saveMetricLog(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const patient = await this.requirePatient(ctx, body.patientId);
    const metricId = intIn(body.metricId, 1, 2_000_000_000, 0);
    if (!metricId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择指标');
    const value = Number(body.value);
    if (!Number.isFinite(value)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写有效的指标读数',
      );
    }
    const log = await this.monitor.recordStaffLog({
      shopId: ctx.shopId,
      patientId: patient.id,
      metricId,
      value,
      measuredAt: strOf(body.measuredAt, 32) || new Date(),
      note: clip(body.note, 200),
      staffName: ctx.practitioner.name,
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.metric.log',
      `shop=${ctx.shopId} patient=${patient.id} metric=${metricId}`,
    );
    return log;
  }

  // ---------- 随访 ----------

  private taskRow(row: {
    id: number;
    patientId: number;
    title: string;
    way: string;
    content: string;
    dueAt: Date;
    status: string;
    source: string;
    resultSummary: string;
    doneAt: Date | null;
    createdAt: Date;
  }) {
    const overdue =
      row.status === 'PENDING' && row.dueAt.getTime() < Date.now();
    return {
      id: row.id,
      patientId: row.patientId,
      title: row.title,
      way: row.way,
      content: row.content,
      dueAt: toIso(row.dueAt),
      status: overdue ? 'OVERDUE' : row.status,
      source: row.source,
      resultSummary: row.resultSummary,
      doneAt: toIso(row.doneAt),
      createdAt: toIso(row.createdAt),
    };
  }

  private attachmentRows(value: unknown) {
    return jsonArr<unknown>(value)
      .map((item) => {
        if (typeof item === 'string') return { name: '', url: item };
        const row = (item && typeof item === 'object' ? item : {}) as {
          name?: unknown;
          url?: unknown;
        };
        return {
          name: typeof row.name === 'string' ? row.name : '',
          url: typeof row.url === 'string' ? row.url : '',
        };
      })
      .filter((item) => !!item.url);
  }

  private async patientNames(shopId: number, ids: number[]) {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.healthPatient.findMany({
      where: { shopId, id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async followups(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const status = strOf(query.status, 24, 'PENDING');
    const now = new Date();
    const where: Record<string, unknown> = {
      shopId: ctx.shopId,
      practitionerId: ctx.practitioner.id,
    };
    if (status === 'OVERDUE') {
      where.status = 'PENDING';
      where.dueAt = { lt: now };
    } else if (status && status !== 'all') {
      where.status = status;
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthFollowupTask.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthFollowupTask.count({ where }),
    ]);
    const names = await this.patientNames(
      ctx.shopId,
      rows.map((row) => row.patientId),
    );
    return {
      list: rows.map((row) => ({
        ...this.taskRow(row),
        patientName: names.get(row.patientId) ?? '',
      })),
      total,
      page,
      pageSize,
    };
  }

  async followupDetail(
    ctx: HealthStaffIdentity,
    query: Record<string, unknown>,
  ) {
    const id = intIn(query.id, 1, 2_000_000_000, 0);
    const row = await this.prisma.healthFollowupTask.findFirst({
      where: { id, shopId: ctx.shopId, practitionerId: ctx.practitioner.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '随访任务不存在或不属于你',
      );
    const [records, patient] = await Promise.all([
      this.prisma.healthFollowupRecord.findMany({
        where: { shopId: ctx.shopId, taskId: row.id },
        orderBy: { id: 'desc' },
      }),
      this.prisma.healthPatient.findFirst({
        where: { id: row.patientId, shopId: ctx.shopId },
        select: {
          id: true,
          name: true,
          gender: true,
          birthday: true,
          phone: true,
        },
      }),
    ]);
    return {
      task: {
        ...this.taskRow(row),
        patientName: patient?.name ?? '',
        patientAge: patient ? ageOf(patient.birthday) : 0,
        patientPhoneMasked: patient ? maskPhone(patient.phone) : '',
      },
      records: records.map((record) => {
        const files = jsonObj<Record<string, unknown>>(record.filesJson, {});
        return {
          id: record.id,
          result: record.result,
          note: record.note,
          metrics: jsonArr<Record<string, unknown>>(files.metrics),
          attachments: jsonArr<Record<string, unknown>>(files.attachments),
          operatorName: record.operatorName,
          createdAt: toIso(record.createdAt),
        };
      }),
    };
  }

  async saveFollowup(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const taskId = intIn(body.taskId, 1, 2_000_000_000, 0);
    const task = await this.prisma.healthFollowupTask.findFirst({
      where: {
        id: taskId,
        shopId: ctx.shopId,
        practitionerId: ctx.practitioner.id,
      },
    });
    if (!task)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '随访任务不存在或不属于你',
      );
    if (['DONE', 'CANCELED', 'SKIPPED'].includes(task.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该随访任务已结束，不能重复执行',
      );
    }
    const status = strOf(body.status, 16, 'DONE');
    if (!['DONE', 'SKIPPED', 'CANCELLED'].includes(status)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '随访结果不合法');
    }
    const conclusion = clip(body.conclusion, 500);
    const reason = clip(body.reason, 500);
    if (status === 'DONE' && !conclusion) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写随访结论');
    }
    if (status !== 'DONE' && !reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '跳过或取消随访需要填写原因',
      );
    }
    const metricSnapshots: {
      metricName: string;
      value: number;
      unit: string;
      measuredAt: string;
    }[] = [];
    for (const entry of jsonArr<Record<string, unknown>>(body.metrics)) {
      const metricId = intIn(entry.metricId, 1, 2_000_000_000, 0);
      const value = Number(entry.value);
      if (!metricId || !Number.isFinite(value)) continue;
      const log = await this.monitor.recordStaffLog({
        shopId: ctx.shopId,
        patientId: task.patientId,
        metricId,
        value,
        measuredAt: strOf(entry.measuredAt, 32) || new Date(),
        note: `随访#${task.id}`,
        staffName: ctx.practitioner.name,
      });
      metricSnapshots.push({
        metricName: log.metricName,
        value: log.value,
        unit: log.unit,
        measuredAt: log.measuredAt,
      });
    }
    const nextAt = status === 'DONE' ? parseDate(body.nextAt) : null;
    const attachments = jsonArr<Record<string, unknown>>(body.attachments)
      .map((item) => ({ name: clip(item.name, 60), url: clip(item.url, 500) }))
      .filter((item) => item.url);
    await this.prisma.healthFollowupRecord.create({
      data: {
        shopId: ctx.shopId,
        taskId: task.id,
        patientId: task.patientId,
        way: task.way,
        result: status,
        note: status === 'DONE' ? conclusion : reason,
        filesJson: { attachments, metrics: metricSnapshots },
        operatorUserId: `health-staff:${ctx.practitioner.id}`,
        operatorName: ctx.practitioner.name,
      },
    });
    const updated = await this.prisma.healthFollowupTask.update({
      where: { id: task.id },
      data: {
        status: status === 'CANCELLED' ? 'CANCELED' : status,
        doneAt: new Date(),
        resultSummary: clip(status === 'DONE' ? conclusion : reason, 500),
      },
    });
    if (nextAt && status === 'DONE') {
      await this.prisma.healthFollowupTask.create({
        data: {
          shopId: ctx.shopId,
          patientId: task.patientId,
          source: 'MANUAL',
          title: task.title,
          way: task.way,
          content: task.content,
          dueAt: nextAt,
          practitionerId: task.practitionerId,
          assigneeUserId: task.assigneeUserId,
          assigneeName: task.assigneeName,
          status: 'PENDING',
        },
      });
    }
    if (status === 'DONE' && task.patientPlanId > 0 && task.planStepId > 0) {
      const instance = await this.prisma.healthPatientPlan.findFirst({
        where: { id: task.patientPlanId, shopId: ctx.shopId },
        select: { id: true, progressJson: true },
      });
      if (instance) {
        const progress = jsonObj<Record<string, unknown>>(
          instance.progressJson,
          {},
        );
        const done = new Set(
          jsonArr<unknown>(progress.doneStepIds).map((id) => Number(id)),
        );
        done.add(task.planStepId);
        await this.prisma.healthPatientPlan.update({
          where: { id: instance.id },
          data: { progressJson: { ...progress, doneStepIds: [...done] } },
        });
      }
    }
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.followup.save',
      `shop=${ctx.shopId} task=${task.id} status=${status}`,
    );
    const names = await this.patientNames(ctx.shopId, [updated.patientId]);
    return {
      id: updated.id,
      patientId: updated.patientId,
      patientName: names.get(updated.patientId) ?? '',
      title: updated.title,
      way: updated.way,
      dueAt: toIso(updated.dueAt),
      status: updated.status,
      practitionerName: ctx.practitioner.name,
      content: updated.content,
      resultSummary: updated.resultSummary,
    };
  }

  // ---------- 问诊接单 ----------

  async consults(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const status = strOf(query.status, 24, 'WAIT_ACCEPT');
    const where: Record<string, unknown> = { shopId: ctx.shopId };
    if (status === 'ACTIVE') {
      where.status = {
        in: ['IN_SESSION', 'PRACTITIONER_REPLIED', 'CUSTOMER_DONE'],
      };
    } else if (status && status !== 'all') {
      where.status = status;
    }
    if (ctx.practitioner.role !== 'MANAGER') {
      where.practitionerId = ctx.practitioner.id;
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthConsult.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthConsult.count({ where }),
    ]);
    const names = await this.patientNames(
      ctx.shopId,
      rows.map((row) => row.patientId),
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        consultNo: row.consultNo,
        bizType: row.bizType,
        title: row.title,
        patientId: row.patientId,
        patientName: names.get(row.patientId) ?? '',
        practitionerName: row.practitionerName,
        status: row.status,
        symptomText: row.symptomText,
        attachments: this.attachmentRows(row.attachmentsJson),
        contactPhone: row.contactPhone,
        meetingUrl: row.meetingUrl,
        appointAt: toIso(row.appointAt),
        acceptedAt: toIso(row.acceptedAt),
        finishedAt: toIso(row.finishedAt),
        conclusion: row.conclusion,
        prescriptionId: row.prescriptionId,
        createdAt: toIso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async consultAction(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const id = intIn(body.id, 1, 2_000_000_000, 0);
    const action = strOf(body.action, 16).toUpperCase();
    const reason = clip(body.reason, 500);
    const row = await this.prisma.healthConsult.findFirst({
      where: { id, shopId: ctx.shopId },
    });
    if (
      !row ||
      (ctx.practitioner.role !== 'MANAGER' &&
        row.practitionerId !== ctx.practitioner.id)
    ) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '问诊单不存在或不属于你',
      );
    }
    if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(row.status)) {
      throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
    }
    if (row.status === 'PENDING_PAYMENT') {
      throw new BusinessException(ErrorCode.CONFLICT, '订单未支付，暂不能处理');
    }
    const now = new Date();
    let data: Record<string, unknown>;
    if (action === 'ACCEPT') {
      if (row.status !== 'WAIT_ACCEPT') {
        throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已被接诊');
      }
      data = {
        status: 'IN_SESSION',
        acceptedAt: row.acceptedAt ?? now,
        startedAt: row.startedAt ?? now,
        expiredAt:
          row.bizType === 'CONSULT_TEXT'
            ? new Date(now.getTime() + 48 * 3_600_000)
            : row.expiredAt,
      };
    } else if (action === 'FINISH') {
      if (!reason) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写问诊结论');
      }
      data = { status: 'COMPLETED', finishedAt: now, conclusion: reason };
    } else if (action === 'REJECT') {
      if (!reason) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '拒诊需要填写原因');
      }
      data = { status: 'CANCELLED', finishedAt: now, conclusion: reason };
    } else {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的接单操作');
    }
    const updated = await this.prisma.healthConsult.update({
      where: { id },
      data,
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.consult.action',
      `shop=${ctx.shopId} consult=${row.id} action=${action} status=${updated.status}`,
    );
    return {
      id: updated.id,
      status: updated.status,
      conclusion: updated.conclusion,
      acceptedAt: toIso(updated.acceptedAt),
      finishedAt: toIso(updated.finishedAt),
    };
  }

  // ---------- 处方复核 ----------

  async prescriptions(
    ctx: HealthStaffIdentity,
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, skip } = pager(query);
    const status = strOf(query.status, 24, 'all');
    const where: Record<string, unknown> = { shopId: ctx.shopId };
    if (status && status !== 'all') where.status = status;
    if (!REVIEW_ROLES.has(ctx.practitioner.role)) {
      where.doctorId = ctx.practitioner.id;
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthPrescription.findMany({
        where,
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthPrescription.count({ where }),
    ]);
    const patientIds = rows.map((row) => row.patientId);
    const names = await this.patientNames(ctx.shopId, patientIds);
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await this.prisma.healthPrescriptionItem.findMany({
          where: { shopId: ctx.shopId, prescriptionId: { in: ids } },
        })
      : [];
    const itemMap = new Map<number, typeof items>();
    for (const item of items) {
      const list = itemMap.get(item.prescriptionId) ?? [];
      list.push(item);
      itemMap.set(item.prescriptionId, list);
    }
    return {
      list: rows.map((row) => ({
        id: row.id,
        rxNo: row.rxNo,
        patientId: row.patientId,
        patientName: names.get(row.patientId) ?? '',
        doctorId: row.doctorId,
        doctorName: row.doctorName,
        diagnosis: row.diagnosis,
        note: row.note,
        totalCents: row.totalCents,
        status: row.status,
        reviewReason: row.reviewReason,
        createdAt: toIso(row.createdAt),
        items: (itemMap.get(row.id) ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          spec: item.spec,
          quantity: item.quantity,
          usageText: item.usageText,
          days: item.days,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async reviewPrescription(
    ctx: HealthStaffIdentity,
    body: Record<string, unknown>,
  ) {
    if (!REVIEW_ROLES.has(ctx.practitioner.role)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有药师或店长可以复核处方',
      );
    }
    const id = intIn(body.id, 1, 2_000_000_000, 0);
    const approved = body.approved === true;
    const reason = clip(body.reason, 200);
    if (!approved && !reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '驳回处方需要填写原因',
      );
    }
    const row = await this.prisma.healthPrescription.findFirst({
      where: { id, shopId: ctx.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '处方不存在');
    if (row.status !== 'SUBMITTED') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有待复核处方可以复核');
    }
    const updated = await this.prisma.healthPrescription.update({
      where: { id },
      data: {
        status: approved ? 'PHARMACY_APPROVED' : 'PHARMACY_REJECTED',
        pharmacistId: ctx.practitioner.id,
        pharmacistName: ctx.practitioner.name,
        reviewAt: new Date(),
        reviewReason: reason,
        expiresAt: approved ? new Date(Date.now() + 3 * 86400 * 1000) : null,
      },
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.prescription.review',
      `shop=${ctx.shopId} rx=${row.rxNo} result=${updated.status}`,
    );
    return {
      id: updated.id,
      rxNo: updated.rxNo,
      status: updated.status,
      reviewReason: updated.reviewReason,
    };
  }

  // ---------- 排班与号源 ----------

  async schedule(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const from = strOf(query.from, 10, today());
    const to = strOf(query.to, 10, shiftDate(13));
    const [shifts, slots] = await Promise.all([
      this.prisma.healthDoctorShift.findMany({
        where: {
          shopId: ctx.shopId,
          practitionerId: ctx.practitioner.id,
          workDate: { gte: from, lte: to },
          status: 'ON',
        },
        orderBy: [{ workDate: 'asc' }, { startText: 'asc' }],
      }),
      this.prisma.healthSlot.findMany({
        where: {
          shopId: ctx.shopId,
          practitionerId: ctx.practitioner.id,
          workDate: { gte: from, lte: to },
        },
        orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
      }),
    ]);
    const days = new Map<
      string,
      { date: string; shifts: typeof shifts; slots: typeof slots }
    >();
    for (let i = 0; i < 14; i += 1) {
      const date = shiftDate(i);
      if (date < from || date > to) continue;
      days.set(date, { date, shifts: [], slots: [] });
    }
    for (const shift of shifts) {
      const day = days.get(shift.workDate) ?? {
        date: shift.workDate,
        shifts: [],
        slots: [],
      };
      day.shifts.push(shift);
      days.set(shift.workDate, day);
    }
    for (const slot of slots) {
      const day = days.get(slot.workDate) ?? {
        date: slot.workDate,
        shifts: [],
        slots: [],
      };
      day.slots.push(slot);
      days.set(slot.workDate, day);
    }
    return {
      list: [...days.values()]
        .filter((day) => day.shifts.length || day.slots.length)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((day) => ({
          date: day.date,
          shifts: day.shifts.map((row) => ({
            id: row.id,
            startText: row.startText,
            endText: row.endText,
            totalQuota: row.totalQuota,
          })),
          slots: day.slots.map((row) => ({
            id: row.id,
            startTime: row.startTime,
            endTime: row.endTime,
            status: row.status,
            blockedReason: row.blockedReason,
            patientId: row.patientId,
            orderId: row.orderId,
          })),
        })),
    };
  }

  async blockSlot(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const id = intIn(body.slotId, 1, 2_000_000_000, 0);
    const row = await this.prisma.healthSlot.findFirst({
      where: { id, shopId: ctx.shopId, practitionerId: ctx.practitioner.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '号源不存在或不属于你');
    if (['BOOKED', 'LOCKED'].includes(row.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该号源已被占用，不能停诊',
      );
    }
    const blocked = body.blocked === true;
    const updated = await this.prisma.healthSlot.update({
      where: { id },
      data: {
        status: blocked ? 'BLOCKED' : 'AVAILABLE',
        blockedReason: blocked ? clip(body.reason, 100) || '医护停诊' : '',
      },
    });
    return {
      id: updated.id,
      status: updated.status,
      blockedReason: updated.blockedReason,
    };
  }

  // ---------- 核销 ----------

  async verify(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const code = strOf(body.code, 64).toUpperCase();
    if (!code)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请输入核销码');
    const record = await this.prisma.healthVerifyCode.findFirst({
      where: { code, shopId: ctx.shopId },
    });
    if (!record)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '核销码不存在，请核对后重试',
      );
    if (record.status !== 'UNUSED') {
      throw new BusinessException(ErrorCode.CONFLICT, '该核销码已使用');
    }
    const order = await this.prisma.healthOrder.findFirst({
      where: { id: record.orderId, shopId: ctx.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus !== 'PAID') {
      throw new BusinessException(ErrorCode.CONFLICT, '订单未支付，不能核销');
    }
    if (order.status === 'VERIFIED' || order.verifiedAt) {
      throw new BusinessException(ErrorCode.CONFLICT, '订单已核销');
    }
    let nextStatus: string;
    try {
      nextStatus = resolveTransition(
        'VERIFY',
        order.status as never,
        order.orderType,
      );
    } catch (error) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        error instanceof BusinessException ? error.message : '当前状态不可核销',
      );
    }
    if (order.slotId > 0) {
      const slot = await this.prisma.healthSlot.findFirst({
        where: { id: order.slotId, shopId: ctx.shopId },
        select: { practitionerId: true },
      });
      if (
        slot &&
        slot.practitionerId > 0 &&
        ctx.practitioner.role !== 'MANAGER' &&
        slot.practitionerId !== ctx.practitioner.id
      ) {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '该订单不属于你的号源',
        );
      }
    }
    if (order.consultId > 0) {
      const consult = await this.prisma.healthConsult.findFirst({
        where: { id: order.consultId, shopId: ctx.shopId },
        select: { practitionerId: true },
      });
      if (
        consult &&
        consult.practitionerId > 0 &&
        ctx.practitioner.role !== 'MANAGER' &&
        consult.practitionerId !== ctx.practitioner.id
      ) {
        throw new BusinessException(ErrorCode.FORBIDDEN, '该问诊单不属于你');
      }
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.healthVerifyCode.updateMany({
        where: { id: record.id, shopId: ctx.shopId, status: 'UNUSED' },
        data: {
          status: 'USED',
          verifyBy: `health-staff:${ctx.practitioner.id}`,
          verifyName: ctx.practitioner.name,
          verifiedAt: now,
        },
      });
      if (!used.count) {
        throw new BusinessException(ErrorCode.CONFLICT, '该核销码已使用');
      }
      await tx.healthOrder.update({
        where: { id: order.id },
        data: { status: nextStatus, verifiedAt: now },
      });
      await tx.healthOrderStatusLog.create({
        data: {
          shopId: ctx.shopId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          action: 'VERIFY',
          operatorType: 'STAFF',
          operatorName: ctx.practitioner.name,
          note: `医护核销 id=${ctx.practitioner.id}`,
        },
      });
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.verify',
      `shop=${ctx.shopId} order=${order.orderNo} code=${code}`,
    );
    return {
      orderNo: order.orderNo,
      orderType: order.orderType,
      payAmountCents: order.payAmountCents,
      verifiedAt: toIso(now),
      operatorName: ctx.practitioner.name,
    };
  }

  // ---------- 收益 / 银行卡 / 提现 ----------

  private async incomeSummary(ctx: HealthStaffIdentity) {
    const [shares, withdrawals] = await Promise.all([
      this.prisma.healthOrderShare.findMany({
        where: {
          shopId: ctx.shopId,
          earnerKind: 'PRACTITIONER',
          earnerId: ctx.practitioner.id,
          status: 'SETTLED',
        },
        select: { shareCents: true, settleableAt: true, orderId: true },
      }),
      this.prisma.healthWithdrawal.findMany({
        where: {
          shopId: ctx.shopId,
          earnerKind: 'PRACTITIONER',
          earnerId: ctx.practitioner.id,
        },
        select: { amountCents: true, status: true },
      }),
    ]);
    const now = Date.now();
    let totalCents = 0;
    let settleableCents = 0;
    const orderIds = new Set<number>();
    for (const share of shares) {
      totalCents += share.shareCents;
      orderIds.add(share.orderId);
      if (!share.settleableAt || share.settleableAt.getTime() <= now) {
        settleableCents += share.shareCents;
      }
    }
    let withdrawingCents = 0;
    let withdrawnCents = 0;
    for (const row of withdrawals) {
      if (['PENDING', 'APPROVED', 'FAILED'].includes(row.status))
        withdrawingCents += row.amountCents;
      else if (row.status === 'PAID') withdrawnCents += row.amountCents;
    }
    return {
      totalCents,
      settleableCents: Math.max(
        0,
        settleableCents - withdrawingCents - withdrawnCents,
      ),
      withdrawingCents,
      withdrawnCents,
      pendingCents: Math.max(0, totalCents - settleableCents),
      orderCount: orderIds.size,
    };
  }

  async income(ctx: HealthStaffIdentity) {
    const summary = await this.incomeSummary(ctx);
    const shares = await this.prisma.healthOrderShare.findMany({
      where: {
        shopId: ctx.shopId,
        earnerKind: 'PRACTITIONER',
        earnerId: ctx.practitioner.id,
        status: 'SETTLED',
      },
      orderBy: { id: 'desc' },
      take: 20,
    });
    const orderIds = [
      ...new Set(shares.map((row) => row.orderId).filter((id) => id > 0)),
    ];
    const orders = orderIds.length
      ? await this.prisma.healthOrder.findMany({
          where: { shopId: ctx.shopId, id: { in: orderIds } },
          select: { id: true, orderNo: true, orderType: true, createdAt: true },
        })
      : [];
    const orderMap = new Map(orders.map((row) => [row.id, row]));
    const cards = await this.prisma.healthBankCard.findMany({
      where: {
        shopId: ctx.shopId,
        holderType: 'PRACTITIONER',
        holderId: ctx.practitioner.id,
        status: 'ON',
      },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    const withdrawals = await this.prisma.healthWithdrawal.findMany({
      where: {
        shopId: ctx.shopId,
        earnerKind: 'PRACTITIONER',
        earnerId: ctx.practitioner.id,
      },
      orderBy: { id: 'desc' },
      take: 20,
    });
    return {
      summary,
      shares: shares.map((row) => {
        const order = orderMap.get(row.orderId);
        return {
          id: row.id,
          orderNo: order?.orderNo ?? '',
          orderType: order?.orderType ?? '',
          baseCents: row.baseCents,
          ratePercent: row.ratePercent,
          shareCents: row.shareCents,
          settleableAt: toIso(row.settleableAt),
          createdAt: toIso(row.createdAt),
        };
      }),
      bankCards: cards.map((row) => ({
        id: row.id,
        accountName: row.accountName,
        bankName: row.bankName,
        branchName: row.branchName,
        cardTail: row.cardNoTail,
        isDefault: row.isDefault,
      })),
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        no: row.no,
        amountCents: row.amountCents,
        taxCents: row.taxCents,
        realCents: row.realCents,
        status: row.status,
        auditNote: row.auditNote,
        createdAt: toIso(row.createdAt),
        paidAt: toIso(row.paidAt),
      })),
    };
  }

  async saveBankCard(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const accountName = clip(body.accountName, 60);
    const bankName = clip(body.bankName, 60);
    const cardNo = strOf(body.cardNo, 64).replace(/\s+/g, '');
    if (!accountName)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写开户人姓名');
    if (!bankName)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写开户银行');
    if (!/^\d{12,24}$/.test(cardNo)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写完整的银行卡号',
      );
    }
    const isDefault = body.isDefault === true;
    const row = await this.prisma.healthBankCard.create({
      data: {
        shopId: ctx.shopId,
        holderType: 'PRACTITIONER',
        holderId: ctx.practitioner.id,
        accountName,
        bankName,
        branchName: clip(body.branchName, 80),
        cardNoCipher: this.crypto.encrypt(`bank:${ctx.shopId}`, cardNo),
        cardNoTail: cardNo.slice(-4),
        phone: clip(body.phone, 32),
        isDefault,
        status: 'ON',
      },
    });
    if (isDefault) {
      await this.prisma.healthBankCard.updateMany({
        where: {
          shopId: ctx.shopId,
          holderType: 'PRACTITIONER',
          holderId: ctx.practitioner.id,
          id: { not: row.id },
        },
        data: { isDefault: false },
      });
    }
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.bank.save',
      `shop=${ctx.shopId} card=${row.id}`,
    );
    return {
      id: row.id,
      accountName: row.accountName,
      bankName: row.bankName,
      branchName: row.branchName,
      cardTail: row.cardNoTail,
      isDefault: row.isDefault,
    };
  }

  async applyWithdrawal(
    ctx: HealthStaffIdentity,
    body: Record<string, unknown>,
  ) {
    const amountCents = intIn(body.amountCents, 0, 10_000_000_00, 0);
    if (amountCents <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写提现金额');
    }
    const summary = await this.incomeSummary(ctx);
    if (amountCents > summary.settleableCents) {
      throw new BusinessException(ErrorCode.CONFLICT, '可提现金额不足');
    }
    const cardId = intIn(body.bankCardId, 0, 2_000_000_000, 0);
    if (!cardId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择收款银行卡');
    const card = await this.prisma.healthBankCard.findFirst({
      where: {
        id: cardId,
        shopId: ctx.shopId,
        holderType: 'PRACTITIONER',
        holderId: ctx.practitioner.id,
        status: 'ON',
      },
    });
    if (!card)
      throw new BusinessException(ErrorCode.NOT_FOUND, '收款银行卡不存在');
    const row = await this.prisma.healthWithdrawal.create({
      data: {
        shopId: ctx.shopId,
        no: makeNo('HW'),
        earnerKind: 'PRACTITIONER',
        earnerId: ctx.practitioner.id,
        earnerName: ctx.practitioner.name,
        amountCents,
        taxCents: 0,
        realCents: amountCents,
        bankCardId: card.id,
        payChannel: 'BANK',
        status: 'PENDING',
      },
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.withdraw.apply',
      `shop=${ctx.shopId} withdrawal=${row.no} amount=${amountCents}`,
    );
    return {
      id: row.id,
      no: row.no,
      amountCents: row.amountCents,
      realCents: row.realCents,
      status: row.status,
      bankLabel: `${card.bankName} 尾号${card.cardNoTail}`,
      createdAt: toIso(row.createdAt),
    };
  }

  // ---------- 科普投稿 ----------

  async articles(ctx: HealthStaffIdentity, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const status = strOf(query.status, 24, 'all');
    const where: Record<string, unknown> = {
      shopId: ctx.shopId,
      authorKind: 'PRACTITIONER',
      authorId: ctx.practitioner.id,
    };
    if (status && status !== 'all') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthArticle.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthArticle.count({ where }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        summary: row.summary,
        coverImage: row.coverImage,
        status: row.status,
        auditStatus: row.auditStatus,
        auditReason: row.auditReason,
        viewCount: row.viewCount,
        likeCount: row.likeCount,
        publishedAt: toIso(row.publishedAt),
        createdAt: toIso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async articleDetail(
    ctx: HealthStaffIdentity,
    query: Record<string, unknown>,
  ) {
    const id = intIn(query.id, 1, 2_000_000_000, 0);
    const row = await this.prisma.healthArticle.findFirst({
      where: {
        id,
        shopId: ctx.shopId,
        authorKind: 'PRACTITIONER',
        authorId: ctx.practitioner.id,
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在或不属于你');
    return {
      id: row.id,
      categoryId: row.categoryId,
      title: row.title,
      kind: row.kind,
      coverImage: row.coverImage,
      mediaUrl: row.mediaUrl,
      summary: row.summary,
      contentHtml: row.contentHtml,
      tags: jsonArr<string>(row.tagsJson),
      visibility: row.visibility,
      crowdKinds: jsonArr<string>(row.crowdKindsJson),
      status: row.status,
      auditStatus: row.auditStatus,
      auditReason: row.auditReason,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      publishedAt: toIso(row.publishedAt),
      createdAt: toIso(row.createdAt),
    };
  }

  async saveArticle(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    const id = intIn(body.id, 0, 2_000_000_000, 0);
    const title = clip(body.title, 120);
    const kind = strOf(body.kind, 12, 'ARTICLE');
    const contentHtml = strOf(body.contentHtml, 60000);
    const mediaUrl = clip(body.mediaUrl, 1000);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写标题');
    if (!['ARTICLE', 'VIDEO', 'AUDIO', 'LIVE'].includes(kind)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '内容类型不合法');
    }
    if (kind === 'ARTICLE' && !contentHtml.trim()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写文章正文');
    }
    if (kind !== 'ARTICLE' && !mediaUrl) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写媒体地址');
    }
    const data = {
      categoryId: intIn(body.categoryId, 0, 2_000_000_000, 0),
      title,
      kind,
      coverImage: clip(body.coverImage, 500),
      mediaUrl,
      summary: clip(body.summary, 300),
      contentHtml,
      tagsJson: jsonArr<string>(body.tags)
        .map((tag) => clip(tag, 20))
        .filter(Boolean)
        .slice(0, 8),
      visibility: ['PUBLIC', 'MEMBER', 'CROWD', 'SIGNED'].includes(
        String(body.visibility),
      )
        ? String(body.visibility)
        : 'PUBLIC',
      crowdKindsJson: jsonArr<string>(body.crowdKinds).slice(0, 8),
      authorKind: 'PRACTITIONER',
      authorId: ctx.practitioner.id,
      authorName: ctx.practitioner.name,
      auditStatus: 'PENDING',
      auditReason: '',
      status: 'ON',
      publishedAt: new Date(),
    };
    let articleId = id;
    if (id > 0) {
      const row = await this.prisma.healthArticle.findFirst({
        where: {
          id,
          shopId: ctx.shopId,
          authorKind: 'PRACTITIONER',
          authorId: ctx.practitioner.id,
        },
      });
      if (!row)
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          '文章不存在或不属于你',
        );
      await this.prisma.healthArticle.update({ where: { id }, data });
    } else {
      const row = await this.prisma.healthArticle.create({
        data: { ...data, shopId: ctx.shopId },
      });
      articleId = row.id;
    }
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.article.save',
      `shop=${ctx.shopId} article=${articleId}`,
    );
    return {
      id: articleId,
      auditStatus: 'PENDING',
      message: '已提交，等待店主审核后展示',
    };
  }

  async offlineArticle(
    ctx: HealthStaffIdentity,
    body: Record<string, unknown>,
  ) {
    const id = intIn(body.id, 1, 2_000_000_000, 0);
    const row = await this.prisma.healthArticle.findFirst({
      where: {
        id,
        shopId: ctx.shopId,
        authorKind: 'PRACTITIONER',
        authorId: ctx.practitioner.id,
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在或不属于你');
    await this.prisma.healthArticle.update({
      where: { id },
      data: { status: 'OFF' },
    });
    return { ok: true, message: '已下线' };
  }

  // ---------- AI 医护（只引用 AI客服的纯AI客服员工） ----------

  /** 本店所属主账号 + AI 医护总开关：健康域只有这两个「AI 相关」的可写状态。 */
  private async aiShopOf(shopId: number) {
    const shop = await this.prisma.healthShop.findFirst({
      where: { id: shopId },
      select: { id: true, ownerUserId: true, aiStaffEnabled: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已关闭');
    }
    return shop;
  }

  /** 该账号的 AI 客服员工清单（钩子来自 AI客服板块）；拿不到就按「还没有员工」处理。 */
  private async aiAgentsOf(ownerUserId: string): Promise<HealthAiAgentRef[]> {
    if (!this.aiAgentList) return [];
    const rows = await this.aiAgentList(ownerUserId);
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      mode: row.mode,
      status: row.status,
      statusLabel: row.statusLabel,
    }));
  }

  private requireAiManager(ctx: HealthStaffIdentity): void {
    if (ctx.practitioner.role !== 'MANAGER') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅本店管理员可设置 AI 医护',
      );
    }
  }

  /**
   * AI 医护状态：开关 + 我自己绑的是哪位 AI 客服。
   * 管理员（role=MANAGER）额外拿到本店在岗医护的绑定清单，便于在小程序里直接绑人。
   */
  async aiStatus(ctx: HealthStaffIdentity) {
    const shop = await this.aiShopOf(ctx.shopId);
    const agents = await this.aiAgentsOf(shop.ownerUserId);
    const canManage = ctx.practitioner.role === 'MANAGER';
    const mine = agents.find(
      (item) => item.id === ctx.practitioner.deskAiAgentId,
    );
    const rows = canManage
      ? await this.prisma.healthPractitioner.findMany({
          where: {
            shopId: ctx.shopId,
            auditStatus: 'APPROVED',
            status: 'ON',
          },
          orderBy: { id: 'asc' },
          select: { id: true, name: true, role: true, deskAiAgentId: true },
        })
      : [];
    return {
      enabled: shop.aiStaffEnabled,
      agentId: ctx.practitioner.deskAiAgentId,
      agentName: mine?.name || '',
      mode: mine?.mode || '',
      canManage,
      practitioners: rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        agentId: row.deskAiAgentId,
        agentName:
          agents.find((item) => item.id === row.deskAiAgentId)?.name || '',
      })),
    };
  }

  /** 可选的 AI 客服员工：只出在岗的，字段与 AI客服板块一致，健康域不再加工。 */
  async aiAgents(ctx: HealthStaffIdentity) {
    const shop = await this.aiShopOf(ctx.shopId);
    const agents = await this.aiAgentsOf(shop.ownerUserId);
    return agents
      .filter((item) => item.status === 'ON')
      .map((item) => ({
        id: item.id,
        name: item.name,
        mode: item.mode,
        statusLabel: item.statusLabel,
      }));
  }

  /**
   * 医护向绑定的 AI 客服提问：开关、绑定齐了才放行，答案原样透传。
   * 钩子没装配或 AI客服侧报错都如实抛出，绝不返回占位答案——医护会照着回复顾客。
   */
  async aiAsk(
    ctx: HealthStaffIdentity,
    body: Record<string, unknown>,
  ): Promise<HealthStaffAiAnswer> {
    const shop = await this.aiShopOf(ctx.shopId);
    if (!shop.aiStaffEnabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        'AI 医护未开启，请联系本店管理员在店铺设置里开启',
      );
    }
    const agentId = ctx.practitioner.deskAiAgentId;
    if (!agentId) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '请先绑定 AI 客服：在 AI 医护页面选择一位 AI 客服员工后即可提问',
      );
    }
    const question = clip(body.question, 2000);
    if (!question) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写要提问的内容');
    }
    if (!this.aiAnswer) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        'AI 医护暂不可用，请稍后再试或自行解答',
      );
    }
    const result = await this.aiAnswer({
      ownerUserId: shop.ownerUserId,
      agentId,
      question,
      history: asAiHistory(body.history),
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.ai.ask',
      `shop=${ctx.shopId} practitioner=${ctx.practitioner.id} agent=${agentId} question=${question.length}`,
    );
    return {
      agentName: result.agentName,
      answer: result.answer,
      references: result.references,
      handoff: result.handoff === true,
    };
  }

  /** 开关归店铺：只有管理员能开合，落库条件带 shopId。 */
  async aiEnabledSave(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    this.requireAiManager(ctx);
    const enabled = body.enabled === true;
    const shop = await this.aiShopOf(ctx.shopId);
    await this.prisma.healthShop.updateMany({
      where: { id: shop.id },
      data: { aiStaffEnabled: enabled },
    });
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.ai.enabled',
      `shop=${ctx.shopId} enabled=${enabled}`,
    );
    return {
      enabled,
      message: enabled ? 'AI 医护已开启' : 'AI 医护已关闭',
    };
  }

  /**
   * 医护 ↔ AI 客服员工的绑定：agentId=0 即解除。
   * 绑之前先确认这位 AI 客服属于本店所属主账号且在岗，避免顾客问到一半没人接。
   */
  async aiBindingSave(ctx: HealthStaffIdentity, body: Record<string, unknown>) {
    this.requireAiManager(ctx);
    const shop = await this.aiShopOf(ctx.shopId);
    const practitionerId = intIn(body.practitionerId, 1, 2_000_000_000, 0);
    if (!practitionerId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要设置的医护');
    }
    const agentId = intIn(body.agentId, 0, 2_000_000_000, 0);
    let agentName = '';
    if (agentId > 0) {
      const agent = (await this.aiAgentsOf(shop.ownerUserId)).find(
        (item) => item.id === agentId,
      );
      if (!agent) {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          '要绑定的 AI 客服不存在，或不属于本店所属账号',
        );
      }
      if (agent.status !== 'ON') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${agent.name}」当前已停用，请先在 AI客服 → 团队 里启用`,
        );
      }
      agentName = agent.name;
    }
    const updated = await this.prisma.healthPractitioner.updateMany({
      where: { id: practitionerId, shopId: ctx.shopId },
      data: { deskAiAgentId: agentId },
    });
    if (!updated.count) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该医护不存在或不属于本店',
      );
    }
    await audit(
      this.prisma,
      `health-staff:${ctx.practitioner.id}`,
      'health.staff.ai.binding',
      `shop=${ctx.shopId} target=${practitionerId} agent=${agentId}`,
    );
    return {
      practitionerId,
      agentId,
      agentName,
      message: agentId ? `已绑定 ${agentName}` : '已解除绑定',
    };
  }
}
