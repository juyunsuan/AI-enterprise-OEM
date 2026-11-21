import {
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  type HealthAlertRow,
  type HealthOrderRow,
} from '@enterprise/contracts';
import type { PrismaService } from '../prisma/prisma.service';
import { jsonArr, toIso } from './health.shared';

/** 手机号列表/导出统一脱敏：保留前 3 后 4，其余打码。 */
export function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/\s+/g, '');
  if (!digits) return '';
  if (digits.length <= 7) return `${digits.slice(0, 2)}****`;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 生日 → 周岁；格式非法返回 0（不猜年龄）。 */
export function ageOf(birthday: string): number {
  const text = String(birthday || '');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (
    now.getMonth() + 1 < month ||
    (now.getMonth() + 1 === month && now.getDate() < day)
  ) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : 0;
}

const firstNameOf = (values: Map<number, string>, id: number): string =>
  id > 0 ? (values.get(id) ?? '') : '';

const joinSlot = (
  workDate: string,
  startTime: string,
  endTime: string,
): string => (workDate ? `${workDate} ${startTime}-${endTime}` : '');

/**
 * 订单行（`HealthOrderRow`）的只读视图装配。
 *
 * 金额口径：`goodsAmountCents/serviceAmountCents` 是同一列按订单类型分流；
 * `shopEarnCents` = 实付 − 医护分成（`commissionPercent`，未填按 0），不含机构分成，
 * 机构分成与平台流水在资金域单独记账，不在这里重复计算。
 */
export async function orderRowsOf(
  prisma: PrismaService,
  shopId: number,
  orders: {
    id: number;
    orderNo: string;
    orderType: string;
    customerId: number;
    patientIdsJson: unknown;
    serviceId: number;
    goodsAmountCents: number;
    discountCents: number;
    shippingCents: number;
    payAmountCents: number;
    refundAmountCents: number;
    pointDeductCents: number;
    couponTicketId: number;
    payWay: string;
    payStatus: string;
    status: string;
    slotId: number;
    consultId: number;
    receiverJson: unknown;
    remark: string;
    auditNote: string;
    prescriptionId: number;
    refundedAt: Date | null;
    cancelReason: string;
    closedAt: Date | null;
    autoCancelAt: Date | null;
    verifiedAt: Date | null;
    finishedAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[],
): Promise<HealthOrderRow[]> {
  if (!orders.length) return [];
  const orderIds = orders.map((order) => order.id);
  const customerIds = [
    ...new Set(orders.map((order) => order.customerId).filter((id) => id > 0)),
  ];
  const patientIds = [
    ...new Set(
      orders.flatMap((order) =>
        jsonArr<number>(order.patientIdsJson).filter(
          (id) => typeof id === 'number',
        ),
      ),
    ),
  ];
  const slotIds = [
    ...new Set(orders.map((order) => order.slotId).filter((id) => id > 0)),
  ];
  const consultIds = [
    ...new Set(orders.map((order) => order.consultId).filter((id) => id > 0)),
  ];

  const [customers, patients, items, slots, consults, codes, shipments, logs] =
    await Promise.all([
      customerIds.length
        ? prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
      patientIds.length
        ? prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      prisma.healthOrderItem.findMany({
        where: { shopId, orderId: { in: orderIds } },
        orderBy: { id: 'asc' },
      }),
      slotIds.length
        ? prisma.healthSlot.findMany({
            where: { shopId, id: { in: slotIds } },
            select: {
              id: true,
              workDate: true,
              startTime: true,
              endTime: true,
            },
          })
        : [],
      consultIds.length
        ? prisma.healthConsult.findMany({
            where: { shopId, id: { in: consultIds } },
            select: { id: true, appointAt: true, practitionerId: true },
          })
        : [],
      prisma.healthVerifyCode.findMany({
        where: { shopId, orderId: { in: orderIds } },
        select: { orderId: true, code: true, verifiedAt: true },
      }),
      prisma.healthOrderShipment.findMany({
        where: { shopId, orderId: { in: orderIds } },
        orderBy: { id: 'desc' },
        select: { orderId: true, shippedAt: true, receivedAt: true },
      }),
      prisma.healthOrderStatusLog.findMany({
        where: { shopId, orderId: { in: orderIds }, toStatus: 'ACCEPTED' },
        orderBy: { id: 'asc' },
        select: { orderId: true, createdAt: true },
      }),
    ]);

  const itemByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemByOrder.set(item.orderId, list);
  }
  const practitionerIds = [
    ...new Set(
      items
        .map((item) => item.practitionerId)
        .filter((id) => id > 0)
        .concat(
          consults.map((item) => item.practitionerId).filter((id) => id > 0),
        ),
    ),
  ];
  const practitioners = practitionerIds.length
    ? await prisma.healthPractitioner.findMany({
        where: { shopId, id: { in: practitionerIds } },
        select: {
          id: true,
          name: true,
          organId: true,
          commissionPercent: true,
        },
      })
    : [];
  const organIds = [
    ...new Set(practitioners.map((row) => row.organId).filter((id) => id > 0)),
  ];
  const organs = organIds.length
    ? await prisma.healthOrgan.findMany({
        where: { shopId, id: { in: organIds } },
        select: { id: true, name: true },
      })
    : [];

  const customerMap = new Map(customers.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row.name]));
  const slotMap = new Map(slots.map((row) => [row.id, row]));
  const consultMap = new Map(consults.map((row) => [row.id, row]));
  const codeMap = new Map(codes.map((row) => [row.orderId, row]));
  const shipmentMap = new Map(shipments.map((row) => [row.orderId, row]));
  const acceptedMap = new Map(logs.map((row) => [row.orderId, row.createdAt]));
  const practitionerMap = new Map(practitioners.map((row) => [row.id, row]));
  const organMap = new Map(organs.map((row) => [row.id, row.name]));

  return orders.map((order) => {
    const itemsOf = itemByOrder.get(order.id) ?? [];
    const firstPatientId = jsonArr<number>(order.patientIdsJson)[0] ?? 0;
    const consult = order.consultId
      ? consultMap.get(order.consultId)
      : undefined;
    const practitionerId =
      itemsOf.find((item) => item.practitionerId > 0)?.practitionerId ??
      consult?.practitionerId ??
      0;
    const practitioner = practitionerId
      ? practitionerMap.get(practitionerId)
      : undefined;
    const slot = order.slotId ? slotMap.get(order.slotId) : undefined;
    const code = codeMap.get(order.id);
    const shipment = shipmentMap.get(order.id);
    const customer = customerMap.get(order.customerId);
    const paidCents = order.payStatus === 'PAID' ? order.payAmountCents : 0;
    const practitionerShare = practitioner
      ? Math.round(
          (order.payAmountCents * practitioner.commissionPercent) / 100,
        )
      : 0;
    const refundStatus = order.refundedAt
      ? order.refundAmountCents >= order.payAmountCents
        ? 'REFUNDED'
        : 'PARTIAL'
      : order.status === 'REFUND_PENDING'
        ? 'REFUNDING'
        : 'NONE';
    const payStatus = order.refundedAt
      ? 'REFUNDED'
      : order.payStatus === 'PAID'
        ? order.refundAmountCents > 0
          ? 'REFUNDING'
          : 'PAID'
        : 'UNPAID';
    return {
      id: order.id,
      orderNo: order.orderNo,
      bizType: order.orderType as HealthOrderRow['bizType'],
      bizTypeLabel:
        HEALTH_ORDER_BIZ_TYPE_LABELS[order.orderType] ?? order.orderType,
      status: (order.status === 'REFUND_PENDING'
        ? 'REFUND_PENDING'
        : order.status) as HealthOrderRow['status'],
      payStatus: payStatus,
      refundStatus,
      customerId: order.customerId,
      customerName: customer?.nickname ?? '',
      customerPhoneMasked: maskPhone(customer?.phone ?? ''),
      patientId: firstPatientId,
      patientName: firstNameOf(patientMap, firstPatientId),
      practitionerId,
      practitionerName: practitioner?.name ?? '',
      organId: practitioner?.organId ?? 0,
      organName: practitioner ? (organMap.get(practitioner.organId) ?? '') : '',
      shopEarnCents: Math.max(0, order.payAmountCents - practitionerShare),
      goodsAmountCents:
        order.orderType === 'GOODS' ? order.goodsAmountCents : 0,
      serviceAmountCents:
        order.orderType === 'GOODS' ? 0 : order.goodsAmountCents,
      shippingCents: order.shippingCents,
      couponCents: order.discountCents,
      pointDeductCents: order.pointDeductCents,
      discountCents: order.discountCents,
      payAmountCents: order.payAmountCents,
      paidCents,
      refundAmountCents: order.refundAmountCents,
      refundableCents: Math.max(0, paidCents - order.refundAmountCents),
      payType: order.payWay,
      walletUsedCents: order.payWay === 'WALLET' ? order.payAmountCents : 0,
      pointUsed: 0,
      verifyCode: code?.code ?? '',
      verified: Boolean(order.verifiedAt ?? code?.verifiedAt),
      verifiedAt: toIso(order.verifiedAt ?? code?.verifiedAt ?? null),
      remark: order.remark,
      shopNote: order.auditNote,
      appointAt: toIso(consult?.appointAt ?? null),
      slotId: order.slotId,
      slotText: slot
        ? joinSlot(slot.workDate, slot.startTime, slot.endTime)
        : '',
      paidAt: toIso(order.paidAt),
      acceptedAt: toIso(
        acceptedMap.get(order.id) ?? consult?.appointAt ?? null,
      ),
      shippedAt: toIso(shipment?.shippedAt ?? null),
      receivedAt: toIso(shipment?.receivedAt ?? null),
      completedAt: toIso(order.finishedAt),
      expireAt: toIso(order.autoCancelAt),
      createdAt: toIso(order.createdAt),
      updatedAt: toIso(order.updatedAt),
    };
  });
}

/** 预警行：规则/指标/责任医护都是展示必需的名称，统一在这里补齐。 */
export async function alertRowsOf(
  prisma: PrismaService,
  shopId: number,
  alerts: {
    id: number;
    ruleId: number;
    patientId: number;
    metricKey: string;
    value: unknown;
    baseline: unknown;
    level: string;
    detailJson: unknown;
    status: string;
    handleBy: string;
    handleNote: string;
    handledAt: Date | null;
    createdAt: Date;
  }[],
): Promise<HealthAlertRow[]> {
  if (!alerts.length) return [];
  const patientIds = [
    ...new Set(alerts.map((row) => row.patientId).filter((id) => id > 0)),
  ];
  const ruleIds = [
    ...new Set(alerts.map((row) => row.ruleId).filter((id) => id > 0)),
  ];
  const metricKeys = [
    ...new Set(alerts.map((row) => row.metricKey).filter(Boolean)),
  ];
  const handleIds = [
    ...new Set(
      alerts
        .map((row) => Number(row.handleBy))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const [patients, rules, metrics, handlers] = await Promise.all([
    patientIds.length
      ? prisma.healthPatient.findMany({
          where: { shopId, id: { in: patientIds } },
          select: {
            id: true,
            name: true,
            customerId: true,
            ownerPractitionerId: true,
          },
        })
      : [],
    ruleIds.length
      ? prisma.healthAlertRule.findMany({
          where: { shopId, id: { in: ruleIds } },
          select: {
            id: true,
            name: true,
            direction: true,
            threshold: true,
            lowThreshold: true,
          },
        })
      : [],
    metricKeys.length
      ? prisma.healthMetric.findMany({
          where: { shopId, mKey: { in: metricKeys } },
          select: { id: true, mKey: true, name: true, unit: true },
        })
      : [],
    handleIds.length
      ? prisma.account.findMany({
          where: { id: { in: handleIds } },
          select: { id: true, username: true },
        })
      : [],
  ]);
  const ownerIds = [
    ...new Set(
      patients.map((row) => row.ownerPractitionerId).filter((id) => id > 0),
    ),
  ];
  const owners = ownerIds.length
    ? await prisma.healthPractitioner.findMany({
        where: { shopId, id: { in: ownerIds } },
        select: { id: true, name: true },
      })
    : [];
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const ruleMap = new Map(rules.map((row) => [row.id, row]));
  const metricMap = new Map(metrics.map((row) => [row.mKey, row]));
  const handlerMap = new Map(
    handlers.map((row) => [String(row.id), row.username]),
  );
  const ownerMap = new Map(owners.map((row) => [row.id, row.name]));

  return alerts.map((row) => {
    const patient = patientMap.get(row.patientId);
    const rule = ruleMap.get(row.ruleId);
    const metric = metricMap.get(row.metricKey);
    const detail =
      row.detailJson && typeof row.detailJson === 'object'
        ? (row.detailJson as Record<string, unknown>)
        : {};
    const measuredAt =
      typeof detail.measuredAt === 'string'
        ? detail.measuredAt
        : toIso(row.createdAt);
    return {
      id: row.id,
      patientId: row.patientId,
      patientName: patient?.name ?? '',
      customerId: patient?.customerId ?? 0,
      ruleId: row.ruleId,
      ruleName: rule?.name ?? '',
      metricId: metric?.id ?? 0,
      metricName: metric?.name ?? row.metricKey,
      unit: metric?.unit ?? '',
      value: Number(row.value ?? 0),
      thresholdText: rule
        ? rule.direction === 'RANGE'
          ? `${Number(rule.lowThreshold ?? 0)}–${Number(rule.threshold ?? 0)}`
          : `${rule.direction === 'ABOVE' ? '≥' : rule.direction === 'BELOW' ? '≤' : '偏离'} ${Number((rule.direction === 'BELOW' ? rule.lowThreshold : rule.threshold) ?? 0)}`
        : '',
      measuredAt,
      severity: row.level,
      status:
        row.status === 'OPEN' ||
        row.status === 'ACKED' ||
        row.status === 'RESOLVED' ||
        row.status === 'FALSE'
          ? row.status
          : 'OPEN',
      ownerPractitionerName: patient
        ? (ownerMap.get(patient.ownerPractitionerId) ?? '')
        : '',
      handleNote: row.handleNote,
      handledAt: toIso(row.handledAt),
      handledBy: handlerMap.get(row.handleBy) ?? row.handleBy,
      createdAt: toIso(row.createdAt),
    };
  });
}
