-- 帮买超出预估时的线上补款：单独补款单 EX<订单号>，回调只标记补款完成，不改原订单金额。

ALTER TABLE `errand_orders`
    ADD COLUMN `extra_paid_at` DATETIME(3) NULL COMMENT '帮买补款完成时间';
