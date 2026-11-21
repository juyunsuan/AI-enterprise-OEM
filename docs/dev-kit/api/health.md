<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：服务健康检查（`health`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Health_aftersaleDetail` | GET | `/enterprise/health/aftersale/detail` | AFTERSALE详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_aftersaleHandle` | POST | `/enterprise/health/aftersale/handle` | AFTERSALEHANDLE | 写 | session(会话) |  |  | shopId, id, action, reply, refundAmountCents | data |
| `Health_aftersales` | GET | `/enterprise/health/aftersale/list` | AFTERSALES | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, aftersaleStatus, kind |  | data |
| `Health_agreementList` | GET | `/enterprise/health/agreement/list` | AGREEMENT列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_agreementSave` | POST | `/enterprise/health/agreement/save` | 保存AGREEMENT | 写 | session(会话) |  |  | shopId, key, title, content | data |
| `Health_aiBindingSave` | POST | `/enterprise/health/ai/binding` | 保存AI绑定 | 写 | session(会话) |  |  | shopId, practitionerId, agentId | data |
| `Health_aiEnabledSave` | POST | `/enterprise/health/ai/enabled` | 保存AIENABLED | 写 | session(会话) |  |  | shopId, enabled | data |
| `Health_aiStatus` | GET | `/enterprise/health/ai/status` | AI状态 | 读 | session(会话) |  | shopId |  | data |
| `Health_alertRules` | GET | `/enterprise/health/alert-rule/list` | 预警规则 | 读 | session(会话) |  | shopId |  | data |
| `Health_alertRuleRemove` | POST | `/enterprise/health/alert-rule/remove` | 删除预警规则 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_alertRuleSave` | POST | `/enterprise/health/alert-rule/save` | 保存预警规则 | 写 | session(会话) |  |  | shopId, id, name, metricId, ruleType, lowThreshold, highThreshold, deltaPercent, consecutiveTimes, periodDays, notifyCustomer, notifyOwner, notifyShop, severity, status | data |
| `Health_alertHandle` | POST | `/enterprise/health/alert/handle` | 预警HANDLE | 写 | session(会话) |  |  | shopId, id, status, note | data |
| `Health_alerts` | GET | `/enterprise/health/alert/list` | 库存预警 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, ruleId, alertStatus |  | data |
| `Health_answerAudit` | POST | `/enterprise/health/answer/audit` | 审核ANSWER | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_answerRemove` | POST | `/enterprise/health/answer/remove` | 删除ANSWER | 写 | session(会话) |  |  | shopId, id | data |
| `Health_applications` | GET | `/enterprise/health/application/list` | 申请 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, kind |  | data |
| `Health_articleCategories` | GET | `/enterprise/health/article-category/list` | ARTICLE类目 | 读 | session(会话) |  | shopId |  | data |
| `Health_articleCategoryRemove` | POST | `/enterprise/health/article-category/remove` | 删除ARTICLE类目 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_articleCategorySave` | POST | `/enterprise/health/article-category/save` | 保存ARTICLE类目 | 写 | session(会话) |  |  | shopId, id, name, sort, status | data |
| `Health_articleAudit` | POST | `/enterprise/health/article/audit` | 审核ARTICLE | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_articleDetail` | GET | `/enterprise/health/article/detail` | ARTICLE详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_articles` | GET | `/enterprise/health/article/list` | ARTICLES | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, kind, categoryId, authorKind, auditStatus |  | data |
| `Health_articleRemove` | POST | `/enterprise/health/article/remove` | 删除ARTICLE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_articleSave` | POST | `/enterprise/health/article/save` | 保存ARTICLE | 写 | session(会话) |  |  | shopId, id, title, kind, categoryId, cover, mediaUrl, content, summary, authorKind, authorId, visibility, crowdKinds, recommend, status | data |
| `Health_bankCards` | GET | `/enterprise/health/bank/list` | 图卡BANK | 读 | session(会话) |  | shopId, earnerKind, earnerId |  | data |
| `Health_bankCardRemove` | POST | `/enterprise/health/bank/remove` | 删除BANK图卡 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_bankCardSave` | POST | `/enterprise/health/bank/save` | 保存BANK图卡 | 写 | session(会话) |  |  | shopId, id, earnerKind, earnerId, holderName, bankName, branchName, cardNo, isDefault | data |
| `Health_bannerList` | GET | `/enterprise/health/banner/list` | BANNER列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_bannerRemove` | POST | `/enterprise/health/banner/remove` | 删除BANNER | 写 | session(会话) |  |  | shopId, id | data |
| `Health_bannerSave` | POST | `/enterprise/health/banner/save` | 保存BANNER | 写 | session(会话) |  |  | shopId, id, title, image, linkType, linkValue, sort, status, startAt, endAt | data |
| `Health_broadcastCancel` | POST | `/enterprise/health/broadcast/cancel` | 取消BROADCAST | 写 | session(会话) |  |  | shopId, id | data |
| `Health_broadcastCreate` | POST | `/enterprise/health/broadcast/create` | 新建BROADCAST | 写 | session(会话) |  |  | shopId, title, content, channel, templateKey, crowdGroupIds, page, scheduledAt | data |
| `Health_broadcasts` | GET | `/enterprise/health/broadcast/list` | BROADCASTS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status |  | data |
| `Health_cannedList` | GET | `/enterprise/health/canned/list` | CANNED列表 | 读 | session(会话) |  | shopId, groupKey |  | data |
| `Health_cannedRemove` | POST | `/enterprise/health/canned/remove` | 删除CANNED | 写 | session(会话) |  |  | shopId, id | data |
| `Health_cannedSave` | POST | `/enterprise/health/canned/save` | 保存CANNED | 写 | session(会话) |  |  | shopId, id, groupKey, content, sort, status | data |
| `Health_cities` | GET | `/enterprise/health/city/list` | CITIES | 读 | session(会话) |  | shopId |  | data |
| `Health_cityRemove` | POST | `/enterprise/health/city/remove` | 删除CITY | 写 | session(会话) |  |  | shopId, id | data |
| `Health_citySave` | POST | `/enterprise/health/city/save` | 保存CITY | 写 | session(会话) |  |  | shopId, id, name, code, sort, status | data |
| `Health_commissionRules` | GET | `/enterprise/health/commission/list` | COMMISSION规则 | 读 | session(会话) |  | shopId |  | data |
| `Health_commissionRuleRemove` | POST | `/enterprise/health/commission/remove` | 删除COMMISSION规则 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_commissionRuleSave` | POST | `/enterprise/health/commission/save` | 保存COMMISSION规则 | 写 | session(会话) |  |  | shopId, id, scope, scopeId, bizTypes, organPercent, practitionerPercent, promoterPercent, teamPercent, status | data |
| `Health_consultRules` | GET | `/enterprise/health/consult-rule/list` | 咨询规则 | 读 | session(会话) |  | shopId, practitionerId |  | data |
| `Health_consultRuleRemove` | POST | `/enterprise/health/consult-rule/remove` | 咨询规则删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_consultRuleSave` | POST | `/enterprise/health/consult-rule/save` | 咨询规则保存 | 写 | session(会话) |  |  | shopId, id, practitionerId, bizType, instant, priceCents, minutes, maxDailyCount, messageLimit, needPatient, status | data |
| `Health_consultAction` | POST | `/enterprise/health/consult/action` | 咨询ACTION | 写 | session(会话) |  |  | shopId, id, action, reason, conclusion | data |
| `Health_consultCreate` | POST | `/enterprise/health/consult/create` | 咨询新建 | 写 | session(会话) |  |  | shopId, bizType, patientId, practitionerId, title, symptomText, attachments, appointAt, contactPhone, meetingUrl | data |
| `Health_consultDetail` | GET | `/enterprise/health/consult/detail` | 咨询详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_consults` | GET | `/enterprise/health/consult/list` | 咨询 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, consultBizType, consultStatus, practitionerId, from, to |  | data |
| `Health_consultSession` | GET | `/enterprise/health/consult/session` | 咨询SESSION | 读 | session(会话) |  | shopId, id |  | data |
| `Health_coupons` | GET | `/enterprise/health/coupon/list` | 优惠券 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status |  | data |
| `Health_couponRemove` | POST | `/enterprise/health/coupon/remove` | 优惠券删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_couponSave` | POST | `/enterprise/health/coupon/save` | 优惠券保存 | 写 | session(会话) |  |  | shopId, id, name, kind, reduceCents, discountPercent, startFeeCents, totalCount, perCustomerLimit, validDays, validStart, validEnd, bizTypes, goodsIds, status | data |
| `Health_couponTickets` | GET | `/enterprise/health/coupon/ticket/list` | 优惠券工单 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, couponId, ticketStatus |  | data |
| `Health_crowdGroups` | GET | `/enterprise/health/crowd/list` | CROWD群 | 读 | session(会话) |  | shopId |  | data |
| `Health_crowdGroupRemove` | POST | `/enterprise/health/crowd/remove` | 删除CROWD群 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_crowdGroupSave` | POST | `/enterprise/health/crowd/save` | 保存CROWD群 | 写 | session(会话) |  |  | shopId, id, name, kind, desc | data |
| `Health_customerDetail` | GET | `/enterprise/health/customer/detail` | 客户详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_customerExport` | GET | `/enterprise/health/customer/export` | 客户导出 | 读 | session(会话) |  | shopId |  | data |
| `Health_customers` | GET | `/enterprise/health/customer/list` | 客户 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, memberLevelId, crowdGroupId |  | data |
| `Health_customerSave` | POST | `/enterprise/health/customer/save` | 客户保存 | 写 | session(会话) |  |  | shopId, id, nickname, phone, city, memberLevelId, remark, status | data |
| `Health_dashboard` | GET | `/enterprise/health/dashboard` | 看板 | 读 | session(会话) |  | shopId, days |  | data |
| `Health_departments` | GET | `/enterprise/health/department/list` | 部门 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, hospitalId |  | data |
| `Health_departmentRemove` | POST | `/enterprise/health/department/remove` | 删除DEPARTMENT | 写 | session(会话) |  |  | shopId, id | data |
| `Health_departmentSave` | POST | `/enterprise/health/department/save` | 保存DEPARTMENT | 写 | session(会话) |  |  | shopId, id, hospitalId, name, category, intro, sort, status | data |
| `Health_dictList` | GET | `/enterprise/health/dict/list` | DICT列表 | 读 | session(会话) |  | shopId, groupKey |  | data |
| `Health_dictRemove` | POST | `/enterprise/health/dict/remove` | 删除DICT | 写 | session(会话) |  |  | shopId, id | data |
| `Health_dictSave` | POST | `/enterprise/health/dict/save` | 保存DICT | 写 | session(会话) |  |  | shopId, id, groupKey, label, value, sort, status | data |
| `Health_diseases` | GET | `/enterprise/health/disease/list` | DISEASES | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, category |  | data |
| `Health_diseaseRemove` | POST | `/enterprise/health/disease/remove` | 删除DISEASE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_diseaseSave` | POST | `/enterprise/health/disease/save` | 保存DISEASE | 写 | session(会话) |  |  | shopId, id, name, category, departmentIds, symptomNames, overview, advice, status | data |
| `Health_diyPageList` | GET | `/enterprise/health/diy/list` | DIY页面列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_diyPageSave` | POST | `/enterprise/health/diy/save` | 保存DIY页面 | 写 | session(会话) |  |  | shopId, pageKey, blocks, publish | data |
| `Health_drugs` | GET | `/enterprise/health/drug/list` | DRUGS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, prescriptionOnly |  | data |
| `Health_drugRemove` | POST | `/enterprise/health/drug/remove` | 删除DRUG | 写 | session(会话) |  |  | shopId, id | data |
| `Health_drugSave` | POST | `/enterprise/health/drug/save` | 保存DRUG | 写 | session(会话) |  |  | shopId, id, genericName, brandName, spec, unit, manufacturer, approvalNo, prescriptionRequired, otcClass, category, priceCents, stock, intro, status | data |
| `Health_earners` | GET | `/enterprise/health/earner/list` | EARNERS | 读 | session(会话) |  | shopId, earnerKind |  | data |
| `Health_serviceEntryList` | GET | `/enterprise/health/entry/list` | 服务ENTRY列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_serviceEntrySave` | POST | `/enterprise/health/entry/save` | 保存服务ENTRY | 写 | session(会话) |  |  | shopId, entries | data |
| `Health_examItems` | GET | `/enterprise/health/exam-item/list` | EXAM明细 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, category |  | data |
| `Health_examItemRemove` | POST | `/enterprise/health/exam-item/remove` | 删除EXAM明细 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_examItemSave` | POST | `/enterprise/health/exam-item/save` | 保存EXAM明细 | 写 | session(会话) |  |  | shopId, id, name, category, unit, reference, priceCents, genderLimit, crowdKinds, desc, status | data |
| `Health_examPackageDetail` | GET | `/enterprise/health/exam-package/detail` | EXAMPACKAGE详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_examPackages` | GET | `/enterprise/health/exam-package/list` | EXAMPACKAGES | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, cityId, crowdKind |  | data |
| `Health_examPackageRemove` | POST | `/enterprise/health/exam-package/remove` | 删除EXAMPACKAGE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_examPackageSave` | POST | `/enterprise/health/exam-package/save` | 保存EXAMPACKAGE | 写 | session(会话) |  |  | shopId, id, name, cover, cityId, organId, crowdKinds, genderLimit, marriedLimit, priceCents, originPriceCents, intro, notice, hot, status, items | data |
| `Health_expressCompanies` | GET | `/enterprise/health/express/list` | EXPRESSCOMPANIES | 读 | session(会话) |  | shopId |  | data |
| `Health_expressRemove` | POST | `/enterprise/health/express/remove` | 删除EXPRESS | 写 | session(会话) |  |  | shopId, id | data |
| `Health_expressSave` | POST | `/enterprise/health/express/save` | 保存EXPRESS | 写 | session(会话) |  |  | shopId, id, name, code, phone, status | data |
| `Health_followupAssign` | POST | `/enterprise/health/followup/assign` | 跟进任务指派 | 写 | session(会话) |  |  | shopId, taskIds, practitionerId | data |
| `Health_followupCreate` | POST | `/enterprise/health/followup/create` | 跟进任务新建 | 写 | session(会话) |  |  | shopId, patientIds, title, content, way, planAt, practitionerId | data |
| `Health_followupDetail` | GET | `/enterprise/health/followup/detail` | 跟进任务详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_followupTasks` | GET | `/enterprise/health/followup/list` | 跟进任务任务 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, practitionerId, taskStatus, way, from, to |  | data |
| `Health_followupRemove` | POST | `/enterprise/health/followup/remove` | 跟进任务删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_followupSave` | POST | `/enterprise/health/followup/save` | 跟进任务保存 | 写 | session(会话) |  |  | shopId, taskId, conclusion, nextAt, metrics, attachments, reason, status | data |
| `Health_goodsCategories` | GET | `/enterprise/health/goods-category/list` | GOODS类目 | 读 | session(会话) |  | shopId |  | data |
| `Health_goodsCategoryRemove` | POST | `/enterprise/health/goods-category/remove` | 删除GOODS类目 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_goodsCategorySave` | POST | `/enterprise/health/goods-category/save` | 保存GOODS类目 | 写 | session(会话) |  |  | shopId, id, parentId, name, icon, sort, status | data |
| `Health_goodsDetail` | GET | `/enterprise/health/goods/detail` | GOODS详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_goods` | GET | `/enterprise/health/goods/list` | GOODS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, categoryId, kind, prescriptionOnly, lowStock |  | data |
| `Health_goodsRemove` | POST | `/enterprise/health/goods/remove` | 删除GOODS | 写 | session(会话) |  |  | shopId, id | data |
| `Health_goodsSave` | POST | `/enterprise/health/goods/save` | 保存GOODS | 写 | session(会话) |  |  | shopId, id, name, kind, categoryId, images, drugId, prescriptionRequired, spec, unit, priceCents, originPriceCents, costCents, stock, skuMode, skus, detail, shippingMode, shippingTemplateId, recommend, status | data |
| `Health_goodsStatus` | POST | `/enterprise/health/goods/status` | GOODS状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_goodsStockAdjust` | POST | `/enterprise/health/goods/stock` | GOODS库存ADJUST | 写 | session(会话) |  |  | shopId, id, skuId, delta, note | data |
| `Health_greenDetail` | GET | `/enterprise/health/green/detail` | GREEN详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_greenOrders` | GET | `/enterprise/health/green/list` | GREEN订单 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, greenStatus, kind |  | data |
| `Health_greenProgress` | POST | `/enterprise/health/green/progress` | GREEN进展 | 写 | session(会话) |  |  | shopId, id, status, matchedHospital, matchedDoctor, matchedAt, note | data |
| `Health_guidanceSimulate` | POST | `/enterprise/health/guidance/simulate` | GUIDANCE模拟 | 写 | session(会话) |  |  | shopId, symptomNames, patientAge, patientGender | data |
| `Health_hospitals` | GET | `/enterprise/health/hospital/list` | HOSPITALS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, city |  | data |
| `Health_hospitalRemove` | POST | `/enterprise/health/hospital/remove` | 删除HOSPITAL | 写 | session(会话) |  |  | shopId, id | data |
| `Health_hospitalSave` | POST | `/enterprise/health/hospital/save` | 保存HOSPITAL | 写 | session(会话) |  |  | shopId, id, name, level, city, address, lng, lat, intro, partnered, status | data |
| `Health_hotKeywords` | GET | `/enterprise/health/hot-word/list` | HOT关键词 | 读 | session(会话) |  | shopId |  | data |
| `Health_hotKeywordRemove` | POST | `/enterprise/health/hot-word/remove` | 删除HOT关键词 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_hotKeywordSave` | POST | `/enterprise/health/hot-word/save` | 保存HOT关键词 | 写 | session(会话) |  |  | shopId, id, keyword, status | data |
| `Health_medicalEventList` | GET | `/enterprise/health/medical-event/list` | MEDICAL事件列表 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, kind |  | data |
| `Health_medicalEventRemove` | POST | `/enterprise/health/medical-event/remove` | 删除MEDICAL事件 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_medicalEventSave` | POST | `/enterprise/health/medical-event/save` | 保存MEDICAL事件 | 写 | session(会话) |  |  | shopId, patientId, id, kind, title, hospitalName, departmentName, doctorName, occurAt, leaveAt, diagnosis, summary, attachments | data |
| `Health_medicationEffects` | GET | `/enterprise/health/medication/effect/list` | MEDICATIONEFFECTS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, medicationId |  | data |
| `Health_medicationEffectSave` | POST | `/enterprise/health/medication/effect/save` | 保存MEDICATIONEFFECT | 写 | session(会话) |  |  | shopId, medicationId, level, symptomText, advice | data |
| `Health_medications` | GET | `/enterprise/health/medication/list` | MEDICATIONS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId |  | data |
| `Health_medicationLogs` | GET | `/enterprise/health/medication/log/list` | MEDICATION日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, medicationId, from, to |  | data |
| `Health_medicationLogSave` | POST | `/enterprise/health/medication/log/save` | 保存MEDICATION日志 | 写 | session(会话) |  |  | shopId, medicationId, planAt, result, note | data |
| `Health_medicationRemove` | POST | `/enterprise/health/medication/remove` | 删除MEDICATION | 写 | session(会话) |  |  | shopId, id | data |
| `Health_medicationSave` | POST | `/enterprise/health/medication/save` | 保存MEDICATION | 写 | session(会话) |  |  | shopId, id, patientId, drugId, drugName, spec, doseText, way, frequency, frequencyText, startAt, stopAt, remindTimes, prescriptionId, note, status | data |
| `Health_medicationStatus` | POST | `/enterprise/health/medication/status` | MEDICATION状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_memberCards` | GET | `/enterprise/health/member-card/list` | 会员图卡 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status |  | data |
| `Health_memberCardRemove` | POST | `/enterprise/health/member-card/remove` | 会员图卡删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_memberCardSave` | POST | `/enterprise/health/member-card/save` | 会员图卡保存 | 写 | session(会话) |  |  | shopId, id, name, cover, priceCents, originPriceCents, validDays, intro, status, benefits | data |
| `Health_memberGrant` | POST | `/enterprise/health/member-grant/grant` | 会员GRANT | 写 | session(会话) |  |  | shopId, cardId, customerIds, validDays, reason | data |
| `Health_memberGrants` | GET | `/enterprise/health/member-grant/list` | 会员授权 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, grantStatus, customerId |  | data |
| `Health_memberGrantRevoke` | POST | `/enterprise/health/member-grant/revoke` | 会员GRANT吊销 | 写 | session(会话) |  |  | shopId, id, reason | data |
| `Health_memberLevels` | GET | `/enterprise/health/member-level/list` | 会员LEVELS | 读 | session(会话) |  | shopId |  | data |
| `Health_memberLevelRemove` | POST | `/enterprise/health/member-level/remove` | 会员LEVEL删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_memberLevelSave` | POST | `/enterprise/health/member-level/save` | 会员LEVEL保存 | 写 | session(会话) |  |  | shopId, id, name, reachCents, discountPercent, pointRatePercent, benefits, sort, status | data |
| `Health_meta` | GET | `/enterprise/health/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Health_metrics` | GET | `/enterprise/health/metric/list` | METRICS | 读 | session(会话) |  | shopId |  | data |
| `Health_metricLogs` | GET | `/enterprise/health/metric/log/list` | METRIC日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, metricId, abnormalOnly, from, to |  | data |
| `Health_metricLogRemove` | POST | `/enterprise/health/metric/log/remove` | 删除METRIC日志 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_metricLogSave` | POST | `/enterprise/health/metric/log/save` | 保存METRIC日志 | 写 | session(会话) |  |  | shopId, patientId, metricId, value, valueText, extras, measuredAt, note | data |
| `Health_metricRemove` | POST | `/enterprise/health/metric/remove` | 删除METRIC | 写 | session(会话) |  |  | shopId, id | data |
| `Health_metricSave` | POST | `/enterprise/health/metric/save` | 保存METRIC | 写 | session(会话) |  |  | shopId, id, metricKey, name, unit, valueType, decimals, normalLow, normalHigh, options, extraFields, sort, status | data |
| `Health_metricTrend` | GET | `/enterprise/health/metric/trend` | METRIC趋势 | 读 | session(会话) |  | shopId, patientId, metricId, days, granularity |  | data |
| `Health_noticeList` | GET | `/enterprise/health/notice/list` | NOTICE列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_noticeRemove` | POST | `/enterprise/health/notice/remove` | 删除NOTICE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_noticeSave` | POST | `/enterprise/health/notice/save` | 保存NOTICE | 写 | session(会话) |  |  | shopId, id, title, content, sort, status | data |
| `Health_orderAction` | POST | `/enterprise/health/order/action` | 订单ACTION | 写 | session(会话) |  |  | shopId, id, action, note, practitionerId, refundAmountCents | data |
| `Health_orderDeliver` | POST | `/enterprise/health/order/deliver` | 订单DELIVER | 写 | session(会话) |  |  | shopId, orderId, expressCompanyId, expressCompanyName, trackingNo, remark | data |
| `Health_orderDetail` | GET | `/enterprise/health/order/detail` | 订单详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_orderExport` | GET | `/enterprise/health/order/export` | 订单导出 | 读 | session(会话) |  | shopId, bizType, status, payStatus, practitionerId, organId, patientId, keyword, from, to |  | data |
| `Health_orders` | GET | `/enterprise/health/order/list` | 订单 | 读 | session(会话) |  | shopId, page, pageSize, bizType, status, payStatus, practitionerId, organId, patientId, keyword, from, to |  | data |
| `Health_orderStats` | GET | `/enterprise/health/order/stats` | 订单统计 | 读 | session(会话) |  | shopId, days |  | data |
| `Health_organAudit` | POST | `/enterprise/health/organ/audit` | 审核ORGAN | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_organDetail` | GET | `/enterprise/health/organ/detail` | ORGAN详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_organs` | GET | `/enterprise/health/organ/list` | ORGANS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, kind |  | data |
| `Health_organRemove` | POST | `/enterprise/health/organ/remove` | 删除ORGAN | 写 | session(会话) |  |  | shopId, id | data |
| `Health_organSave` | POST | `/enterprise/health/organ/save` | 保存ORGAN | 写 | session(会话) |  |  | shopId, id, name, kind, city, address, contactName, contactPhone, licenseNo, licenseImages, commissionPercent, intro | data |
| `Health_overview` | GET | `/enterprise/health/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Health_patientPlans` | GET | `/enterprise/health/patient-plan/list` | PATIENT计划 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, planId, patientId, planStatus |  | data |
| `Health_patientPlanStart` | POST | `/enterprise/health/patient-plan/start` | 启动PATIENT计划 | 写 | session(会话) |  |  | shopId, planId, patientIds, practitionerId, startAt, cycleDays | data |
| `Health_patientPlanStatus` | POST | `/enterprise/health/patient-plan/status` | PATIENT计划状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_patientDetail` | GET | `/enterprise/health/patient/detail` | PATIENT详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_patients` | GET | `/enterprise/health/patient/list` | PATIENTS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, customerId, practitionerId, crowdGroupId |  | data |
| `Health_patientMove` | POST | `/enterprise/health/patient/move` | PATIENT出入库 | 写 | session(会话) |  |  | shopId, patientIds, practitionerId, crowdGroupIds, replace | data |
| `Health_patientRemove` | POST | `/enterprise/health/patient/remove` | 删除PATIENT | 写 | session(会话) |  |  | shopId, id | data |
| `Health_patientSave` | POST | `/enterprise/health/patient/save` | 保存PATIENT | 写 | session(会话) |  |  | shopId, id, customerId, name, relation, gender, birthday, phone, idCard, bloodType, heightCm, weightKg, ownerPractitionerId, crowdIds, remark | data |
| `Health_planDetail` | GET | `/enterprise/health/plan/detail` | 计划详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_plans` | GET | `/enterprise/health/plan/list` | 计划 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, crowdKind |  | data |
| `Health_planRemove` | POST | `/enterprise/health/plan/remove` | 删除计划 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_planSave` | POST | `/enterprise/health/plan/save` | 保存计划 | 写 | session(会话) |  |  | shopId, id, name, crowdKind, cycleDays, desc, status, steps | data |
| `Health_pointRules` | GET | `/enterprise/health/point-rule/list` | 积分规则 | 读 | session(会话) |  | shopId |  | data |
| `Health_pointRuleSave` | POST | `/enterprise/health/point-rule/save` | 积分规则保存 | 写 | session(会话) |  |  | shopId, id, action, label, pointValue, dailyLimit, status | data |
| `Health_pointAdjust` | POST | `/enterprise/health/point/adjust` | 积分ADJUST | 写 | session(会话) |  |  | shopId, customerId, pointValue, note | data |
| `Health_pointLogs` | GET | `/enterprise/health/point/log/list` | 积分日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, customerId |  | data |
| `Health_postTags` | GET | `/enterprise/health/post-tag/list` | 发表标签 | 读 | session(会话) |  | shopId |  | data |
| `Health_postTagSave` | POST | `/enterprise/health/post-tag/save` | 发表标记保存 | 写 | session(会话) |  |  | shopId, id, name, sort, status | data |
| `Health_postAudit` | POST | `/enterprise/health/post/audit` | 发表审核 | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_postCommentAudit` | POST | `/enterprise/health/post/comment/audit` | 发表评论审核 | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_postCommentRemove` | POST | `/enterprise/health/post/comment/remove` | 发表评论删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_postDetail` | GET | `/enterprise/health/post/detail` | 发表详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_posts` | GET | `/enterprise/health/post/list` | 发表 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, postIdAudit, tagId |  | data |
| `Health_postRemove` | POST | `/enterprise/health/post/remove` | 发表删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_posters` | GET | `/enterprise/health/poster/list` | POSTERS | 读 | session(会话) |  | shopId |  | data |
| `Health_posterRemove` | POST | `/enterprise/health/poster/remove` | 删除POSTER | 写 | session(会话) |  |  | shopId, id | data |
| `Health_posterSave` | POST | `/enterprise/health/poster/save` | 保存POSTER | 写 | session(会话) |  |  | shopId, id, name, targetType, targetId, background, qrcodePosition, titleText, subtitleText, status | data |
| `Health_practitionerAudit` | POST | `/enterprise/health/practitioner/audit` | 审核PRACTITIONER | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_practitionerDetail` | GET | `/enterprise/health/practitioner/detail` | PRACTITIONER详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_practitioners` | GET | `/enterprise/health/practitioner/list` | PRACTITIONERS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, role, organId, hospitalId, departmentId |  | data |
| `Health_practitionerRemove` | POST | `/enterprise/health/practitioner/remove` | 删除PRACTITIONER | 写 | session(会话) |  |  | shopId, id | data |
| `Health_practitionerSave` | POST | `/enterprise/health/practitioner/save` | 保存PRACTITIONER | 写 | session(会话) |  |  | shopId, id, organId, hospitalId, departmentId, name, role, title, avatar, phone, city, intro, goodAt, licenseNo, licenseImages, commissionPercent | data |
| `Health_practitionerServiceRemove` | POST | `/enterprise/health/practitioner/service/remove` | 删除PRACTITIONER服务 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_practitionerServiceSave` | POST | `/enterprise/health/practitioner/service/save` | 保存PRACTITIONER服务 | 写 | session(会话) |  |  | shopId, practitionerId, id, serviceId, priceCents, instant, maxDailyCount, status | data |
| `Health_practitionerStatus` | POST | `/enterprise/health/practitioner/status` | PRACTITIONER状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_prescriptionDetail` | GET | `/enterprise/health/prescription/detail` | PRESCRIPTION详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_prescriptions` | GET | `/enterprise/health/prescription/list` | PRESCRIPTIONS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, doctorId, prescriptionStatus |  | data |
| `Health_prescriptionReview` | POST | `/enterprise/health/prescription/review` | PRESCRIPTION审核 | 写 | session(会话) |  |  | shopId, id, approved, note | data |
| `Health_prescriptionRevoke` | POST | `/enterprise/health/prescription/revoke` | 吊销PRESCRIPTION | 写 | session(会话) |  |  | shopId, id, reason | data |
| `Health_prescriptionSave` | POST | `/enterprise/health/prescription/save` | 保存PRESCRIPTION | 写 | session(会话) |  |  | shopId, id, patientId, consultId, orderId, doctorId, diagnosisText, advice, signatureUrl, items, submit | data |
| `Health_promoterAudit` | POST | `/enterprise/health/promoter/audit` | 审核PROMOTER | 写 | session(会话) |  |  | shopId, id, approved, ratePercent, reason | data |
| `Health_promoters` | GET | `/enterprise/health/promoter/list` | 转化 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, auditStatus |  | data |
| `Health_promoteLogs` | GET | `/enterprise/health/promoter/log/list` | 转化日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, promoterId |  | data |
| `Health_qrcode` | GET | `/enterprise/health/qrcode` | QRCODE | 读 | session(会话) |  | shopId, page, scene |  | data |
| `Health_questionDetail` | GET | `/enterprise/health/question/detail` | 问题详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_questions` | GET | `/enterprise/health/question/list` | 问题 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, questionStatus |  | data |
| `Health_recordDetail` | GET | `/enterprise/health/record/detail` | 记录详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_recordItemRemove` | POST | `/enterprise/health/record/item/remove` | 记录明细删除 | 写 | session(会话) |  |  | shopId, patientId, id | data |
| `Health_recordItemSave` | POST | `/enterprise/health/record/item/save` | 记录明细保存 | 写 | session(会话) |  |  | shopId, patientId, id, type, label, value, dictKey, startAt, endAt | data |
| `Health_recordSave` | POST | `/enterprise/health/record/save` | 记录保存 | 写 | session(会话) |  |  | shopId, patientId, basics | data |
| `Health_reportAdviceSave` | POST | `/enterprise/health/report/advice/save` | 保存报告ADVICE | 写 | session(会话) |  |  | shopId, reportId, consultId, content | data |
| `Health_reportDetail` | GET | `/enterprise/health/report/detail` | 报告详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_reports` | GET | `/enterprise/health/report/list` | 报告 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, kind, abnormalOnly |  | data |
| `Health_reportRemove` | POST | `/enterprise/health/report/remove` | 删除报告 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_reportSave` | POST | `/enterprise/health/report/save` | 保存报告 | 写 | session(会话) |  |  | shopId, id, patientId, title, kind, hospitalName, reportAt, conclusion, files, items | data |
| `Health_reviewAppealHandle` | POST | `/enterprise/health/review/appeal` | 审核APPEALHANDLE | 写 | session(会话) |  |  | shopId, id, approved, note | data |
| `Health_reviewAudit` | POST | `/enterprise/health/review/audit` | 审核审核 | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_reviews` | GET | `/enterprise/health/review/list` | 审核 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, targetKind, targetId, auditStatus, minScore, maxScore |  | data |
| `Health_reviewRemove` | POST | `/enterprise/health/review/remove` | 删除审核 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_reviewReply` | POST | `/enterprise/health/review/reply` | 回复审核 | 写 | session(会话) |  |  | shopId, id, reply | data |
| `Health_reviewStats` | GET | `/enterprise/health/review/stats` | 审核统计 | 读 | session(会话) |  | shopId, targetKind |  | data |
| `Health_scrmEvents` | GET | `/enterprise/health/scrm/event/list` | 企微事件 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, eventType, eventStatus |  | data |
| `Health_scrmLink` | GET | `/enterprise/health/scrm/link` | 企微短链 | 读 | session(会话) |  | shopId |  | data |
| `Health_scrmLinkRemove` | POST | `/enterprise/health/scrm/link/remove` | 企微短链删除 | 写 | session(会话) |  |  | shopId | data |
| `Health_scrmLinkSave` | POST | `/enterprise/health/scrm/link/save` | 企微短链保存 | 写 | session(会话) |  |  | shopId, orgType, orgUserId, pushEnabled, pullEnabled, tagMap | data |
| `Health_scrmPush` | POST | `/enterprise/health/scrm/push` | 企微推送 | 写 | session(会话) |  |  | shopId, ids, limit | data |
| `Health_scrmSkip` | POST | `/enterprise/health/scrm/skip` | 企微SKIP | 写 | session(会话) |  |  | shopId, ids | data |
| `Health_searchLogs` | GET | `/enterprise/health/search-log/list` | 搜索日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, days, zeroOnly |  | data |
| `Health_serviceDeskBind` | GET | `/enterprise/health/service-desk` | 绑定服务DESK | 读 | session(会话) |  | shopId |  | data |
| `Health_serviceDeskBindSave` | POST | `/enterprise/health/service-desk/bind` | 绑定服务DESK保存 | 写 | session(会话) |  |  | shopId, siteKey | data |
| `Health_services` | GET | `/enterprise/health/service/list` | 服务 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, bizType, category |  | data |
| `Health_serviceRemove` | POST | `/enterprise/health/service/remove` | 删除服务 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_serviceSave` | POST | `/enterprise/health/service/save` | 保存服务 | 写 | session(会话) |  |  | shopId, id, name, bizType, category, cover, intro, needSlot, needPatient, durationMinutes, priceCents, originPriceCents, crowdKinds, status, sort | data |
| `Health_serviceStatus` | POST | `/enterprise/health/service/status` | 服务状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_orderShares` | GET | `/enterprise/health/share/list` | 订单分享 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, orderId, earnerKind |  | data |
| `Health_shiftTemplates` | GET | `/enterprise/health/shift-template/list` | 模板SHIFT | 读 | session(会话) |  | shopId, practitionerId |  | data |
| `Health_shiftTemplateRemove` | POST | `/enterprise/health/shift-template/remove` | 模板SHIFT删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_shiftTemplateSave` | POST | `/enterprise/health/shift-template/save` | 模板SHIFT保存 | 写 | session(会话) |  |  | shopId, id, practitionerId, hospitalId, departmentId, kind, weekdays, startAt, endAt, slotMinutes, quotaPerSlot, priceCents, status | data |
| `Health_shiftGenerate` | POST | `/enterprise/health/shift/generate` | 生成SHIFT | 写 | session(会话) |  |  | shopId, practitionerId, from, days, overwriteQuota | data |
| `Health_shippingTemplates` | GET | `/enterprise/health/shipping-template/list` | 模板SHIPPING | 读 | session(会话) |  | shopId |  | data |
| `Health_shippingTemplateRemove` | POST | `/enterprise/health/shipping-template/remove` | 模板SHIPPING删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_shippingTemplateSave` | POST | `/enterprise/health/shipping-template/save` | 模板SHIPPING保存 | 写 | session(会话) |  |  | shopId, id, name, freeOverCents, firstFeeCents, additionalFeeCents, regions, status | data |
| `Health_shopClose` | POST | `/enterprise/health/shop/close` | SHOP关闭 | 写 | session(会话) |  |  | shopId, reason | data |
| `Health_shopCreate` | POST | `/enterprise/health/shop/create` | 新建SHOP | 写 | session(会话) |  |  | name, slogan, logo, servicePhone, shareImage, city | data |
| `Health_shopDetail` | GET | `/enterprise/health/shop/detail` | SHOP详情 | 读 | session(会话) |  | shopId |  | data |
| `Health_shops` | GET | `/enterprise/health/shop/list` | SHOPS | 读 | session(会话) |  |  |  | data |
| `Health_shopSave` | POST | `/enterprise/health/shop/save` | 保存SHOP | 写 | session(会话) |  |  | shopId, name, slogan, logo, servicePhone, shareImage, city | data |
| `Health_shopStatus` | POST | `/enterprise/health/shop/status` | SHOP状态 | 写 | session(会话) |  |  | shopId, id, status, reason | data |
| `Health_themeSave` | POST | `/enterprise/health/shop/theme` | 保存THEME | 写 | session(会话) |  |  | shopId, themeColor, navigationTitle, tabBarLabels | data |
| `Health_tradeSave` | POST | `/enterprise/health/shop/trade` | 保存TRADE | 写 | session(会话) |  |  | shopId, autoCancelMinutes, timeUnitMinutes, bufferMinutes, maxDays, allowCrossDay, bookingLeadMinutes, dispatchMode, canTxHours, refundReleaseSlot, onlinePayEnabled, walletPayEnabled, pointDeductEnabled, pointDeductMaxPercent, freeShippingOverCents, defaultShippingCents, prescriptionDrugGuard, pharmacistReviewMode, pharmacistSamplePercent, prescriptionValidHours, selfOnboarding, onboardingAudit, promoterEnabled, promoterRatePercent, withdrawalEnabled, withdrawalMinCents, withdrawalTaxPercent, reviewEnabled, reviewAuditFirst, alertEnabled, alertDedupeMinutes, followupOverdueHours, postAuditFirst, emergencyTip | data |
| `Health_signOrderDetail` | GET | `/enterprise/health/sign-order/detail` | 签约订单详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_signOrders` | GET | `/enterprise/health/sign-order/list` | 签约订单 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, patientId, signStatus |  | data |
| `Health_signOrderSignSave` | POST | `/enterprise/health/sign-order/sign-save` | 保存签约订单签约 | 写 | session(会话) |  |  | shopId, id, signPhotoUrl, signatureUrl | data |
| `Health_signPackages` | GET | `/enterprise/health/sign-package/list` | 签约PACKAGES | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, teamId |  | data |
| `Health_signPackageRemove` | POST | `/enterprise/health/sign-package/remove` | 删除签约PACKAGE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_signPackageSave` | POST | `/enterprise/health/sign-package/save` | 保存签约PACKAGE | 写 | session(会话) |  |  | shopId, id, name, teamId, practitionerId, priceCents, years, crowdKinds, intro, status, benefits | data |
| `Health_slotBlock` | POST | `/enterprise/health/slot/block` | SLOTBLOCK | 写 | session(会话) |  |  | shopId, slotId, blocked, reason | data |
| `Health_slotCalendar` | GET | `/enterprise/health/slot/calendar` | SLOTCALENDAR | 读 | session(会话) |  | shopId, practitionerId, departmentId, hospitalId, kind, from, days |  | data |
| `Health_staffList` | GET | `/enterprise/health/staff/list` | 职员列表 | 读 | session(会话) |  | shopId |  | data |
| `Health_staffRemove` | POST | `/enterprise/health/staff/remove` | 删除职员 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_staffSave` | POST | `/enterprise/health/staff/save` | 保存职员 | 写 | session(会话) |  |  | shopId, id, userId, label, role, scopes, status | data |
| `Health_staffScopes` | GET | `/enterprise/health/staff/scopes` | 职员SCOPES | 读 | session(会话) |  | shopId |  | data |
| `Health_surveyAnswers` | GET | `/enterprise/health/survey/answer/list` | 问卷ANSWERS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, surveyId, patientId |  | data |
| `Health_surveyDetail` | GET | `/enterprise/health/survey/detail` | 问卷详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_surveys` | GET | `/enterprise/health/survey/list` | 问卷 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, crowdKind |  | data |
| `Health_surveyRemove` | POST | `/enterprise/health/survey/remove` | 删除问卷 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_surveySave` | POST | `/enterprise/health/survey/save` | 保存问卷 | 写 | session(会话) |  |  | shopId, id, title, desc, crowdKind, status, riskBands, questions | data |
| `Health_teamDetail` | GET | `/enterprise/health/team/detail` | TEAM详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_teamJoinAudit` | POST | `/enterprise/health/team/join/audit` | 审核TEAMJOIN | 写 | session(会话) |  |  | shopId, id, approved, reason | data |
| `Health_teams` | GET | `/enterprise/health/team/list` | TEAMS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, organId |  | data |
| `Health_teamMemberAdd` | POST | `/enterprise/health/team/member/add` | 会员TEAM添加 | 写 | session(会话) |  |  | shopId, teamId, practitionerId, isLeader | data |
| `Health_teamMemberRemove` | POST | `/enterprise/health/team/member/remove` | 会员TEAM删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_teamNoticeRemove` | POST | `/enterprise/health/team/notice/remove` | 删除TEAMNOTICE | 写 | session(会话) |  |  | shopId, id | data |
| `Health_teamNoticeSave` | POST | `/enterprise/health/team/notice/save` | 保存TEAMNOTICE | 写 | session(会话) |  |  | shopId, id, teamId, title, content | data |
| `Health_teamRemove` | POST | `/enterprise/health/team/remove` | 删除TEAM | 写 | session(会话) |  |  | shopId, id | data |
| `Health_teamSave` | POST | `/enterprise/health/team/save` | 保存TEAM | 写 | session(会话) |  |  | shopId, id, name, organId, leaderPractitionerId, intro, status | data |
| `Health_tongueConfig` | GET | `/enterprise/health/tongue/config` | TONGUECONFIG | 读 | session(会话) |  | shopId |  | data |
| `Health_tongueConfigSave` | POST | `/enterprise/health/tongue/config/save` | 保存TONGUECONFIG | 写 | session(会话) |  |  | shopId, enabled, channelId, model | data |
| `Health_tongueRecordDetail` | GET | `/enterprise/health/tongue/record/detail` | 记录TONGUE详情 | 读 | session(会话) |  | shopId, id |  | data |
| `Health_tongueRecords` | GET | `/enterprise/health/tongue/record/list` | TONGUE记录 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, customerId |  | data |
| `Health_tongueRecordRemove` | POST | `/enterprise/health/tongue/record/remove` | 记录TONGUE删除 | 写 | session(会话) |  |  | shopId, id | data |
| `Health_verify` | POST | `/enterprise/health/verify` | 校验 | 写 | session(会话) |  |  | shopId, code, practitionerId | data |
| `Health_walletLogs` | GET | `/enterprise/health/wallet/log/list` | WALLET日志 | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, customerId |  | data |
| `Health_wechat` | GET | `/enterprise/health/wechat/detail` | WECHAT | 读 | session(会话) |  | shopId |  | data |
| `Health_wechatSave` | POST | `/enterprise/health/wechat/save` | 保存WECHAT | 写 | session(会话) |  |  | shopId, appId, appSecret, mchId, payApiV3Key, payCertSerial, payPrivateKey, payEnabled, mapKey, templates | data |
| `Health_wechatTest` | POST | `/enterprise/health/wechat/test` | 测试WECHAT | 写 | session(会话) |  |  | shopId | data |
| `Health_withdrawalHandle` | POST | `/enterprise/health/withdrawal/handle` | WITHDRAWALHANDLE | 写 | session(会话) |  |  | shopId, id, action, note, paidVoucher | data |
| `Health_withdrawals` | GET | `/enterprise/health/withdrawal/list` | WITHDRAWALS | 读 | session(会话) |  | shopId, page, pageSize, keyword, status, withdrawalStatus, earnerKind |  | data |
| `Health_health` | GET | `/health` | 健康检查 | 读 | other |  |  |  | data |
| `Health_ready` | GET | `/health/ready` | 就绪 | 读 | other |  |  |  | data |
| `Health_version` | GET | `/health/version` | 版本 | 读 | other |  |  |  | data |

返回 `INDEX.md`。

