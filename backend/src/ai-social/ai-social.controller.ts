import type { CurrentUser } from '../auth/current-user';
import type { AiSocialService } from './ai-social.service';

/** 契约 AiSocial_entry：返回当前账号的准入状态与插件网页入口。 */
export class AiSocialController {
  constructor(private readonly service: AiSocialService) {}

  entry(user: CurrentUser) {
    return this.service.entry(user.userId);
  }
}
