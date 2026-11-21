-- 答题小程序：站点与题库元数据。
-- 题目与交卷记录分别落在账号自己的多维表格（data_tables），本迁移不复制题库数据。

CREATE TABLE `quiz_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slogan` VARCHAR(200) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#1bd0ad',
    `cover_url` VARCHAR(500) NOT NULL DEFAULT '',
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `participant_table_id` INTEGER NOT NULL DEFAULT 0,
    `ai_enabled` BOOLEAN NOT NULL DEFAULT true,
    `materials` JSON NOT NULL,
    `settings` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quiz_sites_owner_user_id_key`(`owner_user_id`),
    UNIQUE INDEX `quiz_sites_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quiz_banks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_url` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `question_table_id` INTEGER NOT NULL,
    `attempt_table_id` INTEGER NOT NULL,
    `settings` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quiz_banks_code_key`(`code`),
    UNIQUE INDEX `quiz_banks_site_id_title_key`(`site_id`, `title`),
    INDEX `quiz_banks_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;