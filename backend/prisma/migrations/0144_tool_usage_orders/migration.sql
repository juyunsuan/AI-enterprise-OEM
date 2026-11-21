-- 建站工具计量补「当日形成订单数」：为按订单数的额度与看板铺数据，只计量、不扣费。
-- 设计见 docs/架构优化落地执行方案（校准修订版）.md 第 3.3 节：
-- 计量事实统一落 tool_usage_daily（站主 × 工具 × 日），出账时才写 usage_events，避免同一事实存两份。

ALTER TABLE `tool_usage_daily`
    ADD COLUMN `orders` INTEGER NOT NULL DEFAULT 0 COMMENT '当日形成订单数（只计量不扣费）';
