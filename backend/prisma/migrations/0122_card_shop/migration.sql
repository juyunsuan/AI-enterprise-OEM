-- 0122 建站管理 · 卡密商城小程序工具（首期核心交易闭环）：卡密商城 10 张业务表。
-- 设计见 docs/建站管理·卡密商城小程序工具设计方案.md。
-- 微信侧凭据与代码包台账不在本域建表：0117 的 miniprogram_apps /
-- miniprogram_tenant_releases 以 scene='CARD_SHOP' + shop_id 承载，一店一个独立小程序主体。
-- 在线客服复用 service-desk（本域只存 desk_site_key，不建会话表）；收款走店主
-- 自己的微信商户号，平台不经手资金，因此没有资金账本与提现表。
-- 金额 DECIMAL(18,2)，布尔走 BOOLEAN（PG 侧由 gen-prisma-schema 派生）。

-- CreateTable
CREATE TABLE `card_shop_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `site_code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(200) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370FF',
    `notice` VARCHAR(500) NOT NULL DEFAULT '',
    `service_contact` JSON NOT NULL,
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `toggles` JSON NOT NULL,
    `stock_display_mode` VARCHAR(16) NOT NULL DEFAULT 'RANGE',
    `card_order_mode` VARCHAR(16) NOT NULL DEFAULT 'OLDEST',
    `lock_minutes` INTEGER NOT NULL DEFAULT 15,
    `protocol_text` MEDIUMTEXT NOT NULL DEFAULT (''),
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `card_shop_sites_site_code_key`(`site_code`),
    INDEX `card_shop_sites_owner_user_id_status_idx`(`owner_user_id`, `status`),
    INDEX `card_shop_sites_enterprise_id_idx`(`enterprise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_categories_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_goods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(200) NOT NULL,
    `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `wholesale_tiers` JSON NOT NULL,
    `limit_quantity` INTEGER NOT NULL DEFAULT 0,
    `max_quantity` INTEGER NOT NULL DEFAULT 0,
    `stock_warn` INTEGER NOT NULL DEFAULT 0,
    `coupon_enabled` BOOLEAN NOT NULL DEFAULT false,
    `take_card_mode` VARCHAR(16) NOT NULL DEFAULT 'OFF',
    `visit_password` VARCHAR(200) NOT NULL DEFAULT '',
    `contact_mode` VARCHAR(16) NOT NULL DEFAULT 'ANY',
    `notify_flags` JSON NOT NULL,
    `card_format` VARCHAR(16) NOT NULL DEFAULT 'SINGLE',
    `intro` VARCHAR(500) NOT NULL DEFAULT '',
    `detail` MEDIUMTEXT NOT NULL DEFAULT (''),
    `remark` MEDIUMTEXT NOT NULL DEFAULT (''),
    `card_order_mode` VARCHAR(16) NOT NULL DEFAULT '',
    `hot` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `sold_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `trashed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_goods_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    INDEX `card_shop_goods_site_id_category_id_status_idx`(`site_id`, `category_id`, `status`),
    INDEX `card_shop_goods_site_id_hot_status_idx`(`site_id`, `hot`, `status`),
    INDEX `card_shop_goods_site_id_trashed_at_idx`(`site_id`, `trashed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_card_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `goods_id` INTEGER NOT NULL,
    `batch_no` VARCHAR(40) NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'TEXT',
    `splitter` VARCHAR(8) NOT NULL DEFAULT '',
    `total_lines` INTEGER NOT NULL DEFAULT 0,
    `imported_count` INTEGER NOT NULL DEFAULT 0,
    `duplicated_count` INTEGER NOT NULL DEFAULT 0,
    `invalid_count` INTEGER NOT NULL DEFAULT 0,
    `order_mode` VARCHAR(16) NOT NULL DEFAULT 'SEQUENTIAL',
    `operator` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `card_shop_card_batches_site_id_goods_id_created_at_idx`(`site_id`, `goods_id`, `created_at`),
    UNIQUE INDEX `card_shop_card_batches_site_batch_no_key`(`site_id`, `batch_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `goods_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL DEFAULT 0,
    `number` VARCHAR(191) NOT NULL DEFAULT '',
    `secret` VARCHAR(191) NOT NULL,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    `seq` INTEGER NOT NULL DEFAULT 0,
    `lock_order_id` INTEGER NOT NULL DEFAULT 0,
    `lock_expire_at` DATETIME(3) NULL,
    `sold_order_id` INTEGER NOT NULL DEFAULT 0,
    `sold_at` DATETIME(3) NULL,
    `sold_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `trashed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_cards_site_id_goods_id_status_seq_idx`(`site_id`, `goods_id`, `status`, `seq`),
    INDEX `card_shop_cards_site_id_batch_id_idx`(`site_id`, `batch_id`),
    INDEX `card_shop_cards_site_id_lock_order_id_idx`(`site_id`, `lock_order_id`),
    INDEX `card_shop_cards_site_id_lock_expire_at_idx`(`site_id`, `lock_expire_at`),
    INDEX `card_shop_cards_site_id_trashed_at_idx`(`site_id`, `trashed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `goods_id` INTEGER NOT NULL,
    `goods_name` VARCHAR(200) NOT NULL DEFAULT '',
    `goods_cover` VARCHAR(500) NOT NULL DEFAULT '',
    `card_format` VARCHAR(16) NOT NULL DEFAULT 'SINGLE',
    `unit_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `product_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `coupon_id` INTEGER NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `notifyEmail` VARCHAR(120) NOT NULL DEFAULT '',
    `contact` VARCHAR(120) NOT NULL DEFAULT '',
    `take_card_password_hash` VARCHAR(120) NOT NULL DEFAULT '',
    `pay_state` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `card_count` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `create_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `fail_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_orders_site_id_pay_state_created_at_idx`(`site_id`, `pay_state`, `created_at`),
    INDEX `card_shop_orders_site_id_contact_idx`(`site_id`, `contact`),
    INDEX `card_shop_orders_site_id_expire_at_idx`(`site_id`, `expire_at`),
    INDEX `card_shop_orders_customer_id_idx`(`customer_id`),
    UNIQUE INDEX `card_shop_orders_site_order_no_key`(`site_id`, `order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_order_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `site_id` INTEGER NOT NULL,
    `card_id` INTEGER NOT NULL DEFAULT 0,
    `number` VARCHAR(191) NOT NULL DEFAULT '',
    `secret` VARCHAR(191) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `card_shop_order_cards_order_id_sort_idx`(`order_id`, `sort`),
    INDEX `card_shop_order_cards_site_id_card_id_idx`(`site_id`, `card_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'FIXED',
    `value` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `min_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `batch_no` VARCHAR(40) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `used_order_id` INTEGER NOT NULL DEFAULT 0,
    `used_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_coupons_site_id_status_expire_at_idx`(`site_id`, `status`, `expire_at`),
    UNIQUE INDEX `card_shop_coupons_site_code_key`(`site_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `last_order_at` DATETIME(3) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_customers_site_id_created_at_idx`(`site_id`, `created_at`),
    UNIQUE INDEX `card_shop_customers_site_openid_key`(`site_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_shop_contents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'NOTICE',
    `title` VARCHAR(200) NOT NULL,
    `summary` VARCHAR(300) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `content` MEDIUMTEXT NOT NULL DEFAULT (''),
    `link` VARCHAR(500) NOT NULL DEFAULT '',
    `pop_auto` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `card_shop_contents_site_id_kind_status_sort_idx`(`site_id`, `kind`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

