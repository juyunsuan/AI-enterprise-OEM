-- 外卖点餐小程序：独立 takeout_* 数据域。
-- 与品牌商城物理隔离：店铺/菜单/顾客/购物车/订单/券各一套表；
-- 复用的只是顾客令牌、微信支付客户端、SCRM 桥与 commerce-core 算价/状态机。

CREATE TABLE `takeout_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `shop_code` VARCHAR(16) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `service_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#E64340',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `trade_json` JSON NOT NULL,
    `takeout_json` JSON NOT NULL,
    `scrm_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `takeout_shops_shop_code_key`(`shop_code`),
    INDEX `takeout_shops_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `takeout_categories_shop_id_sort_order_idx`(`shop_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL,
    `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `detail` MEDIUMTEXT NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `unit` VARCHAR(20) NOT NULL DEFAULT '份',
    `specs` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `is_hot` TINYINT(1) NOT NULL DEFAULT 0,
    `is_new` TINYINT(1) NOT NULL DEFAULT 0,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `takeout_products_shop_id_status_sort_order_idx`(`shop_id`, `status`, `sort_order`),
    INDEX `takeout_products_shop_id_category_id_idx`(`shop_id`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_product_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `unique_id` VARCHAR(191) NOT NULL DEFAULT '',
    `spec_values` JSON NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `takeout_product_skus_product_id_idx`(`product_id`),
    INDEX `takeout_product_skus_shop_id_unique_id_idx`(`shop_id`, `unique_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `points` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL DEFAULT 'MINIPROGRAM',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `takeout_customers_shop_openid_uniq`(`shop_id`, `openid`),
    INDEX `takeout_customers_shop_id_phone_idx`(`shop_id`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `real_name` VARCHAR(30) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `detail` VARCHAR(200) NOT NULL,
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `tag` VARCHAR(10) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `takeout_customer_addresses_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_customer_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `points_after` INTEGER NOT NULL DEFAULT 0,
    `related_type` VARCHAR(20) NOT NULL DEFAULT '',
    `related_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `takeout_customer_bills_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_cart_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `selected` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `takeout_cart_items_shop_customer_sku_uniq`(`shop_id`, `customer_id`, `sku_id`),
    INDEX `takeout_cart_items_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `value` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `threshold` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_count` INTEGER NOT NULL DEFAULT 100,
    `received_count` INTEGER NOT NULL DEFAULT 0,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `per_limit` INTEGER NOT NULL DEFAULT 1,
    `valid_type` VARCHAR(8) NOT NULL DEFAULT 'FIXED',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `valid_days` INTEGER NOT NULL DEFAULT 7,
    `scope` VARCHAR(16) NOT NULL DEFAULT 'ALL',
    `scope_ids` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `takeout_coupons_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_coupon_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `coupon_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNUSED',
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    INDEX `takeout_coupon_tickets_shop_id_customer_id_status_idx`(`shop_id`, `customer_id`, `status`),
    INDEX `takeout_coupon_tickets_coupon_id_idx`(`coupon_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    `order_mode` VARCHAR(16) NOT NULL DEFAULT 'DELIVERY',
    `table_no` VARCHAR(20) NOT NULL DEFAULT '',
    `pickup_code` VARCHAR(12) NOT NULL DEFAULT '',
    `expected_at` DATETIME(3) NULL,
    `goods_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `delivery_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
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
    `cancel_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `shipped_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `client_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `takeout_orders_order_no_key`(`order_no`),
    INDEX `takeout_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `takeout_orders_shop_id_customer_id_id_idx`(`shop_id`, `customer_id`, `id`),
    INDEX `takeout_orders_shop_id_expire_at_idx`(`shop_id`, `expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_order_items` (
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
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `takeout_order_items_order_id_idx`(`order_id`),
    INDEX `takeout_order_items_shop_id_product_id_idx`(`shop_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_order_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `operator_type` VARCHAR(16) NOT NULL,
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `action` VARCHAR(40) NOT NULL,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `takeout_order_logs_order_id_id_idx`(`order_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `takeout_scrm_outbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    UNIQUE INDEX `takeout_scrm_outbox_dedupe_key_key`(`dedupe_key`),
    INDEX `takeout_scrm_outbox_status_next_retry_at_idx`(`status`, `next_retry_at`),
    INDEX `takeout_scrm_outbox_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 启动设置价目行：默认免费，平台管理员可在价目表改口径后按周期计费。
INSERT IGNORE INTO `module_pricing`
    (`code`, `mode`, `unit`, `unit_price_amount`, `free_quota_amount`, `billing_cycle`)
VALUES
    ('takeout', 'FREE', 'store_month', 0, 1, 'FREE');