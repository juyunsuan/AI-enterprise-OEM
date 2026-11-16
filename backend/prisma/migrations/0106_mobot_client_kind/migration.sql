-- 0106 Mobot 手机：复用 Bot 主机设备/指令/会话/定时/模型授权表，
-- 用 client_kind 区分桌面 BotBuddy 与 Mobot 手机；存量主机默认 DESKTOP。

ALTER TABLE `workbuddy_hosts`
    ADD COLUMN `client_kind` VARCHAR(16) NOT NULL DEFAULT 'DESKTOP';

ALTER TABLE `workbuddy_hosts`
    ADD INDEX `workbuddy_hosts_user_id_client_kind_status_idx`(`user_id`, `client_kind`, `status`);

ALTER TABLE `workbuddy_host_pair_codes`
    ADD COLUMN `client_kind` VARCHAR(16) NOT NULL DEFAULT 'DESKTOP';
