<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：rental（`rental`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Rental_overview` | GET | `/enterprise/rental/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Rental_shops` | GET | `/enterprise/rental/shops` | SHOPS | 读 | session(会话) |  | page, pageSize, keyword, status |  | data |
| `Rental_createShop` | POST | `/enterprise/rental/shops` | 新建SHOP | 写 | session(会话) |  |  | id, name, logo, servicePhone, address, themeColor, navigationTitle | data |
| `Rental_shopDetail` | GET | `/enterprise/rental/shops/:id` | SHOP详情 | 读 | session(会话) | id |  |  | data |
| `Rental_updateShop` | PUT | `/enterprise/rental/shops/:id` | 修改SHOP | 写 | session(会话) | id |  | id, name, logo, servicePhone, address, themeColor, navigationTitle | data |
| `Rental_customers` | GET | `/enterprise/rental/shops/:id/customers` | 客户 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Rental_saveCustomer` | PUT | `/enterprise/rental/shops/:id/customers` | 保存客户 | 写 | session(会话) | id |  | id, nickname, phone, gender, city, remark, status | data |
| `Rental_customerStatus` | POST | `/enterprise/rental/shops/:id/customers/:customerId/status` | 客户状态 | 写 | session(会话) | id, customerId |  | status | data |
| `Rental_removeCustomer` | POST | `/enterprise/rental/shops/:id/customers/remove` | 删除客户 | 写 | session(会话) | id |  | id | data |
| `Rental_inspections` | GET | `/enterprise/rental/shops/:id/inspections` | INSPECTIONS | 读 | session(会话) | id | page, pageSize, kind, orderNo |  | data |
| `Rental_items` | GET | `/enterprise/rental/shops/:id/items` | 明细 | 读 | session(会话) | id | page, pageSize, keyword, status, category |  | data |
| `Rental_saveItem` | PUT | `/enterprise/rental/shops/:id/items` | 保存明细 | 写 | session(会话) | id |  | id, category, name, cover, images, description, attributes, dailyRate, deposit, stock, status, sortOrder | data |
| `Rental_removeItem` | POST | `/enterprise/rental/shops/:id/items/remove` | 删除明细 | 写 | session(会话) | id |  | id | data |
| `Rental_orders` | GET | `/enterprise/rental/shops/:id/orders` | 订单 | 读 | session(会话) | id | page, pageSize, keyword, status, payStatus, itemId |  | data |
| `Rental_createOrder` | POST | `/enterprise/rental/shops/:id/orders` | 新建订单 | 写 | session(会话) | id |  | customerId, customerName, customerPhone, itemId, startAt, endAt, discount, remark, salesStaffId | data |
| `Rental_orderDetail` | GET | `/enterprise/rental/shops/:id/orders/:orderId` | 订单详情 | 读 | session(会话) | id, orderId |  |  | data |
| `Rental_updateOrder` | PUT | `/enterprise/rental/shops/:id/orders/:orderId` | 修改订单 | 写 | session(会话) | id, orderId |  | startAt, endAt, discount, remark | data |
| `Rental_orderAction` | POST | `/enterprise/rental/shops/:id/orders/:orderId/action` | 订单ACTION | 写 | session(会话) | id, orderId |  | action, note | data |
| `Rental_saveInspection` | PUT | `/enterprise/rental/shops/:id/orders/:orderId/inspection` | 保存INSPECTION | 写 | session(会话) | id, orderId |  | kind, mileage, fuelPercent, damage, damageFee, images, note | data |
| `Rental_package` | GET | `/enterprise/rental/shops/:id/package` | PACKAGE | 读 | session(会话) | id |  |  | data |
| `Rental_staffs` | GET | `/enterprise/rental/shops/:id/staffs` | 职员 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Rental_saveStaff` | PUT | `/enterprise/rental/shops/:id/staffs` | 保存职员 | 写 | session(会话) | id |  | id, name, phone, staffCode, role, status | data |
| `Rental_removeStaff` | POST | `/enterprise/rental/shops/:id/staffs/remove` | 删除职员 | 写 | session(会话) | id |  | id | data |
| `Rental_stats` | GET | `/enterprise/rental/shops/:id/stats` | 统计 | 读 | session(会话) | id | days |  | data |
| `Rental_setStatus` | POST | `/enterprise/rental/shops/:id/status` | 设置状态 | 写 | session(会话) | id |  | status | data |
| `Rental_saveTrade` | PUT | `/enterprise/rental/shops/:id/trade` | 保存TRADE | 写 | session(会话) | id |  | autoCancelMinutes, maxRentDays, depositRefundHours, depositRefundAuto, deskSiteKey, scrmCodeId, notice | data |
| `Rental_wechat` | GET | `/enterprise/rental/shops/:id/wechat` | WECHAT | 读 | session(会话) | id |  |  | data |
| `Rental_saveWechat` | PUT | `/enterprise/rental/shops/:id/wechat` | 保存WECHAT | 写 | session(会话) | id |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Rental_testWechat` | POST | `/enterprise/rental/shops/:id/wechat/test` | 测试WECHAT | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

