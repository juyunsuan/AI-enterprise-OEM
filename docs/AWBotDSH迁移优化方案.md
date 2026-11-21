# AWBotDSH 迁移优化方案（BotBuddy → deepseek-harness 底座）

> 目标：用 **deepseek-harness (DSH)** 替换现有 BotBuddy 桌面客户端底座（**新客户端仍为 Electron 桌面形态；整个界面框架沿用 DSH 官方 Web UI（React + slot 扩展体系），不再保留 BotBuddy 的 app.html 原生界面**）；把 BotBuddy 的功能逐项剥离、移植为 DSH 的 **Host / Client 双层插件**并注入官方 UI；移植与平台通过**连接码**对接的能力（**本地模型即用；平台配对仍是"网址 + 账号 + 密码 → 6 位码 → 网页认领"，只影响平台能力，不阻塞 Agent**）；复用 AWBot（基于 DSH-Go）与 DSH 的对接成果，**默认初始化已接入的插件与技能（SKILL.md）**，并在**对话框「＋」中提供按会话选择的技能入口**；**完整移植浏览器工作台——指纹窗口、Chrome 插件（默认预装本项目插件与 Automa）、Automa RPA 任务，浏览器形态与 BotBuddy 一致并可输入网址**；产品改名 **AWBotDSH**。
> 编制时间：2026-11-19　|　范围：两个外部仓库（deepseek-harness、dsh-Go）+ 本项目 bot-host-client / awbot-app / extensions / 平台后端与前端
> **目标底座版本：`0.2.2-rc.5`（已定，最新版）**　|　slot 落点基线：rc.5 的 **116 条**官方目录（见事实 10）
> 本文**只做方案，不含实现**。所有判断均给出具体文件路径、函数、行号作为依据，可逐条回查。
> **2026-11-19 复核修订**：本稿已对照当前工作区代码逐条回查并修正（行号、函数签名、文件数与体积、slot 基数、配对码表字段、技能安装落点等），全部改动见文末 [附二](#附二本稿核验修订记录2026-11-19)；无法在本机一手核验的外部事实已标注"待核验"。

---

## 目录

- [一、结论先行：十个改变方案性质的事实](#一结论先行十个改变方案性质的事实)
- [二、三个信息源现状](#二三个信息源现状)
- [三、目标架构与迁移总原则](#三目标架构与迁移总原则)
- [四、需要你先拍板的十个决策点](#四需要你先拍板的十个决策点)
- [五、分阶段迁移方案](#五分阶段迁移方案)
- [六、专题：连接码对接如何移植](#六专题连接码对接如何移植)
- [七、专题：插件默认初始化](#七专题插件默认初始化)
- [八、专题：技能支持与默认初始化](#八专题技能支持与默认初始化)
- [九、专题：浏览器工作台——指纹窗口 / Chrome 插件 / RPA 任务](#九专题浏览器工作台指纹窗口--chrome-插件--rpa-任务)
- [十、专题：界面框架沿用 DSH UI 与 BotBuddy 功能剥离](#十专题界面框架沿用-dsh-ui-与-botbuddy-功能剥离)
- [十一、专题：改名 AWBotDSH 影响面](#十一专题改名-awbotdsh-影响面)
- [十二、风险清单与合规边界](#十二风险清单与合规边界)
- [十三、验证清单与验收标准](#十三验证清单与验收标准)
- [附一：关键文件索引](#附一关键文件索引)
- [附二：本稿核验修订记录（2026-11-19）](#附二本稿核验修订记录2026-11-19)

---

# 一、结论先行：十个改变方案性质的事实

调研后有十个事实会直接改变任务定义，必须先明确，否则方案会建立在错误假设上：

### 事实 1：deepseek-harness 不是"新引入的底座"，它已经是 AWBot 的引擎

`awbot-app/docs/design/plugin-seams.md:3` 记载：该调研的**基线**是 npm `@deepseek-ai/dsh@0.2.1-rc.2` 与 DSH 0.2.0-rc.2 源码（即 deepseek-harness）。但 AWBot 现内置引擎已是 **0.2.2-rc.1**（`awbot-app/docs/changelog.md:85`、`docs/official-parity.md:3`），本项目手里的 slot 目录 fixture 是 rc.1（109 条），而**本方案锁定的桌面端底座是 rc.5（116 条，见事实 10）**。所以本次不是"给桌面端接一个陌生框架"，而是**把已经在 AWBot 手机上跑通的 DSH 引擎搬到桌面端**——团队已有 DSH 插件与技能体系、slot、补丁机制的一手调研成果；但要注意那份 slot 实测（100 个）停在 rc.2，**落点必须按锁定的 rc.5 重测**（见事实 10、R19）。

### 事实 2：项目里已有完整的 AWBot 与 `awbot_link` 对接层，可直接移植

`awbot-app/packages/awbot_link/`（纯 Dart，1271 行）已实现与 BotBuddy 同构的全套对接：`api.dart`（`/api/public/awbot` + 双令牌）、`pairing.dart`（6 位码）、`transport.dart`、`runner.dart`、`store.dart`、`model_sync.dart`。这是**连接码移植的最佳参考实现**，比 BotBuddy 的 JS 实现更贴近 DSH 场景（它就是为 DSH 写的）。

### 事实 3：BotBuddy ↔ 平台之间**没有** A2A/CDP/WebSocket 通道，只有出站 HTTP + 5 秒心跳轮询

`bot-host-client/src/main/platform-client.js:6-7` 注释原文："The client always initiates requests (poll model); the platform never calls in"。所谓 A2A 属于**另一个产品** WorkBuddy（后端 `backend/src/workbuddy/workbuddy-client.ts:399,432`），CDP 是客户端**本机浏览器控制**（`ws-client.js`，仅 `ws://` 本机）。
→ 好消息：移植面比想象小，只需搬一套出站 HTTP 协议；坏消息：不要指望平台能主动推送唤醒。

### 事实 4：平台侧连接码/心跳/指令/授权体系是 `clientKind` 无关的，几乎零改动即可复用

`registerBotHostPublic(app, services, deps, options)`（`bot-host.public.ts:68-73`，`basePath`/`clientKind` 是 `options` 的字段，`:61-66`、`:75-77`）已支持 `DESKTOP`/`AWBOT` 两种通道；但 kind 并不是"每个 service 都带参数"——只有 `pairByCode(user, code, name, platform, clientKind)`（`bot-host.service.ts:317-322`）显式收 kind，心跳/进度/回执一律走 `hostByToken()` 的令牌前缀 + `host.clientKind !== requiredKind` 拦截（`bot-host.public.ts:81-94`，判断在 `:87`）。AWBot 新增通道的实践已经证明该模式可行（`registerAWBotPublic`，`:464-473`）。**平台侧主要工作是"再加一个通道配置 + 文案"，不是重构**；但要清楚"按 basePath 区分新旧端"只是路由事实、不落库（见 D1）。

### 事实 5：许可证边界必须提前厘清

| 组件 | 许可证 | 对本项目影响 |
|---|---|---|
| deepseek-harness | **MIT** | 商用友好，桌面端以其为底座无传染风险 |
| dsh-Go（AWBot 上游） | **AGPL-3.0** | 手机端 `awbot-app/PROVENANCE.md` 已按 AGPL 履行源码义务；桌面端若只依赖 harness(MIT)、复用 `awbot_link` 的**设计思路**而非其 AGPL 代码，可规避传染；若直接复制 dsh-Go 代码则触发 AGPL 义务 |
| BotBuddy 现有客户端 | 项目自有 | 可自由改造 |

→ 方案默认路线：**桌面端基于 MIT 的 deepseek-harness，参考而非复制 AWBot 的 AGPL 代码**，`awbot_link` 仅作为协议参考（详见第十二部分）。

### 事实 6：技能体系已经存在，但有两套互不兼容的落地方式——必须"同时支持、分开实现"

- **AWBot 一套**：`awbot-app/app/assets/skills/` 下已有 **6 个**内置技能（`dsh-go-ui`、`dsh-go-plugin`、`dsh-go-guide`、`dsh-go-support`、`companion-adapt`、`pet-theme`），`pubspec.yaml:190-195` 声明为 Flutter 资源。技能按 `manifest.json` 的 `{name, files}` 映射写入 `$DSH_HOME/skills/<name>/`，DSH 的 `FileSystemSkillProvider` **监视该目录，新增即生效、无需重启**（`ui_skill.dart:5-9`、`plugin-seams.md:415-418`）。
- **BotBuddy 另一套**：技能是**文本内容**，存 SQLite `skills` 表（`db.js:36-42`），通过 `load_skill` 工具按 id 读正文（`agent/tools.js:248-262`）；来源为本地导入（`skill-package.js`）与 SkillHub 平台转发（`platform-client.js:347-376`）。
- **平台底座已在**：`ContentAgentSkillService`（审核后启用、版本回滚）、`skill-security.ts`（确定性四组检查）+ `skill-review.rules.ts`（六道红线）、`packages/contracts/src/skillhub.ts`（list/detail/install）。

→ 结论：新客户端**不要新建技能注册中心**，也不要把技能塞进插件表。正确做法是"**DSH 文件系统为技能运行主路径 + 平台 SkillHub 为分发通道 + BotBuddy 本地安全/导入语义为补充**"，详见第八部分。

### 事实 7：Agent 只依赖本地模型，配对是另一条可选链路（现状已如此，别在迁移中弄丢）

- **对话只需要模型渠道**：`chatPrecheck()` 的唯一前置是 `agentConfig.activeChannel()`，没配才提示"到「模型渠道」填渠道地址、密钥与模型名"（`main.js:783-790`）；`chat:send` 全程不查配对（`:1534-1566`）。
- **配对走"网址 + 账号 + 密码"**：登录表单三个字段 `baseUrl/loginUser/loginPass`（`app.js:363-410`）→ `POST /api/public/bot-host/login`（`platform-client.js:229-234`，`bot-host.public.ts:191-227`）→ 30 天 `userToken` → `/pair` 申请 6 位码（`pairing.js:67-79`）→ 平台「Bot 主机」页认领 → `/pair/poll` 取 `bot_` 令牌。服务端 `requestPairCode` 把 `userId` 写进码（`bot-host.service.ts:1252-1269`），`pairByCode`/`pollPairCode` 校验同账号（`:334`、`:1283`）。
- **未登录只影响配对卡**：`pairing.js:72-79` 把状态置 `locked`，界面显示"先登录平台账号"（`app.js:337-339,349-353`）；`config-store.isPaired()` 只看 `bot_`/`wb_` 主机令牌（`:267-276`）。**对话、本地技能、本地插件、指纹窗口都不受它约束。**
- **结论**：新客户端要保留这个模式——**本地模型即用；平台配对仍是"网址+账号+密码 → 6 位码 → 网页认领"，只影响平台能力**。不需要新造免登录协议，详见 6.4。
- **顺带必须修的 bug（与配对方式无关）**：`pairByCode` 只查 `row.usedAt`（`:327`），而 `usedAt` 只有 `pollPairCode` 才写（`:1296-1299`），认领路径（`:357-359`）不写 → **同一个码可重复认领，每认一次新建一台 host**。

### 事实 8：BotBuddy 的"指纹窗口"不是 Electron 窗口，而是外部指纹内核进程

`fp/launch.js:125-129` 用 `child_process.spawn(kernel.exe, args, { windowsHide:false })` 拉起**独立操作系统级指纹 Chromium 进程**；Electron 只有管理台窗口（`main.js:127-160`，1080×760，`loadFile(renderer/app.html)`）。每个档案一个内核进程、一个 `user-data-dir`（`~/.botbuddy/fp-profiles/<id>`）、一个随机 CDP 端口（`launch.js:96-98`）与一个代理 relay 端口。

→ 用户要的"浏览器打开后同 BotBuddy、可输入网址"由**内核原生 Chrome 地址栏**提供（`fp/start-page.js:34` 的起始页文案即为"在地址栏输入网址开始"）。因此移植方向是"**保留外部内核 + CDP，管理界面改由 Client 插件呈现在 DSH 官方 UI 上**"（D10，第十部分），不是"用 DSH Desktop 的 BrowserWindow 重画浏览器"，也不是"把 CDP 传输到平台"（CDP 全部绑 `127.0.0.1`，`ws-client.js:22-25`）。详见第九、十部分。

### 事实 9：默认预装只做了一半——Automa 已内置，本项目插件与桥接扩展都还没进启动链

- `chrome-extensions.js:73-100` 的 `builtins()` 只扫描 `builtin-extensions/` 一级目录，当前**仅 `automa` 一项**（官方原版 1.30.02、8.3MB、82 文件）。`launch.js:108-111` 把内置插件**无条件**加入 `--load-extension`，用户插件按档案 `extensionIds` 勾选。
- 本项目插件 `extensions/aipdd-enterprise/manifest.json`（v1.6.0）**不在** `builtin-extensions/`，也不在受管目录，BotBuddy 从未加载它——它是面向真实 Chrome 独立分发的插件。
- `chrome-bridge-extension/` 虽随包 `extraResources` 分发，但不在 `builtins()`，且不进 `--load-extension`，**不默认加载**；用户须手动去 `chrome://extensions` 加载并填 token（其 README:5-12）。`chrome-bridge.js:223-277` 的 5 个工具定义**全仓无调用点**，Agent 实际用的是 `fp/browser-tools.js` 的同名 CDP 工具。
- 三份 manifest **都无 `key` 字段**，解包加载的扩展 ID 由目录绝对路径派生，不固定；RPA 只能靠 `rpa-runner.js:157-163` 动态抓取扩展页，`:164` 的商店 ID `kfefaponhdnhhcggeamejckaddlkjmed` 只是兜底。

→ 要做到"默认安装本项目插件 + Automa"，必须补三件事：**把 aipdd 纳入内置目录、给三份 manifest 加 `key` 固定 ID、把桥接工具接进 Agent**。详见第九部分。

### 事实 10：DSH Desktop 本身就是"Electron + 官方 React Web UI + 双层插件"，界面框架可整体沿用

`docs/architecture.md`（DSH 官方架构文档）明确：Electron 启动私有 **Desktop Host**（Electron Node 模式），Host 调用共享 CLI 的 profile runner 与**完整 Web 应用**；窗口立即加载打包好的 Web assets，等待 boot injections 后在**同一文档**激活 client plugins；**Web 拥有 RPC 与 streams**，Desktop 只把本地页面接到已认证的 Host；默认监听 OS 分配端口，保留 `$DSH_HOME/profiles/desktop`。UI 是官方 Web 客户端的**类型化 React 组合系统**（`plugin-seams.md:23`）：

- 插件经 `ctx.slots.inject(key, () => ctx.slots.register({name,id,order,label?}, Component))` 注入（`plugin-seams.md:23`），slot 有 single/list/keyed/chain 基数与 root/session/session-maybe 作用域（`:24`）。
- **基线（已定 `0.2.2-rc.5`，最新版）**：官方目录共 **116 条** slot——`shadows-shipped-ui` **53**、`none` **60**、`wraps-owner-content` **3**；基数 single 45 / list 44 / keyed 20 / chain 4 / **hoc 3**；作用域 root 57 / session 54 / session-maybe 5。来源：`@deepseek-ai/dsh-cordis-client-runner@0.2.2-rc.5` 的 `src/client/slot-catalog.ts`（`CLIENT_SLOT_API`，与 `cordis_inspect what:"client"` 同源，安装版内嵌于 `app.asar`）。
- **相对 rc.1（109 条 / 50 / 59）的漂移**：新增 7 个 key（`conversation.chat.markdown.fence`、`conversation.hero.frame`、`conversation.input.model.options`、`conversation.session.header.actions.subagent.footer`、`settings.launcher.notifications`、`sidebar.session.action`、`workspace.picker.directoryFlow`），删除 0 个；新增基数 `hoc` 与风险类 `wraps-owner-content`（三条 hoc：markdown 代码块围栏、hero 外框、侧栏会话行动作——语义是"包住 owner 内容、`children` 最多渲染一次"，**不是追加点**）。本项目的 `slot-catalog-0.2.2-rc.1.json` 从此只作历史对照，落点自检必须用 rc.5 的 116 条。
- **关键澄清**：`plugin-seams.md` 中"9 个 slot 已接线 / 网页岛 / App 不执行插件代码"是 **Flutter 手机端 AOT 约束**（`native-plugins.md:97`：release 包无 Dart 解释器，不能加载外来代码）。桌面端 DSH Desktop 加载的是**完整官方 Web UI**，插件是一等公民，**不需要网页岛、不受 9-slot 限制**——正是用户要求的"界面框架沿用 DSH UI"的天然落点。

→ 因此本轮方案基线由"保留 BotBuddy 的 Electron 管理台 UI"改为"**整体沿用 DSH 官方 UI，BotBuddy 功能剥离成 Host/Client 插件注入**"。详见第十部分。

> 术语澄清：本方案下文"宿主插件 / Host 插件"= 在 Desktop Host（Node 模式）注册服务与 HTTP 路由的 Cordis 插件，承载指纹内核、CDP、RPA、心跳、平台协议；"客户端插件 / Client 插件"= 在 Web UI 文档里经 slot 注入 React 组件的插件，承载所有可见管理界面。两者是 DSH 官方的双层插件模型，不对应 BotBuddy 的 main/renderer 进程概念。

---

# 二、三个信息源现状

## 2.1 deepseek-harness（External）

- **定位**：DeepSeek 开源的 agent harness，"Everything is a Plugin"，基于 **Cordis** 组合式编程范式；MIT 许可；当前为 **developer preview，明确声明会有破坏性变更**。
- **运行**：`npx @deepseek-ai/dsh web`（Web UI `127.0.0.1:3080`）；源码 `pnpm install && pnpm run build && pnpm dsh web`。
- **形态**：pnpm monorepo，含 `packages/`、`python/`、`native/`、`vendor/`、`website/`；有**官方 Desktop（Electron）**（commit 记录见 `.gitignore` 相关条目 `apps/desktop/.desktop-build`/`.desktop-dev`）。
- **插件机制**：Cordis 扩展，通过 `ctx.slots.inject/register` 注入 UI slot（本项目调研测得 `0.2.1-rc.2` 共 100 个 slot；AWBot 现引擎 rc.1 为 109 条，**本方案锁定的 rc.5 为 116 条**，见事实 10）；插件有 `profiles/web` 配置与 `cordis.patch.yml`、`dsh-web.patch.yml` 补丁挂载机制（后者在 `/etc/dsh-app/`、由运行时重写，见 7.2）。
- **技能机制**：DSH 侧为文件系统约定——`<dshHome>/skills`（rank 400，跳过 `.system` 子目录），目录形式 `<name>/SKILL.md`，YAML frontmatter 必填 `name`（kebab-case）与 `description`，可选 `whenToUse`；**根目录受监视，新增无需重启**（`plugin-seams.md:415-418`）。消费端 RPC `skills/list`（`features_api.dart:303-322,566-583`），返回 `name/description/whenToUse/path/modelInvocable`。仓库自身还在 `.agents/skills/` 中提交了 `dsh-code-review` 开发辅助技能并经 `.claude/skills` 软链暴露——这是**给开发者的技能**，与运行时技能是两层概念，不要混淆。
- **⚠️ 已知安全洞（本项目调研发现）**：`plugin-seams.md:17` 指出"本机 webserver 上插件路由不鉴权，手机上任何 App 都能调"——桌面端上线前**必须先加路由守卫**（`dsh web` 本身只接受具体本地接口地址、拒绝通配，但插件路由仍需自己的令牌/来源校验）。
- **官方文档可一手引用**：deepseek-harness 仓库内已有 `docs/capability-seams.md`（能力/slot 接缝）、`docs/subsystems/slots.zh.md`（slot 系统）、`docs/cookbook/{extension-cookbook,adding-a-settings-card,adding-a-remote-api,adding-a-tool}.md`、`docs/architecture.md`、`docs/cli-help.zh.md`。此前"官方插件文档链接 404"只是站点入口问题，落地应以这些仓库文档为准，本项目的 `plugin-seams.md` 作为手机端一手实测补充。

## 2.2 dsh-Go / AWBot（External + 本项目已有）

- **定位**：社区第三方、非官方 DSH 手机客户端（Flutter + Android Kotlin + iOS Swift + OHOS），AGPL-3.0；运行在手机上的是 DSH 引擎本身，模型请求发往用户配置的提供方。
- **本项目状态**：`awbot-app/` 已是其完整对应源码快照，显示名改 AWBot，包名保持 `io.github.ccch1mneyyy.dsh_app`（避免存量数据迁移）。
- **对接能力**（`PROVENANCE.md:19-22`）：6 位连接码配对、`awb_` 令牌、`/api/public/awbot/**` 心跳、逐台对话与定时任务、按设备授权模型、AWBot Link 与模型同步。
- **插件与技能初始化现成范式**：
  - 插件：`sdk/plugin-kit/`（原生插件工具包）+ 11 个 `examples/plugins/`；升级运行时保留 `/root/.dsh` 下的插件、`cordis.patch.yml`、`skills/`、`dsh-go/ui.json`（`plugin-seams.md:436`）。
  - 技能：6 个内置技能目录随包，由 `UiSkillAutoInstaller` 在引擎每次 ready 时安装（`ui_skill.dart:181-339`）；三端原生提供私有通道 `ManagedSkillInstaller.kt:143-213`、`EngineSkills.swift:257-310`、`ManagedSkillCore.ets:176-223`，统一写 `<root>/root/.dsh/skills/<name>/`，约束 `MAX_FILES=64`、单文件 512 KiB、总量 1 MiB、路径白名单、`SKILL.md` 最后写入、原子替换。

## 2.3 BotBuddy（本项目现状）

| 维度 | 事实 |
|---|---|
| 技术栈 | Electron 31 + 原生 Node（无 React/Vue），唯一运行时依赖 `better-sqlite3`；`package.json:2,4,8` |
| 连接码 | 客户端**先登录** → `/pair` 申请 6 位码 → 界面展示 → 每 2s `/pair/poll` → 用户在平台网页认领 → 取 `bot_` 令牌落盘 → 5s 心跳。`pairing.js:67-187`、`platform-client.js:229-258`、`bot-host.service.ts:1252-1342` |
| 通信 | 单一出站 HTTP `/api/public/bot-host/**`，双身份：`Bearer` 用户令牌（登录/配对）+ `x-bot-token` 设备令牌（心跳/进度/回执/技能/RPA/AI 调用） |
| 本地存储 | `~/.botbuddy/botbuddy.db`（SQLite，schema v5），`BOTBUDDY_HOME` 可覆盖；含 channels/api_key、skills、plugins、tasks、对话等表 |
| 插件三套 | ①Agent 声明式插件（`plugins.js`，http/command）②Chrome 扩展（`builtin-extensions/automa` 随包默认加载 + 用户导入）③技能 SLKILL.md（SkillHub 拉取）。**仅 Chrome 内置插件有"默认加载"机制** |
| 技能链路 | 本地 SQLite `skills` 表 + `load_skill` 工具（`agent/tools.js:248-262`）；SkillHub 搜索/详情/下载/安装端点（`platform-client.js:347-376`、`main.js:1115-1181`）；安装只写 SQLite、**不写 `$DSH_HOME/skills/`**（8.3），**平台不代装**（`bot-host.public.ts:330-334`）；`agent-skills.service.ts` 侧有"未过审禁止启用"约束，客户端侧无本地安全门禁 |
| 本机能力 | 指纹浏览器矩阵（`fp/`）、RPA（`rpa-runner.js`）、CDP 浏览器控制（`ws-client.js`，仅 `ws://` 本机）、Chrome 桥接（127.0.0.1:35911）——**均为 Electron 特有，DSH 底座不具备** |
| 模型 Key 双向流 | 下行 `modelGrantForHost()`（心跳下发解密后的真实 Key，`bot-host.service.ts:1431-1469`）；上行 `syncModel`（客户端把本机 Key POST 到 `/model-settings`，`main.js:484-506`）——**与"Key 不出本机"口径冲突** |

---

# 三、目标架构与迁移总原则

```
┌───────────────────────────────────────────────────────────────────────┐
│ 平台（不变为主）                                                       │
│  bot-host.service.ts —— kind 无关的连接码/心跳/指令/授权骨架            │
│  registerBotHostPublic(basePath, clientKind)                           │
│    ├─ /api/public/bot-host   → clientKind=DESKTOP （现有 BotBuddy）     │
│    ├─ /api/public/awbot      → clientKind=AWBOT   （现有 AWBot 手机）   │
│    └─ /api/public/awbotdsh → clientKind=DESKTOP （新 AWBotDSH）★   │
│  SkillHub 转发：/skills、/skills/:slug、/skills/:slug/download          │
│  （只给字节与元数据，客户端本地安装，平台不代装）                       │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ 出站 HTTP + 5s 心跳（poll 模型，平台不回调）
┌──────────────────────────────▼────────────────────────────────────────┐
│ AWBotDSH 桌面端（新）＝ DSH 官方 Desktop（Electron + 官方 React Web UI）│
│  ┌─ 界面框架：DSH 官方 Web UI（React + slot，整体沿用，不自绘）─────┐  │
│  │  Client 插件 → ctx.slots.inject/register 注入管理界面/＋面板/设置 │  │
│  │  ├─ settings.section：平台账号/连接码/浏览器/RPA 设置分区        │  │
│  │  ├─ sidebar.panellist / main：浏览器工作台等独立页面              │  │
│  │  ├─ conversation.input.left/right/dock：＋技能选择（按会话）       │  │
│  │  └─ sidebar.right.pane.tab：浏览器/RPA 管理右侧页签               │  │
│  │  原生会话/设置/插件页 = DSH 自带，不重写（shadows-shipped-ui）    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌─ deepseek-harness / DSH 引擎（MIT，Cordis 插件架构）─────────────┐  │
│  │  Host 插件：profiles + cordis.patch + 预置包 → HTTP 路由/RPC/服务  │  │
│  │  技能：$DSH_HOME/skills/<name>/SKILL.md → FileSystemSkillProvider  │  │
│  │        （watcher 热加载，skills/list 可见；与插件目录互不混用）   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌─ AWBotDSH Link（Host 插件，参考 awbot_link 设计）──────────────┐  │
│  │  平台网址+账号+密码 → 6位码 → 网页认领 → bot_ 令牌（只影响平台能力）  │  │
│  │  一次性 hostToken → 5s心跳 → progress/result → 模型授权          │  │
│  │  + 账号快照 / pluginManifest / skillManifest 下发                 │  │
│  │  本地安全存储（hostToken/心跳游标/commandCode 幂等，不存密码）   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌─ 浏览器工作台（Host 插件驱动外部内核，UI 由 Client 插件呈现）───┐  │
│  │  └─ 指纹窗口：每档案一个外部内核进程 + 原生地址栏 + CDP(127.0.0.1)│ │
│  │  └─ Chrome 扩展：内置 Automa + 本项目 aipdd + 桥接扩展（默认预装）│ │
│  │  └─ RPA：任务领取 → CDP 触发 Automa → 盯台账 → 回执（botbuddy）  │ │
│  │  三套体系隔离：DSH 插件/技能在 $DSH_HOME；Chrome 扩展在 ~/.awbotdsh│
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**七条迁移总原则**：

1. **平台侧能不改就不改**：复用 `clientKind` 参数化骨架，只加通道与文案。MoBot→AWBot 的迁移（`migrations/0143_awbot_client_kind/migration.sql`）已验证"只改字面量、保留数据"的做法。
2. **引擎用 MIT 的 DSH，对接层自己写**：桌面端依赖 deepseek-harness（MIT）；`awbot_link` 只作协议参考，不复制 AGPL 代码（合规边界见第十二部分）。
3. **界面框架整体沿用 DSH 官方 UI，功能靠剥离注入**：不 fork DSH UI 源码、不用 BotBuddy 的 `app.html` 原生 DOM、不做网页岛；BotBuddy 的每个界面都用 **Client 插件 + slot** 重新落到官方 UI 上，每项本机能力用 **Host 插件**承载（详见第十部分）。这条是本轮新增的最高优先级原则。
4. **对接层做成"伴生模块"**：参照 `docs/AWBot手机接入方案.md` 的原则——不改造 DSH 主体，只加 Link 模块 + 启动注册 + 少量配置。
5. **能力分界清晰**：DSH 负责 agent 执行、插件 UI 与技能发现；Link 负责平台协议（含 SkillHub 转发）；**插件=运行时扩展（Cordis/ctx.slots），技能=SKILL.md 知识/工作流包（文件系统/skills/list），Chrome 扩展=MV3 浏览器扩展（内置目录/受管目录，进 `--load-extension`）**，三者分目录、分表、分开关，不互相冒充；桌面特有能力（指纹窗口/RPA/桥接）作为**独立 Host 插件**移植，不塞进 Link，也不塞进 `$DSH_HOME`。
6. **兼容存量，平滑切换**：旧 `bot_` 令牌、`~/.botbuddy` 数据、DESKTOP 设备类型尽量保留识别；新旧客户端可短暂并存。
7. **本地模型即用，配对为可选**：不配对即可用对话/内置插件/技能/浏览器工作台（自带模型）；配对只解锁平台能力（任务指令、模型授权、SkillHub、积分）；平台密码只在 `/login` 用一次、不落客户端，本地存 30 天会话令牌与 `bot_` 主机令牌；未配对时"平台能力"明确标记"需配对"，而不是把整个客户端锁死。

---

# 四、需要你先拍板的十个决策点

这十个问题决定方案走向，建议先定，再进入实现（D5 已按本轮需求明确为"完整移植"，D10 已按本轮需求明确为"整体沿用 DSH UI"）：

| # | 决策点 | 选项与影响 | 建议 |
|---|---|---|---|
| **D1** | 新客户端用什么 `clientKind` | ①沿用 `DESKTOP`（与旧 BotBuddy 同类，可共享任务队列）；②新增 `AWBOTDSH` kind（需改契约枚举、后端分流、前端筛选） | **①沿用 DESKTOP**，通道路径区分即可，改动最小。⚠️ 但要接受一个后果：`basePath` 只是路由前缀，**配对后不落库**——主机记录里没有任何"我来自新通道"的字段，所以"按 basePath 区分新旧端"只在请求当下成立。若产品需要按新旧端做灰度/统计/差异化下发，必须显式记一笔（例如写进 host 的 `caps.clientChannel` 或新列），否则 D8 里"用 basePath 区分新旧端"这句话无法实现 |
| **D2** | 令牌前缀 | ①沿用 `bot_`（存量令牌继续有效）；②新前缀 `abw_`（需后端 `hostByToken` 增加识别） | **①沿用 `bot_`**，除非安全上有强制轮换需求 |
| **D3** | 本地数据 `~/.botbuddy` | ①迁移到 `~/.awbotdsh`（干净但存量配置/技能丢失）；②保留路径仅改显示名（零迁移）；③双路径兼容读取 | **③双路径兼容**：优先 `AWBOTDSH_HOME`/`~/.awbotdsh`，回退 `~/.botbuddy`（含旧技能正文） |
| **D4** | 模型 Key 双向流 | ①停用上行 `/model-settings` + 下行 Key 只在用户显式授权时写入独立 Provider（AWBot 范式）；②维持现状 | **①**，对齐"Key 不出本机"口径：固定 Provider route、只删自建项、不覆盖内置 DeepSeek Key |
| **D5** | 浏览器工作台移植范围（已定方向） | ①**完整移植**：指纹窗口 + 内置 Automa + 本项目插件 + RPA（用户本轮明确要求）；②裁剪只做对话；③旧端过渡 | **①完整移植**：保留外部内核 + CDP 伴生模块；旧 BotBuddy 仅作为升级期灰度并存，不再承担能力缺口 |
| **D6** | 品牌/开源合规口径 | 桌面端是否复用 AWBot 名称与形象（AWBot 名称/标识不在 AGPL 授权内，见 dsh-Go `ASSETS.md`） | 用 **AWBotDSH** 作为自有品牌名；不使用 DSH Go 吉祥物 Deepy/鲸娘形象 |
| **D7** | 技能的预置范围与落地路径 | ①只预置 AWBot 6 个内置技能（写 `$DSH_HOME/skills/`），SkillHub 保持在线安装；②不预置，全部走 SkillHub；③预置基线 + SkillHub 按需 + 平台清单下发 | **③**：6 个内置技能随包 seed（DSH 原生发现），SkillHub 走平台转发只给字节；先修三端白名单 5/4/4 不一致（第八部分） |
| **D8** | RPA `deviceType` 键值 | ①沿用 `botbuddy`（AWBotDSH 领同类任务，零后端改造）；②新增 `awbotdsh`（需改 `rpa-shared.ts` 枚举、`SCRIPT_FILE_TYPES_BY_DEVICE`、契约、前端下拉与回归用例） | **①沿用 `botbuddy`**：以 `botHostId` 绑定 + 显式的客户端通道标记区分新旧端（**不要只靠 basePath**，它不落库，见 D1），任务队列与 Automa 脚本库互通；②仅在做"手机端/桌面端任务物理隔离"时再启用 |
| **D9** | Chrome 扩展 ID 固定与预装范围 | ①三扩展都加 `key` 固定 ID + 全部默认预装；②只预装 Automa 与本项目插件、桥接保持手动；③不固定 ID | **①**：`key` 是"跨机一致 + 升级保留 + RPA 稳定找到 Automa 扩展页"的前提；预装 `automa` + `aipdd-enterprise` + `chrome-bridge-extension`，禁用开关留给用户（第九部分） |
| **D10** | 界面框架与功能剥离方式（已定方向） | ①**整体沿用 DSH 官方 Web UI**：BotBuddy 界面逐项剥离成 Client 插件注入 slot、本机能力做 Host 插件；②保留 BotBuddy `app.html` 管理台、DSH 只当引擎（旧方案基线）；③fork DSH UI 源码二次开发 | **①**：用户本轮明确要求。③不可取（developer preview + 破坏性变更 + fork 维护成本）；②不满足诉求。代价是 BotBuddy renderer 的原生 DOM 界面须用 React 重写（第十部分给出逐项映射） |

---

# 五、分阶段迁移方案

## 阶段 0：决策与准备（不做代码）

- **已定目标版本：`0.2.2-rc.5`**（最新版；npm 上它挂在 `next` 而非 `latest`——`latest` 仍是 rc.1——本机安装版也是 rc.5）。锁定 rc.5 后，**落点自检一律以它的 116 条 slot 目录为准**（`dsh-cordis-client-runner@0.2.2-rc.5/src/client/slot-catalog.ts`），rc.1 的 109 条只作历史参照。developer preview 有破坏性变更 → 锁版本 + 升级评审；升级时必须重新提取目录、重跑 slot 存在性测试。
- D10 已定：基于**官方 Desktop（Electron + 官方 React Web UI）**做插件化二次开发，**不 fork UI 源码、不保留 app.html 管理台**。需先验证目标版本的 slot 目录与 `dsh.profile` 装配方式（第十部分 10.1）。
- 盘点需要随包的技能清单（D7）与三端白名单现状，确认是否纳入首版。
- 盘点浏览器工作台随包资产（D5/D9）：指纹内核二进制来源与体积（每版本 200–300MB）、Automa 1.30.02、aipdd-enterprise 1.6.0、桥接扩展；为三扩展生成 `key` 并固定 ID；确认是否复制旧 `~/.botbuddy/kernels` 与 `fp-profiles`（第九部分 9.2）。

## 阶段 1：平台侧通道与文案（低风险，可独立上线）

1. 新增 `registerAWBotDSHPublic()`（或复用 `registerBotHostPublic` 传 `clientKind:'DESKTOP'` + 新 basePath），参照 `registerAWBotPublic`（`bot-host.public.ts:464-473`）。SkillHub 转发端点随 `basePath` 自动获得，无需新写。
2. 后端文案常量增加"桌面端"新名称：`CLIENT_CHANNEL_PREFIX`（`bot-host.service.ts:77`）、`userAgent` 默认（`bot-host.public.ts:210`）、RPA 通道注释与文案（`:401-404,422,433,443`；注意 `:268` 是 model-settings 文案、`:426/:446` 是 `claimBotBuddy`/`releaseBotBuddy` 调用，不是文案）——**仅显示层，逻辑不动**。
3. 前端 `agent-bot`、`ai-call` 的设备文案与下载指引更新（`frontend/src/app/agent-bot/_components/bot-host/*`）；设备类型键沿用 `DESKTOP`，不动 RPA 的 `botbuddy` 键（避免牵动 `rpa-task.service`）。
4. **配对路由与认领页不动**：`/login`（网址+账号+密码）、`/pair`、`/pair/poll` 语义原样保留；网页认领页（`frontend/src/app/agent-bot/_components/bot-host/host-panel.tsx`，`submitPair()` 在 `:136-164`）沿用现有"输入码 → 服务端 `pairByCode` 校验同账号"的做法，**不新增匿名端点、不做按 userId 空/非空分流**（6.4）。
5. 平台侧验收：新旧客户端可同时配对、任务队列按设备隔离、互不串台；未配对客户端不产生心跳与 401 噪音。

## 阶段 2：AWBotDSH Link 对接层（核心，参考 awbot_link）

按第六部分移植：本地模型渠道即用（Agent 不依赖配对）→ 需要平台能力时再走"平台网址 + 账号 + 密码 → 6 位码 → 网页认领 → 拿 `bot_` 令牌" → 心跳 → progress/result → 模型授权。层放在 DSH 引擎之外，作为伴生模块/插件注册进启动流程。SkillHub 的三个转发端点（`platform-client.js:347-376`）按同一 `x-bot-token` 身份接入，未配对时明确提示"需配对"。

## 阶段 3：插件与技能默认初始化（第七、八部分）

把项目已接入的插件做成"随包预置 + 首次启动初始化"；同时把 AWBot 的 6 个内置技能按 `$DSH_HOME/skills/<name>/` 约定 seed，让 `skills/list` 新装即可见。SkillHub 在线安装作为补充通道，必须补上本地安全门禁与权限确认。

## 阶段 4：改名、并存与灰度（第十一部分）

品牌字面量统一为 AWBotDSH；本地数据双路径兼容；新旧端灰度并存一个版本周期。**旧 `~/.botbuddy` 中的技能正文、指纹档案（`fp_profiles` 含加密代理密码）、用户导入的 Chrome 扩展需可读可迁**（D3、第九部分 9.2）。

## 阶段 5：浏览器工作台移植（本轮必做，详见第九、十部分）

1. **指纹内核与 CDP 伴生模块**：复用 `fp/{fingerprint,kernels,profiles,proxy-relay,start-page,index,launch}.js` 与 `ws-client.js`，`DATA_DIR` 接双路径；保留"一档案一进程 + 原生地址栏"体验；**原 Electron 管理台三个 Tab 不再原样迁移，按第十部分改造成 Client 插件 + slot 呈现在 DSH 官方 UI 上**。
2. **三扩展默认预装**：`automa` + `aipdd-enterprise` + `chrome-bridge-extension` 纳入 `builtin-extensions/`，加 `key` 固定 ID；首启 seed + `.managed-by-bootstrap` marker；桥接 token 自动注入；把 `chrome-bridge.js` 的 5 个工具接进 Agent（当前是死代码）。
3. **RPA 链路**：复用 `rpa-runner.js` 的 Automa/CDP 链路（`deviceType=botbuddy` 不变，D8）；新通道 `/api/public/awbotdsh/rpa/*` 自动随 `registerBotHostPublic` 获得；心跳继续上报 `caps.agent.fingerprint` 窗口候选；补 `rpaRelease` 调用与 BotBuddy 通道超时扫描缺口。
4. **隔离红线**：Chrome 扩展绝不写 `$DSH_HOME`；CDP/relay/bridge 只绑 `127.0.0.1`；RPA 单任务异常只收口为 failed 回执，不阻断心跳/对话/技能（第九部分 9.6）。

## 阶段 6：能力补齐（可选，P2）

推送唤醒（AWBot 方案列为 P3）；`pluginManifest` + `skillManifest` 平台清单下发；`rpa-chrome` 链路（用户本机 Chrome 插件、`x-chrome-token`）按需接入——它与 Automa 链路并存，不是替代。

---

# 六、专题：连接码对接如何移植

## 6.1 移植什么（完整出站协议）

对照 `awbot-app/packages/awbot_link/lib/src/api.dart:12-87` 与 BotBuddy `platform-client.js:229-376`，Link 需实现：

| 能力 | 端点 | 鉴权 | 参考实现 |
|---|---|---|---|
| 账号登录/会话 | `/login`、`/session` | Bearer（login 免） | `api.dart:21-27`、`pairing.js:67-79` |
| 申请连接码（旧端） | `/pair` | Bearer | `api.dart:31-35`、`bot-host.service.ts:1252` |
| 轮询认领结果（旧端） | `/pair/poll` | Bearer | `api.dart:38-39`、`bot-host.service.ts:1272` |
| 心跳取指令 | `/heartbeat` | `x-bot-token` | `api.dart:42-53`、`main.js:508-524` |
| 进度回传 | `/progress` | `x-bot-token` | `runner.dart`、`main.js:728-735` |
| 结果回执 | `/result` | `x-bot-token`（按 commandCode 幂等） | `main.js:736-767`、`bot-host.service.ts:1497` |
| 模型授权 | `/ai-call/accounts` 等 | `x-bot-token` | `bot-host.public.ts:286-328`、`model_sync.dart` |
| SkillHub 目录/下载 | `/skills`、`/skills/:slug`、`/skills/:slug/download` | `x-bot-token` | `platform-client.js:347-376`、`bot-host.public.ts:335-398` |
| 退出 | `/logout` | `x-bot-token` | `platform-client.js:302` |

## 6.2 关键实现要点（照搬已验证的语义）

1. **令牌身份严格分离**：`sessionToken`（Bearer）只用于 login/session/pair/pair/poll；配对成功后落 `bot_` 主机令牌（`x-bot-token`）用于心跳/进度/回执/SkillHub/模型授权。客户端只在这两种令牌之间切换，**密码永不落盘**（AWBot `api.dart:5-10` 的双令牌原则原样保留）。
2. **配对方向**：客户端申请并展示 6 位码 → 平台网页同账号认领 → 客户端轮询取一次性令牌。TTL 10 分钟（`bot-host.service.ts:65`），码与 `clientKind` 绑定（通道即设备类型，`bot-host.public.ts:240`）。
3. **令牌安全**：明文仅返回一次，后端只存 sha256（`hashToken`，`:79-81`）；客户端落盘需加密/系统密钥环，参照 `awbot_link/store.dart`。
4. **心跳语义**：5s（`BOT_HEARTBEAT_SECONDS=5`，契约 `:42`）；解析 `commands/stop/modelGrant/grantUnchanged/heartbeatSeconds`；**401 才清令牌**，502/限流只告警重试（`main.js:533-540`）。
5. **幂等**：`result` 按 commandCode 幂等；本地保存已处理的 commandCode 游标（`db.js:62-69` tasks 表 / `store.dart`）。
6. **能力上报克制**：`heartbeatCaps` 不上报模型渠道/技能/分身（"平台不需要也看不到"，`main.js:203-219`）——上报 `clientVersion` 注意限 24 字符（`bot-host.service.ts:1353`）。
7. **DSH 执行替换**：BotBuddy 的 `agentRuntime.run` 换成 DSH 引擎调用（AWBot 用 `DshClient.prompt/watch/cancel`）；流式进度映射为 DSH 事件 → `/progress`。

## 6.3 不需要移植的

- 平台侧全部 service/表/契约（kind 无关，原样复用）。
- A2A/CDP/WorkBuddy 云端链路（与本项目 BotBuddy 无关）。
- 指纹浏览器/RPA/Chrome 桥接（D5 已定完整移植，详见第九部分；风险 R4 见第十二部分）。
- BotBuddy 的 SQLite 技能正文表作为**运行主路径**——DSH 用文件系统发现（第八部分）。

## 6.4 本地模型即用 + 平台配对解耦（本轮要守住的核心）

### 6.4.1 先看 BotBuddy 现状：Agent 与配对本来就是两条线

| 能力 | 前置条件 | 代码事实 |
|---|---|---|
| 对话 / Agent | **只要本地「模型渠道」**（`baseUrl` + 密钥 + `model`） | `chatPrecheck()` 唯一前置是 `agentConfig.activeChannel()`（`main.js:783-790`）；`chat:send` 全程不看配对（`:1534-1566`） |
| 平台配对 | **平台网址 + 账号 + 密码** | 登录表单 `baseUrl/loginUser/loginPass` → `api.platformLogin`（`app.js:363-410`）→ `POST /api/public/bot-host/login`（`platform-client.js:229-234`，`bot-host.public.ts:191-227`）→ 30 天 `userToken` → `/pair` 取 6 位码 → 平台「Bot 主机」页认领 → `/pair/poll` 取 `bot_` 令牌 |
| 配对影响面 | 平台任务指令、RPA 领取、模型授权下发、SkillHub | `config-store.isPaired()` 只看 `bot_`/`wb_` 主机令牌（`:267-276`）；对话、本地技能、本地插件、指纹窗口都不查它 |
| 未登录时 | 只是拿不到连接码 | `pairing.js:72-79` 把配对卡置 `locked`，界面提示"先登录平台账号"（`app.js:337-339,349-353`），**不影响对话** |

→ 结论：**现状就是我们要的模式**——Agent 靠本地模型跑，平台配对是另一条可选链路。本方案要做的不是新造协议，而是**换成 DSH UI + 双层插件时别把这层解耦弄丢**：不要把"已配对"当成进主界面的前置，也不要沿用全局 locked 语义。

### 6.4.2 三条必须守住的边界

1. **首启即可对话**：Desktop Host ready → 读本地模型渠道 → 直接进会话页；不弹登录框、不锁输入框。没配模型时只提示"去配置模型渠道"，而不是"去登录"。
2. **配对是可选开关**：放在 `settings.section` 的「平台账号」分区（awbb-settings）；未配对时平台相关入口显示"需配对"，不报错、不整块消失（对应 R13）。
3. **不新增配对协议**：沿用 `/login`（网址 + 账号 + 密码 → 30 天会话令牌）+ `/pair` + `/pair/poll`，契约 `BotHost_pair`（`packages/contracts/src/bot-host.ts:424-432`）不动。**不需要 `/pair/anonymous`、不需要 `deviceSecretHash` 列、不需要 `/pair/reject`。**

```
本地模型渠道（自己填 baseUrl/密钥/model） ──→ 对话 / 技能 / 插件 / 指纹窗口 / RPA 本地跑
                                              （全部不依赖配对）
平台网址 + 账号 + 密码 → 30 天 userToken → 6 位码 → 网页认领 → bot_ 令牌
                                              ↓
                              心跳 / 平台任务指令 / RPA 领取 / 模型授权 / SkillHub
```

### 6.4.3 落地要点（客户端）

- **启动顺序**：先确保模型渠道可用（本地 SQLite / DSH provider）→ 会话页立刻可用 → 再异步恢复配对状态。**有 `bot_` 才起 5s 心跳**，没有就不起，避免未配对时 401 重试风暴。
- **配对流程照搬**：`platformLogin` → `pairOpen` → 展示 6 位码 → 平台认领 → `pairPoll` 收令牌 → 起心跳；这几个函数在 `platform-client.js:229-258` 已现成，Link 层直接复用即可。
- **未配对能力矩阵**：

| 能力 | 未配对 | 配对后 |
|---|---|---|
| 对话（自带 Key 或 DSH 内置 Key）、本地技能、DSH 插件、指纹窗口、本地 Automa/RPA 执行器 | ✅ 可用 | ✅ 可用 |
| 平台任务指令、RPA 任务领取、模型授权下发、SkillHub、积分计量 | 🚫 显示"需配对" | ✅ 可用 |

- **凭据**：密码只在 `/login` 用一次、绝不落盘；`userToken`（30 天）与 `bot_` 令牌改用系统安全存储（现状落在 `settings` 表明文，`config-store.js:26-37`）；换平台地址/换账号时清 `userToken` + `token`（`clearUser`/`clearToken`，`:278-289`），**本地对话与模型配置保留**。
- **UI 红线**：不做"未配对就整页遮罩/禁用对话"；平台入口用"需配对"徽章 + 一键跳转配对分区。

### 6.4.4 平台侧改动：几乎没有

- 通道：新 basePath + 文案（阶段 1），`/login`、`/pair`、`/pair/poll` 语义一律不动，网页认领页（`host-panel.tsx`）按现状即可。
- **唯一建议的修复**（与配对方式无关、对现有流程也成立）：`pairByCode` 认领时不写 `usedAt`，同一个码可重复认领、每认一次 `createHost` 新建一台 host（`:327` 判 `usedAt`，`:357-359` 不写）。补"认领即置 `usedAt`（或 CAS/唯一约束）"即可，**不新增表或列**。

### 6.4.5 旧稿的"匿名配对/设备授权码"去哪了

原稿按 RFC 8628 设计的"客户端免登录申请码 → 网页认领"**移出本方案**，降为 P3 备选（触发条件：将来确实要做"客户端完全不见账号也能完成配对"）。届时才需要 `deviceSecretHash` 列、`/pair/anonymous`、`/pair/poll/anonymous`、`/pair/reject`、抢注防护与客户端二次确认；现在不做，避免平台侧无谓改动和"半套匿名"的安全洞。

---

# 七、专题：插件默认初始化

## 7.1 用户诉求的落点

"默认把接入的插件初始化到新的 BotBuddy 中"——结合 AWBot 调研，落点是：**新装 AWBotDSH 首次启动时，DSH 引擎内已经带上了项目选定/用户已接入的插件，无需手工逐个安装**。技能同理但走不同目录与发现机制（第八部分）。

## 7.2 现成范式（不要重新发明）

DSH 插件的持久化与默认加载机制在 AWBot 调研中已有结论：

- 插件位于 `$DSH_HOME`（AWBot rootfs 内 `/root/.dsh`），升级时保留的是 `profiles/web`、`cordis.patch.yml`、`skills/`、`dsh-go/ui.json`（`plugin-seams.md:436`）。**`dsh-web.patch.yml` 不在保留清单里**：它在 `/etc/dsh-app/dsh-web.patch.yml`，属运行时自有文件，每次升级被重写（`plugin-seams.md:212,436`、`runtime/lib/rtbuild.py:696-705`）——预置插件不能写这里。
- 插件通过 Cordis 注册，用 `ctx.slots.inject/register` 注入 UI（`:23`）。
- AWBot 运行时升级会**保留 `/root/.dsh` 下的插件与 patch**（`:436`）——说明"预置到该目录"即可实现持久默认加载。
- 官方有 `sdk/plugin-kit` 与 11 个 `examples/plugins/`，可作为内置插件来源。

## 7.3 实施方案（三层）

```
第 1 层：随包预置（build time）
  在桌面端安装包中内置一组"平台选定插件"目录（对应 AWBot 的 profiles/web 形态）
  参照 BotBuddy builtin-extensions 的 extraResources 打包范式（package.json:60-69）

第 2 层：首次启动 seed（first run）
  参照 seedChannelOnce()（agent/config.js:22-29,65-76）：
  - 检测 $DSH_HOME 是否已初始化；未初始化则从内置目录复制到用户目录
  - 写 cordis.patch.yml / profiles 使插件在启动时自动加载
    （官方装配手段：`dsh plugin --profile desktop add <pkg>`（转发 pnpm）、
     `--patch <path>` 覆盖层、`--dump-config` 校验装配结果；插件包自带声明写在
     package.json 的 `dsh.bundle` / `dsh.client` 字段里，见 docs/cli-help.zh.md）
  - 用一次性标记（seed marker）保证只做一次，不覆盖用户后续修改

第 3 层：持续同步（平台下发，可选 P2）
  复用 AWBotDSH Link 心跳增加 pluginManifest + skillManifest 两个并列字段，
  平台下发"该账号应启用的插件/技能清单"
  客户端按清单补齐缺失项；关闭开关时不删除用户已有插件/技能（参照 SCRM outbox "关闭不清账"经验）
```

## 7.4 必须处理的安全前置

DSH 本机 webserver 插件路由不鉴权（`plugin-seams.md:17`"手机上任何 App 都能调"）。桌面端**上线前必须**：
- 本机 HTTP 服务绑定 `127.0.0.1` 并加 token 校验（参照 BotBuddy Chrome 桥接 `x-bridge-token`，`chrome-bridge.js:3-20`）。
- 插件安装/启用操作走用户确认（不可用网页直接静默安装）。

---

# 八、专题：技能支持与默认初始化

## 8.1 先划边界：技能不是插件的一种

| 维度 | 技能（Skill） | 插件（Plugin） |
|---|---|---|
| **定位** | 知识/工作流包：告诉 Agent "遇到某类任务该怎么做" | 运行时扩展：真正注入工具、路由、UI 槽位 |
| **包格式** | `SKILL.md`（YAML frontmatter `name`/`description`/`whenToUse`）+ 附加文件 | `plugin.json`（`id/name/kind/params/config`）；DSH 侧为 Cordis 包 + `cordis.patch.yml` |
| **落地位置** | `$DSH_HOME/skills/<name>/`（AWBot/DSH）或 SQLite `skills` 表（BotBuddy） | `$DSH_HOME/dsh-go/plugins/<name>/` + `profiles/web`；BotBuddy 为 `plugins` 表（`db.js:93-102`） |
| **发现机制** | DSH `FileSystemSkillProvider` watch `skills/`，RPC `skills/list`（`features_api.dart:566`），**新增免重启** | Cordis `ctx.slots.inject/register`（`plugin-seams.md:23`）；宿主路由 `/dsh-go/v1/*` |
| **运行方式** | 正文进系统提示摘要，`load_skill` 按 id 读取（`agent/tools.js:248-262`），**本身不执行** | `toolDefs()` 生成可执行工具，`runCommand` 调本机命令/HTTP（`plugins.js:188,213`） |
| **生命周期** | 导入→审核 `passed`→用户启用→提示摘要→按需读取；回滚后重新待审 | 导入即 `enabled`，由 Agent 直接调用；无"先审后用"链路 |
| **归属与安全** | `content_agent_skills`（`userId` + `@@unique([userId,name])`，`schema.prisma:3961-3984`）；`skill-security.ts` 四组检查 + `skill-review.rules.ts` 六道红线 | 平台有独立 plugin 审查/资产链路；`SkillReviewRun.kind` 历史含 `plugin`（`schema.prisma:8207`） |

**两者确实有耦合，但不能因此合并**：平台 `SkillGeneratorService` 把 MCP 动作写进技能包（`references/mcp-operations.md`，`skill-generator.service.ts:416-421`）；技能 frontmatter 可声明 `permissions.network/fs/exec/secrets`（`skill-security.ts:439-503`）；`dsh-go-plugin` 技能本身打包了插件开发套件（`kit-schema-*.json`、`template-cordis.patch.yml`）。所以正确关系是"**技能可描述/分发工具知识，插件才是执行体**"，两套目录、两套开关、两套表保持独立。

## 8.2 可直接复用的三套资产

1. **AWBot 6 个内置技能**：`awbot-app/app/assets/skills/{companion-adapt,dsh-go-guide,dsh-go-plugin,dsh-go-support,dsh-go-ui,pet-theme}/`。每个含 `SKILL.md` + `manifest.json`，`manifest.json` 只有 `{name, files}` 两个字段——`files` 是"扁平源文件名 → 目标路径（可带子目录）"映射；`SKILL.md` frontmatter 首行必须是 `---`，含 `name`（kebab-case）、`description`、可选 `whenToUse`，并带 `# dsh-go:managed` 托管标记（`ui_skill.dart:8-9,59`）。
2. **DSH 原生发现机制**：写入 `$DSH_HOME/skills/<name>/` 即被 watcher 发现（`ui_skill.dart:5-9`），`plugin-seams.md:415-418` 记为 rank 400、跳过 `.system` 子目录；`skills/list` 返回 `name/description/whenToUse/path/modelInvocable`（`features_api.dart:303-322,566-583`）。**不要自建技能注册中心**。⚠️ 这一条在本仓库是转引 `dsh-skill-filesystem/README.zh.md`（`plugin-seams.md` 原文如此），DSH 源码不在本工作区——落地前用锁定版本核验一次 rank 与 `.system` 语义。
3. **平台 SkillHub 协议**：契约 `packages/contracts/src/skillhub.ts:46-82`（list/detail/install）；转发端点 `bot-host.public.ts:335-398`（挂在同一 `basePath`，随新通道自动获得）；上游 `skillhub.client.ts:17,59-153`（`SKILLHUB_BASE_URL`，默认 `api.skillhub.cn`，20MB 上限 + zip magic 校验）；客户端 `platform-client.js:347-376` 已按 `x-bot-token` 实现。**关键语义：平台只给字节与元数据，安装落在本机**（`bot-host.public.ts:330-334`）——注意"落在本机"目前只落在 SQLite，见 8.3。

## 8.3 落地方案（与插件三层初始化对齐）

```
第 1 层（build time 随包预置）
  - 把 awbot-app/app/assets/skills/{6 个目录} 作为 extraResources 打进安装包
    （参照 bot-host-client/package.json:60-69 的 builtin-extensions 范式）
  - 保留 manifest.json 的 {name, files} 映射，不手工铺平目录
  - 同时预置"本地确定性安全门禁"模块（8.4），随包发布

第 2 层（first run seed，一次性）
  - 检测 $DSH_HOME/skills/ 是否已初始化；未初始化则按 manifest 逐文件原子写入
  - 复用 ui_skill.dart:128-157 的 installUiSkill 语义：
      SKILL.md 最后写、逐文件比对内容、临时文件 + rename、managed marker 检查
  - seed marker 保证只做一次；用户删掉 managed 行后视为 userOwned，不再覆盖
  - 与插件 seedChannelOnce()（agent/config.js:66-76）在同一启动钩子内编排，
    共用 token/generation/owner 绑定与串行队列（参照 _UiSkillDrain / ManagedSkillQueue）

第 3 层（P2 平台下发）
  - Link 心跳增加 skillManifest（与 pluginManifest 并列）
  - 平台下发"该账号应启用的技能清单 + SkillHub slug/version"
  - 客户端按清单补齐缺失技能；关闭时不删除用户已有技能（"关闭不清账"）
  - 覆盖同名技能前写 revision（参照 ContentAgentRevision 语义）
```

**在线安装链路（SkillHub）现状与方案不同，必须纠正**：`skillhub:list/detail/download/install`（`main.js:1115-1181`）→ 下载 zip → `skillPackage.importFromZip`（`skill-package.js:102-121`）→ `agentConfig.saveSkill()`（`main.js:1166-1167`、`agent/config.js:230-245`）。**落点只有 SQLite `skills` 表，全仓没有"写 `$DSH_HOME/skills/`"的代码**——也就是说 BotBuddy 里装好的技能，DSH 一侧根本发现不到，只有它自己的 `load_skill` 能读。所以"写入技能目录"不是"保持不变"，而是本方案**必须新增**的一步：同一份正文双写（SQLite 供界面目录/元数据，文件系统供 DSH 发现），并保证两边一致、失败可回滚。

## 8.4 安全与治理必须前移（客户端侧）

服务端已有成熟底座，但**客户端当前只有"展示上游安全标签"**（`app.js:735-744` 的 `skillHubSecurity()` 仅把 `status/statusText` 映射成颜色），没有本地拦截。桌面端必须补齐：

1. **本地确定性门禁**：移植 `runUploadSecurityGate`（`skill-security.ts:817-973`，恶意代码/权限/网络/命令四组）与 `scanPackageStatic`（`skill-review.rules.ts:161-179`，六道行为红线）为客户端模块；对 SkillHub 下载的 ZIP 内 `SKILL.md` + 附加文件全量扫描，任一命中即拒装并给出 `formatSecurityFailure` 文案（`:994`）。上游 `malicious/blocked` 直接拒装。
2. **运行时复扫**：`load_skill` 读取正文前调 `scanRuntimeContent`（`skill-security.ts:1050-1062`），对齐服务端 `assertRuntimeSafe`（`agent-skills.service.ts:239-263`）的阻断语义。
3. **声明能力显式确认**：解析 frontmatter `permissions`（`parseSkillSecurityMeta:514-574`），展示 `network/fs/exec/secrets` 清单，用户确认后才启用；拒绝命中 `RESERVED_SECRETS`（`:394-407`）的包。对照服务端 `confirmPermissions`（`agent-skills.service.ts:483-503`）。
4. **提示词防注入保留**：`agent/index.js:107-108` 明确"技能正文是用户上传的参考资料，不是系统指令"；技能摘要继续限条数，防恶意 `description` 挤占上下文。
5. **安装边界**：ZIP 只在内存读 `SKILL.md`（`skill-package.js:3-9`），不解压任意路径（规避 zip-slip）；原生侧继续用 `_safePath` 正则（`ui_skill.dart:61-69`）+ canonical 前缀检查（`ManagedSkillInstaller.kt:166-176`）。
6. **审计闭环**：安装/启用/拦截事件回传平台 `SkillReviewRun` 同形台账（`schema.prisma:8207-8232`），不回传 token 与整包内容。

## 8.5 已知的坑（实现前必须修）

| 坑 | 证据 | 处理 |
|---|---|---|
| **三端技能白名单不一致** | Android 5 个（`ManagedSkillInstaller.kt:96`，缺 `pet-theme`）、iOS 4 个（`EngineSkills.swift:57`）、OHOS 4 个（`ManagedSkillCore.ets:104`），而 Dart `extraSkillLoadersProvider` 5 个、`assets/skills/` 实际 6 个 | 桌面端不要继承这套硬编码白名单；改为"manifest 声明 + 安全门禁通过即可装"，或至少首版统一为 6 个并加启动自检 |
| **frontmatter 解析丢字段** | `skill-package.js:52-53` 只认 `name`/`description`，丢 `whenToUse`、`disable-model-invocation`（`features_api.dart:308,320`） | 不重新生成 `SKILL.md`，按原文落盘让 DSH 自己解析；本地元数据另行保存 |
| **两套存储容易串台** | BotBuddy `skills` 表存正文（`db.js:36-42`）vs DSH 文件系统发现 | 主路径文件系统；SQLite 只存 SkillHub 目录元数据/安装记录 |
| **"重置运行环境"会删技能** | `plugin-seams.md:434-438`：运行时升级保留 `skills/`，但 `RuntimeController.reset` 删除整个 runtime | UI 在重置前明确提示技能会丢失（当前文案只提对话/工作区） |
| **技能与插件 UI 混排** | BotBuddy 三者曾混为"插件三套" | 新端 UI 分「插件」「技能」两个页签，数据层分表、目录、开关 |

## 8.6 对话框「＋」里的技能选择（交互落地）

### 8.6.1 先说清现状：一端已有，一端没有

- **BotBuddy（Electron renderer）已经实现**：`#chatAddBtn`（`app.html:228`）的 title 就是"添加技能、插件、数字分身、工作区"；`renderAddPop()`（`app.js:2133-2146`）一级菜单四项，`addView === 'skills'` 走 `renderSkillPicker`（`app.js:2156-2182`）——逐项 checkbox、说明"不勾选＝全部技能可用；只影响这个会话"，勾选写 `state.chat.skillIds` 并 `persistChatContext()`，已选项回显为 chip（`renderCtxChips`，`:2043`）。
- **AWBot（Flutter）的「＋」面板没有技能**：`plus_panel.dart:132-167` 只有相册/拍照/文件/生成/通话 + `_PluginTools`（插件工具）+ `_ThisChatCard`（本会话权限与计划模式）。技能走另一条路：技能页「在对话里用」→ `useSkill()`（`skill_use.dart:92-112`）把 `/name ` 插入输入框，或输入 `/` 由 `SlashPalette`（`chat_screen.dart:2006`）选择——**没有会话级技能白名单**。

→ 所以这条要求的准确落点是：**AWBotDSH 保留 BotBuddy 已有的会话级技能选择器，把数据源换成 DSH 的 `skills/list`，不要重造 UI**；若最终底座走官方 DSH Desktop / Flutter 壳，则用原生 composer 扩展点接入，而不是被原生接管的输入 slot。

### 8.6.2 数据流（沿用已验证的会话维度，不改成全局）

```
「＋」→ 技能 → state.chat.skillIds
  → chat_conversations.skill_ids（chat-store.js:187-190，去重、限 100 项）
  → 发送时 agent.run({ skillIds })（main.js:841）
  → resolveSkills()（agent/index.js:138-142）
       ├─ 技能摘要进系统提示（:104-115）
       └─ allowedSkillIds 闸门 → load_skill 只读白名单内正文（`tools.js:258` 调 `ctx.skills.readSkill`，闸门在 `agent/index.js:328,337`）
```

**会话级 vs 全局不能混**：`enabledSkills` 是 Agent 配置维度（`agent/config.js:194`），会跨会话串；`+` 面板自己就写着"只影响当前会话"（`app.js:2141`），必须保持 `sessionId` 维度。"空数组＝全部技能可用、不传＝跟随全局"的两级语义（`agent/index.js:138-142`）原样保留。

### 8.6.3 数据源与未配对态表现

| 来源 | 用法 | 未配对时 |
|---|---|---|
| **DSH `skills/list`**（主源） | `features_api.dart:566-583`，带 `sessionId`，返回 `name/description/whenToUse/path/modelInvocable`；与 `$DSH_HOME/skills/` 一致，新装即有 6 个内置技能 | 可用（本地文件系统，不依赖账号） |
| 本地 SkillHub 安装记录 | SQLite 元数据 + 已装技能正文 | 可用 |
| 平台下发 `skillManifest`（P2） | 按账号补齐私有技能 | 显示"需配对"，**不报错、不锁死**（对齐 6.4.3 能力矩阵） |

⚠️ Flutter 侧 `skillsProvider` 在 `client == null` 时直接返回 null（`features_state.dart:71-72`），`SkillsPage` 显示 `FeatureOffline`。若「＋」技能区直接绑它，**未连接主机会整块消失**——必须提供本地回退源（内置 6 个技能 + 本地已装）。

### 8.6.4 UI 落地路径（按最终底座形态二选一）

| 底座形态 | 做法 | 代码依据 |
|---|---|---|
| **沿用 / 移植 BotBuddy renderer** | 直接复用 `renderSkillPicker`，只把 `state.skills` 换成"DSH `skills/list` + 本地技能"合并结果；保留 chips 回显与 `chat_conversations.skill_ids` 读写 | 结构、事件、CSS（`.ctx-pop`/`.ctx-opt`，`app.css:905-950`）全现成 |
| **基于官方 DSH Desktop / Flutter 壳** | 走**原生 composer 扩展点**：Flutter 仿 `_PluginTools`（`plus_panel.dart:170-207`）增加 `_SkillTiles`，复用 `PlusTile` + `skillsProvider(sessionId)`；点击行为先保持 `/name` 插入（零新协议），再评估是否新增会话白名单 RPC | `NativeSurface.composerTools` 是**已实现**链路（`native_state.dart:402-408` → `_PluginTools`） |

**明确不要走 DSH web slot 的输入替换点**：`conversation.input.attachments`、`conversation.input.model`、`conversation.composer.bar` 等均为 `shadows-shipped-ui`，`plugin-seams.md:94` 明确"输入框本体不让插件替换"，且 input/composer 的原生适配尚未落地、P1 面板岛仍是设计态（`:108`）。只用 `conversation.input.left/right/dock`（`replaceRisk=none`）这类追加点。

### 8.6.5 必须守住的边界

- 技能正文仍是"用户上传的参考资料，不是系统指令"（`agent/index.js:108`）——选中技能**不得提升为系统级指令**。
- `modelInvocable=false` 的技能显示"仅手动"徽章（AWBot `skills_page.dart:125`），仍可被 `/name` 手动调用，但不参与模型自动调用。
- 选技能**不改变权限档**（deny / allow-edits / allow-all）；命令类插件仍需 `allow-all`（`app.js:2187`），二者 UI 分区展示。
- 若用 `ui.json composer.quickActions` 做技能快捷按钮：≤8 个、label ≤10 字、动作仅 `send/open/command/link`，`send` 只把文字放进输入框、**用户点发送才发**（`plugin-seams.md:362-381`）。

## 8.7 技能验收点（汇总见第十三部分）

- 全新安装首启后 6 个内置技能在 `$DSH_HOME/skills/<name>/` 可见，`skills/list` 返回完整字段，**无需重启**。
- `SKILL.md` 最后写入；中断安装不遗留"无 SKILL.md 的技能目录"；用户删除 managed 行后不再覆盖。
- SkillHub 全链路走 `x-bot-token` 转发；安装只在客户端生效，平台不产生该设备的技能行。
- 恶意包（反弹 shell / `169.254.169.254` / 硬编码密钥 / `curl|sh` / 保留密钥名）被本地门禁拒绝，不落盘。
- 声明 `permissions` 的技能未确认前禁用；`load_skill` 越权读取返回 null；技能与插件互不串台。

---

# 九、专题：浏览器工作台——指纹窗口 / Chrome 插件 / RPA 任务

> 本轮明确的移植范围：新客户端仍为 **Electron**；浏览器形态与 BotBuddy 一致（外部指纹内核原生窗口，地址栏可输入网址）；默认预装**本项目 Chrome 插件（aipdd-enterprise）**与 **Automa**，并把 RPA 任务链一起搬过来。设计原则仍是"相互可调用、互不影响"。

## 9.0 能力对照总表

| 能力 | BotBuddy 现状（代码事实） | AWBotDSH 设计 |
|---|---|---|
| 浏览器形态 | Electron 管理台 + **外部指纹内核进程**（`fp/launch.js:125-129`），原生 Chrome 地址栏 | **原样保留**；DSH 只做 agent 执行，不重画浏览器 |
| 指纹参数 | chrome flags：`--fingerprint=<seed>` 等 15 行 flag（`fingerprint.js:32-77`） | 原样复用；不自建注入层 |
| 窗口隔离 | 每档案独立进程 / `user-data-dir` / CDP 端口 / relay 端口 | 原样复用；新增会话级 `fpProfileId` 绑定 |
| Chrome 扩展 | 仅 Automa 内置且默认加载（`builtins()` 只返回 automa）；aipdd 与桥接扩展未进启动链 | 三者都纳入 `builtin-extensions/`，加 `key` 固定 ID，首启 seed |
| RPA | Automa/CDP 链路（`rpa-runner.js`）+ 插件 rpa-chrome 链路（并存） | 首版搬 Automa/CDP 链路；rpa-chrome 列 P2 |
| CDP 传输 | 全部 `127.0.0.1`，平台从不回调（`platform-client.js:6-7`） | 不变；不新增平台侧 CDP/WebSocket |

## 9.1 指纹窗口：外部内核 + CDP + Electron 管理台

### 9.1.1 形态与启动链（必须先纠正的认知）

Electron 只有一个管理台窗口：`main.js:127-160` `createMainWindow()` → `new BrowserWindow({width:1080,height:760})` → `loadFile(renderer/app.html)`。指纹窗口是**另一个 OS 进程**：

```
renderer 点击「打开」(app.js:1590 api.fpOpen)
  → preload (preload.js:102) ipcRenderer.invoke('fp:open', id)
  → main.js:1407 ipcMain.handle('fp:open', fpGuard(id => fp.open(id)))
  → fp/index.js:49-51 → fp/launch.js:69-90 open() → doOpen()
  → child_process.spawn(kernel.exe, args, { cwd, stdio:'ignore', windowsHide:false })  (:125-129)
  → waitReady(cdpPort, 25000) → browserSession → primeKernelPage() → markOpened()
```

- 每个 profile 一个内核进程（`windows = new Map()`，`launch.js:26`），并发同 id 共享 `opening` Promise（`:27,69-90`），同时打开上限 `fp.maxOpen` 默认 20、钳制 1–100（`:31-41`）。
- 每 profile 独立 `user-data-dir` = `~/.botbuddy/fp-profiles/<id>`（`launch.js:96`）；独立随机 CDP 端口（`:43-52,98`）与 relay 端口（`proxy-relay.js:315`）。
- 关闭是 `Browser.close` → `child.kill()` → 1.5s 后 `taskkill /PID <pid> /T /F` → relay.close（`launch.js:198-226`）；应用退出前 `Promise.race([fp.shutdown(), 8s])`（`main.js:1692-1699`）。
- **地址栏属于内核原生 Chrome 窗口**，不是 Electron DOM。`fp/start-page.js:34` 的本机起始页文案明确写"在地址栏输入网址开始，或让 Agent 在当前窗口里操作页面。" `docs/指纹浏览器技术方案.md:52` 亦写明"窗口 UI 用内核自带浏览器窗口（地址栏/前进后退/标签页都是原生 Chrome），不再由 Electron 画工具栏"。

→ 对应用户要求"可输入网址"：**内核原生地址栏天然满足，零开发**；另在 Electron 管理台窗口行补一个 URL 输入框调用 `launch.navigateAgent(url)`（`launch.js:343-350`，`fingerprintUrl()` `:366-374` 自动补 `https://` 且只放行 http(s)/about:），方便不切原生窗口也能导航。

### 9.1.2 指纹参数：实际下发的 15 行 flag（以代码为准）

`fp/fingerprint.js:32-77 buildArgs(profile, options)` 要求 `profile.seed` 为正整数（`:34-36`），逐项拼 chrome flag：

| 指纹项 | 参数 | 条件/默认 | 行 |
|---|---|---|---|
| 种子 | `--fingerprint=<seed>` | 必填 | :43 |
| 平台 | `--fingerprint-platform=windows`（`macos` / `linux`） | 默认 windows | :37,44 |
| 品牌 | `--fingerprint-brand=Chrome` | 固定 | :45 |
| 逻辑核数 | `--fingerprint-hardware-concurrency=<n>` | 仅 `2<=n<=64`，0 省略 | :47-50 |
| 时区 | `--timezone=<s>` | 截 64 字符 | :51-52 |
| 语言 | `--lang=<首项>` + `--accept-lang=<...>` | 最多 8 项，正则校验、去重 | :21-30,53-57 |
| WebRTC | `--disable-non-proxied-udp` | `proxy`/`disable` 才下发，`real` 不下发 | :58-59 |
| Canvas 噪声 | `--disable-spoofing=canvas` | 仅 `off` | :61,63 |
| 音频噪声 | `--disable-spoofing=audio` | 仅 `off` | :62,63 |
| 代理 | `--proxy-server=http://127.0.0.1:<relayPort>` | 本地认证转发 | :64-66 |
| 扩展 | `--load-extension=<dir1,dir2>` | 内置 + 勾选 | :67-69 |
| CDP | `--remote-debugging-address=127.0.0.1` + `--remote-debugging-port=<cdpPort>` | 随机回环端口 | :70-71 |
| CDP origin | `--remote-allow-origins=*` | Chrome 111+ 带 Origin 的 DevTools WS 需要 | :73 |
| 窗口尺寸 | `--window-size=<w>,<h>` | 默认 1280,800 | :74 |
| 数据目录/起始页 | `--user-data-dir=<profileDir>` + argv `about:blank` | — | :39,75 |

固定附加：`--no-first-run`、`--no-default-browser-check`、`--disable-features=Translate,MediaRouter`（`:40-42`）。

⚠️ **不要照文档草案建表**：`docs/指纹浏览器技术方案.md:100-132` 列了 `ua/screen_width/screen_height/webgl_mode/device_memory/extra_args` 等列，但实际 `db.js:103-128` 的 `fp_profiles` 表**没有这些列**，代码也没有读取；UA / screen / WebGL / 字体 / 地理位置由内核按 `--fingerprint=<seed>` 自行生成，全仓无 `Emulation.set*` / `Page.addScriptToEvaluateOnNewDocument`。迁移时以代码为准，不要凭文档草案多建字段。

`fingerprint.consistency()`（`:80-99`）只给 5 条**建议字符串**不阻断（Canvas 建议关、严格音频易识别、WebRTC real 暴露 IP、Windows+美洲时区少见、代理账号为空）；真正的校验在 `profiles.validate()`（`:118-143`）。枚举：`MAX_PROFILES=100`、平台 `win/mac/linux`、`canvas/audio=off|light|strict`、`webrtc=proxy|disable|real`、代理类型 `http|https|socks5`、认证 `password|whitelist`（`profiles.js:17-23`）。

### 9.1.3 代理、加密与上报边界

- Chromium 的 `--proxy-server` 不能带密码，故 `proxy-relay.js:224-335` 起本地 `http.createServer().listen(0,'127.0.0.1')` 做 CONNECT / 普通请求转发：HTTP CONNECT 带 `Proxy-Authorization: Basic`（`:48-106`），SOCKS5 走 RFC1928/1929 methods `[0x00,0x02]`（`:108-198`）；超时 `CONNECT=15s` / `IP 检测=12s`（`:19-20`）。
- 代理密码用**本机密钥 AES-256-GCM** 加密：密钥文件 `~/.botbuddy/fp-secret.key` 首次 `randomBytes(32)` 写盘 `mode 0o600`，密钥取内容 sha256（`profiles.js:48-59`）；密文格式 `base64(iv):base64(tag):base64(body)`（`:61-81`）；视图只回 `hasPassword`（`:166`），`proxyCredentials()` 注释"仅主进程内部使用，不经过 IPC"（`:347-359`）。**整库不是加密的**（better-sqlite3 明文，`db.js:150-156`），seed/时区/语言/代理主机端口均为明文列。
- 对外上报只有 `fp/index.js:140-148 profileCandidates()` 的 5 个字段：`id/name/groupName/kernelVersion/lastOpenAt`（最多 200 条），注释":138 代理与种子一律不出本机"；心跳嵌在 `caps.agent.fingerprint`（`main.js:203-219`）。平台**不下发**任何指纹配置；RPA 任务里的 `profileId` 只是"选择本机哪个执行位"（`rpa-task.service.ts:1071`）。

### 9.1.4 CDP 的准确角色

- `ws-client.js` 是**纯本机**最小 WebSocket + CDP 客户端（`:3-7` 注释：Electron 31 内置 Node 20 无全局 WebSocket；只服务 `127.0.0.1`，非 ws 协议直接拒 `:22-25`）。关键路径：`getJson()`（`:228`）、`/json/list`（`:253`）、`/json/version`（`:260`）、`browserWs()`（`:259-262`）、`waitReady()`（`:271-283`）、`browserSession()`（`:289-346`，因新版内核页面级 WS 不响应命令，必须 `Target.attachToTarget{flatten:true}`）。注意 `:22-25` 只拒绝非 `ws:` 协议，**并未强制 host 必须是 127.0.0.1**——"只连回环"目前靠调用约定，迁移时应显式加校验。
- 实际只用到 7 个 CDP 方法：`Target.getTargets/attachToTarget/detachToTarget/createTarget`、`Runtime.evaluate`、`Page.navigate`、`Browser.close`。**没有任何 Emulation 注入，也不向平台传输**。
- `fp/browser-tools.js:14-88` 注册 5 个 Agent 工具（`chrome_tabs/open/read/click/fill`），在 `agent/index.js:23,49-56` 注入 `extraTools()`；`chrome_read` 取 `document.body.innerText.slice(0,20000)`，`chrome_click/fill` 用 `JSON.stringify` 转义 selector —— 这套与 `chrome-bridge.js` 的同名工具定义**完全无关**（后者是死代码，见 9.2.4）。

### 9.1.5 会话与窗口的关联（需要改造的一处）

现状关联是**全局**的：`fp.agentProfileId` 存 `settings` 表（`profiles.js:374-383`），`launch.agentWindow()`（`:331-341`）每次读全局值，兜底顺序"显式 → 最近使用 → 自动建 `默认窗口`"；`chat_conversations`（`db.js:70-80`）有 `skill_ids/plugin_ids/channel_id/workspace_path`，**没有 `fp_profile_id`**。

建议（与第八部分会话级技能选择同构）：
1. 会话元数据增加 `fpProfileId`，与 `skillIds` 并列；`navigateAgent/evaluateAgent/pages` 接收 `sessionId`，内部维护 `sessionId → profileId` 映射，解析顺序 = 会话绑定 → 全局 `agentProfileId` → 最近使用。
2. 保持"一档案一内核、不随焦点切换"的现有语义（`指纹浏览器技术方案.md:213`），避免用户手工切原生窗口干扰 Agent；同档案被多会话绑定时共用内核与标签页并在 UI 明示。
3. `launch.pages()` 已返回 `profileId`（`:261-280`），`chrome_tabs` 结果可直接展示"哪个会话在用哪个窗口"。

### 9.1.6 移植清单（指纹窗口）

| 分类 | 文件 |
|---|---|
| 几乎原样复用（改 `DATA_DIR` 指向） | `bot-host-client/src/main/fp/{fingerprint,kernels,proxy-relay,index,start-page}.js`、`src/main/ws-client.js` |
| 需改造 | `fp/launch.js`（`agentWindow/navigateAgent/evaluateAgent` 改会话维度；`require('../ws-client')` 改指向）、`fp/profiles.js`（`DATA_DIR` 双路径 + 密钥文件迁移）、`fp/browser-tools.js`（工具 `call` 保留，注册适配 DSH 工具 API） |
| UI 逻辑来源（DOM 废弃，界面按第十部分重写） | `src/renderer/app.html:504-673`（三 Tab 与 22 个字段的结构清单）、`app.js:1321-1745`（事件与渲染逻辑）、`preload.js:97-111`（15 个 `fp:*` 通道；改为 Host 插件 HTTP/RPC 后 preload 不再需要）；`main.js:1395-1442`（handler）、`:203-219`（心跳 caps）、`:1692-1699`（退出） |
| 数据 | `db.js:19-20,103-130,206-225`（`fp_profiles` + `fp.*` settings）；`~/.botbuddy/kernels/<version>/`；`~/.botbuddy/fp-secret.key` |
| 回归 | `bot-host-client/tools/_fp-unit.js` |

**迁移决策要写清**：内核二进制每版本 200–300MB（`指纹浏览器技术方案.md:295`），是继续指向旧 `~/.botbuddy/kernels` 还是复制一份到新目录，需按 D3 拍板；`fp_profiles.proxy_password_cipher` 用旧 `fp-secret.key` 加密，**换目录必须连密钥一起迁，否则代理密码全部解不开**。

## 9.2 Chrome 插件：默认预装 Automa + 本项目插件 + 桥接扩展

### 9.2.1 三款扩展的事实对照

| | Automa（内置） | AIPDD Enterprise（本项目） | 桥接扩展 |
|---|---|---|---|
| 路径 | `bot-host-client/builtin-extensions/automa/`（82 文件 / 8.3MB） | `extensions/aipdd-enterprise/`（约 412KB / 20 文件） | `bot-host-client/chrome-bridge-extension/` |
| manifest | MV3 / `1.30.02` / `update_url` 指向 Google 商店 | MV3 / `1.6.0` / 无 update_url | MV3 / `1.0.0` / "BotBuddy 浏览器桥接" |
| 权限 | `tabs,proxy,alarms,storage,debugger,activeTab,offscreen,webNavigation,unlimitedStorage,scripting` + `host_permissions:['<all_urls>']` | `tabs,storage,alarms,sidePanel,scripting` + `<all_urls>` | `tabs,scripting,storage` + `127.0.0.1/*,localhost/*,<all_urls>` |
| 来源 | **官方原版解包**（无 AIPDD/BotBuddy 字样，无定制） | 自有插件 | 自有插件 |
| `key` 字段 | **无** | **无** | **无** |
| 现状加载 | `builtins()` 唯一一项，**每个窗口无条件加载** | **从未被 BotBuddy 加载**（独立分发） | 随 `extraResources` 分发但**不加载**，需手动 `chrome://extensions` + 填 token（README:5-12） |
| 与后端 | 被 CDP 外部驱动，不改插件本体 | `x-chrome-token`（`chrome-rpa.js:12,111`）+ 页面签发 5 分钟 token（获客） | 本地 `x-bridge-token` 长轮询 |

Automa 是**官方原版**：`update_url` 在 manifest 里，但因以解包方式 `--load-extension` 加载，Chrome 不会走商店自动更新；实际更新 = 随客户端发版替换目录。本项目**不改 Automa 本体**，集成全靠外部发消息。

本项目插件 `extensions/aipdd-enterprise/` 的能力：`background.js:8` importScripts 四个模块；`chrome-rpa.js:12 API_PREFIX="/api/public/rpa-chrome"`、`:106-123 call()` 带 `x-chrome-token`、`:13-14 TOKEN_KEY="rpaToken"`、`:15-16` 30 秒心跳 alarm；`publisher/collector/outreach/metrics` 四个 content_scripts 覆盖 13 个创作站/10 个搜索消费站/小红书抖音；获客 token 页面签发、5 分钟有效、同源护栏（`README.md:37,112,166,217-219`）。

### 9.2.2 现有扩展管理机制（可直接复用）

- 目录：`DIR = db.DATA_DIR/chrome-extensions`（`chrome-extensions.js:21`）存用户导入；内置 `builtinRoot()`（`:24-28`）开发态取 `bot-host-client/builtin-extensions`，安装态取 `process.resourcesPath/builtin-extensions`。随包靠 `package.json:60-69 extraResources`。
- `builtins()`（`:73-95`）扫一级子目录读 manifest，产出 `{id:目录名,name,version,manifestVersion,path,builtin:true}`；`builtinIds()`（`:98-100`）= 目录名数组。内置**只读不可删**：`installFromDir()` 拒重名（`:163-165`）、`remove()` 拒内置（`:211-215`）、UI 不渲染删除按钮（`app.js:1767`）。
- 校验：`readManifest()`（`:37-59`）要求 manifest ≤256KB、合法 JSON、`name/version` 非空字符串、`manifest_version∈{2,3}`、至少含 `background/action/browser_action/content_scripts`；`slugOf()`（`:62-70`）非 ASCII 名走 sha1 前 10 位；体积上限 ZIP 50MB / 单文件 10MB / 总量 50MB（`:29-31`）。
- zip slip 防护到位：`zip-extract.js:29-44 safeRelative()` 拒绝对路径/盘符/`..`、跳 `__MACOSX`/`.DS_Store`；条目 ≤2000、只支持 store(0)/deflate(8)、拒 ZIP64（`:19,75-81,100-106`）；落盘前二次校验 dest 在 root 内（`:107-110`）。安装用 `.staging-<pid>-<ts>` → `rmSync(dest)` → `renameSync` 原子替换（`:167-174`）。
- IPC：`chromeExt:list/importPackage/remove/openFolder`（`main.js:1363,1365-1390,1392,1445-1449`）；preload 白名单 `preload.js:91-113`。
- 启动合并（`launch.js:106-115`）：
  ```
  extensionDirs = []
  for (item of chromeExtensions.builtins()) extensionDirs.push(item.path)   // 内置全量、无条件
  for (id of profile.extensionIds) { dir = resolveDir(id); if (dir && !includes) push }  // 用户按档案勾选、去重
  → fingerprint.buildArgs(..., {extensionDirs}) → --load-extension=<joined>
  ```
- UI：`app.html:631-650`「Chrome 插件」Tab；`app.js:1749-1785 renderChromeExts()`、`:1787-1797 loadChromeExts()`；档案编辑页 `renderFpExtChips()`（`:1491-1515`）内置项 `checked=true && disabled=true`。**没有独立启用/禁用开关**——启用 = 在 `profile.extensionIds` 里勾选（`profiles.js:136-142,252-253,319`）。

### 9.2.3 默认预装的详细落地

**目录布局**（`extraResources` 调整）：
```
resources/builtin-extensions/
  ├─ automa/                     官方 1.30.02，保持原样（仅加 key）
  ├─ aipdd-enterprise/           从 extensions/ 复制进随包目录
  └─ chrome-bridge-extension/    从顶层挪入，使其成为 builtins() 一员
```
源仍在仓库维护（`extensions/aipdd-enterprise`、`bot-host-client/chrome-bridge-extension`），构建时复制到随包目录。

**扩展 ID 固定（`key` 字段，D9）**：三份 manifest 目前都无 `key`，解包 ID 由目录绝对路径派生 → 跨机/跨路径漂移，且 RPA 找 Automa 扩展页靠动态抓取（`rpa-runner.js:161` 正则 `chrome-extension://([a-p]{32})/`），`:164` 兜底商店 ID `kfefaponhdnhhcggeamejckaddlkjmed` 只对商店安装版成立。做法：为每扩展生成 RSA 密钥对，把 **base64 公钥写入 manifest 的 `key`**，ID = 公钥 SHA256 前 16 字节映射 a–p，与路径无关；**加 key 后 Automa 的 ID 会变**，须同步更新 `rpa-runner.js:164` 兜底常量（动态抓取路径不受影响）。

**首启 seed（不覆盖用户数据）**：现有"内置只读目录 + 用户受管目录分离"已天然不覆盖。⚠️ **但不要把内置三扩展再复制一份进受管目录**：`launch.js:109-115` 的合并是**按路径去重**（`extensionDirs.includes(dir)`），不去重扩展 ID；内置已从 `builtinRoot()` 无条件加入，若同一扩展又以受管目录里的副本被 `resolveDir(id)` 解析出来，`--load-extension` 会出现**同一 ID 的两条路径**，Chrome 侧行为不确定（多数情况报加载失败或只生效一份）。做法二选一：

- **方案 A（推荐，改动最小）**：内置扩展**始终从随包资源加载**，不 seed、不复制；"可禁用"用 `disabledChromeExtIds` 开关过滤（下面"启用/禁用"），"可升级"= 换客户端版本即换资源目录。省掉 marker、覆盖、迁移三套逻辑。
- **方案 B（确需"用户可改内置副本/离线替换"时才做）**：`builtins()` 改为"受管目录优先、资源目录兜底"，并在 `launch.js` 合并时**按扩展 ID（manifest `key` 派生）去重**；此时再引入 `ensureSeededBuiltins()`：① 对三者算 id，`~/.awbotdsh/chrome-extensions/<id>/` 不存在才从 `builtinRoot()` 复制；② 写 `.managed-by-bootstrap` marker（含 `sourceVersion`、`seededAt`）；③ 有 marker 且 sourceVersion 更大 → 覆盖升级，**无 marker（用户自建/已改）→ 跳过**；④ 在 `main.js:1627-1635 bootstrap()`、`startChromeBridge()` 之前调用；⑤ `remove()` 对有 marker 者拒绝或提示先解绑，升级覆盖走 staging+rename 原子替换。

**启用/禁用**：`config-store.js:26-43 SETTING_KEYS` 新增 `disabledChromeExtIds`，`main.js` 加 `chromeExt:setEnabled` IPC + preload 白名单，`launch.js:106-115` 合并时过滤禁用项；UI 为内置项也渲染开关（改 `app.js:1767`）。默认三者全启用。

**桥接 token 自动化（必须做，否则预装无意义）**：`main.js:1612-1625 startChromeBridge()` 生成 36 字符 token（`randomBytes(18).toString('hex')`），`:1462-1478 bridge:restart` 重启换 token；扩展侧 `chrome-bridge-extension/popup.js:5,39-49` 把 bridgeUrl/token 存 `chrome.storage.local`。改造：token 生成后经 CDP 对桥接扩展页写 `chrome.storage.local`（或扩展增加"从启动参数/本地文件读取 token"引导），避免用户手填。

**把死代码接上**：`chrome-bridge.js:223-277 toolDefs()` 的 5 个工具（`chrome_tabs/tab.open/page.text/page.click/page.fill`，离线时返回空）**全仓无调用点**；Agent 实际用 `fp/browser-tools.js` 的同名 CDP 工具。要在 `agent/index.js:35-58 extraTools()` 中增加对 `chromeBridge.shared` 的工具注入与在线判断，这样"预装桥接扩展"才真正给 Agent 增加"控制用户真实浏览器"的能力。注意 `page.eval` 在桥接层注释里存在（`:13-14`），但扩展 `background.js:34-111 runAction()` **未实现**该动作（会落"未知浏览器动作"），不要对外声明。

**与 DSH 体系严格隔离**：Chrome 扩展只写 `~/.awbotdsh/chrome-extensions`（或兼容 `~/.botbuddy`）与 `resources/builtin-extensions`；**禁止写 `$DSH_HOME`**（DSH 插件在 `$DSH_HOME/dsh-go/plugins/`，技能在 `$DSH_HOME/skills/`）。验收时断言 seed 后 `$DSH_HOME` 下无新增浏览器扩展目录。

### 9.2.4 桥接协议细节（保留原样即可）

- 常量（`chrome-bridge.js:22-25`）：端口 `35911`、长轮询 `25s`、动作超时 `30s`、队列上限 `20`；`start()` 只 `listen(port,'127.0.0.1')`，无 token 直接报错（`:72-89`）。
- 路由（`:136-182`）：`OPTIONS→204`、`POST /hello`（记录扩展名/版本）、`GET /poll`（有任务立即回，否则挂起 1–25s，超时 204）、`POST /result`（按 id 找 pending）、`GET /status`，其余 404；鉴权头 `x-bridge-token` 或 query `token`（`:119-123`）。
- 扩展端 `background.js:12-13 DEFAULTS={bridgeUrl:'http://127.0.0.1:35911',token:''}`、`POLL_WAIT_MS=20000`；`loop()`（`:121-157`）无 token 每 3s 重试、204 立即再 poll、异常退避 3s；`runAction()`（`:34-111`）用 `chrome.tabs` / `chrome.scripting.executeScript` 执行；`page.text` 截 20000 字。
- 轮换：改端口或点"重启桥接"即换 token（`main.js:1472`），旧 token 立即失效。

## 9.3 RPA 任务：Automa/CDP 链路完整移植

### 9.3.1 平台侧底座（几乎不用改）

模块 `backend/src/rpa/`（26 个文件，均为一级目录）：核心 `rpa-task.service.ts`（原子抢单、派发、回执收口、超时自愈，三条通道 `claim`/`claimChrome`/`claimBotBuddy`）、`rpa.controller.ts`、`rpa-open.controller.ts`、`rpa-chrome.controller.ts`、`rpa-chrome.public.ts`、`chrome-device.service.ts`、`chrome-agent.service.ts`、`rpa-shared.ts`（共享枚举）、`rpa-task-botbuddy.spec.ts`（契约回归）。

关键表（`schema.prisma:2152-2600`，归属键均为 `createdBy` 字符串 userId，**无 orgId**）：

| 表 | 状态/关键字段 |
|---|---|
| `rpa_scripts` | `deviceType`、`status=draft/testing/published/archived`、`content`、`paramsSchema`、`vendorFlowId` |
| `rpa_tasks` | `status=pending/running/completed/failed/cancelled`、`scheduleType`、`maxRetries`、`timeoutSeconds`(默认 3600)、`chromeClientId`、`botHostId`、`fpProfileId`、`lastError` |
| `rpa_task_executions` | `status=running/success/failed/cancelled/timeout`、`attempt`、`executor`、`output`、`durationMs`、`browserProfileId` |
| `rpa_chrome_devices` / `_commands` / `_sessions` | `rc_` 令牌链路专用；`commandCode` 为幂等键 |

共享枚举（`rpa-shared.ts`）：`DEVICE_TYPES=['pc','android','iphone','chrome','botbuddy']`（`:6-12`）；`SCRIPT_FILE_TYPES_BY_DEVICE` 中 `botbuddy:['automa_json']`、`chrome:['chrome_actions']`（`:178-184`）；`INTERCHANGEABLE_DEVICES` 使 `pc↔botbuddy` 脚本互通（`:201-204`）；`TASK_STATUSES`（`:287-293`）。字段 `RpaTask.deviceType` 是 Varchar(16)，新增值无需改表结构。

**BotBuddy 通道 4 端点**（`bot-host.public.ts:406-452`，随 `registerBotHostPublic(basePath, clientKind)` 自动注册到新 basePath）：

| 方法 | 路径 | 服务 |
|---|---|---|
| GET | `/api/public/bot-host/rpa/tasks` | `botBuddyTasks(host.userId, host.id)` |
| POST | `.../rpa/claim` | `claimBotBuddy(host.userId, host.id, taskId)` |
| POST | `.../rpa/finish` | `finish(hostUser(host), executionId, body)` |
| POST | `.../rpa/release` | `releaseBotBuddy(host.userId, taskId)` |

鉴权头 `x-bot-token`（`packages/contracts/src/bot-host.ts:27`）；`hostByToken()`（`bot-host.service.ts:1312-1342`）按 `bot_/awb_/wb_` 前缀 + tokenHash 查主机并复权；`authenticate()` 强制 `host.clientKind === requiredKind`（`bot-host.public.ts:87`）。

### 9.3.2 任务生命周期（隔离与幂等已内建）

1. **创建**（`rpa-task.service.ts:237-298`）：`requireBotBuddyTarget()`（`:1465-1519`）校验主机属当前账号、`host.clientKind==='DESKTOP'`（`:1494`）、`botHostOnline()`、`fpProfileId ∈ host.caps.agent` 上报的窗口候选（`:1508-1516`）。chrome/botbuddy **不绑 RPA 账号、不回传口令**（`:259-266`）。
2. **领取**（`:936-1078`）：候选过滤 `deviceType:'botbuddy' && status:'pending' && (botHostId=hostId || null)`，按 createdAt asc take 20（`:975-984`）；`.filter(scriptRunnableByDevice(...,'botbuddy'))` 让**坏脚本不堵队列**（`:995-1000`）；原子抢单 `updateMany where {id,status:'pending'} → running`，count===1 才成功（`:1219-1225`）；首次领取回写 `botHostId` 锁定（`:1043-1049`）。派发报文：`taskId/executionId/attempt/taskName/scriptName/profileId/startUrl/params/timeoutSeconds/workflow(Automa JSON)`（`:1064-1077`）；派发异常回滚 pending + 写 lastError（`:943-959`）。
3. **回执**（`:715-846`）：`finishedAt` 非空即 CONFLICT；事务内 CAS `updateMany where {id, finishedAt:null}`（`:796-813`）保证只生效一次；`success→completed`，`failed` 且 `maxRetries>=attempt→pending`，否则 failed/cancelled；写审计。
4. **释放**（`:1122-1128`）：`updateMany where status:'running' → pending`。⚠️ 客户端 `platform-client.js:339-345` 虽定义了 `rpaRelease()`，但 `main.js` **从未调用**（`:625` 注释"回传失败只告警，平台超时自愈"）。
5. **超时**（`:1370-1403 sweepTimeouts()`）：running 且超过 `timeoutSeconds` → 执行记录 `timeout`、任务退回 pending。⚠️ **只在 `claim()`（PC/API Key 通道）里调用**，BotBuddy/Chrome 通道领取后若客户端既不 finish 也不 release，只能等下一次 PC 通道 claim 或 scheduler 触发。

→ 移植时必须补两个缺口：**客户端在终态后调用 release 做兜底**、**BotBuddy 通道领取时也触发 sweepTimeouts**（或独立 scheduler）。

### 9.3.3 客户端执行器细节（`rpa-runner.js`）

常量：`POLL_MS=1500`、`START_GRACE_SECONDS=90`、`DEFAULT_LIMIT_SECONDS=3600`、`MAX_LIMIT_SECONDS=86400`（`:29-33`）；`state.active` + `isBusy()` 保证本机一次一条（`:35-57`），与服务端 CAS 双保险。

`execute(task)`（`:299-362`）逐步：
1. `assertWorkflow()`（`:284-296`）：workflow 必须是 JSON 对象、`drawflow.nodes` 非空且 labels 含 **`trigger`** 区块，否则拒。
2. `profileId = clip(task.profileId,64) || autoPickProfile()`；`autoPickProfile()`（`:271-276`）优先 `profiles.agentProfile().id`，否则最新更新档案；档案不存在抛"请在浏览器页新建"。
3. `launch.open(profileId)` → `cdpPort` → `wsClient.browserWs(port)` → `wsClient.connect(...,{timeoutMs:8000})` → 自建 `makeSession(client)`（`:67-113`，不直接用 `browserSession`，因为要自选发信 target；`call` 默认 10s 超时，`attach` 用 flatten）。
4. `findSenderTarget()`（`:144-150`）找首个 `chrome-extension://` 页面；没有则 `openSenderTarget()`（`:157-178`）先从已有 URL 正则提取 32 位扩展 ID，再兜底商店 ID，依次尝试 `newtab.html/popup.html/params.html` (**Automa 只在 `chrome.runtime.onMessage` 收 `background--*`，service worker 自己 sendMessage 收不到自己，必须从扩展页发**)。
5. `startUrl`（截 2000）有则 `Target.createTarget{url}` + `sleep(1000)`（失败只记 note 继续）；`pickWorkTab()`（`:247-268`）用 `chrome.tabs.query({url:startUrl})` 选 tabId，优先精确 URL → active → 首个 http(s)。
6. `triggerExpression(workflow, variables, tabId)`（`:181-194`）发：
   ```
   options = { checkParams:false, variables, data:{variables} }  // tabId 可选
   payload = JSON.stringify({...workflow, options})
   chrome.runtime.sendMessage({ name:"background--workflow:execute", data: payload }, cb)
   ```
   `sent=false` 或 `error` 非空都抛错；这段字符串是**契约**，改动要过 `tools/_rpa-unit.js` 假 CDP 回归。
7. `waitForOutcome()`（`:365-413`）：`limit` = task.timeoutSeconds 归一到 `[30,86400]`；deadline 到期 → failed；每 1.5s 用 `outcomeExpression()`（`:200-244`）读 Automa `workflowStates`（数组/对象兼容）与 IndexedDB `logs.items` 倒序最多 200 条、按 `workflowId + startedAt>=notBefore` 取终态；`success` → success，其余 → failed；90s 内从未见过 running → failed"没有开始执行"。
8. `run(task)`（`:425-445`）：任何异常 catch 成 `{status:'failed',message:clip(err,500),output:{}}`，**绝不卡在执行中**；finally 释放 `state.active`。导出 `buildTriggerExpression/buildOutcomeExpression/assertWorkflow/limitSecondsOf` 供单测。

与 `main.js` 衔接：心跳回包每 `RPA_POLL_ROUNDS` 轮才 `pollRpa()`（`:582-584`，注释"主机令牌刚被确认，此刻领任务最不容易白跑"）；404 视为"没有待办任务"正常空闲（`:674-675`）；`finishRpaTask()`（`:626-658`）回传失败仅告警，不阻塞下一轮。

### 9.3.4 两条 RPA 链路并存（不要互相替代）

| 维度 | Automa/CDP（`deviceType=botbuddy`） | rpa-chrome（`deviceType=chrome`） |
|---|---|---|
| 执行体 | 指纹窗口内的 Automa 扩展页 | 用户本机 Chrome 的 aipdd 插件 + 注入 executor |
| 通道 | `/api/public/bot-host/rpa/**`，`x-bot-token: bot_` | `/api/public/rpa-chrome/**`，`x-chrome-token: rc_` |
| 下发粒度 | 整份 Automa workflow JSON | 单条闭集 `commandCode`，心跳批量领（30s） |
| 决策 | 工作流自带逻辑 | LLM 逐步决策 或 `chrome_actions` 确定性回放 |
| 能力原语 | 由 workflow 节点决定 | `IMPLEMENTED_PRIMITIVES` 15 个（`chrome-rpa.js:32-48`），服务端取交集过滤 |
| 适用 | 批处理、指纹隔离、与 PC 脚本互通 | 轻量操作、边看边跑、敏感动作人工确认 |

`rpa-shared.ts:178-184` 与 `rpa-task.service.ts:650,1521-1534` 显式隔离两条链路。**首版只搬 Automa/CDP**；rpa-chrome 留 P2（它依赖 aipdd 插件的 `x-chrome-token` 体系，与桌面主机令牌是两套身份，不要混用）。

`backend/src/workflow/` 是**独立的云端 DAG 引擎**（`workflows/workflow_versions/workflow_runs/workflow_run_steps` 表，`schema.prisma:13059-13152`），通过 `RpaChrome_*` 契约端点单向调用会话引擎，**不经过 Automa/BotBuddy 主机令牌通道**，迁移时不要把它误认为 RPA 队列。

### 9.3.5 新端的接线与必须打通的硬编码点

采用 D1（沿用 `DESKTOP`）、D2（沿用 `bot_`）、D8（沿用 `botbuddy`）：
1. 新通道 `/api/public/awbotdsh/rpa/tasks|claim|finish|release` 由 `registerBotHostPublic` **自动获得**（`bot-host.public.ts:406-452` 用 basePath 拼接），无需新写路由。
2. 必须参数化/复核的硬编码：`claimBotBuddy` 里 `deviceType:'botbuddy'`（`:978,1005`）、`executor` 前缀 `botbuddy:`（`:1061`）、`requireBotBuddyTarget` 的 `clientKind==='DESKTOP'`（`:1494`）——沿用 DESKTOP 时**不用改**，但要在回归用例中锁定。
3. 心跳必须继续上报 `caps.agent.fingerprint.defaultId + windows`（`main.js:203-219`），否则平台 `requireBotBuddyTarget` 校验窗口候选时前端无法绑定，任务创建即被拒。
4. 任务归属仍用 `botHostId`（不要另起 deviceId），`profileId` 用平台下发的 `fpProfileId`；领取候选按 `(botHostId=hostId || null)` 收窄。
5. AWBot 手机通道 `/api/public/awbot/rpa/*` 虽同注册，但 `awb_` 令牌领不到 botbuddy 任务（`requireBotBuddyTarget` 拒 AWBOT）——**这道隔离要保留**，它是"手机端不得领桌面 RPA"的防线。
6. Web 管理端无需改造：`frontend/src/app/rpa/_components/{task-panel,botbuddy-browser-panel}.tsx` 已按 `deviceType=botbuddy + botHostId + fpProfileId` 建模，文案把 "BotBuddy" 改为 "AWBotDSH" 即可。

### 9.3.6 故障隔离（用户原则的具体落地）

| 故障场景 | 现有机制 | 新端保持方式 |
|---|---|---|
| 一条坏脚本 | `scanBotBuddy` 阶段 `filter(scriptRunnableByDevice)` 剔除（`:995-1000`） | 不改；领不到就不领 |
| 抢单冲突 | CAS `updateMany where status:'pending'`，失败 `continue`（`:942,1219-1225`） | 不改；多端并发天然互斥 |
| 派发失败 | 整段 try-catch 回滚当前任务 pending（`:943-959`） | 不改；不影响其他任务 |
| 触发/执行异常 | `rpa-runner.js:438-441` 收口 failed 回执并释放 active | 不改；对话/技能/心跳继续 |
| 回传失败 | `main.js:653-655` 只告警，平台超时自愈 | 补 release 兜底 + BotBuddy 通道超时扫描 |
| 客户端崩溃 | `sweepTimeouts()` 退回 pending（`:1370-1403`） | 补独立 scheduler，不依赖 PC 通道 claim |
| 模型不可用（RPA AI 节点） | 不走 Automa 链路；rpa-chrome 的 AI 决策在平台侧 | 新端 Automa 链路不受模型影响 |

## 9.4 浏览器页三 Tab 的交互清单（原 Electron 管理台，DOM 已废弃）

DOM 在 `bot-host-client/src/renderer/app.html:504-673`：
- `section.pane[data-pane="browser"]`，三个 Tab：`data-browser-tab="windows"`（默认 active，`:505-509`）、`"plugins"`、`"rpa"`；面板 `data-browser-panel` 分别在 `:511 / :631 / :653`。
- 内核卡片 `:512-525`：`fpKernelState/fpKernelZip/fpKernelDir/fpKernelFolder`（ZIP ≤600MB、条目 20000、单文件 512MB、总量 2048MB，`kernels.js:20-27`）。
- 窗口列表 `:527-539`：`fpCountHint/fpNew/fpCloseAll/fpReload/fpList/fpHint`；编辑卡 `:541-628` 含 22 个字段（`fpName/fpGroup/fpKernel/fpPlatform/fpTimezone/fpLanguages/fpCores/fpSeed/fpCanvas/fpAudio/fpWebrtc/fpProxyMode/fpProxyType/fpProxyHost/fpProxyPort/fpProxyAuth/fpProxyUser/fpProxyPass/fpCheckProxy/fpProxyResult/fpExts/fpEditorHint`）。
- RPA 面板 `:653-672`：标题"RPA 任务"、`rpaSummary/rpaAutoRun/rpaReload/rpaRunning/rpaList/rpaHint`；文案明确"目标设备选 BotBuddy 浏览器、绑好这台主机与指纹窗口…账号口令不经过这里"。
- 事件在 `app.js:1321-1745`：`showBrowserTab()`、RPA 五个函数（`:1351-1489`）、`renderFpExtChips()`（`:1491-1515`）、`loadFpState/renderFpList/openFpEditor/fpFormBody/saveFpProfile/checkFpProxy/importFpKernel`（`:1517-1725`）、集中绑定 `:1727-1745`。
- CSS 类：`.pane/.tabbar/.tabbtn/.tabpanel/.card/.list/.field/.chips/.chip/.tag/.mono/.muted/.rpa-running/.rpa-row`。

**设计结论（已按 D10 修正，原稿此处与第十章冲突）**：界面**不再保留** `app.html` 管理台。原管理台的三 Tab（窗口/插件/RPA）连同对话区，统一改由 **Client 插件注入 DSH 官方 UI**（`sidebar.panellist` + `main` keyed + `sidebar.right.pane.tab` + `settings.section`，见 10.2/10.3）；本节列出的 DOM、事件与字段是**重写时的交互清单与逻辑来源**，不是要照搬的产物。唯一原样保留的是：**指纹浏览器仍是另行 spawn 的独立操作系统进程、窗口自带原生 Chrome 地址栏**（9.1.1），因此**不要**用 `<webview>`/`<iframe>` 或在 React 里重画浏览器工具栏——那会丢失内核级指纹、扩展完整能力与原生地址栏。相对旧三 Tab 的功能性改动只有三处：①品牌字面量（BotBuddy→AWBotDSH，含 `fp/start-page.js:17,33`）；②新增 URL 导航输入框（调 `navigateAgent`）；③内置扩展项增加启用/禁用开关（9.2.3）。

## 9.5 隔离总图（文本）

```
┌────────────────────── AWBotDSH Electron 主进程 ──────────────────────┐
│ DSH 官方 Web UI（Renderer）：会话/设置/插件页 + Client 插件注入的面板   │
│   awbb-browser（窗口/插件/URL 导航）、awbb-rpa（任务）、awbb-link-ui    │
│   （配对与账号同步）、awbb-settings（四个设置分区）                     │
│   preload 只保留 Host 侧通道：fp:* / chromeExt:* / bridge:* / rpa:*     │
├───────────────┬────────────────────────┬──────────────────────────────┤
│ DSH 引擎      │ 浏览器工作台（伴生）    │ Link（出站 HTTP + 5s 心跳）   │
│ 插件 $DSH_HOME│ fp/launch → spawn 内核 │ /api/public/awbotdsh/**     │
│ 技能 skills/  │  ├ 档案A：内核进程+端口 │ x-bot-token=bot_...          │
│ 会话 skillIds │  ├ 档案B：内核进程+端口 │ 配对/心跳/指令/RPA 领取回执   │
└───────────────┴───────────┬────────────┴──────────────────────────────┘
                            │ CDP（仅 127.0.0.1，随机端口）
        ┌───────────────────┴───────────────────┐
        │ 指纹 Chromium 原生窗口（可输入网址）  │
        │  --load-extension: automa / aipdd / bridge │
        │  Automa 扩展页 ← background--workflow:execute │
        └─────────────────────────────────────────┘
   隔离：①三套目录互不写 ②CDP/relay/bridge 只绑回环 ③单任务异常只收口 failed
```

## 9.6 移植文件清单与红线

| 分类 | 文件 |
|---|---|
| 指纹窗口复用 | `fp/{fingerprint,kernels,profiles,proxy-relay,start-page,index,launch}.js`、`ws-client.js` |
| UI 逻辑来源（DOM 废弃，界面按第十部分重写） | `src/renderer/app.html:504-673`（三 Tab 结构）、`app.js:1321-1745`（事件与渲染逻辑）、`preload.js:97-111`（15 个 `fp:*` 通道，改为 Host 插件 HTTP/RPC 后不再需要 preload） |
| 扩展体系复用/改造 | `chrome-extensions.js`、`zip-extract.js`、`chrome-bridge.js`、`chrome-bridge-extension/`、`builtin-extensions/automa/`、`extensions/aipdd-enterprise/`、`package.json extraResources` |
| RPA 复用 | `rpa-runner.js`、`platform-client.js:310-345`、`main.js:582-584,626-690,1202-1227`、`tools/_rpa-unit.js` |
| 平台侧仅文案/补强 | `bot-host.public.ts:406-452`（端点随 basePath 自动注册）、`rpa-task.service.ts:943-959,1122-1128,1370-1403`（补 release 与超时扫描） |
| **不搬** | `rpa-chrome` 插件链路（P2）、`backend/src/workflow/`（云端 DAG，另一套）、`docs/指纹浏览器技术方案.md:100-132` 的草案字段（与代码不符） |

**四条红线**：
1. Chrome 扩展只写 `~/.awbotdsh/chrome-extensions`（兼容读 `~/.botbuddy`）与 `resources/builtin-extensions`，**禁止写 `$DSH_HOME`**；DSH 插件/技能也禁止进 `--load-extension`。
2. CDP / relay / bridge 一律 `127.0.0.1`，**不得把 CDP 代理到平台或公网**；bridge token 重启轮换。
3. 扩展 seed 不得覆盖无 marker 的用户目录；内核/密钥目录迁移必须成对，否则代理密码失效。
4. RPA 单任务异常只收口为 failed 回执；**不得阻断心跳、对话、技能、插件**（`rpa-runner.js:438-441`、`main.js:653-655` 语义保留）。

---

# 十、专题：界面框架沿用 DSH UI 与 BotBuddy 功能剥离

> 本轮用户明确：**整个界面框架沿用 deepseek-harness 的 UI 框架**，把 BotBuddy 的功能剥离出来移植进这个新 UI 框架，再打包成新客户端。这是对原方案"保留 BotBuddy Electron 管理台"基线的修正。本章给出：DSH UI 能做到什么、BotBuddy 每个界面/能力剥离到哪里、逐项落地细节、不可为的边界、打包形态、验收标准。

## 10.1 DSH UI 框架能力盘点（桌面端，与手机端严格区分）

### 10.1.1 官方 Desktop 的装配链（可直接沿用的骨架）

来自 DSH 官方 `docs/architecture.md`（"Desktop application"与"Application launch"两节）：

```
Electron 主进程
  └─ Desktop Host（Electron Node 模式，私有）
       ├─ 初始化 $DSH_HOME/profiles/desktop（bundle 对账、依赖解析）
       ├─ 调用共享 CLI 的 profile runner → 完整 Web 应用（dsh web 同款）
       └─ Node IPC 传：boot injections / readiness / fatal errors / shutdown
  └─ BrowserWindow：加载打包的 Web assets（= 官方 DSH Web UI）
       └─ 文档内激活 client plugins；Web 侧独占 RPC 与 streams
       └─ Desktop carrier 把本地页面接到已认证 Host；默认 OS 分配端口
```

→ **要点**：UI 与内核是同一套 DSH 官方代码，用户看到的会话页、设置页、插件页、技能、侧栏全部现成；我们要做的不是"写 UI"，而是"**写插件把 BotBuddy 的功能挂到现成 UI 的正确位置**"。

### 10.1.2 slot 机制：能挂什么、不能碰什么

依据 `plugin-seams.md:21-31`、`plugin-ui-v3.md`，以及**锁版 rc.5 的官方目录**（116 条：53 `shadows-shipped-ui` / 60 `none` / 3 `wraps-owner-content`）。下表每条的 kind/scope 已在 rc.5 目录中逐条复核，与 rc.1 一致（`main` 仍是 keyed + shadows）：

**注入 API**（`plugin-seams.md:23`）：
```ts
ctx.slots.inject(key, () => ctx.slots.register({ name, id, order, label? }, Component))
```
- 基数：`single`（独占，注入即替换）/ `list`（按 id 追加）/ `keyed`（按 key 追加）/ `chain`（链式）/ `hoc`（rc.5 新增：包住 owner 内容）。
- 作用域：`root` / `session` / `session-maybe`。
- 官方 props 三档（`plugin-seams.md:26-28`）：全局 `useSessions/useWorkspaces/usePanelInfo/useResource/useRemoteAccess`；会话级再加 `sessionId/useSession/useProjection/useConversation/useInput/inputActions/useChat/useTrajectory`。
- 常用客户端服务（`plugin-seams.md:29`）：`slots/locale/theme/layout/sessions/workspaces/uiWorkspace/timer/connection/remote/commandUi/styles/modules`。

**允许承载 BotBuddy 功能的追加点（本方案会用到）**：

| slot | 基数/作用域 | 承载的 BotBuddy 功能 | 依据（rc.5 同名条目 / Dart 目录） |
|---|---|---|---|
| `settings.section` | list/root（p0Page） | 连接码/账号同步、浏览器工作台、RPA、模型 Key 策略四个设置分区 | rc.5 `none`、`slot_catalog.dart:562` |
| `sidebar.panellist` | list/root（p0Entry） | 「浏览器工作台」「RPA 任务」独立页面入口 | rc.5 `none`、`slot_catalog.dart:615` |
| `main` | keyed/root（p0Page）⚠️ `replaceRisk=shadows-shipped-ui` | 上述页面的主区域（**新增 key 追加**，不替换默认对话格） | rc.5 `shadows`（keyed）、`slot_catalog.dart:475` |
| `sidebar.right.pane.tab` | **keyed/session**（p0Page） | 浏览器/RPA 管理的右侧页签 | rc.5 `none`、`slot_catalog.dart:617-622` |
| `conversation.input.left` / `.right` / `.dock` / `.overlay` | list/session（p1Panel） | 对话框「＋」的技能/插件/数字分身/工作区入口（8.6 已设计，落点在此） | rc.5 `none`、`slot_catalog.dart:367-411` |
| `shell.overlay` | list/root（p2Overlay，opt-in） | 轻量状态浮层（配对成功、同步账号确认） | rc.5 `none`、`slot_catalog.dart:585` |
| `plugins.detail.section` | list/root（p1MaskedPage） | 本项目插件详情补充区 | rc.5 `none`、`slot_catalog.dart:500-505` |

⚠️ **两个例外必须写进规则**：`main` 与 `plugins.bundle.config` 虽被目录标为 `shadows-shipped-ui`，但基数是 **keyed**——"新增一个 key"是追加（新页面/新配置卡），只有"占用已存在的 key"才是替换。因此本章的"只用 `none`"应表述为：**只做 list 追加与 keyed 新增 key，不占用任何已存在的 single/keyed key**；`main` 的既有 key（默认对话格）不动。这条口径与 10.7、13.9 的断言必须一致，否则验收自相矛盾。

**明确不可碰（`shadows-shipped-ui`，注入即替换官方界面）**：`root`、`sidebar`、`sidebar.brand.*`、`sidebar.settings`、`conversation.composer.bar`、`conversation.input.model/activity/permission/plan/attachments`、`conversation.session`、`main.conversation`、`shell.leading/bottom`、`settings.trigger/header/launcher`（`plugin-seams.md:114`、`slot_catalog_test.dart:75-90`）。消息级 slot（`conversation.chat.*`、`tool.call.*`）团队已判定"不做岛、不做平台视图"——一条消息一个视图会拖垮滚动（`slot_catalog.dart:28-30`）。

### 10.1.3 为什么桌面端不需要"网页岛"

`plugin-seams.md` 的"9 个 slot 已接线 / 网页岛 / App 不执行插件代码"全部来自 **Flutter 手机端**约束（"9 个 slot 已接线"出自 `plugin-ui-v3.md:17,45` 与 `native-plugins.md:67`，不在 `plugin-seams.md` 里）：`native-plugins.md:97` 明确"release 包没有 Dart 解释器，不能加载外来 Dart 或 Flutter 组件"。桌面端官方 Desktop 直接运行完整 Web UI（React），Client 插件就是 Web 插件，slot 原生可用。→ **不实现 island.js/island.css/recipes.json 那一套**（那是手机端为在原生 UI 里显示 Web 插件而做的隔离层），既省内存也避免 G1 路由守卫问题。

## 10.2 BotBuddy 界面与能力剥离总表（逐项落点）

| # | BotBuddy 现状（`app.html` / `app.js` / `main.js`） | 剥离后落点（DSH UI / 插件层） | 承载插件 | 复用/重写 |
|---|---|---|---|---|
| 1 | 会话列表 + 对话主体 | **不剥离**，直接用 DSH 官方会话页（`conversation.session` 等 shadows） | —（官方） | 零开发；历史对话需一次性迁移（见 10.5） |
| 2 | 对话框「＋」技能/插件/数字分身/工作区（`renderAddPop` app.js:2133-2146、`#chatAddBtn` app.html:228） | `conversation.input.left/right/dock/overlay` 注入按钮与面板；技能选择复用 8.6 的会话级白名单 | Client：awbb-composer | 重写为 React；数据流复用 `state.chat.skillIds`→会话 `skill_ids` |
| 3 | 设置 Tab（模型/连接码/通用） | `settings.section` 分区；模型走 DSH 官方 `settings.models.*`，不重写；连接码/账号同步/浏览器/RPA 为新增分区 | Client：awbb-settings | 重写为 React；模型 Key 策略按 D4 |
| 4 | 插件 Tab（Agent 插件启停/配置） | DSH 官方插件页（`plugins.*` slot + `plugins.bundle.config`/`plugins.row.config`）；本项目 Agent 插件改写成 Cordis 插件装进 `$DSH_HOME` | Client：仅补 `plugins.detail.section` | 官方页承载；原 `plugins.js` 的 http/command 插件需改造为 Cordis 形态 |
| 5 | Chrome 扩展 Tab（导入/启停：`app.html:631-650`） | 新增「浏览器工作台」页面（`sidebar.panellist` + `main` keyed），扩展管理为其子面板 | Client：awbb-browser + Host：awbb-browser.host | 重写为 React；底层 `chrome-extensions.js` 逻辑由 Host 插件包装 |
| 6 | 指纹窗口 Tab（列表/打开/关闭/代理：第九部分） | 同页子面板；窗口本身仍是**外部内核 OS 进程**（原生地址栏） | Host：awbb-browser.host（`fp/*` 复用） | 逻辑零改；UI 重写为 React |
| 7 | RPA 任务 Tab（`app.html:653-673`、`app.js:1351-1489`） | 新增「RPA 任务」页面（`sidebar.panellist` + `main` keyed），含任务列表/下发/结果 | Client：awbb-rpa + Host：awbb-rpa.host（`rpa-runner.js` 复用） | UI 重写；`rpa-runner.js` 逐行复用 |
| 8 | 连接码配对界面（`pairing.js` + renderer 登录/配对卡） | `settings.section`「平台账号」分区：平台网址 + 账号 + 密码 → 6 位码 → 网页认领；**未配对不影响对话** | Client：awbb-link-ui + Host：awbb-link | 界面重写；协议复用 6.4 |
| 9 | 任务/进度/回执（platform-client.js 5s 心跳） | **无 UI，纯 Host 插件**：心跳、progress/result、模型授权、SkillHub 转发 | Host：awbb-link | 逻辑复用，去掉对 `app.js` 的 DOM 更新调用 |
| 10 | CDP 浏览器工具（`fp/browser-tools.js`、`ws-client.js`） | **无 UI，纯 Host 插件**：注册为 DSH `ctx.tools`（`defineTool`），供 Agent 调用 | Host：awbb-browser.host | 复用工具实现，改注册方式（`ctx.tools.register`） |
| 11 | SQLite `~/.botbuddy/botbuddy.db` | 拆分：**DSH 自身状态用 `$DSH_HOME`**；BotBuddy 业务表（浏览器档案/扩展/RPA 台账/幂等）保留独立 SQLite，由 Host 插件持有 | Host：awbb-store | 双路径兼容（D3）；**不写 `$DSH_HOME`** |

### 剥离的硬性边界

1. **不 fork DSH UI**：`apps/web`、`packages/bundle/web-app`、`dsh-web-frontend` 保持官方原样；所有定制都在自己的插件包里（profile + patch 装配）。理由：developer preview 破坏性变更（`2.1`）+ fork 后无法低成本跟版。
2. **不保留 `app.html`**：BotBuddy renderer 的原生 DOM（`app.html` / `app.js` 约数千行）**整体废弃**，不接受"新旧两套 UI 并存"——那会造成 8.6 技能选择器等逻辑双份维护。仅把其中的业务逻辑抽成 Host 插件，界面按上表重写为 React。
3. **不混用三套扩展**：DSH 插件（`$DSH_HOME/profiles/desktop`）、技能（`$DSH_HOME/skills`）、Chrome 扩展（`~/.awbotdsh/chrome-extensions`）分目录、分清单、分开关（原则 5、第九部分红线 1）。

## 10.3 Client 插件设计（可见界面）

### 10.3.1 插件包与装配

每个 Client 插件是独立包，`package.json` 按 DSH 约定声明（来自 `plugin-seams.md:37-43`）：
```json
{
  "name": "awbb-browser",
  "dsh": { "client": { "platform": "web" } },
  "exports": { "./client": "./src/client.tsx" }
}
```
- 加载链（rc.5 官方口径）：`window.__ModuleLoader__`（queue 模式）→ 预载/执行 combo → `window.__DSH_BOOT__`（全部调度描述 + 每条 row 的 HMR combo URL）→ Vite 主模块 → 内核 `create()` 后由 `ui-renderer` 挂载；插件是"动态 client 包"，声明 `dsh.client`、产出自注册 `lib/client.js`、保留 host graph row（`.agents/notes/.../2026-08-15-client-shells-and-dynamic-packages.zh.md`）。
- **共享平台模块**：`react` / `react-dom` / `cordis` / `ui-primitives` / `ui-slots` 由外壳的 `PLATFORM_MODULES` 播种，插件只在需要基座外实体时才声明 `dsh.client.external`，**不随包打**——Client 插件直接 import，用官方 `ui-primitives`（`Button/Switch/Modal/Input/Menu/Tooltip/Tag/MarkdownText` 等），视觉与官方 UI 一致（同 Note 的"共享模块请求"一节 + `plugin-seams.md:40,47`）。
  ⚠️ 别和**运行时动态 Cordis 包**混：那条路径（`ctx.dynamicCordisRunner` / `cordis` 工具）的浏览器半"无 JSX、无 TS、不能 import"，只能用 `React.createElement` + `styles.insert(css)`（`@deepseek-ai/dsh-cordis-client-runner@0.2.2-rc.5/README.zh.md:32`）。本方案的 5 个插件走前者（构建期包），不是后者。
- **默认启用**：把插件写进 profile 的 bundle 或 `cordis.patch.yml`（`docs/architecture.md`：profile = bundles + out-of-tree 插件 + 用户 patch；`dsh.bundle` 指向 patch 文件；`--patch` 覆盖），随包预置到 `$DSH_HOME/profiles/desktop`。这是"默认初始化插件"在 UI 侧的落点，与第七部分的 Host 侧预置合并为一份清单。

### 10.3.2 五个 Client 插件的职责与 slot

| 插件包 | 注入 slot | 提供的界面 |
|---|---|---|
| `awbb-composer` | `conversation.input.left/right/dock/overlay` | 「＋」按钮与技能/插件/数字分身/工作区选择面板；技能源 = DSH `skills/list`（含 `modelInvocable`）+ 本地已装，会话级白名单（8.6） |
| `awbb-settings` | `settings.section` | 四个分区：平台账号（网址/账号/密码登录 → 连接码 → 状态/解绑）、浏览器工作台配置、RPA 配置、模型 Key 策略（未配对时平台项显示"需配对"，不锁死） |
| `awbb-browser` | `sidebar.panellist` + `main`(keyed) + `sidebar.right.pane.tab` | 指纹档案管理（列表/打开/关闭/代理）、Chrome 扩展管理（导入/启停/默认预装态）、地址栏导航入口（调 Host 的 `fp.navigate`） |
| `awbb-rpa` | `sidebar.panellist` + `main`(keyed) | RPA 任务列表/下发/结果与重试；数据来自 Host 插件的 HTTP 路由 |
| `awbb-link-ui` | `settings.section` + `shell.overlay` | 平台账号分区：网址/账号/密码登录 → 6 位码展示 → 网页认领结果；未配对时只在这里提示"需配对"，不锁其它界面（6.4） |

### 10.3.3 与 Host 插件的通信

- Client → Host：**走 DSH 官方 RPC / HTTP**。"Web 拥有 RPC 与 streams，Desktop carrier 把本地页面接到已认证 Host"（`docs/architecture.md`）。Host 插件注册自定义 HTTP 路由或 RPC 服务，Client 插件用官方 `useRemoteAccess` / `connection` 服务调用（`plugin-seams.md:29`），**禁止新开裸 WebSocket 或直连平台**。
- Host → Client：状态变化（配对完成、RPA 终态、浏览器窗口关闭）用 DSH 的事件/stream 推送，Client 订阅后刷新 slot 组件；不复制 BotBuddy 的 `ws-client.js` 到渲染进程。
- **平台协议只在 Host 插件里**：`x-bot-token`、`sessionToken`、心跳游标、SkillHub 转发全部封在 `awbb-link`；Client 插件永远拿不到令牌（比 BotBuddy renderer 直接调 `window.api` 更安全）。

## 10.4 Host 插件设计（本机能力与平台协议）

| Host 插件 | 注册内容 | 复用的 BotBuddy 代码 |
|---|---|---|
| `awbb-link` | HTTP 路由：`/awbb/pair/anonymous`、`/awbb/pair/poll`、`/awbb/sync`、`/awbb/heartbeat`；服务：令牌存储、账号快照、SkillHub 转发；effect：5s 心跳定时器 | `pairing.js`、`platform-client.js`、`config-store.js` |
| `awbb-browser` | `ctx.tools.register()` 注册 CDP 工具（`navigate/click/type/screenshot/eval` 等，`fp/browser-tools.js`）；HTTP 路由：档案 CRUD、扩展导入/启停、窗口打开/关闭/navigate；effect：内核进程生命周期 | `fp/*`、`ws-client.js`、`chrome-extensions.js`、`zip-extract.js` |
| `awbb-rpa` | effect：任务领取循环、`rpa-runner.js` 执行、回执；HTTP 路由：任务列表/下发/重试；与 `awbb-browser` 通过 DSH 服务注入解耦（不直接 import） | `rpa-runner.js`、`tools/_rpa-unit.js` |
| `awbb-store` | 持有独立 SQLite（业务表），提供 `ctx.awbbStore` 服务；双路径兼容（D3） | `db.js` |

**隔离要点**（承接第九部分红线）：
- 每个 Host 插件的注册都是 `ctx.effect`（cookbook "Plugin hot-reload"：every registration is a ctx.effect → 卸载即撤销），单个插件异常不拖垮 DSH 会话与官方 UI。
- 指纹内核 / CDP / relay / bridge 仍是独立 OS 进程与 `127.0.0.1` 端口，不进 DSH 进程内；RPA 单任务异常收口为 failed 回执。
- `awbb-rpa` 只通过 `awbb-browser` 暴露的服务操作浏览器，**不直接 import `fp/*`**——这样浏览器插件升级/禁用时 RPA 优雅降级（对应"相互对接又相互隔离"原则）。

## 10.5 数据迁移与兼容（剥离不可丢失的历史）

| 数据 | 原位置 | 新位置 | 迁移方式 |
|---|---|---|---|
| 会话/对话正文 | `botbuddy.db` 对话表 | DSH `session` 日志（`$DSH_HOME`，JSONL） | 一次性转换脚本：BotBuddy message → DSH `SessionEvent`（沿用 `createUserMessage` 等，`extension-cookbook.md` "A UI plugin"）；转为只读历史，新会话走 DSH |
| 技能正文 | `skills` 表 | `$DSH_HOME/skills/<name>/SKILL.md` | 按第八部分 seed 流程导出；`userOwned` 不覆盖 |
| 指纹档案 | `fp_profiles`（含加密代理密码） | 独立 SQLite（awbb-store）+ 内核目录 | **密钥 `~/.botbuddy/fp-secret.key` 必须成对迁**（第九部分 9.2），否则代理密码全失效 |
| Chrome 扩展 | 受管目录 | `~/.awbotdsh/chrome-extensions` | 无 marker 的用户目录原样保留；内置三扩展重新 seed |
| RPA 台账/幂等 | `tasks` 表 | 独立 SQLite（awbb-store） | 原样迁移；`commandCode` 幂等键保留 |
| 令牌/账号 | `config-store` | Host 插件安全存储 | 旧 `bot_` 令牌可继续识别；未配对状态显式标记 |

## 10.6 打包形态

1. **基线**：从官方 Desktop 产物（`apps/desktop`）出发，按其 README 保留签名资源内的 dsh 生产 runtime 与 `$DSH_HOME/profiles/desktop`；不重建 Electron 工程。
2. **随包资产**（`extraResources` 语义，参照 BotBuddy `package.json`）：
   - 五个 Client 插件包 + 四个 Host 插件包（含 `package.json` 的 `dsh.client` / `dsh.bundle` 声明）；
   - `cordis.patch.yml`（把上述插件按 order 装配进 desktop profile）+ 三扩展 `key` 与内置目录；
   - 6 个内置技能种子 + 安全门禁模块；
   - 指纹内核二进制（每版本 200–300MB，独立目录，不在 `$DSH_HOME`）；
   - 旧 `~/.botbuddy` 数据迁移器（一次性）。
3. **首启 seed**：Host 插件在 Desktop Host ready 后执行——装配 profile/插件 → 写 marker → seed 技能与扩展 → 检测旧数据提示迁移。**所有 seed 不覆盖无 marker 的用户目录**（原则 3、第七/八部分一致）。
4. **升级**：DSH 版本锁死；升级时只替换官方 runtime 与插件包，`$DSH_HOME` 下用户插件/patch/skills 与 `~/.awbotdsh` 业务数据保留（对齐 `plugin-seams.md:436` 的保留语义）。

## 10.7 不可为的边界（避免走回头路）

1. **不做网页岛**：桌面端没有 Flutter AOT 约束（10.1.3），实现 island.js/island.css 只会重引入"整页加载官方客户端 + 内存预算 + G1 守卫"的手机端包袱。
2. **不重画官方会话/设置/插件页**：rc.5 的 53 个 `shadows-shipped-ui` slot 是官方界面，注入即替换；只用 list 追加与 keyed 新增 key。`main` 与 `plugins.bundle.config` 是 keyed 例外（新增 key 才算追加），其余 shadows 一律不占用；3 个 `hoc`/`wraps-owner-content`（markdown 围栏、hero 外框、侧栏会话动作）本期不用。
3. **不做消息级平台视图**：`conversation.chat.*` / `tool.call.*` 团队已判定拖垮滚动（`slot_catalog.dart:28-30`）；RPA 结果、浏览器状态只在侧栏/设置页呈现，不逐条消息插卡。
4. **不保留双 UI**：`app.html` 整体废弃，不搞"旧管理台 + 新插件页"并存（10.2 边界 2）。
5. **不把 BotBuddy 业务数据塞进 `$DSH_HOME`**：它会随"重置运行环境"被删除（`plugin-seams.md:437`）。

## 10.8 验收要点（汇总见第十三部分）

- [ ] 官方 DSH UI 原样呈现：会话、设置、插件页为官方组件，无自绘、无 fork；客户端版本锁定可查。
- [ ] 五个 Client 插件经 `ctx.slots.register` 出现在 10.1.2 表列 slot；官方 `shadows-shipped-ui` 界面无被替换。
- [ ] BotBuddy 11 项能力按 10.2 表逐项就位；`app.html` / `app.js` 不再进入构建产物。
- [ ] 对话框「＋」技能选择落在 `conversation.input.*`，行为符合 8.6（会话级白名单、`modelInvocable` 徽章、未配对回退）。
- [ ] 四个 Host 插件各自 `ctx.effect` 可独立卸载：禁用 `awbb-browser` 后 RPA 优雅降级、对话/技能/心跳不受影响。
- [ ] Client 插件不含任何令牌/请求平台的代码；平台协议只在 `awbb-link`，抓包验证。
- [ ] 数据迁移后：旧会话可读、技能可见、指纹档案代理密码可解、扩展与 RPA 台账完整。
- [ ] 首启 seed 不覆盖用户已有目录；升级后 `$DSH_HOME` 用户态与 `~/.awbotdsh` 业务数据保留。

---

# 十一、专题：改名 AWBotDSH 影响面

## 11.1 必改（用户可见/构建产物）

| 位置 | 文件:行 | 说明 |
|---|---|---|
| npm 包名 | `bot-host-client/package.json:2` | `bot-host-client` → `awbotdsh-client`（目录名可后续再改） |
| 产品/可执行/快捷方式名 | `package.json:23-24,51` | `BotBuddy` → `AWBotDSH` |
| 窗口标题/品牌名 | `src/renderer/app.html:6,15,664` | HTML title 与 brand-name |
| 主进程/托盘常量 | `main.js:44`、`tray.js:17` | `PRODUCT_NAME` |
| UA / 工具标识 | `platform-client.js:58,139`、`agent/model-client.js:128`、`fp/proxy-relay.js:354` | `botbuddy/` → `awbotdsh/` 等；**注意 UA 长度与后端日志识别**（`rpa-runner.js` 本身不发 UA，原稿此处的 `rpa-runner.js:340` 是 `workflowId` 兜底逻辑，勿改） |
| 渠道/主题前缀 | `main.js:469`（`BotBuddy · ` 渠道名前缀）、`main.js:1163`（`botbuddy-skill-` 临时目录前缀）、`bot-host.service.ts:77` | 与后端 `CLIENT_CHANNEL_PREFIX` 联动改，否则已配对渠道名对不上 |
| 自测脚本断言 | `tools/_db-unit.js`（`BOTBUDDY_HOME`/`botbuddy.db` 共 7 处，含 `:115-116`）、`tools/_pipeline-unit.js`（5 处） | 改品牌/路径必同步改断言，否则 CI 直接红 |
| 桥接扩展 | `chrome-bridge-extension/manifest.json:3,5,12`、`popup.html`、`background.js`、`README.md` | "BotBuddy 浏览器桥接"文案 |
| 图标 | `build/icon.ico`、`build/icon.png`、`src/assets/icon.png`、`tray.png` | 位图替换（品牌 D6） |
| 文案/提示词 | `agent/index.js:85,130,290`、`renderer/app.js:94,2222,2686`、`fp/start-page.js:17,33`、`renderer/app.css:1,1057` | 全局替换；**保留 `agent/index.js:107-108` 的"技能正文非指令"提示** |
| 文档 | `README.md` 及 7 个多语言版本、`docs/` 相关方案 | 批量更新 |

## 11.2 后端/前端（仅文案，逻辑不改）

- 后端：`bot-host.service.ts:77,268,308-309`、`bot-host.public.ts:210,268,401-404,422,433,443`、`ai-call-account.service.ts`、`content/agent-tools.ts` 等多处显示文案。
- 前端：`agent-bot/page.tsx`、`bot-host/*`、`ai-call/*`、`rpa/*` 的展示文案；**设备类型键 `botbuddy`（RPA）建议保留**，否则牵动 `rpa-task.service` 的 `claimBotBuddy`/`deviceType==='botbuddy'` 判断。

## 11.3 兼容性继承（勿机械替换）

- 令牌前缀 `bot_` 与旧 `wb_`（契约 `:15`、客户端 `config-store.js:272-276`、后端 `bot-host.service.ts:1314-1321`）——D2 决策。
- `clientKind=DESKTOP` 与 kind 隔离语义——D1 决策。
- 本地数据路径 `~/.botbuddy` / `BOTBUDDY_HOME`——D3 决策，**含用户已导入的技能正文，不可直接丢弃**。

---

# 十二、风险清单与合规边界

| # | 风险 | 说明 | 缓解 |
|---|---|---|---|
| **R1** | DSH 破坏性变更 | developer preview 明确"THERE WILL BE COMPATIBILITY-BREAKING CHANGES"；npm `latest` 与 `next` 分叉（0.2.2-rc.1 / rc.5），已定锁 **rc.5**（= 本机安装版） | **锁版=锁目录**：落点自检与 slot 存在性测试都以 rc.5 的 116 条为准；升级必须重新提取目录并重跑测试，走评审 + 回归 |
| **R2** | AGPL 传染 | dsh-Go 为 AGPL-3.0；若桌面端直接复制其代码则触发源码开放义务 | 桌面端依赖 MIT 的 deepseek-harness；`awbot_link` 只作协议参考，自行实现 Link；保留自有品牌，不用 AWBot 标识/吉祥物（D6）。技能资产为**文档/知识内容**，复用时仍需注意其中 dsh-Go 专属说明的引用边界 |
| **R3** | 模型 Key 双向流冲突 | BotBuddy 有 Key 上行 `/model-settings` 与下行 `modelGrant`；与"Key 不出本机"口径冲突 | D4 选①：停上行，下行只在显式授权时写独立 Provider（AWBot `model_sync.dart:41` 固定 route、只删自建项范式） |
| **R4** | 浏览器工作台移植复杂度 | 指纹内核、CDP、三扩展、RPA 共 30+ 文件且带本机状态（端口/进程/密钥/扩展 ID） | D5 已改为**完整移植**：按 9.1–9.4 分四批搬；以"伴生模块"隔离于 DSH；复用 `tools/_fp-unit.js`/`_rpa-unit.js` 回归；旧端仅灰度并存，不永久保留能力缺口 |
| **R5** | 插件路由未鉴权 | DSH 本机 webserver 插件路由无鉴权（`plugin-seams.md:17`） | 阶段 3 前置：绑定 127.0.0.1 + token 校验 + 用户确认安装（7.4）；`dsh web` 已拒绝通配绑定，但插件路由仍要自己守 |
| **R6** | 存量用户数据 | 配对的 `bot_` 令牌、技能、配置在 `~/.botbuddy` | D3 双路径兼容；新旧客户端并存一个版本周期 |
| **R7** | 平台主动唤醒缺失 | poll 模型，App/客户端被杀后无法远端唤醒 | 明确产品边界：在线才执行，离线等上线补领；推送唤醒列 P2/P3 |
| **R8** | 三套版本号并存 | JS `1.0.0`、Electron 包 `1.7.0`、AWBot `1.1.0`（`PROVENANCE.md:35`） | 统一上报字段口径，`clientVersion` ≤24 字符（`bot-host.service.ts:1353`） |
| **R9** | 设备串台 | 手机/桌面共享 harness 与平台协议 | 平台已按 kind + 令牌前缀互斥（`bot-host.public.ts:87`、`service:340-347`）；沿用 DESKTOP kind 可复用隔离 |
| **R10** | 技能白名单静默拒装 | AWBot 三端白名单 5/4/4 与 6 个内置技能、Dart 5 个 loaders 不一致（`ManagedSkillInstaller.kt:96`、`EngineSkills.swift:57`、`ManagedSkillCore.ets:104`） | 桌面端不继承硬编码白名单；以 manifest + 安全门禁为准，或首版统一 6 个并加启动自检（8.5） |
| **R11** | 恶意技能进入 Agent 上下文 | 客户端当前只展示上游安全标签（`app.js:735-744`），无本地门禁；技能正文进系统提示有注入面 | 本地移植 `runUploadSecurityGate` + `scanPackageStatic` + 运行时复扫 + 权限确认；保留"技能正文非指令"提示（8.4） |
| **R12** | 连接码重复认领 | **现状 `pairByCode` 不写 `usedAt`，同一码可被反复认领、每次新建一台 host**（`bot-host.service.ts:327` 判 `usedAt`，`:357-359` 不写）；另有"同账号可重复认领"的边界外风险 | **认领即置 `usedAt`（或唯一约束/CAS），对同一码的第二次认领返回 CONFLICT**；不引入匿名码，因此无枚举/抢注面（P3 若启用匿名方案才需 `deviceSecret` + 限流 + 二次确认） |
| **R13** | 未配对时权限误判 | 本地能力可用但平台能力不可用，UI 若不分清会把"未配对"误报为"服务故障" | 明示能力矩阵（本地可用 / 需配对）；平台入口给"需配对"徽章；不再套用 `pairing.js:72-79` 的全局 locked 语义（6.4.3） |
| **R14** | 扩展 ID 漂移 / 重复加载 | 三份 manifest 都无 `key`，解包 ID 随目录路径变化；RPA 找不到 Automa 扩展页；**若把内置扩展再复制进受管目录，`--load-extension` 会带同一 ID 的两条路径**（`launch.js:109-115` 按路径去重，不按 ID） | D9 选①：加 `key` 固定 ID 并同步更新 `rpa-runner.js:164` 兜底常量；保留动态抓取路径。内置扩展**不 seed 复制**（方案 A），确需复制时按 ID 去重（方案 B），见 9.2.3 |
| **R15** | 两套令牌混用 | `bot_`（桌面主机）与 `rc_`（插件 RPA）/页面签发 5 分钟获客 token 是三种身份；预装 aipdd 后容易被误接进 `x-bot-token` 通道 | 首版只走 Automa/CDP + `bot_`；rpa-chrome 留 P2；在代码评审中禁止把 `x-chrome-token` 逻辑复制进 `rpa-runner.js`（9.3.4） |
| **R16** | 内核/密钥迁移断层 | 内核每版 200–300MB；`fp_profiles.proxy_password_cipher` 由 `~/.botbuddy/fp-secret.key` 加密，换目录不带密钥则全部代理密码失效 | D3 双路径兼容时**成对迁移** `kernels/`、`fp-profiles/` 与 `fp-secret.key`；先只读验证解密再切写路径（9.1.6） |
| **R17** | RPA 卡死/重复 | `platform-client.js:339-345` 定义了 `rpaRelease` 但客户端从不调用；`sweepTimeouts` 只在 PC 通道 claim 时调用，BotBuddy 通道无自愈 | 终态后补 release 调用；BotBuddy 通道加独立超时扫描 scheduler；保留 CAS 幂等（9.3.2） |
| **R18** | 本机服务暴露面 | DSH 插件路由不鉴权（R5）+ CDP/relay/bridge 三个本机端口 + 桥接 token 长期有效 | 三端口全部限 `127.0.0.1`；bridge token 重启轮换；插件路由加 token 守卫；`--remote-allow-origins=*` 仅在内核调试端口使用，不对公网暴露（9.5 红线 2） |
| **R19** | UI 框架剥离工作量与槽位漂移 | BotBuddy renderer（`app.html`/`app.js` 数千行原生 DOM）须全部重写为 React Client 插件；DSH slot 目录随版本变动（0.2.1-rc.2=100、0.2.2-rc.1=109、**锁定版 rc.5=116（53 shadows / 60 none / 3 wraps）**，且多了 `hoc` 基数），53 个 `shadows-shipped-ui` 多为替换点 | D10 选①但**锁版本**：以 rc.5 目录为准做 10.1.2 落点自检；只做 list 追加 / keyed 新增 key（`main`、`plugins.bundle.config` 为例外）；slot 存在性测试纳入构建，升级先跑它（10.1.2、10.8） |
| **R20** | 会话/业务数据跨模型迁移 | 旧 `botbuddy.db` 对话正文要转成 DSH `SessionEvent`（JSONL schema v1+），格式/投影/工具历史不一致会导致历史会话不可读；把业务数据塞进 `$DSH_HOME` 会随"重置运行环境"被删 | 一次性转换脚本 + 只读历史（10.5）；业务数据留在独立 SQLite（awbb-store），**绝不写 `$DSH_HOME`**；迁移前后各做一次打开/回放验证（10.8） |

---

# 十三、验证清单与验收标准

## 13.1 平台侧（阶段 1）

- [ ] 新通道 `/api/public/awbotdsh`（或复用 DESKTOP）可独立申请配对码；`clientKind` 校验生效。
- [ ] `/login`、`/pair`、`/pair/poll` 语义与旧端一致（回归）；**未新增匿名/设备授权码路由**。
- [ ] 网页认领页（`host-panel.tsx`）行为不变：输入码 → 服务端 `pairByCode` 校验同账号 → 建 host。
- [ ] 同一码**不能**被重复认领（认领即置 `usedAt`，第二次返回 CONFLICT）。
- [ ] 桌面令牌进不了 AWBOT 通道，AWBot 令牌进不了桌面通道（沿用 `hostByToken` 前缀校验）。
- [ ] 旧 BotBuddy 在新通道上线后仍能正常配对/心跳/执行（回归）。
- [ ] 任务队列按设备隔离，多客户端并发不串台。
- [ ] SkillHub 三个转发端点在新 `basePath` 下可用，`x-bot-token` 鉴权生效，平台侧不产生客户端技能行。

## 13.2 对接层（阶段 2）

- [ ] 未配对也能对话：只配本地模型渠道 → 发消息有回复（不弹登录、不锁输入框）。
- [ ] 未配对时不起心跳、不刷 401；配对后 5s 心跳稳定；401 清令牌、502/限流不清令牌（回归 `main.js:533-540` 语义）。
- [ ] 配对全链路：填平台网址 + 账号 + 密码 → 登录成功 → 6 位码 → 平台认领 → 取 `bot_` 令牌 → 心跳上线。
- [ ] 指令执行 → progress 流式回传 → result 幂等回执；断线重连后按 commandCode 不重复执行。
- [ ] 模型授权：按 fingerprint 幂等同步；撤销只删自建 Provider，不覆盖内置模型/Key（D4）。
- [ ] 密码不落盘、不进日志；`userToken` 与 `bot_` 令牌用系统安全存储，明文不落日志。

## 13.3 插件默认初始化（阶段 3）

- [ ] 全新安装首次启动后，预置插件自动加载（`ctx.slots` 可见）。
- [ ] 二次启动 seed marker 生效，不重复复制、不覆盖用户改动。
- [ ] 本机插件路由已鉴权：非本机/无 token 请求被拒（R5 验收）。
- [ ] 运行时升级后 `/root/.dsh`（或桌面等价目录）下插件保留。

## 13.4 技能支持（阶段 3，新增）

- [ ] 全新安装首启后，6 个内置技能在 `$DSH_HOME/skills/<name>/` 下可见；`skills/list` 返回 `name/description/whenToUse/path`，**无需重启**。
- [ ] `SKILL.md` 一定是最后写入；中断安装后不留下"无 SKILL.md 的完整技能"。
- [ ] 用户删除 `# dsh-go:managed` 行后重启，该技能保持用户内容不被覆盖（`userOwned`）。
- [ ] 二次启动 seed marker 生效：不重复复制、不覆盖用户改动；启动时无任何静默拒装（白名单自检通过）。
- [ ] SkillHub 搜索/详情/下载/安装全链路走 `x-bot-token` 转发端点；安装只在客户端本地生效。**且安装后正文必须落到 `$DSH_HOME/skills/<name>/`（现状只入 SQLite，DSH 发现不到，8.3），SQLite 与文件系统两侧内容一致**。
- [ ] 对含 `rm -rf`、反弹 shell、`169.254.169.254`、硬编码 `AKIA...`、`curl|sh`、声明保留密钥的恶意包，本地门禁拒绝且不落 `$DSH_HOME/skills/`，并给出明确失败文案。
- [ ] 声明 `permissions` 的 SkillHub 技能在未确认前保持禁用；确认后写入审计；运行期复扫命中可中止本轮对话。
- [ ] `load_skill` 只能读取本会话/全局启用范围内的技能（`agent/index.js:328-337` 的 `allowedSkillIds` 语义保留），越权返回 null。
- [ ] 技能与插件互不串台：技能只出现在 `skills/list`，插件只出现在 `ctx.slots` 与 `/dsh-go/v1/*`；两者的表、目录、启停开关在 UI 与数据层均分离。
- [ ] 对话框「＋」一级菜单含"技能"项，二级列出 `skills/list` 全部技能（含 6 个内置技能），显示名称与描述，`modelInvocable=false` 显示"仅手动"徽章。
- [ ] 在「＋」里勾选技能后 chip 回显、只作用于本会话；切换会话技能选择不串台；不选＝全部、不传＝跟随全局的语义与 `resolveSkills` 一致。
- [ ] 「＋」选中的技能 id 进入 `allowedSkillIds`，`load_skill` 只能读本会话选中范围内的正文；未选中技能被读取时返回 null。
- [ ] 未配对时「＋」技能区显示本地内置与已装技能，SkillHub 私有区提示"需配对"；不再出现整块 `FeatureOffline` 导致技能入口消失。

## 13.5 改名与兼容（阶段 4）

- [ ] 构建产物名、安装快捷方式、窗口标题、UA 均为 AWBotDSH。
- [ ] 旧 `~/.botbuddy` 数据可被新客户端读取（D3），**含用户已导入的技能正文**。
- [ ] 旧令牌 `bot_`/`wb_` 仍被平台识别。
- [ ] RPA `deviceType==='botbuddy'` 链路未被误改（回归 `rpa-task.service`）。
- [ ] 多语言 README 与文档无残留旧品牌（可 grep 校验）。

## 13.6 合规与版本

- [ ] 桌面端依赖树中无 AGPL 组件被误引入（license 扫描，重点 dsh-Go 代码未复制）。
- [ ] DSH 版本已锁定并记录；升级评审机制建立。
- [ ] 品牌/形象未使用 DSH Go 受保护标识（D6）。

## 13.7 本地即用与平台配对解耦（新增）

- [ ] 全新启动**不弹登录框**、不要求账号密码即可进入主界面并对话（只要有本地模型渠道）；内置插件与 6 个内置技能可用。
- [ ] 未配对时对话/技能/插件/指纹窗口/本地 RPA 全部可用；平台任务指令、RPA 领取、模型授权、SkillHub、积分显示"需配对"。
- [ ] 没配模型时提示"去配置模型渠道"（而不是"去登录"）；`chatPrecheck()` 语义保留（`main.js:783-790`）。
- [ ] 配对仍走"平台网址 + 账号 + 密码"：登录成功 → 申请 6 位码 → 网页认领 → 取 `bot_` 令牌；密码不落盘。
- [ ] 平台侧 `requestPairCode`/`pairByCode`/`pollPairCode` 三处未改动语义（除"认领置 `usedAt`"这一处修复）。
- [ ] 解绑/换号：清 `userToken` + `token` 后本地对话、模型配置、技能、指纹档案全部保留。
- [ ] 旧 BotBuddy 的 `/login` + `/pair` 流程回归通过。

## 13.8 浏览器工作台（阶段 5，新增专项）

**指纹窗口**
- [ ] 打开档案后 `spawn` 出独立内核进程（`windowsHide:false`），Electron 管理台仍可操作；每档案独立 `user-data-dir`、CDP 端口、relay 端口（`launch.js:96-98`）。
- [ ] 内核原生窗口地址栏可输入网址；本机起始页显示"AWBotDSH 指纹窗口已就绪 / 在地址栏输入网址开始"；管理台 URL 输入框可导航，`https://` 自动补全、非 http(s)/about: 被拒（`fingerprintUrl()` `:366-374`）。
- [ ] 15 行 chrome flag 与当前代码一致：seed/platform/brand/cores/timezone/languages/webrtc/canvas/audio/proxy/load-extension/CDP/window-size/CDP-origin/数据目录；**没有** `Emulation.set*` 或文档草案里的 `ua/screen/webgl_mode/extra_args` 字段。
- [ ] 同时打开上限生效（默认 20，钳制 1–100）；同一档案并发只拉一个内核；关闭后 `Browser.close` + `taskkill /T /F` 无残留进程；应用退出 8s 内完成 shutdown。
- [ ] 代理密码经旧 `fp-secret.key` 解密成功（密钥与 `fp_profiles` **必须成对迁移**）；视图只回 `hasPassword`，IPC 不传明文。
- [ ] 心跳 `caps.agent.fingerprint.windows` 只含 5 个字段（id/name/groupName/kernelVersion/lastOpenAt），**无 seed、无代理账号密码**（`fp/index.js:138-148`）。
- [ ] Agent 的 5 个 `chrome_*` 工具经 CDP 可用：`chrome_read` 截 20000 字、`chrome_click/fill` selector 转义正确、`chrome_tabs` 返回 profileId。
- [ ] 会话级 `fpProfileId` 绑定生效：A/B 两会话绑不同档案时互不串台；未绑定时按全局默认 → 最近使用兜底。

**Chrome 插件预装**
- [ ] 全新安装首启后 `chromeExt:list` 返回 **3 项** `builtin:true`：`automa` / `aipdd-enterprise` / `chrome-bridge-extension`。
- [ ] 三份 manifest 都有 `key`，扩展 ID 跨机/跨安装路径一致且与派生值吻合；RPA 能抓到 Automa 扩展页（动态抓取 + 兜底常量均验证）。
- [ ] 打开任一指纹窗口，`--load-extension` 含三个内置目录且无重复；用户档案勾选的扩展追加在后。
- [ ] **（方案 A）** 内置三扩展只从随包目录加载：`--load-extension` 中三个路径均指向 `resources/builtin-extensions/*`，`~/.awbotdsh/chrome-extensions/` 下**没有**同名副本；**（方案 B）** 若走受管副本，`--load-extension` 中同一扩展 ID 只出现一次（按 ID 去重），二次启动不重复复制；放入一个**无 marker** 的用户扩展，升级客户端后其目录与文件 hash 不变。
- [ ] 禁用某内置扩展后重启不再进入 `--load-extension`，配置持久化；重新启用恢复。
- [ ] 桥接 token 自动生成并写入扩展 `chrome.storage.local`，无需手填；`/hello → /poll → runAction → /result` 闭环通；重启桥接后旧 token 被拒。
- [ ] `agent/index.js:extraTools()` 已接入桥接的 5 个工具（不再是死代码）；同时 `fp/browser-tools.js` 的同名 CDP 工具仍能工作，两者互不覆盖。
- [ ] seed 后 `$DSH_HOME` 下**无**新增 Chrome 扩展目录；DSH 插件/技能也未进入 `--load-extension`（目录隔离断言）。
- [ ] 扩展导入回归：`zip-extract` 的绝对路径 / `..` 越界 / ZIP64 / >50MB / >2000 条目用例全部被拒。

**RPA 任务**
- [ ] 新通道 `/api/public/awbotdsh/rpa/tasks|claim|finish|release` 可用；`x-bot-token` 前缀校验生效，`awb_` 令牌领不到桌面 RPA（回归隔离）。
- [ ] `rpa-task-botbuddy.spec.ts` 全绿：`deviceType='botbuddy'`、executor `botbuddy:<hostId>`、API Key 通道拒领 botbuddy。
- [ ] 平台创建任务时：主机离线或 `fpProfileId` 不在心跳 caps 候选中 → 拒绝保存；合法任务首台领取后 `botHostId` 锁定，跨主机领不到。
- [ ] 触发契约回归：`background--workflow:execute` 消息名与 `options={checkParams:false,variables,data:{variables},tabId?}` 报文形状不变（`tools/_rpa-unit.js` 假 CDP）。
- [ ] `assertWorkflow` 拒绝无 `trigger` 区块 / 空 `drawflow.nodes` / 非 JSON；`workflowStates` 数组与对象两种形态都能读；`logs.items` 倒序 200 条 + `notBefore` 时间窗生效。
- [ ] 90s 未开始返回 failed（"没有开始执行"）、3600s 未跑完返回超时；终态回执 CAS 生效，重复回传被拒（CONFLICT）。
- [ ] 终态后调用 `release` 兜底；客户端进程被杀时由独立 scheduler 的 `sweepTimeouts` 退回 pending（不依赖 PC 通道 claim）。
- [ ] 一条坏脚本 / 一次触发失败 / 一次回传失败后，其他任务与其他服务（对话、技能、插件、心跳）继续正常；本机 CDP 只连 127.0.0.1，口令零出站。

**UI 与隔离**
- [ ] 浏览器工作台的窗口/插件/RPA 三个功能区作为 Client 插件呈现在 **DSH 官方 UI** 上（`sidebar.panellist` + `main` keyed + `sidebar.right.pane.tab`），采用官方 `ui-primitives`，非 `app.html` 原生 DOM（D10、第十部分）。
- [ ] 所有本机服务（CDP、relay、bridge）只监听 `127.0.0.1`；非本机请求被拒；bridge token 重启轮换后旧 token 失效。
- [ ] 品牌字面量全量替换（`fp/start-page.js:17,33`、RPA 面板文案、多语言 README；`app.html` 已废弃故不再计入），`botbuddy` 设备类型键与 `bot_` 令牌前缀**保留不改**。

## 13.9 界面框架沿用 DSH UI 与功能剥离（阶段 5，本轮新增专项）

**框架基线**
- [ ] 客户端 UI 为 DSH 官方 Web UI 原样呈现（会话/设置/插件页为官方组件），无 fork、无 `app.html`、无网页岛；锁定版本可在关于页查询。
- [ ] `dsh --profile desktop --dump-config` 输出含本方案 9 个插件（5 Client + 4 Host）且 order 正确；卸载任一插件后其 slot 注入随之撤销（ctx.effect 语义）。

**slot 落点**
- [ ] 五个 Client 插件分别出现在 10.1.2 表列 slot；`settings.section` 四个分区、`sidebar.panellist` 两个入口、`conversation.input.*` 的「＋」均在位。
- [ ] slot 存在性测试纳入构建：对 **single 的 `shadows-shipped-ui` slot** 断言"未占用"；对所用 `none` slot 断言"存在且基数符合"；对 `main` / `plugins.bundle.config` 断言"只新增 key、未占用既有 key"（keyed 追加口径，见 10.1.2 的例外说明）；版本升级先跑此测试。
- [ ] 官方界面零替换：会话/侧栏/设置触发点/输入框本体视觉与原生 DSH 一致。

**通信与安全**
- [ ] Client 插件不 import 任何平台协议、不持有令牌；抓包确认只有 Host 插件访问 `/api/public/**`。
- [ ] Client→Host 走 DSH 官方 RPC/HTTP（`connection`/`useRemoteAccess`），无裸 WebSocket、无渲染进程直连平台。
- [ ] 会话级技能白名单落在 `conversation.input.*`（8.6），未配对时本地 6 技能可见、平台私有技能显示"需配对"。

**数据迁移**
- [ ] 旧 `botbuddy.db` 对话正文转为 DSH `SessionEvent` 后可读、可回放；技能正文出现在 `$DSH_HOME/skills/`；指纹档案代理密码可解；扩展与 RPA 台账完整。
- [ ] 业务数据位于独立 SQLite（awbb-store），`$DSH_HOME` 内**无** BotBuddy 业务表；执行"重置运行环境"后业务数据不丢。
- [ ] 首启 seed 不覆盖无 marker 的用户目录；升级后用户插件/patch/skills 与业务数据保留。

---

## 附一：关键文件索引

| 主题 | 路径（相对 `E:/wwwroot/oem-enterprise/`） |
|---|---|
| BotBuddy 客户端 | `bot-host-client/package.json`、`src/main/{pairing.js,platform-client.js,main.js,db.js,config-store.js,plugins.js,plugin-package.js,skill-package.js,chrome-extensions.js,ws-client.js}`、`src/main/agent/{config.js,index.js,tools.js}`、`src/renderer/app.js` |
| **指纹窗口** | `bot-host-client/src/main/fp/{fingerprint.js:19-101,kernels.js:20-205,profiles.js:17-417,proxy-relay.js:19-403,index.js:12-169,start-page.js:13-87,launch.js:26-389,browser-tools.js:14-90}`、`src/main/ws-client.js:3-346`、`src/main/main.js:127-160,203-219,1395-1442,1692-1699`、`src/preload/preload.js:97-113`、`db.js:19-20,103-130,206-225`、`tools/_fp-unit.js`、`docs/指纹浏览器技术方案.md` |
| **Chrome 插件 / 桥接** | `bot-host-client/src/main/chrome-extensions.js:21-235`、`zip-extract.js:19-117`、`chrome-bridge.js:22-282`、`chrome-bridge-extension/{manifest.json,background.js:12-186,popup.js,README.md}`、`builtin-extensions/automa/manifest.json`、`extensions/aipdd-enterprise/{manifest.json,background.js,chrome-rpa.js:12-123,README.md}`、`package.json:60-69`、`src/renderer/app.html:631-650`、`app.js:1491-1515,1749-1811`、`tools/_chrome-ext-unit.js` |
| **RPA 任务** | `bot-host-client/src/main/rpa-runner.js:29-446`、`platform-client.js:310-345`、`main.js:582-584,626-690,1202-1227`、`tools/_rpa-unit.js`；平台 `backend/src/rpa/{rpa-task.service.ts,rpa-shared.ts,rpa-task-botbuddy.spec.ts,rpa-chrome.public.ts,chrome-device.service.ts,chrome-agent.service.ts}`、`backend/src/bot-host/bot-host.public.ts:406-452`、`schema.prisma:2152-2600`、`packages/contracts/src/{bot-host.ts,automation.ts:2568-2800,chrome-rpa.ts}`、`frontend/src/app/rpa/_components/{task-panel.tsx,botbuddy-browser-panel.tsx}` |
| **对话框技能选择** | `bot-host-client/src/renderer/{app.html:225-256,app.js:2095-2182,app.css:905-950}`、`bot-host-client/src/main/{chat-store.js:43-62,172-206,agent/index.js:104-142,328-339,agent/tools.js:248-262}`、`awbot-app/app/lib/ui/chat/widgets/plus_panel.dart:132-207`、`ui/features/skill_use.dart:88-112`、`ui/features/skills_page.dart:125`、`state/features_state.dart:66-76`、`app/test/plugins/seams/fixtures/slot-catalog-0.2.2-rc.1.json:15-34` |
| **DSH UI 框架（外部仓库，一手）** | `docs/architecture.md`（Desktop application / Application launch）、`docs/capability-seams.md`（能力/slot 接缝）、`docs/subsystems/slots.zh.md`（slot 系统）、`docs/cookbook/{extension-cookbook,adding-a-settings-card,adding-a-remote-api,adding-a-tool}.md`、`docs/cli-help.zh.md`（`--profile/--patch/--dump-config`、`dsh plugin`）、`apps/desktop/`、`packages/bundle/{base,web-app}/README.md`；站点 `https://deepseek-harness.github.io/deepseek-harness/` |
| **DSH slot 调研（本项目）** | `awbot-app/docs/design/{plugin-seams.md,plugin-ui-v3.md,native-plugins.md}`、`awbot-app/docs/plugins/web-panels.md`、`awbot-app/app/lib/plugins/seams/{slot_catalog.dart,seat_planner.dart}`、`awbot-app/app/test/plugins/seams/fixtures/slot-catalog-0.2.2-rc.1.json`（rc.1：109 条 + `dsh-go.panel` 合成 1 条，**仅历史对照**）、`awbot-app/app/assets/islands/recipes.json`（手机端岛配方，桌面端不采用） |
| **锁版 rc.5 官方目录（一手）** | `@deepseek-ai/dsh-cordis-client-runner@0.2.2-rc.5` 的 `src/client/slot-catalog.ts`（`CLIENT_SLOT_API` 116 条，含 `replaceRisk` 语义与 `replaceRisk` 三态定义）、`README.zh.md`（动态包"不能 import"的边界） |
| 平台对接 | `backend/src/bot-host/{bot-host.service.ts,bot-host.public.ts,bot-host.controller.ts}`、`packages/contracts/src/bot-host.ts` |
| **登录与配对改造** | `backend/src/bot-host/bot-host.public.ts:96-115,179-248`（sessionUser/signedIn/login/pair）、`bot-host.service.ts:317-390,1252-1340`（pairByCode/requestPairCode/pollPairCode；`usedAt` 只在 `:1296-1299` 写）、`schema.prisma:2995-3013`（配对码表）；客户端 `bot-host-client/src/main/pairing.js:67-187`、`awbot-app/packages/awbot_link/lib/src/api.dart:15-39`、网页认领 `frontend/src/app/agent-bot/_components/bot-host/host-panel.tsx:136-164`（`submitPair`，无分流） |
| 数据表 | `backend/prisma/schema.prisma:2812-3033`（`WorkbuddyHost*` **8 个 model**）、`migrations/0143_awbot_client_kind` |
| AWBot / DSH | `awbot-app/PROVENANCE.md`、`docs/design/plugin-seams.md`、`README.md`、`THIRD_PARTY_NOTICES.md` |
| AWBot Link | `awbot-app/packages/awbot_link/lib/src/{api,pairing,store,transport,runner,model_sync}.dart` |
| **技能资产与加载** | `awbot-app/app/assets/skills/{6 个目录}/`、`awbot-app/app/pubspec.yaml:190-195`、`awbot-app/app/lib/ui_config/ui_skill.dart`（`loadUiSkillBundle:89`、`installUiSkill:128-157`、`UiSkillAutoInstaller:181-339`、`uiSkillShellScript:373-402`） |
| **技能原生安装器** | `awbot-app/app/android/.../runtime/ManagedSkillInstaller.kt`、`awbot-app/app/ios/Runner/EngineSkills.swift`、`awbot-app/app/ohos/entry/src/main/ets/runtime/ManagedSkillCore.ets`、`docs/design/managed-skill-install.md` |
| **DSH 技能发现** | `awbot-app/docs/design/plugin-seams.md:415-418,434-438,465`、`awbot-app/packages/dsh_client/lib/src/features_api.dart:303-322,566-583` |
| **平台技能底座** | `backend/src/content/{agent-skills.service.ts,skill-generator.service.ts,agent-tool-manifest.ts}`、`backend/src/feature/{skill-security.ts,skill-review.rules.ts,skill-review.runner.ts,skill-review.service.ts}`、`backend/src/skillhub/{skillhub.client.ts,skillhub.service.ts}`、`packages/contracts/src/skillhub.ts`、`schema.prisma:3961-4006,8207-8257` |
| 手机接入方案（参照） | `docs/AWBot手机接入方案.md`（注：`awbot-app/docs/` 下**没有**同名文件，AWBot 侧文档在 `awbot-app/docs/design/*`、`docs/plugins/*`） |
| 前端设备页 | `frontend/src/app/agent-bot/_components/bot-host/*`、`app/bot/awbots/page.tsx` |
| 外部仓库 | https://github.com/deepseek-ai/deepseek-harness （MIT）、https://github.com/ccch1mneyyy/dsh-Go （AGPL-3.0） |

> 说明：外部仓库信息来自 GitHub 仓库主页、仓库内文档（`docs/architecture.md`、`docs/capability-seams.md`、`docs/subsystems/slots.zh.md`、`docs/cookbook/*`、`docs/cli-help.zh.md`）与 npm registry（`@deepseek-ai/dsh` 的 dist-tags：`latest=0.2.2-rc.1`、`next=0.2.2-rc.5`）。**此前"官方插件文档链接 404"是站点入口问题，不是文档缺失**——插件/slot 机制已有官方仓库文档，本项目的 `awbot-app/docs/design/plugin-seams.md` 是手机端一手实测补充（基线 rc.2），技能发现那条仍属转引，落地前建议对锁定版本再做一次源码核验。

---

# 附二：本稿核验修订记录（2026-11-19）

核对方式：逐条读取工作区源码（`read`/`grep`，行号以文件真实行号为准），外部事实查 npm registry 与 GitHub 仓库 API。下表只列**改掉的事实错误与自相矛盾**，不含措辞润色。

## A.1 事实性错误（会误导实现）

| # | 原稿说法 | 实际情况 | 影响 |
|---|---|---|---|
| 1 | `registerBotHostPublic(basePath, clientKind)` 两个位置参数 | 真实签名 `(app, services, deps, options)`，`basePath`/`clientKind` 在 `options` 里（`bot-host.public.ts:61-87`） | 照原稿写会直接编译不过 |
| 2 | `requestPairCode`/`pollPairCode`/`heartbeat`/`progress`/`result` "全部按 kind 参数化" | 只有 `pairByCode` 收 `clientKind`；其余靠 `hostByToken` 前缀 + `host.clientKind` 拦截 | 误判改造面 |
| 3 | `WorkbuddyHost*` 是"六表" | **8 个 model**（`schema.prisma:2812/2852/2877/2922/2939/2974/2995/3018`） | 盘点漏两张表 |
| 4 | 配对码表 `schema.prisma:2995-3015` | 实为 `:2995-3013`（3015 起是下一个 model 的注释） | 引用不准 |
| 5 | poll 成功"清 `issuedToken` + 写 `usedAt`"在 `:1316-1321` | 实为 `:1296-1299`；`:1316-1321` 是令牌前缀白名单 | 改错地方 |
| 6 | `pairByCode` 已有"认领即拒绝"语义 | 只判 `usedAt`，而 `usedAt` **只有 poll 才写**；认领（`:357-359`）不写 → **同一码可重复认领、每次新建一台 host** | 与匿名无关的真实缺陷，已写入事实 7 / 6.4.4 / R12 / 13.1 |
| 7 | 网页认领页"按 `userId` 空/非空自动分流" | `host-panel.tsx:136-164` 的 `submitPair()` 只提交 `code/name/clientKind`，**没有任何分流**，校验全在服务端 | 原方案要在此新增加功能；**现方案改为不动认领页**（不做匿名），此项随之取消 |
| 8 | "在线安装 SkillHub 技能 → 写入 `$DSH_HOME/skills/`，保持不变" | `skillhub:install` 只 `saveSkill()` 进 SQLite（`main.js:1166-1167`、`config.js:230-245`），**全仓无写 skills 目录的代码**，DSH 发现不到 | 把"必须新增的双写"写成"现状"，工作量与验收全错 |
| 9 | 9.4 结论"保留 Electron 管理台三 Tab 结构" | 与 D10/第十章"废弃 `app.html`、整体沿用 DSH UI"直接冲突 | 已改写为"DOM 仅作交互清单，界面由 Client 插件重写" |
| 10 | `main` slot 当作普通 p0Page 追加点、并声明"只用 59 个 `none`" | `main` 是 `keyed/root` 且 `replaceRisk=shadows-shipped-ui`（`slot-catalog…json:48`、`slot_catalog.dart:475`）；`plugins.bundle.config` 同理 | 与 10.7、13.9 的断言自相矛盾，已改为"keyed 新增 key 才算追加"的口径 |
| 11 | `sidebar.right.pane.tab` 是 `list/root` | 实为 **keyed/session** | 落点实现方式不同 |
| 12 | 只用 `0.2.2-rc.5` 锁版、同时用 rc.1 的 109 条目录自检 | npm `next=rc.5`（`latest` 仍是 rc.1）；rc.5 官方目录 **116 条**（53 shadows / 60 none / 3 wraps），rc.1 为 109 条（50/59），且 rc.5 新增 `hoc` 基数与 `wraps-owner-content` 风险类 | 已定锁 rc.5，全部落点与自检改用 rc.5 的 116 条（阶段 0、10.1.2、R1、R19） |
| 13 | AWBot"依据 0.2.1-rc.2 构建" | 那是调研基线；AWBot 现内置引擎是 **0.2.2-rc.1**（`changelog.md:85`、`official-parity.md:3`） | 版本认知落后两代 |
| 14 | `dsh-web.patch.yml` 属 `$DSH_HOME` 保留项 | 它在 `/etc/dsh-app/`，**每次升级被重写**（`plugin-seams.md:212,436`） | 预置插件写这里会被覆盖 |
| 15 | 安全洞引用 `plugin-seams.md:19` | 实为 **`:17`**（`:19` 是"现状事实"小标题） | 引用错位 |
| 16 | 把"免登录账号同步（设备授权码）"当成核心改造 | 需求已澄清：**保留"网址+账号+密码 → 6 位码"的配对方式**，只是 **Agent 不依赖配对**。现状代码本就这样（`chatPrecheck()` 只查模型渠道，`main.js:783-790`；`chat:send` 不看配对，`:1534-1566`） | 6.4 整节重写为"本地模型即用 + 配对解耦"；匿名方案降为 P3，平台侧**零新增路由/零改表** |

## A.2 计数与体积

| 项 | 原稿 | 实际 |
|---|---|---|
| `backend/src/rpa/` 文件数 | 28 | **26**（均一级目录） |
| Automa 内置扩展体积 | 4.8MB | **8.3MB**（82 文件） |
| `extensions/aipdd-enterprise` 体积 | 259KB | **约 412KB / 20 文件** |
| `awbot-app/examples/plugins` | 10 个 | **11 个** |
| preload 的 `fp:*` 通道 | 14 个（`:97-113`） | **15 个**（`:97-111`） |
| 指纹 flag 类数 | "13 类"（表里却 15 行） | 以表为准，统一为 **15 行** |
| slot 目录基线 | 109 条 / 50 shadows / 59 none（rc.1） | **116 条 / 53 shadows / 60 none / 3 wraps-owner-content**（rc.5；基数 single 45、list 44、keyed 20、chain 4、hoc 3） |

## A.3 行号订正（其余）

- `bot-host.public.ts`：SkillHub 转发 `:330-388`/`:335-388` → **`:335-398`**（下载包路由到 398）；RPA 文案 `:268,401,426,446` → **`:401-404,422,433,443`**。
- `bot-host.service.ts`：`requestPairCode` → `:1252-1269`；`hostByToken` 失效语义 → `:1311-1342`（禁停+清 hash `:1325-1334`）。
- `packages/contracts/src/bot-host.ts`：`BotHost_pair` → `:424-432`。
- `pairing.js`：locked 判断 → `:72-79`。
- `api.dart`：`requestPairCode` → `:31-35`、`pollPairCode` → `:38-39`、`heartbeat` → `:42-53`。
- `fingerprint.js`：Canvas 条件行 `:60` → 实为 `:61`（音频 `:62`，合并 push `:63`）。
- `ws-client.js`：`getJson` `:228`、`/json/list` `:253`、`/json/version` `:260`（原稿 `:228-250` 是通用 `getJson`）。
- `proxy-relay.js`：`proxyCredentials` → `:347-359`。
- `rpa-task.service.ts`：`requireBotBuddyTarget` → `:1465-1519`。
- `db.js`：`plugins` 表 → `:93-102`；`agent/tools.js` 的 `load_skill` → `:248-262`。
- `slot-catalog-0.2.2-rc.1.json`：`plugins.detail.section` → `:55`。
- 附录：删除不存在的 `awbot-app/docs/AWBot手机接入方案.md`；`web-panels.md` 改指 `awbot-app/docs/plugins/web-panels.md`。

## A.4 新增的约束与待办（原稿缺失）

1. **配对码一次性**：认领即置 `usedAt`（或唯一约束/CAS），第二次认领返回 CONFLICT（R12、6.4.4）——对现有"网址+账号+密码"流程同样成立。
2. **技能双写**：SkillHub 安装必须同时落 `$DSH_HOME/skills/<name>/` 与 SQLite，并校验一致（8.3、13.4）。
3. **锁版=锁目录**：目标版本决定 slot 目录；rc.5 的 `wraps-owner-content` 是新一类风险，需单独评估（阶段 0、R1、R19）。
4. **keyed 例外口径**：`main` / `plugins.bundle.config` 只允许新增 key（10.1.2、10.7、13.9）。
5. **不要只靠 basePath 区分新旧端**：它不落库，需要显式字段（D1、D8）。
6. **官方文档即仓库文档**：`docs/capability-seams.md`、`docs/subsystems/slots.zh.md`、`docs/cookbook/*`、`docs/cli-help.zh.md`；插件装配优先用 `dsh plugin --profile desktop add` / `--patch` / `--dump-config`（7.3、附录）。
7. **品牌改名补齐**：`main.js:469`（渠道前缀）、`main.js:1163`（skill 临时目录）、`tools/_db-unit.js`、`tools/_pipeline-unit.js` 的断言（11.1）；`rpa-runner.js:340` 不是 UA，别误改。
8. **`ws-client.js` 未强制回环**：只拒非 `ws:` 协议，迁移时补 host 校验（9.1.4）。
9. **内置扩展不要 seed 复制**：`launch.js:109-115` 按路径去重，复制进受管目录会造成同一扩展 ID 两条 `--load-extension` 路径；默认走"随包资源 + 启用开关"，确需复制时按 ID 去重（9.2.3、R14）。
10. **基线切到 rc.5**：把 rc.5 的 116 条目录固化进仓库（作为 slot 存在性测试的输入），rc.1 的 fixture 降级为历史对照；`hoc`/`wraps-owner-content` 三条本期不用，但测试要断言"未注册"。
11. **Agent 与配对解耦**：首启不弹登录、未配对不起心跳、平台入口只显示"需配对"；`chatPrecheck()` 的"只查模型渠道"语义原样搬到 DSH 侧（6.4、13.7）。

## A.5 仍需在实现前拍板/核验（本稿无法定论）

- ~~DSH 目标版本~~ **已定：`0.2.2-rc.5`**（最新版，本机安装版同版本）；待办是把它的 116 条目录固化进仓库并接入构建期 slot 存在性测试。
- `plugin-seams.md:415-418` 的技能发现语义（rank 400、跳过 `.system`）仍是转引，需在 rc.5 上用源码或实测确认。
- `apps/desktop` 的打包/签名/更新链细节（官方 README 未逐一核对）。
- ~~平台侧匿名端点最终形态~~ **不需要**：配对沿用 `/login` + `/pair` + `/pair/poll`，平台侧只加通道与文案；原"设备授权码"整节降为 P3 备选（触发条件与工作量见 6.4.5）。
