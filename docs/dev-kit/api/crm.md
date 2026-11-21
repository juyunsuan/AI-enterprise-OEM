<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：CRM（`crm`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Crm_analyzeOpportunity` | POST | `/enterprise/crm/ai/analyze-opportunity` | AI商机分析 | 写 | session(会话) |  |  | opportunityId | data |
| `Crm_aiCollectionDraft` | POST | `/enterprise/crm/ai/collection-draft` | AI催收草稿 | 写 | session(会话) |  |  | contractId, channel | data |
| `Crm_aiDraftLead` | POST | `/enterprise/crm/ai/draft-lead` | AI识别线索 | 写 | session(会话) |  |  | text | data |
| `Crm_aiDuplicateExplain` | POST | `/enterprise/crm/ai/duplicate-explain` | AI解释查重 | 写 | session(会话) |  |  | input, candidates | data |
| `Crm_aiReport` | POST | `/enterprise/crm/ai/report` | AI经营报告 | 写 | session(会话) |  |  | range | data |
| `Crm_aiRisk` | POST | `/enterprise/crm/ai/risk` | AI商机风险 | 写 | session(会话) |  |  | opportunityId | data |
| `Crm_aiSummarize` | POST | `/enterprise/crm/ai/summarize` | AI总结跟进 | 写 | session(会话) |  |  | targetType, targetId | data |
| `Crm_approvalFlows` | GET | `/enterprise/crm/approval-flows` | 查看审批流 | 读 | session(会话) |  |  |  | data |
| `Crm_saveApprovalFlow` | POST | `/enterprise/crm/approval-flows` | 新建或修改审批流 | 写 | session(会话) |  |  | id, formType, name, enabled, nodes | data |
| `Crm_removeApprovalFlow` | DELETE | `/enterprise/crm/approval-flows/:id` | 删除审批流 | 写 | session(会话) | id |  |  | data |
| `Crm_approvalFlow` | GET | `/enterprise/crm/approval-flows/:id` | 查看审批流详情 | 读 | session(会话) | id |  |  | data |
| `Crm_addSign` | POST | `/enterprise/crm/approvals/:id/add-sign` | 审批加签 | 写 | session(会话) | id |  | userId, position | data |
| `Crm_approve` | POST | `/enterprise/crm/approvals/:id/approve` | 同意审批 | 写 | session(会话) | id |  | taskId, comment | data |
| `Crm_approvalComments` | GET | `/enterprise/crm/approvals/:id/comments` | 查看审批评论 | 读 | session(会话) | id |  |  | data |
| `Crm_saveApprovalComment` | POST | `/enterprise/crm/approvals/:id/comments` | 发表审批评论 | 写 | session(会话) | id |  | content | data |
| `Crm_reject` | POST | `/enterprise/crm/approvals/:id/reject` | 驳回审批 | 写 | session(会话) | id |  | taskId, comment | data |
| `Crm_returnBack` | POST | `/enterprise/crm/approvals/:id/return` | 审批退回 | 写 | session(会话) | id |  | nodeIndex, comment | data |
| `Crm_revokeApproval` | POST | `/enterprise/crm/approvals/:id/revoke` | 撤回审批 | 写 | session(会话) | id |  | comment | data |
| `Crm_approvalDone` | GET | `/enterprise/crm/approvals/done` | 查看我已审批 | 读 | session(会话) |  | page, pageSize, status, formType |  | data |
| `Crm_approvalInstances` | GET | `/enterprise/crm/approvals/instances` | 查看审批实例 | 读 | session(会话) |  | page, pageSize, status, formType, view |  | data |
| `Crm_approvalInstance` | GET | `/enterprise/crm/approvals/instances/:id` | 查看审批详情 | 读 | session(会话) | id |  |  | data |
| `Crm_submitApproval` | POST | `/enterprise/crm/approvals/submit` | 提交审批 | 写 | session(会话) |  |  | formType, targetId | data |
| `Crm_approvalTodo` | GET | `/enterprise/crm/approvals/todo` | 查看待我审批 | 读 | session(会话) |  | page, pageSize, status, formType |  | data |
| `Crm_businessTitles` | GET | `/enterprise/crm/business-titles` | 查看工商抬头 | 读 | session(会话) |  | customerId, keyword |  | data |
| `Crm_saveBusinessTitle` | POST | `/enterprise/crm/business-titles` | 新建或修改工商抬头 | 写 | session(会话) |  |  | id, customerId, name, taxNo, bank, account, address, phone, capital, scale, province, city, industry, isDefault, remark | data |
| `Crm_removeBusinessTitle` | DELETE | `/enterprise/crm/business-titles/:id` | 删除工商抬头 | 写 | session(会话) | id |  |  | data |
| `Crm_capacities` | GET | `/enterprise/crm/capacities` | 查看库容 | 读 | session(会话) |  | targetType |  | data |
| `Crm_saveCapacity` | POST | `/enterprise/crm/capacities` | 设置库容 | 写 | session(会话) |  |  | targetType, scopeType, scopeId, capacity | data |
| `Crm_changeLogs` | GET | `/enterprise/crm/change-logs` | 查看CRM变更日志 | 读 | session(会话) |  | page, pageSize, targetType, targetId |  | data |
| `Crm_collaborations` | GET | `/enterprise/crm/collaborations` | 查看客户协作人 | 读 | session(会话) |  | customerId |  | data |
| `Crm_saveCollaboration` | POST | `/enterprise/crm/collaborations` | 添加客户协作人 | 写 | session(会话) |  |  | customerId, userId, type | data |
| `Crm_removeCollaboration` | DELETE | `/enterprise/crm/collaborations/:id` | 移除客户协作人 | 写 | session(会话) | id |  |  | data |
| `Crm_contacts` | GET | `/enterprise/crm/contacts` | 查看联系人 | 读 | session(会话) |  | customerId |  | data |
| `Crm_saveContact` | POST | `/enterprise/crm/contacts` | 新建或修改联系人 | 写 | session(会话) |  |  | id, customerId, name, phone, email, title, ownerId, custom | data |
| `Crm_removeContact` | DELETE | `/enterprise/crm/contacts/:id` | 删除联系人 | 写 | session(会话) | id |  |  | data |
| `Crm_toggleContact` | POST | `/enterprise/crm/contacts/:id/toggle` | 启停联系人 | 写 | session(会话) | id |  | enabled, reason | data |
| `Crm_contractStages` | GET | `/enterprise/crm/contract-stages` | 查看合同阶段 | 读 | session(会话) |  |  |  | data |
| `Crm_saveContractStage` | POST | `/enterprise/crm/contract-stages` | 新建或修改合同阶段 | 写 | session(会话) |  |  | id, name, sort | data |
| `Crm_removeContractStage` | DELETE | `/enterprise/crm/contract-stages/:id` | 删除合同阶段 | 写 | session(会话) | id |  |  | data |
| `Crm_contracts` | GET | `/enterprise/crm/contracts` | 查看销售合同 | 读 | session(会话) |  | page, pageSize, view, stageId, customerId, keyword |  | data |
| `Crm_createContract` | POST | `/enterprise/crm/contracts` | 新建销售合同 | 写 | session(会话) |  |  | customerId, opportunityId, quotationId, name, amount, stageId, ownerId, startAt, endAt, remark, items | data |
| `Crm_removeContract` | DELETE | `/enterprise/crm/contracts/:id` | 删除销售合同 | 写 | session(会话) | id |  |  | data |
| `Crm_contract` | GET | `/enterprise/crm/contracts/:id` | 查看销售合同详情 | 读 | session(会话) | id |  |  | data |
| `Crm_updateContract` | PATCH | `/enterprise/crm/contracts/:id` | 修改销售合同 | 写 | session(会话) | id |  |  | data |
| `Crm_updateContractStage` | POST | `/enterprise/crm/contracts/:id/stage` | 推进合同阶段 | 写 | session(会话) | id |  | stageId, reason | data |
| `Crm_voidContract` | POST | `/enterprise/crm/contracts/:id/void` | 作废销售合同 | 写 | session(会话) | id |  | reason | data |
| `Crm_customModules` | GET | `/enterprise/crm/custom-modules` | 查看自定义模块 | 读 | session(会话) |  |  |  | data |
| `Crm_saveCustomModule` | POST | `/enterprise/crm/custom-modules` | 新建或修改自定义模块 | 写 | session(会话) |  |  | id, name, dataTableId, roleIds, enabled | data |
| `Crm_removeCustomModule` | DELETE | `/enterprise/crm/custom-modules/:id` | 删除自定义模块 | 写 | session(会话) | id |  |  | data |
| `Crm_customerPools` | GET | `/enterprise/crm/customer-pools` | 查看客户公海 | 读 | session(会话) |  |  |  | data |
| `Crm_saveCustomerPool` | POST | `/enterprise/crm/customer-pools` | 新建或修改客户公海 | 写 | session(会话) |  |  | id, name, description, adminId, auto, enabled, scopeIds, pickRule, recycleRule | data |
| `Crm_removeCustomerPool` | DELETE | `/enterprise/crm/customer-pools/:id` | 删除客户公海 | 写 | session(会话) | id |  |  | data |
| `Crm_customerRelations` | GET | `/enterprise/crm/customer-relations` | 查看客户关系 | 读 | session(会话) |  | customerId |  | data |
| `Crm_saveCustomerRelation` | POST | `/enterprise/crm/customer-relations` | 新建客户关系 | 写 | session(会话) |  |  | sourceCustomerId, targetCustomerId, type | data |
| `Crm_removeCustomerRelation` | DELETE | `/enterprise/crm/customer-relations/:id` | 删除客户关系 | 写 | session(会话) | id |  |  | data |
| `Crm_customers` | GET | `/enterprise/crm/customers` | 查看客户列表 | 读 | session(会话) |  | page, pageSize, view, keyword, poolId, ownerId |  | data |
| `Crm_createCustomer` | POST | `/enterprise/crm/customers` | 新建客户 | 写 | session(会话) |  |  | name, ownerId, industry, province, city, remark, custom | data |
| `Crm_removeCustomer` | DELETE | `/enterprise/crm/customers/:id` | 删除客户 | 写 | session(会话) | id |  |  | data |
| `Crm_customer360` | GET | `/enterprise/crm/customers/:id` | 查看客户360 | 读 | session(会话) | id |  |  | data |
| `Crm_updateCustomer` | PATCH | `/enterprise/crm/customers/:id` | 修改客户 | 写 | session(会话) | id |  |  | data |
| `Crm_assignCustomer` | POST | `/enterprise/crm/customers/:id/assign` | 分配客户 | 写 | session(会话) | id |  | ownerId | data |
| `Crm_freezeCustomer` | POST | `/enterprise/crm/customers/:id/freeze` | 冻结客户 | 写 | session(会话) | id |  | reason, unfreezeAt | data |
| `Crm_pickCustomer` | POST | `/enterprise/crm/customers/:id/pick` | 领取公海客户 | 写 | session(会话) | id |  |  | data |
| `Crm_customerToPool` | POST | `/enterprise/crm/customers/:id/pool` | 移入客户公海 | 写 | session(会话) | id |  | poolId, reason | data |
| `Crm_transferCustomer` | POST | `/enterprise/crm/customers/:id/transfer` | 转移客户 | 写 | session(会话) | id |  | ownerId, reason | data |
| `Crm_unfreezeCustomer` | POST | `/enterprise/crm/customers/:id/unfreeze` | 解冻客户 | 写 | session(会话) | id |  |  | data |
| `Crm_mergeCustomers` | POST | `/enterprise/crm/customers/merge` | 合并客户 | 写 | session(会话) |  |  | primaryId, secondaryId | data |
| `Crm_customerMergePreview` | GET | `/enterprise/crm/customers/merge-preview` | 预览客户合并 | 读 | session(会话) |  | primaryId, secondaryId |  | data |
| `Crm_exportToDataTable` | POST | `/enterprise/crm/data-table/export` | 导出到多维表格 | 写 | session(会话) |  |  | module, dataTableId, tableName, filters | data |
| `Crm_duplicateCheck` | GET | `/enterprise/crm/duplicates` | CRM查重 | 读 | session(会话) |  | name, phone, email |  | data |
| `Crm_exportTasks` | GET | `/enterprise/crm/export-tasks` | 查看导出任务 | 读 | session(会话) |  |  |  | data |
| `Crm_createExport` | POST | `/enterprise/crm/export-tasks` | 导出CRM数据 | 写 | session(会话) |  |  | module, filters | data |
| `Crm_fieldDefs` | GET | `/enterprise/crm/fields` | 查看自定义字段 | 读 | session(会话) |  | formKey |  | data |
| `Crm_saveFieldDef` | POST | `/enterprise/crm/fields` | 新建或修改自定义字段 | 写 | session(会话) |  |  | id, formKey, fieldKey, name, type, required, options, visible, editable, sort | data |
| `Crm_removeFieldDef` | DELETE | `/enterprise/crm/fields/:id` | 删除自定义字段 | 写 | session(会话) | id |  |  | data |
| `Crm_followComments` | GET | `/enterprise/crm/follow-comments` | 查看跟进评论 | 读 | session(会话) |  | targetType, targetId |  | data |
| `Crm_saveFollowComment` | POST | `/enterprise/crm/follow-comments` | 发表跟进评论 | 写 | session(会话) |  |  | targetType, targetId, content, mentions | data |
| `Crm_followPlans` | GET | `/enterprise/crm/follow-plans` | 查看跟进计划 | 读 | session(会话) |  | targetType, targetId, status |  | data |
| `Crm_saveFollowPlan` | POST | `/enterprise/crm/follow-plans` | 新建或修改跟进计划 | 写 | session(会话) |  |  | id, targetType, targetId, planAt, ownerId, content, reminderAt | data |
| `Crm_updateFollowPlan` | PATCH | `/enterprise/crm/follow-plans/:id` | 更新跟进计划状态 | 写 | session(会话) | id |  | status | data |
| `Crm_followRecords` | GET | `/enterprise/crm/follows` | 查看跟进记录 | 读 | session(会话) |  | targetType, targetId |  | data |
| `Crm_saveFollowRecord` | POST | `/enterprise/crm/follows` | 新建跟进记录 | 写 | session(会话) |  |  | targetType, targetId, type, content, result, nextAt | data |
| `Crm_importCommit` | POST | `/enterprise/crm/imports` | 导入CRM数据 | 写 | session(会话) |  |  | module, rows, skipDuplicates | data |
| `Crm_importPrecheck` | POST | `/enterprise/crm/imports/precheck` | 导入预检 | 写 | session(会话) |  |  | module, rows | data |
| `Crm_invoices` | GET | `/enterprise/crm/invoices` | 查看发票台账 | 读 | session(会话) |  | page, pageSize, contractId, customerId |  | data |
| `Crm_saveInvoice` | POST | `/enterprise/crm/invoices` | 新建或修改发票 | 写 | session(会话) |  |  | id, contractId, businessTitleId, name, amount, invoiceType, taxRate, attachmentKey, remark | data |
| `Crm_removeInvoice` | DELETE | `/enterprise/crm/invoices/:id` | 删除发票 | 写 | session(会话) | id |  |  | data |
| `Crm_leadPools` | GET | `/enterprise/crm/lead-pools` | 查看线索池 | 读 | session(会话) |  |  |  | data |
| `Crm_saveLeadPool` | POST | `/enterprise/crm/lead-pools` | 新建或修改线索池 | 写 | session(会话) |  |  | id, name, description, adminId, auto, enabled, scopeIds, pickRule, recycleRule | data |
| `Crm_removeLeadPool` | DELETE | `/enterprise/crm/lead-pools/:id` | 删除线索池 | 写 | session(会话) | id |  |  | data |
| `Crm_leads` | GET | `/enterprise/crm/leads` | 查看线索列表 | 读 | session(会话) |  | page, pageSize, view, stage, keyword, poolId, ownerId |  | data |
| `Crm_createLead` | POST | `/enterprise/crm/leads` | 新建线索 | 写 | session(会话) |  |  | name, contactName, phone, email, source, stage, ownerId, poolId, products, remark, custom | data |
| `Crm_removeLead` | DELETE | `/enterprise/crm/leads/:id` | 删除线索 | 写 | session(会话) | id |  |  | data |
| `Crm_lead` | GET | `/enterprise/crm/leads/:id` | 查看线索详情 | 读 | session(会话) | id |  |  | data |
| `Crm_updateLead` | PATCH | `/enterprise/crm/leads/:id` | 修改线索 | 写 | session(会话) | id |  |  | data |
| `Crm_assignLead` | POST | `/enterprise/crm/leads/:id/assign` | 分配线索 | 写 | session(会话) | id |  | ownerId | data |
| `Crm_convertLead` | POST | `/enterprise/crm/leads/:id/convert` | 线索转客户 | 写 | session(会话) | id |  | customerId, createOpportunity, opportunityName, amount | data |
| `Crm_freezeLead` | POST | `/enterprise/crm/leads/:id/freeze` | 冻结线索 | 写 | session(会话) | id |  | reason, unfreezeAt | data |
| `Crm_leadOwnerHistory` | GET | `/enterprise/crm/leads/:id/owner-history` | 查看线索负责人历史 | 读 | session(会话) | id |  |  | data |
| `Crm_pickLead` | POST | `/enterprise/crm/leads/:id/pick` | 领取线索 | 写 | session(会话) | id |  |  | data |
| `Crm_toPool` | POST | `/enterprise/crm/leads/:id/pool` | 移入线索池 | 写 | session(会话) | id |  | poolId, reason | data |
| `Crm_updateLeadStage` | POST | `/enterprise/crm/leads/:id/stage` | 推进线索阶段 | 写 | session(会话) | id |  | stage | data |
| `Crm_transferLead` | POST | `/enterprise/crm/leads/:id/transfer` | 转移线索 | 写 | session(会话) | id |  | ownerId, reason | data |
| `Crm_unfreezeLead` | POST | `/enterprise/crm/leads/:id/unfreeze` | 解冻线索 | 写 | session(会话) | id |  |  | data |
| `Crm_batchTransferLead` | POST | `/enterprise/crm/leads/batch-transfer` | 批量转移线索 | 写 | session(会话) |  |  | ids, ownerId | data |
| `Crm_members` | GET | `/enterprise/crm/members` | 查看CRM成员 | 读 | session(会话) |  |  |  | data |
| `Crm_saveMember` | POST | `/enterprise/crm/members` | 配置CRM成员权限 | 写 | session(会话) |  |  | memberUserId, role, dataScope, department | data |
| `Crm_removeMember` | DELETE | `/enterprise/crm/members/:id` | 移除CRM成员 | 写 | session(会话) | id |  |  | data |
| `Crm_opportunities` | GET | `/enterprise/crm/opportunities` | 查看商机列表 | 读 | session(会话) |  | page, pageSize, view, stageId, customerId, keyword |  | data |
| `Crm_createOpportunity` | POST | `/enterprise/crm/opportunities` | 新建商机 | 写 | session(会话) |  |  | customerId, name, amount, stageId, contactId, ownerId, expectedEndAt, products, items, custom | data |
| `Crm_removeOpportunity` | DELETE | `/enterprise/crm/opportunities/:id` | 删除商机 | 写 | session(会话) | id |  |  | data |
| `Crm_opportunity` | GET | `/enterprise/crm/opportunities/:id` | 查看商机详情 | 读 | session(会话) | id |  |  | data |
| `Crm_updateOpportunity` | PATCH | `/enterprise/crm/opportunities/:id` | 修改商机 | 写 | session(会话) | id |  |  | data |
| `Crm_updateOpportunityStage` | POST | `/enterprise/crm/opportunities/:id/stage` | 推进商机阶段 | 写 | session(会话) | id |  | stageId, failureReason, actualEndAt | data |
| `Crm_opportunityRules` | GET | `/enterprise/crm/opportunity-rules` | 查看商机规则 | 读 | session(会话) |  |  |  | data |
| `Crm_saveOpportunityRule` | POST | `/enterprise/crm/opportunity-rules` | 新建或修改商机规则 | 写 | session(会话) |  |  | id, name, scopeIds, auto, conditions | data |
| `Crm_opportunityStages` | GET | `/enterprise/crm/opportunity-stages` | 查看商机阶段 | 读 | session(会话) |  |  |  | data |
| `Crm_saveOpportunityStage` | POST | `/enterprise/crm/opportunity-stages` | 新建或修改商机阶段 | 写 | session(会话) |  |  | id, name, type, sort, winRate | data |
| `Crm_removeOpportunityStage` | DELETE | `/enterprise/crm/opportunity-stages/:id` | 删除商机阶段 | 写 | session(会话) | id |  |  | data |
| `Crm_orderStages` | GET | `/enterprise/crm/order-stages` | 查看订单阶段 | 读 | session(会话) |  |  |  | data |
| `Crm_saveOrderStage` | POST | `/enterprise/crm/order-stages` | 新建或修改订单阶段 | 写 | session(会话) |  |  | id, name, sort | data |
| `Crm_removeOrderStage` | DELETE | `/enterprise/crm/order-stages/:id` | 删除订单阶段 | 写 | session(会话) | id |  |  | data |
| `Crm_orders` | GET | `/enterprise/crm/orders` | 查看订单 | 读 | session(会话) |  | page, pageSize, stageId, keyword |  | data |
| `Crm_createOrder` | POST | `/enterprise/crm/orders` | 新建订单 | 写 | session(会话) |  |  | name, customerId, contractId, amount, stageId, ownerId, remark, items, custom | data |
| `Crm_removeOrder` | DELETE | `/enterprise/crm/orders/:id` | 删除订单 | 写 | session(会话) | id |  |  | data |
| `Crm_order` | GET | `/enterprise/crm/orders/:id` | 查看订单详情 | 读 | session(会话) | id |  |  | data |
| `Crm_updateOrder` | PATCH | `/enterprise/crm/orders/:id` | 修改订单 | 写 | session(会话) | id |  |  | data |
| `Crm_updateOrderStage` | POST | `/enterprise/crm/orders/:id/stage` | 推进订单阶段 | 写 | session(会话) | id |  | stageId | data |
| `Crm_paymentPlans` | GET | `/enterprise/crm/payment-plans` | 查看回款计划 | 读 | session(会话) |  | page, pageSize, view, contractId, customerId |  | data |
| `Crm_savePaymentPlan` | POST | `/enterprise/crm/payment-plans` | 新建或修改回款计划 | 写 | session(会话) |  |  | id, contractId, name, planAmount, planEndAt | data |
| `Crm_removePaymentPlan` | DELETE | `/enterprise/crm/payment-plans/:id` | 删除回款计划 | 写 | session(会话) | id |  |  | data |
| `Crm_paymentRecords` | GET | `/enterprise/crm/payment-records` | 查看回款记录 | 读 | session(会话) |  | page, pageSize, contractId, customerId |  | data |
| `Crm_savePaymentRecord` | POST | `/enterprise/crm/payment-records` | 登记回款记录 | 写 | session(会话) |  |  | id, contractId, paymentPlanId, name, no, recordAmount, recordEndAt, attachmentKey | data |
| `Crm_removePaymentRecord` | DELETE | `/enterprise/crm/payment-records/:id` | 删除回款记录 | 写 | session(会话) | id |  |  | data |
| `Crm_productPrices` | GET | `/enterprise/crm/product-prices` | 查看价格表 | 读 | session(会话) |  |  |  | data |
| `Crm_saveProductPrice` | POST | `/enterprise/crm/product-prices` | 新建或修改价格表 | 写 | session(会话) |  |  | id, name, status, sort, items | data |
| `Crm_removeProductPrice` | DELETE | `/enterprise/crm/product-prices/:id` | 删除价格表 | 写 | session(会话) | id |  |  | data |
| `Crm_products` | GET | `/enterprise/crm/products` | 查看产品 | 读 | session(会话) |  | page, pageSize, keyword |  | data |
| `Crm_saveProduct` | POST | `/enterprise/crm/products` | 新建或修改产品 | 写 | session(会话) |  |  | id, name, code, price, status, sort, description | data |
| `Crm_removeProduct` | DELETE | `/enterprise/crm/products/:id` | 删除产品 | 写 | session(会话) | id |  |  | data |
| `Crm_saveQuickAccess` | POST | `/enterprise/crm/quick-access` | 保存CRM快捷入口 | 写 | session(会话) |  |  | items | data |
| `Crm_quotations` | GET | `/enterprise/crm/quotations` | 查看报价单 | 读 | session(会话) |  | page, pageSize, opportunityId |  | data |
| `Crm_saveQuotation` | POST | `/enterprise/crm/quotations` | 新建或修改报价单 | 写 | session(会话) |  |  | id, opportunityId, name, untilAt, items | data |
| `Crm_removeQuotation` | DELETE | `/enterprise/crm/quotations/:id` | 删除报价单 | 写 | session(会话) | id |  |  | data |
| `Quote_document` | GET | `/enterprise/crm/quotations/:id/document` | 文档 | 读 | session(会话) | id |  |  | data |
| `Quote_send` | POST | `/enterprise/crm/quotations/:id/send` | 发送 | 写 | session(会话) | id |  | customerName, note, templateCode | data |
| `Crm_voidQuotation` | POST | `/enterprise/crm/quotations/:id/void` | 作废报价单 | 写 | session(会话) | id |  | reason | data |
| `Quote_tracking` | GET | `/enterprise/crm/quotations/tracking` | 跟踪 | 读 | session(会话) |  | page, pageSize |  | data |
| `Crm_statsFunnel` | GET | `/enterprise/crm/reports/funnel` | 查看商机漏斗 | 读 | session(会话) |  |  |  | data |
| `Crm_statsOverview` | GET | `/enterprise/crm/reports/overview` | 查看CRM经营概览 | 读 | session(会话) |  | range |  | data |
| `Crm_statsReceivables` | GET | `/enterprise/crm/reports/receivables` | 查看回款报表 | 读 | session(会话) |  |  |  | data |
| `Crm_globalSearch` | GET | `/enterprise/crm/search` | 全局搜索CRM | 读 | session(会话) |  | keyword |  | data |
| `Crm_settings` | GET | `/enterprise/crm/settings` | 查看CRM设置 | 读 | session(会话) |  |  |  | data |
| `Crm_saveSettings` | POST | `/enterprise/crm/settings` | 保存CRM设置 | 写 | session(会话) |  |  | currency, maskPhone, maskEmail, titleFields, aiAnalysisGuide | data |
| `Crm_workbench` | GET | `/enterprise/crm/workbench` | 查看CRM工作台 | 读 | session(会话) |  | range |  | data |

返回 `INDEX.md`。

