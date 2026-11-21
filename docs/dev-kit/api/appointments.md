<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：预约与忙闲（`appointments`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Apt_bookings` | GET | `/enterprise/appointments/bookings` | 预约单 | 读 | session(会话) |  | page, pageSize, eventId, status |  | data |
| `Apt_book` | POST | `/enterprise/appointments/bookings` | 预约 | 写 | session(会话) |  |  | slotId, name, phone, email, company, note, refType, refId | data |
| `Apt_cancelBooking` | POST | `/enterprise/appointments/bookings/cancel` | 取消预约单 | 写 | session(会话) |  |  | id, note | data |
| `Apt_events` | GET | `/enterprise/appointments/events` | 事件 | 读 | session(会话) |  |  |  | data |
| `Apt_saveEvent` | POST | `/enterprise/appointments/events` | 保存事件 | 写 | session(会话) |  |  | id, slug, title, purpose, durationMin, bufferMin, location, description, horizonDays, active | data |
| `Apt_removeEvent` | POST | `/enterprise/appointments/events/remove` | 删除事件 | 写 | session(会话) |  |  | id | data |
| `Apt_slots` | GET | `/enterprise/appointments/slots` | 时段 | 读 | session(会话) |  | eventId, from, to |  | data |
| `Apt_generateSlots` | POST | `/enterprise/appointments/slots/generate` | 生成时段 | 写 | session(会话) |  |  | eventId, date, startTime, endTime, stepMin | data |

返回 `INDEX.md`。

