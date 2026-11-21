import { Logger } from '../common/logger';
import { text } from '../common/api';
import type { OnsiteOrderService } from './onsite.order.service';

/**
 * 上门服务订单调度（进程内定时器）：
 * 每 60 秒扫一次超时未付款订单，关闭并释放档期。
 *
 * 这一步不是可选的：本方案让「待支付也占档期」（防止两人抢同一档），
 * 所以未付款订单必须被准时释放，否则档期会被僵尸单越堆越满。
 * 可用 ONSITE_SCHEDULER_DISABLED=1 关闭、ONSITE_SCHEDULER_TICK_MS 调间隔。
 */
export class OnsiteScheduler {
  private readonly logger = new Logger(OnsiteScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly orders: OnsiteOrderService) {}

  onModuleInit() {
    if (String(process.env.ONSITE_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('上门服务订单调度已禁用（ONSITE_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.ONSITE_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `上门服务订单调度已启动：每 ${intervalMs}ms 回收超时未付款订单`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.orders.sweepExpired();
      if (result.closed) {
        this.logger.log(`超时未付款订单已关闭 ${result.closed} 笔，档期已释放`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`上门服务订单回收失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
