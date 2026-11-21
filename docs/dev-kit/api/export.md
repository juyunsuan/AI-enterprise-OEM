<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：出口退税（`export`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_overseasList` | GET | `/api/v1/export/refund-claims` | 海外列表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_overseasCreate` | POST | `/api/v1/export/refund-claims` | 新建出口退税单 | 写 | key(API Key) |  |  | service_type, title, country, amount, remark | data |
| `Export_jobs` | GET | `/enterprise/export/jobs` | 生成任务 | 读 | session(会话) |  | page, pageSize |  | data |
| `Export_download` | GET | `/enterprise/export/jobs/:id/download` | DOWNLOAD | 读 | session(会话) | id |  |  | data |
| `Export_createJob` | POST | `/enterprise/export/jobs/create` | 新建生成任务 | 写 | session(会话) |  |  | module, format, filters | data |
| `Export_removeJob` | POST | `/enterprise/export/jobs/remove` | 删除生成任务 | 写 | session(会话) |  |  | id | data |
| `Export_modules` | GET | `/enterprise/export/modules` | 模块 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

