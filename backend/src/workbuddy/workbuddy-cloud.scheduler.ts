import { Logger } from '../common/logger';
import { text } from '../common/api';
import { WorkbuddyCloudService } from './workbuddy-cloud.service';

/**
 * Workbuddy 企业云定时调度（进程内定时器）：
 * 每分钟扫一次到点的云端定时任务，按所属 WorkBuddy 账号直接下发一轮；
 * 错过不补跑，失败只在运行记录与定时行上留痕。
 * 顺带追一轮未终态的群控指令（方案 §4.7 第 4 条）：云端只有平台来问才变状态，
 * 用户不开着对话页也必须能等到终态站内信。
 * 可用 WORKBUDDY_CLOUD_SCHEDULER_DISABLED=1 关闭、WORKBUDDY_CLOUD_SCHEDULER_TICK_MS 调整间隔。
 */
export class WorkbuddyCloudScheduler {
  private readonly logger = new Logger(WorkbuddyCloudScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private readonly cloud: WorkbuddyCloudService) {}

  onModuleInit() {
    if (
      String(process.env.WORKBUDDY_CLOUD_SCHEDULER_DISABLED || '').trim() ===
      '1'
    ) {
      this.logger.warn(
        'Workbuddy 云端定时调度已禁用（WORKBUDDY_CLOUD_SCHEDULER_DISABLED=1）',
      );
      return;
    }
    const intervalMs = Number(
      process.env.WORKBUDDY_CLOUD_SCHEDULER_TICK_MS || 60000,
    );
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `Workbuddy 云端定时调度已启动：每 ${intervalMs}ms 扫描一次`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const dispatched = await this.cloud.advanceDue();
      if (dispatched > 0) {
        this.logger.log(`Workbuddy 云端定时：本轮下发 ${dispatched} 条`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`Workbuddy 云端调度 tick 失败：${reason}`);
    }
    try {
      const synced = await this.cloud.sweepUnfinished();
      if (synced > 0) {
        this.logger.log(`Workbuddy 云端群控：本轮追平 ${synced} 条`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : text(error);
      this.logger.error(`Workbuddy 云端群控追平失败：${reason}`);
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
