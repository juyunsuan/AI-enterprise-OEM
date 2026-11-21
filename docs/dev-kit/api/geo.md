<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：GEO-AI 引擎优化（`geo`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Geo_removeBatch` | DELETE | `/enterprise/geo/batches/:id` | 删除批次 | 写 | session(会话) | id |  |  | data |
| `Geo_updateBatch` | PATCH | `/enterprise/geo/batches/:id` | 修改批次 | 写 | session(会话) | id |  |  | data |
| `Geo_observations` | GET | `/enterprise/geo/batches/:id/observations` | 观测 | 读 | session(会话) | id |  |  | data |
| `Geo_createObservation` | POST | `/enterprise/geo/batches/:id/observations` | 新建观测 | 写 | session(会话) | id |  |  | data |
| `Geo_meta` | GET | `/enterprise/geo/meta` | GEO 元数据 | 读 | session(会话) |  |  |  | data |
| `Geo_removeObservation` | DELETE | `/enterprise/geo/observations/:id` | 删除观测 | 写 | session(会话) | id |  |  | data |
| `Geo_updateObservation` | PATCH | `/enterprise/geo/observations/:id` | 修改观测 | 写 | session(会话) | id |  |  | data |
| `Geo_projects` | GET | `/enterprise/geo/projects` | 项目 | 读 | session(会话) |  |  |  | data |
| `Geo_createProject` | POST | `/enterprise/geo/projects` | 新建项目 | 写 | session(会话) |  |  |  | data |
| `Geo_removeProject` | DELETE | `/enterprise/geo/projects/:id` | 删除项目 | 写 | session(会话) | id |  |  | data |
| `Geo_updateProject` | PATCH | `/enterprise/geo/projects/:id` | 修改项目 | 写 | session(会话) | id |  |  | data |
| `Geo_autoCollect` | GET | `/enterprise/geo/projects/:id/auto-collect` | 采集自动 | 读 | session(会话) | id |  |  | data |
| `Geo_setAutoCollect` | PUT | `/enterprise/geo/projects/:id/auto-collect` | 设置自动采集 | 写 | session(会话) | id |  |  | data |
| `Geo_batches` | GET | `/enterprise/geo/projects/:id/batches` | 批次 | 读 | session(会话) | id |  |  | data |
| `Geo_createBatch` | POST | `/enterprise/geo/projects/:id/batches` | 新建批次 | 写 | session(会话) | id |  |  | data |
| `Geo_questions` | GET | `/enterprise/geo/projects/:id/questions` | 问题 | 读 | session(会话) | id |  |  | data |
| `Geo_createQuestion` | POST | `/enterprise/geo/projects/:id/questions` | 新建问题 | 写 | session(会话) | id |  |  | data |
| `Geo_report` | GET | `/enterprise/geo/projects/:id/report` | 报告 | 读 | session(会话) | id | batchId |  | data |
| `Geo_topics` | GET | `/enterprise/geo/projects/:id/topics` | 主题 | 读 | session(会话) | id |  |  | data |
| `Geo_createTopic` | POST | `/enterprise/geo/projects/:id/topics` | 新建主题 | 写 | session(会话) | id |  |  | data |
| `Geo_removeQuestion` | DELETE | `/enterprise/geo/questions/:id` | 删除问题 | 写 | session(会话) | id |  |  | data |
| `Geo_updateQuestion` | PATCH | `/enterprise/geo/questions/:id` | 修改问题 | 写 | session(会话) | id |  |  | data |
| `Geo_settings` | GET | `/enterprise/geo/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Geo_clearSettings` | DELETE | `/enterprise/geo/settings/:code` | 清空设置 | 写 | session(会话) | code |  |  | data |
| `Geo_saveSettings` | PUT | `/enterprise/geo/settings/:code` | 保存设置 | 写 | session(会话) | code |  | apiKey, model, baseUrl | data |
| `Geo_testSettings` | POST | `/enterprise/geo/settings/:code/test` | 测试设置 | 写 | session(会话) | code |  |  | data |
| `GeoSite_billing` | GET | `/enterprise/geo/site/billing` | 计费 | 读 | session(会话) |  | siteId |  | data |
| `GeoSite_saveContent` | POST | `/enterprise/geo/site/content` | 保存CONTENT | 写 | session(会话) |  |  | id, content | data |
| `GeoSiteContent_saveBody` | POST | `/enterprise/geo/site/content/body` | 保存BODY | 写 | session(会话) |  |  | id, kind, content | data |
| `GeoSiteContent_create` | POST | `/enterprise/geo/site/content/create` | 新建 | 写 | session(会话) |  |  | siteId, kind, lang, title, slug, summary, category, coverImage, gallery, tags, faqs, authorName, relatedIds, price, unit, priceOnAsk, specs, buyUrl, featured, sort, seo | data |
| `GeoSiteContent_detail` | GET | `/enterprise/geo/site/content/detail` | 详情 | 读 | session(会话) |  | kind, id |  | data |
| `GeoSiteContent_list` | GET | `/enterprise/geo/site/content/list` | 列表 | 读 | session(会话) |  | kind, siteId, lang, status, q, category, page, pageSize |  | data |
| `GeoSiteContent_offline` | POST | `/enterprise/geo/site/content/offline` | OFFLINE | 写 | session(会话) |  |  | id, kind | data |
| `GeoSiteContent_pickers` | GET | `/enterprise/geo/site/content/pickers` | PICKERS | 读 | session(会话) |  | siteId |  | data |
| `GeoSiteContent_publish` | POST | `/enterprise/geo/site/content/publish` | 发布 | 写 | session(会话) |  |  | id, kind | data |
| `GeoSiteContent_remove` | POST | `/enterprise/geo/site/content/remove` | 删除 | 写 | session(会话) |  |  | id, kind | data |
| `GeoSiteContent_update` | POST | `/enterprise/geo/site/content/update` | 修改 | 写 | session(会话) |  |  | siteId, kind, lang, title, slug, summary, category, coverImage, gallery, tags, faqs, authorName, relatedIds, price, unit, priceOnAsk, specs, buyUrl, featured, sort, seo, id | data |
| `GeoSite_create` | POST | `/enterprise/geo/site/create` | 新建 | 写 | session(会话) |  |  | title, template, geoProjectId, defaultLanguage, languages | data |
| `GeoSite_detail` | GET | `/enterprise/geo/site/detail` | 详情 | 读 | session(会话) |  | id |  | data |
| `GeoSite_bindDomain` | POST | `/enterprise/geo/site/domain/bind` | 绑定DOMAIN | 写 | session(会话) |  |  | siteId, domain, icpAcknowledged | data |
| `GeoSite_setPrimaryDomain` | POST | `/enterprise/geo/site/domain/primary` | 设置PRIMARYDOMAIN | 写 | session(会话) |  |  | domainId | data |
| `GeoSite_removeDomain` | POST | `/enterprise/geo/site/domain/remove` | 删除DOMAIN | 写 | session(会话) |  |  | domainId | data |
| `GeoSite_verifyDomain` | POST | `/enterprise/geo/site/domain/verify` | 校验DOMAIN | 写 | session(会话) |  |  | domainId | data |
| `GeoSite_domains` | GET | `/enterprise/geo/site/domains` | DOMAINS | 读 | session(会话) |  | siteId |  | data |
| `GeoSite_duplicate` | POST | `/enterprise/geo/site/duplicate` | DUPLICATE | 写 | session(会话) |  |  | id | data |
| `GeoSite_list` | GET | `/enterprise/geo/site/list` | 列表 | 读 | session(会话) |  |  |  | data |
| `GeoSiteMenu_create` | POST | `/enterprise/geo/site/menu/create` | 新建 | 写 | session(会话) |  |  | siteId, lang, location, parentId, label, targetType, targetId, url, sort, visible, openNewTab | data |
| `GeoSiteMenu_list` | GET | `/enterprise/geo/site/menu/list` | 列表 | 读 | session(会话) |  | siteId, location, lang |  | data |
| `GeoSiteMenu_remove` | POST | `/enterprise/geo/site/menu/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `GeoSiteMenu_saveTree` | POST | `/enterprise/geo/site/menu/tree` | 保存TREE | 写 | session(会话) |  |  | siteId, location, lang, items | data |
| `GeoSiteMenu_update` | POST | `/enterprise/geo/site/menu/update` | 修改 | 写 | session(会话) |  |  | id, lang, label, parentId, targetType, targetId, url, sort, visible, openNewTab | data |
| `GeoSite_meta` | GET | `/enterprise/geo/site/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `GeoSitePage_bootstrap` | GET | `/enterprise/geo/site/page/bootstrap` | BOOTSTRAP | 读 | session(会话) |  | siteId |  | data |
| `GeoSitePage_saveContent` | POST | `/enterprise/geo/site/page/content` | 保存CONTENT | 写 | session(会话) |  |  | id, content | data |
| `GeoSitePage_copyToLanguage` | POST | `/enterprise/geo/site/page/copy` | 复制为LANGUAGE | 写 | session(会话) |  |  | id, lang, title | data |
| `GeoSitePage_create` | POST | `/enterprise/geo/site/page/create` | 新建 | 写 | session(会话) |  |  | siteId, lang, path, title, kind, contentType, template, pageSize, sort | data |
| `GeoSitePage_detail` | GET | `/enterprise/geo/site/page/detail` | 详情 | 读 | session(会话) |  | id |  | data |
| `GeoSitePage_setHome` | POST | `/enterprise/geo/site/page/home` | 设置HOME | 写 | session(会话) |  |  | id | data |
| `GeoSitePage_list` | GET | `/enterprise/geo/site/page/list` | 列表 | 读 | session(会话) |  | siteId |  | data |
| `GeoSitePage_offline` | POST | `/enterprise/geo/site/page/offline` | OFFLINE | 写 | session(会话) |  |  | id | data |
| `GeoSitePage_publish` | POST | `/enterprise/geo/site/page/publish` | 发布 | 写 | session(会话) |  |  | id | data |
| `GeoSitePage_remove` | POST | `/enterprise/geo/site/page/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `GeoSitePage_reorder` | POST | `/enterprise/geo/site/page/reorder` | 重排 | 写 | session(会话) |  |  | siteId, ids | data |
| `GeoSitePage_saveScripts` | POST | `/enterprise/geo/site/page/scripts` | 保存脚本 | 写 | session(会话) |  |  | id, scripts | data |
| `GeoSitePage_update` | POST | `/enterprise/geo/site/page/update` | 修改 | 写 | session(会话) |  |  | id, lang, path, title, kind, contentType, pageSize, sort, seo | data |
| `GeoSite_publish` | POST | `/enterprise/geo/site/publish` | 发布 | 写 | session(会话) |  |  | id | data |
| `GeoSite_publishLog` | GET | `/enterprise/geo/site/publish-log` | 发布日志 | 读 | session(会话) |  | siteId, page, pageSize |  | data |
| `GeoSite_remove` | POST | `/enterprise/geo/site/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `GeoSiteTemplate_apply` | POST | `/enterprise/geo/site/template/apply` | 申请 | 写 | session(会话) |  |  | templateId, pageId, mode | data |
| `GeoSiteTemplate_detail` | GET | `/enterprise/geo/site/template/detail` | 详情 | 读 | session(会话) |  | id |  | data |
| `GeoSiteTemplate_list` | GET | `/enterprise/geo/site/template/list` | 列表 | 读 | session(会话) |  | siteId, kind |  | data |
| `GeoSiteTemplate_remove` | POST | `/enterprise/geo/site/template/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `GeoSiteTemplate_save` | POST | `/enterprise/geo/site/template/save` | 保存 | 写 | session(会话) |  |  | siteId, id, kind, name, note, content | data |
| `GeoSite_unpublish` | POST | `/enterprise/geo/site/unpublish` | UNPUBLISH | 写 | session(会话) |  |  | id | data |
| `GeoSite_update` | POST | `/enterprise/geo/site/update` | 修改 | 写 | session(会话) |  |  | id, title, slug, geoProjectId, defaultLanguage, languages, favicon, coverImage, seo, scriptsEnabled | data |
| `Geo_removeTopic` | DELETE | `/enterprise/geo/topics/:id` | 删除主题 | 写 | session(会话) | id |  |  | data |
| `Geo_updateTopic` | PATCH | `/enterprise/geo/topics/:id` | 修改主题 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

