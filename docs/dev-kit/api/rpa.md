<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：RPA自动化（`rpa`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_rpaAccounts` | GET | `/api/v1/rpa/accounts` | 查看 RPA 凭据 | 读 | key(API Key) |  | keyword |  | data |
| `OpenApi_rpaExecutions` | GET | `/api/v1/rpa/executions` | 查看 RPA 执行记录 | 读 | key(API Key) |  | taskId, limit |  | data |
| `OpenApi_rpaFinishExecution` | POST | `/api/v1/rpa/executions/:id/finish` | 完成RPA执行任务 | 写 | key(API Key) | id |  |  | data |
| `OpenApi_rpaClaimExecution` | POST | `/api/v1/rpa/executions/claim` | 认领RPA执行任务 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_rpaScripts` | GET | `/api/v1/rpa/scripts` | 查看 RPA 脚本列表 | 读 | key(API Key) |  | status, deviceType, fileType, keyword, page, pageSize |  | data |
| `OpenApi_rpaCreateScript` | POST | `/api/v1/rpa/scripts` | 新建 RPA 脚本 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_rpaScript` | GET | `/api/v1/rpa/scripts/:id` | 查看 RPA 脚本 | 读 | key(API Key) | id |  |  | data |
| `OpenApi_rpaGenerateScript` | POST | `/api/v1/rpa/scripts/generate` | 生成 RPA 脚本 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_rpaTasks` | GET | `/api/v1/rpa/tasks` | 查看 RPA 任务列表 | 读 | key(API Key) |  | status, deviceType, limit |  | data |
| `OpenApi_rpaCreateTask` | POST | `/api/v1/rpa/tasks` | 新建 RPA 任务 | 写 | key(API Key) |  |  |  | data |
| `OpenApi_rpaTask` | GET | `/api/v1/rpa/tasks/:id` | 查看 RPA 任务 | 读 | key(API Key) | id |  |  | data |
| `Rpa_accounts` | GET | `/enterprise/rpa/accounts` | 凭据 | 读 | session(会话) |  | keyword |  | data |
| `Rpa_createAccount` | POST | `/enterprise/rpa/accounts` | 新建账号 | 写 | session(会话) |  |  |  | data |
| `Rpa_removeAccount` | DELETE | `/enterprise/rpa/accounts/:id` | 删除账号 | 写 | session(会话) | id |  |  | data |
| `Rpa_updateAccount` | PATCH | `/enterprise/rpa/accounts/:id` | 修改账号 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_agents` | GET | `/enterprise/rpa/chrome/agents` | 代理人 | 读 | session(会话) |  | clientId, status, keyword, page, pageSize |  | data |
| `RpaChrome_saveAgent` | POST | `/enterprise/rpa/chrome/agents` | 保存代理人 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_agent` | GET | `/enterprise/rpa/chrome/agents/:id` | 代理人 | 读 | session(会话) | id |  |  | data |
| `RpaChrome_appendMessage` | POST | `/enterprise/rpa/chrome/agents/:id/messages` | APPEND留言 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_devices` | GET | `/enterprise/rpa/chrome/devices` | 查看本地 Chrome 设备 | 读 | session(会话) |  |  |  | data |
| `RpaChrome_removeDevice` | DELETE | `/enterprise/rpa/chrome/devices/:clientId` | 移除本地 Chrome 设备 | 写 | session(会话) | clientId |  |  | data |
| `RpaChrome_setDevice` | POST | `/enterprise/rpa/chrome/devices/:clientId/status` | 启停本地 Chrome 设备 | 写 | session(会话) | clientId |  |  | data |
| `RpaChrome_extracts` | GET | `/enterprise/rpa/chrome/extracts` | 提取 | 读 | session(会话) |  | agentId, limit |  | data |
| `RpaChrome_saveExtract` | POST | `/enterprise/rpa/chrome/extracts` | 保存提取 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_gaps` | GET | `/enterprise/rpa/chrome/gaps` | 缺口 | 读 | session(会话) |  |  |  | data |
| `RpaChrome_reportGap` | POST | `/enterprise/rpa/chrome/gaps` | 报告缺口 | 写 | session(会话) |  |  | need, why, site, attempted, want, sessionId, agentId, version | data |
| `RpaChrome_landRows` | POST | `/enterprise/rpa/chrome/land-rows` | 落入行 | 写 | session(会话) |  |  | rows, tableId, tableName, description, fields, dedupBy, source | data |
| `RpaChrome_recordings` | GET | `/enterprise/rpa/chrome/recordings` | RECORDINGS | 读 | session(会话) |  |  |  | data |
| `RpaChrome_saveRecording` | POST | `/enterprise/rpa/chrome/recordings` | 保存RECORDING | 写 | session(会话) |  |  |  | data |
| `RpaChrome_removeRecording` | DELETE | `/enterprise/rpa/chrome/recordings/:id` | 删除RECORDING | 写 | session(会话) | id |  |  | data |
| `RpaChrome_schedules` | GET | `/enterprise/rpa/chrome/schedules` | 定时任务 | 读 | session(会话) |  | status |  | data |
| `RpaChrome_saveSchedule` | POST | `/enterprise/rpa/chrome/schedules` | 保存定时任务 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_removeSchedule` | DELETE | `/enterprise/rpa/chrome/schedules/:id` | 删除定时任务 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_runSchedule` | POST | `/enterprise/rpa/chrome/schedules/:id/run` | 运行定时任务 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_sessions` | GET | `/enterprise/rpa/chrome/sessions` | 查看自动操作会话 | 读 | session(会话) |  | clientId, status, page, pageSize |  | data |
| `RpaChrome_startSession` | POST | `/enterprise/rpa/chrome/sessions` | 发起浏览器自动操作 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_session` | GET | `/enterprise/rpa/chrome/sessions/:id` | 查看会话详情 | 读 | session(会话) | id |  |  | data |
| `RpaChrome_pauseSession` | POST | `/enterprise/rpa/chrome/sessions/:id/pause` | 暂停自动操作会话 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_resumeSession` | POST | `/enterprise/rpa/chrome/sessions/:id/resume` | 继续自动操作会话 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_stopSession` | POST | `/enterprise/rpa/chrome/sessions/:id/stop` | 停止自动操作会话 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_activeSessions` | GET | `/enterprise/rpa/chrome/sessions/active` | 查看进行中的会话 | 读 | session(会话) |  | clientId |  | data |
| `RpaChrome_settings` | GET | `/enterprise/rpa/chrome/settings` | 查看自动操作设置 | 读 | session(会话) |  |  |  | data |
| `RpaChrome_saveSettings` | PUT | `/enterprise/rpa/chrome/settings` | 保存自动操作设置 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_skills` | GET | `/enterprise/rpa/chrome/skills` | 技能 | 读 | session(会话) |  | kind, keyword |  | data |
| `RpaChrome_saveSkill` | POST | `/enterprise/rpa/chrome/skills` | 保存技能 | 写 | session(会话) |  |  |  | data |
| `RpaChrome_removeSkill` | DELETE | `/enterprise/rpa/chrome/skills/:id` | 删除技能 | 写 | session(会话) | id |  |  | data |
| `RpaChrome_retryStep` | POST | `/enterprise/rpa/chrome/steps/:id/retry` | 重试会话中的某一步 | 写 | session(会话) | id |  |  | data |
| `Rpa_executions` | GET | `/enterprise/rpa/executions` | 执行 | 读 | session(会话) |  | taskId, limit |  | data |
| `Rpa_removeLlm` | DELETE | `/enterprise/rpa/llm` | 删除大模型 | 写 | session(会话) |  |  |  | data |
| `Rpa_llm` | GET | `/enterprise/rpa/llm` | 大模型 | 读 | session(会话) |  |  |  | data |
| `Rpa_saveLlm` | PUT | `/enterprise/rpa/llm` | 保存大模型 | 写 | session(会话) |  |  |  | data |
| `Rpa_llmModels` | GET | `/enterprise/rpa/llm/models` | 大模型 | 读 | session(会话) |  |  |  | data |
| `Rpa_paramsChat` | POST | `/enterprise/rpa/params-chat` | 参数对话 | 写 | session(会话) |  |  |  | data |
| `Rpa_scripts` | GET | `/enterprise/rpa/scripts` | 脚本 | 读 | session(会话) |  | status, deviceType, fileType, keyword, page, pageSize |  | data |
| `Rpa_createScript` | POST | `/enterprise/rpa/scripts` | 新建脚本 | 写 | session(会话) |  |  |  | data |
| `Rpa_removeScript` | DELETE | `/enterprise/rpa/scripts/:id` | 删除脚本 | 写 | session(会话) | id |  |  | data |
| `Rpa_script` | GET | `/enterprise/rpa/scripts/:id` | 脚本 | 读 | session(会话) | id |  |  | data |
| `Rpa_updateScript` | PATCH | `/enterprise/rpa/scripts/:id` | 修改脚本 | 写 | session(会话) | id |  |  | data |
| `Rpa_generateScript` | POST | `/enterprise/rpa/scripts/generate` | 生成脚本 | 写 | session(会话) |  |  |  | data |
| `Rpa_settings` | GET | `/enterprise/rpa/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Rpa_saveSettings` | PUT | `/enterprise/rpa/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `Rpa_tasks` | GET | `/enterprise/rpa/tasks` | 任务 | 读 | session(会话) |  | status, deviceType, keyword, page, pageSize |  | data |
| `Rpa_createTask` | POST | `/enterprise/rpa/tasks` | 新建任务 | 写 | session(会话) |  |  |  | data |
| `Rpa_removeTask` | DELETE | `/enterprise/rpa/tasks/:id` | 删除任务 | 写 | session(会话) | id |  |  | data |
| `Rpa_task` | GET | `/enterprise/rpa/tasks/:id` | 任务 | 读 | session(会话) | id |  |  | data |
| `Rpa_updateTask` | PATCH | `/enterprise/rpa/tasks/:id` | 修改任务 | 写 | session(会话) | id |  |  | data |
| `Rpa_cancelTask` | POST | `/enterprise/rpa/tasks/:id/cancel` | 取消任务 | 写 | session(会话) | id |  |  | data |
| `Rpa_taskExecutions` | GET | `/enterprise/rpa/tasks/:id/executions` | 任务执行 | 读 | session(会话) | id |  |  | data |
| `Rpa_requeueTask` | POST | `/enterprise/rpa/tasks/:id/requeue` | 重新排队任务 | 写 | session(会话) | id |  |  | data |
| `Rpa_createTasks` | POST | `/enterprise/rpa/tasks/batch` | 批量新建任务 | 写 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

