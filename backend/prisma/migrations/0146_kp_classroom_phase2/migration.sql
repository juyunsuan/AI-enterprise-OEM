-- 云课堂二期：章节、讲师、发现页导航、自定义单页、课程上架审核、微信支付与退款。
-- 现金订单独立成表；课程/会员价格由站点自有商户号直收，平台不经手资金。

ALTER TABLE `knowledge_pay_sites`
    ADD COLUMN `wx_mch_id` VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN `wx_pay_serial` VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN `wx_pay_apiv3_key` TEXT NOT NULL,
    ADD COLUMN `wx_pay_private_key` TEXT NOT NULL;

ALTER TABLE `knowledge_pay_resources`
    ADD COLUMN `cash_price_cents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `teacher_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `audit_status` VARCHAR(16) NOT NULL DEFAULT 'published',
    ADD COLUMN `audit_note` VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE `knowledge_pay_lessons`
    ADD COLUMN `chapter_id` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `knowledge_pay_chapters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_chapters_site_id_resource_id_status_sort_idx`(`site_id`, `resource_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_teachers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `title` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(512) NOT NULL DEFAULT '',
    `intro` TEXT NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_teachers_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_navs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(60) NOT NULL,
    `icon` VARCHAR(512) NOT NULL DEFAULT '',
    `link` VARCHAR(512) NOT NULL DEFAULT 'none',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_pay_navs_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(60) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kp_pages_site_slug_key`(`site_id`, `slug`),
    INDEX `knowledge_pay_pages_site_id_status_sort_idx`(`site_id`, `status`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_pay_cash_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `resource_id` INTEGER NOT NULL DEFAULT 0,
    `plan` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `amount_cents` INTEGER NOT NULL,
    `out_trade_no` VARCHAR(40) NOT NULL,
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `refund_no` VARCHAR(64) NOT NULL DEFAULT '',
    `refund_reason` VARCHAR(120) NOT NULL DEFAULT '',
    `unlock_order_id` INTEGER NOT NULL DEFAULT 0,
    `paid_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `knowledge_pay_cash_orders_out_trade_no_key`(`out_trade_no`),
    INDEX `knowledge_pay_cash_orders_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `knowledge_pay_cash_orders_site_id_member_id_created_at_idx`(`site_id`, `member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
