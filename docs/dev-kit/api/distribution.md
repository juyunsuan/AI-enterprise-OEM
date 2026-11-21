<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：多平台内容分发（`distribution`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Distribution_page` | GET | `/enterprise/distribution/contents` | 查看分发内容列表 | 读 | session(会话) |  | page, pageSize, mediaType, status, keyword |  | data |
| `Distribution_create` | POST | `/enterprise/distribution/contents` | 新建分发内容 | 写 | session(会话) |  |  | title, content, mediaType, images, platformCodes, autoPublish, tags | data |
| `Distribution_remove` | DELETE | `/enterprise/distribution/contents/:id` | 删除分发内容 | 写 | session(会话) | id |  |  | data |
| `Distribution_detail` | GET | `/enterprise/distribution/contents/:id` | 查看分发内容详情 | 读 | session(会话) | id |  |  | data |
| `Distribution_update` | PUT | `/enterprise/distribution/contents/:id` | 修改分发内容 | 写 | session(会话) | id |  | title, content, mediaType, images, platformCodes, autoPublish, tags | data |
| `Distribution_reportLogs` | POST | `/enterprise/distribution/contents/:id/logs` | 回写发布结果 | 写 | session(会话) | id |  | source, logs | data |
| `Distribution_mark` | POST | `/enterprise/distribution/contents/:id/mark` | 标记内容已分发 | 写 | session(会话) | id | pluginVersion |  | data |
| `Distribution_reportMetrics` | POST | `/enterprise/distribution/contents/:id/metrics` | 回写分发效果 | 写 | session(会话) | id |  | source, metrics | data |
| `Distribution_meta` | GET | `/enterprise/distribution/meta` | 查看分发平台与插件信息 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

