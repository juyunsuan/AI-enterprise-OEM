-- 0098 Bot 主机：菜单与功能码从 workbuddy-hosts 收敛为 bot-hosts
-- 客户端已不再连接 WorkBuddy，产品名统一为「Bot 主机」；持久化表名保持不变，只改台账与用户偏好里的键值。

UPDATE `feature_catalog`
SET `code` = 'bot-hosts', `title` = 'Bot 主机', `path` = '/bot/hosts'
WHERE `code` = 'workbuddy-hosts';

UPDATE IGNORE `entitlement_quotas`
SET `feature_code` = 'bot-hosts'
WHERE `feature_code` = 'workbuddy-hosts';

UPDATE IGNORE `entitlement_usage`
SET `feature_code` = 'bot-hosts'
WHERE `feature_code` = 'workbuddy-hosts';

-- 用户自己关掉的侧栏叶子路径（账号级偏好，JSON 数组）
UPDATE `user_preferences`
SET `value` = CAST(REPLACE(CAST(`value` AS CHAR), '/workbuddy/hosts', '/bot/hosts') AS JSON)
WHERE `key` = 'nav.hiddenMenus'
  AND CAST(`value` AS CHAR) LIKE '%/workbuddy/hosts%';
