<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：能力开通（`capabilities`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Capability_mine` | GET | `/enterprise/capabilities` | 我的能力 | 读 | session(会话) |  | enterpriseId |  | data |
| `Capability_cancel` | POST | `/enterprise/capabilities/:code/cancel` | 取消 | 写 | session(会话) | code |  | enterpriseId | data |
| `Capability_request` | POST | `/enterprise/capabilities/:code/request` | 申请 | 写 | session(会话) | code |  | note, enterpriseId, opensAt | data |
| `Capability_served` | GET | `/enterprise/capabilities/served` | 已服务企业 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

