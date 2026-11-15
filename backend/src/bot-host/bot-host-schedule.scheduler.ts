import { Logger } from '../common/logger';
import { text } from '../common/api';
import { BotHostService } from './bot-host.service';

/**
 * Bot 主机计划任务调度（进程内定时器）：
 * 每分钟 tick 一次，先把到点的计划各下发一轮，再把「主机领走没回话」的指令收成超时。
 * 时区 Asia/Shanghai，错过周期不补跑（下一次时刻在下发前就已推走）。
 * 可用 WORKBUDDY_HOST_SCHEDULER_DISABLED=1 关闭、WORKBUDDY_HOST_SCHEDULER_TICK_MS 调整间隔。
 */
export class BotHostScheduleScheduler {
  private readonly logger = new Logger(BotHostScheduleScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  constructor(private readonly hosts: BotHostService) {}
  onModuleInit() {
    if (
      String(process.env.WORKBUDDY_HOST_SCHEDULER_DISABLED || '').trim() === '1'
    ) {
      this.logger.warn(
        'Bot 主机计划任务调度已禁用（WORKBUDDY_HOST_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    const intervalMs = Number(
      process.env.WORKBUDDY_HOST_SCHEDULER_TICK_MS || 60_000,
    );
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `Bot 主机计划任务调度已启动：每 ${intervalMs}ms 扫描一次，时区 Asia/Shanghai`,
    );
  }
  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const [executed, timedOut] = await Promise.all([
        this.hosts.advanceDue(),
        this.hosts.sweepTimeouts(),
      ]);
      if (executed > 0) {
        this.logger.log(`Bot 主机计划任务：本轮下发 ${executed} 条`);
      }
      if (timedOut > 0) {
        this.logger.warn(`Bot 主机指令：本轮收口 ${timedOut} 条超时`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`Bot 主机计划任务调度 tick 失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
