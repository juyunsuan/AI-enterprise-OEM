-- 骑手收款银行卡簿：只存脱敏卡号与哈希，提现时把卡信息快照到申请单。

CREATE TABLE `errand_rider_bank_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `rider_id` INTEGER NOT NULL,
    `holder` VARCHAR(40) NOT NULL,
    `bank_name` VARCHAR(60) NOT NULL,
    `card_no_masked` VARCHAR(32) NOT NULL,
    `card_no_hash` VARCHAR(64) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_rider_bank_cards_site_rider_hash_key`(`site_id`, `rider_id`, `card_no_hash`),
    INDEX `errand_rider_bank_cards_site_id_rider_id_idx`(`site_id`, `rider_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;