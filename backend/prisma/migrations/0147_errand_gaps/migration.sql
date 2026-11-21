-- 跑腿补齐：地图距离、骑手定位/自动派单、转单/弃单、帮买实付、评价、优惠券增强。
-- 全部为增量列，不改变既有订单/骑手/优惠券的语义。

ALTER TABLE `errand_rules`
    ADD COLUMN `accept_radius_km` DECIMAL(10, 2) NOT NULL DEFAULT 5 COMMENT '抢单/自动派单半径（公里），0=不限',
    ADD COLUMN `auto_dispatch` BOOLEAN NOT NULL DEFAULT false COMMENT '支付后自动派给最近在线骑手',
    ADD COLUMN `rider_share_rate` DECIMAL(5, 4) NOT NULL DEFAULT 1 COMMENT '骑手劳务分成比例（小费全额）';

ALTER TABLE `errand_riders`
    ADD COLUMN `lng` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `lat` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `last_located_at` DATETIME(3) NULL;

ALTER TABLE `errand_orders`
    ADD COLUMN `rider_income_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0 COMMENT '完成时快照的骑手劳务收入',
    ADD COLUMN `purchase_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0 COMMENT '帮买实际采购金额',
    ADD COLUMN `purchase_receipt` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '帮买小票图片',
    ADD COLUMN `purchase_note` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '帮买采购备注',
    ADD COLUMN `change_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0 COMMENT '应退顾客差额',
    ADD COLUMN `extra_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0 COMMENT '需顾客补收差额',
    ADD COLUMN `rating` INTEGER NOT NULL DEFAULT 0 COMMENT '顾客评价 1-5，0=未评',
    ADD COLUMN `rating_comment` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '评价内容',
    ADD COLUMN `rated_at` DATETIME(3) NULL;

ALTER TABLE `errand_coupons`
    ADD COLUMN `service_types` JSON NOT NULL DEFAULT ('[]') COMMENT '适用服务类型，[]=全部',
    ADD COLUMN `first_order_only` BOOLEAN NOT NULL DEFAULT false COMMENT '仅限首单顾客',
    ADD COLUMN `auto_issue` BOOLEAN NOT NULL DEFAULT false COMMENT '首次登录自动发券';