-- 100 GEO 建站 · 模板库：另存的整页模板与可复用区块共用一张表，content 存顶层元素数组
-- （与 geo_site_pages.content 同构，套用前同样过 assertElementTree 白名单）。
-- 发布台账 geo_site_publish_logs 已在 0099 建表，本迁移只补模板表。
CREATE TABLE `geo_site_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'BLOCK',
    `name` VARCHAR(60) NOT NULL,
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `content` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `geo_site_templates_site_id_kind_id_idx`(`site_id`, `kind`, `id`),
    INDEX `geo_site_templates_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
