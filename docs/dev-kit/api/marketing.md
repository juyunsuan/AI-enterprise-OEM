<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：营销服务（`marketing`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Marketing_list` | GET | `/enterprise/marketing` | 列表 | 读 | session(会话) |  | as, province, city |  | data |
| `Marketing_create` | POST | `/enterprise/marketing` | 新建 | 写 | session(会话) |  |  |  | data |
| `Marketing_remove` | DELETE | `/enterprise/marketing/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Marketing_detail` | GET | `/enterprise/marketing/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Marketing_update` | PATCH | `/enterprise/marketing/:id` | 修改 | 写 | session(会话) | id |  |  | data |
| `Marketing_accept` | POST | `/enterprise/marketing/:id/accept` | 承接 | 写 | session(会话) | id |  |  | data |
| `Marketing_confirm` | POST | `/enterprise/marketing/:id/confirm` | 确认 | 写 | session(会话) | id |  |  | data |
| `Marketing_updateContacts` | POST | `/enterprise/marketing/:id/contacts` | 修改联系方式 | 写 | session(会话) | id |  |  | data |
| `Marketing_messages` | GET | `/enterprise/marketing/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Marketing_postMessage` | POST | `/enterprise/marketing/:id/messages` | 发表留言 | 写 | session(会话) | id |  | text, conversation_id | data |
| `MarketingQr_list` | GET | `/enterprise/marketing/livecode/codes` | 查看活码列表 | 读 | session(会话) |  | page, pageSize, keyword, status |  | data |
| `MarketingQr_create` | POST | `/enterprise/marketing/livecode/codes` | 新建活码 | 写 | session(会话) |  |  | name, entryMode, domainMode, domainId, title, note, selectMode, sticky, limitScope, dailyLimit, totalLimit, scriptUrl | data |
| `MarketingQr_remove` | DELETE | `/enterprise/marketing/livecode/codes/:id` | 删除活码 | 写 | session(会话) | id |  |  | data |
| `MarketingQr_get` | GET | `/enterprise/marketing/livecode/codes/:id` | 查看活码详情 | 读 | session(会话) | id |  |  | data |
| `MarketingQr_update` | PATCH | `/enterprise/marketing/livecode/codes/:id` | 修改活码 | 写 | session(会话) | id |  | name, title, note, domainMode, domainId, autoFailover, selectMode, sticky, limitScope, dailyLimit, totalLimit, fallbackChildId, scriptUrl, status | data |
| `MarketingQr_childCreate` | POST | `/enterprise/marketing/livecode/codes/:id/children` | 添加活码子码 | 写 | session(会话) | id |  | name, kind, imageKey, linkUrl, textContent, channel, weight, sortOrder, limitScope, dailyLimit, totalLimit | data |
| `MarketingQr_childRemove` | DELETE | `/enterprise/marketing/livecode/codes/:id/children/:childId` | 删除活码子码 | 写 | session(会话) | id, childId |  |  | data |
| `MarketingQr_childUpdate` | PATCH | `/enterprise/marketing/livecode/codes/:id/children/:childId` | 修改活码子码 | 写 | session(会话) | id, childId |  | name, imageKey, linkUrl, textContent, channel, weight, sortOrder, limitScope, dailyLimit, totalLimit, status | data |
| `MarketingQr_switchDomain` | POST | `/enterprise/marketing/livecode/codes/:id/domain` | 切换活码入口域名 | 写 | session(会话) | id |  | domainId | data |
| `MarketingQr_entry` | POST | `/enterprise/marketing/livecode/codes/:id/entry` | 生成活码入口链接 | 写 | session(会话) | id |  | count | data |
| `MarketingQr_scans` | GET | `/enterprise/marketing/livecode/codes/:id/scans` | 查看活码扫码记录 | 读 | session(会话) | id | page, pageSize |  | data |
| `MarketingQr_stats` | GET | `/enterprise/marketing/livecode/codes/:id/stats` | 查看活码统计 | 读 | session(会话) | id | days |  | data |
| `MarketingQr_domains` | GET | `/enterprise/marketing/livecode/domains` | 查看活码域名池 | 读 | session(会话) |  |  |  | data |
| `MarketingQr_domainCreate` | POST | `/enterprise/marketing/livecode/domains` | 绑定活码域名 | 写 | session(会话) |  |  | domain, mode, ack | data |
| `MarketingQr_domainRemove` | DELETE | `/enterprise/marketing/livecode/domains/:id` | 解绑活码域名 | 写 | session(会话) | id |  |  | data |
| `MarketingQr_domainUpdate` | PATCH | `/enterprise/marketing/livecode/domains/:id` | 调整域名权重或停用 | 写 | session(会话) | id |  | weight, status | data |
| `MarketingQr_domainCheck` | POST | `/enterprise/marketing/livecode/domains/:id/check` | 检测活码域名 | 写 | session(会话) | id |  |  | data |
| `OverseasNav_tree` | GET | `/enterprise/marketing/overseas-nav/tree` | 查看出海导航 | 读 | session(会话) |  |  |  | data |
| `Marketing_page` | GET | `/enterprise/marketing/page` | 页面 | 读 | session(会话) |  | page, pageSize, province, city, keyword, status, sort |  | data |
| `Marketing_stats` | GET | `/enterprise/marketing/stats` | 统计 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

