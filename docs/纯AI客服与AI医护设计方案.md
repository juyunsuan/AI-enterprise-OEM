# 纯AI客服 与 AI医护 设计方案

> 状态：已落地（迁移 0141 已执行）。本文是口径依据，实现散落两处：AI客服板块（通用能力）与健康管理小程序（引用方）。

## 一、红线：能力归基础模块，业务域只引用

- **纯AI客服是 AI客服 模块内部的一类员工**，与真人坐席并列；人设、模型、知识库范围、转人工口径、接待时段、并发容量全部挂在这个员工上。
- **业务工具要用 AI，只能引用它**：健康小程序的「AI 医护」= 「本店铺绑了哪位纯AI客服员工」+ 「开没开」，两列数据而已。
- 反向同样禁止：`service-desk` 里不许出现任何业务域分支（不判 shopId、不判医护、不认健康术语）。
- 依赖方向唯一：`health → service-desk` 的通用问答口 `answerForAgent`；健康域代码里**不拼提示词、不调模型、不查知识库、不生成引用**。

## 二、数据模型

| 表 / 字段 | 作用 |
| --- | --- |
| `service_desk_ai_agents`（新增） | 纯AI客服员工：名称/头像/简介、`group_id` 归属客服组、`status` ON\|DISABLED、`mode` AUTO\|BOT、`persona` 人设、`ai_channel_id`/`ai_model` 模型覆盖、`kb_space_ids` 自带知识库范围、`handoff_keywords` 转人工关键词、`handoff_group_id` 兜底真人工组、`max_concurrent`、`working_hours` 接待时段、`greeting_text` 欢迎语 |
| `service_desk_conversations.assignee_type` | `USER`＝真人坐席接待；`AI`＝纯AI客服接待 |
| `service_desk_conversations.ai_agent_id` | 接待（或曾接待）该会话的员工 id；真人接手后仍保留，作为留痕 |
| `health_shops.ai_staff_enabled` | AI 医护总开关（店铺级） |
| `health_practitioners.desk_ai_agent_id` | 该医护绑用的员工 id（0＝未绑定） |

回落口径：员工没配模型/知识库/关键词时，依次回落到账号级 `service_desk_settings` 的 `aiModel`、`SERVICE_DESK` 消费者绑定的知识空间、`aiHandoffKeywords`，所以老账号不改配置也照旧工作。

## 三、接待链路与回复链路

1. **自动分配**（`assignIfPossible`）：先挑可用员工（组匹配 → 启用 → 在接待时段 → 未满负荷，负载率低者优先），命中就以 `assigneeType=AI` 接入并下发欢迎语；没有可用员工才排真人。会话首条访客消息由 `openSend` 触发应答，分配处不重复应答。
2. **应答**（`autoReply`）：按会话的 `ai_agent_id` 取员工配置；顺序仍是 销售剧本边界 → 固定问答（FAQ）精确命中 → 知识库召回 + FAQ 语料 → 模型生成。`mode=BOT` 永不转人工，`AUTO` 命中员工关键词或剧本触发词才转。
   - 模式判定单独收口成 `effectiveAiMode()`：建会话时会把当时的账号 `aiMode` 快照写进 `service_desk_conversations.ai_mode`（永远非空），所以「会话快照优先」这条老口径在有员工接待时必须让位给员工口径，否则员工配置永远不生效；只有 `SUGGEST`（已转人工）与 `OFF` 两个会话级例外压得过员工。这条反直觉规则由 `src/service-desk/service-desk-ai-mode.spec.ts` 钉住。
3. **署名**：AI 员工接待的消息在实时推送与展示里署名为该员工名（无员工时仍显示「AI 助手」），真人一眼看得出是哪位 AI 在说话。
4. 转人工后账号级 `aiMode` 落 `SUGGEST`，不会和员工配置互相打架。

## 四、接口面

- 业主端（AI客服 → 团队）：`GET/POST /enterprise/service-desk/ai-agents`、`POST /ai-agents/:id/status`、`DELETE /ai-agents/:id`、`POST /ai-agents/ask`（「试问一句」，只验人设与知识库，不写会话）。
- 通用问答口：`ServiceDeskService.answerForAgent({ ownerUserId, agentId, question, history })` → `{ agentName, answer, references[], handoff }`。任何业务域都走它，不再另开 AI 接口。
- 健康·医护端（医护令牌通道）：`/api/public/health/staff/ai/status|agents|ask|enabled|binding`。
- 健康·业主端：`GET /enterprise/health/ai/status`、`POST /enterprise/health/ai/enabled`、`POST /enterprise/health/ai/binding`。

## 五、AI 医护的使用规则

- **谁能开合**：店铺管理员（医护端 `role=MANAGER`）在小程序「AI 医护」页开关与绑人；店主在 `/health → 店铺设置 → AI客服` 的同级「AI 医护」卡里同样能开关，并在医护列表里逐人绑定。
- **谁能提问**：全部在岗医护。只有绑定了员工才放提问；未开启与未绑定是两条不同提示，不混为一谈。
- **入口显示**：工作台只在「已开启且本人已绑定」时给普通医护显示 AI 医护入口；管理员始终能看到（不然关掉后进不去设置）；状态请求失败时保留入口，不因一次网络失败把功能藏掉（`utils/staff.js` 的 `aiEntryVisible`）。
- **失败如实**：模型不可用、员工被停用、账号级没配模型——都直接把错误抛给端上，绝不回占位答案（医护会照着回答顾客）。
- 越权与归属：所有读写沿用医护端既有口径 `shopId + practitionerId` 双条件；开关落库带 `shopId`，绑定落库带 `shopId + id`；操作写审计 `health.staff.ai.enabled|binding|ask`。

## 六、随本轮一起补的菜单与授权缺口

| 类 | 问题 | 处理 |
| --- | --- | --- |
| A | `/dashboard`、`/tasks`、`/account/team` 有菜单但功能目录无节点，后台关不掉 | 功能目录补 `dashboard`/`task-center`/`sub-account-team` 节点；驾驶舱与子账号页只作菜单治理不映射接口前缀，避免关一个误伤一片 |
| B | 16 个功能码治理的是卡片页/页签入口，而卡片页硬编码不看开关 | 新增 `frontend/src/lib/feature-visibility.ts`（功能目录 closed ∪ 子账号未授权模块），接入「建站管理」卡页、「智慧分析」子卡、「营销工具」卡与视图；`ai-a2a` 外链补进侧栏「模型服务」才有可关的入口 |
| C | 子账号 RBAC 只有 16 个模块，客服/健康/邮箱/多维表格/RPA/专题大厅/应用中心/数字资产等无 key，授权形同虚设 | `contracts/rbac.ts` 补 13 个模块与前缀（最长前缀匹配，`assets` 比 `content` 更细）；前端菜单裁剪表同步；运营角色默认含新模块；迁移 `0143_rbac_new_module_grants` 只把「存的模块恰好等于角色旧默认集」的成员跟到新默认，手工定制过的一律不动 |
| D | 智库服务 `icon: "read"` 在图标表里没有 | 补 `ReadOutlined` 映射，并给未登记的图标名兜底一个默认图标，菜单不再出现无图标项 |

## 七、验证结果

已跑通（本地开发库，真实写入后清理）：

- 服务端链路实跑 20/20 全绿，覆盖：AI 员工创建与台账字段、新会话由 AI 员工先接（不是排给真人）、员工口径压过账号级 `CANNED` 快照、关键词/模型失败两种转人工入口、转人工后 AI 不再抢答（`SUGGEST` 会话级例外）、`BOT` 模型失败只发兜底话术不转人工、停用后通用问答口如实拒答、台账统计出数、AI 医护默认关闭、非管理员不能开关与绑人、未绑定提问被拦、绑定落库到引用位、绑不存在的员工被拒、绑定后确实打到 AI客服通用口。
- 本机没有可用模型 Key，模型调用如实返回「接口地址为空」——这正是要求的失败口径：不编答案、把原因交给端上。配好 Key 后的应答质量尚未实测。
- 静态校验：后端全量单测（本轮新增 AI 模式口径 3 例与健康 AI 医护 3 例）、`check:architecture`、契约构建、`api:docs:check`、小程序 JS/JSON 语法与页面注册自检、涉及文件 ESLint。
- 未做：微信开发者工具与真机点验、浏览器里实测 AI客服团队页签（本环境起不了 dev server，也不替用户重启服务）。改动生效需要用户自己重启后端。

## 八、明确不做（不是尾巴）

1. AI 员工不进收益与分账：它不是真人，不产生提成；接待量、转人工率与满意度已进团队页签台账。
2. 子账号既有的手工勾选授权不会被自动扩大：迁移 `0143` 只把「存的模块恰好等于角色旧默认集」的成员跟到新默认，手工定制过的一律原样，需要就主账号自己勾。
3. 业务域自带人设/知识库：架构红线，永远不做（见 §一）。
