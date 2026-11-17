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
2. 把"指挥 BotBuddy 主机 + Mobot 手机"做成 Agent 的一项**特殊能力**：Agent 能读取当前设备连接状况，分析任务适合派给谁，经确认后把任务分配下去；普通任务和定时任务都支持。
3. Agent 对话输入框「+」里增加「**Agent 群控任务**」入口：勾选 BotBuddy / Mobot / 同时勾选，本轮对话即进入群控协作模式，以互动方式完成"分析 → 匹配 → 拆单派发 → 回报结果"。定时任务编辑器同步支持，站内 Agent 定时任务到点可自动分析并派单给设备。
4. 设备任务完成/失败通过**站内通知主动告知**用户（不回写 Agent 会话）；多设备协作由 Agent 拆成多条派单逐台下发。

### 1.3 非目标

- 不改变 BotBuddy / Mobot 客户端与设备通道协议（配对、心跳、指令领取、回执机制原样复用）。
- 不做跨用户共享设备（群控范围始终是**当前登录账号自己名下的设备**）。
- 一期不做设备端并行执行调度优化（沿用现有单机串行队列 + 待执行上限 50 条）。
- 不新增硬件/机器人通道；"群控"只覆盖现有的主机（DESKTOP）与手机（MOBOT）两类。

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
├─ 设备总览（BotBuddy 主机卡片列表 + Mobot 手机卡片列表：在线/离线、电量、待执行数、模型授权）
├─ 群控任务列表（Agent 派发的任务：来源会话、目标设备、类型 普通/定时、状态、结果摘要）
└─ 群控会话记录（可选：Agent 每次"分析→分配"的过程留痕，关联回对话）

对话「+」→「Agent 群控任务」
├─ 勾选范围：□ BotBuddy 主机  □ Mobot 手机（可同时勾）
├─ 勾选后输入框上方出现标签「群控：主机+手机」，可移除
└─ 本轮消息携带 dispatchScope，Agent 注入群控工具并按群控协作提示词作答
```

一句话定位：**「插件」是"给模型一份说明书"，「群控」是"给模型一队干活的设备"。**

---

## 4. 功能设计

### 4.1 Agent 群控页签（界面侧）

#### 4.1.1 设备总览

- 两个分区（复用 PillTabs 胶囊页签：**全部 / BotBuddy 主机 / Mobot 手机**），卡片栅格展示本账号设备。
- 每张卡片：设备名、平台图标（win/mac/android/ios）、在线状态徽标（在线/离线/从未连接/已禁用 + 最后心跳时间）、待执行队列数、模型授权来源；Mobot 额外显示电量、充电、网络类型。
- 卡片操作：进入设备会话（跳 /bot 或 /bot/mobots 对应对话页签并定位该设备）、启用/停用设备。
- 空态引导：无设备时给"去配对 BotBuddy / 接入 Mobot"按钮，跳既有配对页面。
- 进入页签即加载；心跳数据变化通过现有轮询口径自动刷新（不加手动刷新按钮）。

#### 4.1.2 群控任务列表

- 展示所有**由 Agent 发起**的派单（区别于设备页面里用户手动下的指令）：任务标题、派单来源（Agent 会话链接）、目标设备（名称 + 类型徽标）、任务类型（普通 / 定时）、状态（排队中/执行中/完成/失败/超时/已取消）、创建时间、结果摘要。
- 定时任务在列表中可暂停/恢复（复用 `workbuddy_host_schedule` 的 enabled/paused）。
- 状态流转复用指令表既有状态机，前端轮询刷新（沿用设备页面现有做法）。

#### 4.1.3 与设备页面的关系

- /bot、/bot/mobots 页面保留不动——它们是"设备管理"视角（配对、令牌、模型授权、工作区、单设备指令历史）。
- 「Agent 群控」页签是"任务调度"视角，只读设备状态 + 聚合 Agent 派单，不重复做设备管理功能；需要管理时跳转设备页面。

### 4.2 Agent 的群控工具（能力侧）

给 Agent 新增一组内置工具（进 `agent-tools.ts` + `agent-tool-manifest.ts`，权限口径"写操作：落库派单"）：

| 工具 | 读写 | 参数 | 行为 |
|---|---|---|---|
| `list_dispatch_devices` | 读 | `kind?: 'DESKTOP' \| 'MOBOT'`（受本轮 scope 约束） | 返回可用设备清单：id、名称、类型、平台、在线状态、待执行数、是否禁用；Mobot 含电量/网络。这是 Agent 分析的前提。 |
| `dispatch_device_task` | 写 | `hostId`、`instruction`、`cwd?`（仅主机）、`timeoutSec?`、`title?`、`conversationRef` | 向指定设备派发一条普通任务；内部走 bot-host 既有建指令链路（PENDING，等心跳领取）。设备离线也允许派发（排队语义），但 Agent 应先提示。返回 commandCode 供跟踪。 |
| `create_device_schedule` | 写 | `hostId`、`title`、`instruction`、`scheduleType`（once/scheduled/recurring）、`scheduleConfig`、`cwd?` | 创建设备侧定时任务，复用 `workbuddy_host_schedule` 与其调度器；到点自动生成指令。 |
| `list_dispatch_tasks` | 读 | `commandCode?` / `hostId?` / 最近 N 条 | 查询已派发任务的状态与结果摘要，供 Agent 回答"刚才那个活干完没"。 |
| `cancel_dispatch_task` | 写 | `commandCode` | 仅允许取消 PENDING 指令（已被领取的不强杀，沿用现有取消边界）。 |

**实现要点**：工具不直连数据库写指令，而是调用 `BotHostService` 新增的受控方法（复用其校验：归属复权、队列上限 50、指令长度 4000、启用状态、`clientKind` 与 scope 匹配），保证与界面手动派单同一套安全口径。用户身份取当前会话的 `CurrentUser`，Agent 只能操作本人设备。

**拆单派发（决议 3）**：不提供"一次派单、多机认领"的原子群发接口。多设备协作一律由 Agent 把任务拆解后逐台调用 `dispatch_device_task` / `create_device_schedule`（一次会话轮次内多次调用），每台一条独立指令、独立 commandCode；个别设备派发失败不回滚已成功项，Agent 按设备逐条回报成败与原因。

**系统提示注入**：当消息携带 `dispatchScope` 时，`composeTurn` 在系统提示里追加"群控协作段"：说明可用设备类型、派单流程规范（先查设备 → 给分配方案 → 用户确认 → 派单 → 报 commandCode 与查看入口）、主机/手机的能力差异（见 4.3）。未勾选群控时，这组工具不注入，模型无感知。

### 4.3 任务分配的分析逻辑（产品口径，落到提示词 + 工具返回）

Agent 拿到一组任务后，按以下维度思考"谁能干什么"：

1. **类型匹配（硬约束）**
   - 需要桌面软件、本地文件、浏览器自动化、IDE/命令行 → BotBuddy 主机；主机的 cwd 决定在哪个工作区干活。
   - 需要 APP 操作、短信/验证码、拍照/定位、移动端账号（微信/App 运营类）→ Mobot 手机。
   - 模棱两可 → 给出两种方案让用户选。
2. **在线与负载（优先级）**
   - 在线且队列空闲 ＞ 在线但有积压（提示预计等待）＞ 离线（说明"可派发排队，设备上线后自动执行"，需用户确认）＞ 已禁用（不可选，提示启用入口）。
   - 多台同类在线 → 优先负载低者；可并行拆分时把子任务分给多台（"群控"的核心卖点）。
3. **能力细节**
   - 手机：电量 <15% 或非 Wi-Fi 时提示风险；模型授权来源为"客户端同步"时说明用的什么模型。
   - 主机：无工作区上报时不派需要指定目录的任务。
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

- **触发点**：`bot-host` 公开通道 `/result` 回执落库为 DONE / FAILED / TIMEOUT 时（含指令与定时任务生成的指令）。
- **通知范围**：
  - `source='AGENT'` 的群控任务 → 必通知；
  - 定时任务到点执行的指令（kind=schedule）→ 必通知（用户不在场，最需要告知）；
  - 用户在设备页面手动下的 UI 指令 → 不通知（用户已在盯结果，避免打扰）。
- **载体**：复用平台站内信 `notifications` 表，新增 category `bot`；level 按结果取 info/error；标题如「群控任务已完成：{任务标题}」，正文含设备名、任务类型、结果摘要（截断 200 字）、失败原因；`link` 跳「Agent 群控」任务列表或对应设备会话。前端顶栏铃铛与 /notifications 页零改动即可展示。
- **失败也通知**：FAILED/TIMEOUT 用 error 级，正文带错误信息与"重试建议"文案。
- **边界**：通知只携带平台侧已有的文本信息，不透传设备本地文件路径与敏感输出；Mobot 手机同样适用。

### 4.5 对话「+」：Agent 群控任务入口

- 「+」浮层新增一行「**Agent 群控任务**」（图标 `ClusterOutlined` 类），右侧显示当前选择（未选 / 主机 / 手机 / 主机+手机）。
- 二级面板两个复选：**BotBuddy 主机**、**Mobot 手机**；可同时勾选；两者都不勾 = 退出群控模式。
- 选中后输入框上方出现可关闭标签，如「群控：主机 + 手机」。
- **会话级记忆**：同一会话内沿用上次选择（前端本地状态即可），换会话回到未选；新任务默认未选。
- 发送消息时携带 `dispatchScope: Array<'DESKTOP' | 'MOBOT'>`，后端按 4.2 注入工具与提示词。
- 「+」里现有"选择插件"入口随 D1 彻底删除。
- **Agent 定时任务编辑器同样加群控入口（决议 2 · 丰富功能）**：`instruction-composer.tsx`（定时任务"每次执行的指令"输入区）的「+」把"选择插件"替换为「Agent 群控任务」，勾选范围随任务配置持久化（`dispatchScope` 存入任务 JSON）。到点执行时该轮 Agent 对话携带 scope、注入群控工具——即"**站内 Agent 定时任务到点自动分析并派单给设备**"：例如每周一 9 点的定时任务，Agent 醒来后检查哪台主机/手机在线，把本周任务拆单派发下去。设备离线则按排队语义处理并在任务执行记录中说明。

### 4.6 定时任务口径澄清

系统里有两个"定时任务"，数据与调度各自独立；决议 2 后新增两者的**编排关系**（站内任务到点指挥设备，而非互相转换）：

| | Agent 定时任务（现有） | 设备定时任务（群控创建） |
|---|---|---|
| 到点谁执行 | 站内 Agent（模型 + 技能 + 连接器）；若配置了 `dispatchScope`，Agent 醒来后分析设备并拆单派发给 BotBuddy/Mobot | BotBuddy 主机 / Mobot 手机上的客户端直接执行固定指令 |
| 数据表 | `agent_schedule` 系 | `workbuddy_host_schedule` |
| 页面 | Agent「定时任务」页签 | /bot、/bot/mobots 的定时页签 + 群控任务列表（只读汇总） |
| 适用场景 | 需要"思考后分工"的周期活（每周内容分发、巡检类） | 指令固定、无需分析的周期活（每天 21:00 回评） |

Agent 在对话里可替用户创建**设备定时任务**（`create_device_schedule`）；站内 Agent 定时任务的 `dispatchScope` 只能由用户在编辑器勾选，Agent 不自行给自身定时任务加群控。

---

## 5. 数据模型改动

原则：设备、指令、定时四表主体零改动；只加"派单来源标记"和"会话关联"，并删除插件表。

1. **`workbuddy_host_command` 加两列**（migrate deploy）：
   - `source`：`'UI' | 'AGENT'`（默认 UI），区分手动指令与群控派单；
   - `agentConversationId`：可空 int，Agent 派单时回写，用于"来源会话"跳转与列表过滤。
2. **`workbuddy_host_schedule` 加同样两列**：`source`、`agentConversationId`。
3. 会话消息元数据增加 `dispatchScope`（沿用消息 meta JSON 字段，不加表）；Agent 定时任务配置 JSON 增加 `dispatchScope`（同样不加列）。
4. **删除 `content_agent_plugin` 表**（D1 彻底下线，migrate deploy 随附回滚说明；发布前对表做一次备份导出）。
5. 完成通知复用 `notifications` 表：新增 category 取值 `bot`（列为 VarChar，无 schema 改动），`entityType='host_command'`、`entityId=commandCode` 供跳转与去重。

## 6. 接口设计（contracts → backend → frontend）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/agent/dispatch/devices` | GET | 群控页签设备总览 + 对话工具同源数据（`?kind=`）；含在线、负载、电量、授权摘要 |
| `/api/agent/dispatch/tasks` | GET | 群控任务列表（`source='AGENT'` 过滤 + 分页 + 状态） |
| `/api/agent/dispatch/tasks/:id` | GET | 任务详情（进度、结果摘要、设备会话跳转参数） |
| `/api/agent/dispatch/schedules/:id` | PATCH | 暂停/恢复 Agent 创建的定时任务 |
| Agent 对话 | — | 消息体新增 `dispatchScope`；工具执行全部经 `BotHostService` 受控方法，不新开公开写接口 |

契约进 `packages/contracts/src/bot-host.ts`（或新增 `agent-dispatch.ts`），改契约后同步重生成 `docs/api/openapi.json`（api:docs:check 守卫）。

## 7. 前端改动清单

| 文件 | 改动 |
|---|---|
| `frontend/src/app/agent/page.tsx` | `plugins` 页签 → `dispatch`（label「Agent群控」），深链 `?tab=dispatch` |
| `frontend/src/app/agent/_components/plugins-tab.tsx` / `plugin-center-tab.tsx` | 删除（D1 彻底下线） |
| 新增 `dispatch-tab.tsx` | 设备总览 + 群控任务列表两个子视图（TabStrip：设备 / 群控任务） |
| `chat-panel.tsx` | 「+」删"选择插件"，加"Agent 群控任务"（两复选 + 标签 + scope 随消息发送） |
| `instruction-composer.tsx` | 删插件选择；加"Agent 群控任务"复选（同对话），`dispatchScope` 随定时任务保存 |
| `schedules-tab.tsx` | 定时任务表单接入带 scope 的 InstructionComposer；执行记录展示派单去向 |
| `notifications` 页 / `notification-bell.tsx` | category 词表补 `bot`（标签「设备任务」+ 图标），跳转链接支持群控列表/设备会话 |
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
| M1 插件彻底下线 | 前端入口/组件删除、服务与契约删除、`run_plugin_command` 移除、`content_agent_plugin` 表迁移删除（先备份导出）、openapi 重生成、SkillHub 插件路径清理 | 全站无 Agent 插件残留；`check:architecture` / `api:docs:check` / 单测通过；技能链路回归无损 |
| M2 页签与只读总览 | 「Agent群控」页签：设备总览 + 任务列表（先展示手动指令占位）；command/schedule 加 `source`、`agentConversationId` 列 | 页签可看设备在线/负载/电量；空态引导可跳转配对 |
| M3 Agent 群控工具 | 五个内置工具 + BotHostService 受控方法 + scope 注入提示词 + 拆单派发 | 对话里"帮我把 X 派给办公机"端到端可跑；离线/禁用/越权用例全拒 |
| M4 对话与定时「+」群控入口 | scope 勾选 UI、标签、会话记忆；定时任务 `dispatchScope` 持久化与到点派单；互动分析全流程 | §4.3 示例对话可复现；周一 9 点定时派单演练通过；普通 + 定时任务派单均正常回执 |
| M5 完成通知 | /result 终态落 `notifications`（category `bot`）；铃铛与 /notifications 展示、跳转 | AGENT 派单与定时执行完成后站内信必达；UI 手动指令不打扰 |
| M6 打磨 | 任务详情跳设备会话、定时任务暂停恢复、文案与多语言、发布说明（含插件迁移指引） | 全链路演示通过 |

建议 M2+M3 并行（前端/后端分工），M1 可独立先行合入。总量估算 **11–14 个工作日**（较 v1 增加约 3–4 天：插件物理清理与回归 + 定时任务群控 + 完成通知）。

## 10. 评审决议（2026-11-16 已拍板，v2 已并入正文）

1. **D1 插件下线 → 彻底下线**：前端、服务、契约、`content_agent_plugin` 表物理清理（删表前备份导出）；技能页签为官方迁移路径。见 §2.1。
2. **D2 定时任务 → 丰富功能、接受复杂度**：Agent 定时任务编辑器加入群控入口，支持"到点自动分析并派单给设备"（任务路由编排，两表仍独立）。见 §4.5、§4.6。
3. **多机协作 → Agent 拆单派发**：逐设备调用派单工具，每台一条独立指令；不做平台侧"一次派单、多机认领"原子群发。见 §4.2。
4. **结果告知 → 设备完成后主动站内通知，但不回复 Agent 会话**：AGENT 来源任务与定时执行终态必通知，UI 手动指令不通知。见 §4.4。
5. **手机文件回传 → 维持文本摘要**：文件走设备侧既有上传通道，一期不做群控专用文件通道。
