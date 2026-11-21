<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：问卷（`surveys`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Survey_page` | GET | `/enterprise/surveys` | 页面 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Survey_create` | POST | `/enterprise/surveys` | 新建 | 写 | session(会话) |  |  | title, description, questions, settings | data |
| `Survey_remove` | DELETE | `/enterprise/surveys/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Survey_detail` | GET | `/enterprise/surveys/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Survey_update` | PUT | `/enterprise/surveys/:id` | 修改 | 写 | session(会话) | id |  | title, description, questions, settings | data |
| `Survey_close` | POST | `/enterprise/surveys/:id/close` | 关闭 | 写 | session(会话) | id |  |  | data |
| `Survey_publish` | POST | `/enterprise/surveys/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Survey_reopen` | POST | `/enterprise/surveys/:id/reopen` | 重新开放问卷 | 写 | session(会话) | id |  |  | data |
| `Survey_results` | GET | `/enterprise/surveys/:id/results` | 结果 | 读 | session(会话) | id | page, pageSize |  | data |

返回 `INDEX.md`。

