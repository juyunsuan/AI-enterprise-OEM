import { safeText } from '../common/safe-text';
import { createHash } from 'node:crypto';
import {
  HEALTH_GREEN_STATUS_LABELS,
  type HealthConsultActionBody,
  type HealthConsultCreateBody,
  type HealthConsultRow,
  type HealthConsultRuleRow,
  type HealthConsultRuleSaveBody,
  type HealthConsultSession,
  type HealthDiseaseRow,
  type HealthDiseaseSaveBody,
  type HealthGreenOrderRow,
  type HealthGreenProgressBody,
  type HealthGuidanceResult,
  type HealthSignOrderRow,
  type HealthSignPackageRow,
  type HealthSignPackageSaveBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { ServiceDeskService } from '../service-desk/service-desk.service';
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
import { maskPhone } from './health.views';

const CONSULT_STATUSES = new Set([
  'PENDING_PAYMENT',
  'WAIT_ACCEPT',
  'IN_SESSION',
  'PRACTITIONER_REPLIED',
  'CUSTOMER_DONE',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
]);
const GREEN_STATUSES = new Set([
  'PENDING',
  'ACCEPTED',
  'MATCHING',
  'BOOKED',
  'DONE',
  'REJECTED',
]);
const SIGN_STATUSES = new Set([
  'PENDING_PAYMENT',
  'SIGNED',
  'EFFECTIVE',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
]);
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

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const dateOf = (text: string): Date | null => {
  const value = safeText(text).trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T09:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * 问诊、家医签约、绿通与导诊（C7）。
 *
 * 口径：
 * 1. 问诊的沟通一律发生在 AI客服（service-desk）里：本域只存 siteKey 与会话 id，
 *    不存任何消息内容；`consultSession` 现开现发访客令牌，令牌由 consult 派生，
 *    同一位顾客重复进入拿到同一会话。
 * 2. 电话/视频问诊只登记预约时段与到场方式（meetingUrl 由外部会议工具给出），
 *    平台不代拨、不建房间。
 * 3. 导诊只做「症状 → 科室 → 医护」匹配，输出免责声明，不产生诊断结论。
 */
export class HealthClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly desk: ServiceDeskService,
  ) {}

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

  private pickFilter(value: unknown): string {
    const text = strOf(value, 32, 'all');
    return text === 'all' ? '' : text;
  }

  // ---------- 问诊规则 ----------

  private async consultRuleRows(
    shopId: number,
    rows: {
      id: number;
      practitionerId: number;
      bizType: string;
      instant: boolean;
      priceCents: number;
      minutes: number;
      maxDailyCount: number;
      messageLimit: number;
      needPatient: boolean;
      status: string;
    }[],
  ): Promise<HealthConsultRuleRow[]> {
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
    return rows.map((row) => ({
      id: row.id,
      practitionerId: row.practitionerId,
      practitionerName: nameMap.get(row.practitionerId) ?? '',
      bizType: (['CONSULT_TEXT', 'CONSULT_PHONE', 'CONSULT_VIDEO'].includes(
        row.bizType,
      )
        ? row.bizType
        : 'CONSULT_TEXT') as HealthConsultRuleRow['bizType'],
      instant: row.instant,
      priceCents: row.priceCents,
      minutes: row.minutes,
      maxDailyCount: row.maxDailyCount,
      messageLimit: row.messageLimit,
      needPatient: row.needPatient,
      status: row.status === 'ON' ? 'ON' : 'OFF',
    }));
  }

  async consultRules(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'consult');
    const practitionerId = intIn(query.practitionerId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (practitionerId > 0) where.practitionerId = practitionerId;
    const rows = await this.prisma.healthConsultRule.findMany({
      where,
      orderBy: [{ practitionerId: 'asc' }, { id: 'asc' }],
    });
    return this.consultRuleRows(ctx.shop.id, rows);
  }

  async consultRuleSave(
    user: CurrentUser,
    body: HealthConsultRuleSaveBody,
  ): Promise<HealthConsultRuleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'consult');
    await requireShopWritable(ctx);
    const practitioner = await this.prisma.healthPractitioner.findFirst({
      where: { id: body.practitionerId, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!practitioner)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '问诊医护不存在');
    const data = {
      shopId: ctx.shop.id,
      practitionerId: body.practitionerId,
      bizType: body.bizType,
      instant: body.instant,
      priceCents: body.priceCents,
      minutes: body.minutes,
      maxDailyCount: body.maxDailyCount,
      messageLimit: body.messageLimit,
      needPatient: body.needPatient,
      status: body.status,
    };
    const existing =
      body.id > 0
        ? await this.prisma.healthConsultRule.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : await this.prisma.healthConsultRule.findFirst({
            where: {
              shopId: ctx.shop.id,
              practitionerId: body.practitionerId,
              bizType: body.bizType,
            },
          });
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '问诊规则不存在');
    }
    const row = existing
      ? await this.prisma.healthConsultRule.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthConsultRule.create({ data });
    await audit(
      this.prisma,
      user.userId,
      'health.consultRule.save',
      `shop=${ctx.shop.id} rule=${row.id} practitioner=${row.practitionerId} bizType=${row.bizType}`,
    );
    const [mapped] = await this.consultRuleRows(ctx.shop.id, [row]);
    return mapped;
  }

  async consultRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'consult');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthConsultRule.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '问诊规则不存在');
    await this.prisma.healthConsultRule.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.consultRule.remove',
      `shop=${ctx.shop.id} rule=${row.id}`,
    );
    return { ok: true, message: '问诊规则已删除' };
  }

  // ---------- 问诊单 ----------

  /** 供订单详情等其它域复用的单条问诊视图（不存在返回 null）。 */
  async consultById(
    shopId: number,
    id: number,
  ): Promise<HealthConsultRow | null> {
    const row = await this.prisma.healthConsult.findFirst({
      where: { id, shopId },
    });
    if (!row) return null;
    const [mapped] = await this.consultRows(shopId, [row]);
    return mapped ?? null;
  }

  async consultRows(
    shopId: number,
    rows: {
      id: number;
      bizType: string;
      orderId: number;
      title: string;
      customerId: number;
      patientId: number;
      practitionerId: number;
      practitionerName: string;
      status: string;
      symptomText: string;
      attachmentsJson: unknown;
      serviceDeskSiteKey: string;
      serviceDeskConversationId: number;
      serviceDeskAgentId: number;
      appointAt: Date | null;
      contactPhone: string;
      meetingUrl: string;
      startedAt: Date | null;
      expiredAt: Date | null;
      finishedAt: Date | null;
      conclusion: string;
      evalScore: number;
      createdAt: Date;
    }[],
  ): Promise<HealthConsultRow[]> {
    if (!rows.length) return [];
    const orderIds = [
      ...new Set(rows.map((row) => row.orderId).filter((id) => id > 0)),
    ];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const [orders, customers, patients, practitioners] = await Promise.all([
      orderIds.length
        ? this.prisma.healthOrder.findMany({
            where: { shopId, id: { in: orderIds } },
            select: { id: true, orderNo: true },
          })
        : [],
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const orderMap = new Map(orders.map((row) => [row.id, row.orderNo]));
    const customerMap = new Map(customers.map((row) => [row.id, row.nickname]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const practitionerMap = new Map(
      practitioners.map((row) => [row.id, row.name]),
    );
    return rows.map((row) => ({
      id: row.id,
      bizType: (['CONSULT_TEXT', 'CONSULT_PHONE', 'CONSULT_VIDEO'].includes(
        row.bizType,
      )
        ? row.bizType
        : 'CONSULT_TEXT') as HealthConsultRow['bizType'],
      orderId: row.orderId,
      orderNo: orderMap.get(row.orderId) ?? '',
      customerName: customerMap.get(row.customerId) ?? '',
      patientName: patientMap.get(row.patientId) ?? '',
      patientId: row.patientId,
      practitionerId: row.practitionerId,
      practitionerName:
        practitionerMap.get(row.practitionerId) ?? row.practitionerName,
      status: (CONSULT_STATUSES.has(row.status)
        ? row.status
        : 'WAIT_ACCEPT') as HealthConsultRow['status'],
      title: row.title,
      symptomText: row.symptomText,
      attachments: jsonArr<{ name?: unknown; url?: unknown }>(
        row.attachmentsJson,
      )
        .map((item) => ({
          name: safeText(item.name),
          url: safeText(item.url),
        }))
        .filter((item) => item.url),
      serviceDeskSiteKey: row.serviceDeskSiteKey,
      serviceDeskConversationId: row.serviceDeskConversationId,
      serviceDeskAgentId: row.serviceDeskAgentId,
      appointAt: toIso(row.appointAt),
      contactPhoneMasked: maskPhone(row.contactPhone),
      meetingUrl: row.meetingUrl,
      startedAt: toIso(row.startedAt),
      expiredAt: toIso(row.expiredAt),
      finishedAt: toIso(row.finishedAt),
      conclusion: row.conclusion,
      ratingScore: row.evalScore,
      createdAt: toIso(row.createdAt),
    }));
  }

  async consults(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'consult');
    const bizType = this.pickFilter(query.consultBizType);
    const consultStatus = this.pickFilter(query.consultStatus);
    const practitionerId = intIn(query.practitionerId, 0, 2_000_000_000, 0);
    const from = dateOf(strOf(query.from, 32));
    const to = dateOf(strOf(query.to, 32));
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (bizType) where.bizType = bizType;
    if (consultStatus) where.status = consultStatus;
    if (practitionerId > 0) where.practitionerId = practitionerId;
    if (keyword) where.title = { contains: keyword };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
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
    return {
      list: await this.consultRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async consultDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthConsultRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'consult');
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    const [mapped] = await this.consultRows(ctx.shop.id, [row]);
    return mapped;
  }

  async consultCreate(
    user: CurrentUser,
    body: HealthConsultCreateBody,
  ): Promise<HealthConsultRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'consult');
    await requireShopWritable(ctx);
    if (body.patientId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择就诊人');
    }
    if (body.practitionerId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择接诊医护');
    }
    const [patient, practitioner] = await Promise.all([
      this.prisma.healthPatient.findFirst({
        where: { id: body.patientId, shopId: ctx.shop.id },
        select: { id: true, name: true, customerId: true },
      }),
      this.prisma.healthPractitioner.findFirst({
        where: { id: body.practitionerId, shopId: ctx.shop.id },
        select: { id: true, name: true },
      }),
    ]);
    if (!patient)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '就诊人不存在');
    if (!practitioner)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '接诊医护不存在');
    const row = await this.prisma.healthConsult.create({
      data: {
        shopId: ctx.shop.id,
        consultNo: makeNo('CS'),
        bizType: body.bizType,
        title:
          body.title ||
          `${patient.name}·${body.bizType === 'CONSULT_TEXT' ? '图文问诊' : body.bizType === 'CONSULT_PHONE' ? '电话问诊' : '视频问诊'}`,
        patientId: patient.id,
        customerId: patient.customerId,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        status: 'WAIT_ACCEPT',
        symptomText: body.symptomText,
        attachmentsJson: body.attachments,
        contactPhone: body.contactPhone,
        meetingUrl: body.meetingUrl,
        appointAt: dateOf(body.appointAt),
        serviceDeskSiteKey: ctx.shop.serviceDeskSiteKey ?? '',
        expiredAt:
          body.bizType === 'CONSULT_TEXT'
            ? new Date(Date.now() + 48 * 3_600_000)
            : null,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.consult.create',
      `shop=${ctx.shop.id} consult=${row.id} bizType=${row.bizType}`,
    );
    const [mapped] = await this.consultRows(ctx.shop.id, [row]);
    return mapped;
  }

  async consultAction(
    user: CurrentUser,
    body: HealthConsultActionBody,
  ): Promise<HealthConsultRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'consult');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    const closed = ['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(row.status);
    const now = new Date();
    let data: Record<string, unknown>;
    switch (body.action) {
      case 'ACCEPT':
        if (closed)
          throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
        data = {
          status: 'IN_SESSION',
          acceptedAt: row.acceptedAt ?? now,
          startedAt: row.startedAt ?? now,
          expiredAt:
            row.bizType === 'CONSULT_TEXT'
              ? new Date(now.getTime() + 48 * 3_600_000)
              : row.expiredAt,
        };
        break;
      case 'REJECT':
        if (closed)
          throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
        if (!body.reason)
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '拒诊需要填写原因',
          );
        data = {
          status: 'CANCELLED',
          finishedAt: now,
          conclusion: clip(body.reason, 500),
        };
        break;
      case 'FINISH':
        if (closed)
          throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
        data = {
          status: 'COMPLETED',
          finishedAt: now,
          conclusion: body.conclusion || row.conclusion,
        };
        break;
      case 'CANCEL':
        if (closed)
          throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
        data = {
          status: 'CANCELLED',
          finishedAt: now,
          conclusion: clip(body.reason, 500),
        };
        break;
      case 'REMIND':
        if (closed)
          throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
        data =
          row.bizType === 'CONSULT_TEXT'
            ? { expiredAt: new Date(now.getTime() + 24 * 3_600_000) }
            : {};
        break;
      case 'CONCLUDE':
      default:
        if (!body.conclusion) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写问诊结论');
        }
        data = {
          status: 'COMPLETED',
          finishedAt: now,
          conclusion: body.conclusion,
        };
        break;
    }
    const updated = await this.prisma.healthConsult.update({
      where: { id: row.id },
      data,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.consult.action',
      `shop=${ctx.shop.id} consult=${row.id} action=${body.action} status=${updated.status}`,
    );
    const [mapped] = await this.consultRows(ctx.shop.id, [updated]);
    return mapped;
  }

  /** 问诊会话令牌由 consult 派生：同一位顾客反复进入拿到的仍是同一个 AI客服会话。 */
  private consultVisitorToken(consultId: number, consultNo: string): string {
    const secret = safeText(process.env.EXTERNAL_CRED_KEY).trim();
    return createHash('sha256')
      .update(`health-consult|${secret}|${consultId}|${consultNo}`)
      .digest('hex')
      .slice(0, 48);
  }

  async consultSession(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthConsultSession> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'consult');
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    if (row.bizType !== 'CONSULT_TEXT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有图文问诊需要 AI客服会话',
      );
    }
    const siteKey = row.serviceDeskSiteKey || ctx.shop.serviceDeskSiteKey;
    if (!siteKey) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本店尚未绑定 AI客服站点，请先在「服务与客服」里绑定后再发起问诊',
      );
    }
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: row.patientId, shopId: ctx.shop.id },
      select: { name: true },
    });
    const opened = await this.desk.openSession({
      siteKey,
      token: this.consultVisitorToken(row.id, row.consultNo),
      nickname: patient?.name ?? '',
    });
    if (
      row.serviceDeskConversationId !== opened.conversationId ||
      row.serviceDeskSiteKey !== siteKey
    ) {
      await this.prisma.healthConsult.update({
        where: { id: row.id },
        data: {
          serviceDeskSiteKey: siteKey,
          serviceDeskConversationId: opened.conversationId,
        },
      });
    }
    return {
      consultId: row.id,
      conversationId: opened.conversationId,
      siteKey,
      accessToken: opened.token,
      streamPath: `/api/public/service-desk/open/stream/${opened.conversationId}`,
      expiresAt: toIso(new Date(Date.now() + 2 * 3_600_000)),
      message: '会话由本站 AI客服提供，消息内容不进入健康档案',
    };
  }

  // ---------- 家医签约 ----------

  private async signPackageRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      teamId: number;
      practitionerId: number;
      priceCents: number;
      years: number;
      crowdKindsJson: unknown;
      rightsJson: unknown;
      desc: string;
      status: string;
    }[],
  ): Promise<HealthSignPackageRow[]> {
    if (!rows.length) return [];
    const teamIds = [
      ...new Set(rows.map((row) => row.teamId).filter((id) => id > 0)),
    ];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const [teams, practitioners, counts] = await Promise.all([
      teamIds.length
        ? this.prisma.healthTeam.findMany({
            where: { shopId, id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : [],
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.healthOrder.groupBy({
        by: ['bizRefId'],
        where: {
          shopId,
          bizRefType: 'SIGN_PKG',
          bizRefId: { in: rows.map((row) => row.id) },
        },
        _count: { _all: true },
      }),
    ]);
    const teamMap = new Map(teams.map((row) => [row.id, row.name]));
    const practitionerMap = new Map(
      practitioners.map((row) => [row.id, row.name]),
    );
    const countMap = new Map(
      counts.map((row) => [row.bizRefId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      teamId: row.teamId,
      teamName: teamMap.get(row.teamId) ?? '',
      practitionerId: row.practitionerId,
      practitionerName: practitionerMap.get(row.practitionerId) ?? '',
      priceCents: row.priceCents,
      years: row.years,
      crowdKinds: jsonArr<unknown>(row.crowdKindsJson)
        .map((kind) => String(kind))
        .filter((kind): kind is HealthSignPackageRow['crowdKinds'][number] =>
          CROWD_KINDS.has(kind),
        ),
      benefits: jsonArr<Record<string, unknown>>(row.rightsJson).map(
        (item) => ({
          key: safeText(item.key),
          label: safeText(item.label),
          quota: numOf(item.quota),
          desc: safeText(item.desc),
        }),
      ),
      intro: row.desc,
      status: row.status === 'ON' ? 'ON' : 'OFF',
      orderCount: countMap.get(row.id) ?? 0,
    }));
  }

  async signPackages(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'sign');
    const teamId = intIn(query.teamId, 0, 2_000_000_000, 0);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (teamId > 0) where.teamId = teamId;
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthSignPackage.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthSignPackage.count({ where }),
    ]);
    return {
      list: await this.signPackageRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async signPackageSave(
    user: CurrentUser,
    body: HealthSignPackageSaveBody,
  ): Promise<HealthSignPackageRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'sign');
    await requireShopWritable(ctx);
    if (body.teamId > 0) {
      const team = await this.prisma.healthTeam.findFirst({
        where: { id: body.teamId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!team)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '签约团队不存在');
    }
    if (body.practitionerId > 0) {
      const practitioner = await this.prisma.healthPractitioner.findFirst({
        where: { id: body.practitionerId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!practitioner)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '签约医护不存在');
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthSignPackage.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '签约套餐不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      desc: clip(body.intro, 500),
      priceCents: body.priceCents,
      years: body.years,
      validDays: body.years * 365,
      teamId: body.teamId,
      practitionerId: body.practitionerId,
      crowdKindsJson: body.crowdKinds,
      rightsJson: body.benefits,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthSignPackage.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthSignPackage.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.signPackage.update' : 'health.signPackage.create',
      `shop=${ctx.shop.id} package=${row.id}`,
    );
    const [mapped] = await this.signPackageRows(ctx.shop.id, [row]);
    return mapped;
  }

  async signPackageRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'sign');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthSignPackage.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '签约套餐不存在');
    const signed = await this.prisma.healthSignOrder.count({
      where: { shopId: ctx.shop.id, packageId: row.id },
    });
    if (signed > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该套餐已有签约记录，不能删除，请改为下架',
      );
    }
    await this.prisma.healthSignPackage.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.signPackage.remove',
      `shop=${ctx.shop.id} package=${row.id}`,
    );
    return { ok: true, message: '签约套餐已删除' };
  }

  private async signOrderRows(
    shopId: number,
    rows: {
      id: number;
      packageId: number;
      patientId: number;
      customerId: number;
      orderId: number;
      teamId: number;
      practitionerId: number;
      startAt: Date;
      endAt: Date;
      status: string;
      signPhotoUrl: string;
      signatureUrl: string;
      verifyCode: string;
      verified: boolean;
      benefitsUsedJson: unknown;
      createdAt: Date;
    }[],
  ): Promise<HealthSignOrderRow[]> {
    if (!rows.length) return [];
    const packageIds = [...new Set(rows.map((row) => row.packageId))];
    const orderIds = [
      ...new Set(rows.map((row) => row.orderId).filter((id) => id > 0)),
    ];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const teamIds = [
      ...new Set(rows.map((row) => row.teamId).filter((id) => id > 0)),
    ];
    const practitionerIds = [
      ...new Set(rows.map((row) => row.practitionerId).filter((id) => id > 0)),
    ];
    const [packages, orders, patients, customers, teams, practitioners] =
      await Promise.all([
        this.prisma.healthSignPackage.findMany({
          where: { shopId, id: { in: packageIds } },
          select: { id: true, name: true, priceCents: true, rightsJson: true },
        }),
        orderIds.length
          ? this.prisma.healthOrder.findMany({
              where: { shopId, id: { in: orderIds } },
              select: { id: true, orderNo: true, payAmountCents: true },
            })
          : [],
        patientIds.length
          ? this.prisma.healthPatient.findMany({
              where: { shopId, id: { in: patientIds } },
              select: { id: true, name: true },
            })
          : [],
        customerIds.length
          ? this.prisma.healthCustomer.findMany({
              where: { shopId, id: { in: customerIds } },
              select: { id: true, nickname: true },
            })
          : [],
        teamIds.length
          ? this.prisma.healthTeam.findMany({
              where: { shopId, id: { in: teamIds } },
              select: { id: true, name: true },
            })
          : [],
        practitionerIds.length
          ? this.prisma.healthPractitioner.findMany({
              where: { shopId, id: { in: practitionerIds } },
              select: { id: true, name: true },
            })
          : [],
      ]);
    const packageMap = new Map(packages.map((row) => [row.id, row]));
    const orderMap = new Map(orders.map((row) => [row.id, row]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row.nickname]));
    const teamMap = new Map(teams.map((row) => [row.id, row.name]));
    const practitionerMap = new Map(
      practitioners.map((row) => [row.id, row.name]),
    );
    return rows.map((row) => {
      const pack = packageMap.get(row.packageId);
      const order = orderMap.get(row.orderId);
      const used = jsonArr<Record<string, unknown>>(row.benefitsUsedJson);
      const usedMap = new Map(
        used.map((item) => [safeText(item.key), numOf(item.used)]),
      );
      const rights = jsonArr<Record<string, unknown>>(pack?.rightsJson);
      return {
        id: row.id,
        orderId: row.orderId,
        orderNo: order?.orderNo ?? '',
        packageId: row.packageId,
        packageName: pack?.name ?? '',
        patientId: row.patientId,
        patientName: patientMap.get(row.patientId) ?? '',
        customerName: customerMap.get(row.customerId) ?? '',
        teamName: teamMap.get(row.teamId) ?? '',
        practitionerName: practitionerMap.get(row.practitionerId) ?? '',
        status: (SIGN_STATUSES.has(row.status)
          ? row.status
          : 'PENDING_PAYMENT') as HealthSignOrderRow['status'],
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        amountCents: order?.payAmountCents ?? pack?.priceCents ?? 0,
        signPhotoUrl: row.signPhotoUrl,
        signatureUrl: row.signatureUrl,
        verifyCode: row.verifyCode,
        verified: row.verified,
        benefitUsed: rights.map((item) => {
          const key = safeText(item.key);
          return {
            key,
            label: safeText(item.label),
            used: usedMap.get(key) ?? 0,
            quota: numOf(item.quota),
          };
        }),
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async signOrders(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'sign');
    const patientId = intIn(query.patientId, 0, 2_000_000_000, 0);
    const signStatus = this.pickFilter(query.signStatus);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (patientId > 0) where.patientId = patientId;
    if (signStatus) where.status = signStatus;
    const [rows, total] = await Promise.all([
      this.prisma.healthSignOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthSignOrder.count({ where }),
    ]);
    return {
      list: await this.signOrderRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async signOrderDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthSignOrderRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'sign');
    const row = await this.prisma.healthSignOrder.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '签约记录不存在');
    const [mapped] = await this.signOrderRows(ctx.shop.id, [row]);
    return mapped;
  }

  async signOrderSignSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      signPhotoUrl: string;
      signatureUrl: string;
    },
  ): Promise<HealthSignOrderRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'sign');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthSignOrder.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '签约记录不存在');
    if (!body.signPhotoUrl && !body.signatureUrl) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请上传签约照片或手写签名',
      );
    }
    const updated = await this.prisma.healthSignOrder.update({
      where: { id: row.id },
      data: {
        signPhotoUrl: body.signPhotoUrl,
        signatureUrl: body.signatureUrl,
        verifyCode: row.verifyCode || makeNo('SQ').slice(-8),
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.signOrder.sign',
      `shop=${ctx.shop.id} signOrder=${row.id}`,
    );
    const [mapped] = await this.signOrderRows(ctx.shop.id, [updated]);
    return mapped;
  }

  // ---------- 绿通 ----------

  private async greenRows(
    shopId: number,
    rows: {
      id: number;
      orderId: number;
      patientId: number;
      customerId: number;
      kind: string;
      targetHospital: string;
      targetDepartment: string;
      demandAt: Date | null;
      urgency: string;
      symptoms: string;
      filesJson: unknown;
      status: string;
      matchedHospital: string;
      matchedDoctor: string;
      matchedAt: Date | null;
      amountCents: number;
      createdAt: Date;
    }[],
  ): Promise<HealthGreenOrderRow[]> {
    if (!rows.length) return [];
    const orderIds = [
      ...new Set(rows.map((row) => row.orderId).filter((id) => id > 0)),
    ];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const [orders, patients, customers, progress] = await Promise.all([
      orderIds.length
        ? this.prisma.healthOrder.findMany({
            where: { shopId, id: { in: orderIds } },
            select: { id: true, orderNo: true },
          })
        : [],
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
      this.prisma.healthGreenProgress.findMany({
        where: { shopId, greenId: { in: rows.map((row) => row.id) } },
        orderBy: [{ happenAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const orderMap = new Map(orders.map((row) => [row.id, row.orderNo]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row.nickname]));
    const progressByGreen = new Map<number, typeof progress>();
    for (const item of progress) {
      const list = progressByGreen.get(item.greenId) ?? [];
      list.push(item);
      progressByGreen.set(item.greenId, list);
    }
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      orderNo: orderMap.get(row.orderId) ?? '',
      patientId: row.patientId,
      patientName: patientMap.get(row.patientId) ?? '',
      customerName: customerMap.get(row.customerId) ?? '',
      kind: row.kind === 'OPERATION' ? 'OPERATION' : 'GREEN',
      targetHospital: row.targetHospital,
      targetDepartment: row.targetDepartment,
      expectAt: toIso(row.demandAt),
      urgency: row.urgency,
      symptomText: row.symptoms,
      attachments: jsonArr<{ name?: unknown; url?: unknown }>(row.filesJson)
        .map((item) => ({
          name: safeText(item.name),
          url: safeText(item.url),
        }))
        .filter((item) => item.url),
      status: (GREEN_STATUSES.has(row.status)
        ? row.status
        : 'PENDING') as HealthGreenOrderRow['status'],
      matchedHospital: row.matchedHospital,
      matchedDoctor: row.matchedDoctor,
      matchedAt: toIso(row.matchedAt),
      progress: (progressByGreen.get(row.id) ?? []).map((item) => ({
        at: toIso(item.happenAt),
        label: item.stepName,
        note: item.detail,
        operatorName: item.operatorName,
      })),
      amountCents: row.amountCents,
      createdAt: toIso(row.createdAt),
    }));
  }

  async greenOrders(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'green');
    const greenStatus = this.pickFilter(query.greenStatus);
    const kind = this.pickFilter(query.kind);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (greenStatus) where.status = greenStatus;
    if (kind) where.kind = kind;
    if (keyword) where.symptoms = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthGreenOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthGreenOrder.count({ where }),
    ]);
    return {
      list: await this.greenRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async greenDetail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthGreenOrderRow> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'green');
    const row = await this.prisma.healthGreenOrder.findFirst({
      where: { id: intIn(query.id, 1, 2_000_000_000, 0), shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '绿通单不存在');
    const [mapped] = await this.greenRows(ctx.shop.id, [row]);
    return mapped;
  }

  async greenProgress(
    user: CurrentUser,
    body: HealthGreenProgressBody,
  ): Promise<HealthGreenOrderRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'green');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthGreenOrder.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '绿通单不存在');
    const matchedAt = dateOf(body.matchedAt);
    const updated = await this.prisma.healthGreenOrder.update({
      where: { id: row.id },
      data: {
        status: body.status,
        matchedHospital: body.matchedHospital || row.matchedHospital,
        matchedDoctor: body.matchedDoctor || row.matchedDoctor,
        matchedAt: matchedAt ?? row.matchedAt,
      },
    });
    await this.prisma.healthGreenProgress.create({
      data: {
        shopId: ctx.shop.id,
        greenId: row.id,
        stepName: HEALTH_GREEN_STATUS_LABELS[body.status] ?? body.status,
        detail: body.note,
        operatorName: user.username ?? '',
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.green.progress',
      `shop=${ctx.shop.id} green=${row.id} status=${body.status}`,
    );
    const [mapped] = await this.greenRows(ctx.shop.id, [updated]);
    return mapped;
  }

  // ---------- 疾病百科与导诊 ----------

  private async diseaseRows(
    shopId: number,
    rows: {
      id: number;
      name: string;
      category: string;
      departmentsJson: unknown;
      overview: string;
      advice: string;
      auditStatus: string;
      status: string;
    }[],
  ): Promise<HealthDiseaseRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [symptoms, departments] = await Promise.all([
      this.prisma.healthDiseaseSymptom.findMany({
        where: { shopId, diseaseId: { in: ids } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.healthDepartment.findMany({
        where: { shopId },
        select: { id: true, name: true },
      }),
    ]);
    const departmentMap = new Map(departments.map((row) => [row.id, row.name]));
    const symptomByDisease = new Map<number, typeof symptoms>();
    for (const item of symptoms) {
      const list = symptomByDisease.get(item.diseaseId) ?? [];
      list.push(item);
      symptomByDisease.set(item.diseaseId, list);
    }
    return rows.map((row) => {
      const departmentIds = jsonArr<unknown>(row.departmentsJson)
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
      const list = symptomByDisease.get(row.id) ?? [];
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        departmentIds,
        departmentNames: departmentIds
          .map((id) => departmentMap.get(id) ?? '')
          .filter(Boolean),
        symptomIds: list.map((item) => item.id),
        symptomNames: list.map((item) => item.symptom),
        overview: row.overview,
        advice: row.advice,
        auditStatus: (['PENDING', 'APPROVED', 'REJECTED', 'OFFLINE'].includes(
          row.auditStatus,
        )
          ? row.auditStatus
          : 'APPROVED') as HealthDiseaseRow['auditStatus'],
        status: row.status === 'ON' ? 'ON' : 'OFF',
      };
    });
  }

  async diseases(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip, keyword } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'green');
    const category = clip(query.category, 40);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (category) where.category = category;
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthDisease.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthDisease.count({ where }),
    ]);
    return {
      list: await this.diseaseRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async diseaseSave(
    user: CurrentUser,
    body: HealthDiseaseSaveBody,
  ): Promise<HealthDiseaseRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'green');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthDisease.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '疾病条目不存在');
    }
    const departments = body.departmentIds.length
      ? await this.prisma.healthDepartment.findMany({
          where: { shopId: ctx.shop.id, id: { in: body.departmentIds } },
          select: { id: true, name: true },
        })
      : [];
    if (departments.length !== new Set(body.departmentIds).size) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '部分推荐科室不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      category: body.category,
      departmentsJson: body.departmentIds,
      departmentId: departments[0]?.id ?? 0,
      departmentName: departments[0]?.name ?? '',
      overview: body.overview,
      advice: body.advice,
      desc: clip(body.overview.replace(/\s+/g, ' '), 1000),
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthDisease.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthDisease.create({ data });
    await this.prisma.$transaction([
      this.prisma.healthDiseaseSymptom.deleteMany({
        where: { shopId: ctx.shop.id, diseaseId: row.id },
      }),
      ...(body.symptomNames.length
        ? [
            this.prisma.healthDiseaseSymptom.createMany({
              data: body.symptomNames.map((symptom) => ({
                shopId: ctx.shop.id,
                diseaseId: row.id,
                symptom,
              })),
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.disease.update' : 'health.disease.create',
      `shop=${ctx.shop.id} disease=${row.id} symptoms=${body.symptomNames.length}`,
    );
    const [mapped] = await this.diseaseRows(ctx.shop.id, [row]);
    return mapped;
  }

  async diseaseRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'green');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthDisease.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '疾病条目不存在');
    await this.prisma.$transaction([
      this.prisma.healthDiseaseSymptom.deleteMany({
        where: { shopId: ctx.shop.id, diseaseId: row.id },
      }),
      this.prisma.healthDisease.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.disease.remove',
      `shop=${ctx.shop.id} disease=${row.id}`,
    );
    return { ok: true, message: '疾病条目已删除' };
  }

  async guidanceSimulate(
    user: CurrentUser,
    body: {
      shopId: number;
      symptomNames: string[];
      patientAge: number;
      patientGender: string;
    },
  ): Promise<HealthGuidanceResult> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'green');
    const symptoms = body.symptomNames
      .map((item) => clip(item, 30))
      .filter(Boolean);
    const hits = await this.prisma.healthDiseaseSymptom.findMany({
      where: { shopId: ctx.shop.id, symptom: { in: symptoms } },
      select: { diseaseId: true, symptom: true },
    });
    const diseaseIds = [...new Set(hits.map((row) => row.diseaseId))];
    if (!diseaseIds.length) {
      return {
        symptomNames: symptoms,
        departments: [],
        practitioners: [],
        disclaimer: '以上为就医参考建议，不能作为诊断结论。',
      };
    }
    const [diseases, departments, practitioners] = await Promise.all([
      this.prisma.healthDisease.findMany({
        where: { shopId: ctx.shop.id, id: { in: diseaseIds }, status: 'ON' },
      }),
      this.prisma.healthDepartment.findMany({
        where: { shopId: ctx.shop.id },
        select: { id: true, name: true },
      }),
      this.prisma.healthPractitioner.findMany({
        where: {
          shopId: ctx.shop.id,
          status: 'ON',
          auditStatus: 'APPROVED',
          role: 'DOCTOR',
        },
        select: {
          id: true,
          name: true,
          role: true,
          title: true,
          departmentId: true,
          hospitalId: true,
          scoreSum: true,
          scoreCount: true,
        },
      }),
    ]);
    const departmentMap = new Map(departments.map((row) => [row.id, row.name]));
    const byDepartment = new Map<
      number,
      { hitDiseases: string[]; advice: string[]; symptomSet: Set<string> }
    >();
    for (const disease of diseases) {
      const diseaseSymptomHits = hits
        .filter((hit) => hit.diseaseId === disease.id)
        .map((hit) => hit.symptom);
      for (const departmentId of jsonArr<unknown>(disease.departmentsJson)
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)) {
        const bucket = byDepartment.get(departmentId) ?? {
          hitDiseases: [],
          advice: [],
          symptomSet: new Set<string>(),
        };
        bucket.hitDiseases.push(disease.name);
        if (disease.advice) bucket.advice.push(disease.advice);
        for (const symptom of diseaseSymptomHits)
          bucket.symptomSet.add(symptom);
        byDepartment.set(departmentId, bucket);
      }
    }
    const hospitals = await this.prisma.healthHospital.findMany({
      where: { shopId: ctx.shop.id },
      select: { id: true, name: true },
    });
    const hospitalMap = new Map(hospitals.map((row) => [row.id, row.name]));
    const matchedDepartments = [...byDepartment.entries()]
      .map(([departmentId, bucket]) => ({
        departmentId,
        departmentName: departmentMap.get(departmentId) ?? '',
        hitDiseases: bucket.hitDiseases,
        advice: bucket.advice[0] ?? '',
        symptomHits: bucket.symptomSet.size,
      }))
      .filter((row) => row.departmentName)
      .sort((a, b) => b.symptomHits - a.symptomHits);
    const departmentIds = new Set(
      matchedDepartments.map((row) => row.departmentId),
    );
    const recommended = practitioners
      .filter((row) => departmentIds.has(row.departmentId))
      .map((row) => {
        const bucket = byDepartment.get(row.departmentId);
        const hits = bucket?.symptomSet.size ?? 0;
        const score =
          (row.scoreCount > 0 ? row.scoreSum / row.scoreCount : 0) * 10 +
          hits * 5;
        return {
          practitionerId: row.id,
          name: row.name,
          role: row.role as HealthGuidanceResult['practitioners'][number]['role'],
          title: row.title,
          departmentName: departmentMap.get(row.departmentId) ?? '',
          hospitalName: hospitalMap.get(row.hospitalId) ?? '',
          score: Math.round(score * 10) / 10,
          reason: bucket?.hitDiseases.length
            ? `擅长${bucket.hitDiseases.slice(0, 3).join('、')}`
            : '本店该科室在岗医生',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    return {
      symptomNames: symptoms,
      departments: matchedDepartments.map((row) => ({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        hitDiseases: row.hitDiseases,
        advice: row.advice,
      })),
      practitioners: recommended,
      disclaimer: '以上为就医参考建议，不能作为诊断结论。',
    };
  }
}
