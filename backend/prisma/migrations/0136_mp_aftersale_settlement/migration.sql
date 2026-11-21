-- CreateTable
CREATE TABLE `mp_after_sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `after_sale_no` VARCHAR(32) NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'REFUND_ONLY',
    `reason` VARCHAR(100) NOT NULL DEFAULT '',
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `merchant_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `platform_note` VARCHAR(200) NOT NULL DEFAULT '',
    `return_express` VARCHAR(60) NOT NULL DEFAULT '',
    `return_express_no` VARCHAR(60) NOT NULL DEFAULT '',
    `refund_id` INTEGER NOT NULL DEFAULT 0,
    `audited_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_after_sales_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_after_sales_merchant_id_status_created_at_idx`(`merchant_id`, `status`, `created_at`),
    INDEX `mp_after_sales_shop_id_status_idx`(`shop_id`, `status`),
    INDEX `mp_after_sales_shop_order_id_idx`(`shop_order_id`),
    INDEX `mp_after_sales_customer_id_id_idx`(`customer_id`, `id`),
    UNIQUE INDEX `mp_after_sales_after_sale_no_key`(`after_sale_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_after_sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `after_sale_id` INTEGER NOT NULL,
    `market_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL DEFAULT 0,
    `sku_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(200) NOT NULL DEFAULT '',
    `sku_name` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mp_after_sale_items_shop_order_id_idx`(`shop_order_id`),
    UNIQUE INDEX `mp_after_sale_items_after_sale_id_order_item_id_key`(`after_sale_id`, `order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_refunds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `refund_no` VARCHAR(32) NOT NULL,
    `after_sale_id` INTEGER NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `channel` VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `error` VARCHAR(200) NOT NULL DEFAULT '',
    `operator_type` VARCHAR(16) NOT NULL DEFAULT 'MERCHANT',
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `refunded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_refunds_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_refunds_merchant_id_status_idx`(`merchant_id`, `status`),
    INDEX `mp_refunds_shop_order_id_idx`(`shop_order_id`),
    INDEX `mp_refunds_after_sale_id_idx`(`after_sale_id`),
    UNIQUE INDEX `mp_refunds_refund_no_key`(`refund_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_refund_effects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `refund_id` INTEGER NOT NULL,
    `effect` VARCHAR(24) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `detail` JSON NOT NULL,
    `error` VARCHAR(200) NOT NULL DEFAULT '',
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_refund_effects_market_id_status_idx`(`market_id`, `status`),
    UNIQUE INDEX `mp_refund_effects_refund_id_effect_key`(`refund_id`, `effect`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_pay_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `sub_order_no` VARCHAR(32) NOT NULL DEFAULT '',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `pay_type` VARCHAR(16) NOT NULL DEFAULT 'WECHAT',
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PAID',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_pay_records_market_id_paid_at_idx`(`market_id`, `paid_at`),
    UNIQUE INDEX `mp_pay_records_shop_order_id_key`(`shop_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_commission_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `scope_type` VARCHAR(16) NOT NULL,
    `scope_id` INTEGER NOT NULL DEFAULT 0,
    `rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_commission_rules_market_id_status_idx`(`market_id`, `status`),
    UNIQUE INDEX `mp_commission_rules_market_id_scope_type_scope_id_key`(`market_id`, `scope_type`, `scope_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `settle_no` VARCHAR(32) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `gross_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refund_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `net_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `voucher` VARCHAR(500) NOT NULL DEFAULT '',
    `confirmed_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_settlements_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_settlements_merchant_id_status_idx`(`merchant_id`, `status`),
    INDEX `mp_settlements_market_id_shop_id_created_at_idx`(`market_id`, `shop_id`, `created_at`),
    UNIQUE INDEX `mp_settlements_settle_no_key`(`settle_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_settlement_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `shop_order_id` INTEGER NOT NULL,
    `sub_order_no` VARCHAR(32) NOT NULL DEFAULT '',
    `completed_at` DATETIME(3) NULL,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refund_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `commission_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `net_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mp_settlement_items_settlement_id_idx`(`settlement_id`),
    INDEX `mp_settlement_items_market_id_merchant_id_id_idx`(`market_id`, `merchant_id`, `id`),
    UNIQUE INDEX `mp_settlement_items_shop_order_id_key`(`shop_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mp_withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `market_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `withdraw_no` VARCHAR(32) NOT NULL,
    `apply_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `actual_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `bank_name` VARCHAR(60) NOT NULL DEFAULT '',
    `bank_account` VARCHAR(64) NOT NULL DEFAULT '',
    `account_name` VARCHAR(60) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_note` VARCHAR(200) NOT NULL DEFAULT '',
    `voucher` VARCHAR(500) NOT NULL DEFAULT '',
    `audited_at` DATETIME(3) NULL,
    `audited_by` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mp_withdrawals_market_id_status_created_at_idx`(`market_id`, `status`, `created_at`),
    INDEX `mp_withdrawals_merchant_id_status_idx`(`merchant_id`, `status`),
    UNIQUE INDEX `mp_withdrawals_withdraw_no_key`(`withdraw_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
