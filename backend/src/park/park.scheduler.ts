import { Logger } from '../common/logger';
import type { ParkLeaseService } from './park.lease.service';

/**
 * 园区租约自动出账：每天跑一次当期账单；账单唯一键保证重复执行不重复出账。
 * ERP 同步失败只留在账单备注，不阻断下一张账单。
 */
export class ParkBillingScheduler {
  private readonly logger = new Logger('ParkBillingScheduler');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly leases: ParkLeaseService) {}

  onModuleInit() {
    const tick = () => {
      void this.leases
        .runScheduledBilling()
        .then((result) => {
          if (result.generated > 0) {
            this.logger.log(
              `园区自动出账：新增 ${result.generated} 张，跳过 ${result.skipped} 张`,
            );
          }
        })
        .catch((error) => {
          this.logger.error(
            `园区自动出账失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
    };
    tick();
    this.timer = setInterval(tick, 24 * 3600_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
