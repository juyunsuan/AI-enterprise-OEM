---
name: enterprise-miniapp
description: >
  Add or extend a mini-program / terminal in this repository. Use when the task
  touches shared/mini-core, miniprogram-* templates, tenant parameters, or
  public mini-program routes. Covers single-source sync and the ES5 constraint.
---

# enterprise-miniapp

## 先判断

- 能加在现有终端里，就不要新建小程序。
- 新终端必须确有独立的主体、审核或发布边界。

## 步骤

1. **复用公共骨架**：请求、会话、鉴权、登录来自 `shared/mini-core/`。
   禁止复制 `request` / `session` / `auth` / `login` 的实现。
2. **只写差异**：终端目录只放配置、页面与样式；模板参数（站点域名、租户码、AppID）由平台渲染。
3. **不新增平行表族**：不新建 `*Member` / `*Order` 表；复用既有主体与订单模型。
4. **公开路由**：注册 `/api/public/**` 时注明 issuer 与租户键，并校验来源 / 签名 / 设备令牌。
5. **同步与校验**：

```bash
pnpm sync:mini-core
pnpm check:mini-core
pnpm check:architecture
```

## 约束

- `shared/mini-core/core.js` 必须保持 ES5；混入 ES6 语法会让老基础库整包白屏。
- 模板里的 `utils/core.js` 是派生物；手改副本会与真源分叉。
- 新增终端后检查出包脚本与后台工具目录是否需要登记。

## 反模式

- 复制一份 core 再改。
- 在页面里硬编码站点地址或租户码。
- 为了省事新建一套会员 / 订单表。
