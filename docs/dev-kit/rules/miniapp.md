# 新增小程序 / 新终端的标准动作

## 先判断是否真的需要新终端

1. 优先在现有终端里加场景或页面。
2. 只有当业务边界、审核主体或发布渠道确实不同，才新建小程序目录。

## 新建时

- 基于 `shared/mini-core/` 的公共骨架（请求、会话、鉴权、登录）。
- 禁止复制 `request` / `session` / `auth` / `login` 的实现；差异只写在终端自己的配置文件与页面里。
- 不新建平行的 `*Member` / `*Order` 表族；复用既有主体与订单模型。
- 注册公开路由时注明 issuer 与租户键（`shopCode` / `siteCode` / `marketCode` 等）。
- 模板参数（站点域名、租户码、AppID）由平台配置渲染，不写死。

## 收口

```bash
pnpm sync:mini-core
pnpm check:mini-core     # 校验各模板与 shared/mini-core 一致，且骨架保持 ES5 底线
pnpm check:architecture
```

改了公共骨架必须同步所有模板；只改某个模板的副本会造成静默分叉，
编译不报错、线上才白屏。
