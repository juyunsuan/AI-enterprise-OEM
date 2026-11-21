import type { DevGuideSaveBody } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { DevGuideService } from './dev-guide.service';

/**
 * 开发指引控制器：契约 `DevGuideAdmin_*` 由 moduleHandlers 自动派发，
 * 参数顺序固定「user → 请求体」，管理员校验在控制器做（装配层注入 requireAdmin）。
 */
export class DevGuideAdminController {
  constructor(
    private readonly guide: DevGuideService,
    private readonly requireAdmin: (user: CurrentUser) => void,
  ) {}

  view(user: CurrentUser) {
    this.requireAdmin(user);
    return this.guide.adminView();
  }

  save(user: CurrentUser, body: DevGuideSaveBody) {
    this.requireAdmin(user);
    return this.guide.save(user, body);
  }
}
