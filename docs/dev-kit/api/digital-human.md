<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：digital-human（`digital-human`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Dh_aiRecordsList` | GET | `/enterprise/digital-human/ai-records` | AI记录列表 | 读 | session(会话) |  | page, pageSize, memberId |  | data |
| `Dh_articlesList` | GET | `/enterprise/digital-human/articles` | ARTICLES列表 | 读 | session(会话) |  | page, pageSize, type |  | data |
| `Dh_articleRemove` | POST | `/enterprise/digital-human/articles/remove` | 删除ARTICLE | 写 | session(会话) |  |  | id | data |
| `Dh_articleSave` | POST | `/enterprise/digital-human/articles/save` | 保存ARTICLE | 写 | session(会话) |  |  | id, type, contentType, title, cover, summary, body, link, sort, enabled | data |
| `Dh_balanceLogs` | GET | `/enterprise/digital-human/balance-logs` | 余额日志 | 读 | session(会话) |  | page, pageSize, memberId, account |  | data |
| `Dh_bgmGroupsList` | GET | `/enterprise/digital-human/bgm-groups` | BGM群列表 | 读 | session(会话) |  |  |  | data |
| `Dh_bgmGroupRemove` | POST | `/enterprise/digital-human/bgm-groups/remove` | 删除BGM群 | 写 | session(会话) |  |  | id | data |
| `Dh_bgmGroupSave` | POST | `/enterprise/digital-human/bgm-groups/save` | 保存BGM群 | 写 | session(会话) |  |  | id, name, sort, enabled | data |
| `Dh_bgmsList` | GET | `/enterprise/digital-human/bgms` | BGMS列表 | 读 | session(会话) |  | groupId |  | data |
| `Dh_bgmRemove` | POST | `/enterprise/digital-human/bgms/remove` | 删除BGM | 写 | session(会话) |  |  | id | data |
| `Dh_bgmSave` | POST | `/enterprise/digital-human/bgms/save` | 保存BGM | 写 | session(会话) |  |  | id, groupId, name, url, durationSec, sort, enabled | data |
| `Dh_bodiesList` | GET | `/enterprise/digital-human/bodies` | BODIES列表 | 读 | session(会话) |  | page, pageSize, memberId, status |  | data |
| `Dh_bodyRemove` | POST | `/enterprise/digital-human/bodies/remove` | 删除BODY | 写 | session(会话) |  |  | id | data |
| `Dh_cardBatchesList` | GET | `/enterprise/digital-human/card-batches` | 图卡批次列表 | 读 | session(会话) |  | page, pageSize |  | data |
| `Dh_cardBatchCreate` | POST | `/enterprise/digital-human/card-batches/create` | 新建图卡批次 | 写 | session(会话) |  |  | name, type, quantity, vipDays, point, bodyQuota, voiceQuota, remark | data |
| `Dh_cardsList` | GET | `/enterprise/digital-human/cards` | 图卡列表 | 读 | session(会话) |  | page, pageSize, batchId, status, keyword |  | data |
| `Dh_cardDisable` | POST | `/enterprise/digital-human/cards/disable` | 图卡DISABLE | 写 | session(会话) |  |  | id | data |
| `Dh_cardsExport` | GET | `/enterprise/digital-human/cards/export` | 图卡导出 | 读 | session(会话) |  | batchId |  | data |
| `Dh_channelsList` | GET | `/enterprise/digital-human/channels` | 渠道列表 | 读 | session(会话) |  | page, pageSize, capability |  | data |
| `Dh_channelRemove` | POST | `/enterprise/digital-human/channels/remove` | 删除渠道 | 写 | session(会话) |  |  | id | data |
| `Dh_channelSave` | POST | `/enterprise/digital-human/channels/save` | 保存渠道 | 写 | session(会话) |  |  | id, capability, protocol, name, baseUrl, key, secret, modelTier, enabled, isDefault | data |
| `Dh_channelTest` | POST | `/enterprise/digital-human/channels/test` | 测试渠道 | 写 | session(会话) |  |  | id | data |
| `Dh_commissionsList` | GET | `/enterprise/digital-human/commissions` | COMMISSIONS列表 | 读 | session(会话) |  | page, pageSize, memberId, type |  | data |
| `Dh_feedbacksList` | GET | `/enterprise/digital-human/feedbacks` | FEEDBACKS列表 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Dh_feedbackReply` | POST | `/enterprise/digital-human/feedbacks/reply` | 回复FEEDBACK | 写 | session(会话) |  |  | id, reply | data |
| `Dh_membersList` | GET | `/enterprise/digital-human/members` | 会员列表 | 读 | session(会话) |  | page, pageSize, keyword, vipOnly, promoterOnly, status |  | data |
| `Dh_memberUpdate` | POST | `/enterprise/digital-human/members/update` | 会员修改 | 写 | session(会话) |  |  | id, pointDelta, bodyDelta, voiceDelta, vipDays, status, remark | data |
| `Dh_miniApp` | GET | `/enterprise/digital-human/mini-app` | MINI申请 | 读 | session(会话) |  |  |  | data |
| `Dh_miniAppSave` | POST | `/enterprise/digital-human/mini-app` | 保存MINI申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Dh_miniAppTest` | POST | `/enterprise/digital-human/mini-app/test` | 测试MINI申请 | 写 | session(会话) |  |  |  | data |
| `Dh_ordersList` | GET | `/enterprise/digital-human/orders` | 订单列表 | 读 | session(会话) |  | page, pageSize, status, type, keyword |  | data |
| `Dh_orderRefund` | POST | `/enterprise/digital-human/orders/refund` | 订单REFUND | 写 | session(会话) |  |  | id, reason | data |
| `Dh_overview` | GET | `/enterprise/digital-human/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Dh_packagesList` | GET | `/enterprise/digital-human/packages` | PACKAGES列表 | 读 | session(会话) |  | type |  | data |
| `Dh_packageRemove` | POST | `/enterprise/digital-human/packages/remove` | 删除PACKAGE | 写 | session(会话) |  |  | id | data |
| `Dh_packageSave` | POST | `/enterprise/digital-human/packages/save` | 保存PACKAGE | 写 | session(会话) |  |  | id, type, name, priceCents, originalCents, vipDays, point, bodyQuota, voiceQuota, limitNum, recommended, sort, enabled | data |
| `Dh_postersList` | GET | `/enterprise/digital-human/posters` | POSTERS列表 | 读 | session(会话) |  |  |  | data |
| `Dh_posterRemove` | POST | `/enterprise/digital-human/posters/remove` | 删除POSTER | 写 | session(会话) |  |  | id | data |
| `Dh_posterSave` | POST | `/enterprise/digital-human/posters/save` | 保存POSTER | 写 | session(会话) |  |  | id, name, bgUrl, avatarX, avatarY, avatarSize, qrX, qrY, qrSize, sort, enabled | data |
| `Dh_presetVoicesList` | GET | `/enterprise/digital-human/preset-voices` | PRESETVOICES列表 | 读 | session(会话) |  | groupId |  | data |
| `Dh_presetVoiceRemove` | POST | `/enterprise/digital-human/preset-voices/remove` | 删除PRESETVOICE | 写 | session(会话) |  |  | id | data |
| `Dh_presetVoiceSave` | POST | `/enterprise/digital-human/preset-voices/save` | 保存PRESETVOICE | 写 | session(会话) |  |  | id, groupId, name, speakerId, gender, language, demoUrl, tags, sort, enabled | data |
| `Dh_promoterAppliesList` | GET | `/enterprise/digital-human/promoter-applies` | PROMOTER申请列表 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Dh_promoterApplyAudit` | POST | `/enterprise/digital-human/promoter-applies/audit` | 申请PROMOTER审核 | 写 | session(会话) |  |  | id, pass, remark | data |
| `Dh_releaseQrcode` | GET | `/enterprise/digital-human/release/qrcode` | RELEASEQRCODE | 读 | session(会话) |  |  |  | data |
| `Dh_settings` | GET | `/enterprise/digital-human/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Dh_settingsSave` | POST | `/enterprise/digital-human/settings` | 保存设置 | 写 | session(会话) |  |  | siteName, slogan, logo, themeColor, servicePhone, brand, toggles, pricing, gift, login, clone, commission, serviceDeskSiteKey, diyPage, enabled | data |
| `Dh_swipersList` | GET | `/enterprise/digital-human/swipers` | SWIPERS列表 | 读 | session(会话) |  |  |  | data |
| `Dh_swiperRemove` | POST | `/enterprise/digital-human/swipers/remove` | 删除SWIPER | 写 | session(会话) |  |  | id | data |
| `Dh_swiperSave` | POST | `/enterprise/digital-human/swipers/save` | 保存SWIPER | 写 | session(会话) |  |  | id, title, image, link, sort, enabled | data |
| `Dh_tasksList` | GET | `/enterprise/digital-human/tasks` | 任务列表 | 读 | session(会话) |  | page, pageSize, kind, status |  | data |
| `Dh_taskRetry` | POST | `/enterprise/digital-human/tasks/retry` | 重试任务 | 写 | session(会话) |  |  | id | data |
| `Dh_voiceGroupsList` | GET | `/enterprise/digital-human/voice-groups` | VOICE群列表 | 读 | session(会话) |  |  |  | data |
| `Dh_voiceGroupRemove` | POST | `/enterprise/digital-human/voice-groups/remove` | 删除VOICE群 | 写 | session(会话) |  |  | id | data |
| `Dh_voiceGroupSave` | POST | `/enterprise/digital-human/voice-groups/save` | 保存VOICE群 | 写 | session(会话) |  |  | id, name, sort, enabled | data |
| `Dh_voicesList` | GET | `/enterprise/digital-human/voices` | VOICES列表 | 读 | session(会话) |  | page, pageSize, memberId, status |  | data |
| `Dh_voiceRemove` | POST | `/enterprise/digital-human/voices/remove` | 删除VOICE | 写 | session(会话) |  |  | id | data |
| `Dh_withdrawsList` | GET | `/enterprise/digital-human/withdraws` | 撤回列表 | 读 | session(会话) |  | page, pageSize, status, memberId |  | data |
| `Dh_withdrawAudit` | POST | `/enterprise/digital-human/withdraws/audit` | 审核撤回 | 写 | session(会话) |  |  | id, pass, remark | data |
| `Dh_worksList` | GET | `/enterprise/digital-human/works` | 工列表 | 读 | session(会话) |  | page, pageSize, status, memberId, keyword |  | data |
| `Dh_workRemove` | POST | `/enterprise/digital-human/works/remove` | 删除工 | 写 | session(会话) |  |  | id | data |
| `Dh_writeTopicsList` | GET | `/enterprise/digital-human/write-topics` | 写入主题列表 | 读 | session(会话) |  | kind |  | data |
| `Dh_writeTopicRemove` | POST | `/enterprise/digital-human/write-topics/remove` | 删除写入主题 | 写 | session(会话) |  |  | id | data |
| `Dh_writeTopicSave` | POST | `/enterprise/digital-human/write-topics/save` | 保存写入主题 | 写 | session(会话) |  |  | id, kind, title, category, content, modelTier, sort, enabled | data |

返回 `INDEX.md`。

