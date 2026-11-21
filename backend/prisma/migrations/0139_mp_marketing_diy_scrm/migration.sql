-- CreateTable
CREATE TABLE `mp_diy_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'ACTIVITY',
    `components` JSON NOT NULL,
    `styles` JSON NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `published_components` JSON NULL,
    `published_styles` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_diy_pages_market_id_shop_id_type_status_idx`(`market_id`, `shop_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `merchant_id` INTEGER NOT NULL DEFAULT 0,
    `issuer_type` VARCHAR(16) NOT NULL DEFAULT 'PLATFORM',
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'FULL_REDUCE',
    `value` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `threshold` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total_count` INTEGER NOT NULL DEFAULT 0,
    `received_count` INTEGER NOT NULL DEFAULT 0,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `per_limit` INTEGER NOT NULL DEFAULT 1,
    `valid_type` VARCHAR(16) NOT NULL DEFAULT 'FIXED',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `valid_days` INTEGER NOT NULL DEFAULT 7,
    `scope` VARCHAR(16) NOT NULL DEFAULT 'ALL',
    `scope_ids` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_coupons_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_coupons_market_id_shop_id_status_idx`(`market_id`, `shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_coupon_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,

    INDEX `mp_coupon_tickets_market_id_customer_id_status_idx`(`market_id`, `customer_id`, `status`),
    INDEX `mp_coupon_tickets_coupon_id_customer_id_idx`(`coupon_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_customer_follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mp_customer_follows_market_id_customer_id_idx`(`market_id`, `customer_id`),
    UNIQUE INDEX `mp_customer_follows_shop_customer_uniq`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_scrm_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `contact_id` INTEGER NOT NULL DEFAULT 0,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `mobile_hash` VARCHAR(64) NOT NULL DEFAULT '',
    `bind_source` VARCHAR(16) NOT NULL DEFAULT 'AUTO_UNIONID',
    `status` VARCHAR(16) NOT NULL DEFAULT 'BOUND',
    `last_sync_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_scrm_bindings_market_id_status_idx`(`market_id`, `status`),
    INDEX `mp_scrm_bindings_owner_user_id_status_idx`(`owner_user_id`, `status`),
    UNIQUE INDEX `mp_scrm_bindings_merchant_customer_uniq`(`merchant_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_scrm_outbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `event_kind` VARCHAR(32) NOT NULL,
    `dedupe_key` VARCHAR(120) NOT NULL,
    `payload_json` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_scrm_outbox_status_next_at_idx`(`status`, `next_at`),
    INDEX `mp_scrm_outbox_merchant_id_created_at_idx`(`merchant_id`, `created_at`),
    INDEX `mp_scrm_outbox_owner_user_id_status_idx`(`owner_user_id`, `status`),
    UNIQUE INDEX `mp_scrm_outbox_dedupe_key_key`(`dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `mp_orders` ADD COLUMN `coupon_ticket_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `coupon_name` VARCHAR(40) NOT NULL DEFAULT '';
