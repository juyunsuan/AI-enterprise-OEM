# awbot-remote

平台账号直连的 Remote 服务端。协议与 Relay/Noise 网关复用上游
[liguobao/ds-harness-remote](https://github.com/liguobao/ds-harness-remote)（MIT），
本目录新增：

- 平台账号登录转发（`/api/public/awbotdsh/login`），不再使用独立 Remote 密码；
- 按平台 `userId` 隔离设备、令牌与连接；
- device-pairing v1（X25519 + HKDF + HMAC proof、claim、8 位码确认、状态/取消）。

上游 `apps/server` 的最小实现不含 pairing，因此 pairing 端点为本地实现。
运行：`npm start`，环境变量见 `main.ts`。Nginx 需把 `/pair`、`/api/v1/*`、`/ws/v1/*`
反代到本服务；平台自己的 `/api/v1/mcp`、`/api/v1/data-tables`、`/api/v1/hardware` 留在平台后端。
