import type { MiniprogramSettingsInput } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { MiniProgramClient } from './miniprogram.client';
import type { MiniProgramService } from './miniprogram.service';
import type { MiniProgramSettingsService } from './miniprogram.settings';

/**
 * 用户版小程序：用户侧绑定 + 平台后台「小程序管理」。
 * 方法名与 `MiniProgram_` / `MiniProgramAdmin_` 契约后缀一一对应。
 */
export class MiniProgramController {
  constructor(
    private readonly settingsService: MiniProgramSettingsService,
    private readonly service: MiniProgramService,
    private readonly client: MiniProgramClient,
    private readonly identity: IdentityService,
  ) {}

  // ---------- 用户侧 ----------

  async status(user: CurrentUser) {
    return this.service.status(user);
  }

  async bind(user: CurrentUser, body: { code: string }) {
    return this.service.bind(user, body.code);
  }

  // ---------- 平台管理 ----------

  async settings(user: CurrentUser) {
    this.identity.requireAdmin(user);
    return this.settingsService.view();
  }

  async saveSettings(user: CurrentUser, body: MiniprogramSettingsInput) {
    this.identity.requireAdmin(user);
    return this.settingsService.save(body, user.userId);
  }

  async test(user: CurrentUser) {
    this.identity.requireAdmin(user);
    const settings = await this.settingsService.load();
    try {
      const runtime = await this.settingsService.requireRuntime({
        requireEnabled: false,
      });
      await this.client.accessToken(runtime, true);
      return {
        ok: true,
        appName: settings.appName,
        message: '连接成功，AppID / AppSecret 可用',
      };
    } catch (error) {
      return {
        ok: false,
        appName: settings.appName,
        message: error instanceof Error ? error.message : '连接失败',
      };
    }
  }

  async qrcode(
    user: CurrentUser,
    body: {
      mode: 'GENERATE' | 'UPLOAD';
      fileName?: string;
      ossKey?: string;
    },
  ) {
    this.identity.requireAdmin(user);
    return this.service.qrcode(user.userId, body);
  }

  async builtin(user: CurrentUser) {
    this.identity.requireAdmin(user);
    return this.service.listBuiltin();
  }
}
