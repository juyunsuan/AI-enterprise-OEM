<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：国内商品页优化（`domestic-pdp`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `DomesticPdp_meta` | GET | `/enterprise/domestic-pdp/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `DomesticPdp_page` | GET | `/enterprise/domestic-pdp/packs` | 页面 | 读 | session(会话) |  | page, pageSize |  | data |
| `DomesticPdp_create` | POST | `/enterprise/domestic-pdp/packs` | 新建 | 写 | session(会话) |  |  | productName, category, platform, tone, audience, price, sellingPoints, specs, evidence, promo, difference, styleName, colorPalette, compliance, heroCount, detailCount, referenceUrls, shotPlan | data |
| `DomesticPdp_remove` | DELETE | `/enterprise/domestic-pdp/packs/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `DomesticPdp_detail` | GET | `/enterprise/domestic-pdp/packs/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `DomesticPdp_updateAsset` | PATCH | `/enterprise/domestic-pdp/packs/:id/assets/:assetId` | 修改资产 | 写 | session(会话) | id, assetId |  | title, purpose, copy, prompt, size | data |
| `DomesticPdp_generate` | POST | `/enterprise/domestic-pdp/packs/:id/assets/:assetId/generate` | 生成 | 写 | session(会话) | id, assetId |  | prompt, size | data |
| `DomesticPdp_plan` | POST | `/enterprise/domestic-pdp/packs/:id/plan` | 计划 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

