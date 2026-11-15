-- 平台模型来源：default＝跟随平台默认文本模型 / platform＝平台为本机授权 / client＝客户端改动同步上来
ALTER TABLE `workbuddy_host_model_grants`
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'platform';
