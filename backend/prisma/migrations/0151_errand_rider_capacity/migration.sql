-- 每城可配置骑手同时在途单上限，自动派单与人工指派共用。

ALTER TABLE `errand_rules`
    ADD COLUMN `max_active_orders` INTEGER NOT NULL DEFAULT 3 COMMENT '每名骑手同时在途单上限';
