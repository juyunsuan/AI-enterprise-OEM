-- 0127 品牌商城 × 企业微信 SCRM 松耦合：身份绑定 + 事件外发箱。
-- 设计见 docs/品牌商城与多店铺商城平台设计方案.md §九之二。
-- contact_id 只引用 scrm_contacts.id，不建外键、不在 scrm_* 表加列；
-- SCRM 关掉时这两张表只剩本地待办，商城交易链路不受影响。

-- AlterTable
ALTER TABLE `brand_shops` ADD COLUMN `scrm_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `brand_scrm_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
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

    UNIQUE INDEX `brand_scrm_bindings_shop_id_customer_id_key`(`shop_id`, `customer_id`),
    INDEX `brand_scrm_bindings_shop_id_status_idx`(`shop_id`, `status`),
    INDEX `brand_scrm_bindings_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand_scrm_outbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
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

    UNIQUE INDEX `brand_scrm_outbox_dedupe_key_key`(`dedupe_key`),
    INDEX `brand_scrm_outbox_status_next_at_idx`(`status`, `next_at`),
    INDEX `brand_scrm_outbox_shop_id_created_at_idx`(`shop_id`, `created_at`),
    INDEX `brand_scrm_outbox_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
