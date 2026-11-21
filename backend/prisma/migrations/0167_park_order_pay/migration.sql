-- 园区订单微信支付：预下单号与微信交易号；线下收款保持空串。

ALTER TABLE `park_orders`
    ADD COLUMN `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN `transaction_id` VARCHAR(64) NOT NULL DEFAULT '';
