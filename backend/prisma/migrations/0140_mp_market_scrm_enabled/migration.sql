-- 多店铺商城：市场级企业微信 SCRM 外发开关（B4）
ALTER TABLE `mp_markets` ADD COLUMN `scrm_enabled` BOOLEAN NOT NULL DEFAULT false;
