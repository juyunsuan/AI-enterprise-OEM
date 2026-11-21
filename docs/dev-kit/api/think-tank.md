<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：智库服务（`think-tank`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_thinkTankExperts` | GET | `/api/v1/think-tank/experts` | 查看智库专家 | 读 | key(API Key) |  | kind, province, city, keyword |  | data |
| `OpenApi_thinkTankRequests` | GET | `/api/v1/think-tank/requests` | 查看智库需求 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_thinkTankCreate` | POST | `/api/v1/think-tank/requests` | 新建智库需求 | 写 | key(API Key) |  |  |  | data |
| `ThinkTank_experts` | GET | `/enterprise/think-tank/experts` | 专家 | 读 | session(会话) |  | kind, province, city, keyword |  | data |
| `ThinkTank_createExpert` | POST | `/enterprise/think-tank/experts` | 新建专家 | 写 | session(会话) |  |  |  | data |
| `ThinkTank_removeExpert` | DELETE | `/enterprise/think-tank/experts/:id` | 删除专家 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_updateExpert` | PATCH | `/enterprise/think-tank/experts/:id` | 修改专家 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_create` | POST | `/enterprise/think-tank/requests` | 新建 | 写 | session(会话) |  |  |  | data |
| `ThinkTank_remove` | DELETE | `/enterprise/think-tank/requests/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_detail` | GET | `/enterprise/think-tank/requests/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `ThinkTank_update` | PATCH | `/enterprise/think-tank/requests/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_updateContacts` | POST | `/enterprise/think-tank/requests/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_messages` | GET | `/enterprise/think-tank/requests/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `ThinkTank_postMessage` | POST | `/enterprise/think-tank/requests/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `ThinkTank_publish` | POST | `/enterprise/think-tank/requests/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `ThinkTank_page` | GET | `/enterprise/think-tank/requests/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `ThinkTank_stats` | GET | `/enterprise/think-tank/requests/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

