import type { MiniGuideSaveBody } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { ToolCode } from '../tool-launch/tool-launch.catalog';
import type { MiniGuideService } from './mini-guide.service';

/**
 * 发布说明控制器：契约 `MiniGuide_*` / `MiniGuideAdmin_*` 由 moduleHandlers 自动派发，
 * 参数顺序固定「user → 路径参 → query → 请求体」，返回值不套信封（与 tool-launch 同口径）。
 *
 * 管理员校验在控制器做：装配层注入 requireAdmin（见 marketplace/mp.admin.controller.ts），
 * 不把 identity 服务塞进领域服务，避免反向依赖。
 */

export class MiniGuideController {
  constructor(private readonly guide: MiniGuideService) {}

  /** 某工具的发布说明：?tool= 缺省时给通用说明。 */
  // 方法名必须等于 operationId 去掉 `MiniGuide_` 前缀后的首字母小写名（moduleHandlers 按这个名字派发）
  view(user: CurrentUser, query: { tool?: ToolCode }) {
    return query.tool
      ? this.guide.viewForUser(user, query.tool)
      : this.guide.sharedView();
  }

  /** 建站管理·小程序板块右侧的通用说明：不含账号参数。 */
  shared(user: CurrentUser) {
    void user;
    return this.guide.sharedView();
  }

  /** 直接下载源码包：点一下现打 zip，返回下载直链；不写发布台账。 */
  downloadPackage(user: CurrentUser, body: { tool: ToolCode }) {
    return this.guide.downloadPackage(user, body.tool);
  }
}

export class MiniGuideAdminController {
  constructor(
    private readonly guide: MiniGuideService,
    private readonly requireAdmin: (user: CurrentUser) => void,
  ) {}

  view(user: CurrentUser) {
    this.requireAdmin(user);
    return this.guide.adminView();
  }

  save(user: CurrentUser, body: MiniGuideSaveBody) {
    this.requireAdmin(user);
    return this.guide.save(user, body);
  }
}
