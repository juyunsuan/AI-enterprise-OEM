-- 0132 品牌商城 × AI 客服底座：商城开店即自动开通一个专属客服站点。
-- 店铺只存站点 id，不建外键、不建聊天表；站点被删或客服关掉时交易链路不受影响。

-- AlterTable
ALTER TABLE `brand_shops` ADD COLUMN `support_site_id` INTEGER NOT NULL DEFAULT 0;
