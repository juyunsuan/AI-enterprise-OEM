-- 建站管理 · 圈子社区小程序：账号负责人＝社区管理员，C 端成员独立于站内账号。
-- 复用底座：private-mini 出包、tool-launch 启动计费、points 积分、service-desk AI 客服、
-- ai-gateway 模型网关、StorageService/数字资产、PublishReviewService 内容审核。
-- 设计见 docs/建站管理·圈子社区小程序工具设计方案.md。

-- 按量口径真正出账开关 + 内容浏览量计量
ALTER TABLE `module_pricing`
    ADD COLUMN `usage_billed` TINYINT NOT NULL DEFAULT 0 COMMENT '按量口径（访问/流量/浏览量）是否期末出账：0=只计量 1=扣积分';

ALTER TABLE `tool_usage_daily`
    ADD COLUMN `views` INTEGER NOT NULL DEFAULT 0 COMMENT '内容浏览量（帖子详情去重打开）';

-- CreateTable: 社区实例（一个账号一个）
CREATE TABLE `circle_communities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(80) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL,
    `theme_color` VARCHAR(20) NOT NULL DEFAULT '#1677ff',
    `notice` TEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `join_approval` TINYINT(1) NOT NULL DEFAULT 1,
    `allow_user_create_circle` TINYINT(1) NOT NULL DEFAULT 1,
    `post_review` TINYINT(1) NOT NULL DEFAULT 1,
    `comment_review` TINYINT(1) NOT NULL DEFAULT 0,
    `ai_assistant_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `service_phone` VARCHAR(30) NOT NULL DEFAULT '',
    `service_wechat` VARCHAR(60) NOT NULL DEFAULT '',
    `share_image` VARCHAR(500) NOT NULL DEFAULT '',
    `agreement` TEXT NOT NULL,
    `privacy` TEXT NOT NULL,
    `about` TEXT NOT NULL,
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `circle_communities_owner_user_id_key`(`owner_user_id`),
    UNIQUE INDEX `circle_communities_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 分类
CREATE TABLE `circle_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `circle_categories_community_id_name_key`(`community_id`, `name`),
    INDEX `circle_categories_community_id_sort_idx`(`community_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: C 端成员
CREATE TABLE `circle_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(40) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `bio` VARCHAR(200) NOT NULL DEFAULT '',
    `gender` TINYINT NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `post_count` INTEGER NOT NULL DEFAULT 0,
    `follower_count` INTEGER NOT NULL DEFAULT 0,
    `following_count` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `circle_users_community_id_openid_key`(`community_id`, `openid`),
    INDEX `circle_users_community_id_status_created_at_idx`(`community_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 圈子
CREATE TABLE `circle_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL,
    `rules` TEXT NOT NULL,
    `join_mode` VARCHAR(16) NOT NULL DEFAULT 'APPROVAL',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `member_count` INTEGER NOT NULL DEFAULT 0,
    `post_count` INTEGER NOT NULL DEFAULT 0,
    `follow_count` INTEGER NOT NULL DEFAULT 0,
    `is_recommended` TINYINT(1) NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `audited_by` VARCHAR(64) NOT NULL DEFAULT '',
    `audited_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `circle_groups_community_id_status_category_id_idx`(`community_id`, `status`, `category_id`),
    INDEX `circle_groups_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 圈子成员
CREATE TABLE `circle_group_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `circle_group_members_group_id_user_id_key`(`group_id`, `user_id`),
    INDEX `circle_group_members_community_id_user_id_idx`(`community_id`, `user_id`),
    INDEX `circle_group_members_group_id_status_idx`(`group_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 关注圈子
CREATE TABLE `circle_group_follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_group_follows_group_id_user_id_key`(`group_id`, `user_id`),
    INDEX `circle_group_follows_community_id_user_id_idx`(`community_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 关注用户
CREATE TABLE `circle_user_follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `follower_id` INTEGER NOT NULL,
    `target_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_user_follows_follower_id_target_user_id_key`(`follower_id`, `target_user_id`),
    INDEX `circle_user_follows_community_id_target_user_id_idx`(`community_id`, `target_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 帖子
CREATE TABLE `circle_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL,
    `author_user_id` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    `audit_note` VARCHAR(200) NOT NULL DEFAULT '',
    `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
    `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `comment_count` INTEGER NOT NULL DEFAULT 0,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `favorite_count` INTEGER NOT NULL DEFAULT 0,
    `hot_score` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `circle_posts_community_id_status_created_at_idx`(`community_id`, `status`, `created_at`),
    INDEX `circle_posts_group_id_status_created_at_idx`(`group_id`, `status`, `created_at`),
    INDEX `circle_posts_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 话题
CREATE TABLE `circle_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `description` VARCHAR(200) NOT NULL DEFAULT '',
    `post_count` INTEGER NOT NULL DEFAULT 0,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_topics_community_id_name_key`(`community_id`, `name`),
    INDEX `circle_topics_community_id_sort_idx`(`community_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_post_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `topic_id` INTEGER NOT NULL,
    UNIQUE INDEX `circle_post_topics_post_id_topic_id_key`(`post_id`, `topic_id`),
    INDEX `circle_post_topics_topic_id_idx`(`topic_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 评论（parentId=0 为一楼，非 0 为楼中楼）
CREATE TABLE `circle_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `post_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `parent_id` INTEGER NOT NULL DEFAULT 0,
    `reply_to_user_id` INTEGER NOT NULL DEFAULT 0,
    `reply_to_name` VARCHAR(40) NOT NULL DEFAULT '',
    `content` VARCHAR(1000) NOT NULL,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `circle_comments_post_id_status_created_at_idx`(`post_id`, `status`, `created_at`),
    INDEX `circle_comments_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_post_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `post_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_post_likes_post_id_user_id_key`(`post_id`, `user_id`),
    INDEX `circle_post_likes_community_id_user_id_idx`(`community_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_comment_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `comment_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_comment_likes_comment_id_user_id_key`(`comment_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_post_favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `post_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_post_favorites_post_id_user_id_key`(`post_id`, `user_id`),
    INDEX `circle_post_favorites_community_id_user_id_idx`(`community_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 浏览去重（按浏览量出账的计费事实）
CREATE TABLE `circle_post_views` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `post_id` INTEGER NOT NULL,
    `visitor_key` VARCHAR(80) NOT NULL,
    `day` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_post_views_post_id_visitor_key_day_key`(`post_id`, `visitor_key`, `day`),
    INDEX `circle_post_views_community_id_day_idx`(`community_id`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 举报
CREATE TABLE `circle_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `reporter_user_id` INTEGER NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `action` VARCHAR(16) NOT NULL DEFAULT '',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `circle_reports_community_id_status_created_at_idx`(`community_id`, `status`, `created_at`),
    INDEX `circle_reports_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 站内通知
CREATE TABLE `circle_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `actor_user_id` INTEGER NOT NULL DEFAULT 0,
    `target_type` VARCHAR(16) NOT NULL DEFAULT '',
    `target_id` INTEGER NOT NULL DEFAULT 0,
    `post_id` INTEGER NOT NULL DEFAULT 0,
    `comment_id` INTEGER NOT NULL DEFAULT 0,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `circle_notifications_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `circle_notifications_community_id_created_at_idx`(`community_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 价目种子：圈子社区默认免费可启动；平台管理员在「价目与用量」里改为按日/按 30 天/按年/
-- 按访问/按流量/按浏览量后才扣积分。usage_billed 默认 0，按量口径先只计量。
INSERT INTO `module_pricing`
    (`code`, `mode`, `unit`, `unit_price_amount`, `free_quota_amount`, `min_charge_amount`, `enabled`, `billing_cycle`, `usage_unit_size`, `launch_enabled`, `usage_billed`, `updated_at`)
SELECT 'circle', 'FREE', 'day30', 0, 0, 0.01, 1, 'FREE', 1, 1, 0, CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `module_pricing` WHERE `code` = 'circle');
