# 网络出口唯一

## 前端

- 所有请求经 `frontend/src/api/http.ts`；业务代码只调用 `frontend/src/api/*` 的具名方法。
- 页面、Hook、组件不得直接调用 `fetch(` 或 `http`。
- 前端路径统一加 `/api/backend` 前缀（由 `endpoint()` 统一处理），不要硬编码本机地址。

## 后端

- 出站 HTTP 只经 `backend/src/http/transport.ts`（或该层提供的客户端）。
- 禁止在业务模块里裸写 `fetch(`；需要新上游时先确认是否已有传输层封装。
- 第三方回调 / Webhook 必须校验来源与签名；公开通道单独注册，不复用会话鉴权。

## 为什么

一条出站请求绕过统一层，就同时失去超时、重试、代理、审计与出网黑名单。
`scripts/check-architecture.mjs` 会把裸 `fetch(` 直接判为架构违规。

## 收口

```bash
pnpm check:architecture
```
