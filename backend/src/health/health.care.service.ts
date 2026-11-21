import { safeText } from '../common/safe-text';
import {
  HEALTH_MEDICATION_FREQUENCY_LABELS,
  HEALTH_PLAN_STEP_TYPE_LABELS,
  type HealthFollowupRecordSaveBody,
  type HealthFollowupRecordRow,
  type HealthFollowupTaskCreateBody,
  type HealthFollowupTaskRow,
  type HealthMedicationEffectRow,
  type HealthMedicationLogRow,
  type HealthMedicationRow,
  type HealthMedicationSaveBody,
  type HealthPatientPlanRow,
  type HealthPatientPlanStartBody,
  type HealthPlanRow,
  type HealthPlanStepType,
  type HealthPlanSaveBody,
  type HealthPrescriptionReviewBody,
  type HealthPrescriptionRow,
  type HealthPrescriptionSaveBody,
  type HealthSurveyAnswerRow,
  type HealthSurveyDetail,
  type HealthSurveyRow,
  type HealthSurveySaveBody,
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
  makeNo,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';
import type { HealthMonitorService } from './health.monitor.service';

const PLAN_STEP_TO_DB: Record<string, string> = {
  METRIC: 'METRIC',
  FOLLOWUP: 'FOLLOWUP',
  MEDICATION: 'MEDICATION',
  SURVEY: 'SURVEY',
  REVIEW_VISIT: 'TASK',
  ARTICLE: 'EDUCATION',
};
const PLAN_STEP_FROM_DB: Record<string, string> = {
  METRIC: 'METRIC',
  FOLLOWUP: 'FOLLOWUP',
  MEDICATION: 'MEDICATION',
  SURVEY: 'SURVEY',
  TASK: 'REVIEW_VISIT',
  EDUCATION: 'ARTICLE',
};

type PlanStepView = {
  id: number;
  type: HealthPlanStepType;
  name: string;
  dayOffset: number;
  repeatEveryDays: number;
  refId: number;
  refName: string;
  required: boolean;
};

const FOLLOWUP_WAYS = new Set(['PHONE', 'TEXT', 'OUTPATIENT', 'SELF_FILL']);
const FOLLOWUP_STATUSES = new Set([
  'PENDING',
  'DONE',
  'SKIPPED',
  'OVERDUE',
  'CANCELLED',
]);

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

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

const pickFilter = (value: unknown): string => {
  const text = strOf(value, 32, 'all');
  return text === 'all' ? '' : text;
};

const dateOf = (text: string): Date | null => {
  const value = safeText(text).trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T09:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dayText = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const timeText = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

/** 任务显示态：PENDING 过计划时间即视为逾期（存储值保持不变，不改历史）。 */
const taskStatusOf = (
  row: { status: string; dueAt: Date },
  now = Date.now(),
): HealthFollowupTaskRow['status'] => {
  if (row.status === 'CANCELED') return 'CANCELLED';
  if (row.status === 'PENDING' && row.dueAt.getTime() < now) return 'OVERDUE';
  return (
    FOLLOWUP_STATUSES.has(row.status) ? row.status : 'PENDING'
  ) as HealthFollowupTaskRow['status'];
};

/**
 * 慢病管理方案、随访、量表、用药与处方（C5）。
 *
 * 口径：
 * 1. 方案启动是「实例 + 未来 30 天任务」：`health_followup_tasks` 一次性物化到
 *    `min(计划结束, 今天+30天)`，之后的滚动生成由定时器复用同一生成函数。
 * 2. 随访完成时补录的指标读数走 `HealthMonitorService.recordStaffLog`，
 *    与手工录入共用异常判定与预警触发，不另写一套。
 * 3. 沟通内容不落库（一律走 AI客服会话），随访记录只留结论、指标快照与附件。
 * 4. 量表答案以 `answersJson = { filledBy, items[] }` 自描述存储，题目改名不丢历史。
 */
export class HealthCareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: HealthMonitorService,
  ) {}

  // ---------- 管理方案 ----------

  private async planStepsOf(
    shopId: number,
    planIds: number[],
  ): Promise<Map<number, PlanStepView[]>> {
    if (!planIds.length) return new Map<number, PlanStepView[]>();
    const steps = await this.prisma.healthPlanStep.findMany({
      where: { shopId, planId: { in: planIds } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const metricIds = steps
      .filter((step) => step.type === 'METRIC')
      .map((step) => Number(step.refKey) || 0)
      .filter((id) => id > 0);
    const surveyIds = steps
      .filter((step) => step.type === 'SURVEY')
      .map((step) => Number(step.refKey) || 0)
      .filter((id) => id > 0);
    const drugIds = steps
      .filter((step) => step.type === 'MEDICATION')
      .map((step) => Number(step.refKey) || 0)
      .filter((id) => id > 0);
    const [metrics, surveys, drugs] = await Promise.all([
      metricIds.length
        ? this.prisma.healthMetric.findMany({
            where: { shopId, id: { in: metricIds } },
            select: { id: true, name: true },
          })
        : [],
      surveyIds.length
        ? this.prisma.healthSurvey.findMany({
            where: { shopId, id: { in: surveyIds } },
            select: { id: true, title: true },
          })
        : [],
      drugIds.length
        ? this.prisma.healthDrug.findMany({
            where: { shopId, id: { in: drugIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const refNameMap = new Map<string, string>([
      ...metrics.map(
        (row) => [`METRIC:${row.id}`, row.name] as [string, string],
      ),
      ...surveys.map(
        (row) => [`SURVEY:${row.id}`, row.title] as [string, string],
      ),
      ...drugs.map(
        (row) => [`MEDICATION:${row.id}`, row.name] as [string, string],
      ),
    ]);
    const grouped = new Map<number, typeof steps>();
    for (const step of steps) {
      const list = grouped.get(step.planId) ?? [];
      list.push(step);
      grouped.set(step.planId, list);
    }
    const resolved = new Map<number, PlanStepView[]>();
    for (const [planId, list] of grouped) {
      resolved.set(
        planId,
        list.map((step) => {
          const config = jsonObj<Record<string, unknown>>(step.configJson, {});
          const refId = Number(step.refKey) || 0;
          const type = (PLAN_STEP_FROM_DB[step.type] ??
            'FOLLOWUP') as HealthPlanStepType;
          const explicitRepeat = Number(config.repeatEveryDays ?? 0);
          return {
            id: step.id,
            type,
            name: step.name,
            dayOffset: step.startOffsetDay + 1,
            repeatEveryDays:
              Number.isFinite(explicitRepeat) && explicitRepeat > 0
                ? explicitRepeat
                : step.cycleValue > 1
                  ? step.cycleValue
                  : 0,
            refId,
            refName:
              refNameMap.get(`${step.type}:${refId}`) ??
              strOf(config.refName, 80),
            required: step.required,
          };
        }),
      );
    }
    return resolved;
  }

  private async planRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      crowdKind: string;
      durationDays: number;
      desc: string;
      status: string;
      createdAt: Date;
    }[],
  ): Promise<HealthPlanRow[]> {
    if (!rows.length) return [];
    const stepMap = await this.planStepsOf(
      shopId,
      rows.map((row) => row.id),
    );
    const running = await this.prisma.healthPatientPlan.groupBy({
      by: ['planId'],
      where: {
        shopId,
        planId: { in: rows.map((row) => row.id) },
        status: 'RUNNING',
      },
      _count: { _all: true },
    });
    const runningMap = new Map(
      running.map((row) => [row.planId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      crowdKind: row.crowdKind as HealthPlanRow['crowdKind'],
      cycleDays: row.durationDays,
      desc: row.desc,
      steps: stepMap.get(row.id) ?? [],
      runningCount: runningMap.get(row.id) ?? 0,
      status: row.status === 'ON' ? 'ON' : 'OFF',
      createdAt: toIso(row.createdAt),
    }));
  }

  async plans(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword, status } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'plan');
    const crowdKind = pickFilter(query.crowdKind);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (status === 'ON' || status === 'OFF') where.status = status;
    if (crowdKind) where.crowdKind = crowdKind;
    if (keyword)
      where.OR = [
        { name: { contains: keyword } },
        { desc: { contains: keyword } },
      ];
    const [rows, total] = await Promise.all([
      this.prisma.healthPlan.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthPlan.count({ where }),
    ]);
    return {
      list: await this.planRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async planDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPlanRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'plan');
    const row = await this.prisma.healthPlan.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '管理方案不存在');
    const [mapped] = await this.planRows(ctx.shop.id, [row]);
    return mapped;
  }

  async planSave(
    user: CurrentUser,
    body: HealthPlanSaveBody,
  ): Promise<HealthPlanRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'plan');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthPlan.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '管理方案不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      crowdKind: body.crowdKind,
      desc: clip(body.desc, 500),
      durationDays: body.cycleDays,
      status: body.status,
      createdBy: user.userId,
    };
    const row = existing
      ? await this.prisma.healthPlan.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthPlan.create({ data });
    await this.prisma.$transaction([
      this.prisma.healthPlanStep.deleteMany({
        where: { shopId: ctx.shop.id, planId: row.id },
      }),
      ...(body.steps.length
        ? [
            this.prisma.healthPlanStep.createMany({
              data: body.steps.map((step, index) => ({
                shopId: ctx.shop.id,
                planId: row.id,
                type: PLAN_STEP_TO_DB[step.type] ?? 'FOLLOWUP',
                name: step.name,
                refKey: step.refId > 0 ? String(step.refId) : '',
                cycleUnit: 'DAY',
                cycleValue: step.repeatEveryDays > 0 ? step.repeatEveryDays : 1,
                startOffsetDay: Math.max(0, step.dayOffset - 1),
                required: step.required,
                configJson: { repeatEveryDays: step.repeatEveryDays },
                sort: index,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.plan.update' : 'health.plan.create',
      `shop=${ctx.shop.id} plan=${row.id} steps=${body.steps.length}`,
    );
    const [mapped] = await this.planRows(ctx.shop.id, [row]);
    return mapped;
  }

  async planRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'plan');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPlan.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '管理方案不存在');
    const running = await this.prisma.healthPatientPlan.count({
      where: { shopId: ctx.shop.id, planId: row.id, status: 'RUNNING' },
    });
    if (running > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该方案仍在被执行，不能删除，请先停用或结束患者实例',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthPlanStep.deleteMany({
        where: { shopId: ctx.shop.id, planId: row.id },
      }),
      this.prisma.healthPlan.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.plan.remove',
      `shop=${ctx.shop.id} plan=${row.id}`,
    );
    return { ok: true, message: '管理方案已删除' };
  }

  // ---------- 方案执行实例 ----------

  private async patientPlanRows(
    shopId: number,
    rows: {
      id: number;
      planId: number;
      patientId: number;
      practitionerId: number;
      startAt: Date;
      endAt: Date | null;
      status: string;
      progressJson: unknown;
      createdAt: Date;
    }[],
  ): Promise<HealthPatientPlanRow[]> {
    if (!rows.length) return [];
    const planIds = [...new Set(rows.map((row) => row.planId))];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const [plans, patients, practitioners, stepTotals] = await Promise.all([
      this.prisma.healthPlan.findMany({
        where: { shopId, id: { in: planIds } },
        select: { id: true, name: true },
      }),
      this.prisma.healthPatient.findMany({
        where: { shopId, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthPlanStep.groupBy({
        by: ['planId'],
        where: { shopId, planId: { in: planIds } },
        _count: { _all: true },
      }),
    ]);
    const planMap = new Map(plans.map((row) => [row.id, row.name]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const practitionerMap = new Map(
      practitioners.map((row) => [row.id, row.name]),
    );
    const totalMap = new Map(
      stepTotals.map((row) => [row.planId, row._count._all]),
    );
    return rows.map((row) => {
      const progress = jsonObj<Record<string, unknown>>(row.progressJson, {});
      const done = jsonArr<unknown>(progress.doneStepIds).length;
      const total = totalMap.get(row.planId) ?? 0;
      return {
        id: row.id,
        planId: row.planId,
        planName: planMap.get(row.planId) ?? '',
        patientId: row.patientId,
        patientName: patientMap.get(row.patientId) ?? '',
        practitionerId: row.practitionerId,
        practitionerName: practitionerMap.get(row.practitionerId) ?? '',
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        status: row.status,
        stepDoneCount: done,
        stepTotalCount: total,
        progressPercent:
          total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async patientPlans(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'plan');
    const planId = intIn(query.planId, 0, 2_000_000_000, 0);
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const planStatus = pickFilter(query.planStatus);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (planId > 0) where.planId = planId;
    if (patientId > 0) where.patientId = patientId;
    if (planStatus) where.status = planStatus;
    const [rows, total] = await Promise.all([
      this.prisma.healthPatientPlan.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPatientPlan.count({ where }),
    ]);
    return {
      list: await this.patientPlanRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async patientPlanStart(user: CurrentUser, body: HealthPatientPlanStartBody) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'plan');
    await requireShopWritable(ctx);
    const plan = await this.prisma.healthPlan.findFirst({
      where: { id: body.planId, shopId: ctx.shop.id },
    });
    if (!plan)
      throw new BusinessException(ErrorCode.NOT_FOUND, '管理方案不存在');
    if (plan.status !== 'ON') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '方案已停用，不能启动',
      );
    }
    const steps =
      (await this.planStepsOf(ctx.shop.id, [plan.id])).get(plan.id) ?? [];
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: ctx.shop.id, id: { in: body.patientIds } },
      select: { id: true, customerId: true, ownerPractitionerId: true },
    });
    if (patients.length !== new Set(body.patientIds).size) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '部分就诊人不存在或不属于本店',
      );
    }
    const startAt = dateOf(body.startAt) ?? new Date();
    const cycleDays = body.cycleDays > 0 ? body.cycleDays : plan.durationDays;
    const endAt = addDays(startAt, cycleDays);
    const existing = await this.prisma.healthPatientPlan.findMany({
      where: {
        shopId: ctx.shop.id,
        planId: plan.id,
        patientId: { in: body.patientIds },
        status: 'RUNNING',
      },
      select: { patientId: true },
    });
    const running = new Set(existing.map((row) => row.patientId));
    let started = 0;
    let skipped = 0;
    let tasks = 0;
    for (const patient of patients) {
      if (running.has(patient.id)) {
        skipped += 1;
        continue;
      }
      const practitionerId =
        body.practitionerId > 0
          ? body.practitionerId
          : patient.ownerPractitionerId;
      const instance = await this.prisma.healthPatientPlan.create({
        data: {
          shopId: ctx.shop.id,
          planId: plan.id,
          patientId: patient.id,
          customerId: patient.customerId,
          practitionerId,
          startAt,
          endAt,
          status: 'RUNNING',
          progressJson: {},
        },
      });
      tasks += await this.materializeTasks(
        ctx.shop.id,
        instance.id,
        plan,
        steps,
        practitionerId,
      );
      started += 1;
    }
    await audit(
      this.prisma,
      user.userId,
      'health.patientPlan.start',
      `shop=${ctx.shop.id} plan=${plan.id} started=${started} skipped=${skipped} tasks=${tasks}`,
    );
    return {
      started,
      skipped,
      message:
        skipped > 0
          ? `已启动 ${started} 人，${skipped} 人已有执行中的同方案实例已跳过；生成随访任务 ${tasks} 条`
          : `已启动 ${started} 人，生成随访任务 ${tasks} 条`,
    };
  }

  /**
   * 由方案步骤物化随访任务：未来 30 天（或计划余期）内按周期展开，
   * 同一步骤同一到期时刻不重复建任务；返回新建条数。
   */
  private async materializeTasks(
    shopId: number,
    patientPlanId: number,
    plan: { id: number; name: string },
    steps: PlanStepView[],
    practitionerId: number,
  ): Promise<number> {
    if (!steps.length) return 0;
    const instance = await this.prisma.healthPatientPlan.findFirst({
      where: { id: patientPlanId, shopId },
      select: { patientId: true, startAt: true, endAt: true },
    });
    if (!instance) return 0;
    const stepRows = await this.prisma.healthPlanStep.findMany({
      where: {
        shopId,
        planId: plan.id,
        id: { in: steps.map((step) => step.id) },
      },
      select: { id: true, instruction: true },
    });
    const instructionMap = new Map(
      stepRows.map((row) => [row.id, row.instruction]),
    );
    const practitioner = practitionerId
      ? await this.prisma.healthPractitioner.findFirst({
          where: { id: practitionerId, shopId },
          select: { name: true, userId: true },
        })
      : null;
    const now = Date.now();
    const horizon = Math.min(
      instance.endAt ? instance.endAt.getTime() : now + 30 * 86_400_000,
      now + 30 * 86_400_000,
    );
    const existing = await this.prisma.healthFollowupTask.findMany({
      where: { shopId, patientPlanId },
      select: { planStepId: true, dueAt: true },
    });
    const seen = new Set(
      existing.map((row) => `${row.planStepId}:${row.dueAt.getTime()}`),
    );
    const data: {
      shopId: number;
      patientId: number;
      planStepId: number;
      patientPlanId: number;
      source: string;
      title: string;
      way: string;
      content: string;
      dueAt: Date;
      practitionerId: number;
      assigneeUserId: string;
      assigneeName: string;
      status: string;
    }[] = [];
    for (const step of steps) {
      const first = addDays(instance.startAt, Math.max(0, step.dayOffset - 1));
      first.setHours(9, 0, 0, 0);
      const stepUntil = instance.endAt ? instance.endAt.getTime() : horizon;
      const limit = Math.min(stepUntil, horizon);
      let due = first;
      let guard = 0;
      while (due.getTime() <= limit && guard < 400 && data.length < 500) {
        const key = `${step.id}:${due.getTime()}`;
        if (!seen.has(key) && due.getTime() >= now - 86_400_000) {
          seen.add(key);
          data.push({
            shopId,
            patientId: instance.patientId,
            planStepId: step.id,
            patientPlanId,
            source: 'PLAN',
            title:
              step.name ||
              `${plan.name}·${HEALTH_PLAN_STEP_TYPE_LABELS[step.type] ?? '随访'}`,
            way:
              step.type === 'FOLLOWUP' || step.type === 'REVIEW_VISIT'
                ? 'PHONE'
                : 'SELF_FILL',
            content: instructionMap.get(step.id) ?? '',
            dueAt: new Date(due),
            practitionerId,
            assigneeUserId: practitioner?.userId ?? '',
            assigneeName: practitioner?.name ?? '',
            status: 'PENDING',
          });
        }
        guard += 1;
        if (step.repeatEveryDays <= 0) break;
        due = addDays(due, step.repeatEveryDays);
      }
    }
    if (data.length) await this.prisma.healthFollowupTask.createMany({ data });
    return data.length;
  }

  async patientPlanStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string; reason: string },
  ): Promise<HealthPatientPlanRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'plan');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPatientPlan.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '方案实例不存在');
    const progress = jsonObj<Record<string, unknown>>(row.progressJson, {});
    const updated = await this.prisma.healthPatientPlan.update({
      where: { id: row.id },
      data: {
        status: body.status,
        endAt:
          body.status === 'DONE' || body.status === 'DROPPED'
            ? (row.endAt ?? new Date())
            : row.endAt,
        progressJson: { ...progress, reason: clip(body.reason, 200) },
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.patientPlan.status',
      `shop=${ctx.shop.id} instance=${row.id} status=${body.status}`,
    );
    const [mapped] = await this.patientPlanRows(ctx.shop.id, [updated]);
    return mapped;
  }

  // ---------- 随访 ----------

  private async followupRows(
    shopId: number,
    rows: {
      id: number;
      patientId: number;
      patientPlanId: number;
      source: string;
      title: string;
      way: string;
      content: string;
      dueAt: Date;
      practitionerId: number;
      assigneeName: string;
      status: string;
      doneAt: Date | null;
      createdAt: Date;
    }[],
  ): Promise<HealthFollowupTaskRow[]> {
    if (!rows.length) return [];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const instanceIds = [
      ...new Set(rows.map((row) => row.patientPlanId).filter((id) => id > 0)),
    ];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const [patients, instances, practitioners, members] = await Promise.all([
      this.prisma.healthPatient.findMany({
        where: { shopId, id: { in: patientIds } },
        select: { id: true, name: true, customerId: true },
      }),
      instanceIds.length
        ? this.prisma.healthPatientPlan.findMany({
            where: { shopId, id: { in: instanceIds } },
            select: { id: true, planId: true },
          })
        : [],
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthCrowdMember.findMany({
        where: { shopId, patientId: { in: patientIds } },
        select: { patientId: true, groupId: true },
      }),
    ]);
    const planIds = [...new Set(instances.map((row) => row.planId))];
    const plans = planIds.length
      ? await this.prisma.healthPlan.findMany({
          where: { shopId, id: { in: planIds } },
          select: { id: true, name: true },
        })
      : [];
    const groupIds = [...new Set(members.map((row) => row.groupId))];
    const groups = groupIds.length
      ? await this.prisma.healthCrowdGroup.findMany({
          where: { shopId, id: { in: groupIds } },
          select: { id: true, name: true },
        })
      : [];
    const patientMap = new Map(patients.map((row) => [row.id, row]));
    const instanceMap = new Map(instances.map((row) => [row.id, row.planId]));
    const planMap = new Map(plans.map((row) => [row.id, row.name]));
    const practitionerMap = new Map(
      practitioners.map((row) => [row.id, row.name]),
    );
    const groupNameMap = new Map(groups.map((row) => [row.id, row.name]));
    const crowdByPatient = new Map<number, number[]>();
    for (const member of members) {
      const list = crowdByPatient.get(member.patientId) ?? [];
      list.push(member.groupId);
      crowdByPatient.set(member.patientId, list);
    }
    const now = Date.now();
    return rows.map((row) => {
      const status = taskStatusOf(row, now);
      const patient = patientMap.get(row.patientId);
      const planId = row.patientPlanId
        ? (instanceMap.get(row.patientPlanId) ?? 0)
        : 0;
      return {
        id: row.id,
        patientId: row.patientId,
        patientName: patient?.name ?? '',
        customerId: patient?.customerId ?? 0,
        planId,
        planName: planId ? (planMap.get(planId) ?? '') : '',
        source:
          row.source === 'MANUAL' || row.source === 'SURVEY'
            ? row.source
            : 'PLAN',
        way: (FOLLOWUP_WAYS.has(row.way)
          ? row.way
          : 'PHONE') as HealthFollowupTaskRow['way'],
        title: row.title,
        content: row.content,
        planAt: toIso(row.dueAt),
        status,
        practitionerId: row.practitionerId,
        practitionerName:
          practitionerMap.get(row.practitionerId) ?? row.assigneeName,
        crowdNames: (crowdByPatient.get(row.patientId) ?? [])
          .map((id) => groupNameMap.get(id) ?? '')
          .filter(Boolean),
        doneAt: toIso(row.doneAt),
        overdueHours:
          status === 'OVERDUE'
            ? Math.max(0, Math.floor((now - row.dueAt.getTime()) / 3_600_000))
            : 0,
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async followupTasks(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'followup');
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const practitionerId = intIn(query.practitionerId, 0, 2_000_000_000, 0);
    const taskStatus = pickFilter(query.taskStatus);
    const way = pickFilter(query.way);
    const from = dateOf(strOf(query.from, 32));
    const to = dateOf(strOf(query.to, 32));
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (practitionerId > 0) where.practitionerId = practitionerId;
    if (way && FOLLOWUP_WAYS.has(way)) where.way = way;
    if (keyword) where.title = { contains: keyword };
    if (taskStatus === 'OVERDUE') {
      where.status = 'PENDING';
      where.dueAt = { lt: new Date() };
    } else if (taskStatus && taskStatus !== 'PENDING') {
      where.status = taskStatus === 'CANCELLED' ? 'CANCELED' : taskStatus;
    }
    if (from || to) {
      where.dueAt = {
        ...(where.dueAt as Record<string, unknown> | undefined),
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
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
    return {
      list: await this.followupRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async followupDetail(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'followup');
    const row = await this.prisma.healthFollowupTask.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '随访任务不存在');
    const records = await this.prisma.healthFollowupRecord.findMany({
      where: { shopId: ctx.shop.id, taskId: row.id },
      orderBy: { id: 'desc' },
    });
    const [task] = await this.followupRows(ctx.shop.id, [row]);
    const mapped: HealthFollowupRecordRow[] = records.map((record) => ({
      id: record.id,
      taskId: record.taskId,
      patientId: record.patientId,
      patientName: task.patientName,
      practitionerName: record.operatorName,
      conclusion: record.note,
      metrics: jsonArr<{
        metricName?: unknown;
        value?: unknown;
        unit?: unknown;
        measuredAt?: unknown;
      }>(jsonObj<Record<string, unknown>>(record.filesJson, {}).metrics).map(
        (item) => ({
          metricName: safeText(item.metricName),
          value: numOf(item.value),
          unit: safeText(item.unit),
          measuredAt: safeText(item.measuredAt),
        }),
      ),
      attachments: jsonArr<{ name?: unknown; url?: unknown }>(
        jsonObj<Record<string, unknown>>(record.filesJson, {}).attachments,
      )
        .map((item) => ({
          name: safeText(item.name),
          url: safeText(item.url),
        }))
        .filter((item) => item.url),
      nextAt: '',
      createdAt: toIso(record.createdAt),
    }));
    return { task, records: mapped };
  }

  private async requirePractitioner(shopId: number, practitionerId: number) {
    const row = await this.prisma.healthPractitioner.findFirst({
      where: { id: practitionerId, shopId },
      select: { id: true, name: true, userId: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '责任医护不存在');
    return row;
  }

  async followupCreate(user: CurrentUser, body: HealthFollowupTaskCreateBody) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'followup');
    await requireShopWritable(ctx);
    const dueAt = dateOf(body.planAt);
    if (!dueAt)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写随访计划时间');
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: ctx.shop.id, id: { in: body.patientIds } },
      select: { id: true, ownerPractitionerId: true },
    });
    if (patients.length !== new Set(body.patientIds).size) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '部分就诊人不存在或不属于本店',
      );
    }
    if (body.practitionerId > 0) {
      await this.requirePractitioner(ctx.shop.id, body.practitionerId);
    }
    const data = new Map<
      number,
      { practitionerId: number; assigneeUserId: string; assigneeName: string }
    >();
    for (const patient of patients) {
      const practitionerId =
        body.practitionerId > 0
          ? body.practitionerId
          : patient.ownerPractitionerId;
      const practitioner = practitionerId
        ? await this.requirePractitioner(ctx.shop.id, practitionerId).catch(
            () => null,
          )
        : null;
      data.set(patient.id, {
        practitionerId: practitioner?.id ?? 0,
        assigneeUserId: practitioner?.userId ?? '',
        assigneeName: practitioner?.name ?? '',
      });
    }
    await this.prisma.healthFollowupTask.createMany({
      data: patients.map((patient) => ({
        shopId: ctx.shop.id,
        patientId: patient.id,
        source: 'MANUAL',
        title: body.title || '随访提醒',
        way: body.way,
        content: body.content,
        dueAt,
        practitionerId: data.get(patient.id)?.practitionerId ?? 0,
        assigneeUserId: data.get(patient.id)?.assigneeUserId ?? '',
        assigneeName: data.get(patient.id)?.assigneeName ?? '',
        status: 'PENDING',
      })),
    });
    await audit(
      this.prisma,
      user.userId,
      'health.followup.create',
      `shop=${ctx.shop.id} patients=${patients.length} due=${dayText(dueAt)}`,
    );
    return {
      created: patients.length,
      message: `已为 ${patients.length} 位就诊人创建随访任务`,
    };
  }

  async followupSave(
    user: CurrentUser,
    body: HealthFollowupRecordSaveBody,
  ): Promise<HealthFollowupTaskRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'followup');
    await requireShopWritable(ctx);
    const task = await this.prisma.healthFollowupTask.findFirst({
      where: { id: body.taskId, shopId: ctx.shop.id },
    });
    if (!task)
      throw new BusinessException(ErrorCode.NOT_FOUND, '随访任务不存在');
    if (
      task.status === 'DONE' ||
      task.status === 'CANCELED' ||
      task.status === 'SKIPPED'
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该随访任务已结束，不能重复执行',
      );
    }
    if (body.status === 'SKIPPED' && !body.reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '跳过随访需要填写原因',
      );
    }
    const metricSnapshots: {
      metricName: string;
      value: number;
      unit: string;
      measuredAt: string;
    }[] = [];
    for (const entry of body.metrics) {
      const log = await this.monitor.recordStaffLog({
        shopId: ctx.shop.id,
        patientId: task.patientId,
        metricId: entry.metricId,
        value: entry.value,
        measuredAt: entry.measuredAt || new Date(),
        note: `随访#${task.id}`,
        staffName: user.username ?? '',
      });
      metricSnapshots.push({
        metricName: log.metricName,
        value: log.value,
        unit: log.unit,
        measuredAt: log.measuredAt,
      });
    }
    const result = body.status;
    await this.prisma.healthFollowupRecord.create({
      data: {
        shopId: ctx.shop.id,
        taskId: task.id,
        patientId: task.patientId,
        way: task.way,
        result,
        note: body.status === 'DONE' ? body.conclusion : body.reason,
        filesJson: { attachments: body.attachments, metrics: metricSnapshots },
        operatorUserId: user.userId,
        operatorName: user.username ?? '',
      },
    });
    const nextAt = body.status !== 'DONE' ? null : dateOf(body.nextAt);
    const updated = await this.prisma.healthFollowupTask.update({
      where: { id: task.id },
      data: {
        status: result === 'CANCELLED' ? 'CANCELED' : result,
        doneAt: new Date(),
        resultSummary: clip(
          body.status === 'DONE' ? body.conclusion : body.reason,
          500,
        ),
      },
    });
    if (nextAt && body.status === 'DONE') {
      await this.prisma.healthFollowupTask.create({
        data: {
          shopId: ctx.shop.id,
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
    if (
      body.status === 'DONE' &&
      task.patientPlanId > 0 &&
      task.planStepId > 0
    ) {
      const instance = await this.prisma.healthPatientPlan.findFirst({
        where: { id: task.patientPlanId, shopId: ctx.shop.id },
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
      user.userId,
      'health.followup.save',
      `shop=${ctx.shop.id} task=${task.id} status=${result}`,
    );
    const [mapped] = await this.followupRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async followupAssign(
    user: CurrentUser,
    body: { shopId: number; taskIds: number[]; practitionerId: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'followup');
    await requireShopWritable(ctx);
    const practitioner = await this.requirePractitioner(
      ctx.shop.id,
      body.practitionerId,
    );
    const ids = [...new Set(body.taskIds)];
    const count = await this.prisma.healthFollowupTask.count({
      where: { shopId: ctx.shop.id, id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '部分随访任务不存在');
    }
    await this.prisma.healthFollowupTask.updateMany({
      where: { shopId: ctx.shop.id, id: { in: ids } },
      data: {
        practitionerId: practitioner.id,
        assigneeUserId: practitioner.userId,
        assigneeName: practitioner.name,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.followup.assign',
      `shop=${ctx.shop.id} tasks=${ids.length} practitioner=${practitioner.id}`,
    );
    return {
      ok: true,
      message: `已把 ${ids.length} 条随访指派给 ${practitioner.name}`,
    };
  }

  async followupRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'followup');
    await requireShopWritable(ctx);
    const task = await this.prisma.healthFollowupTask.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!task)
      throw new BusinessException(ErrorCode.NOT_FOUND, '随访任务不存在');
    await this.prisma.$transaction([
      this.prisma.healthFollowupRecord.deleteMany({
        where: { shopId: ctx.shop.id, taskId: task.id },
      }),
      this.prisma.healthFollowupTask.delete({ where: { id: task.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.followup.remove',
      `shop=${ctx.shop.id} task=${task.id}`,
    );
    return { ok: true, message: '随访任务已删除' };
  }

  // ---------- 量表 ----------

  private surveyRow(
    row: {
      id: number;
      title: string;
      desc: string;
      scoreRuleJson: unknown;
      status: string;
      updatedAt: Date;
    },
    questionCount: number,
    answerCount: number,
  ): HealthSurveyRow {
    const config = jsonObj<Record<string, unknown>>(row.scoreRuleJson, {});
    return {
      id: row.id,
      title: row.title,
      desc: row.desc,
      crowdKind: strOf(
        config.crowdKind,
        24,
        'ALL',
      ) as HealthSurveyRow['crowdKind'],
      questionCount,
      riskBands: jsonArr<Record<string, unknown>>(config.riskBands).map(
        (band) => ({
          minScore: numOf(band.minScore),
          maxScore: numOf(band.maxScore),
          level: safeText(band.level),
          advice: safeText(band.advice),
        }),
      ),
      auditStatus: strOf(
        config.auditStatus,
        16,
        'APPROVED',
      ) as HealthSurveyRow['auditStatus'],
      status: row.status === 'ON' ? 'ON' : 'OFF',
      answerCount,
      updatedAt: toIso(row.updatedAt),
    };
  }

  async surveys(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword, status } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'survey');
    const crowdKind = pickFilter(query.crowdKind);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (status === 'ON' || status === 'OFF') where.status = status;
    if (keyword) where.title = { contains: keyword };
    const rows = await this.prisma.healthSurvey.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 1000,
    });
    const filtered = crowdKind
      ? rows.filter(
          (row) =>
            strOf(
              jsonObj<Record<string, unknown>>(row.scoreRuleJson, {}).crowdKind,
              24,
              'ALL',
            ) === crowdKind,
        )
      : rows;
    const limited = filtered.slice(skip, skip + pageSize);
    const ids = limited.map((row) => row.id);
    const [questionCounts, answerCounts] = ids.length
      ? await Promise.all([
          this.prisma.healthSurveyQuestion.groupBy({
            by: ['surveyId'],
            where: { shopId: ctx.shop.id, surveyId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.healthSurveyAnswer.groupBy({
            by: ['surveyId'],
            where: { shopId: ctx.shop.id, surveyId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const questionMap = new Map(
      questionCounts.map((row) => [row.surveyId, row._count._all]),
    );
    const answerMap = new Map(
      answerCounts.map((row) => [row.surveyId, row._count._all]),
    );
    return {
      list: limited.map((row) =>
        this.surveyRow(
          row,
          questionMap.get(row.id) ?? 0,
          answerMap.get(row.id) ?? 0,
        ),
      ),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  private async surveyDetailOf(
    shopId: number,
    surveyId: number,
  ): Promise<HealthSurveyDetail> {
    const row = await this.prisma.healthSurvey.findFirst({
      where: { id: surveyId, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '量表不存在');
    const [questions, questionCount, answerCount] = await Promise.all([
      this.prisma.healthSurveyQuestion.findMany({
        where: { shopId, surveyId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthSurveyQuestion.count({ where: { shopId, surveyId } }),
      this.prisma.healthSurveyAnswer.count({ where: { shopId, surveyId } }),
    ]);
    return {
      survey: this.surveyRow(row, questionCount, answerCount),
      questions: questions.map((question) => ({
        id: question.id,
        title: question.title,
        type: (['SINGLE', 'MULTI', 'NUMBER', 'TEXT'].includes(question.type)
          ? question.type
          : 'SINGLE') as HealthSurveyDetail['questions'][number]['type'],
        required: question.required,
        sort: question.sort,
        options: jsonArr<{ label?: unknown; score?: unknown }>(
          question.optionsJson,
        ).map((option) => ({
          label: safeText(option.label),
          score: numOf(option.score),
        })),
        unit: '',
      })),
    };
  }

  async surveyDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthSurveyDetail> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'survey');
    return this.surveyDetailOf(
      ctx.shop.id,
      intIn(query.id, 1, 2_000_000_000, 0),
    );
  }

  async surveySave(
    user: CurrentUser,
    body: HealthSurveySaveBody,
  ): Promise<HealthSurveyRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'survey');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthSurvey.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '量表不存在');
    }
    const config = {
      crowdKind: body.crowdKind,
      riskBands: body.riskBands,
      auditStatus: strOf(
        jsonObj<Record<string, unknown>>(existing?.scoreRuleJson, {})
          .auditStatus,
        16,
        'APPROVED',
      ),
    };
    const data = {
      shopId: ctx.shop.id,
      title: body.title,
      desc: clip(body.desc, 500),
      kind: 'ASSESSMENT',
      scoreRuleJson: config,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthSurvey.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthSurvey.create({ data });
    await this.prisma.$transaction([
      this.prisma.healthSurveyQuestion.deleteMany({
        where: { shopId: ctx.shop.id, surveyId: row.id },
      }),
      ...(body.questions.length
        ? [
            this.prisma.healthSurveyQuestion.createMany({
              data: body.questions.map((question, index) => ({
                shopId: ctx.shop.id,
                surveyId: row.id,
                type: question.type,
                title: question.title,
                optionsJson: question.options,
                required: question.required,
                sort: question.sort || index,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.survey.update' : 'health.survey.create',
      `shop=${ctx.shop.id} survey=${row.id} questions=${body.questions.length}`,
    );
    const [questionCount, answerCount] = await Promise.all([
      this.prisma.healthSurveyQuestion.count({
        where: { shopId: ctx.shop.id, surveyId: row.id },
      }),
      this.prisma.healthSurveyAnswer.count({
        where: { shopId: ctx.shop.id, surveyId: row.id },
      }),
    ]);
    return this.surveyRow(row, questionCount, answerCount);
  }

  async surveyRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'survey');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthSurvey.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '量表不存在');
    const answers = await this.prisma.healthSurveyAnswer.count({
      where: { shopId: ctx.shop.id, surveyId: row.id },
    });
    if (answers > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该量表已有填写记录，不能删除，请改为停用',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthSurveyQuestion.deleteMany({
        where: { shopId: ctx.shop.id, surveyId: row.id },
      }),
      this.prisma.healthSurvey.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.survey.remove',
      `shop=${ctx.shop.id} survey=${row.id}`,
    );
    return { ok: true, message: '量表已删除' };
  }

  async surveyAnswers(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'survey');
    const surveyId = intIn(query.surveyId, 0, 2_000_000_000, 0);
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (surveyId > 0) where.surveyId = surveyId;
    if (patientId > 0) where.patientId = patientId;
    const [rows, total] = await Promise.all([
      this.prisma.healthSurveyAnswer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthSurveyAnswer.count({ where }),
    ]);
    if (!rows.length) return emptyPage<HealthSurveyAnswerRow>(page, pageSize);
    const surveyIds = [...new Set(rows.map((row) => row.surveyId))];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const [surveys, patients] = await Promise.all([
      this.prisma.healthSurvey.findMany({
        where: { shopId: ctx.shop.id, id: { in: surveyIds } },
        select: { id: true, title: true },
      }),
      this.prisma.healthPatient.findMany({
        where: { shopId: ctx.shop.id, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
    ]);
    const surveyMap = new Map(surveys.map((row) => [row.id, row.title]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    return {
      list: rows.map((row) => {
        const raw = jsonObj<Record<string, unknown>>(row.answersJson, {});
        const items = Array.isArray(row.answersJson)
          ? jsonArr<Record<string, unknown>>(row.answersJson)
          : jsonArr<Record<string, unknown>>(raw.items);
        return {
          id: row.id,
          surveyId: row.surveyId,
          surveyTitle: surveyMap.get(row.surveyId) ?? '',
          patientId: row.patientId,
          patientName: patientMap.get(row.patientId) ?? '',
          score: round2(numOf(row.score)),
          riskLevel: row.levelLabel,
          answers: items.map((item) => ({
            questionTitle: safeText(item.questionTitle),
            labels: jsonArr<unknown>(item.labels).map((label) => String(label)),
            numberValue: numOf(item.numberValue),
            textValue: safeText(item.textValue),
          })),
          filledBy: strOf(raw.filledBy, 60, '顾客自填'),
          createdAt: toIso(row.submittedAt),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // ---------- 用药 ----------

  private frequencyLabel(frequency: string): string {
    if (HEALTH_MEDICATION_FREQUENCY_LABELS[frequency]) {
      return HEALTH_MEDICATION_FREQUENCY_LABELS[frequency];
    }
    return frequency === 'CUSTOM' ? '自定义' : frequency;
  }

  private async medicationRows(
    shopId: number,
    rows: {
      id: number;
      patientId: number;
      drugId: number;
      name: string;
      spec: string;
      doseText: string;
      way: string;
      frequency: string;
      timesJson: unknown;
      startAt: string;
      endAt: string;
      prescriptionId: number;
      remark: string;
      status: string;
      createdAt: Date;
    }[],
  ): Promise<HealthMedicationRow[]> {
    if (!rows.length) return [];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const [patients, logCounts] = await Promise.all([
      this.prisma.healthPatient.findMany({
        where: { shopId, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
      this.prisma.healthMedicationLog.groupBy({
        by: ['medicationId'],
        where: { shopId, medicationId: { in: rows.map((row) => row.id) } },
        _count: { _all: true },
      }),
    ]);
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const logMap = new Map(
      logCounts.map((row) => [row.medicationId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      patientName: patientMap.get(row.patientId) ?? '',
      drugName: row.name,
      drugId: row.drugId,
      spec: row.spec,
      doseText: row.doseText,
      way: (['ORAL', 'INJECTION', 'TOPICAL', 'INHALATION', 'OTHER'].includes(
        row.way,
      )
        ? row.way
        : 'ORAL') as HealthMedicationRow['way'],
      frequency: (row.frequency === 'CUSTOM'
        ? 'OTHER'
        : row.frequency) as HealthMedicationRow['frequency'],
      frequencyText: this.frequencyLabel(row.frequency),
      startAt: row.startAt,
      stopAt: row.endAt,
      remindTimes: jsonArr<unknown>(row.timesJson)
        .map((item) => String(item))
        .filter(Boolean),
      prescriptionId: row.prescriptionId,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      note: row.remark,
      logCount: logMap.get(row.id) ?? 0,
      createdAt: toIso(row.createdAt),
    }));
  }

  async medications(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword, status } = pager(query);
    const ctx = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'medication',
    );
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (status === 'ON' || status === 'OFF') where.status = status;
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthMedication.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthMedication.count({ where }),
    ]);
    return {
      list: await this.medicationRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async medicationSave(
    user: CurrentUser,
    body: HealthMedicationSaveBody,
  ): Promise<HealthMedicationRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'medication');
    await requireShopWritable(ctx);
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: body.patientId, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '就诊人不存在');
    const existing =
      body.id > 0
        ? await this.prisma.healthMedication.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药记录不存在');
    }
    let name = body.drugName;
    let spec = body.spec;
    if (body.drugId > 0) {
      const drug = await this.prisma.healthDrug.findFirst({
        where: { id: body.drugId, shopId: ctx.shop.id },
        select: { name: true, spec: true },
      });
      if (!drug)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '药品不存在');
      name = name || drug.name;
      spec = spec || drug.spec;
    }
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写药品名称');
    if (body.prescriptionId > 0) {
      const rx = await this.prisma.healthPrescription.findFirst({
        where: { id: body.prescriptionId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!rx)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '关联处方不存在');
    }
    const remindTimes = body.remindTimes
      .map((item) => clip(item, 8))
      .filter((item) => /^\d{1,2}:\d{2}$/.test(item))
      .slice(0, 12);
    const data = {
      shopId: ctx.shop.id,
      patientId: body.patientId,
      drugId: body.drugId,
      name,
      spec,
      way: body.way,
      doseText: body.doseText,
      frequency: body.frequency,
      timesJson: remindTimes,
      startAt: body.startAt,
      endAt: body.stopAt,
      prescriptionId: body.prescriptionId,
      remark: body.note,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthMedication.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthMedication.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.medication.update' : 'health.medication.create',
      `shop=${ctx.shop.id} medication=${row.id} patient=${row.patientId}`,
    );
    const [mapped] = await this.medicationRows(ctx.shop.id, [row]);
    return mapped;
  }

  async medicationStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ): Promise<HealthMedicationRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'medication');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMedication.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药记录不存在');
    const updated = await this.prisma.healthMedication.update({
      where: { id: row.id },
      data: { status: body.status === 'OFF' ? 'OFF' : 'ON' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.medication.status',
      `shop=${ctx.shop.id} medication=${row.id} status=${updated.status}`,
    );
    const [mapped] = await this.medicationRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async medicationRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'medication');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMedication.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药记录不存在');
    await this.prisma.$transaction([
      this.prisma.healthMedicationLog.deleteMany({
        where: { shopId: ctx.shop.id, medicationId: row.id },
      }),
      this.prisma.healthMedicationEffect.deleteMany({
        where: { shopId: ctx.shop.id, medicationId: row.id },
      }),
      this.prisma.healthMedication.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.medication.remove',
      `shop=${ctx.shop.id} medication=${row.id}`,
    );
    return { ok: true, message: '用药记录已删除' };
  }

  async medicationLogs(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'medication',
    );
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const medicationId = intIn(query.medicationId, 0, 2_000_000_000, 0);
    const from = clip(query.from, 10);
    const to = clip(query.to, 10);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (medicationId > 0) where.medicationId = medicationId;
    if (from || to) {
      where.planDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthMedicationLog.findMany({
        where,
        orderBy: [{ planDate: 'desc' }, { planTime: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthMedicationLog.count({ where }),
    ]);
    if (!rows.length) return emptyPage<HealthMedicationLogRow>(page, pageSize);
    const medicationIds = [...new Set(rows.map((row) => row.medicationId))];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const [medications, patients] = await Promise.all([
      this.prisma.healthMedication.findMany({
        where: { shopId: ctx.shop.id, id: { in: medicationIds } },
        select: { id: true, name: true },
      }),
      this.prisma.healthPatient.findMany({
        where: { shopId: ctx.shop.id, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
    ]);
    const medicationMap = new Map(medications.map((row) => [row.id, row.name]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    return {
      list: rows.map((row) => ({
        id: row.id,
        medicationId: row.medicationId,
        patientId: row.patientId,
        patientName: patientMap.get(row.patientId) ?? '',
        drugName: medicationMap.get(row.medicationId) ?? '',
        planAt: `${row.planDate} ${row.planTime}`.trim(),
        takenAt: toIso(row.takenAt),
        result: row.status,
        note: row.remark,
        createdAt: toIso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async medicationLogSave(
    user: CurrentUser,
    body: {
      shopId: number;
      medicationId: number;
      planAt: string;
      result: string;
      note: string;
    },
  ): Promise<HealthMedicationLogRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'medication');
    await requireShopWritable(ctx);
    const medication = await this.prisma.healthMedication.findFirst({
      where: { id: body.medicationId, shopId: ctx.shop.id },
      select: { id: true, name: true, patientId: true },
    });
    if (!medication)
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药记录不存在');
    const planned = dateOf(body.planAt) ?? new Date();
    const planDate = dayText(planned);
    const planTime = timeText(planned);
    const status = ['TAKEN', 'MISSED', 'REFUSED'].includes(body.result)
      ? body.result
      : 'TAKEN';
    const row = await this.prisma.healthMedicationLog.upsert({
      where: {
        medicationId_planDate_planTime: {
          medicationId: medication.id,
          planDate,
          planTime,
        },
      },
      create: {
        shopId: ctx.shop.id,
        medicationId: medication.id,
        patientId: medication.patientId,
        planDate,
        planTime,
        status,
        takenAt: status === 'TAKEN' ? new Date() : null,
        remark: body.note,
      },
      update: {
        status,
        takenAt: status === 'TAKEN' ? new Date() : null,
        remark: body.note,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.medicationLog.save',
      `shop=${ctx.shop.id} medication=${medication.id} ${planDate} ${planTime} ${status}`,
    );
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: row.patientId, shopId: ctx.shop.id },
      select: { name: true },
    });
    return {
      id: row.id,
      medicationId: row.medicationId,
      patientId: row.patientId,
      patientName: patient?.name ?? '',
      drugName: medication.name,
      planAt: `${row.planDate} ${row.planTime}`.trim(),
      takenAt: toIso(row.takenAt),
      result: row.status,
      note: row.remark,
      createdAt: toIso(row.createdAt),
    };
  }

  async medicationEffects(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'medication',
    );
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const medicationId = intIn(query.medicationId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (medicationId > 0) where.medicationId = medicationId;
    const [rows, total] = await Promise.all([
      this.prisma.healthMedicationEffect.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthMedicationEffect.count({ where }),
    ]);
    if (!rows.length)
      return emptyPage<HealthMedicationEffectRow>(page, pageSize);
    const medicationIds = [...new Set(rows.map((row) => row.medicationId))];
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const [medications, patients] = await Promise.all([
      this.prisma.healthMedication.findMany({
        where: { shopId: ctx.shop.id, id: { in: medicationIds } },
        select: { id: true, name: true },
      }),
      this.prisma.healthPatient.findMany({
        where: { shopId: ctx.shop.id, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
    ]);
    const medicationMap = new Map(medications.map((row) => [row.id, row.name]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    return {
      list: rows.map((row) => {
        const after = jsonObj<Record<string, unknown>>(row.afterJson, {});
        return {
          id: row.id,
          medicationId: row.medicationId,
          patientId: row.patientId,
          patientName: patientMap.get(row.patientId) ?? '',
          drugName: medicationMap.get(row.medicationId) ?? '',
          evaluatedAt: toIso(row.createdAt),
          level: strOf(after.level, 16, 'UNKNOWN'),
          symptomText: row.summary,
          metrics: jsonArr<Record<string, unknown>>(after.metrics).map(
            (item) => ({
              metricName: safeText(item.metricName),
              value: numOf(item.value),
              unit: safeText(item.unit),
            }),
          ),
          advice: strOf(after.advice, 1000),
          evaluatorName: strOf(after.evaluatorName, 60),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async medicationEffectSave(
    user: CurrentUser,
    body: {
      shopId: number;
      medicationId: number;
      level: string;
      symptomText: string;
      advice: string;
    },
  ): Promise<HealthMedicationEffectRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'medication');
    await requireShopWritable(ctx);
    const medication = await this.prisma.healthMedication.findFirst({
      where: { id: body.medicationId, shopId: ctx.shop.id },
      select: { id: true, patientId: true, name: true },
    });
    if (!medication)
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药记录不存在');
    const end = new Date();
    const start = addDays(end, -30);
    const periodStart = dayText(start);
    const periodEnd = dayText(end);
    const row = await this.prisma.healthMedicationEffect.upsert({
      where: {
        medicationId_periodStart_periodEnd: {
          medicationId: medication.id,
          periodStart,
          periodEnd,
        },
      },
      create: {
        shopId: ctx.shop.id,
        medicationId: medication.id,
        patientId: medication.patientId,
        periodStart,
        periodEnd,
        adherencePercent: 0,
        beforeJson: {},
        afterJson: {
          level: body.level,
          advice: body.advice,
          evaluatorName: user.username ?? '',
        },
        summary: body.symptomText,
      },
      update: {
        afterJson: {
          level: body.level,
          advice: body.advice,
          evaluatorName: user.username ?? '',
        },
        summary: body.symptomText,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.medicationEffect.save',
      `shop=${ctx.shop.id} medication=${medication.id} level=${body.level}`,
    );
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: row.patientId, shopId: ctx.shop.id },
      select: { name: true },
    });
    return {
      id: row.id,
      medicationId: row.medicationId,
      patientId: row.patientId,
      patientName: patient?.name ?? '',
      drugName: medication.name,
      evaluatedAt: toIso(row.createdAt),
      level: body.level,
      symptomText: row.summary,
      metrics: [],
      advice: body.advice,
      evaluatorName: user.username ?? '',
    };
  }

  // ---------- 处方 ----------

  /** 供订单详情等其它域复用的单条处方视图（不存在返回 null）。 */
  async prescriptionById(
    shopId: number,
    id: number,
  ): Promise<HealthPrescriptionRow | null> {
    const row = await this.prisma.healthPrescription.findFirst({
      where: { id, shopId },
    });
    if (!row) return null;
    const [mapped] = await this.prescriptionRows(shopId, [row]);
    return mapped ?? null;
  }

  async prescriptionRows(
    shopId: number,
    rows: {
      id: number;
      rxNo: string;
      patientId: number;
      consultId: number;
      orderId: number;
      doctorId: number;
      doctorName: string;
      diagnosis: string;
      note: string;
      signatureUrl: string;
      totalCents: number;
      status: string;
      pharmacistName: string;
      reviewReason: string;
      reviewAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
    }[],
  ): Promise<HealthPrescriptionRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const [items, patients] = await Promise.all([
      this.prisma.healthPrescriptionItem.findMany({
        where: { shopId, prescriptionId: { in: ids } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.healthPatient.findMany({
        where: { shopId, id: { in: patientIds } },
        select: { id: true, name: true },
      }),
    ]);
    const drugIds = [
      ...new Set(items.map((item) => item.drugId).filter((id) => id > 0)),
    ];
    const drugs = drugIds.length
      ? await this.prisma.healthDrug.findMany({
          where: { shopId, id: { in: drugIds } },
          select: { id: true, rxType: true, unit: true },
        })
      : [];
    const drugMap = new Map(drugs.map((row) => [row.id, row]));
    const itemByRx = new Map<number, typeof items>();
    for (const item of items) {
      const list = itemByRx.get(item.prescriptionId) ?? [];
      list.push(item);
      itemByRx.set(item.prescriptionId, list);
    }
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      prescriptionNo: row.rxNo,
      patientId: row.patientId,
      patientName: patientMap.get(row.patientId) ?? '',
      consultId: row.consultId,
      orderId: row.orderId,
      doctorId: row.doctorId,
      doctorName: row.doctorName,
      diagnosisText: row.diagnosis,
      items: (itemByRx.get(row.id) ?? []).map((item) => {
        const drug = drugMap.get(item.drugId);
        return {
          id: item.id,
          drugId: item.drugId,
          drugName: item.name,
          spec: item.spec,
          quantity: item.quantity,
          unit: drug?.unit ?? '盒',
          doseText: item.doseText,
          way: item.way,
          frequency: item.frequency,
          days: item.days,
          prescriptionRequired: drug?.rxType === 'RX',
          priceCents: item.priceCents,
        };
      }),
      advice: row.note,
      totalCents: row.totalCents,
      status: ([
        'DRAFT',
        'SUBMITTED',
        'PHARMACY_APPROVED',
        'PHARMACY_REJECTED',
        'DISPENSED',
        'EXPIRED',
        'REVOKED',
      ].includes(row.status)
        ? row.status
        : 'DRAFT') as HealthPrescriptionRow['status'],
      pharmacistName: row.pharmacistName,
      pharmacyNote: row.reviewReason,
      reviewedAt: toIso(row.reviewAt),
      validUntil: toIso(row.expiresAt),
      signatureUrl: row.signatureUrl,
      createdAt: toIso(row.createdAt),
    }));
  }

  async prescriptions(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'prescription',
    );
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const doctorId = intIn(query.doctorId, 0, 2_000_000_000, 0);
    const prescriptionStatus = pickFilter(query.prescriptionStatus);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (doctorId > 0) where.doctorId = doctorId;
    if (prescriptionStatus) where.status = prescriptionStatus;
    const [rows, total] = await Promise.all([
      this.prisma.healthPrescription.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPrescription.count({ where }),
    ]);
    return {
      list: await this.prescriptionRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async prescriptionDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPrescriptionRow> {
    const ctx = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'prescription',
    );
    const row = await this.prisma.healthPrescription.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '处方不存在');
    const [mapped] = await this.prescriptionRows(ctx.shop.id, [row]);
    return mapped;
  }

  async prescriptionSave(
    user: CurrentUser,
    body: HealthPrescriptionSaveBody,
  ): Promise<HealthPrescriptionRow> {
    const ctx = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'prescription',
    );
    await requireShopWritable(ctx);
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: body.patientId, shopId: ctx.shop.id },
      select: { id: true, customerId: true },
    });
    if (!patient)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '就诊人不存在');
    const doctor =
      body.doctorId > 0
        ? await this.requirePractitioner(ctx.shop.id, body.doctorId)
        : null;
    const drugs = await this.prisma.healthDrug.findMany({
      where: {
        shopId: ctx.shop.id,
        id: { in: body.items.map((item) => item.drugId) },
      },
      select: {
        id: true,
        name: true,
        spec: true,
        priceCents: true,
        rxType: true,
      },
    });
    if (drugs.length !== new Set(body.items.map((item) => item.drugId)).size) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '部分药品不存在或不属于本店',
      );
    }
    const drugMap = new Map(drugs.map((row) => [row.id, row]));
    const totalCents = body.items.reduce(
      (sum, item) =>
        sum + (drugMap.get(item.drugId)?.priceCents ?? 0) * item.quantity,
      0,
    );
    const existing =
      body.id > 0
        ? await this.prisma.healthPrescription.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '处方不存在');
    }
    if (existing && existing.status !== 'DRAFT') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有草稿处方可以修改');
    }
    const status = body.submit ? 'SUBMITTED' : 'DRAFT';
    const expiresAt = body.submit ? addDays(new Date(), 3) : null;
    const data = {
      shopId: ctx.shop.id,
      patientId: body.patientId,
      customerId: patient.customerId,
      consultId: body.consultId,
      orderId: body.orderId,
      doctorId: body.doctorId,
      doctorName: doctor?.name ?? '',
      diagnosis: body.diagnosisText,
      note: body.advice,
      signatureUrl: body.signatureUrl,
      totalCents,
      status,
      expiresAt,
    };
    const row = existing
      ? await this.prisma.healthPrescription.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthPrescription.create({
          data: { ...data, rxNo: makeNo('RX') },
        });
    await this.prisma.$transaction([
      this.prisma.healthPrescriptionItem.deleteMany({
        where: { shopId: ctx.shop.id, prescriptionId: row.id },
      }),
      this.prisma.healthPrescriptionItem.createMany({
        data: body.items.map((item) => {
          const drug = drugMap.get(item.drugId);
          return {
            shopId: ctx.shop.id,
            prescriptionId: row.id,
            drugId: item.drugId,
            name: drug?.name ?? '',
            spec: drug?.spec ?? '',
            quantity: item.quantity,
            priceCents: drug?.priceCents ?? 0,
            usageText: [item.doseText, item.way, item.frequency]
              .filter(Boolean)
              .join(' ')
              .slice(0, 200),
            doseText: item.doseText,
            way: item.way,
            frequency: item.frequency,
            days: item.days,
          };
        }),
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.prescription.save',
      `shop=${ctx.shop.id} rx=${row.id} items=${body.items.length} status=${status}`,
    );
    const [mapped] = await this.prescriptionRows(ctx.shop.id, [row]);
    return mapped;
  }

  async prescriptionReview(
    user: CurrentUser,
    body: HealthPrescriptionReviewBody,
  ): Promise<HealthPrescriptionRow> {
    const ctx = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'prescription',
    );
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPrescription.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '处方不存在');
    if (row.status !== 'SUBMITTED') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有待审核处方可以审核');
    }
    const updated = await this.prisma.healthPrescription.update({
      where: { id: row.id },
      data: {
        status: body.approved ? 'PHARMACY_APPROVED' : 'PHARMACY_REJECTED',
        pharmacistName: user.username ?? '',
        reviewAt: new Date(),
        reviewReason: body.approved ? '' : body.note,
        expiresAt: body.approved ? addDays(new Date(), 3) : row.expiresAt,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.prescription.review',
      `shop=${ctx.shop.id} rx=${row.id} approved=${body.approved}`,
    );
    const [mapped] = await this.prescriptionRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async prescriptionRevoke(
    user: CurrentUser,
    body: { shopId: number; id: number; reason: string },
  ): Promise<HealthPrescriptionRow> {
    const ctx = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'prescription',
    );
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPrescription.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '处方不存在');
    if (
      row.status === 'REVOKED' ||
      row.status === 'EXPIRED' ||
      row.status === 'DISPENSED'
    ) {
      throw new BusinessException(ErrorCode.CONFLICT, '该处方已结束，不能作废');
    }
    const updated = await this.prisma.healthPrescription.update({
      where: { id: row.id },
      data: {
        status: 'REVOKED',
        reviewReason: body.reason,
        reviewAt: new Date(),
        pharmacistName: user.username ?? row.pharmacistName,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.prescription.revoke',
      `shop=${ctx.shop.id} rx=${row.id} reason=${clip(body.reason, 60)}`,
    );
    const [mapped] = await this.prescriptionRows(ctx.shop.id, [updated]);
    return mapped;
  }
}
