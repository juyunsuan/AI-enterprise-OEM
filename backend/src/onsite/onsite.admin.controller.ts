import type { OnsitePlatformSettingsInput } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { OnsitePlatformService } from './onsite.platform.service';

/** 上门服务小程序工具·平台侧：店铺台账、停服与恢复、平台参数。方法名 = `OnsiteAdmin_` 后缀。 */
export class OnsiteAdminController {
  constructor(private readonly platform: OnsitePlatformService) {}

  async shops(user: CurrentUser, query: Record<string, unknown>) {
    return this.platform.adminShops(user, query);
  }

  async suspendShop(user: CurrentUser, id: string, body: { reason?: string }) {
    return this.platform.suspendShop(user, id, String(body?.reason || ''));
  }

  async resumeShop(user: CurrentUser, id: string) {
    return this.platform.resumeShop(user, id);
  }

  async settings(user: CurrentUser) {
    return this.platform.settingsFor(user);
  }

  async saveSettings(user: CurrentUser, body: OnsitePlatformSettingsInput) {
    return this.platform.saveSettings(user, body);
  }
}
