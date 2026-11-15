-- 0097 GEO 独立站建站器（docs/GEO独立站建站与域名绑定设计方案.md §四）：
-- 站点主表存元素树草稿与发布快照；域名表承载用户自助绑定与校验状态；账单表用 (site_id, period_month)
-- 唯一键把「一站一月一账单」钉死，日批重跑不会重复扣费。JSON 列沿用 0001_init 写法（不带 DEFAULT，
-- 由 Prisma 客户端补 @default("[]") / @default("{}")）。
CREATE TABLE `geo_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `geo_project_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(63) NOT NULL,
    `content` JSON NOT NULL,
    `seo` JSON NOT NULL,
    `favicon` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `published_content` JSON NULL,
    `published_seo` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `billing_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_sites_slug_key`(`slug`),
    INDEX `geo_sites_owner_user_id_idx`(`owner_user_id`),
    INDEX `geo_sites_enterprise_id_idx`(`enterprise_id`),
    INDEX `geo_sites_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_domains` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `domain` VARCHAR(253) NOT NULL,
    `verify_token` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `is_primary` TINYINT NOT NULL DEFAULT 0,
    `last_check_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_site_domains_domain_key`(`domain`),
    INDEX `geo_site_domains_site_id_idx`(`site_id`),
    INDEX `geo_site_domains_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_site_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `period_month` VARCHAR(7) NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 0,
    `points_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'CHARGED',
    `tx_id` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `geo_site_bills_site_period_uniq`(`site_id`, `period_month`),
    INDEX `geo_site_bills_owner_user_id_period_month_idx`(`owner_user_id`, `period_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- GEO 独立站月费：单价＝积分/站·月，免费额＝每月免费站点数；管理员在「积分中心 → 价目与用量」直接改。
INSERT IGNORE INTO `module_pricing`
    (`code`, `mode`, `unit`, `unit_price_amount`, `free_quota_amount`, `min_charge_amount`, `enabled`)
VALUES
    ('geo_site', 'METERED', 'site_month', 50, 1, 1, 1);
