<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：增长驾驶舱（`growth`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Growth_cockpit` | GET | `/enterprise/growth/cockpit` | 驾驶舱 | 读 | session(会话) |  | days |  | data |
| `Growth_fulfillment` | GET | `/enterprise/growth/fulfillment` | FULFILLMENT | 读 | session(会话) |  | days |  | data |
| `Growth_fulfillmentAdvice` | GET | `/enterprise/growth/fulfillment/advice` | FULFILLMENTADVICE | 读 | session(会话) |  | days |  | data |
| `Growth_dispatchFulfillment` | POST | `/enterprise/growth/fulfillment/dispatch` | 派发FULFILLMENT | 写 | session(会话) |  |  | contractIds, assigneeUserId, note | data |
| `Growth_risks` | GET | `/enterprise/growth/risks` | 风险 | 读 | session(会话) |  | kind |  | data |
| `Growth_scanRisks` | POST | `/enterprise/growth/risks/scan` | SCAN风险 | 写 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

