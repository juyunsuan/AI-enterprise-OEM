-- 城市代理：下游独立账号，按城市分佣；订单记录代理与佣金快照。

CREATE TABLE `errand_agents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `mobile` VARCHAR(20) NOT NULL,
    `password_hash` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `commission_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.1,
    `city_ids` JSON NOT NULL DEFAULT ('[]'),
    `balance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `frozen` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_income` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_agents_site_id_mobile_key`(`site_id`, `mobile`),
    INDEX `errand_agents_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_agent_txs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `agent_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance_after` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `order_no` VARCHAR(40) NOT NULL DEFAULT '',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `errand_agent_txs_site_id_agent_id_created_at_idx`(`site_id`, `agent_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `errand_agent_withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `agent_id` INTEGER NOT NULL,
    `agent_name` VARCHAR(60) NOT NULL DEFAULT '',
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `bank_info` VARCHAR(200) NOT NULL DEFAULT '',
    `handled_note` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `errand_agent_withdrawals_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `errand_orders`
    ADD COLUMN `agent_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `agent_income_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0;
