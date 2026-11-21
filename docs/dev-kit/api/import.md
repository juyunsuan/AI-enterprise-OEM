<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：数据导入（`import`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Import_jobs` | GET | `/enterprise/import/jobs` | 生成任务 | 读 | session(会话) |  | page, pageSize, module |  | data |
| `Import_createJob` | POST | `/enterprise/import/jobs/create` | 新建生成任务 | 写 | session(会话) |  |  | module, fileName, mapping, rows, saveMapAs, dryRun | data |
| `Import_removeJob` | POST | `/enterprise/import/jobs/remove` | 删除生成任务 | 写 | session(会话) |  |  | id | data |
| `Import_listMaps` | GET | `/enterprise/import/maps` | 列表映射 | 读 | session(会话) |  | module |  | data |
| `Import_removeMap` | POST | `/enterprise/import/maps/remove` | 删除映射 | 写 | session(会话) |  |  | id | data |
| `Import_saveMap` | POST | `/enterprise/import/maps/save` | 保存映射 | 写 | session(会话) |  |  | id, module, name, mapping | data |

返回 `INDEX.md`。

