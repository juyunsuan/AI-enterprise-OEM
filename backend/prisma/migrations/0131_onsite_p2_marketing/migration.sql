-- 0131 上门服务小程序工具 P2 第二批：充值卡 / 余额 / 积分 / 卡券 / 邀请有礼
-- 余额与积分只在本店 C 端顾客域内流转，与站内 AWcoin 物理隔离；
-- 余额/积分流水必须复式（before/after 连续可对账）。
-- TEXT / JSON 列不带 DEFAULT（MySQL 1101），默认值由服务层写入。

-- CreateTable
CREATE TABLE `onsite_balance_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `face_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `gift_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `validity_days` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_balance_cards_shop_id_enabled_sort_order_idx`(`shop_id`, `enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_recharge_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `card_id` INTEGER NOT NULL DEFAULT 0,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `gift_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
    `pay_type` VARCHAR(12) NOT NULL DEFAULT 'WECHAT',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_recharge_orders_order_no_key`(`order_no`),
    INDEX `onsite_recharge_orders_shop_id_customer_id_created_at_idx`(`shop_id`, `customer_id`, `created_at`),
    INDEX `onsite_recharge_orders_shop_id_status_expire_at_idx`(`shop_id`, `status`, `expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_balance_flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `change_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `before_balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `after_balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `related_order_id` INTEGER NOT NULL DEFAULT 0,
    `related_recharge_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_balance_flows_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_point_flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `change_points` INTEGER NOT NULL DEFAULT 0,
    `before_points` INTEGER NOT NULL DEFAULT 0,
    `after_points` INTEGER NOT NULL DEFAULT 0,
    `related_order_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_point_flows_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'FULL_REDUCTION',
    `threshold_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `new_user_only` BOOLEAN NOT NULL DEFAULT false,
    `total_quantity` INTEGER NOT NULL DEFAULT 0,
    `issued_count` INTEGER NOT NULL DEFAULT 0,
    `per_limit` INTEGER NOT NULL DEFAULT 1,
    `scope` VARCHAR(12) NOT NULL DEFAULT 'ALL',
    `valid_start_at` DATETIME(3) NULL,
    `valid_end_at` DATETIME(3) NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_coupons_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_coupon_scope_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `scope_type` VARCHAR(12) NOT NULL,
    `target_id` INTEGER NOT NULL,
    INDEX `onsite_coupon_scope_links_shop_id_coupon_id_idx`(`shop_id`, `coupon_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_coupon_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'UNUSED',
    `used_order_id` INTEGER NOT NULL DEFAULT 0,
    `used_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_coupon_tickets_code_key`(`code`),
    INDEX `onsite_coupon_tickets_shop_id_customer_id_status_idx`(`shop_id`, `customer_id`, `status`),
    INDEX `onsite_coupon_tickets_shop_id_coupon_id_idx`(`shop_id`, `coupon_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'INVITE',
    `name` VARCHAR(60) NOT NULL,
    `reward_type` VARCHAR(12) NOT NULL DEFAULT 'BALANCE',
    `reward_value` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `coupon_id` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'ON',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_activities_shop_id_type_status_idx`(`shop_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_activity_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `activity_id` INTEGER NOT NULL,
    `inviter_customer_id` INTEGER NOT NULL,
    `invitee_customer_id` INTEGER NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `reward_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `rewarded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_activity_records_activity_id_invitee_customer_id_key`(`activity_id`, `invitee_customer_id`),
    INDEX `onsite_activity_records_shop_id_inviter_customer_id_idx`(`shop_id`, `inviter_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_activity_invites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `activity_id` INTEGER NOT NULL,
    `inviter_customer_id` INTEGER NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `invite_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_activity_invites_code_key`(`code`),
    UNIQUE INDEX `onsite_activity_invites_activity_id_inviter_customer_id_key`(`activity_id`, `inviter_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
