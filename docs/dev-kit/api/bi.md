<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：BI智能分析（`bi`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Bi_ask` | POST | `/enterprise/bi/ask` | 智能问数 | 写 | session(会话) |  |  | sessionId, datasetId, question, channelId, model | data |
| `Bi_charts` | GET | `/enterprise/bi/charts` | 查看图表 | 读 | session(会话) |  | page, pageSize, datasetId, keyword |  | data |
| `Bi_saveChart` | POST | `/enterprise/bi/charts` | 新建或修改图表 | 写 | session(会话) |  |  | id, datasetId, name, chartType, config | data |
| `Bi_removeChart` | DELETE | `/enterprise/bi/charts/:id` | 删除图表 | 写 | session(会话) | id |  |  | data |
| `Bi_chart` | GET | `/enterprise/bi/charts/:id` | 查看图表详情 | 读 | session(会话) | id |  |  | data |
| `Bi_chartData` | GET | `/enterprise/bi/charts/:id/data` | 查看图表数据 | 读 | session(会话) | id |  |  | data |
| `Bi_dashboards` | GET | `/enterprise/bi/dashboards` | 查看仪表板 | 读 | session(会话) |  | page, pageSize, keyword |  | data |
| `Bi_saveDashboard` | POST | `/enterprise/bi/dashboards` | 新建或修改仪表板 | 写 | session(会话) |  |  | id, name, layout, config, components | data |
| `Bi_removeDashboard` | DELETE | `/enterprise/bi/dashboards/:id` | 删除仪表板 | 写 | session(会话) | id |  |  | data |
| `Bi_dashboard` | GET | `/enterprise/bi/dashboards/:id` | 查看仪表板详情 | 读 | session(会话) | id |  |  | data |
| `Bi_dashboardData` | GET | `/enterprise/bi/dashboards/:id/data` | 查看仪表板数据 | 读 | session(会话) | id |  |  | data |
| `Bi_exportToDataTable` | POST | `/enterprise/bi/data-table/export` | 导出到多维表格 | 写 | session(会话) |  |  | datasetId, dataTableId, tableName, limit | data |
| `Bi_datasetGroups` | GET | `/enterprise/bi/dataset-groups` | 查看数据集分组 | 读 | session(会话) |  |  |  | data |
| `Bi_saveDatasetGroup` | POST | `/enterprise/bi/dataset-groups` | 新建或修改数据集分组 | 写 | session(会话) |  |  | id, name, sort | data |
| `Bi_removeDatasetGroup` | DELETE | `/enterprise/bi/dataset-groups/:id` | 删除数据集分组 | 写 | session(会话) | id |  |  | data |
| `Bi_datasets` | GET | `/enterprise/bi/datasets` | 查看数据集 | 读 | session(会话) |  | page, pageSize, groupId, type, keyword |  | data |
| `Bi_createDataset` | POST | `/enterprise/bi/datasets` | 新建数据集 | 写 | session(会话) |  |  | name, groupId, type, datasourceId, internalKey, sqlText, description, tableIds | data |
| `Bi_removeDataset` | DELETE | `/enterprise/bi/datasets/:id` | 删除数据集 | 写 | session(会话) | id |  |  | data |
| `Bi_dataset` | GET | `/enterprise/bi/datasets/:id` | 查看数据集详情 | 读 | session(会话) | id |  |  | data |
| `Bi_updateDataset` | PATCH | `/enterprise/bi/datasets/:id` | 修改数据集 | 写 | session(会话) | id |  | name, groupId, sqlText, description, status, tableIds | data |
| `Bi_datasetFields` | GET | `/enterprise/bi/datasets/:id/fields` | 查看数据集字段 | 读 | session(会话) | id |  |  | data |
| `Bi_saveDatasetField` | POST | `/enterprise/bi/datasets/:id/fields` | 新建或修改数据集字段 | 写 | session(会话) | id |  | id, fieldKey, name, type, comment, role, aggregate, expression, format, sort, visible | data |
| `Bi_removeDatasetField` | DELETE | `/enterprise/bi/datasets/:id/fields/:fieldId` | 删除数据集字段 | 写 | session(会话) | id, fieldId |  |  | data |
| `Bi_datasetPermissions` | GET | `/enterprise/bi/datasets/:id/permissions` | 查看数据集权限 | 读 | session(会话) | id |  |  | data |
| `Bi_saveDatasetPermission` | POST | `/enterprise/bi/datasets/:id/permissions` | 修改数据集权限 | 写 | session(会话) | id |  | role, rowFilter, columnRules | data |
| `Bi_previewDataset` | GET | `/enterprise/bi/datasets/:id/preview` | 预览数据集 | 读 | session(会话) | id | limit |  | data |
| `Bi_recommendQuestions` | GET | `/enterprise/bi/datasets/:id/recommended` | 查看数据集推荐问题 | 读 | session(会话) | id |  |  | data |
| `Bi_datasources` | GET | `/enterprise/bi/datasources` | 查看数据源 | 读 | session(会话) |  |  |  | data |
| `Bi_createDatasource` | POST | `/enterprise/bi/datasources` | 新建数据源 | 写 | session(会话) |  |  | name, type, host, port, database, schema, username, password, ssl | data |
| `Bi_removeDatasource` | DELETE | `/enterprise/bi/datasources/:id` | 删除数据源 | 写 | session(会话) | id |  |  | data |
| `Bi_updateDatasource` | PATCH | `/enterprise/bi/datasources/:id` | 修改数据源 | 写 | session(会话) | id |  | name, host, port, database, schema, username, password, ssl, status | data |
| `Bi_saveDatasourceField` | POST | `/enterprise/bi/datasources/:id/fields/:fieldId` | 修改数据源字段注释 | 写 | session(会话) | id, fieldId |  | fieldComment, enabled | data |
| `Bi_syncDatasource` | POST | `/enterprise/bi/datasources/:id/sync` | 同步数据源表结构 | 写 | session(会话) | id |  |  | data |
| `Bi_datasourceTables` | GET | `/enterprise/bi/datasources/:id/tables` | 查看数据源表 | 读 | session(会话) | id |  |  | data |
| `Bi_testDatasource` | POST | `/enterprise/bi/datasources/:id/test` | 测试数据源连接 | 写 | session(会话) | id |  |  | data |
| `Bi_createExport` | POST | `/enterprise/bi/export` | 导出BI结果 | 写 | session(会话) |  |  | type, id | data |
| `Bi_members` | GET | `/enterprise/bi/members` | 查看BI成员 | 读 | session(会话) |  |  |  | data |
| `Bi_saveMember` | POST | `/enterprise/bi/members` | 配置BI成员权限 | 写 | session(会话) |  |  | memberUserId, role | data |
| `Bi_removeMember` | DELETE | `/enterprise/bi/members/:id` | 移除BI成员 | 写 | session(会话) | id |  |  | data |
| `Bi_feedback` | POST | `/enterprise/bi/messages/:id/feedback` | 反馈问数结果 | 写 | session(会话) | id |  | feedback | data |
| `Bi_queryLogs` | GET | `/enterprise/bi/query-logs` | 查看BI查询审计 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Bi_recent` | GET | `/enterprise/bi/recent` | 查看最近分析 | 读 | session(会话) |  |  |  | data |
| `Bi_recommendedQuestions` | GET | `/enterprise/bi/recommended-questions` | 查看推荐问题 | 读 | session(会话) |  | datasetId |  | data |
| `Bi_saveRecommendedQuestion` | POST | `/enterprise/bi/recommended-questions` | 新建或修改推荐问题 | 写 | session(会话) |  |  | id, datasetId, question, sort | data |
| `Bi_removeRecommendedQuestion` | DELETE | `/enterprise/bi/recommended-questions/:id` | 删除推荐问题 | 写 | session(会话) | id |  |  | data |
| `Bi_sessions` | GET | `/enterprise/bi/sessions` | 查看问数会话 | 读 | session(会话) |  | page, pageSize, keyword |  | data |
| `Bi_createSession` | POST | `/enterprise/bi/sessions` | 新建问数会话 | 写 | session(会话) |  |  | datasetId, title | data |
| `Bi_removeSession` | DELETE | `/enterprise/bi/sessions/:id` | 删除问数会话 | 写 | session(会话) | id |  |  | data |
| `Bi_session` | GET | `/enterprise/bi/sessions/:id` | 查看问数会话详情 | 读 | session(会话) | id |  |  | data |
| `Bi_settings` | GET | `/enterprise/bi/settings` | 查看BI设置 | 读 | session(会话) |  |  |  | data |
| `Bi_saveSettings` | POST | `/enterprise/bi/settings` | 保存BI设置 | 写 | session(会话) |  |  | defaultTextChannelId, defaultTextModel, maxRows, queryTimeoutMs | data |
| `Bi_terms` | GET | `/enterprise/bi/terms` | 查看术语库 | 读 | session(会话) |  | datasetId |  | data |
| `Bi_saveTerm` | POST | `/enterprise/bi/terms` | 新建或修改术语 | 写 | session(会话) |  |  | id, datasetId, term, definition, synonyms, enabled | data |
| `Bi_removeTerm` | DELETE | `/enterprise/bi/terms/:id` | 删除术语 | 写 | session(会话) | id |  |  | data |
| `Bi_trainings` | GET | `/enterprise/bi/trainings` | 查看SQL训练 | 读 | session(会话) |  | datasetId |  | data |
| `Bi_saveTraining` | POST | `/enterprise/bi/trainings` | 新建或修改SQL训练 | 写 | session(会话) |  |  | id, datasetId, question, sqlText, enabled | data |
| `Bi_removeTraining` | DELETE | `/enterprise/bi/trainings/:id` | 删除SQL训练 | 写 | session(会话) | id |  |  | data |
| `Bi_workbench` | GET | `/enterprise/bi/workbench` | 查看BI工作台 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

