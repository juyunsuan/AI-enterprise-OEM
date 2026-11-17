# Agent 群控（替换「插件」页签）产品设计方案

> 状态：评审稿 v2（2026-11-16 按评审决议修订：插件彻底下线、定时任务纳入群控、Agent 拆单派发、设备完成主动站内通知、手机文件维持文本摘要）。
> 关联文档：`docs/Agent-Bot方案.md`、`docs/Mobot手机接入方案.md`、`docs/Agent编排与插件能力契约方案.md`

---

## 1. 背景与目标

### 1.1 背景

- Agent 板块现有 9 个页签：对话 / 定时任务 / 助理 / 数字分身 / 技能 / **插件** / 专家 / MCP连接器 / 工作流。
- 「插件」页签承载的是 SkillHub 插件中心 + 账号自有 zip 插件包（AI 审查、权限确认、`run_plugin_command` 执行），本质是"给模型注入一段命令文档"，与技能页签能力重叠、使用率低。
- 平台已经建成 BotBuddy（主机）与 Mobot（手机）两条设备通道：配对、心跳、在线状态、指令下发（prompt 类）、执行进度/结果回传、模型授权、设备侧定时任务，全部可用（`backend/src/bot-host/`，四张表 `workbuddy_hosts / workbuddy_host_command / workbuddy_host_schedule / workbuddy_host_model_grant`）。
- 但这两条通道目前只有"设备台账"视角（/bot、/bot/mobots 页面），**Agent 对话里不能指挥它们**——用户想让 Agent 把活分给某台电脑或某部手机，只能自己到设备页面手动下指令。

### 1.2 目标

1. 下线 Agent 内的「插件」功能，页签替换为「**Agent 群控**」。
2. 把"指挥 BotBuddy 主机 + Mobot 手机"做成 Agent 的一项**特殊能力**：Agent 能读取当前设备连接状况，分析任务适合派给谁，经确认后把任务分配下去；普通任务和定时任务都支持。（**v2 · 决议 D6 追加第三条通道**：WorkBuddy 企业云账号也是群控目标，见 §4.7 与 §9 M7。）
3. Agent 对话输入框「+」里增加「**Agent 群控任务**」入口：勾选 BotBuddy / Mobot /（v2 起）WorkBuddy 企业云，任意组合，本轮对话即进入群控协作模式，以互动方式完成"分析 → 匹配 → 拆单派发 → 回报结果"。定时任务编辑器同步支持，站内 Agent 定时任务到点可自动分析并派单。
4. 设备任务完成/失败通过**站内通知主动告知**用户（不回写 Agent 会话）；多设备协作由 Agent 拆成多条派单逐台下发。

### 1.3 非目标

- 不改变 BotBuddy / Mobot 客户端与设备通道协议（配对、心跳、指令领取、回执机制原样复用）。
- 不做跨用户共享设备（群控范围始终是**当前登录账号自己名下的设备**）。
- 一期不做设备端并行执行调度优化（沿用现有单机串行队列 + 待执行上限 50 条）。
- 不新增硬件/机器人通道，也不把云账号伪装成设备："群控"覆盖现有的主机（`DESKTOP`）、手机（`MOBOT`）与 WorkBuddy 企业云账号（`WORKBUDDY`，v2 后由决议 D6 纳入，见 §4.7）三类目标。

---

## 2. 现状盘点（改造依据）

### 2.1 Agent 插件功能涉及面（下线清单）

| 层 | 位置 | 内容 |
|---|---|---|
| 前端页签 | [frontend/src/app/agent/page.tsx:69](file:///E:/wwwroot/oem-enterprise/frontend/src/app/agent/page.tsx#L69) | `plugins` 页签 → `AgentPluginsTab` |
| 前端组件 | [plugins-tab.tsx](file:///E:/wwwroot/oem-enterprise/frontend/src/app/agent/_components/plugins-tab.tsx)、[plugin-center-tab.tsx](file:///E:/wwwroot/oem-enterprise/frontend/src/app/agent/_components/plugin-center-tab.tsx) | 我的插件 / SkillHub 插件中心 |
| 对话「+」 | [chat-panel.tsx:272](file:///E:/wwwroot/oem-enterprise/frontend/src/app/agent/_components/chat-panel.tsx#L272) | "选择插件"面板、`pluginIds` 随消息发送 |
| 定时任务「+」 | [instruction-composer.tsx:150](file:///E:/wwwroot/oem-enterprise/frontend/src/app/agent/_components/instruction-composer.tsx#L150) | "选择插件"复选、标签展示、`pluginIds` 落任务配置 |
| 后端服务 | [agent-plugins.service.ts](file:///E:/wwwroot/oem-enterprise/backend/src/content/agent-plugins.service.ts) | 插件 CRUD、zip 导入、AI 审查、权限确认 |
| Agent 工具 | `agent-tools.ts` 的 `run_plugin_command`；`agent-tool-manifest.ts` 的 `plugin` 工具类别 | 模型执行插件命令 |
| 契约/表 | `ContentAgentPlugin`（contracts）、`content_agent_plugin`（prisma）、`docs/api/openapi.json` | 接口与类型 |
| 关联入口 | SkillHub 安装插件跳转、`backend/src/skillhub/skillhub.service.ts` 导入插件路径 | 联动改动 |

**处理决议（D1 · 已拍板：彻底下线）**：一期即物理清理，不做软下线。完整清单：

| 动作 | 位置 |
|---|---|
| 删除组件 | `plugins-tab.tsx`、`plugin-center-tab.tsx`；`page.tsx` 摘除 `plugins` 页签与深链 key |
| 对话「+」 | `chat-panel.tsx` 移除"选择插件"面板、`pluginIds` 状态与随消息发送 |
| 定时任务「+」 | `instruction-composer.tsx` 移除插件行、`pluginIds` 属性与标签渲染（改为群控入口，见 §4.5） |
| 后端服务 | 删除 `agent-plugins.service.ts` 及其 spec、`content.controller.ts` 插件路由（列表/上传/启停/删除）、`agent-tools-plugin-command.spec.ts` |
| Agent 工具 | `agent-tools.ts` 删 `run_plugin_command`；`agent-tool-manifest.ts` 删 `plugin` 类别与写入白名单条目；`agent.service.ts` composeTurn 停注插件提示与 pluginIds |
| 定时任务链路 | `agent-schedule.service.ts` 任务配置不再接受/存储 pluginIds |
| SkillHub | `skillhub.service.ts` 移除"安装为插件"路径（技能安装保留）；前端 SkillHub 页签文案同步 |
| 契约 | 删除 `ContentAgentPlugin`、`SkillHubPlugin*` 插件相关类型与端点；重生成 `docs/api/openapi.json` |
| 数据库 | migrate deploy 删除 `content_agent_plugin` 表（含附件与审查记录，不可逆，随发布说明归档） |
| API 层 | `frontend/src/api/content.ts` 删 `plugins/togglePlugin/removePlugin/importPluginPackage` |

**代价提示**：用户已上传的插件包与 AI 审查记录将永久丢失；技能页签（zip + SKILL.md）是官方迁移路径，发布说明里给出"插件包改传技能包"的指引。

### 2.2 BotBuddy / Mobot 可复用能力

| 能力 | 现状 | 群控如何利用 |
|---|---|---|
| 设备台账 | `workbuddy_hosts`，`clientKind = DESKTOP / MOBOT`，platform win/mac/android/ios | 群控成员即本账号设备，按 `clientKind` 分两组 |
| 在线状态 | `botHostOnline()`：心跳 5s、30s 超时离线；状态 ONLINE/OFFLINE/NEVER/DISABLED | Agent 派单前必看；离线设备只排队不推荐 |
| 指令下发 | `workbuddy_host_command`（kind=prompt/schedule，payload={instruction,cwd,timeoutSec}，状态机 PENDING→DISPATCHED→DONE/FAILED/TIMEOUT/CANCELED） | 群控任务落为指令记录，天然复用幂等回执与进度回传 |
| 队列 | 单机待执行上限 50（`BOT_PENDING_QUEUE_LIMIT`） | Agent 分析"派给谁"时的负载依据 |
| 设备定时任务 | `workbuddy_host_schedule`（once/scheduled/recurring），调度器 60s tick，`advanceDue()` 到点生成指令 | 群控定时任务直接复用此表与调度器 |
| 工作区 | DESKTOP 客户端上报可用工作区（cwd）；MOBOT 不管理工作区 | 主机任务可指定工作目录；手机任务不出现 cwd 选项 |
| 模型授权 | `workbuddy_host_model_grant`，随心跳下发渠道 | 群控面板展示每台设备的模型来源，离线/未授权时给引导 |
| 设备对话框 | /bot、/bot/mobots 已有"对话"页签（会话消息流） | 群控任务详情可直接跳转对应设备会话查看过程 |

结论：**指令通道、定时通道、状态通道全都在**，缺的只是"Agent 侧的工具 + 页面 + 交互"。改造集中在 `agent-tools`（新增群控工具）、`bot-host`（新增给 Agent 用的受控派单/查单方法）和前端（新页签 + 对话「+」入口）。

---

## 3. 产品形态总览

```
Agent 页签：对话 | 定时任务 | 助理 | 数字分身 | 技能 | Agent群控(新) | 专家 | MCP连接器 | 工作流

Agent群控页签
├─ 群控任务台账（Agent 派发的任务：来源会话、目标 主机/手机/企云、类型 普通/定时、状态、结果摘要）
└─ 目标清单不在此页签（几百台设备会把台账挤没，见 4.1.1，统一在 Agent-Bot → 主机 / 手机 / 企云账号）

对话「+」→「Agent 群控任务」
├─ 勾选范围：□ BotBuddy 主机  □ Mobot 手机  □ WorkBuddy 企业云（可同时勾）
├─ 勾选后输入框上方出现标签「群控：主机+手机+企云」，可移除
└─ 本轮消息携带 dispatchScope，Agent 注入群控工具并按群控协作提示词作答
```

一句话定位：**「插件」是"给模型一份说明书"，「群控」是"给模型一队干活的设备"。**

---

## 4. 功能设计

### 4.1 Agent 群控页签（界面侧）

#### 4.1.1 设备总览（改到 Agent-Bot，不进群控页签）

- **决议（2026-11-17 开发中调整）**：设备清单不在「Agent群控」页签里渲染。一个账号可能挂几百台设备，卡片栅格会把整屏挤满，页签里的台账就没法用了。
- 设备视角的字段（设备名、平台、在线/离线/已禁用 + 最后心跳、待执行队列数、模型授权来源、Mobot 电量与网络、工作区）全部留在 **Agent-Bot → BotBuddy 主机 / MoBot 手机 → 设备**页签的表格里，那里已有分页与逐行操作（配对、令牌、停用、模型授权、进对话），不重复做一份。
- 群控页签只在需要时按行给出设备入口：台账行的「设备」列直接跳该设备的对话框；面板右上角给一个「设备清单在 Agent-Bot」的链接。
- 设备数据仍由 `/enterprise/agent-dispatch/devices` 供 Agent 侧工具（`list_dispatch_devices`）与后续 scope 选择器使用，只是页签不做首屏全量拉取。

#### 4.1.2 群控任务列表

- 展示所有**由 Agent 发起**的派单（区别于设备页面里用户手动下的指令）：任务标题、派单来源（Agent 会话链接）、目标设备（名称 + 类型徽标）、任务类型（普通 / 定时）、状态（排队中/执行中/完成/失败/超时/已取消）、创建时间、结果摘要。
- 定时任务在列表中可暂停/恢复（复用 `workbuddy_host_schedule` 的 enabled/paused）。
- 状态流转复用指令表既有状态机，前端轮询刷新（沿用设备页面现有做法）。

#### 4.1.3 与设备页面的关系

- /bot、/bot/mobots 页面保留不动——它们是"设备管理"视角（配对、令牌、模型授权、工作区、单设备指令历史），也是唯一的设备清单入口。
- 「Agent 群控」页签是"任务调度"视角：只放派单台账，不复制设备清单，也不做设备管理；需要看设备或管设备就跳 Agent-Bot。

### 4.2 Agent 的群控工具（能力侧）

给 Agent 新增一组内置工具（进 `agent-tools.ts` + `agent-tool-manifest.ts`，权限口径"写操作：落库派单"）：

| 工具 | 读写 | 参数 | 行为 |
|---|---|---|---|
| `list_dispatch_devices` | 读 | `kind?: 'DESKTOP' \| 'MOBOT' \| 'WORKBUDDY'`（受本轮 scope 约束） | 返回可派目标清单：id、名称、类型、平台、在线状态、待执行数、是否禁用；Mobot 含电量/网络；企云含凭据状态与可用 Agent 清单。这是 Agent 分析的前提。 |
| `dispatch_device_task` | 写 | `hostId`、`instruction`、`cwd?`（仅主机）、`timeoutSec?`、`title?`、`agentId?`/`versionId?`（仅企云）、`conversationRef` | 向指定目标派发一条普通任务：主机/手机走 bot-host 既有建指令链路（PENDING，等心跳领取），企云走 `WorkbuddyCloudService.sendCommand`（同步建会话并推指令）。设备离线也允许派发（排队语义），但 Agent 应先提示；企云没有队列，账号停用即失败。返回 commandCode 供跟踪。 |
| `create_device_schedule` | 写 | `hostId`、`title`、`instruction`、`scheduleType`（once/scheduled/recurring）、`scheduleConfig`、`cwd?`、`agentId?`/`versionId?` | 创建目标侧定时任务：主机/手机复用 `workbuddy_host_schedule` 与其调度器，企云复用 `workbuddy_cloud_schedule`（到点自动生成云端指令）。 |
| `list_dispatch_tasks` | 读 | `commandCode?` / `hostId?` / 最近 N 条 | 查询已派发任务的状态与结果摘要（四个源都在内），供 Agent 回答"刚才那个活干完没"。云端指令先补一次同步再返回，避免模型拿到过期状态。 |
| `cancel_dispatch_task` | 写 | `commandCode` | 主机/手机：仅 PENDING 真取消，已被领取的只下发取消请求不强杀。企云：只有尚未推出的 PENDING 能取消；已下发的**中止不了腾讯云侧会话**，须在用户确认后"停止跟踪"置 CANCELED 并如实说明（见 §4.7）。 |

**实现要点**：工具不直连数据库写指令，而是调用 `BotHostService` / `WorkbuddyCloudService` 的受控方法（复用其校验：归属复权、队列上限 50、指令长度 4000、启用状态、`clientKind` 与 scope 匹配），保证与界面手动派单同一套安全口径。用户身份取当前会话的 `CurrentUser`，Agent 只能操作本人目标。

**拆单派发（决议 3）**：不提供"一次派单、多机认领"的原子群发接口。多设备协作一律由 Agent 把任务拆解后逐台调用 `dispatch_device_task` / `create_device_schedule`（一次会话轮次内多次调用），每台一条独立指令、独立 commandCode；个别设备派发失败不回滚已成功项，Agent 按设备逐条回报成败与原因。

**系统提示注入**：当消息携带 `dispatchScope` 时，`composeTurn` 在系统提示里追加"群控协作段"：说明可用设备类型、派单流程规范（先查设备 → 给分配方案 → 用户确认 → 派单 → 报 commandCode 与查看入口）、主机/手机的能力差异（见 4.3）。未勾选群控时，这组工具不注入，模型无感知。

### 4.3 任务分配的分析逻辑（产品口径，落到提示词 + 工具返回）

Agent 拿到一组任务后，按以下维度思考"谁能干什么"：

1. **类型匹配（硬约束）**
   - 需要桌面软件、本地文件、浏览器自动化、IDE/命令行 → BotBuddy 主机；主机的 cwd 决定在哪个工作区干活。
   - 需要 APP 操作、短信/验证码、拍照/定位、移动端账号（微信/App 运营类）→ Mobot 手机。
   - 需要企业侧既有 Agent（腾讯云 WorkBuddy 上已编排好的数字员工 / 专家版本）、或不落用户本机、纯服务端跑的一轮活 → WorkBuddy 企业云；选它就得指定该账号下的 Agent（省略时按最近用过的回落）。
   - 模棱两可 → 给出两种方案让用户选。
2. **在线与负载（优先级）**
   - 在线且队列空闲 ＞ 在线但有积压（提示预计等待）＞ 离线（说明"可派发排队，设备上线后自动执行"，需用户确认）＞ 已禁用（不可选，提示启用入口）。企云不看在线，看凭据状态：`active` 可派，停用 / 校验失败直接不可选。
   - 多台同类在线 → 优先负载低者；可并行拆分时把子任务分给多台（"群控"的核心卖点）。
3. **能力细节**
   - 手机：电量 <15% 或非 Wi-Fi 时提示风险；模型授权来源为"客户端同步"时说明用的什么模型。
   - 主机：无工作区上报时不派需要指定目录的任务。
   - 企云：算力与模型都在腾讯云账号侧，本站不计积分；一轮结果要靠平台轮询 A2A 才回写，进度粒度比客户端流式回传粗。
4. **普通 vs 定时**
   - 用户表达"每天/每周一/到点…"→ `create_device_schedule`；一次性 → `dispatch_device_task`。
   - 定时任务同样受类型与在线约束；Agent 应提醒"执行时刻设备需在线，否则会排队顺延"。

**互动流程（对话内）**：

```
用户（已勾选 主机+手机）：帮我把这 10 条小红书评论回复了，再把昨天的报表导出成 Excel
Agent：分析 → 
  · 回复评论是手机 App 操作 → 建议派给在线的 Mobot「Pixel-7」（队列 0）
  · 导出报表需要本机 Excel → 建议派给在线的 BotBuddy「办公机 win」（工作区 D:\report）
  分配方案如上，确认派发吗？
用户：确认，评论那条改成每天晚上 9 点跑
Agent：✓ Mobot 定时任务已创建（每天 21:00，任务码 wb…）；✓ 报表已派发（指令码 wb…，可在 Agent群控 页签看结果）
```

派单结果消息回写会话：任务完成/失败时，设备回传的 result 由现有会话机制进入该设备对话；Agent 侧在群控任务列表可见，且用户可在原对话里问进度（`list_dispatch_tasks`）。

### 4.4 任务完成主动通知（决议 4）

设备执行终态时**主动告知用户**，但**不回写 Agent 会话**（用户问进度时 Agent 再用 `list_dispatch_tasks` 查询）。

- **触发点（实现口径）**：`BotHostService.announceTerminal()` 在指令进入终态时调用，覆盖两条收口路径——客户端 `/result` 回执（DONE / FAILED）与 `sweepTimeouts()` 的超时收口（TIMEOUT，主机领走不回话）。`CANCELED` 不发：无论平台取消还是客户端回执折成取消，都是用户自己按下的动作，已知结果再发一条只是噪音。
- **通知范围**：
  - `source='AGENT'` 的群控任务 → 必通知；
  - 设备侧定时任务生成的指令（`kind='schedule'`）→ 必通知（用户不在场，最需要告知）；
  - 用户在设备页面手动下的 UI 指令 → 不通知（用户已在盯结果，避免打扰）。
  判定就一条：`source==='AGENT' || kind==='schedule'`，其余全沉默。
- **载体**：复用平台站内信 `notifications` 表，category 取 `bot`（标签「群控任务」，M7 起三条通道共用这一类，铃铛色 `#d48806`）；level 按结果取 info/error；标题「群控任务已完成 / 执行失败 / 超时未回传：{任务标题}」；正文两行——`{设备名} · {普通任务|定时任务}` + `指令码 {commandCode}｜{摘要}`；`link` 跳 `/agent?tab=dispatch`，`entityType='host_command'`、`entityId=commandCode`。前端铃铛与 /notifications 按现有渲染零改动即可显示，点击标记已读并跳转。
- **失败也通知**：FAILED/TIMEOUT 用 error 级，正文带失败原因与「核对设备在线后重新派单」的指引。
- **边界**：站内信只是旁路提醒——出口用 `services.ts` 晚装配（通知服务比 `BotHostService` 构造更晚，同 `deliverableSink` 那条装配口径），没接上时静默跳过，落库抛错也只吞异常，绝不影响设备回执；正文只取平台侧已有文本且取设备输出的首行，命中形如本地路径的片段替换为「（本地路径已隐藏）」，设备完整输出仍只在设备对话里看；Mobot 手机同口径。

### 4.5 对话「+」：Agent 群控任务入口

- 「+」浮层新增一行「**Agent 群控任务**」（图标 `ClusterOutlined` 类），右侧显示当前选择（未选 / 主机 / 手机 / 企云及其组合）。
- 二级面板三个复选：**BotBuddy 主机**、**Mobot 手机**、**WorkBuddy 企业云**（第三项由决议 D6 加入）；可同时勾选；一个都不勾 = 退出群控模式。
- 选中后输入框上方出现可关闭标签，如「群控：主机 + 手机」。
- **会话级记忆**：同一会话内沿用上次选择，换会话回到未选；新任务默认未选。实现为前端 `Map<conversationId, scope>`（`chat-panel.tsx` 的 `scopeMemoryRef`）+ 切换会话时按 id 回填，不写后端；发消息前那轮的实际范围仍以消息体 `dispatchScope` 为准。
- 发送消息时携带 `dispatchScope: Array<'DESKTOP' | 'MOBOT' | 'WORKBUDDY'>`，后端按 4.2 注入工具与提示词。
- 「+」里现有"选择插件"入口随 D1 彻底删除。
- **Agent 定时任务编辑器同样加群控入口（决议 2 · 丰富功能）**：`instruction-composer.tsx`（定时任务"每次执行的指令"输入区）的「+」把"选择插件"替换为「Agent 群控任务」，勾选范围随任务配置持久化（`content_agent_schedules.dispatch_scope` 列，见 §5 第 4 条）。到点执行时该轮 Agent 对话携带 scope、注入群控工具——即"**站内 Agent 定时任务到点自动分析并派单给设备**"：例如每周一 9 点的定时任务，Agent 醒来后检查哪台主机/手机在线，把本周任务拆单派发下去。设备离线则按排队语义处理并在任务执行记录中说明。执行记录抽屉在任务带范围时给一行"这一轮开启群控（…）"和「看派单去向」跳转，避免用户以为到点只是聊了一句。

### 4.6 定时任务口径澄清

系统里有两个"定时任务"，数据与调度各自独立；决议 2 后新增两者的**编排关系**（站内任务到点指挥设备，而非互相转换）：

| | Agent 定时任务（现有） | 设备定时任务（群控创建） |
|---|---|---|
| 到点谁执行 | 站内 Agent（模型 + 技能 + 连接器）；若配置了 `dispatchScope`，Agent 醒来后分析设备并拆单派发给 BotBuddy/Mobot | BotBuddy 主机 / Mobot 手机上的客户端直接执行固定指令 |
| 数据表 | `agent_schedule` 系 | `workbuddy_host_schedule` |
| 页面 | Agent「定时任务」页签 | /bot、/bot/mobots 的定时页签 + 群控任务列表（只读汇总） |
| 适用场景 | 需要"思考后分工"的周期活（每周内容分发、巡检类） | 指令固定、无需分析的周期活（每天 21:00 回评） |

Agent 在对话里可替用户创建**设备定时任务**（`create_device_schedule`）；站内 Agent 定时任务的 `dispatchScope` 只能由用户在编辑器勾选，Agent 不自行给自身定时任务加群控。

### 4.7 WorkBuddy 企业云也是群控目标（M7 · 决议 D6）

一期把群控口径写成了"BotBuddy 主机 + Mobot 手机"，但「Agent-Bot」里第三条执行通道——**WorkBuddy 企业云账号**（`workbuddy_accounts` + `/enterprise/workbuddy/**`）——与设备的角色完全一样：一条能干活、有归属、有凭据的通道。因此群控的目标类型扩到三类，且**不把云账号塞进设备表**（`workbuddy_hosts` 的口径是"有 `bot_`/`mb_` 令牌、靠心跳领指令的机器"，云账号没有令牌也不会心跳，硬塞会让配对、在线判定、令牌重置全都长出分支）。

| | BotBuddy 主机 | Mobot 手机 | WorkBuddy 企业云 |
|---|---|---|---|
| 目标类型 | `DESKTOP` | `MOBOT` | `WORKBUDDY` |
| 一条目标 | 一台机器 | 一台手机 | **一个企业账号**，具体算力是账号下的某个 **Agent + 版本** |
| 领取方式 | 出站心跳排队领取 | 出站心跳排队领取 | 平台同步调腾讯云（建会话 → 推指令），**没有队列** |
| 离线怎么办 | 照常排队，上线领取 | 照常排队 | 没有"离线"；凭据停用 / 校验失败＝直接派单失败 |
| 进度来源 | 客户端流式回传 | 客户端流式回传 | 平台轮询 A2A 任务态 + 消息事件（原来只有前端打开对话时才轮询） |
| 取消 | PENDING 可撤；已跑的请求客户端在下次回传时中断 | 同左 | 已下发的会话平台**中止不了**，只能停止跟踪并如实说明 |
| 算力与计费 | 设备侧授权渠道 | 设备侧授权渠道 | 用户自己的腾讯云账号，**不经本站模型网关、不计积分** |

口径：

1. **目标类型三元**：契约新增 `BOT_DISPATCH_TARGET_KINDS = ["DESKTOP","MOBOT","WORKBUDDY"]`（`WORKBUDDY` 沿用 `AI_CALL_PRINCIPAL_KINDS` 已有的命名），群控范围 `dispatchScope`、`/agent-dispatch/devices` 的 `kind`、台账行 `clientKind` 都用它；`BOT_CLIENT_KINDS` 保持两值，仍只描述 `workbuddy_hosts.client_kind`。
2. **Agent 选择**：`list_dispatch_devices` 对企云返回账号 + 该账号可用 Agent 摘要（`agents[{agentId,versionId,name}]`，进程内 60 秒 TTL 缓存，取不到就返回空并写明失败原因，不编数据）。`dispatch_device_task` / `create_device_schedule` 的 `agent_id`/`version_id` 可省略，省略时按"该账号最近一轮用过的 Agent → 列表第一个"回落；一个都没有则拒绝并给「Agent-Bot → 企云账号」入口。
3. **台账四源合并**：主机指令、主机定时、云端指令、云端定时四类行归一成同一个 `BotDispatchTask`；`clientKind='WORKBUDDY'` 即存储路由键（主机表永远取不到这个值），详情 / 取消 / 暂停按它分派。前端行 key 改 `${type}-${clientKind}-${id}`。
4. **进度与终态要平台自己追**：给 `WorkbuddyCloudScheduler` 每 tick 加一轮扫描（非终态、`source='AGENT'` 或 `kind='schedule'`、按最久未更新排序、每轮限量），复用既有 `syncOne` 补 A2A 状态；落终态后走与主机**同一个**站内信出口（分类「群控任务」、`link=/agent?tab=dispatch`、`entityType='cloud_command'`），超时同样按超时口径发信。用户不开着对话页也能等到通知。
5. **派单来源与会话回溯**：`workbuddy_cloud_commands` / `workbuddy_cloud_schedules` 加 `source` + `agent_conversation_id` 两列（迁移 `0115_cloud_dispatch_source`），与主机侧 §5 第 1–2 条同构。
6. **范围入口**：对话「+」与定时任务「+」的群控范围由两项变三项（主机 / 手机 / 企业云）；台账"设备"列与行内跳转按类型分别去 `/agent-bot?tab=bots|mobot|cloud`。

---

## 5. 数据模型改动

原则：设备、指令两表主体零改动；只给指令/设备定时表加"派单来源标记"和"会话关联"，给站内 Agent 定时任务加一列群控范围，并删除插件表。

1. **`workbuddy_host_command` 加两列**（migrate deploy）：
   - `source`：`'UI' | 'AGENT'`（默认 UI），区分手动指令与群控派单；
   - `agentConversationId`：可空 int，Agent 派单时回写，用于"来源会话"跳转与列表过滤。
2. **`workbuddy_host_schedule` 加同样两列**：`source`、`agentConversationId`。
3. 会话消息**不加 `dispatchScope` 列**（实现时核对：`ContentAgentMessage` 没有 meta JSON 字段，为它单开一列不值）。范围只在"这一轮"生效，靠两条既有链路回溯：本轮派出的指令带 `source='AGENT'` + `agentConversationId`，从设备台账就能反查发起会话；定时任务侧则把范围固化在任务上（下条）。
4. Agent 定时任务的 `dispatchScope` **加专用列**：`content_agent_schedules.dispatch_scope JSON NOT NULL`（迁移 `0114_agent_schedule_dispatch_scope`，先例是 `0009_schedule_plugins`；Prisma 为 `dispatchScope Json @default("[]") @map("dispatch_scope")`）。没塞进 `schedule_config` 是因为配置 JSON 的形态随 scheduleType 变化（once/scheduled/recurring 各自字段），混进业务范围会让编辑器与调度器都要猜形状。读写一律经 `parseDispatchScope` 归一（大小写/去重/非法值丢弃），空数组＝不开群控。
5. **删除 `content_agent_plugin` 表**（D1 彻底下线，migrate deploy 随附回滚说明；发布前对表做一次备份导出）。
6. 完成通知复用 `notifications` 表：新增 category 取值 `bot`（列为 VarChar，无 schema 改动），`entityType='host_command'`、`entityId=commandCode` 供跳转与去重。
7. **（M7 · 决议 D6）企云两表加派单来源标记**：`workbuddy_cloud_commands` 与 `workbuddy_cloud_schedules` 各加 `source varchar(16) default 'UI'` 与 `agent_conversation_id int default 0`（迁移 `0115_cloud_dispatch_source`），与第 1–2 条主机侧同构。云端指令的 `entityType` 用 `cloud_command`（同 `commandCode` 命名空间不同表，别混）。目标侧不新建表、不把云账号塞进 `workbuddy_hosts`：台账按 `clientKind='WORKBUDDY'` 路由到云端两张表读。

## 6. 接口设计（contracts → backend → frontend）

| 端点（契约路径，前端经 `endpoint()` 加 `/api/backend` 前缀） | 方法 | 说明 |
|---|---|---|
| `/enterprise/agent-dispatch/devices` | GET | 群控工具与选择器同源数据（`?kind=`）；含在线、负载、电量、授权摘要 |
| `/enterprise/agent-dispatch/tasks` | GET | 群控任务台账（`source='AGENT'` 过滤 + 分页 + 状态） |
| `/enterprise/agent-dispatch/tasks/:id` | GET | 任务详情（进度、结果摘要、设备会话跳转参数） |
| `/enterprise/agent-dispatch/schedules/:id` | PATCH | 暂停/恢复 Agent 创建的设备定时任务 |
| `/enterprise/content/agent/schedules/:id/run` | POST | 站内定时任务「立即执行」（M4 演练用的入口，走与到点同一条 `execute()`） |
| Agent 对话 | — | 消息体新增 `dispatchScope`；工具执行全部经 `BotHostService` 受控方法，不新开公开写接口 |

契约在 `packages/contracts/src/agent-dispatch.ts`，改契约后同步重生成 `docs/api/openapi.json`（`api:docs:check` 守卫）。

## 7. 前端改动清单

| 文件 | 改动 |
|---|---|
| `frontend/src/app/agent/page.tsx` | `plugins` 页签 → `dispatch`（label「Agent群控」），深链 `?tab=dispatch` |
| `frontend/src/app/agent/_components/plugins-tab.tsx` / `plugin-center-tab.tsx` | 删除（D1 彻底下线） |
| 新增 `dispatch-tab.tsx` | 只有派单台账一个视图（设备清单留在 Agent-Bot，见 4.1.1）；行内给设备跳转与定时任务暂停/恢复 |
| `chat-panel.tsx` | 「+」删"选择插件"，加"Agent 群控任务"（两复选 + 标签 + scope 随消息发送） |
| `instruction-composer.tsx` | 删插件选择；加"Agent 群控任务"复选（同对话），`dispatchScope` 随定时任务保存 |
| `schedules-tab.tsx` | 定时任务表单接入带 scope 的 InstructionComposer；执行记录展示派单去向 |
| `notifications` 页 / `notification-bell.tsx` | category 词表补 `bot`（标签「群控任务」+ 图标），跳转链接支持群控列表/设备会话 |
| `frontend/src/api/content.ts` | 删 `plugins/togglePlugin/removePlugin/importPluginPackage` 调用 |
| 文案/翻译字典 | 页签、说明、空态、错误提示全套中文文案（按现有字典键规范） |

## 8. 安全与边界

- **归属复权**：每次工具调用校验 hostId 属于当前用户且 enabled——与界面派单同一入口，杜绝跨账号派单。
- **注入防线**：派发的 instruction 仍受 4000 字符上限、commandCode 幂等、目标机器凭据永不出站（平台只传"做什么"）的既有约束；不新增任何把主机令牌/工作区文件回传到对话的通道，Agent 只能拿到结果文本摘要。
- **确认门槛**：默认 Agent 必须先出"分配方案"、用户确认后才派单（提示词强约束 + 工具描述写明）；离线设备排队派发、取消任务均需明示确认。
- **计量**：设备执行的模型消耗记在设备侧授权渠道（现状口径），群控工具本身免费；派单动作在「智能体记忆」操作流按"写操作"留痕。
- **审计**：`source='AGENT'` + `agentConversationId` 让每条群控指令可回溯到发起会话。

## 9. 里程碑拆解

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 插件彻底下线（已完成 2026-11-17，迁移 `0111_agent_plugin_offline`） | 前端入口/组件删除、服务与契约删除、`run_plugin_command` 移除、`content_agent_plugin` 表迁移删除（先备份导出）、openapi 重生成、SkillHub 插件路径清理 | 全站无 Agent 插件残留；`check:architecture` / `api:docs:check` / 单测通过；技能链路回归无损 |
| M2 页签与只读总览（已完成 2026-11-17，迁移 `0112_dispatch_source`） | 「Agent群控」页签：派单台账（指令 + 设备定时任务归一列表）；command/schedule 加 `source`、`agentConversationId` 列；`/agent-dispatch/devices` 接口先给 Agent 工具与后续选择器用 | 页签只做台账、不铺设备卡片（几百台设备也不挤）；行内可跳设备对话；空态给派单与设备页入口 |
| M3 Agent 群控工具（已完成 2026-11-17） | 五个内置工具 `DISPATCH_TOOLS` + `BotHostService.dispatchAsAgent / createScheduleAsAgent` 受控方法（归属复权、启用状态、群控范围三道闸）+ scope 注入提示词与工具面 + 逐台拆单派发 + 智能体记忆操作流留痕 | 真实库自检跑通：`source='AGENT'`+`agentConversationId` 落库、范围外/停用/跨账号全拒、取消落终态、定时任务继承派单来源；单测覆盖工具文案、只读回合挡写与 manifest（`typecheck`/`lint`/jest 1441 通过）。对话侧大模型回合本地模型网关 502 未能实跑，待网关恢复后按 §4.3 复现 |
| M4 对话与定时「+」群控入口（已完成 2026-11-17，迁移 `0114_agent_schedule_dispatch_scope`） | 对话「+」与定时任务指令编辑器各一行「Agent 群控任务」（两复选 + 范围标签 + 可清除），会话级记忆；scope 从契约（`contentAgentScheduleSchema.dispatchScope` / 消息体 `dispatchScope`）贯通到 `parseDispatchScope` → `dispatch_scope` 列 → `runSilent` → 本轮系统提示与 `DISPATCH_TOOLS`；执行记录给"这一轮开启群控 + 看派单去向"；`docs/api/openapi.json` 重生成 | 浏览器实跑两处入口（勾选→标签→发送，范围随消息/任务落库 `["DESKTOP","MOBOT"]`）；带 scope 的定时任务「立即执行」两轮 `succeeded`，模型只枚举范围内的 Bot 主机并声明"本轮未包含 Mobot 手机"，按 §4.2 确认门槛拒派单——即"到点先分析、不擅自干活"；调用方 4 秒断连后服务端仍跑完整轮（无人值守回合不绑请求 signal）；单测新增 4 例（入库归一 / 缺省空 / 编辑不顺手清空 / 到点原样透传），该 spec 12/12、全量 jest 1445 通过。自然到点的"周一 9 点"演练靠 `advanceDue()` 在册复核单测 + 与手动同一 `execute()` 路径覆盖，跨自然时刻的长待观察留到 M6 演示 |
| M5 完成通知（已完成 2026-11-17） | category `bot`（标签「设备任务」，M7 起改显示为「群控任务」）；`BotHostService.announceTerminal()` 在 `/result` 回执与 `sweepTimeouts()` 超时收口两处挂上，站内信出口由 `services.ts` 晚装配；正文首行 + 本地路径遮蔽；铃铛色与 /notifications 分类筛选 | 真实库自检跑通：造一台自检设备 + 一条 `source='AGENT'` 指令，用主机令牌打 `/api/public/bot-host/result` → 回执 `received:true`，站内信落库「群控任务已完成：…」/「设备任务」/`link=/agent?tab=dispatch`，铃铛下拉可点开（标记已读并跳到台账页）；UI 手动指令与取消均不发信；单测新增 6 例（AGENT 完成发 info 且遮路径、UI 不发、设备定时发、失败 error 带指引、超时发+取消不发、出口缺席或抛错不影响回执），该 spec 32/32、相关 3 个 spec 69 例通过；`api:docs:check` / `check:architecture` 通过 |
| M6 打磨（已完成 2026-11-17） | 任务详情跳设备会话、定时任务暂停恢复、文案与多语言口径、发布说明草稿（含插件迁移指引，见 §11） | 全链路演示通过：真实对话两轮（第 1 轮只列设备不派单、第 2 轮确认后 `dispatch_device_task` 落 `commandCode`）→ 设备令牌打 `/result` 回执 → 台账转「已完成」→ 站内信「群控任务已完成：M6 演示·群控派单」并可点开跳台账；演示设备、指令与会话随后全部清干净。文案清理：`api-tab.tsx` 两处错误码说明改指「Agent → 技能」、技能审查提示词首行改口径、`agent/page.tsx` 页签描述与 §4.1.1 对齐、README「Agent」行补写群控台账口径（旧的 `docs/Agent编排与插件能力契约方案.md` 讲的是能力契约抽象，与已下线的插件页签无耦合，不改）。多语言：新页签沿用全站既有口径——产品页文案硬编码简中（`messages.ts` 无 insight / agent-bot / dispatch 键，仅 `help` 等走 `t()`），7 份本地化 README 按项目惯例在发版提交时同步（v1.5.0 / 1.6.0 / 1.7.0 三次发版均如此）。发布说明草稿落在 §11，含删表前备份 SQL 与「插件 → 技能 / 契约动作 / 群控」三选一迁移表 |

| M7 WorkBuddy 企业云并入群控（已完成 2026-11-17，迁移 `0115_cloud_dispatch_source`） | 目标类型三元（`BOT_DISPATCH_TARGET_KINDS` 加 `WORKBUDDY`）、`/agent-dispatch/devices` 返回企云账号与可用 Agent（按账号 60 秒缓存）、台账四源合并与按 `clientKind` 路由详情/取消/暂停（云端定时 taskKey 前缀 `csch_`）、`dispatch_device_task`/`create_device_schedule` 支持企云并带 `agent_id`/`version_id`、`WorkbuddyCloudScheduler` 每 tick 补一轮非终态追平（`sweepUnfinished()`，凭据失效按失败收口、两小时无动静按超时收口）、终态站内信出口抽成 `bot-host/dispatch-notice.ts` 供设备与云端共用、对话与定时「+」第三个复选、企云取消＝停止跟踪的诚实边界 | 真实库只读自检通过：插一把一次性企云账号后 `devices()` 同时给出 `WORKBUDDY` 与 `DESKTOP` 两类目标（企云 `queueable=false`、`pendingCount=0`），`DescribeAgentList` 真打到腾讯云返回 200，读不到 Agent 时工具文案给「读不到该账号的 Agent 清单（派单前先校验凭据）」而不是编一个，自检账号随后删除、剩余 0 把。`api:docs:check`、`check:architecture`（445 路由）、后端 `tsc`/`eslint` 干净，前端 `tsc` 干净、`eslint` 只剩两处无关的 `<img>` 警告；jest 全量 166 suites / 1475 通过（本里程碑新增 24 例：云端派单来源与 Agent 回落、清单缓存、停止跟踪、追平发信、四源台账路由与工具文案）。未做实跑的只剩浏览器交互（本会话无浏览器工具）；在线主机 #7 全程未被派单 |

建议 M2+M3 并行（前端/后端分工），M1 可独立先行合入。总量估算 **11–14 个工作日**（较 v1 增加约 3–4 天：插件物理清理与回归 + 定时任务群控 + 完成通知）。M7 为 v2 之后追加的口径扩展，估算 **3–4 个工作日**。

## 10. 评审决议（2026-11-16 已拍板，v2 已并入正文）

1. **D1 插件下线 → 彻底下线**：前端、服务、契约、`content_agent_plugin` 表物理清理（删表前备份导出）；技能页签为官方迁移路径。见 §2.1。
2. **D2 定时任务 → 丰富功能、接受复杂度**：Agent 定时任务编辑器加入群控入口，支持"到点自动分析并派单给设备"（任务路由编排，两表仍独立）。见 §4.5、§4.6。
3. **多机协作 → Agent 拆单派发**：逐设备调用派单工具，每台一条独立指令；不做平台侧"一次派单、多机认领"原子群发。见 §4.2。
4. **结果告知 → 设备完成后主动站内通知，但不回复 Agent 会话**：AGENT 来源任务与定时执行终态必通知，UI 手动指令不通知。见 §4.4。
5. **手机文件回传 → 维持文本摘要**：文件走设备侧既有上传通道，一期不做群控专用文件通道。
6. **D6（2026-11-17 追加）群控目标含 WorkBuddy 企业云**：群控不止 BotBuddy / Mobot，第三条执行通道 WorkBuddy 企业云账号一并纳入（目标类型 `WORKBUDDY`），设备表不掺云账号，台账与工具按 `clientKind` 路由到云端两表。见 §4.7、§9 M7。

## 11. 发布说明草稿（下一版，含插件迁移指引）

本仓库不维护 CHANGELOG 文件，发布说明进 GitHub Release 正文；下面这段即为草稿，发版时按实际版本号替换标题里的 `v1.8.0`。

```markdown
## v1.8.0 · Agent 群控上线，Agent「插件」页签下线

### 新增：Agent 群控
- **Agent → Agent 群控**（`/agent?tab=dispatch`）：Agent 派给三类执行位的任务台账。一次性派单与定时任务归一列表，
  可按「仅 Agent 派单 / 含设备与企云页面手动下发」筛选，行内跳对应执行位的对话（主机 / 手机 → 「Agent-Bot → 主机 / 手机」，
  企云 → 「Agent-Bot → 企云账号」）、看执行过程与结果摘要，定时任务可就地暂停 / 恢复；有未跑完的指令时页面自动续拉。
  清单与配对仍在「Agent-Bot」，台账不复制一份（几百台设备也不挤）。
- **三条通道同一种派单口径**：BotBuddy 主机与 Mobot 手机靠出站心跳排队领取（离线可派、上线即跑）；
  **WorkBuddy 企业云**是第三条通道——目标是一个腾讯云凭据账号，算力是账号下的 Agent + 版本，平台同步建会话推指令，
  **没有队列**（凭据停用或校验失败就派不出去），也**不经本站模型网关、不计积分**。
- **五个内置群控工具**（仅在本轮开启群控范围时对模型可见）：`list_dispatch_devices`、`dispatch_device_task`、
  `create_device_schedule`、`list_dispatch_tasks`、`cancel_dispatch_task`。多目标的活由 Agent 逐个拆单派发，
  每条指令按 `commandCode` 幂等；派单前须先复述目标与指令并等用户确认。企云可省 `agent_id`，
  省略时按「该账号最近用过的 Agent → 清单第一个」回落，一个都没有就拒绝并指向「Agent-Bot → 企云账号」。
- **对话「+」与定时任务「+」的群控入口**：各一行「Agent 群控任务」，可勾 BotBuddy 主机 / Mobot 手机 / WorkBuddy 企业云
  并显示范围标签，同一会话内记住上次的范围；范围随任务保存（新列 `content_agent_schedules.dispatch_scope`，迁移 `0114`），
  到点自动分析并派单，运行记录里能看「这一轮开启群控 + 派单去向」。
- **群控任务站内通知**：新增消息分类「群控任务」（顶栏铃铛橙色标识；M5 上线时叫「设备任务」，M7 把企云纳进来后改名）。「我的消息」可按该分类筛选，点开直达群控台账。
  云端任务的进度原来只有开着企云对话时才轮询，现在平台调度器每分钟替用户追一轮，不开页面也能收到终态。

### 客户端安装包
- **BotBuddy Windows 客户端**：`BotBuddy.Setup.1.7.0.exe`（未代码签名）。本轮 M1–M7 未改动 `bot-host-client/` 源码，
  故沿用已构建的 1.7.0 安装包，未重新出包。
- **Mobot 安卓客户端**：`Mobot-1.1.0-arm64.apk`（220.9MB，release/arm64，`versionCode=11171843`）。
  对应源码随包收录在本仓库 [`mobot-app/`](../mobot-app/PROVENANCE.md)（AGPL-3.0，保留上游 LICENSE 与
  THIRD_PARTY_NOTICES），构建步骤与环境处置见 [`docs/Mobot手机接入方案.md`](Mobot手机接入方案.md) 的出包实录。
  ⚠️ 该包用**新建立的 Mobot 签名密钥**签名，与上游 DSH 包的密钥不同：**已安装上游 DSH Go 的用户无法覆盖升级**，
  需先卸载再装（App 内数据随之清除）；此后各 Mobot 版本之间可正常覆盖升级。
  验签指纹：`CN=Mobot, OU=Mobot, O=Mobot, L=Shanghai, C=CN`，SHA-256
  `abb63dc373546410ffc6ed9e1bba7c3be7bb11164c25b775eb23a5e8c4df1cf7`。

### 移除（破坏性变更）：Agent「插件」
- 平台侧「Agent → 插件」页签（我的插件 / SkillHub 插件中心）整体下线，同类能力走「Agent → 技能」（`我的技能 / 技能中心`）。
- 数据库删除 `content_agent_plugins` 表，同时清掉 `content_agent_schedules.plugin_ids` 列与
  `skill_review_runs` / `content_agent_revisions` 里 `kind='plugin'` 的留痕行（迁移 `0111_agent_plugin_offline`，**不可逆**）。
- 契约类型 `ContentAgentPlugin` 与其端点、Agent 工具 `run_plugin_command`（`plugin` 工具类别）删除，
  `docs/api/openapi.json` 已重生成；外部客户端需按新快照重新校验。
- 客户端 BotBuddy 本机的「插件」页（Agent 插件 + Chrome 插件桥接）与浏览器代理插件**不受影响**：配置与数据都在本机。

### 升级步骤
1. **先备份**（删表不可逆）：`CREATE TABLE content_agent_plugins_bak_v18 AS SELECT * FROM content_agent_plugins;`
   或用 mysqldump 单独导出该表，随发布归档。
2. 构建（根目录一条命令按序装契约 → 后端 → 前端）：`pnpm install && pnpm build`。
3. 应用迁移：`pnpm prisma:migrate:deploy`（生产按 `pnpm production:migrate` 走带备份的脚本），确认 `0111_agent_plugin_offline` /
   `0112_dispatch_source` / `0114_agent_schedule_dispatch_scope` / `0115_cloud_dispatch_source` 全部 applied（MySQL 与 PostgreSQL 两方言都要跑一遍）。
4. 重启后端与前端，逐项自检：「模型服务 → API-MCP-Skill」接口清单已无插件类接口；「Agent → Agent 群控」空态给出派单与设备页入口；
   「我的消息」分类里可选「群控任务」；绑了腾讯云凭据的账号在「Agent-Bot → 企云账号」校验通过后，群控目标里能列出该账号与它的 Agent。

### 插件 → 技能 / 群控迁移指引
原「我的插件」里声明式 HTTP / 命令工具，按真实用途三选一：

| 原插件在做什么 | 迁到 | 怎么做 |
|---|---|---|
| 给 Agent 补一段方法论文本、模板、参考资料 | 「Agent → 技能 → 我的技能」 | 打 zip，根目录放 `SKILL.md`（frontmatter 写 `name` / `description`，缺了用一级标题与首段兜底），可带 `references/` 等文本文件（最多 60 个、单个截断 2 万字符）。上传即过 AI 安全审查，通过才入库。 |
| 调外部 HTTP 接口取数 / 写入 | 契约写动作 或 自建 MCP 连接器 | 契约动作在「Agent → MCP 连接器」的「可自动执行的动作」里逐条授权；自建连接器默认全拒，按整条连接器勾选放开。未经授权的写动作只回草案，无人值守一律不执行。 |
| 在用户自己的电脑 / 手机上执行命令、开网页、跑流程 | 「Agent → Agent 群控」 | 先在「Agent-Bot → Bot 主机 / Mobot 手机」配对设备，再到对话或定时任务「+」勾「Agent 群控任务」，由 Agent 拆单派发；终态回站内通知。不落本机、企业侧已有数字员工能干的活，改勾「WorkBuddy 企业云」，凭据在「Agent-Bot → 企云账号」绑。 |

- 需要找回旧插件定义（工具地址、参数、请求头）：查第 1 步的备份表 / 备份文件，逐条改写成 `SKILL.md` 的说明 + 权限声明。
- 技能包若声明网络 / 文件 / 命令 / 密钥权限，启用前需在「Agent → 技能」确认权限清单（`confirmPermissions=true`）。

### 已知边界
- 不做平台侧"一次派单、多机认领"的原子群发：逐目标独立指令，已成功的一方不会因另一方失败而回滚。
- 群控结果不写回 Agent 会话；要看完整过程从台账行内「到设备对话查看 / 到企云对话查看」。人为取消（`CANCELED`）与页面手动下发的指令不发站内信。
- 手机侧只回文本摘要，文件走设备侧既有上传通道。
- **企云取消是「停止跟踪」不是「中止」**：指令一旦推进腾讯云会话，平台没有中止接口可调，只能在台账里按已取消收口，云端那一轮仍会跑完——这一条对用户与模型都如实说明。
- 企云没有队列与重试：凭据停用、校验失败或该账号看不到 Agent，派单直接失败并把入口回给模型。
- 企云的 Agent 清单不落本地库，按账号缓存 60 秒现查腾讯云；台账与工具看到的"可派 Agent"以那一刻的云端返回为准，读不到就留空并说明，不编数据。

### 回归
后端 jest 166 套 / 1475 例通过；后端与契约 `typecheck`、后端 `eslint`、`api:docs:check`、`check:architecture`（445 条路由）通过；
前端仅 1 例既有无关失败（`src/app/project/_components/project-projects.spec.tsx`）。
```
