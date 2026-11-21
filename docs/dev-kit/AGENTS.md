# AI 开发入口 · aiworkin-enterprise

> 本文件是**规则正文的唯一真源**。根目录 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`、
> `.cursor/rules/`、`.github/copilot-instructions.md`、`llms.txt` 都只是指向本文件的薄入口；
> 后台 `/admin/dev-guide` 也只渲染 `docs/dev-kit/` 下的内容，不另写第二份正文。

## 0. 开始任何任务前

1. 读 `docs/dev-kit/project.json`（命令、端口、目录边界、事实源路径）。
2. 按改动面从下面「规则索引」加载对应 `rules/*.md`，不要一次读完全部。
3. 项目事实以代码、可执行配置与生成物为准；README 与设计文档里的统计数字不当作事实源。
4. 先看 `git status`，保留已有工作区改动，不要覆盖他人未提交的工作。

## 1. 项目一句话

AGPL-3.0-only 企业服务工作台：pnpm monorepo（`frontend/` / `backend/` / `packages/*`），
Hono + Prisma 后端，Next.js App Router 前端，`@enterprise/contracts` 是前后端 / MCP / OpenAPI
的唯一接口事实源。

## 2. 规则索引（正文在 `docs/dev-kit/rules/`，本文件不复制）

| 改动面 | 先读 | 收口必跑 |
|---|---|---|
| 新增 / 修改 HTTP 接口、错误码 | `rules/contracts.md` | `pnpm api:docs && pnpm api:index && pnpm check:architecture` |
| 新增小程序 / 新终端 | `rules/miniapp.md` | `pnpm check:mini-core && pnpm check:architecture` |
| 出站 HTTP / 网络请求 | `rules/network.md` | `pnpm check:architecture` |
| AI 调用 / 文件字节存储 | `rules/ai-and-assets.md` | `pnpm check:architecture` |
| 引入或调整外部代码 | `rules/third-party.md` | `pnpm devkit:check` |
| 任意改动收口 | `rules/testing.md` | `pnpm typecheck && pnpm lint && pnpm check:architecture` |

## 3. 目录边界（可改 / 禁改）

可改：`backend/src`、`frontend/src`、`packages/contracts/src`、`backend/prisma`、`docs/dev-kit`、`shared/mini-core`。

禁改（生成物，一律用命令重生成）：

- `packages/contracts/dist/**`
- `docs/api/openapi.json`
- `docs/dev-kit/api/*`
- `frontend/public/downloads/*.zip`
- `.agents/skills/**`、`.claude/skills/**`（由 `pnpm setup:dev-kit` 同步）
- `backend/prisma/schema.postgres.prisma`
- `node_modules/`、`.git/`、`update/`

## 4. 硬性事实（写「指向」不写「清单」）

- 接口与错误码唯一事实源：`packages/contracts/src/`；完整 schema 在 `docs/api/openapi.json`；
  AI 可读的分域索引在 `docs/dev-kit/api/`（由 `pnpm api:index` 派生）。
- 开发原则的可执行定义：`scripts/check-architecture.mjs` 与 `pnpm check:architecture` 链。
- 外部代码与许可证：`docs/dev-kit/THIRD_PARTY.md`（未决项如实标注，不编造许可）。
- 技能真源：`docs/dev-kit/skills/` → 安装副本 `.agents/skills/` 与 `.claude/skills/`。
- 本系统部署差异与内部约定：后台 `/admin/dev-guide` 的「本站补充说明」（存 `system_settings`）。

## 5. 第一红线

接口清单、错误码表、架构规则表、统计数字**不得写进任何 Markdown 正文**。
只能写「指向生成物 / 契约的路径 + 重生成命令」。

## 6. 完成前

```
pnpm typecheck && pnpm lint && pnpm check:architecture
```

- 改过契约：再加 `pnpm api:docs && pnpm api:index`
- 改过 dev-kit 真源：再加 `pnpm setup:dev-kit && pnpm pack:dev-kit && pnpm devkit:check`
- 如实报告未验证项；不得声称已经跑过实际未跑的命令。

## 7. 技能索引（新增技能时同步这里，`pnpm devkit:check` 校验副本一致性）

- `ub-mode` — 工程纪律三阶段（First Make it Work / Then Make it Right / Practice）。用户运行 `/ub-mode` 时加载。
- `enterprise-contract` — 新增或修改契约端点、错误码时的标准动作。
- `enterprise-miniapp` — 新增小程序 / 新终端的标准动作与公共 core 复用。
- `enterprise-review` — 提交前自检：三条红线 + `check-architecture` 全量核对。
