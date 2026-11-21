-- 园区场地/会议室：复用 gaps.AppointmentEvent/Slot/Booking 的时段与并发占位，
-- 园区侧只存资源元数据与预约关联，不另造时段表。

CREATE TABLE `park_resources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `building_id` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'MEETING',
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `location` VARCHAR(200) NOT NULL DEFAULT '',
    `description` VARCHAR(2000) NOT NULL DEFAULT '',
    `cover` VARCHAR(500) NOT NULL DEFAULT '',
    `approval_required` TINYINT(1) NOT NULL DEFAULT true,
    `schedule` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `event_id` INTEGER NOT NULL DEFAULT 0,
    `slug` VARCHAR(48) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `park_resources_site_id_name_key`(`site_id`, `name`),
    INDEX `park_resources_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `park_reservations`
    ADD COLUMN `resource_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `event_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `slot_id` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `appointment_booking_id` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `park_reservations_site_id_resource_id_idx`
    ON `park_reservations`(`site_id`, `resource_id`);
