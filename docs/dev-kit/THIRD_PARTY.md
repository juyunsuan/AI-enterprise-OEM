# 外部引入代码清单（THIRD_PARTY）

> 本清单是**半自动汇总 + 人工核注**：能自动发现的来源写证据路径，缺失的许可证如实标 ❌，
> 不编造、不把参考副本计入分发物。修改外部代码后必须同步本文件并跑 `pnpm devkit:check`。

## 统计口径

- 作用域：`root`（主仓）、`awbot-app/`、`bot-host-client/`、`workbench-host-client/`；`.scratch/`、`.tmp/` 只作本地参考，不计入分发。
- 引入形态：依赖引入 / vendored 改写 / 随包分发二进制 / 仅参考未移植 / 文档引用。
- 合规状态：✅ 已声明 / ⚠️ 部分 / ❌ 缺失待补。

## 清单

| 名称 | 上游 | 许可证 | 引入形态 | 作用域 | 证据路径 | 改动与约束 | 状态 |
|---|---|---|---|---|---|---|---|
| DeepSeek Harness | https://github.com/deepseek-ai/deepseek-harness | MIT | vendored 改写（算法与 UI 组件） | `awbot-app/` | `awbot-app/THIRD_PARTY_NOTICES.md`（DeepSeek Harness 段，含逐文件映射） | 保留版权与许可；派生关系写入 NOTICE | ✅ |
| dsh-go（上游工程） | `io.github.ccch1mneyyy` 的 dsh-go | AGPL-3.0 | 源码快照 + 品牌改写 | `awbot-app/` | `awbot-app/PROVENANCE.md`、`awbot-app/LICENSE` | 随 APK 提供对应源码；品牌与吉祥物不在 AGPL 范围（`awbot-app/ASSETS.md`） | ✅ |
| Phase | 见 `awbot-app/THIRD_PARTY_NOTICES.md` | MIT | vendored 改写（认证后的压缩支持） | `awbot-app/` | 同上「Phase」段 | 不改密码算法 | ✅ |
| DS Bot | 见 `awbot-app/THIRD_PARTY_NOTICES.md` | Apache-2.0 | vendored 改写 | `awbot-app/` | 同上「DS Bot」段 | 已修改，须保留许可与变更说明 | ✅ |
| dartssh2 | https://github.com/vicajilau/dartssh2（4.1.0） | MIT | vendored 本地包 | `awbot-app/` | `awbot-app/packages/dartssh2/VENDORED.md`、包内 `LICENSE` | 保留包内原始许可；Flutter 按本地依赖收集 | ✅ |
| Automa | https://github.com/AutomaApp/automa | 未标注（待补） | 随客户端内置扩展 | `bot-host-client/` | `bot-host-client/builtin-extensions/automa/` | 随包分发；当前缺独立 LICENSE / NOTICE / PROVENANCE | ❌ |
| BotBuddy 客户端 | 本仓 `bot-host-client/` | 与本仓一致（AGPL-3.0-only） | 自研 | `bot-host-client/` | `bot-host-client/` | 第三方 Electron / Chromium 许可随分发目录保留 | ⚠️ |
| WorkBuddy 客户端 | 本仓 `workbuddy-host-client/` | 与本仓一致（AGPL-3.0-only） | 自研 | `workbuddy-host-client/` | `workbuddy-host-client/` | 同上 | ⚠️ |
| CRMEB v8.0 | https://www.crmeb.com/ | Apache-2.0 | **仅参考**（业务分层与数据结构） | `.scratch/`（本地，不入库） | `README.md` 致谢；`.gitignore` 忽略 `.scratch/` | 未移植源码，不计入分发 | ⚠️ |
| new-api | https://github.com/QuantumNous/new-api | 未在本仓标注 | **仅参考**（本地 `.tmp/new-api-ref/`） | 本地 `.tmp/`，不入库 | `.gitignore` 忽略 `.tmp/` | 不计入分发；如后续引入须补许可证与来源 | ⚠️ |
| bee 点餐小程序 | https://github.com/woniudiancang/bee | Mulan PSL v2 | **仅参考**（点餐页布局与交互） | 本地附件，不入库 | `takeout-miniprogram/` 为独立重写，未复制上游源码或图片 | 不计入分发；如后续移植须保留许可证与来源 | ✅ |
| ub-mode（技能文本） | https://github.com/poteto（loosely based on poteto-mode / pstack） | 文档引用（随本仓以 AGPL-3.0 分发） | 文档引用 + 改写文本 | `docs/dev-kit/skills/ub-mode/` | `docs/ub-mode/README.md`、技能内 `references/README.md` | crapper / dryer / mutator / uml-viewer 为外部工具，本仓不随附 | ✅ |

## 必须如实保留的三条现状

1. `bot-host-client/` 内置 Automa 目前**没有独立许可证声明**，标 ❌；补 `THIRD_PARTY_NOTICES.md`
   或直接引用 Automa 上游许可是待办。在此之前不得宣称该部分已合规。
2. 根项目与 `awbot-app/` 均为 **AGPL-3.0-only**；通过网络提供服务须履行第 13 条
   「提供对应源码」。`awbot-app/` 的第三方组件**不在商业授权范围**（`docs/商业授权说明.md`）。
3. `update/sources/` 下的旧 `LICENSE` 为 **Apache-2.0** 历史残留，不代表当前项目许可，
   也不得作为分发许可依据。

## 维护

- 自动发现：`node scripts/gen-third-party.mjs` 汇总已有 NOTICE / PROVENANCE / 依赖与扩展 manifest。
- 人工核注：补「未标注」项与合规判断，保证每个 ✅ 项都有证据路径。
- 校验：`pnpm devkit:check`。
