<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：平台能力目录（`platform`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Platform_accessPolicy` | GET | `/enterprise/platform/access-policy` | 访问权限策略 | 读 | session(会话) |  |  |  | data |
| `Platform_saveAccessPolicy` | POST | `/enterprise/platform/access-policy/save` | 保存访问权限策略 | 写 | session(会话) |  |  | blacklist, limits | data |
| `Platform_aiGuard` | GET | `/enterprise/platform/ai-guard` | AI护栏 | 读 | session(会话) |  |  |  | data |
| `Platform_saveAiGuard` | POST | `/enterprise/platform/ai-guard/save` | 保存AI护栏 | 写 | session(会话) |  |  | enabled, userPerMinute, orgPerMinute, orgOverrides | data |
| `Platform_featureCatalog` | GET | `/enterprise/platform/features` | 功能目录 | 读 | session(会话) |  |  |  | data |
| `Platform_setFeatureToggle` | POST | `/enterprise/platform/features/toggle` | 设置功能启停 | 写 | session(会话) |  |  | code, state, scope, orgUserId | data |
| `Platform_menu` | GET | `/enterprise/platform/menu` | 菜单 | 读 | session(会话) |  |  |  | data |
| `PublishReview_settings` | GET | `/enterprise/platform/publish-review` | 设置 | 读 | session(会话) |  |  |  | data |
| `PublishReview_save` | PUT | `/enterprise/platform/publish-review` | 保存 | 写 | session(会话) |  |  | enabled, region, accessKeyId, accessKeySecret, scenes | data |
| `PublishReview_logs` | GET | `/enterprise/platform/publish-review/logs` | 日志 | 读 | session(会话) |  | page, pageSize, scene, decision |  | data |
| `PublishReview_test` | POST | `/enterprise/platform/publish-review/test` | 测试 | 写 | session(会话) |  |  | text | data |
| `Platform_skillReviews` | GET | `/enterprise/platform/skill-reviews` | 技能审核 | 读 | session(会话) |  | page, pageSize, kind, decision |  | data |
| `Platform_reviewSkillDecision` | POST | `/enterprise/platform/skill-reviews/decision` | 审核技能决策 | 写 | session(会话) |  |  | kind, itemId, decision, note | data |

返回 `INDEX.md`。

