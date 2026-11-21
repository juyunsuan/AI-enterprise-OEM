<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：阿里云邮件推送（`aliyun-mail`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AliyunMail_imports` | GET | `/enterprise/aliyun-mail/imports` | 导入 | 读 | session(会话) |  | page, pageSize |  | data |
| `AliyunMail_createImport` | POST | `/enterprise/aliyun-mail/imports` | 新建导入 | 写 | session(会话) |  |  |  | data |
| `AliyunMail_import` | GET | `/enterprise/aliyun-mail/imports/:id` | 导入 | 读 | session(会话) | id | page, pageSize |  | data |
| `AliyunMail_refreshImport` | POST | `/enterprise/aliyun-mail/imports/:id/refresh` | 刷新导入 | 写 | session(会话) | id |  |  | data |
| `AliyunMail_retryImport` | POST | `/enterprise/aliyun-mail/imports/:id/retry` | 重试导入 | 写 | session(会话) | id |  |  | data |
| `AliyunMail_preview` | POST | `/enterprise/aliyun-mail/preview` | 预览 | 写 | session(会话) |  |  |  | data |
| `AliyunMail_receiverLists` | GET | `/enterprise/aliyun-mail/receiver-lists` | 收件人列表 | 读 | session(会话) |  | keyWord |  | data |
| `AliyunMail_createReceiverList` | POST | `/enterprise/aliyun-mail/receiver-lists` | 新建收件人列表 | 写 | session(会话) |  |  |  | data |
| `AliyunMail_senderAddresses` | GET | `/enterprise/aliyun-mail/sender-addresses` | 发件人地址 | 读 | session(会话) |  |  |  | data |
| `AliyunMail_settings` | GET | `/enterprise/aliyun-mail/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `AliyunMail_saveSettings` | POST | `/enterprise/aliyun-mail/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `AliyunMail_test` | POST | `/enterprise/aliyun-mail/test` | 测试 | 写 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

