# AWBot 手机接入方案（Agent-Bot · AWBot 手机）

> 目标：在平台「工作台 → Agent-Bot」下新增 **AWBot 手机**，让 AWBot（DSH Go / Flutter）像 BotBuddy 一样通过 **6 位连接码**接入本站账号；平台可下发 Prompt，由手机内的**本地 DSH Agent** 执行并流式回传；配对后自动把该账号的平台模型渠道（含 API Key）同步进手机现有模型配置。
>
> 原则：**不改造 AWBot 主体代码结构**，不改引擎、运行时、插件框架、聊天与模型框架；只新增伴生模块、注册入口与少量构建/清单配置。平台侧尽量复用 Bot 主机（Workbuddy Host）现有能力。
>
> 本文只做方案，不含实现。

---

## 1. 结论与路线

1. **平台侧复用 Bot 主机骨架**：指令队列、心跳、配对码、模型授权、会话、定时任务全部沿用 `WorkbuddyHost*` 数据表与 `bot-host` 服务，仅增加 `clientKind`（`DESKTOP` / `AWBOT`）区分设备类型；新增「AWBot 手机」菜单与页面，接口按 kind 过滤。
2. **App 侧新增伴生模块 `AWBot Link`**：一个独立的纯 Dart 包（配网/配对/心跳/任务执行/模型同步）+ 一个 Flutter 侧薄封装（状态与页面）+ Android 前台服务。它调用 AWBot 既有的 `DshClient`、`ProviderActions`/密钥存储和本地引擎启动能力，不修改这些框架本身。
3. **为什么不是纯 DSH 插件**：AWBot 官方插件协议明确「不能后台常驻、不能主动唤醒、不能发系统通知、不能控制主机/权限」，只能渲染声明式 UI 和在一次调用内运行。配对、心跳、后台任务必须由 App 侧伴生模块承担；可选再做一个**只显示状态卡/胶囊**的 DSH 插件作为界面增强。
4. **“平台唤起本地 Agent” 的真实边界**：平台负责**排队 + 下发**；App 在线时（Android 前台服务）收到指令后启动/复用本地引擎并执行；App 被系统杀死且无推送通道时无法被远端唤醒，只能等下次打开 App 后补领。iOS 首版仅前台执行；推送唤醒列为 P3（FCM / 厂商推送）。
5. **模型同步**：平台心跳沿用现有 `modelGrant`（`baseUrl` / `protocol` / `apiKey` / `model` / `source`）；AWBot Link 用 AWBot **现有** 自定义模型 Provider 能力写入一条固定 Provider（`AWBot 平台`），不覆盖用户已有模型与内置 DeepSeek Key；撤销授权只删除该 Provider。

---

## 2. AWBot 现状与可复用能力

| 能力 | 位置 | 复用方式 |
| --- | --- | --- |
| 本地 DSH Agent | 手机内 PRoot + `dsh web`（127.0.0.1:3080），`packages/dsh_client` | 直接 `createSession` / `prompt` / `watch` / `cancel`，无需改引擎 |
| 会话与流式事件 | `DshClient.watch()`、`ChatTranscript` | 任务执行器订阅事件，转成平台 progress / result |
| 本地引擎启停 | Android `DshService` / `RuntimeController` | 复用现有前台服务与状态，按需启动引擎 |
| 模型/Provider 配置 | `ProviderActions.save`、`SettingsController.saveProviderKey`、`ProviderKeyVault`、引擎 `llm-pi-ai` 路由 | 仅调用现有 API 写入模型与密钥 |
| 安全存储 | `AppSecureStorage` / `ProviderKeyVault` | 存平台令牌与同步的 API Key |
| UI 扩展点 | `AppPage`、设置索引 `settings/index/spots.dart`、功能目录 `ui/features/feature_catalog.dart`、深链 `links/page_links.dart` | 新增页面与入口，不改导航结构 |
| 原生插件 | `sdk/plugin-kit`、`docs/plugins/*` | 仅用于可选的聊天内状态展示；不承担连接与后台 |

**AWBot 源码现状**：Flutter + 原生 Android/iOS；Android applicationId 为 `io.github.ccch1mneyyy.dsh_app`，应用显示名当前为 `DSH Go`；AGPL-3.0。改造与分发需遵守 AGPL（提供对应源码、保留 NOTICE）；本方案不向上游提交 PR（上游政策不接受外部 PR）。

---

## 3. 总体架构

```text
┌──────────────────────────── 平台（本系统） ────────────────────────────┐
│ 工作台 → Agent-Bot                                                      │
│   ├─ Bot 主机        /bot/hosts     （原有，kind=DESKTOP）              │
│   └─ AWBot 手机      /bot/awbots    （新增，kind=AWBOT）                │
│        ├─ 设备台账：在线 / 心跳 / 电量 / 引擎 / 版本 / 待执行            │
│        ├─ 配对：输入 6 位连接码（同一账号）                              │
│        ├─ 对话：一条设备一个对话，下发 Prompt / 取消                     │
│        ├─ 定时任务：到点入队，离线排队                                   │
│        └─ 模型授权：渠道 + 模型 → 心跳下发给该设备                       │
│                                                                         │
│  bot-host 服务（复用）：配对码 / 心跳 / 指令队列 / 进度 / 回执 / 授权     │
│  workbuddy_hosts.client_kind ∈ {DESKTOP, AWBOT}                         │
└──────────────────────────────▲──────────────────────────────────────────┘
                               │ HTTPS（出站；x-bot-token: awb_...）
┌──────────────────────────────┴──────────────────────────────────────────┐
│ AWBot App                                                               │
│  AWBot Link 伴生模块（新增）                                             │
│    ├─ 登录 / 6 位码配对 / 令牌安全存储                                   │
│    ├─ 心跳（5s，退避重连）→ 领取指令 / stop / modelGrant                 │
│    ├─ 任务执行器 → 本地 DSH Agent（DshClient.prompt/watch/cancel）       │
│    ├─ 模型同步 → 现有 Provider/Key 框架写 “AWBot 平台” Provider          │
│    └─ Android 前台服务：保活 + 通知 + 后台执行                           │
│  现有 DSH 引擎 / 聊天 / 模型 / 插件：不改结构，仅被调用                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 平台侧设计

### 4.1 菜单与页面

- 菜单：`工作台 → Agent-Bot` 分组下新增 `AWBot 手机`（`/bot/awbots`，icon: mobile），排在「Bot 主机」之后。
- 页面沿用 Bot 主机的三段式：**设备 / 对话 / 定时任务**。
  - 设备台账：设备名、在线、最近心跳、电量/充电、网络（WiFi/蜂窝）、App 版本、本地引擎状态、模型同步状态、待执行数、最后 IP、令牌前缀。
  - 配对区：输入手机展示的 6 位连接码 → 绑定为当前账号的设备。
  - 设备操作：编辑名称、模型授权、重置令牌、停用、移除（移除即吊销令牌）。
  - 对话：一台设备一个对话（A2A）；平台下发 Prompt、取消、查看流式过程与结果。
  - 定时任务：once / scheduled / recurring，到点入队，错过不补跑，失败仅留痕。
- 前端复用 `src/app/bot/hosts/_components/*`，给 `HostPanel` / `ChatPanel` / `SchedulePanel` 增加 `kind` 参数（标签差异：桌面“工作区”在手机侧隐藏；增加电量/引擎展示）。新增 `src/app/bot/awbots/page.tsx`，不复制业务逻辑。

### 4.2 数据模型（增量最小）

复用现有 6 张 `WorkbuddyHost*` 表，不做第二套队列/调度：

| 表 | 变更 |
| --- | --- |
| `workbuddy_hosts` | 新增 `client_kind VARCHAR(16) NOT NULL DEFAULT 'DESKTOP'`；新增索引 `(user_id, client_kind, status)`；`platform` 允许 `android` / `ios`；`caps` 存电量、充电、网络、引擎状态、`modelSyncedAt` 等 |
| `workbuddy_host_pair_codes` | 新增 `client_kind VARCHAR(16) NOT NULL DEFAULT 'DESKTOP'` |
| 指令 / 会话 / 定时 / 运行记录 / 模型授权 | 不变，按 `hostId` 归属；AWBot 指令 `payload` 只含 `{ instruction, timeoutSec }`（无 cwd） |

- 迁移文件：`backend/prisma/migrations/0106_mobot_client_kind/migration.sql`。
- 兼容性：存量主机默认 `DESKTOP`，Bot 主机页面行为不变。
- 约束：AWBot 与 Bot 主机在业务层通过**唯一的 scope helper** 过滤 kind（列表、配对、令牌校验、详情、授权都走它），避免漏过滤导致“手机出现在桌面主机里”。
- 令牌：沿用 `x-bot-token`；AWBot 新签发前缀 `awb_`，桌面仍为 `bot_`（兼容更早 `wb_`）。令牌只存 sha256，明文仅在配对成功响应出现一次。

### 4.3 接口

**公开（App 使用，免登录；登录/配对走账号会话）**——建议新增独立命名空间，逻辑委托同一服务：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/public/awbot/login` | 账号密码换会话（复用现有实现，限流） |
| POST | `/api/public/awbot/session` | 会话校验 / 续期 |
| POST | `/api/public/awbot/pair` | 已登录客户端申请 6 位码（body 带 `clientKind=AWBOT` + 设备信息） |
| POST | `/api/public/awbot/pair/poll` | 轮询取回一次性 `awb_` 令牌 |
| POST | `/api/public/awbot/heartbeat` | 指令 / stop / `modelGrant` / 心跳周期 |
| POST | `/api/public/awbot/progress` | 流式片段 + 取取消标记 |
| POST | `/api/public/awbot/result` | 终结回执（按 `commandCode` 幂等） |
| POST | `/api/public/awbot/logout` | 转离线，保留令牌 |

> 独立命名空间便于 AWBot 后续演进（推送、能力协商）且不影响 BotBuddy；内部复用 `bot-host.service` 的同一组方法，只是固定 `kind=AWBOT`。`bot-host.public.ts` 的登录/心跳等主体逻辑抽为共享函数，不复制协议实现。

**站内（登录后）**：复用现有 `/enterprise/bot-hosts/*`，列表/视图增加 `kind=AWBOT` 过滤与 `clientKind` 字段；配对认领、对话、模型授权、定时任务接口不变。

### 4.4 模型授权与下发

- 复用 `WorkbuddyHostModelGrant` 与 `modelGrantForHost`：
  - 平台在 AWBot 设备上选渠道 + 模型；默认“跟随平台默认文本模型”。
  - 心跳返回 `{ channelId, baseUrl, protocol, apiKey, model, source }`（按变化指纹下发，不变则 `grantUnchanged`）。
  - 若授权指向本站内置 AIPDD 渠道，则沿用现有兜底：用该账号绑定的 AIPDD Key（未绑定则平台 Key）拼出 `baseUrl/apiKey`；App 侧看到的就是一笔可直接用的模型配置。
  - 撤销 / 渠道停用 / Key 解不开 → 下次心跳 `modelGrant=null`，App 只清理自己创建的 Provider。
- 平台不保存手机端模型配置；只保存“授权关系”，真实 Key 在心跳时按现有 Route B 解密下发。

---

## 5. AWBot App 侧设计（插件式伴生模块）

### 5.1 目录与改动边界

```text
packages/awbot_link/                 # 新增：纯 Dart，无 Flutter 依赖，可单测
  lib/awbot_link.dart
  lib/src/api.dart                  # HTTPS 客户端（/api/public/awbot/*）
  lib/src/pairing.dart              # 登录、6 位码、令牌
  lib/src/heartbeat.dart            # 心跳、退避、指令领取
  lib/src/executor.dart             # 任务执行（注入 DshClient）
  lib/src/model_sync.dart           # modelGrant → 现有 Provider/Key
  lib/src/inbox.dart                # commandCode 幂等与本地状态
  test/...
app/lib/awbot/                       # 新增：Flutter 伴生层
  awbot_bootstrap.dart               # 初始化/生命周期桥接
  awbot_state.dart                   # Riverpod Notifier（连接/设备/任务状态）
  awbot_executor.dart                # 绑定本地引擎与 DshClient
  awbot_model_bridge.dart            # 调 ProviderActions/SettingsController
  ui/awbot_page.dart                 # 连接、配对、状态、最近任务
  ui/awbot_pair_page.dart
app/android/app/src/main/kotlin/.../awbot/AWBotLinkService.kt   # 新增：前台服务
```

**对用户无额外安装步骤**：AWBot Link 随 App 构建，不需要另装插件；如需卸载能力，只需在连接页断开并关闭后台服务。

**对上游文件仅做极薄接入（不重构）**：

| 文件 | 改动 |
| --- | --- |
| `app/lib/main.dart` | 引入并启动 `AWBotBootstrap.start()`（约 2 行） |
| `app/lib/ui/settings/index/spots.dart` + `settings_pages.dart` | 注册「AWBot 连接」设置页（既有框架要求） |
| `app/lib/ui/features/feature_catalog.dart` | 可选加入功能目录入口 |
| `app/android/.../AndroidManifest.xml` | 新增 Service、通知权限、可选开机自启 receiver（纯新增） |
| `app/android/.../MainActivity.kt` | 注册 AWBot 的 MethodChannel（约 2–3 行） |
| 品牌配置 | `AndroidManifest android:label` → `AWBot`；iOS `CFBundleDisplayName` → `AWBot`；图标/启动图/关于页 |

不修改：`state/chat_state.dart`、`providers_state.dart`、`settings_state.dart`、`packages/dsh_client`、引擎、runtime、plugin-kit 与任何补丁。新增代码都在新目录内，保持上游更新可合并。

### 5.2 连接与配对时序

```text
AWBot                              平台
  │ 1. 登录 /api/public/awbot/login  │
  │────────────────────────────────▶│
  │ 2. 申请连接码（clientKind=AWBOT） │
  │────────────────────────────────▶│  生成 6 位码（10 分钟、一次性、同账号认领）
  │ 3. 展示 6 位码                    │
  │                                 │ 4. 用户：工作台 → Agent-Bot → AWBot 手机 → 输入码
  │                                 │    绑定为本账号的 AWBOT 设备，签发 awb_ 令牌
  │ 5. 轮询 pair/poll                │
  │────────────────────────────────▶│
  │ 6. 保存令牌到安全存储，开始心跳    │
  │────────────────────────────────▶│  返回 commands / stop / modelGrant
```

- 同一账号才能认领；账号停用 / 离职后令牌按现有 `scope.isStanding` 失效。
- 令牌重置 / 移除设备：旧令牌立即失效；App 在下一次心跳收到 401 后转“未连接”并提示重新配对。
- 连接页支持“站点地址 + 账号密码”登录；令牌到期续期沿用现有 `/session`。可选 P2 加二维码（平台生成一次性登录/配对深链）。

### 5.3 心跳、唤醒与任务执行

**心跳**（前台服务内，默认 5s，失败指数退避 5→60s）：

```json
{
  "platform": "android",
  "clientVersion": "awbot/1.0.0",
  "caps": {
    "battery": 82, "charging": true, "network": "wifi",
    "engine": "ready", "canWake": true,
    "modelSyncedAt": "2026-11-16T12:00:00Z"
  }
}
```

响应：`commands[]`（`commandCode`, `kind`, `title`, `instruction`, `cwd`, `mode`, `timeoutSec`；AWBot 的 `cwd/mode` 固定为空）、`stop[]`（取消）、`modelGrant`、`heartbeatSeconds`、积分余额。

**执行**（任务执行器，串行）：

1. 收到 Prompt → 写入本地幂等表（`commandCode` 去重）。
2. 确保本地引擎：优先复用正在运行的 DSH；未运行且“允许平台唤起本机 Agent”开启时，用现有 `RuntimeController/DshService` 启动并等待 ready；否则回 `FAILED(engine_off)` 并提示打开 App。该开关默认**开**（配对即授权），可在 AWBot 连接页关闭。
3. 会话策略：一台 AWBot 设备固定使用一个本地 DSH 会话「AWBot 平台」（首次创建，sessionId 存安全/普通偏好；引擎重置后重建），平台侧一条设备对话对应它。避免每次任务新建会话污染会话列表；用户可在聊天里看到这些执行记录。
4. `DshClient.prompt(sessionId, instruction, requestId: commandCode)` —— 幂等重试不会重复执行。
5. `DshClient.watch(sessionId)`：
   - 文本增量 → 节流（约 800ms / 4KB）上报 `/progress`；
   - 工具调用、审批等待 → 上报摘要；
   - 结束事件 → 读取最终文本 / 错误，调用 `/result`（`elapsedMs`, `errorCode`）；
   - 收到 `stop` 或 progress 响应带取消 → `DshClient.cancel(sessionId)`，回执 `CANCELED`。
6. **审批不绕过**：手机端仍按现有权限档与审批弹窗执行；后台等待审批时发本地通知“AWBot 任务等待确认”，平台进度显示“等待手机确认”。超时按命令 `timeoutSec` 失败，平台可见原因。
7. 单设备串行、超时终止、离线队列由平台负责；App 不保存平台指令历史（只存幂等码与最近结果摘要）。

**后台保活**：

- Android：新增 `AWBotLinkService` 前台服务（复用 `DshService` 的通知/类型写法），配对成功且“自动连接”开启时启动；常驻通知显示“AWBot 已连接 / 正在执行任务”；任务结束回到“已连接”。
- App 进程被系统杀死：服务按系统策略可能重启；命令留服务端 PENDING，下次上线补领。**没有推送就无法保证被杀死后立刻唤起**，界面如实标注“离线/上次在线”。
- iOS：首版仅前台 + 短时后台宽限；不做常驻承诺。P3 再评估 BGTask / 推送唤醒。
- 可选：Android 开机自启（默认关）、电池优化白名单引导（只提示，不强制）。

### 5.4 模型 / API Key 自动同步（只做数据同步）

**触发**：心跳返回 `modelGrant` 且指纹变化（或 `grantUnchanged=false`）。

**写入**（全部走 AWBot 现有能力，不改框架）：

1. 固定 Provider 路由：`awbot-platform`；显示名：`AWBot 平台（自动同步）`；协议：`openai` / `anthropic`（由 `protocol` 决定）；Base URL / 模型取授权值。
2. 通过现有 `ProviderActions.save`（或等价的引擎 custom provider API）创建 / 更新该 Provider；仅包含授权模型（可按需 discover 追加，v1 只写授权模型）。
3. Key 通过现有 `backend.storeKey` + `SettingsController.saveProviderKey` 写入（引擎密钥 + 手机安全存储自愈副本），与其他 Provider 的存储路径一致。
4. 若用户当前没有任何可用模型：可把该 Provider 设为默认；否则**不自动切换**，只提示“平台模型已同步”。
5. 授权撤销 / `modelGrant=null`：仅删除 `route=awbot-platform` 的 Provider 与其 Key；不触碰用户自建 Provider、内置 DeepSeek Key。
6. 手机回写 `caps.modelSyncedAt`（或下一次心跳带上），平台设备卡显示“模型已同步/同步失败原因”。

**密钥红线**：平台侧不下发可回传的明文存储；App 不打印 Key、不进诊断包、不进日志；所有同步只经 HTTPS（开发可允许局域网 HTTP）。

### 5.5 可选的 DSH 插件（界面增强，不是连接层）

做一个纯声明式插件（`examples/plugins` 同款）：
- 对话内工具卡：显示“AWBot 平台任务”进度、取消按钮（调用 App 的 action → AWBot Link）。
- 状态条 / 胶囊：显示连接状态与模型同步时间。
- 不承担登录、心跳、模型写入；即 App 未装伴生模块时插件自动降级隐藏。
- 因插件能力限制（无后台、无通知），此插件只做展示与手动触发。

---

## 6. 安全与隐私

- 令牌：服务端只存 sha256；配对码 6 位、一次性、10 分钟；同账号认领；重置/移除即失效；账号停用即吊销。
- 登录：App 只存会话令牌，不存密码；登录/配对/心跳全部 HTTPS；服务端限流复用现有 `RateWindow`。
- 权限：平台只能下发 `prompt` 与 `cancel`，不能读手机文件、不能执行 shell、不能代答审批；本机工具仍受 AWBot 既有权限档与审批约束。
- 模型 Key：沿用平台现有 Route B 解密下发；手机安全存储；撤销后只清理 AWBot 自建 Provider。
- 诊断：AWBot 现有诊断导出前需确认不包含 `awb_` 令牌 / 平台 Key；伴生模块写日志时统一脱敏。
- AGPL：AWBot 为 AGPL-3.0，分发修改版需提供完整对应源码与 NOTICE；不删除上游版权与许可；平台代码不并入 App。

---

## 7. 兼容与命名

- **应用名**：显示名改为 `AWBot`（Android `android:label` / iOS `CFBundleDisplayName` + 图标/启动图）；包名 `io.github.ccch1mneyyy.dsh_app` 首版**保持不变**，避免已装用户数据迁移。签名由分发方新建正式证书库（`CN=Mobot…`，随 AWBot 首版启用），**与上游 DSH Go 包的密钥不同**：DSH Go 存量用户需先卸载再装，此后各 AWBot 版本可正常覆盖升级；若要彻底独立分发再另立 `applicationId`（需要迁移策略）。
- 悬浮宠物、酒馆、分享、手机操控、远程主机、插件市场等现有能力不受影响；AWBot Link 只新增设置页与后台服务。
- 与 BotBuddy 完全独立：不同令牌前缀、不同菜单、不同会话视图；平台侧共用队列与调度代码。
- 版本策略：平台与 App 各自版本；心跳 `clientVersion` 上报，平台按版本提示升级。
- 构建交付：Android 继续用上游 `tooling/build-apk.sh` 出 AWBot APK；iOS 按上游 `app/ios/README.md` 在 Mac 自签；Android 签名使用分发方新建的正式证书库（首版起固定，AWBot 各版本间可覆盖升级），与上游 DSH 包密钥不同，DSH Go 存量用户需卸载重装。

---

## 8. 改动清单（按仓库）

### 平台

| 类型 | 文件 |
| --- | --- |
| 新增迁移 | `backend/prisma/migrations/0106_mobot_client_kind/migration.sql` |
| 修改 | `backend/prisma/schema.prisma`（`clientKind` 字段与索引） |
| 修改 | `packages/contracts/src/bot-host*.ts`（视图 `clientKind`、列表 `kind` 查询、配对码 kind） |
| 修改 | `backend/src/bot-host/bot-host.service.ts`（kind scope、`awb_` 令牌、配对码 kind） |
| 修改 | `backend/src/bot-host/bot-host.public.ts`（抽取共享处理 + 新增 `/api/public/awbot/*` 别名） |
| 修改 | `backend/src/http/services.ts` / `automation-routes.ts`（如新增站点接口） |
| 新增 | `frontend/src/app/bot/awbots/page.tsx` + 组件包装 |
| 修改 | `frontend/src/config/routes.ts`（Agent-Bot 菜单加 AWBot 手机） |
| 修改 | `frontend/src/app/bot/hosts/_components/*`（加 `kind` 参数与手机字段展示） |
| 文档 | README / 帮助中心增加 AWBot 接入说明 |

### AWBot

| 类型 | 文件 |
| --- | --- |
| 新增包 | `packages/awbot_link/`（API、配对、心跳、执行、模型同步、测试） |
| 新增模块 | `app/lib/awbot/`（状态、执行桥、模型桥、连接页） |
| 新增原生 | `app/android/.../awbot/AWBotLinkService.kt` |
| 极薄修改 | `main.dart`、设置索引/页面注册、功能目录、`AndroidManifest.xml`、`MainActivity.kt` |
| 品牌 | Android/iOS 显示名、图标、启动图、关于页 |
| 可选插件 | `examples/plugins/awbot-status/`（纯展示） |

> 不修改引擎、runtime、补丁、`dsh_client`、`dsh_remote`、插件 SDK 与聊天/模型核心逻辑。

---

## 9. 里程碑与验收

### P1（约 5–7 天）连接与最小闭环
- 平台：`clientKind` 迁移、配对码/令牌、AWBot 菜单与设备台账、模型授权（复用）。
- App：登录/6 位码配对、心跳、前台状态页、Prompt 执行与流式结果、取消。
- 验收：配对成功 → 设备在线 → 平台发“你好” → 手机本地 Agent 回复 → 平台看到流式过程与结果；关闭 App → 命令排队，重开补跑。

### P2（约 4–6 天）后台与模型同步
- Android 前台服务/通知/等待审批提示；任务串行与超时；模型自动同步与撤销；定时任务页签；设备详情（电量/引擎/版本）。
- 验收：锁屏且引擎未运行时，平台下发后手机被唤起并执行（Android）；平台改授权 → 手机模型配置出现“AWBot 平台”且可用；撤销 → 仅该 Provider 消失；手机端无 Key 日志。

### P3（约 3–5 天）增强
- 推送唤醒（FCM/厂商）、二维码配对、iOS 后台策略、多设备上限、平台 Agent 通过工具向 AWBot 派单、连接诊断。
- 验收：进程被杀后推送可达（支持机型）；iOS 前台/短后台行为与文档一致。

### 统一验收清单
1. 同一账号 6 位码配对；非本账号无法认领；令牌只出现一次；重置/移除即失效。
2. AWBot 只出现在「AWBot 手机」，Bot 主机列表不混入；反之亦然。
3. 平台只能下发 prompt/cancel；手机审批不被绕过；平台看不到手机文件与本地模型配置。
4. `commandCode` 幂等：网络重试不重复执行；取消及时中断。
5. 模型同步：协议/Base URL/模型正确；Key 可在手机发起对话；撤销只清理自动 Provider；诊断与日志无明文 Key。
6. Android 前台服务通知可见；离线命令排队并显示；iOS 限制如实提示。
7. AWBot 原聊天、模型、插件、宠物、手机操控、远程主机不回归；上游可合并（改动仅限清单内极薄接入）。

---

## 10. 风险与不做

| 风险 | 说明 / 对策 |
| --- | --- |
| 系统杀后台 | Android OEM/Doze 无法 100% 保活；前台服务 + 电池优化引导 + 离线队列；P3 推送。界面不承诺“永久在线”。 |
| iOS 后台 | 无常驻服务；首版前台执行，禁止夸大“随时唤醒”。 |
| 手机资源 | 本地引擎 + PRoot 耗电/发热；空闲可停引擎（配置项），任务前再拉起；串行执行。 |
| 审批阻塞 | 后台任务遇审批需人工；通知引导，超时失败并说明，不自动放行。 |
| 平台 Key 落手机 | 有意为之但需明确授权与撤销；安全存储、脱敏、只存一份 Provider。 |
| 共用表 kind 漏过滤 | 统一 scope helper + 单测（AWBot/桌面互不可见）+ 索引；Code Review 必查。 |
| AGPL 合规 | 修改版 AWBot 必须开源对应源码、保留许可/NOTICE；不并入平台私有代码。 |
| 上游升级冲突 | 伴生模块隔离在新目录；上游文件仅极薄注册，冲突面可控；不随上游改结构。 |
| “唤起”预期 | 平台唤醒 = 在线时下发并由前台服务拉起引擎；不是任意时刻远程开机。方案与 UI 均写明。 |

**本期不做**：远程控制手机的相机/麦克风/通讯录；平台读取手机文件；多账号共享一台 AWBot；平台侧远程安装插件；iOS 常驻后台。

---

## 11. 已定建议（待确认）

1. **数据层**：复用 `WorkbuddyHost*` + `clientKind`，不新建第二套队列表。
2. **接口**：App 走独立 `/api/public/awbot/*` 命名空间，内部复用 bot-host 服务；站内页面复用现有 hosts 接口按 kind 过滤。
3. **App 接入**：`packages/awbot_link` + `app/lib/awbot` 伴生模块；DSH 插件只做可选展示。
4. **任务会话**：每台 AWBot 固定一个本地 DSH 会话「AWBot 平台」，不按任务建会话。
5. **模型同步**：固定 Provider `awbot-platform`，不动用户已有模型/内置 Key；首次无模型才自动选中。
6. **唤醒开关**：配对后默认允许平台唤起本机 Agent（前台服务常驻、通知可见），用户可关。
7. **改名范围**：显示名 AWBot；首版不改包名，避免存量数据迁移。
8. **后台范围**：Android 前台服务先做；iOS 与推送唤醒放 P3。

确认后即可按 P1 开工；若需调整（例如一期就上 iOS 推送、或独立包名），在动工前先改本方案。
---

## 12. 平台侧实现状态（2026-11-16）

- 已实现平台侧：
  - `workbuddy_hosts` / `workbuddy_host_pair_codes` 增加 `client_kind`（迁移 `0106_mobot_client_kind`），存量设备默认 `DESKTOP`；
  - 站内「Agent-Bot → AWBot 手机」`/bot/awbots`：设备 / 对话 / 定时任务三页签，复用 Bot 主机组件并展示手机状态；
  - AWBot 设备按 `awb_` 令牌 + 独立公开通道 `/api/public/awbot/**` 配对/心跳/进度/回执；桌面通道与手机通道按 kind 互斥；
  - 列表按 `kind` 隔离；AWBot 指令不下发桌面工作区/执行模式；平台模型授权沿用现有心跳 `modelGrant`；
  - 后端单测覆盖 kind 隔离、AWBot 配对码认领、`awb_` 令牌、手机指令无 cwd；真实 API 联调覆盖配对 → 心跳 → 下发 → 进度 → 回执 → 会话 → 跨通道拒绝 → 清理。
- App 侧见 §13。

## 13. AWBot App 侧实现状态（2026-11-16）

实际文件与 §5.1 的命名对应：`executor` → `awbot_agent.dart`，`model_bridge` → `awbot_models.dart`，`bootstrap` 合入 `awbot_state.dart`。

- `packages/awbot_link/`（纯 Dart，不依赖 Flutter 与引擎类型）：
  - 登录 / 会话 / 6 位码配对 / 轮询认领；账号会话只走 `Authorization: Bearer`，设备只走 `x-bot-token`；
  - 心跳（默认 5s，失败 5→60s 退避）、`commands` / `stop` 领取、串行执行、`commandCode` 幂等（本地留存最近 200 条）；
  - 进度分片上报（每片 3800 字符，失败即退回游标重试）与 `cancelRequested` 中转为本轮取消；一条终止回执（`ok / text / errorMessage / elapsedMs / canceled / failReason / acpSessionId`）；
  - 模型授权同步：固定路由 `awbot-platform`，指纹 `channelId|protocol|baseUrl|model`（不含 Key），撤销只清理本模块创建的 Provider。
  - 验证：`dart analyze` 无告警，`dart test` 全绿；对真实 HTTP 桩联调 21 项通过（Key 只在入站出现一次、401 停连并清令牌、跨账号 409）。
- `app/lib/awbot/` + `app/lib/ui/awbot/`（Flutter 伴生层，不改上游结构）：
  - `awbot_state.dart`：站点 / 账号 / 设备 / 链接状态合一的 Notifier，App 启动即恢复并自动心跳（`app.dart` 仅加一行）；站点地址变更会清掉旧站点的两份令牌；「暂停」与「允许平台唤起」都持久化；
  - `awbot_agent.dart`：本地引擎执行桥。固定会话「AWBot 平台」；本轮由 `session/prompt` 回传的 `requestId` 在日志里认领，历史回放因此不会误报；工具调用与审批等待只上报名称，`blocked` 不算结束——审批仍在手机上做；
  - `awbot_models.dart`：写入本机 Provider（`ProviderProfile` + `storeKey` + 手机密钥自愈副本 + 目录失效），只碰 `awbot-platform`；
  - `awbot_stores.dart`：普通偏好与安全存储分流（令牌只进安全存储，不进日志/诊断包）；
  - `awbot_foreground.dart`：Android 常驻通知与电量/充电/网络 caps；
  - 页面：设置 › 主机 › AWBot 手机（站点、账号、积分、连接开关、唤起开关、平台模型状态、最近指令）与配对页（站点 → 登录 → 6 位码 → 自动轮询）。
- 原生（纯新增）：`awbot/AWBotLinkService.kt`（`specialUse` 前台服务 + 常驻通知，保住进程让 Dart 心跳继续跑）、`MainActivity` 的 `awbotForeground` / `awbotDeviceCaps` 通道、`AndroidManifest.xml` 的 service 声明。
- 极薄接入：`app/pubspec.yaml`（path 依赖）、设置索引与页面注册、`app/lib/l10n/parts/awbot_{zh,en}.arb` + 搜索关键词、`.github/workflows/ci.yml` 的 Dart 包闸门加入 `packages/awbot_link`。
- 品牌：`android:label`、iOS `CFBundleDisplayName`、`AppStrings.APP_NAME`、`AppInfo.name` → `AWBot`；包名 `io.github.ccch1mneyyy.dsh_app` 不变。应用内文案已统一：ARB 分片 52 个文件、Android 资源与 Kotlin 字面量 15 个文件、Dart 内联文案 4 处、使用手册 13 个文件（`app/assets/skills/dsh-go-guide/` 由 `guide_sync.py` 重建）、测试期望 36 个文件。
- 有意保留 `DSH Go` 的三类：
  - 上游署名：`hubAboutAuthor`「DSH Go 原作者」、`botsProjectHome`「DSH Go 项目主页」，README/AGPL 与 ASSETS 授权说明同样不改（应用内其余提到本 App 的文案，含 star 弹窗与「给 AWBot 点个 star」，已跟随新名）；
  - 落盘路径：相册 `Pictures/DSH Go`、`Movies/DSH Go`（改名会让历史文件散进两个相册）；
  - 标识符：`dsh-go`、`dsh-go-guide`、`dshgo://`、`dsh-go.json` 等技能/协议/深链名。
- 默认模型（§11.5）已实现，口径收窄：引擎的模型目录只列有凭据的供应商，因此「目录为空」= 这台手机原本跑不了任何模型；只有此时才在 AWBot 会话上调用既有 `session/selectModel`（引擎会同时把它存为新会话默认）。原本就有模型的手机不动用户的选择；路由注册晚于 profile 写入，这一次没选中就留给用户手动挑，不算失败。
- 未做（按方案属可选或后续）：二维码配对、iOS 后台、推送唤醒、`examples/plugins/awbot-status`；Dart 源码注释里的项目名沿用 `DSH Go`（注释描述上游工程，非界面文案）。
- 已在本机出包（2026-11-17，Windows + WSL Ubuntu 24.04，当时品牌为 Mobot）：`tooling/build-apk.sh` 产出 release/arm64 包
  `app-arm64-release.apk` 220.9MB，`versionName=1.1.0` / `versionCode=11171843`（构建分钟），
  `package=io.github.ccch1mneyyy.dsh_app`、`application-label=Mobot`；签名证书
  `CN=Mobot, OU=Mobot, O=Mobot, L=Shanghai, C=CN`，SHA-256 指纹
  `abb63dc373546410ffc6ed9e1bba7c3be7bb11164c25b775eb23a5e8c4df1cf7`，与新建签名库逐字节一致；
  包内 JNI 类定义经 `tooling/check_apk_jni.py` 回检通过。
- 已在本机重新出包（2026-11-19，MoBot 更名 AWBot 后）：`tooling/build-apk.sh` 产出 `AWBot-1.1.0-arm64.apk`
  （220.9MB，release/arm64，`versionName=1.1.0` / `versionCode=11182150`，SHA-256
  `4c852b8e58d298f84928f7c0ed3e53ebc770ce9d580f77d844469a49e41d720d`，落盘 `awbot-app/dist/` 并带 `.sha256` 旁证文件）。
  `aapt dump badging` 复核 `application-label=AWBot`、`package=io.github.ccch1mneyyy.dsh_app` 不变；JNI 回检通过；
  签名**复用 Mobot 时期证书库**（证书 subject 仍为 `CN=Mobot…`，指纹同上不变），故 Mobot 存量用户可直接覆盖升级。
  本版起设备令牌前缀由 `mb_` 改为 `awb_`，旧令牌不识别、需重新配对；runtime bundle 复用 11-17 在 WSL ext4
  （`/root/mobot-build/runtime/out`）的产物，经 `check_runtime_bundle.py` 按 manifest 逐条校验后回拷 Windows 侧。
- 仍未验证：真机联调（本机无 Android 真机），锁屏与省电策略下的前台服务表现，审批等待时是否复用既有 ChatAlerts 通知。
- 出包环境实录（供复现，均为本机环境处置，**未改动 App 源码与任何 sha256 pin**）：
  - `runtime/build-runtime.sh` 只能在 x86_64 Linux 跑，故在 WSL Ubuntu 24.04 的 ext4 内构建后回写 `runtime/out`；
    该步要求 `zstd` 命令行（Python 3.12 无 stdlib zstd，`rtbuild.py` 会回落调用它）。
  - 固定输入有两处取不到：清华镜像的 `ubuntu-cdimage` 路径对 GET 返 403（HEAD 却是 200），改从 Canonical
    `cdimage.ubuntu.com` 取；`github.com/termux/proot/archive/*.zip` 出现连接重置，重试即成。
    两者都按 `build-runtime.sh` 自带的 pin 逐字校验 sha256 后才作为 `runtime/.cache` 落盘（`fetch()` 认缓存）。
  - Gradle 侧两个坑：`rtbuild` 之外还需要 `ANDROID_HOME` 指向**不含空格**的 SDK 路径（NDK 工具链拒绝
    `Program Files`，本次用目录联接 `C:\Android\android-sdk` 规避，未搬迁文件）；Kotlin 增量编译无法跨盘根，
    需让 pub 缓存与工程同盘（把已下载的 pub 缓存镜像到工程盘并设 `PUB_CACHE`，再 `flutter clean` + `flutter pub get`
    重写 `.dart_tool/package_config.json`——只设环境变量不会重写已解析路径）。
- 闸门（Windows 本机 + WSL Ubuntu 24.04 复刻 CI 环境：Flutter 3.47.7 / Dart 3.13.5 / 同版本 fonts-noto-cjk 与 NotoColorEmoji 2.051）：
  - `packages/awbot_link`：`dart analyze` 无告警，`dart test` 52 项通过；
  - `app`：`flutter analyze` 无告警；`flutter test` 全量 13889 通过 / 310 跳过 / 0 失败（改名后先跑一遍收集差异、重新生成基线，再跑一遍全绿）；
  - `python3 app/tool/l10n_merge.py --check` 通过（76 个分片、8152 条），`python3 app/tool/guide_sync.py --check` 通过（38 个文件），`lib/l10n` 与 `app/assets/skills/dsh-go-guide/` 均已同步生成；
  - 显示名改为 Mobot 时共重新生成 90 张 golden 基线（启动图、设置中心页与各设置页、分享卡与面板、手机操控与免确认弹窗、打扰模式、更新页、账号页、酒馆、插件市场、使用统计提示、star 弹窗等），另有 111 张逐字节未变；2026-11-19 更名 AWBot 后已在 WSL Ubuntu 24.04（Flutter 3.47.7 + 与 CI 同版本字体）按新品牌重生成：共 **193 张**基线有字节变化（首轮 113 张，补跑 harness 用例的 update/account/shell 等再 80 张），其余未变；`flutter analyze` 无告警，golden 更新轮 1941 通过 / 158 跳过，全量 `flutter test` 复跑 **13889 通过 / 310 跳过 / 0 失败**（仅测试基线，不进包）。
  - 同批修正 `test/share_hosted/hosted_links_page_test.dart` 的固定日期：列表加载会按**真实时钟**清理「过期超过 30 天」的链接，2026-11-19 起原夹具恰好越过阈值导致该用例失败；测试基准日期锚到 2036（仅测试改动，不影响包）。
  - Windows 本机渲染 golden 与 Linux 基线相差约 1.7%（字形抗锯齿），因此基线只在 Linux 侧更新，与 `docs/testing/*` 的既有约定一致。

