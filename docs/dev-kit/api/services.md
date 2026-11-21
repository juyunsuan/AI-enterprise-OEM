<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：服务发布（`services`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Services_list` | GET | `/enterprise/services` | 列表 | 读 | session(会话) |  | domain |  | data |
| `Services_create` | POST | `/enterprise/services` | 新建 | 写 | session(会话) |  |  |  | data |
| `Services_remove` | DELETE | `/enterprise/services/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Services_detail` | GET | `/enterprise/services/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Services_update` | PATCH | `/enterprise/services/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `Services_publish` | POST | `/enterprise/services/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Services_page` | GET | `/enterprise/services/page` | 页面 | 读 | session(会话) |  | page, pageSize, domain |  | data |

返回 `INDEX.md`。

