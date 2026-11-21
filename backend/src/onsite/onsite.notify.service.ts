import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { NotificationService } from '../notifications/notification.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 订阅消息字段位约定。
 *
 * 微信的订阅消息字段名由**用户自己小程序里的模板**决定，平台无法代猜。
 * 这里的约定写死在代码里并在后台文案里公示：租户在微信公众平台挑模板时，
 * 需要选字段顺序为「服务项目 / 上门时间 / 联系电话 / 订单金额 / 服务地址」这一类模板；
 * 字段对不上时微信返回 47003，服务只留痕不抛错——通知失败绝不能把下单流程带崩。
 */
const TEMPLATE_FIELDS: Record<string, string[]> = {
  order: ['thing1', 'date2', 'phone3', 'amount4', 'thing5'],
  accept: ['thing1', 'date2', 'name3', 'phrase4'],
  cancel: ['thing1', 'date2', 'phrase3', 'thing4'],
  coachChange: ['thing1', 'name2', 'phone3', 'date4'],
  help: ['thing1', 'date2', 'character_string3', 'thing4'],
};

const clock = (at: Date | null) =>
  at ? new Date(at).toLocaleString('zh-CN', { hour12: false }) : '';

const clip = (value: string, max: number) =>
  String(value || '')
    .slice(0, max)
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9:：\-/ ]/g, '');

type OrderLike = {
  id: number;
  shopId: number;
  orderNo: string;
  status: string;
  staffId: number;
  customerId: number;
  customerPhone: string;
  startAt: Date;
  serviceFee: unknown;
  payAmount: unknown;
};

/**
 * 上门服务的触达编排：站内信（一定能到）+ 微信小程序订阅消息（凭据齐了才发）。
 *
 * 与参考源码的差异：那边 RabbitMQ + 多通道（短信/语音/服务号）在 PHP 侧并行投递，
 * 本方案一期只用「站内信 + 小程序订阅消息」两条，短信与语音在 P4 随虚拟号一起接，
 * 且**所有失败都不回抛**——触达是旁路，不能变成下单的前置条件。
 */
export class OnsiteNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly notifications: NotificationService,
  ) {}

  private async order(
    shopId: number,
    orderId: number,
  ): Promise<OrderLike | null> {
    return this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
    });
  }

  /** 站内信只发给有站内账号的人：店主必发，绑定了账号的技师也发。 */
  private async inApp(
    shop: { id: number; ownerUserId: string },
    userIds: string[],
    input: { title: string; body: string; entityId: string; link?: string },
  ) {
    for (const userId of Array.from(new Set(userIds.filter(Boolean)))) {
      await this.notifications
        .notify(userId, {
          title: input.title.slice(0, 200),
          body: input.body.slice(0, 1000),
          link: input.link || `/onsite/order?orderId=${input.entityId}`,
          category: 'business',
          entityType: 'onsite_order',
          entityId: input.entityId,
        })
        .catch(() => undefined);
    }
    void shop;
  }

  private async subscribe(
    shopId: number,
    slot: keyof typeof TEMPLATE_FIELDS,
    openId: string,
    values: string[],
  ) {
    try {
      const subject = await this.miniAppSubject(shopId);
      const runtime = await this.miniApp.runtime(subject);
      const templates = await this.miniApp.templates(subject);
      const templateId = templates[String(slot)] || '';
      if (!runtime || !templateId || !openId) return { sent: false };
      const keys = TEMPLATE_FIELDS[String(slot)] ?? [];
      const data: Record<string, { value: string }> = {};
      keys.forEach((key, index) => {
        const value = values[index] ?? '';
        if (value) data[key] = { value };
      });
      return await this.client.sendSubscribeMessage(runtime, {
        templateId,
        openId,
        page: 'pages/order/order',
        data,
      });
    } catch {
      // 触达失败只影响提醒，不影响业务；原因由调用侧的订单流水兜住
      return { sent: false };
    }
  }

  private async miniAppSubject(shopId: number) {
    const shop = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return {
      ownerUserId: shop.ownerUserId,
      scene: 'ONSITE' as const,
      shopId: shop.id,
      shopName: shop.name,
    };
  }

  async orderCreated(shopId: number, orderId: number) {
    const [shop, order] = await Promise.all([
      this.prisma.onsiteShop.findUnique({ where: { id: shopId } }),
      this.order(shopId, orderId),
    ]);
    if (!shop || !order) return;
    await this.inApp(shop, [shop.ownerUserId], {
      title: `新订单 ${order.orderNo}（待付款）`,
      body: `预约时间 ${clock(order.startAt)}，金额 ${(
        Number(order.payAmount) || 0
      ).toFixed(2)} 元`,
      entityId: String(order.id),
    });
  }

  async orderPaid(shopId: number, orderId: number) {
    const [shop, order] = await Promise.all([
      this.prisma.onsiteShop.findUnique({ where: { id: shopId } }),
      this.order(shopId, orderId),
    ]);
    if (!shop || !order) return;
    const staff = order.staffId
      ? await this.prisma.onsiteStaff.findUnique({
          where: { id: order.staffId },
        })
      : null;
    await this.inApp(shop, [shop.ownerUserId, staff?.accountUserId || ''], {
      title: `订单 ${order.orderNo} 已付款，请尽快接单`,
      body: `上门时间 ${clock(order.startAt)}${staff ? `，指派：${staff.name}` : ''}`,
      entityId: String(order.id),
    });
  }

  async orderDispatched(shopId: number, orderId: number) {
    await this.orderPaid(shopId, orderId);
  }

  /** 履约节点通知顾客（顾客只有小程序身份，走订阅消息，不发站内信）。 */
  async statusChanged(shopId: number, orderId: number, action: string) {
    const [shop, order] = await Promise.all([
      this.prisma.onsiteShop.findUnique({ where: { id: shopId } }),
      this.order(shopId, orderId),
    ]);
    if (!shop || !order) return;
    const customer = await this.prisma.onsiteCustomer.findUnique({
      where: { id: order.customerId },
    });
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id },
      take: 3,
    });
    const serviceName = clip(
      items.map((item) => `${item.title}×${item.quantity}`).join('、'),
      20,
    );
    const amount = `${(Number(order.payAmount) || 0).toFixed(2)}元`;
    if (action === 'accept') {
      await this.subscribe(shopId, 'order', customer?.openid || '', [
        serviceName,
        clock(order.startAt),
        order.customerPhone,
        amount,
      ]);
    } else if (['depart', 'arrive'].includes(action)) {
      const staff = order.staffId
        ? await this.prisma.onsiteStaff.findUnique({
            where: { id: order.staffId },
          })
        : null;
      await this.subscribe(shopId, 'coachChange', customer?.openid || '', [
        serviceName,
        staff?.name || '',
        staff?.phone || '',
        clock(order.startAt),
      ]);
    } else if (['reject', 'cancel', 'expire'].includes(action)) {
      await this.subscribe(shopId, 'cancel', customer?.openid || '', [
        serviceName,
        clock(order.startAt),
        '已取消',
        amount,
      ]);
    }
    if (['complete', 'reject'].includes(action)) {
      await this.inApp(shop, [shop.ownerUserId], {
        title: `订单 ${order.orderNo} ${action === 'complete' ? '已完成' : '被拒单'}`,
        body:
          action === 'complete'
            ? `服务已结束， ${(Number(order.payAmount) || 0).toFixed(2)} 元`
            : '技师拒单，请尽快改派或联系顾客退款',
        entityId: String(order.id),
      });
    }
  }

  /** 一键报警：站内信直达店主（P4 再补短信与语音外呼）。 */
  async alertRaised(input: {
    shopId: number;
    alertId: number;
    staffName: string;
    address: string;
    phone: string;
  }) {
    const shop = await this.prisma.onsiteShop.findUnique({
      where: { id: input.shopId },
    });
    if (!shop) return;
    await this.notifications
      .notify(shop.ownerUserId, {
        title: `【求救】${input.staffName} 发起一键报警`,
        body: `位置：${input.address || '未获取到定位'}${
          input.phone ? `；联系电话 ${input.phone}` : ''
        }，请立即联系确认安全`,
        link: `/onsite/aftersale?panel=alert&alertId=${input.alertId}`,
        category: 'platform',
        level: 'error',
        entityType: 'onsite_alert',
        entityId: String(input.alertId),
      })
      .catch(() => undefined);
  }

  /**
   * 退款申请：只提醒店主，文案里必须带**可操作入口**。
   *
   * `apply` 的调用方是 C 端（顾客）或店主代申请，此时还没有 refundId 的站内实体，
   * 链接指向售后页签并按订单号过滤，点进去就能看到待处理的那一条。
   */
  async refundRequested(input: {
    shopId: number;
    ownerUserId: string;
    orderNo: string;
    refundNo: string;
    amountCents: number;
    reason: string;
  }) {
    if (!input.ownerUserId) return;
    await this.notifications
      .notify(input.ownerUserId, {
        title: `订单 ${input.orderNo} 申请退款 ${(input.amountCents / 100).toFixed(2)} 元`,
        body: `退款单 ${input.refundNo}；原因：${input.reason || '未填写'}，请在售后页处理`,
        link: `/onsite/aftersale?panel=refund&orderNo=${encodeURIComponent(input.orderNo)}`,
        category: 'business',
        entityType: 'onsite_refund',
        entityId: input.refundNo,
      })
      .catch(() => undefined);
  }

  /** 退款到账：顾客侧走订阅消息（顾客没有站内账号），店主侧留一条站内信便于对账。 */
  async refundDone(shopId: number, orderId: number, refundCents: number) {
    const [shop, order] = await Promise.all([
      this.prisma.onsiteShop.findUnique({ where: { id: shopId } }),
      this.order(shopId, orderId),
    ]);
    if (!shop || !order) return;
    const customer = await this.prisma.onsiteCustomer.findUnique({
      where: { id: order.customerId },
    });
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id },
      take: 3,
    });
    await this.subscribe(shopId, 'cancel', customer?.openid || '', [
      clip(
        items.map((item) => `${item.title}×${item.quantity}`).join('、'),
        20,
      ),
      clock(order.startAt),
      '已退款',
      `${(refundCents / 100).toFixed(2)}元`,
    ]);
    await this.inApp(shop, [shop.ownerUserId], {
      title: `订单 ${order.orderNo} 已退款 ${(refundCents / 100).toFixed(2)} 元`,
      body: '分账与工时已按退款后的真实金额回收，可在订单详情核对。',
      entityId: String(order.id),
    });
  }

  /** 驳回退款：顾客必须知道原因，否则只会重复申请或投诉。 */
  async refundRejected(shopId: number, orderId: number, remark: string) {
    const order = await this.order(shopId, orderId);
    if (!order) return;
    const customer = await this.prisma.onsiteCustomer.findUnique({
      where: { id: order.customerId },
    });
    await this.subscribe(shopId, 'cancel', customer?.openid || '', [
      clip(order.orderNo, 20),
      clock(order.startAt),
      '退款被驳回',
      remark ? clip(remark, 20) : '详见订单详情',
    ]);
  }

  /** 新评价：绑定了站内账号的技师第一时间看到；差评同时提醒店主。 */
  async reviewCreated(shopId: number, reviewId: number) {
    const [shop, review] = await Promise.all([
      this.prisma.onsiteShop.findUnique({ where: { id: shopId } }),
      this.prisma.onsiteReview.findFirst({ where: { id: reviewId, shopId } }),
    ]);
    if (!shop || !review) return;
    const staff = review.staffId
      ? await this.prisma.onsiteStaff.findUnique({
          where: { id: review.staffId },
          select: { accountUserId: true, name: true },
        })
      : null;
    const userIds = [shop.ownerUserId, staff?.accountUserId || ''];
    await this.inApp(shop, userIds, {
      title: `${review.rating} 星评价${staff ? `：${staff.name}` : ''}`,
      body: `${review.content || '顾客未填写文字'}${
        review.status === 'HIDDEN' ? '（当前为待审核状态）' : ''
      }`,
      entityId: String(review.id),
      link: `/onsite/review?reviewId=${review.id}`,
    });
  }
}
