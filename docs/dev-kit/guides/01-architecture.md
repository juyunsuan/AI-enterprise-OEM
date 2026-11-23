# 架构说明

## 一句话

这是一套 AGPL-3.0-only 的企业服务工作台：pnpm monorepo，后端 Hono + Prisma，前端 Next.js App Router，
多个原生小程序与桌面 / 移动客户端共用同一套契约与公开通道。

## 六层分工

1. **契约层**：`packages/contracts/src/`。HTTP 端点、Zod schema、错误码、MCP 操作都从这里派生。
   前后端、OpenAPI 文档、MCP Server、开发者页签共用这一份事实源。
2. **后端应用层**：`backend/src/`。按业务域分目录，路由只做鉴权、校验与派发，业务落在服务。
3. **前端应用层**：`frontend/src/`。页面与组件只调用 `src/api/*` 的业务方法。
4. **公共终端底座**：`shared/mini-core/`。多个小程序共用的请求、会话、鉴权与登录骨架。
5. **小程序模板**：各 `miniprogram-*` / `*-miniprogram` 目录，只承载终端差异。
6. **客户端与外部终端**：`awbot-app/`、`workbuddy-host-client/` 等，
   通过公开通道或契约接口与主仓协作，不直接读写主库。AWBotDSH 桌面端源码自 v1.8.x 起不在本仓。

## 鉴权与数据归属

- 用户会话：`/enterprise/**` 走登录会话令牌，由统一身份服务解析 `CurrentUser`。
- 机器通道：`/api/v1/**` 走 API Key（`ek_` 前缀），用于 MCP 与外部集成。
- 公开通道：`/api/public/**` 只用于访客侧或设备回调，单独校验来源与签名。
- 平台管理：`/enterprise/admin/**` 必须通过 `requireAdmin`；前端另有 `PLATFORM_ADMIN` 身份收口。
- 顾客态数据必须同时满足「站点/店铺标识 + 顾客标识」两个条件，不能只按其中一个查。
- C 端令牌不得进入 `/enterprise/**`，反之亦然；两条令牌链物理隔离。

## 数据与存储

- 关系库由 Prisma 管理；MySQL 为默认方言，PostgreSQL 由生成脚本派生 schema。
- 文件字节统一经存储门面写对象存储，并登记数字资产；业务模块不直连 OSS 客户端。
- AI 调用统一经模型网关，先过闸门、后计量。

## 可执行边界

架构规则不是文字约定：`scripts/check-architecture.mjs` 会检查网络出口、契约纯度、
ERP 直连、商城互引、AI 闸门与计量、字节写入门面、小程序单一真源等项目。

```bash
pnpm check:architecture
```

更细的规则见 `docs/dev-kit/rules/`；接口清单见 `docs/dev-kit/api/INDEX.md`（自动生成）。
