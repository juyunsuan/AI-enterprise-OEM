-- 0114 Agent 群控（M4）：站内 Agent 定时任务要能把「到点这一轮可以指挥哪些设备」固定下来，
-- 决议 2 的「周一 9 点自动分析并拆单派单给设备」靠它才成立。
-- 与 skill_ids / connector_ids 同一口径：JSON 数组，空数组＝不开群控（存量任务全部按未开归档）。
ALTER TABLE `content_agent_schedules` ADD COLUMN `dispatch_scope` JSON NOT NULL;
