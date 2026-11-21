-- 0138 租户 RBAC：主账号可创建子账号并限定可访问的业务模块；写操作统一留痕。

CREATE TABLE `sub_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `account_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `role_code` VARCHAR(16) NOT NULL,
    `scopes_json` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_by` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sub_accounts_account_id_key`(`account_id`),
    INDEX `sub_accounts_owner_user_id_status_idx`(`owner_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_operation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` VARCHAR(64) NOT NULL,
    `actor_user_id` VARCHAR(64) NOT NULL,
    `actor_name` VARCHAR(64) NOT NULL DEFAULT '',
    `sub_account_id` INTEGER NULL,
    `module` VARCHAR(24) NOT NULL DEFAULT '',
    `action` VARCHAR(12) NOT NULL,
    `method` VARCHAR(8) NOT NULL DEFAULT '',
    `path` VARCHAR(200) NOT NULL DEFAULT '',
    `status` VARCHAR(12) NOT NULL DEFAULT 'OK',
    `ip` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_operation_logs_owner_user_id_created_at_idx`(`owner_user_id`, `created_at`),
    INDEX `tenant_operation_logs_owner_user_id_module_idx`(`owner_user_id`, `module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
