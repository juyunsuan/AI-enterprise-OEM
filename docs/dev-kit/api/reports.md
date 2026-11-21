<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：报表目录（`reports`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Report_listCatalog` | GET | `/enterprise/reports/catalog` | 列表目录 | 读 | session(会话) |  | module, menuOnly |  | data |
| `Report_removeCatalog` | POST | `/enterprise/reports/catalog/remove` | 删除目录 | 写 | session(会话) |  |  | id | data |
| `Report_saveCatalog` | POST | `/enterprise/reports/catalog/save` | 保存目录 | 写 | session(会话) |  |  | id, code, name, module, description, path, icon, showInMenu, sortOrder, enabled, planCode | data |

返回 `INDEX.md`。

