<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：ERP进销存（`erp`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Erp_aiInsight` | POST | `/enterprise/erp/ai/insight` | AI 经营洞察 | 写 | session(会话) |  |  | kind, horizonDays | data |
| `Erp_listCategories` | GET | `/enterprise/erp/categories` | 列表类目 | 读 | session(会话) |  |  |  | data |
| `Erp_removeCategory` | POST | `/enterprise/erp/categories/remove` | 删除类目 | 写 | session(会话) |  |  | id | data |
| `Erp_saveCategory` | POST | `/enterprise/erp/categories/save` | 保存类目 | 写 | session(会话) |  |  | id, code, name, parentId, sortOrder | data |
| `Erp_listExpenses` | GET | `/enterprise/erp/expenses` | 列表费用报销 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Erp_decideExpense` | POST | `/enterprise/erp/expenses/decide` | 处理费用报销 | 写 | session(会话) |  |  | id, decision, note | data |
| `Erp_saveExpense` | POST | `/enterprise/erp/expenses/save` | 保存费用报销 | 写 | session(会话) |  |  | id, projectId, department, items, note, submit | data |
| `Erp_listMoves` | GET | `/enterprise/erp/moves` | 列表出入库 | 读 | session(会话) |  | page, pageSize, warehouseId, type, variantId |  | data |
| `Erp_saveMove` | POST | `/enterprise/erp/moves/save` | 保存出入库 | 写 | session(会话) |  |  | type, warehouseId, toWarehouseId, variantId, quantity, unitCost, note | data |
| `Erp_overview` | GET | `/enterprise/erp/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Erp_listPayables` | GET | `/enterprise/erp/payables` | 列表应付账款 | 读 | session(会话) |  | page, pageSize, status, q, approvalStatus |  | data |
| `Erp_decidePayable` | POST | `/enterprise/erp/payables/decide` | 处理应付 | 写 | session(会话) |  |  | id, decision, note | data |
| `Erp_payPayable` | POST | `/enterprise/erp/payables/pay` | 支付应付 | 写 | session(会话) |  |  | id, amount, note | data |
| `Erp_savePayable` | POST | `/enterprise/erp/payables/save` | 保存应付 | 写 | session(会话) |  |  | id, code, vendorId, sourceType, sourceId, amount, dueDate, recurrence, nextAt, note | data |
| `Erp_listPricePolicies` | GET | `/enterprise/erp/price-policies` | 列表价格策略 | 读 | session(会话) |  |  |  | data |
| `Erp_removePricePolicy` | POST | `/enterprise/erp/price-policies/remove` | 删除价格策略 | 写 | session(会话) |  |  | id | data |
| `Erp_savePricePolicy` | POST | `/enterprise/erp/price-policies/save` | 保存价格策略 | 写 | session(会话) |  |  | id, name, scope, scopeId, discountPct, minQty, status | data |
| `Erp_listProducts` | GET | `/enterprise/erp/products` | 列表商品 | 读 | session(会话) |  | page, pageSize, q, categoryId, status |  | data |
| `Erp_removeProduct` | POST | `/enterprise/erp/products/remove` | 删除商品 | 写 | session(会话) |  |  | id | data |
| `Erp_saveProduct` | POST | `/enterprise/erp/products/save` | 保存商品 | 写 | session(会话) |  |  | id, code, name, categoryId, unit, spec, barcode, purchasePrice, salePrice, taxRate, status, note | data |
| `Erp_listPurchaseOrders` | GET | `/enterprise/erp/purchase-orders` | 列表采购订单 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Erp_decidePurchaseOrder` | POST | `/enterprise/erp/purchase-orders/decide` | 处理采购订单 | 写 | session(会话) |  |  | id, decision, note | data |
| `Erp_savePurchaseOrder` | POST | `/enterprise/erp/purchase-orders/save` | 保存采购订单 | 写 | session(会话) |  |  | id, vendorId, projectId, sourceType, sourceNo, warehouseId, items, expectedAt, note | data |
| `Erp_listReceipts` | GET | `/enterprise/erp/receipts` | 列表登记回执 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Erp_createReceipt` | POST | `/enterprise/erp/receipts/create` | 新建登记回执 | 写 | session(会话) |  |  | purchaseOrderId, items, note | data |
| `Erp_decideReceipt` | POST | `/enterprise/erp/receipts/decide` | 处理登记回执 | 写 | session(会话) |  |  | id, decision, note | data |
| `Erp_listReceivables` | GET | `/enterprise/erp/receivables` | 列表应收账款 | 读 | session(会话) |  | page, pageSize, status, q |  | data |
| `Erp_receivePayment` | POST | `/enterprise/erp/receivables/receive` | 核销收款 | 写 | session(会话) |  |  | id, amount, note | data |
| `Erp_saveReceivable` | POST | `/enterprise/erp/receivables/save` | 保存应收 | 写 | session(会话) |  |  | id, code, customerName, customerId, contractId, sourceType, sourceId, amount, dueDate, note | data |
| `Erp_listStock` | GET | `/enterprise/erp/stock` | 列表库存 | 读 | session(会话) |  | page, pageSize, warehouseId, q, lowOnly |  | data |
| `Erp_listStockRequests` | GET | `/enterprise/erp/stock-requests` | 列表库存申请 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Erp_decideStockRequest` | POST | `/enterprise/erp/stock-requests/decide` | 处理库存申请 | 写 | session(会话) |  |  | id, decision, note | data |
| `Erp_saveStockRequest` | POST | `/enterprise/erp/stock-requests/save` | 保存库存申请 | 写 | session(会话) |  |  | warehouseId, projectId, items, note | data |
| `Erp_stockAlerts` | GET | `/enterprise/erp/stock/alerts` | 库存库存预警 | 读 | session(会话) |  |  |  | data |
| `Erp_listTaxRates` | GET | `/enterprise/erp/tax-rates` | 列表财税费率 | 读 | session(会话) |  |  |  | data |
| `Erp_removeTaxRate` | POST | `/enterprise/erp/tax-rates/remove` | 删除财税费率 | 写 | session(会话) |  |  | id | data |
| `Erp_saveTaxRate` | POST | `/enterprise/erp/tax-rates/save` | 保存财税费率 | 写 | session(会话) |  |  | id, name, rate, kind, note | data |
| `Erp_listVariants` | GET | `/enterprise/erp/variants` | 列表规格 | 读 | session(会话) |  | productId, q |  | data |
| `Erp_removeVariant` | POST | `/enterprise/erp/variants/remove` | 删除规格 | 写 | session(会话) |  |  | id | data |
| `Erp_saveVariant` | POST | `/enterprise/erp/variants/save` | 保存规格 | 写 | session(会话) |  |  | id, productId, sku, name, attributes, purchasePrice, salePrice, status | data |
| `Erp_listVendors` | GET | `/enterprise/erp/vendors` | 列表供应商 | 读 | session(会话) |  | page, pageSize, q |  | data |
| `Erp_removeVendor` | POST | `/enterprise/erp/vendors/remove` | 删除供应商 | 写 | session(会话) |  |  | id | data |
| `Erp_saveVendor` | POST | `/enterprise/erp/vendors/save` | 保存供应商 | 写 | session(会话) |  |  | id, partyId, code, name, contactName, phone, email, taxNo, address, status, note | data |
| `Erp_listWarehouses` | GET | `/enterprise/erp/warehouses` | 列表仓库 | 读 | session(会话) |  |  |  | data |
| `Erp_removeWarehouse` | POST | `/enterprise/erp/warehouses/remove` | 删除仓库 | 写 | session(会话) |  |  | id | data |
| `Erp_saveWarehouse` | POST | `/enterprise/erp/warehouses/save` | 保存仓库 | 写 | session(会话) |  |  | id, code, name, address, managerId, status | data |

返回 `INDEX.md`。

