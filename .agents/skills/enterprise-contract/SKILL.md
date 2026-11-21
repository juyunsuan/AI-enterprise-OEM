---
name: enterprise-contract
description: >
  Add or change an HTTP endpoint in this repository. Use when the task touches
  packages/contracts/src, API paths, request/response schemas, or error codes.
  Covers contract purity, backend moduleHandlers dispatch, frontend endpoint()
  calls, OpenAPI/Index regeneration, and the mandatory architecture check.
---

# enterprise-contract

## 何时用

- 新增 / 修改 / 删除 HTTP 接口。
- 调整请求参数、查询、请求体或响应结构。
- 新增错误码或改变错误语义。

## 步骤

1. **改契约**：在 `packages/contracts/src/<domain>.ts` 定义端点，汇总进 `endpoints.ts`。
   - 只 import `zod` 与相对路径模块。
   - 类型由 schema 推导，禁止 `as` 断言（`as const` 除外）。
   - 响应统一使用 `code / message / data` 信封（页面接口按既有范式）。
2. **改后端**：
   - 控制器方法名 = operationId 去掉前缀后首字母小写。
   - 方法参数顺序：`user → 路径参数 → query（有则传）→ body（有则传）`。
   - 在 `backend/src/http/automation-routes.ts` 用 `moduleHandlers('<前缀>_', controller)` 注册。
   - 管理员端点在控制器里调用注入的 `requireAdmin`。
   - 领域错误用 `BusinessException` + 统一错误码。
3. **改前端**：
   - 业务方法放 `frontend/src/api/<domain>.ts`，用 `endpoint(endpoints.Xxx_yyy)`。
   - 页面与 Hook 不得直接调用 `http` 或手写 `/api/backend`。
4. **重生成与校验**：

```bash
pnpm --filter @enterprise/contracts build
pnpm api:docs
pnpm api:index
pnpm check:architecture
```

5. **安全**：涉及租户、顾客态、管理员身份的端点，至少验证一条拒绝路径。
   顾客态数据必须同时带站点/店铺标识与顾客标识。

## 反模式

- 在 README 或后台页手写接口清单 / 错误码表。
- 在契约里 import 后端服务或数据库类型。
- 为了少改一个文件，绕过 `moduleHandlers` 直接手写路由且不做契约校验。
- 改完契约不重生成 `openapi.json` 与分域索引。
