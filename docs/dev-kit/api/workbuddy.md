<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：Workbuddy 企业版（`workbuddy`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Workbuddy_accounts` | GET | `/enterprise/workbuddy/accounts` | 凭据 | 读 | session(会话) |  |  |  | data |
| `Workbuddy_addAccount` | POST | `/enterprise/workbuddy/accounts` | 添加账号 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_removeAccount` | DELETE | `/enterprise/workbuddy/accounts/:id` | 删除账号 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_updateAccount` | PATCH | `/enterprise/workbuddy/accounts/:id` | 修改账号 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_cloudCommands` | GET | `/enterprise/workbuddy/accounts/:id/cloud-commands` | CLOUDCOMMANDS | 读 | session(会话) | id |  |  | data |
| `Workbuddy_sendCloudCommand` | POST | `/enterprise/workbuddy/accounts/:id/cloud-commands` | 发送CLOUDCOMMAND | 写 | session(会话) | id |  | agentId, versionId, instruction, previousCommandId | data |
| `Workbuddy_cloudSchedules` | GET | `/enterprise/workbuddy/accounts/:id/cloud-schedules` | CLOUD定时任务 | 读 | session(会话) | id |  |  | data |
| `Workbuddy_createCloudSchedule` | POST | `/enterprise/workbuddy/accounts/:id/cloud-schedules` | 新建CLOUD定时任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_verifyAccount` | POST | `/enterprise/workbuddy/accounts/:id/verify` | 校验账号 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_catalogConnectors` | GET | `/enterprise/workbuddy/agent-catalog/connectors` | 连接器目录 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_catalogExperts` | GET | `/enterprise/workbuddy/agent-catalog/experts` | 专家目录 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_catalogModels` | GET | `/enterprise/workbuddy/agent-catalog/models` | 模型目录 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_catalogSkills` | GET | `/enterprise/workbuddy/agent-catalog/skills` | 技能目录 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_removeAgent` | DELETE | `/enterprise/workbuddy/agents` | 删除代理人 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_agents` | GET | `/enterprise/workbuddy/agents` | 代理人 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_updateAgent` | PATCH | `/enterprise/workbuddy/agents` | 修改代理人 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_createAgent` | POST | `/enterprise/workbuddy/agents` | 新建代理人 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_agentDetail` | GET | `/enterprise/workbuddy/agents/detail` | 代理人详情 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_agentVersions` | GET | `/enterprise/workbuddy/agents/versions` | 智能体 | 读 | session(会话) |  | accountId, offset, limit, keyword, agentId, source |  | data |
| `Workbuddy_createAgentVersion` | POST | `/enterprise/workbuddy/agents/versions` | 新建智能体 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_syncCloudCommand` | GET | `/enterprise/workbuddy/cloud-commands/:id` | 同步CLOUDCOMMAND | 读 | session(会话) | id |  |  | data |
| `Workbuddy_removeCloudSchedule` | DELETE | `/enterprise/workbuddy/cloud-schedules/:id` | 删除CLOUD定时任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_cloudSchedule` | GET | `/enterprise/workbuddy/cloud-schedules/:id` | CLOUD定时任务 | 读 | session(会话) | id |  |  | data |
| `Workbuddy_updateCloudSchedule` | PATCH | `/enterprise/workbuddy/cloud-schedules/:id` | 修改CLOUD定时任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_runCloudSchedule` | POST | `/enterprise/workbuddy/cloud-schedules/:id/run` | 运行CLOUD定时任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_cloudScheduleRuns` | GET | `/enterprise/workbuddy/cloud-schedules/:id/runs` | CLOUD定时任务执行 | 读 | session(会话) | id |  |  | data |
| `Workbuddy_models` | GET | `/enterprise/workbuddy/models` | 模型 | 读 | session(会话) |  |  |  | data |
| `Workbuddy_plans` | GET | `/enterprise/workbuddy/plans` | 计划 | 读 | session(会话) |  | status |  | data |
| `Workbuddy_createPlan` | POST | `/enterprise/workbuddy/plans` | 新建计划 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_removePlan` | DELETE | `/enterprise/workbuddy/plans/:id` | 删除计划 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_plan` | GET | `/enterprise/workbuddy/plans/:id` | 计划 | 读 | session(会话) | id |  |  | data |
| `Workbuddy_updatePlan` | PATCH | `/enterprise/workbuddy/plans/:id` | 修改计划 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_dispatchPlan` | PATCH | `/enterprise/workbuddy/plans/:id/dispatch` | 派发计划 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_materialize` | POST | `/enterprise/workbuddy/plans/:id/materialize` | 落地 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_syncPlan` | PATCH | `/enterprise/workbuddy/plans/:id/sync` | 同步计划 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_addPlanTask` | POST | `/enterprise/workbuddy/plans/:id/tasks` | 添加计划任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_clarify` | POST | `/enterprise/workbuddy/plans/clarify` | 澄清 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_removeSetting` | DELETE | `/enterprise/workbuddy/setting` | 删除设置 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_setting` | GET | `/enterprise/workbuddy/setting` | 设置 | 读 | session(会话) |  |  |  | data |
| `Workbuddy_saveSetting` | POST | `/enterprise/workbuddy/setting` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `Workbuddy_removeTask` | DELETE | `/enterprise/workbuddy/tasks/:id` | 删除任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_updateTask` | PATCH | `/enterprise/workbuddy/tasks/:id` | 修改任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_cancelTask` | PATCH | `/enterprise/workbuddy/tasks/:id/cancel` | 取消任务 | 写 | session(会话) | id |  |  | data |
| `Workbuddy_taskEvents` | GET | `/enterprise/workbuddy/tasks/:id/events` | 任务事件 | 读 | session(会话) | id |  |  | data |
| `Workbuddy_followUpTask` | POST | `/enterprise/workbuddy/tasks/:id/follow-up` | 任务追加跟进 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

