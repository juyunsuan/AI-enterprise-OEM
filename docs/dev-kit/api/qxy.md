<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：企享云（`qxy`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Qxy_autoFile` | POST | `/enterprise/qxy/enterprises/:id/auto-file` | 自动归档 | 写 | session(会话) | id |  | period, yzpzzlDm, wkpxse | data |
| `Qxy_autoInvoice` | POST | `/enterprise/qxy/enterprises/:id/auto-invoice` | 开票自动 | 写 | session(会话) | id |  | invoiceType, buyerType, buyerName, buyerTaxNo, orderNo, remark, items | data |
| `Qxy_filingResult` | GET | `/enterprise/qxy/enterprises/:id/filing-result` | 结果归档 | 读 | session(会话) | id | taskId |  | data |
| `Qxy_invoices` | GET | `/enterprise/qxy/enterprises/:id/invoices` | 开票 | 读 | session(会话) | id | startDate, endDate, pageIndex, pageSize |  | data |
| `Qxy_options` | GET | `/enterprise/qxy/options` | 选项 | 读 | session(会话) |  |  |  | data |
| `Qxy_probe` | GET | `/enterprise/qxy/probe` | 探测 | 读 | session(会话) |  |  |  | data |
| `Qxy_status` | GET | `/enterprise/qxy/status` | 状态 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

