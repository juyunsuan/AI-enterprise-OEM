<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：多维表格（`data-tables`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_dataTables` | GET | `/api/v1/data-tables` | 数据表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_dataTable` | GET | `/api/v1/data-tables/:id` | 数据表 | 读 | key(API Key) | id |  |  | data |
| `OpenApi_dataTableRows` | GET | `/api/v1/data-tables/:id/rows` | 数据表行 | 读 | key(API Key) | id | limit, offset |  | data |
| `OpenApi_dataTableCreateRow` | POST | `/api/v1/data-tables/:id/rows` | 新建数据表行 | 写 | key(API Key) | id |  |  | data |
| `OpenApi_dataTableUpdateRow` | PATCH | `/api/v1/data-tables/:id/rows/:rowId` | 修改数据表行 | 写 | key(API Key) | id, rowId |  |  | data |
| `OpenApi_dataTableCreateRows` | POST | `/api/v1/data-tables/:id/rows/batch` | 批量新建数据表行 | 写 | key(API Key) | id |  |  | data |
| `DataTable_list` | GET | `/enterprise/data-tables` | 列表 | 读 | session(会话) |  |  |  | data |
| `DataTable_create` | POST | `/enterprise/data-tables` | 新建 | 写 | session(会话) |  |  |  | data |
| `DataTable_remove` | DELETE | `/enterprise/data-tables/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `DataTable_get` | GET | `/enterprise/data-tables/:id` | 查看数据表详情 | 读 | session(会话) | id |  |  | data |
| `DataTable_update` | PATCH | `/enterprise/data-tables/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `DataTable_aiAsk` | POST | `/enterprise/data-tables/:id/ai/ask` | 提问AI | 写 | session(会话) | id |  |  | data |
| `DataTable_aiFillColumn` | POST | `/enterprise/data-tables/:id/ai/fill-column` | AI 填充列 | 写 | session(会话) | id |  |  | data |
| `DataTable_aiPlanView` | POST | `/enterprise/data-tables/:id/ai/view` | 查看AI计划 | 写 | session(会话) | id |  |  | data |
| `DataTable_feishuSyncs` | GET | `/enterprise/data-tables/:id/feishu-syncs` | 飞书同步 | 读 | session(会话) | id |  |  | data |
| `DataTable_createFeishuSync` | POST | `/enterprise/data-tables/:id/feishu-syncs` | 新建飞书同步 | 写 | session(会话) | id |  |  | data |
| `DataTable_removeFeishuSync` | DELETE | `/enterprise/data-tables/:id/feishu-syncs/:syncId` | 删除飞书同步 | 写 | session(会话) | id, syncId |  |  | data |
| `DataTable_updateFeishuSync` | PATCH | `/enterprise/data-tables/:id/feishu-syncs/:syncId` | 修改飞书同步 | 写 | session(会话) | id, syncId |  |  | data |
| `DataTable_feishuSyncLogs` | GET | `/enterprise/data-tables/:id/feishu-syncs/:syncId/logs` | 同步飞书日志 | 读 | session(会话) | id, syncId |  |  | data |
| `DataTable_runFeishuSync` | POST | `/enterprise/data-tables/:id/feishu-syncs/:syncId/run` | 运行飞书同步 | 写 | session(会话) | id, syncId |  |  | data |
| `DataTable_testFeishuSync` | POST | `/enterprise/data-tables/:id/feishu-syncs/:syncId/test` | 测试飞书同步 | 写 | session(会话) | id, syncId |  |  | data |
| `DataTable_previewFeishuSync` | POST | `/enterprise/data-tables/:id/feishu-syncs/preview` | 预览飞书同步 | 写 | session(会话) | id |  |  | data |
| `DataTable_addField` | POST | `/enterprise/data-tables/:id/fields` | 添加字段 | 写 | session(会话) | id |  |  | data |
| `DataTable_removeField` | DELETE | `/enterprise/data-tables/:id/fields/:fieldId` | 删除字段 | 写 | session(会话) | id, fieldId |  |  | data |
| `DataTable_updateField` | PATCH | `/enterprise/data-tables/:id/fields/:fieldId` | 修改字段 | 写 | session(会话) | id, fieldId |  |  | data |
| `DataTable_addFields` | POST | `/enterprise/data-tables/:id/fields/batch` | 添加字段 | 写 | session(会话) | id |  |  | data |
| `DataTable_reorderFields` | POST | `/enterprise/data-tables/:id/fields/reorder` | 重排字段 | 写 | session(会话) | id |  |  | data |
| `DataTable_grants` | GET | `/enterprise/data-tables/:id/grants` | 授权 | 读 | session(会话) | id |  |  | data |
| `DataTable_saveGrants` | PUT | `/enterprise/data-tables/:id/grants` | 保存授权 | 写 | session(会话) | id |  |  | data |
| `DataTable_rows` | GET | `/enterprise/data-tables/:id/rows` | 行 | 读 | session(会话) | id | page, pageSize |  | data |
| `DataTable_addRow` | POST | `/enterprise/data-tables/:id/rows` | 添加行 | 写 | session(会话) | id |  |  | data |
| `DataTable_removeRow` | DELETE | `/enterprise/data-tables/:id/rows/:rowId` | 删除行 | 写 | session(会话) | id, rowId |  |  | data |
| `DataTable_updateRow` | PATCH | `/enterprise/data-tables/:id/rows/:rowId` | 修改行 | 写 | session(会话) | id, rowId |  |  | data |
| `DataTable_views` | GET | `/enterprise/data-tables/:id/views` | 查看 | 读 | session(会话) | id |  |  | data |
| `DataTable_saveView` | POST | `/enterprise/data-tables/:id/views` | 保存查看 | 写 | session(会话) | id |  |  | data |
| `DataTable_removeView` | DELETE | `/enterprise/data-tables/:id/views/:viewId` | 删除查看 | 写 | session(会话) | id, viewId |  |  | data |
| `DataTable_aiPlanTable` | POST | `/enterprise/data-tables/ai/plan` | AI计划表 | 写 | session(会话) |  |  |  | data |
| `DataTable_landRows` | POST | `/enterprise/data-tables/land-rows` | 落入行 | 写 | session(会话) |  |  | rows, tableId, tableName, description, fields, dedupBy, source | data |

返回 `INDEX.md`。

