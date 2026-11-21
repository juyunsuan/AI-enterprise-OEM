<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：circle（`circle`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Circle_activities` | GET | `/enterprise/circle/activity/list` | ACTIVITIES | 读 | session(会话) |  | page, pageSize, status, groupId |  | data |
| `Circle_activityRemove` | POST | `/enterprise/circle/activity/remove` | 删除ACTIVITY | 写 | session(会话) |  |  | id | data |
| `Circle_activitySave` | POST | `/enterprise/circle/activity/save` | 保存ACTIVITY | 写 | session(会话) |  |  | id, groupId, title, cover, description, startAt, endAt, address, capacity, status | data |
| `Circle_activityStatus` | POST | `/enterprise/circle/activity/status` | ACTIVITY状态 | 写 | session(会话) |  |  | id, status | data |
| `Circle_aiGenerate` | POST | `/enterprise/circle/ai/generate` | 生成AI | 写 | session(会话) |  |  | action, prompt, groupId | data |
| `Circle_appDetail` | GET | `/enterprise/circle/app/detail` | 申请详情 | 读 | session(会话) |  |  |  | data |
| `Circle_appSave` | POST | `/enterprise/circle/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Circle_appTest` | POST | `/enterprise/circle/app/test` | 测试申请 | 写 | session(会话) |  |  |  | data |
| `Circle_categories` | GET | `/enterprise/circle/category/list` | 类目 | 读 | session(会话) |  |  |  | data |
| `Circle_categoryRemove` | POST | `/enterprise/circle/category/remove` | 删除类目 | 写 | session(会话) |  |  | id | data |
| `Circle_categorySave` | POST | `/enterprise/circle/category/save` | 保存类目 | 写 | session(会话) |  |  | id, name, icon, sort, enabled | data |
| `Circle_comments` | GET | `/enterprise/circle/comment/list` | 评论 | 读 | session(会话) |  | page, pageSize, keyword, status, postId |  | data |
| `Circle_commentRemove` | POST | `/enterprise/circle/comment/remove` | 删除评论 | 写 | session(会话) |  |  | id | data |
| `Circle_commentStatus` | POST | `/enterprise/circle/comment/status` | 评论状态 | 写 | session(会话) |  |  | id, status | data |
| `Circle_community` | GET | `/enterprise/circle/community` | COMMUNITY | 读 | session(会话) |  |  |  | data |
| `Circle_communitySave` | POST | `/enterprise/circle/community/save` | 保存COMMUNITY | 写 | session(会话) |  |  | name, logo, cover, slogan, intro, themeColor, notice, joinApproval, allowUserCreateCircle, postReview, commentReview, aiAssistantEnabled, deskSiteKey, servicePhone, serviceWechat, shareImage, agreement, privacy, about | data |
| `Circle_communityStatus` | POST | `/enterprise/circle/community/status` | COMMUNITY状态 | 写 | session(会话) |  |  | status | data |
| `Circle_groupAudit` | POST | `/enterprise/circle/group/audit` | 审核群 | 写 | session(会话) |  |  | id, approve, note | data |
| `Circle_groupDetail` | GET | `/enterprise/circle/group/detail` | 群详情 | 读 | session(会话) |  | id |  | data |
| `Circle_groups` | GET | `/enterprise/circle/group/list` | 群 | 读 | session(会话) |  | page, pageSize, keyword, status, categoryId |  | data |
| `Circle_groupRecommend` | POST | `/enterprise/circle/group/recommend` | 群RECOMMEND | 写 | session(会话) |  |  | id, recommended | data |
| `Circle_groupRemove` | POST | `/enterprise/circle/group/remove` | 删除群 | 写 | session(会话) |  |  | id | data |
| `Circle_groupSave` | POST | `/enterprise/circle/group/save` | 保存群 | 写 | session(会话) |  |  | id, categoryId, name, cover, intro, rules, joinMode | data |
| `Circle_groupStatus` | POST | `/enterprise/circle/group/status` | 群状态 | 写 | session(会话) |  |  | id, status | data |
| `Circle_medals` | GET | `/enterprise/circle/medal/list` | MEDALS | 读 | session(会话) |  |  |  | data |
| `Circle_medalRemove` | POST | `/enterprise/circle/medal/remove` | 删除MEDAL | 写 | session(会话) |  |  | id | data |
| `Circle_medalSave` | POST | `/enterprise/circle/medal/save` | 保存MEDAL | 写 | session(会话) |  |  | id, name, icon, type, threshold, enabled, sort | data |
| `Circle_meta` | GET | `/enterprise/circle/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Circle_notifications` | GET | `/enterprise/circle/notification/list` | NOTIFICATIONS | 读 | session(会话) |  |  |  | data |
| `Circle_notificationSend` | POST | `/enterprise/circle/notification/send` | NOTIFICATION发送 | 写 | session(会话) |  |  | title, content | data |
| `Circle_overview` | GET | `/enterprise/circle/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Circle_postAudit` | POST | `/enterprise/circle/post/audit` | 发表审核 | 写 | session(会话) |  |  | id, approve, note | data |
| `Circle_postDetail` | GET | `/enterprise/circle/post/detail` | 发表详情 | 读 | session(会话) |  | id |  | data |
| `Circle_postFeature` | POST | `/enterprise/circle/post/feature` | 发表功能 | 写 | session(会话) |  |  | id, featured | data |
| `Circle_posts` | GET | `/enterprise/circle/post/list` | 发表 | 读 | session(会话) |  | page, pageSize, keyword, status, groupId |  | data |
| `Circle_postPin` | POST | `/enterprise/circle/post/pin` | 发表PIN | 写 | session(会话) |  |  | id, pinned | data |
| `Circle_postRemove` | POST | `/enterprise/circle/post/remove` | 发表删除 | 写 | session(会话) |  |  | id | data |
| `Circle_postStatus` | POST | `/enterprise/circle/post/status` | 发表状态 | 写 | session(会话) |  |  | id, status | data |
| `Circle_reportHandle` | POST | `/enterprise/circle/report/handle` | 报告HANDLE | 写 | session(会话) |  |  | id, action, note | data |
| `Circle_reports` | GET | `/enterprise/circle/report/list` | 报告 | 读 | session(会话) |  | page, pageSize, keyword, status, targetType |  | data |
| `Circle_topics` | GET | `/enterprise/circle/topic/list` | 主题 | 读 | session(会话) |  |  |  | data |
| `Circle_topicRemove` | POST | `/enterprise/circle/topic/remove` | 删除主题 | 写 | session(会话) |  |  | id | data |
| `Circle_topicSave` | POST | `/enterprise/circle/topic/save` | 保存主题 | 写 | session(会话) |  |  | id, name, description, sort, enabled | data |
| `Circle_users` | GET | `/enterprise/circle/user/list` | 用户 | 读 | session(会话) |  | page, pageSize, keyword, status |  | data |
| `Circle_userStatus` | POST | `/enterprise/circle/user/status` | 用户状态 | 写 | session(会话) |  |  | id, status | data |

返回 `INDEX.md`。

