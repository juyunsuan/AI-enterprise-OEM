<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：物流服务（`logistics`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_logisticsList` | GET | `/api/v1/logistics/orders` | 物流列表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_logisticsCreate` | POST | `/api/v1/logistics/orders` | 新建物流 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_logisticsMessages` | GET | `/api/v1/logistics/orders/:id/messages` | 物流留言 | 读 | key(API Key) | id |  |  | data |
| `Logistics_list` | GET | `/enterprise/logistics` | 列表 | 读 | session(会话) |  | as, province, city |  | data |
| `Logistics_create` | POST | `/enterprise/logistics` | 新建 | 写 | session(会话) |  |  |  | data |
| `Logistics_remove` | DELETE | `/enterprise/logistics/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Logistics_detail` | GET | `/enterprise/logistics/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Logistics_update` | PATCH | `/enterprise/logistics/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `Logistics_accept` | POST | `/enterprise/logistics/:id/accept` | 承接 | 写 | session(会话) | id |  |  | data |
| `Logistics_advance` | POST | `/enterprise/logistics/:id/advance` | 推进 | 写 | session(会话) | id |  |  | data |
| `Logistics_updateContacts` | POST | `/enterprise/logistics/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Logistics_messages` | GET | `/enterprise/logistics/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Logistics_postMessage` | POST | `/enterprise/logistics/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `Logistics_page` | GET | `/enterprise/logistics/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Logistics_stats` | GET | `/enterprise/logistics/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

