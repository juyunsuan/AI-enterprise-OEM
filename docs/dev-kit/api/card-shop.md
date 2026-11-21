<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：card-shop（`card-shop`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `CardShop_appDetail` | GET | `/enterprise/card-shop/app/detail` | 申请详情 | 读 | session(会话) |  | siteId |  | data |
| `CardShop_payTest` | POST | `/enterprise/card-shop/app/pay-test` | 支付测试 | 写 | session(会话) |  |  | siteId | data |
| `CardShop_qrcodeGenerate` | POST | `/enterprise/card-shop/app/qrcode` | 生成QRCODE | 写 | session(会话) |  |  | siteId, path | data |
| `CardShop_appSave` | POST | `/enterprise/card-shop/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates, siteId | data |
| `CardShop_appTest` | POST | `/enterprise/card-shop/app/test` | 测试申请 | 写 | session(会话) |  |  | siteId | data |
| `CardShop_batchList` | GET | `/enterprise/card-shop/card/batch/list` | 批次列表 | 读 | session(会话) |  | siteId, goodsId |  | data |
| `CardShop_batchRemove` | POST | `/enterprise/card-shop/card/batch/remove` | 删除批次 | 写 | session(会话) |  |  | siteId, batchId, includeSold | data |
| `CardShop_cardExport` | POST | `/enterprise/card-shop/card/export` | 图卡导出 | 写 | session(会话) |  |  | siteId, goodsId, status, batchId, plain | data |
| `CardShop_cardImport` | POST | `/enterprise/card-shop/card/import` | 导入图卡 | 写 | session(会话) |  |  | siteId, goodsId, source, content, fileName, splitter, dedup, orderMode, remark | data |
| `CardShop_cardList` | GET | `/enterprise/card-shop/card/list` | 图卡列表 | 读 | session(会话) |  | siteId, goodsId, batchId, status, trash, keyword, page, pageSize |  | data |
| `CardShop_cardRemove` | POST | `/enterprise/card-shop/card/remove` | 删除图卡 | 写 | session(会话) |  |  | siteId, ids, hard | data |
| `CardShop_cardRestore` | POST | `/enterprise/card-shop/card/restore` | 恢复图卡 | 写 | session(会话) |  |  | siteId, ids | data |
| `CardShop_cardSave` | POST | `/enterprise/card-shop/card/save` | 保存图卡 | 写 | session(会话) |  |  | siteId, id, number, secret, remark | data |
| `CardShop_cardStatus` | POST | `/enterprise/card-shop/card/status` | 图卡状态 | 写 | session(会话) |  |  | siteId, ids, status | data |
| `CardShop_stock` | GET | `/enterprise/card-shop/card/stock` | 库存 | 读 | session(会话) |  | siteId |  | data |
| `CardShop_categories` | GET | `/enterprise/card-shop/category/list` | 类目 | 读 | session(会话) |  | siteId |  | data |
| `CardShop_categoryRemove` | POST | `/enterprise/card-shop/category/remove` | 删除类目 | 写 | session(会话) |  |  | siteId, id | data |
| `CardShop_categorySave` | POST | `/enterprise/card-shop/category/save` | 保存类目 | 写 | session(会话) |  |  | siteId, id, name, icon, remark, sort, status | data |
| `CardShop_contentDetail` | GET | `/enterprise/card-shop/content/detail` | CONTENT详情 | 读 | session(会话) |  | siteId, id |  | data |
| `CardShop_contentList` | GET | `/enterprise/card-shop/content/list` | CONTENT列表 | 读 | session(会话) |  | siteId, kind, keyword, page, pageSize |  | data |
| `CardShop_contentRemove` | POST | `/enterprise/card-shop/content/remove` | 删除CONTENT | 写 | session(会话) |  |  | siteId, id | data |
| `CardShop_contentSave` | POST | `/enterprise/card-shop/content/save` | 保存CONTENT | 写 | session(会话) |  |  | siteId, id, kind, title, summary, coverImage, images, content, link, popAuto, sort, status | data |
| `CardShop_couponGenerate` | POST | `/enterprise/card-shop/coupon/generate` | 优惠券生成 | 写 | session(会话) |  |  | siteId, kind, value, categoryId, minAmount, count, prefix, expireAt, remark | data |
| `CardShop_couponList` | GET | `/enterprise/card-shop/coupon/list` | 优惠券列表 | 读 | session(会话) |  | siteId, keyword, status, page, pageSize |  | data |
| `CardShop_couponRemove` | POST | `/enterprise/card-shop/coupon/remove` | 优惠券删除 | 写 | session(会话) |  |  | siteId, ids | data |
| `CardShop_couponSave` | POST | `/enterprise/card-shop/coupon/save` | 优惠券保存 | 写 | session(会话) |  |  | siteId, id, code, kind, value, categoryId, minAmount, remark, expireAt, status | data |
| `CardShop_customerList` | GET | `/enterprise/card-shop/customer/list` | 客户列表 | 读 | session(会话) |  | siteId, keyword, page, pageSize |  | data |
| `CardShop_customerStatus` | POST | `/enterprise/card-shop/customer/status` | 客户状态 | 写 | session(会话) |  |  | siteId, id, status | data |
| `CardShop_goodsDetail` | GET | `/enterprise/card-shop/goods/detail` | GOODS详情 | 读 | session(会话) |  | siteId, id |  | data |
| `CardShop_goodsList` | GET | `/enterprise/card-shop/goods/list` | GOODS列表 | 读 | session(会话) |  | siteId, keyword, categoryId, status, warnOnly, page, pageSize |  | data |
| `CardShop_goodsRemove` | POST | `/enterprise/card-shop/goods/remove` | 删除GOODS | 写 | session(会话) |  |  | siteId, ids | data |
| `CardShop_goodsRestore` | POST | `/enterprise/card-shop/goods/restore` | 恢复GOODS | 写 | session(会话) |  |  | siteId, ids | data |
| `CardShop_goodsSave` | POST | `/enterprise/card-shop/goods/save` | 保存GOODS | 写 | session(会话) |  |  | siteId, id, categoryId, name, subtitle, coverImage, images, price, marketPrice, wholesaleTiers, limitQuantity, maxQuantity, stockWarn, couponEnabled, takeCardMode, visitPassword, contactMode, notifyFlags, cardFormat, intro, detail, remark, cardOrderMode, hot, sort, status | data |
| `CardShop_goodsStatus` | POST | `/enterprise/card-shop/goods/status` | GOODS状态 | 写 | session(会话) |  |  | siteId, ids, status | data |
| `CardShop_meta` | GET | `/enterprise/card-shop/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `CardShop_orderClose` | POST | `/enterprise/card-shop/order/close` | 订单关闭 | 写 | session(会话) |  |  | siteId, orderId, reason | data |
| `CardShop_orderDetail` | GET | `/enterprise/card-shop/order/detail` | 订单详情 | 读 | session(会话) |  | siteId, id |  | data |
| `CardShop_orderList` | GET | `/enterprise/card-shop/order/list` | 订单列表 | 读 | session(会话) |  | siteId, keyword, goodsId, payState, from, to, page, pageSize |  | data |
| `CardShop_orderReissue` | POST | `/enterprise/card-shop/order/reissue` | 订单REISSUE | 写 | session(会话) |  |  | siteId, orderId, email | data |
| `CardShop_overview` | GET | `/enterprise/card-shop/overview` | 概览 | 读 | session(会话) |  | siteId |  | data |
| `CardShop_siteCreate` | POST | `/enterprise/card-shop/site/create` | 新建SITE | 写 | session(会话) |  |  | id, name, logo, slogan, themeColor, notice, serviceContact, deskSiteKey, toggles, stockDisplayMode, cardOrderMode, lockMinutes, protocolText | data |
| `CardShop_siteDetail` | GET | `/enterprise/card-shop/site/detail` | SITE详情 | 读 | session(会话) |  | siteId |  | data |
| `CardShop_sites` | GET | `/enterprise/card-shop/site/list` | SITES | 读 | session(会话) |  |  |  | data |
| `CardShop_siteRemove` | POST | `/enterprise/card-shop/site/remove` | 删除SITE | 写 | session(会话) |  |  | siteId | data |
| `CardShop_siteSave` | POST | `/enterprise/card-shop/site/save` | 保存SITE | 写 | session(会话) |  |  | id, name, logo, slogan, themeColor, notice, serviceContact, deskSiteKey, toggles, stockDisplayMode, cardOrderMode, lockMinutes, protocolText | data |
| `CardShop_siteStatus` | POST | `/enterprise/card-shop/site/status` | SITE状态 | 写 | session(会话) |  |  | id, status, reason | data |

返回 `INDEX.md`。

