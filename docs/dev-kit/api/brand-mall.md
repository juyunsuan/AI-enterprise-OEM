<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：brand-mall（`brand-mall`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `BrandMall_appDetail` | GET | `/enterprise/brand-mall/app/detail` | 申请详情 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_payTest` | POST | `/enterprise/brand-mall/app/pay-test` | 支付测试 | 写 | session(会话) |  |  | shopId | data |
| `BrandMall_qrcodeGenerate` | POST | `/enterprise/brand-mall/app/qrcode` | 生成QRCODE | 写 | session(会话) |  |  | shopId, path | data |
| `BrandMall_appSave` | POST | `/enterprise/brand-mall/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates, shopId | data |
| `BrandMall_appTest` | POST | `/enterprise/brand-mall/app/test` | 测试申请 | 写 | session(会话) |  |  | shopId | data |
| `BrandMall_categoryList` | GET | `/enterprise/brand-mall/category/list` | 类目列表 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_categoryRemove` | POST | `/enterprise/brand-mall/category/remove` | 删除类目 | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_categorySave` | POST | `/enterprise/brand-mall/category/save` | 保存类目 | 写 | session(会话) |  |  | shopId, id, parentId, name, icon, image, sortOrder, enabled | data |
| `BrandMall_categorySort` | POST | `/enterprise/brand-mall/category/sort` | 类目SORT | 写 | session(会话) |  |  | shopId, ids | data |
| `BrandMall_couponList` | GET | `/enterprise/brand-mall/coupon/list` | 优惠券列表 | 读 | session(会话) |  | page, pageSize, shopId, status, keyword |  | data |
| `BrandMall_couponRemove` | POST | `/enterprise/brand-mall/coupon/remove` | 优惠券删除 | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_couponSave` | POST | `/enterprise/brand-mall/coupon/save` | 优惠券保存 | 写 | session(会话) |  |  | shopId, id, name, type, value, threshold, totalCount, perLimit, validType, startAt, endAt, validDays, scope, scopeIds, status | data |
| `BrandMall_couponStatus` | POST | `/enterprise/brand-mall/coupon/status` | 优惠券状态 | 写 | session(会话) |  |  | shopId, id, status | data |
| `BrandMall_couponTickets` | GET | `/enterprise/brand-mall/coupon/tickets` | 优惠券工单 | 读 | session(会话) |  | page, pageSize, shopId, couponId, status, keyword |  | data |
| `BrandMall_addressList` | GET | `/enterprise/brand-mall/customer/addresses` | ADDRESS列表 | 读 | session(会话) |  | shopId, customerId |  | data |
| `BrandMall_customerDetail` | GET | `/enterprise/brand-mall/customer/detail` | 客户详情 | 读 | session(会话) |  | shopId, id |  | data |
| `BrandMall_customerList` | GET | `/enterprise/brand-mall/customer/list` | 客户列表 | 读 | session(会话) |  | page, pageSize, shopId, keyword, status, source, orderFilter |  | data |
| `BrandMall_customerScrm` | GET | `/enterprise/brand-mall/customer/scrm` | 客户企微 | 读 | session(会话) |  | shopId, customerId |  | data |
| `BrandMall_customerUpdate` | POST | `/enterprise/brand-mall/customer/update` | 客户修改 | 写 | session(会话) |  |  | shopId, id, nickname, level, remark, status | data |
| `BrandMall_diyCopy` | POST | `/enterprise/brand-mall/diy/copy` | DIY复制 | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_diyDetail` | GET | `/enterprise/brand-mall/diy/detail` | DIY详情 | 读 | session(会话) |  | shopId, id |  | data |
| `BrandMall_diyList` | GET | `/enterprise/brand-mall/diy/list` | DIY列表 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_diyPublish` | POST | `/enterprise/brand-mall/diy/publish` | 发布DIY | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_diyRemove` | POST | `/enterprise/brand-mall/diy/remove` | 删除DIY | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_diySave` | POST | `/enterprise/brand-mall/diy/save` | 保存DIY | 写 | session(会话) |  |  | shopId, id, name, type, components, styles, coverImage, sortOrder | data |
| `BrandMall_diyWidgets` | GET | `/enterprise/brand-mall/diy/widgets` | DIYWIDGETS | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_expressList` | GET | `/enterprise/brand-mall/express/list` | EXPRESS列表 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_expressRemove` | POST | `/enterprise/brand-mall/express/remove` | 删除EXPRESS | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_expressSave` | POST | `/enterprise/brand-mall/express/save` | 保存EXPRESS | 写 | session(会话) |  |  | shopId, id, name, code, phone, enabled, sortOrder | data |
| `BrandMall_meta` | GET | `/enterprise/brand-mall/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `BrandMall_orderClose` | POST | `/enterprise/brand-mall/order/close` | 订单关闭 | 写 | session(会话) |  |  | shopId, id, reason | data |
| `BrandMall_orderDetail` | GET | `/enterprise/brand-mall/order/detail` | 订单详情 | 读 | session(会话) |  | shopId, id |  | data |
| `BrandMall_orderFinish` | POST | `/enterprise/brand-mall/order/finish` | 完成订单 | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_orderList` | GET | `/enterprise/brand-mall/order/list` | 订单列表 | 读 | session(会话) |  | page, pageSize, shopId, status, refundStatus, payType, keyword, customerId, dateFrom, dateTo |  | data |
| `BrandMall_orderRemark` | POST | `/enterprise/brand-mall/order/remark` | 订单REMARK | 写 | session(会话) |  |  | shopId, id, sellerRemark | data |
| `BrandMall_orderShip` | POST | `/enterprise/brand-mall/order/ship` | 订单SHIP | 写 | session(会话) |  |  | shopId, id, expressCompany, expressNo, remark | data |
| `BrandMall_productCopy` | POST | `/enterprise/brand-mall/product/copy` | 商品复制 | 写 | session(会话) |  |  | shopId, ids | data |
| `BrandMall_productDetail` | GET | `/enterprise/brand-mall/product/detail` | 商品详情 | 读 | session(会话) |  | shopId, id |  | data |
| `BrandMall_productList` | GET | `/enterprise/brand-mall/product/list` | 商品列表 | 读 | session(会话) |  | page, pageSize, shopId, keyword, categoryId, status, type, tag, sort |  | data |
| `BrandMall_productRemove` | POST | `/enterprise/brand-mall/product/remove` | 删除商品 | 写 | session(会话) |  |  | shopId, ids | data |
| `BrandMall_productSave` | POST | `/enterprise/brand-mall/product/save` | 保存商品 | 写 | session(会话) |  |  | shopId, id, categoryId, title, subtitle, coverImage, images, detail, type, price, marketPrice, costPrice, stock, unit, weight, volume, freightTemplateId, specs, skus, guaranteeTags, params, status, isHot, isNew, isGood, sortOrder, virtualRemark | data |
| `BrandMall_productStatus` | POST | `/enterprise/brand-mall/product/status` | 商品状态 | 写 | session(会话) |  |  | shopId, ids, status | data |
| `BrandMall_refundAgree` | POST | `/enterprise/brand-mall/refund/agree` | REFUNDAGREE | 写 | session(会话) |  |  | shopId, id, adminRemark | data |
| `BrandMall_refundDetail` | GET | `/enterprise/brand-mall/refund/detail` | REFUND详情 | 读 | session(会话) |  | shopId, id |  | data |
| `BrandMall_refundList` | GET | `/enterprise/brand-mall/refund/list` | REFUND列表 | 读 | session(会话) |  | page, pageSize, shopId, status, keyword |  | data |
| `BrandMall_refundReject` | POST | `/enterprise/brand-mall/refund/reject` | 驳回REFUND | 写 | session(会话) |  |  | shopId, id, rejectReason | data |
| `BrandMall_reviewList` | GET | `/enterprise/brand-mall/review/list` | 审核列表 | 读 | session(会话) |  | page, pageSize, shopId, productId, status, rating |  | data |
| `BrandMall_reviewReply` | POST | `/enterprise/brand-mall/review/reply` | 回复审核 | 写 | session(会话) |  |  | shopId, id, reply | data |
| `BrandMall_reviewStatus` | POST | `/enterprise/brand-mall/review/status` | 审核状态 | 写 | session(会话) |  |  | shopId, id, status | data |
| `BrandMall_scrmReplay` | POST | `/enterprise/brand-mall/scrm/replay` | 企微重投 | 写 | session(会话) |  |  | shopId, ids | data |
| `BrandMall_scrmRetry` | POST | `/enterprise/brand-mall/scrm/retry` | 企微重试 | 写 | session(会话) |  |  | shopId | data |
| `BrandMall_scrmState` | GET | `/enterprise/brand-mall/scrm/state` | 企微STATE | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_scrmToggle` | POST | `/enterprise/brand-mall/scrm/toggle` | 企微启停 | 写 | session(会话) |  |  | shopId, enabled | data |
| `BrandMall_shippingList` | GET | `/enterprise/brand-mall/shipping/list` | SHIPPING列表 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_shippingRemove` | POST | `/enterprise/brand-mall/shipping/remove` | 删除SHIPPING | 写 | session(会话) |  |  | shopId, id | data |
| `BrandMall_shippingSave` | POST | `/enterprise/brand-mall/shipping/save` | 保存SHIPPING | 写 | session(会话) |  |  | shopId, id, name, isDefault, rules | data |
| `BrandMall_shopCreate` | POST | `/enterprise/brand-mall/shop/create` | 新建SHOP | 写 | session(会话) |  |  | name, shopCode, logo, slogan, servicePhone, themeColor | data |
| `BrandMall_shopDetail` | GET | `/enterprise/brand-mall/shop/detail` | SHOP详情 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_shops` | GET | `/enterprise/brand-mall/shop/list` | SHOPS | 读 | session(会话) |  |  |  | data |
| `BrandMall_shopRemove` | POST | `/enterprise/brand-mall/shop/remove` | 删除SHOP | 写 | session(会话) |  |  | shopId | data |
| `BrandMall_shopStatus` | POST | `/enterprise/brand-mall/shop/status` | SHOP状态 | 写 | session(会话) |  |  | shopId, status | data |
| `BrandMall_shopTrade` | POST | `/enterprise/brand-mall/shop/trade` | SHOPTRADE | 写 | session(会话) |  |  | shopId, trade | data |
| `BrandMall_shopUpdate` | POST | `/enterprise/brand-mall/shop/update` | 修改SHOP | 写 | session(会话) |  |  | name, logo, slogan, servicePhone, themeColor, shopId | data |
| `BrandMall_statOverview` | GET | `/enterprise/brand-mall/stat/overview` | 统计概览 | 读 | session(会话) |  | shopId |  | data |
| `BrandMall_statTopProducts` | GET | `/enterprise/brand-mall/stat/top-products` | 统计TOP商品 | 读 | session(会话) |  | shopId, limit |  | data |
| `BrandMall_statTrend` | GET | `/enterprise/brand-mall/stat/trend` | 统计趋势 | 读 | session(会话) |  | shopId, days |  | data |

返回 `INDEX.md`。

