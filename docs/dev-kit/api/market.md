<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：平台直连看板（`market`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `MarketBoard_demands` | GET | `/enterprise/market/:domain/demands` | 需求 | 读 | session(会话) | domain | province, city, subCategoryId, scope, cursor, pageSize |  | data |
| `MarketBoard_createDemand` | POST | `/enterprise/market/:domain/demands` | 新建需求 | 写 | session(会话) | domain |  |  | data |
| `MarketBoard_removeDemand` | DELETE | `/enterprise/market/:domain/demands/:id` | 删除需求 | 写 | session(会话) | domain, id |  |  | data |
| `MarketBoard_demandDetail` | GET | `/enterprise/market/:domain/demands/:id` | 需求详情 | 读 | session(会话) | domain, id |  |  | data |
| `MarketBoard_updateDemand` | PATCH | `/enterprise/market/:domain/demands/:id` | 修改需求 | 写 | session(会话) | domain, id |  |  | data |
| `MarketBoard_demandMessages` | GET | `/enterprise/market/:domain/demands/:id/messages` | 需求留言 | 读 | session(会话) | domain, id |  |  | data |
| `MarketBoard_marketplace` | GET | `/enterprise/market/:domain/marketplace` | 服务市集 | 读 | session(会话) | domain | province, city, cursor, pageSize |  | data |
| `MarketBoard_marketplaceDetail` | GET | `/enterprise/market/:domain/marketplace/:id` | 服务市集详情 | 读 | session(会话) | domain, id |  |  | data |
| `MarketBoard_services` | GET | `/enterprise/market/:domain/services` | 服务 | 读 | session(会话) | domain | province, city, subCategoryId, scope, cursor, pageSize |  | data |
| `MarketBoard_createService` | POST | `/enterprise/market/:domain/services` | 新建服务 | 写 | session(会话) | domain |  |  | data |
| `MarketBoard_removeService` | DELETE | `/enterprise/market/:domain/services/:id` | 删除服务 | 写 | session(会话) | domain, id |  |  | data |
| `MarketBoard_serviceDetail` | GET | `/enterprise/market/:domain/services/:id` | 服务详情 | 读 | session(会话) | domain, id |  |  | data |
| `MarketBoard_updateService` | PATCH | `/enterprise/market/:domain/services/:id` | 修改服务 | 写 | session(会话) | domain, id |  |  | data |
| `Review_reviews` | GET | `/enterprise/market/reviews` | 审核 | 读 | session(会话) |  | page, pageSize, listingId, listingType |  | data |
| `Review_saveReview` | POST | `/enterprise/market/reviews` | 保存审核 | 写 | session(会话) |  |  | id, listingId, listingType, rating, content, reviewerName, orderRef | data |
| `Review_removeReview` | POST | `/enterprise/market/reviews/remove` | 删除审核 | 写 | session(会话) |  |  | id | data |
| `Review_summary` | GET | `/enterprise/market/reviews/summary` | 摘要 | 读 | session(会话) |  | listingId, listingType |  | data |

返回 `INDEX.md`。

