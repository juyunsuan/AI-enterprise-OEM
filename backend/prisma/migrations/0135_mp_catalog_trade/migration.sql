-- CreateTable
CREATE TABLE `mp_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(200) NOT NULL,
    `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `detail` MEDIUMTEXT NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `unit` VARCHAR(20) NOT NULL DEFAULT '件',
    `weight` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `freight_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `specs` JSON NOT NULL,
    `guarantee` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `audit_note` VARCHAR(500) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_hot` BOOLEAN NOT NULL DEFAULT false,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_products_market_id_status_sort_order_idx`(`market_id`, `status`, `sort_order`),
    INDEX `mp_products_shop_id_status_sort_order_idx`(`shop_id`, `status`, `sort_order`),
    INDEX `mp_products_merchant_id_idx`(`merchant_id`),
    INDEX `mp_products_market_id_category_id_idx`(`market_id`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_product_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `unique_id` VARCHAR(191) NOT NULL DEFAULT '',
    `spec_values` JSON NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `market_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `weight` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `barcode` VARCHAR(64) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_product_skus_product_id_idx`(`product_id`),
    INDEX `mp_product_skus_shop_id_unique_id_idx`(`shop_id`, `unique_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_product_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
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

    INDEX `mp_product_reviews_market_id_product_id_status_idx`(`market_id`, `product_id`, `status`),
    INDEX `mp_product_reviews_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `mp_product_reviews_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_product_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `snapshot_hash` VARCHAR(64) NOT NULL DEFAULT '',
    `reason` VARCHAR(500) NOT NULL DEFAULT '',
    `submit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audit_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_product_audits_market_id_audit_status_created_at_idx`(`market_id`, `audit_status`, `created_at`),
    INDEX `mp_product_audits_product_id_id_idx`(`product_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `gender` INTEGER NOT NULL DEFAULT 0,
    `level` VARCHAR(30) NOT NULL DEFAULT '',
    `points` INTEGER NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL DEFAULT 'MINIPROGRAM',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_customers_market_id_created_at_idx`(`market_id`, `created_at`),
    UNIQUE INDEX `mp_customers_market_openid_uniq`(`market_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
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

    INDEX `mp_customer_addresses_market_id_customer_id_idx`(`market_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_carts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `selected` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_carts_market_id_customer_id_idx`(`market_id`, `customer_id`),
    UNIQUE INDEX `mp_carts_market_customer_product_sku_uniq`(`market_id`, `customer_id`, `product_id`, `sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    `goods_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `freight_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_type` VARCHAR(16) NOT NULL DEFAULT 'WECHAT',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `shop_order_count` INTEGER NOT NULL DEFAULT 0,
    `receiver_name` VARCHAR(30) NOT NULL DEFAULT '',
    `receiver_phone` VARCHAR(20) NOT NULL DEFAULT '',
    `receiver_province` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_city` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_district` VARCHAR(40) NOT NULL DEFAULT '',
    `receiver_detail` VARCHAR(200) NOT NULL DEFAULT '',
    `buyer_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `expire_at` DATETIME(3) NULL,
    `client_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mp_orders_order_no_key`(`order_no`),
    INDEX `mp_orders_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_orders_market_id_customer_id_id_idx`(`market_id`, `customer_id`, `id`),
    INDEX `mp_orders_market_id_expire_at_idx`(`market_id`, `expire_at`),
    INDEX `mp_orders_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_shop_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `sub_order_no` VARCHAR(32) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    `refund_status` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `goods_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `freight_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
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
    `shipped_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mp_shop_orders_sub_order_no_key`(`sub_order_no`),
    INDEX `mp_shop_orders_order_id_idx`(`order_id`),
    INDEX `mp_shop_orders_market_id_merchant_id_status_created_at_idx`(`market_id`, `merchant_id`, `status`, `created_at`),
    INDEX `mp_shop_orders_market_id_shop_id_status_idx`(`market_id`, `shop_id`, `status`),
    INDEX `mp_shop_orders_customer_id_id_idx`(`customer_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `product_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(200) NOT NULL,
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `total_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refund_status` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `refunded_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_order_items_order_id_idx`(`order_id`),
    INDEX `mp_order_items_shop_order_id_idx`(`shop_order_id`),
    INDEX `mp_order_items_market_id_product_id_idx`(`market_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_order_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL DEFAULT 0,
    `market_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `operator_type` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `action` VARCHAR(40) NOT NULL,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mp_order_logs_order_id_id_idx`(`order_id`, `id`),
    INDEX `mp_order_logs_shop_order_id_id_idx`(`shop_order_id`, `id`),
    INDEX `mp_order_logs_market_id_created_at_idx`(`market_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

