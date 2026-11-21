-- 0118 私域小程序 · 电商小程序工具（首期核心交易闭环）：商城 17 张业务表。
-- 设计见 docs/私域小程序与电商小程序工具设计方案.md。
-- 微信侧凭据与代码包台账不在本域建表：0117 的 miniprogram_apps /
-- miniprogram_tenant_releases 以 scene='MALL' + shop_id 承载，
-- 一店一个独立小程序主体（appId 全局唯一），共享的只是出包与直传机制。
-- 金额 DECIMAL(18,2)，布尔走 BOOLEAN（PG 侧由 gen-prisma-schema 转 SMALLINT/BOOLEAN）。

-- CreateTable
CREATE TABLE `mall_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `name` VARCHAR(120) NOT NULL,
    `shop_code` VARCHAR(16) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `service_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#FA3534',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `trade_json` JSON NOT NULL,
    `share_image` VARCHAR(500) NOT NULL DEFAULT '',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mall_shops_shop_code_key`(`shop_code`),
    INDEX `mall_shops_owner_user_id_status_idx`(`owner_user_id`, `status`),
    INDEX `mall_shops_enterprise_id_idx`(`enterprise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(30) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `level` INTEGER NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_categories_shop_id_parent_id_sort_order_idx`(`shop_id`, `parent_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(200) NOT NULL,
    `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `detail` MEDIUMTEXT NOT NULL DEFAULT (''),
    `type` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `unit` VARCHAR(20) NOT NULL DEFAULT '件',
    `weight` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `volume` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `specs` JSON NOT NULL,
    `guarantee` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `is_hot` BOOLEAN NOT NULL DEFAULT false,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `is_good` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `virtual_remark` VARCHAR(500) NOT NULL DEFAULT '',
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_products_shop_id_status_sort_order_idx`(`shop_id`, `status`, `sort_order`),
    INDEX `mall_products_shop_id_category_id_idx`(`shop_id`, `category_id`),
    INDEX `mall_products_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_product_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `unique_id` VARCHAR(191) NOT NULL DEFAULT '',
    `spec_values` JSON NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `weight` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `volume` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `barcode` VARCHAR(64) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_product_skus_product_id_idx`(`product_id`),
    INDEX `mall_product_skus_shop_id_unique_id_idx`(`shop_id`, `unique_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_express_companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(40) NOT NULL,
    `code` VARCHAR(40) NOT NULL DEFAULT '',
    `phone` VARCHAR(30) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_express_companies_shop_id_enabled_sort_order_idx`(`shop_id`, `enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_product_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `order_item_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL DEFAULT 5,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    `reply` VARCHAR(500) NOT NULL DEFAULT '',
    `reply_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_product_reviews_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `mall_product_reviews_product_id_status_idx`(`product_id`, `status`),
    INDEX `mall_product_reviews_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `gender` INTEGER NOT NULL DEFAULT 0,
    `level` VARCHAR(30) NOT NULL DEFAULT '',
    `points` INTEGER NOT NULL DEFAULT 0,
    `balance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `source` VARCHAR(16) NOT NULL DEFAULT 'MINIPROGRAM',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `referrer_customer_id` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_customers_shop_id_phone_idx`(`shop_id`, `phone`),
    INDEX `mall_customers_shop_id_created_at_idx`(`shop_id`, `created_at`),
    UNIQUE INDEX `mall_customers_shop_openid_uniq`(`shop_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `real_name` VARCHAR(30) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `detail` VARCHAR(200) NOT NULL,
    `postal_code` VARCHAR(10) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `tag` VARCHAR(10) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_customer_addresses_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_customer_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `points_after` INTEGER NOT NULL DEFAULT 0,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `related_type` VARCHAR(20) NOT NULL DEFAULT '',
    `related_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mall_customer_bills_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_cart_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `selected` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_cart_items_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    UNIQUE INDEX `mall_cart_items_shop_customer_sku_uniq`(`shop_id`, `customer_id`, `sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    `refund_status` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `goods_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `freight_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `points_deduct` INTEGER NOT NULL DEFAULT 0,
    `points_return` INTEGER NOT NULL DEFAULT 0,
    `coupon_ticket_id` INTEGER NOT NULL DEFAULT 0,
    `coupon_name` VARCHAR(60) NOT NULL DEFAULT '',
    `pay_type` VARCHAR(16) NOT NULL DEFAULT 'WECHAT',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `receiver_name` VARCHAR(30) NOT NULL DEFAULT '',
    `receiver_phone` VARCHAR(20) NOT NULL DEFAULT '',
    `receiver_province` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_city` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_district` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_detail` VARCHAR(200) NOT NULL DEFAULT '',
    `buyer_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `seller_remark` VARCHAR(500) NOT NULL DEFAULT '',
    `express_company` VARCHAR(40) NOT NULL DEFAULT '',
    `express_no` VARCHAR(60) NOT NULL DEFAULT '',
    `cancel_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `shipped_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `client_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mall_orders_order_no_key`(`order_no`),
    INDEX `mall_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `mall_orders_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    INDEX `mall_orders_shop_id_expire_at_idx`(`shop_id`, `expire_at`),
    INDEX `mall_orders_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `product_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(200) NOT NULL,
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `total_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `refund_status` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `refunded_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mall_order_items_order_id_idx`(`order_id`),
    INDEX `mall_order_items_shop_id_product_id_idx`(`shop_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_order_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `operator_type` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `action` VARCHAR(40) NOT NULL,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mall_order_logs_order_id_id_idx`(`order_id`, `id`),
    INDEX `mall_order_logs_shop_id_created_at_idx`(`shop_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_refund_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `refund_no` VARCHAR(32) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(20) NOT NULL DEFAULT 'REFUND_ONLY',
    `reason` VARCHAR(100) NOT NULL DEFAULT '',
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `admin_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `return_express` VARCHAR(60) NOT NULL DEFAULT '',
    `refund_transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `refunded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mall_refund_orders_refund_no_key`(`refund_no`),
    INDEX `mall_refund_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `mall_refund_orders_order_id_idx`(`order_id`),
    INDEX `mall_refund_orders_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'FULL_REDUCE',
    `value` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `threshold` DECIMAL(18, 2) NOT NULL DEFAULT 0,
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

    INDEX `mall_coupons_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_coupon_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,

    INDEX `mall_coupon_tickets_shop_id_customer_id_status_idx`(`shop_id`, `customer_id`, `status`),
    INDEX `mall_coupon_tickets_coupon_id_customer_id_idx`(`coupon_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mall_diy_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
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

    INDEX `mall_diy_pages_shop_id_type_status_idx`(`shop_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

