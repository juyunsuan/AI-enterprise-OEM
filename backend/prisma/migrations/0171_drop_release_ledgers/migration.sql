-- 统一源码包直下后，发布台账与代传凭据全部下线：
-- 平台版、租户版与知识付费的代码包台账不再使用；小程序主体不再保存代码上传密钥。
-- 幂等：本地/线上若已手工清过列，这里只跳过，不阻断后续迁移。

DROP TABLE IF EXISTS `miniprogram_releases`;
DROP TABLE IF EXISTS `miniprogram_tenant_releases`;
DROP TABLE IF EXISTS `knowledge_pay_releases`;

SET @drop_mini_upload_key = (
    SELECT IF(COUNT(*) > 0,
        'ALTER TABLE `miniprogram_apps` DROP COLUMN `upload_key_cipher`',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'miniprogram_apps'
      AND COLUMN_NAME = 'upload_key_cipher'
);
PREPARE stmt_mini_upload_key FROM @drop_mini_upload_key;
EXECUTE stmt_mini_upload_key;
DEALLOCATE PREPARE stmt_mini_upload_key;

SET @drop_mini_robot = (
    SELECT IF(COUNT(*) > 0,
        'ALTER TABLE `miniprogram_apps` DROP COLUMN `robot`',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'miniprogram_apps'
      AND COLUMN_NAME = 'robot'
);
PREPARE stmt_mini_robot FROM @drop_mini_robot;
EXECUTE stmt_mini_robot;
DEALLOCATE PREPARE stmt_mini_robot;

SET @drop_kp_upload_key = (
    SELECT IF(COUNT(*) > 0,
        'ALTER TABLE `knowledge_pay_sites` DROP COLUMN `wx_upload_key`',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'knowledge_pay_sites'
      AND COLUMN_NAME = 'wx_upload_key'
);
PREPARE stmt_kp_upload_key FROM @drop_kp_upload_key;
EXECUTE stmt_kp_upload_key;
DEALLOCATE PREPARE stmt_kp_upload_key;
