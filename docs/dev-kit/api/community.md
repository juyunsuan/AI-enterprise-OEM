<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：创意社区（`community`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Community_categories` | GET | `/enterprise/community/categories` | 类目 | 读 | session(会话) |  |  |  | data |
| `Community_clearCredential` | DELETE | `/enterprise/community/comfy/credential` | 解除 Comfy Cloud 密钥 | 写 | session(会话) |  |  |  | data |
| `Community_saveCredential` | POST | `/enterprise/community/comfy/credential` | 保存 Comfy Cloud 密钥 | 写 | session(会话) |  |  | apiKey | data |
| `Community_testCredential` | POST | `/enterprise/community/comfy/credential/test` | 校验 Comfy Cloud 密钥 | 写 | session(会话) |  |  |  | data |
| `Community_connectStatus` | GET | `/enterprise/community/comfy/status` | 连接状态 | 读 | session(会话) |  |  |  | data |
| `Community_myDrafts` | GET | `/enterprise/community/drafts` | 我的草稿 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Community_myRuns` | GET | `/enterprise/community/runs` | 我的运行记录 | 读 | session(会话) |  | page, pageSize, workflowCode |  | data |
| `Community_runStatus` | GET | `/enterprise/community/runs/:id` | 运行状态 | 读 | session(会话) | id |  |  | data |
| `Community_cancelRun` | POST | `/enterprise/community/runs/:id/cancel` | 取消社区运行 | 写 | session(会话) | id |  |  | data |
| `Community_list` | GET | `/enterprise/community/workflows` | 列表 | 读 | session(会话) |  | page, pageSize, category, group, keyword, sort, runnable, favorite |  | data |
| `Community_publish` | POST | `/enterprise/community/workflows` | 发布社区工作流 | 写 | session(会话) |  |  | title, summary, description, category, groupLabel, tags, mediaType, workflowJson, slots | data |
| `Community_unpublish` | DELETE | `/enterprise/community/workflows/:code` | 下架社区工作流 | 写 | session(会话) | code |  |  | data |
| `Community_detail` | GET | `/enterprise/community/workflows/:code` | 详情 | 读 | session(会话) | code |  |  | data |
| `Community_updateWorkflow` | PUT | `/enterprise/community/workflows/:code` | 修改社区工作流 | 写 | session(会话) | code |  | title, summary, description, category, groupLabel, tags, mediaType, workflowJson, slots | data |
| `Community_unfavorite` | DELETE | `/enterprise/community/workflows/:code/favorite` | 取消收藏 | 写 | session(会话) | code |  |  | data |
| `Community_favorite` | POST | `/enterprise/community/workflows/:code/favorite` | 收藏社区工作流 | 写 | session(会话) | code |  |  | data |
| `Community_like` | POST | `/enterprise/community/workflows/:code/like` | 点赞社区工作流 | 写 | session(会话) | code |  |  | data |
| `Community_run` | POST | `/enterprise/community/workflows/:code/run` | 运行社区工作流 | 写 | session(会话) | code |  | inputs | data |

返回 `INDEX.md`。

