<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：errand（`errand`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Errand_agents` | GET | `/enterprise/errand/agent/list` | 代理人 | 读 | session(会话) |  |  |  | data |
| `Errand_agentRemove` | POST | `/enterprise/errand/agent/remove` | 删除代理人 | 写 | session(会话) |  |  | id | data |
| `Errand_agentSave` | POST | `/enterprise/errand/agent/save` | 保存代理人 | 写 | session(会话) |  |  | id, name, mobile, password, status, commissionRate, cityIds | data |
| `Errand_agentStatus` | POST | `/enterprise/errand/agent/status` | 代理人状态 | 写 | session(会话) |  |  | id, status | data |
| `Errand_agentWithdrawalAction` | POST | `/enterprise/errand/agent/withdrawal/action` | 代理人WITHDRAWALACTION | 写 | session(会话) |  |  | id, action, note | data |
| `Errand_agentWithdrawals` | GET | `/enterprise/errand/agent/withdrawal/list` | 代理人WITHDRAWALS | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Errand_aiDispatch` | POST | `/enterprise/errand/ai/dispatch` | 派发AI | 写 | session(会话) |  |  | orderId | data |
| `Errand_aiOps` | POST | `/enterprise/errand/ai/ops` | AIOPS | 写 | session(会话) |  |  | days | data |
| `Errand_appDetail` | GET | `/enterprise/errand/app` | 申请详情 | 读 | session(会话) |  |  |  | data |
| `Errand_appSave` | POST | `/enterprise/errand/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Errand_appTest` | POST | `/enterprise/errand/app/test` | 测试申请 | 写 | session(会话) |  |  |  | data |
| `Errand_assets` | GET | `/enterprise/errand/asset/list` | 资产 | 读 | session(会话) |  | keyword, take |  | data |
| `Errand_cities` | GET | `/enterprise/errand/city/list` | CITIES | 读 | session(会话) |  |  |  | data |
| `Errand_cityRemove` | POST | `/enterprise/errand/city/remove` | 删除CITY | 写 | session(会话) |  |  | id | data |
| `Errand_citySave` | POST | `/enterprise/errand/city/save` | 保存CITY | 写 | session(会话) |  |  | id, name, province, city, district, addressLine, lng, lat, status, sort, rule | data |
| `Errand_cityStatus` | POST | `/enterprise/errand/city/status` | CITY状态 | 写 | session(会话) |  |  | id, status | data |
| `Errand_coupons` | GET | `/enterprise/errand/coupon/list` | 优惠券 | 读 | session(会话) |  |  |  | data |
| `Errand_couponRemove` | POST | `/enterprise/errand/coupon/remove` | 优惠券删除 | 写 | session(会话) |  |  | id | data |
| `Errand_couponSave` | POST | `/enterprise/errand/coupon/save` | 优惠券保存 | 写 | session(会话) |  |  | id, name, type, discountValue, minAmount, total, startAt, endAt, enabled, cityId, serviceTypes, firstOrderOnly, autoIssue | data |
| `Errand_couponStatus` | POST | `/enterprise/errand/coupon/status` | 优惠券状态 | 写 | session(会话) |  |  | id, enabled | data |
| `Errand_customers` | GET | `/enterprise/errand/customer/list` | 客户 | 读 | session(会话) |  | page, pageSize, keyword |  | data |
| `Errand_customerStatus` | POST | `/enterprise/errand/customer/status` | 客户状态 | 写 | session(会话) |  |  | id, status | data |
| `Errand_meta` | GET | `/enterprise/errand/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Errand_orderAction` | POST | `/enterprise/errand/order/action` | 订单ACTION | 写 | session(会话) |  |  | id, action, riderId, note, purchaseAmount, purchaseReceipt, purchaseNote | data |
| `Errand_orderDetail` | GET | `/enterprise/errand/order/detail` | 订单详情 | 读 | session(会话) |  | id |  | data |
| `Errand_orders` | GET | `/enterprise/errand/order/list` | 订单 | 读 | session(会话) |  | page, pageSize, status, payState, serviceType, riderId, cityId, keyword, from, to |  | data |
| `Errand_overview` | GET | `/enterprise/errand/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Errand_qrcodeGenerate` | POST | `/enterprise/errand/qrcode/generate` | 生成QRCODE | 写 | session(会话) |  |  | path | data |
| `Errand_riders` | GET | `/enterprise/errand/rider/list` | RIDERS | 读 | session(会话) |  | page, pageSize, status, cityId, keyword |  | data |
| `Errand_riderRoster` | GET | `/enterprise/errand/rider/roster` | RIDERROSTER | 读 | session(会话) |  |  |  | data |
| `Errand_riderSave` | POST | `/enterprise/errand/rider/save` | 保存RIDER | 写 | session(会话) |  |  | id, cityId, name, mobile, vehicleType, serviceTypes, status, note | data |
| `Errand_riderStatus` | POST | `/enterprise/errand/rider/status` | RIDER状态 | 写 | session(会话) |  |  | id, status, reason | data |
| `Errand_ruleSave` | POST | `/enterprise/errand/rule/save` | 保存规则 | 写 | session(会话) |  |  | baseFee, baseDistanceKm, perKmFee, baseWeightKg, perKgFee, nightStart, nightEnd, nightFee, buyServiceRate, minOrderAmount, maxDistanceKm, maxWeightKg, tipPresets, couponEnabled, acceptRadiusKm, autoDispatch, riderShareRate, maxActiveOrders, pointsEarnRate, pointsDeductRate, maxPointsDiscountRate, cityId | data |
| `Errand_site` | GET | `/enterprise/errand/site` | SITE | 读 | session(会话) |  |  |  | data |
| `Errand_siteSave` | POST | `/enterprise/errand/site/save` | 保存SITE | 写 | session(会话) |  |  | name, logo, banner, slogan, themeColor, notice, province, city, district, addressLine, lng, lat, businessHours, phone, contact, deskSiteKey, toggles, protocolText | data |
| `Errand_siteStatus` | POST | `/enterprise/errand/site/status` | SITE状态 | 写 | session(会话) |  |  | status | data |
| `Errand_wallet` | GET | `/enterprise/errand/wallet` | WALLET | 读 | session(会话) |  |  |  | data |
| `Errand_withdrawalAction` | POST | `/enterprise/errand/withdrawal/action` | WITHDRAWALACTION | 写 | session(会话) |  |  | id, action, note, method | data |
| `Errand_withdrawals` | GET | `/enterprise/errand/withdrawal/list` | WITHDRAWALS | 读 | session(会话) |  | page, pageSize, status |  | data |

返回 `INDEX.md`。

