# 二次开发指引与 AI 工具一键接入方案

> 分析对象：`aiworkin-enterprise`（AGPL-3.0-only；Hono 后端 + Next.js 前端 + `@enterprise/contracts` 契约 + 6 个小程序 + 桌面/移动客户端）
> 编制时间：2026-11-19　|　方法：全量静态代码审阅 + 关键文件逐行核验 + 外部标准核实（AGENTS.md / Agent Skills）
> 本文**只做方案，不含实现**；所有现状判断均标注文件路径与行号，可逐条回查。执行请按 [第十部分 分阶段路线图](#十分阶段执行路线图) 逐项落地。
> 交叉引用：[技术架构现状分析与优化指引.md](技术架构现状分析与优化指引.md)（第十一章已有「开发指引」文字版）、[AI编程（后台自助改码）设计方案.md](AI编程（后台自助改码）设计方案.md)、[AWBotDSH迁移优化方案.md](AWBotDSH迁移优化方案.md)。

---

## 目录

- [一、结论先行：七个改变方案性质的事实](#一结论先行七个改变方案性质的事实)
- [二、需求拆解与核心主张](#二需求拆解与核心主张)
- [三、目标架构（文本架构图）](#三目标架构文本架构图)
- [四、单一真源层：dev-kit 目录布局与各文件职责](#四单一真源层dev-kit-目录布局与各文件职责)
- [五、工具适配层：六个薄入口与 skills 双目录](#五工具适配层六个薄入口与-skills-双目录)
- [六、一键配置：本地脚本 + 后台下载套件](#六一键配置本地脚本--后台下载套件)
- [七、管理员后台「二次开发指引」板块设计](#七管理员后台二次开发指引板块设计)
- [八、接口说明与外部代码说明的自动化（防漂移）](#八接口说明与外部代码说明的自动化防漂移)
- [九、ub-mode 与开发原则 skill 的接入](#九ub-mode-与开发原则-skill-的接入)
- [十、分阶段执行路线图（按此执行）](#十分阶段执行路线图按此执行)
- [十一、验收清单](#十一验收清单)
- [十二、风险与合规边界](#十二风险与合规边界)
- [附：关键文件索引](#附关键文件索引)

---

# 一、结论先行：七个改变方案性质的事实

调研后有七个事实会直接改变任务定义，必须先明确，否则方案会建立在错误假设上：

**事实 1｜「在后台加一个指引页」只解决人读，没解决机器读；两者的答案应是同一份事实源的两个视图。**
Codex、Cursor、Claude Code、Copilot、Gemini CLI 在 2026 年已收敛到 **AGENTS.md（项目指令）+ SKILL.md（Agent Skills，按需加载的技能包）** 两套开放标准：AGENTS.md 由 Linux Foundation 旗下 Agentic AI Foundation 托管，Codex / Amp / Google Jules / Cursor / Factory 共同发起；Agent Skills 由 Anthropic 提出、2026-11 成为 Linux Foundation 项目，Claude Code / Codex / Cursor / Copilot / Gemini CLI 共用同一格式。Codex 官方 `developers.openai.com/codex/concepts/customization` 明确分层：**AGENTS.md 管「每次都要遵守的项目事实」，Skills 管「可复用工作流与领域知识」，config.toml 管客户端配置，MCP 管外部系统，Rules 管 sandbox 命令许可**——把开发原则塞进一个网页，AI 工具一个字都读不到。
→ 结论：后台页面必须**渲染**同一份仓库真源，而不是另写一份正文。

**事实 2｜主仓根目录目前没有任何 AI 工具入口，但项目里已有两套现成范式可抄。**
逐一核验：根 `AGENTS.md` / `CLAUDE.md` / `.cursorrules` / `.cursor/rules/` / `.github/copilot-instructions.md` / `.windsurfrules` / `.gemini/` / `.codex/` **全部不存在**（`.github/` 下只有 `workflows/ci.yml`）。而：
- `awbot-app/AGENTS.md`（119 行）是本项目内唯一成体系的样板：仓库布局 → 8 条按改动面选的命令 → 6 组硬规则/禁止事项 → 代码审查原则 → `.agents/skills/` 技能索引；`awbot-app/CLAUDE.md` 内容与其 md5 相同（Windows 检出为副本而非链接）。
- `.scratch/crmeb-v8/CRMEB-v8.0/.crmeb/skills/project-standard-bootstrap/`（参考副本，`.gitignore:39` 忽略）是一套**完整的一键初始化器**：`scripts/init-project-standard.mjs` 遍历 `assets/project-template/`，"目标已存在→保留，缺失→copyFileSync"（`:37-50`），一次生成 6 个工具薄入口；`references/ai-tool-adapters.md:9-16` 给出 Codex/Claude/Cursor/Copilot/Gemini/llms.txt 适配矩阵；`:22-26` 明确「**默认用入库薄文件而不是软链接，保证 Windows 和压缩包场景可用**」。
→ 结论：不需要从零设计，把这套范式按本仓事实填充即可；且它证明了"薄指针 + 单一真源 + 不覆盖"是可行路线。

**事实 3｜`ub-mode` 已经是标准 SKILL.md，但从未被真正安装、打包或校验。**
`docs/ub-mode/SKILL.md`（153 行）frontmatter 为 `name: ub-mode` + `description`，正文三段 `First Make it Work / Then Make it Right / Practice`；`docs/ub-mode/README.md:18-20` 的安装说明只有一句手工复制：「Copy SKILL.md into `~/.claude/skills/ub-mode/SKILL.md` …」。全仓引用仅出现在 4 份文档（含 `AI编程（后台自助改码）设计方案.md:173` 的验收「遵循 docs/ub-mode」），`scripts/`、`.github/`、`package.json`、根 README **零命中**；不存在 `.claude/skills/ub-mode`、`.agents/skills/ub-mode`，也没有任何 zip。
→ 结论：「一键导入 ub-mode」缺的不是内容，是**分发通道**。而分发通道项目里已经有两套现成的（见事实 4）。

**事实 4｜平台已有「skill → zip → /downloads/ → 用户下载」的完整链路，且脚本明确点名 Codex。**
`scripts/pack-insight-skills.mjs:7-8` 原文：「zip 根目录摊平（SKILL.md 直接在根）… 用户解压出的目录名即包名，**丢进 BotBuddy / WorkBuddy / Codex 的技能目录就能被识别**」。链路为：契约 `packages/contracts/src/insight.ts:423` 的 `INSIGHT_COLLECTION_SKILLS`（唯一真源）→ 打包脚本 → `frontend/public/downloads/*.zip` → 后端 `insight.service.ts:437-438` 的 `downloadUrl` → 前端 `collection-tabs.tsx:213-223` 下载按钮；一致性由 `scripts/verify-insight-skills.mjs` 守卫，且已挂在 `pnpm check:architecture` 链上（`package.json:41`）。
→ 结论：把 ub-mode 与新增的开发原则 skill 接进这条链路即可，零新建基础设施。

**事实 5｜接口说明已经能自动生成且被 CI 逐字节校验，但产物不适合直接喂给 AI。**
`pnpm api:docs` → `backend/src/http/openapi.ts`（`app.getOpenAPIDocument()`）→ `docs/api/openapi.json`；`pnpm api:docs:check` 逐字节比对，`ci.yml:52` 强制。契约 `packages/contracts/src/endpoints.ts` 是唯一事实源（15,746 行、聚合 70+ 业务域、3041 个端点键），`mcpOperations()`（`mcp.ts:180-199`）派生出 `/developer` 的 API 清单与 MCP `list_operations`——前端注释明确「不存在需要人工维护的第二份清单」。
但 `openapi.json` 是 **10,425,325 字节单行 JSON**、`components.schemas` 只有 1 个（schema 全内联），直接塞给 AI 会爆上下文；`mcpOperations()` 只有 method/path/label，**没有参数结构**。
→ 结论：缺的是一个「面向 AI 的精简派生层」，按域分片，加 `--check` 进 CI；生成 + 校验的套路照抄 `api:docs` 与 `gen-prisma-schema.mjs` 即可。

**事实 6｜开发原则的权威定义其实是可执行脚本，不是文字；而手写文档已经漂移。**
`scripts/check-architecture.mjs`（105 行、10 组规则）才是真正的开发原则：禁裸 `fetch(`、契约层 AST 禁 `as`/外部 import、AI 出口必须同时有闸门+计量、字节出口唯一、ERP 跨域零直连、commerce-core 纯函数、两商城互不引用、mini-core 单一真源……由 `ci.yml:35` 强制。文字版散在三处：`docs/技术架构现状分析与优化指引.md` 第十一章（11.1 新增小程序标准动作 / 11.2 公共能力检查清单 / 11.3 必跑命令 / 11.4 三条红线）、`README.md:612-647` 构建测试章节、`docs/ub-mode/SKILL.md`，三者互不引用、没有根级入口串联。
**漂移已经发生（实证）**：`README.md:25,366,405` 写「3044 个操作」，实测 `openapi.json` 为 **3032** 个 operation / 2577 paths；`README.md:617` 写「102 个套件 / 862 例」，实测 `backend/src`+`backend/test` 共 **225** 个 `*.spec.ts`；`README.md:417` 写「144 个迁移」而 `:631` 写「0001→0052」自相矛盾；8 语言 README 结构大体对齐但内容不同步（中文版独有 2 章、en 版 Automa 段落 29 处 vs 日文 3 处）。
→ 结论：**任何接口清单、错误码表、规则清单、统计数字都不得写进 Markdown 正文**，只能写指向生成物的指针与重生成命令。这是本方案的第一红线。

**事实 7｜后台落点、渲染器、可编辑正文、管理员专区全部现成；外部代码清单则是明确缺口。**
- 后台：`/admin` 是唯一前缀，`ADMIN_SECTIONS`（`frontend/src/config/routes.ts:47-265`，31 项）**一处注册即自动同源**到 `adminRoute`（`:267-282`）、`PAGE_META`（`:961-967`）、侧栏；页面分派只在 `frontend/src/app/admin/[section]/page.tsx:81-111` 加一个三元分支；身份收口（`:49-64`）与后端 `requireAdmin` 现成。已有 `ai-code`（`:238`）、`changelog`（`:224`）、`miniprogram`（`:252`）板块。
- 渲染：`frontend/src/lib/markdown-html.ts` 的 `markdownToHtml()` 支持标题/代码块/列表/引用/链接且做 HTML 转义，已在 `/admin/ai-code` 用 `dangerouslySetInnerHTML` 落地（`ai-code-tab.tsx:57,204,894`）；配 `PageHero`+`TabStrip`（`components/ui/panel.tsx:20,127`）或 antd `Menu` 目录树（`help/page.tsx:426-436`）。前端**零第三方 Markdown/高亮库**。
- 可编辑正文：`mini-guide` 全链路是现成范式——`SystemSetting`（`schema.prisma:183-189`，`system_settings` 单行 JSON）+ `SETTINGS_KEY`（`mini-guide.service.ts:44`）+ `MiniGuideAdmin_view/save` 契约 + 后台 TextArea 编辑与 Drawer 预览（`mini-guide-tab.tsx:160-167,212-245`）。**不必新建表**。
- 管理员专区：`backend/src/help/help-knowledge.ts:21` 已有 `'platform-admin': ['PLATFORM_ADMIN']` 分众，`help-knowledge.part2.ts:368-446` 已有 3 个管理员技术主题；`/help` 与 MCP `Help_search` 同源。`/developer/api-mcp-skill` 已有 `skill/mcp/api` 三页签。
- **缺口**：全仓**没有统一的外部代码清单**。`awbot-app/THIRD_PARTY_NOTICES.md`（986 行）是目前最完整的，但 `:1-8` 把范围限定在 `awbot-app/`：`deepseek-harness` 标 MIT（`:82-105`，含 10 行逐文件映射）、`dsh-Go` 标 AGPL-3.0（`PROVENANCE.md:8-12`）、`dartssh2` 有 `VENDORED.md`；而 **`bot-host-client/` 与其内置的 Automa 1.30.02 没有任何 LICENSE / PROVENANCE / NOTICE**，根 README 对 Automa 只有功能描述无许可标注、对 `deepseek-harness` 与 `new-api` 是 0 命中；`docs/商业授权说明.md:36-38` 明确 awbot-app 第三方组件不在商业授权范围。
→ 结论：后台指引页要「充分说明外部引入代码包」，必须先补一份仓库级清单，并**如实标注尚未补齐的合规项**，不能凭空生成。

---

# 二、需求拆解与核心主张

## 2.1 你的四句话，拆成四个可交付目标

| 你的表述 | 目标 | 交付物 |
|---|---|---|
| 管理员后台增加二次开发指引 | 人读视图 | `/admin/dev-guide` 板块（4 页签） |
| 架构说明、接口说明、外部引入代码包充分说明、开发原则 | 内容四类 | 仓库真源 `docs/dev-kit/` 下的 Markdown + 自动派生的接口索引 + 统一第三方清单 |
| 有没有更好的办法让 Codex 等快速识别本系统 | 机器读入口 | 根目录 6 个薄入口 + `.agents/skills` + `.claude/skills` + `llms.txt` |
| 一键导入 ub-mode 等开发原则 skill、一键完成基础配置 | 一键 | `pnpm setup:dev-kit`（本地）＋后台「下载开发套件 zip」＋可复制的一行命令 |

## 2.2 核心主张（一句话）

> **不要在后台写第二份文档，也不要给每个 AI 工具写一份规则。建立一份仓库级「开发套件」真源 `docs/dev-kit/`，用脚本把它一次投射成 ①6 个工具薄入口 ②2 个 skills 安装目录 ③可下载的 zip ④后台指引页的渲染内容；并用「生成 + `--check` + CI」三件套保证永不漂移。**

四条设计原则，贯穿全文：

1. **单一真源**：规则正文只在 `docs/dev-kit/AGENTS.md` 与 `rules/*.md`；接口只在契约；技能只在 `docs/dev-kit/skills/`。任何工具入口、后台页面、README 都是**指针**。
2. **可执行优先**：能由脚本/CI 判定的，不写文字。开发原则的权威是 `check-architecture.mjs`，AGENTS.md 里只写「改完必跑 `pnpm check:architecture`」。
3. **不覆盖、幂等、Windows 可用**：照抄 `init-project-standard.mjs:37-50` 与 `ai-tool-adapters.md:22-26`（入库薄文件而非软链；存在即保留；`--dry-run` 预览）。
4. **零风险分发**：这是「配置与文档的分发」，不是「改线上源码」。与 `/admin/ai-code` 的 CODE_EDIT 严格区分（见 12.3）。

## 2.3 为什么不建议只做「后台加个页面」

后台页面只有登录后的管理员看得到，而 Codex 打开的是**文件系统**；把内容写在 `system_settings` 里，AI 工具永远读不到，且会形成「后台一份、仓库一份」的双写漂移（这正是事实 6 已发生的问题）。正确关系是：**后台页 = 真源的只读渲染 + 分发台 + 少量管理员补充说明**，真源始终在仓库里、随代码版本化、受 CI 保护。

---

# 三、目标架构（文本架构图）

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ 第 0 层  既有事实源（不动，只被引用）                                          │
│  ┌──────────────────┐ ┌────────────────────┐ ┌────────────────────────────┐  │
│  │ @enterprise/      │ │ scripts/check-     │ │ awbot-app/                │  │
│  │ contracts         │ │ architecture.mjs   │ │ PROVENANCE.md +           │  │
│  │ endpoints.ts      │ │ （10 组规则＝      │ │ THIRD_PARTY_NOTICES.md    │  │
│  │ mcp.ts/errors.ts  │ │  可执行开发原则）  │ │ (MIT/AGPL 逐项声明)       │  │
│  │ 3041 端点         │ │ ci.yml:35 强制     │ │ + README / docs           │  │
│  └────────┬─────────┘ └─────────┬──────────┘ └───────────┬────────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────────┘
            │ 派生                │ 引用（不复制）         │ 汇总（不复制）
            ▼                    ▼                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ 第 1 层  ★ 单一真源：docs/dev-kit/（新增，随代码入库、可版本化）              │
│                                                                               │
│  AGENTS.md            规则总索引：先读什么 / 命令 / 目录边界 / 红线（薄而全）│
│  project.json         机器可读元数据：应用、端口、标准命令、真源版本         │
│  rules/*.md           architecture / contracts / network / miniapp /          │
│                       third-party / testing  —— 正文，全部指向第 0 层        │
│  guides/*.md          架构说明 / 接口说明 / 外部代码说明 / 开发原则（人读）  │
│  api/INDEX.md         ← gen-api-index.mjs 生成（按域分片的接口索引入口）    │
│  api/<domain>.md      ← 同上，每域一个文件；带「自动生成，请勿手改」头      │
│  THIRD_PARTY.md       ← gen-third-party.mjs 汇总 + 人工核注未决项            │
│  skills/<name>/       ub-mode、enterprise-contract、enterprise-miniapp …      │
│      SKILL.md         标准 frontmatter(name+description) + 步骤              │
│      references/      可选，详细资料按需加载                                 │
│  templates/           6 个工具薄入口模板 + llms.txt + run.sh/ps1            │
└──────────────────────────────┬────────────────────────────────────────────────┘
                               │  scripts/setup-dev-kit.mjs（幂等 / 不覆盖 / --check）
             ┌─────────────────┼──────────────────┬────────────────────┐
             ▼                 ▼                  ▼                    ▼
┌────────────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
│ 第 2 层 工具适配   │ │ 第 2 层 skills   │ │ 第 3 层 分发   │ │ 第 3 层 后台视图 │
│ 根 AGENTS.md  ←────┤ │ .agents/skills/  │ │ /downloads/    │ │ /admin/dev-guide │
│ CLAUDE.md    ←────┤ │  (Codex/Cursor/  │ │  dev-kit.zip   │ │ 4 页签渲染真源   │
│ GEMINI.md    ←────┤ │   Copilot/Gemini)│ │  ub-mode.zip   │ │ + 下载按钮       │
│ .cursor/rules/*.mdc│ │ .claude/skills/  │ │  由 pack-dev-  │ │ + 复制一键命令   │
│ .github/copilot-   │ │  (Claude Code)   │ │  kit.mjs 生成  │ │ + 管理员补充说明 │
│   instructions.md  │ │  ← 同步 + diff   │ │  复用 insight  │ │  (SystemSetting) │
│ llms.txt           │ │    校验一致性    │ │  链路           │ │ + /help 专区主题 │
│ ★ 全部是薄指针     │ │                  │ │                │ │ + /developer 页签│
│   不复制规则正文   │ │                  │ │                │ │                  │
└────────────────────┘ └──────────────────┘ └────────────────┘ └──────────────────┘
             │                 │                  │                    │
             └─────────────────┴──────────────────┴────────────────────┘
                               ▼
              ┌────────────────────────────────────────┐
              │ 第 4 层 防漂移（CI）                   │
              │ pnpm devkit:check  逐字节比对所有生成物│
              │ pnpm api:index:check                   │
              │ pnpm check:architecture（已存在）      │
              │ ci.yml 新增 2 步 → 不一致即红          │
              └────────────────────────────────────────┘
```

**读图要点**：第 0 层是既有事实、第 1 层是唯一需要人写的地方，第 2/3 层全部由脚本投射且**不复制正文**，第 4 层保证任何一处改动不同步就 CI 报错。这直接消除了事实 6 的漂移问题。

---

# 四、单一真源层：dev-kit 目录布局与各文件职责

## 4.1 为什么选 `docs/dev-kit/` 而不是隐藏目录 `.enterprise/`

三个代码事实决定的：

1. `/admin/ai-code` 的写白名单**包含 `docs/**`**（`AI编程（后台自助改码）设计方案.md:87,191`），意味着管理员未来可用现成的「AI 编程」能力维护这份指引（暂存区 → diff 逐文件批准 → 备份/回滚），而隐藏目录不在白名单内。
2. 后台渲染、zip 打包、README 引用、8 语言副本都天然覆盖 `docs/`。
3. 该方案 `:191` 明确「不放开 `infra/**`、`scripts/**`、`extensions/**`」，把真源放 `docs/` 不需要扩大后台改码面，风险最小。

同时 `docs/` 已在 `.gitignore` 之外（可入库），且 `.gitignore` 未忽略 `.agents/`、`.claude/`、`.cursor/`、`.github/`（已核验），第 2 层入口可正常提交。

## 4.2 完整目录清单（新建文件，全部标注用途）

```
docs/dev-kit/
├── README.md                    人读总入口：这是什么、怎么用、三条红线
├── AGENTS.md                    ★ 规则正文真源（唯一）
├── project.json                 机器元数据（schemaVersion / commands / services / sources）
├── rules/                       规则分片，AGENTS.md 按任务路由加载
│   ├── architecture.md          六层分层、契约层、目录边界、禁循环依赖
│   ├── contracts.md             新增/修改契约端点的标准动作（对齐 11.2）
│   ├── network.md               网络出口唯一：api/http.ts + transport.ts（红线 3）
│   ├── miniapp.md               新增小程序标准动作（对齐 11.1）
│   ├── ai-and-assets.md         AI 必须走 ai-gateway + 计量；字节走 StorageService
│   ├── third-party.md           外部代码边界：哪些能改、哪些禁止复制、许可证口径
│   └── testing.md               必跑命令、CI 门禁、验收口径
├── guides/                      人读长文（后台页渲染这四个）
│   ├── 01-architecture.md       架构说明（引用 README:401-456，不复制数字）
│   ├── 02-api.md                接口说明（指向 api/INDEX.md，不复制清单）
│   ├── 03-third-party.md        外部引入代码包说明（指向 THIRD_PARTY.md）
│   └── 04-principles.md         开发原则（ub-mode + 11.4 三条红线 + 可执行守护）
├── api/
│   ├── INDEX.md                 ★ 自动生成：域目录 + 每域端点数 + 生成命令
│   └── <domain>.md              ★ 自动生成：按 mcpDomainOfPath 分片
├── THIRD_PARTY.md               ★ 半自动生成 + 人工核注的仓库级外部代码清单
├── skills/
│   ├── ub-mode/SKILL.md         从 docs/ub-mode/SKILL.md 迁入（保留来源声明）
│   ├── enterprise-contract/SKILL.md     新增：改契约的标准动作
│   ├── enterprise-miniapp/SKILL.md      新增：加小程序的标准动作
│   └── enterprise-review/SKILL.md       新增：提交前自检（对齐 check-architecture）
│   └── （每个可带 references/，SKILL.md 保持 <500 行）
├── templates/                   ★ 工具薄入口模板（setup-dev-kit.mjs 的输入）
│   ├── AGENTS.md / CLAUDE.md / GEMINI.md
│   ├── .cursor/rules/enterprise.mdc
│   ├── .github/copilot-instructions.md
│   ├── llms.txt
│   └── run.sh / run.ps1（可选，转发到 scripts/devkit-command.mjs）
└── VERSION                      套件版本号（zip 文件名、后台显示、--check 用）
```

## 4.3 `AGENTS.md` 真源该写什么（结构模板，遵循 Codex 官方「短而具体」）

参考 `awbot-app/AGENTS.md` 的中文硬规则体例，但**不复制任何清单**：

```
# AI 开发入口 · aiworkin-enterprise

## 0. 开始任何任务前
1. 读 docs/dev-kit/project.json（命令、服务、目录边界）。
2. 按改动面从「规则索引」加载对应 rules/*.md；不要一次读完全部。
3. 从代码核对事实；README/设计文档中的统计数字一律不当作事实源。
4. 检查 git status，保留已有工作区改动。

## 1. 项目一句话
AGPL-3.0-only 企业服务工作台：pnpm monorepo（frontend / backend / packages/*）；
Hono + Prisma 后端，Next.js App Router 前端，@enterprise/contracts 是前后端/MCP/OpenAPI 唯一事实源。

## 2. 规则索引（正文在 docs/dev-kit/rules/，本文件不复制）
| 改动面 | 读 | 必跑 |
| 新增/改接口 | contracts.md | pnpm api:docs / api:index / check:architecture |
| 新增小程序 | miniapp.md | pnpm check:mini-core / check:architecture |
| 出站 HTTP | network.md | pnpm check:architecture |
| AI / 文件存储 | ai-and-assets.md | 同上 |
| 外部代码 | third-party.md | pnpm devkit:check |
| 任意改动收口 | testing.md | pnpm typecheck && pnpm lint && pnpm check:architecture |

## 3. 目录边界（可改 / 禁改）
可改：backend/src、frontend/src、packages/contracts/src、backend/prisma、docs
禁改：packages/contracts/dist（生成物）、docs/api/openapi.json（生成物）、
      docs/dev-kit/api/*（生成物）、frontend/public/downloads/*.zip（生成物）、
      update/**、node_modules、.git
生成物一律通过对应 pnpm 命令重生成，不得手改。

## 4. 硬性事实（写「指向」不写「清单」）
- 接口与错误码的唯一事实源：packages/contracts/src/；完整 schema 在 docs/api/openapi.json；
  AI 可读索引在 docs/dev-kit/api/（由 gen-api-index.mjs 派生）。
- 开发原则的可执行定义：scripts/check-architecture.mjs（10 组规则）。
- 外部代码清单：docs/dev-kit/THIRD_PARTY.md。
- 技能：docs/dev-kit/skills/（真源）→ .agents/skills 与 .claude/skills（安装副本）。

## 5. 完成前
pnpm typecheck && pnpm lint && pnpm check:architecture
改过契约再加：pnpm api:docs && pnpm api:index
改过真源再加：pnpm setup:dev-kit && pnpm devkit:check
如实报告未验证项；不得声称已跑未跑的命令。
```

> 依据：`agents.md` 官方建议（项目概述 / 构建测试命令 / 代码风格 / 安全须知 / 大仓用嵌套 AGENTS.md）、Codex 官方 customization「Keep it small」「Pair AGENTS.md with infrastructure that enforces those rules」、`.crmeb/AGENTS.md`（模板）的「处理任务前 4 步 + 规则索引表 + 技能索引」。

## 4.4 `project.json` 字段（对齐模板 `init-project-standard.mjs:108-133`）

```json
{
  "schemaVersion": 1,
  "project": "aiworkin-enterprise",
  "license": "AGPL-3.0-only",
  "directories": { "backend": "backend/src", "frontend": "frontend/src",
                   "contracts": "packages/contracts/src", "docs": "docs/dev-kit" },
  "applications": [
    { "id": "api", "port": 1690, "command": "pnpm dev:api" },
    { "id": "web", "port": 1695, "command": "pnpm dev:web" },
    { "id": "worker", "command": "pnpm dev:worker" }
  ],
  "sources": { "endpoints": "packages/contracts/src/endpoints.ts",
               "openapi": "docs/api/openapi.json",
               "guard": "scripts/check-architecture.mjs" },
  "commands": { "setup": "pnpm install && pnpm setup", "dev": "pnpm dev",
                "check": "pnpm check:architecture", "typecheck": "pnpm typecheck",
                "lint": "pnpm lint", "build": "pnpm build",
                "apiDocs": "pnpm api:docs", "apiIndex": "pnpm api:index",
                "devkit": "pnpm setup:dev-kit", "devkitCheck": "pnpm devkit:check" },
  "generated": ["packages/contracts/dist/**", "docs/api/openapi.json",
                "docs/dev-kit/api/*", "frontend/public/downloads/*-v*.zip"]
}
```

> 端口依据 `scripts/dev.mjs:8-10`（15889/15890/1690/1695）。`project.json` 让 AI 用一条 `doctor` 就知道该跑什么，无需读 README 猜。

---

# 五、工具适配层：六个薄入口与 skills 双目录

## 5.1 适配矩阵（照抄 `ai-tool-adapters.md:9-16`，路径换成本仓）

| 工具 | 仓库入口 | 内容（薄指针，≤5 行） | 发现机制 |
|---|---|---|---|
| **Codex / AGENTS 兼容工具** | `AGENTS.md`（根） | 「开始处理本仓库任务前，读取 [docs/dev-kit/AGENTS.md](docs/dev-kit/AGENTS.md)，再按其索引加载与任务相关的规则；项目事实以代码、可执行配置与生成物为准；完成后执行 project.json 声明的最小验证命令并如实报告未验证项」 | 根 → 当前目录逐级合并，最近者优先 |
| **Claude Code** | `CLAUDE.md`（根） | 首行 `@docs/dev-kit/AGENTS.md` + 「规则正文只维护在 docs/dev-kit/，不复制或另建第二套规范」 | `@` 导入语法；无 CLAUDE.md 时也能读 AGENTS.md |
| **Cursor** | `.cursor/rules/enterprise.mdc` | frontmatter `description` + **`alwaysApply: true`**，正文「唯一规则正文是 `../../docs/dev-kit/AGENTS.md`」 | Rules for AI |
| **GitHub Copilot** | `.github/copilot-instructions.md` | 「修改前先读 docs/dev-kit/AGENTS.md；执行 project.json 的 check/test/build；本文件不复制规则」 | 仓库级自定义指令 |
| **Gemini CLI** | `GEMINI.md`（根） | 首行 `@./docs/dev-kit/AGENTS.md` | `GEMINI.md` / 可配 `.gemini/settings.json` |
| **通用抓取 / 其他** | `llms.txt`（根） | 3 行路径：`docs/dev-kit/AGENTS.md`、`docs/dev-kit/project.json`、`docs/dev-kit/README.md` + 「Always read the project rules before changing code」 | `llms.txt` 约定 |

**关键约束**：全部入口只写「指针 + 完成要求」，**不复制任何规则正文、接口清单、统计数字**。理由见事实 6；模板 `ai-tool-adapters.md:20` 亦明确「工具专属入口保持简短，避免每次会话加载完整规则库」。

## 5.2 skills 目录分歧（2026 现状，必须双份）

外部核实结论（2026-10/11 各工具官方文档）：

| 工具 | 读取的项目级 skills 目录 |
|---|---|
| **Codex** | `.agents/skills/`（当前目录→仓库根逐级）、`~/.agents/skills/`；旧 `.codex/skills/` 已弃用但仍加载；**不读 `.claude/`** |
| **Cursor** | `.agents/skills/` + `.cursor/skills/`，兼容 `.claude/`、`.codex/` |
| **GitHub Copilot** | `.agents/skills/` / `.claude/skills/` / `.github/skills/` |
| **Gemini CLI / Antigravity** | `.agents/skills/` |
| **Claude Code** | **只**读 `.claude/skills/`（项目 + `~/.claude/skills/`）；不读 `.agents/` |

→ **方案**：真源在 `docs/dev-kit/skills/<name>/`，由 `setup-dev-kit.mjs` 同步到 `.agents/skills/<name>/`（覆盖 Codex/Cursor/Copilot/Gemini）与 `.claude/skills/<name>/`（Claude Code），并用 `devkit:check` 做逐文件 diff，防止两份漂移。

**为什么不用软链接**：`ai-tool-adapters.md:22-26` 明确「默认使用入库薄文件而不是软链接，保证 Windows 和压缩包场景可用」；本仓已有实证——`awbot-app/CLAUDE.md` 自述是 `AGENTS.md` 的符号链接，但在本机 Windows 检出后 md5 相同的**普通文件副本**（链接已退化）。zip 压缩包场景同样会丢失链接。故采用**入库副本 + 脚本同步 + diff 校验**，与项目既有 `shared/mini-core/sync.mjs` 的 `sourceViolationReport()` / `diff()` 完全同一套路。

## 5.3 SKILL.md 规范（写入每个技能）

```
---
name: ub-mode                      # ≤64 字符，小写/数字/单连字符，必须与目录名一致
description: >                     # ≤1024 字符；触发词前置，说清「做什么 + 何时用」
  Follow reduced principles when writing or changing code. Use when the user
  runs /ub-mode or asks for disciplined engineering practice.
---
```

规范要点（来自 Agent Skills 开放标准）：`name`/`description` 必填；`license`/`compatibility`/`metadata`/`allowed-tools` 可选；**只用标准字段**（Claude 上传遇到未知 key 会失败）；`SKILL.md` 建议 <500 行 / ~5000 token，细节放 `references/` 用相对路径链接一层；步骤保持工具无关（写「运行测试套件」而不是某个工具的专属命令）。

`docs/ub-mode/SKILL.md` 已完全符合（`name` + `description`、153 行），**可直接迁入真源，无需改写**；只需在 `references/` 或 README 补一段来源与配套工具说明（其 README:3-16 已有）。

---

# 六、一键配置：本地脚本 + 后台下载套件

## 6.1 「一键」的准确定义：两个入口，同一份内容

| 入口 | 面向 | 一条动作 | 结果 |
|---|---|---|---|
| **A. 本地命令行** | 拿到源码的二次开发者 | `pnpm setup:dev-kit` | 幂等生成 6 个薄入口 + 同步 2 个 skills 目录 + 生成接口索引 + 打印验证清单 |
| **B. 后台下载套件** | 平台管理员 / 分发给外部开发者 | 后台点「下载开发套件」 | 得到 `enterprise-dev-kit-v1.0.0.zip`，解压到任意仓库根即可用；另有 `ub-mode-v1.0.0.zip` 单独下载 |
| **C. 复制一行命令**（辅助） | 想让 AI 自己完成配置 | 后台复制提示词，粘贴给 Codex/Cursor | 「读取 docs/dev-kit/AGENTS.md 并按 templates/ 生成本工具入口」——对未 `setup` 的仓库也能自愈 |

> 说明：如果用户已经在仓库里提交了第 2 层的 6 个薄入口与 skills 副本（推荐，见 10.1），那么 **clone 下来即「零操作可用」**——这是最彻底的一键；`pnpm setup:dev-kit` 主要用于「旧仓库补齐 / 新增工具 / 刷新生成物 / CI 校验」。

## 6.2 `scripts/setup-dev-kit.mjs` 行为规范（照抄 `init-project-standard.mjs`）

```
用法：node scripts/setup-dev-kit.mjs [--dry-run] [--check] [--force-sync]

1. 读 docs/dev-kit/project.json 与 VERSION。
2. 遍历 docs/dev-kit/templates/：
     目标文件已存在 → 打印「保留已有 <path>」并跳过（★ 不覆盖）
     目标缺失       → mkdir -p + copyFileSync（run.sh 额外 chmod 755）
3. 同步 skills：docs/dev-kit/skills/* → .agents/skills/* 与 .claude/skills/*
     - 目标不存在 → 复制整个技能目录
     - 目标已存在且内容不同 → 默认「保留 + 报告差异」；仅 --force-sync 覆盖
     - 校验每个 SKILL.md 的 frontmatter：name === 目录名、description 非空
       （照抄 verify-insight-skills.mjs:69-76，注释「技能装载方无法识别」）
4. 生成接口索引：调用 gen-api-index.mjs（或内联），写 docs/dev-kit/api/
5. --check 模式：不写任何文件，逐字节比对所有生成物与入口；
     不一致 → console.error + process.exitCode = 1（照抄 openapi.ts:11-13）
6. 输出：创建/保留/跳过清单 + 「下一步：pnpm typecheck && pnpm lint && pnpm check:architecture」
```

对应 `package.json` 新增 4 条 scripts（与既有命名风格对齐）：

```json
"setup:dev-kit":  "node scripts/setup-dev-kit.mjs",
"devkit:check":   "node scripts/setup-dev-kit.mjs --check && node scripts/gen-api-index.mjs --check && node scripts/verify-devkit-skills.mjs",
"api:index":      "node scripts/gen-api-index.mjs",
"pack:dev-kit":   "node scripts/pack-dev-kit.mjs"
```

并把 `devkit:check` 追加进既有 `check:architecture` 链（`package.json:41`）或 `ci.yml:35` 之后，保证生成物漂移即 CI 红。

## 6.3 `scripts/pack-dev-kit.mjs`（复用 insight 链路，不另造）

- 输入：`docs/dev-kit/` 真源 + `VERSION`。
- 产出 1：`frontend/public/downloads/enterprise-dev-kit-v<version>.zip` —— **根目录摊平**（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`llms.txt`、`.cursor/rules/`、`skills/`、整套 `docs/dev-kit/`），与 `pack-insight-skills.mjs:7-8` 同口径：解压出的目录即包名，丢进工具目录就能识别。
- 产出 2：`ub-mode-v<version>.zip` 及每个新增开发原则 skill 各一个 zip（**zip 根只有 `SKILL.md` + 可选 references/**），完全照抄 `pack-insight-skills.mjs:33-46` 与 `writeStoreZip`。
- 断言：POSIX 条目名、无反斜杠、文件名与契约/VERSION 一致（照抄 `verify-insight-skills.mjs:49-66`）。
- 分发元数据：在契约新增 `DEV_KIT_SKILLS`（仿 `INSIGHT_COLLECTION_SKILLS`）作为 zip 清单唯一真源，后端给 `downloadUrl: /downloads/<zipFile>`，前端后台页渲染下载按钮。

> 这条链路的价值：事实 4 已证明平台**已经能把 skill 包发给 Codex 用户**，只需把 ub-mode 注册进清单。

---

# 七、管理员后台「二次开发指引」板块设计

## 7.1 落点（改 2 处 + 新增 1 组件，零新建表）

| 步骤 | 文件 | 改动 |
|---|---|---|
| 1 | `frontend/src/config/routes.ts:47-265` | `ADMIN_SECTIONS` 加一项 `{ key: "dev-guide", name: "二次开发指引", icon: "code", desc: "架构 / 接口 / 外部代码 / 开发原则与一键接入", group: "system" }` → `adminRoute`(`:267-282`)、`PAGE_META`(`:961-967`)、侧栏三处自动同源 |
| 2 | `frontend/src/app/admin/[section]/page.tsx` | `import { DevGuideTab }` + 在 `:81-111` 分派区加 `{section === "dev-guide" ? <DevGuideTab /> : null}`；身份收口 `:49-64` 保持不变 |
| 3 | `frontend/src/app/admin/_components/dev-guide-tab.tsx` | 新增组件（见 7.2） |
| 4（可选） | `backend/src/feature/feature-catalog.data.ts` | 若需功能开关控制显隐，加一个 `menu()` 种子；`/admin` 板块本身不走 apiPrefixes，可不加 |

权限：前端 `isAdmin`（`[section]/page.tsx:49`）+ 后端 `requireAdmin`（`admin.service.ts` 多处）已现成，无需新增。

## 7.2 `DevGuideTab` 四页签结构

用现成 `PageHero({tabs, activeTab, onTabChange})`（`components/ui/panel.tsx:127-165`）+ `?view=` 同步 URL（照抄 `developer/api-mcp-skill/page.tsx`）：

| 页签 | 渲染内容 | 数据来源 | 交互 |
|---|---|---|---|
| **架构说明** | `guides/01-architecture.md` | 仓库真源，Markdown | `markdownToHtml()`（`markdown-html.ts`），`dangerouslySetInnerHTML`；左侧 antd `Menu` 目录树 |
| **接口说明** | `guides/02-api.md` + `api/INDEX.md` + 按域分片 | **生成物** | 「接口清单由契约派生」提示 + `pnpm api:docs` / `api:index` 命令 + 复制按钮；可跳转 `/developer/api-mcp-skill?view=api` |
| **外部代码** | `THIRD_PARTY.md`（表格化） | 半生成 + 人工核注 | 每个外部包：名称/许可证/来源/作用域/改动/对应文件；**未决项显式标注**（见 8.3）；链接到 `awbot-app/THIRD_PARTY_NOTICES.md`、`PROVENANCE.md` |
| **开发原则 & 一键接入** | `guides/04-principles.md` | 真源 | ①ub-mode 等 skill 下载按钮 ②「下载完整开发套件 zip」③「复制一键命令」④「复制 AI 提示词」⑤管理员可编辑的「本站补充说明」（`SystemSetting`，见 7.3） |

**明确不做**：不在后台页面里手打接口清单、错误码表、规则表、统计数字；这些区域一律显示「由 XX 生成，改契约后运行 `pnpm api:index`」并给出指向。

## 7.3 管理员补充说明：复用 `SystemSetting`，不新建表

照抄 `mini-guide` 全链路：`system_settings` 新增一个 key（如 `dev_guide_notice`）、`GuideStore` 式的 `{ body, updatedAt }` JSON、缺行/坏 JSON 回落内置默认（照抄 `mini-guide.service.ts:50-66`）；契约加一对 `DevGuideAdmin_view/save`（仿 `mini-guide.ts:141-169`）；后台 `Input.TextArea` + `Drawer` 预览（仿 `mini-guide-tab.tsx:160-167,212-245`）。

**边界**：这块只放「本站部署差异、内部联系方式、额外约定」等**补充**，主体四类内容仍由仓库真源渲染。避免形成第二份正文（事实 6）。

## 7.4 与 `/help` 管理员专区、`/developer` 的关系（同源复用，不复制）

- `backend/src/help/help-knowledge.part2.ts:368-446` 的 `platform-admin` 章节加 1 个主题 `pa-dev-guide`（`audience: ['PLATFORM_ADMIN']`），正文写「二次开发指引已迁至 `/admin/dev-guide`，开发套件见 `docs/dev-kit/`」+ 深链；`/help` 与 MCP `Help_search` 自动同源（`help.service.ts:12-18` 明确内容内置随代码版本化、不落库）。
- `/developer/api-mcp-skill` 增加一个 `?view=devkit` 页签，展示「一键命令 + skill 下载」；该页现有 `skill/mcp/api` 三页签的 `PageHero` 结构可直接扩展。
- `frontend/src/components/ui/help-topic-button.tsx` 可给新板块加深链按钮。

> 这一层是**可选增强**（P2），核心交付是 `/admin/dev-guide`。

---

# 八、接口说明与外部代码说明的自动化（防漂移）

## 8.1 `scripts/gen-api-index.mjs`：面向 AI 的精简接口索引

**为什么必须新建**（代码事实）：`docs/api/openapi.json` 10MB 单行、schema 全内联（`components.schemas` 仅 1 个），直接喂 AI 会爆上下文；`mcpOperations()` 无参数结构；契约 `src/*.ts` 90 个文件、仅 `endpoints.ts` 15,746 行，也不适合整份投喂。

**生成逻辑**：

```
输入：packages/contracts/dist/endpoints.js + dist/mcp.js（★ CI 先 build dist，见 ci.yml:33）
       + packages/contracts/src/errors.ts
遍历 Object.entries(endpoints)：
  operationId / method / path / domain = mcpDomainOfPath(path) / domainLabel
  / label = agentActionLabel(id) / write = method !== 'get'
  / channel = path.startsWith('/api/v1/') ? 'key(API Key)' : 'session(会话)'
  / params、query、body、response 的 zod schema → 精简字段摘要
  / 所属契约模块文件（从 import 映射或路径推断）
按 domain 分片写 docs/dev-kit/api/<domain>.md，另写 INDEX.md（域目录 + 计数 + 生成命令）
每个文件头加「自动生成，请勿手改；源：packages/contracts；命令：pnpm api:index」
--check：逐字节比对，不一致 exit 1（照抄 backend/src/http/openapi.ts:11-13）
```

**契约**：`pnpm api:index` / `pnpm api:index:check` 两条 scripts；`ci.yml` 在 `:52 api:docs:check` 之后加一步 `pnpm api:index:check`。

**与既有产物的关系**：不替代 `openapi.json`（它仍是完整 schema 的唯一机器可读来源），只是给 AI 一个「可读、可分片、可按域加载」的索引；`AGENTS.md` 里写明「需要完整参数/响应 schema 时读 `docs/api/openapi.json` 的对应 path，不要整份加载」。

## 8.2 内容防漂移的三件套（项目已跑通，照抄）

| 环节 | 既有范例 | 本方案对应 |
|---|---|---|
| 生成命令 | `pnpm api:docs`（`package.json:28`） | `pnpm api:index`、`pnpm setup:dev-kit`、`pnpm pack:dev-kit` |
| `--check` 逐字节比对 | `openapi.ts:11-13` | 三个脚本各带 `--check` |
| CI 强制 | `ci.yml:52` | 新增 `devkit:check` + `api:index:check` 两步 |
| 生成物头注释 | `gen-prisma-schema.mjs:33-37`「自动生成，请勿手改」 | 所有生成文件统一加 |
| 编译期强制覆盖 | `api-tab.tsx:95` `Record<ErrorCodeName,string>` | 新增 devkit skill 清单同样用类型约束 |
| 一致性守卫 | `verify-insight-skills.mjs`（已挂 `check:architecture`） | `verify-devkit-skills.mjs` 并入同一链 |

**第一红线（写入 AGENTS.md 与后台页）**：接口清单、错误码表、架构规则、统计数字**不得写进任何 Markdown 正文**，只能写「指向 + 重生成命令」。README 现状就是反面教材（事实 6 的 3044/102/0001→0052）。

**顺带治理（P2）**：把 `README.md:25,366,405` 的硬编码 3044、`README.md:617` 的 102 套件改成「以 `pnpm api:docs` 产物与 CI 为准」的指针；8 语言 README 同步时只同步结构、数字统一由生成物提供。这不是本方案的核心交付，但能止住持续漂移。

## 8.3 `THIRD_PARTY.md`：仓库级外部代码清单（半生成 + 人工核注）

**为什么不能全自动**：事实 7 已证明信息分散且**存在真实缺口**——`awbot-app/THIRD_PARTY_NOTICES.md` 只覆盖 `awbot-app/`；`bot-host-client/`（含内置 Automa 1.30.02）无任何许可声明；根 README 对 `deepseek-harness` / `new-api` 零命中。生成器只能汇总已有事实，**不能编造缺失的许可证**。

**清单结构**（每个外部项一行，字段固定）：

| 字段 | 说明 |
|---|---|
| 名称 / 上游 URL | deepseek-harness、dsh-Go、Automa、CRMEB v8、new-api、ub-mode(@poteto)、crapper/dryer/mutator、dartssh2、AIPDD 插件… |
| 许可证 | MIT / AGPL-3.0-only / Apache-2.0 / **未标注（待补）** |
| 引入形态 | 依赖引入 / vendored 改写 / 随包分发二进制 / 仅参考未移植 / 文档引用 |
| 作用域 | 根目录、`awbot-app/`、`bot-host-client/`、`.scratch`/`.tmp`（参考副本不计入分发） |
| 对应文件/证据 | `awbot-app/THIRD_PARTY_NOTICES.md:82-105`、`PROVENANCE.md:8-12`、`README.md:666`、manifest 路径 |
| 改动与约束 | 是否可改、是否需署名、是否禁止商业化套皮（`awbot-app/README.md:336-343`） |
| 合规状态 | ✅ 已声明 / ⚠️ 部分 / ❌ 缺失待补 |

**必须如实写进方案与后台页的三条现状**（不能美化）：
1. `bot-host-client/` 与其内置 Automa **缺 LICENSE/PROVENANCE/NOTICE**，根 README 只有功能描述 → 标 ❌，列为 P0 合规待办（补 `bot-host-client/THIRD_PARTY_NOTICES.md` 或直接引用 Automa 上游许可）；
2. 根项目 `AGPL-3.0-only`（`package.json:5`、`README.md:684-686` 第 13 条网络服务须提供对应源码），`awbot-app/` 同为 AGPL 且 `docs/商业授权说明.md:36-38` 明确其第三方组件**不在商业授权范围**；
3. `update/sources/3/.../LICENSE` 是 **Apache-2.0**（201 行），与根 AGPL 不一致，属升级包内旧版残留，需标注「不代表当前项目许可」。

**自动化部分**：`gen-third-party.mjs` 从 `awbot-app/THIRD_PARTY_NOTICES.md`、`PROVENANCE.md`、根 README 致谢段、各 `package.json` 依赖、内置扩展 `manifest.json` 抽取已有条目生成表格骨架；人工补「未标注」项与合规判断；`--check` 校验「清单条目 ⊆ 已知来源」且每个 ✅ 项有证据路径。

---

# 九、ub-mode 与开发原则 skill 的接入

## 9.1 ub-mode：迁入真源 + 三条分发通道

| 步骤 | 动作 | 依据 |
|---|---|---|
| 1 | `docs/ub-mode/SKILL.md` → `docs/dev-kit/skills/ub-mode/SKILL.md`（内容不改，153 行已合标准）；原路径保留为说明页或改为指向新址的短 README | `docs/ub-mode/README.md:18-20` 安装说明 |
| 2 | 把 `README.md:3-16` 的来源（基于 @poteto 的 poteto-mode/pstack）与 4 个配套工具（crapper/dryer/mutator/uml-viewer）写成 `references/README.md`，**注明这些是外部仓库、不在本仓、需自行安装**；避免 AI 以为工具已存在而虚构执行 | `SKILL.md:108-123` 引用了「use the crapper tool」 |
| 3 | `setup-dev-kit.mjs` 同步到 `.agents/skills/ub-mode/` + `.claude/skills/ub-mode/`；`pack-dev-kit.mjs` 生成 `ub-mode-v<version>.zip`（根目录摊平 SKILL.md） | 事实 4 链路 |
| 4 | 后台「开发原则 & 一键接入」页放下载按钮 + 一行命令：`/ub-mode` 触发；并说明「Codex 用 `$ub-mode`、Claude 用 `/ub-mode`」 | Codex 官方 `$skill-name` / Claude `/skill-name` |

> **重要**：ub-mode 的 `SKILL.md` 里有「Use the crapper/dryer/mutator tool」等指令，而本仓**没有**这些工具（全仓无命中）。方案不要求实现它们，但必须在 `references/` 中显式声明「若工具不可用，跳过该步并如实报告」，否则 AI 会编造验证结果——这与 `awbot-app/.agents/skills/review/SKILL.md` 强调「不虚构验证」的既有纪律一致。

## 9.2 新增三个「本系统专属」开发原则 skill（把已有文字原则转成可加载格式）

这三个不是新发明，是把**已存在于代码/文档中的原则**转成 SKILL.md，让 AI 按需加载而非塞进 AGENTS.md：

| skill | 内容来源 | 触发场景 | 关键步骤 |
|---|---|---|---|
| `enterprise-contract` | `技术架构现状分析与优化指引.md` 11.2 + `check-architecture.mjs:16-25` | 新增/修改 HTTP 接口、错误码 | ①写进 `endpoints.ts` ②类型由 schema 推导、禁 `as`、只 import zod/相对路径 ③前端用 `endpoint()` ④`pnpm api:docs && api:index && check:architecture` ⑤补越权用例 |
| `enterprise-miniapp` | 同上 11.1 + `shared/mini-core/sync.mjs` | 新增小程序/新终端 | ①优先在现有终端加场景 ②确需新建则基于公共 core，禁复制 `request/session/auth/login` ③不新建 `*Member`/`*Order` 表族与 issuer ④注册公开路由时注明 issuer/租户键 ⑤`pnpm check:mini-core` |
| `enterprise-review` | 11.4 三条红线 + `check-architecture.mjs` 全 10 组 | 提交前自检 / 代码评审 | ①令牌物理隔离（C 端令牌不进 `/enterprise/**`）②顾客态双条件 `siteId\|shopId + customerId` ③网络出口唯一 ④跑 `typecheck && lint && check:architecture` ⑤逐条报告未验证项 |

每个 SKILL.md 保持 <150 行、`<500` 行规范内；详细依据放 `references/` 并**给文件路径而非抄正文**（遵守第一红线）。

## 9.3 技能索引写进 AGENTS.md（不是复制内容）

`docs/dev-kit/AGENTS.md` 加一节「技能索引」表格（名称 / 用途 / 何时用 / 真源路径），由 `setup-dev-kit.mjs` 从 `skills/` 目录自动生成（照抄 `init-project-standard.mjs:79-106` 把技能登记进索引的做法），保证新增 skill 不会漏登记。

---

# 十、分阶段执行路线图（按此执行）

> 依赖关系：P0 建真源与入口 → P1 接后台页与分发 → P2 自动化与治理。**每阶段结束都有可验收的产出**。

## P0 · 最小可用（先让 Codex 能读懂项目，ub-mode 能一键导入）

| # | 动作 | 涉及文件（新建 ★ / 修改） | 验收 |
|---|---|---|---|
| 0.1 | 建真源骨架 | ★`docs/dev-kit/{README.md,AGENTS.md,project.json,VERSION}`、★`rules/*.md`（7 个）、★`guides/*.md`（4 个） | `AGENTS.md` 不含任何接口清单/统计数字；`project.json` 命令可逐条执行 |
| 0.2 | 迁入 ub-mode | ★`docs/dev-kit/skills/ub-mode/{SKILL.md,references/README.md}`；`docs/ub-mode/README.md` 改为指向新址 | frontmatter `name===目录名`、description 非空；配套工具不可用的处理已声明 |
| 0.3 | 六个薄入口模板 | ★`docs/dev-kit/templates/`（6 入口 + llms.txt） | 每个 ≤5 行、只含指针 |
| 0.4 | 一键脚本 | ★`scripts/setup-dev-kit.mjs`；`package.json` 加 `setup:dev-kit` / `devkit:check` | `--dry-run` 无写入；重复执行幂等；已有文件不被覆盖 |
| 0.5 | 生成入口与 skills 双目录 | 运行 `pnpm setup:dev-kit` → 根 `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`llms.txt`/`.cursor/rules/`/`.github/copilot-instructions.md` + `.agents/skills/` + `.claude/skills/` | Codex 打开仓库能读到 AGENTS.md；Claude `/context` 能看到导入；`ub-mode` 在两处都可见 |
| 0.6 | skill 一致性守卫 | ★`scripts/verify-devkit-skills.mjs`，并入 `check:architecture` 链 | 删掉一个 skills 副本即报错 |

> P0 完成后，**clone 仓库即用，无需任何命令**——这就是最彻底的一键。

## P1 · 后台指引页 + 下载套件（满足你「管理员后台增加指引」的原始诉求）

| # | 动作 | 涉及文件 | 验收 |
|---|---|---|---|
| 1.1 | 注册后台板块 | `frontend/src/config/routes.ts`（`ADMIN_SECTIONS` 加 1 项）、`frontend/src/app/admin/[section]/page.tsx`（import + 1 个分支） | 侧栏、PAGE_META、页面三处同源出现；非管理员访问被 `isAdmin` 拦截 |
| 1.2 | 四页签组件 | ★`frontend/src/app/admin/_components/dev-guide-tab.tsx`（`PageHero` + `markdownToHtml()` + antd Menu 目录树） | 四类内容都能渲染；代码块/链接正常；HTML 已转义 |
| 1.3 | 真源读取接口 | ★契约 `packages/contracts/src/dev-guide.ts`（`DevGuide_*` 只读端点，正文从 `docs/dev-kit/` 读）+ 后端 controller/service + `automation-routes.ts` 注册；或构建期生成静态 JSON 快照 | 后台页不写死正文；改 `docs/dev-kit/*.md` 后刷新即变 |
| 1.4 | 管理员补充说明 | `system_settings` 新 key + `DevGuideAdmin_view/save` 契约 + TextArea/Drawer（照抄 mini-guide） | 不新建表；坏 JSON 回落默认；补充说明与主体正文分区显示 |
| 1.5 | 打包与下载 | ★`scripts/pack-dev-kit.mjs` + 契约 `DEV_KIT_SKILLS` 清单 + `frontend/public/downloads/*.zip` + 后台下载按钮 | `enterprise-dev-kit-v*.zip` 根目录摊平、解压即用；`ub-mode-v*.zip` 根只有 SKILL.md |
| 1.6 | 一键命令与提示词 | 后台页「复制 `pnpm setup:dev-kit`」「复制 AI 提示词」两个按钮 | 粘贴给 Codex 能在未 setup 的仓库自愈生成入口 |

## P2 · 接口自动化、外部代码清单、漂移治理

| # | 动作 | 涉及文件 | 验收 |
|---|---|---|---|
| 2.1 | 接口精简索引 | ★`scripts/gen-api-index.mjs` + `package.json` 加 `api:index`/`api:index:check` + `ci.yml` 加一步 | 按域分片生成；改契约不重生成 → CI 红；INDEX.md 不含手写清单 |
| 2.2 | 外部代码清单 | ★`docs/dev-kit/THIRD_PARTY.md` + ★`scripts/gen-third-party.mjs`（骨架） | deepseek-harness/dsh-Go/Automa/CRMEB/ub-mode 逐项有证据路径；3 条缺口如实标注 ❌ |
| 2.3 | 补齐合规缺口 | ★`bot-host-client/THIRD_PARTY_NOTICES.md`（Automa 1.30.02 许可与来源）；核注 `update/.../LICENSE` 的 Apache-2.0 残留 | ❌ 项收敛；不编造许可证 |
| 2.4 | 三个专属 skill | ★`enterprise-contract` / `enterprise-miniapp` / `enterprise-review` 的 SKILL.md + references | 触发词写进 description；步骤指向文件路径而非抄正文 |
| 2.5 | README 漂移治理 | `README.md:25,366,405,617` 硬编码数字改为指针；8 语言副本同步策略 | 无硬编码端点数/套件数；新增「开发套件」一章指向 `docs/dev-kit/` |
| 2.6 | 同源扩展 | `help-knowledge.part2.ts` 加 `pa-dev-guide` 主题；`/developer/api-mcp-skill` 加 `?view=devkit` 页签 | `/help` 管理员专区与 `/developer` 都能到达；MCP `Help_search` 同源 |
| 2.7 | CI 全量收口 | `ci.yml` 追加 `devkit:check` + `api:index:check` | 任一生成物/入口/skill 漂移即红 |

## 10.1 关于「先提交第 2 层入口」的决策建议

**建议把 6 个薄入口与 2 个 skills 副本直接提交进仓库**（而不是只在本地生成后 gitignore）。理由：`.gitignore` 已确认不忽略这些路径；提交后二次开发者 `git clone` 即被 Codex/Claude/Cursor 自动识别，**零操作**；`setup-dev-kit.mjs` 退居「补齐旧仓库 / 新增工具 / CI 校验」角色。这也符合 `agents.md` 官方「AGENTS.md 随仓库走（travels with your repository）」的定位。

---

# 十一、验收清单

## 11.1 单一真源
- [ ] 规则正文只在 `docs/dev-kit/AGENTS.md` 与 `rules/*.md`；6 个根入口、`CLAUDE.md`、`copilot-instructions.md` 全部 ≤5 行且只含指针。
- [ ] `AGENTS.md` / 后台页 / README 中**没有**任何接口清单、错误码表、规则表、统计数字。
- [ ] 所有生成物（接口索引、zip、skills 副本、dist、openapi.json）头部有「自动生成，请勿手改」。
- [ ] `pnpm devkit:check` 与 `pnpm api:index:check` 在干净检出上通过；人为改动一个生成物后退出码为 1。

## 11.2 AI 工具识别（按 `ai-tool-adapters.md:28-37` 的 6 步验证）
- [ ] Codex：仓库根能读到 `AGENTS.md`；按索引能定位 `rules/contracts.md`。
- [ ] Claude Code：`/context` 显示 `CLAUDE.md` 的 `@docs/dev-kit/AGENTS.md` 导入生效；`.claude/skills/ub-mode` 可见。
- [ ] Cursor：Rules 设置里 `.cursor/rules/enterprise.mdc` 为 `alwaysApply: true`。
- [ ] Copilot：`.github/copilot-instructions.md` 生效；提一个规则相关问题能答对（例如「新增接口要改哪个文件」）。
- [ ] Gemini CLI：`/memory show` 能看到 `GEMINI.md` 导入。
- [ ] **无法实际启动的工具只报告「入口静态有效」，不得声称发现成功**（照抄模板验证要求）。

## 11.3 一键配置
- [ ] `pnpm setup:dev-kit --dry-run` 零写入；连续执行两次结果一致；已存在的自定义 `AGENTS.md` 不被覆盖。
- [ ] 从未 setup 的仓库执行 `pnpm setup:dev-kit` 后，6 入口 + 2 个 skills 目录齐全。
- [ ] `enterprise-dev-kit-v*.zip` 解压后根目录含 `AGENTS.md` 等入口，POSIX 条目名、无反斜杠。
- [ ] `ub-mode-v*.zip` 解压后把目录丢进 `.agents/skills/` 或 `.claude/skills/` 即可被识别（frontmatter `name===目录名`）。
- [ ] 复制的 AI 提示词在未 setup 的仓库能自愈生成入口。

## 11.4 后台指引页
- [ ] `/admin/dev-guide` 在侧栏、PAGE_META、页面三处同源；非 PLATFORM_ADMIN 被拦截；后端 `requireAdmin` 生效。
- [ ] 四页签内容来自真源；修改 `docs/dev-kit/guides/01-architecture.md` 后刷新页面即变。
- [ ] `markdownToHtml()` 渲染的代码块/链接/转义正确；无 XSS 面（真源来自仓库而非用户输入）。
- [ ] 管理员补充说明走 `SystemSetting`，不新建表，坏 JSON 回落默认。
- [ ] 下载按钮指向 `/downloads/*.zip` 且文件存在。

## 11.5 内容与合规
- [ ] 架构说明覆盖六层分层、契约层、鉴权、数据归属；接口说明指向 `api/INDEX.md` 与 `openapi.json` 并给出重生成命令。
- [ ] `THIRD_PARTY.md` 每个外部项有「许可证 / 引入形态 / 作用域 / 证据路径 / 合规状态」；三条缺口如实标注。
- [ ] 明确写出根项目 AGPL-3.0-only 第 13 条义务、`awbot-app` 第三方不在商业授权范围、升级包 Apache-2.0 残留不代表当前许可。
- [ ] `ub-mode` 的 `references/` 声明「crapper/dryer/mutator 为外部工具，本仓不含，不可用时须如实报告」。

---

# 十二、风险与合规边界

| # | 风险 | 代码事实 | 缓解 |
|---|---|---|---|
| **R1** | 双写漂移（最大风险） | 事实 6：README 数字已过时、8 语言不同步 | 第一红线 + 生成/`--check`/CI 三件套；后台只渲染真源 |
| **R2** | skills 双目录不一致 | 事实 5.2：Codex 读 `.agents/`、Claude 只读 `.claude/` | 真源单点 + 脚本同步 + `verify-devkit-skills.mjs` diff 守卫；不用软链（Windows 已实证退化） |
| **R3** | 入口被用户自定义内容覆盖后失联 | `init-project-standard.mjs:37-50` 不覆盖策略 | 保留已有内容并追加「引导行」；`--check` 检查每个入口是否含真源路径；冲突条款人工合并 |
| **R4** | AI 把 10MB openapi.json 整份读入 | `docs/api/openapi.json` 10,425,325 字节单行 | `AGENTS.md` 显式写「按域读 `api/<domain>.md`，需要完整 schema 才查 openapi.json 对应 path」 |
| **R5** | ub-mode 引用了本仓不存在的工具 | `SKILL.md:108-123` 要求 crapper/dryer/mutator | `references/` 声明外部性 + 「不可用时跳过并如实报告」，防止虚构验证 |
| **R6** | 外部代码许可证缺口被误当作已合规 | `bot-host-client/` 与内置 Automa 无任何声明；`update/.../LICENSE` 是 Apache-2.0 残留 | `THIRD_PARTY.md` 标 ❌ 并列 P0 待办；**不编造许可证**；不把参考副本（`.scratch`/`.tmp`）计入分发物 |
| **R7** | 与 `/admin/ai-code` 混淆 | 该板块可让 AI 改线上源码，需三重闸（`AI编程（后台自助改码）设计方案.md:51-70`） | 见 12.3 严格区分 |
| **R8** | 后台新增板块影响功能开关/菜单 | `feature-catalog.data.ts` 种子与 `routes.ts` 一一对应 | `ADMIN_SECTIONS` 一处注册自动同源；若需开关再加 `menu()` 种子；不改 `PROTECTED_PATH_PREFIXES` |
| **R9** | 多语言 README 再次漂移 | 8 语言同批生成但内容不同步 | P2 治理：结构同步、数字改指针；不在多语言副本里写统计 |
| **R10** | 新增 zip 未被守卫覆盖 | `verify-insight-skills.mjs` 只校验 insight 包 | 新增 `verify-devkit-skills.mjs` 并并入 `check:architecture` 链；`pack-dev-kit` 断言文件名与 VERSION 一致 |

## 12.1 许可证与署名边界（写进 `rules/third-party.md`）

- 根项目与 `awbot-app/` 均 **AGPL-3.0-only**；通过网络提供服务须履行第 13 条提供对应源码（`README.md:684-686`）。
- `deepseek-harness` = MIT（`awbot-app/THIRD_PARTY_NOTICES.md:82-105`，逐文件映射）；`dsh-Go` = AGPL-3.0（`PROVENANCE.md:8-12`）；`dsh-go` README 另有再发布约束（`:336-343`：fork 须标注主仓与作者、禁止未授权商业化套皮、名称与吉祥物不在 AGPL 范围，见 `ASSETS.md`）。
- CRMEB v8.0 = Apache-2.0，但 `README.md:666` 明确**只参考业务分层与数据结构、未移植源码**；`.scratch/` 是本地参考副本，不计入分发。
- `ub-mode` loosely based on @poteto 的 `poteto-mode`/`pstack`（`docs/ub-mode/README.md:3`）；配套 crapper/dryer/mutator/uml-viewer 为独立外部仓库。
- `docs/商业授权说明.md:36-38`：`awbot-app/` 第三方组件按各自原许可证、**不在商业授权范围**。

## 12.2 与既有「AI 编程」能力的关系（可复用但不混用）

`docs/AI编程（后台自助改码）设计方案.md` 已实施：写白名单含 `docs/**`（`:87,191`），因此**管理员未来可以用它维护 `docs/dev-kit/` 下的指引正文**，并复用「暂存区 → diff 逐文件批准 → 导出 zip / 在线应用 → 备份回滚」的审阅语义。但：
- 本方案的 6 个根入口不在该白名单内 → **不要为了写根目录去扩白名单**（会扩大线上改码风险面）；根入口由本地 `setup-dev-kit.mjs` 生成并提交，不经线上改码。
- 该方案 `:173` 验收已引用 `docs/ub-mode`，说明「把开发原则交给 AI」与「AI 改码」在同一语义链上，但一个是零风险配置分发、一个是需三重闸的源码变更。

## 12.3 明确不做什么

1. 不新建数据库表存主体正文（只用现成 `SystemSetting` 存补充说明）。
2. 不 fork 官方 AI 工具、不自建技能注册中心；只按开放标准放文件。
3. 不把接口清单、错误码表、规则表、统计数字写进 Markdown 正文。
4. 不把参考副本（`.scratch/`、`.tmp/`、`update/sources/`）当作事实源或分发内容。
5. 不编造外部代码的许可证；缺口如实标注并列入待办。

---

# 附：关键文件索引

| 类别 | 路径 |
|---|---|
| **既有事实源（不动）** | `packages/contracts/src/{endpoints.ts,mcp.ts,errors.ts,index.ts,insight.ts}`、`scripts/check-architecture.mjs`、`backend/src/http/openapi.ts`、`docs/api/openapi.json`、`backend/prisma/schema.prisma` |
| **后台落点** | `frontend/src/config/routes.ts:47-265,267-282,961-967`、`frontend/src/app/admin/[section]/page.tsx:49-111`、`frontend/src/lib/markdown-html.ts`、`frontend/src/components/ui/panel.tsx:20,127`、`frontend/src/app/help/page.tsx:426-436`、`frontend/src/app/developer/api-mcp-skill/page.tsx` |
| **可编辑正文范式** | `backend/src/mini-guide/mini-guide.service.ts:44,50-66,132-140,472-488`、`frontend/src/app/admin/_components/mini-guide-tab.tsx:160-167,212-245`、`packages/contracts/src/mini-guide.ts:141-169`、`schema.prisma:183-189` |
| **管理员专区** | `backend/src/help/help-knowledge.ts:9-23`、`help-knowledge.part2.ts:368-446`、`help.service.ts:12-29`、`backend/src/feature/feature-catalog.data.ts:399` |
| **既有 skill 分发链路** | `scripts/pack-insight-skills.mjs:1-50`、`scripts/verify-insight-skills.mjs`、`frontend/public/downloads/`、`backend/src/insight/insight.service.ts:437-438`、`frontend/src/app/insight/_components/collection-tabs.tsx:213-223` |
| **ub-mode 现状** | `docs/ub-mode/SKILL.md`（153 行）、`docs/ub-mode/README.md:3-20`、`docs/AI编程（后台自助改码）设计方案.md:173` |
| **开发原则文字版** | `docs/技术架构现状分析与优化指引.md:472-508`、`README.md:612-647`、`awbot-app/AGENTS.md`（119 行样板）、`awbot-app/.agents/skills/{review,pr,audit,bug,vuln-check}/SKILL.md` |
| **一键模板（参考副本，`.gitignore` 忽略）** | `.scratch/crmeb-v8/CRMEB-v8.0/.crmeb/skills/project-standard-bootstrap/{SKILL.md,scripts/init-project-standard.mjs:37-50,references/ai-tool-adapters.md:9-37,assets/project-template/}` |
| **外部代码说明现状** | `awbot-app/PROVENANCE.md`、`awbot-app/THIRD_PARTY_NOTICES.md:1-8,82-105,433-476`、`awbot-app/README.md:251,336-354`、`awbot-app/ASSETS.md`、`README.md:666,684-686`、`docs/商业授权说明.md:36-38`、`LICENSE` |
| **CI 与脚本** | `package.json:6-48`、`ci.yml:32-74`、`scripts/{openapi.ts,gen-prisma-schema.mjs,pack-miniprogram.mjs,dev.mjs,install.mjs}`、`shared/mini-core/sync.mjs` |
| **本方案新建（执行时）** | `docs/dev-kit/**`、`scripts/{setup-dev-kit.mjs,gen-api-index.mjs,gen-third-party.mjs,pack-dev-kit.mjs,verify-devkit-skills.mjs}`、根 `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`llms.txt`/`.cursor/rules/`/`.github/copilot-instructions.md`、`.agents/skills/`、`.claude/skills/`、`frontend/src/app/admin/_components/dev-guide-tab.tsx`、`packages/contracts/src/dev-guide.ts` |

> 说明：本文件为**方案/执行蓝图**，本次工作未创建、修改或删除任何代码文件，仅新增本 Markdown 文档。文中「新增/修改」清单是第十部分路线图中待执行的动作。外部标准结论来自 2026-11-19 对 `agents.md`、OpenAI Codex 官方 customization 文档、Agent Skills 规范相关资料的核实；工具目录约定变化较快，执行 P0 前建议按 `docs/dev-kit/templates/` 的适配矩阵再核对一次目标工具版本的官方文档。
