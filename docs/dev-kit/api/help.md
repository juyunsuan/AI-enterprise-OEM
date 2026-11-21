<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：帮助中心（`help`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Changelog_entries` | GET | `/enterprise/help/changelog` | 条目 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Changelog_save` | POST | `/enterprise/help/changelog` | 保存 | 写 | session(会话) |  |  | id, version, title, summary, body, category, releasedAt, status | data |
| `Changelog_remove` | POST | `/enterprise/help/changelog/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `Help_chapters` | GET | `/enterprise/help/chapters` | 查看帮助章节 | 读 | session(会话) |  |  |  | data |
| `Help_search` | GET | `/enterprise/help/search` | 搜索帮助中心 | 读 | session(会话) |  | keyword |  | data |
| `Help_topic` | GET | `/enterprise/help/topics/:code` | 查看帮助主题 | 读 | session(会话) | code |  |  | data |

返回 `INDEX.md`。

