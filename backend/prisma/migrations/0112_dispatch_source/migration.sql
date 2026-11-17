-- 0112 Agent 群控（M2）：设备指令与设备定时任务要打「派单来源」标记，
-- 好把「用户在设备页面手动下发」和「Agent 在对话里拆单派发」区分开，
-- 并回指发起的站内会话（跳转与审计用）。存量行一律按 UI 归档。
-- agent_conversation_id 用 0 而不是 NULL：与本表 conversation_id / source_task_id 同口径。

ALTER TABLE `workbuddy_host_commands`
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'UI' AFTER `source_task_id`,
    ADD COLUMN `agent_conversation_id` INT NOT NULL DEFAULT 0 AFTER `source`,
    ADD INDEX `workbuddy_host_commands_user_id_source_id_idx` (`user_id`, `source`, `id`);

ALTER TABLE `workbuddy_host_schedules`
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'UI' AFTER `run_count`,
    ADD COLUMN `agent_conversation_id` INT NOT NULL DEFAULT 0 AFTER `source`,
    ADD INDEX `workbuddy_host_schedules_user_id_source_id_idx` (`user_id`, `source`, `id`);
