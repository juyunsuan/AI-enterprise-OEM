-- 骑手提现支持微信商家转账：记录打款方式、批次号与提交状态。

ALTER TABLE `errand_withdrawals`
    ADD COLUMN `method` VARCHAR(8) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `transfer_batch_id` VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN `transfer_state` VARCHAR(24) NOT NULL DEFAULT 'NONE',
    ADD COLUMN `transferred_at` DATETIME(3) NULL;
