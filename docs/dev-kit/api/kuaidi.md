<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：kuaidi（`kuaidi`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Kuaidi_appDetail` | GET | `/enterprise/kuaidi/app/detail` | 申请详情 | 读 | session(会话) |  |  |  | data |
| `Kuaidi_qrcodeGenerate` | POST | `/enterprise/kuaidi/app/qrcode` | 生成QRCODE | 写 | session(会话) |  |  | path | data |
| `Kuaidi_appSave` | POST | `/enterprise/kuaidi/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Kuaidi_appTest` | POST | `/enterprise/kuaidi/app/test` | 测试申请 | 写 | session(会话) |  |  |  | data |
| `Kuaidi_companies` | GET | `/enterprise/kuaidi/company/list` | COMPANIES | 读 | session(会话) |  | siteId |  | data |
| `Kuaidi_companyRemove` | POST | `/enterprise/kuaidi/company/remove` | 删除COMPANY | 写 | session(会话) |  |  | siteId, id | data |
| `Kuaidi_companySave` | POST | `/enterprise/kuaidi/company/save` | 保存COMPANY | 写 | session(会话) |  |  | id, siteId, code, name, logo, firstWeightKg, firstPrice, extraWeightKg, extraPrice, remoteProvinces, remoteExtra, deliveryDays, remark, enabled, sort | data |
| `Kuaidi_companyStatus` | POST | `/enterprise/kuaidi/company/status` | COMPANY状态 | 写 | session(会话) |  |  | siteId, id, enabled | data |
| `Kuaidi_customers` | GET | `/enterprise/kuaidi/customer/list` | 客户 | 读 | session(会话) |  | siteId, keyword, page, pageSize |  | data |
| `Kuaidi_customerStatus` | POST | `/enterprise/kuaidi/customer/status` | 客户状态 | 写 | session(会话) |  |  | siteId, id, status | data |
| `Kuaidi_meta` | GET | `/enterprise/kuaidi/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Kuaidi_orderAction` | POST | `/enterprise/kuaidi/order/action` | 订单ACTION | 写 | session(会话) |  |  | siteId, id, action, note, trackingNo | data |
| `Kuaidi_orderDetail` | GET | `/enterprise/kuaidi/order/detail` | 订单详情 | 读 | session(会话) |  | siteId, id |  | data |
| `Kuaidi_orders` | GET | `/enterprise/kuaidi/order/list` | 订单 | 读 | session(会话) |  | siteId, keyword, status, payState, from, to, page, pageSize |  | data |
| `Kuaidi_overview` | GET | `/enterprise/kuaidi/overview` | 概览 | 读 | session(会话) |  | siteId |  | data |
| `Kuaidi_payAccounts` | GET | `/enterprise/kuaidi/pay/account/list` | 支付凭据 | 读 | session(会话) |  |  |  | data |
| `Kuaidi_payAccountRemove` | POST | `/enterprise/kuaidi/pay/account/remove` | 支付账号删除 | 写 | session(会话) |  |  | id | data |
| `Kuaidi_payAccountSave` | POST | `/enterprise/kuaidi/pay/account/save` | 支付账号保存 | 写 | session(会话) |  |  | id, name, enterpriseId, mchId, apiV3Key, certSerial, privateKey, enabled | data |
| `Kuaidi_payAccountTest` | POST | `/enterprise/kuaidi/pay/account/test` | 支付账号测试 | 写 | session(会话) |  |  | id | data |
| `Kuaidi_enterprises` | GET | `/enterprise/kuaidi/pay/enterprise/list` | 企业 | 读 | session(会话) |  |  |  | data |
| `Kuaidi_siteCreate` | POST | `/enterprise/kuaidi/site/create` | 新建SITE | 写 | session(会话) |  |  | id, name, logo, slogan, themeColor, notice, serviceContact, province, city, district, addressLine, lng, lat, businessHours, phone, pickupNote, payAccountId, deskSiteKey, toggles, insuranceEnabled, insuranceRate, insuranceMax, maxWeightKg, payMinutes, pickupSlots, protocolText | data |
| `Kuaidi_siteDetail` | GET | `/enterprise/kuaidi/site/detail` | SITE详情 | 读 | session(会话) |  | siteId |  | data |
| `Kuaidi_sites` | GET | `/enterprise/kuaidi/site/list` | SITES | 读 | session(会话) |  |  |  | data |
| `Kuaidi_siteRemove` | POST | `/enterprise/kuaidi/site/remove` | 删除SITE | 写 | session(会话) |  |  | siteId | data |
| `Kuaidi_siteSave` | POST | `/enterprise/kuaidi/site/save` | 保存SITE | 写 | session(会话) |  |  | id, name, logo, slogan, themeColor, notice, serviceContact, province, city, district, addressLine, lng, lat, businessHours, phone, pickupNote, payAccountId, deskSiteKey, toggles, insuranceEnabled, insuranceRate, insuranceMax, maxWeightKg, payMinutes, pickupSlots, protocolText | data |
| `Kuaidi_siteStatus` | POST | `/enterprise/kuaidi/site/status` | SITE状态 | 写 | session(会话) |  |  | id, status, reason | data |

返回 `INDEX.md`。

