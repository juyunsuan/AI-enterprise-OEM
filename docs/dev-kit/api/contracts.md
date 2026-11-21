<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：签约管理（`contracts`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_contractsList` | GET | `/api/v1/contracts` | 合同列表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_createContract` | POST | `/api/v1/contracts` | 新建合同 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_confirm` | POST | `/api/v1/contracts/:id/confirm` | 确认 | 写 | key(API Key) | id |  |  | data |
| `OpenApi_terminate` | POST | `/api/v1/contracts/:id/terminate` | 解除 | 写 | key(API Key) | id |  |  | data |
| `Contracts_list` | GET | `/enterprise/contracts` | 列表 | 读 | session(会话) |  | page, pageSize |  | data |
| `Contracts_create` | POST | `/enterprise/contracts` | 新建 | 写 | session(会话) |  |  |  | data |
| `Contracts_remove` | DELETE | `/enterprise/contracts/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Contracts_updateTerms` | PATCH | `/enterprise/contracts/:id` | 修改条款 | 写 | session(会话) | id |  |  | data |
| `Contracts_confirm` | POST | `/enterprise/contracts/:id/confirm` | 确认 | 写 | session(会话) | id |  |  | data |
| `Contracts_updateContacts` | POST | `/enterprise/contracts/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Contracts_agent` | POST | `/enterprise/contracts/:id/designate-agent` | 指派签约代理人 | 写 | session(会话) | id |  |  | data |
| `Contracts_staff` | POST | `/enterprise/contracts/:id/designate-staff` | 指派承办职员 | 写 | session(会话) | id |  |  | data |
| `Contracts_terminate` | POST | `/enterprise/contracts/:id/terminate` | 解除 | 写 | session(会话) | id |  |  | data |
| `Contracts_candidates` | GET | `/enterprise/contracts/candidates` | 候选人 | 读 | session(会话) |  | serviceType |  | data |
| `Contracts_enterprises` | GET | `/enterprise/contracts/my-enterprises` | 企业 | 读 | session(会话) |  |  |  | data |
| `Contracts_options` | GET | `/enterprise/contracts/options` | 签约表单选项 | 读 | session(会话) |  |  |  | data |
| `Contracts_providers` | GET | `/enterprise/contracts/providers` | 服务商 | 读 | session(会话) |  | serviceType, province, city |  | data |
| `Contracts_stats` | GET | `/enterprise/contracts/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

