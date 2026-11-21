# AI 调用与字节存储

## AI

- 所有模型调用必须经过统一模型网关（`backend/src/ai/ai-gateway.ts` 或 `aiChat` 家族）。
- 调用前必须过闸门：`resolveTarget` / `resolveModel` / `requireModel` / `assertAiAllowed`。
- 调用后必须留用量事实：`meterChatCall` / `recordAiUsage` / `chargeByUsage`。
- 不要把模型 Key 写进代码或前端；Key 由账号绑定或平台级通道解析。
- 直连上游不得绕过闸门与计量，否则成本不可见。

## 字节 / 文件

- 业务模块写文件必须经 `StorageService` 或 `SystemAssetService.put`。
- 不得绕过门面直连 `OssService.upload`；每次绕过都会漏登记数字资产台账。
- 删除 / 覆盖前确认归属与引用；资产操作留痕。

## 收口

```bash
pnpm check:architecture
```

守卫会同时检查「AI 直连是否过闸门 + 是否计量」与「字节写入是否走门面」。
