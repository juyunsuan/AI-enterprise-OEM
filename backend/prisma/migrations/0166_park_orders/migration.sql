-- 园区订单：场地预约费用先落地，支付方式支持线下收款；微信支付适配器后续接入。

ALTER TABLE `park_resources`
    ADD COLUMN `fee_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE `park_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(32) NOT NULL,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL DEFAULT 0,
    `biz_type` VARCHAR(24) NOT NULL DEFAULT 'VENUE',
    `biz_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(160) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `pay_method` VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    `paid_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_orders_order_no_key`(`order_no`),
    INDEX `park_orders_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `park_orders_site_id_customer_id_idx`(`site_id`, `customer_id`),
    INDEX `park_orders_site_id_biz_type_biz_id_idx`(`site_id`, `biz_type`, `biz_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
