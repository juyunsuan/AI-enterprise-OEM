-- 0116 知识付费小程序工具（工作台 · 私域小程序）：站点/分类/内容/会员/订单/收藏/卡密/轮播/公告/推荐位/发布台账，数据按 site_id 隔离。
-- 0116 知识付费小程序工具（工作台 · 私域小程序）：站点配置/分类/内容/会员/订单/收藏/卡密/轮播/公告/推荐位/发布台账十张表，数据按 site_id 隔离。
-- CreateTable
CREATE TABLE `knowledge_pay_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `site_code` VARCHAR(16) NOT NULL,
    `site_name` VARCHAR(60) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370ff',
    `toggles` JSON NOT NULL,
    `faq` TEXT NOT NULL DEFAULT (''),
    `about` TEXT NOT NULL DEFAULT (''),
    `vip_plans` JSON NOT NULL,
    `sign_rewards` JSON NOT NULL,
    `hot_words` VARCHAR(255) NOT NULL DEFAULT '',
    `more_title` VARCHAR(60) NOT NULL DEFAULT '精选推荐',
    `wx_app_id` VARCHAR(64) NOT NULL DEFAULT '',
    `wx_app_secret` TEXT NOT NULL DEFAULT (''),
    `wx_upload_key` TEXT NOT NULL DEFAULT (''),
    `ad_unit_tab` VARCHAR(64) NOT NULL DEFAULT '',
    `ad_unit_detail` VARCHAR(64) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `knowledge_pay_sites_user_id_key`(`user_id`),
    UNIQUE INDEX `knowledge_pay_sites_site_code_key`(`site_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(60) NOT NULL,
    `cover` VARCHAR(512) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_categories_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_resources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `category_id` INTEGER NOT NULL DEFAULT 0,
    `media_type` VARCHAR(16) NOT NULL DEFAULT 'video',
    `access_mode` VARCHAR(16) NOT NULL DEFAULT 'points',
    `price` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL,
    `cover` VARCHAR(512) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL DEFAULT (''),
    `url` VARCHAR(512) NOT NULL DEFAULT '',
    `hot` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_resources_site_id_status_category_id_idx`(`site_id`, `status`, `category_id`),
    INDEX `knowledge_pay_resources_site_id_hot_status_idx`(`site_id`, `hot`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(512) NOT NULL DEFAULT '',
    `points` INTEGER NOT NULL DEFAULT 0,
    `vip_until` DATETIME(3) NULL,
    `sign_in_streak` INTEGER NOT NULL DEFAULT 0,
    `last_sign_in_date` VARCHAR(8) NOT NULL DEFAULT '',
    `login_count` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_members_site_id_created_at_idx`(`site_id`, `created_at`),
    UNIQUE INDEX `kp_members_site_openid_key`(`site_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `cover` VARCHAR(512) NOT NULL DEFAULT '',
    `url` VARCHAR(512) NOT NULL DEFAULT '',
    `pay_method` VARCHAR(16) NOT NULL DEFAULT 'free',
    `amount` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_orders_site_id_created_at_idx`(`site_id`, `created_at`),
    INDEX `knowledge_pay_orders_site_id_member_id_idx`(`site_id`, `member_id`),
    UNIQUE INDEX `kp_orders_site_member_resource_key`(`site_id`, `member_id`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `cover` VARCHAR(512) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `knowledge_pay_favorites_site_id_member_id_idx`(`site_id`, `member_id`),
    UNIQUE INDEX `kp_favorites_site_member_resource_key`(`site_id`, `member_id`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `resource_id` INTEGER NOT NULL DEFAULT 0,
    `days` INTEGER NOT NULL DEFAULT 0,
    `points` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'unused',
    `used_by` INTEGER NOT NULL DEFAULT 0,
    `used_at` DATETIME(3) NULL,
    `batch_no` VARCHAR(32) NOT NULL DEFAULT '',
    `remark` VARCHAR(120) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_cards_site_id_status_kind_idx`(`site_id`, `status`, `kind`),
    UNIQUE INDEX `kp_cards_site_code_key`(`site_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `image` VARCHAR(512) NOT NULL,
    `link` VARCHAR(512) NOT NULL DEFAULT 'none',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_banners_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `content` TEXT NOT NULL DEFAULT (''),
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_notices_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `summary` VARCHAR(255) NOT NULL DEFAULT '',
    `cover` VARCHAR(512) NOT NULL DEFAULT '',
    `link` VARCHAR(512) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_links_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_pay_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `file_name` VARCHAR(160) NOT NULL DEFAULT '',
    `oss_key` VARCHAR(400) NOT NULL DEFAULT '',
    `file_size` INTEGER NOT NULL DEFAULT 0,
    `sha256` VARCHAR(64) NOT NULL DEFAULT '',
    `upload_message` VARCHAR(500) NOT NULL DEFAULT '',
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_releases_site_id_created_at_idx`(`site_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
