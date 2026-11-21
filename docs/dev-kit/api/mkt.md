<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：营销技能库（`mkt`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Mkt_listArtifacts` | GET | `/enterprise/mkt/artifacts` | 列表产出物 | 读 | session(会话) |  | page, pageSize, kind, status, reviewStatus, publishStatus, q |  | data |
| `Mkt_publishArtifact` | POST | `/enterprise/mkt/artifacts/publish` | 发布产出物 | 写 | session(会话) |  |  | id, channel, note | data |
| `Mkt_reviewArtifact` | POST | `/enterprise/mkt/artifacts/review` | 审核产出物 | 写 | session(会话) |  |  | id, decision, note | data |
| `Mkt_saveArtifact` | POST | `/enterprise/mkt/artifacts/save` | 保存产出物 | 写 | session(会话) |  |  | id, title, kind, body, status, sourceRunId | data |
| `Mkt_listCapabilities` | GET | `/enterprise/mkt/capabilities` | 列表能力 | 读 | session(会话) |  |  |  | data |
| `Mkt_callCapability` | POST | `/enterprise/mkt/capabilities/call` | 调用营销能力 | 写 | session(会话) |  |  | key, action, payload | data |
| `Mkt_connectAccount` | POST | `/enterprise/mkt/capabilities/connect` | 连接账号 | 写 | session(会话) |  |  | key, accountName, credential | data |
| `Mkt_disconnectAccount` | POST | `/enterprise/mkt/capabilities/disconnect` | 断开账号 | 写 | session(会话) |  |  | key | data |
| `Mkt_readContext` | GET | `/enterprise/mkt/context` | 读取上下文 | 读 | session(会话) |  |  |  | data |
| `Mkt_updateContext` | POST | `/enterprise/mkt/context/save` | 修改上下文 | 写 | session(会话) |  |  | brandName, industry, positioning, tone, audiences, keywords, competitors | data |
| `Mkt_listLoops` | GET | `/enterprise/mkt/loops` | 列表增长回路 | 读 | session(会话) |  |  |  | data |
| `Mkt_removeLoop` | POST | `/enterprise/mkt/loops/remove` | 删除增长回路 | 写 | session(会话) |  |  | id | data |
| `Mkt_saveLoop` | POST | `/enterprise/mkt/loops/save` | 保存增长回路 | 写 | session(会话) |  |  | id, skillKey, name, cron, enabled | data |
| `Mkt_listRuns` | GET | `/enterprise/mkt/runs` | 列表运行记录 | 读 | session(会话) |  | page, pageSize, skillKey, status |  | data |
| `Mkt_runEval` | POST | `/enterprise/mkt/runs/eval` | 运行评测 | 写 | session(会话) |  |  | runId | data |
| `Mkt_listSkills` | GET | `/enterprise/mkt/skills` | 列表技能 | 读 | session(会话) |  | category, q, enabled |  | data |
| `Mkt_getSkill` | GET | `/enterprise/mkt/skills/:key` | 获取技能 | 读 | session(会话) | key |  |  | data |
| `Mkt_runSkill` | POST | `/enterprise/mkt/skills/run` | 运行技能 | 写 | session(会话) |  |  | skillKey, input, persistArtifact | data |
| `Mkt_saveSkill` | POST | `/enterprise/mkt/skills/save` | 保存技能 | 写 | session(会话) |  |  | id, key, name, category, description, channel, promptTemplate, inputs, outputFormat, enabled | data |

返回 `INDEX.md`。

