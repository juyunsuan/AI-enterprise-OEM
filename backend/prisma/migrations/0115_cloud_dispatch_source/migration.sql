-- 0115 WorkBuddy 企业云并入 Agent 群控（方案 docs/Agent群控（替换插件页签）产品设计方案.md 决议 D6）：
-- 云端指令与云端定时任务要打「派单来源」标记，与主机侧 0112 同口径——
-- 台账要能只筛「Agent 派单」，站内信要能只提醒 Agent 派发的与设备侧定时的轮次，手动下发不吵人。
-- agent_conversation_id 用 0 而不是 NULL：与本表 conversation_id / source_task_id 同口径。存量行一律按 UI 归档。

ALTER TABLE `workbuddy_cloud_commands`
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'UI' AFTER `cancel_requested`,
    ADD COLUMN `agent_conversation_id` INT NOT NULL DEFAULT 0 AFTER `source`,
    ADD INDEX `workbuddy_cloud_commands_user_id_source_id_idx` (`user_id`, `source`, `id`),
    ADD INDEX `workbuddy_cloud_commands_status_updated_at_idx` (`status`, `updated_at`);

ALTER TABLE `workbuddy_cloud_schedules`
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'UI' AFTER `status`,
    ADD COLUMN `agent_conversation_id` INT NOT NULL DEFAULT 0 AFTER `source`,
    ADD INDEX `workbuddy_cloud_schedules_user_id_source_id_idx` (`user_id`, `source`, `id`);
