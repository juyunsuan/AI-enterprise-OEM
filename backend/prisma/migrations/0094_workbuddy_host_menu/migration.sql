-- 0094 板块改名收口（docs/Agent-Bot与Workbuddy主机方案.md）：
-- 「Workbuddy 企业云」统一为「Workbuddy 企业版」。功能开关台账是懒播种、只补插不覆盖，
-- 已入库的旧标题不会被种子树刷新，这里补一条定向改写：只改仍是旧默认标题的那一行，
-- 管理员自己改过的标题不动。
UPDATE `feature_catalog`
SET `title` = 'Workbuddy 企业版'
WHERE `code` = 'workbuddy' AND `title` = 'Workbuddy 企业云';
