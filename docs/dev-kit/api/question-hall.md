<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：专题大厅（`question-hall`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `QuestionHall_config` | GET | `/enterprise/question-hall/config` | 专题大厅选项 | 读 | session(会话) |  |  |  | data |
| `QuestionHall_questions` | GET | `/enterprise/question-hall/questions` | 专题讨论列表 | 读 | session(会话) |  | page, pageSize, scope, status, keyword, mine |  | data |
| `QuestionHall_createQuestion` | POST | `/enterprise/question-hall/questions` | 发起专题讨论 | 写 | session(会话) |  |  | title, body, scope | data |
| `QuestionHall_deleteQuestion` | DELETE | `/enterprise/question-hall/questions/:id` | 删除专题讨论 | 写 | session(会话) | id |  |  | data |
| `QuestionHall_questionDetail` | GET | `/enterprise/question-hall/questions/:id` | 查看专题讨论详情 | 读 | session(会话) | id |  |  | data |
| `QuestionHall_close` | POST | `/enterprise/question-hall/questions/:id/close` | 关闭专题讨论 | 写 | session(会话) | id |  |  | data |
| `QuestionHall_reopen` | POST | `/enterprise/question-hall/questions/:id/reopen` | 重新开放专题讨论 | 写 | session(会话) | id |  |  | data |
| `QuestionHall_reply` | POST | `/enterprise/question-hall/questions/:id/replies` | 回复专题讨论 | 写 | session(会话) | id |  | content, parentId, personaId | data |
| `QuestionHall_resolve` | POST | `/enterprise/question-hall/questions/:id/resolve` | 结案总结 | 写 | session(会话) | id |  |  | data |
| `QuestionHall_deleteReply` | DELETE | `/enterprise/question-hall/replies/:id` | 删除回复 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

