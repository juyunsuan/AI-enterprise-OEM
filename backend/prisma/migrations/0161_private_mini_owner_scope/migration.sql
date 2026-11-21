-- 自营小程序主体与出包台账：账号级场景（快递/圈子）shopId=0，
-- 唯一键必须带 ownerUserId；否则全平台同场景共用一个 AppID/商户号。
-- 历史行均已带 owner_user_id，直接替换唯一键即可。

ALTER TABLE `miniprogram_apps`
    DROP INDEX `miniprogram_apps_scene_shop_id_key`;

CREATE UNIQUE INDEX `miniprogram_apps_owner_scene_shop_uniq`
    ON `miniprogram_apps`(`owner_user_id`, `scene`, `shop_id`);

ALTER TABLE `miniprogram_tenant_releases`
    DROP INDEX `miniprogram_tenant_releases_scene_shop_id_version_channel_key`;

CREATE UNIQUE INDEX `mpr_owner_scene_shop_version_channel_uniq`
    ON `miniprogram_tenant_releases`(`owner_user_id`, `scene`, `shop_id`, `version`, `channel`);