# 接口说明

## 事实源在哪

- 唯一真相：`packages/contracts/src/`（端点在 `endpoints.ts` 汇总）。
- 完整机器可读 schema：`docs/api/openapi.json`（大文件，**不要整份读入上下文**）。
- AI 可读的分域索引：`docs/dev-kit/api/INDEX.md` 与 `docs/dev-kit/api/<domain>.md`（自动生成）。

## 通道

| 通道 | 前缀 | 鉴权 |
|---|---|---|
| 用户会话 | `/enterprise/**` | 登录会话令牌 |
| 机器通道 | `/api/v1/**` | `ek_` 前缀 API Key（MCP / 外部集成） |
| 公开通道 | `/api/public/**` | 按场景校验来源、签名或设备令牌 |
| 平台管理 | `/enterprise/admin/**` | `requireAdmin`（平台管理员） |

前端统一通过 `frontend/src/api/http.ts` 发请求，`endpoint()` 会自动加 `/api/backend` 前缀。

## 常用命令

```bash
pnpm --filter @enterprise/contracts build
pnpm api:docs      # 重生成 docs/api/openapi.json
pnpm api:index     # 重生成 docs/dev-kit/api/ 分域索引
```

CI 会对 `openapi.json` 做逐字节比对；改契约后不重生成会失败。

## 怎么查接口

1. 先看 `api/INDEX.md` 找到业务域，再读对应的 `api/<domain>.md` 看端点摘要。
2. 需要完整参数 / 响应结构时，在 `docs/api/openapi.json` 里按 path 精确查找，不要整份加载。
3. 想看 MCP 暴露的操作，用契约派生的 `mcpOperations()` 或 `/developer/api-mcp-skill` 的 API 页签。

## 红线

接口清单、错误码表、统计数字不写进任何 Markdown 正文；只写生成物路径和重生成命令。
