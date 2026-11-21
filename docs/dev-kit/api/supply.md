<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：供销网络（`supply`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Supply_adminOverview` | GET | `/enterprise/supply/admin/overview` | 管理概览 | 读 | session(会话) |  |  |  | data |
| `Supply_bookings` | GET | `/enterprise/supply/bookings` | 预约单 | 读 | session(会话) |  |  |  | data |
| `Supply_createBooking` | POST | `/enterprise/supply/bookings` | 新建预约单 | 写 | session(会话) |  |  |  | data |
| `Supply_removeBooking` | DELETE | `/enterprise/supply/bookings/:id` | 删除预约单 | 写 | session(会话) | id |  |  | data |
| `Supply_bookingDetail` | GET | `/enterprise/supply/bookings/:id` | 预约单详情 | 读 | session(会话) | id |  |  | data |
| `Supply_updateBooking` | PATCH | `/enterprise/supply/bookings/:id` | 修改预约单 | 写 | session(会话) | id |  |  | data |
| `Supply_assignBooking` | POST | `/enterprise/supply/bookings/:id/assign` | 指派预约单 | 写 | session(会话) | id |  | staff_user_id, staffUserId | data |
| `Supply_cancelBooking` | POST | `/enterprise/supply/bookings/:id/cancel` | 取消预约单 | 写 | session(会话) | id |  | note | data |
| `Supply_confirmBooking` | POST | `/enterprise/supply/bookings/:id/confirm` | 确认预约单 | 写 | session(会话) | id |  | note | data |
| `Supply_bookingLogs` | GET | `/enterprise/supply/bookings/:id/logs` | 预约单日志 | 读 | session(会话) | id |  |  | data |
| `Supply_quoteBooking` | POST | `/enterprise/supply/bookings/:id/quote` | 报价预约单 | 写 | session(会话) | id |  |  | data |
| `Supply_returnBooking` | POST | `/enterprise/supply/bookings/:id/return` | 退回预约单 | 写 | session(会话) | id |  | note | data |
| `Supply_submitBooking` | POST | `/enterprise/supply/bookings/:id/submit` | 提交预约单 | 写 | session(会话) | id |  |  | data |
| `Supply_vetoBooking` | POST | `/enterprise/supply/bookings/:id/veto` | 否决预约单 | 写 | session(会话) | id |  | note | data |
| `Supply_bookingPage` | GET | `/enterprise/supply/bookings/page` | 预约单页面 | 读 | session(会话) |  | page, pageSize, status, keyword, stationId, provider |  | data |
| `Supply_bookingStats` | GET | `/enterprise/supply/bookings/stats` | 预约单统计 | 读 | session(会话) |  |  |  | data |
| `Supply_orders` | GET | `/enterprise/supply/orders` | 订单 | 读 | session(会话) |  |  |  | data |
| `Supply_createOrder` | POST | `/enterprise/supply/orders` | 新建订单 | 写 | session(会话) |  |  |  | data |
| `Supply_removeOrder` | DELETE | `/enterprise/supply/orders/:id` | 删除订单 | 写 | session(会话) | id |  |  | data |
| `Supply_orderDetail` | GET | `/enterprise/supply/orders/:id` | 订单详情 | 读 | session(会话) | id |  |  | data |
| `Supply_updateOrder` | PATCH | `/enterprise/supply/orders/:id` | 修改订单 | 写 | session(会话) | id |  |  | data |
| `Supply_assignOrder` | POST | `/enterprise/supply/orders/:id/assign` | 指派订单 | 写 | session(会话) | id |  | staff_user_id, staffUserId | data |
| `Supply_cancelOrder` | POST | `/enterprise/supply/orders/:id/cancel` | 取消订单 | 写 | session(会话) | id |  | note | data |
| `Supply_confirmOrder` | POST | `/enterprise/supply/orders/:id/confirm` | 确认订单 | 写 | session(会话) | id |  | note | data |
| `Supply_orderLogs` | GET | `/enterprise/supply/orders/:id/logs` | 订单日志 | 读 | session(会话) | id |  |  | data |
| `Supply_quoteOrder` | POST | `/enterprise/supply/orders/:id/quote` | 报价订单 | 写 | session(会话) | id |  |  | data |
| `Supply_returnOrder` | POST | `/enterprise/supply/orders/:id/return` | 退回订单 | 写 | session(会话) | id |  | note | data |
| `Supply_submitOrder` | POST | `/enterprise/supply/orders/:id/submit` | 提交订单 | 写 | session(会话) | id |  |  | data |
| `Supply_vetoOrder` | POST | `/enterprise/supply/orders/:id/veto` | 否决订单 | 写 | session(会话) | id |  | note | data |
| `Supply_orderPage` | GET | `/enterprise/supply/orders/page` | 订单页面 | 读 | session(会话) |  | page, pageSize, status, keyword, stationId, provider |  | data |
| `Supply_orderStats` | GET | `/enterprise/supply/orders/stats` | 订单统计 | 读 | session(会话) |  |  |  | data |
| `Supply_products` | GET | `/enterprise/supply/products` | 商品 | 读 | session(会话) |  |  |  | data |
| `Supply_createProduct` | POST | `/enterprise/supply/products` | 新建商品 | 写 | session(会话) |  |  |  | data |
| `Supply_removeProduct` | DELETE | `/enterprise/supply/products/:id` | 删除商品 | 写 | session(会话) | id |  |  | data |
| `Supply_updateProduct` | PATCH | `/enterprise/supply/products/:id` | 修改商品 | 写 | session(会话) | id |  |  | data |
| `Supply_addSku` | POST | `/enterprise/supply/products/:id/skus` | 添加SKU | 写 | session(会话) | id |  |  | data |
| `Supply_setProductStations` | POST | `/enterprise/supply/products/:id/stations` | 设置服务站 | 写 | session(会话) | id |  | station_ids, stationIds | data |
| `Supply_setProductStationStatus` | POST | `/enterprise/supply/products/:id/stations/:stationId/status` | 设置服务站状态 | 写 | session(会话) | id, stationId |  | status | data |
| `Supply_services` | GET | `/enterprise/supply/services` | 服务 | 读 | session(会话) |  |  |  | data |
| `Supply_createService` | POST | `/enterprise/supply/services` | 新建服务 | 写 | session(会话) |  |  |  | data |
| `Supply_removeService` | DELETE | `/enterprise/supply/services/:id` | 删除服务 | 写 | session(会话) | id |  |  | data |
| `Supply_updateService` | PATCH | `/enterprise/supply/services/:id` | 修改服务 | 写 | session(会话) | id |  |  | data |
| `Supply_removeSku` | DELETE | `/enterprise/supply/skus/:id` | 删除SKU | 写 | session(会话) | id |  |  | data |
| `Supply_updateSku` | PATCH | `/enterprise/supply/skus/:id` | 修改SKU | 写 | session(会话) | id |  |  | data |
| `Supply_stations` | GET | `/enterprise/supply/stations` | 服务站 | 读 | session(会话) |  | provider |  | data |
| `Supply_createStation` | POST | `/enterprise/supply/stations` | 新建服务站 | 写 | session(会话) |  |  |  | data |
| `Supply_removeStation` | DELETE | `/enterprise/supply/stations/:id` | 删除服务站 | 写 | session(会话) | id |  |  | data |
| `Supply_updateStation` | PATCH | `/enterprise/supply/stations/:id` | 修改服务站 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

