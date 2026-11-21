---
name: enterprise-review
description: >
  Run the pre-commit self-review for this repository. Use before committing or
  when reviewing a change: check token isolation, customer-state scoping,
  single network exit, AI gateway metering, asset storage, and the executable
  architecture guard. Report unverified items truthfully.
---

# enterprise-review

## 三条红线

1. **令牌物理隔离**：C 端令牌不得进入 `/enterprise/**`；企业会话令牌不得下放到 C 端通道。
2. **顾客态双条件**：按「站点/店铺标识 + 顾客标识」同时限定，缺一即越权风险。
3. **网络出口唯一**：前端只经业务 API，后端只经统一传输层；不得裸写 `fetch(`。

## 检查清单

- [ ] 契约：类型由 schema 推导，无 `as`，只依赖 zod 与相对路径。
- [ ] 后端：控制器与 `moduleHandlers` 前缀 / 方法名对应；管理员端点过 `requireAdmin`。
- [ ] 前端：只调用 `src/api/*` 具名方法，不直接 import `http`。
- [ ] AI：调用前过闸门，调用后留用量。
- [ ] 文件：字节写入经存储门面，登记数字资产。
- [ ] ERP / 商城：只走端口，不跨域直连，不互相 import。
- [ ] 小程序：公共 core 未被复制或手改。
- [ ] 外部代码：NOTICE 与 `docs/dev-kit/THIRD_PARTY.md` 已同步。
- [ ] 生成物：契约改了就跑 `api:docs` 与 `api:index`，没有手改生成物。

## 必跑

```bash
pnpm typecheck && pnpm lint && pnpm check:architecture
```

涉及契约或 dev-kit 时再按需加：

```bash
pnpm api:docs && pnpm api:index && pnpm devkit:check
```

## 报告

- 逐项写「已检查 / 未检查 + 原因」。
- 不声称跑过未跑的命令。
- 发现红线问题时先修根因，不用绕过守卫的方式让检查变绿。
