-- 0099 GEO 独立站升级为站点 CMS（多页面 + 菜单 + 内容库 + 发布台账）：
-- 页面表承载站内多页与页面级脚本；菜单表承载 HEADER/FOOTER 两级导航；文章/产品表为内容库，
-- 正文统一存元素树以复用既有转义与样式白名单渲染管线。JSON 列沿用 0001_init 写法（不带 DEFAULT，
-- 由 Prisma 客户端补 @default("[]") / @default("{}")）。
-- 存量站点不搬数据：首页页面行由服务层 ensurePages() 懒建，无页面行时渲染回落 geo_sites.content。
ALTER TABLE `geo_sites`
    ADD COLUMN `published_menus` JSON NULL,
    ADD COLUMN `scripts_enabled` TINYINT NOT NULL DEFAULT 1;

CREATE TABLE `geo_site_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(24) NOT NULL DEFAULT 'custom',
    `is_home` TINYINT NOT NULL DEFAULT 0,
    `content_type` VARCHAR(16) NOT NULL DEFAULT '',
    `page_size` INTEGER NOT NULL DEFAULT 9,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `content` JSON NOT NULL,
    `seo` JSON NOT NULL,
    `scripts` JSON NOT NULL,
    `published_content` JSON NULL,
    `published_seo` JSON NULL,
    `published_scripts` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_site_pages_site_path_uniq`(`site_id`, `path`),
    INDEX `geo_site_pages_owner_user_id_idx`(`owner_user_id`),
    INDEX `geo_site_pages_site_id_sort_idx`(`site_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_menu_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `location` VARCHAR(16) NOT NULL DEFAULT 'HEADER',
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `label` VARCHAR(60) NOT NULL,
    `target_type` VARCHAR(16) NOT NULL DEFAULT 'PAGE',
    `target_id` INTEGER NOT NULL DEFAULT 0,
    `url` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `visible` TINYINT NOT NULL DEFAULT 1,
    `open_new_tab` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `geo_site_menu_items_site_id_location_sort_idx`(`site_id`, `location`, `sort`),
    INDEX `geo_site_menu_items_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_articles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `body` JSON NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `gallery` JSON NOT NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT '',
    `tags` JSON NOT NULL,
    `author_name` VARCHAR(60) NOT NULL DEFAULT '',
    `faqs` JSON NOT NULL,
    `related_ids` JSON NOT NULL,
    `seo` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `published_at` DATETIME(3) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_site_articles_site_slug_uniq`(`site_id`, `slug`),
    INDEX `geo_site_articles_site_id_status_published_at_idx`(`site_id`, `status`, `published_at`),
    INDEX `geo_site_articles_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `body` JSON NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `gallery` JSON NOT NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT '',
    `tags` JSON NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `unit` VARCHAR(20) NOT NULL DEFAULT '',
    `price_on_ask` TINYINT NOT NULL DEFAULT 0,
    `specs` JSON NOT NULL,
    `buy_url` VARCHAR(500) NOT NULL DEFAULT '',
    `faqs` JSON NOT NULL,
    `seo` JSON NOT NULL,
    `featured` TINYINT NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `published_at` DATETIME(3) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_site_products_site_slug_uniq`(`site_id`, `slug`),
    INDEX `geo_site_products_site_id_status_published_at_idx`(`site_id`, `status`, `published_at`),
    INDEX `geo_site_products_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_publish_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `target_kind` VARCHAR(16) NOT NULL,
    `target_id` INTEGER NOT NULL DEFAULT 0,
    `label` VARCHAR(200) NOT NULL DEFAULT '',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `operator` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `geo_site_publish_logs_site_id_created_at_idx`(`site_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
