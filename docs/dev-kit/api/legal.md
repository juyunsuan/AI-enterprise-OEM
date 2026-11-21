<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：法律服务（`legal`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_lawyers` | GET | `/api/v1/legal/lawyers` | 律师 | 读 | key(API Key) |  | kind, province, city, keyword |  | data |
| `OpenApi_legalCreate` | POST | `/api/v1/legal/requests` | 新建法律 | 写 | key(API Key) |  |  |  | data |
| `Legal_lawyers` | GET | `/enterprise/legal/lawyers` | 律师 | 读 | session(会话) |  | kind, province, city, keyword |  | data |
| `Legal_createLawyer` | POST | `/enterprise/legal/lawyers` | 新建律师 | 写 | session(会话) |  |  |  | data |
| `Legal_removeLawyer` | DELETE | `/enterprise/legal/lawyers/:id` | 删除律师 | 写 | session(会话) | id |  |  | data |
| `Legal_updateLawyer` | PATCH | `/enterprise/legal/lawyers/:id` | 修改律师 | 写 | session(会话) | id |  |  | data |
| `Legal_list` | GET | `/enterprise/legal/requests` | 列表 | 读 | session(会话) |  | province, city |  | data |
| `Legal_create` | POST | `/enterprise/legal/requests` | 新建 | 写 | session(会话) |  |  |  | data |
| `Legal_removeRequest` | DELETE | `/enterprise/legal/requests/:id` | 删除申请 | 写 | session(会话) | id |  |  | data |
| `Legal_detail` | GET | `/enterprise/legal/requests/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Legal_updateRequest` | PATCH | `/enterprise/legal/requests/:id` | 修改申请 | 写 | session(会话) | id |  |  | data |
| `Legal_updateContacts` | POST | `/enterprise/legal/requests/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Legal_messages` | GET | `/enterprise/legal/requests/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Legal_postMessage` | POST | `/enterprise/legal/requests/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `Legal_publish` | POST | `/enterprise/legal/requests/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Legal_page` | GET | `/enterprise/legal/requests/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Legal_stats` | GET | `/enterprise/legal/requests/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

