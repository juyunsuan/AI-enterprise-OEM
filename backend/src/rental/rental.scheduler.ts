import { Logger } from '../common/logger';
import type { RentalService } from './rental.service';
import type { RentalScrmService } from './rental.scrm.service';

/** 租赁定时回收：超时未付款关单 + SCRM 外发箱投递。 */
export class RentalScheduler {
  private readonly logger = new Logger(RentalScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly orders: RentalService,
    private readonly scrm: RentalScrmService,
  ) {}

  onModuleInit() {
    if (String(process.env.RENTAL_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('租赁调度已禁用（RENTAL_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.RENTAL_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(`租赁调度已启动：每 ${intervalMs}ms 回收超时未付款租单`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const expired = await this.orders.autoExpire();
      if (expired > 0) this.logger.log(`超时未付款租单已关闭 ${expired} 笔`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`租赁超时关单失败：${reason}`);
    } finally {
      this.busy = false;
    }
    try {
      const result = await this.scrm.drain();
      if (result.sent || result.skipped || result.failed) {
        this.logger.log(
          `租赁企微事件外发：成功 ${result.sent}，跳过 ${result.skipped}，失败 ${result.failed}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`租赁企微事件外发失败：${reason}`);
    }
  }
}
