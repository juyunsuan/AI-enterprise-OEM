import type { HealthTrade } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { HealthPlatformService } from './health.platform.service';

/**
 * 健康管理小程序工具·平台后台。
 * 只做板块开关、资金总闸与只读订单排查；店铺、机构、医护由店主在工作台内自行管理与审核。
 */
export class HealthAdminController {
  constructor(
    private readonly platform: HealthPlatformService,
    private readonly identity: IdentityService,
  ) {}

  async settings(user: CurrentUser) {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }

  async saveSettings(
    user: CurrentUser,
    body: {
      enabled: boolean;
      allowOnlinePay: boolean;
      defaultTrade: HealthTrade;
    },
  ) {
    return this.platform.saveSettings(user, body);
  }

  async orders(user: CurrentUser, query: Record<string, unknown>) {
    return this.platform.adminOrders(user, query);
  }
}
