<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：大数据查询（`bigdata`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Bigdata_chat` | POST | `/enterprise/bigdata/:dataset/chat` | AI 对话 | 写 | session(会话) | dataset |  |  | data |
| `Bigdata_createTable` | POST | `/enterprise/bigdata/:dataset/data-table` | 新建表 | 写 | session(会话) | dataset |  | name, setDefault | data |
| `Bigdata_messages` | GET | `/enterprise/bigdata/:dataset/messages` | 留言 | 读 | session(会话) | dataset |  |  | data |
| `Bigdata_settings` | GET | `/enterprise/bigdata/:dataset/settings` | 设置 | 读 | session(会话) | dataset |  |  | data |
| `Bigdata_saveSettings` | PUT | `/enterprise/bigdata/:dataset/settings` | 保存设置 | 写 | session(会话) | dataset |  |  | data |
| `Bigdata_tables` | GET | `/enterprise/bigdata/:dataset/tables` | 表 | 读 | session(会话) | dataset |  |  | data |
| `Bigdata_tasks` | GET | `/enterprise/bigdata/:dataset/tasks` | 任务 | 读 | session(会话) | dataset | page, pageSize |  | data |
| `Bigdata_createTask` | POST | `/enterprise/bigdata/:dataset/tasks` | 新建任务 | 写 | session(会话) | dataset |  |  | data |
| `Bigdata_removeTask` | DELETE | `/enterprise/bigdata/:dataset/tasks/:id` | 删除任务 | 写 | session(会话) | dataset, id |  |  | data |
| `Bigdata_task` | GET | `/enterprise/bigdata/:dataset/tasks/:id` | 任务 | 读 | session(会话) | dataset, id |  |  | data |
| `Bigdata_startTask` | POST | `/enterprise/bigdata/:dataset/tasks/:id/start` | 启动任务 | 写 | session(会话) | dataset, id |  |  | data |
| `Bigdata_updateTaskTable` | PATCH | `/enterprise/bigdata/:dataset/tasks/:id/table` | 修改结果表 | 写 | session(会话) | dataset, id |  | dataTableId | data |
| `Bigdata_models` | GET | `/enterprise/bigdata/models` | 模型 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

