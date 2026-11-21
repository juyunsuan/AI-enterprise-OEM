-- 外卖门店接入 AI 客服：每店自动创建一个 service-desk 站点，C 端通过 deskEmbedUrl 打开。
ALTER TABLE `takeout_shops`
    ADD COLUMN `support_site_id` INTEGER NOT NULL DEFAULT 0;