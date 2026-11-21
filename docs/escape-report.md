# 类型逃逸盘点报告

- 生成工具：`scripts/escape-audit.mjs` v2（commit `afe4402`，2026-11-21）
- 候选文件 13565（已跟踪 + 未跟踪，去重），纳入扫描 3079，其中尚未 git add 的 1157
- 排除：依赖/构建/生成目录内 1018 / 量具自身 2 / 索引有磁盘无 1
- 代码行 1,047,983（其中生产 889,443）
- 逃逸总数 **309**，其中生产代码 **274**，已登记 allowlist 6，未登记 303
- 生产密度 **0.31 处/kloc**（口径：仅 role=prod 的命中 ÷ 生产代码千行）
- 预算文件：`.escape-budget.json`（total=309）

> 计数为「文本命中」，注释与字符串中的同名字样也会计入；.vue 仅统计 `<script>` 段。

## 索引与磁盘不一致（未扫）

以下 1 个文件在 git 索引里、磁盘上不存在（未提交的删除）。盘点对象是工作树，故不纳入统计；计数有效，但 git 状态待收口：

- `backend/src/miniprogram/miniprogram-ci.service.ts`

## 分类计数

| 类别 | 合计 | 生产 | 测试 | 脚本 | .d.ts |
| --- | ---: | ---: | ---: | ---: | ---: |
| `as never` | 99 | 77 | 22 | 0 | 0 |
| `as any` | 8 | 8 | 0 | 0 | 0 |
| `as unknown as` | 179 | 167 | 10 | 2 | 0 |
| `@ts-ignore` | 0 | 0 | 0 | 0 | 0 |
| `@ts-expect-error` | 0 | 0 | 0 | 0 | 0 |
| `eslint-disable` | 17 | 17 | 0 | 0 | 0 |
| `: any` | 6 | 5 | 0 | 1 | 0 |
| `@ts-nocheck` | 0 | 0 | 0 | 0 | 0 |
| **合计** | **309** | **274** | 32 | 3 | 0 |

## 按落点（密度只算生产代码）

| 模块 | 文件 | kloc | 生产 kloc | 合计 | 生产 | 密度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| backend | 1287 | 497.2 | 448.0 | 259 | 226 | 0.5 |
| frontend | 981 | 337.3 | 336.6 | 32 | 31 | 0.09 |
| services | 29 | 6.0 | 3.9 | 17 | 17 | 4.39 |
| bot-host-client | 133 | 31.2 | 13.5 | 1 | 0 | 0 |
| .tmp-fde-smoke.mjs | 1 | 0.1 | 0.0 | 0 | 0 | 0 |
| brand-mall-miniprogram | 46 | 4.7 | 0.0 | 0 | 0 | 0 |
| card-shop-miniprogram | 23 | 2.6 | 0.0 | 0 | 0 | 0 |
| circle-miniprogram | 23 | 2.2 | 0.0 | 0 | 0 | 0 |
| errand-miniprogram | 20 | 2.3 | 0.0 | 0 | 0 | 0 |
| extensions | 11 | 9.2 | 0.0 | 0 | 0 | 0 |
| hardware-devkit | 1 | 0.1 | 0.0 | 0 | 0 | 0 |
| kuaidi-miniprogram | 17 | 2.0 | 0.0 | 0 | 0 | 0 |
| miniprogram | 23 | 2.5 | 0.0 | 0 | 0 | 0 |
| miniprogram-dh | 28 | 3.4 | 0.0 | 0 | 0 | 0 |
| miniprogram-health | 64 | 8.1 | 0.0 | 0 | 0 | 0 |
| miniprogram-kp | 29 | 3.3 | 0.0 | 0 | 0 | 0 |
| miniprogram-onsite | 57 | 9.2 | 0.0 | 0 | 0 | 0 |
| miniprogram-rental | 23 | 1.9 | 0.0 | 0 | 0 | 0 |
| mp-miniprogram | 27 | 3.5 | 0.0 | 0 | 0 | 0 |
| packages/contracts | 88 | 87.5 | 87.5 | 0 | 0 | 0 |
| park-miniprogram | 27 | 2.4 | 0.0 | 0 | 0 | 0 |
| quiz-miniprogram | 17 | 2.2 | 0.0 | 0 | 0 | 0 |
| scripts | 101 | 25.9 | 0.0 | 0 | 0 | 0 |
| shared | 2 | 0.5 | 0.0 | 0 | 0 | 0 |
| takeout-miniprogram | 19 | 2.5 | 0.0 | 0 | 0 | 0 |
| tmp-onsite-cov.mjs | 1 | 0.0 | 0.0 | 0 | 0 | 0 |
| tmp-p2-ddl-check.mjs | 1 | 0.1 | 0.0 | 0 | 0 | 0 |

## 按角色

| 角色 | 文件 | 行数 | 命中 |
| --- | ---: | ---: | ---: |
| prod | 2146 | 889443 | 274 |
| test | 252 | 49474 | 32 |
| script | 681 | 109066 | 3 |

## Top 20 文件

| 文件 | 角色 | 行数 | 命中 | 明细 |
| --- | --- | ---: | ---: | --- |
| `backend/src/knowledge-pay/kp.service.ts` | prod | 2401 | 19 | as never×19 |
| `backend/src/bot-host/agent-dispatch.service.spec.ts` | test | 1212 | 18 | as never×17，as unknown as×1 |
| `backend/src/errand/errand.order.service.ts` | prod | 1821 | 14 | as unknown as×14 |
| `backend/src/card-shop/card-shop.order.service.ts` | prod | 1582 | 13 | as unknown as×13 |
| `backend/src/park/park.controller.ts` | prod | 441 | 12 | as never×12 |
| `backend/src/marketplace/mp.coupon.service.ts` | prod | 856 | 10 | as unknown as×10 |
| `services/awbot-remote/src/server.ts` | prod | 461 | 9 | as any×7，: any×2 |
| `backend/src/errand/errand.rider.service.ts` | prod | 645 | 8 | as unknown as×8 |
| `backend/src/errand/errand.site.service.ts` | prod | 955 | 8 | as unknown as×8 |
| `backend/src/errand/errand.agent.service.ts` | prod | 741 | 7 | as unknown as×7 |
| `backend/src/health/health.order.service.ts` | prod | 1000 | 7 | as never×7 |
| `backend/src/marketplace/mp.merchant.routes.ts` | prod | 390 | 7 | as unknown as×7 |
| `backend/src/brand-mall/brand.coupon.service.ts` | prod | 558 | 6 | as unknown as×6 |
| `backend/src/health/health.content.service.ts` | prod | 1899 | 6 | as never×6 |
| `backend/src/health/health.finance.service.ts` | prod | 798 | 6 | as never×6 |
| `backend/src/health/health.marketing.service.ts` | prod | 1034 | 6 | as never×6 |
| `backend/src/health/health.shop.service.ts` | prod | 1143 | 6 | as never×6 |
| `backend/src/takeout/takeout.coupon.service.ts` | prod | 357 | 6 | as unknown as×6 |
| `backend/src/brand-mall/brand.customer.service.ts` | prod | 856 | 5 | as unknown as×5 |
| `backend/src/marketplace/mp.diy.service.ts` | prod | 307 | 5 | as unknown as×5 |

## eslint-disable 规则分布

| 规则 | 次数 |
| --- | ---: |
| `react-hooks/exhaustive-deps` | 11 |
| `@next/next/no-img-element` | 5 |
| `no-control-regex` | 1 |

## allowlist

登记 6 条，命中 6 条，失效 0 条。
