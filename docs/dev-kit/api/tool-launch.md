<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：tool-launch（`tool-launch`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `ToolLaunch_detail` | GET | `/enterprise/tool-launch/detail` | 详情 | 读 | session(会话) |  | tool |  | data |
| `ToolLaunch_start` | POST | `/enterprise/tool-launch/start` | 启动 | 写 | session(会话) |  |  | tool | data |
| `ToolLaunch_states` | GET | `/enterprise/tool-launch/states` | 统计 | 读 | session(会话) |  |  |  | data |
| `ToolLaunch_stop` | POST | `/enterprise/tool-launch/stop` | 停止 | 写 | session(会话) |  |  | tool | data |

返回 `INDEX.md`。

