-- 园区可选业务：设备租赁字段、发票、巡检、停车许可、资产、能耗抄表。

ALTER TABLE `park_resources`
    ADD COLUMN `stock` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `deposit` DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE `park_reservations`
    ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `deposit_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE `park_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `biz_type` VARCHAR(16) NOT NULL DEFAULT 'ORDER',
    `biz_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(160) NOT NULL,
    `tax_no` VARCHAR(32) NOT NULL DEFAULT '',
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ISSUED',
    `issued_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_invoices_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `park_invoices_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_patrol_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `points` JSON NOT NULL,
    `staff_ids` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_patrol_plans_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_patrol_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `staff_name` VARCHAR(60) NOT NULL DEFAULT '',
    `point_name` VARCHAR(120) NOT NULL DEFAULT '',
    `result` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `park_patrol_records_site_id_plan_id_created_at_idx`(`site_id`, `plan_id`, `created_at`),
    INDEX `park_patrol_records_staff_id_created_at_idx`(`staff_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_parking_permits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `plate_no` VARCHAR(20) NOT NULL,
    `vehicle_type` VARCHAR(16) NOT NULL DEFAULT 'CAR',
    `valid_from` VARCHAR(10) NOT NULL DEFAULT '',
    `valid_to` VARCHAR(10) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_parking_permits_site_id_status_plate_no_idx`(`site_id`, `status`, `plate_no`),
    INDEX `park_parking_permits_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT 'EQUIPMENT',
    `location` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'IN_USE',
    `assignee_staff_id` INTEGER NOT NULL DEFAULT 0,
    `assignee_name` VARCHAR(60) NOT NULL DEFAULT '',
    `purchase_date` VARCHAR(10) NOT NULL DEFAULT '',
    `value` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_assets_site_id_category_status_idx`(`site_id`, `category`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_meter_readings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `meter_type` VARCHAR(16) NOT NULL DEFAULT 'ELECTRIC',
    `meter_no` VARCHAR(40) NOT NULL DEFAULT '',
    `unit_id` INTEGER NOT NULL DEFAULT 0,
    `period` VARCHAR(10) NOT NULL,
    `reading` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_meter_readings_site_id_meter_type_period_idx`(`site_id`, `meter_type`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
