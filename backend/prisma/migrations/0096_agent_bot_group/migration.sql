-- 0096 「Agent-Bot」子分组（docs/Agent-Bot与Workbuddy主机方案.md）：
-- Workbuddy 企业版与 Workbuddy 主机收进同一子分组，主机排在前面。
-- 功能开关台账是懒播种、只补插不覆盖，存量行在这里定向改父级与排序；管理员改过的标题不动。
INSERT IGNORE INTO `feature_catalog`
  (`code`, `kind`, `parent_code`, `title`, `path`, `scope`, `protected`, `sort_order`)
VALUES
  ('agent-bot', 'GROUP', 'workbench', 'Agent-Bot', '', 'PLATFORM', 0, 25);

UPDATE `feature_catalog`
SET `parent_code` = 'agent-bot', `sort_order` = 10
WHERE `code` = 'workbuddy-hosts';

UPDATE `feature_catalog`
SET `parent_code` = 'agent-bot', `sort_order` = 20
WHERE `code` = 'workbuddy';
