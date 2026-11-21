-- 健康管理小程序·舌象分析增值服务：店铺级开关与视觉模型配置 + 分析记录。
-- 原图先进数字资产台账，记录只存引用与结构化结论。

ALTER TABLE `health_shops`
    ADD COLUMN `tongue_ai_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `tongue_ai_channel_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `tongue_ai_model` VARCHAR(128) NOT NULL DEFAULT '';

CREATE TABLE `health_tongue_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `image_key` VARCHAR(500) NOT NULL,
    `image_url` VARCHAR(800) NOT NULL,
    `quality` VARCHAR(8) NOT NULL DEFAULT 'GOOD',
    `tongue_color` VARCHAR(40) NOT NULL DEFAULT '',
    `coating_color` VARCHAR(40) NOT NULL DEFAULT '',
    `tongue_shape` VARCHAR(60) NOT NULL DEFAULT '',
    `constitution` VARCHAR(100) NOT NULL DEFAULT '',
    `interpretation` TEXT NOT NULL,
    `suggestions_json` JSON NOT NULL,
    `cautions_json` JSON NOT NULL,
    `confidence` INTEGER NOT NULL DEFAULT 0,
    `model` VARCHAR(128) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_tongue_records_shop_id_created_at_idx`(`shop_id`, `created_at`),
    INDEX `health_tongue_records_customer_id_created_at_idx`(`customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
