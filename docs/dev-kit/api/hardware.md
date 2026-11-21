<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：智能硬件（`hardware`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AdminHw_kitList` | GET | `/enterprise/hardware/admin/kits` | KIT列表 | 读 | session(会话) |  | modelId |  | data |
| `AdminHw_kitSave` | POST | `/enterprise/hardware/admin/kits` | 保存KIT | 写 | session(会话) |  |  | fileName, fileSize, ossKey, sha256, modelId, version, channel, changelog, docUrl, minFirmware, enabled | data |
| `AdminHw_kitRemove` | DELETE | `/enterprise/hardware/admin/kits/:id` | 删除KIT | 写 | session(会话) | id |  |  | data |
| `AdminHw_kitUpdate` | PUT | `/enterprise/hardware/admin/kits/:id` | 修改KIT | 写 | session(会话) | id |  | fileName, fileSize, ossKey, sha256, modelId, version, channel, changelog, docUrl, minFirmware, enabled | data |
| `AdminHw_modelList` | GET | `/enterprise/hardware/admin/models` | 模型列表 | 读 | session(会话) |  |  |  | data |
| `AdminHw_modelSave` | POST | `/enterprise/hardware/admin/models` | 保存模型 | 写 | session(会话) |  |  | code, name, vendor, chip, category, summary, coverUrl, spec, featured, enabled, sortOrder | data |
| `AdminHw_modelRemove` | DELETE | `/enterprise/hardware/admin/models/:id` | 删除模型 | 写 | session(会话) | id |  |  | data |
| `AdminHw_modelUpdate` | PUT | `/enterprise/hardware/admin/models/:id` | 修改模型 | 写 | session(会话) | id |  | code, name, vendor, chip, category, summary, coverUrl, spec, featured, enabled, sortOrder | data |
| `AdminHw_toolList` | GET | `/enterprise/hardware/admin/tools` | 工具列表 | 读 | session(会话) |  | modelId, kind |  | data |
| `AdminHw_toolSave` | POST | `/enterprise/hardware/admin/tools` | 保存工具 | 写 | session(会话) |  | modelId | kind, code, name, description, transport, method, path, commandCode, params, response, examples, write, requiresGrant, enabled, sortOrder | data |
| `AdminHw_removeTool` | DELETE | `/enterprise/hardware/admin/tools/:id` | 删除工具 | 写 | session(会话) | id |  |  | data |
| `AdminHw_updateTool` | PUT | `/enterprise/hardware/admin/tools/:id` | 修改工具 | 写 | session(会话) | id |  | kind, code, name, description, transport, method, path, commandCode, params, response, examples, write, requiresGrant, enabled, sortOrder | data |
| `Hw_devices` | GET | `/enterprise/hardware/devices` | DEVICES | 读 | session(会话) |  | modelId |  | data |
| `Hw_deviceCreate` | POST | `/enterprise/hardware/devices` | 新建DEVICE | 写 | session(会话) |  |  | modelId, name, serialNo | data |
| `Hw_deviceRemove` | DELETE | `/enterprise/hardware/devices/:id` | 删除DEVICE | 写 | session(会话) | id |  |  | data |
| `Hw_deviceUpdate` | PUT | `/enterprise/hardware/devices/:id` | 修改DEVICE | 写 | session(会话) | id |  | name, serialNo, enabled | data |
| `Hw_deviceEvents` | GET | `/enterprise/hardware/devices/:id/events` | DEVICE事件 | 读 | session(会话) | id | kind |  | data |
| `Hw_deviceResetToken` | POST | `/enterprise/hardware/devices/:id/token` | 重置DEVICE令牌 | 写 | session(会话) | id |  |  | data |
| `Hw_toolGrants` | GET | `/enterprise/hardware/grants` | 工具授权 | 读 | session(会话) |  | modelId |  | data |
| `Hw_toolSaveGrants` | POST | `/enterprise/hardware/grants` | 保存工具授权 | 写 | session(会话) |  |  | toolIds | data |
| `Hw_kitDownload` | GET | `/enterprise/hardware/kits/:id/download` | KITDOWNLOAD | 读 | session(会话) | id |  |  | data |
| `Hw_models` | GET | `/enterprise/hardware/models` | 模型 | 读 | session(会话) |  | all |  | data |
| `Hw_model` | GET | `/enterprise/hardware/models/:code` | 模型 | 读 | session(会话) | code |  |  | data |
| `Hw_tools` | GET | `/enterprise/hardware/models/:code/tools` | 工具 | 读 | session(会话) | code | kind |  | data |
| `Hw_toolCreate` | POST | `/enterprise/hardware/models/:code/tools` | 新建工具 | 写 | session(会话) | code |  | kind, code, name, description, transport, method, path, commandCode, params, response, examples, write, requiresGrant, enabled, sortOrder | data |
| `Hw_toolRemove` | DELETE | `/enterprise/hardware/tools/:id` | 删除工具 | 写 | session(会话) | id |  |  | data |
| `Hw_toolUpdate` | PUT | `/enterprise/hardware/tools/:id` | 修改工具 | 写 | session(会话) | id |  | kind, code, name, description, transport, method, path, commandCode, params, response, examples, write, requiresGrant, enabled, sortOrder | data |
| `Hw_toolTrial` | POST | `/enterprise/hardware/tools/:id/trial` | 工具试算 | 写 | session(会话) | id |  | deviceId, args | data |

返回 `INDEX.md`。

