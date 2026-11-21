<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：外报通道（`external`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `External_channels` | GET | `/enterprise/external/channels` | 渠道 | 读 | session(会话) |  |  |  | data |
| `External_listCredentials` | GET | `/enterprise/external/credentials` | 凭据列表 | 读 | session(会话) |  | enterpriseId |  | data |
| `External_saveCredential` | POST | `/enterprise/external/credentials` | 保存凭据 | 写 | session(会话) |  |  | enterpriseId, channelCode, credType, label, secret, extra, expiresAt | data |
| `External_removeCredential` | DELETE | `/enterprise/external/credentials/:id` | 删除凭据 | 写 | session(会话) | id | enterpriseId |  | data |
| `External_preview` | GET | `/enterprise/external/declarations/:declId/preview` | 预览 | 读 | session(会话) | declId |  |  | data |
| `External_create` | POST | `/enterprise/external/declarations/:declId/submission` | 新建 | 写 | session(会话) | declId |  |  | data |
| `External_submissions` | GET | `/enterprise/external/submissions` | 提交 | 读 | session(会话) |  | status, bizType, refType |  | data |
| `External_detail` | GET | `/enterprise/external/submissions/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `External_callbacks` | GET | `/enterprise/external/submissions/:id/callbacks` | 回调 | 读 | session(会话) | id |  |  | data |
| `External_recordCallback` | POST | `/enterprise/external/submissions/:id/callbacks` | 记录回调 | 写 | session(会话) | id |  | rawBody, source, signatureValid | data |
| `External_cancel` | POST | `/enterprise/external/submissions/:id/cancel` | 取消 | 写 | session(会话) | id |  |  | data |
| `External_pay` | POST | `/enterprise/external/submissions/:id/pay` | 支付 | 写 | session(会话) | id |  | note | data |
| `External_receipt` | POST | `/enterprise/external/submissions/:id/receipt` | 登记回执 | 写 | session(会话) | id |  | receiptNo, rawBody | data |
| `External_reject` | POST | `/enterprise/external/submissions/:id/reject` | 驳回 | 写 | session(会话) | id |  | errorCode, errorMsg, rawBody | data |
| `External_retry` | POST | `/enterprise/external/submissions/:id/retry` | 重试 | 写 | session(会话) | id |  |  | data |
| `External_submit` | POST | `/enterprise/external/submissions/:id/submit` | 提交 | 写 | session(会话) | id |  | acceptNo | data |
| `External_byRef` | GET | `/enterprise/external/submissions/by-ref` | 按业务单号查询 | 读 | session(会话) |  | refType, refId |  | data |

返回 `INDEX.md`。

