-- 0120 上门服务小程序工具 P1 第二批：订单 / 履约打卡 / 加钟 / 换人 / 退款 / 评价 / 反馈 / 报警
-- 口径 docs/私域小程序·上门服务小程序工具设计方案.md §五 状态机：参考源码把订单状态塞进 pay_type，
-- 本批拆成 status（履约）/ payStatus（资金）/ refundStatus（售后）三个互不兼职的字段。
-- TEXT / JSON 列不带 DEFAULT（MySQL 1101），默认值由服务层写入。

-- CreateTable
CREATE TABLE `onsite_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `customer_name` VARCHAR(60) NOT NULL DEFAULT '',
    `customer_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `staff_id` INTEGER NOT NULL,
    `staff_name` VARCHAR(60) NOT NULL DEFAULT '',
    `staff_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
    `refund_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    `service_mode` VARCHAR(12) NOT NULL DEFAULT 'DOOR',
    `address_id` INTEGER NOT NULL DEFAULT 0,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `true_duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `service_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `true_service_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `travel_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `true_travel_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `material_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_type` VARCHAR(12) NOT NULL DEFAULT 'WECHAT',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `reject_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `departed_at` DATETIME(3) NULL,
    `departed_lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `departed_lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `departed_address` VARCHAR(200) NOT NULL DEFAULT '',
    `arrived_at` DATETIME(3) NULL,
    `arrival_image` VARCHAR(500) NOT NULL DEFAULT '',
    `arrival_address` VARCHAR(200) NOT NULL DEFAULT '',
    `service_started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `leave_image` VARCHAR(500) NOT NULL DEFAULT '',
    `leave_lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `leave_lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `leave_address` VARCHAR(200) NOT NULL DEFAULT '',
    `trip_start_address` VARCHAR(200) NOT NULL DEFAULT '',
    `trip_end_address` VARCHAR(200) NOT NULL DEFAULT '',
    `verify_operator` VARCHAR(64) NOT NULL DEFAULT '',
    `distance_meters` INTEGER NOT NULL DEFAULT 0,
    `travel_fee_source` VARCHAR(12) NOT NULL DEFAULT 'NONE',
    `travel_fee_rule_note` VARCHAR(300) NOT NULL DEFAULT '',
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `signed_at` DATETIME(3) NULL,
    `settlement_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    `settleable_at` DATETIME(3) NULL,
    `is_addon` BOOLEAN NOT NULL DEFAULT false,
    `parent_order_id` INTEGER NOT NULL DEFAULT 0,
    `addon_count` INTEGER NOT NULL DEFAULT 0,
    `owner_remark` VARCHAR(300) NOT NULL DEFAULT '',
    `customer_remark` VARCHAR(300) NOT NULL DEFAULT '',
    `created_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `onsite_orders_order_no_key`(`order_no`),
    INDEX `onsite_orders_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_orders_shop_id_staff_id_start_at_idx`(`shop_id`, `staff_id`, `start_at`),
    INDEX `onsite_orders_customer_id_created_at_idx`(`customer_id`, `created_at`),
    INDEX `onsite_orders_shop_id_pay_status_expire_at_idx`(`shop_id`, `pay_status`, `expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `cover_image` VARCHAR(500) NOT NULL DEFAULT '',
    `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `material_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `coupon_discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refundable_quantity` INTEGER NOT NULL DEFAULT 0,
    `refunded_quantity` INTEGER NOT NULL DEFAULT 0,
    `refunded_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `true_duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `addon_enabled` BOOLEAN NOT NULL DEFAULT false,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_order_items_order_id_idx`(`order_id`),
    INDEX `onsite_order_items_shop_id_service_id_idx`(`shop_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `contact_name` VARCHAR(60) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `province` VARCHAR(60) NOT NULL DEFAULT '',
    `city` VARCHAR(60) NOT NULL DEFAULT '',
    `district` VARCHAR(60) NOT NULL DEFAULT '',
    `detail` VARCHAR(200) NOT NULL DEFAULT '',
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `city_id` INTEGER NOT NULL DEFAULT 0,
    `staff_lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `staff_lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `staff_address` VARCHAR(200) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_order_addresses_order_id_key`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_status_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `from_status` VARCHAR(24) NOT NULL DEFAULT '',
    `to_status` VARCHAR(24) NOT NULL,
    `operator_role` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `action` VARCHAR(32) NOT NULL,
    `content` VARCHAR(500) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_order_status_logs_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `onsite_order_status_logs_shop_id_created_at_idx`(`shop_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_tracks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `stage` VARCHAR(24) NOT NULL,
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `image` VARCHAR(500) NOT NULL DEFAULT '',
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_order_tracks_order_id_recorded_at_idx`(`order_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_price_flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `flow_no` VARCHAR(40) NOT NULL,
    `type` VARCHAR(12) NOT NULL DEFAULT 'ORDER',
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refundable_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_order_price_flows_flow_no_key`(`flow_no`),
    INDEX `onsite_order_price_flows_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_order_signatures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `signature_image` VARCHAR(500) NOT NULL DEFAULT '',
    `signed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmed_by` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
    UNIQUE INDEX `onsite_order_signatures_order_id_key`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_addon_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `pay_type` VARCHAR(12) NOT NULL DEFAULT 'WECHAT',
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT',
    `pay_status` VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `expire_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_addon_orders_order_id_idx`(`order_id`),
    INDEX `onsite_addon_orders_shop_id_status_idx`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_staff_changes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `from_staff_id` INTEGER NOT NULL,
    `to_staff_id` INTEGER NOT NULL,
    `from_staff_name` VARCHAR(60) NOT NULL DEFAULT '',
    `to_staff_name` VARCHAR(60) NOT NULL DEFAULT '',
    `from_staff_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `to_staff_phone` VARCHAR(32) NOT NULL DEFAULT '',
    `first_staff_id` INTEGER NOT NULL DEFAULT 0,
    `travel_fee_delta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `travel_fee_settled` BOOLEAN NOT NULL DEFAULT false,
    `original_start_at` DATETIME(3) NULL,
    `original_end_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DONE',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `operator_role` VARCHAR(16) NOT NULL DEFAULT 'OWNER',
    `operator_id` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_staff_changes_order_id_idx`(`order_id`),
    INDEX `onsite_staff_changes_shop_id_to_staff_id_idx`(`shop_id`, `to_staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_refunds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `refund_no` VARCHAR(40) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `apply_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refund_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `description` TEXT NOT NULL,
    `evidence_images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `audit_remark` VARCHAR(300) NOT NULL DEFAULT '',
    `refund_transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `duration_minutes` INTEGER NOT NULL DEFAULT 0,
    `travel_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `material_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `audited_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_refunds_refund_no_key`(`refund_no`),
    INDEX `onsite_refunds_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_refunds_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_refund_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `refund_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `material_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_refund_items_refund_id_idx`(`refund_id`),
    INDEX `onsite_refund_items_order_item_id_idx`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `rating` TINYINT NOT NULL DEFAULT 5,
    `service_rating` TINYINT NOT NULL DEFAULT 5,
    `attitude_rating` TINYINT NOT NULL DEFAULT 5,
    `tags` JSON NOT NULL,
    `content` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `anonymous` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    `reply` TEXT NOT NULL,
    `replied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `onsite_reviews_order_id_key`(`order_id`),
    INDEX `onsite_reviews_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_reviews_staff_id_status_idx`(`staff_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_review_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `review_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `rating` TINYINT NOT NULL DEFAULT 5,
    INDEX `onsite_review_items_review_id_idx`(`review_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_review_appeals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `review_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `reason` VARCHAR(300) NOT NULL DEFAULT '',
    `images` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reply` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_review_appeals_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_review_appeals_review_id_idx`(`review_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_feedbacks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `category` VARCHAR(40) NOT NULL DEFAULT '其他',
    `content` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `video` VARCHAR(500) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `reply` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_feedbacks_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onsite_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `staff_id` INTEGER NOT NULL DEFAULT 0,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL DEFAULT 0,
    `lng` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `lat` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `address` VARCHAR(200) NOT NULL DEFAULT '',
    `content` VARCHAR(300) NOT NULL DEFAULT '',
    `audio_url` VARCHAR(500) NOT NULL DEFAULT '',
    `notify_phones` JSON NOT NULL,
    `notify_users` JSON NOT NULL,
    `notify_result` VARCHAR(300) NOT NULL DEFAULT '',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `handled_by` VARCHAR(64) NOT NULL DEFAULT '',
    `handle_remark` VARCHAR(300) NOT NULL DEFAULT '',
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `onsite_alerts_shop_id_status_created_at_idx`(`shop_id`, `status`, `created_at`),
    INDEX `onsite_alerts_staff_id_idx`(`staff_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

