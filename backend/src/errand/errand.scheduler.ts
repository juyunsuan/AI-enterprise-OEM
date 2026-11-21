import { Logger } from '../common/logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { ErrandOrderService } from './errand.order.service';

/**
 * 跑腿调度（进程内定时器，与快递寄件同形态）：
 * 每 60 秒关闭超时未付订单，并把过期未使用的优惠券票置为 EXPIRED。
 *
 * 可用 ERRAND_SCHEDULER_DISABLED=1 关闭、ERRAND_SCHEDULER_TICK_MS 调间隔。
 */
export class ErrandScheduler {
  private readonly logger = new Logger(ErrandScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: ErrandOrderService,
  ) {}

  onModuleInit() {
    if (String(process.env.ERRAND_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('跑腿调度已禁用（ERRAND_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.ERRAND_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(`跑腿调度已启动：每 ${intervalMs}ms 关单并过期优惠券`);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.orders.releaseExpiredOrders();
      const expired = await this.prisma.errandCustomerCoupon.updateMany({
        where: { status: 'UNUSED', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED' },
      });
      if (result.orders || expired.count) {
        this.logger.log(
          `跑腿调度：关闭超时单 ${result.orders} 笔，过期优惠券 ${expired.count} 张`,
        );
      }
    } catch (error) {
      this.logger.error(
        `跑腿调度失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
