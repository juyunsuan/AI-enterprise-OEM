<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：灵活用工（`flex`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_flexMatch` | POST | `/api/v1/flex/matches` | 匹配用工 | 写 | key(API Key) |  |  | id | data |
| `OpenApi_flexOnboardList` | GET | `/api/v1/flex/onboardings` | 进件用工列表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_flexOnboard` | POST | `/api/v1/flex/onboardings` | 进件用工 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_flexProviders` | GET | `/api/v1/flex/providers` | 用工服务商 | 读 | key(API Key) |  | record_type, province, city, keyword |  | data |
| `OpenApi_flexOrder` | POST | `/api/v1/flex/work-orders` | 用工订单 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_flexOrderGet` | GET | `/api/v1/flex/work-orders/:id` | 获取用工订单 | 读 | key(API Key) | id |  |  | data |
| `Flex_onboardings` | GET | `/enterprise/flex/onboardings` | 用工进件 | 读 | session(会话) |  |  |  | data |
| `Flex_createOnboarding` | POST | `/enterprise/flex/onboardings` | 新建用工进件 | 写 | session(会话) |  |  |  | data |
| `Flex_onboardingDetail` | GET | `/enterprise/flex/onboardings/:id` | 用工进件详情 | 读 | session(会话) | id |  |  | data |
| `Flex_auditOnboarding` | POST | `/enterprise/flex/onboardings/:id/audit` | 审核用工进件 | 写 | session(会话) | id |  |  | data |
| `Flex_updateOnboardingContacts` | POST | `/enterprise/flex/onboardings/:id/contacts` | 修改用工进件联系方式 | 写 | session(会话) | id |  |  | data |
| `Flex_uploadOnboardingAttachments` | POST | `/enterprise/flex/onboardings/attachments` | 上传用工进件附件 | 写 | session(会话) |  |  | files | data |
| `Flex_onboardingPage` | GET | `/enterprise/flex/onboardings/page` | 用工进件页面 | 读 | session(会话) |  | page, pageSize, status, keyword, stationId, provider |  | data |
| `Flex_onboardingStats` | GET | `/enterprise/flex/onboardings/stats` | 用工进件统计 | 读 | session(会话) |  |  |  | data |
| `Flex_payrolls` | GET | `/enterprise/flex/payrolls` | 发薪 | 读 | session(会话) |  |  |  | data |
| `Flex_createPayroll` | POST | `/enterprise/flex/payrolls` | 新建发薪 | 写 | session(会话) |  |  |  | data |
| `Flex_payrollDetail` | GET | `/enterprise/flex/payrolls/:id` | 发薪详情 | 读 | session(会话) | id |  |  | data |
| `Flex_auditPayroll` | POST | `/enterprise/flex/payrolls/:id/audit` | 审核发薪 | 写 | session(会话) | id |  |  | data |
| `Flex_updatePayrollContacts` | POST | `/enterprise/flex/payrolls/:id/contacts` | 修改发薪联系方式 | 写 | session(会话) | id |  |  | data |
| `Flex_payrollPage` | GET | `/enterprise/flex/payrolls/page` | 发薪页面 | 读 | session(会话) |  | page, pageSize, status, keyword, stationId, provider |  | data |
| `Flex_payrollStats` | GET | `/enterprise/flex/payrolls/stats` | 发薪统计 | 读 | session(会话) |  |  |  | data |
| `Flex_providers` | GET | `/enterprise/flex/providers` | 服务商 | 读 | session(会话) |  | recordType, record_type, province, city, keyword |  | data |
| `Flex_createProvider` | POST | `/enterprise/flex/providers` | 新建服务商 | 写 | session(会话) |  |  |  | data |
| `Flex_removeProvider` | DELETE | `/enterprise/flex/providers/:id` | 删除服务商 | 写 | session(会话) | id |  |  | data |
| `Flex_updateProvider` | PATCH | `/enterprise/flex/providers/:id` | 修改服务商 | 写 | session(会话) | id |  |  | data |
| `Flex_workOrders` | GET | `/enterprise/flex/work-orders` | 工单 | 读 | session(会话) |  | province, city |  | data |
| `Flex_createWorkOrder` | POST | `/enterprise/flex/work-orders` | 新建工单 | 写 | session(会话) |  |  |  | data |
| `Flex_removeWorkOrder` | DELETE | `/enterprise/flex/work-orders/:id` | 删除工单 | 写 | session(会话) | id |  |  | data |
| `Flex_detail` | GET | `/enterprise/flex/work-orders/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Flex_updateWorkOrder` | PATCH | `/enterprise/flex/work-orders/:id` | 修改工单 | 写 | session(会话) | id |  |  | data |
| `Flex_candidates` | POST | `/enterprise/flex/work-orders/:id/candidates` | 匹配候选人 | 写 | session(会话) | id |  | candidates | data |
| `Flex_updateWorkOrderContacts` | POST | `/enterprise/flex/work-orders/:id/contacts` | 修改工单联系方式 | 写 | session(会话) | id |  |  | data |
| `Flex_match` | POST | `/enterprise/flex/work-orders/:id/match` | 匹配 | 写 | session(会话) | id |  |  | data |
| `Flex_messages` | GET | `/enterprise/flex/work-orders/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Flex_postMessage` | POST | `/enterprise/flex/work-orders/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `Flex_publish` | POST | `/enterprise/flex/work-orders/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Flex_settlements` | POST | `/enterprise/flex/work-orders/:id/settlements` | 登记结算单 | 写 | session(会话) | id |  |  | data |
| `Flex_page` | GET | `/enterprise/flex/work-orders/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Flex_stats` | GET | `/enterprise/flex/work-orders/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

