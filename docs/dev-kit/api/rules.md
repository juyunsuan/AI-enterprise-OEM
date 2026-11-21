<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：规则引擎（`rules`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Rule_list` | GET | `/enterprise/rules` | 列表 | 读 | session(会话) |  | page, pageSize, event |  | data |
| `Rule_remove` | POST | `/enterprise/rules/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `Rule_save` | POST | `/enterprise/rules/save` | 保存 | 写 | session(会话) |  |  | id, code, name, description, event, conditions, actions, enabled | data |
| `Rule_test` | POST | `/enterprise/rules/test` | 测试 | 写 | session(会话) |  |  | conditions, context | data |

返回 `INDEX.md`。

