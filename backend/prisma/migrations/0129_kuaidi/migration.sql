-- 0129 建站管理 · 快递寄件小程序工具：站点 / 快递公司报价 / 订单 / 履约轨迹 / 地址簿 / 顾客 6 张业务表。
-- 设计见 docs/建站管理·快递寄件小程序工具设计方案.md。
-- 微信侧凭据与代码包台账不在本域建表：0117 的 miniprogram_apps /
-- miniprogram_tenant_releases 以 scene='EXPRESS' + shop_id 承载，一店一个独立小程序主体。
-- 在线客服复用 service-desk（本域只存 desk_site_key，不建会话表）；收款走店主
-- 自己的微信商户号，平台不经手资金，因此没有资金账本与提现表。
-- 金额 DECIMAL(18,2)，重量 DECIMAL(10,2)，保价费率 DECIMAL(8,4)。

-- CreateTable
CREATE TABLE `kuaidi_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `enterprise_id` INTEGER NOT NULL DEFAULT 0,
    `enterprise_user_id` VARCHAR(64) NOT NULL DEFAULT '',
    `site_code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `slogan` VARCHAR(200) NOT NULL DEFAULT '',
    `theme_color` VARCHAR(16) NOT NULL DEFAULT '#3370FF',
    `notice` VARCHAR(500) NOT NULL DEFAULT '',
    `service_contact` JSON NOT NULL,
    `desk_site_key` VARCHAR(64) NOT NULL DEFAULT '',
    `toggles` JSON NOT NULL,
    `insurance_enabled` BOOLEAN NOT NULL DEFAULT true,
    `insurance_rate` DECIMAL(8, 4) NOT NULL DEFAULT 0.005,
    `insurance_max` DECIMAL(18, 2) NOT NULL DEFAULT 20000,
    `max_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 100,
    `pay_minutes` INTEGER NOT NULL DEFAULT 30,
    `pickup_slots` JSON NOT NULL,
    `protocol_text` MEDIUMTEXT NOT NULL DEFAULT (''),
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `off_by` VARCHAR(64) NOT NULL DEFAULT '',
    `off_reason` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kuaidi_sites_site_code_key`(`site_code`),
    INDEX `kuaidi_sites_owner_user_id_status_idx`(`owner_user_id`, `status`),
    INDEX `kuaidi_sites_enterprise_id_idx`(`enterprise_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kuaidi_companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `code` VARCHAR(20) NOT NULL DEFAULT '',
    `name` VARCHAR(60) NOT NULL,
    `logo` VARCHAR(500) NOT NULL DEFAULT '',
    `first_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `first_price` DECIMAL(18, 2) NOT NULL DEFAULT 8,
    `extra_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `extra_price` DECIMAL(18, 2) NOT NULL DEFAULT 3,
    `remote_provinces` JSON NOT NULL,
    `remote_extra` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `delivery_days` VARCHAR(40) NOT NULL DEFAULT '',
    `remark` VARCHAR(200) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kuaidi_companies_site_id_enabled_sort_idx`(`site_id`, `enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kuaidi_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `company_name` VARCHAR(60) NOT NULL DEFAULT '',
    `sender` JSON NOT NULL,
    `receiver` JSON NOT NULL,
    `item_name` VARCHAR(80) NOT NULL DEFAULT '',
    `item_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `item_count` INTEGER NOT NULL DEFAULT 1,
    `length` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `width` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `height` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `volume_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `charge_weight_kg` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `insured_value` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `base_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `extra_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remote_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `insurance_fee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pay_mode` VARCHAR(8) NOT NULL DEFAULT 'OFFLINE',
    `pay_state` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `prepay_id` VARCHAR(64) NOT NULL DEFAULT '',
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING_PICKUP',
    `pickup_slot` VARCHAR(40) NOT NULL DEFAULT '',
    `remark` VARCHAR(300) NOT NULL DEFAULT '',
    `tracking_no` VARCHAR(64) NOT NULL DEFAULT '',
    `cancel_reason` VARCHAR(300) NOT NULL DEFAULT '',
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `create_ip` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kuaidi_orders_site_order_no_key`(`site_id`, `order_no`),
    INDEX `kuaidi_orders_site_id_status_created_at_idx`(`site_id`, `status`, `created_at`),
    INDEX `kuaidi_orders_site_id_pay_state_created_at_idx`(`site_id`, `pay_state`, `created_at`),
    INDEX `kuaidi_orders_site_id_expire_at_idx`(`site_id`, `expire_at`),
    INDEX `kuaidi_orders_site_id_customer_id_idx`(`site_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kuaidi_order_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `note` VARCHAR(300) NOT NULL DEFAULT '',
    `operator` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kuaidi_order_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `kuaidi_order_events_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kuaidi_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL DEFAULT 0,
    `openid` VARCHAR(64) NOT NULL DEFAULT '',
    `type` VARCHAR(16) NOT NULL DEFAULT 'SENDER',
    `name` VARCHAR(40) NOT NULL,
    `mobile` VARCHAR(20) NOT NULL,
    `province` VARCHAR(40) NOT NULL DEFAULT '',
    `city` VARCHAR(40) NOT NULL DEFAULT '',
    `district` VARCHAR(40) NOT NULL DEFAULT '',
    `address` VARCHAR(200) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kuaidi_addresses_site_id_openid_type_idx`(`site_id`, `openid`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kuaidi_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NOT NULL DEFAULT '',
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `avatar` VARCHAR(500) NOT NULL DEFAULT '',
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `paid_order_count` INTEGER NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `last_order_at` DATETIME(3) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kuaidi_customers_site_openid_key`(`site_id`, `openid`),
    INDEX `kuaidi_customers_site_id_created_at_idx`(`site_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
