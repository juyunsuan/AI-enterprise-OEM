-- 顾客积分：城市规则配置返积分/抵扣比例，订单记录抵扣，流水可审计。

ALTER TABLE `errand_rules`
    ADD COLUMN `points_earn_rate` DECIMAL(10, 2) NOT NULL DEFAULT 1 COMMENT '每消费1元返积分',
    ADD COLUMN `points_deduct_rate` DECIMAL(10, 2) NOT NULL DEFAULT 100 COMMENT '多少积分抵1元',
    ADD COLUMN `max_points_discount_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.2 COMMENT '单笔最多抵扣服务费比例';

ALTER TABLE `errand_orders`
    ADD COLUMN `points_used` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `points_discount` DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE `errand_customers`
    ADD COLUMN `points` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `errand_point_txs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `points` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `order_no` VARCHAR(40) NOT NULL DEFAULT '',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `errand_point_txs_site_id_customer_id_created_at_idx`(`site_id`, `customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
