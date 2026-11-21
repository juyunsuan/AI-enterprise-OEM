<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：AIworkin 对接（`aiworkin`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Aiworkin_categories` | GET | `/enterprise/aiworkin/categories` | 类目 | 读 | session(会话) |  | domain |  | data |
| `Aiworkin_conversations` | GET | `/enterprise/aiworkin/conversations` | 会话 | 读 | session(会话) |  | page, pageSize, matchRunId |  | data |
| `Aiworkin_conversation` | GET | `/enterprise/aiworkin/conversations/:conversationId` | 会话 | 读 | session(会话) | conversationId |  |  | data |
| `Aiworkin_reply` | POST | `/enterprise/aiworkin/conversations/:conversationId/replies` | 回复 | 写 | session(会话) | conversationId |  | content, idempotencyKey | data |
| `Aiworkin_myDemands` | GET | `/enterprise/aiworkin/demands` | 我的需求 | 读 | session(会话) |  | page, pageSize, direction |  | data |
| `Aiworkin_publishDemand` | POST | `/enterprise/aiworkin/demands` | 发布需求 | 写 | session(会话) |  |  | title, description, direction, subcategoryId, demandMode, moneyMode, currency, amountMin, amountMax, unitLabel, tags, expectedOutcome, mustHaves, startAt, deadline, deliverables, acceptanceCriteria, referenceLinks, attributes, a2aConfig, contactName, contactPhone, contactWechat, contactEmail, replyEmailEnabled, replyEmail, expiresAt, publishAction, priceDescription, highlights, cases, deliveryMode, responseTime, qualifications, serviceArea | data |
| `Aiworkin_removeDemand` | DELETE | `/enterprise/aiworkin/demands/:listingId` | 删除需求 | 写 | session(会话) | listingId |  |  | data |
| `Aiworkin_demandDetail` | GET | `/enterprise/aiworkin/demands/:listingId` | 需求详情 | 读 | session(会话) | listingId |  |  | data |
| `Aiworkin_demandConversations` | GET | `/enterprise/aiworkin/demands/:listingId/conversations` | 需求会话 | 读 | session(会话) | listingId | page, pageSize |  | data |
| `Aiworkin_marketListings` | GET | `/enterprise/aiworkin/market/listings` | 市集服务 | 读 | session(会话) |  | page, pageSize, direction, keyword, category, province, city, status |  | data |
| `Aiworkin_profile` | GET | `/enterprise/aiworkin/profile` | 档案 | 读 | session(会话) |  |  |  | data |
| `Aiworkin_saveProfile` | PUT | `/enterprise/aiworkin/profile` | 保存档案 | 写 | session(会话) |  |  | primaryLocale, publicNameZh, publicNameEn, headlineZh, headlineEn, introductionZh, introductionEn, tagsZh, tagsEn, avatarOrLogoUrl, province, city, contactEmail, contactPhone, contactWechat, emailVisible, phoneVisible, wechatVisible, identityDetails, capabilities, credentials, cases, links | data |
| `Aiworkin_status` | GET | `/enterprise/aiworkin/status` | 状态 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

