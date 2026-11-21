import type { CurrentUser } from '../auth/current-user';
import type { MpPlatformService } from './mp.platform.service';

/**
 * 平台管理员台账：`MpAdmin_*` 端点。
 * 管理员校验由装配层注入（与 platform/points 等命令式路由同一口径），
 * 不把 identity 服务塞进领域服务，避免反向依赖。
 */
export class MarketplaceAdminController {
  constructor(
    private readonly platform: MpPlatformService,
    private readonly requireAdmin: (user: CurrentUser) => void,
  ) {}

  overview(user: CurrentUser) {
    this.requireAdmin(user);
    return this.platform.overview();
  }

  markets(
    user: CurrentUser,
    query: Parameters<MpPlatformService['markets']>[0],
  ) {
    this.requireAdmin(user);
    return this.platform.markets(query);
  }

  marketStatus(
    user: CurrentUser,
    body: Parameters<MpPlatformService['setStatus']>[0],
  ) {
    this.requireAdmin(user);
    return this.platform.setStatus(body);
  }
}
