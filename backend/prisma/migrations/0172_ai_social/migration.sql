-- 商务人脉整组切换为「AI社交」：社交与招聘全部由 AIworkin 的 DSH 社交插件提供，
-- 本站不再有本地社交/招聘实现，旧的两个菜单节点与它们的开关一并下线。
-- 「networking」分组保留，新的 ai-social 节点由 FeatureToggleService.ensureSeed 自动补插。
DELETE FROM `feature_toggles` WHERE `code` IN ('social', 'hiring');
DELETE FROM `feature_catalog` WHERE `code` IN ('social', 'hiring');
