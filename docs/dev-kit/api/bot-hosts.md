<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：bot-hosts（`bot-hosts`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `BotHost_list` | GET | `/enterprise/bot-hosts` | 列表 | 读 | session(会话) |  | kind |  | data |
| `BotHost_remove` | DELETE | `/enterprise/bot-hosts/:hostId` | 删除 | 写 | session(会话) | hostId |  |  | data |
| `BotHost_channels` | GET | `/enterprise/bot-hosts/:hostId/channels` | 渠道 | 读 | session(会话) | hostId |  |  | data |
| `BotHost_conversation` | GET | `/enterprise/bot-hosts/:hostId/conversation` | 会话 | 读 | session(会话) | hostId |  |  | data |
| `BotHost_fingerprints` | GET | `/enterprise/bot-hosts/:hostId/fingerprints` | FINGERPRINTS | 读 | session(会话) | hostId |  |  | data |
| `BotHost_send` | POST | `/enterprise/bot-hosts/:hostId/messages` | 发送 | 写 | session(会话) | hostId |  |  | data |
| `BotHost_removeModelGrant` | DELETE | `/enterprise/bot-hosts/:hostId/model-grant` | 删除模型GRANT | 写 | session(会话) | hostId |  |  | data |
| `BotHost_modelGrant` | GET | `/enterprise/bot-hosts/:hostId/model-grant` | 模型GRANT | 读 | session(会话) | hostId |  |  | data |
| `BotHost_saveModelGrant` | PUT | `/enterprise/bot-hosts/:hostId/model-grant` | 保存模型GRANT | 写 | session(会话) | hostId |  | channelId, model | data |
| `BotHost_rotateToken` | POST | `/enterprise/bot-hosts/:hostId/rotate-token` | ROTATE令牌 | 写 | session(会话) | hostId |  |  | data |
| `BotHost_setStatus` | POST | `/enterprise/bot-hosts/:hostId/status` | 设置状态 | 写 | session(会话) | hostId |  |  | data |
| `BotHost_workspaces` | GET | `/enterprise/bot-hosts/:hostId/workspaces` | 工作台 | 读 | session(会话) | hostId |  |  | data |
| `BotHost_cancel` | POST | `/enterprise/bot-hosts/commands/:commandCode/cancel` | 取消 | 写 | session(会话) | commandCode |  |  | data |
| `BotHost_pair` | POST | `/enterprise/bot-hosts/pair` | PAIR | 写 | session(会话) |  |  |  | data |
| `BotHost_createPairQr` | POST | `/enterprise/bot-hosts/pair-qr` | 新建PAIRQR | 写 | session(会话) |  |  | name, siteUrl, hostId | data |
| `BotHost_schedules` | GET | `/enterprise/bot-hosts/schedules` | 定时任务 | 读 | session(会话) |  |  |  | data |
| `BotHost_createSchedule` | POST | `/enterprise/bot-hosts/schedules` | 新建定时任务 | 写 | session(会话) |  |  |  | data |
| `BotHost_removeSchedule` | DELETE | `/enterprise/bot-hosts/schedules/:id` | 删除定时任务 | 写 | session(会话) | id |  |  | data |
| `BotHost_updateSchedule` | POST | `/enterprise/bot-hosts/schedules/:id` | 修改定时任务 | 写 | session(会话) | id |  |  | data |
| `BotHost_runSchedule` | POST | `/enterprise/bot-hosts/schedules/:id/run` | 运行定时任务 | 写 | session(会话) | id |  |  | data |
| `BotHost_scheduleRuns` | GET | `/enterprise/bot-hosts/schedules/:id/runs` | 定时任务执行 | 读 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

