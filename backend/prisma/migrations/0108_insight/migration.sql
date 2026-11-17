-- 0108 智慧分析板块：全域内容热点分析 + 流行趋势分析。
-- 设计见 docs/智慧分析板块设计方案.md。采集行不落本模块表（走既有 data_table_rows），
-- 热点与时序指标是可重算的聚合产物；全部按 user_id 账号归属。

-- CreateTable
CREATE TABLE `insight_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `content_table_id` INTEGER NOT NULL DEFAULT 0,
    `ledger_table_id` INTEGER NOT NULL DEFAULT 0,
    `model` VARCHAR(128) NOT NULL DEFAULT '',
    `score_config` JSON NOT NULL,
    `linkage_enabled` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `insight_settings_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `platforms` JSON NOT NULL,
    `keywords` JSON NOT NULL,
    `topics` JSON NOT NULL,
    `creators` JSON NOT NULL,
    `frequency` VARCHAR(16) NOT NULL DEFAULT 'daily',
    `exclude_words` JSON NOT NULL,
    `min_engagement` INTEGER NOT NULL DEFAULT 0,
    `alert_growth_pct` INTEGER NOT NULL DEFAULT 50,
    `quota` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `schedule_ids` JSON NOT NULL,
    `last_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insight_subscriptions_user_id_status_idx`(`user_id`, `status`),
    INDEX `insight_subscriptions_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_hotspots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `subscription_id` INTEGER NOT NULL DEFAULT 0,
    `subscription_name` VARCHAR(120) NOT NULL DEFAULT '',
    `name` VARCHAR(200) NOT NULL,
    `platforms` JSON NOT NULL,
    `stage` VARCHAR(16) NOT NULL DEFAULT 'emerging',
    `hot_score` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `growth_rate` DECIMAL(10, 4) NOT NULL DEFAULT 0,
    `content_count` INTEGER NOT NULL DEFAULT 0,
    `sentiment` JSON NOT NULL,
    `keyword_list` JSON NOT NULL,
    `first_platform` VARCHAR(32) NOT NULL DEFAULT '',
    `first_publish_at` DATETIME(3) NULL,
    `window_start` DATETIME(3) NULL,
    `window_end` DATETIME(3) NULL,
    `review_note` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insight_hotspots_user_id_subscription_id_idx`(`user_id`, `subscription_id`),
    INDEX `insight_hotspots_user_id_stage_updated_at_idx`(`user_id`, `stage`, `updated_at`),
    INDEX `insight_hotspots_user_id_hot_score_idx`(`user_id`, `hot_score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_hotspot_contents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hotspot_id` INTEGER NOT NULL,
    `table_id` INTEGER NOT NULL,
    `row_id` INTEGER NOT NULL,
    `similarity` DECIMAL(6, 4) NOT NULL DEFAULT 0,
    `is_representative` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `insight_hotspot_contents_hotspot_id_table_id_row_id_key`(`hotspot_id`, `table_id`, `row_id`),
    INDEX `insight_hotspot_contents_hotspot_id_idx`(`hotspot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_metrics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `metric_key` VARCHAR(120) NOT NULL,
    `metric_type` VARCHAR(16) NOT NULL,
    `period` VARCHAR(16) NOT NULL,
    `value` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `raw_value` JSON NOT NULL,
    `growth_rate` DECIMAL(10, 4) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `insight_metrics_user_key_type_period_key`(`user_id`, `metric_key`, `metric_type`, `period`),
    INDEX `insight_metrics_user_id_metric_type_period_idx`(`user_id`, `metric_type`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `window` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `asset_id` VARCHAR(64) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `error` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insight_reports_user_id_kind_created_at_idx`(`user_id`, `kind`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
