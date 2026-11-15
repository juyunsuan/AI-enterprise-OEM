# WorkBuddy 常驻握手接入方案（v1.1）

> 版本：v1.1 ｜ 日期：2026-11-13 ｜ 状态：**架构成立；「无人值守」差一次激活未闭环（见 §十一-1b）**
> 验证环境：Windows（DESKTOP-RN3FB79）｜ WorkBuddy 5.9.3 ｜ 内置 CLI 2.165.0（Node 22.22.2 / Electron 侧 node 22.21.1）
> v1.0 = WorkBuddy 侧自测；**v1.1 = BotBuddy 侧同机复测后修订**，新增 V12–V21 证据、§5.7 双 Profile 路由、§6.1 `NEEDS_ACTIVATION` 状态，并改正 6 处 v1.0 口径（详见 §十二）。
> **v3 归档说明（2026-11-14）**：执行体已收敛为 BotBuddy 客户端内置 Agent（见 `docs/Agent-Bot方案.md`），WorkBuddy/Codex 运行时不再接入；本文保留为决策证据。文中 `workbuddy-host-client` 已更名为 `bot-host-client`，当时的 ACP 探针脚本已随 v3 移除，不再可重跑。
> 定位：本文件是《Agent-Bot 与 Workbuddy 主机方案 v2.1》的**执行层补充方案**，专注回答一个问题——
>
> **平台怎么与用户本机 WorkBuddy 建立长期稳定的握手，让任何 Agent 发布的任务都能同步过去并拿到结果。**

---

## 一、目标与形态

### 1.1 一句话形态

```
平台任一 Agent 发布任务
  → 平台任务中心（MyTask）
  → 主机客户端 BotBuddy（用户 PC 上常驻的 exe）
  → 本机 WorkBuddy 运行时（由 exe 拉起并持有）
  → 在约定工作区执行（读文件 / 写文件 / 跑命令）
  → 结果与进度沿原路回流 → 平台任务办结
```

用户视角：装一个 exe、配一次码，之后**不用打开 WorkBuddy、不用管端口、不用点确认**，平台上的任务自动落到他电脑上跑完。

> ★**2026-11-13 复测后的口径修正**：这句话里有半句今天做不到。自托管运行时**不继承 WorkBuddy 登录态**（V17），所以"配一次码"之后还需要**一次运行时激活**（走 ACP `authenticate`，四种登录方式实测可用，V19）。修正后的用户承诺：
>
> **装一个 exe、配一次码、激活一次，之后不用打开 WorkBuddy、不用管端口、不用点确认。**
>
> 在激活完成之前，主机状态显示 `NEEDS_ACTIVATION`（新增状态，见 §6.1），任务在平台侧排队不丢、不下发——绝不能把未激活主机报成"在线可用"。

### 1.2 与「飞书 × WorkBuddy」对接的关系

| 维度 | 飞书对接 | 本方案 |
| --- | --- | --- |
| 连接发起方 | WorkBuddy 主动连出（Connector） | exe 主动连出平台 **+** exe 主动拉起 WorkBuddy |
| 协议 | 官方 Connector / MCP | 本机 ACP over HTTP（非公开） |
| 升级影响 | 官方保证 | **可能随 WorkBuddy 版本变化**（见第九节） |
| 实时性 | IM 级 | 心跳周期级（5s），二期可 WSS |
| 适用 | 人发消息给 Agent | 系统派活给 Agent |

**结论**：飞书是「人找 Agent」，本方案是「系统派活给 Agent」，形态必然不同；但二期应补一条与飞书同构的「拉模式」（平台做成 MCP server，见 9.2），两条腿走路。

### 1.3 关键设计决策：自托管，不挂靠

这是本方案与 v2.1 原设计的**唯一实质性分歧**，也是"能不能长期握手"的分水岭。

| | 方案 A：挂靠（v2.1 原设计） | 方案 B：自托管（本方案，推荐） | 复测判定 |
| --- | --- | --- | --- |
| 做法 | exe 扫描端口，挂到用户桌面正在跑的那个会话 | exe 用官方 CLI 拉起**自己的** headless 运行时 | B 可行，但必须带两个 env（V12） |
| 端口 | 每次随机，会话回收即失效 | 可 `--port` 指定**固定端口** | B ✅ 实测 45871 稳定（V13） |
| 会话 | `session/new` **永远**返回用户活跃会话，prompt 必然注入 | 独立 `--session-id`，与用户桌面完全隔离 | A ❌ 两次独立 `session/new` 都拿到活跃会话（V15）；B ✅ 返回我们指定的 id（V16） |
| 窗口 | 依赖用户开着 WorkBuddy | 无窗口后台进程，用户无感 | B ✅；就绪 1.5–1.7s 不是亚秒（V13） |
| 权限 | 继承桌面会话设置，不可控 | `--permission-mode` / `--tools` / `--add-dir` 进程级可控 | B ✅ flag 层 6 个 mode 值（`fullAccess`/`delegate` 只能在运行中经 ACP 切） |
| 稳定性 | 用户关窗/切会话/升级都会断 | exe 管生管死，断了重启即可 | B ✅，且 Job Object 由 launcher 自带（V21） |
| **登录态** | ★**继承用户已登录的桌面会话 → 开箱能跑** | ★**不继承，必须先激活一次**（V17） | **A 唯一的、也是决定性的优势** |

> 一句话：**不要让 exe 去"找" WorkBuddy，让 exe "拉起并持有" WorkBuddy。**
>
> ★复测后的补一句：B 是终态，但 A 手里握着唯一的登录态。所以**不要一次性切换到 B**——落地形态是**双 Profile 并存**（见 §5.7）：
>
> - `profile=managed`（B，默认目标形态）：隔离会话、固定端口、进程级权限，任务静默跑，前提是主机已完成激活；
> - `profile=attach`（A，过渡与兜底）：**只在用户明示"发到当前 WorkBuddy 对话"时启用**，UI 必须写明"任务会出现在你正在聊的会话里"，绝不后台静默注入；它同时充当未激活主机唯一的执行通道。
>
> 平台侧据此把主机状态分成"可静默派活 / 只能明示注入 / 需要激活"三档，而不是只有在线/离线。

---

## 二、实测证据（本次验证结论）

### 2.1 验证清单

> V1–V11 由 WorkBuddy 侧自测（2026-11-13 上午）；**V12–V20 由 BotBuddy 侧在同一台机器（DESKTOP-RN3FB79 / WorkBuddy 5.9.3 / CLI 2.165.0）复测**，用的是当时仓库里的 `bot-host-client/tools/wb-managed-sidecar-probe.js`、`wb-auth-probe.js`、`workbuddy-registry-probe.js`（v3 已移除），命令与结果逐条对齐。

| # | 验证项 | 结果 | 证据 |
| --- | --- | --- | --- |
| V1 | WorkBuddy 常驻进程可枚举 | ✅ | `tasklist` 见多实例 `WorkBuddy.exe` |
| V2 | 会话运行时是独立 sidecar 进程 | ✅ | `daemon.log`：`spawn details: command=F:\Program Files\WorkBuddy\WorkBuddy.exe, args=<...cli\bin\codebuddy> --serve --session-id=... --permission-mode=... --model=...` |
| V3 | 端口是 per-session 随机分配 | ✅ | 同一 sessionId 先后绑定 `51577`(pid 20048) 与 `53407`(pid 31128) |
| V4 | 端口被登记在文件中（可确定性发现） | ✅ | `~/.workbuddy/sessions/<pid>.json` 含 `endpoint` / `sessionId` / `cwd` / `lastHeartbeat` |
| V5 | 会话回收即端口关闭 | ✅ | `daemon.log`：`Session 951c… cleaned up (0 remaining)` → 51577 消失 |
| V6 | 冷启动极快 | ⚠️ 口径修正 | 254–281ms 是 **daemon 日志里 sidecar 内部 ready**；★BotBuddy 端到端可见就绪 **1.5–1.7s**（V13） |
| V7 | `POST /api/v1/acp/connect` 可取凭据 | ✅ | 返回 `{"connectionId":"01a1d2fe-…","sessionToken":"JWToLz…"}`（桌面 sidecar） |
| V8 | `initialize` 握手成功 | ✅ | `protocolVersion:1`，`agentCapabilities` 含 `image`/`embeddedContext`/`loadSession`/`multitaskSupport` |
| V9 | `session/new` 可用 | ✅ | 返回 sessionId + `configOptions`（mode / model 全表） |
| V10 | 官方 CLI 参数表可用 `--help` 全量导出 | ⚠️ 有条件 | ★`--help` 必须带 `ELECTRON_RUN_AS_NODE=1 CODEBUDDY_FORCE_LITE_WB_BUNDLE=1` 才出表（12987 字节）；不带 env 时走 GUI 主进程，输出是 NetProxy 启动日志（V12） |
| V11 | `session/prompt` 落盘 | ❌ **未通过**（自托管） | ★实测 `stopReason=refusal`、零文本输出，日志 `Please use /login command to sign in to your account` + `AuthRefresh failed`；**自托管运行时不继承 WorkBuddy 登录态**（V16/V17） |
| V12 | 自托管 spawn 的**必需 env** | ✅（含反例） | 裸 spawn → exit 0 无输出；`MODULE_NOT_FOUND ../dist/codebuddy`（本机只有 `codebuddy-lite-wb.mjs`）；补两个 env 后正常 |
| V13 | 固定 `--port` + 稳定 `--session-id` 同时生效 | ✅ | 45871 稳定 LISTENING（`netstat` 对到 pid），注册文件 `{sessionId: 我们指定的, kind:"interactive", cwd: 工作区, endpoint:"http://127.0.0.1:45871"}`；重启 5 次的稳定性仍按 §十一-3 继续观察，本轮 3 次重启均命中同一端口 |
| V14 | ACP 面的鉴权实况 | ✅（结论与 v1.0 相反） | ★`--auth password` **不守 ACP**：connect 全程不用密码，只有 `x-codebuddy-request` 头是门槛；带横幅密码的 6 种鉴权组合反而全部 403，补该头 7 种变体全 200（`wb-auth-probe.js`） |
| V15 | **挂靠模式能否拿到隔离会话** | ❌ 不能 | ★对**活跃桌面 sidecar**(53407) 连做两次独立 `session/new`，两次都返回 `951c5b0f-…`（用户正在对话的会话），`sameAsActiveConversation:true` —— v1.0 "首次复用、再次新建"在外部客户端上**不可复现**，挂靠注入风险是**每次都中**，不是首次才中 |
| V16 | **自托管会话隔离** | ✅ | ★`session/new` 返回我们指定的 `wb-host-probe-<uuid>`，SSE `baggage.codebuddy.session_id` 同值 —— 自托管在隔离性上**碾压挂靠**，§1.3 的取舍成立 |
| V17 | headless 复用已登录态 | ❌ **不成立** | ★独立 CLI 用 `~/.codebuddy`（横幅 `Config …\.codebuddy\settings.json`），注册文件写 `~/.codebuddy\sessions\`；`CODEBUDDY_CONFIG_DIR=~/.workbuddy` 实测**仍 refusal**（登录日志仍报 /login），说明凭据不在配置文件里，由 WorkBuddy 应用侧 `AuthRefresh → sessionPublished=true` 运行期下发 |
| V18 | `--add-dir` 是否硬约束 | ⏳ 无法判定 | 依赖 V11 的一轮真实执行；未登录导致 prompt 不跑，边界测试只能拿到"没写出来"的**空结果**（不构成通过证据） |
| V19 | ACP `authMethods` 可用作激活通道 | ✅（存在性） | ★`initialize` 返回 4 种：`iOA` / `external(Google/Github)` / `internal(WeChat)` / `selfhosted(Enterprise Domain)` —— **`authenticate` 是 V17 的正解入口**，比逆向 keyblob 干净；具体调法与落库位置待 §十一-1b |
| V20 | CLI 自带后台会话监督器 | ✅ | help 有 `daemon / ps / logs / attach / kill / stop / rm / respawn / agents` 子命令与 `--bg --name --exec --swarm`；`--fork-session` 可官方地"另起副本会话" |
| V21 | Job Object 是否需要我们自研 | ❌ 不需要 | ★launcher 在加载 bundle 前就 `Join the host Job`（`bin/windows-job.cjs` + `no-orphans.cjs`），BotBuddy 建 Job 并 assign 即可级联回收 |

### 2.2 关键结论修正（推翻原方案的三处判断）

**① 网关不是应用级常驻服务，而是「每会话一个 sidecar」。**

```
11:20:52  Session 951c… reported ready (pid=20048, port=51577)
11:21     我方探测 → 200 OK（此时该 sidecar 存活）
   ↓      Session 951c… cleaned up (0 remaining)   ← 会话结束，端口消失
11:39     Session 951c… reported ready (pid=31128, port=53407)  ← 同会话复活，端口换新
```

所以：**"端口写死"和"扫端口"两种做法都不可靠**，端口是运行时属性，不是软件属性。

**② `session/new` 在挂靠模式下**永远**返回活跃会话——比 v1.0 的判断更糟。**

v1.0 记录"第 1 次返回活跃会话、第 2 次返回全新会话"。BotBuddy 侧复测（V15）：对活跃桌面 sidecar `53407` 用**两个独立进程、两条独立 connect**各做一次 `session/new`，**两次都拿到 `951c5b0f-…`**（用户正在对话的那个会话），`sameAsActiveConversation: true`。

- 说明"再次新建"不是外部客户端能稳定触发出来的行为（一个 sidecar 只认它那一个会话），所以**挂靠模式没有"避开用户会话"的路径**：任何 prompt 都会打进用户正在聊的对话。这不是"串台"，是"污染用户会话"，且**每次都中**；
- 反过来，自托管运行时上 `session/new` 返回的就是我们指定的 sessionId（V16）。**方案 B 的隔离收益从"推测"升级为"实测"**，§1.3 的取舍成立。

**③ 官方 CLI 完整可用，`--serve` 就是 ACP 网关的启动方式——但启动条件比 v1.0 写的多两个 env。**

sidecar 不是黑盒，是 `WorkBuddy.exe <cli/bin/codebuddy> --serve …`；参数表可导出（V10，需带 env），`--port` 支持固定端口（V13）。"长期握手"从逆向碰运气变成工程可设计——**但必须照 §4.1 的 env 条件起**。

**④ ★新发现的决定性缺口：自托管运行时不继承 WorkBuddy 登录态（V17）。**

`session/prompt` 在托管运行时上返回 `stopReason=refusal`、零文本，日志直接写 `Please use /login command to sign in to your account`，`AuthRefresh failed`。独立 CLI 用自己的配置目录 `~/.codebuddy`；把 `CODEBUDDY_CONFIG_DIR` 指到 `~/.workbuddy` 之后**仍然 refusal**——WorkBuddy 的登录不是配置文件里的凭据，而是应用运行期 `AuthRefresh → sessionPublished=true` 下发的会话。

**这条直接决定 §1.1 那句用户承诺能不能兑现**：现状是"装 exe、配码、不用打开 WorkBuddy"里，**"不用打开 WorkBuddy"只在挂靠模式下成立（而那模式不能隔离），自托管模式必须先给托管运行时做一次激活**。解法见 §十一-1b：用 ACP `initialize` 已经声明的 4 种 `authMethods` 走 `authenticate`，而不是逆向 keyblob。

---

## 三、架构

```
┌──────────────────────────────────────────────────────────────┐
│ 平台                                                          │
│  Agent 任务中心（MyTask, source=workbuddy）                    │
│  /api/public/workbuddy-host/{pair,poll,heartbeat,progress,…}   │
└───────────────────────────┬──────────────────────────────────┘
                            │ 出站 HTTPS 心跳（5s，复用设备通道六端点）
                            │ 平台不新开端口、不引 WebSocket
┌───────────────────────────┴──────────────────────────────────┐
│ 用户 PC ── BotBuddy（常驻 exe，托盘）                          │
│                                                               │
│  ┌─────────────────┐   ┌──────────────────┐                   │
│  │ 通道层           │   │ 执行层            │                  │
│  │ 心跳 / 领任务     │──▶│ 队列 / 会话池     │                  │
│  │ 回执 / 断线重连   │◀──│ ACP 客户端        │                  │
│  └─────────────────┘   └────────┬─────────┘                   │
│                                  │ loopback HTTP + SSE         │
│  ┌───────────────────────────────┴──────────────────────────┐ │
│  │ WorkBuddy 运行时（exe 拉起的 headless 子进程，每个工作区一个）│ │
│  │  --serve --port 45871 --session-id wb-<workspace>         │ │
│  │  --permission-mode bypassPermissions --tools … --add-dir … │ │
│  └───────────────────────────────┬──────────────────────────┘ │
└──────────────────────────────────┼────────────────────────────┘
                                   ▼
                        本地工作区（cwd 内真实文件）
```

### 3.1 组件职责

| 组件 | 职责 | 不做什么 |
| --- | --- | --- |
| 平台任务中心 | 任务落库、状态机、唯一下发源 | 不直连用户 PC、不代发模型请求 |
| BotBuddy 通道层 | 心跳、领指令、回执、断线重连、幂等 | 不解析任务语义 |
| BotBuddy 执行层 | 托管运行时、端口/会话映射、串行队列、取消 | 不直接碰文件系统 |
| WorkBuddy 运行时 | 真正执行 prompt、调用工具、读写工作区 | 不感知平台存在 |
| 工作区 | 用户可审计的文件目录 | 不允许越界（`--add-dir` 硬约束） |

### 3.2 为什么"一个工作区一个运行时"

`--permission-mode` / `--tools` / `--add-dir` 都是**进程级**参数，同一 sidecar 内无法按任务切换。因此：

- 一个工作区（对应一个 Agent 或一类业务）→ 一个 sidecar + 一个固定端口 + 一个固定 session-id；
- 端口按工作区依次分配（45871、45872…），写进本地配置；
- 好处：多 Agent 天然隔离，互不串台，也能真并行（每个 sidecar 一个执行位）。

---

## 四、运行时托管（核心机制）

### 4.1 启动命令

> ⚠️ **2026-11-13 BotBuddy 侧复测修正**：下面这条命令**照抄会失败**。自托管拉起有两个**必需的环境变量**，缺任何一个都拿不到 ACP 服务：
>
> | env | 为什么必需（实测） |
> | --- | --- |
> | `ELECTRON_RUN_AS_NODE=1` | `WorkBuddy.exe` 默认是 GUI 主进程；不带这个 env 时它会走单实例逻辑**直接 exit 0**，GUI 日志里只有 NetProxy 那几行，sidecar 根本没起来 |
> | `CODEBUDDY_FORCE_LITE_WB_BUNDLE=1` | `--serve` 不在 launcher 的 headless 路由条件里（`isHeadless` 只认 `-p/--print/--acp/--output-format/--version/--help/daemon/ps/logs/attach/kill/--bg`），不设 env 就会去 `require('../dist/codebuddy')`；**本机安装包只有 `codebuddy-lite-wb.mjs`**，headless/full bundle 都不存在 → `MODULE_NOT_FOUND`。daemon 日志注释同源：宿主起 sidecar/prewarm 前设的就是这个 env |
>
> 实测可用命令行（BotBuddy 直接照此 spawn，`--tools` 按需收窄）：
>
> ```
> env: ELECTRON_RUN_AS_NODE=1, CODEBUDDY_FORCE_LITE_WB_BUNDLE=1
> "F:\Program Files\WorkBuddy\WorkBuddy.exe" ^
>   "F:\Program Files\WorkBuddy\resources\app.asar.unpacked\cli\bin\codebuddy" ^
>   --serve --host 127.0.0.1 --port 45871 ^
>   --session-id wb-host-<deviceId>-<workspaceKey> ^
>   --permission-mode bypassPermissions ^
>   --tools "Read,Write,Edit,Glob,Grep" ^
>   --add-dir "D:\work\finance"
> ```
>
> 另注意：**WorkBuddy 桌面自己起 sidecar 时传的是 `--port 0`（自动分配）**，实测命令行尾部 `--port 0`；`--help` 也写明 `--port` default: auto-assign。固定端口是我们主动选择的用法，能力属实但官方自己没用过。

说明：

- **启动器有两种，实测都拿得到 CLI 版本号**：① `WorkBuddy.exe` + `ELECTRON_RUN_AS_NODE=1`（★**env 必需**，否则它当 GUI 起、单实例直接 exit 0）；② WorkBuddy 自带的 node `~\.workbuddy\binaries\node\versions\22.22.2-6\node.exe`（`--version` 实测同样返回 2.165.0，且 WorkBuddy 自己的 hooks 也在用它）。"用户机器上不保证有 Node"这个前提成立但**不构成障碍**——Node 是随 WorkBuddy 装进 `.workbuddy\binaries` 的。★注意：②的 bundle 解析路径未验证（`dist/codebuddy*` 在 `app.asar` 内，纯 node 无 asar 装载），**一期按 ① 实现**，②留作 ① 被升级破坏时的备胎；
- **不加 `--open`**：不弹浏览器、不弹 Web UI，纯后台（实测横幅里给 Web UI 带密码的 URL，但不会自己打开）；
- `--session-id` 用稳定 id（本机生成一次入库），**重启后上下文不丢**；★格式约束实测：字母或数字开头，可含 `-` `_` `:`，所以我们自造 `wb-host-<deviceId>-<workspaceKey>` 合法；
- 需要全新上下文时换 id，并在参数里加 `--resume-create-missing` 兜底（会话不存在时自动新建而不是报错）；★做"隔离副本"另有官方 `--fork-session`。

### 4.2 参数表（`--help` 实测导出，只列与本方案相关）

| 参数 | 取值 | 用途（★=2026-11-13 实测校正） |
| --- | --- | --- |
| `--serve` | - | 启动 HTTP 服务（Web UI + REST + **ACP over HTTP SSE**） |
| `--host` | 默认 `127.0.0.1` | 绑定地址，**禁止改 0.0.0.0** |
| `--port` | 数字 / 默认自动 | ★**固定端口可用**（实测绑 45871 成功）；但 WorkBuddy 自己起 sidecar 传的是 `--port 0`，help 注明 "interactive mode reuses a stable port"——固定端口是我们选用法，不是官方用法 |
| `--auth` | `password`(默认) / `none` | ★只守 Web UI/REST，**不守 ACP 面**：带 `x-codebuddy-request` 头的 connect 直接发 token，密码全程没参与（见 §5.2）。`none` 仍禁止 |
| `--acp` | - | 纯 ACP 模式（stdio），与 `--serve` 互斥用法 |
| `--acp-transport` | `stdio`(默认) / `streamable-http` | ACP 传输方式 |
| `--session-id` | 字母/数字开头，可含 `-` `_` `:` | ★自托管时**真正生效**：注册文件与 SSE `baggage.codebuddy.session_id` 都是我们指定的 id（隔离会话的根据） |
| `--resume` / `--resume-create-missing` | - | 恢复会话 / 会话丢失时自动新建（worker 重启用） |
| `--permission-mode` | `acceptEdits`/`bypassPermissions`/`default`/`plan`/`dontAsk`/`auto` | ★**flag 层没有 `fullAccess` 和 `delegate`**（方案 v1.0 列了 8 个值，实际 CLI 只收 6 个）；但 ACP `configOptions.mode` 的选项表里确实有 `fullAccess`/`delegate`——即这两个值只能在会话运行中经 ACP 切，不能启动时给 |
| `--tools` | 逗号分隔 / `""` / `default` | **进程级工具白名单**（比 prompt 里写白名单有效得多） |
| `--allowedTools` / `--disallowedTools` | 同上 | 细到 `Bash(git:*)` 粒度 |
| `--add-dir` | 路径列表 | **进程级目录白名单**（★硬/软约束仍未判定，见 §十一 2） |
| `--mcp-config` + `--strict-mcp-config` | 文件/JSON | 挂 MCP server（二期拉模式用；桌面 sidecar 实测带 `--strict-mcp-config`） |
| `--model` | help 实测列表：`auto, glm-5v-turbo, glm-5.1, glm-5.0-turbo, glm-5.0, glm-4.7, kimi-k2.5, minimax-m2.7, deepseek-v3-2-volc` | ★桌面 sidecar 用的是产品别名 `fast-model`/`balanced-model`（不在 help 列表里）；自托管用 `auto` 可用 |
| `--settings` / `--setting-sources` | JSON 字符串或文件 / `user,project,local` | ★桌面 sidecar 用 `--settings` 下发 `sandbox.enabled`、`trustedDirectories`、`permissions.deny`、hooks、enabledPlugins——**目录白名单实际走 `trustedDirectories`，不是 `--add-dir`** |
| `--no-session-persistence` | - | 会话不落盘（一次性任务可用） |
| `-y` `--dangerously-skip-permissions` | - | 免确认（HIGH/CRITICAL 仍问）；`CODEBUDDY_IS_SANDBOX=1` 是隔离沙箱全通档 |
| `--fork-session` | - | `--resume/--continue` 时另起新 session id（**做"隔离副本"的官方开关**） |
| `--system-prompt` / `--append-system-prompt` / `--prompt-vars-file` | - | ★下发任务语义的正规位置（桌面 sidecar 就在用 `--prompt-vars-file`），比塞进 prompt 文本更可控 |
| `--agent` / `--agents` / `--max-turns` / `--effort` | - | 主 agent 与轮数/推理强度上限（**`--max-turns` 是自托管跑批的保险丝**） |
| `-p` `--input-format stream-json` `--output-format stream-json` `--include-partial-messages` | - | **无端口降级通道**：管道式单任务，见 7.3 |
| ★**新增发现**：`daemon` / `ps` / `logs` / `attach` / `kill` / `stop` / `rm` / `respawn` / `agents` 子命令 + `--bg` `--background` `--name` `--exec` `--swarm` | - | **CLI 自带一套后台会话监督器**（起/查/附/杀/带上下文重启）。这意味着"托管运行时池"未必全自研：`--bg --name` + `respawn` 就是官方版的"无人值守跑活 + 崩了续跑"。二期评估用它替代 §4.4 自研生命周期，风险是又依赖一条非公开命令面 |

### 4.3 就绪判定（★2026-11-13 实测重写：v1.0 的第 1 条不成立）

| 优先级 | 判据 | 实测结论 |
| --- | --- | --- |
| 1（最快） | ~~stdout `reported ready`~~ | ❌ **不自定义不成立**。`[Sidecar] Session … reported ready (pid=…, port=…)` 是 **WorkBuddy daemon 打的日志**，不是 CLI 自己打的。自托管 spawn 的 stdout 只有横幅：`CodeBuddy Code HTTP Server / Endpoint http://127.0.0.1:45871 / Password … / Config C:\Users\Administrator\.codebuddy\settings.json / Permission bypassPermissions`。抓 `Endpoint` 行可以，但它不带 pid、也不保证已能应答 |
| 2（最可靠） | **注册文件命中我们的 sessionId** | ✅ 实测 **1.5–1.7s** 命中：`{pid, sessionId=我们指定的, cwd=工作区, kind:"interactive", endpoint:"http://127.0.0.1:45871", version:"2.165.0"}`。★注意目录随配置目录走：**自托管写 `%USERPROFILE%\.codebuddy\sessions\`，桌面 sidecar 写 `%USERPROFILE%\.workbuddy\sessions\`**（设 `CODEBUDDY_CONFIG_DIR` 会改写到指定目录）——发现逻辑必须**扫两个目录** |
| 3（并列可用） | 固定端口 `connect` 探活 | ✅ 带 `x-codebuddy-request` 头即 200；实测 1.5s 内已可用。★不带该头是 **403**，会把"已就绪"误判成"未就绪"，所以这条依赖 §5.2 的头 |
| 4（排查用） | `netstat` / `--host` 绑定核对 | 只在"端口对不上/被占用"排障时用 |

> **就绪延迟口径修正**：v1.0 写 254–281ms（那是 daemon 日志里 sidecar 内部 ready 的时间），**BotBuddy 端到端可见的就绪是 1.5–1.7s**（含 Electron-as-node 启动 + bundle 加载 + 端口绑定）。按 15s 超时判定失败即可，但平台 UI 不要把"正在启动执行环境"写成亚秒级。

### 4.4 生命周期与孤儿进程

```
exe 启动
  ├─ 有配置 → (静默) spawn 运行时 → 等 ready → 连平台
  └─ 无配置 → 弹配对窗
exe 退出 / 系统注销
  └─ 杀子进程（Windows Job Object / process tree kill），不留孤儿
运行时异常退出
  └─ 退避重启（1s→2s→5s→15s→30s 封顶），期间任务保持排队不丢
WorkBuddy 升级
  └─ 版本变化 → 重启运行时 → 重跑一次 ACP 序列自检（见 7.2）
```

> ★**Job Object 不用我们实现**：实测 `codebuddy` launcher 在加载任何 bundle 之前就执行 "Join the host Job before evaluating any application bundle"（`bin/windows-job.cjs`，win32 无条件生效），并有 `no-orphans.cjs` 兜底。BotBuddy 只要**自己创建 Job Object 再把子进程 assign 进去**，sidecar 会自行加入；崩溃即连带回收。这条把 §4.4 的实现成本从"自研进程树杀"降为"建一个 Job 对象"。

> **为什么仍要 BotBuddy 自己显式建 Job**：launcher 会"加入宿主 Job"，但前提是**宿主已经有一个 Job**。Electron 默认不在 Job 里，崩溃后 sidecar 就成了孤儿并占住固定端口，下次启动绑不上。所以 BotBuddy 启动时 `CreateJobObject` + `AssignProcessToJobObject`（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`），这是 §7.1「孤儿 sidecar」那行的真正修法。

---

## 五、任务同步协议

### 5.1 平台 ↔ exe（复用现有设备通道，零新增）

沿用 v2.1 已交付的六个端点，不新造协议：

| 端点 | 方向 | 说明 |
| --- | --- | --- |
| `POST /api/public/workbuddy-host/pair` | 建连 | 设备码配对 |
| `POST /api/public/workbuddy-host/pair/poll` | 轮询 | 2s 轮询换取令牌 |
| `POST /api/public/workbuddy-host/heartbeat` | 上行 5s | 领指令 + 上报运行时状态 |
| `POST /api/public/workbuddy-host/progress` | 上行 | 流式进度（节流） |
| `POST /api/public/workbuddy-host/result` | 上行 | 终结回执 |
| `POST /api/public/workbuddy-host/logout` | 上行 | 解绑/吊销 |

★**这里要和 v2.1 的"心跳租约"合并成一句话口径**：平台与主机的长期握手**不是一条不结束的 ACP 连接**，而是**每 5s 一次的心跳租约 + 每次现取的端点**。ACP 连接是任务级的（一次 `connect` 一次用完），租约才是主机级的。因此心跳载荷按下面扩展（`caps` 在平台侧已是自由 JSON 列，`workbuddy-host.service.ts` 直接落库，**无需改 schema**）：

```json
{
  "caps": {
    "runtime": {
      "state": "READY",
      "profile": "managed",
      "pid": 12345,
      "port": 45871,
      "endpoint": "http://127.0.0.1:45871",
      "sessionId": "wb-host-8f3a-finance",
      "workspaceKey": "finance",
      "cwd": "D:\\work\\finance",
      "cliVersion": "2.165.0",
      "appVersion": "5.9.3",
      "readyLatencyMs": 1674,
      "authenticated": true,
      "permissionMode": "bypassPermissions",
      "toolsWhitelist": ["Read", "Write", "Edit", "Glob", "Grep"],
      "lastStopReason": "end_turn",
      "queueDepth": 0
    },
    "registryDirs": ["~/.codebuddy/sessions", "~/.workbuddy/sessions"]
  }
}
```

平台据此把主机显示成**四档而不是两档**（这是"任何 agent 发布的任务能不能同步过去"的真正前置条件）：

| 显示 | 判据 | 下发策略 |
| --- | --- | --- |
| 离线 | 连续 3 次心跳失败 | 排队不丢 |
| 在线·需激活 | `state=NEEDS_ACTIVATION` 或 `authenticated=false` | ★**不下发**；给"去激活"入口 + 说明会弹登录 |
| 在线·可静默派活 | `state=READY && profile=managed && authenticated` | 正常 FIFO 下发 |
| 在线·仅明示注入 | `profile=attach`（桌面 sidecar 存活、托管未激活） | 只下发用户点过"发到当前对话"的任务 |

`runtime.endpoint` 每轮现填、**平台不缓存端口**；端点变了（`port`/`pid` 任一变化）视为一次"租约重绑定"，只更新快照，不影响主机在线判定。

### 5.2 exe ↔ WorkBuddy（ACP 四步）

```
POST {endpoint}/api/v1/acp/connect
Headers: Content-Type: application/json
         x-codebuddy-request: 1          ← ★自托管 --serve 必需，缺失即 403
Body:    {}                              ← 实测带完整 client 体也 200
→ { connectionId, sessionToken }

POST {endpoint}/api/v1/acp          （JSON-RPC 2.0，全部走这一个地址）
Headers: acp-connection-id, acp-session-token, x-codebuddy-request: 1,
         Accept: application/json, text/event-stream
Body:    {"jsonrpc":"2.0","id":1,"method":"initialize",
          "params":{"protocolVersion":1,"clientCapabilities":{},
                    "clientInfo":{"name":"botbuddy","version":"1"}}}
→ 协议版本 + agentCapabilities + authMethods

  → session/new   {"cwd":"D:\\work\\finance","mcpServers":[]}
  → session/prompt {"sessionId":"…","prompt":[{"type":"text","text":"…"}]}
  → SSE 流式事件（session/update …）直到 stopReason
```

要点（★标注为 2026-11-13 BotBuddy 侧复测新证据）：

- ★**`x-codebuddy-request` 头是新的硬要求**：自托管 `--serve` 上不带它 → `403 {"error":"Missing required header: x-codebuddy-request"}`；值随意（`1`/`true`/密码都过），说明它只是防跨源标记，**不是鉴权**。桌面 sidecar 不带也过——所以 BotBuddy 必须**无差别带上**这条头，否则"桌面能连、自托管连不上"。`src/main/acp-client.js` 目前没带，属必修项；
- ★**响应一律是 SSE，包括 `initialize`/`session/new` 的返回值**：要先按行取 `data:` 再找 `{"id":"2","result":{…}}`。直接 `JSON.parse(body)` 会失败——v1.0 探测脚本就在这里把 `sessionId` 读成了 `null`，误判成"没返回会话"；
- `Accept` 必须是 `application/json, text/event-stream`，只写后者会 406；
- 每个 `connect` 拿到的 `sessionToken` **只用于本次连接**，不落盘、不复用；
- 响应是 SSE，首行 `:ok` 是心跳注释，**不是错误**，解析时忽略；
- ★实测 `initialize` 返回：`protocolVersion=1`，`agentCapabilities` = `promptCapabilities, mcpCapabilities, loadSession, delegateToolsSupport, mainAgentSupport, multitaskSupport, metaPromptSupport`，`authMethods` = `iOA(Login with iOA) / external(Login with Google/Github) / internal(Login with WeChat) / selfhosted(Login with Enterprise Domain)`——**这四种登录方式是 §十一-1 的解法入口**；
- ★实测 `session/new` 在自托管运行时上返回的就是**我们指定的 sessionId**（SSE `_meta.baggage = "codebuddy.session_id=wb-host-probe-…"`），隔离性成立；
- `session/prompt` 会阻塞到整轮结束，必须读流，不能等一次性响应；
- ★`stopReason` 实测取值除 `end_turn` 外还有 **`refusal`**（未登录时就是 refusal，且**没有任何 `agent_message_chunk` 文本**，只有 `session_info_update`/`usage_update`）。生产代码不能把"无文本"当"网络失败"重试，要按 refusal 归因（见 §7.1 新增行）。

### 5.3 一次任务的完整时序

```
平台            BotBuddy                    WorkBuddy 运行时
 │  heartbeat     │                              │
 │◀───────────────│                              │
 │  task{code,prompt,cwd}                        │
 │───────────────▶│ 入队（串行）                  │
 │                │ connect ────────────────────▶│
 │                │◀──────── connectionId/token   │
 │                │ initialize ─────────────────▶│
 │                │◀──────── v1 + caps            │
 │                │ session/new(cwd) ───────────▶│
 │                │◀──────── sessionId            │
 │                │ session/prompt ─────────────▶│
 │                │◀──────── SSE: 文本增量/工具调用│
 │  progress      │                              │
 │◀───────────────│  （2–3s 或 N 字符合并一次）    │
 │                │◀──────── stopReason           │
 │  result        │                              │
 │◀───────────────│                              │
 │ 任务办结        │                              │
```

### 5.4 会话映射与队列

| 场景 | 策略 |
| --- | --- |
| 同一工作区连续任务 | 复用同一 `sessionId`，上下文连续（"接着上次那个表改"能听懂） |
| 不同工作区任务 | 不同 sidecar + 不同 sessionId，可并行 |
| 同一工作区并发任务 | **串行**，一个执行位；后续任务进 FIFO，平台显示"排队中（第 N 位）" |
| 需要全新上下文 | 换 sessionId（配置里做"重置上下文"按钮） |
| 长跑膨胀 | 建议按天轮换 sessionId，或对一次性任务加 `--no-session-persistence` |

### 5.5 进度与结果

- **进度**：解析 SSE 的 `session/update` → 文本增量累积，按 2–3s 或 500 字符合并一次上送；工具调用单独发一条事件（UI 显示"正在读 xxx.xlsx"），比纯文本流有信息量；
- **结果**：`stopReason` 到达即完成，回执带 `text`（最终答复）+ `usage` + `durationMs`；
- **失败**：任何阶段异常都发 `result`，带 `errorCode`（见第六节），**绝不静默丢任务**。

### 5.6 取消与超时

| 情况 | 动作 |
| --- | --- |
| 平台点"取消" | 心跳带回 `cancel:commandCode` → `session/cancel`（★该方法本身**未实测**，属 §十一 待验 6）→ 等 5s → 未停则杀 sidecar 重启，记 `CANCELED` |
| 超时（默认 300s 可配） | 同上；但先发一次"仍在执行"进度，避免误杀长任务 |
| 心跳断（网络） | 任务不取消，本地继续跑，结果暂存本地队列，恢复后补回执（`commandCode` 幂等去重） |

### 5.7 ★双 Profile 任务路由（复测后的新增节，落地"任何 agent 发布的任务都能同步"）

统一任务中心的一条 workbuddy 任务带一个 `deliveryMode`，BotBuddy 按主机当前 profile 选择通道：

| `deliveryMode` | 走哪个 profile | 会话 | 用户感知 | 何时可用 |
| --- | --- | --- | --- | --- |
| `silent`（默认，系统派活） | `managed` 自托管 | 我们指定的 `--session-id`，隔离（V16） | 无感，任务中心里看结果 | 主机已激活 |
| `into-current`（明示注入） | `attach` 挂靠 | 用户活跃会话（V15 无法绕开） | 平台与 exe **双向明示**："本任务将出现在你正在聊的 WorkBuddy 对话里" | 桌面 WorkBuddy 开着即可，不需要激活 |
| `probe`（自检） | 任一 | 只 connect/initialize，**不发 prompt** | — | 常驻可用 |

路由规则（写死在 BotBuddy，平台只提供意图）：

1. `silent` + `managed` 未就绪 → **不降级到 attach**（静默任务绝不能打进用户会话），改为排队并显示原因"执行环境未激活"；
2. `into-current` 必须携带用户确认位 `consentedAt`，缺则拒绝执行并回执 `NEED_CONSENT`；
3. 一次心跳只回一个 profile 实况，profile 切换由"托管运行时是否 ready + 是否已激活"决定，不由任务决定；
4. 定时任务默认 `silent`；主机长期只有 attach 能力时，创建定时任务就要在 UI 上警示"当前主机只能明示注入，锁屏后无法自动执行"。

> 这条是"飞书 × WorkBuddy"与"系统派活"的真正分界：飞书是**人主动把消息投进对话**（≈ `into-current`），系统派活是**机器把活放进隔离执行位**（`silent`）。两种都要有，但**默认值和确认闸门必须相反**——人发起的可以直进对话框，机器发起的必须隔离。

---

## 六、状态机

### 6.1 主机运行时状态

| 状态 | 进入条件 | 平台展示 |
| --- | --- | --- |
| `OFFLINE` | 进程未运行 / 未配对 | 设备离线 |
| `SPAWNING` | 正在拉起运行时 | 正在启动执行环境（实测 1.5–1.7s，超时阈值 15s） |
| `NEEDS_ACTIVATION` | ★ready 但 `prompt` 返回 `refusal` + 日志 `Please use /login`（V17） | 在线·需激活：附「激活一次」入口（走 ACP `authenticate`，四选一：iOA / Google-Github / WeChat / 企业域） |
| `READY` | connect + initialize + session/new 全通过且已激活 | 在线（就绪） |
| `BUSY` | 有任务执行中 | 在线（执行中，第 N 位排队） |
| `DEGRADED` | ready 但自检有告警（端口被占、`--add-dir` 未生效、桌面版本与 CLI 版本不一致） | 在线（受限）：附原因 |
| `ERROR` | 连续 3 次重启失败 | 执行环境异常，需人工处理 |

转移：`OFFLINE → SPAWNING → (NEEDS_ACTIVATION | READY) ⇄ BUSY`，任意状态异常 → `ERROR`，`ERROR` 下按退避重试（上限 30s）；`NEEDS_ACTIVATION → READY` 只在激活成功或用户明确选择 `into-current` 后发生。

### 6.2 任务状态（沿用统一任务中心）

`OPEN → DOING → DONE`，异常分支 `FAILED / CANCELED`；全部按 `commandCode` 幂等，重复心跳/重复回执不产生重复任务。

---

## 七、失败模式与处理

### 7.1 故障矩阵

| 故障 | 现象 | 处理 |
| --- | --- | --- |
| 端口漂移（挂靠模式） | connect 突然 ECONNREFUSED | 自托管后不存在；仍保留"注册文件重读 + 重启运行时"兜底 |
| 固定端口被占用 | 运行时启动失败 | 启动前 `bind` 探测；占用则顺延到 +1 并在心跳上报实际端口 |
| sidecar 崩溃 | SSE 中断 | 判本轮 `FAILED`，重启运行时；任务可按配置自动重试 1 次（幂等前提下） |
| WorkBuddy 升级致协议变 | initialize 失败 / 方法不存在 | 启动自检跑一遍四步序列；失败则 `DEGRADED` + 上报平台，提示升级 BotBuddy |
| ★**未激活**（实测 V17） | `prompt` 返回 `stopReason=refusal` 且**零文本**；CLI 日志 `Please use /login` / `AuthRefresh failed` | 进 `NEEDS_ACTIVATION`：**不重试、不计失败**；任务保持排队；托盘与平台同时给「激活一次」入口（ACP `authenticate` 四种方式）；用户拒绝激活则可切 `into-current` |
| ★**spawn 起来了但没服务**（实测 V12） | 子进程秒退 exit 0，或 `MODULE_NOT_FOUND ../dist/codebuddy` | 判 env 条件缺失：先补 `ELECTRON_RUN_AS_NODE` + `CODEBUDDY_FORCE_LITE_WB_BUNDLE`，仍失败则探测 `CODEBUDDY_FORCE_HEADLESS_BUNDLE`（bundle 名随安装包变，**不能写死**），最后落 §7.3 管道通道 |
| ★**ACP 403**（实测 V14） | connect 返回 `Missing required header: x-codebuddy-request` | 统一带头；该错误**不得**判成"运行时未就绪"，否则启动自检会误杀正常的 sidecar |
| 用户锁屏/休眠 | 任务卡住 | 引导开启"锁屏远程"；休眠唤醒后按心跳恢复 |
| 并发注入 | 两任务抢同一会话 | 串行队列硬约束（执行位信号量）；★`multitaskSupport:true` 允许并行，但**先实测再放开**（§十一-7） |
| 孤儿 sidecar | 端口被占、重复实例 | ★BotBuddy 自建 Job Object 并 assign（launcher 会自动加入，V21）+ 启动时按 `sessionId` 清理同 id 残留进程 |
| 时钟/网络抖动 | 心跳超时误判离线 | 连续 3 次心跳失败才判离线 |

### 7.2 启动自检（每次拉起运行时都跑，★按实测扩到 8 步）

1. CLI 与 `WorkBuddy.exe` 路径存在性（从注册表/安装目录解析，**不硬编码 F 盘**）；
2. spawn env 齐备（`ELECTRON_RUN_AS_NODE` + bundle 路由 env）；
3. `--port` 是否可用；
4. 拉起 → 等 ready（**注册文件命中为主判据**，超时 15s；实测 1.5–1.7s）；
5. `connect`（带 `x-codebuddy-request`）→ `initialize`（校验 `protocolVersion === 1`，记录 `agentCapabilities` 与 `authMethods`）；
6. `session/new`（用配置的 cwd），★并核对**返回的 sessionId 等于我们指定的那个**——不等就说明落到了别人的会话，直接判 `DEGRADED` 并禁用 `silent` 下发；
7. ★**激活探测**：发一条不写盘、不回文的极小 prompt（或读 `session_info_update` 的鉴权位），拿到 `refusal` 即 `NEEDS_ACTIVATION`；
8. 上报结果 → `READY` / `NEEDS_ACTIVATION` / `DEGRADED`。

> 这就是 v2.1 §5.4"环境自检"的落地版本，只是把"检查 WorkBuddy 在跑"换成了"**确保 WorkBuddy 在跑、且确认这个执行位真的属于我们**"。第 6 步是本次复测新增的必要环节。

### 7.3 降级通道：管道式单任务

如果 ACP 路径被新版本彻底破坏，用官方非交互模式兜底：

```bash
WorkBuddy.exe "<cli/bin/codebuddy>" -p "<prompt>" \
  --output-format stream-json --include-partial-messages \
  --permission-mode bypassPermissions --add-dir "D:\work\finance"
```

无端口、无会话、按任务起停；代价是每任务冷启动（约 1s）且无多轮上下文。**作为最后一道保险，不作为主路径。**

---

## 八、安全

| 项 | 要求 |
| --- | --- |
| 绑定地址 | `--host 127.0.0.1` 强制；**禁止 0.0.0.0**（网关无强鉴权，见下） |
| 网关鉴权 | ★**实测口径修正（V14）**：`--auth password` 只守 Web UI/REST，**ACP 面完全不用密码**——门槛是一条值随意的 `x-codebuddy-request` 头，任何本机进程都能补上。所以"有密码"不能当安全边界写进设计：ACP 面按**本机可信域 + 无鉴别**对待，靠下面三条收口 |
| 收口 1：唯一调用方 | BotBuddy 是 ACP 面唯一预期客户端：★自检第 6 步**核对 `session/new` 返回的 sessionId 就是我们指定的那个**，不等即判会话被他人占用并停止 `silent` 下发；固定端口不对外announce，平台侧永远拿不到端点 |
| 收口 2：进程级白名单 | `--tools` 不给 `Bash/PowerShell`（一期默认 `Read,Write,Edit,Glob,Grep,MultiEdit`）；★桌面 sidecar 实测把目录约束走 `--settings.trustedDirectories` + `permissions.deny`，我们自托管应**同时**给 `--add-dir` 与 `--settings` 的 `trustedDirectories`，取两者交集，直到 §十一-2 判定哪个才是硬约束 |
| 收口 3：执行位限流 | `--max-turns` 给上限（★新增：help 实测有该参数），防被注入的 prompt 把主机跑成矿机；`bypassPermissions` 只在白名单已收紧时使用，且平台侧对 `silent` 任务保留一道人工确认闸 |
| 令牌 | `sessionToken` 只在内存，随连接生命周期；本地 config 存 600 权限 |
| 越权风险 | ⚠️ 白名单约束的是**工具与目录**，不约束 prompt 语义；平台侧必须对下发内容做审计留痕，UI 明示"对话即全权授权"；★`into-current` 任务的 UI 必须再明说一句"内容会进入你正在进行的会话，随后该会话的上下文都带它" |
| 凭据 | WorkBuddy 登录态永不出本机；模型请求由本机账号发起，平台不代发；★自托管激活后的凭据落 `~/.codebuddy`（V17），属用户账号数据 —— **BotBuddy 不读取、不上传、不复制**，只提供一次 `authenticate` 入口 |
| 审计 | 每条指令一行流水：谁下发、何时、是否领取、结果、耗时、退出码；★新增列 `profile`（managed/attach）与 `stopReason`，把 `refusal` 与 `end_turn` 分开统计 |

---

## 九、与飞书模式的路线选择

### 9.1 一期：推模式（本方案）

优点：实时、可流式、可打断、可多轮。缺点：依赖非公开 ACP，升级需回归。

### 9.2 二期：拉模式（与飞书同构，强烈建议）

把平台封装成 **MCP server**（`--mcp-config` 直接可挂），暴露三个工具：

- `list_pending_tasks` —— 拉取派给本机的待办；
- `claim_task` —— 认领并置为执行中；
- `submit_result` —— 回传结果。

这样 WorkBuddy 侧的 Agent **自己会去拉活**，方向与飞书 Connector 一致，属于官方支持面，协议变化免疫。代价是实时性略降、需要 WorkBuddy 侧有常驻会话发起拉取。

> ★**v1.1 排序调整**：原来把它排二期，是假设推模式已经能无人值守。复测证明推模式卡在激活上（§十一-1b），而拉模式**恰好不依赖自托管运行时的登录态**——它跑在用户已登录的桌面会话里，只是方向反过来（WorkBuddy 主动连平台 MCP）。所以它提前到 **M1+**，与推模式互为冗余：激活一通走 `silent`，没通就靠拉模式把活捡起来，两条通道同一张任务表、同一套 `commandCode` 幂等键。

### 9.3 建议组合

一期推模式保证"系统派活"的体验；二期拉模式做**冗余通道**——推模式挂了，Agent 还能靠拉模式把活捡起来。两条通道用同一张任务表、同一套幂等键，天然不冲突。

---

## 十、落地里程碑（对齐 v2.1 的 M0–M7）

| 批次 | 内容 | 状态 / 与 v2.1 的关系 |
| --- | --- | --- |
| **M0+a** | 托管方案 PoC 前半：spawn 运行时 → connect/initialize/session/new → 会话归属核对 | ★**本轮已完成**（V12/V13/V14/V16/V19），脚本当时落在 `bot-host-client/tools/`（v3 已移除） |
| **M0+b** | PoC 后半：**激活一次**（ACP `authenticate`）→ 一条 prompt 落盘标记文件 → `--add-dir` 边界判定 | ⏳ **一期唯一前置门槛**（§十一 1b/2）。不通则 `silent` 全部降级为 `into-current` |
| **M0+c** | 客户端三件小改（不依赖 1b，现在就能做）：① `discoverPort` 改**注册表优先 + 扫两个目录 + 去端口缓存**；② 请求头补 `x-codebuddy-request`；③ 状态窗口「检测 WorkBuddy 链接」按钮输出 **profile / endpoint / pid / cwd / kind / 是否已激活**，把"通不通"升级成"通到哪、能不能干活" | ★**建议立即做**：①② 是自托管与升级回归的地基，③ 是排障时唯一能自助的入口 |
| **M1+** | ★**把二期 MCP 拉模式提前到一期后立刻做**（`--mcp-config` 挂平台 MCP server，`list_pending_tasks/claim_task/submit_result` 三工具） | 理由：这条腿**不依赖激活**、属官方支持面、且与飞书同构；激活未闭环期间它是唯一能让 WorkBuddy 侧"自己捡活"的通道 |
| **M3+** | BotBuddy 内置 `runtime-manager.js`：spawn（含 env 探测与 bundle 回退）/ 就绪（注册文件判据）/ 退避重启 / Job Object 自建 / 端口分配与顺延 | 改造原 `acp-client` 的端口发现逻辑 |
| **M4+** | 心跳上报 `caps.runtime` 全量状态；平台展示四档（离线 / 需激活 / 可静默派活 / 仅明示注入） | 扩展 heartbeat 载荷（`caps` 已是自由 JSON，无 schema 改动） |
| **M5+** | 定时任务复用同一执行位；到点主机忙则排队；★未激活主机**不创建** `silent` 定时任务 | 不变，加一道创建期校验 |
| **M6+** | 8 步自检、降级通道、故障矩阵全量实现 | 替代原"锁屏远程自检" |
| **M7+** | 真机回归：WorkBuddy 升级前后各跑一遍序列 + 会话归属核对 + refusal 归因 | 补"版本回归"与"激活回归"两类用例 |
| **二期** | 自动更新 + 签名；★评估用官方 `daemon/ps/attach/respawn/--bg` 替代自研生命周期（§十一-9） | 与原 W6 口径合并 |

---

## 十一、待验证清单（★2026-11-13 复测后重排：1 号已闭环并变成新的 1b 号阻塞点）

| # | 待验项 | 状态 | 结论 / 下一步 |
| --- | --- | --- | --- |
| 1 | headless `--serve` 是否复用已登录态 | ✅ **已闭环，结论为否** | 不继承（V17）。`CODEBUDDY_CONFIG_DIR` 指回 `~/.workbuddy` 无效；凭据由应用侧运行期下发，不是 CLI 能读的配置文件 |
| **1b** | ★**ACP `authenticate` 能否完成托管运行时的激活** | ⏳ **当前唯一阻塞点** | `initialize` 已实测列出 `iOA / external / internal / selfhosted` 四种 `authMethods`（V19）。下一步只做一件事：对托管运行时调 `authenticate(methodId="internal")`（微信扫码），成功后再跑一条 marker prompt 看是否落盘。**成 → 无人值守成立；不成 → 主路径退回"明示注入 + 拉模式 MCP"** |
| 2 | `--add-dir` 范围外是否被拒 | ⏳ 无法判定（被 1 号卡住） | 复测脚本 `wb-managed-sidecar-probe.js --prompt --boundary` 已就位，**激活一通就能立刻跑出结论**；在此之前 `silent` 任务必须假定"目录约束不可信"，`--tools` 不给命令类工具 |
| 3 | 固定 `--port` + `--session-id` 同时使用 | ✅ 基本闭环 | 3 次拉起端口与会话都稳定（V13）；"连续 5 次 + 端口占用顺延"补测一轮即可 |
| 4 | 长跑会话上下文膨胀 | ⏳ 未开始 | 同一 sessionId 连跑 200 轮；先按 `--max-turns` + 按天轮换 sessionId 兜住 |
| 5 | 多 sidecar 并行上限 | ⏳ 未开始 | 同时起 3 个不同工作区运行时，看内存；★桌面 sidecar 实测 `--tools` 含 `TeamCreate/TeamDelete/SendMessage`，官方自己支持多 agent，并行可行性比 v1.0 预估高 |
| 6 | ★`session/cancel` 是否实现 | ⏳ 新增 | §5.6 取消链路依赖它；实测不支持则取消只能靠杀 sidecar 重启（会话上下文会丢，需在 UI 说明） |
| 7 | ★`multitaskSupport:true` 能否同会话并行 | ⏳ 新增 | 能则放开"一个执行位串行"，任务吞吐翻倍；**先实测再放开**，不放开不影响正确性 |
| 8 | ★`--permission-mode fullAccess/delegate` 经 ACP 切换是否生效 | ⏳ 新增 | flag 层不收这两个值但 `configOptions.mode` 选项里有；若能经 ACP 切，则"任务级降权执行"可做（当前 `bypassPermissions` 是唯一实测可用档） |
| 9 | ★CLI `daemon/ps/attach/respawn/--bg` 能否替代 §4.4 自研生命周期 | ⏳ 新增（二期评估） | 官方监督器 + `respawn`（带上下文重启）若可用，`runtime-manager` 能薄一半；代价是多依赖一条非公开命令面，需在 1b 通了之后再评估 |

> **口径修正（对 v1.0 结论的最后一处）**：v1.0 收尾写"剩下两件事各需半天实测，不构成架构风险"。复测后必须改成：**架构成立，但"无人值守"当前不成立**——激活（1b）没通之前，`silent` 任务下发不出去，只能靠 `into-current` 明示注入或二期 MCP 拉模式。这不是"半天实测"级别的风险，是**一期能不能兑现承诺的分水岭**，里程碑要按它重排（见 §十）。

---

## 十二、对 v2.1 主方案的修订点

| 位置 | 原文口径 | 修订后 |
| --- | --- | --- |
| §5.1 | `acp-client.js` 端口自动发现（含 `netstat -ano`） | 改为 `runtime-manager.js`：**拉起并持有**运行时；端口发现仅作兜底；★spawn 必须带两个 env，否则起的是 GUI 或 MODULE_NOT_FOUND |
| §5.1 | `discoverPort` 结果缓存端口 | ★**取消端口缓存**：托管运行时端口虽固定，但桌面 sidecar 端口每次随机且会复用回收位；缓存必错。每轮从注册文件现取 |
| §5.5 | 端口自动发现、绝不写死 | 改为：**固定 `--port` + 注册文件核对**，`netstat` 降为第三重兜底；★注册文件要扫 `~/.codebuddy/sessions` 与 `~/.workbuddy/sessions` **两个目录** |
| §5.5 | 连续 `session/new` 返回相同 sessionId → "首次复用、再次新建" | ★修正为：**外部客户端两次都拿到活跃会话**（V15），"再次新建"不可复现；挂靠无隔离路径，自托管隔离成立（V16） |
| §5.5 | 就绪判定 stdout `reported ready` 254–281ms | ★改为：**注册文件命中为主，端到端 1.5–1.7s**；`reported ready` 是 daemon 打的，自托管 stdout 只有横幅 |
| §5.2/§5.5 | 请求头两条 + Accept | ★新增第三条必需：`x-codebuddy-request`（缺失 403）；并写明**所有响应都是 SSE**，`initialize/session/new` 的 result 要从 `data:` 帧里取 |
| §4.1 用户承诺 | 装 exe、配码，之后不用打开 WorkBuddy | ★改为：装 exe、配码、**激活一次**；未激活显示 `NEEDS_ACTIVATION`，`silent` 任务排队不下发 |
| §11.4 | `cwd` 限定工作区白名单 | 补充：真正生效的是 `--add-dir` + `--tools`（进程级），`cwd` 只是默认目录；★桌面 sidecar 实际用 `--settings.trustedDirectories`，两者交集最稳 |
| §8 | 网关无强鉴权 = 本机可信域 | ★升级为：**ACP 面零鉴别**（密码不参与，一条静态头即过）→ 必须靠"唯一调用方 + 会话归属自检 + 工具白名单 + `--max-turns`"四道收口 |
| §13 | "ACP 非公开协议"风险 | 补充：启动方式由官方 CLI 参数证实，风险从"能不能连"降为"参数会不会变"；★但**登录态下发是黑盒**，风险从"参数会不会变"升为"激活方式可能被改" |
| §13 | "端口发现平台差异" | 风险等级下调：自托管后端口由我方指定；★macOS/Linux 未实测（本机为 Windows），一期只承诺 Windows |
| §14 M0 | 会话隔离实测结论 | 补充 V15/V16 双向证据；★M0+ 的验收项从"prompt 落盘"改为"**激活 + prompt 落盘**"两步 |

---

## 附：一句话结论

**WorkBuddy 的 ACP 网关不是"软件自带的一个端口"，而是"每个会话运行时进程的一份属性"**——所以长期握手的正确做法不是去找它，而是**用官方 CLI 自己拉起一个、指定端口、指定会话、指定权限，然后由 exe 管生管死**。

★2026-11-13 BotBuddy 侧复测后的补话：这条路**工程上全线走通**（拉起、固定端口、会话隔离、initialize/session/new 都按预期），**唯一的断点是激活**——自托管运行时不带 WorkBuddy 登录态，`session/prompt` 回 `refusal`。所以"能不能长期握手"的答案是**能**，"能不能今天就无人值守派活"的答案是**还不能，差一次 `authenticate`**。在此之前，主方案要保证的是：挂靠路径只在用户明示时注入当前会话，绝不在后台静默污染用户对话。
