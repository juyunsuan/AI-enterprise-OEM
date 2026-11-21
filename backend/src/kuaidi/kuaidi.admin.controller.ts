import {
  type KuaidiAdminSettings,
  type KuaidiAdminSettingsBody,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { KuaidiPlatformService } from './kuaidi.platform.service';

/**
 * 快递寄件小程序工具·平台侧。
 *
 * 平台不碰资金，也不再参与站点审核与处置（站点数量完全放开）；这里只剩两道总闸：
 * 板块开关与是否允许在线收款。
 */
export class KuaidiAdminController {
  constructor(
    private readonly platform: KuaidiPlatformService,
    private readonly identity: IdentityService,
  ) {}

  async settings(user: CurrentUser): Promise<KuaidiAdminSettings> {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }

  async saveSettings(user: CurrentUser, body: KuaidiAdminSettingsBody) {
    return this.platform.saveSettings(user, body);
  }
}
