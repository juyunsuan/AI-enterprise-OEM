-- 0134 智慧分析 · 企业咨询
-- 一次提交一行：profile 存企业数据，frameworks 存所选模型 key（逗号分隔），
-- result 存逐模型结论与综合建议；JSON 列不带 DEFAULT（MySQL 1101），未生成/失败时保持 NULL。
-- 只按 user_id 归属，不建外键；报告可在历史中回看与删除。

-- CreateTable
CREATE TABLE `insight_consulting_analyses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `company_name` VARCHAR(200) NOT NULL,
    `industry` VARCHAR(32) NOT NULL,
    `frameworks` VARCHAR(512) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `profile` JSON NULL,
    `result` JSON NULL,
    `model` VARCHAR(128) NOT NULL DEFAULT '',
    `error` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insight_consulting_analyses_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
