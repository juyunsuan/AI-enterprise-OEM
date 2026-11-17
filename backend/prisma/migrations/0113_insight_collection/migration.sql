-- 0113 智慧分析 · 采集层（S0）：数据源对象 + 采集批次 + 订阅采集目的。
-- 设计见 docs/智慧分析板块设计方案.md §4.1 / §五 / §六。
-- 口径：采集先行——订阅必须先声明目的与数据源对象；采集内容按 行 → 批次 → 数据源 → 订阅 回溯。

-- CreateTable
CREATE TABLE `insight_collection_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `purpose` VARCHAR(32) NOT NULL DEFAULT 'hotspot',
    `kind` VARCHAR(32) NOT NULL DEFAULT 'platformSearch',
    `platform` VARCHAR(32) NOT NULL DEFAULT '',
    `site_url` VARCHAR(500) NOT NULL DEFAULT '',
    `page_object` VARCHAR(32) NOT NULL DEFAULT '',
    `url_template` VARCHAR(500) NOT NULL DEFAULT '',
    `keyword` VARCHAR(200) NOT NULL DEFAULT '',
    `login_required` TINYINT NOT NULL DEFAULT 0,
    `site_skill_key` VARCHAR(120) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `last_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insight_collection_sources_user_id_status_idx`(`user_id`, `status`),
    INDEX `insight_collection_sources_user_id_purpose_idx`(`user_id`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_collection_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `subscription_id` INTEGER NOT NULL DEFAULT 0,
    `source_id` INTEGER NOT NULL DEFAULT 0,
    `skill_key` VARCHAR(32) NOT NULL DEFAULT '',
    `skill_version` VARCHAR(20) NOT NULL DEFAULT '',
    `channel` VARCHAR(20) NOT NULL DEFAULT '',
    `host_id` INTEGER NOT NULL DEFAULT 0,
    `device_id` VARCHAR(64) NOT NULL DEFAULT '',
    `schedule_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `row_count` INTEGER NOT NULL DEFAULT 0,
    `inserted_count` INTEGER NOT NULL DEFAULT 0,
    `dedup_count` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NOT NULL DEFAULT '',
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `insight_collection_runs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `insight_collection_runs_source_id_created_at_idx`(`source_id`, `created_at`),
    INDEX `insight_collection_runs_subscription_id_created_at_idx`(`subscription_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: 订阅必须先声明采集目的与数据源集合（无目的不采集）
ALTER TABLE `insight_subscriptions`
    ADD COLUMN `purpose` VARCHAR(32) NOT NULL DEFAULT 'hotspot',
    ADD COLUMN `source_ids` JSON NOT NULL;

-- AlterTable: 趋势侧采集落表（电商选品观测）的预置表 id
ALTER TABLE `insight_settings`
    ADD COLUMN `ecom_table_id` INTEGER NOT NULL DEFAULT 0;
