-- 0119 上门服务小程序工具 P1 第一批：服务目录 / 服务人员与排期 / 城市与车费 / 内容与自定义表单
-- 口径 docs/私域小程序·上门服务小程序工具设计方案.md §四 4.1；金额一律 DECIMAL(12,2)，服务层按分做整数运算。
-- 0118 已被并行的 mall 迁移占用，本批顺延 0119。
-- TEXT / JSON 列不带 DEFAULT（MySQL 1101），默认值由服务层写入；可空时间列 DATETIME(3) NULL。

-- CreateTable
CREATE TABLE `onsite_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_categories_shop_id_enabled_sort_order_idx`(`shop_id`, `enabled`, `sort_order`),
    INDEX `onsite_categories_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `subtitle` VARCHAR(160) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `detail` TEXT NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `duration_minutes` INTEGER NOT NULL DEFAULT 60,
    `max_duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `addon_enabled` BOOLEAN NOT NULL DEFAULT true,
    `addon_unit_minutes` INTEGER NOT NULL DEFAULT 30,
    `addon_rate` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `material_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `travel_fee_mode` VARCHAR(12) NOT NULL DEFAULT 'CITY',
    `custom_travel_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `highlights` JSON NOT NULL,
    `door_enabled` BOOLEAN NOT NULL DEFAULT true,
    `store_enabled` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `sales_virtual` INTEGER NOT NULL DEFAULT 0,
    `sales_true` INTEGER NOT NULL DEFAULT 0,
    `rating` DECIMAL(3, 2) NOT NULL DEFAULT 5,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_services_shop_id_status_sort_order_idx`(`shop_id`, `status`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_service_category_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    UNIQUE INDEX `onsite_service_category_links_service_id_category_id_key`(`service_id`, `category_id`),
    INDEX `onsite_service_category_links_shop_id_category_id_idx`(`shop_id`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_service_labels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'FEATURE',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_service_labels_shop_id_name_type_key`(`shop_id`, `name`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_service_label_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `label_id` INTEGER NOT NULL,
    UNIQUE INDEX `onsite_service_label_links_service_id_label_id_key`(`service_id`, `label_id`),
    INDEX `onsite_service_label_links_shop_id_label_id_idx`(`shop_id`, `label_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_service_staff_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `duration_minutes` INTEGER NOT NULL DEFAULT 0,
    UNIQUE INDEX `onsite_service_staff_prices_service_id_staff_id_key`(`service_id`, `staff_id`),
    INDEX `onsite_service_staff_prices_shop_id_staff_id_idx`(`shop_id`, `staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `position` VARCHAR(20) NOT NULL DEFAULT 'HOME',
    `title` VARCHAR(80) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL,
    `link` JSON NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_banners_shop_id_position_enabled_sort_order_idx`(`shop_id`, `position`, `enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_no` VARCHAR(32) NOT NULL DEFAULT '',
    `name` VARCHAR(60) NOT NULL,
    `gender` TINYINT NOT NULL DEFAULT 0,
    `phone` VARCHAR(32) NOT NULL,
    `account_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `id_card_cipher` TEXT NOT NULL,
    `license_images` JSON NOT NULL,
    `work_years` INTEGER NOT NULL DEFAULT 0,
    `intro` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `video` VARCHAR(500) NOT NULL DEFAULT '',
    `level_id` INTEGER NOT NULL DEFAULT 0,
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `service_city` VARCHAR(60) NOT NULL DEFAULT '',
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `service_start_at` VARCHAR(5) NOT NULL DEFAULT '09:00',
    `service_end_at` VARCHAR(5) NOT NULL DEFAULT '19:00',
    `cross_day` BOOLEAN NOT NULL DEFAULT false,
    `daily_order_limit` INTEGER NOT NULL DEFAULT 0,
    `self_price_enabled` BOOLEAN NOT NULL DEFAULT true,
    `car_fee_enabled` BOOLEAN NOT NULL DEFAULT false,
    `car_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `rating` DECIMAL(3, 2) NOT NULL DEFAULT 5,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `order_count_virtual` INTEGER NOT NULL DEFAULT 0,
    `order_count_true` INTEGER NOT NULL DEFAULT 0,
    `recommend_top` BOOLEAN NOT NULL DEFAULT false,
    `sort_top` INTEGER NOT NULL DEFAULT 0,
    `location_enabled` BOOLEAN NOT NULL DEFAULT false,
    `last_location_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `auth_status` VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED',
    `review_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `reviewed_at` DATETIME(3) NULL,
    `profile_pending` JSON NOT NULL,
    `source` VARCHAR(12) NOT NULL DEFAULT 'OWNER',
    `store_id` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_staff_shop_id_status_idx`(`shop_id`, `status`),
    INDEX `onsite_staff_shop_id_city_id_idx`(`shop_id`, `city_id`),
    INDEX `onsite_staff_shop_id_level_id_idx`(`shop_id`, `level_id`),
    INDEX `onsite_staff_account_user_id_idx`(`account_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `rank` INTEGER NOT NULL DEFAULT 1,
    `commission_rate` DECIMAL(5, 2) NOT NULL DEFAULT 50,
    `addon_rate` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `min_performance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `online_hours_required` INTEGER NOT NULL DEFAULT 0,
    `points` INTEGER NOT NULL DEFAULT 0,
    `agreement_article_id` INTEGER NOT NULL DEFAULT 0,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_staff_levels_shop_id_enabled_rank_idx`(`shop_id`, `enabled`, `rank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff_rest_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `all_day` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_by_role` VARCHAR(16) NOT NULL DEFAULT 'OWNER',
    `created_by` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_staff_rest_periods_staff_id_start_at_idx`(`staff_id`, `start_at`),
    INDEX `onsite_staff_rest_periods_shop_id_staff_id_idx`(`shop_id`, `staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff_work_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `day` VARCHAR(10) NOT NULL,
    `minutes` INTEGER NOT NULL DEFAULT 0,
    `true_minutes` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(12) NOT NULL DEFAULT 'SERVICE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_staff_work_logs_shop_id_staff_id_day_idx`(`shop_id`, `staff_id`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff_schedule_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `time_unit_minutes` INTEGER NOT NULL,
    `max_days` INTEGER NOT NULL DEFAULT 0,
    `slots` JSON NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_staff_schedule_cache_staff_id_day_time_unit_minutes_key`(`staff_id`, `day`, `time_unit_minutes`),
    INDEX `onsite_staff_schedule_cache_shop_id_day_idx`(`shop_id`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `level` VARCHAR(12) NOT NULL DEFAULT 'CITY',
    `province_code` VARCHAR(12) NOT NULL DEFAULT '',
    `city_code` VARCHAR(12) NOT NULL DEFAULT '',
    `area_code` VARCHAR(12) NOT NULL DEFAULT '',
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_cities_shop_id_enabled_sort_order_idx`(`shop_id`, `enabled`, `sort_order`),
    INDEX `onsite_cities_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_travel_fee_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `free_kilometers` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `start_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `start_kilometers` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `price_per_kilometer` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `virtual_extra_kilometers` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `public_transit_enabled` BOOLEAN NOT NULL DEFAULT false,
    `min_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_travel_fee_rules_shop_id_city_id_key`(`shop_id`, `city_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_articles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `summary` VARCHAR(200) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `form_enabled` BOOLEAN NOT NULL DEFAULT false,
    `form_purpose` VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `pv` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_articles_shop_id_status_sort_order_idx`(`shop_id`, `status`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_form_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `field_type` VARCHAR(20) NOT NULL DEFAULT 'text',
    `options` JSON NOT NULL,
    `placeholder` VARCHAR(80) NOT NULL DEFAULT '',
    `required` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_form_fields_shop_id_enabled_sort_order_idx`(`shop_id`, `enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_article_form_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `article_id` INTEGER NOT NULL,
    `field_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    UNIQUE INDEX `onsite_article_form_fields_article_id_field_id_key`(`article_id`, `field_id`),
    INDEX `onsite_article_form_fields_field_id_idx`(`field_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_form_submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `article_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `audit_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `audited_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audited_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_form_submissions_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_form_submissions_article_id_idx`(`article_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_form_data` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `submission_id` INTEGER NOT NULL,
    `field_id` INTEGER NOT NULL DEFAULT 0,
    `label` VARCHAR(60) NOT NULL DEFAULT '',
    `value` TEXT NOT NULL,
    INDEX `onsite_form_data_submission_id_idx`(`submission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_shield_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'BLOCK_STAFF',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_shield_links_customer_id_staff_id_type_key`(`customer_id`, `staff_id`, `type`),
    INDEX `onsite_shield_links_shop_id_staff_id_idx`(`shop_id`, `staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

