# 网页模型源重构方案：协议取证 + OpenAI 兼容网关 + 工具伪协议

> 状态：**待审**（未开工）。编制 2026-11-23　|　取代 `docs/大模型站点通用问答与Harness模型源接入设计方案.md` 的执行路径（该文档的口径冲突集中在 §8，需逐条签字）。
> 一句话：把"在网页里打字 + 读渲染后的文本"换成"**在我们自己控制的指纹窗口里取证网页真实协议 → 本地 OpenAI 兼容网关 → 挂进 DSH 模型渠道**"，并把**工具调用伪协议**作为一等公民实现，因为 AI 编程不是问答。

---

## 1. 为什么现在这套不行（用代码与实测说话）

| 病灶 | 现状实现 | 后果 |
|---|---|---|
| 读渲染后的 DOM 文本当模型输出 | `src/webchat/ask.ts:96-101,161-166`（baseline 门控 + `mode:'last'`）、`step.ts:31-39`（要临时隐藏搜索过程/追问推荐 DOM） | 网页把"搜索中/引用来源/追问推荐"渲染进答案容器就会混进正文；只能靠选择器黑名单打补丁，改版即坏 |
| 无状态请求 vs 网页有状态会话 | `src/webchat/adapter.ts:79-84`（`turnStart()` 只发"最后一条 assistant 之后的 user 消息"）、`:69-77`（进程内游标导致切模型重放历史，已固化为真机翻车测试） | 上下文在网页侧与我们侧各算各的：多轮编程必然错乱 |
| 伪流式 | `adapter.ts:214-220`（拿全文按 240 字切片 yield） | 首字延迟等于全文延迟，编程 Agent 等待放大 |
| 上下文窗口虚假声明 | `adapter.ts:126-130`（把 `contextWindow` 吹到 262144 只为"切模型时不触发压缩"） | DSH 按声明值算压缩预算（`packages/compaction/compaction-basic/src/config.ts:142-208`）→ 上游报超长才被动压缩重试（`llm-deepseek/src/transport.ts:44`、`compaction-basic/src/index.ts:230-273`），表现为反复"压缩+重试"后失败 |
| 没有取证能力 | `ws-client.cjs:307`（CDP 收到无 id 报文直接丢）、全库无 `Network.enable`；两个扩展无 `debugger`/`webRequest` 权限 | 想转协议重放的**前置条件都不具备** |
| 站点校准 | `recipes.ts:44` 等：8 站仅 wenxin `verified: true` | 7/8 站选择器没真机核对过，等于不可交付 |

结论：DOM 路线的天花板是"能问一句话"，不是"能写代码"。

## 2. 目标与非目标

**目标（编程场景硬需求，缺一不验收）**

1. OpenAI 兼容本地端点：`/v1/models`、`/v1/chat/completions`（流式 + 非流式）。DSH 侧**零代码**接入：模型设置里用现有 provider 家族 + `api: openai-completions` 与 `baseURL` 覆写（`ui-settings-models/src/client/ProviderEditor.tsx:9,262`、`llm-pi-ai/src/config.ts:117,359`）；若需要自定义模型档位（`contextWindow`/`maxTokens`/`reasoningEfforts`），是写一条 llm-pi-ai profile 配置（`llm-pi-ai/src/index.ts:29-53` 的 hand-declared route），**不是改代码**。DSH 还会探测端点协议（`llm-pi-ai/src/discovery.ts:16`），并把 reasoning 方言做成可配（`compat.thinkingFormat`），正好承接 §5.6。
2. **工具调用伪协议**：接受 `tools`，注入受控文本协议，回读解析成 `tool_calls`，`arguments` 必须是合法 JSON。
3. 上下文真实：消息签名前缀匹配，只发增量；分叉即新会话；每站真实输入上限与上下文预算如实声明。
4. 可取消：DSH 的 `AbortSignal` 一路传到上游请求中断（尽力而为再点站点"停止生成"）。
5. 限流语义诚实：上游 429/需验证/风控 → 标准 OpenAI error + `Retry-After`，让 DSH 的重试策略（`llm/src/retry-policy.ts:15-25`、`llm-retry/src/index.ts:221-238` 优先服务端 `Retry-After`）能正确工作。
6. 凭据与隐私边界不破：凭据不出本机、只监听 `127.0.0.1`、不绕验证码、结果未知不重发。

**非目标（首版明确不做）**

- 不做多用户/云端代理（服务器不带模型凭据，沿用 `docs/本地Chrome插件RPA控制方案.md:87` 口径）。
- 不承诺 8 站全覆盖：先打通 2 站（DeepSeek、文心）到"能写代码"，其余按取证矩阵逐站准入。
- 不做图像/文件多模态输入（`inputModalities` 保持 `['text']`）。
- 不实现"离线重放全站点"（见 §8 冲突项 2，默认关闭）。

## 3. 五个参考项目：谁的方法治我们的哪个病

| 参考 | 技术路线 | 值得抄（带位置） | 明确不抄 |
|---|---|---|---|
| ChatGPT-Web2API | 真实 Chrome + CDP，页内取 token，读侧用网络事件锚定回合 | **回合主键用 CDP `Network.requestWillBeSent` 抓到的"发送消息的客户端 UUID"**，文本匹配只作降级（`identity_listener.py:274-345`、`turn_anchor.py:72-107`）；"证据不足就不认账、宁超时不返旧文"（`turn_anchor.py:383-395`）；取**最新** `end_turn` 而非首个（`:474-490`）；熔断/跨进程锁/限流退避分层（`breakers.py`、`cross_process_lock.py`、`resilience.py:40-115`） | 把全量 messages 折成文本追加进已有会话（无 diff，`api_server.py:269-304`）——正是我们的错乱根因；零取消、`usage` 恒 0 |
| ProxyLLM | 浏览器只"抓包取证"，推理走 Node 重放 | **取证与调用解耦**（`main.ts:555-603` CDP+webRequest 只抓，`api-server.ts:552-560` Node 重放）；`Adapter` 四方法抽象 + 注册表（`src/types.ts:152-197`、`adapters/registry.ts`）；`JWT exp/age` 双阈值过期 + 401 触发重开窗口补凭据（`refresh-policy.ts:32-47`）；错误码表 + `retry-after` 可重试语义（`src/errors/index.ts:15-46`） | 只发最后一条 user、每次重置会话 ID（`formats.ts:78-79,130-136`）→ 编程多轮直接废；凭据明文落盘（`credential-store.ts:69-72`）；25s 固定超时、无断连取消 |
| FreeDeepseekAPI | 扩展只导 cookie，本地重放私有接口，PoW 现算 | **`planSessionTurn` 的前缀指纹增量算法**（`server.js:2501-2546`：历史是已发前缀且未完 → `delta`，否则 `full` 重建）；100 条/2h/超字符 rollover（`:501-509`）；`chat_session_id + parent_message_id` 链；JSON-Patch 分路径累积、把 THINK/SEARCH 归 reasoning（`:2930-2984,601-611`）；带 tools 时不流正文只发 keep-alive（`:2806-2818`）——这是诚实的伪工具节奏；客户端断连 abort 上游并丢弃该轮（`:2715-2719,3265-3271`）；多账号 cooldown + 重放（`:427-438,2883-2902`） | 本地算 PoW + WASM sha3（`:664-688`）= 每站都要复刻上游算法，改版即死；工具单发、无 parallel、坏格式 502（`:3206-3252`）；`length/4` 假 usage；凭据人工搬文件、明文 |
| chatgpt_web_api | 真·HTTP 重放（含 sentinel PoW、conduit token） | **会话账本最长前缀匹配**（`conversation_store.py:64-91`：`pending_messages = messages[matched:]`），换模型不重建会话；超 20k 字符自动转 TXT 附件（`content.py:59-85`）——编程大 prompt 的必需逃生口；**工具伪协议 `<OPENAI_TOOL_CALLS>` 标记块 + jsonschema strict 校验**（`tool_bridge.py:12-14,318-389`）；`stream_handoff` 断流续传 `resume_conversation_token`（`web_client.py:922-1052`） | 全局 `RLock` 串行所有上游发送、无 429 处理（`upstream.py:192`）；stop 不透传；离线重放要维护 sentinel/conduit/PoW 三套私有材料，运维成本极高（正好证明"重放路线"贵） |
| proXiPT | Playwright DOM 自动化 | 页级信号量与 cooldown/CAPTCHA→禁用的人工闸门（`browser_pool.py:183`、`core/router.py:178-200`）；tiktoken 本地估 usage（`core/token_estimator.py`） | 反面教材：每次 `create_new_chat` + 历史全文重贴（`chatgpt.py:59-66`、`message_compiler.py:48-53`）、200ms DOM 轮询流式（`base.py:147-191`）、stop TODO——我们现在的病它全有 |

**一句话总纲**：取证用 CDP 网络事件，执行**默认走页内中继**（不导出凭据、上游 PoW/风控交给真浏览器），会话对齐用**消息签名前缀匹配**，回合归属用**协议层抓到的 message id**，工具用**带 schema 校验的伪协议**。

## 4. 架构总览

```
┌ DSH Agent 循环（packages/core/agent-loop，每步带 tools、听 AbortSignal）
│      ↓ provider=openai-completions（模型设置里新增渠道，DSH 零改动）
┌ 本地 OpenAI 兼容网关  gateway/（127.0.0.1，随机 token 鉴权，端口写入本地配置文件）
│  ├ 协议面     /v1/models、/v1/chat/completions（SSE + 非流式）、错误码 + Retry-After
│  ├ 会话账本   conversation-ledger：消息签名链 → 前缀匹配 → delta / fork（每站映射到该站会话字段）
│  ├ 工具桥     tool-bridge：注入伪协议 ↔ 解析 tool_calls ↔ jsonschema 校验 + 一次修复重试
│  ├ 装载器     prompt-composer：超站点头寸时分段/附件/引用本地文件路径，按站点上限裁剪
│  └ 执行器后端（逐站能力开关，二选一）
│        A. 页内中继 executor（默认）：在我们指纹窗口的页面上下文里发 fetch，凭据留页面
│        B. 离线重放 executor（默认关，需签字）：凭 CDP 抓的请求模板在 Node 直发
┌ 取证层 forensics/（CDP over 指纹内核，已有 ws 通道需补事件面）
│  Network.enable + 事件落盘：端点、必需头名、请求模板（值脱敏）、流式帧格式、会话字段、取消手段
┌ 兜底层 dom-fallback（保留现有 recipes 的输入/发送部分）
   只在取证失败或该站无稳定协议时启用，且**只用于发送**，读取仍优先协议；不可用时明确降级提示
┌ 观测与准入 site-matrix
   每站一份证据表 + `verified` 状态 + 端到端编程用例通过率，未过不进模型选择器
```

时序（一轮编程请求）：

```
Agent → 网关(messages, tools, stream, signal)
 1) ledger.match(messages) → delta | fork            # 不重发已发前缀
 2) tool-bridge.render(delta, tools) → 单条网页文本载荷 # 带严格格式契约与示例
 3) executor.send(page-context fetch | replay)       # 站点上限超限→装载器降级
 4) 协议流式帧 → StreamChunk：reasoning 归 thinking、正文归 text-delta、tool 块归 tool-call-delta
 5) finish：usage（真实或标注估算）+ 回合归属证据（协议 message id）
 6) signal.abort → 中断消费 + 尽力点站点"停止生成"，该轮标脏不入账本
```

## 5. 关键设计要点（只写决策，不写代码）

**5.1 取证层要补的那一块很小但必须有**：现在 `ws-client.cjs:307` 把无 id 的 CDP 事件丢掉。需要（a）事件分发器，（b）`Network.enable` + `requestWillBeSent/requestWillGetResponseExtra/EventStream` 消费，（c）模板落盘时**默认脱敏**（cookie/authorization/x-*-token 只记头**名**与长度，不记值）。取证只在**我们自己的指纹窗口**内进行；用户本机 Chrome 的兜底链路仍不引入 CDP（守住 `docs/本地Chrome插件RPA控制方案.md:135,391`）。

**5.2 页内中继 vs 离线重放**：证据倾向页内中继为默认——`chatgpt_web_api` 需要 sentinel PoW、conduit token、三段 prepare，`FreeDeepseekAPI` 每次现算 PoW + WASM sha3，这类上游私有算法复刻是**最贵的长期负债**；把 PoW/签头/TLS 指纹留给真浏览器，我们只负责"发什么、读什么"。重放作为已验证站点的加速档，且需要 §8 的签字。

**5.3 会话账本是本方案的心脏**（治错乱）：`ledger.key(message) = hash(role + 规范化内容 + 工具块指纹)`；只有"已发序列是当前序列的严格前缀"才允许 delta；任何分叉（改历史、换 system、换工具集、切模型）→ **新建会话全量重发**，并把旧会话留档不污染。逐站映射到 `chat_session_id/parent_message_id` 或该站等价字段。100 条/时长/字符超限 rollover（抄 `server.js:501-509`）。

**5.4 回合归属只认证据**：主键=协议层抓到的 client message id / 响应 message id；无证据时宁可超时也不返回旧文（抄 `turn_anchor.py:383-395` 的三态判定），杜绝"把上一轮答案当这一轮"。

**5.5 工具伪协议（编程能不能跑就看它）**：请求侧用固定标记块 + 严格示例（抄 `tool_bridge.py`），响应侧解析 → jsonschema 校验 → 失败允许**一次**修复重试（回灌错误说明），仍失败则返回 OpenAI 风格错误让 Agent 层显式看到，**绝不静默当正文**（`packages/core/tools/src/batch.ts:67,99-106` 会把坏 arguments 原文塞进工具，这是我们要避免的脏路径）。流式按 DSH 契约发 `tool-call-delta {index,id,argumentsDelta}`（`llm/src/types.ts:490`、`assembler.ts:69-76`）。

**5.6 诚实的能力声明**：真实站点上下文上限（取证得到）写进 `contextWindow`，不再吹 262k；`usage` 至少给本地估算并显式标注（DSH 有 4 字符/token 启发式兜底，`token-meter/src/estimate.ts:13-19`，不算错但会降精度）；首版 `inputModalities=['text']`。

**5.7 长载荷逃生口**：编程必然超页面上限——按站点上限做三档：截断保头尾 + 明确标记、转"文件引用"（DSH 有 spill/工作区，模型只需路径 + 摘要）、分段多轮装载。这条必须有，`chatgpt_web_api` 用附件绕过（`content.py:59-85`）就是前车之鉴。

## 6. 里程碑与验收门槛

| 里程碑 | 产出 | 通过门槛（真机） |
|---|---|---|
| M0 取证 spike | forensics 事件面 + 每站证据表（端点/必需头名/会话字段/流式帧/上限/取消手段/风控信号） | DeepSeek、文心两站各拿到完整证据表且可复现；模板落盘无凭据值 |
| M1 网关骨架 | `/v1/models` + `/v1/chat/completions` 非流式，页内中继执行器，DSH 模型设置填渠道 | 一条 DSH 会话跑通纯文本问答（无工具），切模型不重放历史（回归现有 26 条断言的等价新断言） |
| M2 **编程可用** | 工具桥 + 会话账本 + 取消 + 错误码/`Retry-After` | 5 个真编程任务全绿：①多文件读取后改 1 处（`old_str` 逐字命中）②新建文件 ③跑命令并按输出续改 ④超长上下文触发一次压缩后仍成功 ⑤中途取消后不脏账本、可继续 |
| M3 多站准入 | 逐站取证接入 + site-matrix 准入看板 | 每站 M2 五任务通过率入表；未过站点不进选择器 |
| M4 稳定化 | 熔断/频控/单站串行锁（抄分层失效：退避 vs 熔断 vs 503 fail-fast）、观测面板、取证漂移告警 | 连续 200 轮无错乱、无旧文误认；注入一次改版漂移能在 N 轮内告警 |
| M5 旧链路下线 | 退役 `web-chat` adapter 与 `check-webchat-parts.mts` 的 DOM 专属断言，保留 `verify-extension-caps.mjs` 闭集 | 删除清单逐条签字后执行，不留双份实现 |

## 7. 现有实现的去留（迁移表）

| 现有 | 处置 |
|---|---|
| `recipes.ts` 选择器配方 | 保留 `input/send`（页内中继失败的兜底装载），删除 `reply/stop` 读文本语义 |
| `adapter.ts` `turnStart`/游标 | **删除**，由会话账本前缀匹配取代 |
| `prune.ts`/`NOISE`/`STATUS_LINE` | 大幅瘦身：协议路径不再需要噪声黑名单，仅兜底 DOM 路径保留 |
| 伪流式切片 | 删除，改协议帧直出 |
| `web-chat` provider 注册 | 删除，改走 DSH 内置 `openai-completions` 渠道（`llm-pi-ai/src/index.ts:29-53`） |
| `bridge-server` 本机 HTTP 面 | 扩展为网关宿主，端口与 token 沿用现机制（`bridge-server.ts:96-104,215-241`） |
| 本机 Chrome 兜底（chrome-bridge 扩展） | **不参与协议桥**（无取证能力且要扩权限，违背"权限不扩大"）；保留网页问答兜底用途并如实标注降级 |

## 8. 与已拍板口径的冲突（需你逐条签字）

1. **首版不碰内部协议**（`大模型站点…md:258-259`：SSE 直转"首版不做，列为可选增强"）→ 本方案把协议层取流作为**主干**，DOM 降为兜底。不签字则本方案不成立。
2. **凭据口径**：红线是"不读用户 cookie/口令/验证码、凭据不出本机"（同文档 `:300-309`）。**页内中继**不破线（凭据留在页面上下文，我们不导出、只记录头名）；**离线重放**必须把含 `Cookie`/`Authorization` 的请求模板落盘——虽在本机、需加密且默认关闭，但语义上是"存了凭据"。请选：只允许 A / A+B（B 需加密落盘且每站显式开）。
3. **RPA 链路不引入 CDP**（`本地Chrome插件RPA控制方案.md:391`）→ 本方案的 CDP 只作用于**我们自己的指纹窗口**（`vendor/fingerprint.cjs:70-73` 已带 `--remote-debugging-port`），用户本机 Chrome 仍不引入。请确认边界表述可接受。
4. 首版站点数（D5：先 4 站不一次上 8 站）→ 本方案首版 2 站打通编程，比 D5 更保守，但把"能写代码"作为准入门槛。

## 9. 待你定的 4 个决策（勾选即可，我按选择细化落地）

> 已定稿：见 §10，四项选择连同理由与代价一并记录，后续按 §10 执行。

1. 执行后端：**只页内中继** / 页内中继 + 可选重放（需 §8.2 签字）。
2. 首版站点：DeepSeek + 文心 / 加 Kimi（Kimi 私有协议取证难度我会在 M0 证据表里先给结论）。
3. 编程验收用例：由我给 5 条（§6 M2），还是你指定你日常要跑的真实任务。
4. 旧链路退役时点：M2 通过后立即退役 `web-chat`，还是并存到 M4（并存期默认新链路）。

## 10. 决策定稿（2026-11-23，按"好用 + 稳"取舍，已获同意执行）

| 决策 | 选定 | 理由（稳在哪） | 代价（说清楚） |
|---|---|---|---|
| §9.1 执行后端 | **只做页内中继**（页面上下文内发请求），离线重放档**不进首版** | 上游的 PoW/sentinel/conduit/签头由真浏览器自己算，我们不承担复刻私有算法的长期负债（`chatgpt_web_api/web_client.py:1107-1147`、`FreeDeepseekAPI/server.js:664-688` 就是这条路的维护成本）；凭值不落盘，红线不破 | 需要一个活着的标签页；单站并发低（首版按站串行 + 随机频控）；吞吐低于纯重放 |
| §9.2 首版站点 | **DeepSeek + 文心**；Kimi 待 M0 证据表结论再定 | 文心已有 `verified: true` 配方与 `baidu` 档案，能最快跑出第一条端到端编程链路；DeepSeek 是主力诉求 | 首版覆盖 2/8 站，其余站按证据表准入，不吹全绿 |
| §9.3 验收用例 | **我给 5 条**（§6 M2 那组），你可替换成日常真实任务 | 用例里含 `old_str` 逐字命中、取消不脏账本、压缩后仍成功，能同时打伪协议与会话账本两个要害 | 若换成你的真实任务，M2 门槛随之改 |
| §9.4 旧链路退役 | **并存到 M4，默认走新网关**；旧 DOM 链路只在网关不可用时手工降级 | 保留一条可回退路径，避免"新的没稳、旧的已拆"的真空期 | 并存期需维护两套入口，M4 后删除 `web-chat` adapter 与 DOM 专属断言 |
| §8.2 凭据 | 只允许 A（页内中继），**不导出、不落盘任何凭据值** | 取证与日志一律记"头名 + 长度 + 摘要前缀"，探针里就地脱敏（JWT/长十六进制串一律替换） | 若将来某站必须离线重放，需你重新签字 |
| 网关形态 | 复用插件既有本机 HTTP 桥（`bridge-server.ts` 的端口顺延 + 随机令牌 + 仅 `127.0.0.1`），新增 `/v1/*` | 不新开监听面、不引入新依赖，令牌机制已被现有扩展链路验证过 | 端口与令牌需在「设置 → 浏览器设置 → 网页模型」里可见可复制 |
| 工具伪协议 | 标记块 + **jsonschema 严格校验** + 一次修复重试；带 tools 时不流正文只发 keep-alive；坏协议显式报错 | DSH 对坏 `arguments` **不抛错**（`core/tools/src/batch.ts:67,99-106`），只能在我们这侧拦住，否则会污染工具执行 | 单轮单工具优先，多工具并行按需分批，延迟变高 |

## 11. M0 落地结果（2026-11-23，两站真取证，数据在 `~/.dsh/awbotdsh-browser/forensics/`）

工具已就位并跑通：

- CDP 事件面补齐：`ws-client.cjs` 的 `browserSession` 原先丢弃所有无 id 报文，新增 `onEvent(handler)`，取证才有 `Network.*` 可用。
- 取证探针 `scripts/probe-web-protocol.mts`：attach 到**正在运行的**指纹窗口（`AWBOTDSH_CDP_PORT=58880`，BROWSER pid=41544）→ 自开标签 → `Network.enable` → 一次性哨兵串定位真实会话端点 → 输出脱敏证据表。没杀任何进程、没动你现有窗口。

实测证据（本轮两站各跑一轮，均已登录态可用）：

| 站点 | 会话端点 | 正文落点（JSON 路径） | 凭据形态 | 输入上限 | 停止按钮 | 读取侧 |
|---|---|---|---|---|---|---|
| DeepSeek | `POST /api/v0/chat/completion` | `prompt`（**单个字符串**，不是 messages 数组） | 头 `authorization` + `cookie`；同域还出现 `create_pow_challenge`、`chat_session/create`、`auth_token/check_device` | 无 `maxlength` 属性（需另行实测） | 未寻到 | 需页内读流 |
| 文心 | `POST /aichat/api/conversation` | `message.query[0].data.text.query` | 头 `Cookie` + **逐消息签名头 `X-Chat-Message`** | `maxlength=20000` | 未寻到 | 轮询 `chat.baidu.com/aichat/api/messages/list`（非 SSE） |

三张结论直接写进实现：

1. **§10 的"只做页内中继"被数据证实**：DeepSeek 每轮要 PoW、文心每条消息要 `X-Chat-Message` 签名。离线重放等于要长期复刻这两套私有算法，收益不值。
2. **站点是"有状态单字符串"接口**（`prompt` / `query`），所以 §5.3 的会话账本必须做在网关侧：OpenAI 的 `messages[]` 由我们压缩成一载荷并只发增量，历史前缀与分叉判定由账本负责，绝不能指望站点。
3. **流式不能靠抓包证明**：CDP `eventSourceMessageReceived` 只覆盖 EventSource，覆盖不到 `fetch` 的 ReadableStream，因此两站都记成 `transport: unknown`。这正是"页内中继由我们自己读流"的理由——网关在页面上下文里 `fetch` 并分块回传，不依赖站点帧格式被我们看见（列为 M1 的第一件事）。

M0 期间我自己写坏过两次工具，都已修并留此记录：一是 `SECRET_VALUE` 正则里字符类含 `/` 导致 TS 解析失败（改 `new RegExp`）；二是**脱敏漏了两类**——字段值里夹带的 `tk=<base64>` 与 `responses[].url` 的整条查询串会把会话令牌写进证据文件。已补 `maskEmbedded()` 与 `safeUrl()`（只留 origin+路径，参数另记**名字**），并把污染的 3 份文件销毁后重跑，现在两份文件长串残留均为 0。

M0 未完成项：DeepSeek 真实输入上限、Kimi/豆包等其余站点证据表。

**页内中继已实测通过（推翻"只能完成后取"的判断）**：`src/gateway/relay.ts`（fetch + **XHR 双入口**旁听，`tee()` 一路原样交还站点、一路进队列；队列键与"看到过哪些端点"随排空一起回报）+ `scripts/probe-relay.mts` 真机结果：

| 站点 | 结果 | 入口 | 分块/时间 | 附带收获 |
|---|---|---|---|---|
| DeepSeek | `streamed` 3 批 / 1128 字 | **`xhr /api/v0/chat/completion`** | 213ms→1034ms | 首帧即含 `request_message_id`、`response_message_id` → 回合锚点用协议 id，不必文本匹配（§5.4 落地依据） |
| 文心 | `streamed` 8 批 / 11320 字 | `fetch /aichat/api/conversation` | 237ms→2956ms | 帧形 `event:basedata / data:{…}`，可增量解析 |

第一次 DeepSeek 报 `silent`，原因是**它用 XMLHttpRequest 不用 fetch**——只包 fetch 会得出错误结论。因此中继实现从一开始就是双入口，并把 `seen` 作为自证：`seen` 为空说明站点绕过两个入口或这一轮没发出去，不再拿"静默"当判断。

### 11.1 落地进度（2026-11-24，代码在 DSH 仓 `packages/client/awbotdsh-browser/`，提交 `7cc4a6cf`）

| 阶段 | 状态 | 依据 |
|---|---|---|
| M0 取证（端点 / 正文落点 / 凭据形态） | ✅ | 上表，`scripts/probe-web-protocol.mts` |
| T1 页内协议中继 | ✅ | `src/gateway/relay.ts`：fetch + XHR 双入口、`seen` 自证，不再把"静默"当判断 |
| T2 本地 OpenAI 兼容网关 | ✅ | `src/gateway/server.ts`：`/v1/models` + `/v1/chat/completions`（SSE 与 JSON 双形态）、客户端断连不落账、空正文回 502 |
| T3 会话账本与落盘 | ✅ | `ledger.ts`（前缀匹配 / 分叉 / 100 条 / 2 小时）+ `ledger-store.ts`（原子替换、共享读盘、mtime 失效重读） |
| T4 工具伪协议 | ✅ | `tools.ts`：标记块 + JSON Schema 子集校验；坏 `arguments` 在网关侧就拦住，不交给 DSH |
| T5 真站跑通 | ✅ | DeepSeek 连续两轮正常；工具轮产出合法 `tool_calls`（`scripts/gateway-live-check.mts`、`gateway-live-tools-check.mts`） |
| T5.1 真站暴露的缺陷 | ✅ 已修 | SSE 漏 `data:` 前缀；按事件数而非字符数判成败；BATCH 的 `p:"response"` 抢走正文续写路径；账本并发丢键；跨实例陈旧缓存 |
| T5.2 站点会话证实 → 启用增量 | ✅ 真站实测通过 | 会话标识改为按 URL 结构判定（路由段 / 哈希路由 / 查询参数，段名白名单 `c\|chat\|conversation\|session`），DSH 仓 `awbotdsh-browser/src/gateway/sites.ts` 的 `siteSessionFromHref`；真机第二轮 `同一会话: true`、只发增量且答案延续了首轮上下文（`scripts/gateway-live-check.mts`，档案 baidu，attach 58880）。自测抓到两处形态缺陷：`?chat_id=` 漏读、`/api/v0/chat/completion` 被误当会话，均已修并钉进 `tests/gateway-sites.spec.ts`（9 条） |
| T5.3 文心接入 | ⛔ 停 | 自动轮次触发图形验证码，按红线不绕过；未取证站点不接入 |
| T6 模型自动进模型服务 + 面板展示 | ✅ 代码就位，UI 待真机复核 | 新增 `src/gateway/provider.ts` 的 `GatewayLlmAdapter`：插件一开就把网关模型注册成提供方「网页模型网关（AWBotDSH）」，`设置 → 模型服务` 里直接选，不必手填渠道；它走的是与外部渠道**同一个** 127.0.0.1 入口，行为与故障一致。面板仍给可复制的 Base URL / Key 供外部渠道使用，旧 Chrome 桥降为第二张卡并标注"一个版本周期后退役" |
| T8 装配韧性 | ✅ | 聊天里网页模型整块消失过一次：`registerAdapter` 挂在 `registerWebChat` 尾部，前面任一步抛错就永远走不到。现按 `src/gateway/init-steps.ts` 逐步隔离，两个提供方各自走 `registerProvider`（直接注册失败退到 effect 重试），结果写进状态接口 `init.reports/summary` 并显示在面板；网关 `ensureStarted` 让端口被占/未登录在下一次请求自愈 |
| T7 退役旧 DOM 链路 | ⏳ | `src/webchat/` 保留一个版本周期；`.oxlintrc.staged.json` 里对该目录的豁免随删除一并撤掉 |

**验证口径**：`packages/client/awbotdsh-browser/tests/` 13 个文件 142 用例通过；结构门 `scripts/check-webchat-parts.mts` 39 项通过（含 5 项韧性回归锁：禁止再出现"注册裸挂在 effect 上"）；host 与 client 两个聚合检查各 0 error；staged oxlint 0 error；网关代码内无凭据字段、无整包正文日志。真站两项实测：两轮问答（第二轮走增量）与工具轮 `finish_reason: tool_calls` + 参数通过模式校验。

**未验证**：新提供方在真界面 `设置 → 模型服务` 里的呈现（要装新包才能看到）；`*.client.spec.ts` 之外没有跑过真机 provider 端到端（真机端到端此前是走 HTTP 渠道验的）。

## 12. 证据索引（自查用）

- DSH：`packages/llm/llm/src/index.ts:190-285`（adapter 契约）、`llm-pi-ai/src/index.ts:29-53`（openai-completions 渠道，UI 可配）、`packages/core/agent-loop/src/agent.ts:298,485,675,741-749`（每步带 tools、AbortSignal）、`llm/src/types.ts:490` + `llm/src/assembler.ts:69-76,113-118,135-140`（tool-call-delta 聚合与截断丢弃）、`core/tools/src/batch.ts:67,99-106`（坏 arguments 不抛错→必须在上游拦住）、`compaction-basic/src/config.ts:142-208` + `llm-retry/src/index.ts:221-238`（预算与 Retry-After）。
- 我方（新链路，已入仓）：`awbotdsh-browser/src/gateway/{relay,frames,extract/deepseek,ledger,ledger-store,payload,tools,server,web-runner,cdp-page,sites,gateway-service}.ts`、`tests/`（10 文件 115 用例）、`scripts/{probe-web-protocol,probe-relay,probe-deepseek-patch,gateway-live-check,gateway-live-tools-check}.mts`。
- 我方（旧 DOM 链路，待退役）：`awbotdsh-browser/src/webchat/{recipes,ask,adapter,prune,bridge-server}.ts`、`vendor/{fingerprint,launch,ws-client,rpa-runner}.cjs`、`bundled-extensions/chrome-bridge-extension/background.js:8,240-321`、`scripts/check-webchat-parts.mts`。
- 参考项目（本地已解包 `.tmp/refllm/`）：`identity_listener.py`、`turn_anchor.py`、`breakers.py`／`api-server.ts`、`refresh-policy.ts`、`errors/index.ts`、`types.ts`／`server.js:2501-2546,2930-2984`、`conversation_store.py:64-91`、`tool_bridge.py`、`content.py:59-85`、`message_compiler.py:48-53`（反面）。
