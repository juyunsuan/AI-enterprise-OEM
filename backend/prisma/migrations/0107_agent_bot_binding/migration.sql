-- AI 调用账号绑定泛化：workbuddy_account_id → (principal_kind, principal_id)
-- principal_kind：DESKTOP＝BotBuddy 主机 / MOBOT＝MoBot 手机 / WORKBUDDY＝WorkBuddy 企业账号
-- 注意：account_id_fkey 依赖 (account_id, workbuddy_account_id) 唯一索引的最左前缀，
-- 必须先放外键再删索引，迁移末尾随新唯一索引一并重建。
ALTER TABLE `ai_call_account_bindings` DROP FOREIGN KEY `ai_call_account_bindings_workbuddy_account_id_fkey`;
ALTER TABLE `ai_call_account_bindings` DROP FOREIGN KEY `ai_call_account_bindings_account_id_fkey`;
ALTER TABLE `ai_call_account_bindings` DROP INDEX `ai_call_account_bindings_workbuddy_account_id_idx`;
ALTER TABLE `ai_call_account_bindings` DROP INDEX `ai_call_account_bindings_account_id_workbuddy_account_id_key`;
ALTER TABLE `ai_call_account_bindings`
  ADD COLUMN `principal_kind` VARCHAR(16) NULL AFTER `account_id`;
UPDATE `ai_call_account_bindings` SET `principal_kind` = 'WORKBUDDY';
ALTER TABLE `ai_call_account_bindings`
  MODIFY COLUMN `principal_kind` VARCHAR(16) NOT NULL;
ALTER TABLE `ai_call_account_bindings` CHANGE COLUMN `workbuddy_account_id` `principal_id` INT NOT NULL;
ALTER TABLE `ai_call_account_bindings`
  ADD UNIQUE INDEX `ai_call_account_bindings_account_kind_principal_key`(`account_id`, `principal_kind`, `principal_id`);
ALTER TABLE `ai_call_account_bindings`
  ADD INDEX `ai_call_account_bindings_principal_kind_principal_id_idx`(`principal_kind`, `principal_id`);
ALTER TABLE `ai_call_account_bindings`
  ADD CONSTRAINT `ai_call_account_bindings_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `ai_call_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 菜单结构：Agent-Bot 分组收敛为单页四页签（BotBuddy主机 / MoBot手机 / WorkBuddy企业云 / AI调用账号）
UPDATE `feature_catalog`
    SET `kind` = 'MENU', `parent_code` = 'workbench', `title` = 'Agent-Bot', `path` = '/agent-bot', `sort_order` = 25
    WHERE `code` = 'agent-bot';
DELETE FROM `feature_catalog` WHERE `code` IN ('bot-hosts', 'workbuddy');
DELETE FROM `feature_toggles` WHERE `code` IN ('bot-hosts', 'workbuddy');
