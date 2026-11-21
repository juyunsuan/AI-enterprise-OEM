<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：跨境商品页优化（`ecom-pdp`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `EcomPdp_meta` | GET | `/enterprise/ecom-pdp/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `EcomPdp_page` | GET | `/enterprise/ecom-pdp/packs` | 页面 | 读 | session(会话) |  | page, pageSize |  | data |
| `EcomPdp_create` | POST | `/enterprise/ecom-pdp/packs` | 新建 | 写 | session(会话) |  |  | productName, category, market, platform, audience, price, sellingPoints, specs, evidence, promo, difference, language, styleName, colorPalette, compliance, heroCount, detailCount, referenceUrls, shotPlan | data |
| `EcomPdp_remove` | DELETE | `/enterprise/ecom-pdp/packs/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `EcomPdp_detail` | GET | `/enterprise/ecom-pdp/packs/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `EcomPdp_updateAsset` | PATCH | `/enterprise/ecom-pdp/packs/:id/assets/:assetId` | 修改资产 | 写 | session(会话) | id, assetId |  | title, purpose, copy, prompt, size | data |
| `EcomPdp_generate` | POST | `/enterprise/ecom-pdp/packs/:id/assets/:assetId/generate` | 生成 | 写 | session(会话) | id, assetId |  | prompt, size | data |
| `EcomPdp_plan` | POST | `/enterprise/ecom-pdp/packs/:id/plan` | 计划 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

