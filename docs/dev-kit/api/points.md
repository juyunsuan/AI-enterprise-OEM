<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：积分与计费（`points`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Points_billingRules` | GET | `/enterprise/points/billing-rules` | 计费规则 | 读 | session(会话) |  |  |  | data |
| `Points_deleteBillingRule` | POST | `/enterprise/points/billing-rules/delete` | 删除计费规则 | 写 | session(会话) |  |  | id | data |
| `Points_upsertBillingRule` | POST | `/enterprise/points/billing-rules/upsert` | 保存计费规则 | 写 | session(会话) |  |  | code, scope, orgUserId, metric, unitPriceAmount, baseFeeAmount, multiplier, minChargeAmount, maxChargeAmount, budgetCapMonthly, freeQuotaMonthly, enabled | data |
| `Card_orders` | GET | `/enterprise/points/card-orders` | 订单 | 读 | session(会话) |  | page, pageSize, kind |  | data |
| `Card_queryOrder` | GET | `/enterprise/points/card-orders/:orderNo/query` | QUERY订单 | 读 | session(会话) | orderNo |  |  | data |
| `Card_orderUsage` | GET | `/enterprise/points/card-orders/:orderNo/usage` | 订单用量 | 读 | session(会话) | orderNo | page, pageSize |  | data |
| `Card_createCashOrder` | POST | `/enterprise/points/card-orders/cash` | 新建CASH订单 | 写 | session(会话) |  |  | templateCode, channel | data |
| `Card_exchangeByPoints` | POST | `/enterprise/points/card-orders/points` | 积分EXCHANGEBY | 写 | session(会话) |  |  | templateCode | data |
| `Card_templates` | GET | `/enterprise/points/cards` | 模板 | 读 | session(会话) |  |  |  | data |
| `Card_myCards` | GET | `/enterprise/points/my-cards` | 图卡我的 | 读 | session(会话) |  |  |  | data |
| `Promo_promoCodes` | GET | `/enterprise/points/promos` | 活码优惠码 | 读 | session(会话) |  |  |  | data |
| `Promo_savePromoCode` | POST | `/enterprise/points/promos` | 保存优惠码活码 | 写 | session(会话) |  |  | id, code, name, kind, value, minAmount, maxRedemptions, perUserLimit, startsAt, endsAt, status, assetType, cardCode | data |
| `Promo_redeem` | POST | `/enterprise/points/promos/redeem` | 兑换 | 写 | session(会话) |  |  | code, amount | data |
| `Promo_removePromoCode` | POST | `/enterprise/points/promos/remove` | 删除优惠码活码 | 写 | session(会话) |  |  | id | data |
| `Card_usableCards` | GET | `/enterprise/points/usable-cards` | 图卡USABLE | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

