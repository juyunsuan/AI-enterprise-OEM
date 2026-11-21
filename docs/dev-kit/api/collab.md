<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：协作底座（`collab`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Collab_comments` | GET | `/enterprise/collab/comments` | 评论 | 读 | session(会话) |  | page, pageSize, targetType, targetId |  | data |
| `Collab_createComment` | POST | `/enterprise/collab/comments` | 新建评论 | 写 | session(会话) |  |  | targetType, targetId, content, contentHtml, parentId, mentions | data |
| `Collab_removeComment` | POST | `/enterprise/collab/comments/remove` | 删除评论 | 写 | session(会话) |  |  | id | data |
| `Collab_favorites` | GET | `/enterprise/collab/favorites` | 收藏 | 读 | session(会话) |  | page, pageSize |  | data |
| `Collab_toggleFavorite` | POST | `/enterprise/collab/favorites/toggle` | 启停收藏 | 写 | session(会话) |  |  | targetType, targetId, title | data |
| `Collab_links` | GET | `/enterprise/collab/links` | 短链 | 读 | session(会话) |  | targetType, targetId |  | data |
| `Collab_addLink` | POST | `/enterprise/collab/links` | 添加短链 | 写 | session(会话) |  |  | targetType, targetId, url, title, kind | data |
| `Collab_removeLink` | POST | `/enterprise/collab/links/remove` | 删除短链 | 写 | session(会话) |  |  | id | data |
| `Collab_mentions` | GET | `/enterprise/collab/mentions` | 提及 | 读 | session(会话) |  | page, pageSize, unreadOnly |  | data |
| `Collab_readMention` | POST | `/enterprise/collab/mentions/read` | 读取提及 | 写 | session(会话) |  |  | id, all | data |
| `Collab_tags` | GET | `/enterprise/collab/tags` | 标签 | 读 | session(会话) |  |  |  | data |
| `Collab_attachTag` | POST | `/enterprise/collab/tags/attach` | 给对象打标签 | 写 | session(会话) |  |  | targetType, targetId, tagId | data |
| `Collab_detachTag` | POST | `/enterprise/collab/tags/detach` | 移除对象标签 | 写 | session(会话) |  |  | targetType, targetId, tagId | data |
| `Collab_objectTags` | GET | `/enterprise/collab/tags/object` | 标签对象 | 读 | session(会话) |  | targetType, targetId |  | data |
| `Collab_removeTag` | POST | `/enterprise/collab/tags/remove` | 删除标记 | 写 | session(会话) |  |  | id | data |
| `Collab_saveTag` | POST | `/enterprise/collab/tags/save` | 保存标记 | 写 | session(会话) |  |  | id, name, color | data |

返回 `INDEX.md`。

