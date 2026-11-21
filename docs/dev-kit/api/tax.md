<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：财税服务（`tax`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_taxList` | GET | `/api/v1/tax/declarations` | 财税列表 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_taxCreate` | POST | `/api/v1/tax/declarations` | 新建财税 | 写 | key(API Key) |  |  |  | data |
| `Tax_sets` | GET | `/enterprise/tax/account-sets` | 设置 | 读 | session(会话) |  |  |  | data |
| `Tax_createSet` | POST | `/enterprise/tax/account-sets` | 新建设置 | 写 | session(会话) |  |  | name, enterpriseId | data |
| `Tax_setDetail` | GET | `/enterprise/tax/account-sets/:id` | 设置详情 | 读 | session(会话) | id |  |  | data |
| `Tax_archiveSet` | POST | `/enterprise/tax/account-sets/:id/archive` | 归档设置 | 写 | session(会话) | id |  |  | data |
| `Tax_setPage` | GET | `/enterprise/tax/account-sets/page` | 设置页面 | 读 | session(会话) |  | page, pageSize |  | data |
| `Tax_consultations` | GET | `/enterprise/tax/consultations` | 咨询 | 读 | session(会话) |  |  |  | data |
| `Tax_ask` | POST | `/enterprise/tax/consultations` | 提问 | 写 | session(会话) |  |  | question | data |
| `Tax_reply` | POST | `/enterprise/tax/consultations/:id/reply` | 回复 | 写 | session(会话) | id |  | answer | data |
| `Tax_decls` | GET | `/enterprise/tax/declarations` | 申报单 | 读 | session(会话) |  |  |  | data |
| `Tax_createDecl` | POST | `/enterprise/tax/declarations` | 新建申报单 | 写 | session(会话) |  |  |  | data |
| `Tax_declDetail` | GET | `/enterprise/tax/declarations/:id` | 申报单详情 | 读 | session(会话) | id |  |  | data |
| `Tax_declarationContacts` | POST | `/enterprise/tax/declarations/:id/contacts` | 修改申报单联系方式 | 写 | session(会话) | id |  |  | data |
| `Tax_form` | POST | `/enterprise/tax/declarations/:id/form` | 生成申报表单 | 写 | session(会话) | id |  |  | data |
| `Tax_pay` | POST | `/enterprise/tax/declarations/:id/pay` | 支付 | 写 | session(会话) | id |  |  | data |
| `Tax_qc` | POST | `/enterprise/tax/declarations/:id/qc` | 质检 | 写 | session(会话) | id |  | action, confirms, note | data |
| `Tax_runAi` | POST | `/enterprise/tax/declarations/:id/run-ai` | 运行AI | 写 | session(会话) | id |  |  | data |
| `Tax_declarationPage` | GET | `/enterprise/tax/decls/page` | 申报页面 | 读 | session(会话) |  | page, pageSize, status, keyword, enterpriseId, provider |  | data |
| `Tax_declarationStats` | GET | `/enterprise/tax/decls/stats` | 申报统计 | 读 | session(会话) |  |  |  | data |
| `Tax_materialPacks` | GET | `/enterprise/tax/material-packs` | 材料包 | 读 | session(会话) |  |  |  | data |
| `Tax_materialPackDetail` | GET | `/enterprise/tax/material-packs/:id` | 材料包详情 | 读 | session(会话) | id |  |  | data |
| `Tax_materialAnalysis` | GET | `/enterprise/tax/material-packs/:id/analysis` | 材料分析 | 读 | session(会话) | id |  |  | data |
| `Tax_materialPackContacts` | POST | `/enterprise/tax/material-packs/:id/contacts` | 修改材料包联系方式 | 写 | session(会话) | id |  |  | data |
| `Tax_generateDeclarations` | POST | `/enterprise/tax/material-packs/:id/generate-declarations` | 生成申报单 | 写 | session(会话) | id |  |  | data |
| `Tax_ocrInvoice` | POST | `/enterprise/tax/material-packs/:id/ocr-invoice` | 识别发票 | 写 | session(会话) | id |  | image_base64, mime | data |
| `Tax_addMaterialRow` | POST | `/enterprise/tax/material-packs/:id/rows` | 添加材料行 | 写 | session(会话) | id |  | section, row | data |
| `Tax_removeMaterialRow` | DELETE | `/enterprise/tax/material-packs/:id/rows/:rowId` | 删除材料行 | 写 | session(会话) | id, rowId | section |  | data |
| `Tax_updateMaterialRow` | PATCH | `/enterprise/tax/material-packs/:id/rows/:rowId` | 修改材料行 | 写 | session(会话) | id, rowId |  | section, patch | data |
| `Tax_submitMaterialPack` | POST | `/enterprise/tax/material-packs/:id/submit` | 提交材料包 | 写 | session(会话) | id |  |  | data |
| `Tax_currentMaterialPack` | GET | `/enterprise/tax/material-packs/current` | 当前材料包 | 读 | session(会话) |  | period |  | data |
| `Tax_materialPage` | GET | `/enterprise/tax/material-packs/page` | 材料页面 | 读 | session(会话) |  | page, pageSize |  | data |
| `Tax_meta` | GET | `/enterprise/tax/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Tax_ocrStatus` | GET | `/enterprise/tax/ocr/status` | OCR状态 | 读 | session(会话) |  |  |  | data |
| `Tax_planList` | GET | `/enterprise/tax/plans` | 计划列表 | 读 | session(会话) |  | page, pageSize, period, enterpriseId, accountSetId |  | data |
| `Tax_fromPlan` | POST | `/enterprise/tax/plans/:id/create-decl` | 由计划生成申报单 | 写 | session(会话) | id |  |  | data |
| `Tax_generatePlans` | POST | `/enterprise/tax/plans/generate` | 生成计划 | 写 | session(会话) |  |  |  | data |
| `Tax_planStats` | GET | `/enterprise/tax/plans/stats` | 计划统计 | 读 | session(会话) |  | accountSetId |  | data |
| `Tax_providers` | GET | `/enterprise/tax/providers` | 服务商 | 读 | session(会话) |  |  |  | data |
| `Tax_records` | GET | `/enterprise/tax/records` | 记录 | 读 | session(会话) |  | kind |  | data |
| `Tax_deleteRecord` | DELETE | `/enterprise/tax/records/:id` | 删除记录 | 写 | session(会话) | id |  |  | data |
| `Tax_recordPage` | GET | `/enterprise/tax/records/page` | 记录页面 | 读 | session(会话) |  | page, pageSize, kind |  | data |
| `Tax_trial` | POST | `/enterprise/tax/trial` | 试算 | 写 | session(会话) |  |  | tax_type, form | data |
| `Tax_saveTrial` | POST | `/enterprise/tax/trial/save` | 保存试算 | 写 | session(会话) |  |  | kind, title, snapshot | data |

返回 `INDEX.md`。

