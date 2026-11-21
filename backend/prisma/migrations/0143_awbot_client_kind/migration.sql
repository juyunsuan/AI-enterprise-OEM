-- MoBot 更名 AWBot：把存量设备类型/绑定主体/群控范围里的 'MOBOT' 字面量改写为 'AWBOT'。
-- 代码侧契约常量（BOT_CLIENT_KINDS、dispatchScope 等）已同步改为 AWBOT，本迁移保证新旧数据一致。
-- 涉及表：workbuddy_hosts / workbuddy_host_pair_codes / ai_call_account_bindings / content_agent_schedules。

-- AlterTable data: 设备类型 MOBOT → AWBOT
UPDATE `workbuddy_hosts` SET `client_kind` = 'AWBOT' WHERE `client_kind` = 'MOBOT';

-- AlterTable data: 配对码设备类型 MOBOT → AWBOT
UPDATE `workbuddy_host_pair_codes` SET `client_kind` = 'AWBOT' WHERE `client_kind` = 'MOBOT';

-- AlterTable data: AI 调用账号绑定主体 MOBOT → AWBOT
UPDATE `ai_call_account_bindings` SET `principal_kind` = 'AWBOT' WHERE `principal_kind` = 'MOBOT';

-- AlterTable data: Agent 定时任务群控范围 JSON 内的 'MOBOT' → 'AWBOT'
UPDATE `content_agent_schedules`
SET `dispatch_scope` = CAST(REPLACE(CAST(`dispatch_scope` AS CHAR), 'MOBOT', 'AWBOT') AS JSON)
WHERE CAST(`dispatch_scope` AS CHAR) LIKE '%MOBOT%';
