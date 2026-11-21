-- 0130 上门服务小程序工具 P2 第一批：分销体系 / 分账引擎 / 结算与提现
-- 口径 docs/私域小程序·上门服务小程序工具设计方案.md §4.2、§5.4：
-- 佣金下单预生成（PENDING）→ 支付生效（ACTIVE）→ 退款按比例冲销（REVERSED）；
-- 佣金按 totalRate 从技师收入与店主收入里按承担比例扣，平台默认不承担。
-- 同时给 onsite_customers 补余额/积分列、onsite_orders 补券与余额抵扣列（P2 带券下单与余额支付用）。
-- TEXT / JSON 列不带 DEFAULT（MySQL 1101），默认值由服务层写入。

-- AlterTable
ALTER TABLE `onsite_customers`
    ADD COLUMN `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `points` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `onsite_orders`
    ADD COLUMN `coupon_ticket_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `coupon_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `balance_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `onsite_distributor_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `real_name` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `level_name` VARCHAR(40) NOT NULL DEFAULT '分销商',
    `rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `pid` INTEGER NOT NULL DEFAULT 0,
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_distributor_profiles_shop_id_customer_id_key`(`shop_id`, `customer_id`),
    INDEX `onsite_distributor_profiles_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_agent_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `agent_type` VARCHAR(12) NOT NULL DEFAULT 'CITY',
    `name` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `province_code` VARCHAR(20) NOT NULL DEFAULT '',
    `city_code` VARCHAR(20) NOT NULL DEFAULT '',
    `area_code` VARCHAR(20) NOT NULL DEFAULT '',
    `commission_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_agent_accounts_shop_id_agent_type_status_idx`(`shop_id`, `agent_type`, `status`),
    INDEX `onsite_agent_accounts_shop_id_parent_id_idx`(`shop_id`, `parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_salesmen` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `agent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `area` VARCHAR(120) NOT NULL DEFAULT '',
    `rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_salesmen_shop_id_agent_id_status_idx`(`shop_id`, `agent_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_channel_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_channel_categories_shop_id_sort_order_idx`(`shop_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(80) NOT NULL,
    `contact` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_channels_shop_id_category_id_status_idx`(`shop_id`, `category_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_partners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_partners_shop_id_staff_id_key`(`shop_id`, `staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `pid` INTEGER NOT NULL DEFAULT 0,
    `channel_id` INTEGER NOT NULL DEFAULT 0,
    `salesman_id` INTEGER NOT NULL DEFAULT 0,
    `agent_id` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(12) NOT NULL DEFAULT 'QR',
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_relations_shop_id_customer_id_created_at_idx`(`shop_id`, `customer_id`, `created_at`),
    INDEX `onsite_relations_shop_id_channel_id_idx`(`shop_id`, `channel_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_commission_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `total_rate` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `staff_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 50,
    `owner_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 50,
    `platform_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_commission_rules_shop_id_role_key`(`shop_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_commissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL DEFAULT '',
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `base_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `item_count` INTEGER NOT NULL DEFAULT 0,
    `paid_at` DATETIME(3) NULL,
    `reversed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_order_commissions_order_id_key`(`order_id`),
    INDEX `onsite_order_commissions_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_order_commissions_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_commission_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `commission_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL DEFAULT 0,
    `source_role` VARCHAR(20) NOT NULL,
    `source_id` INTEGER NOT NULL DEFAULT 0,
    `total_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `staff_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `owner_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `platform_borne_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `base_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `staff_borne_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `owner_borne_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `platform_borne_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reversed_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_order_commission_items_shop_id_commission_id_idx`(`shop_id`, `commission_id`),
    INDEX `onsite_order_commission_items_shop_id_source_role_source_id__idx`(`shop_id`, `source_role`, `source_id`, `status`),
    INDEX `onsite_order_commission_items_order_item_id_idx`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_commission_shares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `commission_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `bearer_role` VARCHAR(12) NOT NULL,
    `bearer_id` INTEGER NOT NULL DEFAULT 0,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reversed_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_order_commission_shares_shop_id_commission_id_idx`(`shop_id`, `commission_id`),
    INDEX `onsite_order_commission_shares_shop_id_bearer_role_bearer_id_idx`(`shop_id`, `bearer_role`, `bearer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `gross_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `net_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `paid_at` DATETIME(3) NULL,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_settlements_shop_id_staff_id_period_start_period_end_key`(`shop_id`, `staff_id`, `period_start`, `period_end`),
    INDEX `onsite_settlements_shop_id_status_period_end_idx`(`shop_id`, `status`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `owner_type` VARCHAR(16) NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `actual_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `method` VARCHAR(12) NOT NULL DEFAULT 'WECHAT',
    `pay_info` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_withdrawals_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_withdrawals_shop_id_owner_type_owner_id_idx`(`shop_id`, `owner_type`, `owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
