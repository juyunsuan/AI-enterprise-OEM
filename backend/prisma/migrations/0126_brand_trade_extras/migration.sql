-- 0126 品牌商城 v8 补齐：运费模板（模板 + 规则 2 表）、商品参数、退款副作用幂等台账。
-- 设计见 docs/品牌商城与多店铺商城平台设计方案.md §5.1。
-- freight_template_id 为 0 时回落店铺 tradeJson 的统一运费；不做外键，模板删除后按 0 兜底。

-- AlterTable
ALTER TABLE `brand_products` ADD COLUMN `freight_template_id` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `brand_shipping_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `brand_shipping_templates_shop_id_is_default_idx`(`shop_id`, `is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand_shipping_template_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `regions` JSON NOT NULL,
    `first_piece` INTEGER NOT NULL DEFAULT 1,
    `first_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `additional_piece` INTEGER NOT NULL DEFAULT 0,
    `additional_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `free_piece` INTEGER NOT NULL DEFAULT 0,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `brand_shipping_template_rules_template_id_sort_order_idx`(`template_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand_product_params` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `params` JSON NOT NULL,
    `protection` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `brand_product_params_shop_id_idx`(`shop_id`),
    UNIQUE INDEX `brand_product_params_product_id_key`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand_refund_effects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `refund_id` INTEGER NOT NULL,
    `effect` VARCHAR(24) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `detail` JSON NOT NULL,
    `error` VARCHAR(200) NOT NULL DEFAULT '',
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `brand_refund_effects_shop_id_status_idx`(`shop_id`, `status`),
    UNIQUE INDEX `brand_refund_effects_refund_id_effect_key`(`refund_id`, `effect`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 既有商品的保障标签迁到参数表，避免新详情页读不到历史数据。
INSERT INTO `brand_product_params` (`shop_id`, `product_id`, `params`, `protection`, `created_at`, `updated_at`)
SELECT `shop_id`, `id`, JSON_ARRAY(), `guarantee`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `brand_products`
WHERE JSON_LENGTH(`guarantee`) > 0;
