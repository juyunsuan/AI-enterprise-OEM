<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：腾讯企点营销云（`tencent-qidian`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Tp_accounts` | GET | `/enterprise/tencent-qidian/accounts` | 凭据 | 读 | session(会话) |  |  |  | data |
| `Tp_saveAccount` | POST | `/enterprise/tencent-qidian/accounts` | 保存账号 | 写 | session(会话) |  |  | id, product, label, gateway, corporationId, secretId, secretKey, bizId, status | data |
| `Tp_deleteAccount` | DELETE | `/enterprise/tencent-qidian/accounts/:id` | 删除账号 | 写 | session(会话) | id |  |  | data |
| `Tp_testAccount` | POST | `/enterprise/tencent-qidian/accounts/:id/test` | 测试账号 | 写 | session(会话) | id |  |  | data |
| `Tp_caMessages` | POST | `/enterprise/tencent-qidian/ca/messages` | 客户分析留言 | 写 | session(会话) |  |  |  | data |
| `Tp_caResponseStats` | GET | `/enterprise/tencent-qidian/ca/response-stats` | 查看客户分析响应统计 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_caTagTasks` | GET | `/enterprise/tencent-qidian/ca/tag-tasks` | 标记客户分析任务 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_caTagDetail` | GET | `/enterprise/tencent-qidian/ca/tag-tasks/:id` | 标记客户分析详情 | 读 | session(会话) | id | accountId, page, pageSize, keyword |  | data |
| `Tp_cdpCustomerDetail` | POST | `/enterprise/tencent-qidian/cdp/customers/detail` | 客户数据客户详情 | 写 | session(会话) |  |  |  | data |
| `Tp_cdpImportCustomers` | POST | `/enterprise/tencent-qidian/cdp/customers/import` | 客户数据导入客户 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, mode | data |
| `Tp_cdpCustomerTags` | POST | `/enterprise/tencent-qidian/cdp/customers/tags` | 客户数据客户标签 | 写 | session(会话) |  |  |  | data |
| `Tp_cdpCustomerTrace` | POST | `/enterprise/tencent-qidian/cdp/customers/trace` | 客户数据客户轨迹 | 写 | session(会话) |  |  |  | data |
| `Tp_cdpProperties` | GET | `/enterprise/tencent-qidian/cdp/properties` | 客户数据客户字段 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_cdpSegments` | GET | `/enterprise/tencent-qidian/cdp/segments` | 客户数据分群 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_cdpSegmentDetail` | GET | `/enterprise/tencent-qidian/cdp/segments/:id` | 客户数据分群详情 | 读 | session(会话) | id | accountId |  | data |
| `Tp_cdpExportSegment` | POST | `/enterprise/tencent-qidian/cdp/segments/:id/export` | 客户数据导出分群 | 写 | session(会话) | id |  | accountId, tableId, tableName, mapping, confirmCost, exportSaKey | data |
| `Tp_cdpCreateSegment` | POST | `/enterprise/tencent-qidian/cdp/segments/import` | 客户数据新建分群 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, crowdName, identityId | data |
| `Tp_cdpCreateTag` | POST | `/enterprise/tencent-qidian/cdp/tags` | 客户数据新建标记 | 写 | session(会话) |  |  |  | data |
| `Tp_cdpApplyTags` | POST | `/enterprise/tencent-qidian/cdp/tags/apply` | 客户数据申请标签 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, tagId, entityKey, opType | data |
| `Tp_cdpTaskRecord` | GET | `/enterprise/tencent-qidian/cdp/task-records/:taskId` | 客户数据任务记录 | 读 | session(会话) | taskId | accountId |  | data |
| `Tp_crmImport` | POST | `/enterprise/tencent-qidian/crm/import` | 导入 CRM 客户 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, source, crowdId | data |
| `Tp_faBoards` | GET | `/enterprise/tencent-qidian/fa/boards` | 融合分析看板 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_faCards` | GET | `/enterprise/tencent-qidian/fa/boards/:id/cards` | 融合分析图卡 | 读 | session(会话) | id | accountId, page, pageSize, keyword |  | data |
| `Tp_faAsyncResult` | POST | `/enterprise/tencent-qidian/fa/cards/async-result` | 融合分析异步结果 | 写 | session(会话) |  |  |  | data |
| `Tp_faCardResult` | POST | `/enterprise/tencent-qidian/fa/cards/result` | 融合分析图卡结果 | 写 | session(会话) |  |  |  | data |
| `Tp_lmCoupons` | GET | `/enterprise/tencent-qidian/lm/coupons` | 会员优惠券 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_lmCouponIssue` | POST | `/enterprise/tencent-qidian/lm/coupons/issue` | 会员优惠券发放 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, couponId | data |
| `Tp_lmSaveMember` | POST | `/enterprise/tencent-qidian/lm/members` | 会员保存会员 | 写 | session(会话) |  |  | accountId, memberId, payload | data |
| `Tp_lmMembers` | POST | `/enterprise/tencent-qidian/lm/members/search` | 会员会员 | 写 | session(会话) |  |  |  | data |
| `Tp_lmMemberStatus` | POST | `/enterprise/tencent-qidian/lm/members/status` | 会员会员状态 | 写 | session(会话) |  |  | accountId, memberId, op | data |
| `Tp_lmIssuePoints` | POST | `/enterprise/tencent-qidian/lm/points/issue` | 会员发放积分 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, programId, point, eventName | data |
| `Tp_lmPoints` | POST | `/enterprise/tencent-qidian/lm/points/search` | 会员积分 | 写 | session(会话) |  |  |  | data |
| `Tp_lmPrograms` | GET | `/enterprise/tencent-qidian/lm/programs` | 会员会员计划 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_maChannels` | GET | `/enterprise/tencent-qidian/ma/channels` | 营销触达渠道 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_maMassSend` | POST | `/enterprise/tencent-qidian/ma/mass-send` | 发起营销触达群发 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, channelType, templateId, name | data |
| `Tp_maSenders` | GET | `/enterprise/tencent-qidian/ma/senders` | 营销触达发件人 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_maShortLinks` | GET | `/enterprise/tencent-qidian/ma/short-links` | 营销触达短短链 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_maSaveShortLink` | POST | `/enterprise/tencent-qidian/ma/short-links` | 营销触达保存短短链 | 写 | session(会话) |  |  |  | data |
| `Tp_maDeleteShortLink` | POST | `/enterprise/tencent-qidian/ma/short-links/delete` | 营销触达删除短短链 | 写 | session(会话) |  |  | accountId, uniqueId | data |
| `Tp_maTemplates` | GET | `/enterprise/tencent-qidian/ma/templates` | 营销触达模板 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_maCreateTemplate` | POST | `/enterprise/tencent-qidian/ma/templates` | 营销触达新建模板 | 写 | session(会话) |  |  | accountId, type, payload | data |
| `Tp_mappings` | GET | `/enterprise/tencent-qidian/mappings` | 列映射 | 读 | session(会话) |  |  |  | data |
| `Tp_saveMapping` | POST | `/enterprise/tencent-qidian/mappings` | 保存列映射 | 写 | session(会话) |  |  | datasetKey, tableId, tableName, columnMap | data |
| `Tp_rtaUploadAudience` | POST | `/enterprise/tencent-qidian/rta/audiences` | 广告人群上传广告人群 | 写 | session(会话) |  |  | accountId, tableId, tableName, mapping, confirmCost, crowdName, dataType, advertiserId | data |
| `Tp_scrmCodes` | GET | `/enterprise/tencent-qidian/scrm/codes` | 企微活码 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_scrmSaveCode` | POST | `/enterprise/tencent-qidian/scrm/codes` | 企微保存活码 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmDeleteCode` | POST | `/enterprise/tencent-qidian/scrm/codes/delete` | 企微删除活码 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmFollowups` | GET | `/enterprise/tencent-qidian/scrm/followups` | 企微跟进任务 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_scrmFollowupCustomers` | POST | `/enterprise/tencent-qidian/scrm/followups/customers` | 企微跟进任务客户 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmFollowupDone` | POST | `/enterprise/tencent-qidian/scrm/followups/done` | 企微跟进任务完成 | 写 | session(会话) |  |  | accountId, taskId, customerId, staffId, confirmCost | data |
| `Tp_scrmMassTasks` | GET | `/enterprise/tencent-qidian/scrm/mass-tasks` | 查看企微群发任务 | 读 | session(会话) |  | accountId, page, pageSize, keyword |  | data |
| `Tp_scrmSaveMassTask` | POST | `/enterprise/tencent-qidian/scrm/mass-tasks` | 保存企微群发任务 | 写 | session(会话) |  |  | accountId, taskId, payload, confirmCost | data |
| `Tp_scrmControlMassTask` | POST | `/enterprise/tencent-qidian/scrm/mass-tasks/control` | 控制企微群发任务 | 写 | session(会话) |  |  | accountId, taskId, op, confirmCost | data |
| `Tp_scrmMassTaskExecution` | POST | `/enterprise/tencent-qidian/scrm/mass-tasks/execution` | 查看企微群发执行 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmMassTaskStats` | POST | `/enterprise/tencent-qidian/scrm/mass-tasks/stats` | 查看企微群发统计 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmOrgs` | POST | `/enterprise/tencent-qidian/scrm/orgs` | 企微组织 | 写 | session(会话) |  |  |  | data |
| `Tp_scrmWelcome` | POST | `/enterprise/tencent-qidian/scrm/welcome` | 企微欢迎语 | 写 | session(会话) |  |  |  | data |
| `Tp_tasks` | GET | `/enterprise/tencent-qidian/tasks` | 任务 | 读 | session(会话) |  | page, pageSize |  | data |
| `Tp_taskDetail` | GET | `/enterprise/tencent-qidian/tasks/:id` | 任务详情 | 读 | session(会话) | id |  |  | data |
| `Tp_retryTask` | POST | `/enterprise/tencent-qidian/tasks/:id/retry` | 重试任务 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

