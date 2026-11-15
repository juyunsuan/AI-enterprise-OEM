-- 0093 Workbuddy 主机接入（docs/Agent-Bot与Workbuddy主机方案.md §6）：
-- 主机台账（令牌只存 sha256）、内置通信通道、指令队列（commandCode 幂等回执）、
-- 主机对话映射（复用 ContentAgent 会话/消息）、定时任务与运行记录、配对码（6 位一次性）。

CREATE TABLE `workbuddy_hosts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(80) NOT NULL DEFAULT '',
    `platform` VARCHAR(16) NOT NULL DEFAULT '',
    `token_hash` VARCHAR(64) NOT NULL,
    `token_prefix` VARCHAR(16) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'NEVER',
    `client_version` VARCHAR(24) NOT NULL DEFAULT '',
    `wb_detected` BOOLEAN NOT NULL DEFAULT false,
    `caps` JSON NOT NULL,
    `working_dir` VARCHAR(300) NOT NULL DEFAULT '',
    `heartbeat_seconds` INTEGER NOT NULL DEFAULT 5,
    `last_seen_at` DATETIME(3) NULL,
    `last_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workbuddy_hosts_token_hash_key`(`token_hash`),
    INDEX `workbuddy_hosts_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `workbuddy_hosts_user_id_name_key`(`user_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(24) NOT NULL DEFAULT 'workbuddy_host',
    `name` VARCHAR(80) NOT NULL DEFAULT '通信',
    `config_cipher` TEXT NOT NULL,
    `allowed_users` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `last_event_at` DATETIME(3) NULL,
    `event_count` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(300) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workbuddy_host_channels_user_id_enabled_idx`(`user_id`, `enabled`),
    UNIQUE INDEX `workbuddy_host_channels_host_id_kind_key`(`host_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `host_id` INTEGER NOT NULL,
    `conversation_id` INTEGER NOT NULL DEFAULT 0,
    `command_code` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'prompt',
    `title` VARCHAR(200) NOT NULL DEFAULT '',
    `payload` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `progress_text` TEXT NOT NULL,
    `result` JSON NOT NULL,
    `error` VARCHAR(500) NOT NULL DEFAULT '',
    `acp_session_id` VARCHAR(80) NOT NULL DEFAULT '',
    `cancel_requested` BOOLEAN NOT NULL DEFAULT false,
    `source_task_id` INTEGER NOT NULL DEFAULT 0,
    `schedule_id` INTEGER NOT NULL DEFAULT 0,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `dispatched_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workbuddy_host_commands_command_code_key`(`command_code`),
    INDEX `workbuddy_host_commands_host_id_status_id_idx`(`host_id`, `status`, `id`),
    INDEX `workbuddy_host_commands_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `workbuddy_host_commands_schedule_id_created_at_idx`(`schedule_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `conversation_id` INTEGER NOT NULL,
    `title` VARCHAR(80) NOT NULL DEFAULT '',
    `last_message_at` DATETIME(3) NULL,
    `message_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workbuddy_host_conversations_host_id_key`(`host_id`),
    INDEX `workbuddy_host_conversations_user_id_last_message_at_idx`(`user_id`, `last_message_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `host_id` INTEGER NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `instruction` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `schedule_type` VARCHAR(16) NOT NULL DEFAULT 'recurring',
    `schedule_config` JSON NOT NULL,
    `scheduled_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'enabled',
    `last_run_at` DATETIME(3) NULL,
    `last_status` VARCHAR(16) NOT NULL DEFAULT '',
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `run_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workbuddy_host_schedules_user_id_status_idx`(`user_id`, `status`),
    INDEX `workbuddy_host_schedules_status_schedule_type_scheduled_at_idx`(`status`, `schedule_type`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_schedule_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schedule_id` INTEGER NOT NULL,
    `host_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `command_code` VARCHAR(40) NOT NULL DEFAULT '',
    `conversation_id` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NOT NULL DEFAULT '',
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workbuddy_host_schedule_runs_schedule_id_created_at_idx`(`schedule_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbuddy_host_pair_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(12) NOT NULL,
    `device_info` JSON NOT NULL,
    `user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `host_id` INTEGER NOT NULL DEFAULT 0,
    `issued_token` VARCHAR(80) NOT NULL DEFAULT '',
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `workbuddy_host_pair_codes_code_key`(`code`),
    INDEX `workbuddy_host_pair_codes_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
