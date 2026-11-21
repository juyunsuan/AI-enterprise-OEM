-- 0137 快递寄件：一个账号一部小程序、站点＝寄件点、收款账户企业级、站点数量放开。
-- 0129 建立时是「一站点一主体 + 平台配额 + 平台停服」，0129 尚未提交、线上仅有 1 个测试站点与预置报价，
-- 因此在同一张表上原地改结构，不做数据搬迁。
-- 变更点：
--   1) kuaidi_sites 增加寄件点位置与共用收款账户；删除平台停服留痕（平台不再参与站点处置）。
--   2) 新增 kuaidi_pay_accounts：企业级收款账户，多个寄件点共用。
--   3) kuaidi_orders 记录收款账户，并把订单号改为全表唯一（账号级回调按单号定位）。

-- AlterTable
ALTER TABLE `kuaidi_sites`
    ADD COLUMN `province` VARCHAR(40) NOT NULL DEFAULT '',
    ADD COLUMN `city` VARCHAR(40) NOT NULL DEFAULT '',
    ADD COLUMN `district` VARCHAR(40) NOT NULL DEFAULT '',
    ADD COLUMN `address_line` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `lng` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `lat` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `business_hours` VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN `phone` VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN `pickup_note` VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN `pay_account_id` INTEGER NOT NULL DEFAULT 0,
    DROP COLUMN `off_by`,
    DROP COLUMN `off_reason`;

-- CreateTable
CREATE TABLE `kuaidi_pay_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(80) NOT NULL,
    `mch_id` VARCHAR(64) NOT NULL,
    `pay_api_v3_key_cipher` TEXT NOT NULL DEFAULT (''),
    `cert_serial` VARCHAR(128) NOT NULL DEFAULT '',
    `private_key_cipher` TEXT NOT NULL DEFAULT (''),
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kuaidi_pay_accounts_owner_mch_key`(`owner_user_id`, `mch_id`),
    INDEX `kuaidi_pay_accounts_owner_enabled_idx`(`owner_user_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `kuaidi_orders`
    ADD COLUMN `pay_account_id` INTEGER NOT NULL DEFAULT 0,
    DROP INDEX `kuaidi_orders_site_order_no_key`,
    ADD UNIQUE INDEX `kuaidi_orders_order_no_key`(`order_no`);
