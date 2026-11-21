-- 0134 建站管理 · 多店铺商城平台（B2B2C）B0：市场 / 商户主体 / 商户店铺 / 商户账号 / 平台类目 5 张表。
-- 设计见 docs/品牌商城与多店铺商城平台设计方案.md §5.2。
-- 商户账号独立于站内 User 与 org-staff（外部商户不进企业组织树，评审红线），
-- 令牌走独立 issuer，载荷带 marketId + merchantId，跨市场不可互解。
-- 商品 / 交易 / 售后 / 结算 / 营销装修按 B1–B4 分期建表，本迁移不铺后续期次的表。
-- TEXT / JSON 列不带 DEFAULT（MySQL 1101），默认值由服务层写入。

-- CreateTable
CREATE TABLE `mp_markets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `shop_code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `theme_json` JSON NOT NULL,
    `trade_json` JSON NOT NULL,
    `settle_json` JSON NOT NULL,
    `support_site_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mp_markets_owner_user_id_key`(`owner_user_id`),
    UNIQUE INDEX `mp_markets_shop_code_key`(`shop_code`),
    INDEX `mp_markets_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_merchants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `license_no` VARCHAR(64) NOT NULL DEFAULT '',
    `license_image` VARCHAR(500) NOT NULL DEFAULT '',
    `contact_name` VARCHAR(60) NOT NULL,
    `contact_phone` VARCHAR(32) NOT NULL,
    `category_ids` JSON NOT NULL,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_note` VARCHAR(500) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `commission_rate` DECIMAL(5, 2) NULL,
    `expire_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_merchants_market_id_audit_status_idx`(`market_id`, `audit_status`),
    INDEX `mp_merchants_market_id_status_idx`(`market_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `intro` VARCHAR(500) NOT NULL DEFAULT '',
    `category_ids` JSON NOT NULL,
    `shop_code` VARCHAR(16) NOT NULL,
    `mch_id` VARCHAR(64) NOT NULL DEFAULT '',
    `pay_enabled` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `theme_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mp_shops_shop_code_key`(`shop_code`),
    INDEX `mp_shops_market_id_status_sort_order_idx`(`market_id`, `status`, `sort_order`),
    INDEX `mp_shops_merchant_id_idx`(`merchant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_merchant_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(128) NOT NULL,
    `salt` VARCHAR(64) NOT NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'OWNER',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `last_login_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mp_merchant_users_username_key`(`username`),
    INDEX `mp_merchant_users_merchant_id_status_idx`(`merchant_id`, `status`),
    INDEX `mp_merchant_users_market_id_idx`(`market_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_categories_market_id_parent_id_sort_order_idx`(`market_id`, `parent_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
