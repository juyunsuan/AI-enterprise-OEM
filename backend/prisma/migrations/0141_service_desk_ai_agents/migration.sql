-- 纯AI客服（AI客服团队里的一类员工）与 AI医护引用位。
-- AI 的人设、模型与知识库范围只挂在 service_desk_ai_agents 上；业务工具（健康小程序的 AI医护）
-- 只存「绑哪个纯AI客服 + 开关」，不再各自造一套 AI 实体与配置。
-- 设计见 docs/建站管理·健康管理小程序工具设计方案.md 与 docs/纯AI客服与AI医护设计方案.md。

-- CreateTable
CREATE TABLE `service_desk_ai_agents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `intro` VARCHAR(200) NOT NULL DEFAULT '',
    `group_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ON',
    `mode` VARCHAR(16) NOT NULL DEFAULT 'AUTO',
    `persona` TEXT NOT NULL DEFAULT (''),
    `ai_channel_id` INTEGER NOT NULL DEFAULT 0,
    `ai_model` VARCHAR(128) NOT NULL DEFAULT '',
    `kb_space_ids` JSON NOT NULL,
    `handoff_keywords` JSON NOT NULL,
    `handoff_group_id` INTEGER NOT NULL DEFAULT 0,
    `max_concurrent` INTEGER NOT NULL DEFAULT 50,
    `working_hours` JSON NOT NULL,
    `greeting_text` TEXT NOT NULL DEFAULT (''),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_desk_ai_agents_owner_user_id_status_idx`(`owner_user_id`, `status`),
    INDEX `service_desk_ai_agents_owner_user_id_group_id_idx`(`owner_user_id`, `group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: 会话接待方分真人 / 纯AI客服两类
ALTER TABLE `service_desk_conversations` ADD COLUMN `assignee_type` VARCHAR(16) NOT NULL DEFAULT 'USER';
ALTER TABLE `service_desk_conversations` ADD COLUMN `ai_agent_id` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `service_desk_conversations_owner_user_id_ai_agent_id_idx` ON `service_desk_conversations`(`owner_user_id`, `ai_agent_id`);

-- AlterTable: AI医护开关（店铺级）与引用位（医护级）
ALTER TABLE `health_shops` ADD COLUMN `ai_staff_enabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `health_practitioners` ADD COLUMN `desk_ai_agent_id` INTEGER NOT NULL DEFAULT 0;
