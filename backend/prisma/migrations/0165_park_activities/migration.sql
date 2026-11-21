-- 园区活动与报名：外部顾客身份，按 site_id 隔离；报名取消保留记录并释放名额。

CREATE TABLE `park_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `summary` VARCHAR(300) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `location` VARCHAR(200) NOT NULL DEFAULT '',
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `signup_deadline` VARCHAR(40) NOT NULL DEFAULT '',
    `capacity` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_activities_site_id_status_start_at_idx`(`site_id`, `status`, `start_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_activity_signups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activity_id` INTEGER NOT NULL,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'SIGNED',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `park_activity_signups_activity_id_customer_id_key`(`activity_id`, `customer_id`),
    INDEX `park_activity_signups_site_id_customer_id_idx`(`site_id`, `customer_id`),
    INDEX `park_activity_signups_activity_id_status_idx`(`activity_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
