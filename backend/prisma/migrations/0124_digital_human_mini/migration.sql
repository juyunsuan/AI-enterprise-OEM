-- 0124 建站管理 · 数字人小程序工具（参考「AI 数字人分身系统」全量按本站架构重写）。
-- 设计见 docs/建站管理·数字人小程序工具设计方案.md。
-- 微信侧凭据与代码包台账不在本域建表：0117 的 miniprogram_apps /
-- miniprogram_tenant_releases 以 scene='DIGITAL_HUMAN' + shop_id(=站点 id) 承载，
-- 一站一个独立小程序主体；收款走站点方自己的微信商户号，平台不经手资金。
-- 形象/声音/TTS/对口型渠道复用本站「模型配置」范式（digital_human_channels，key 密文）。
-- 在线复用 service-desk（本站域只存 service_desk_site_key，不建会话表）。
-- 金额（分）与点数走 Int，积分三账户统一走 balance_logs 流水；布尔走 BOOLEAN。
-- 表间用裸 Int 逻辑关联（同 mall/onsite 底座口径），不建物理外键。

-- 本域为新表：前置幂等清理（历史上 0124 首次应用曾在 TEXT 默认值处失败，
-- 可能残留半建表），随后重建。
drop table if exists `digital_human_sites`;
drop table if exists `digital_human_channels`;
drop table if exists `digital_human_members`;
drop table if exists `digital_human_balance_logs`;
drop table if exists `digital_human_bodies`;
drop table if exists `digital_human_voices`;
drop table if exists `digital_human_voice_groups`;
drop table if exists `digital_human_preset_voices`;
drop table if exists `digital_human_bgm_groups`;
drop table if exists `digital_human_bgms`;
drop table if exists `digital_human_works`;
drop table if exists `digital_human_tasks`;
drop table if exists `digital_human_write_topics`;
drop table if exists `digital_human_ai_records`;
drop table if exists `digital_human_packages`;
drop table if exists `digital_human_orders`;
drop table if exists `digital_human_card_batches`;
drop table if exists `digital_human_cards`;
drop table if exists `digital_human_articles`;
drop table if exists `digital_human_swipers`;
drop table if exists `digital_human_promoter_applies`;
drop table if exists `digital_human_commissions`;
drop table if exists `digital_human_withdraws`;
drop table if exists `digital_human_posters`;
drop table if exists `digital_human_feedbacks`;
CREATE TABLE `digital_human_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `site_code` VARCHAR(16) NOT NULL,
    `site_name` VARCHAR(60) NOT NULL DEFAULT '',
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(120) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370ff',
    `service_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `brand` JSON NOT NULL,
    `toggles` JSON NOT NULL,
    `pricing` JSON NOT NULL,
    `gift` JSON NOT NULL,
    `login` JSON NOT NULL,
    `clone` JSON NOT NULL,
    `commission` JSON NOT NULL,
    `service_desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `diyPage` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digital_human_sites_user_id_key`(`user_id`),
    UNIQUE INDEX `digital_human_sites_site_code_key`(`site_code`),
    INDEX `digital_human_sites_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `capability` VARCHAR(16) NOT NULL,
    `protocol` VARCHAR(16) NOT NULL DEFAULT 'fox',
    `name` VARCHAR(64) NOT NULL,
    `base_url` VARCHAR(300) NOT NULL DEFAULT '',
    `key_cipher` TEXT NOT NULL,
    `model_tier` VARCHAR(64) NOT NULL DEFAULT '',
    `secret_cipher` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_channels_user_id_capability_enabled_idx`(`user_id`, `capability`, `enabled`),
    UNIQUE INDEX `dh_channels_user_cap_name_key`(`user_id`, `capability`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `union_id` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `point` INTEGER NOT NULL DEFAULT 0,
    `body_quota` INTEGER NOT NULL DEFAULT 0,
    `voice_quota` INTEGER NOT NULL DEFAULT 0,
    `vip_expire_at` DATETIME(3) NULL,
    `referrer_id` INTEGER NOT NULL DEFAULT 0,
    `parent_referrer_id` INTEGER NOT NULL DEFAULT 0,
    `promoter_level` TINYINT NOT NULL DEFAULT 0,
    `commission_balance` INTEGER NOT NULL DEFAULT 0,
    `commission_total` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `login_count` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `gift_claimed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_members_site_id_phone_idx`(`site_id`, `phone`),
    INDEX `digital_human_members_site_id_promoter_level_idx`(`site_id`, `promoter_level`),
    INDEX `digital_human_members_site_id_referrer_id_idx`(`site_id`, `referrer_id`),
    INDEX `digital_human_members_site_id_created_at_idx`(`site_id`, `created_at`),
    UNIQUE INDEX `dh_members_site_openid_key`(`site_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_balance_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `account` VARCHAR(16) NOT NULL,
    `delta` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `biz_type` VARCHAR(24) NOT NULL,
    `ref_id` INTEGER NOT NULL DEFAULT 0,
    `is_refund` BOOLEAN NOT NULL DEFAULT false,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `digital_human_balance_logs_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    INDEX `digital_human_balance_logs_site_id_biz_type_idx`(`site_id`, `biz_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_bodies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `source_video_url` VARCHAR(500) NOT NULL,
    `cover_url` VARCHAR(500) NOT NULL DEFAULT '',
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 0,
    `task_id` VARCHAR(64) NOT NULL DEFAULT '',
    `subject_id` VARCHAR(120) NOT NULL DEFAULT '',
    `fail_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_bodies_site_id_member_id_status_idx`(`site_id`, `member_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_voices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL DEFAULT '',
    `sample_audio_url` VARCHAR(500) NOT NULL,
    `speaker_id` VARCHAR(120) NOT NULL DEFAULT '',
    `demo_audio_url` VARCHAR(500) NOT NULL DEFAULT '',
    `status` TINYINT NOT NULL DEFAULT 0,
    `task_id` VARCHAR(64) NOT NULL DEFAULT '',
    `fail_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_voices_site_id_member_id_status_idx`(`site_id`, `member_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_voice_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_voice_groups_site_id_enabled_sort_idx`(`site_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_preset_voices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL DEFAULT 0,
    `group_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `speaker_id` VARCHAR(120) NOT NULL,
    `gender` VARCHAR(8) NOT NULL DEFAULT '',
    `language` VARCHAR(16) NOT NULL DEFAULT 'zh',
    `demo_url` VARCHAR(500) NOT NULL DEFAULT '',
    `tags` VARCHAR(120) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_preset_voices_site_id_group_id_enabled_sort_idx`(`site_id`, `group_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_bgm_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(60) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_bgm_groups_site_id_enabled_sort_idx`(`site_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_bgms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL DEFAULT 0,
    `group_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(80) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_bgms_site_id_group_id_enabled_sort_idx`(`site_id`, `group_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_works` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `body_id` INTEGER NOT NULL DEFAULT 0,
    `voice_source` VARCHAR(16) NOT NULL DEFAULT 'clone',
    `voice_id` INTEGER NOT NULL DEFAULT 0,
    `voice_speaker_id` VARCHAR(120) NOT NULL DEFAULT '',
    `audio_type` VARCHAR(16) NOT NULL DEFAULT 'tts',
    `script` TEXT NOT NULL,
    `source_audio_url` VARCHAR(500) NOT NULL DEFAULT '',
    `bgm_id` INTEGER NOT NULL DEFAULT 0,
    `bgm_volume` INTEGER NOT NULL DEFAULT 30,
    `speed` INTEGER NOT NULL DEFAULT 100,
    `subtitle_on` BOOLEAN NOT NULL DEFAULT true,
    `status` TINYINT NOT NULL DEFAULT 0,
    `stage` VARCHAR(16) NOT NULL DEFAULT 'tts',
    `tts_status` TINYINT NOT NULL DEFAULT 0,
    `lipsync_status` TINYINT NOT NULL DEFAULT 0,
    `tts_task_id` VARCHAR(64) NOT NULL DEFAULT '',
    `lipsync_task_id` VARCHAR(64) NOT NULL DEFAULT '',
    `result_video_url` VARCHAR(500) NOT NULL DEFAULT '',
    `audio_url` VARCHAR(500) NOT NULL DEFAULT '',
    `cover_url` VARCHAR(500) NOT NULL DEFAULT '',
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `point_cost` INTEGER NOT NULL DEFAULT 0,
    `is_refund` BOOLEAN NOT NULL DEFAULT false,
    `fail_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `play_count` INTEGER NOT NULL DEFAULT 0,
    `share_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_works_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    INDEX `digital_human_works_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(16) NOT NULL,
    `ref_table` VARCHAR(24) NOT NULL DEFAULT '',
    `ref_id` INTEGER NOT NULL DEFAULT 0,
    `protocol` VARCHAR(16) NOT NULL DEFAULT '',
    `provider` VARCHAR(32) NOT NULL DEFAULT '',
    `provider_task_id` VARCHAR(120) NOT NULL DEFAULT '',
    `callback_token` VARCHAR(48) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `request_url` VARCHAR(500) NOT NULL DEFAULT '',
    `result_url` VARCHAR(500) NOT NULL DEFAULT '',
    `payload` JSON NOT NULL,
    `point_cost` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NOT NULL DEFAULT '',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digital_human_tasks_callback_token_key`(`callback_token`),
    INDEX `digital_human_tasks_site_id_kind_status_idx`(`site_id`, `kind`, `status`),
    INDEX `digital_human_tasks_ref_table_ref_id_idx`(`ref_table`, `ref_id`),
    INDEX `digital_human_tasks_provider_task_id_idx`(`provider_task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_write_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'write_model',
    `title` VARCHAR(120) NOT NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `model_tier` VARCHAR(64) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_write_topics_site_id_kind_enabled_sort_idx`(`site_id`, `kind`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_ai_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `topic_id` INTEGER NOT NULL DEFAULT 0,
    `prompt` TEXT NOT NULL,
    `response` MEDIUMTEXT NOT NULL,
    `word_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `digital_human_ai_records_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `price_cents` INTEGER NOT NULL DEFAULT 0,
    `original_cents` INTEGER NOT NULL DEFAULT 0,
    `vip_days` INTEGER NOT NULL DEFAULT 0,
    `point` INTEGER NOT NULL DEFAULT 0,
    `body_quota` INTEGER NOT NULL DEFAULT 0,
    `voice_quota` INTEGER NOT NULL DEFAULT 0,
    `limit_num` INTEGER NOT NULL DEFAULT 0,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `recommended` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_packages_site_id_type_enabled_sort_idx`(`site_id`, `type`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `package_id` INTEGER NOT NULL,
    `package_snapshot` JSON NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `pay_type` VARCHAR(16) NOT NULL DEFAULT 'wxpay',
    `status` TINYINT NOT NULL DEFAULT 0,
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `promoter_id` INTEGER NOT NULL DEFAULT 0,
    `commission1_cents` INTEGER NOT NULL DEFAULT 0,
    `commission2_cents` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digital_human_orders_order_no_key`(`order_no`),
    INDEX `digital_human_orders_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    INDEX `digital_human_orders_site_id_status_idx`(`site_id`, `status`),
    INDEX `digital_human_orders_site_id_promoter_id_idx`(`site_id`, `promoter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_card_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(80) NOT NULL DEFAULT '',
    `type` VARCHAR(16) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `vip_days` INTEGER NOT NULL DEFAULT 0,
    `point` INTEGER NOT NULL DEFAULT 0,
    `body_quota` INTEGER NOT NULL DEFAULT 0,
    `voice_quota` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_card_batches_site_id_created_at_idx`(`site_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL DEFAULT 0,
    `code` VARCHAR(32) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `vip_days` INTEGER NOT NULL DEFAULT 0,
    `point` INTEGER NOT NULL DEFAULT 0,
    `body_quota` INTEGER NOT NULL DEFAULT 0,
    `voice_quota` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'unused',
    `used_by_member_id` INTEGER NOT NULL DEFAULT 0,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_cards_site_id_status_type_idx`(`site_id`, `status`, `type`),
    INDEX `digital_human_cards_site_id_batch_id_idx`(`site_id`, `batch_id`),
    UNIQUE INDEX `dh_cards_site_code_key`(`site_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_articles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `type` VARCHAR(24) NOT NULL DEFAULT 'help',
    `content_type` VARCHAR(16) NOT NULL DEFAULT 'article',
    `title` VARCHAR(120) NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `summary` VARCHAR(300) NOT NULL DEFAULT '',
    `body` MEDIUMTEXT NOT NULL,
    `link` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_articles_site_id_type_enabled_sort_idx`(`site_id`, `type`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_swipers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL,
    `link` VARCHAR(500) NOT NULL DEFAULT 'none',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_swipers_site_id_enabled_sort_idx`(`site_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_promoter_applies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `join_type` VARCHAR(16) NOT NULL DEFAULT 'auto',
    `status` TINYINT NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `admin_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_at` DATETIME(3) NULL,

    INDEX `digital_human_promoter_applies_site_id_status_applied_at_idx`(`site_id`, `status`, `applied_at`),
    INDEX `digital_human_promoter_applies_site_id_member_id_idx`(`site_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_commissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `from_member_id` INTEGER NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `level` TINYINT NOT NULL DEFAULT 1,
    `type` TINYINT NOT NULL DEFAULT 1,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `rate` INTEGER NOT NULL DEFAULT 0,
    `balance_after` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `digital_human_commissions_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    INDEX `digital_human_commissions_site_id_order_id_idx`(`site_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_withdraws` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `method` VARCHAR(16) NOT NULL DEFAULT 'bank',
    `account_name` VARCHAR(60) NOT NULL DEFAULT '',
    `account_no` VARCHAR(120) NOT NULL DEFAULT '',
    `bank_name` VARCHAR(120) NOT NULL DEFAULT '',
    `qr_url` VARCHAR(500) NOT NULL DEFAULT '',
    `status` TINYINT NOT NULL DEFAULT 0,
    `admin_remark` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    INDEX `digital_human_withdraws_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `digital_human_withdraws_site_id_member_id_idx`(`site_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_posters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL DEFAULT '',
    `bg_url` VARCHAR(500) NOT NULL DEFAULT '',
    `avatar_x` INTEGER NOT NULL DEFAULT 0,
    `avatar_y` INTEGER NOT NULL DEFAULT 0,
    `avatar_size` INTEGER NOT NULL DEFAULT 120,
    `qr_x` INTEGER NOT NULL DEFAULT 0,
    `qr_y` INTEGER NOT NULL DEFAULT 0,
    `qr_size` INTEGER NOT NULL DEFAULT 180,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_posters_site_id_enabled_sort_idx`(`site_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `digital_human_feedbacks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL DEFAULT 0,
    `content` TEXT NOT NULL,
    `contact` VARCHAR(60) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `reply` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digital_human_feedbacks_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
