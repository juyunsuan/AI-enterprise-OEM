-- 跑腿多城市：同一平台账号（站点）下可开多个服务城市，各城市独立计价、骑手与订单。
-- 不新增任何账号体系：骑手/顾客仍是小程序微信身份，城市只是站点下的业务分区。

CREATE TABLE `errand_cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `address_line` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DOUBLE NOT NULL DEFAULT 0,
    `lat` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_cities_site_id_name_key`(`site_id`, `name`),
    INDEX `errand_cities_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 存量站点先各生成一个默认城市，承接原来的站点地址与计价规则。
INSERT INTO `errand_cities`
    (`site_id`, `name`, `province`, `city`, `district`, `address_line`, `lng`, `lat`, `status`, `sort`, `created_at`, `updated_at`)
SELECT
    s.`id`,
    IF(s.`city` <> '', CONCAT(s.`city`, IF(s.`district` <> '', CONCAT('·', s.`district`), '')), s.`name`),
    s.`province`, s.`city`, s.`district`, s.`address_line`, s.`lng`, s.`lat`, 'ENABLED', 0, NOW(3), NOW(3)
FROM `errand_sites` s;

ALTER TABLE `errand_rules`
    ADD COLUMN `city_id` INTEGER NOT NULL DEFAULT 0;

UPDATE `errand_rules` r
JOIN `errand_cities` c ON c.`site_id` = r.`site_id`
SET r.`city_id` = c.`id`
WHERE r.`city_id` = 0;

ALTER TABLE `errand_rules`
    DROP INDEX `errand_rules_site_id_key`,
    ADD UNIQUE INDEX `errand_rules_city_id_key`(`city_id`),
    ADD INDEX `errand_rules_site_id_idx`(`site_id`);

ALTER TABLE `errand_orders`
    ADD COLUMN `city_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `city_name` VARCHAR(60) NOT NULL DEFAULT '';

UPDATE `errand_orders` o
JOIN `errand_cities` c ON c.`site_id` = o.`site_id`
SET o.`city_id` = c.`id`, o.`city_name` = c.`name`
WHERE o.`city_id` = 0;

ALTER TABLE `errand_orders`
    ADD INDEX `errand_orders_site_id_city_id_status_created_at_idx`(`site_id`, `city_id`, `status`, `created_at`);

ALTER TABLE `errand_riders`
    ADD COLUMN `city_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `city_name` VARCHAR(60) NOT NULL DEFAULT '';

UPDATE `errand_riders` r
JOIN `errand_cities` c ON c.`site_id` = r.`site_id`
SET r.`city_id` = c.`id`, r.`city_name` = c.`name`
WHERE r.`city_id` = 0;

ALTER TABLE `errand_riders`
    ADD INDEX `errand_riders_site_id_city_id_status_online_idx`(`site_id`, `city_id`, `status`, `online`);

ALTER TABLE `errand_coupons`
    ADD COLUMN `city_id` INTEGER NOT NULL DEFAULT 0 COMMENT '0=全站通用';

ALTER TABLE `errand_coupons`
    ADD INDEX `errand_coupons_site_id_city_id_enabled_idx`(`site_id`, `city_id`, `enabled`);