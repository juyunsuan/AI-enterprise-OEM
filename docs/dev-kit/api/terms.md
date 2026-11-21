<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：条款接受（`terms`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Terms_accept` | POST | `/enterprise/terms/accept` | 承接 | 写 | session(会话) |  |  | code, version | data |
| `Terms_documents` | GET | `/enterprise/terms/documents` | 文档 | 读 | session(会话) |  | status, category |  | data |
| `Terms_saveDocument` | POST | `/enterprise/terms/documents` | 保存文档 | 写 | session(会话) |  |  | id, code, version, title, category, content, requireReaccept, effectiveAt, status | data |
| `Terms_removeDocument` | POST | `/enterprise/terms/documents/remove` | 删除文档 | 写 | session(会话) |  |  | id | data |
| `Terms_my` | GET | `/enterprise/terms/my` | 我的 | 读 | session(会话) |  |  |  | data |
| `Terms_pending` | GET | `/enterprise/terms/pending` | 待办 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

