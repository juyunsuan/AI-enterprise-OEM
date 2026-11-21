<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：阿里云智能外呼（`aliyun-call`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AliyunCall_callingNumbers` | GET | `/enterprise/aliyun-call/calling-numbers` | 主叫号码 | 读 | session(会话) |  | instanceId |  | data |
| `AliyunCall_imports` | GET | `/enterprise/aliyun-call/imports` | 导入 | 读 | session(会话) |  | page, pageSize |  | data |
| `AliyunCall_createImport` | POST | `/enterprise/aliyun-call/imports` | 新建导入 | 写 | session(会话) |  |  |  | data |
| `AliyunCall_import` | GET | `/enterprise/aliyun-call/imports/:id` | 导入 | 读 | session(会话) | id | page, pageSize |  | data |
| `AliyunCall_refreshImport` | POST | `/enterprise/aliyun-call/imports/:id/refresh` | 刷新导入 | 写 | session(会话) | id |  |  | data |
| `AliyunCall_retryImport` | POST | `/enterprise/aliyun-call/imports/:id/retry` | 重试导入 | 写 | session(会话) | id |  |  | data |
| `AliyunCall_instances` | GET | `/enterprise/aliyun-call/instances` | 实例 | 读 | session(会话) |  |  |  | data |
| `AliyunCall_jobGroups` | GET | `/enterprise/aliyun-call/job-groups` | 任务组 | 读 | session(会话) |  | instanceId, search, page, pageSize |  | data |
| `AliyunCall_jobGroupStatus` | GET | `/enterprise/aliyun-call/job-groups/:id/status` | 任务组状态 | 读 | session(会话) | id | instanceId |  | data |
| `AliyunCall_preview` | POST | `/enterprise/aliyun-call/preview` | 预览 | 写 | session(会话) |  |  |  | data |
| `AliyunCall_scripts` | GET | `/enterprise/aliyun-call/scripts` | 脚本 | 读 | session(会话) |  | instanceId |  | data |
| `AliyunCall_settings` | GET | `/enterprise/aliyun-call/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `AliyunCall_saveSettings` | POST | `/enterprise/aliyun-call/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `AliyunCall_test` | POST | `/enterprise/aliyun-call/test` | 测试 | 写 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

