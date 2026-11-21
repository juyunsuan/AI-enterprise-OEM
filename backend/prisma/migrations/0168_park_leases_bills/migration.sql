-- 园区租约合同与周期账单；账单可选同步 ERP 应收（走 ErpWritePort，不直写 ERP 表）。

CREATE TABLE `park_leases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `tenant_id` INTEGER NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `start_date` VARCHAR(10) NOT NULL,
    `end_date` VARCHAR(10) NOT NULL,
    `rent_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `deposit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `billing_cycle` VARCHAR(16) NOT NULL DEFAULT 'MONTH',
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `park_leases_site_id_status_idx`(`site_id`, `status`),
    INDEX `park_leases_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `park_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `lease_id` INTEGER NOT NULL,
    `tenant_id` INTEGER NOT NULL,
    `bill_no` VARCHAR(32) NOT NULL,
    `period_start` VARCHAR(10) NOT NULL,
    `period_end` VARCHAR(10) NOT NULL,
    `due_date` VARCHAR(10) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `paid_at` DATETIME(3) NULL,
    `erp_receivable_id` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_bills_lease_id_period_start_key`(`lease_id`, `period_start`),
    INDEX `park_bills_site_id_status_due_date_idx`(`site_id`, `status`, `due_date`),
    INDEX `park_bills_site_id_tenant_id_idx`(`site_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
