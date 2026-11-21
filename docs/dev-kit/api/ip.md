<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：知识产权（`ip`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_agencies` | GET | `/api/v1/ip/agencies` | 代理机构 | 读 | key(API Key) |  | kind, province, city, keyword |  | data |
| `OpenApi_ipConsult` | POST | `/api/v1/ip/consultations` | 咨询知产 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_ipCreate` | POST | `/api/v1/ip/requests` | 新建知产 | 写 | key(API Key) |  |  |  | data |
| `Ip_agencies` | GET | `/enterprise/ip/agencies` | 代理机构 | 读 | session(会话) |  | kind, province, city, keyword |  | data |
| `Ip_createAgency` | POST | `/enterprise/ip/agencies` | 新建代理机构 | 写 | session(会话) |  |  |  | data |
| `Ip_removeAgency` | DELETE | `/enterprise/ip/agencies/:id` | 删除代理机构 | 写 | session(会话) | id |  |  | data |
| `Ip_updateAgency` | PATCH | `/enterprise/ip/agencies/:id` | 修改代理机构 | 写 | session(会话) | id |  |  | data |
| `Ip_consult` | POST | `/enterprise/ip/consultations` | 咨询 | 写 | session(会话) |  |  |  | data |
| `Ip_list` | GET | `/enterprise/ip/requests` | 列表 | 读 | session(会话) |  | province, city |  | data |
| `Ip_create` | POST | `/enterprise/ip/requests` | 新建 | 写 | session(会话) |  |  |  | data |
| `Ip_removeRequest` | DELETE | `/enterprise/ip/requests/:id` | 删除申请 | 写 | session(会话) | id |  |  | data |
| `Ip_detail` | GET | `/enterprise/ip/requests/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Ip_updateRequest` | PATCH | `/enterprise/ip/requests/:id` | 修改申请 | 写 | session(会话) | id |  |  | data |
| `Ip_updateContacts` | POST | `/enterprise/ip/requests/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Ip_messages` | GET | `/enterprise/ip/requests/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Ip_postMessage` | POST | `/enterprise/ip/requests/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `Ip_publish` | POST | `/enterprise/ip/requests/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Ip_page` | GET | `/enterprise/ip/requests/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Ip_stats` | GET | `/enterprise/ip/requests/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

