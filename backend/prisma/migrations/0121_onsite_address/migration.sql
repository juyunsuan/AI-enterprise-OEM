-- 0121 上门服务顾客地址簿（P1 补表）：下单算车费要按地址城市命中规则，缺这张表订单服务无法算距。

-- CreateTable
CREATE TABLE `onsite_customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `contact_name` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL,
    `province` VARCHAR(60) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `district` VARCHAR(60) NOT NULL DEFAULT '',
    `detail` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `tag` VARCHAR(20) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_top` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `onsite_customer_addresses_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

