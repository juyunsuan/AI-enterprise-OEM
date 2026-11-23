# 外部引入代码的边界

## 清单

- 仓库级清单：`docs/dev-kit/THIRD_PARTY.md`（半自动汇总 + 人工核注）。
- 客户端内部更细的逐文件映射：`awbot-app/THIRD_PARTY_NOTICES.md`、`awbot-app/PROVENANCE.md`。
- 未标注许可证的条目必须标 ❌ 并列待办；**不编造许可证**。

## 引入形态

- 依赖引入：按 `package.json` / lockfile 管理，不复制源码。
- vendored 改写：保留上游版权头与 SPDX 标识，并在清单登记「本仓库文件 ↔ 上游来源」。
- 随包分发二进制：单独声明许可证与来源。
- 仅参考未移植：在清单注明作用域，不计入分发物。

## 当前已知边界

- 根项目与 `awbot-app/` 均为 AGPL-3.0-only；通过网络提供服务须履行对应源码义务。
- `awbot-app/` 内第三方组件按各自原许可证分发，**不在商业授权范围内**（见 `docs/商业授权说明.md`）。
- AWBotDSH 桌面端源码自 v1.8.x 起移出本仓；其安装包仍随客户端二进制分发内置的 Automa，
  缺独立 LICENSE / NOTICE 的合规待办改由客户端私有源码维护（见 `THIRD_PARTY.md`）。
- `update/sources/` 下的旧 LICENSE 属升级包残留，不代表当前项目许可。
- `.scratch/` / `.tmp/` 是本地参考副本，不计入分发。

## 收口

```bash
pnpm devkit:check
```

改了外部代码或清单后，必须同步 `THIRD_PARTY.md` 与对应 NOTICE，不要只在代码里加注释。
