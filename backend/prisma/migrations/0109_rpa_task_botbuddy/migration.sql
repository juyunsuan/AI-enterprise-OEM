-- 0109 RPA 目标设备新增 BotBuddy 浏览器：任务除了跟随脚本的设备，还要落到
-- 「哪台已配对的 BotBuddy 主机 + 该主机的哪个指纹窗口」上执行。
-- bot_host_id 用 NULL 而不是 0：只有 botbuddy 任务才填，其余设备保持「没有绑定」。
-- 认领扫描沿用已有的 (created_by, device_type, status) 索引，不另建索引。

ALTER TABLE `rpa_tasks`
    ADD COLUMN `bot_host_id` INT NULL AFTER `chrome_client_id`,
    ADD COLUMN `fp_profile_id` VARCHAR(64) NOT NULL DEFAULT '' AFTER `bot_host_id`;
