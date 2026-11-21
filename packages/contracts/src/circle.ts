import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });

/**
 * 工作台 · 建站管理 · 圈子社区小程序工具。
 *
 * 与参考包（多客圈子社区）的关系：只借鉴「圈子 + 帖子 + 评论 + 关注 + 消息」的产品形态，
 * 不复制其 PHP/UniApp 源码；数据、权限、计费、AI、存储全部按本站架构重写。
 *
 * 三条硬口径：
 * 1. **一个账号一个社区**：账号负责人就是该小程序的管理员，C 端成员是社区自己的用户，
 *    与站内账号物理隔离（顾客令牌 scene=CIRCLE + communityId + circleUserId）。
 * 2. **圈子是社区内部单元**：管理员建分类、审核圈子；圈主只能管理自己的圈子与成员。
 * 3. **复用底座**：小程序出包走 private-mini；启动计费走 tool-launch/points；
 *    媒体字节走 OSS，管理员素材可从数字资产管理选择；客服只绑定 service-desk 站点；
 *    AI 运营助手统一走 ai-gateway 并计用量/积分。
 */

// ---------------------------------------------------------------- 枚举

export const CIRCLE_COMMUNITY_STATUSES = ["DRAFT", "ONLINE", "SUSPENDED"] as const;
export type CircleCommunityStatus = (typeof CIRCLE_COMMUNITY_STATUSES)[number];
export const CIRCLE_COMMUNITY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "运营中",
  SUSPENDED: "平台停用",
};

export const CIRCLE_GROUP_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "DISABLED",
] as const;
export type CircleGroupStatus = (typeof CIRCLE_GROUP_STATUSES)[number];
export const CIRCLE_GROUP_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  ACTIVE: "正常",
  REJECTED: "已驳回",
  DISABLED: "已停用",
};

export const CIRCLE_JOIN_MODES = ["FREE", "APPROVAL"] as const;
export type CircleJoinMode = (typeof CIRCLE_JOIN_MODES)[number];
export const CIRCLE_JOIN_MODE_LABELS: Record<string, string> = {
  FREE: "自由加入",
  APPROVAL: "申请加入",
};

export const CIRCLE_USER_STATUSES = ["ACTIVE", "MUTED", "BANNED"] as const;
export type CircleUserStatus = (typeof CIRCLE_USER_STATUSES)[number];
export const CIRCLE_USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  MUTED: "禁言",
  BANNED: "封禁",
};

export const CIRCLE_MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type CircleMemberRole = (typeof CIRCLE_MEMBER_ROLES)[number];

export const CIRCLE_MEMBER_STATUSES = ["PENDING", "ACTIVE", "MUTED", "BANNED"] as const;
export type CircleMemberStatus = (typeof CIRCLE_MEMBER_STATUSES)[number];

export const CIRCLE_POST_STATUSES = [
  "PENDING",
  "PUBLISHED",
  "REJECTED",
  "HIDDEN",
  "DELETED",
] as const;
export type CirclePostStatus = (typeof CIRCLE_POST_STATUSES)[number];
export const CIRCLE_POST_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  PUBLISHED: "已发布",
  REJECTED: "未通过",
  HIDDEN: "已隐藏",
  DELETED: "已删除",
};

export const CIRCLE_COMMENT_STATUSES = [
  "PENDING",
  "PUBLISHED",
  "HIDDEN",
  "DELETED",
] as const;
export type CircleCommentStatus = (typeof CIRCLE_COMMENT_STATUSES)[number];

export const CIRCLE_REPORT_TARGETS = ["POST", "COMMENT", "USER", "GROUP"] as const;
export type CircleReportTarget = (typeof CIRCLE_REPORT_TARGETS)[number];

export const CIRCLE_REPORT_STATUSES = ["PENDING", "RESOLVED", "REJECTED"] as const;
export type CircleReportStatus = (typeof CIRCLE_REPORT_STATUSES)[number];
export const CIRCLE_REPORT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  RESOLVED: "已处理",
  REJECTED: "已驳回",
};

export const CIRCLE_NOTIFICATION_TYPES = [
  "LIKE",
  "COMMENT",
  "REPLY",
  "FOLLOW",
  "JOIN",
  "AUDIT",
  "SYSTEM",
] as const;
export type CircleNotificationType = (typeof CIRCLE_NOTIFICATION_TYPES)[number];

export const CIRCLE_ACTIVITY_STATUSES = ["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"] as const;
export type CircleActivityStatus = (typeof CIRCLE_ACTIVITY_STATUSES)[number];
export const CIRCLE_ACTIVITY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "报名中",
  CLOSED: "已结束",
  CANCELLED: "已取消",
};

export const CIRCLE_MEDAL_TYPES = ["POST", "COMMENT", "FOLLOWER"] as const;
export type CircleMedalType = (typeof CIRCLE_MEDAL_TYPES)[number];
export const CIRCLE_MEDAL_TYPE_LABELS: Record<string, string> = {
  POST: "发帖数",
  COMMENT: "评论数",
  FOLLOWER: "粉丝数",
};

export const CIRCLE_AI_ACTIONS = [
  "GROUP_INTRO",
  "NOTICE",
  "POST_SUMMARY",
  "HOT_DIGEST",
] as const;
export type CircleAiAction = (typeof CIRCLE_AI_ACTIONS)[number];

// ---------------------------------------------------------------- 公共形状

export const circleViewerSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
});
export type CircleViewer = z.infer<typeof circleViewerSchema>;

export const circleCommunitySchema = z.object({
  id: z.number(),
  name: z.string(),
  /** 公开寻址码：分享链接与本地调试用，创建后不变。 */
  code: z.string(),
  logo: z.string(),
  cover: z.string(),
  slogan: z.string(),
  intro: z.string(),
  themeColor: z.string(),
  notice: z.string(),
  status: z.enum(CIRCLE_COMMUNITY_STATUSES),
  /** 加入圈子是否需要圈主审核。 */
  joinApproval: z.boolean(),
  /** 是否允许普通成员申请创建圈子。 */
  allowUserCreateCircle: z.boolean(),
  /** 发帖是否需要管理员审核；开启后先落 PENDING。 */
  postReview: z.boolean(),
  commentReview: z.boolean(),
  /** AI 运营助手开关（圈主端可用，按 ai-gateway 计积分）。 */
  aiAssistantEnabled: z.boolean(),
  /** 绑定的 AI 客服站点 siteKey；空＝不启用在线客服。 */
  deskSiteKey: z.string(),
  servicePhone: z.string(),
  serviceWechat: z.string(),
  shareImage: z.string(),
  agreement: z.string(),
  privacy: z.string(),
  about: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CircleCommunity = z.infer<typeof circleCommunitySchema>;

export const circleCommunitySaveBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  logo: z.string().trim().max(500).default(""),
  cover: z.string().trim().max(500).default(""),
  slogan: z.string().trim().max(80).default(""),
  intro: z.string().trim().max(2000).default(""),
  themeColor: z.string().trim().max(20).default("#1677ff"),
  notice: z.string().trim().max(1000).default(""),
  joinApproval: z.boolean().default(true),
  allowUserCreateCircle: z.boolean().default(true),
  postReview: z.boolean().default(true),
  commentReview: z.boolean().default(false),
  aiAssistantEnabled: z.boolean().default(true),
  deskSiteKey: z.string().trim().max(64).default(""),
  servicePhone: z.string().trim().max(30).default(""),
  serviceWechat: z.string().trim().max(60).default(""),
  shareImage: z.string().trim().max(500).default(""),
  agreement: z.string().trim().max(20000).default(""),
  privacy: z.string().trim().max(20000).default(""),
  about: z.string().trim().max(20000).default(""),
});
export type CircleCommunitySaveBody = z.infer<typeof circleCommunitySaveBodySchema>;

export const circleDeskSiteSchema = z.object({
  siteKey: z.string(),
  name: z.string(),
  enabled: z.boolean(),
});

export const circleCountsSchema = z.object({
  users: z.number(),
  groups: z.number(),
  posts: z.number(),
  comments: z.number(),
  pendingPosts: z.number(),
  pendingGroups: z.number(),
  pendingReports: z.number(),
});

export const circleUsageSchema = z.object({
  pv: z.number(),
  views: z.number(),
  bytes: z.number(),
  days: z.number(),
});

export const circleMetaSchema = z.object({
  community: circleCommunitySchema.nullable(),
  app: miniAppViewSchema,
  deskSites: z.array(circleDeskSiteSchema),
  counts: circleCountsSchema,
});
export type CircleMeta = z.infer<typeof circleMetaSchema>;

export const circleOverviewSchema = z.object({
  counts: circleCountsSchema,
  today: z.object({
    users: z.number(),
    posts: z.number(),
    comments: z.number(),
  }),
  usage: circleUsageSchema,
  topGroups: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      memberCount: z.number(),
      postCount: z.number(),
    }),
  ),
});
export type CircleOverview = z.infer<typeof circleOverviewSchema>;

export const circleCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  groupCount: z.number(),
  createdAt: z.string(),
});
export type CircleCategory = z.infer<typeof circleCategorySchema>;

export const circleCategorySaveBodySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(30),
  icon: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});

export const circleGroupSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  categoryName: z.string(),
  creatorUserId: z.number(),
  creator: circleViewerSchema,
  name: z.string(),
  cover: z.string(),
  intro: z.string(),
  rules: z.string(),
  joinMode: z.enum(CIRCLE_JOIN_MODES),
  status: z.enum(CIRCLE_GROUP_STATUSES),
  rejectReason: z.string(),
  memberCount: z.number(),
  postCount: z.number(),
  followCount: z.number(),
  isRecommended: z.boolean(),
  /** 当前查看者是否已加入 / 已关注；管理端为 false。 */
  isJoined: z.boolean(),
  isFollowing: z.boolean(),
  /** 当前查看者在圈子里的角色；未加入为空。 */
  role: z.string(),
  createdAt: z.string(),
});
export type CircleGroup = z.infer<typeof circleGroupSchema>;

export type CircleGroupSaveBody = {
  id?: number;
  categoryId: number;
  name: string;
  cover: string;
  intro: string;
  rules: string;
  joinMode: CircleJoinMode;
};

export const circleGroupSaveBodySchema = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(40),
  cover: z.string().trim().max(500).default(""),
  intro: z.string().trim().max(2000).default(""),
  rules: z.string().trim().max(5000).default(""),
  joinMode: z.enum(CIRCLE_JOIN_MODES).default("APPROVAL"),
});

export const circleTopicSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  postCount: z.number(),
  enabled: z.boolean(),
  sort: z.number(),
});
export type CircleTopic = z.infer<typeof circleTopicSchema>;

export const circleTopicSaveBodySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(30),
  description: z.string().trim().max(200).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});

export const circleUserMedalSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string(),
});
export type CircleUserMedal = z.infer<typeof circleUserMedalSchema>;

export const circleActivitySchema = z.object({
  id: z.number(),
  groupId: z.number(),
  groupName: z.string(),
  creator: circleViewerSchema,
  title: z.string(),
  cover: z.string(),
  description: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  address: z.string(),
  capacity: z.number(),
  joinCount: z.number(),
  status: z.enum(CIRCLE_ACTIVITY_STATUSES),
  isJoined: z.boolean(),
  createdAt: z.string(),
});
export type CircleActivity = z.infer<typeof circleActivitySchema>;

export const circleActivitySaveBodySchema = z.object({
  id: z.number().int().positive().optional(),
  groupId: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(1).max(80),
  cover: z.string().trim().max(500).default(""),
  description: z.string().trim().max(5000).default(""),
  startAt: z.string().trim().min(1).max(40),
  endAt: z.string().trim().max(40).default(""),
  address: z.string().trim().max(200).default(""),
  capacity: z.number().int().min(0).max(100000).default(0),
  status: z.enum(CIRCLE_ACTIVITY_STATUSES).default("ACTIVE"),
});
export type CircleActivitySaveBody = z.infer<typeof circleActivitySaveBodySchema>;

export const circleMedalSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string(),
  type: z.enum(CIRCLE_MEDAL_TYPES),
  threshold: z.number(),
  enabled: z.boolean(),
  sort: z.number(),
  createdAt: z.string(),
});
export type CircleMedal = z.infer<typeof circleMedalSchema>;

export const circleMedalSaveBodySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(30),
  icon: z.string().trim().max(500).default(""),
  type: z.enum(CIRCLE_MEDAL_TYPES).default("POST"),
  threshold: z.number().int().min(1).max(1_000_000),
  enabled: z.boolean().default(true),
  sort: z.number().int().min(0).max(9999).default(0),
});
export type CircleMedalSaveBody = z.infer<typeof circleMedalSaveBodySchema>;

export const circlePostSchema = z.object({
  id: z.number(),
  groupId: z.number(),
  groupName: z.string(),
  author: circleViewerSchema,
  content: z.string(),
  images: z.array(z.string()),
  topics: z.array(z.object({ id: z.number(), name: z.string() })),
  status: z.enum(CIRCLE_POST_STATUSES),
  auditNote: z.string(),
  isPinned: z.boolean(),
  isFeatured: z.boolean(),
  likeCount: z.number(),
  commentCount: z.number(),
  viewCount: z.number(),
  favoriteCount: z.number(),
  isLiked: z.boolean(),
  isFavorited: z.boolean(),
  createdAt: z.string(),
});
export type CirclePost = z.infer<typeof circlePostSchema>;

/**
 * 评论节点：开放文档不展开无限递归，children 只声明一层（嵌套回复在业务侧仍按
 * CircleComment 形状返回）；避免 OpenAPI 生成时 zod-to-openapi 递归爆栈。
 */
const circleCommentBaseSchema = z.object({
  id: z.number(),
  postId: z.number(),
  parentId: z.number(),
  user: circleViewerSchema,
  replyToName: z.string(),
  content: z.string(),
  likeCount: z.number(),
  isLiked: z.boolean(),
  status: z.enum(CIRCLE_COMMENT_STATUSES),
  createdAt: z.string(),
});
export type CircleComment = z.infer<typeof circleCommentBaseSchema> & {
  children: CircleComment[];
};
export const circleCommentSchema: z.ZodType<CircleComment> =
  circleCommentBaseSchema.extend({
    // children 不展开递归 schema：开放文档只声明一层，嵌套回复仍按 CircleComment
    // 形状返回；避免 zod-to-openapi 无限递归爆栈。
    children: z.array(z.any()).default([]),
  });

export const circleUserSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  bio: z.string(),
  gender: z.number(),
  status: z.enum(CIRCLE_USER_STATUSES),
  postCount: z.number(),
  followerCount: z.number(),
  followingCount: z.number(),
  isFollowing: z.boolean(),
  isSelf: z.boolean(),
  medals: z.array(circleUserMedalSchema).default([]),
  createdAt: z.string(),
});
export type CircleUser = z.infer<typeof circleUserSchema>;

export const circleNotificationSchema = z.object({
  id: z.number(),
  type: z.enum(CIRCLE_NOTIFICATION_TYPES),
  actor: circleViewerSchema.nullable(),
  content: z.string(),
  targetType: z.string(),
  targetId: z.number(),
  postId: z.number(),
  commentId: z.number(),
  readAt: z.string(),
  createdAt: z.string(),
});
export type CircleNotification = z.infer<typeof circleNotificationSchema>;

export const circleReportSchema = z.object({
  id: z.number(),
  targetType: z.enum(CIRCLE_REPORT_TARGETS),
  targetId: z.number(),
  reporter: circleViewerSchema,
  reason: z.string(),
  detail: z.string(),
  images: z.array(z.string()),
  status: z.enum(CIRCLE_REPORT_STATUSES),
  action: z.string(),
  excerpt: z.string(),
  createdAt: z.string(),
  handledAt: z.string(),
});
export type CircleReport = z.infer<typeof circleReportSchema>;

export const circleAiResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  action: z.enum(CIRCLE_AI_ACTIONS),
});
export type CircleAiResult = z.infer<typeof circleAiResultSchema>;

// ---------------------------------------------------------------- 分页与查询

const circleListQuery = pageQuerySchema.extend({
  keyword: z.string().trim().max(60).default(""),
});
export type CircleListQuery = z.infer<typeof circleListQuery>;

const circlePostQuery = circleListQuery.extend({
  status: z.enum(CIRCLE_POST_STATUSES).or(z.literal("")).default(""),
  groupId: z.coerce.number().int().nonnegative().default(0),
});
const circleGroupQuery = circleListQuery.extend({
  status: z.enum(CIRCLE_GROUP_STATUSES).or(z.literal("")).default(""),
  categoryId: z.coerce.number().int().nonnegative().default(0),
});
const circleCommentQuery = circleListQuery.extend({
  status: z.enum(CIRCLE_COMMENT_STATUSES).or(z.literal("")).default(""),
  postId: z.coerce.number().int().nonnegative().default(0),
});
const circleUserQuery = circleListQuery.extend({
  status: z.enum(CIRCLE_USER_STATUSES).or(z.literal("")).default(""),
});
const circleReportQuery = circleListQuery.extend({
  status: z.enum(CIRCLE_REPORT_STATUSES).or(z.literal("")).default(""),
  targetType: z.enum(CIRCLE_REPORT_TARGETS).or(z.literal("")).default(""),
});
const idQuery = z.object({ id: z.coerce.number().int().positive() });
const idBody = z.object({ id: z.number().int().positive() });

export const circlePostAuditBodySchema = z.object({
  id: z.number().int().positive(),
  approve: z.boolean(),
  note: z.string().trim().max(200).default(""),
});
export const circleGroupAuditBodySchema = z.object({
  id: z.number().int().positive(),
  approve: z.boolean(),
  note: z.string().trim().max(200).default(""),
});
export const circleReportHandleBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["NONE", "HIDE", "DELETE", "BAN", "REJECT"]),
  note: z.string().trim().max(200).default(""),
});
export const circleNotificationSendBodySchema = z.object({
  title: z.string().trim().max(60).default("社区公告"),
  content: z.string().trim().min(1).max(500),
});
export const circleAiGenerateBodySchema = z.object({
  action: z.enum(CIRCLE_AI_ACTIONS),
  prompt: z.string().trim().max(2000).default(""),
  groupId: z.number().int().nonnegative().default(0),
});

// ---------------------------------------------------------------- 平台管理侧

export const circleAdminCommunitySchema = z.object({
  id: z.number(),
  ownerUserId: z.string(),
  ownerName: z.string(),
  name: z.string(),
  code: z.string(),
  status: z.enum(CIRCLE_COMMUNITY_STATUSES),
  users: z.number(),
  groups: z.number(),
  posts: z.number(),
  offReason: z.string(),
  createdAt: z.string(),
});
export type CircleAdminCommunity = z.infer<typeof circleAdminCommunitySchema>;

export const circleAdminSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultPostReview: z.boolean(),
  defaultCommentReview: z.boolean(),
  maxGroupsPerUser: z.number(),
  maxPostsPerDay: z.number(),
});
export type CircleAdminSettings = z.infer<typeof circleAdminSettingsSchema>;

export const circleAdminSettingsSaveBodySchema = circleAdminSettingsSchema;

// ---------------------------------------------------------------- C 端公开契约（路由在 public 手写注册）

export const circlePublicBootstrapSchema = z.object({
  community: z.object({
    code: z.string(),
    name: z.string(),
    logo: z.string(),
    cover: z.string(),
    slogan: z.string(),
    intro: z.string(),
    themeColor: z.string(),
    notice: z.string(),
    servicePhone: z.string(),
    serviceWechat: z.string(),
    joinApproval: z.boolean(),
    allowUserCreateCircle: z.boolean(),
    aiAssistantEnabled: z.boolean(),
    deskSiteKey: z.string(),
  }),
  categories: z.array(circleCategorySchema),
  hotGroups: z.array(circleGroupSchema),
  /** 订阅消息模板 ID（可选）：租户配置后才能申请授权与发送。 */
  subscribeTemplates: z.record(z.string(), z.string()).default({}),
});
export type CirclePublicBootstrap = z.infer<typeof circlePublicBootstrapSchema>;

export const circlePublicLoginBodySchema = z.object({
  code: z.string().trim().min(1).max(200),
  nickname: z.string().trim().max(40).default(""),
  avatar: z.string().trim().max(500).default(""),
});
export const circlePublicLoginResultSchema = z.object({
  token: z.string(),
  user: circleUserSchema,
});

export type CirclePublicPostCreateBody = {
  groupId: number;
  content: string;
  images: string[];
  topicIds: number[];
};

export const circlePublicPostCreateBodySchema = z.object({
  groupId: z.number().int().positive(),
  content: z.string().trim().min(1).max(5000),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  topicIds: z.array(z.number().int().positive()).max(5).default([]),
});
export const circlePublicCommentCreateBodySchema = z.object({
  postId: z.number().int().positive(),
  parentId: z.number().int().nonnegative().default(0),
  replyToUserId: z.number().int().nonnegative().default(0),
  content: z.string().trim().min(1).max(1000),
});
export const circlePublicGroupApplyBodySchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(40),
  cover: z.string().trim().max(500).default(""),
  intro: z.string().trim().max(2000).default(""),
  rules: z.string().trim().max(5000).default(""),
  joinMode: z.enum(CIRCLE_JOIN_MODES).default("APPROVAL"),
});
export const circlePublicReportBodySchema = z.object({
  targetType: z.enum(CIRCLE_REPORT_TARGETS),
  targetId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(40),
  detail: z.string().trim().max(500).default(""),
  images: z.array(z.string().trim().max(500)).max(3).default([]),
});
export type CirclePublicLoginResult = z.infer<typeof circlePublicLoginResultSchema>;
export const circlePublicProfileSaveBodySchema = z.object({
  nickname: z.string().trim().max(40).default(""),
  avatar: z.string().trim().max(500).default(""),
  bio: z.string().trim().max(200).default(""),
  gender: z.number().int().min(0).max(2).default(0),
});
export type CirclePublicProfileSaveBody = z.infer<typeof circlePublicProfileSaveBodySchema>;

// ---------------------------------------------------------------- 端点清单

const get = <Q extends z.ZodType, R extends z.ZodType>(
  path: string,
  query: Q,
  response: R,
) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query,
  body: z.undefined(),
  response: envelope(response),
});

const post = <B extends z.ZodType, R extends z.ZodType>(
  path: string,
  body: B,
  response: R,
) => ({
  method: "post" as const,
  path,
  params: z.object({}),
  query: emptyQuery,
  body,
  response: envelope(response),
});

const circlePage = <T extends z.ZodType>(item: T) => pageSchema(item);

export const circleEndpoints = {
  // ---------- 概览与社区设置 ----------
  Circle_meta: get("/enterprise/circle/meta", emptyQuery, circleMetaSchema),
  Circle_overview: get("/enterprise/circle/overview", emptyQuery, circleOverviewSchema),
  Circle_community: get("/enterprise/circle/community", emptyQuery, circleCommunitySchema),
  Circle_communitySave: post(
    "/enterprise/circle/community/save",
    circleCommunitySaveBodySchema,
    circleCommunitySchema,
  ),
  Circle_communityStatus: post(
    "/enterprise/circle/community/status",
    z.object({ status: z.enum(["DRAFT", "ONLINE"]) }),
    circleCommunitySchema,
  ),

  // ---------- 小程序主体 ----------
  Circle_appDetail: get("/enterprise/circle/app/detail", emptyQuery, miniAppViewSchema),
  Circle_appSave: post(
    "/enterprise/circle/app/save",
    miniAppInputSchema,
    miniAppViewSchema,
  ),
  Circle_appTest: post("/enterprise/circle/app/test", z.object({}), miniAppTestResultSchema),

  // ---------- 分类 ----------
  Circle_categories: get(
    "/enterprise/circle/category/list",
    emptyQuery,
    z.array(circleCategorySchema),
  ),
  Circle_categorySave: post(
    "/enterprise/circle/category/save",
    circleCategorySaveBodySchema,
    circleCategorySchema,
  ),
  Circle_categoryRemove: post(
    "/enterprise/circle/category/remove",
    idBody,
    okResult,
  ),

  // ---------- 圈子 ----------
  Circle_groups: get(
    "/enterprise/circle/group/list",
    circleGroupQuery,
    circlePage(circleGroupSchema),
  ),
  Circle_groupDetail: get(
    "/enterprise/circle/group/detail",
    idQuery,
    circleGroupSchema,
  ),
  Circle_groupAudit: post(
    "/enterprise/circle/group/audit",
    circleGroupAuditBodySchema,
    circleGroupSchema,
  ),
  Circle_groupStatus: post(
    "/enterprise/circle/group/status",
    z.object({ id: z.number().int().positive(), status: z.enum(CIRCLE_GROUP_STATUSES) }),
    circleGroupSchema,
  ),
  Circle_groupRecommend: post(
    "/enterprise/circle/group/recommend",
    z.object({ id: z.number().int().positive(), recommended: z.boolean() }),
    circleGroupSchema,
  ),
  Circle_groupSave: post(
    "/enterprise/circle/group/save",
    circleGroupSaveBodySchema,
    circleGroupSchema,
  ),
  Circle_groupRemove: post(
    "/enterprise/circle/group/remove",
    idBody,
    okResult,
  ),

  // ---------- 帖子 ----------
  Circle_posts: get(
    "/enterprise/circle/post/list",
    circlePostQuery,
    circlePage(circlePostSchema),
  ),
  Circle_postDetail: get("/enterprise/circle/post/detail", idQuery, circlePostSchema),
  Circle_postAudit: post(
    "/enterprise/circle/post/audit",
    circlePostAuditBodySchema,
    circlePostSchema,
  ),
  Circle_postStatus: post(
    "/enterprise/circle/post/status",
    z.object({ id: z.number().int().positive(), status: z.enum(CIRCLE_POST_STATUSES) }),
    circlePostSchema,
  ),
  Circle_postPin: post(
    "/enterprise/circle/post/pin",
    z.object({ id: z.number().int().positive(), pinned: z.boolean() }),
    circlePostSchema,
  ),
  Circle_postFeature: post(
    "/enterprise/circle/post/feature",
    z.object({ id: z.number().int().positive(), featured: z.boolean() }),
    circlePostSchema,
  ),
  Circle_postRemove: post("/enterprise/circle/post/remove", idBody, okResult),

  // ---------- 评论 ----------
  Circle_comments: get(
    "/enterprise/circle/comment/list",
    circleCommentQuery,
    circlePage(circleCommentSchema),
  ),
  Circle_commentStatus: post(
    "/enterprise/circle/comment/status",
    z.object({
      id: z.number().int().positive(),
      status: z.enum(CIRCLE_COMMENT_STATUSES),
    }),
    okResult,
  ),
  Circle_commentRemove: post("/enterprise/circle/comment/remove", idBody, okResult),

  // ---------- 举报 ----------
  Circle_reports: get(
    "/enterprise/circle/report/list",
    circleReportQuery,
    circlePage(circleReportSchema),
  ),
  Circle_reportHandle: post(
    "/enterprise/circle/report/handle",
    circleReportHandleBodySchema,
    circleReportSchema,
  ),

  // ---------- 成员 ----------
  Circle_users: get(
    "/enterprise/circle/user/list",
    circleUserQuery,
    circlePage(circleUserSchema),
  ),
  Circle_userStatus: post(
    "/enterprise/circle/user/status",
    z.object({ id: z.number().int().positive(), status: z.enum(CIRCLE_USER_STATUSES) }),
    circleUserSchema,
  ),

  // ---------- 通知 ----------
  Circle_notifications: get(
    "/enterprise/circle/notification/list",
    emptyQuery,
    z.array(circleNotificationSchema),
  ),
  Circle_notificationSend: post(
    "/enterprise/circle/notification/send",
    circleNotificationSendBodySchema,
    okResult,
  ),

  // ---------- AI 运营助手 ----------
  Circle_aiGenerate: post(
    "/enterprise/circle/ai/generate",
    circleAiGenerateBodySchema,
    circleAiResultSchema,
  ),

  // ---------- 话题 ----------
  Circle_topics: get(
    "/enterprise/circle/topic/list",
    emptyQuery,
    z.array(circleTopicSchema),
  ),
  Circle_topicSave: post(
    "/enterprise/circle/topic/save",
    circleTopicSaveBodySchema,
    circleTopicSchema,
  ),
  Circle_topicRemove: post("/enterprise/circle/topic/remove", idBody, okResult),

  // ---------- 活动 ----------
  Circle_activities: get(
    "/enterprise/circle/activity/list",
    pageQuerySchema.extend({
      status: z.enum(CIRCLE_ACTIVITY_STATUSES).or(z.literal("")).default(""),
      groupId: z.coerce.number().int().nonnegative().default(0),
    }),
    circlePage(circleActivitySchema),
  ),
  Circle_activitySave: post(
    "/enterprise/circle/activity/save",
    circleActivitySaveBodySchema,
    circleActivitySchema,
  ),
  Circle_activityStatus: post(
    "/enterprise/circle/activity/status",
    z.object({ id: z.number().int().positive(), status: z.enum(CIRCLE_ACTIVITY_STATUSES) }),
    circleActivitySchema,
  ),
  Circle_activityRemove: post("/enterprise/circle/activity/remove", idBody, okResult),

  // ---------- 勋章 ----------
  Circle_medals: get(
    "/enterprise/circle/medal/list",
    emptyQuery,
    z.array(circleMedalSchema),
  ),
  Circle_medalSave: post(
    "/enterprise/circle/medal/save",
    circleMedalSaveBodySchema,
    circleMedalSchema,
  ),
  Circle_medalRemove: post("/enterprise/circle/medal/remove", idBody, okResult),

  // ---------- 平台管理侧 ----------
  CircleAdmin_communities: get(
    "/enterprise/admin/circle/communities",
    pageQuerySchema.extend({
      keyword: z.string().trim().max(60).default(""),
      status: z.enum(CIRCLE_COMMUNITY_STATUSES).or(z.literal("")).default(""),
    }),
    circlePage(circleAdminCommunitySchema),
  ),
  CircleAdmin_communityStatus: post(
    "/enterprise/admin/circle/community/status",
    z.object({
      id: z.number().int().positive(),
      status: z.enum(["ONLINE", "SUSPENDED"]),
      reason: z.string().trim().max(200).default(""),
    }),
    circleAdminCommunitySchema,
  ),
  CircleAdmin_settings: get(
    "/enterprise/admin/circle/settings",
    emptyQuery,
    circleAdminSettingsSchema,
  ),
  CircleAdmin_saveSettings: post(
    "/enterprise/admin/circle/settings/save",
    circleAdminSettingsSaveBodySchema,
    circleAdminSettingsSchema,
  ),
};
