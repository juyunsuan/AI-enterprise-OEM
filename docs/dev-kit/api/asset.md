<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：资产交易（`asset`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Asset_list` | GET | `/enterprise/asset` | 列表 | 读 | session(会话) |  | province, city |  | data |
| `Asset_create` | POST | `/enterprise/asset` | 新建 | 写 | session(会话) |  |  |  | data |
| `Asset_remove` | DELETE | `/enterprise/asset/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Asset_detail` | GET | `/enterprise/asset/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Asset_update` | PATCH | `/enterprise/asset/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `Asset_accept` | POST | `/enterprise/asset/:id/accept` | 承接 | 写 | session(会话) | id |  |  | data |
| `Asset_updateContacts` | POST | `/enterprise/asset/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Asset_messages` | GET | `/enterprise/asset/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Asset_postMessage` | POST | `/enterprise/asset/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `Asset_page` | GET | `/enterprise/asset/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Asset_stats` | GET | `/enterprise/asset/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

