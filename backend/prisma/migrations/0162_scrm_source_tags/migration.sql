-- SCRM 来源渠道标签：同一企微联系人可同时拥有多个小程序/站点来源标签。
-- 企微原生标签 external_id 仍唯一；本地自动标签 external_id 为空，用 local_key 做幂等键。

ALTER TABLE `scrm_tags`
    ADD COLUMN `local_key` VARCHAR(120) NOT NULL DEFAULT '';

ALTER TABLE `scrm_tags`
    DROP INDEX `scrm_tags_org_ext_key`;

CREATE UNIQUE INDEX `scrm_tags_org_ext_local_key`
    ON `scrm_tags`(`org_type`, `org_user_id`, `external_id`, `local_key`);