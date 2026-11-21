<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：达人建联（`connections`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Connections_dictionary` | GET | `/enterprise/connections/dictionaries/:code/items` | 字典 | 读 | session(会话) | code |  |  | data |
| `Connections_favorites` | GET | `/enterprise/connections/favorites/marketing` | 收藏 | 读 | session(会话) |  | page, pageSize |  | data |
| `Connections_removeProfileFavorite` | DELETE | `/enterprise/connections/favorites/profile/:resourceId` | 删除档案收藏 | 写 | session(会话) | resourceId |  |  | data |
| `Connections_addProfileFavorite` | POST | `/enterprise/connections/favorites/profile/:resourceId` | 添加档案收藏 | 写 | session(会话) | resourceId |  |  | data |
| `Connections_profileFavorites` | GET | `/enterprise/connections/favorites/profiles` | 档案收藏 | 读 | session(会话) |  |  |  | data |
| `Connections_removeFavorite` | DELETE | `/enterprise/connections/favorites/talent/:resourceId` | 删除收藏 | 写 | session(会话) | resourceId |  |  | data |
| `Connections_addFavorite` | POST | `/enterprise/connections/favorites/talent/:resourceId` | 添加收藏 | 写 | session(会话) | resourceId |  |  | data |
| `Connections_resources` | GET | `/enterprise/connections/resources` | 资源 | 读 | session(会话) |  |  |  | data |
| `Connections_contact` | GET | `/enterprise/connections/resources/:sourceType/:resourceId/contact` | 联系人 | 读 | session(会话) | sourceType, resourceId |  |  | data |
| `Connections_locations` | GET | `/enterprise/connections/resources/locations` | 地区 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

