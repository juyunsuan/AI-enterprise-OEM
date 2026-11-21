<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：marketplace（`marketplace`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Market_afterSaleArbitrate` | POST | `/enterprise/marketplace/aftersale/arbitrate` | AFTERSALEARBITRATE | 写 | session(会话) |  |  | id, action, platformNote | data |
| `Market_afterSaleDetail` | GET | `/enterprise/marketplace/aftersale/detail` | AFTERSALE详情 | 读 | session(会话) |  | id |  | data |
| `Market_afterSales` | GET | `/enterprise/marketplace/aftersale/list` | AFTERSALES | 读 | session(会话) |  | page, pageSize, status, keyword |  | data |
| `Market_appDetail` | GET | `/enterprise/marketplace/app/detail` | 申请详情 | 读 | session(会话) |  |  |  | data |
| `Market_payTest` | POST | `/enterprise/marketplace/app/pay-test` | 支付测试 | 写 | session(会话) |  |  |  | data |
| `Market_qrcodeGenerate` | POST | `/enterprise/marketplace/app/qrcode` | 生成QRCODE | 写 | session(会话) |  |  | path | data |
| `Market_appSave` | POST | `/enterprise/marketplace/app/save` | 保存申请 | 写 | session(会话) |  |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Market_appTest` | POST | `/enterprise/marketplace/app/test` | 测试申请 | 写 | session(会话) |  |  |  | data |
| `Market_categories` | GET | `/enterprise/marketplace/category/list` | 类目 | 读 | session(会话) |  |  |  | data |
| `Market_categoryRemove` | POST | `/enterprise/marketplace/category/remove` | 删除类目 | 写 | session(会话) |  |  | id | data |
| `Market_categorySave` | POST | `/enterprise/marketplace/category/save` | 保存类目 | 写 | session(会话) |  |  | id, parentId, name, icon, sortOrder, status | data |
| `Market_commissionRules` | GET | `/enterprise/marketplace/commission/list` | COMMISSION规则 | 读 | session(会话) |  |  |  | data |
| `Market_commissionRuleSave` | POST | `/enterprise/marketplace/commission/save` | 保存COMMISSION规则 | 写 | session(会话) |  |  | id, scopeType, scopeId, rate, remark | data |
| `Market_commissionRuleStatus` | POST | `/enterprise/marketplace/commission/status` | COMMISSION规则状态 | 写 | session(会话) |  |  | id, status | data |
| `Market_coupons` | GET | `/enterprise/marketplace/coupon/list` | 优惠券 | 读 | session(会话) |  | page, pageSize, status, keyword |  | data |
| `Market_couponSave` | POST | `/enterprise/marketplace/coupon/save` | 优惠券保存 | 写 | session(会话) |  |  | id, name, type, value, threshold, totalCount, perLimit, validType, startAt, endAt, validDays, scope, scopeIds | data |
| `Market_couponStatus` | POST | `/enterprise/marketplace/coupon/status` | 优惠券状态 | 写 | session(会话) |  |  | id, status | data |
| `Market_create` | POST | `/enterprise/marketplace/create` | 新建 | 写 | session(会话) |  |  | name, logo, description, themeColor | data |
| `Market_detail` | GET | `/enterprise/marketplace/detail` | 详情 | 读 | session(会话) |  |  |  | data |
| `Market_diyDetail` | GET | `/enterprise/marketplace/diy/detail` | DIY详情 | 读 | session(会话) |  | id |  | data |
| `Market_diyList` | GET | `/enterprise/marketplace/diy/list` | DIY列表 | 读 | session(会话) |  | shopId, type |  | data |
| `Market_diyPublish` | POST | `/enterprise/marketplace/diy/publish` | 发布DIY | 写 | session(会话) |  |  | id | data |
| `Market_diyRemove` | POST | `/enterprise/marketplace/diy/remove` | 删除DIY | 写 | session(会话) |  |  | id | data |
| `Market_diySave` | POST | `/enterprise/marketplace/diy/save` | 保存DIY | 写 | session(会话) |  |  | id, shopId, name, type, components, styles, coverImage, isDefault, sortOrder | data |
| `Market_diyWidgets` | GET | `/enterprise/marketplace/diy/widgets` | DIYWIDGETS | 读 | session(会话) |  |  |  | data |
| `Market_merchantAudit` | POST | `/enterprise/marketplace/merchant/audit` | 审核MERCHANT | 写 | session(会话) |  |  | id, action, note, commissionRate | data |
| `Market_merchantDetail` | GET | `/enterprise/marketplace/merchant/detail` | MERCHANT详情 | 读 | session(会话) |  | id |  | data |
| `Market_merchantFinance` | GET | `/enterprise/marketplace/merchant/finance` | MERCHANTFINANCE | 读 | session(会话) |  | merchantId |  | data |
| `Market_merchants` | GET | `/enterprise/marketplace/merchant/list` | MERCHANTS | 读 | session(会话) |  | page, pageSize, keyword, auditStatus, status |  | data |
| `Market_merchantStatus` | POST | `/enterprise/marketplace/merchant/status` | MERCHANT状态 | 写 | session(会话) |  |  | id, status | data |
| `Market_overview` | GET | `/enterprise/marketplace/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Market_payRecords` | GET | `/enterprise/marketplace/pay/list` | 支付记录 | 读 | session(会话) |  | page, pageSize, merchantId, shopId, status, keyword |  | data |
| `Market_productAudit` | POST | `/enterprise/marketplace/product/audit` | 审核商品 | 写 | session(会话) |  |  | id, approve, reason | data |
| `Market_productAudits` | GET | `/enterprise/marketplace/product/audit/list` | 商品审核 | 读 | session(会话) |  | page, pageSize, auditStatus, keyword |  | data |
| `Market_products` | GET | `/enterprise/marketplace/product/list` | 商品 | 读 | session(会话) |  | page, pageSize, keyword, status, shopId |  | data |
| `Market_refundDetail` | GET | `/enterprise/marketplace/refund/detail` | REFUND详情 | 读 | session(会话) |  | id |  | data |
| `Market_refunds` | GET | `/enterprise/marketplace/refund/list` | REFUNDS | 读 | session(会话) |  | page, pageSize, status, keyword |  | data |
| `Market_save` | POST | `/enterprise/marketplace/save` | 保存 | 写 | session(会话) |  |  | name, logo, description, themeColor, closeMinutes, settleCycleDays | data |
| `Market_scrmReplay` | POST | `/enterprise/marketplace/scrm/replay` | 企微重投 | 写 | session(会话) |  |  | ids | data |
| `Market_scrmRetry` | POST | `/enterprise/marketplace/scrm/retry` | 企微重试 | 写 | session(会话) |  |  |  | data |
| `Market_scrm` | GET | `/enterprise/marketplace/scrm/state` | 企微 | 读 | session(会话) |  |  |  | data |
| `Market_scrmToggle` | POST | `/enterprise/marketplace/scrm/toggle` | 企微启停 | 写 | session(会话) |  |  | enabled | data |
| `Market_settlementDetail` | GET | `/enterprise/marketplace/settlement/detail` | SETTLEMENT详情 | 读 | session(会话) |  | id |  | data |
| `Market_settlementGenerate` | POST | `/enterprise/marketplace/settlement/generate` | 生成SETTLEMENT | 写 | session(会话) |  |  | merchantId, shopId, periodStart, periodEnd | data |
| `Market_settlements` | GET | `/enterprise/marketplace/settlement/list` | 结算单 | 读 | session(会话) |  | page, pageSize, merchantId, shopId, status, keyword |  | data |
| `Market_settlementPaid` | POST | `/enterprise/marketplace/settlement/paid` | SETTLEMENTPAID | 写 | session(会话) |  |  | id, voucher | data |
| `Market_shops` | GET | `/enterprise/marketplace/shop/list` | SHOPS | 读 | session(会话) |  | page, pageSize, keyword, status |  | data |
| `Market_shopStatus` | POST | `/enterprise/marketplace/shop/status` | SHOP状态 | 写 | session(会话) |  |  | id, status, reason | data |
| `Market_status` | POST | `/enterprise/marketplace/status` | 状态 | 写 | session(会话) |  |  | status | data |
| `Market_withdrawalAudit` | POST | `/enterprise/marketplace/withdrawal/audit` | 审核WITHDRAWAL | 写 | session(会话) |  |  | id, action, auditNote, fee | data |
| `Market_withdrawals` | GET | `/enterprise/marketplace/withdrawal/list` | WITHDRAWALS | 读 | session(会话) |  | page, pageSize, status, merchantId, keyword |  | data |
| `Market_withdrawalPaid` | POST | `/enterprise/marketplace/withdrawal/paid` | WITHDRAWALPAID | 写 | session(会话) |  |  | id, voucher | data |

返回 `INDEX.md`。

