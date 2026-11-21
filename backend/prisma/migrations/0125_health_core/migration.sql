-- 0125 建站管理 · 健康管理小程序工具（参考「智慧医疗管理」全量按本站架构重写）。
-- 设计见 docs/建站管理·健康管理小程序工具设计方案.md。
-- 微信侧凭据与代码包台账不在本域建表：0117 的 miniprogram_apps /
-- miniprogram_tenant_releases 以 scene='HEALTH' + shop_id(=店铺 id) 承载，
-- 一店一个独立小程序主体；收款进店铺方自己的微信商户号，平台不经手资金。
-- 沟通复用 service-desk（本域只存 service_desk_site_key 与会话标识，不建消息表）。
-- 与营销工具「企业微信 SCRM」为松耦合：本域只写 health_scrm_events 出站队列，
-- 任一工具被平台关闭都不影响另一方的数据与功能。
-- 金额一律 DECIMAL(12,2)（元），服务层按分运算；表间用裸 Int 逻辑关联，不建物理外键。
-- CreateTable
CREATE TABLE `health_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `shop_code` VARCHAR(16) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `service_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `share_image` VARCHAR(500) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `theme_json` JSON NOT NULL,
    `trade_json` JSON NOT NULL,
    `service_desk_site_key` VARCHAR(48) NOT NULL DEFAULT '',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_shops_shop_code_key`(`shop_code`),
    INDEX `health_shops_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_shop_staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `label` VARCHAR(60) NOT NULL DEFAULT '',
    `role` VARCHAR(20) NOT NULL DEFAULT 'OPERATION',
    `scopes_json` JSON NOT NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_shop_staff_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `health_shop_staff_shop_id_user_id_key`(`shop_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(60) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL,
    `link_type` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `link_value` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_banners_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `content` TEXT NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_notices_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_diy_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `page_key` VARCHAR(30) NOT NULL,
    `title` VARCHAR(40) NOT NULL DEFAULT '',
    `blocks_json` JSON NOT NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_diy_pages_shop_id_page_key_key`(`shop_id`, `page_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_service_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `entry_key` VARCHAR(30) NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `health_service_entries_shop_id_entry_key_key`(`shop_id`, `entry_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_agreements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `agreement_key` VARCHAR(30) NOT NULL,
    `title` VARCHAR(80) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_agreements_shop_id_agreement_key_key`(`shop_id`, `agreement_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_hospitals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `level` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `intro` TEXT NOT NULL DEFAULT (''),
    `partnered` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_hospitals_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    INDEX `health_hospitals_shop_id_city_idx`(`shop_id`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `hospital_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT '',
    `intro` VARCHAR(1000) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_departments_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    INDEX `health_departments_shop_id_hospital_id_idx`(`shop_id`, `hospital_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `code` VARCHAR(20) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    UNIQUE INDEX `health_cities_shop_id_name_key`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_organs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(24) NOT NULL DEFAULT 'CLINIC',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `contact_name` VARCHAR(60) NOT NULL DEFAULT '',
    `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `license_no` VARCHAR(64) NOT NULL DEFAULT '',
    `license_images_json` JSON NOT NULL,
    `commission_percent` INTEGER NOT NULL DEFAULT 0,
    `intro` TEXT NOT NULL DEFAULT (''),
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_organs_shop_id_audit_status_idx`(`shop_id`, `audit_status`),
    INDEX `health_organs_shop_id_kind_city_idx`(`shop_id`, `kind`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `target_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `extras_json` JSON NOT NULL,
    `materials_json` JSON NOT NULL,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_applications_shop_id_kind_audit_status_idx`(`shop_id`, `kind`, `audit_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_practitioners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `organ_id` INTEGER NOT NULL DEFAULT 0,
    `hospital_id` INTEGER NOT NULL DEFAULT 0,
    `department_id` INTEGER NOT NULL DEFAULT 0,
    `team_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'DOCTOR',
    `title` VARCHAR(40) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL DEFAULT (''),
    `good_at_json` JSON NOT NULL,
    `license_no` VARCHAR(64) NOT NULL DEFAULT '',
    `license_images_json` JSON NOT NULL,
    `commission_percent` INTEGER NOT NULL DEFAULT 0,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `score_sum` INTEGER NOT NULL DEFAULT 0,
    `score_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_practitioners_shop_id_role_status_idx`(`shop_id`, `role`, `status`),
    INDEX `health_practitioners_shop_id_audit_status_idx`(`shop_id`, `audit_status`),
    INDEX `health_practitioners_shop_id_organ_id_idx`(`shop_id`, `organ_id`),
    INDEX `health_practitioners_shop_id_hospital_id_department_id_idx`(`shop_id`, `hospital_id`, `department_id`),
    INDEX `health_practitioners_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_practitioner_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `instant` BOOLEAN NOT NULL DEFAULT false,
    `max_daily_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_practitioner_services_shop_id_status_idx`(`shop_id`, `status`),
    UNIQUE INDEX `health_practitioner_services_practitioner_id_service_id_key`(`practitioner_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `organ_id` INTEGER NOT NULL DEFAULT 0,
    `leader_practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `intro` TEXT NOT NULL DEFAULT (''),
    `qrcode_url` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_teams_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_team_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `team_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `is_leader` BOOLEAN NOT NULL DEFAULT false,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_team_members_shop_id_practitioner_id_idx`(`shop_id`, `practitioner_id`),
    UNIQUE INDEX `health_team_members_team_id_practitioner_id_key`(`team_id`, `practitioner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_team_notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `team_id` INTEGER NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `content` TEXT NOT NULL,
    `author_name` VARCHAR(60) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_team_notices_shop_id_team_id_created_at_idx`(`shop_id`, `team_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_team_joins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `team_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `message` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_team_joins_shop_id_audit_status_idx`(`shop_id`, `audit_status`),
    UNIQUE INDEX `health_team_joins_team_id_practitioner_id_key`(`team_id`, `practitioner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `app_id` VARCHAR(64) NOT NULL DEFAULT '',
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `gender` VARCHAR(8) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `source` VARCHAR(20) NOT NULL DEFAULT 'MINI',
    `promoter_id` INTEGER NOT NULL DEFAULT 0,
    `member_level_id` INTEGER NOT NULL DEFAULT 0,
    `wallet_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `point_value` INTEGER NOT NULL DEFAULT 0,
    `total_pay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `last_active_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_customers_shop_id_phone_idx`(`shop_id`, `phone`),
    INDEX `health_customers_shop_id_unionid_idx`(`shop_id`, `unionid`),
    UNIQUE INDEX `health_customers_shop_id_openid_key`(`shop_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `receiver` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `province` VARCHAR(30) NOT NULL DEFAULT '',
    `city` VARCHAR(30) NOT NULL DEFAULT '',
    `district` VARCHAR(30) NOT NULL DEFAULT '',
    `detail` VARCHAR(200) NOT NULL,
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `tag` VARCHAR(20) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_customer_addresses_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_patients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `relation` VARCHAR(16) NOT NULL DEFAULT 'SELF',
    `gender` VARCHAR(8) NOT NULL DEFAULT '',
    `birthday` VARCHAR(20) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `id_card_cipher` VARCHAR(255) NOT NULL DEFAULT '',
    `id_card_tail` VARCHAR(8) NOT NULL DEFAULT '',
    `blood_type` VARCHAR(8) NOT NULL DEFAULT '',
    `height_cm` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `weight_kg` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `owner_practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `team_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_patients_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    INDEX `health_patients_shop_id_owner_practitioner_id_idx`(`shop_id`, `owner_practitioner_id`),
    INDEX `health_patients_shop_id_name_idx`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_crowd_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(24) NOT NULL DEFAULT 'ALL',
    `desc` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_crowd_groups_shop_id_name_key`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_crowd_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,

    INDEX `health_crowd_members_shop_id_patient_id_idx`(`shop_id`, `patient_id`),
    UNIQUE INDEX `health_crowd_members_group_id_patient_id_key`(`group_id`, `patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `basics_json` JSON NOT NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_records_patient_id_key`(`patient_id`),
    INDEX `health_records_shop_id_updated_at_idx`(`shop_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_record_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `label` VARCHAR(60) NOT NULL DEFAULT '',
    `value` VARCHAR(500) NOT NULL,
    `dict_key` VARCHAR(60) NOT NULL DEFAULT '',
    `start_at` VARCHAR(20) NOT NULL DEFAULT '',
    `end_at` VARCHAR(20) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_record_items_shop_id_patient_id_type_idx`(`shop_id`, `patient_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_medical_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'OUTPATIENT',
    `title` VARCHAR(120) NOT NULL,
    `hospital_name` VARCHAR(120) NOT NULL DEFAULT '',
    `department_name` VARCHAR(60) NOT NULL DEFAULT '',
    `doctor_name` VARCHAR(60) NOT NULL DEFAULT '',
    `occur_at` DATETIME(3) NULL,
    `leave_at` DATETIME(3) NULL,
    `diagnosis` VARCHAR(500) NOT NULL DEFAULT '',
    `summary` TEXT NOT NULL DEFAULT (''),
    `files_json` JSON NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_medical_events_shop_id_patient_id_occur_at_idx`(`shop_id`, `patient_id`, `occur_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_dict_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `group_key` VARCHAR(40) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `value` VARCHAR(60) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_dict_items_shop_id_group_key_status_idx`(`shop_id`, `group_key`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_metrics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `metric_key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `unit` VARCHAR(20) NOT NULL DEFAULT '',
    `decimal_scale` INTEGER NOT NULL DEFAULT 1,
    `normal_min` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `normal_max` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `extra_fields_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_metrics_shop_id_metric_key_key`(`shop_id`, `metric_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_metric_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `metric_id` INTEGER NOT NULL,
    `metric_key` VARCHAR(40) NOT NULL,
    `value` DECIMAL(10, 3) NOT NULL,
    `extras_json` JSON NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    `source_ref_id` INTEGER NOT NULL DEFAULT 0,
    `measured_at` DATETIME(3) NOT NULL,
    `abnormal` BOOLEAN NOT NULL DEFAULT false,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_metric_logs_shop_id_patient_id_metric_key_measured_at_idx`(`shop_id`, `patient_id`, `metric_key`, `measured_at`),
    INDEX `health_metric_logs_shop_id_measured_at_idx`(`shop_id`, `measured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_alert_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `metric_key` VARCHAR(40) NOT NULL,
    `rule_type` VARCHAR(20) NOT NULL,
    `direction` VARCHAR(8) NOT NULL DEFAULT 'ANY',
    `threshold` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `low_threshold` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `delta_percent` INTEGER NOT NULL DEFAULT 0,
    `consecutive` INTEGER NOT NULL DEFAULT 1,
    `window_hours` INTEGER NOT NULL DEFAULT 24,
    `max_count` INTEGER NOT NULL DEFAULT 0,
    `crowd_group_id` INTEGER NOT NULL DEFAULT 0,
    `patient_id` INTEGER NOT NULL DEFAULT 0,
    `level` VARCHAR(12) NOT NULL DEFAULT 'MEDIUM',
    `notify_json` JSON NOT NULL,
    `dedupe_minutes` INTEGER NOT NULL DEFAULT 60,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_alert_rules_shop_id_status_metric_key_idx`(`shop_id`, `status`, `metric_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `rule_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `metric_key` VARCHAR(40) NOT NULL,
    `value` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `baseline` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `level` VARCHAR(12) NOT NULL DEFAULT 'MEDIUM',
    `detail_json` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    `handle_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handle_note` VARCHAR(500) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `dedupe_key` VARCHAR(120) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_alerts_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_alerts_shop_id_patient_id_created_at_idx`(`shop_id`, `patient_id`, `created_at`),
    UNIQUE INDEX `health_alerts_shop_id_dedupe_key_created_at_key`(`shop_id`, `dedupe_key`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `crowd_kind` VARCHAR(24) NOT NULL DEFAULT 'ALL',
    `disease_key` VARCHAR(40) NOT NULL DEFAULT '',
    `desc` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `duration_days` INTEGER NOT NULL DEFAULT 30,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_plans_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_plan_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `ref_key` VARCHAR(60) NOT NULL DEFAULT '',
    `cycle_unit` VARCHAR(8) NOT NULL DEFAULT 'DAY',
    `cycle_value` INTEGER NOT NULL DEFAULT 1,
    `start_offset_day` INTEGER NOT NULL DEFAULT 0,
    `end_offset_day` INTEGER NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `instruction` VARCHAR(1000) NOT NULL DEFAULT '',
    `config_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `health_plan_steps_shop_id_plan_id_sort_idx`(`shop_id`, `plan_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_patient_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `progress_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_patient_plans_shop_id_patient_id_status_idx`(`shop_id`, `patient_id`, `status`),
    INDEX `health_patient_plans_shop_id_practitioner_id_status_idx`(`shop_id`, `practitioner_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_followup_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `plan_step_id` INTEGER NOT NULL DEFAULT 0,
    `patient_plan_id` INTEGER NOT NULL DEFAULT 0,
    `alert_id` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL DEFAULT 'PLAN',
    `title` VARCHAR(120) NOT NULL,
    `way` VARCHAR(16) NOT NULL DEFAULT 'PHONE',
    `content` TEXT NOT NULL DEFAULT (''),
    `due_at` DATETIME(3) NOT NULL,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `assignee_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `assignee_name` VARCHAR(60) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `result_summary` VARCHAR(500) NOT NULL DEFAULT '',
    `done_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_followup_tasks_shop_id_status_due_at_idx`(`shop_id`, `status`, `due_at`),
    INDEX `health_followup_tasks_shop_id_assignee_user_id_status_due_at_idx`(`shop_id`, `assignee_user_id`, `status`, `due_at`),
    INDEX `health_followup_tasks_shop_id_patient_id_due_at_idx`(`shop_id`, `patient_id`, `due_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_followup_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `task_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `way` VARCHAR(16) NOT NULL DEFAULT 'PHONE',
    `result` VARCHAR(32) NOT NULL,
    `note` TEXT NOT NULL DEFAULT (''),
    `files_json` JSON NOT NULL,
    `service_desk_conversation_id` VARCHAR(64) NOT NULL DEFAULT '',
    `operator_user_id` VARCHAR(64) NOT NULL,
    `operator_name` VARCHAR(60) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_followup_records_shop_id_task_id_idx`(`shop_id`, `task_id`),
    INDEX `health_followup_records_shop_id_patient_id_created_at_idx`(`shop_id`, `patient_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_surveys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `desc` VARCHAR(500) NOT NULL DEFAULT '',
    `kind` VARCHAR(20) NOT NULL DEFAULT 'ASSESSMENT',
    `score_rule_json` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_surveys_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_survey_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `survey_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'SINGLE',
    `title` VARCHAR(300) NOT NULL,
    `options_json` JSON NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `health_survey_questions_shop_id_survey_id_sort_idx`(`shop_id`, `survey_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_survey_answers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `survey_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `task_id` INTEGER NOT NULL DEFAULT 0,
    `answers_json` JSON NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `level_label` VARCHAR(40) NOT NULL DEFAULT '',
    `advice` TEXT NOT NULL DEFAULT (''),
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_survey_answers_shop_id_survey_id_submitted_at_idx`(`shop_id`, `survey_id`, `submitted_at`),
    INDEX `health_survey_answers_shop_id_patient_id_submitted_at_idx`(`shop_id`, `patient_id`, `submitted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_medications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `drug_id` INTEGER NOT NULL DEFAULT 0,
    `goods_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `spec` VARCHAR(80) NOT NULL DEFAULT '',
    `way` VARCHAR(16) NOT NULL DEFAULT 'ORAL',
    `dose_text` VARCHAR(80) NOT NULL DEFAULT '',
    `frequency` VARCHAR(12) NOT NULL DEFAULT 'QD',
    `times_json` JSON NOT NULL,
    `start_at` VARCHAR(20) NOT NULL DEFAULT '',
    `end_at` VARCHAR(20) NOT NULL DEFAULT '',
    `prescription_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_medications_shop_id_patient_id_status_idx`(`shop_id`, `patient_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_medication_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `medication_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `plan_date` VARCHAR(10) NOT NULL,
    `plan_time` VARCHAR(10) NOT NULL DEFAULT '',
    `status` VARCHAR(12) NOT NULL DEFAULT 'TAKEN',
    `taken_at` DATETIME(3) NULL,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_medication_logs_shop_id_patient_id_plan_date_idx`(`shop_id`, `patient_id`, `plan_date`),
    UNIQUE INDEX `health_medication_logs_medication_id_plan_date_plan_time_key`(`medication_id`, `plan_date`, `plan_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_medication_effects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `medication_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `period_start` VARCHAR(10) NOT NULL,
    `period_end` VARCHAR(10) NOT NULL,
    `adherence_percent` INTEGER NOT NULL,
    `before_json` JSON NOT NULL,
    `after_json` JSON NOT NULL,
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_medication_effects_shop_id_patient_id_idx`(`shop_id`, `patient_id`),
    UNIQUE INDEX `health_medication_effects_medication_id_period_start_period__key`(`medication_id`, `period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_prescriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `rx_no` VARCHAR(40) NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `consult_id` INTEGER NOT NULL DEFAULT 0,
    `doctor_id` INTEGER NOT NULL,
    `doctor_name` VARCHAR(60) NOT NULL DEFAULT '',
    `diagnosis` VARCHAR(500) NOT NULL DEFAULT '',
    `note` TEXT NOT NULL DEFAULT (''),
    `signature_url` VARCHAR(500) NOT NULL DEFAULT '',
    `total_cents` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `pharmacist_id` INTEGER NOT NULL DEFAULT 0,
    `pharmacist_name` VARCHAR(60) NOT NULL DEFAULT '',
    `review_at` DATETIME(3) NULL,
    `review_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_prescriptions_rx_no_key`(`rx_no`),
    INDEX `health_prescriptions_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_prescriptions_shop_id_patient_id_idx`(`shop_id`, `patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_prescription_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `prescription_id` INTEGER NOT NULL,
    `drug_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `spec` VARCHAR(80) NOT NULL DEFAULT '',
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `usage_text` VARCHAR(200) NOT NULL DEFAULT '',
    `dose_text` VARCHAR(60) NOT NULL DEFAULT '',
    `way` VARCHAR(20) NOT NULL DEFAULT 'ORAL',
    `frequency` VARCHAR(20) NOT NULL DEFAULT 'QD',
    `days` INTEGER NOT NULL DEFAULT 0,

    INDEX `health_prescription_items_shop_id_prescription_id_idx`(`shop_id`, `prescription_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `biz_type` VARCHAR(24) NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT '',
    `department_id` INTEGER NOT NULL DEFAULT 0,
    `hospital_id` INTEGER NOT NULL DEFAULT 0,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images_json` JSON NOT NULL,
    `city_ids_json` JSON NOT NULL,
    `crowd_kinds_json` JSON NOT NULL,
    `desc` TEXT NOT NULL DEFAULT (''),
    `price_mode` VARCHAR(12) NOT NULL DEFAULT 'FIXED',
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `origin_price_cents` INTEGER NOT NULL DEFAULT 0,
    `duration_minutes` INTEGER NOT NULL DEFAULT 15,
    `need_slot` BOOLEAN NOT NULL DEFAULT false,
    `need_patient` BOOLEAN NOT NULL DEFAULT true,
    `max_patient_count` INTEGER NOT NULL DEFAULT 1,
    `supports_instant` BOOLEAN NOT NULL DEFAULT false,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_services_shop_id_biz_type_status_sort_idx`(`shop_id`, `biz_type`, `status`, `sort`),
    INDEX `health_services_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_consult_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `biz_type` VARCHAR(24) NOT NULL DEFAULT 'CONSULT_TEXT',
    `instant` BOOLEAN NOT NULL DEFAULT false,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `minutes` INTEGER NOT NULL DEFAULT 0,
    `max_daily_count` INTEGER NOT NULL DEFAULT 0,
    `message_limit` INTEGER NOT NULL DEFAULT 0,
    `need_patient` BOOLEAN NOT NULL DEFAULT true,
    `time_unit_minutes` INTEGER NOT NULL DEFAULT 15,
    `buffer_minutes` INTEGER NOT NULL DEFAULT 0,
    `max_days` INTEGER NOT NULL DEFAULT 7,
    `booking_lead_minutes` INTEGER NOT NULL DEFAULT 30,
    `text_valid_hours` INTEGER NOT NULL DEFAULT 48,
    `allow_cross_day` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    UNIQUE INDEX `health_consult_rules_shop_id_practitioner_id_biz_type_key`(`shop_id`, `practitioner_id`, `biz_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_shift_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `hospital_id` INTEGER NOT NULL DEFAULT 0,
    `department_id` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'OUTPATIENT',
    `weekdays_json` JSON NOT NULL,
    `start_text` VARCHAR(10) NOT NULL,
    `end_text` VARCHAR(10) NOT NULL,
    `slot_minutes` INTEGER NOT NULL DEFAULT 30,
    `quota_per_slot` INTEGER NOT NULL DEFAULT 1,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_shift_templates_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_doctor_shifts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `work_date` VARCHAR(10) NOT NULL,
    `shift_id` INTEGER NOT NULL DEFAULT 0,
    `start_text` VARCHAR(10) NOT NULL,
    `end_text` VARCHAR(10) NOT NULL,
    `total_quota` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_doctor_shifts_shop_id_practitioner_id_work_date_idx`(`shop_id`, `practitioner_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `shift_id` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'OUTPATIENT',
    `work_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(10) NOT NULL,
    `end_time` VARCHAR(10) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `patient_id` INTEGER NOT NULL DEFAULT 0,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `quota` INTEGER NOT NULL DEFAULT 1,
    `occupied` INTEGER NOT NULL DEFAULT 0,
    `blocked_reason` VARCHAR(100) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_slots_shop_id_service_id_work_date_status_idx`(`shop_id`, `service_id`, `work_date`, `status`),
    INDEX `health_slots_shop_id_status_work_date_idx`(`shop_id`, `status`, `work_date`),
    UNIQUE INDEX `health_slots_practitioner_id_work_date_start_time_kind_key`(`practitioner_id`, `work_date`, `start_time`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_consults` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `consult_no` VARCHAR(40) NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `biz_type` VARCHAR(24) NOT NULL,
    `title` VARCHAR(80) NOT NULL DEFAULT '',
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL,
    `practitioner_name` VARCHAR(60) NOT NULL DEFAULT '',
    `slot_id` INTEGER NOT NULL DEFAULT 0,
    `appoint_at` DATETIME(3) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'WAIT_ACCEPT',
    `symptom_text` TEXT NOT NULL DEFAULT (''),
    `attachments_json` JSON NOT NULL,
    `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `meeting_url` VARCHAR(500) NOT NULL DEFAULT '',
    `accepted_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `expired_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `service_desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `service_desk_conversation_id` INTEGER NOT NULL DEFAULT 0,
    `service_desk_agent_id` INTEGER NOT NULL DEFAULT 0,
    `conclusion` TEXT NOT NULL DEFAULT (''),
    `prescription_id` INTEGER NOT NULL DEFAULT 0,
    `eval_score` INTEGER NOT NULL DEFAULT 0,
    `eval_content` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_consults_consult_no_key`(`consult_no`),
    INDEX `health_consults_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_consults_shop_id_practitioner_id_status_idx`(`shop_id`, `practitioner_id`, `status`),
    INDEX `health_consults_shop_id_patient_id_idx`(`shop_id`, `patient_id`),
    INDEX `health_consults_shop_id_order_id_idx`(`shop_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_sign_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `desc` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `years` INTEGER NOT NULL DEFAULT 1,
    `valid_days` INTEGER NOT NULL DEFAULT 365,
    `team_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `crowd_kinds_json` JSON NOT NULL,
    `rights_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_sign_packages_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_sign_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `package_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `team_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `sign_photo_url` VARCHAR(500) NOT NULL DEFAULT '',
    `signature_url` VARCHAR(500) NOT NULL DEFAULT '',
    `verify_code` VARCHAR(16) NOT NULL DEFAULT '',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `benefits_used_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_sign_orders_shop_id_customer_id_status_idx`(`shop_id`, `customer_id`, `status`),
    INDEX `health_sign_orders_shop_id_patient_id_status_idx`(`shop_id`, `patient_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_green_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'GREEN',
    `target_hospital` VARCHAR(120) NOT NULL DEFAULT '',
    `target_department` VARCHAR(60) NOT NULL DEFAULT '',
    `hospital_id` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL DEFAULT 0,
    `need_type` VARCHAR(20) NOT NULL,
    `urgency` VARCHAR(20) NOT NULL DEFAULT '',
    `demand_at` DATETIME(3) NULL,
    `symptoms` TEXT NOT NULL DEFAULT (''),
    `files_json` JSON NOT NULL,
    `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `follower_name` VARCHAR(60) NOT NULL DEFAULT '',
    `follower_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `matched_hospital` VARCHAR(120) NOT NULL DEFAULT '',
    `matched_doctor` VARCHAR(60) NOT NULL DEFAULT '',
    `matched_at` DATETIME(3) NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `result_text` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_green_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_green_orders_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_green_progress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `green_order_id` INTEGER NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `detail` VARCHAR(500) NOT NULL DEFAULT '',
    `operator_name` VARCHAR(60) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_green_progress_shop_id_green_order_id_created_at_idx`(`shop_id`, `green_order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_diseases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `alias_json` JSON NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT '',
    `department_id` INTEGER NOT NULL DEFAULT 0,
    `department_name` VARCHAR(60) NOT NULL DEFAULT '',
    `departments_json` JSON NOT NULL,
    `body_part` VARCHAR(40) NOT NULL DEFAULT '',
    `desc` VARCHAR(1000) NOT NULL DEFAULT '',
    `overview` TEXT NOT NULL DEFAULT (''),
    `advice` VARCHAR(2000) NOT NULL DEFAULT '',
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
    `is_common` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_diseases_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    INDEX `health_diseases_shop_id_name_idx`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_disease_symptoms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `disease_id` INTEGER NOT NULL,
    `symptom` VARCHAR(60) NOT NULL,

    INDEX `health_disease_symptoms_shop_id_symptom_idx`(`shop_id`, `symptom`),
    INDEX `health_disease_symptoms_shop_id_disease_id_idx`(`shop_id`, `disease_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_exam_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT '',
    `unit` VARCHAR(20) NOT NULL DEFAULT '',
    `reference` VARCHAR(120) NOT NULL DEFAULT '',
    `gender_type` VARCHAR(12) NOT NULL DEFAULT 'ALL',
    `crowd_kinds_json` JSON NOT NULL,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `organ_keys_json` JSON NOT NULL,
    `desc` VARCHAR(1000) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_exam_items_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_exam_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `organ_id` INTEGER NOT NULL DEFAULT 0,
    `crowd_kind` VARCHAR(24) NOT NULL DEFAULT 'ALL',
    `crowd_kinds_json` JSON NOT NULL,
    `gender_type` VARCHAR(12) NOT NULL DEFAULT 'ALL',
    `married_limit` VARCHAR(8) NOT NULL DEFAULT 'ALL',
    `hospital_id` INTEGER NOT NULL DEFAULT 0,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `origin_price_cents` INTEGER NOT NULL DEFAULT 0,
    `desc` TEXT NOT NULL DEFAULT (''),
    `intro` TEXT NOT NULL DEFAULT (''),
    `notice` VARCHAR(2000) NOT NULL DEFAULT '',
    `hot` BOOLEAN NOT NULL DEFAULT false,
    `include_items_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_exam_packages_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_exam_package_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `package_id` INTEGER NOT NULL,
    `exam_item_id` INTEGER NOT NULL,
    `mode` VARCHAR(12) NOT NULL DEFAULT 'INCLUDE',

    INDEX `health_exam_package_items_shop_id_package_id_idx`(`shop_id`, `package_id`),
    UNIQUE INDEX `health_exam_package_items_package_id_exam_item_id_key`(`package_id`, `exam_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `report_no` VARCHAR(60) NOT NULL DEFAULT '',
    `patient_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(16) NOT NULL DEFAULT 'EXAM',
    `title` VARCHAR(120) NOT NULL,
    `hospital_name` VARCHAR(120) NOT NULL DEFAULT '',
    `organ_name` VARCHAR(120) NOT NULL DEFAULT '',
    `doctor_name` VARCHAR(60) NOT NULL DEFAULT '',
    `report_at` DATETIME(3) NULL,
    `files_json` JSON NOT NULL,
    `summary` TEXT NOT NULL DEFAULT (''),
    `conclusion` TEXT NOT NULL DEFAULT (''),
    `metrics_json` JSON NOT NULL,
    `abnormal_count` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER_UPLOAD',
    `source_ref_id` INTEGER NOT NULL DEFAULT 0,
    `read_status` VARCHAR(16) NOT NULL DEFAULT 'UNREAD',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_reports_shop_id_patient_id_report_at_idx`(`shop_id`, `patient_id`, `report_at`),
    INDEX `health_reports_shop_id_type_created_at_idx`(`shop_id`, `type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_report_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `report_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `value_text` VARCHAR(80) NOT NULL,
    `unit` VARCHAR(20) NOT NULL DEFAULT '',
    `ref_range` VARCHAR(80) NOT NULL DEFAULT '',
    `flag` VARCHAR(12) NOT NULL DEFAULT 'NORMAL',
    `metric_key` VARCHAR(40) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `health_report_items_shop_id_report_id_sort_idx`(`shop_id`, `report_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_report_advices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `report_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `consult_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `doctor_name` VARCHAR(60) NOT NULL DEFAULT '',
    `adviceText` TEXT NOT NULL,
    `service_desk_conversation_id` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_report_advices_shop_id_report_id_idx`(`shop_id`, `report_id`),
    INDEX `health_report_advices_shop_id_patient_id_created_at_idx`(`shop_id`, `patient_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_goods_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(40) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_goods_categories_shop_id_parent_id_sort_idx`(`shop_id`, `parent_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_goods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `subtitle` VARCHAR(120) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images_json` JSON NOT NULL,
    `detail_html` LONGTEXT NOT NULL DEFAULT (''),
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `origin_price_cents` INTEGER NOT NULL DEFAULT 0,
    `cost_cents` INTEGER NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `unit` VARCHAR(10) NOT NULL DEFAULT '件',
    `kind` VARCHAR(20) NOT NULL DEFAULT 'HEALTH_PRODUCT',
    `spec` VARCHAR(60) NOT NULL DEFAULT '',
    `sku_mode` BOOLEAN NOT NULL DEFAULT false,
    `shipping_mode` VARCHAR(16) NOT NULL DEFAULT 'TEMPLATE',
    `recommend` BOOLEAN NOT NULL DEFAULT false,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
    `is_rx` BOOLEAN NOT NULL DEFAULT false,
    `drug_id` INTEGER NOT NULL DEFAULT 0,
    `shipping_template_id` INTEGER NOT NULL DEFAULT 0,
    `weight_gram` INTEGER NOT NULL DEFAULT 0,
    `organ_key` VARCHAR(20) NOT NULL DEFAULT '',
    `tags_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OFF',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_goods_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    INDEX `health_goods_shop_id_category_id_status_idx`(`shop_id`, `category_id`, `status`),
    INDEX `health_goods_shop_id_name_idx`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_goods_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `goods_id` INTEGER NOT NULL,
    `spec_text` VARCHAR(120) NOT NULL DEFAULT '',
    `specs_json` JSON NOT NULL,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `sku_no` VARCHAR(40) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_goods_skus_shop_id_goods_id_status_idx`(`shop_id`, `goods_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_drugs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `goods_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `generic_name` VARCHAR(120) NOT NULL DEFAULT '',
    `brand_name` VARCHAR(120) NOT NULL DEFAULT '',
    `spec` VARCHAR(80) NOT NULL DEFAULT '',
    `unit` VARCHAR(10) NOT NULL DEFAULT '盒',
    `approval_no` VARCHAR(60) NOT NULL DEFAULT '',
    `manufacturer` VARCHAR(120) NOT NULL DEFAULT '',
    `rx_type` VARCHAR(12) NOT NULL DEFAULT 'OTC_A',
    `otc_class` VARCHAR(20) NOT NULL DEFAULT '',
    `category` VARCHAR(40) NOT NULL DEFAULT '',
    `organ_key` VARCHAR(20) NOT NULL DEFAULT '',
    `indication` VARCHAR(1000) NOT NULL DEFAULT '',
    `contraindication` VARCHAR(1000) NOT NULL DEFAULT '',
    `usage_text` VARCHAR(500) NOT NULL DEFAULT '',
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_drugs_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    INDEX `health_drugs_shop_id_rx_type_idx`(`shop_id`, `rx_type`),
    INDEX `health_drugs_shop_id_name_idx`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_carts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `goods_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `checked` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_carts_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    UNIQUE INDEX `health_carts_customer_id_goods_id_sku_id_key`(`customer_id`, `goods_id`, `sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_express_companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `code` VARCHAR(30) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_express_companies_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_shipping_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `rules_json` JSON NOT NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_shipping_templates_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_order_shipments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `express_company_id` INTEGER NOT NULL DEFAULT 0,
    `express_name` VARCHAR(40) NOT NULL DEFAULT '',
    `tracking_no` VARCHAR(60) NOT NULL DEFAULT '',
    `items_json` JSON NOT NULL,
    `traces_json` JSON NOT NULL,
    `shipped_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'SHIPPED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_order_shipments_shop_id_order_id_idx`(`shop_id`, `order_id`),
    INDEX `health_order_shipments_shop_id_tracking_no_idx`(`shop_id`, `tracking_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_aftersales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `no` VARCHAR(40) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'REFUND',
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `description` VARCHAR(1000) NOT NULL DEFAULT '',
    `images_json` JSON NOT NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `refund_cents` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_note` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `return_express` VARCHAR(120) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_aftersales_no_key`(`no`),
    INDEX `health_aftersales_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_aftersales_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    INDEX `health_aftersales_shop_id_order_id_idx`(`shop_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_member_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `level_value` INTEGER NOT NULL DEFAULT 1,
    `threshold_cents` INTEGER NOT NULL DEFAULT 0,
    `discount_percent` INTEGER NOT NULL DEFAULT 100,
    `point_rate_percent` INTEGER NOT NULL DEFAULT 100,
    `rights_json` JSON NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_member_levels_shop_id_status_idx`(`shop_id`, `status`),
    UNIQUE INDEX `health_member_levels_shop_id_level_value_key`(`shop_id`, `level_value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_member_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `level_value` INTEGER NOT NULL DEFAULT 1,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `origin_price_cents` INTEGER NOT NULL DEFAULT 0,
    `valid_days` INTEGER NOT NULL DEFAULT 365,
    `desc` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `rights_json` JSON NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_member_cards_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_member_grants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'CARD',
    `member_card_id` INTEGER NOT NULL DEFAULT 0,
    `level_value` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `verify_code` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `benefits_used_json` JSON NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'ADMIN',
    `operator` VARCHAR(64) NOT NULL DEFAULT '',
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_member_grants_shop_id_customer_id_end_at_idx`(`shop_id`, `customer_id`, `end_at`),
    INDEX `health_member_grants_shop_id_verify_code_idx`(`shop_id`, `verify_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'CASH',
    `value_cents` INTEGER NOT NULL DEFAULT 0,
    `discount_percent` INTEGER NOT NULL DEFAULT 100,
    `min_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `scope` VARCHAR(16) NOT NULL DEFAULT 'ALL',
    `scope_ids_json` JSON NOT NULL,
    `biz_types_json` JSON NOT NULL,
    `goods_ids_json` JSON NOT NULL,
    `total` INTEGER NOT NULL DEFAULT 0,
    `received` INTEGER NOT NULL DEFAULT 0,
    `used` INTEGER NOT NULL DEFAULT 0,
    `valid_type` VARCHAR(12) NOT NULL DEFAULT 'FIXED',
    `valid_days` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `receive_limit` INTEGER NOT NULL DEFAULT 1,
    `auto_send_json` JSON NOT NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_coupons_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_coupon_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `code` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'RECEIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_coupon_tickets_shop_id_customer_id_status_idx`(`shop_id`, `customer_id`, `status`),
    INDEX `health_coupon_tickets_shop_id_coupon_id_idx`(`shop_id`, `coupon_id`),
    INDEX `health_coupon_tickets_shop_id_code_idx`(`shop_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_point_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `scene` VARCHAR(20) NOT NULL,
    `label` VARCHAR(60) NOT NULL DEFAULT '',
    `value` INTEGER NOT NULL DEFAULT 0,
    `percent` INTEGER NOT NULL DEFAULT 0,
    `daily_limit` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    UNIQUE INDEX `health_point_rules_shop_id_scene_key`(`shop_id`, `scene`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_point_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `value` TINYINT NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `scene` VARCHAR(20) NOT NULL DEFAULT '',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_point_logs_shop_id_customer_id_created_at_idx`(`shop_id`, `customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_verify_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `verify_by` VARCHAR(64) NOT NULL DEFAULT '',
    `verify_name` VARCHAR(60) NOT NULL DEFAULT '',
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `health_verify_codes_code_key`(`code`),
    INDEX `health_verify_codes_shop_id_order_id_status_idx`(`shop_id`, `order_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `order_type` VARCHAR(24) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `patient_ids_json` JSON NOT NULL,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `goods_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `discount_cents` INTEGER NOT NULL DEFAULT 0,
    `shipping_cents` INTEGER NOT NULL DEFAULT 0,
    `pay_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `refund_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `point_deduct_cents` INTEGER NOT NULL DEFAULT 0,
    `coupon_ticket_id` INTEGER NOT NULL DEFAULT 0,
    `pay_way` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `pay_status` VARCHAR(12) NOT NULL DEFAULT 'UNPAID',
    `trade_no` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAY',
    `slot_id` INTEGER NOT NULL DEFAULT 0,
    `consult_id` INTEGER NOT NULL DEFAULT 0,
    `biz_ref_id` INTEGER NOT NULL DEFAULT 0,
    `biz_ref_type` VARCHAR(24) NOT NULL DEFAULT '',
    `receiver_json` JSON NOT NULL,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `audit_note` VARCHAR(500) NOT NULL DEFAULT '',
    `prescription_id` INTEGER NOT NULL DEFAULT 0,
    `refund_no` VARCHAR(64) NOT NULL DEFAULT '',
    `refunded_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `closed_at` DATETIME(3) NULL,
    `auto_cancel_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `promoter_id` INTEGER NOT NULL DEFAULT 0,
    `source_page` VARCHAR(120) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_orders_order_no_key`(`order_no`),
    INDEX `health_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_orders_shop_id_customer_id_created_at_idx`(`shop_id`, `customer_id`, `created_at`),
    INDEX `health_orders_shop_id_order_type_status_idx`(`shop_id`, `order_type`, `status`),
    INDEX `health_orders_shop_id_pay_status_auto_cancel_at_idx`(`shop_id`, `pay_status`, `auto_cancel_at`),
    INDEX `health_orders_shop_id_promoter_id_idx`(`shop_id`, `promoter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `item_type` VARCHAR(20) NOT NULL DEFAULT 'SERVICE',
    `ref_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `spec_text` VARCHAR(120) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `refund_cents` INTEGER NOT NULL DEFAULT 0,
    `patient_id` INTEGER NOT NULL DEFAULT 0,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_order_items_shop_id_order_id_idx`(`shop_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_order_status_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `from_status` VARCHAR(24) NOT NULL DEFAULT '',
    `to_status` VARCHAR(24) NOT NULL,
    `action` VARCHAR(40) NOT NULL DEFAULT '',
    `operator_type` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
    `operator_name` VARCHAR(60) NOT NULL DEFAULT '',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_order_status_logs_shop_id_order_id_created_at_idx`(`shop_id`, `order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_order_shares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `earner_type` VARCHAR(20) NOT NULL,
    `earner_id` INTEGER NOT NULL,
    `earner_name` VARCHAR(60) NOT NULL DEFAULT '',
    `base_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `rate_percent` INTEGER NOT NULL DEFAULT 0,
    `share_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'SETTLED',
    `settleable_at` DATETIME(3) NULL,
    `related_share_id` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_order_shares_shop_id_order_id_idx`(`shop_id`, `order_id`),
    INDEX `health_order_shares_shop_id_earner_type_earner_id_created_at_idx`(`shop_id`, `earner_type`, `earner_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_wallet_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `balance_after_cents` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_wallet_logs_shop_id_customer_id_created_at_idx`(`shop_id`, `customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `no` VARCHAR(40) NOT NULL,
    `earner_type` VARCHAR(20) NOT NULL,
    `earner_id` INTEGER NOT NULL,
    `earner_name` VARCHAR(60) NOT NULL DEFAULT '',
    `amount_cents` INTEGER NOT NULL,
    `tax_cents` INTEGER NOT NULL DEFAULT 0,
    `real_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `bank_card_id` INTEGER NOT NULL DEFAULT 0,
    `pay_channel` VARCHAR(16) NOT NULL DEFAULT 'BANK',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_note` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `voucher_image` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_withdrawals_no_key`(`no`),
    INDEX `health_withdrawals_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_withdrawals_shop_id_earner_type_earner_id_idx`(`shop_id`, `earner_type`, `earner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_bank_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `holder_type` VARCHAR(20) NOT NULL DEFAULT 'PRACTITIONER',
    `holder_id` INTEGER NOT NULL,
    `holder_name` VARCHAR(60) NOT NULL,
    `bank_name` VARCHAR(60) NOT NULL DEFAULT '',
    `branch_name` VARCHAR(80) NOT NULL DEFAULT '',
    `card_no_cipher` VARCHAR(255) NOT NULL,
    `card_no_tail` VARCHAR(8) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_bank_cards_shop_id_holder_type_holder_id_idx`(`shop_id`, `holder_type`, `holder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_promoters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `code` VARCHAR(24) NOT NULL,
    `level_value` INTEGER NOT NULL DEFAULT 1,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `mode` VARCHAR(16) NOT NULL DEFAULT 'SELF',
    `rates_json` JSON NOT NULL,
    `total_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `settled_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `frozen_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_promoters_code_key`(`code`),
    INDEX `health_promoters_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    INDEX `health_promoters_shop_id_status_audit_status_idx`(`shop_id`, `status`, `audit_status`),
    INDEX `health_promoters_shop_id_parent_id_idx`(`shop_id`, `parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_promoter_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `promoter_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(40) NOT NULL DEFAULT '',

    INDEX `health_promoter_relations_shop_id_promoter_id_idx`(`shop_id`, `promoter_id`),
    UNIQUE INDEX `health_promoter_relations_shop_id_customer_id_key`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_promote_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `promoter_id` INTEGER NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `page` VARCHAR(120) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_promote_logs_shop_id_promoter_id_created_at_idx`(`shop_id`, `promoter_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_posters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `bg_image` VARCHAR(500) NOT NULL,
    `layout_json` JSON NOT NULL,
    `ref_type` VARCHAR(20) NOT NULL DEFAULT 'SHOP',
    `ref_id` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_posters_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_article_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_article_categories_shop_id_status_sort_idx`(`shop_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_articles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `summary` VARCHAR(300) NOT NULL DEFAULT '',
    `content_html` LONGTEXT NOT NULL,
    `author_type` VARCHAR(16) NOT NULL DEFAULT 'SHOP',
    `author_id` INTEGER NOT NULL DEFAULT 0,
    `author_name` VARCHAR(60) NOT NULL DEFAULT '',
    `tags_json` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `read_count` INTEGER NOT NULL DEFAULT 0,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `top_flag` BOOLEAN NOT NULL DEFAULT false,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_articles_shop_id_status_top_flag_published_at_idx`(`shop_id`, `status`, `top_flag`, `published_at`),
    INDEX `health_articles_shop_id_category_id_status_idx`(`shop_id`, `category_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_article_reads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `ref_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_article_reads_shop_id_ref_id_created_at_idx`(`shop_id`, `ref_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `author_kind` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
    `author_practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `images_json` JSON NOT NULL,
    `topic` VARCHAR(60) NOT NULL DEFAULT '',
    `crowd_kind` VARCHAR(24) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `top_flag` BOOLEAN NOT NULL DEFAULT false,
    `essence_flag` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_posts_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_posts_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_post_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `ref_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `parentId` INTEGER NOT NULL DEFAULT 0,
    `content` VARCHAR(500) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_post_comments_shop_id_ref_id_created_at_idx`(`shop_id`, `ref_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_post_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `targetType` VARCHAR(12) NOT NULL,
    `ref_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_post_likes_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    UNIQUE INDEX `health_post_likes_targetType_ref_id_customer_id_key`(`targetType`, `ref_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_post_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `health_post_tags_shop_id_name_key`(`shop_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `targetType` VARCHAR(16) NOT NULL,
    `ref_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_follows_shop_id_targetType_ref_id_idx`(`shop_id`, `targetType`, `ref_id`),
    UNIQUE INDEX `health_follows_customer_id_targetType_ref_id_key`(`customer_id`, `targetType`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `consult_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL,
    `patient_id` INTEGER NOT NULL DEFAULT 0,
    `target_type` VARCHAR(20) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `target_name` VARCHAR(120) NOT NULL DEFAULT '',
    `score` INTEGER NOT NULL DEFAULT 5,
    `attitude_score` INTEGER NOT NULL DEFAULT 0,
    `skill_score` INTEGER NOT NULL DEFAULT 0,
    `content` VARCHAR(1000) NOT NULL DEFAULT '',
    `images_json` JSON NOT NULL,
    `anonymous` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `reply_content` VARCHAR(1000) NOT NULL DEFAULT '',
    `replied_at` DATETIME(3) NULL,
    `appeal_content` VARCHAR(500) NOT NULL DEFAULT '',
    `appeal_status` VARCHAR(16) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_reviews_shop_id_target_type_target_id_status_idx`(`shop_id`, `target_type`, `target_id`, `status`),
    INDEX `health_reviews_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_reviews_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_broadcasts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `content` TEXT NOT NULL,
    `channel` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
    `target_json` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `sent_at` DATETIME(3) NULL,
    `created_by` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_broadcasts_shop_id_channel_status_created_at_idx`(`shop_id`, `channel`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_canned_responses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `group` VARCHAR(30) NOT NULL DEFAULT '常用',
    `title` VARCHAR(60) NOT NULL DEFAULT '',
    `content` VARCHAR(1000) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `health_canned_responses_shop_id_group_sort_idx`(`shop_id`, `group`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_hot_keywords` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `word` VARCHAR(40) NOT NULL,
    `search_num` INTEGER NOT NULL DEFAULT 0,
    `result_num` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(12) NOT NULL DEFAULT 'AUTO',
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',

    INDEX `health_hot_keywords_shop_id_status_search_num_idx`(`shop_id`, `status`, `search_num`),
    UNIQUE INDEX `health_hot_keywords_shop_id_word_key`(`shop_id`, `word`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_search_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `keyword` VARCHAR(60) NOT NULL,
    `result_type` VARCHAR(20) NOT NULL DEFAULT '',
    `result_num` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_search_logs_shop_id_keyword_created_at_idx`(`shop_id`, `keyword`, `created_at`),
    INDEX `health_search_logs_shop_id_created_at_idx`(`shop_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_daily_stats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `stat_date` VARCHAR(10) NOT NULL,
    `customer_new` INTEGER NOT NULL DEFAULT 0,
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `pay_order_count` INTEGER NOT NULL DEFAULT 0,
    `pay_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `refund_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `consult_count` INTEGER NOT NULL DEFAULT 0,
    `alert_count` INTEGER NOT NULL DEFAULT 0,
    `followup_done` INTEGER NOT NULL DEFAULT 0,
    `followup_overdue` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `health_daily_stats_stat_date_key`(`stat_date`),
    INDEX `health_daily_stats_shop_id_stat_date_idx`(`shop_id`, `stat_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_scrm_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `org_type` VARCHAR(20) NOT NULL,
    `org_user_id` VARCHAR(64) NOT NULL,
    `push_enabled` BOOLEAN NOT NULL DEFAULT true,
    `pull_enabled` BOOLEAN NOT NULL DEFAULT false,
    `last_pull_at` DATETIME(3) NULL,
    `last_push_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_scrm_links_org_type_org_user_id_idx`(`org_type`, `org_user_id`),
    UNIQUE INDEX `health_scrm_links_shop_id_org_type_org_user_id_key`(`shop_id`, `org_type`, `org_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_scrm_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `event_type` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `ref_type` VARCHAR(24) NOT NULL DEFAULT '',
    `ref_id` INTEGER NOT NULL DEFAULT 0,
    `payload_json` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,

    INDEX `health_scrm_events_shop_id_status_occurred_at_idx`(`shop_id`, `status`, `occurred_at`),
    INDEX `health_scrm_events_shop_id_customer_id_occurred_at_idx`(`shop_id`, `customer_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_scrm_contact_refs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `external_user_id` VARCHAR(64) NOT NULL,
    `follow_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `synced_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `health_scrm_contact_refs_shop_id_customer_id_key`(`shop_id`, `customer_id`),
    UNIQUE INDEX `health_scrm_contact_refs_shop_id_external_user_id_key`(`shop_id`, `external_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `health_order_price_flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `step` VARCHAR(24) NOT NULL,
    `label` VARCHAR(60) NOT NULL DEFAULT '',
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `ref_label` VARCHAR(120) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_order_price_flows_shop_id_order_id_idx`(`shop_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_commission_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `scope` VARCHAR(16) NOT NULL,
    `scope_id` INTEGER NOT NULL DEFAULT 0,
    `biz_types_json` JSON NOT NULL,
    `organ_percent` INTEGER NOT NULL DEFAULT 0,
    `practitioner_percent` INTEGER NOT NULL DEFAULT 0,
    `promoter_percent` INTEGER NOT NULL DEFAULT 0,
    `team_percent` INTEGER NOT NULL DEFAULT 0,
    `shop_percent` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_commission_rules_shop_id_scope_status_idx`(`shop_id`, `scope`, `status`),
    UNIQUE INDEX `health_commission_rules_shop_id_scope_scope_id_key`(`shop_id`, `scope`, `scope_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
