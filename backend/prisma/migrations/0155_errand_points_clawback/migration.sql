-- 订单完成返积分快照：已完成订单退款时按快照回冲。

ALTER TABLE `errand_orders`
    ADD COLUMN `points_earned` INTEGER NOT NULL DEFAULT 0 COMMENT '完成时返给顾客的积分';
