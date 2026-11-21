import { text } from '../common/api';
import { Logger } from '../common/logger';
import type { MpScrmService } from './mp.scrm.service';

/**
 * 多店铺商城进程内调度：当前只跑企微 SCRM 外发箱（B4）。
 *
 * 外发箱必须独立成 tick，SCRM 抖动不能影响任何交易请求。
 * 可用 MP_SCHEDULER_DISABLED=1 关闭、MP_SCHEDULER_TICK_MS 调间隔。
 */
export class MpScheduler {
  private readonly logger = new Logger(MpScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly scrm: MpScrmService) {}

  onModuleInit() {
    if (String(process.env.MP_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('多店铺商城调度已禁用（MP_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(process.env.MP_SCHEDULER_TICK_MS || 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `多店铺商城调度已启动：每 ${intervalMs}ms 投递企微 SCRM 事件`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const scrm = await this.scrm.drain();
      if (scrm.sent > 0 || scrm.skipped > 0 || scrm.failed > 0) {
        this.logger.log(
          `多店铺企微事件外发：成功 ${scrm.sent}，跳过 ${scrm.skipped}，失败 ${scrm.failed}，顺延 ${scrm.deferred}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`多店铺企微事件外发失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
