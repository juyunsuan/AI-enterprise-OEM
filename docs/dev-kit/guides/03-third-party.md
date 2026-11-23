# 外部引入代码包说明

## 清单入口

- 仓库级：`docs/dev-kit/THIRD_PARTY.md`（名称、许可证、引入形态、作用域、证据路径、合规状态）。
- 客户端逐文件映射：`awbot-app/THIRD_PARTY_NOTICES.md` 与 `awbot-app/PROVENANCE.md`。
- 商业授权边界：`docs/商业授权说明.md`。

## 许可口径

- 根项目：AGPL-3.0-only。通过网络提供服务时，须履行 AGPL 第 13 条「提供对应源码」义务。
- `awbot-app/`：同为 AGPL-3.0，第三方组件按各自原许可证分发，**不在商业授权范围**。
- vendored 代码：保留上游版权头与 SPDX 标识，并在清单里给出「本仓库文件 ↔ 上游来源」。
- 参考但未移植的代码：在清单注明「仅参考」，不计入分发物。
- `.scratch/`、`.tmp/`、`update/sources/` 等本地副本不作为事实源，也不计入分发。

## 已知待办（如实标注，不美化）

- AWBotDSH 客户端（私有源码，不在本仓）随包内置 Automa，目前缺少独立 LICENSE / NOTICE / PROVENANCE，列为合规待办。
- 升级包 `update/sources/` 下存在旧版 Apache-2.0 LICENSE，属历史残留，不代表当前项目许可。
- 外部工具的许可证以 `THIRD_PARTY.md` 的证据路径为准；清单里标 ❌ 的条目不得当作已合规。

## 改动要求

引入、升级或改写外部代码时：

1. 更新相应 NOTICE / PROVENANCE。
2. 同步 `docs/dev-kit/THIRD_PARTY.md`。
3. 跑 `pnpm devkit:check`。
4. 不编造许可证；无法确认的写「未标注（待补）」并列入待办。
