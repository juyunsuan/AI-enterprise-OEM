<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：开票申请（`invoice-requests`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Invoice_list` | GET | `/enterprise/invoice-requests` | 列表 | 读 | session(会话) |  | status |  | data |
| `Invoice_create` | POST | `/enterprise/invoice-requests` | 新建 | 写 | session(会话) |  |  | enterpriseId, invoiceType, buyerType, buyerName, buyerTaxNo, orderNo, remark, items | data |
| `Invoice_detail` | GET | `/enterprise/invoice-requests/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Invoice_approve` | POST | `/enterprise/invoice-requests/:id/approve` | 通过 | 写 | session(会话) | id |  |  | data |
| `Invoice_cancel` | POST | `/enterprise/invoice-requests/:id/cancel` | 取消 | 写 | session(会话) | id |  |  | data |
| `Invoice_updateContacts` | POST | `/enterprise/invoice-requests/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Invoice_reject` | POST | `/enterprise/invoice-requests/:id/reject` | 驳回 | 写 | session(会话) | id |  |  | data |
| `Invoice_page` | GET | `/enterprise/invoice-requests/page` | 页面 | 读 | session(会话) |  | page, pageSize, status, enterpriseId |  | data |
| `Invoice_stats` | GET | `/enterprise/invoice-requests/stats` | 统计 | 读 | session(会话) |  | enterpriseId |  | data |

返回 `INDEX.md`。

