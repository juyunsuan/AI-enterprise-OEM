-- 园区管理独立数据域：园区站点、空间、租户、访客/场地预约、审批、工单、公告。
-- 与租赁/跑腿/商城的小程序数据物理隔离：顾客、员工、订单、预约各一套表，
-- 全部按 site_id 过滤；小程序令牌场景固定为 PARK。

CREATE TABLE `park_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `park_code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370FF',
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `address_line` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DOUBLE NOT NULL DEFAULT 0,
    `lat` DOUBLE NOT NULL DEFAULT 0,
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `notice` VARCHAR(500) NOT NULL DEFAULT '',
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `settings` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_sites_park_code_key`(`park_code`),
    INDEX `park_sites_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_buildings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `floors` INTEGER NOT NULL DEFAULT 1,
    `address_line` VARCHAR(200) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_buildings_site_id_name_key`(`site_id`, `name`),
    INDEX `park_buildings_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `building_id` INTEGER NOT NULL,
    `room_no` VARCHAR(40) NOT NULL,
    `floor` INTEGER NOT NULL DEFAULT 1,
    `area` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `usage` VARCHAR(24) NOT NULL DEFAULT 'OFFICE',
    `status` VARCHAR(16) NOT NULL DEFAULT 'VACANT',
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `attributes` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_units_site_id_building_id_room_no_key`(`site_id`, `building_id`, `room_no`),
    INDEX `park_units_site_id_status_idx`(`site_id`, `status`),
    INDEX `park_units_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `credit_code` VARCHAR(32) NOT NULL DEFAULT '',
    `industry` VARCHAR(40) NOT NULL DEFAULT '',
    `contact_name` VARCHAR(64) NOT NULL DEFAULT '',
    `contact_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `unit_ids` JSON NOT NULL,
    `join_code` VARCHAR(12) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_tenants_site_id_name_key`(`site_id`, `name`),
    INDEX `park_tenants_site_id_status_idx`(`site_id`, `status`),
    INDEX `park_tenants_site_id_join_code_idx`(`site_id`, `join_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `member_role` VARCHAR(16) NOT NULL DEFAULT 'VISITOR',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_customers_site_id_openid_key`(`site_id`, `openid`),
    INDEX `park_customers_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    INDEX `park_customers_site_id_phone_idx`(`site_id`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_staffs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `staff_code` VARCHAR(32) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'CLERK',
    `department` VARCHAR(40) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_staffs_site_id_staff_code_key`(`site_id`, `staff_code`),
    INDEX `park_staffs_site_id_phone_status_idx`(`site_id`, `phone`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_approval_flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `biz_type` VARCHAR(24) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `nodes` JSON NOT NULL,
    `enabled` TINYINT(1) NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_approval_flows_site_id_biz_type_key`(`site_id`, `biz_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_approvals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `biz_type` VARCHAR(24) NOT NULL,
    `biz_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(160) NOT NULL,
    `applicant_type` VARCHAR(16) NOT NULL,
    `applicant_id` INTEGER NOT NULL,
    `applicant_name` VARCHAR(60) NOT NULL DEFAULT '',
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `form_data` JSON NOT NULL,
    `flow_snapshot` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'APPROVING',
    `current_node` INTEGER NOT NULL DEFAULT 0,
    `submitted_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_approvals_site_id_biz_type_status_idx`(`site_id`, `biz_type`, `status`),
    INDEX `park_approvals_applicant_type_applicant_id_idx`(`applicant_type`, `applicant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_approval_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `approval_id` INTEGER NOT NULL,
    `node_index` INTEGER NOT NULL,
    `node_name` VARCHAR(60) NOT NULL DEFAULT '',
    `approver_type` VARCHAR(16) NOT NULL,
    `approver_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `action` VARCHAR(16) NOT NULL DEFAULT '',
    `comment` VARCHAR(500) NOT NULL DEFAULT '',
    `acted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `park_approval_tasks_approver_type_approver_id_status_idx`(`approver_type`, `approver_id`, `status`),
    INDEX `park_approval_tasks_approval_id_node_index_idx`(`approval_id`, `node_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_approval_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `approval_id` INTEGER NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `operator_type` VARCHAR(16) NOT NULL,
    `operator_id` INTEGER NOT NULL,
    `operator_name` VARCHAR(60) NOT NULL DEFAULT '',
    `comment` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `park_approval_logs_approval_id_created_at_idx`(`approval_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_reservations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `applicant_name` VARCHAR(60) NOT NULL,
    `applicant_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `visitor_name` VARCHAR(60) NOT NULL DEFAULT '',
    `visitor_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `visitor_company` VARCHAR(120) NOT NULL DEFAULT '',
    `visitor_id_no` VARCHAR(64) NOT NULL DEFAULT '',
    `plate_no` VARCHAR(20) NOT NULL DEFAULT '',
    `companions` INTEGER NOT NULL DEFAULT 0,
    `building_id` INTEGER NOT NULL DEFAULT 0,
    `unit_id` INTEGER NOT NULL DEFAULT 0,
    `resource_name` VARCHAR(120) NOT NULL DEFAULT '',
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `purpose` VARCHAR(200) NOT NULL DEFAULT '',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `approval_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `pass_code` VARCHAR(20) NOT NULL DEFAULT '',
    `pass_expires_at` DATETIME(3) NULL,
    `checked_in_at` DATETIME(3) NULL,
    `checked_in_by` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_reservations_site_id_kind_status_start_at_idx`(`site_id`, `kind`, `status`, `start_at`),
    INDEX `park_reservations_site_id_pass_code_idx`(`site_id`, `pass_code`),
    INDEX `park_reservations_customer_id_status_idx`(`customer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_work_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `reporter_name` VARCHAR(60) NOT NULL,
    `reporter_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `category` VARCHAR(24) NOT NULL DEFAULT 'REPAIR',
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `building_id` INTEGER NOT NULL DEFAULT 0,
    `unit_id` INTEGER NOT NULL DEFAULT 0,
    `location` VARCHAR(200) NOT NULL DEFAULT '',
    `urgency` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    `assignee_staff_id` INTEGER NOT NULL DEFAULT 0,
    `assignee_name` VARCHAR(60) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `result` TEXT NOT NULL,
    `fee_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `rating` INTEGER NOT NULL DEFAULT 0,
    `rating_comment` VARCHAR(300) NOT NULL DEFAULT '',
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_work_orders_order_no_key`(`order_no`),
    INDEX `park_work_orders_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `park_work_orders_customer_id_created_at_idx`(`customer_id`, `created_at`),
    INDEX `park_work_orders_assignee_staff_id_status_idx`(`assignee_staff_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_work_order_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `action` VARCHAR(24) NOT NULL,
    `operator_type` VARCHAR(16) NOT NULL,
    `operator_id` INTEGER NOT NULL,
    `operator_name` VARCHAR(60) NOT NULL DEFAULT '',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `park_work_order_logs_order_id_created_at_idx`(`order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_announcements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `category` VARCHAR(24) NOT NULL DEFAULT 'NOTICE',
    `title` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(300) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `pinned` TINYINT(1) NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_announcements_site_id_status_pinned_published_at_idx`(`site_id`, `status`, `pinned`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
