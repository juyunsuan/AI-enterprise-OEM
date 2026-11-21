# 新增 / 修改接口的标准动作

## 1. 先改契约

- 端点写进 `packages/contracts/src/<domain>.ts`，并汇总进 `endpoints.ts`。
- 参数、查询、请求体、响应全部用 Zod schema；类型从 schema 推导。
- 契约文件只 import `zod` 与相对路径模块，不引入服务端运行时。
- 不写 `as` 类型断言（`as const` 除外），不复制服务端类型。

## 2. 再改后端

- 控制器方法名 = operationId 去掉前缀后的首字母小写名（`moduleHandlers` 按此派发）。
- 参数顺序固定：`user → 路径参数 → query（有则传）→ body（有则传）`。
- 在 `backend/src/http/automation-routes.ts` 用 `moduleHandlers('<前缀>_', controller)` 注册。
- 管理员接口在控制器里调用 `requireAdmin`（装配层注入），不要绕过身份收口。
- 错误用 `BusinessException` + 统一错误码，不返回裸字符串。

## 3. 再改前端

- 业务 API 放 `frontend/src/api/<domain>.ts`，用 `endpoint(endpoints.Xxx_yyy)`。
- 页面与 Hook 不得直接调用 `http`，也不得手写 `/api/backend` 路径。
- 前端只消费契约输出的类型，不复制后端 DTO。

## 4. 收口必跑

```bash
pnpm --filter @enterprise/contracts build
pnpm api:docs        # 重生成 docs/api/openapi.json
pnpm api:index       # 重生成 docs/dev-kit/api/
pnpm check:architecture
```

`docs/api/openapi.json` 由 CI 逐字节比对；改了契约不重生成会直接红。
越权用例：涉及租户 / 顾客态 / 管理员身份的端点，补一条拒绝路径的测试或显式校验。
