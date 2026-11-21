-- 建站管理 · 跑腿小程序工具（参考开源叮点跑腿业务口径重写）。
-- 一个账号＝一部小程序＝一个跑腿站点；顾客/骑手都是小程序微信身份，不进站内账号体系。
-- 金额一律 DECIMAL(18,2)，服务层按「分」整数运算；资金直进店主微信商户号，平台不落资金账本。

CREATE TABLE `errand_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `site_code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `banner` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(200) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370FF',
    `notice` VARCHAR(500) NOT NULL DEFAULT '',
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `address_line` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DOUBLE NOT NULL DEFAULT 0,
    `lat` DOUBLE NOT NULL DEFAULT 0,
    `business_hours` VARCHAR(80) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `contact` JSON NOT NULL,
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `toggles` JSON NOT NULL,
    `protocol_text` MEDIUMTEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_sites_owner_user_id_key`(`owner_user_id`),
    UNIQUE INDEX `errand_sites_site_code_key`(`site_code`),
    INDEX `errand_sites_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `base_fee` DECIMAL(18, 2) NOT NULL DEFAULT 5,
    `base_distance_km` DECIMAL(10, 2) NOT NULL DEFAULT 3,
    `per_km_fee` DECIMAL(18, 2) NOT NULL DEFAULT 2,
    `base_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 5,
    `per_kg_fee` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `night_start` VARCHAR(5) NOT NULL DEFAULT '22:00',
    `night_end` VARCHAR(5) NOT NULL DEFAULT '06:00',
    `night_fee` DECIMAL(18, 2) NOT NULL DEFAULT 3,
    `buy_service_rate` DECIMAL(8, 4) NOT NULL DEFAULT 0.1,
    `min_order_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `max_distance_km` DECIMAL(10, 2) NOT NULL DEFAULT 30,
    `max_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 30,
    `tip_presets` JSON NOT NULL,
    `coupon_enabled` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_rules_site_id_key`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `service_type` VARCHAR(8) NOT NULL DEFAULT 'SEND',
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAY',
    `pay_state` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `pay_mode` VARCHAR(8) NOT NULL DEFAULT 'OFFLINE',
    `from_party` JSON NOT NULL,
    `to_party` JSON NOT NULL,
    `goods_desc` VARCHAR(300) NOT NULL DEFAULT '',
    `goods_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `distance_km` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `base_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `distance_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `weight_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `time_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `goods_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `tip` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `coupon_id` INTEGER NOT NULL DEFAULT 0,
    `coupon_discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `rider_id` INTEGER NOT NULL DEFAULT 0,
    `rider_no` VARCHAR(16) NOT NULL DEFAULT '',
    `rider_name` VARCHAR(40) NOT NULL DEFAULT '',
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `contact_name` VARCHAR(40) NOT NULL DEFAULT '',
    `contact_mobile` VARCHAR(20) NOT NULL DEFAULT '',
    `remark` VARCHAR(300) NOT NULL DEFAULT '',
    `photos` JSON NOT NULL,
    `cancel_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `create_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `expire_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `picked_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_orders_order_no_key`(`order_no`),
    INDEX `errand_orders_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `errand_orders_site_id_pay_state_created_at_idx`(`site_id`, `pay_state`, `created_at`),
    INDEX `errand_orders_status_expire_at_idx`(`status`, `expire_at`),
    INDEX `errand_orders_rider_id_status_idx`(`rider_id`, `status`),
    INDEX `errand_orders_rider_id_created_at_idx`(`rider_id`, `created_at`),
    INDEX `errand_orders_site_id_customer_id_idx`(`site_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_order_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `note` VARCHAR(300) NOT NULL DEFAULT '',
    `operator` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `errand_order_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `errand_order_events_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_riders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `rider_no` VARCHAR(16) NOT NULL,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `name` VARCHAR(40) NOT NULL,
    `mobile` VARCHAR(20) NOT NULL DEFAULT '',
    `id_card_masked` VARCHAR(32) NOT NULL DEFAULT '',
    `id_card_hash` VARCHAR(64) NOT NULL DEFAULT '',
    `vehicle_type` VARCHAR(16) NOT NULL DEFAULT 'EBIKE',
    `service_types` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `online` BOOLEAN NOT NULL DEFAULT false,
    `reject_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `id_card_front` VARCHAR(500) NOT NULL DEFAULT '',
    `id_card_back` VARCHAR(500) NOT NULL DEFAULT '',
    `vehicle_photo` VARCHAR(500) NOT NULL DEFAULT '',
    `rating` DECIMAL(3, 2) NOT NULL DEFAULT 5,
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `income_total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `frozen` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `last_active_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_riders_rider_no_key`(`rider_no`),
    UNIQUE INDEX `errand_riders_site_openid_key`(`site_id`, `openid`),
    INDEX `errand_riders_site_id_status_online_idx`(`site_id`, `status`, `online`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `paid_order_count` INTEGER NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `last_order_at` DATETIME(3) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_customers_site_openid_key`(`site_id`, `openid`),
    INDEX `errand_customers_site_id_created_at_idx`(`site_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `type` VARCHAR(8) NOT NULL DEFAULT 'FROM',
    `name` VARCHAR(40) NOT NULL,
    `mobile` VARCHAR(20) NOT NULL DEFAULT '',
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `address` VARCHAR(200) NOT NULL,
    `lng` DOUBLE NOT NULL DEFAULT 0,
    `lat` DOUBLE NOT NULL DEFAULT 0,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `errand_addresses_site_id_openid_type_idx`(`site_id`, `openid`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `type` VARCHAR(8) NOT NULL DEFAULT 'FIXED',
    `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `min_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `claimed` INTEGER NOT NULL DEFAULT 0,
    `used` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `errand_coupons_site_id_enabled_idx`(`site_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_customer_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_customer_coupons_customer_id_coupon_id_key`(`customer_id`, `coupon_id`),
    INDEX `errand_customer_coupons_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_wallet_txs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `rider_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance_after` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `order_no` VARCHAR(40) NOT NULL DEFAULT '',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `errand_wallet_txs_site_id_created_at_idx`(`site_id`, `created_at`),
    INDEX `errand_wallet_txs_rider_id_created_at_idx`(`rider_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `rider_id` INTEGER NOT NULL,
    `rider_name` VARCHAR(40) NOT NULL DEFAULT '',
    `rider_no` VARCHAR(16) NOT NULL DEFAULT '',
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `bank_info` VARCHAR(200) NOT NULL DEFAULT '',
    `reason` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_note` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `errand_withdrawals_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
