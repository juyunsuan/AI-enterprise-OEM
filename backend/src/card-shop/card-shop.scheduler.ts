import { text } from '../common/api';
import { Logger } from '../common/logger';
import type { CardShopOrderService } from './card-shop.order.service';

/**
 * 卡密商城定时回收（进程内定时器，与电商/上门同形态）：
 * 每 60 秒关掉超时未付款订单，并把锁卡过期的卡密放回库存。
 *
 * 下单即锁卡，超时单不释放就会把库存越吃越空；回调与关单竞速还会留下
 * 「卡上锁已过期但订单已不是待支付」的残渣，这里一并兜底。
 * 可用 CARD_SHOP_SCHEDULER_DISABLED=1 关闭、CARD_SHOP_SCHEDULER_TICK_MS 调间隔。
 */
export class CardShopScheduler {
  private readonly logger = new Logger(CardShopScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly orders: CardShopOrderService) {}

  onModuleInit() {
    if (String(process.env.CARD_SHOP_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn(
        '卡密商城订单调度已禁用（CARD_SHOP_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    const intervalMs = Number(
      process.env.CARD_SHOP_SCHEDULER_TICK_MS || 60_000,
    );
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `卡密商城调度已启动：每 ${intervalMs}ms 关闭超时未付订单并回收锁卡`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.orders.releaseExpiredLocks();
      if (result.orders > 0 || result.cards > 0) {
        this.logger.log(
          `超时未付订单已关闭 ${result.orders} 笔，回收锁卡 ${result.cards} 张`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`卡密商城回收失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
