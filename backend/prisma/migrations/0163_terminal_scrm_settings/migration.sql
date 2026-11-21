-- 通用终端 SCRM 接入开关：onsite/card/kuaidi/errand/circle/dh/kp 按终端实例独立开关。
CREATE TABLE `terminal_scrm_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `scene` VARCHAR(16) NOT NULL,
    `source_id` INTEGER NOT NULL,
    `enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `last_event_kind` VARCHAR(32) NOT NULL DEFAULT '',
    `last_tagged_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `terminal_scrm_settings_owner_scene_source_uniq`(`owner_user_id`, `scene`, `source_id`),
    INDEX `terminal_scrm_settings_owner_user_id_scene_idx`(`owner_user_id`, `scene`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `terminal_scrm_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `scene` VARCHAR(16) NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `source_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `record_key` VARCHAR(64) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'SENT',
    `error` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `terminal_scrm_events_dedupe_key_key`(`dedupe_key`),
    INDEX `terminal_scrm_events_scene_source_id_created_at_idx`(`scene`, `source_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;