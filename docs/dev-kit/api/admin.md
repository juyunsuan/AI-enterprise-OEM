<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：平台管理后台（`admin`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AdminAiCode_apply` | POST | `/enterprise/admin/ai-code/apply` | 申请 | 写 | admin(平台管理员) |  |  | sessionId, backupDatabase, backupCode, autoRollback, conflictStrategy, confirmation | data |
| `AdminAiCode_models` | GET | `/enterprise/admin/ai-code/models` | 模型 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminAiCode_overview` | GET | `/enterprise/admin/ai-code/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminAiCode_sessions` | GET | `/enterprise/admin/ai-code/sessions` | SESSIONS | 读 | admin(平台管理员) |  |  |  | data |
| `AdminAiCode_createSession` | POST | `/enterprise/admin/ai-code/sessions` | 新建SESSION | 写 | admin(平台管理员) |  |  | title, model | data |
| `AdminAiCode_session` | GET | `/enterprise/admin/ai-code/sessions/:id` | SESSION | 读 | admin(平台管理员) | id |  |  | data |
| `AdminAiCode_approve` | POST | `/enterprise/admin/ai-code/sessions/:id/approve` | 通过 | 写 | admin(平台管理员) | id |  | path, status | data |
| `AdminAiCode_edits` | GET | `/enterprise/admin/ai-code/sessions/:id/edits` | 修改记录 | 读 | admin(平台管理员) | id |  |  | data |
| `AdminAiCode_export` | POST | `/enterprise/admin/ai-code/sessions/:id/export` | 导出 | 写 | admin(平台管理员) | id |  |  | data |
| `AdminAiCode_revert` | POST | `/enterprise/admin/ai-code/sessions/:id/revert` | REVERT | 写 | admin(平台管理员) | id |  | path | data |
| `AdminAiCode_unlock` | POST | `/enterprise/admin/ai-code/unlock` | UNLOCK | 写 | admin(平台管理员) |  |  | password | data |
| `BrandMallAdmin_expressList` | GET | `/enterprise/admin/brand-mall/express/list` | EXPRESS列表 | 读 | admin(平台管理员) |  |  |  | data |
| `BrandMallAdmin_removeExpress` | POST | `/enterprise/admin/brand-mall/express/remove` | 删除EXPRESS | 写 | admin(平台管理员) |  |  | id | data |
| `BrandMallAdmin_saveExpress` | POST | `/enterprise/admin/brand-mall/express/save` | 保存EXPRESS | 写 | admin(平台管理员) |  |  | shopId, id, name, code, phone, enabled, sortOrder | data |
| `BrandMallAdmin_settings` | GET | `/enterprise/admin/brand-mall/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `BrandMallAdmin_saveSettings` | POST | `/enterprise/admin/brand-mall/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, shopQuota, productQuota, payAllowed, defaultTrade | data |
| `BrandMallAdmin_shopDetail` | GET | `/enterprise/admin/brand-mall/shop/detail` | SHOP详情 | 读 | admin(平台管理员) |  | shopId |  | data |
| `BrandMallAdmin_shops` | GET | `/enterprise/admin/brand-mall/shop/list` | SHOPS | 读 | admin(平台管理员) |  | page, pageSize, keyword, status, payFilter |  | data |
| `BrandMallAdmin_shopResume` | POST | `/enterprise/admin/brand-mall/shop/resume` | SHOP简历 | 写 | admin(平台管理员) |  |  | shopId | data |
| `BrandMallAdmin_shopSuspend` | POST | `/enterprise/admin/brand-mall/shop/suspend` | SHOPSUSPEND | 写 | admin(平台管理员) |  |  | shopId, reason | data |
| `BrandMallAdmin_statOverview` | GET | `/enterprise/admin/brand-mall/stat/overview` | 统计概览 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_capabilityRequests` | GET | `/enterprise/admin/capabilities` | 能力申请 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_requestPage` | GET | `/enterprise/admin/capability-requests/page` | 申请页面 | 读 | admin(平台管理员) |  | page, pageSize |  | data |
| `CardShopAdmin_orderSearch` | GET | `/enterprise/admin/card-shop/order/search` | 搜索订单 | 读 | admin(平台管理员) |  | keyword, page, pageSize |  | data |
| `CardShopAdmin_settings` | GET | `/enterprise/admin/card-shop/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `CardShopAdmin_saveSettings` | POST | `/enterprise/admin/card-shop/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, goodsQuota, cardQuota, importMaxLines, importMaxBytes, payAllowed, keywordFilter | data |
| `CircleAdmin_communities` | GET | `/enterprise/admin/circle/communities` | COMMUNITIES | 读 | admin(平台管理员) |  | page, pageSize, keyword, status |  | data |
| `CircleAdmin_communityStatus` | POST | `/enterprise/admin/circle/community/status` | COMMUNITY状态 | 写 | admin(平台管理员) |  |  | id, status, reason | data |
| `CircleAdmin_settings` | GET | `/enterprise/admin/circle/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `CircleAdmin_saveSettings` | POST | `/enterprise/admin/circle/settings/save` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, defaultPostReview, defaultCommentReview, maxGroupsPerUser, maxPostsPerDay | data |
| `CommunityAdmin_importStart` | POST | `/enterprise/admin/community/import` | 导入启动 | 写 | admin(平台管理员) |  |  | apiKey, includeWorkflows, includeJobs, limit | data |
| `CommunityAdmin_importPreview` | POST | `/enterprise/admin/community/import/preview` | 导入预览 | 写 | admin(平台管理员) |  |  | apiKey | data |
| `CommunityAdmin_importStatus` | GET | `/enterprise/admin/community/import/status` | 导入状态 | 读 | admin(平台管理员) |  |  |  | data |
| `CommunityAdmin_settings` | GET | `/enterprise/admin/community/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `CommunityAdmin_saveSettings` | PUT | `/enterprise/admin/community/settings` | 保存社区积分规则 | 写 | admin(平台管理员) |  |  | approveReward, recommendReward, perUserDailyCap, siteDailyCap | data |
| `CommunityAdmin_stats` | GET | `/enterprise/admin/community/stats` | 统计 | 读 | admin(平台管理员) |  |  |  | data |
| `CommunityAdmin_pending` | GET | `/enterprise/admin/community/workflows` | 待办 | 读 | admin(平台管理员) |  | page, pageSize, status, keyword |  | data |
| `CommunityAdmin_decide` | POST | `/enterprise/admin/community/workflows/:code/decide` | 审核社区工作流 | 写 | admin(平台管理员) | code |  | action, note | data |
| `Admin_contracts` | GET | `/enterprise/admin/contracts` | 合同 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_contractPage` | GET | `/enterprise/admin/contracts/page` | 合同页面 | 读 | admin(平台管理员) |  | page, pageSize, status |  | data |
| `DevGuideAdmin_view` | GET | `/enterprise/admin/dev-guide/detail` | 查看 | 读 | admin(平台管理员) |  |  |  | data |
| `DevGuideAdmin_save` | POST | `/enterprise/admin/dev-guide/save` | 保存 | 写 | admin(平台管理员) |  |  | notice | data |
| `Admin_enterprises` | GET | `/enterprise/admin/enterprises` | 企业 | 读 | admin(平台管理员) |  | status |  | data |
| `Admin_capabilities` | GET | `/enterprise/admin/enterprises/:id/capabilities` | 能力 | 读 | admin(平台管理员) | id |  |  | data |
| `Admin_setCapability` | POST | `/enterprise/admin/enterprises/:id/capabilities/:code` | 设置能力 | 写 | admin(平台管理员) | id, code |  | action, note, qxyAccountId | data |
| `Admin_capabilityMatrix` | GET | `/enterprise/admin/enterprises/capabilities` | 能力矩阵 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_capabilityPage` | GET | `/enterprise/admin/enterprises/capabilities/page` | 能力页面 | 读 | admin(平台管理员) |  | page, pageSize |  | data |
| `ErrandAdmin_settings` | GET | `/enterprise/admin/errand/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `ErrandAdmin_saveSettings` | POST | `/enterprise/admin/errand/settings/save` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, payAllowed, aiAllowed | data |
| `Admin_flexPayroll` | GET | `/enterprise/admin/flex-payroll` | 用工发薪 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_saveFlexPayroll` | POST | `/enterprise/admin/flex-payroll` | 保存用工发薪 | 写 | admin(平台管理员) |  |  | enabled | data |
| `Admin_geoCollectionStats` | GET | `/enterprise/admin/geo-collection/stats` | GEO采集统计 | 读 | admin(平台管理员) |  |  |  | data |
| `GeoSiteAdmin_domainCheck` | POST | `/enterprise/admin/geo-site/domain/check` | DOMAIN检查 | 写 | admin(平台管理员) |  |  | domainId | data |
| `GeoSiteAdmin_domainGuide` | GET | `/enterprise/admin/geo-site/domain/guide` | DOMAINGUIDE | 读 | admin(平台管理员) |  |  |  | data |
| `GeoSiteAdmin_domainRemove` | POST | `/enterprise/admin/geo-site/domain/remove` | 删除DOMAIN | 写 | admin(平台管理员) |  |  | domainId | data |
| `GeoSiteAdmin_domainResolve` | GET | `/enterprise/admin/geo-site/domain/resolve` | DOMAINRESOLVE | 读 | admin(平台管理员) |  | host |  | data |
| `GeoSiteAdmin_domainList` | GET | `/enterprise/admin/geo-site/domains` | DOMAIN列表 | 读 | admin(平台管理员) |  | page, pageSize, q, status |  | data |
| `GeoSiteAdmin_offline` | POST | `/enterprise/admin/geo-site/offline` | OFFLINE | 写 | admin(平台管理员) |  |  | id, reason | data |
| `GeoSiteAdmin_online` | POST | `/enterprise/admin/geo-site/online` | ONLINE | 写 | admin(平台管理员) |  |  | id | data |
| `GeoSiteAdmin_page` | GET | `/enterprise/admin/geo-site/page` | 页面 | 读 | admin(平台管理员) |  | page, pageSize, q, status |  | data |
| `GeoSiteAdmin_getSettings` | GET | `/enterprise/admin/geo-site/settings` | 获取设置 | 读 | admin(平台管理员) |  |  |  | data |
| `GeoSiteAdmin_saveSettings` | PUT | `/enterprise/admin/geo-site/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | customDomainEnabled, hostAccessEnabled, rootDomainOverride, cnameTargetOverride, needsIcpAck, maxSitesPerOwner, maxDomainsPerSite, graceHours, suspendOnArrears, customScriptEnabled, scriptHostWhitelist, maxScriptsPerPage | data |
| `GeoSiteAdmin_stats` | GET | `/enterprise/admin/geo-site/stats` | 统计 | 读 | admin(平台管理员) |  |  |  | data |
| `HealthAdmin_orders` | GET | `/enterprise/admin/health/orders` | 订单 | 读 | admin(平台管理员) |  | page, pageSize, shopId, bizType, orderStatus, from, to |  | data |
| `HealthAdmin_settings` | GET | `/enterprise/admin/health/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `HealthAdmin_saveSettings` | POST | `/enterprise/admin/health/settings/save` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, allowOnlinePay, defaultTrade | data |
| `KuaidiAdmin_settings` | GET | `/enterprise/admin/kuaidi/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `KuaidiAdmin_saveSettings` | POST | `/enterprise/admin/kuaidi/settings/save` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, payAllowed | data |
| `AdminMarketingQr_list` | GET | `/enterprise/admin/marketing-livecode` | 平台查看活码清单 | 读 | admin(平台管理员) |  | page, pageSize, keyword |  | data |
| `AdminMarketingQr_disable` | POST | `/enterprise/admin/marketing-livecode/:id/disable` | 平台下架活码 | 写 | admin(平台管理员) | id |  | reason, enable | data |
| `MpAdmin_markets` | GET | `/enterprise/admin/marketplace/market/list` | MARKETS | 读 | admin(平台管理员) |  | page, pageSize, keyword, status |  | data |
| `MpAdmin_marketStatus` | POST | `/enterprise/admin/marketplace/market/status` | MARKET状态 | 写 | admin(平台管理员) |  |  | id, status, reason | data |
| `MpAdmin_overview` | GET | `/enterprise/admin/marketplace/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `MiniGuideAdmin_view` | GET | `/enterprise/admin/mini-guide/detail` | 查看 | 读 | admin(平台管理员) |  |  |  | data |
| `MiniGuideAdmin_save` | POST | `/enterprise/admin/mini-guide/save` | 保存 | 写 | admin(平台管理员) |  |  | body, overrides | data |
| `MiniProgramAdmin_builtin` | GET | `/enterprise/admin/miniprogram/builtin` | BUILTIN | 读 | admin(平台管理员) |  |  |  | data |
| `MiniProgramAdmin_qrcode` | POST | `/enterprise/admin/miniprogram/qrcode` | QRCODE | 写 | admin(平台管理员) |  |  | mode, fileName, ossKey | data |
| `MiniProgramAdmin_settings` | GET | `/enterprise/admin/miniprogram/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `MiniProgramAdmin_saveSettings` | PUT | `/enterprise/admin/miniprogram/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, appName, appId, appSecret, siteDomain, themeColor, features | data |
| `MiniProgramAdmin_test` | POST | `/enterprise/admin/miniprogram/settings/test` | 测试 | 写 | admin(平台管理员) |  |  |  | data |
| `AdminMp_listCatalog` | GET | `/enterprise/admin/model-plaza/catalog` | 列表目录 | 读 | admin(平台管理员) |  | page, pageSize, keyword, provider, category, enabled |  | data |
| `AdminMp_saveCatalog` | POST | `/enterprise/admin/model-plaza/catalog` | 保存目录 | 写 | admin(平台管理员) |  |  | id, upstreamId, provider, modelKey, upstreamModelKey, displayName, vendor, description, billingUnit, category, inputRmbPrice, outputRmbPrice, callRmbPrice, cacheReadRmbPrice, cacheWriteRmbPrice, minimumRmb, tiers, components, discountRate, contextWindow, maxOutputTokens, modalities, endpoints, tags, enabled, sort, remark | data |
| `AdminMp_removeCatalog` | DELETE | `/enterprise/admin/model-plaza/catalog/:id` | 删除目录 | 写 | admin(平台管理员) | id |  |  | data |
| `AdminMp_toggleCatalog` | POST | `/enterprise/admin/model-plaza/catalog/:id/toggle` | 启停目录 | 写 | admin(平台管理员) | id |  | enabled | data |
| `AdminMp_channelPolicy` | GET | `/enterprise/admin/model-plaza/channel-policy` | 渠道策略 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminMp_saveChannelPolicy` | PUT | `/enterprise/admin/model-plaza/channel-policy` | 保存渠道策略 | 写 | admin(平台管理员) |  |  | allowCustom, presetTypes, disabledProviders | data |
| `AdminMp_importModels` | POST | `/enterprise/admin/model-plaza/import` | 导入模型 | 写 | admin(平台管理员) |  |  | upstreamId, models, enabled, disableMissing | data |
| `AdminMp_overview` | GET | `/enterprise/admin/model-plaza/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminMp_platformDefaults` | GET | `/enterprise/admin/model-plaza/platform-defaults` | PLATFORMDEFAULTS | 读 | admin(平台管理员) |  |  |  | data |
| `AdminMp_savePlatformDefaults` | PUT | `/enterprise/admin/model-plaza/platform-defaults` | 保存PLATFORMDEFAULTS | 写 | admin(平台管理员) |  |  | enabled, limits, models | data |
| `AdminMp_pullModels` | POST | `/enterprise/admin/model-plaza/pull` | 拉群模型 | 写 | admin(平台管理员) |  |  | upstreamId, baseUrl, apiKey, protocol | data |
| `AdminMp_seed` | POST | `/enterprise/admin/model-plaza/seed` | SEED | 写 | admin(平台管理员) |  |  |  | data |
| `AdminMp_upstreams` | GET | `/enterprise/admin/model-plaza/upstreams` | UPSTREAMS | 读 | admin(平台管理员) |  |  |  | data |
| `AdminMp_saveUpstream` | POST | `/enterprise/admin/model-plaza/upstreams` | 保存UPSTREAM | 写 | admin(平台管理员) |  |  | id, name, provider, baseUrl, protocol, apiKey, enabled, remark | data |
| `AdminMp_removeUpstream` | DELETE | `/enterprise/admin/model-plaza/upstreams/:id` | 删除UPSTREAM | 写 | admin(平台管理员) | id |  |  | data |
| `AdminMp_usageList` | GET | `/enterprise/admin/model-plaza/usage` | 用量列表 | 读 | admin(平台管理员) |  | page, pageSize, source, modelKey, from, to, userId |  | data |
| `OnsiteAdmin_settings` | GET | `/enterprise/admin/onsite/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `OnsiteAdmin_saveSettings` | PUT | `/enterprise/admin/onsite/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, allowOnlinePay, defaultTrade | data |
| `OnsiteAdmin_shops` | GET | `/enterprise/admin/onsite/shops` | SHOPS | 读 | admin(平台管理员) |  | page, pageSize, keyword, status |  | data |
| `OnsiteAdmin_resumeShop` | POST | `/enterprise/admin/onsite/shops/:id/resume` | 简历SHOP | 写 | admin(平台管理员) | id |  |  | data |
| `OnsiteAdmin_suspendShop` | POST | `/enterprise/admin/onsite/shops/:id/suspend` | SUSPENDSHOP | 写 | admin(平台管理员) | id |  | reason | data |
| `OssSettings_view` | GET | `/enterprise/admin/oss-settings` | 查看 OSS 配置 | 读 | admin(平台管理员) |  |  |  | data |
| `OssSettings_save` | PUT | `/enterprise/admin/oss-settings` | 保存 OSS 配置 | 写 | admin(平台管理员) |  |  | bucket, endpoint, region, dir, accessKeyId, accessKeySecret, securityToken | data |
| `OssSettings_test` | POST | `/enterprise/admin/oss-settings/test` | 测试 OSS 连接 | 写 | admin(平台管理员) |  |  |  | data |
| `AdminOverseasNav_tree` | GET | `/enterprise/admin/overseas-nav` | 平台查看出海导航 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminOverseasNav_saveCategory` | POST | `/enterprise/admin/overseas-nav/categories` | 新建或修改导航分类 | 写 | admin(平台管理员) |  |  | id, name, parentId, sortOrder, visible | data |
| `AdminOverseasNav_removeCategory` | DELETE | `/enterprise/admin/overseas-nav/categories/:id` | 删除导航分类 | 写 | admin(平台管理员) | id |  |  | data |
| `AdminOverseasNav_saveItem` | POST | `/enterprise/admin/overseas-nav/items` | 新建或修改导航站点 | 写 | admin(平台管理员) |  |  | id, categoryId, title, description, url, logoUrl, sortOrder, visible | data |
| `AdminOverseasNav_removeItem` | DELETE | `/enterprise/admin/overseas-nav/items/:id` | 删除导航站点 | 写 | admin(平台管理员) | id |  |  | data |
| `AdminCard_templates` | GET | `/enterprise/admin/points/cards` | 模板 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminCard_saveTemplate` | POST | `/enterprise/admin/points/cards` | 保存模板 | 写 | admin(平台管理员) |  |  | id, code, name, catalogId, quotaTotal, validDays, specMultipliers, pointsPrice, cashCents, perUserLimit, status, sortOrder, remark | data |
| `AdminCard_revokeCard` | POST | `/enterprise/admin/points/cards/:cardId/revoke` | 吊销图卡 | 写 | admin(平台管理员) | cardId |  | password, compensate | data |
| `AdminCard_removeTemplate` | DELETE | `/enterprise/admin/points/cards/:code` | 删除模板 | 写 | admin(平台管理员) | code |  |  | data |
| `Admin_apps` | GET | `/enterprise/admin/provider-applications` | 申请 | 读 | admin(平台管理员) |  | status |  | data |
| `Admin_auditApp` | POST | `/enterprise/admin/provider-applications/:id/audit` | 审核申请 | 写 | admin(平台管理员) | id |  | action, note, items | data |
| `Admin_appPage` | GET | `/enterprise/admin/provider-applications/page` | 申请页面 | 读 | admin(平台管理员) |  | page, pageSize |  | data |
| `Admin_providers` | GET | `/enterprise/admin/providers` | 服务商 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_restore` | POST | `/enterprise/admin/providers/:userId/services/:type/restore` | 恢复 | 写 | admin(平台管理员) | userId, type |  |  | data |
| `Admin_revoke` | POST | `/enterprise/admin/providers/:userId/services/:type/revoke` | 吊销 | 写 | admin(平台管理员) | userId, type |  |  | data |
| `Admin_providerPage` | GET | `/enterprise/admin/providers/page` | 服务商页面 | 读 | admin(平台管理员) |  | page, pageSize |  | data |
| `Admin_providerStats` | GET | `/enterprise/admin/providers/stats` | 服务商统计 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_settings` | GET | `/enterprise/admin/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_saveSettings` | PUT | `/enterprise/admin/settings` | 保存设置 | 写 | admin(平台管理员) |  |  |  | data |
| `Admin_skillGeneratorCatalog` | GET | `/enterprise/admin/skill-generator/catalog` | 技能GENERATOR目录 | 读 | admin(平台管理员) |  |  |  | data |
| `Admin_generateSkill` | POST | `/enterprise/admin/skill-generator/generate` | 生成技能 | 写 | admin(平台管理员) |  |  | name, displayName, description, domain, operationIds, baseUrl | data |
| `Admin_stats` | GET | `/enterprise/admin/stats` | 统计 | 读 | admin(平台管理员) |  |  |  | data |
| `Storage_migrate` | POST | `/enterprise/admin/storage/migrate` | MIGRATE | 写 | admin(平台管理员) |  |  | limit, cursor | data |
| `Storage_overview` | GET | `/enterprise/admin/storage/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `ToolLaunchAdmin_overview` | GET | `/enterprise/admin/tool-launch/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `ToolLaunchAdmin_savePolicy` | POST | `/enterprise/admin/tool-launch/policy` | 保存策略 | 写 | admin(平台管理员) |  |  | graceHours, transitionDays, suspendOnArrears | data |
| `ToolLaunchAdmin_savePricing` | POST | `/enterprise/admin/tool-launch/pricing` | 保存PRICING | 写 | admin(平台管理员) |  |  | tool, billingCycle, mode, unitPriceAmount, freeQuotaAmount, minChargeAmount, usageUnitSize, launchEnabled, usageBilled, enabled | data |
| `ToolLaunchAdmin_subscriptions` | GET | `/enterprise/admin/tool-launch/subscriptions` | SUBSCRIPTIONS | 读 | admin(平台管理员) |  | tool, status, keyword, page, pageSize |  | data |
| `ToolLaunchAdmin_toggle` | POST | `/enterprise/admin/tool-launch/toggle` | 启停 | 写 | admin(平台管理员) |  |  | user, tool, off, reason | data |
| `AdminUpgrade_analyze` | POST | `/enterprise/admin/upgrade/analyze` | ANALYZE | 写 | admin(平台管理员) |  |  | packageId | data |
| `AdminUpgrade_backups` | GET | `/enterprise/admin/upgrade/backups` | BACKUPS | 读 | admin(平台管理员) |  |  |  | data |
| `AdminUpgrade_removeBackup` | DELETE | `/enterprise/admin/upgrade/backups/:id` | 删除BACKUP | 写 | admin(平台管理员) | id |  |  | data |
| `AdminUpgrade_check` | POST | `/enterprise/admin/upgrade/check` | 检查 | 写 | admin(平台管理员) |  |  |  | data |
| `AdminUpgrade_download` | POST | `/enterprise/admin/upgrade/download` | DOWNLOAD | 写 | admin(平台管理员) |  |  | mode, tag | data |
| `AdminUpgrade_execute` | POST | `/enterprise/admin/upgrade/jobs` | EXECUTE | 写 | admin(平台管理员) |  |  | packageId, backupDatabase, backupCode, autoRollback, conflictStrategy, confirmation | data |
| `AdminUpgrade_job` | GET | `/enterprise/admin/upgrade/jobs/:id` | 生成任务 | 读 | admin(平台管理员) | id |  |  | data |
| `AdminUpgrade_cancel` | POST | `/enterprise/admin/upgrade/jobs/:id/cancel` | 取消 | 写 | admin(平台管理员) | id |  |  | data |
| `AdminUpgrade_logs` | GET | `/enterprise/admin/upgrade/jobs/:id/logs` | 日志 | 读 | admin(平台管理员) | id |  |  | data |
| `AdminUpgrade_maintenance` | GET | `/enterprise/admin/upgrade/maintenance` | MAINTENANCE | 读 | admin(平台管理员) |  |  |  | data |
| `AdminUpgrade_setMaintenance` | POST | `/enterprise/admin/upgrade/maintenance` | 设置MAINTENANCE | 写 | admin(平台管理员) |  |  | on, reason | data |
| `AdminUpgrade_overview` | GET | `/enterprise/admin/upgrade/overview` | 概览 | 读 | admin(平台管理员) |  |  |  | data |
| `AdminUpgrade_packages` | GET | `/enterprise/admin/upgrade/packages` | PACKAGES | 读 | admin(平台管理员) |  |  |  | data |
| `AdminUpgrade_removePackage` | DELETE | `/enterprise/admin/upgrade/packages/:id` | 删除PACKAGE | 写 | admin(平台管理员) | id |  |  | data |
| `AdminUpgrade_restore` | POST | `/enterprise/admin/upgrade/restores` | 恢复 | 写 | admin(平台管理员) |  |  | backupId, mode, confirmation | data |
| `Admin_users` | GET | `/enterprise/admin/users` | 用户 | 读 | admin(平台管理员) |  |  |  | data |
| `VideoTemplateAdmin_settings` | GET | `/enterprise/admin/video-templates/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `VideoTemplateAdmin_saveSettings` | PUT | `/enterprise/admin/video-templates/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | showAiworkin, mode, intervalMinutes | data |
| `VideoTemplateAdmin_sync` | POST | `/enterprise/admin/video-templates/sync` | 同步 | 写 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_bindings` | GET | `/enterprise/admin/wechat-mp/bindings` | 绑定 | 读 | admin(平台管理员) |  | page, pageSize, keyword, subscribed |  | data |
| `WechatMpAdmin_unbindBinding` | POST | `/enterprise/admin/wechat-mp/bindings/:userId/unbind` | 解绑绑定 | 写 | admin(平台管理员) | userId |  |  | data |
| `WechatMpAdmin_menu` | GET | `/enterprise/admin/wechat-mp/menu` | 菜单 | 读 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_saveMenu` | PUT | `/enterprise/admin/wechat-mp/menu` | 保存菜单 | 写 | admin(平台管理员) |  |  | button | data |
| `WechatMpAdmin_publishMenu` | POST | `/enterprise/admin/wechat-mp/menu/publish` | 发布菜单 | 写 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_pullMenu` | POST | `/enterprise/admin/wechat-mp/menu/pull` | 拉群菜单 | 写 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_messages` | GET | `/enterprise/admin/wechat-mp/messages` | 留言 | 读 | admin(平台管理员) |  | page, pageSize, status, eventKey, keyword |  | data |
| `WechatMpAdmin_retry` | POST | `/enterprise/admin/wechat-mp/messages/:id/retry` | 重试 | 写 | admin(平台管理员) | id |  |  | data |
| `WechatMpAdmin_settings` | GET | `/enterprise/admin/wechat-mp/settings` | 设置 | 读 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_saveSettings` | PUT | `/enterprise/admin/wechat-mp/settings` | 保存设置 | 写 | admin(平台管理员) |  |  | enabled, accountName, appId, token, appSecret, encodingAesKey, encryptedMode, followReply, keywordReplies, defaultReply, quietHours, dailyCap, dedupeSeconds, mobileLinks, templates | data |
| `WechatMpAdmin_test` | POST | `/enterprise/admin/wechat-mp/settings/test` | 测试 | 写 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_stats` | GET | `/enterprise/admin/wechat-mp/stats` | 统计 | 读 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_templates` | GET | `/enterprise/admin/wechat-mp/templates` | 模板 | 读 | admin(平台管理员) |  |  |  | data |
| `WechatMpAdmin_saveTemplates` | PUT | `/enterprise/admin/wechat-mp/templates` | 保存模板 | 写 | admin(平台管理员) |  |  | templates | data |
| `WechatMpAdmin_testSend` | POST | `/enterprise/admin/wechat-mp/templates/test-send` | 测试发送 | 写 | admin(平台管理员) |  |  | eventKey, userId | data |

返回 `INDEX.md`。

