<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：权益与配额（`entitlements`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Plan_assign` | POST | `/enterprise/entitlements/assign` | 指派 | 写 | session(会话) |  |  | orgUserId, planCode, expiresAt | data |
| `Plan_consume` | POST | `/enterprise/entitlements/consume` | 扣减权益配额 | 写 | session(会话) |  |  | featureCode, quantity | data |
| `Plan_orgPlan` | GET | `/enterprise/entitlements/org` | 组织计划 | 读 | session(会话) |  | orgType, orgUserId |  | data |
| `Plan_plans` | GET | `/enterprise/entitlements/plans` | 计划 | 读 | session(会话) |  |  |  | data |
| `Plan_savePlan` | POST | `/enterprise/entitlements/plans` | 保存计划 | 写 | session(会话) |  |  | id, code, name, audience, description, priceMonthly, status, quotas | data |
| `Plan_removePlan` | POST | `/enterprise/entitlements/plans/remove` | 删除计划 | 写 | session(会话) |  |  | id | data |

返回 `INDEX.md`。

