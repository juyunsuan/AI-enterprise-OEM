import { Logger } from '../common/logger';
import type { ToolLaunchBillingService } from './tool-launch.billing.service';
import type { ToolLaunchMeterService } from './tool-launch.meter';

/**
 * 建站工具启动账期调度（进程内定时器，与独立站同一底座，不引第三方 cron）：
 * 每小时 tick 一次，服务内部按「今天只跑一次」守卫幂等——
 * 进程重启、多实例同库都只有一份账单生效，错过时点也不会漏（下一 tick 补上）。
 *
 * TOOL_LAUNCH_SCHEDULER_DISABLED=1 关闭，TOOL_LAUNCH_SCHEDULER_TICK_MS 调间隔。
 */
export class ToolLaunchScheduler {
  private readonly logger = new Logger(ToolLaunchScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly billing: ToolLaunchBillingService,
    private readonly meter: ToolLaunchMeterService,
  ) {}

  onModuleInit() {
    if (
      String(process.env.TOOL_LAUNCH_SCHEDULER_DISABLED || '').trim() === '1'
    ) {
      this.logger.warn(
        '建站工具启动账期调度已禁用（TOOL_LAUNCH_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    const intervalMs = Number(
      process.env.TOOL_LAUNCH_SCHEDULER_TICK_MS || 3600_000,
    );
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `建站工具启动账期调度已启动：tick ${intervalMs}ms（账期日批每天一次 + 订单数快照每轮一次）`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.billing.runDaily();
      // 订单数是快照式重算（set 语义），每轮跑都能自愈，不受日批守卫键约束
      await this.meter.syncOrderSnapshot();
    } catch (error) {
      this.logger.error(
        `建站工具启动账期调度失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
