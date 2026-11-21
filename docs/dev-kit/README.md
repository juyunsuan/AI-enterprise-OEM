# 开发套件（dev-kit）

这是给**人和 AI 工具**共用的一份仓库级开发指引真源。它不是后台文案的副本，
后台 `/admin/dev-guide` 只是它的只读渲染与分发入口。

## 从哪开始

1. 先读 [AGENTS.md](AGENTS.md)（规则总索引）。
2. 机器可读的环境与命令见 [project.json](project.json)。
3. 按任务加载 `rules/*.md`；人读长文在 `guides/*.md`。
4. 接口清单看 `api/INDEX.md`（自动生成），许可与外部代码看 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 一次性接入

```bash
pnpm setup:dev-kit      # 幂等生成根目录薄入口 + 同步 skills + 生成接口索引
pnpm devkit:check       # 逐字节校验生成物、入口与技能副本
pnpm pack:dev-kit       # 重新打包 frontend/public/downloads 下的套件 zip
```

已接入的工具入口：根 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`llms.txt`、
`.cursor/rules/enterprise.mdc`、`.github/copilot-instructions.md`。
技能副本：`.agents/skills/`（Codex / Cursor / Copilot / Gemini）与 `.claude/skills/`（Claude Code）。

## 三条红线

1. 规则正文只写在本目录；根入口和后台页只放指针，不复制正文。
2. 接口清单、错误码表、规则表、统计数字不写进 Markdown，只写生成物路径与重生成命令。
3. 生成物不手改：`pnpm api:docs`、`pnpm api:index`、`pnpm setup:dev-kit`、`pnpm pack:dev-kit`。

## 目录

- `rules/`：按改动面拆分的规则分片（契约、网络、小程序、AI/资产、外部代码、测试、架构）。
- `guides/`：后台四个页签渲染的人读长文。
- `api/`：由契约派生的分域接口索引（自动生成）。
- `skills/`：技能真源；`templates/`：工具薄入口模板。
- `THIRD_PARTY.md`：外部引入代码清单（半自动汇总 + 人工核注）。
