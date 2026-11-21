import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站管理 · 圈子社区小程序（店主侧 `/enterprise/circle/**`）。
 * C 端成员走 `/api/public/circle/**`，由小程序直连，不经过这里。
 */
export const circleApi = {
  meta: endpoint(endpoints.Circle_meta),
  overview: endpoint(endpoints.Circle_overview),
  community: endpoint(endpoints.Circle_community),
  communitySave: endpoint(endpoints.Circle_communitySave),
  communityStatus: endpoint(endpoints.Circle_communityStatus),

  appDetail: endpoint(endpoints.Circle_appDetail),
  appSave: endpoint(endpoints.Circle_appSave),
  appTest: endpoint(endpoints.Circle_appTest),

  categories: endpoint(endpoints.Circle_categories),
  categorySave: endpoint(endpoints.Circle_categorySave),
  categoryRemove: endpoint(endpoints.Circle_categoryRemove),

  groups: endpoint(endpoints.Circle_groups),
  groupDetail: endpoint(endpoints.Circle_groupDetail),
  groupAudit: endpoint(endpoints.Circle_groupAudit),
  groupStatus: endpoint(endpoints.Circle_groupStatus),
  groupRecommend: endpoint(endpoints.Circle_groupRecommend),
  groupSave: endpoint(endpoints.Circle_groupSave),
  groupRemove: endpoint(endpoints.Circle_groupRemove),

  activities: endpoint(endpoints.Circle_activities),
  activitySave: endpoint(endpoints.Circle_activitySave),
  activityStatus: endpoint(endpoints.Circle_activityStatus),
  activityRemove: endpoint(endpoints.Circle_activityRemove),

  medals: endpoint(endpoints.Circle_medals),
  medalSave: endpoint(endpoints.Circle_medalSave),
  medalRemove: endpoint(endpoints.Circle_medalRemove),

  topics: endpoint(endpoints.Circle_topics),
  topicSave: endpoint(endpoints.Circle_topicSave),
  topicRemove: endpoint(endpoints.Circle_topicRemove),

  posts: endpoint(endpoints.Circle_posts),
  postDetail: endpoint(endpoints.Circle_postDetail),
  postAudit: endpoint(endpoints.Circle_postAudit),
  postStatus: endpoint(endpoints.Circle_postStatus),
  postPin: endpoint(endpoints.Circle_postPin),
  postFeature: endpoint(endpoints.Circle_postFeature),
  postRemove: endpoint(endpoints.Circle_postRemove),

  comments: endpoint(endpoints.Circle_comments),
  commentStatus: endpoint(endpoints.Circle_commentStatus),
  commentRemove: endpoint(endpoints.Circle_commentRemove),

  reports: endpoint(endpoints.Circle_reports),
  reportHandle: endpoint(endpoints.Circle_reportHandle),

  users: endpoint(endpoints.Circle_users),
  userStatus: endpoint(endpoints.Circle_userStatus),

  notifications: endpoint(endpoints.Circle_notifications),
  notificationSend: endpoint(endpoints.Circle_notificationSend),

  aiGenerate: endpoint(endpoints.Circle_aiGenerate),
};

export const circleAdminApi = {
  communities: endpoint(endpoints.CircleAdmin_communities),
  communityStatus: endpoint(endpoints.CircleAdmin_communityStatus),
  settings: endpoint(endpoints.CircleAdmin_settings),
  saveSettings: endpoint(endpoints.CircleAdmin_saveSettings),
};