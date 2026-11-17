import { Logger } from '../common/logger';
import { CurrentUser } from '../auth/current-user';
import { InsightService } from './insight.service';

/**
 * 热点聚合调度（进程内定时器，不引第三方 cron）：
 * 每 tick 扫描「有 ACTIVE 订阅」的账号，对距上次聚合超过间隔的账号重算热点。
 * 多实例同库靠聚合本身幂等（先清自动热点再重建）保证不产生重复热点；
 * 内存节流只用于减少同进程内的重复计算。
 *
 * 可用 INSIGHT_SCHEDULER_DISABLED=1 关闭、INSIGHT_SCHEDULER_TICK_MS 调 tick、
 * INSIGHT_RECOMPUTE_MINUTES 调重算间隔（默认 60 分钟）。
 */
export class InsightScheduler {
  private readonly logger = new Logger(InsightScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly lastRun = new Map<string, number>();
  private readonly tickMs: number;
  private readonly minIntervalMs: number;

  constructor(private readonly insight: InsightService) {
    this.tickMs = Number(process.env.INSIGHT_SCHEDULER_TICK_MS || 600_000);
    this.minIntervalMs =
      Number(process.env.INSIGHT_RECOMPUTE_MINUTES || 60) * 60_000;
  }

  onModuleInit() {
    if (String(process.env.INSIGHT_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn(
        '智慧分析聚合调度已禁用（INSIGHT_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.logger.log(
      `智慧分析聚合调度已启动：tick ${this.tickMs}ms，单账号重算间隔 ${this.minIntervalMs}ms`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runOnce();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`智慧分析聚合 tick 失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  /** 供测试与手动触发：跑一轮全部待重算账号。 */
  async runOnce(now = Date.now()) {
    const active = await this.insight.listActiveUserIds();
    for (const userId of active) {
      const last = this.lastRun.get(userId) ?? 0;
      if (now - last < this.minIntervalMs) continue;
      this.lastRun.set(userId, now);
      try {
        await this.insight.recomputeHotspots(
          new CurrentUser(userId, userId, 'enterprise'),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`账号 ${userId} 热点重算失败：${reason}`);
      }
    }
  }
}
