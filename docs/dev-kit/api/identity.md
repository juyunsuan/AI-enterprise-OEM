<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：身份与资质（`identity`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Identity_removeEnterprise` | DELETE | `/enterprise/identity/enterprise` | 删除企业 | 写 | session(会话) |  |  |  | data |
| `Identity_enterprise` | GET | `/enterprise/identity/enterprise` | 企业 | 读 | session(会话) |  |  |  | data |
| `Identity_updateEnterprise` | PATCH | `/enterprise/identity/enterprise` | 修改企业 | 写 | session(会话) |  |  |  | data |
| `Identity_submitEnterprise` | POST | `/enterprise/identity/enterprise` | 提交企业 | 写 | session(会话) |  |  |  | data |
| `Identity_providerApplication` | GET | `/enterprise/identity/provider-application` | 服务商申请 | 读 | session(会话) |  |  |  | data |
| `Identity_submitProvider` | POST | `/enterprise/identity/provider-application` | 提交服务商 | 写 | session(会话) |  |  |  | data |
| `Identity_removeProvider` | DELETE | `/enterprise/identity/provider-application/:id` | 删除服务商 | 写 | session(会话) | id |  |  | data |
| `Identity_updateProvider` | PATCH | `/enterprise/identity/provider-application/:id` | 修改服务商 | 写 | session(会话) | id |  |  | data |
| `Identity_upload` | POST | `/enterprise/identity/provider-application/attachments` | 上传 | 写 | session(会话) |  |  | files | data |
| `Identity_staffProfile` | GET | `/enterprise/identity/staff-profile` | 职员档案 | 读 | session(会话) |  |  |  | data |
| `Identity_submitStaff` | POST | `/enterprise/identity/staff-profile` | 提交职员 | 写 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

