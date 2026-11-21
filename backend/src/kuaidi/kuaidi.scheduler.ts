import { text } from '../common/api';
import { Logger } from '../common/logger';
import type { KuaidiOrderService } from './kuaidi.order.service';

/**
 * 快递寄件超时关单（进程内定时器，与卡密商城同形态）：
 * 每 60 秒把超过支付时限的未付订单置为已关闭，避免待支付单无限堆积。
 *
 * 可用 KUAIDI_SCHEDULER_DISABLED=1 关闭、KUAIDI_SCHEDULER_TICK_MS 调间隔。
 */
export class KuaidiScheduler {
  private readonly logger = new Logger(KuaidiScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly orders: KuaidiOrderService) {}

  onModuleInit() {
    if (String(process.env.KUAIDI_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('快递寄件订单调度已禁用（KUAIDI_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.KUAIDI_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(`快递寄件调度已启动：每 ${intervalMs}ms 关闭超时未付订单`);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.orders.releaseExpiredOrders();
      if (result.orders > 0) {
        this.logger.log(`超时未付订单已关闭 ${result.orders} 笔`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`快递寄件关单失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
