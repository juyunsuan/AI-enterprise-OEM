<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：平台机制（`mechanisms`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AssetPolicy_getSharePolicy` | GET | `/enterprise/mechanisms/asset-share-policy` | 获取分享策略 | 读 | session(会话) |  |  |  | data |
| `AssetPolicy_saveSharePolicy` | POST | `/enterprise/mechanisms/asset-share-policy/save` | 保存分享策略 | 写 | session(会话) |  |  | name, defaultExpiresDays, maxExpiresDays, requirePassword, allowPublic, allowedKinds | data |
| `Mechanism_overview` | GET | `/enterprise/mechanisms/overview` | 概览 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

