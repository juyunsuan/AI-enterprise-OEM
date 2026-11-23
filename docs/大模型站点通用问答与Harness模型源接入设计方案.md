# 大模型站点通用问答与 Harness 模型源接入设计方案

> 版本：v0.1（方案稿） · 日期：2026-11-22 · 状态：待决策（见 §九）
>
> **2026-11-23 执行路径更新**：本文的"输入框打字 + 读 DOM 文本"实现路径已被判定无法支撑 AI 编程，
> 主干改由 [`docs/网页模型源重构方案（协议网关+OpenAI兼容+工具伪协议）.md`](网页模型源重构方案（协议网关+OpenAI兼容+工具伪协议）.md)（待审）取代。
> 本文仍是**红线与站点口径的事实源**（§凭据、频控、不绕验证码、权限不扩大等），重构方案里与之冲突的四条已在该文档 §8 逐条列出待签字。
>
> 本方案合并三条递进需求：① 在现有 Chrome 插件里让 DeepSeek / 文心 / 豆包可自动输入并获取回复；
> ② 扩展到 Kimi / GLM 等大部分大模型站点；③ 让 DeepSeek Harness 把"浏览器窗口里的对话"当作模型源调用。
>
> 事实口径：本文只写"已核实的项目事实 + 外部公开实践"。凡未在本项目真机验证的，一律显式标注
> 「外部实践 / 待验证」，不当作本项目既有能力。契约与生成物一律写指向，不复制正文（遵守第一红线）。

---

## 一、目标与范围

### 1.1 目标态

| 编号 | 需求 | 目标态 |
|---|---|---|
| G1 | 三家站点自动问答 | 插件在已登录的 DeepSeek / 文心 / 豆包对话页，自动填入问题、发送、等生成完成、抓回完整回复 |
| G2 | 覆盖大部分站点 | 用一张"站点配方表"扩展到 Kimi / GLM / 千问 / 元宝 / 星火等，新增站点＝加配置，不改插件内核 |
| G3 | 作为 Harness 模型源 | DeepSeek Harness 通过一个标准 LLM 接口调用上述网页对话，复用其 agent loop / tools / session |

### 1.2 明确不做的（范围护栏）

- 不做 **API 直连**替代：本方案的价值前提是"复用你已登录的网页会话 / 会员额度 / 真实网页答案"。要算得快、要稳定的场景请直接走各站官方 API，不在本方案内。
- 不新增 **RPA 动作原语**：全部复用现有闭集（见 §2.2），避免触发 `scripts/verify-extension-caps.mjs` 的四处零差异校验。
- 不改 **官方 Harness 代码**：无论方式 A / B，都不动 `packages/`、`apps/`、`vendor/`。
- 不读 **Cookie / 口令 / 验证码**：沿用插件既有安全口径，只复用浏览器已登录会话与可见 DOM。

### 1.3 关键判断（先给结论）

**三条需求技术上都没有硬障碍，且共用同一套底座。** G1/G2 是"插件驱动网页问答"，G3 是"把这条驱动链包装成 LLM 接口"。
G1 的闭环用现有原语即可跑通；G2 的边际成本随站点数递减；G3 有两条落点（§5.1），推荐先做 A。

---

## 二、现状盘点：可直接复用的地基

### 2.1 插件侧（已核实）

- `extensions/aipdd-enterprise/manifest.json`（v1.6.0，MV3）：已申请 `<all_urls>` 站点权限与 `scripting` 动态注入权限。
  因此 G1/G2 的目标站点**不需改 manifest、不需逐站点授权**。
- `extensions/aipdd-enterprise/rpa-executor.js`：闭集动作执行器，内含
  - `act:type`：`setNativeValue` + `fireInput`（input/textarea 已兼容 React 受控组件），且 `el.isContentEditable` 分支直接写 `textContent`；
  - `act:click`：合成 pointer/mouse 事件 + 原生 `click()`；
  - `act:key`：对当前焦点发 Enter（DeepSeek / Kimi 默认 Enter 发送）；
  - `wait_for`：`text` / `text_gone` / `url` 三种完成判定；
  - `read`（`text` / `attribute` / `count` / `all`）：`all` 模式按 selector 读整组文本数组。
  - 多候选 target 与 elementIndex 会话缓冲：与"选择器多候选兜底"天然契合。
- `extensions/aipdd-enterprise/chrome-agent.js`：已有"页面观测 → `/decide` → 本机执行 → 消息卡"的逐步编排循环，
  并带 `modelKey` 参数与 `autoRun`（自动 / 确认后执行）开关。
- `extensions/aipdd-enterprise/chrome-rpa.js`：设备通道与心跳，含 `NEED_LOGIN` / `CAPTCHA` / `RISK_CONTROL` 等停止并保留标签页的既有流程。

> **重要工程约束（已核实）**：插件存在两份内容一致的副本——
> `extensions/aipdd-enterprise/` 与 `bot-host-client/builtin-extensions/aipdd-enterprise/`。
> 任何插件侧改动必须同步两处，否则 `scripts/verify-extension-caps.mjs` 的站点矩阵 / 原语指纹比对会失败。

### 2.2 闭集动作（指向契约，不复制）

动作闭集与读法以 `packages/contracts/src/chrome-rpa.ts` 的 `RC_ACTIONS` / `RC_ACT_INTERACTIONS` / `RC_READ_MODES`
为唯一事实源；能力声明以 `packages/contracts/src/extension.ts` 的 `EXTENSION_CAPABILITIES` 为准。
本方案 **不新增任何原语**，因此不触碰校验脚本对 `IMPLEMENTED_PRIMITIVES`、错误码词表、协议版本、
站点矩阵、manifest 版本、限额常量的一致性比对。

### 2.3 Harness 侧（已核实）

- `awbot-app/app/assets/skills/dsh-go-plugin/SKILL.md` 明确划分：dsh-go 手机原生界面用该技能；
  **Cordis / Harness Web / 桌面端插件走官方流程**，两者目录与安装入口不同，不能混用。
- `awbot-app/packages/dsh_client/lib/src/providers_api.dart`（已核实）：工作区已有把"自定义 OpenAI / Anthropic 兼容端点"
  注册进内置 `llm-pi-ai` 适配器的完整客户端逻辑——通过 `settings/mutate` 写 `providers.<route>`，
  密钥走 `credentials/set`，`llm/discoverModels` 可探活；配置运行时生效、无需重启。
  支持 `openai-completions` / `openai-responses` / `anthropic-messages` 三种协议。
  **这是方式 A 的现成抓手，不是新造轮子。**
- `docs/dsh/slot-catalog-0.2.2-rc.5.json`：槽位目录，供界面落点参考。

### 2.4 缺口（本次真正要造的）

1. **站点配方表**：把每个站点的"输入框 / 发送 / 完成 / 回复区"四类选择器抽成配置（G1/G2）。
2. **问答编排**：把现有"网页操作"原语组合成"提问一次 → 拿回完整回复"的确定性流程（G1/G2）。
3. **桥接服务**：一个本地 HTTP 端点，把上述流程暴露成标准 LLM 接口（G3）。
4. **工具协议适配**：网页无原生 tool calling，需用文本协议模拟（G3，仅当要跑 agent 工具链时需要）。

---

## 三、总体架构

### 3.1 G1/G2：多站点问答闭环

```
用户问题 + 站点列表
        │
        ▼
站点注册表（四要素：输入框 / 发送 / 完成 / 回复区，多候选）
        │
        ▼
统一执行器（复用闭集原语，零新增）
  navigate → act:type → act:click|act:key → wait_for(完成) → read:all
        │
        ▼
回复归一化（去空、按站点去重、失败如实标记）
        │
        ▼
侧边栏展示 / 回写台账（去向沿用现有"只回对话 / 采集台账 / 多维表格"口径）
```

### 3.2 G3：Harness 模型源链路

```
DeepSeek Harness (agent loop / tools / session)
        │  GenerateOptions.messages
        ▼
[方式 A] 内置 llm-pi-ai  → 本地 OpenAI 兼容端点   ← 推荐
[方式 B] 自定义 LlmAdapter → 本地桥接服务
        │
        ▼
桥接服务（请求排队 / 会话 ID / SSE → OpenAI stream 分片）
        │  ↔  插件侧边栏 / 设备通道
        ▼
浏览器已登录窗口（DeepSeek / Kimi / GLM / …）
        │  流式碎片 → 完成判定 → 完整回复
        ▼
逐字 yield 回 Harness（text-delta / tool-call / finish）
```

---

## 四、第一部分：多站点通用问答适配（G1 / G2）

### 4.1 站点注册表配方 schema（建议）

每条配方描述"如何向这个站点提一次问并拿回答案"，四类选择器**一律用数组做多候选**。
这是本方案的核心抽象，字段建议如下（落库形态见 §4.5 决策 D1）：

| 字段 | 类型 | 用途 |
|---|---|---|
| `id` | string | 站点唯一标识（如 `deepseek` / `kimi`） |
| `name` | string | 展示名 |
| `startUrl` | string | 对话起始地址 |
| `inputSelector` | string[] | 输入框候选，按优先级；同时供 `snapshot` 定位 |
| `inputType` | `textarea` \| `contenteditable` | 决定填充分支（现有执行器两者都支持） |
| `sendMode` | `click` \| `enter` | 发送方式 |
| `sendSelector` | string[] | `click` 模式的按钮候选 |
| `doneRule` | object | 完成判定：`goneSelector`（停止按钮消失）/ `stableMs`（文本连续不变）/ `timeoutMs` |
| `replySelector` | string[] | 回复正文候选（`read:all` 用） |
| `loggedOutSelector` | string[] | 未登录标志，命中即报 `NEED_LOGIN` |
| `captchaSelector` | string[] | 验证码 / 风控标志，命中即停止 |
| `modelSwitch` | object? | 可选：模型下拉触发器 / 候选项（如 Kimi 的 `.current-model`） |
| `minIntervalMs` / `maxIntervalMs` | number | 该站频控区间 |

> 设计要点：`doneRule.stableMs` 必须存在且不可省。外部实践（见附录）普遍采用
> 「连续 3 秒内容不再变化视为生成完毕」；只等固定秒数会在长回答上截断、短回答上浪费。

### 4.2 输入框两派：现有执行器已兼容（无需改代码）

- **textarea 派**（DeepSeek、文心、`chatglm` 部分形态）：`setNativeValue` + `fireInput` 已覆盖。
- **contenteditable 派**（Kimi Lexical、豆包、GLM、千问部分形态）：`el.isContentEditable` 分支写 `textContent` 已覆盖；
  富文本若遇 `execCommand('insertText')` 才生效的站点，作为**待验证项**在真机上确认后再决定是否微调执行器
  （微调仍属 action 内实现，不新增原语，不触发契约比对）。

### 4.3 "发送"是敏感动作：必须给出策略

现有契约对命中"发送"等关键词的 `click` 默认要求人工确认。批量问答若逐步确认不可用。
建议按站点能力声明把"向 AI 对话页发送消息"列为**可免确认动作**，但保留两条硬闸：
- 只对配方声明的对话页生效，不对任意页面生效；
- 首次使用某站点时弹一次确认，之后按账号设置记住（沿用 `confirmSensitive` 同款机制）。

> 该项列入决策 D3。默认推荐：保留一次确认 + 此后免确认，不做全局免确认。

### 4.4 完成判定与回复归一化（决定数据质量的关键）

- 每次提问按 `doneRule` 判定完成；超时按"结果未知"处理，**不自动重发**（沿用插件既有口径）。
- 回复抽取后做三件事：去空白、按 `replySelector` 顺序取最后一组有效文本、空结果记 `PAGE_CHANGED` 而非成功。
- 外部实践特别提醒：选择器漂移时表现为"抽到空字符串"而非抛错，因此**空结果必须判为失败**，
  否则会静默污染数据。

### 4.5 配方放哪里（决策 D1）

| 落点 | 优点 | 代价 |
|---|---|---|
| 服务端配置表（推荐） | 改版只改配置、不发插件新版本；多设备统一 | 需新增一处配置存储与下发端点（属新 HTTP 接口，按 `docs/dev-kit/rules/contracts.md` 走） |
| 写死在插件内 | 最快 | 每次改选择器都要发版；两份副本同步；与 `<all_urls>` 动态站点矩阵口径不一致 |

推荐服务端下发，并在插件侧做配方缓存与版本号；站点改版时只动配置。

### 4.6 频控与登录态

- 站点间**串行**，站点内按 `minIntervalMs`–`maxIntervalMs` 随机间隔，禁止并发猛冲（外部实践明确提示风控风险）。
- 每轮先以 `loggedOutSelector` 探活：命中即报 `NEED_LOGIN`、标签页切前台请用户就地登录。
- 登录态有效期按外部实践约 7–15 天，探活失败即重建，不假设长期有效。

---

## 五、第二部分：作为 Harness 模型源（G3）

### 5.1 两种落点对比与推荐

| | 方式 A：OpenAI 兼容本地端点（推荐先做） | 方式 B：自写 LlmAdapter |
|---|---|---|
| 官方代码改动 | 零 | 零（但要新增插件包） |
| 现成抓手 | `providers_api.dart` 已实现注册逻辑 | 官方文档骨架 + 外部现成实现可参考 |
| 工具调用 | 有损，靠 JSON 文本协议模拟 | 原生 `tool-call-delta`，能力无损 |
| 定制能力 | 受 OpenAI 协议字段限制 | 可覆写 `resolveModel` / `listModels` |
| 适合 | 先跑通、验证价值 | 要完整 agent 工具链 / 多模型选择 |

推荐顺序：**先 A 打通最小闭环（单站点、纯问答），确认价值后再评估是否上 B。**
两者共用同一个桥接服务与站点注册表，切换成本低。

### 5.2 方式 A：本地 OpenAI 兼容端点

- 桥接服务实现 `POST /v1/chat/completions`（`stream: true`），对外伪装成 OpenAI 兼容提供方。
- 用 `providers_api.dart` 的既有能力注册路由：`settings/mutate` 写 `providers.<route>`，
  key 用 `credentials/set` 以 `ref:` 存引用（本机端点可填占位 key），`llm/discoverModels` 探活。
- 配置 `volatile`，运行时生效、无需重启 Harness。
- 站点选择：`model` 字段用 `web-deepseek` / `web-kimi` / `web-glm` 这类 id 路由到不同配方。

> 待验证项：工作区里的 `dsh_client` 是 Dart 客户端 SDK，需确认你的 Harness 运行形态
> （Web / 桌面 / dsh-go 手机 App）是否暴露等价的 `settings/mutate` 入口。若手机 App 不暴露，则改走方式 B。

### 5.3 方式 B：自写 LlmAdapter（接口已核实）

官方接口（`develop/practice/llm-adapter`）：

```ts
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class WebChatAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. options.messages → 网页提示词（含任务锚点）
    // 2. 经桥接服务驱动插件提问，拿回完整回复
    // 3. 按 StreamChunk 协议逐块 yield
  }
}

export const name = 'web-chat-adapter'
export const inject = ['llm']
export function apply(ctx) {
  ctx.llm.registerAdapter(['web-llm'], new WebChatAdapter())
}
```

`StreamChunk` 协议（已核实，须严格遵守）：
`block-start` → `text-delta`* → `block-end` →（`tool-call-delta` → `block-end` 工具块）→ `usage` → `finish`。
`finish` 必须最后，`usage` 必须在 `finish` 前；`index` 从 0 递增；每个 `block-start` 对应一个 `block-end`。

安装（已核实）：`cordis.yml` patch 中以 `insert` 指向插件模块绝对路径，
`pnpm dsh web --patch ./...` 或 `dsh plugin --profile web add <目录>`。
错误处理用 `LlmError` / `LlmError.fromFailure`（带稳定 code），普通 `Error` 不会自动转换。

### 5.4 桥接服务设计（两种方式的共用层）

职责：把"一次 LLM 请求"翻译成"一次网页问答"，并把结果流式回传。

- **请求队列**：单站点串行；不同站点可并行但有全局频控；每请求带 `sessionId` 与超时。
- **与插件通信**：本地 HTTP/WebSocket，插件侧由侧边栏或设备通道接收任务（落点见 D2）。
- **流式转换**：网页端是"等完整回复"，Harness 要的是"逐字分片"。折中做法——
  拿到完整回复后按固定长度切片 yield `text-delta`，`usage` 填估算值、`finish` 填 `stop`。
  这是"伪流式"，对 agent loop 无感，但不是真 token 级流式（列为已知限制）。
- **SSE 碎片**：若改从网页 SSE 直接转真流式，需处理 DeepSeek 的 fragments upsert + JSON Pointer 补丁
  （外部实现用"补丁状态机"按 fragment id 去重并按序拼接）。首版不做，列为可选增强。

### 5.5 工具调用协议（仅 agent 工具链需要）

网页版无原生 tool calling。外部已验证的做法：
- 通过系统提示词约定"要调用工具时只输出指定 JSON，任务完成直接输出正文"；
- 适配器侧写 `response.ts` 把自由文本解析回结构化动作，产出 `tool-call-delta` 分片；
- 工具白名单默认只放核心工具，过滤需独立 key 的 `web_search`；工具结果超长按头尾截断；
- 每轮重申"当前用户任务"锚点，防止网页模型反问"请提供任务"。

首版若只验证"把网页对话当聊天模型"，可跳过本节；要跑完整 agent 任务再启用。

### 5.6 上下文检查点

网页免费通道上下文有限且会退化。沿用外部实践：单会话超过阈值（外部示例为 12 轮 / 12 万字符）
时提示"开新对话继续"或"保持当前对话"，并保留 Harness 侧会话历史用于恢复。该阈值做配置项，不写死。

---

## 六、站点配方清单（首版建议 8 站）

> 下表选择器来自**外部公开实践（2026 年）**，仅作初始配方参考；上线前必须逐站真机核对，
> 并以多候选 + 空结果判失败的策略兜底漂移。本表不是本项目已验证事实。

| 站点 | 起始地址 | 输入框 | 发送 | 回复区 | 备注 |
|---|---|---|---|---|---|
| DeepSeek | `chat.deepseek.com` | `textarea.ds-scroll-area` / `textarea[placeholder*='DeepSeek']` | Enter | `div.ds-markdown--block` | 最稳，首站 |
| Kimi | `www.kimi.com` | `.chat-input-editor` / `[data-lexical-editor='true']` | Enter | 消息气泡容器 | Lexical 富文本；有模型下拉 |
| 豆包 | `www.doubao.com/chat/` | `div[contenteditable='true']` / `textarea` | 发送按钮 / Enter | `div.response-content` | 风控较严，频率要低 |
| 文心 | `wenxin.baidu.com` | contenteditable / textarea（多候选） | 发送按钮 | 消息气泡容器 | 登录态易失效，必做探活 |
| 智谱清言 GLM | `chatglm.cn` | contenteditable（待核对） | 发送按钮 | 消息气泡容器 | 也有官方 API 可对照 |
| 通义千问 | `qianwen.aliyun.com` | contenteditable / textarea | 发送按钮 | 消息气泡容器 | — |
| 腾讯元宝 | `yuanbao.tencent.com` | contenteditable（待核对） | 发送按钮 | 消息气泡容器 | — |
| 讯飞星火 | `xinghuo.xfyun.cn` | contenteditable（待核对） | 发送按钮 | 消息气泡容器 | — |

外部已验证的覆盖组合（供信心参考，非本项目能力）：某商业 GEO 工具覆盖上述 8 站；
某开源 MCP 服务覆盖豆包 / 智谱清言 / DeepSeek / 千问 / 元宝 5 站；
某个人项目把 DeepSeek 免费网页版包装成标准 LLM Provider 接入 Harness 并跑通完整 coding agent 任务。

---

## 七、安全与合规边界

- **权限不扩大**：不新增 manifest 权限；`<all_urls>` 与 `scripting` 已覆盖目标站点。
- **凭据不出本机**：只用已登录会话与可见 DOM；不读 Cookie、不读口令、不绕过验证码 / 风控。
- **敏感动作**：沿用既有确认与黑名单机制；"发送"策略按 D3 执行。
- **结果未知不重试**：回执失败只报未知，不自动重发，避免重复提问 / 重复消费额度。
- **频控**：串行 + 随机间隔；单站可配冷却；遇验证码 / 登录墙立即停止并保留标签页。
- **数据去向**：抓回的回复按现有"只回对话 / 采集台账 / 多维表格"口径选择，不新增存储通道。
- **合规提示**：网页自动化属非官方途径，各站 ToS 与风控策略可能变化；本方案不承诺长期稳定，
  站点改版或封禁应如实降级并提示改用官方 API。

---

## 八、实施批次

> 一次交付一个可验证闭环；每批完成才进下一批。项目红线要求完成后执行
> `pnpm typecheck && pnpm lint && pnpm check:architecture`（本方案后续涉及代码时）。

**批次 1｜G1 单站闭环（DeepSeek）**
- 站点注册表落地 + DeepSeek 配方；问答编排串接五步原语；侧边栏"一问一答"入口；完成判定与空结果判失败。
- 验收：在已登录 DeepSeek 的浏览器上，输入问题可自动填、发、等、抓回完整回复；断网 / 未登录 / 验证码各自正确停下。

**批次 2｜G2 扩展到多站**
- 加 Kimi / GLM / 豆包 / 文心 配方；串行频控；登录探活；多选一问多答 + 汇总展示。
- 验收：4 站各跑通一轮；人为改坏一个选择器时该站报 `PAGE_CHANGED` 且不影响其他站。

**批次 3｜G3 模型源最小闭环（方式 A）**
- 本地 OpenAI 兼容端点；用 `providers_api.dart` 注册路由；单站 `web-deepseek` 跑一轮 Harness 问答。
- 验收：Harness 的模型列表能看到该路由；一次问答端到端有回复，且流正常结束。

**批次 4｜能力增强（按需）**
- 方式 B 自定义 LlmAdapter（工具调用无损）；真流式 SSE 补丁状态机；上下文检查点；更多站点。

---

## 九、决策点（请按编号回复，未回复则按推荐默认执行）

- **D1｜配方落点**：推荐"服务端配置表 + 插件缓存"。若选插件内写死，改动面更小但每次改版要发版。
- **D2｜"窗口对话"指哪个**：推荐"浏览器里原生的大模型对话页"（G1/G2 的自然延伸）。
  若指"现有插件侧边栏 Composer"，则桥接服务要改为对接 `chrome-agent.js` 的设备通道，链路多一跳。
- **D3｜"发送"确认策略**：推荐"每站首次确认 + 此后记住"，不做全局免确认。
- **D4｜Harness 运行形态**：影响 A/B 选择。需确认是 Web / 桌面 / dsh-go 手机 App。
  手机 App 若不暴露 `settings/mutate`，则直接走方式 B。
- **D5｜首版站点数**：推荐先 DeepSeek 单站跑通批次 1，再扩到 4 站，不一次上 8 站。
- **D6｜抓回回复去向**：推荐首版只回侧边栏；要落库 / 回写台账再单独加。

---

## 十、验收清单（真机逐条走，不看代码想当然）

1. 未改 manifest 权限、未新增 RPA 原语；插件两份副本一致。
2. `pnpm typecheck && pnpm lint && pnpm check:architecture` 通过（涉及代码批次）。
3. 涉及契约 / 站点矩阵时，`pnpm api:docs && pnpm api:index` 与 `scripts/verify-extension-caps.mjs` 通过。
4. DeepSeek / Kimi / GLM / 豆包 各完成一次"提问 → 完整回复"，回复非空且来自 AI 回答区。
5. 人为制造未登录、验证码、选择器失效三种异常，分别正确停止且不伪造成功。
6. 站点串行、间隔随机；抓回数据无重复提问导致的双份记录。
7. 方式 A：Harness 能列出自定义路由并完成一次端到端问答；`finish` 分片正确收尾。
8. 方式 B（若做）：`StreamChunk` 序列合规，工具调用能被 agent loop 正确识别。

---

## 十一、风险与已知限制

- **选择器漂移（高）**：外部实践称主流引擎页面平均一年改两次，且漂移表现为"抽到空串"而非报错。
  缓解：多候选 + 空结果判失败 + 服务端配方热更新；不能根治。
- **伪流式（中）**：方式 A/B 首版是"拿完整回复再切片"，不是 token 级真流式；对外表现为回复一次性涌出。
- **上下文退化（中）**：网页免费通道长会话会遗忘早期细节；检查点是缓解非根治。
- **风控（中）**：全自动发送呈程序化特征；重要账号建议半自动（人工点发送）。
- **登录态（低）**：约 7–15 天失效，需探活重建。
- **合规（需持续关注）**：非官方自动化的 ToS 风险由使用场景决定，站点封禁时应如实降级并建议官方 API。

---

## 附录：外部参考与事实来源

- DeepSeek 官方文档：`api-docs.deepseek.com`（OpenAI 兼容 API、`deepseek-flash` / `deepseek-v4-pro`）。
- DeepSeek Harness 官方开发文档：`deepseek-harness.github.io/deepseek-harness/develop/basic/` 与
  `/develop/practice/llm-adapter`（LlmAdapter、StreamChunk、registerAdapter、cordis.yml patch）。
- 网页版包装成 LLM Provider 的实战：`coldish.cn/post/28`（JSON 工具协议、SSE 补丁状态机、CDP 常驻浏览器、
  上下文检查点、半自动发送）。
- 多站点 GEO 采集实践：某商业工具覆盖 8 站、某开源 MCP 覆盖 5 站（见 §六）。
- 本项目内事实源：
  - 插件与动作闭集：`extensions/aipdd-enterprise/`、`packages/contracts/src/chrome-rpa.ts`、`extension.ts`
  - 校验约束：`scripts/verify-extension-caps.mjs`
  - Harness 生态：`awbot-app/app/assets/skills/dsh-go-plugin/SKILL.md`、
    `awbot-app/packages/dsh_client/lib/src/providers_api.dart`、`docs/dsh/slot-catalog-0.2.2-rc.5.json`
