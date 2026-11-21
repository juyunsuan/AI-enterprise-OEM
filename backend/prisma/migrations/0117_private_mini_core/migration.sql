-- 0117 私域小程序底座 + 上门服务小程序工具 P0
-- （docs/私域小程序·上门服务小程序工具设计方案.md §四 4.1「租户与发布」)：
-- 按租户归属的小程序主体（AppID / 上传密钥 / 微信商户号，凭据全部密文列）、
-- 租户出包台账（平台版 miniprogram_releases 不动）、上门服务店铺实例与 C 端顾客。
-- 顾客与站内 User 物理隔离：openId 只在 (scene, shopId) 命名空间内唯一。
-- 0116 已被在途的 knowledge_pay 占用，本批从 0117 起。

-- CreateTable
CREATE TABLE `miniprogram_apps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `scene` VARCHAR(16) NOT NULL,
    `shop_id` INTEGER NOT NULL DEFAULT 0,
    `app_id` VARCHAR(64) NOT NULL,
    `app_secret_cipher` TEXT NOT NULL,
    `upload_key_cipher` TEXT NOT NULL,
    `robot` TINYINT NOT NULL DEFAULT 1,
    `mch_id` VARCHAR(64) NOT NULL DEFAULT '',
    `pay_api_v3_key_cipher` TEXT NOT NULL,
    `pay_cert_serial` VARCHAR(128) NOT NULL DEFAULT '',
    `pay_private_key_cipher` TEXT NOT NULL,
    `pay_enabled` TINYINT NOT NULL DEFAULT 0,
    `map_key_cipher` TEXT NOT NULL,
    `templates` JSON NOT NULL,
    `qrcode_url` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED',
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `miniprogram_apps_app_id_key`(`app_id`),
    UNIQUE INDEX `miniprogram_apps_scene_shop_id_key`(`scene`, `shop_id`),
    INDEX `miniprogram_apps_owner_user_id_scene_idx`(`owner_user_id`, `scene`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `miniprogram_tenant_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `scene` VARCHAR(16) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `channel` VARCHAR(8) NOT NULL DEFAULT 'STABLE',
    `file_name` VARCHAR(160) NOT NULL DEFAULT '',
    `file_size` INTEGER NOT NULL DEFAULT 0,
    `oss_key` VARCHAR(400) NOT NULL DEFAULT '',
    `sha256` VARCHAR(64) NOT NULL DEFAULT '',
    `changelog` VARCHAR(1000) NOT NULL DEFAULT '',
    `upload_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    `upload_message` VARCHAR(500) NOT NULL DEFAULT '',
    `wechat_version` VARCHAR(40) NOT NULL DEFAULT '',
    `uploaded_at` DATETIME(3) NULL,
    `review_status` VARCHAR(16) NOT NULL DEFAULT '',
    `download_count` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `miniprogram_tenant_releases_scene_shop_id_version_channel_key`(`scene`, `shop_id`, `version`, `channel`),
    INDEX `miniprogram_tenant_releases_owner_user_id_scene_created_at_idx`(`owner_user_id`, `scene`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `name` VARCHAR(120) NOT NULL,
    `shop_code` VARCHAR(16) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `service_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `theme_json` JSON NOT NULL,
    `trade_json` JSON NOT NULL,
    `share_image` VARCHAR(500) NOT NULL DEFAULT '',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `onsite_shops_shop_code_key`(`shop_code`),
    INDEX `onsite_shops_owner_user_id_status_idx`(`owner_user_id`, `status`),
    INDEX `onsite_shops_enterprise_id_idx`(`enterprise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(120) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `gender` TINYINT NOT NULL DEFAULT 0,
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `source` VARCHAR(16) NOT NULL DEFAULT 'MINIPROGRAM',
    `referrer_customer_id` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `onsite_customers_shop_id_openid_key`(`shop_id`, `openid`),
    INDEX `onsite_customers_shop_id_phone_idx`(`shop_id`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
