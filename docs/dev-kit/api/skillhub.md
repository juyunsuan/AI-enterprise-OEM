<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：技能市场（`skillhub`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `SkillHub_list` | GET | `/enterprise/skillhub/skills` | 列表 | 读 | session(会话) |  | keyword, page, pageSize |  | data |
| `SkillHub_detail` | GET | `/enterprise/skillhub/skills/:slug` | 详情 | 读 | session(会话) | slug |  |  | data |
| `SkillHub_install` | POST | `/enterprise/skillhub/skills/:slug/install` | 安装 | 写 | session(会话) | slug |  |  | data |

返回 `INDEX.md`。

