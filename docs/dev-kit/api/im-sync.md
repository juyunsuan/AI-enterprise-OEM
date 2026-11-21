<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：飞书企微同步（`im-sync`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Sync_runAttendance` | POST | `/enterprise/im-sync/attendance` | 运行考勤 | 写 | session(会话) |  |  | channel, startDate, endDate | data |
| `Sync_listBindings` | GET | `/enterprise/im-sync/bindings` | 列表绑定 | 读 | session(会话) |  | channel, domain |  | data |
| `Sync_removeBinding` | POST | `/enterprise/im-sync/bindings/remove` | 删除绑定 | 写 | session(会话) |  |  | id | data |
| `Sync_saveBinding` | POST | `/enterprise/im-sync/bindings/save` | 保存绑定 | 写 | session(会话) |  |  | id, channel, domain, externalId, principalType, localId, label | data |
| `Sync_runContacts` | POST | `/enterprise/im-sync/contacts` | 运行联系方式 | 写 | session(会话) |  |  | channel, dryRun | data |
| `Sync_sendMessage` | POST | `/enterprise/im-sync/message` | 发送留言 | 写 | session(会话) |  |  | channel, to, title, content, link | data |
| `Sync_overview` | GET | `/enterprise/im-sync/overview` | 概览 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

