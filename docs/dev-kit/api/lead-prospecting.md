<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：Google 潜客挖掘（`lead-prospecting`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Lead_chat` | POST | `/enterprise/lead-prospecting/chat` | AI 对话 | 写 | session(会话) |  |  |  | data |
| `Lead_createTable` | POST | `/enterprise/lead-prospecting/data-table` | 新建表 | 写 | session(会话) |  |  | name, setDefault | data |
| `Lead_messages` | GET | `/enterprise/lead-prospecting/messages` | 留言 | 读 | session(会话) |  |  |  | data |
| `Lead_models` | GET | `/enterprise/lead-prospecting/models` | 模型 | 读 | session(会话) |  |  |  | data |
| `Lead_settings` | GET | `/enterprise/lead-prospecting/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Lead_saveSettings` | PUT | `/enterprise/lead-prospecting/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `Lead_removeSerperKey` | DELETE | `/enterprise/lead-prospecting/settings/serper-key` | 删除谷歌搜索密钥 | 写 | session(会话) |  |  |  | data |
| `Lead_tables` | GET | `/enterprise/lead-prospecting/tables` | 表 | 读 | session(会话) |  |  |  | data |
| `Lead_tasks` | GET | `/enterprise/lead-prospecting/tasks` | 任务 | 读 | session(会话) |  | page, pageSize |  | data |
| `Lead_createTask` | POST | `/enterprise/lead-prospecting/tasks` | 新建任务 | 写 | session(会话) |  |  |  | data |
| `Lead_removeTask` | DELETE | `/enterprise/lead-prospecting/tasks/:id` | 删除任务 | 写 | session(会话) | id |  |  | data |
| `Lead_task` | GET | `/enterprise/lead-prospecting/tasks/:id` | 任务 | 读 | session(会话) | id |  |  | data |
| `Lead_startTask` | POST | `/enterprise/lead-prospecting/tasks/:id/start` | 启动任务 | 写 | session(会话) | id |  |  | data |
| `Lead_updateTaskTable` | PATCH | `/enterprise/lead-prospecting/tasks/:id/table` | 修改结果表 | 写 | session(会话) | id |  | dataTableId | data |

返回 `INDEX.md`。

