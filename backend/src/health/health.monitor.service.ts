import {
  type HealthAlertHandleBody,
  type HealthAlertRow,
  type HealthAlertRuleRow,
  type HealthAlertRuleSaveBody,
  type HealthMetricLogRow,
  type HealthMetricLogSaveBody,
  type HealthMetricRow,
  type HealthMetricSaveBody,
  type HealthMetricTrend,
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
import { alertRowsOf } from './health.views';

/** 内置指标键：这些指标由模板预置，端上不允许改键名。 */
const BUILTIN_METRICS = new Set([
  'BLOOD_PRESSURE',
  'BLOOD_SUGAR',
  'WEIGHT',
  'HEART_RATE',
  'TEMPERATURE',
  'SPO2',
  'BMI',
]);

/** `health_metrics.extra_fields_json` 实际承载指标的表单配置（值类型/选项/额外字段）。 */
type MetricConfig = {
  valueType: string;
  options: string[];
  fields: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    unit: string;
    options: string[];
  }[];
};

const metricConfigOf = (value: unknown): MetricConfig => {
  const config = jsonObj<Record<string, unknown>>(value, {});
  return {
    valueType: strOf(config.valueType, 16, 'NUMBER'),
    options: jsonArr<unknown>(config.options)
      .map((item) => String(item))
      .filter(Boolean),
    fields: jsonArr<Record<string, unknown>>(config.fields).map((field) => ({
      key: clip(field.key, 40),
      label: clip(field.label, 40),
      type: strOf(field.type, 16, 'NUMBER'),
      required: Boolean(field.required),
      unit: clip(field.unit, 16),
      options: jsonArr<unknown>(field.options)
        .map((item) => String(item))
        .filter(Boolean),
    })),
  };
};

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

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
  const value = String(text || '').trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const bucketOf = (date: Date, granularity: string): string => {
  if (granularity === 'MONTH') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'WEEK') {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - weekday);
    return dayKey(copy);
  }
  return dayKey(date);
};

/**
 * 指标监测与异常预警（C4）。
 *
 * 规则口径（`health_alert_rules`）：
 * - ABSOLUTE：低/高阈值，direction 由两端阈值推导（两端都有=RANGE，只有一端=ABOVE/BELOW）。
 * - BASELINE_DELTA：与同指标此前窗口均值比较，偏移百分比达到 deltaPercent 才触发。
 * - CONSECUTIVE：最近 N 次读数都越界（同侧）才触发。
 * - PERIOD_LIMIT：窗口期内异常次数超过 maxCount 才触发。
 *
 * 去重：dedupeKey 带时间片（`rule:patient:floor(now/dedupeMinutes)`），
 * 同一窗口内同规则同就诊人只落一条预警；预警是「提示」不是诊断，文案只给区间与建议动作。
 */
export class HealthMonitorService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 指标定义 ----------

  private metricRow(
    row: {
      id: number;
      mKey: string;
      name: string;
      unit: string;
      decimalScale: number;
      normalMin: unknown;
      normalMax: unknown;
      extraFieldsJson: unknown;
      sort: number;
      status: string;
    },
    recordCount: number,
  ): HealthMetricRow {
    const config = metricConfigOf(row.extraFieldsJson);
    return {
      id: row.id,
      metricKey: row.mKey,
      name: row.name,
      unit: row.unit,
      valueType: config.valueType as HealthMetricRow['valueType'],
      decimals: row.decimalScale,
      normalLow: round3(numOf(row.normalMin)),
      normalHigh: round3(numOf(row.normalMax)),
      options: config.options,
      extraFields: config.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type as HealthMetricRow['extraFields'][number]['type'],
        required: field.required,
        unit: field.unit,
        options: field.options,
      })),
      builtin: BUILTIN_METRICS.has(row.mKey),
      sort: row.sort,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      recordCount,
    };
  }

  async metrics(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthMetricRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'metric');
    const rows = await this.prisma.healthMetric.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const counts = rows.length
      ? await this.prisma.healthMetricLog.groupBy({
          by: ['metricId'],
          where: {
            shopId: ctx.shop.id,
            metricId: { in: rows.map((row) => row.id) },
          },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((row) => [row.metricId, row._count._all]),
    );
    return rows.map((row) => this.metricRow(row, countMap.get(row.id) ?? 0));
  }

  async metricSave(
    user: CurrentUser,
    body: HealthMetricSaveBody,
  ): Promise<HealthMetricRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'metric');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthMetric.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '指标不存在');
    }
    if (
      existing &&
      existing.mKey !== body.metricKey &&
      BUILTIN_METRICS.has(existing.mKey)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '内置指标的键名不可修改',
      );
    }
    const clash = await this.prisma.healthMetric.findFirst({
      where: {
        shopId: ctx.shop.id,
        mKey: body.metricKey,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new BusinessException(ErrorCode.CONFLICT, '同键名的指标已存在');
    const config: MetricConfig = {
      valueType: body.valueType,
      options: body.options,
      fields: body.extraFields,
    };
    const data = {
      shopId: ctx.shop.id,
      mKey: body.metricKey,
      name: body.name,
      unit: body.unit,
      decimalScale: body.decimals,
      normalMin: body.normalLow,
      normalMax: body.normalHigh,
      extraFieldsJson: config,
      sort: body.sort,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthMetric.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthMetric.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.metric.update' : 'health.metric.create',
      `shop=${ctx.shop.id} metric=${row.id} key=${row.mKey}`,
    );
    const recordCount = await this.prisma.healthMetricLog.count({
      where: { shopId: ctx.shop.id, metricId: row.id },
    });
    return this.metricRow(row, recordCount);
  }

  async metricRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'metric');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMetric.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true, mKey: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '指标不存在');
    if (BUILTIN_METRICS.has(row.mKey)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '内置指标不可删除，可停用',
      );
    }
    const used = await this.prisma.healthMetricLog.count({
      where: { shopId: ctx.shop.id, metricId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该指标已有读数记录，不能删除，请改为停用',
      );
    }
    await this.prisma.$transaction([
      this.prisma.healthAlertRule.deleteMany({
        where: { shopId: ctx.shop.id, metricKey: row.mKey },
      }),
      this.prisma.healthMetric.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.metric.remove',
      `shop=${ctx.shop.id} metric=${row.id} key=${row.mKey}`,
    );
    return { ok: true, message: '指标已删除' };
  }

  // ---------- 指标读数 ----------

  private metricLogRows(
    shopId: number,
    rows: {
      id: number;
      patientId: number;
      metricId: number;
      metricKey: string;
      value: unknown;
      extrasJson: unknown;
      source: string;
      measuredAt: Date;
      abnormal: boolean;
      remark: string;
      createdAt: Date;
    }[],
    metricMap: Map<number, { name: string; unit: string }>,
    patientMap: Map<number, string>,
  ): HealthMetricLogRow[] {
    void shopId;
    return rows.map((row) => {
      const extras = jsonObj<Record<string, unknown>>(row.extrasJson, {});
      const metric = metricMap.get(row.metricId);
      const value = round3(numOf(row.value));
      const direction =
        strOf(extras.abnormalDirection, 8) ||
        (row.abnormal ? 'ABNORMAL' : metric ? 'NORMAL' : '');
      return {
        id: row.id,
        patientId: row.patientId,
        patientName: patientMap.get(row.patientId) ?? '',
        metricId: row.metricId,
        metricKey: row.metricKey,
        metricName: metric?.name ?? row.metricKey,
        unit: metric?.unit ?? '',
        value,
        valueText: strOf(extras.valueText, 120),
        extras,
        measuredAt: toIso(row.measuredAt),
        source: row.source,
        staffName: strOf(extras.staffName, 60),
        abnormal: row.abnormal,
        abnormalDirection: direction,
        note: row.remark,
        createdAt: toIso(row.createdAt),
      };
    });
  }

  private async logContext(
    shopId: number,
    rows: { metricId: number; patientId: number }[],
  ) {
    const metricIds = [
      ...new Set(rows.map((row) => row.metricId).filter((id) => id > 0)),
    ];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const [metrics, patients] = await Promise.all([
      metricIds.length
        ? this.prisma.healthMetric.findMany({
            where: { shopId, id: { in: metricIds } },
            select: { id: true, name: true, unit: true },
          })
        : [],
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return {
      metricMap: new Map(metrics.map((row) => [row.id, row])),
      patientMap: new Map(patients.map((row) => [row.id, row.name])),
    };
  }

  async metricLogs(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'metric');
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const metricId = intIn(query.metricId, 0, 2_000_000_000, 0);
    const abnormalOnly = intIn(query.abnormalOnly, 0, 1, 0) === 1;
    const from = dateOf(strOf(query.from, 32));
    const to = dateOf(strOf(query.to, 32));
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (metricId > 0) where.metricId = metricId;
    if (abnormalOnly) where.abnormal = true;
    if (from || to)
      where.measuredAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    if (keyword) where.remark = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthMetricLog.findMany({
        where,
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthMetricLog.count({ where }),
    ]);
    const { metricMap, patientMap } = await this.logContext(ctx.shop.id, rows);
    return {
      list: this.metricLogRows(ctx.shop.id, rows, metricMap, patientMap),
      total,
      page,
      pageSize,
    };
  }

  async metricLogSave(
    user: CurrentUser,
    body: HealthMetricLogSaveBody,
  ): Promise<HealthMetricLogRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'metric');
    await requireShopWritable(ctx);
    return this.recordStaffLog({
      shopId: ctx.shop.id,
      patientId: body.patientId,
      metricId: body.metricId,
      value: body.value,
      measuredAt: body.measuredAt,
      note: body.note,
      extras: body.extras,
      valueText: body.valueText,
      staffName: user.username ?? '',
    });
  }

  /**
   * 工作台/随访代录读数：异常判定与规则触发都走这一处，
   * 保证「随访记录里补录的血压」与「手工录一条血压」产生同样的预警。
   */
  async recordStaffLog(input: {
    shopId: number;
    patientId: number;
    metricId: number;
    value: number;
    measuredAt?: string | Date;
    note?: string;
    extras?: Record<string, unknown>;
    valueText?: string;
    staffName?: string;
    source?: string;
  }): Promise<HealthMetricLogRow> {
    const shopId = input.shopId;
    const body = {
      patientId: input.patientId,
      metricId: input.metricId,
      value: input.value,
      measuredAt:
        input.measuredAt instanceof Date
          ? input.measuredAt.toISOString()
          : (input.measuredAt ?? ''),
      note: input.note ?? '',
      extras: input.extras ?? {},
      valueText: input.valueText ?? '',
    };
    const [metric, patient] = await Promise.all([
      this.prisma.healthMetric.findFirst({
        where: { id: body.metricId, shopId, status: 'ON' },
      }),
      this.prisma.healthPatient.findFirst({
        where: { id: body.patientId, shopId },
        select: { id: true, name: true },
      }),
    ]);
    if (!metric)
      throw new BusinessException(ErrorCode.NOT_FOUND, '指标不存在或已停用');
    if (!patient)
      throw new BusinessException(ErrorCode.NOT_FOUND, '就诊人不存在');
    const measuredAt = dateOf(body.measuredAt) ?? new Date();
    const direction = this.judge(metric, body.value);
    const abnormal = direction !== '';
    const extras = {
      ...body.extras,
      valueText: body.valueText,
      abnormalDirection: direction,
      staffName: clip(input.staffName ?? '', 60),
    };
    const row = await this.prisma.healthMetricLog.create({
      data: {
        shopId,
        patientId: body.patientId,
        metricId: metric.id,
        metricKey: metric.mKey,
        value: body.value,
        extrasJson: extras,
        source: input.source ?? 'STAFF',
        measuredAt,
        abnormal,
        remark: body.note,
      },
    });
    if (abnormal) {
      await this.evaluateRules(
        shopId,
        metric,
        body.patientId,
        round3(body.value),
        measuredAt,
        row.id,
      );
    }
    return this.metricLogRows(
      shopId,
      [row],
      new Map([[metric.id, { name: metric.name, unit: metric.unit }]]),
      new Map([[patient.id, patient.name]]),
    )[0];
  }

  /** 数值指标按正常区间判方向；非数值类型不判异常。 */
  private judge(
    metric: {
      normalMin: unknown;
      normalMax: unknown;
      extraFieldsJson: unknown;
    },
    value: number,
  ): '' | 'ABOVE' | 'BELOW' {
    if (metricConfigOf(metric.extraFieldsJson).valueType !== 'NUMBER')
      return '';
    const low = round3(numOf(metric.normalMin));
    const high = round3(numOf(metric.normalMax));
    if (high === 0 && low === 0) return '';
    if (high !== 0 && value > high) return 'ABOVE';
    if (low !== 0 && value < low) return 'BELOW';
    return '';
  }

  async metricLogRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'metric');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMetricLog.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '读数不存在');
    await this.prisma.healthMetricLog.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.metricLog.remove',
      `shop=${ctx.shop.id} log=${row.id}`,
    );
    return { ok: true, message: '读数已删除' };
  }

  async metricTrend(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthMetricTrend> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'metric');
    const patientId = intIn(query.patientId, 1, 2_000_000_000, 0);
    const metricId = intIn(query.metricId, 1, 2_000_000_000, 0);
    const days = intIn(query.days, 1, 730, 90);
    const granularity = ['DAY', 'WEEK', 'MONTH'].includes(
      String(query.granularity),
    )
      ? String(query.granularity)
      : 'DAY';
    const metric = await this.prisma.healthMetric.findFirst({
      where: { id: metricId, shopId: ctx.shop.id },
    });
    if (!metric) throw new BusinessException(ErrorCode.NOT_FOUND, '指标不存在');
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const prior = new Date(start.getTime() - days * 86_400_000);
    const [logs, priorLogs] = await Promise.all([
      this.prisma.healthMetricLog.findMany({
        where: {
          shopId: ctx.shop.id,
          patientId,
          metricId,
          measuredAt: { gte: start },
        },
        orderBy: { measuredAt: 'asc' },
        take: 5000,
      }),
      this.prisma.healthMetricLog.findMany({
        where: {
          shopId: ctx.shop.id,
          patientId,
          metricId,
          measuredAt: { gte: prior, lt: start },
        },
        select: { value: true },
        take: 5000,
      }),
    ]);
    const buckets = new Map<
      string,
      { count: number; sum: number; max: number; min: number; abnormal: number }
    >();
    for (const log of logs) {
      const key = bucketOf(log.measuredAt, granularity);
      const value = numOf(log.value);
      const bucket = buckets.get(key) ?? {
        count: 0,
        sum: 0,
        max: value,
        min: value,
        abnormal: 0,
      };
      bucket.count += 1;
      bucket.sum += value;
      bucket.max = Math.max(bucket.max, value);
      bucket.min = Math.min(bucket.min, value);
      if (log.abnormal) bucket.abnormal += 1;
      buckets.set(key, bucket);
    }
    const points = [...buckets.entries()].map(([bucket, stats]) => ({
      bucket,
      count: stats.count,
      avgValue: round3(stats.sum / stats.count),
      maxValue: round3(stats.max),
      minValue: round3(stats.min),
      abnormalCount: stats.abnormal,
    }));
    const { metricMap, patientMap } = await this.logContext(
      ctx.shop.id,
      logs.slice(-1),
    );
    const latest = logs.length
      ? this.metricLogRows(
          ctx.shop.id,
          [logs[logs.length - 1]],
          metricMap,
          patientMap,
        )[0]
      : null;
    const baselineValue = priorLogs.length
      ? round3(
          priorLogs.reduce((sum, row) => sum + numOf(row.value), 0) /
            priorLogs.length,
        )
      : 0;
    return {
      metricId: metric.id,
      metricName: metric.name,
      unit: metric.unit,
      normalLow: round3(numOf(metric.normalMin)),
      normalHigh: round3(numOf(metric.normalMax)),
      granularity,
      points,
      latest,
      baselineValue,
    };
  }

  // ---------- 预警规则 ----------

  private async alertRuleRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      metricKey: string;
      ruleType: string;
      direction: string;
      threshold: unknown;
      lowThreshold: unknown;
      deltaPercent: number;
      consecutive: number;
      windowHours: number;
      maxCount: number;
      level: string;
      notifyJson: unknown;
      status: string;
    }[],
  ): Promise<HealthAlertRuleRow[]> {
    if (!rows.length) return [];
    const metricKeys = [...new Set(rows.map((row) => row.metricKey))];
    const [metrics, hits] = await Promise.all([
      this.prisma.healthMetric.findMany({
        where: { shopId, mKey: { in: metricKeys } },
        select: { id: true, mKey: true, name: true },
      }),
      this.prisma.healthAlert.groupBy({
        by: ['ruleId'],
        where: { shopId, ruleId: { in: rows.map((row) => row.id) } },
        _count: { _all: true },
      }),
    ]);
    const metricMap = new Map(metrics.map((row) => [row.mKey, row]));
    const hitMap = new Map(hits.map((row) => [row.ruleId, row._count._all]));
    return rows.map((row) => {
      const notify = jsonArr<unknown>(row.notifyJson).map((item) =>
        String(item),
      );
      const metric = metricMap.get(row.metricKey);
      return {
        id: row.id,
        name: row.name,
        metricId: metric?.id ?? 0,
        metricName: metric?.name ?? row.metricKey,
        ruleType: ([
          'ABSOLUTE',
          'BASELINE_DELTA',
          'CONSECUTIVE',
          'PERIOD_LIMIT',
        ].includes(row.ruleType)
          ? row.ruleType
          : 'ABSOLUTE') as HealthAlertRuleRow['ruleType'],
        lowThreshold: round3(numOf(row.lowThreshold)),
        highThreshold: round3(numOf(row.threshold)),
        deltaPercent: row.deltaPercent,
        consecutiveTimes: row.consecutive,
        periodDays: Math.max(1, Math.round(row.windowHours / 24)),
        notifyCustomer: notify.includes('CUSTOMER'),
        notifyOwner: notify.includes('OWNER'),
        notifyShop: notify.includes('SHOP'),
        severity: row.level,
        status: row.status === 'OFF' ? 'OFF' : 'ON',
        hitCount: hitMap.get(row.id) ?? 0,
      };
    });
  }

  async alertRules(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthAlertRuleRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'alert');
    const rows = await this.prisma.healthAlertRule.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: { id: 'asc' },
    });
    return this.alertRuleRows(ctx.shop.id, rows);
  }

  async alertRuleSave(
    user: CurrentUser,
    body: HealthAlertRuleSaveBody,
  ): Promise<HealthAlertRuleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'alert');
    await requireShopWritable(ctx);
    const metric = await this.prisma.healthMetric.findFirst({
      where: { id: body.metricId, shopId: ctx.shop.id },
      select: { id: true, mKey: true },
    });
    if (!metric)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '指标不存在');
    const existing =
      body.id > 0
        ? await this.prisma.healthAlertRule.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预警规则不存在');
    }
    const low = round3(body.lowThreshold);
    const high = round3(body.highThreshold);
    let direction = 'ANY';
    if (body.ruleType === 'ABSOLUTE' || body.ruleType === 'CONSECUTIVE') {
      if (low !== 0 && high !== 0) direction = 'RANGE';
      else if (high !== 0) direction = 'ABOVE';
      else if (low !== 0) direction = 'BELOW';
    }
    const notify: string[] = [
      ...(body.notifyCustomer ? ['CUSTOMER'] : []),
      ...(body.notifyOwner ? ['OWNER'] : []),
      ...(body.notifyShop ? ['SHOP'] : []),
    ];
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      metricKey: metric.mKey,
      ruleType: body.ruleType,
      direction,
      threshold: high,
      lowThreshold: low,
      deltaPercent: body.deltaPercent,
      consecutive: body.consecutiveTimes,
      windowHours: body.periodDays * 24,
      maxCount: 0,
      level: body.severity,
      notifyJson: notify,
      dedupeMinutes: Math.max(10, Math.min(1440, body.periodDays * 60)),
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthAlertRule.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthAlertRule.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.alertRule.update' : 'health.alertRule.create',
      `shop=${ctx.shop.id} rule=${row.id} type=${body.ruleType}`,
    );
    const [mapped] = await this.alertRuleRows(ctx.shop.id, [row]);
    return mapped;
  }

  async alertRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'alert');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthAlertRule.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '预警规则不存在');
    await this.prisma.healthAlertRule.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.alertRule.remove',
      `shop=${ctx.shop.id} rule=${row.id}`,
    );
    return { ok: true, message: '预警规则已删除' };
  }

  /** 规则判定：命中返回触发侧（ABOVE/BELOW），未命中返回空串。 */
  private breach(
    rule: {
      ruleType: string;
      direction: string;
      threshold: unknown;
      lowThreshold: unknown;
    },
    value: number,
  ): '' | 'ABOVE' | 'BELOW' {
    const high = round3(numOf(rule.threshold));
    const low = round3(numOf(rule.lowThreshold));
    if (rule.ruleType !== 'ABSOLUTE' && rule.ruleType !== 'CONSECUTIVE')
      return '';
    if (rule.direction === 'RANGE') {
      if (high !== 0 && value > high) return 'ABOVE';
      if (low !== 0 && value < low) return 'BELOW';
      return '';
    }
    if (rule.direction === 'BELOW' || (low !== 0 && high === 0)) {
      return low !== 0 && value < low ? 'BELOW' : '';
    }
    if (rule.direction === 'ABOVE' || high !== 0) {
      return high !== 0 && value > high ? 'ABOVE' : '';
    }
    return '';
  }

  /**
   * 落库一条读数后立即跑规则（同事务外，失败不回滚读数但留下日志）。
   * 规则类型各自取证，命中后按 dedupe 时间片写预警。
   */
  private async evaluateRules(
    shopId: number,
    metric: { id: number; mKey: string; name: string },
    patientId: number,
    value: number,
    measuredAt: Date,
    logId: number,
  ): Promise<void> {
    const rules = await this.prisma.healthAlertRule.findMany({
      where: { shopId, metricKey: metric.mKey, status: 'ON' },
    });
    if (!rules.length) return;
    const candidates = rules.filter(
      (rule) => rule.patientId === 0 || rule.patientId === patientId,
    );
    const groupIds = [
      ...new Set(
        candidates.map((rule) => rule.crowdGroupId).filter((id) => id > 0),
      ),
    ];
    const memberships = groupIds.length
      ? new Set(
          (
            await this.prisma.healthCrowdMember.findMany({
              where: { shopId, patientId, groupId: { in: groupIds } },
              select: { groupId: true },
            })
          ).map((row) => row.groupId),
        )
      : new Set<number>();
    const active = candidates.filter(
      (rule) => rule.crowdGroupId === 0 || memberships.has(rule.crowdGroupId),
    );
    for (const rule of active) {
      const hit = await this.ruleHit(
        shopId,
        rule,
        patientId,
        value,
        measuredAt,
        metric.mKey,
      );
      if (!hit) continue;
      const slice = Math.floor(
        measuredAt.getTime() / Math.max(1, rule.dedupeMinutes * 60_000),
      );
      const dedupeKey = `${rule.id}:${patientId}:${slice}`;
      const existed = await this.prisma.healthAlert.findFirst({
        where: { shopId, dedupeKey },
        select: { id: true },
      });
      if (existed) continue;
      await this.prisma.healthAlert.create({
        data: {
          shopId,
          ruleId: rule.id,
          patientId,
          metricKey: metric.mKey,
          value,
          baseline: hit.baseline,
          level: rule.level,
          detailJson: {
            ruleType: rule.ruleType,
            direction: hit.direction,
            measuredAt: measuredAt.toISOString(),
            logId,
            metricName: metric.name,
          },
          status: 'OPEN',
          dedupeKey,
        },
      });
    }
  }

  private async ruleHit(
    shopId: number,
    rule: {
      ruleType: string;
      direction: string;
      threshold: unknown;
      lowThreshold: unknown;
      deltaPercent: number;
      consecutive: number;
      windowHours: number;
      maxCount: number;
    },
    patientId: number,
    value: number,
    measuredAt: Date,
    metricKey: string,
  ): Promise<{ direction: 'ABOVE' | 'BELOW'; baseline: number } | null> {
    if (rule.ruleType === 'ABSOLUTE') {
      const side = this.breach(rule, value);
      return side ? { direction: side, baseline: 0 } : null;
    }
    if (rule.ruleType === 'BASELINE_DELTA') {
      const windowStart = new Date(
        measuredAt.getTime() - Math.max(1, rule.windowHours) * 3_600_000,
      );
      const prior = await this.prisma.healthMetricLog.aggregate({
        where: {
          shopId,
          patientId,
          metricKey,
          measuredAt: { gte: windowStart, lt: measuredAt },
        },
        _avg: { value: true },
        _count: { _all: true },
      });
      if (!prior._count._all) return null;
      const baseline = round3(numOf(prior._avg.value));
      if (!baseline) return null;
      const delta = ((value - baseline) / Math.abs(baseline)) * 100;
      if (Math.abs(delta) < Math.max(1, rule.deltaPercent)) return null;
      return { direction: delta > 0 ? 'ABOVE' : 'BELOW', baseline };
    }
    if (rule.ruleType === 'CONSECUTIVE') {
      const take = Math.max(1, rule.consecutive);
      const logs = await this.prisma.healthMetricLog.findMany({
        where: {
          shopId,
          patientId,
          metricKey,
          measuredAt: { lte: measuredAt },
        },
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        take,
        select: { value: true },
      });
      if (logs.length < take) return null;
      const sides = logs.map((log) => this.breach(rule, numOf(log.value)));
      if (sides.some((side) => !side)) return null;
      return { direction: sides[0] as 'ABOVE' | 'BELOW', baseline: 0 };
    }
    if (rule.ruleType === 'PERIOD_LIMIT') {
      const windowStart = new Date(
        measuredAt.getTime() - Math.max(1, rule.windowHours) * 3_600_000,
      );
      const count = await this.prisma.healthMetricLog.count({
        where: {
          shopId,
          patientId,
          metricKey,
          abnormal: true,
          measuredAt: { gte: windowStart, lte: measuredAt },
        },
      });
      const limit = rule.maxCount > 0 ? rule.maxCount : 3;
      if (count <= limit) return null;
      return { direction: 'ABOVE', baseline: 0 };
    }
    return null;
  }

  // ---------- 预警事件 ----------

  async alerts(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'alert');
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const ruleId = intIn(query.ruleId, 0, 2_000_000_000, 0);
    const status = pickFilter(query.alertStatus);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (ruleId > 0) where.ruleId = ruleId;
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthAlert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthAlert.count({ where }),
    ]);
    if (!rows.length) return emptyPage<HealthAlertRow>(page, pageSize);
    return {
      list: await alertRowsOf(this.prisma, ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async alertHandle(
    user: CurrentUser,
    body: HealthAlertHandleBody,
  ): Promise<HealthAlertRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'alert');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthAlert.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '预警不存在');
    const updated = await this.prisma.healthAlert.update({
      where: { id: row.id },
      data: {
        status: body.status,
        handleNote: body.status === 'OPEN' ? '' : body.note,
        handleBy: body.status === 'OPEN' ? '' : user.userId,
        handledAt: body.status === 'OPEN' ? null : new Date(),
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.alert.handle',
      `shop=${ctx.shop.id} alert=${row.id} status=${body.status}`,
    );
    const [mapped] = await alertRowsOf(this.prisma, ctx.shop.id, [updated]);
    return mapped;
  }
}
