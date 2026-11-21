import { text } from '../common/api';
import { Logger } from '../common/logger';
import type { BrandCouponService } from './brand.coupon.service';
import type { BrandOrderService } from './brand.order.service';
import type { BrandScrmService } from './brand.scrm.service';

/**
 * 电商小程序定时回收（进程内定时器，与上门服务同形态）：
 * 每 60 秒扫一次超时未付款订单并过期券票。
 *
 * 自动取消不是锦上添花：下单即扣库存，超时单不释放就会把库存越吃越空；
 * 券票到期同理——端上按 status 判可用，状态不翻转顾客会看到一张用不了的「可用券」。
 * 可用 BRAND_SCHEDULER_DISABLED=1 关闭、BRAND_SCHEDULER_TICK_MS 调间隔。
 */
export class BrandScheduler {
  private readonly logger = new Logger(BrandScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly orders: BrandOrderService,
    private readonly coupons: BrandCouponService,
    private readonly scrm: BrandScrmService,
  ) {}

  onModuleInit() {
    if (String(process.env.BRAND_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn(
        '电商小程序订单调度已禁用（BRAND_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    const intervalMs = Number(process.env.BRAND_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `电商小程序调度已启动：每 ${intervalMs}ms 回收超时未付款订单与过期券票`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const cancelled = await this.orders.autoCancelExpired();
      const expired = await this.coupons.sweepExpiry();
      const reconciled = await this.orders.reconcileRefundEffects();
      if (cancelled > 0) {
        this.logger.log(`超时未付款订单已取消 ${cancelled} 笔，库存已回补`);
      }
      if (reconciled > 0) {
        this.logger.log(`售后退款副作用已补做 ${reconciled} 单`);
      }
      if (expired.tickets > 0 || expired.coupons > 0) {
        this.logger.log(
          `券票过期 ${expired.tickets} 张，券活动结束 ${expired.coupons} 个`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`电商小程序回收失败：${reason}`);
    } finally {
      this.busy = false;
    }
    // 外发箱单独兜错：SCRM 抖动不能影响订单回收，反之亦然。
    try {
      const scrm = await this.scrm.drain();
      if (scrm.sent > 0 || scrm.skipped > 0 || scrm.failed > 0) {
        this.logger.log(
          `企微事件外发：成功 ${scrm.sent}，跳过 ${scrm.skipped}，失败 ${scrm.failed}，顺延 ${scrm.deferred}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`企微事件外发失败：${reason}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
