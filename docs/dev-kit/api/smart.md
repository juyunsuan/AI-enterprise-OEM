<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：IT服务（`smart`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `SmartService_list` | GET | `/enterprise/smart` | 列表 | 读 | session(会话) |  | as, province, city |  | data |
| `SmartService_create` | POST | `/enterprise/smart` | 新建 | 写 | session(会话) |  |  |  | data |
| `SmartService_remove` | DELETE | `/enterprise/smart/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `SmartService_detail` | GET | `/enterprise/smart/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `SmartService_update` | PATCH | `/enterprise/smart/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `SmartService_accept` | POST | `/enterprise/smart/:id/accept` | 承接 | 写 | session(会话) | id |  |  | data |
| `SmartService_advance` | POST | `/enterprise/smart/:id/advance` | 推进 | 写 | session(会话) | id |  |  | data |
| `SmartService_updateContacts` | POST | `/enterprise/smart/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `SmartService_messages` | GET | `/enterprise/smart/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `SmartService_postMessage` | POST | `/enterprise/smart/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `SmartService_page` | GET | `/enterprise/smart/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `SmartService_stats` | GET | `/enterprise/smart/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

