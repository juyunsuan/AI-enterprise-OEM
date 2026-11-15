CREATE TABLE `workbuddy_host_model_grants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `host_id` INTEGER NOT NULL,
    `channel_id` INTEGER NOT NULL,
    `model` VARCHAR(128) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `workbuddy_host_model_grants_host_id_key`(`host_id`),
    INDEX `workbuddy_host_model_grants_user_id_enabled_idx`(`user_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;