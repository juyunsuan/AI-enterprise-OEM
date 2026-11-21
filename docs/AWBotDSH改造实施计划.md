# AWBotDSH 改造实施计划

> 依据：`docs/AWBotDSH迁移优化方案.md`（2026-11-19 稿）
> 编制：2026-11-19　|　范围：`backend/`、`packages/contracts/`、`frontend/`、`bot-host-client/`、`extensions/`、`awbot-app/`（资产来源）
> 本稿只做计划，不含代码改动。所有结论均给出文件与行号，可按条回查。

---

## 〇、实施进度（2026-11-19）

已完成 B1–B6（A/B/C 线），客户端 `npm test` 全绿，平台 `bot-host` / `rpa` 单测 49 项通过，仓库守卫与 OpenAPI 契约检查通过。

| 批次 | 状态 | 主要落点 |
|---|---|---|
| B1 平台 | ✅ | 新增 `/api/public/awbotdsh`；`pairByCode` 事务 CAS 写 `usedAt`；`claimBotBuddy` 补 `sweepTimeouts`；渠道前缀改 `AWBotDSH · ` |
| B2 改名 | ✅ | `AWBotDSH` 品牌、全新 `~/.awbotdsh/awbotdsh.db`、包名/快捷方式/UA/托盘/起始页/桥接扩展 |
| B3 Link | ✅ | `apiBasePath` 参数化 + 新通道默认 + 旧通道 404 回退；`caps.client.channel`；停用模型 Key 上行；`safeStorage` 加密令牌 |
| B4 技能 | ✅ | 6 个内置技能随包 seed、manifest 原子安装、六道红线 + 高危命令门禁、SkillHub 双写、运行时复扫 |
| B5 工作台 | ✅ | 三扩展内置并加 `key`（Automa `hgppffefgolfkiliifdijnpnjbophdmh`）、启用/禁用、桥接自助取 token、桥接工具接进 Agent、会话级指纹绑定、URL 导航、RPA release 兜底 |
| B6 文案 | ✅ | 前端 46 个文件、后端/契约显示文案与 README 全部改为 AWBotDSH；`bot_` 前缀与 `botbuddy` 设备键保持 |

**已知与本改动无关的既有失败**：后端 typecheck 在 `kp.member.ts`、`onsite.poster.service.ts` 有两条既有错误；前端 typecheck 在 `mini-guide-tab.tsx` 缺 `errand`。本次改动文件无新增类型错误。

**DSH 底座已到位**：用户提供 `deepseek-harness-master.zip`，核验为 `0.2.2-rc.5`（与锁定版本一致），包含官方 `apps/desktop`（Electron 44 + electron-builder 26）与 Windows/macOS 打包脚本，MIT 许可。D 线从"不可开工"转为"可进入 B7 验证"。

**D 线验证结果（2026-11-19）**：
- `pnpm install`、Desktop `build`、`package:win:x64 --dir --unsigned` 全部成功；官方冒烟测试通过（离线插件安装/移除、`dsh web` 启动、Office 技能、DOCX/XLSX/PPTX 转换）。
- 已实现并跑通两个自有插件：
  - `packages/client/awbotdsh-market`：插件市场 + 技能广场（侧栏入口 + 浮层；技能来自 SkillHub 公开 API，插件来自随包清单 + SkillHub 目录；仅允许清单内 spec 安装）。
  - `packages/client/awbotdsh-persona`：数字分身（设置 → 数字分身）：本机人设名称、说明、系统提示词 CRUD；工具 `persona_list/read` 供 Agent 采用。
- `packages/client/awbotdsh-browser`：浏览器工作台（侧栏入口 + 浮层，四页签）：
  - 指纹窗口：JSON 档案、种子/平台/时区/语言/代理（AES-256-GCM）、内核启动参数、独立 user-data-dir、随机 CDP 端口、代理 relay；
  - Chrome 插件：内置 Automa / AIPDD / 桥接三扩展 + 用户目录、启用/禁用、启动时 `--load-extension`；
  - RPA：移植 Automa/CDP 执行器，按平台 `/api/public/awbotdsh/rpa/*` 领取/回执/释放，15 秒轮询；
  - 工具：`browser_profiles/open/navigate/read/click/fill`、`rpa_run_task`；
  - 实测：Web 侧栏出现「浏览器工作台」，`/api/browser/state` 返回 200，内置扩展识别 3 个，档案创建成功。启动内核需要用户提供已改造的 Chromium 目录（设置里填写）。
- `awbotdsh-link` 已补 5 秒心跳、`caps.agent.fingerprint.windows` 上报（读取浏览器档案）、平台 `modelGrant` 落盘到 `$DSH_HOME/awbotdsh-link/model.json`；普通指令暂以 failed 回执（Agent 执行桥接未接入）。
- 免登录：未登录 DeepSeek 账号也能进入主界面并使用本地/平台能力；首次引导已改为 AWBotDSH 版本（文案“登录平台账号，或添加 API Key……”，按钮为「添加 API Key」→ 设置·模型、「设备绑定」→ 设置·平台账号）；模型页原来的第二个引导弹层已移除；账户菜单触发器由「更多」改为「设置」，菜单只保留设置项，移除意见反馈与登录；设置里的账户分区不再显示登录按钮。
- 默认装配：已把四类默认插件加入 web-app 依赖与 patch 行；`profile.ts` 自动登记（含 browser/persona），实测不需要 `dsh plugin add`。
  - `packages/client/awbotdsh-knowledge`：由万象知识库（MIT）改名而来，内部统一为 `awbotdsh-kb` / `/kb` / `x-kb-token` / `.awbotdsh-kb`，对外名称「知识库」；保留本地上传/检索/图谱，新增平台账号登录、线上知识库开关、空间选择与 `knowledge_online_search/ask/status` 工具。
- Web 实测：侧栏出现「知识库」「插件广场」；技能页返回 24 条真实 SkillHub 技能；插件页显示 `@deepseek-ai/dsh-mcp-client@0.2.2-rc.5` 为内置默认项；`/api/kb-online/status` 返回 200 且默认 `enabled=false`。
- `@deepseek-ai/dsh-mcp-client` 注意：npm `latest` 仍停在 `0.0.1-rc.1`，与 rc.5 不兼容；应使用 `next` 的 `0.2.2-rc.5`。该包已在官方运行时依赖树内，并由 `dsh-mcp-manager` 挂载，无需单独安装。
- 默认装配：已把两个插件加入 `packages/bundle/web-app` 的依赖与 patch 行；并修改 `packages/boot/app-boot/src/profile.ts`，新建或已存在的 profile 都会自动登记这两个默认插件（解析走运行时依赖树，不需要启动时联网安装）。已实测：不执行 `dsh plugin add`，侧栏仍出现「知识库」「插件广场」。
- 线上知识库：新增 `test/online-kb.test.mjs`，用本地 mock 平台验证登录、密码不落盘、开关默认关闭、开启后空间/检索/问答全链路通过。
- 仍待完成：平台 `modelGrant` 自动写入 DSH 模型路由（当前已落盘，未自动挂 Provider）；普通指令的 DSH Agent 执行桥接；桌面安装包内置指纹内核与三扩展；用真实平台账号跑 RPA 端到端。

**slot 目录修正（一手核验）**：rc.5 源码 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 共 **128 条**（single 48 / list 50 / keyed 23 / chain 4 / hoc 3；`shadows-shipped-ui` 58 / `none` 67 / `wraps-owner-content` 3），不是方案稿写的 116 条（116 来自安装版 asar 的旧快照）。本方案用到的 `settings.section`(list/root)、`sidebar.panellist`(list/root)、`main`(keyed/root, shadows)、`sidebar.right.pane.tab`(keyed/session)、`conversation.input.left/right/dock/overlay`(list/session)、`shell.overlay`(list/root)、`plugins.detail.section`(list/root) 均存在。slot 存在性测试必须以源码 128 条为准。

---

## 一、核对结论

### 1.1 已在本仓库逐条验证成立

| 方案结论 | 代码证据 | 结论 |
|---|---|---|
| 平台通道已参数化（basePath + clientKind） | `backend/src/bot-host/bot-host.public.ts:61-73`；AWBOT 通道 `:464-473` | 成立，新增通道成本极低 |
| 令牌身份按 kind 强隔离 | `bot-host.public.ts:81-94`；`bot-host.service.ts:1312-1342` | 成立 |
| 配对码可重复认领 | `bot-host.service.ts:321-330` 判 `usedAt`；`:355-362` 只写 `hostId/issuedToken`；`usedAt` 仅 `pollPairCode` 写（`:1297-1300`） | 成立，属真实缺陷 |
| RPA 四端点随 basePath 自动注册 | `bot-host.public.ts:406-452` | 成立 |
| BotBuddy 设备链路硬编码点 | `rpa-shared.ts:6-20,178-184`；`rpa-task.service.ts`（`claimBotBuddy`/`requireBotBuddyTarget`） | 成立；沿用 `botbuddy` 键即零改动 |
| 超时自愈只在 PC 通道触发 | `rpa-task.service.ts:651` 调 `:1370 sweepTimeouts`；BotBuddy 通道无调用 | 成立，需补 |
| `rpaRelease` 定义了但从不调用 | `platform-client.js:339-346` 定义，`main.js` 无调用点 | 成立，需补 |
| 内置扩展只有 Automa | `chrome-extensions.js:73-100`；`builtin-extensions/` 仅 `automa` | 成立 |
| 三份 manifest 都无 `key` | 实测 `automa` / `aipdd-enterprise` / `chrome-bridge-extension` | 成立 |
| 桥接 5 个工具是死代码 | `chrome-bridge.js:224` 定义 `toolDefs`；`agent/index.js:40-56` 只注入 plugins 与 `fp/browser-tools` | 成立 |
| SkillHub 安装只写 SQLite | `main.js:1157-1181` → `agentConfig.saveSkill()`；全仓无写 skills 目录代码 | 成立，需新增双写 |
| Agent 不依赖配对 | `main.js:775-790` `chatPrecheck()` 只查模型渠道 | 成立 |
| 未配对不起心跳 | `main.js:390-393` `startHeartbeat()` 内 `isPaired()` 直接 return | 成立（现状已满足，只需测试锁定） |
| 认领页无按 userId 分流 | `host-panel.tsx:136-164` `submitPair()` 只提交 `code/name/clientKind` | 成立 |
| 改名工作量基线 | 前端 91 处、后端 110 处、契约注释 13 处（grep 统计） | 成立 |

### 1.2 必须修正或补充的口径

1. **D1「basePath 不落库」有低成本解法**
   `WorkbuddyHost.caps` 是 Json 列（`schema.prisma:2833`），心跳已整体落库（`bot-host.service.ts:1351-1363`）。新客户端在 `caps.client.channel = 'awbotdsh'` 上报即可持久化，前端可做“新版桌面端”徽章与灰度统计，**无需迁移、无需新增列**。

2. **「未配对不起心跳」已是现状**
   客户端 `startHeartbeat()` 只在 `isPaired()` 为真时启动，方案把它列为待改造项，实际只需纳入验收测试。

3. **桌面客户端是 AGPL-3.0-only**
   `bot-host-client/package.json:6` 明确为 `AGPL-3.0-only`。方案事实 5 表述为“项目自有，可自由改造”不够完整：自有代码可改，但**分发桌面端仍须履行 AGPL 义务**（源码随包或可获取）。改名不能顺便改为闭源，`LICENSE`、`THIRD_PARTY_NOTICES`、`PROVENANCE` 必须同步。`awbot-app/` 为 AGPL 上游快照，只能参考设计，不能把其代码复制进桌面端。

4. **DSH rc.5 底座不在本仓库（硬阻塞）**
   仓库只有 `awbot-app/runtime/locks/dsh-0.2.1-rc.4` 与 `dsh-0.2.2-rc.1`，无 `@deepseek-ai/dsh@0.2.2-rc.5`、无 `dsh-cordis-client-runner`、无官方 `apps/desktop` 源码。方案第十章“整体沿用 DSH 官方 UI”在拿到并验证底座前无法开工，必须先做 B7 的可行性 spike。

5. **「Agent 插件改写成 Cordis 插件」是重写，不是移植**
   BotBuddy 的插件是声明式 `http/command`（`plugins.js`），与 Cordis 宿主插件模型不同。方案 10.2 第 4 条的工作量应按“新写”估算。

6. **会话历史迁移风险被低估**
   本仓库没有 DSH `SessionEvent` 的一手格式。方案 10.5 的 JSONL 转换无法先行验证。建议首版**不迁移会话正文**：旧会话留在旧端只读，新端从空库开始，转换列 P3。

7. **指纹内核是运行时资产，不在仓库**
   仓库只有 `fp/kernels.js` 的导入逻辑，二进制（每版 200–300MB）不在库内。方案 10.6 把它列为随包资产，需要版权与体积确认；建议沿用“用户导入 / 首启下载”，并在计划中单列。

8. **同名主机唯一约束会放大重复认领问题**
   `WorkbuddyHost` 有 `@@unique([userId, name])`（`schema.prisma:2839`）。修幂等时若不处理，第二次认领会直接撞唯一约束返回 500，需要转成友好提示。

9. **客户端 basePath 全量硬编码**
   `platform-client.js:1-22,229-376` 全部写死 `/api/public/bot-host`。要走新通道必须先参数化。

10. **工作区有 8908 项未提交变更**
    `git status` 显示大量 `mobot-app → awbot-app` 重命名与文档改动。所有改造必须新开分支、按批次提交，不能与既有改动混在一起，也不能顺手清理这些变更。

---

## 二、总体路线

四条工作线，按依赖拆分：

| 线 | 范围 | 可验证性 | 依赖 |
|---|---|---|---|
| **A 平台** | 新通道、配对幂等、RPA 兜底、文案 | 本仓库可全量验证 | 无 |
| **B 桌面端（现有 bot-host-client）** | 改名、Link 参数化、双路径、模型 Key 策略、技能与安全门禁 | 本仓库可全量验证 | A |
| **C 浏览器工作台** | 三扩展预装、`key` 固定、桥接接活、指纹会话绑定、RPA 兜底 | 本仓库可验证（需用户提供内核） | B |
| **D DSH 新基座** | Electron + DSH rc.5 UI + 5 Client / 4 Host 插件 | 依赖外部包与源码 | A/B/C 稳定后 |

**推荐路线**：A → B → C → D。A/B/C 完成后，产品能力已覆盖方案的 80% 以上；D 的不确定性最高，先 spike 后承诺，不阻塞前三段交付。

**明确不做**（与方案保持一致，防止范围膨胀）：
- 不做匿名配对 / 设备授权码（P3 备选）；
- 不做消息级插件视图（`conversation.chat.*` / `tool.call.*`）；
- 不 fork DSH UI、不保留 `app.html` 双 UI（进入 D 线后）；
- 不把业务数据写 `$DSH_HOME`；
- 不把 CDP / relay / bridge 暴露到回环之外；
- 不改 `bot_`/`wb_` 令牌前缀、不改 RPA `deviceType=botbuddy`。

---

## 三、分批实施计划

### B0 基线（0.5 天）

1. 从 `main` 新建 `feat/awbotdsh`；**不提交、不清理**既有 8908 项变更。
2. 跑一遍基线并记录哪些本来就红：
   - `pnpm --filter aiworkin-enterprise-api test -- bot-host rpa`
   - `cd bot-host-client && npm test`
   - `pnpm --filter aiworkin-enterprise-web typecheck`
   - `pnpm check:architecture`
3. 产出：基线报告（供后续对比，避免把既有失败算到本次改动）。

---

### B1 平台通道 + 配对幂等（1–2 天，S）

**目标**：新客户端可独立配对；同一连接码只能认领一次；BotBuddy 通道具备超时自愈。

| 文件 | 改动 |
|---|---|
| `backend/src/bot-host/bot-host.public.ts` | 新增 `registerAWBotDSHPublic()`：`basePath:'/api/public/awbotdsh'`、`clientKind:'DESKTOP'`，复用 `registerBotHostPublic`；导出 |
| `backend/src/http/app.ts:75-76,517-519` | 引入并注册新通道 |
| `backend/src/bot-host/bot-host.service.ts:317-372` | `pairByCode()` 改为事务 + CAS：先 `updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } } })` 抢码，`count===0` 返回 CONFLICT；再建 host；`createHost()` 接受可选事务客户端 |
| 同上 | 同名主机唯一约束冲突（P2002）转友好提示：“已有同名主机，请改名后重试” |
| `backend/src/bot-host/bot-host.service.ts` `claimBotBuddy()` | 开头调用 `sweepTimeouts(userId)`，与 `claim()` 对齐（`rpa-task.service.ts:651`） |
| `backend/src/bot-host/bot-host.service.ts:77` | `CLIENT_CHANNEL_PREFIX` 建议改为中性 `'桌面主机 · '`，避免把旧端渠道行标成 AWBotDSH；仅影响新建渠道 |

**契约**：不改字段。若前端要展示通道，读 `host.caps.client.channel`（Json，无需 zod 变更）。

**测试**
- `bot-host.service.spec.ts`：同一码第二次认领 → CONFLICT；认领后 `pollPairCode` 仍可正常取令牌；同名冲突返回业务错误而非 500。
- `rpa-task-botbuddy.spec.ts`：botbuddy 领取前触发超时扫描（spy `sweepTimeouts`）。

**验证**
- `pnpm --filter aiworkin-enterprise-api test -- bot-host rpa`
- 手工走新 basePath：`login → pair → 平台认领 → poll → heartbeat`。

**回滚**：单文件 revert；新通道无数据迁移。

---

### B2 客户端改名 + 数据双路径 + 新通道（3–5 天，M）

**目标**：现有桌面端以 AWBotDSH 品牌交付，旧数据与旧令牌全部可读，历史用户无感升级。

**原则**：先做“可升级的改名”，不重写界面；`appId` 保持不变以支持覆盖升级。

| 文件 | 改动 |
|---|---|
| `bot-host-client/package.json` | `name → awbotdsh-client`（目录暂不改）；`productName/executableName/shortcutName → AWBotDSH`；`description`；**`appId` 保持 `com.aipdd.enterprise`**；`license` 保持 `AGPL-3.0-only` |
| `src/main/db.js` | `DATA_DIR` 固定为 `~/.awbotdsh`（可用 `AWBOTDSH_HOME` 覆盖）；**不读取 `~/.botbuddy` 的业务数据**；保留 `BOTBUDDY_HOME` 仅用于旧令牌/旧配置的只读识别 |
| `src/main/config-store.js` | `DEFAULTS.workingDir/deviceName`；legacy 导入路径；`SETTING_KEYS` 新增 `apiBasePath`、`disabledChromeExtIds` |
| `src/main/main.js` | 窗口标题、托盘文案、`BotBuddy · ` 渠道前缀、`botbuddy-skill-` 临时目录前缀 |
| `src/main/tray.js` | `PRODUCT_NAME` |
| `src/main/platform-client.js` | UA、`CLIENT_VERSION` |
| `src/main/agent/model-client.js` | 工具标识 UA |
| `src/main/fp/start-page.js`、`fp/proxy-relay.js` | 品牌与 UA |
| `src/renderer/app.html`、`app.js`、`app.css` | 品牌字面量（只改文案，不重写 DOM） |
| `chrome-bridge-extension/manifest.json`、`popup.html`、`background.js`、`README.md` | “AWBotDSH 浏览器桥接” |
| `tools/_db-unit.js`、`tools/_pipeline-unit.js` | 同步断言（`BOTBUDDY_HOME`/库名共 12 处） |
| `README*.md`、`docs/` 相关 | 品牌批量更新（可与 B6 合并） |

**兼容红线**：`bot_`/`wb_` 前缀、`deviceType=botbuddy`、`BOTBUDDY_HOME` 一律不改。

**验证**
- `cd bot-host-client && npm test` 全绿；
- 用旧 `~/.botbuddy` 启动：已配对令牌、技能正文、指纹档案、RPA 台账均可见；
- 改名后重新配对/心跳/执行正常。

---

### B3 Link 解耦与模型 Key 策略（2–3 天，S/M）

**目标**：新通道默认、旧通道可回退；未配对零噪音；平台拿不到本机 Key。

| 文件 | 改动 |
|---|---|
| `src/main/platform-client.js` | 所有 URL 由 `apiBasePath` 拼装；默认 `/api/public/awbotdsh`；仅当返回 404 且用户未显式配置时回退 `/api/public/bot-host`，并缓存结果 |
| `src/main/main.js:508-524` | 心跳 `caps` 增加 `client: { channel: 'awbotdsh', version }` |
| `src/main/main.js:465-506` | 停用 `pushLocalModel()` 上行（D4）：移除 `scheduleLocalModelSync()` 的调用或加默认关闭开关；保留 `clearModel()` 供撤销 |
| 同上 | 撤销授权只删 `PLATFORM_CHANNEL_ID` 自建渠道，不覆盖用户自建与内置渠道 |
| `src/main/config-store.js` | `token`/`userToken` 改用 Electron `safeStorage` 加密后落库（新增密文字段），启动时迁移旧明文；单测环境回退明文并标注 |
| `src/main/pairing.js`、`app.js` | 未配对提示改为“平台能力需配对”，不再锁对话/整页遮罩 |
| `src/main/main.js:390-404` | 保持 `isPaired()` 前置，补单测锁定“未配对不发请求” |

**验证**
- 未配对启动：抓包确认零 `/api/public/**` 请求；
- 401 清令牌、502/限流不清（回归 `main.js:533-540` 语义）；
- `grep -n "syncModel" src/` 无业务调用；配对后平台无本机 Key。

---

### B4 技能体系（4–6 天，M/L）

**目标**：6 个内置技能随包、首启可发现；SkillHub 安装落文件系统；恶意包本地拦截。

| 文件/目录 | 改动 |
|---|---|
| 新增 `bot-host-client/builtin-skills/` | 从 `awbot-app/app/assets/skills/{companion-adapt,dsh-go-guide,dsh-go-plugin,dsh-go-support,dsh-go-ui,pet-theme}/` 复制，保留 `manifest.json`；加 `SOURCE.md` 说明来源与许可 |
| 新增 `src/main/skills/installer.js` | manifest 驱动；路径白名单；`MAX_FILES=64`、单文件 512KiB、总量 1MiB；临时文件 + rename；`SKILL.md` 最后写；managed marker；`userOwned` 不覆盖；seed marker |
| 新增 `src/main/skills/security.js` | 从 `backend/src/feature/skill-security.ts`（四组检查）与 `skill-review.rules.ts`（六道红线）移植为纯 JS；`permissions` 解析；运行时复扫；`formatSecurityFailure` 文案 |
| `src/main/main.js` `bootstrap()` | 首启 seed 技能；`skillhub:install` 双写（SQLite + 技能目录），失败回滚；`agent:importSkillPackage` 先过门禁 |
| `src/main/agent/tools.js` | `load_skill` 读取前复扫；复核 `allowedSkillIds` 闸门 |
| `src/renderer/app.js` | 「＋」技能源 = 本地技能目录 ∪ SQLite；`modelInvocable=false` 显示“仅手动”；会话级 `skill_ids` 语义不变 |
| 技能目录落点 | D 线未接入前：`~/.awbotdsh/skills/`；DSH 接入后切 `$DSH_HOME/skills/`（配置项切换，不双写两处） |

**测试（新增）**
- `tools/_skill-install-unit.js`：中断安装无残留、`SKILL.md` 最后写、userOwned 不覆盖；
- `tools/_skill-security-unit.js`：反弹 shell、`169.254.169.254`、`AKIA...`、`curl|sh`、保留密钥名、`permissions` 未确认；
- SkillHub 双写一致性。

---

### B5 浏览器工作台（6–10 天，L）

#### B5.1 三扩展默认预装（D9）

| 文件 | 改动 |
|---|---|
| 新增 `tools/prepare-builtin-extensions.js` | 构建前把 `extensions/aipdd-enterprise`、`chrome-bridge-extension` 复制进 `bot-host-client/builtin-extensions/`；在 `dist:win/dist:mac` 前置执行 |
| 三份 `manifest.json` | 加 `key`（RSA 公钥 base64）；公钥入库，私钥不入库；生成一次并固定 |
| 新增 `docs/AWBotDSH扩展ID.md` | 记录三扩展 ID 与生成方式 |
| `src/main/rpa-runner.js:157-164` | 更新 Automa 兜底 ID（加 key 后商店 ID 不再适用；动态抓取路径不变） |
| `src/main/chrome-extensions.js` | `disabledChromeExtIds` 过滤；按 manifest `key` 派生 ID 去重；内置不复制进受管目录（方案 A） |
| `src/main/fp/launch.js:106-115` | 合并时过滤禁用项、按 ID 去重 |
| `src/renderer/app.js` | 内置项也渲染启用/禁用开关 |

**验收**：`chromeExt:list` 返回 3 项 `builtin:true`；ID 跨机一致；`--load-extension` 无重复路径；禁用后重启不加载。

#### B5.2 桥接 token 自动注入 + 接进 Agent

| 文件 | 改动 |
|---|---|
| `src/main/chrome-bridge.js` | 新增 `pushTokenToExtension()`：CDP 唤醒 service worker → `chrome.storage.local.set({bridgeUrl, token})`；保留重启轮换 |
| `src/main/agent/index.js:35-58` | `extraTools()` 注入桥接工具（在线才注册）；与 `fp/browser-tools.js` 同名工具显式区分，避免覆盖 |
| `chrome-bridge-extension/background.js` | 不实现 `page.eval` 就明确不声明；补齐与工具定义一致的 action |

**验收**：`/hello → /poll → runAction → /result` 闭环；重启桥接旧 token 被拒。

#### B5.3 指纹窗口会话绑定 + URL 导航

| 文件 | 改动 |
|---|---|
| `src/main/db.js:70-80` | `chat_conversations` 增加 `fp_profile_id`（沿用现有 ALTER 探测机制） |
| `src/main/fp/launch.js:331-350` | `agentWindow(sessionId)` 解析顺序：会话绑定 → 全局 `agentProfileId` → 最近使用 → 自动建默认窗口 |
| `src/main/fp/index.js`、`browser-tools.js` | 工具入参带 `sessionId`，内部映射到档案 |
| `src/main/ws-client.js:22-25` | 显式校验 host 必须为 `127.0.0.1` |
| `src/renderer/app.js` | 浏览器面板增加 URL 输入框，调用 `navigateAgent`；`https://` 自动补全，仅放行 http(s)/about: |

**验收**：A/B 两会话绑不同档案互不串台；`caps.agent.fingerprint.windows` 仍只含 5 字段。

#### B5.4 RPA 兜底

| 文件 | 改动 |
|---|---|
| `src/main/main.js:626-690` | 终态回执后调用 `platform-client.rpaRelease()`，失败仅告警 |
| 平台侧 | B1 已为 BotBuddy 通道补 `sweepTimeouts` |

**验收**：客户端中途被杀，任务在超时窗口后由平台退回 `pending`；`_rpa-unit.js` 全绿。

---

### B6 前端与平台文案（2–3 天，S）

| 范围 | 改动 |
|---|---|
| `frontend/src/app/agent-bot/_components/bot-host/*` | “BotBuddy” → “AWBotDSH”；下载指引更新；配对流程文案不变 |
| `frontend/src/app/agent-bot/_components/ai-call/*` | 同上（设备/授权文案） |
| `frontend/src/app/rpa/**` | 设备标签改“AWBotDSH 浏览器”，**键 `botbuddy` 不动**；`botbuddy-browser-panel.tsx` 文案 |
| `backend/src/**` 110 处 | 只改显示字符串；`CLIENT_CHANNEL_PREFIX`、错误提示、帮助文案 |
| `packages/contracts/src/**` 13 处 | 注释更新；改动后跑 `pnpm api:docs:check` |

**验收**：`grep -rn "BotBuddy"` 剩余项均为历史标识、迁移说明或许可证文本。

---

### B7 DSH 新基座 spike（3–5 天，先验证后立项）

**目标**：回答“DSH rc.5 能不能作为桌面底座”，不写业务插件。

**输入已到位**：`C:\Users\Administrator\Downloads\deepseek-harness-master.zip`（0.2.2-rc.5，25,330 个文件，含 `apps/desktop`）。
**已落地位置**：`E:\wwwroot\deepseek-harness`（仓库外兄弟目录，已 `pnpm install`、`build` 成功；为打包脚本要求本地 `git init` 一次；`.env.windows` 使用 `com.awbotdsh.desktop` + 测试更新源）。

**已核验的接入机制（官方文档一手）**：
- Desktop = 完整 DSH Web UI 的 Electron 壳；Host 与插件在同一 Electron Node 模式进程执行。
- 外部插件不复制进 `app.asar`，装在 `$DSH_HOME/profiles/desktop`；先启动一次 Desktop 初始化 profile，退出后执行 `dsh plugin --profile desktop add <package>`。
- 品牌常量在 `apps/desktop/scripts/electron-builder-config.mjs`（`productName: 'DeepSeek Harness'`）；appId 由 `.env.windows` 的 `DSH_DESKTOP_APP_ID` 控制。
- 打包目标：`package:win:x64:dir --unsigned`；签名非必需，但必须提供 `DSH_DESKTOP_MANDATORY_UPDATE_*_ORIGIN`（HTTPS 纯 origin）。

**B7 已完成的部分（2026-11-19）**：
- `pnpm install`、`pnpm --filter @deepseek-ai/dsh-desktop run build` 成功；
- `package-target.ts win-x64 --dir --unsigned` 成功产出 `win-unpacked`，官方冒烟测试通过：离线插件安装/移除、`dsh web` 启动、Office 技能列出与加载、DOCX/XLSX/PPTX 转换；
- 环境适配（仅本地快照，不进入产品）：需要 `.env.windows`（appId/更新源）、本地 `git init`、以及给 `prepare-package-set.ts` 加 `DSH_TAR_BIN` 覆盖以绕开 Windows `tar` 把盘符当远程主机；
- 已新增并跑通两个默认插件：`awbotdsh-market`（插件市场 + 技能广场）与 `awbotdsh-knowledge`（知识库，含平台账号与线上开关）；二者已登记到 `packages/bundle/web-app` 的依赖与 patch 行。
- 剩余：桌面端首次启动把这两个插件写入 profile 依赖；平台账号登录后的线上知识库端到端验证；把 5 Client + 4 Host 规划插件补齐。

1. 用已构建的 Desktop 目录包启动一次，确认 Web UI 与 Host 就绪；
2. 将 `docs/dsh/slot-catalog-0.2.2-rc.5.json` 作为构建期断言输入；
3. 最小插件：一个 hello `settings.section`，通过 `dsh plugin --profile desktop add file:<本地包>` 装配，验证 slot 注入与卸载撤销；
4. 通过标准：UI 可起、插件注入、`skills/list` 能发现 `$DSH_HOME/skills`、可打包 Windows 目录包；
5. 产出：可行性报告、打包/签名/升级方案、插件工程模板；
6. **不通过则 D 线暂缓**，B/C 线继续作为正式交付。

D 线立项后（需再次确认范围）：
- 5 个 Client 插件：`awbb-composer` / `awbb-settings` / `awbb-browser` / `awbb-rpa` / `awbb-link-ui`；
- 4 个 Host 插件：`awbb-link` / `awbb-browser` / `awbb-rpa` / `awbb-store`；
- `app.html` 下线、`preload` 收敛为 Host 通道；
- 会话历史迁移（建议只读旧端，不做 JSONL 转换）。

---

### B8 发布与收尾（1–2 天，S）

- 客户端版本 `1.8.0`；后端兼容发布（新通道可先上线）。
- 发布说明：改名、通道、旧数据兼容、AGPL 源码对应关系、升级/回滚步骤。
- 按仓库规范打 tag。
- 更新 `docs/AWBotDSH迁移优化方案.md` 的“已落地”状态（不重写方案，只加实现索引）。

---

## 四、需要拍板的决策

| # | 决策 | 建议 | 影响 |
|---|---|---|---|
| **P1** | 执行路线 | **A → B → C，D 单独立项 spike** | 前三段可在本仓库闭环交付；D 不确定性隔离 |
| **P2** | DSH 底座来源 | **已定：使用用户提供的 `deepseek-harness-master.zip`（0.2.2-rc.5，MIT）**；解压到仓库外兄弟目录，不污染 git | 决定 D 线是否可行与工期 |
| **P3** | 数据目录 | **已定：全新目录 `~/.awbotdsh`，不继承旧数据**；仅兼容旧 `bot_`/`wb_` 令牌 | 存量用户的技能与指纹档案需重新导入 |
| **P4** | 指纹内核分发 | **已定：随安装包内置** | 安装包体积增加 200–300MB，需确认内核再分发许可 |
| **P5** | 模型 Key | **停上行 `/model-settings`**；下行仅在显式授权时写独立 Provider | 对齐“Key 不出本机” |
| **P6** | 新旧端区分 | **`caps.client.channel`（Json，无迁移）** | 灰度、统计、文案 |
| **P7** | 渠道名前缀 | 改中性 `桌面主机 · ` | 避免旧端被标成 AWBotDSH |
| **P8** | 前端是否加“新版客户端”徽章与下载入口 | 加，仅展示 `caps.client.channel` | 灰度引导 |

---

## 五、验收命令

```bash
# 平台
pnpm --filter aiworkin-enterprise-api typecheck
pnpm --filter aiworkin-enterprise-api test -- bot-host rpa
pnpm api:docs:check            # 契约注释改动后

# 客户端
cd bot-host-client && npm test

# 前端
pnpm --filter aiworkin-enterprise-web typecheck

# 仓库守卫
pnpm check:architecture
```

功能验收按 `docs/AWBotDSH迁移优化方案.md` 第十三章执行；B 线对应 13.1–13.7，C 线对应 13.8，D 线对应 13.9。

---

## 六、风险与回滚

| 风险 | 触发点 | 处置 |
|---|---|---|
| 改 appId 导致覆盖升级失败 | B2 | **不改 appId**；只改 productName/快捷方式 |
| 旧库明文令牌迁移失败 | B3 | 保留明文列兜底；`safeStorage` 解密失败回退并提示 |
| 加 `key` 后 Automa ID 变化导致 RPA 找不到扩展页 | B5.1 | 动态抓取保留；同步兜底常量；发布前实测 |
| 内置扩展被复制两份导致加载冲突 | B5.1 | 方案 A：只从随包目录加载，不 seed 复制 |
| 技能双写不一致 | B4 | SQLite 为元数据主源、文件系统为运行源；写失败回滚并重试 |
| DSH 版本破坏性变更 | B7/D | 锁 rc.5、目录入库、升级先跑 slot 存在性测试 |
| 与既有 8908 项未提交改动冲突 | 全流程 | 新分支、按批提交、只 add 本批文件 |

---

## 附：与方案文档的差异摘要

1. D1 的“basePath 不落库”用 `caps.client.channel` 解决，不新增列。
2. “未配对不起心跳”是现状，不是待改造项。
3. 桌面端 AGPL 义务需在改名时同步处理。
4. DSH rc.5 不在仓库，第十章必须先 spike。
5. 会话历史迁移建议降为 P3（旧端只读）。
6. 指纹内核不随包，走用户导入/首启下载。

---

## 实施缺口清单（2026-11-20 复核）

### P0 阻塞核心能力

1. **平台指令执行桥接（已实现，待真实平台验收）**：Link 心跳领取指令后，按顺序用 DSH 原生 Agent 执行：新建会话、优先平台模型授权、按 `mode` 设定沙箱并关闭人工审批；`agent/assistant-stream` 文本增量转 `/progress`，回合结束把最终回复/错误写回 `/result`；`stop` 与 progress 的 `cancelRequested` 会取消会话。已用本机 mock 平台跑通「登录 → 配对 → 心跳领指令 → 创建 Agent → progress → result」；真实平台还需在有模型 Key 的环境验证成功回执。
2. **桌面安装包验证（进行中）**：品牌已改为 AWBotDSH；构建链已修三个问题：①插件 peer 依赖固定到 0.2.2-rc.5，避免拉旧包链；②客户端插件不再挂 apps/cli，避免 Host 构建要求 startup.js；③knowledge 补 lib/types 入口 shim。当前打包在 prepare:runtime 阶段报 `fetch failed`，需继续排查（疑似运行时对私有 @aipdd 包的解析/网络）。
3. **指纹内核随包**：决策为随安装包内置，但仓库内没有内核二进制；浏览器启动目前仍要求用户填写内核目录。
4. **RPA 真机联调**：需要已配对平台 + 指纹内核，跑通领取 → Automa → 回执 → release。
5. **平台 modelGrant → Provider**：已实现动态写入 `llm-pi-ai` 与凭据服务，但未用真实平台验证。

### P1 核心交互缺口

6. **对话框「＋」技能入口（部分完成）**：「＋」已改为打开 `/` 下的全部来源，指令与已安装技能同屏；选中技能会插入 `/技能名`。尚未做多选勾选式的“本会话启用技能”。
7. **数字分身与对话集成**：目前只有设置页 CRUD 与 `persona_list/read` 工具，没有会话级选择/应用入口。
8. **Chrome 桥接**：DSH 浏览器插件只有扩展列表与启停，尚未实现 token 自动注入、桥接 5 个工具与扩展 ZIP 导入 UI。
9. **会话级指纹窗口绑定**：浏览器插件目前只有全局默认窗口，未按会话绑定 `fpProfileId`。
10. **知识库工作台 UI**：仍是 iframe 独立页面，未统一到 DSH 主题。

### 已在本轮补齐

- 桌面壳 productName/artifactName/protocol 显示名改为 AWBotDSH。
- RPA 任务「刷新任务」结果未回填 UI 的 bug 已修。
- 浏览器设置从侧栏浮层迁入设置，并统一主题变量/卡片/按钮样式。
- 设置分区独立图标；平台账号改名设备绑定。
- 知识库侧栏入口报 `main panel "awbotdsh-kb" is not registered`：keyed `main` 槽不接受 `id`，已改为只用 `key` 注册，点击可正常打开工作台。
- 6 个自有插件补齐 `dsh.bundle.patch` 与 `cordis.patch.yml`，改为标准 profile bundle 加载；`web-app` 不再重复 insert；`initProfile` 同时把默认插件写入 `dsh.profile.bundles`。插件管理由「异常 / 包不可用」变为已安装且可启停。
- 指纹内核 spawn 未监听 `error`，内核路径缺失时会抛未捕获异常；已补 `error` 监听并在就绪检查时上抛。
- 知识库工作台顶部去掉了上游 GitHub 链接与 `KB / LOCAL KNOWLEDGE` 标识，改为 AWBotDSH 品牌。
- 修正自有插件 Host 半的构建入口：原先指向 `lib/types/index.js`（tsc 旧产物），导致后续 Host 改动（市场安装器、浏览器状态、RPA 轮询）没有真正进包；现统一改为 `src/index.ts` 并从源码构建。
- 「＋」原先只打开 `command` 源，技能是同一 `/` 下的 `skill` 源而被过滤；现改为打开全部来源，并新增 `toggleAll`。
- SkillHub 技能常以中文标题作为 SKILL.md 的 `name`，DSH 只接受 `[a-z0-9-]` 技能名，导致安装成功但被文件系统 provider 静默忽略；安装时现自动把 `name` 归一为 slug（展示标题仍在 description 中）。
- 修复「添加 AIPDD API Key 报 llm-pi-ai 配置被覆盖」：base 补丁里 `llm-pi-ai` 被 insert 了两次（一次空配置、一次含 providers），配置编辑器按 id 取到第一条空配置导致校验不一致；现合并为唯一一条带 AIPDD providers 的 insert。
- 侧栏「技能」菜单补齐「技能广场 / 已安装」两个页签；已安装列表显示标题与 slug，支持确认后卸载，并在技能目录写入 `.awbotdsh.json` 保留中文标题。
- 首次引导弹层增加凭据门禁：Host 新增 `/api/awbotdsh/welcome` 直接查 AIPDD / DeepSeek / 平台凭据；前端只在“明确没有 Key”时展示，连接未就绪按未知重试，并用 localStorage 记住已展示/已跳过，避免反复弹窗。
- 知识库新增「同步知识库」：先查设备绑定，再调用平台记忆提炼与页统计，成功后开启线上分支；本地 `knowledge_search` / `knowledge_read` 会合并线上命中并支持 `online-<spaceId>-<pageId>` 读取。
- 知识库工作台、设置页与弹层统一到 DSH 主题变量；设置页改为标准卡片并加入同步入口。
- 技能「已安装」页现在同时列出市场安装项（可卸载）与系统/用户/内置技能（标注来源、不可卸载），解决 lark-* 技能出现在会话却不在已安装列表的问题。
- 已在本机 web profile 安装并启用：modlens、DSH Computer Use、Hindsight、dsh-our-free-model、DSH-better-sidebar、dsh-routing-suite、dsh-TUI（后两者改用 npm 发布包安装，绕开 GitHub prepare 失败）；按要求剔除 dsh-web。open-design 根包无 `dsh.bundle`，其 `@open-design/dsh-runtime` 是运行时而非可挂载插件，强行加入会导致 `dsh web` 参数解析失败，暂未启用。
- 技能页新增「添加技能」主按钮（ZIP/SKILL.md 导入到 $DSH_HOME/skills），按钮尺寸对齐插件页添加插件（32px 高、13 图标、左右 12px）。
- 技能卸载覆盖全部来源：市场安装、user-agents、bundled；无本地路径的 bundled 记入本机隐藏清单。
- AIPDD 模型不再写死：启动及写入 AIPDD Key 后自动拉取 /v1/models 并写回 llm-pi-ai，默认模型同步切到首个可用模型（实测 ap-deepseek-v4-flash）。
- 指纹内核改为随安装包自动查找（resources/kernels、awbotdsh-kernel、app.asar.unpacked/kernels 等），「内核与运行」只显示已内置/未检测到，不再要求用户填写目录；错误文案统一指向「设置 → 浏览器设置」。
- 插件广场卡片按真实安装状态出按钮：已安装显示「打开」并跳到插件详情页（来源、版本、组件、卸载），未安装且有 npm spec 显示「安装」；同时用插件管理器清单校正安装状态，移除不存在包的占位项。

### P2 体验与治理

11. 插件市场 tarball 安装未校验 `dist.integrity`/签名。
12. 技能市场仍直连 SkillHub 公开 API，未走平台 SkillHub 转发（未配对也可用是优点，但缺少平台计费/审计）。
13. 桌面图标仍为 DSH 图标，未替换为 AWBotDSH 品牌资产。
14. 缺少自有插件的自动化回归（仅手工 Web 验证）。
