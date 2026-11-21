import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type {
  MiniAppService,
  MiniAppSubject,
} from '../private-mini/mini-app.service';
import type { NotificationService } from '../notifications/notification.service';
import { amount, toText } from './errand.shared';

/**
 * 订阅消息字段位约定（与上门服务同一口径）：
 * 微信模板字段名由店主自己的小程序模板决定，平台只约定「按这个字段顺序挑模板」，
 * 字段对不上时微信返回 47003，这里只留痕不抛错——触达失败绝不能把订单流程带崩。
 */
const TEMPLATE_FIELDS: Record<string, string[]> = {
  order: ['thing1', 'character_string2', 'amount3', 'thing4', 'date5'],
  accept: ['thing1', 'name2', 'phone3', 'date4'],
  cancel: ['thing1', 'phrase2', 'thing3'],
  coachChange: ['thing1', 'name2', 'phone3', 'date4'],
  help: ['thing1', 'date2', 'character_string3', 'thing4'],
};

const clock = (at: Date | null | undefined) =>
  at ? new Date(at).toLocaleString('zh-CN', { hour12: false }) : '';

type OrderNotice = {
  id: number;
  siteId: number;
  ownerUserId: string;
  orderNo: string;
  serviceType: string;
  status: string;
  openid: string;
  contactName: string;
  contactMobile: string;
  totalAmount: unknown;
  distanceKm: unknown;
  riderId: number;
  riderName: string;
  cancelReason: string;
  fromParty: unknown;
  toParty: unknown;
  createdAt: Date;
  paidAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
};

function addressOf(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const raw = value as Record<string, unknown>;
  return [raw.city, raw.district, raw.address]
    .map((item) => toText(item).trim())
    .filter(Boolean)
    .join('');
}

/**
 * 跑腿触达：站内信（给店主）+ 微信小程序订阅消息（给顾客/骑手）。
 * 所有方法都吞异常，调用方按旁路处理。
 */
export class ErrandNotifyService {
  constructor(
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly notifications: NotificationService,
  ) {}

  private async subscribe(
    site: { ownerUserId: string; id: number; name: string },
    slot: keyof typeof TEMPLATE_FIELDS,
    openId: string,
    values: string[],
    page: string,
  ): Promise<boolean> {
    try {
      if (!openId) return false;
      const subject: MiniAppSubject = {
        ownerUserId: site.ownerUserId,
        scene: 'ERRAND',
        shopId: site.id,
        shopName: site.name,
      };
      const runtime = await this.miniApp.runtime(subject);
      if (!runtime) return false;
      const templates = await this.miniApp.templates(subject);
      const templateId = templates[String(slot)] || '';
      if (!templateId) return false;
      const keys = TEMPLATE_FIELDS[String(slot)] ?? [];
      const data: Record<string, { value: string }> = {};
      keys.forEach((key, index) => {
        const value = String(values[index] ?? '').slice(0, 60);
        if (value) data[key] = { value };
      });
      const result = await this.client.sendSubscribeMessage(runtime, {
        templateId,
        openId,
        page,
        data,
      });
      return result.sent;
    } catch {
      return false;
    }
  }

  private siteOf(order: OrderNotice) {
    return {
      ownerUserId: order.ownerUserId,
      id: order.siteId,
      name: '跑腿',
    };
  }

  async orderCreated(order: OrderNotice): Promise<void> {
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'order',
      order.openid,
      [
        order.orderNo,
        order.serviceType === 'BUY' ? '帮我买' : '帮我送',
        String(amount(order.totalAmount)),
        `${addressOf(order.fromParty)} → ${addressOf(order.toParty)}`,
        clock(order.createdAt),
      ],
      page,
    );
  }

  async paid(order: OrderNotice): Promise<void> {
    void this.notifications
      .notify(order.ownerUserId, {
        title: `新跑腿订单 ${order.orderNo}（待接单）`,
        body: `${order.serviceType === 'BUY' ? '帮我买' : '帮我送'} · ${addressOf(order.fromParty)} → ${addressOf(order.toParty)}`,
        link: `/errand?tab=order`,
        category: 'business',
        entityType: 'errand_order',
        entityId: String(order.id),
      })
      .catch(() => undefined);
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'accept',
      order.openid,
      [order.orderNo, '等待骑手接单', order.contactMobile, clock(order.paidAt)],
      page,
    );
  }

  async accepted(order: OrderNotice): Promise<void> {
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'accept',
      order.openid,
      [
        order.orderNo,
        order.riderName || '骑手',
        order.contactMobile,
        clock(order.acceptedAt),
      ],
      page,
    );
  }

  async arrived(order: OrderNotice): Promise<void> {
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'coachChange',
      order.openid,
      [
        order.orderNo,
        order.riderName || '骑手',
        order.contactMobile,
        clock(order.deliveredAt),
      ],
      page,
    );
  }

  async cancelled(order: OrderNotice): Promise<void> {
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'cancel',
      order.openid,
      [order.orderNo, '已取消', order.cancelReason || '订单已取消'],
      page,
    );
  }

  async riderAbandoned(order: OrderNotice): Promise<void> {
    const page = `pages/order-detail/order-detail?orderNo=${encodeURIComponent(order.orderNo)}`;
    await this.subscribe(
      this.siteOf(order),
      'cancel',
      order.openid,
      [order.orderNo, '骑手已放弃', '正在为你重新派单，请稍候'],
      page,
    );
  }

  ownerCityDisabled(order: OrderNotice): void {
    void this.notifications
      .notify(order.ownerUserId, {
        title: `订单 ${order.orderNo} 所在城市已停用`,
        body: '订单已支付但城市已停用，无法自动派单，请尽快退款或重新开通城市。',
        link: '/errand?tab=order',
        category: 'business',
        entityType: 'errand_order',
        entityId: String(order.id),
      })
      .catch(() => undefined);
  }

  async riderNewOrder(
    order: OrderNotice,
    rider: { openid: string },
  ): Promise<void> {
    await this.subscribe(
      this.siteOf(order),
      'help',
      rider.openid,
      [
        order.orderNo,
        clock(order.paidAt || order.createdAt),
        `${Number(order.distanceKm) || 0} 公里`,
        `${addressOf(order.fromParty)} → ${addressOf(order.toParty)}`,
      ],
      'pages/rider/workbench',
    );
  }
}
