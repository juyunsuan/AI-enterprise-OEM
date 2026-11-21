import type { CurrentUser } from '../auth/current-user';
import type { MiniAppInput } from '@enterprise/contracts';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { CircleCommunityService } from './circle.community.service';
import type { CircleGroupService } from './circle.group.service';
import type { CirclePostService } from './circle.post.service';
import type { CircleCommentService } from './circle.comment.service';
import type { CircleNotificationService } from './circle.notification.service';
import type { CircleReportService } from './circle.report.service';
import type { CircleUserService } from './circle.user.service';
import type { CircleAiService } from './circle.ai.service';
import type { CircleActivityService } from './circle.activity.service';
import type { CircleMedalService } from './circle.medal.service';
import type { CircleSubscribeService } from './circle.subscribe.service';

/**
 * 圈子社区·店主侧（账号负责人＝社区管理员）。
 * 方法名与契约 `Circle_` 后缀一一对应，由 `moduleHandlers` 反射调用。
 */
export class CircleController {
  constructor(
    private readonly communityService: CircleCommunityService,
    private readonly miniApp: MiniAppService,
    private readonly groupService: CircleGroupService,
    private readonly postService: CirclePostService,
    private readonly commentService: CircleCommentService,
    private readonly notificationService: CircleNotificationService,
    private readonly reportService: CircleReportService,
    private readonly userService: CircleUserService,
    private readonly aiService: CircleAiService,
    private readonly activityService: CircleActivityService,
    private readonly medalService: CircleMedalService,
    private readonly subscribeService: CircleSubscribeService,
  ) {}

  private async ctx(user: CurrentUser) {
    return this.communityService.ensure(user.userId);
  }

  async meta(user: CurrentUser) {
    return this.communityService.meta(user);
  }

  async overview(user: CurrentUser) {
    return this.communityService.overview(user);
  }

  async community(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.communityService.view(row);
  }

  async communitySave(
    user: CurrentUser,
    body: Parameters<CircleCommunityService['save']>[1],
  ) {
    return this.communityService.save(user, body);
  }

  async communityStatus(
    user: CurrentUser,
    body: { status: 'DRAFT' | 'ONLINE' },
  ) {
    return this.communityService.setStatus(user, body.status);
  }

  // ---------- 小程序主体（private-mini 底座，scene=CIRCLE / shopId=0）----------

  private subject(user: CurrentUser, shopName = '圈子社区') {
    return this.communityService.subject(user.userId, shopName);
  }

  async appDetail(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.miniApp.view(this.subject(user, row.name));
  }

  async appSave(user: CurrentUser, body: MiniAppInput) {
    const row = await this.ctx(user);
    return this.miniApp.save(this.subject(user, row.name), body);
  }

  async appTest(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.miniApp.test(this.subject(user, row.name));
  }

  // ---------- 分类 ----------

  async categories(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.groupService.categoryList(row.id);
  }

  async categorySave(
    user: CurrentUser,
    body: {
      id?: number;
      name: string;
      icon: string;
      sort: number;
      enabled: boolean;
    },
  ) {
    const row = await this.ctx(user);
    return this.groupService.categorySave(row.id, body);
  }

  async categoryRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.groupService.categoryRemove(row.id, Number(body.id));
  }

  // ---------- 圈子 ----------

  async groups(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.groupService.list(row.id, query);
  }

  async groupDetail(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.groupService.detail(row.id, Number(query.id), 0);
  }

  async groupAudit(
    user: CurrentUser,
    body: { id: number; approve: boolean; note: string },
  ) {
    const row = await this.ctx(user);
    return this.groupService.audit(
      row.id,
      Number(body.id),
      body.approve,
      body.note,
    );
  }

  async groupStatus(
    user: CurrentUser,
    body: {
      id: number;
      status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
    },
  ) {
    const row = await this.ctx(user);
    return this.groupService.setStatus(row.id, Number(body.id), body.status);
  }

  async groupRecommend(
    user: CurrentUser,
    body: { id: number; recommended: boolean },
  ) {
    const row = await this.ctx(user);
    return this.groupService.recommend(
      row.id,
      Number(body.id),
      body.recommended,
    );
  }

  async groupSave(
    user: CurrentUser,
    body: {
      id?: number;
      categoryId: number;
      name: string;
      cover: string;
      intro: string;
      rules: string;
      joinMode: 'FREE' | 'APPROVAL';
    },
  ) {
    const row = await this.ctx(user);
    return this.groupService.adminSave(row.id, body);
  }

  async groupRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.groupService.remove(row.id, Number(body.id));
  }

  // ---------- 帖子 ----------

  async posts(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.postService.adminList(row.id, query);
  }

  async postDetail(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.postService.detail(row.id, Number(query.id), 0);
  }

  async postAudit(
    user: CurrentUser,
    body: { id: number; approve: boolean; note: string },
  ) {
    const row = await this.ctx(user);
    return this.postService.audit(
      row.id,
      Number(body.id),
      body.approve,
      body.note,
    );
  }

  async postStatus(
    user: CurrentUser,
    body: {
      id: number;
      status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN' | 'DELETED';
    },
  ) {
    const row = await this.ctx(user);
    return this.postService.setStatus(row.id, Number(body.id), body.status);
  }

  async postPin(user: CurrentUser, body: { id: number; pinned: boolean }) {
    const row = await this.ctx(user);
    return this.postService.pin(row.id, Number(body.id), body.pinned);
  }

  async postFeature(
    user: CurrentUser,
    body: { id: number; featured: boolean },
  ) {
    const row = await this.ctx(user);
    return this.postService.feature(row.id, Number(body.id), body.featured);
  }

  async postRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.postService.remove(row.id, Number(body.id));
  }

  // ---------- 评论 ----------

  async comments(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.commentService.adminList(row.id, query);
  }

  async commentStatus(
    user: CurrentUser,
    body: {
      id: number;
      status: 'PENDING' | 'PUBLISHED' | 'HIDDEN' | 'DELETED';
    },
  ) {
    const row = await this.ctx(user);
    return this.commentService.setStatus(row.id, Number(body.id), body.status);
  }

  async commentRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.commentService.remove(row.id, Number(body.id));
  }

  // ---------- 话题 ----------

  async topics(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.postService.adminTopics(row.id);
  }

  async topicSave(
    user: CurrentUser,
    body: {
      id?: number;
      name: string;
      description: string;
      sort: number;
      enabled: boolean;
    },
  ) {
    const row = await this.ctx(user);
    return this.postService.topicSave(row.id, body);
  }

  async topicRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.postService.topicRemove(row.id, Number(body.id));
  }

  // ---------- 举报 ----------

  async reports(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.reportService.list(row.id, query);
  }

  async reportHandle(
    user: CurrentUser,
    body: {
      id: number;
      action: 'NONE' | 'HIDE' | 'DELETE' | 'BAN' | 'REJECT';
      note: string;
    },
  ) {
    const row = await this.ctx(user);
    return this.reportService.handle(
      row.id,
      Number(body.id),
      body.action,
      body.note,
      user.actorUserId || user.userId,
    );
  }

  // ---------- 成员 ----------

  async users(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.userService.list(row.id, query);
  }

  async userStatus(
    user: CurrentUser,
    body: { id: number; status: 'ACTIVE' | 'MUTED' | 'BANNED' },
  ) {
    const row = await this.ctx(user);
    return this.userService.setStatus(row.id, Number(body.id), body.status);
  }

  // ---------- 通知 ----------

  async notifications(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.notificationService.list(row.id, 0);
  }

  async notificationSend(
    user: CurrentUser,
    body: { title: string; content: string },
  ) {
    const row = await this.ctx(user);
    return this.notificationService.send(row.id, body.title, body.content);
  }

  // ---------- AI 运营助手 ----------

  async aiGenerate(
    user: CurrentUser,
    body: {
      action: 'GROUP_INTRO' | 'NOTICE' | 'POST_SUMMARY' | 'HOT_DIGEST';
      prompt: string;
      groupId: number;
    },
  ) {
    const row = await this.ctx(user);
    return this.aiService.generate(user, row, body);
  }

  // ---------- 活动 ----------

  async activities(user: CurrentUser, query: Record<string, unknown>) {
    const row = await this.ctx(user);
    return this.activityService.list(row.id, query);
  }

  async activitySave(
    user: CurrentUser,
    body: {
      id?: number;
      groupId: number;
      title: string;
      cover: string;
      description: string;
      startAt: string;
      endAt: string;
      address: string;
      capacity: number;
      status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
    },
  ) {
    const row = await this.ctx(user);
    return this.activityService.save(row.id, body);
  }

  async activityStatus(
    user: CurrentUser,
    body: { id: number; status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' },
  ) {
    const row = await this.ctx(user);
    return this.activityService.setStatus(row.id, Number(body.id), body.status);
  }

  async activityRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.activityService.remove(row.id, Number(body.id));
  }

  // ---------- 勋章 ----------

  async medals(user: CurrentUser) {
    const row = await this.ctx(user);
    return this.medalService.list(row.id);
  }

  async medalSave(
    user: CurrentUser,
    body: {
      id?: number;
      name: string;
      icon: string;
      type: 'POST' | 'COMMENT' | 'FOLLOWER';
      threshold: number;
      enabled: boolean;
      sort: number;
    },
  ) {
    const row = await this.ctx(user);
    return this.medalService.save(row.id, body);
  }

  async medalRemove(user: CurrentUser, body: { id: number }) {
    const row = await this.ctx(user);
    return this.medalService.remove(row.id, Number(body.id));
  }
}
