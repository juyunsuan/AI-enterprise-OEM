# 测试与提交前收口

## 最小验证链

```bash
pnpm typecheck && pnpm lint && pnpm check:architecture
```

- 改过契约：`pnpm api:docs && pnpm api:index`
- 改过 dev-kit 真源：`pnpm setup:dev-kit && pnpm pack:dev-kit && pnpm devkit:check`
- 改过小程序公共骨架：`pnpm sync:mini-core && pnpm check:mini-core`
- 改过数据库 schema：按项目既定迁移流程执行，不使用 `db push` 代替迁移。

## 测试口径

- 测试行为，不测试实现；调用方式要贴近真实用户路径。
- 涉及权限的端点至少验证一条拒绝路径。
- 单元测试不得依赖外部服务或仓库外的配置文件。
- 不写只为通过检查的空测试；测试无意义时如实说明。

## 报告纪律

- 只报告实际跑过的命令与结果。
- 未验证项逐条列出，不用「应该没问题」代替证据。
- 一次提交说明「为什么改、改了什么、怎么验证」。

## CI

- `.github/workflows/ci.yml` 会跑架构守卫、OpenAPI 逐字节比对、类型检查、lint、单测与构建。
- dev-kit 的生成物与入口漂移同样会让 CI 变红。
