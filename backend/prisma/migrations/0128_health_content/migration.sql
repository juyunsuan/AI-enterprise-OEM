-- 0128 健康管理 · 内容与社区（C12）
-- articles/posts 的 status 从「审核态」改回「上下线态（ON/OFF）」，审核态独立到 audit_status；
-- 审核口径统一为 PENDING/APPROVED/REJECTED/OFFLINE，与服务端契约一致。
-- 新增公开问答两张表；评价补标签快照；常用语补上下线态。

-- AlterTable
ALTER TABLE `health_articles`
    ADD COLUMN `kind` VARCHAR(12) NOT NULL DEFAULT 'ARTICLE',
    ADD COLUMN `media_url` VARCHAR(1000) NOT NULL DEFAULT '',
    ADD COLUMN `visibility` VARCHAR(12) NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN `crowd_kinds_json` JSON NULL,
    ADD COLUMN `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `collect_count` INTEGER NOT NULL DEFAULT 0;

UPDATE `health_articles` SET `crowd_kinds_json` = JSON_ARRAY() WHERE `crowd_kinds_json` IS NULL;
UPDATE `health_articles` SET `status` = 'ON';

ALTER TABLE `health_articles`
    MODIFY `crowd_kinds_json` JSON NOT NULL,
    MODIFY `status` VARCHAR(8) NOT NULL DEFAULT 'ON';

CREATE INDEX `health_articles_shop_id_audit_status_status_published_at_idx`
    ON `health_articles`(`shop_id`, `audit_status`, `status`, `published_at`);

-- AlterTable
ALTER TABLE `health_posts`
    ADD COLUMN `tags_json` JSON NULL,
    ADD COLUMN `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `report_count` INTEGER NOT NULL DEFAULT 0;

UPDATE `health_posts` SET `tags_json` = JSON_ARRAY() WHERE `tags_json` IS NULL;
UPDATE `health_posts` SET `status` = 'ON';

ALTER TABLE `health_posts`
    MODIFY `tags_json` JSON NOT NULL,
    MODIFY `status` VARCHAR(8) NOT NULL DEFAULT 'ON';

CREATE INDEX `health_posts_shop_id_audit_status_created_at_idx`
    ON `health_posts`(`shop_id`, `audit_status`, `created_at`);

-- AlterTable
ALTER TABLE `health_post_comments`
    ADD COLUMN `author_kind` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER';

UPDATE `health_post_comments` SET `status` = 'APPROVED' WHERE `status` = 'PUBLISHED';
UPDATE `health_post_comments` SET `status` = 'PENDING' WHERE `status` NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'OFFLINE');

ALTER TABLE `health_post_comments`
    MODIFY `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING';

CREATE INDEX `health_post_comments_shop_id_status_created_at_idx`
    ON `health_post_comments`(`shop_id`, `status`, `created_at`);

-- AlterTable
ALTER TABLE `health_post_tags` ADD COLUMN `status` VARCHAR(8) NOT NULL DEFAULT 'ON';

-- AlterTable
ALTER TABLE `health_reviews` ADD COLUMN `tags_json` JSON NULL;

UPDATE `health_reviews` SET `tags_json` = JSON_ARRAY() WHERE `tags_json` IS NULL;

ALTER TABLE `health_reviews` MODIFY `tags_json` JSON NOT NULL;

-- AlterTable
ALTER TABLE `health_canned_responses` ADD COLUMN `status` VARCHAR(8) NOT NULL DEFAULT 'ON';

-- CreateTable
CREATE TABLE `health_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `patient_id` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL,
    `detail` VARCHAR(2000) NOT NULL,
    `crowd_kind` VARCHAR(24) NOT NULL DEFAULT '',
    `bounty_cents` INTEGER NOT NULL DEFAULT 0,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `answer_count` INTEGER NOT NULL DEFAULT 0,
    `adopted_answer_id` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_questions_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `health_questions_shop_id_customer_id_idx`(`shop_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_answers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `question_id` INTEGER NOT NULL,
    `practitioner_id` INTEGER NOT NULL DEFAULT 0,
    `content` VARCHAR(2000) NOT NULL,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `adopted` BOOLEAN NOT NULL DEFAULT false,
    `audit_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `health_answers_shop_id_question_id_created_at_idx`(`shop_id`, `question_id`, `created_at`),
    INDEX `health_answers_shop_id_audit_status_created_at_idx`(`shop_id`, `audit_status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
