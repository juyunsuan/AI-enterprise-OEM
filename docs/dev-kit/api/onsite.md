<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：onsite（`onsite`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Onsite_overview` | GET | `/enterprise/onsite/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Onsite_shops` | GET | `/enterprise/onsite/shops` | SHOPS | 读 | session(会话) |  |  |  | data |
| `Onsite_createShop` | POST | `/enterprise/onsite/shops` | 新建SHOP | 写 | session(会话) |  |  | name, slogan, logo, servicePhone, shareImage | data |
| `Onsite_shopDetail` | GET | `/enterprise/onsite/shops/:id` | SHOP详情 | 读 | session(会话) | id |  |  | data |
| `Onsite_updateShop` | PUT | `/enterprise/onsite/shops/:id` | 修改SHOP | 写 | session(会话) | id |  | name, slogan, logo, servicePhone, shareImage | data |
| `Onsite_activities` | GET | `/enterprise/onsite/shops/:id/activities` | ACTIVITIES | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_saveActivity` | POST | `/enterprise/onsite/shops/:id/activities` | 保存ACTIVITY | 写 | session(会话) | id |  | id, name, rewardType, rewardCents, couponId, startAt, endAt | data |
| `Onsite_activityRecords` | GET | `/enterprise/onsite/shops/:id/activities/:activityId/records` | ACTIVITY记录 | 读 | session(会话) | id, activityId | page, pageSize, keyword, status |  | data |
| `Onsite_setActivityStatus` | POST | `/enterprise/onsite/shops/:id/activities/:activityId/status` | 设置ACTIVITY状态 | 写 | session(会话) | id, activityId |  | status | data |
| `Onsite_agents` | GET | `/enterprise/onsite/shops/:id/agents` | 代理人 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_saveAgent` | POST | `/enterprise/onsite/shops/:id/agents` | 保存代理人 | 写 | session(会话) | id |  | id, agentType, name, phone, provinceCode, cityCode, areaCode, commissionRate, parentId | data |
| `Onsite_setAgentStatus` | POST | `/enterprise/onsite/shops/:id/agents/:agentId/status` | 设置代理人状态 | 写 | session(会话) | id, agentId |  | status | data |
| `Onsite_alerts` | GET | `/enterprise/onsite/shops/:id/alerts` | 库存预警 | 读 | session(会话) | id | page, pageSize, status |  | data |
| `Onsite_alertConfig` | GET | `/enterprise/onsite/shops/:id/alerts/config` | 预警CONFIG | 读 | session(会话) | id |  |  | data |
| `Onsite_saveAlertConfig` | POST | `/enterprise/onsite/shops/:id/alerts/config` | 保存预警CONFIG | 写 | session(会话) | id |  | enabled, helpPhones, notifyOwner, dedupeMinutes | data |
| `Onsite_handleAlert` | POST | `/enterprise/onsite/shops/:id/alerts/handle` | HANDLE预警 | 写 | session(会话) | id |  | id, status, remark | data |
| `Onsite_raiseAlert` | POST | `/enterprise/onsite/shops/:id/alerts/raise` | RAISE预警 | 写 | session(会话) | id |  | staffId, orderId, lng, lat, address, content, audioUrl | data |
| `Onsite_appeals` | GET | `/enterprise/onsite/shops/:id/appeals` | APPEALS | 读 | session(会话) | id | page, pageSize, status |  | data |
| `Onsite_handleAppeal` | POST | `/enterprise/onsite/shops/:id/appeals/handle` | HANDLEAPPEAL | 写 | session(会话) | id |  | id, accepted, reply | data |
| `Onsite_articles` | GET | `/enterprise/onsite/shops/:id/articles` | ARTICLES | 读 | session(会话) | id | page, pageSize, status, keyword |  | data |
| `Onsite_saveArticle` | POST | `/enterprise/onsite/shops/:id/articles` | 保存ARTICLE | 写 | session(会话) | id |  | id, title, summary, content, cover, formEnabled, formPurpose, fieldIds, sortOrder, status | data |
| `Onsite_removeArticle` | POST | `/enterprise/onsite/shops/:id/articles/remove` | 删除ARTICLE | 写 | session(会话) | id |  | id | data |
| `Onsite_banners` | GET | `/enterprise/onsite/shops/:id/banners` | BANNERS | 读 | session(会话) | id | position |  | data |
| `Onsite_saveBanner` | POST | `/enterprise/onsite/shops/:id/banners` | 保存BANNER | 写 | session(会话) | id |  | id, position, title, image, link, sortOrder, enabled | data |
| `Onsite_removeBanner` | POST | `/enterprise/onsite/shops/:id/banners/remove` | 删除BANNER | 写 | session(会话) | id |  | id | data |
| `Onsite_categories` | GET | `/enterprise/onsite/shops/:id/categories` | 类目 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveCategory` | POST | `/enterprise/onsite/shops/:id/categories` | 保存类目 | 写 | session(会话) | id |  | id, parentId, name, image, sortOrder, enabled | data |
| `Onsite_removeCategory` | POST | `/enterprise/onsite/shops/:id/categories/remove` | 删除类目 | 写 | session(会话) | id |  | id | data |
| `Onsite_channelCategories` | GET | `/enterprise/onsite/shops/:id/channel-categories` | 渠道类目 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveChannelCategory` | POST | `/enterprise/onsite/shops/:id/channel-categories` | 保存渠道类目 | 写 | session(会话) | id |  | id, name, sortOrder | data |
| `Onsite_removeChannelCategory` | POST | `/enterprise/onsite/shops/:id/channel-categories/:categoryId/remove` | 删除渠道类目 | 写 | session(会话) | id, categoryId |  |  | data |
| `Onsite_channels` | GET | `/enterprise/onsite/shops/:id/channels` | 渠道 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_saveChannel` | POST | `/enterprise/onsite/shops/:id/channels` | 保存渠道 | 写 | session(会话) | id |  | id, categoryId, name, contact, phone, rate | data |
| `Onsite_setChannelStatus` | POST | `/enterprise/onsite/shops/:id/channels/:channelId/status` | 设置渠道状态 | 写 | session(会话) | id, channelId |  | status | data |
| `Onsite_cities` | GET | `/enterprise/onsite/shops/:id/cities` | CITIES | 读 | session(会话) | id | keyword |  | data |
| `Onsite_saveCity` | POST | `/enterprise/onsite/shops/:id/cities` | 保存CITY | 写 | session(会话) | id |  | id, parentId, name, level, provinceCode, cityCode, areaCode, lng, lat, enabled, sortOrder | data |
| `Onsite_removeCity` | POST | `/enterprise/onsite/shops/:id/cities/remove` | 删除CITY | 写 | session(会话) | id |  | id | data |
| `Onsite_closeShop` | POST | `/enterprise/onsite/shops/:id/close` | 关闭SHOP | 写 | session(会话) | id |  | reason | data |
| `Onsite_coupons` | GET | `/enterprise/onsite/shops/:id/coupons` | 优惠券 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_saveCoupon` | POST | `/enterprise/onsite/shops/:id/coupons` | 保存优惠券 | 写 | session(会话) | id |  | id, name, type, thresholdCents, discountCents, discountRate, newUserOnly, totalQuantity, perLimit, scope, scopeTargets, validStartAt, validEndAt | data |
| `Onsite_issueCoupon` | POST | `/enterprise/onsite/shops/:id/coupons/:couponId/issue` | 发放优惠券 | 写 | session(会话) | id, couponId |  | customerIds | data |
| `Onsite_removeCoupon` | POST | `/enterprise/onsite/shops/:id/coupons/:couponId/remove` | 删除优惠券 | 写 | session(会话) | id, couponId |  |  | data |
| `Onsite_setCouponStatus` | POST | `/enterprise/onsite/shops/:id/coupons/:couponId/status` | 设置优惠券状态 | 写 | session(会话) | id, couponId |  | status | data |
| `Onsite_couponTickets` | GET | `/enterprise/onsite/shops/:id/coupons/:couponId/tickets` | 优惠券工单 | 读 | session(会话) | id, couponId | page, pageSize, keyword, status |  | data |
| `Onsite_customers` | GET | `/enterprise/onsite/shops/:id/customers` | 客户 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_setCustomerStatus` | POST | `/enterprise/onsite/shops/:id/customers/status` | 设置客户状态 | 写 | session(会话) | id |  | id, status, remark | data |
| `Onsite_distributors` | GET | `/enterprise/onsite/shops/:id/distributors` | DISTRIBUTORS | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_reviewDistributor` | POST | `/enterprise/onsite/shops/:id/distributors/review` | 审核DISTRIBUTOR | 写 | session(会话) | id |  | profileId, approve, levelName, rate, rejectReason | data |
| `Onsite_feeRules` | GET | `/enterprise/onsite/shops/:id/fee-rules` | FEE规则 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveFeeRule` | POST | `/enterprise/onsite/shops/:id/fee-rules` | 保存FEE规则 | 写 | session(会话) | id |  | id, cityId, freeKilometers, startFeeCents, startKilometers, pricePerKilometerCents, virtualExtraKilometers, publicTransitEnabled, minFeeCents, enabled | data |
| `Onsite_estimateFee` | POST | `/enterprise/onsite/shops/:id/fee-rules/estimate` | 预估FEE | 写 | session(会话) | id |  | fromLng, fromLat, toLng, toLat, cityId, serviceId, staffId | data |
| `Onsite_removeFeeRule` | POST | `/enterprise/onsite/shops/:id/fee-rules/remove` | 删除FEE规则 | 写 | session(会话) | id |  | id | data |
| `Onsite_feedbacks` | GET | `/enterprise/onsite/shops/:id/feedbacks` | FEEDBACKS | 读 | session(会话) | id | page, pageSize, status |  | data |
| `Onsite_handleFeedback` | POST | `/enterprise/onsite/shops/:id/feedbacks/handle` | HANDLEFEEDBACK | 写 | session(会话) | id |  | id, reply, status | data |
| `Onsite_adjustBalance` | POST | `/enterprise/onsite/shops/:id/finance/balance-adjust` | ADJUST余额 | 写 | session(会话) | id |  | customerId, amountCents, remark | data |
| `Onsite_balanceCards` | GET | `/enterprise/onsite/shops/:id/finance/balance-cards` | 图卡余额 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveBalanceCard` | POST | `/enterprise/onsite/shops/:id/finance/balance-cards` | 保存余额图卡 | 写 | session(会话) | id |  | id, name, faceCents, giftCents, priceCents, validityDays, enabled, sortOrder | data |
| `Onsite_removeBalanceCard` | POST | `/enterprise/onsite/shops/:id/finance/balance-cards/:cardId/remove` | 删除余额图卡 | 写 | session(会话) | id, cardId |  |  | data |
| `Onsite_balanceFlows` | GET | `/enterprise/onsite/shops/:id/finance/balance-flows` | 余额流程 | 读 | session(会话) | id | page, pageSize, customerId |  | data |
| `Onsite_commissionRules` | GET | `/enterprise/onsite/shops/:id/finance/commission-rules` | COMMISSION规则 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveCommissionRule` | POST | `/enterprise/onsite/shops/:id/finance/commission-rules` | 保存COMMISSION规则 | 写 | session(会话) | id |  | role, totalRate, staffBorneRate, ownerBorneRate, platformBorneRate, enabled | data |
| `Onsite_orderCommissions` | GET | `/enterprise/onsite/shops/:id/finance/commissions` | 订单COMMISSIONS | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_incomeOverview` | GET | `/enterprise/onsite/shops/:id/finance/overview` | INCOME概览 | 读 | session(会话) | id |  |  | data |
| `Onsite_adjustPoints` | POST | `/enterprise/onsite/shops/:id/finance/points-adjust` | 积分ADJUST | 写 | session(会话) | id |  | customerId, points, remark | data |
| `Onsite_rechargeOrders` | GET | `/enterprise/onsite/shops/:id/finance/recharges` | RECHARGE订单 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_confirmRecharge` | POST | `/enterprise/onsite/shops/:id/finance/recharges/:rechargeId/confirm` | 确认RECHARGE | 写 | session(会话) | id, rechargeId |  | remark | data |
| `Onsite_settlements` | GET | `/enterprise/onsite/shops/:id/finance/settlements` | 结算单 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_createSettlement` | POST | `/enterprise/onsite/shops/:id/finance/settlements` | 新建SETTLEMENT | 写 | session(会话) | id |  | staffId, periodStart, periodEnd | data |
| `Onsite_paySettlement` | POST | `/enterprise/onsite/shops/:id/finance/settlements/:settlementId/pay` | 支付SETTLEMENT | 写 | session(会话) | id, settlementId |  | remark | data |
| `Onsite_withdrawals` | GET | `/enterprise/onsite/shops/:id/finance/withdrawals` | WITHDRAWALS | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_handleWithdrawal` | POST | `/enterprise/onsite/shops/:id/finance/withdrawals/:withdrawalId/handle` | HANDLEWITHDRAWAL | 写 | session(会话) | id, withdrawalId |  | action, reason, transactionId | data |
| `Onsite_formFields` | GET | `/enterprise/onsite/shops/:id/form-fields` | 表单字段 | 读 | session(会话) | id |  |  | data |
| `Onsite_saveFormField` | POST | `/enterprise/onsite/shops/:id/form-fields` | 保存表单字段 | 写 | session(会话) | id |  | id, name, fieldType, options, placeholder, required, sortOrder, enabled | data |
| `Onsite_removeFormField` | POST | `/enterprise/onsite/shops/:id/form-fields/remove` | 删除表单字段 | 写 | session(会话) | id |  | id | data |
| `Onsite_invites` | GET | `/enterprise/onsite/shops/:id/invites` | 邀请 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_labels` | GET | `/enterprise/onsite/shops/:id/labels` | 标签 | 读 | session(会话) | id | type |  | data |
| `Onsite_saveLabel` | POST | `/enterprise/onsite/shops/:id/labels` | 保存标签 | 写 | session(会话) | id |  | id, name, type, sortOrder, enabled | data |
| `Onsite_removeLabel` | POST | `/enterprise/onsite/shops/:id/labels/remove` | 删除标签 | 写 | session(会话) | id |  | id | data |
| `Onsite_orders` | GET | `/enterprise/onsite/shops/:id/orders` | 订单 | 读 | session(会话) | id | page, pageSize, status, keyword, staffId |  | data |
| `Onsite_orderDetail` | GET | `/enterprise/onsite/shops/:id/orders/:orderId` | 订单详情 | 读 | session(会话) | id, orderId |  |  | data |
| `Onsite_orderAddon` | POST | `/enterprise/onsite/shops/:id/orders/addon` | 订单ADDON | 写 | session(会话) | id |  | orderId, orderItemId, quantity | data |
| `Onsite_advanceOrder` | POST | `/enterprise/onsite/shops/:id/orders/advance` | 推进订单 | 写 | session(会话) | id |  | orderId, action, content, image, lng, lat, address | data |
| `Onsite_cancelOrder` | POST | `/enterprise/onsite/shops/:id/orders/cancel` | 取消订单 | 写 | session(会话) | id |  | orderId, reason | data |
| `Onsite_createOrder` | POST | `/enterprise/onsite/shops/:id/orders/create` | 新建订单 | 写 | session(会话) | id |  | staffId, addressId, startAt, items, customerRemark, customerPhone, customerId, couponTicketId, useBalance | data |
| `Onsite_dispatchOrder` | POST | `/enterprise/onsite/shops/:id/orders/dispatch` | 派发订单 | 写 | session(会话) | id |  | orderId, staffId | data |
| `Onsite_orderPayOffline` | POST | `/enterprise/onsite/shops/:id/orders/pay-offline` | 支付订单OFFLINE | 写 | session(会话) | id |  | orderId, remark | data |
| `Onsite_orderPayParams` | POST | `/enterprise/onsite/shops/:id/orders/pay-params` | 支付订单参数 | 写 | session(会话) | id |  | orderId | data |
| `Onsite_orderRemark` | POST | `/enterprise/onsite/shops/:id/orders/remark` | 订单REMARK | 写 | session(会话) | id |  | orderId, note | data |
| `Onsite_orderSign` | POST | `/enterprise/onsite/shops/:id/orders/sign` | 订单签约 | 写 | session(会话) | id |  | orderId, image | data |
| `Onsite_partners` | GET | `/enterprise/onsite/shops/:id/partners` | PARTNERS | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_savePartner` | POST | `/enterprise/onsite/shops/:id/partners` | 保存PARTNER | 写 | session(会话) | id |  | id, staffId, name, rate | data |
| `Onsite_poster` | GET | `/enterprise/onsite/shops/:id/poster` | POSTER | 读 | session(会话) | id | kind, agentId |  | data |
| `Onsite_qrcode` | POST | `/enterprise/onsite/shops/:id/qrcode` | QRCODE | 写 | session(会话) | id |  | page | data |
| `Onsite_refunds` | GET | `/enterprise/onsite/shops/:id/refunds` | REFUNDS | 读 | session(会话) | id | page, pageSize, status |  | data |
| `Onsite_refundDetail` | GET | `/enterprise/onsite/shops/:id/refunds/:refundId` | REFUND详情 | 读 | session(会话) | id, refundId |  |  | data |
| `Onsite_agreeRefund` | POST | `/enterprise/onsite/shops/:id/refunds/agree` | AGREEREFUND | 写 | session(会话) | id |  | refundId, remark, offline | data |
| `Onsite_applyRefund` | POST | `/enterprise/onsite/shops/:id/refunds/apply` | 申请REFUND | 写 | session(会话) | id |  | orderId, reason, description, evidenceImages, items | data |
| `Onsite_refundQuote` | POST | `/enterprise/onsite/shops/:id/refunds/quote` | 报价REFUND | 写 | session(会话) | id |  | orderId | data |
| `Onsite_rejectRefund` | POST | `/enterprise/onsite/shops/:id/refunds/reject` | 驳回REFUND | 写 | session(会话) | id |  | refundId, remark | data |
| `Onsite_relations` | GET | `/enterprise/onsite/shops/:id/relations` | 关联 | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_bindRelation` | POST | `/enterprise/onsite/shops/:id/relations` | 绑定关联 | 写 | session(会话) | id |  | customerId, pid, channelId, salesmanId, agentId, expiresAt | data |
| `Onsite_reviews` | GET | `/enterprise/onsite/shops/:id/reviews` | 审核 | 读 | session(会话) | id | page, pageSize, status, staffId, rating |  | data |
| `Onsite_replyReview` | POST | `/enterprise/onsite/shops/:id/reviews/reply` | 回复审核 | 写 | session(会话) | id |  | id, reply | data |
| `Onsite_setReviewStatus` | POST | `/enterprise/onsite/shops/:id/reviews/status` | 设置审核状态 | 写 | session(会话) | id |  | id, status | data |
| `Onsite_salesmen` | GET | `/enterprise/onsite/shops/:id/salesmen` | SALESMEN | 读 | session(会话) | id | page, pageSize, keyword, status |  | data |
| `Onsite_saveSalesman` | POST | `/enterprise/onsite/shops/:id/salesmen` | 保存SALESMAN | 写 | session(会话) | id |  | id, agentId, name, phone, area, rate | data |
| `Onsite_setSalesmanStatus` | POST | `/enterprise/onsite/shops/:id/salesmen/:salesmanId/status` | 设置SALESMAN状态 | 写 | session(会话) | id, salesmanId |  | status | data |
| `Onsite_scheduleDays` | GET | `/enterprise/onsite/shops/:id/schedule/days` | 定时任务DAYS | 读 | session(会话) | id | staffId, serviceId |  | data |
| `Onsite_timeline` | GET | `/enterprise/onsite/shops/:id/schedule/timeline` | TIMELINE | 读 | session(会话) | id | day, staffId, serviceId |  | data |
| `Onsite_serviceConfig` | GET | `/enterprise/onsite/shops/:id/service-config` | 服务CONFIG | 读 | session(会话) | id |  |  | data |
| `Onsite_saveServiceConfig` | POST | `/enterprise/onsite/shops/:id/service-config` | 保存服务CONFIG | 写 | session(会话) | id |  | deskEnabled, deskSiteKey, scrmEnabled, scrmCodeId | data |
| `Onsite_serviceOptions` | GET | `/enterprise/onsite/shops/:id/service-options` | 服务选项 | 读 | session(会话) | id |  |  | data |
| `Onsite_services` | GET | `/enterprise/onsite/shops/:id/services` | 服务 | 读 | session(会话) | id | page, pageSize, status, keyword, categoryId, staffId |  | data |
| `Onsite_saveService` | POST | `/enterprise/onsite/shops/:id/services` | 保存服务 | 写 | session(会话) | id |  | id, title, subtitle, coverImage, images, detail, priceCents, marketPriceCents, durationMinutes, maxDurationMinutes, addonEnabled, addonUnitMinutes, addonRate, materialFeeCents, travelFeeMode, customTravelFeeCents, labelIds, categoryIds, doorEnabled, storeEnabled, status, sortOrder, salesVirtual | data |
| `Onsite_serviceDetail` | GET | `/enterprise/onsite/shops/:id/services/:serviceId` | 服务详情 | 读 | session(会话) | id, serviceId |  |  | data |
| `Onsite_staffPrices` | GET | `/enterprise/onsite/shops/:id/services/:serviceId/prices` | 职员价格 | 读 | session(会话) | id, serviceId |  |  | data |
| `Onsite_saveStaffPrices` | POST | `/enterprise/onsite/shops/:id/services/:serviceId/prices` | 保存职员价格 | 写 | session(会话) | id, serviceId |  | rows | data |
| `Onsite_copyService` | POST | `/enterprise/onsite/shops/:id/services/copy` | 复制服务 | 写 | session(会话) | id |  | id | data |
| `Onsite_removeService` | POST | `/enterprise/onsite/shops/:id/services/remove` | 删除服务 | 写 | session(会话) | id |  | id | data |
| `Onsite_setServiceStatus` | POST | `/enterprise/onsite/shops/:id/services/status` | 设置服务状态 | 写 | session(会话) | id |  | ids, status | data |
| `Onsite_shields` | GET | `/enterprise/onsite/shops/:id/shields` | SHIELDS | 读 | session(会话) | id | staffId |  | data |
| `Onsite_removeShield` | POST | `/enterprise/onsite/shops/:id/shields/remove` | 删除SHIELD | 写 | session(会话) | id |  | id | data |
| `Onsite_staff` | GET | `/enterprise/onsite/shops/:id/staff` | 职员 | 读 | session(会话) | id | page, pageSize, status, keyword, levelId, cityId |  | data |
| `Onsite_saveStaff` | POST | `/enterprise/onsite/shops/:id/staff` | 保存职员 | 写 | session(会话) | id |  | id, name, gender, phone, avatar, idCard, licenseImages, workYears, intro, images, video, levelId, cityId, serviceCity, lng, lat, address, serviceStartAt, serviceEndAt, crossDay, dailyOrderLimit, selfPriceEnabled, carFeeEnabled, carFeeCents, recommendTop, sortTop, locationEnabled, orderCountVirtual, status | data |
| `Onsite_staffLevels` | GET | `/enterprise/onsite/shops/:id/staff-levels` | 职员LEVELS | 读 | session(会话) | id |  |  | data |
| `Onsite_saveStaffLevel` | POST | `/enterprise/onsite/shops/:id/staff-levels` | 保存职员LEVEL | 写 | session(会话) | id |  | id, name, rank, commissionRate, addonRate, minPerformanceCents, onlineHoursRequired, points, agreementArticleId, sortOrder, enabled | data |
| `Onsite_removeStaffLevel` | POST | `/enterprise/onsite/shops/:id/staff-levels/remove` | 删除职员LEVEL | 写 | session(会话) | id |  | id | data |
| `Onsite_staffDetail` | GET | `/enterprise/onsite/shops/:id/staff/:staffId` | 职员详情 | 读 | session(会话) | id, staffId |  |  | data |
| `Onsite_staffRest` | GET | `/enterprise/onsite/shops/:id/staff/:staffId/rest` | 职员REST | 读 | session(会话) | id, staffId | day |  | data |
| `Onsite_saveStaffRest` | POST | `/enterprise/onsite/shops/:id/staff/:staffId/rest` | 保存职员REST | 写 | session(会话) | id, staffId |  | id, startAt, endAt, allDay, reason | data |
| `Onsite_removeStaffRest` | POST | `/enterprise/onsite/shops/:id/staff/:staffId/rest/remove` | 删除职员REST | 写 | session(会话) | id, staffId |  | id | data |
| `Onsite_staffWorkLogs` | GET | `/enterprise/onsite/shops/:id/staff/:staffId/work-logs` | 职员工日志 | 读 | session(会话) | id, staffId | days |  | data |
| `Onsite_removeStaff` | POST | `/enterprise/onsite/shops/:id/staff/remove` | 删除职员 | 写 | session(会话) | id |  | id | data |
| `Onsite_reviewStaffProfile` | POST | `/enterprise/onsite/shops/:id/staff/review-profile` | 审核职员档案 | 写 | session(会话) | id |  | id, approved, remark | data |
| `Onsite_setStaffStatus` | POST | `/enterprise/onsite/shops/:id/staff/status` | 设置职员状态 | 写 | session(会话) | id |  | id, status, remark | data |
| `Onsite_setStatus` | POST | `/enterprise/onsite/shops/:id/status` | 设置状态 | 写 | session(会话) | id |  | status, reason | data |
| `Onsite_submissions` | GET | `/enterprise/onsite/shops/:id/submissions` | 提交 | 读 | session(会话) | id | page, pageSize, status, articleId |  | data |
| `Onsite_submissionDetail` | GET | `/enterprise/onsite/shops/:id/submissions/:submissionId` | 提交详情 | 读 | session(会话) | id, submissionId |  |  | data |
| `Onsite_auditSubmission` | POST | `/enterprise/onsite/shops/:id/submissions/audit` | 审核提交 | 写 | session(会话) | id |  | id, approved, remark, createStaff | data |
| `Onsite_saveTheme` | PUT | `/enterprise/onsite/shops/:id/theme` | 保存THEME | 写 | session(会话) | id |  | themeColor, navigationTitle, tabBarLabels | data |
| `Onsite_saveTrade` | PUT | `/enterprise/onsite/shops/:id/trade` | 保存TRADE | 写 | session(会话) | id |  | autoCancelMinutes, timeUnitMinutes, bufferMinutes, maxDays, allowCrossDay, bookingLeadMinutes, dispatchMode, canTxHours, travelFeeEnabled, travelFeeFallbackCents, reviewEnabled, reviewAuditFirst, alertEnabled, alertHelpPhones, alertNotifyOwner, alertDedupeMinutes, deskSiteKey, deskEnabled, scrmCodeId, scrmEnabled | data |
| `Onsite_wechat` | GET | `/enterprise/onsite/shops/:id/wechat` | WECHAT | 读 | session(会话) | id |  |  | data |
| `Onsite_saveWechat` | PUT | `/enterprise/onsite/shops/:id/wechat` | 保存WECHAT | 写 | session(会话) | id |  | appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Onsite_testWechat` | POST | `/enterprise/onsite/shops/:id/wechat/test` | 测试WECHAT | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

