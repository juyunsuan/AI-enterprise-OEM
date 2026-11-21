import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { CircleCommunityService } from './circle.community.service';

/** 圈子社区·平台侧：板块开关、默认审核口径与停服；社区内容由账号负责人（管理员）自治。 */
export class CircleAdminController {
  constructor(
    private readonly community: CircleCommunityService,
    private readonly identity: IdentityService,
  ) {}

  async communities(user: CurrentUser, query: Record<string, unknown>) {
    this.identity.requireAdmin(user);
    return this.community.adminList(query);
  }

  async communityStatus(
    user: CurrentUser,
    body: { id: number; status: 'ONLINE' | 'SUSPENDED'; reason: string },
  ) {
    this.identity.requireAdmin(user);
    return this.community.adminStatus(
      Number(body.id),
      body.status,
      body.reason,
      user.actorUserId || user.userId,
    );
  }

  async settings(user: CurrentUser) {
    this.identity.requireAdmin(user);
    return this.community.settings();
  }

  async saveSettings(
    user: CurrentUser,
    body: {
      enabled: boolean;
      defaultPostReview: boolean;
      defaultCommentReview: boolean;
      maxGroupsPerUser: number;
      maxPostsPerDay: number;
    },
  ) {
    this.identity.requireAdmin(user);
    return this.community.saveSettings(body);
  }
}
