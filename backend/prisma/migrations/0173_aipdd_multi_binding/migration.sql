-- AIPDD Key 支持一个用户绑定多把：通知按 Key 所属账号聚合，模型调用仍取最早绑定的可用 Key。
-- 存量数据每个用户只有一行，去掉 user_id 单列唯一约束、改为 (user_id, key_id) 复合唯一即可。
ALTER TABLE `user_aipdd_bindings`
    DROP INDEX `user_aipdd_bindings_user_id_key`;

CREATE UNIQUE INDEX `user_aipdd_bindings_user_id_key_id_key`
    ON `user_aipdd_bindings`(`user_id`, `key_id`);

CREATE INDEX `user_aipdd_bindings_user_id_idx`
    ON `user_aipdd_bindings`(`user_id`);
