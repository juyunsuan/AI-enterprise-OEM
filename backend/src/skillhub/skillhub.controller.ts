import { CurrentUser } from '../auth/current-user';
import { SkillHubService } from './skillhub.service';

/** SkillHub 技能中心：列表 / 详情 / 下载 / 下载并安装。 */
export class SkillHubController {
  constructor(private readonly service: SkillHubService) {}

  async list(_user: CurrentUser, query: Record<string, unknown>) {
    return this.service.list({
      keyword: query.keyword as string | undefined,
      page: query.page as number | undefined,
      pageSize: query.pageSize as number | undefined,
    });
  }

  async detail(_user: CurrentUser, slug: string) {
    return this.service.detail(slug);
  }

  download(_user: CurrentUser, slug: string) {
    return this.service.download(slug);
  }

  async install(user: CurrentUser, slug: string) {
    return this.service.install(user, slug);
  }
}
