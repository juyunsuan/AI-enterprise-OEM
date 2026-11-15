-- 0104 国际独立站多语言：
-- 站点记录默认语言与已启用语言；页面/文章/产品/菜单按语言各存一份，
-- 存量内容统一回填为 zh-CN（当时的默认语言），非默认语言在公开地址上加语言前缀。
-- 唯一键从「站点内唯一」改为「站点 + 语言内唯一」，同一个 path / slug 才能多语言并存。

ALTER TABLE `geo_sites`
    ADD COLUMN `default_language` VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
    ADD COLUMN `languages` JSON NULL;

UPDATE `geo_sites` SET `languages` = JSON_ARRAY('zh-CN') WHERE `languages` IS NULL;

ALTER TABLE `geo_sites` MODIFY COLUMN `languages` JSON NOT NULL;

ALTER TABLE `geo_site_pages`
    ADD COLUMN `lang` VARCHAR(16) NOT NULL DEFAULT '';

UPDATE `geo_site_pages` SET `lang` = 'zh-CN' WHERE `lang` = '';

ALTER TABLE `geo_site_pages`
    DROP INDEX `geo_site_pages_site_path_uniq`,
    ADD UNIQUE INDEX `geo_site_pages_site_lang_path_uniq`(`site_id`, `lang`, `path`),
    DROP INDEX `geo_site_pages_site_id_sort_idx`,
    ADD INDEX `geo_site_pages_site_id_lang_sort_idx`(`site_id`, `lang`, `sort`);

ALTER TABLE `geo_site_articles`
    ADD COLUMN `lang` VARCHAR(16) NOT NULL DEFAULT '';

UPDATE `geo_site_articles` SET `lang` = 'zh-CN' WHERE `lang` = '';

ALTER TABLE `geo_site_articles`
    DROP INDEX `geo_site_articles_site_slug_uniq`,
    ADD UNIQUE INDEX `geo_site_articles_site_lang_slug_uniq`(`site_id`, `lang`, `slug`),
    DROP INDEX `geo_site_articles_site_id_status_published_at_idx`,
    ADD INDEX `geo_site_articles_site_id_lang_status_published_at_idx`(`site_id`, `lang`, `status`, `published_at`);

ALTER TABLE `geo_site_products`
    ADD COLUMN `lang` VARCHAR(16) NOT NULL DEFAULT '';

UPDATE `geo_site_products` SET `lang` = 'zh-CN' WHERE `lang` = '';

ALTER TABLE `geo_site_products`
    DROP INDEX `geo_site_products_site_slug_uniq`,
    ADD UNIQUE INDEX `geo_site_products_site_lang_slug_uniq`(`site_id`, `lang`, `slug`),
    DROP INDEX `geo_site_products_site_id_status_published_at_idx`,
    ADD INDEX `geo_site_products_site_id_lang_status_published_at_idx`(`site_id`, `lang`, `status`, `published_at`);

ALTER TABLE `geo_site_menu_items`
    ADD COLUMN `lang` VARCHAR(16) NOT NULL DEFAULT '';

UPDATE `geo_site_menu_items` SET `lang` = 'zh-CN' WHERE `lang` = '';

ALTER TABLE `geo_site_menu_items`
    DROP INDEX `geo_site_menu_items_site_id_location_sort_idx`,
    ADD INDEX `geo_site_menu_items_site_id_lang_location_sort_idx`(`site_id`, `lang`, `location`, `sort`);
