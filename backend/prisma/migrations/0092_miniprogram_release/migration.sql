-- 0092 用户版小程序（docs/用户版小程序端与后台小程序管理设计方案.md §五）：
-- 后台托管代码包台账（对象存储 zip + 版本 / 通道 / 小程序码）与小程序 openId ↔ 站内账号绑定。
-- 微信侧的上传 / 提审 / 发布仍由管理员在开发者工具与公众平台完成，本表不替代微信审核。

-- CreateTable
CREATE TABLE `miniprogram_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(40) NOT NULL,
    `channel` VARCHAR(8) NOT NULL DEFAULT 'STABLE',
    `file_name` VARCHAR(160) NOT NULL,
    `file_size` INTEGER NOT NULL DEFAULT 0,
    `oss_key` VARCHAR(400) NOT NULL,
    `sha256` VARCHAR(64) NOT NULL DEFAULT '',
    `changelog` VARCHAR(1000) NOT NULL DEFAULT '',
    `min_base_lib` VARCHAR(40) NOT NULL DEFAULT '',
    `qrcode_url` VARCHAR(500) NOT NULL DEFAULT '',
    `download_count` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `miniprogram_releases_version_channel_key`(`version`, `channel`),
    INDEX `miniprogram_releases_channel_enabled_created_at_idx`(`channel`, `enabled`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `miniprogram_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `open_id` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NULL,
    `nickname` VARCHAR(120) NOT NULL DEFAULT '',
    `avatar_url` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `miniprogram_bindings_user_id_key`(`user_id`),
    UNIQUE INDEX `miniprogram_bindings_open_id_key`(`open_id`),
    INDEX `miniprogram_bindings_union_id_idx`(`union_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
