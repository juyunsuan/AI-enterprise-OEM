-- 0091 插件能力指纹与缺口清单（docs/Agent编排与插件能力契约方案.md §D0、§N18）：
-- 设备表补 `caps`（心跳上报的版本/协议/能力族/动作原语指纹）——派发门与决策提示词菜单
-- 的唯一依据：旧插件不再拿到只有新版才支持的动作，也不会被派到跑不动的任务。
-- 消息表补 (created_by, kind) 索引：kind='gap' 的能力缺口清单要按人拉取。
ALTER TABLE `rpa_chrome_devices`
    ADD COLUMN `caps` JSON NOT NULL DEFAULT (JSON_OBJECT());

-- 会话表补 `persist` / `table_id` / `landing`：采集产物去向（none/extract/table）是会话级口径，
-- 引擎据此在 harvest 成功后自动落台账或落多维表格，而不是让模型把行复述一遍。
-- landing 存落表口径（表名/表头/幂等锚），计划任务定时重跑靠它做到「同一次采集不产生重复行」。
ALTER TABLE `rpa_chrome_sessions`
    ADD COLUMN `persist` VARCHAR(16) NOT NULL DEFAULT 'none',
    ADD COLUMN `table_id` INT NOT NULL DEFAULT 0,
    ADD COLUMN `landing` JSON NULL;

ALTER TABLE `rpa_chrome_messages`
    ADD INDEX `rpa_chrome_messages_created_by_kind_idx`(`created_by`, `kind`);

-- 计划任务表补 `persist` / `table_id` / `landing`：定时重跑同一目标时，落表口径（目标表 + 表头 + 幂等锚）
-- 固定在计划里，每轮会话据此把收割结果幂等写回同一张表（docs/浏览器代理网页采集落表方案.md §D8）。
ALTER TABLE `rpa_chrome_schedules`
    ADD COLUMN `persist` VARCHAR(16) NOT NULL DEFAULT 'none',
    ADD COLUMN `table_id` INT NOT NULL DEFAULT 0,
    ADD COLUMN `landing` JSON NULL;
