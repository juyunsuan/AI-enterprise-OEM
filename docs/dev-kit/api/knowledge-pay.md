<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：knowledge-pay（`knowledge-pay`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Kp_banners` | GET | `/enterprise/knowledge-pay/banners` | BANNERS | 读 | session(会话) |  |  |  | data |
| `Kp_saveBanner` | POST | `/enterprise/knowledge-pay/banners` | 保存BANNER | 写 | session(会话) |  |  | title, image, link, sort, status | data |
| `Kp_removeBanner` | DELETE | `/enterprise/knowledge-pay/banners/:id` | 删除BANNER | 写 | session(会话) | id |  |  | data |
| `Kp_updateBanner` | PUT | `/enterprise/knowledge-pay/banners/:id` | 修改BANNER | 写 | session(会话) | id |  | title, image, link, sort, status | data |
| `Kp_cards` | GET | `/enterprise/knowledge-pay/cards` | 图卡 | 读 | session(会话) |  | page, pageSize, keyword, kind, status |  | data |
| `Kp_generateCards` | POST | `/enterprise/knowledge-pay/cards` | 生成图卡 | 写 | session(会话) |  |  | kind, count, days, points, resourceId, remark | data |
| `Kp_removeCard` | DELETE | `/enterprise/knowledge-pay/cards/:id` | 删除图卡 | 写 | session(会话) | id |  |  | data |
| `Kp_disableCard` | POST | `/enterprise/knowledge-pay/cards/:id/disable` | DISABLE图卡 | 写 | session(会话) | id |  |  | data |
| `Kp_cashOrders` | GET | `/enterprise/knowledge-pay/cash-orders` | CASH订单 | 读 | session(会话) |  | page, pageSize, keyword, status, kind |  | data |
| `Kp_closeCashOrder` | POST | `/enterprise/knowledge-pay/cash-orders/:id/close` | 关闭CASH订单 | 写 | session(会话) | id |  |  | data |
| `Kp_refundCashOrder` | POST | `/enterprise/knowledge-pay/cash-orders/:id/refund` | REFUNDCASH订单 | 写 | session(会话) | id |  | reason | data |
| `Kp_categories` | GET | `/enterprise/knowledge-pay/categories` | 类目 | 读 | session(会话) |  |  |  | data |
| `Kp_createCategory` | POST | `/enterprise/knowledge-pay/categories` | 新建类目 | 写 | session(会话) |  |  | title, cover, sort, status | data |
| `Kp_removeCategory` | DELETE | `/enterprise/knowledge-pay/categories/:id` | 删除类目 | 写 | session(会话) | id |  |  | data |
| `Kp_updateCategory` | PUT | `/enterprise/knowledge-pay/categories/:id` | 修改类目 | 写 | session(会话) | id |  | title, cover, sort, status | data |
| `Kp_chapters` | GET | `/enterprise/knowledge-pay/chapters` | CHAPTERS | 读 | session(会话) |  | resourceId |  | data |
| `Kp_saveChapter` | POST | `/enterprise/knowledge-pay/chapters` | 保存CHAPTER | 写 | session(会话) |  |  | resourceId, title, sort, status | data |
| `Kp_removeChapter` | DELETE | `/enterprise/knowledge-pay/chapters/:id` | 删除CHAPTER | 写 | session(会话) | id |  |  | data |
| `Kp_updateChapter` | PUT | `/enterprise/knowledge-pay/chapters/:id` | 修改CHAPTER | 写 | session(会话) | id |  | resourceId, title, sort, status | data |
| `Kp_learnings` | GET | `/enterprise/knowledge-pay/learnings` | LEARNINGS | 读 | session(会话) |  | page, pageSize, keyword, resourceId, completed |  | data |
| `Kp_lessons` | GET | `/enterprise/knowledge-pay/lessons` | LESSONS | 读 | session(会话) |  | resourceId |  | data |
| `Kp_saveLesson` | POST | `/enterprise/knowledge-pay/lessons` | 保存LESSON | 写 | session(会话) |  |  | resourceId, chapterId, title, mediaType, url, intro, durationSec, freeTrial, sort, status | data |
| `Kp_removeLesson` | DELETE | `/enterprise/knowledge-pay/lessons/:id` | 删除LESSON | 写 | session(会话) | id |  |  | data |
| `Kp_updateLesson` | PUT | `/enterprise/knowledge-pay/lessons/:id` | 修改LESSON | 写 | session(会话) | id |  | resourceId, chapterId, title, mediaType, url, intro, durationSec, freeTrial, sort, status | data |
| `Kp_links` | GET | `/enterprise/knowledge-pay/links` | 短链 | 读 | session(会话) |  |  |  | data |
| `Kp_saveLink` | POST | `/enterprise/knowledge-pay/links` | 保存短链 | 写 | session(会话) |  |  | title, summary, cover, link, sort, status | data |
| `Kp_removeLink` | DELETE | `/enterprise/knowledge-pay/links/:id` | 删除短链 | 写 | session(会话) | id |  |  | data |
| `Kp_updateLink` | PUT | `/enterprise/knowledge-pay/links/:id` | 修改短链 | 写 | session(会话) | id |  | title, summary, cover, link, sort, status | data |
| `Kp_members` | GET | `/enterprise/knowledge-pay/members` | 会员 | 读 | session(会话) |  | page, pageSize, keyword, vip |  | data |
| `Kp_adjustMember` | POST | `/enterprise/knowledge-pay/members/:id/adjust` | 会员ADJUST | 写 | session(会话) | id |  | pointsDelta, vipDays, status, remark | data |
| `Kp_navs` | GET | `/enterprise/knowledge-pay/navs` | NAVS | 读 | session(会话) |  |  |  | data |
| `Kp_saveNav` | POST | `/enterprise/knowledge-pay/navs` | 保存NAV | 写 | session(会话) |  |  | title, icon, link, sort, status | data |
| `Kp_removeNav` | DELETE | `/enterprise/knowledge-pay/navs/:id` | 删除NAV | 写 | session(会话) | id |  |  | data |
| `Kp_updateNav` | PUT | `/enterprise/knowledge-pay/navs/:id` | 修改NAV | 写 | session(会话) | id |  | title, icon, link, sort, status | data |
| `Kp_notices` | GET | `/enterprise/knowledge-pay/notices` | NOTICES | 读 | session(会话) |  | page, pageSize |  | data |
| `Kp_saveNotice` | POST | `/enterprise/knowledge-pay/notices` | 保存NOTICE | 写 | session(会话) |  |  | title, content, status | data |
| `Kp_removeNotice` | DELETE | `/enterprise/knowledge-pay/notices/:id` | 删除NOTICE | 写 | session(会话) | id |  |  | data |
| `Kp_updateNotice` | PUT | `/enterprise/knowledge-pay/notices/:id` | 修改NOTICE | 写 | session(会话) | id |  | title, content, status | data |
| `Kp_orders` | GET | `/enterprise/knowledge-pay/orders` | 订单 | 读 | session(会话) |  | page, pageSize, keyword, payMethod |  | data |
| `Kp_overview` | GET | `/enterprise/knowledge-pay/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Kp_pages` | GET | `/enterprise/knowledge-pay/pages` | 页面 | 读 | session(会话) |  |  |  | data |
| `Kp_savePage` | POST | `/enterprise/knowledge-pay/pages` | 保存页面 | 写 | session(会话) |  |  | title, slug, content, sort, status | data |
| `Kp_removePage` | DELETE | `/enterprise/knowledge-pay/pages/:id` | 删除页面 | 写 | session(会话) | id |  |  | data |
| `Kp_updatePage` | PUT | `/enterprise/knowledge-pay/pages/:id` | 修改页面 | 写 | session(会话) | id |  | title, slug, content, sort, status | data |
| `Kp_resources` | GET | `/enterprise/knowledge-pay/resources` | 资源 | 读 | session(会话) |  | page, pageSize, keyword, categoryId, mediaType, accessMode, status, auditStatus |  | data |
| `Kp_createResource` | POST | `/enterprise/knowledge-pay/resources` | 新建资源 | 写 | session(会话) |  |  | categoryId, mediaType, accessMode, price, cashPriceCents, teacherId, title, cover, intro, url, teacherName, teacherTitle, teacherAvatar, teacherIntro, auditStatus, auditNote, hot, sort, status | data |
| `Kp_removeResource` | DELETE | `/enterprise/knowledge-pay/resources/:id` | 删除资源 | 写 | session(会话) | id |  |  | data |
| `Kp_updateResource` | PUT | `/enterprise/knowledge-pay/resources/:id` | 修改资源 | 写 | session(会话) | id |  | categoryId, mediaType, accessMode, price, cashPriceCents, teacherId, title, cover, intro, url, teacherName, teacherTitle, teacherAvatar, teacherIntro, auditStatus, auditNote, hot, sort, status | data |
| `Kp_auditResource` | POST | `/enterprise/knowledge-pay/resources/:id/audit` | 审核资源 | 写 | session(会话) | id |  | auditStatus, auditNote | data |
| `Kp_reviews` | GET | `/enterprise/knowledge-pay/reviews` | 审核 | 读 | session(会话) |  | page, pageSize, keyword, resourceId, status |  | data |
| `Kp_removeReview` | DELETE | `/enterprise/knowledge-pay/reviews/:id` | 删除审核 | 写 | session(会话) | id |  |  | data |
| `Kp_replyReview` | POST | `/enterprise/knowledge-pay/reviews/:id/reply` | 回复审核 | 写 | session(会话) | id |  | reply | data |
| `Kp_setReviewStatus` | POST | `/enterprise/knowledge-pay/reviews/:id/status` | 设置审核状态 | 写 | session(会话) | id |  | status | data |
| `Kp_settings` | GET | `/enterprise/knowledge-pay/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Kp_saveSettings` | PUT | `/enterprise/knowledge-pay/settings` | 保存设置 | 写 | session(会话) |  |  | siteName, slogan, themeColor, toggles, faq, about, vipPlans, signRewards, hotWords, moreTitle, wxAppId, wxAppSecret, wxMchId, wxPaySerial, wxPayApiV3Key, wxPayPrivateKey, adUnitTab, adUnitDetail, enabled | data |
| `Kp_test` | POST | `/enterprise/knowledge-pay/settings/test` | 测试 | 写 | session(会话) |  |  |  | data |
| `Kp_testPay` | POST | `/enterprise/knowledge-pay/settings/test-pay` | 测试核销 | 写 | session(会话) |  |  |  | data |
| `Kp_teachers` | GET | `/enterprise/knowledge-pay/teachers` | TEACHERS | 读 | session(会话) |  |  |  | data |
| `Kp_saveTeacher` | POST | `/enterprise/knowledge-pay/teachers` | 保存TEACHER | 写 | session(会话) |  |  | name, title, avatar, intro, sort, status | data |
| `Kp_removeTeacher` | DELETE | `/enterprise/knowledge-pay/teachers/:id` | 删除TEACHER | 写 | session(会话) | id |  |  | data |
| `Kp_updateTeacher` | PUT | `/enterprise/knowledge-pay/teachers/:id` | 修改TEACHER | 写 | session(会话) | id |  | name, title, avatar, intro, sort, status | data |

返回 `INDEX.md`。

