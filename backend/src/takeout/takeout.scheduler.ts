import { Logger } from '../common/logger';
import type { TakeoutOrderService } from './takeout.order.service';
import type { TakeoutScrmService } from './takeout.scrm.service';

/**
 * 外卖订单定时回收：每 60 秒回收超时未付款订单（回补库存/券/积分），
 * 并顺带投递 SCRM 外发箱。与品牌商城调度同形态，但读写只落 takeout_* 表。
 */
export class TakeoutScheduler {
  private readonly logger = new Logger(TakeoutScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly orders: TakeoutOrderService,
    private readonly scrm: TakeoutScrmService,
  ) {}

  onModuleInit() {
    if (String(process.env.TAKEOUT_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('外卖订单调度已禁用（TAKEOUT_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.TAKEOUT_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `外卖订单调度已启动：每 ${intervalMs}ms 回收超时未付款订单`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const cancelled = await this.orders.autoCancelExpired();
      if (cancelled > 0) {
        this.logger.log(`外卖超时未付款订单已取消 ${cancelled} 笔，库存已回补`);
      }
    } catch (error) {
      this.logger.error(
        `外卖订单回收失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
    try {
      const scrm = await this.scrm.drain();
      if (scrm.sent > 0 || scrm.skipped > 0 || scrm.failed > 0) {
        this.logger.log(
          `外卖企微事件外发：成功 ${scrm.sent}，跳过 ${scrm.skipped}，失败 ${scrm.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `外卖企微事件外发失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
