-- 知识付费小程序升级为「知识付费云课堂」：课程目录（课时）、学习进度、评价评分与讲师资料。
-- 课程仍落 knowledge_pay_resources；课时/进度/评价分表，删除课程时由服务层级联清理。

ALTER TABLE `knowledge_pay_resources`
    ADD COLUMN `teacher_name` VARCHAR(60) NOT NULL DEFAULT '',
    ADD COLUMN `teacher_title` VARCHAR(60) NOT NULL DEFAULT '',
    ADD COLUMN `teacher_avatar` VARCHAR(512) NOT NULL DEFAULT '',
    ADD COLUMN `teacher_intro` TEXT NOT NULL;

CREATE TABLE `knowledge_pay_lessons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `media_type` VARCHAR(16) NOT NULL DEFAULT 'video',
    `url` VARCHAR(512) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL,
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `free_trial` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_lessons_site_id_resource_id_status_sort_idx`(`site_id`, `resource_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_progress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `lesson_id` INTEGER NOT NULL,
    `position_sec` INTEGER NOT NULL DEFAULT 0,
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kp_progress_site_member_lesson_key`(`site_id`, `member_id`, `lesson_id`),
    INDEX `knowledge_pay_progress_site_id_member_id_updated_at_idx`(`site_id`, `member_id`, `updated_at`),
    INDEX `knowledge_pay_progress_site_id_resource_id_idx`(`site_id`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL DEFAULT 5,
    `content` TEXT NOT NULL,
    `reply` TEXT NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `replied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kp_reviews_site_member_resource_key`(`site_id`, `member_id`, `resource_id`),
    INDEX `knowledge_pay_reviews_site_id_resource_id_status_id_idx`(`site_id`, `resource_id`, `status`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
