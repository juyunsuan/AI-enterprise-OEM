<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：跨境出海（`overseas`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Overseas_list` | GET | `/enterprise/overseas` | 列表 | 读 | session(会话) |  |  |  | data |
| `Overseas_create` | POST | `/enterprise/overseas` | 新建 | 写 | session(会话) |  |  | service_type, title, country, amount, remark | data |
| `Overseas_claimDetail` | GET | `/enterprise/overseas/:id` | 认领详情 | 读 | session(会话) | id |  |  | data |
| `Overseas_advance` | POST | `/enterprise/overseas/:id/advance` | 推进 | 写 | session(会话) | id |  |  | data |
| `Overseas_updateContacts` | POST | `/enterprise/overseas/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Overseas_catalog` | GET | `/enterprise/overseas/catalog` | 目录 | 读 | session(会话) |  |  |  | data |
| `Overseas_claimPage` | GET | `/enterprise/overseas/page` | 认领页面 | 读 | session(会话) |  | page, pageSize, status, keyword, stationId, provider |  | data |
| `Overseas_claimStats` | GET | `/enterprise/overseas/stats` | 认领统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

