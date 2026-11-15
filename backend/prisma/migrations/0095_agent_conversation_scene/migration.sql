-- 0095 会话按台面隔离（docs/Agent-Bot与Workbuddy主机方案.md §4.5）：
-- 主机对话与 Agent 会话共用 content_agent_conversations，但列表必须各看各的。
-- 新增 scene 区分台面（agent / workbuddy_host），并把已有主机对话回填过去，
-- 否则历史主机对话会继续出现在 Agent 的会话列表里。

ALTER TABLE `content_agent_conversations`
    ADD COLUMN `scene` VARCHAR(24) NOT NULL DEFAULT 'agent';

UPDATE `content_agent_conversations` `c`
    INNER JOIN `workbuddy_host_conversations` `w` ON `w`.`conversation_id` = `c`.`id`
SET `c`.`scene` = 'workbuddy_host';

CREATE INDEX `content_agent_conversations_user_id_scene_updated_at_idx`
    ON `content_agent_conversations`(`user_id`, `scene`, `updated_at`);
