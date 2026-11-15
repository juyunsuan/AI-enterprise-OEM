import { Logger } from '../common/logger';
import { GeoSiteDomainService } from './geo-site-domain.service';
import { GeoSiteBillingService } from './geo-site.billing.service';

/**
 * GEO 独立站后台调度（进程内定时器，不引第三方 cron 依赖）：
 * - 月账出账与欠费停服/复活：每小时 tick，服务内部按「今天只跑一次」守卫幂等，
 *   每月 1 日那一次顺带出账；进程重启或多实例同库都只有一份账单生效；
 * - 自定义域名复检：每次 tick 抽最多 5 个超过 24 小时未检测的域名，控制对外请求量。
 *
 * 用 GEO_SITE_SCHEDULER_DISABLED=1 关闭，GEO_SITE_SCHEDULER_TICK_MS 调整间隔。
 */
export class GeoSiteScheduler {
  private readonly logger = new Logger(GeoSiteScheduler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly billing: GeoSiteBillingService,
    private readonly domains: GeoSiteDomainService,
  ) {}

  onModuleInit() {
    if (String(process.env.GEO_SITE_SCHEDULER_DISABLED || '').trim() === '1') {
      this.logger.warn('GEO 独立站调度已禁用（GEO_SITE_SCHEDULER_DISABLED=1）');
      return;
    }
    const intervalMs = Number(
      process.env.GEO_SITE_SCHEDULER_TICK_MS || 3600_000,
    );
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
    this.logger.log(
      `GEO 独立站调度已启动：tick ${intervalMs}ms（月账每月 1 日、域名复检每小时 ≤5 个）`,
    );
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const billing = await this.billing.runDaily();
      const domains = await this.domains.recheckStale();
      if (!billing.skipped && domains.checked) {
        this.logger.log(
          `GEO 独立站调度：账单 ${JSON.stringify(billing)}，域名复检 ${domains.checked} 个`,
        );
      }
    } catch (error) {
      this.logger.error(
        `GEO 独立站调度失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
