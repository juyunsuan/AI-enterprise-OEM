-- 圈子社区：活动报名与勋章。
-- 活动由管理员/圈主发起，成员报名；勋章按发帖/评论/粉丝阈值自动授予。

CREATE TABLE `circle_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL DEFAULT 0,
    `creator_user_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(80) NOT NULL,
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `description` TEXT NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NULL,
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `capacity` INTEGER NOT NULL DEFAULT 0,
    `join_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `circle_activities_community_id_status_start_at_idx`(`community_id`, `status`, `start_at`),
    INDEX `circle_activities_group_id_status_idx`(`group_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_activity_joins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `activity_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_activity_joins_activity_id_user_id_key`(`activity_id`, `user_id`),
    INDEX `circle_activity_joins_community_id_user_id_idx`(`community_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_medals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `icon` VARCHAR(500) NOT NULL DEFAULT '',
    `type` VARCHAR(16) NOT NULL,
    `threshold` INTEGER NOT NULL DEFAULT 1,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `circle_medals_community_id_enabled_sort_idx`(`community_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `circle_user_medals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `community_id` INTEGER NOT NULL,
    `medal_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `awarded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `circle_user_medals_user_id_medal_id_key`(`user_id`, `medal_id`),
    INDEX `circle_user_medals_community_id_user_id_idx`(`community_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;