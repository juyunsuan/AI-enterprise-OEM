-- 0119 「私域小程序」菜单改版为「建站管理」卡片页（工作台）：
-- 分组 private-mini 下线，site-builder 单菜单承接；知识付费/上门服务/电商三卡挂到新父码，
-- 新增国际独立站卡片码（页面仍是营销工具页签，仅控卡片显隐）。
-- ensureSeed 只补插缺失 code、不改存量行，已有库按本脚本显式回填（与 0043/0044 菜单迁移同口径）。

INSERT INTO `feature_catalog` (`code`, `kind`, `parent_code`, `title`, `path`, `scope`, `protected`, `sort_order`, `updated_at`)
VALUES ('site-builder', 'MENU', 'workbench', '建站管理', '/site-builder', 'PLATFORM', 0, 62, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `kind` = 'MENU', `parent_code` = 'workbench', `title` = '建站管理', `path` = '/site-builder', `sort_order` = 62;

INSERT INTO `feature_catalog` (`code`, `kind`, `parent_code`, `title`, `path`, `scope`, `protected`, `sort_order`, `updated_at`)
VALUES ('global-site', 'MENU', 'site-builder', '国际独立站', '/marketing-tools?tab=international-site', 'PLATFORM', 0, 40, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `parent_code` = 'site-builder', `title` = '国际独立站', `path` = '/marketing-tools?tab=international-site', `sort_order` = 40;

UPDATE `feature_catalog` SET `parent_code` = 'site-builder', `title` = '知识付费小程序', `path` = '/knowledge-pay', `sort_order` = 10 WHERE `code` = 'knowledge-pay';
UPDATE `feature_catalog` SET `parent_code` = 'site-builder', `title` = '上门服务小程序', `path` = '/onsite', `sort_order` = 20 WHERE `code` = 'onsite';
UPDATE `feature_catalog` SET `parent_code` = 'site-builder', `title` = '电商平台小程序', `path` = '/mall', `sort_order` = 30 WHERE `code` = 'mall';

DELETE FROM `feature_catalog` WHERE `code` = 'private-mini';
