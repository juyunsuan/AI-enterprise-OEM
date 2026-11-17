-- 0110 Agent 插件功能下线（方案 docs/Agent群控（替换插件页签）产品设计方案.md 决议 D1：彻底下线）。
-- 删表不可逆：执行前先把 content_agent_plugins 整表导出备份，随发布说明归档。
-- 迁移路径：插件包内容改传技能页签（zip + SKILL.md）。

-- 清理指向插件表的留痕行（审查台账与历史版本快照），避免留下无法解释的孤儿记录
DELETE FROM `skill_review_runs` WHERE `kind` = 'plugin';
DELETE FROM `content_agent_revisions` WHERE `kind` = 'plugin';

-- 定时任务不再固定引用插件
ALTER TABLE `content_agent_schedules` DROP COLUMN `plugin_ids`;

DROP TABLE IF EXISTS `content_agent_plugins`;
