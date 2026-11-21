<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：quiz（`quiz`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Quiz_banks` | GET | `/enterprise/quiz/banks` | BANKS | 读 | session(会话) |  |  |  | data |
| `Quiz_createBank` | POST | `/enterprise/quiz/banks` | 新建BANK | 写 | session(会话) |  |  | title, description, coverUrl, sort, settings | data |
| `Quiz_removeBank` | DELETE | `/enterprise/quiz/banks/:id` | 删除BANK | 写 | session(会话) | id |  |  | data |
| `Quiz_updateBank` | PUT | `/enterprise/quiz/banks/:id` | 修改BANK | 写 | session(会话) | id |  | title, description, coverUrl, sort, settings | data |
| `Quiz_aiGenerate` | POST | `/enterprise/quiz/banks/:id/ai-generate` | 生成AI | 写 | session(会话) | id |  | prompt, count, type | data |
| `Quiz_closeBank` | POST | `/enterprise/quiz/banks/:id/close` | 关闭BANK | 写 | session(会话) | id |  |  | data |
| `Quiz_publishBank` | POST | `/enterprise/quiz/banks/:id/publish` | 发布BANK | 写 | session(会话) | id |  |  | data |
| `Quiz_questions` | GET | `/enterprise/quiz/banks/:id/questions` | 问题 | 读 | session(会话) | id |  |  | data |
| `Quiz_createQuestion` | POST | `/enterprise/quiz/banks/:id/questions` | 新建问题 | 写 | session(会话) | id |  | type, title, imageUrl, options, answer, analysis, category, sort | data |
| `Quiz_removeQuestion` | DELETE | `/enterprise/quiz/banks/:id/questions/:rowId` | 删除问题 | 写 | session(会话) | id, rowId |  |  | data |
| `Quiz_updateQuestion` | PUT | `/enterprise/quiz/banks/:id/questions/:rowId` | 修改问题 | 写 | session(会话) | id, rowId |  | type, title, imageUrl, options, answer, analysis, category, sort | data |
| `Quiz_rank` | GET | `/enterprise/quiz/banks/:id/rank` | 排名 | 读 | session(会话) | id | limit |  | data |
| `Quiz_reopenBank` | POST | `/enterprise/quiz/banks/:id/reopen` | REOPENBANK | 写 | session(会话) | id |  |  | data |
| `Quiz_results` | GET | `/enterprise/quiz/banks/:id/results` | 结果 | 读 | session(会话) | id | page, pageSize, mode, keyword |  | data |
| `Quiz_package` | GET | `/enterprise/quiz/package` | PACKAGE | 读 | session(会话) |  |  |  | data |
| `Quiz_participants` | GET | `/enterprise/quiz/participants` | PARTICIPANTS | 读 | session(会话) |  | page, pageSize, status, keyword |  | data |
| `Quiz_reviewParticipant` | POST | `/enterprise/quiz/participants/:rowId/review` | 审核PARTICIPANT | 写 | session(会话) | rowId |  | status, note | data |
| `Quiz_site` | GET | `/enterprise/quiz/site` | SITE | 读 | session(会话) |  |  |  | data |
| `Quiz_saveSite` | PUT | `/enterprise/quiz/site` | 保存SITE | 写 | session(会话) |  |  | name, slogan, themeColor, coverUrl, deskSiteKey, aiEnabled, materials, settings | data |

返回 `INDEX.md`。

