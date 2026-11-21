# 架构与目录边界

## 分层

1. **契约层** `packages/contracts/src/`：HTTP 端点、参数/响应 Zod schema、错误码、MCP 操作派生。
   前端、后端、OpenAPI、MCP 都从这里取事实，不存在第二份接口清单。
2. **后端** `backend/src/`：Hono 路由 + 领域服务 + Prisma。管理器按业务域分目录，
   每个域自带 `*.service.ts` / `*.controller.ts` / `*.routes.ts`（需要时）。
3. **前端** `frontend/src/`：Next.js App Router。页面 → 业务 API（`src/api/*`）→ `src/api/http.ts`。
4. **公共终端底座** `shared/mini-core/`：多个原生小程序共用的请求 / 会话 / 鉴权骨架。
5. **小程序模板**：各 `miniprogram-*` / `*-miniprogram` 目录，只承载差异，公共骨架由脚本同步。
6. **客户端**：`awbot-app/`（安卓/iOS）、`bot-host-client/`、`workbuddy-host-client/` 等，
   与主仓通过公开通道或契约接口协作。

## 边界规则

- `commerce-core/` 只允许纯函数，不得 import 业务模块、数据库或契约。
- `brand-mall/` 与 `marketplace/` 互不 import；共享 SCRM / 客服数据只走端口。
- ERP 数据只能在 `backend/src/erp/` 内读写，其他域走 `ErpPort` / `ErpWritePort`。
- 浏览器模块不得 import 后端源码、Prisma 生成物或服务端密钥。
- 契约文件只能 import `zod` 与相对路径模块；类型由 schema 推导，禁止类型断言（`as const` 除外）。

## 事实源

- 可执行规则：`scripts/check-architecture.mjs`（由 `pnpm check:architecture` 串联全部守卫）。
- 接口：`packages/contracts/src/endpoints.ts` 与派生索引 `docs/dev-kit/api/`。
- 数据模型：`backend/prisma/schema.prisma`；PostgreSQL schema 是派生物，不手改。

改动跨域时先确认边界，再改代码；不要为了少写一个 import 把两条链路合并。
