-- 建站工具「启动设置」与周期计费底座。
-- 一个账号 × 一个建站工具一条订阅：未启动＝C 端停服 + 禁止出包/直传 + 管理端写操作禁用，且不扣积分；
-- 启动即预付首期，到期由日批续扣，欠费超宽限自动停服、补扣后自动复活，数据一律不删。
-- 设计见 docs/建站工具启动设置与计费口径设计方案.md。

-- AlterTable: 价目表增加「启动计费口径」维度（老行默认空串＝沿用原 METERED 用量语义，不影响既有模块）
ALTER TABLE `module_pricing`
    ADD COLUMN `billing_cycle` VARCHAR(16) NOT NULL DEFAULT '' COMMENT 'FREE|DAY|DAY30|YEAR|USAGE_PV|USAGE_BYTES，空＝沿用用量计费',
    ADD COLUMN `usage_unit_size` INTEGER NOT NULL DEFAULT 1 COMMENT '按量口径的计量粒度（每 1000 次访问＝1000）',
    ADD COLUMN `launch_enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否允许用户在启动设置页自行启动';

-- CreateTable
CREATE TABLE `tool_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `tool_code` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'STOPPED',
    `stop_reason` VARCHAR(16) NOT NULL DEFAULT '',
    `started_at` DATETIME(3) NULL,
    `stopped_at` DATETIME(3) NULL,
    `trial_ends_at` DATETIME(3) NULL,
    `cycle_days` INTEGER NOT NULL DEFAULT 30,
    `unit_price_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `period_start` DATETIME(3) NULL,
    `period_end` DATETIME(3) NULL,
    `billed_periods` INTEGER NOT NULL DEFAULT 0,
    `arrears_since` DATETIME(3) NULL,
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tool_subscriptions_user_id_tool_code_key`(`user_id`, `tool_code`),
    INDEX `tool_subscriptions_status_period_end_idx`(`status`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tool_subscription_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `tool_code` VARCHAR(32) NOT NULL,
    `period_key` VARCHAR(32) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 0,
    `billing_mode` VARCHAR(16) NOT NULL DEFAULT 'PERIOD',
    `quantity_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `unit` VARCHAR(32) NOT NULL DEFAULT '',
    `points_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'CHARGED',
    `tx_id` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tool_subscription_bills_subscription_id_period_key_key`(`subscription_id`, `period_key`),
    INDEX `tool_subscription_bills_status_created_at_idx`(`status`, `created_at`),
    INDEX `tool_subscription_bills_user_id_tool_code_created_at_idx`(`user_id`, `tool_code`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tool_usage_daily` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `tool_code` VARCHAR(32) NOT NULL,
    `day` DATE NOT NULL,
    `pv` INTEGER NOT NULL DEFAULT 0,
    `bytes` BIGINT NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tool_usage_daily_user_id_tool_code_day_key`(`user_id`, `tool_code`, `day`),
    INDEX `tool_usage_daily_tool_code_day_idx`(`tool_code`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
