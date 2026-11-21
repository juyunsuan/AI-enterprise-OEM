-- 0123 品牌商城（B2C）：mall_* → brand_* 全量改名 + 场景 MALL→BRAND + 菜单码 mall→brand-mall。
-- 17 张表由 0118_mall 建立，此处一律 RENAME 保留本地测试数据，禁止 drop-create。
-- 索引名同步改前缀：Prisma 的默认索引名按映射表名生成，不改会与 schema 产生漂移。

ALTER TABLE `mall_shops` RENAME TO `brand_shops`;
ALTER TABLE `mall_categories` RENAME TO `brand_categories`;
ALTER TABLE `mall_products` RENAME TO `brand_products`;
ALTER TABLE `mall_product_skus` RENAME TO `brand_product_skus`;
ALTER TABLE `mall_express_companies` RENAME TO `brand_express_companies`;
ALTER TABLE `mall_product_reviews` RENAME TO `brand_product_reviews`;
ALTER TABLE `mall_customers` RENAME TO `brand_customers`;
ALTER TABLE `mall_customer_addresses` RENAME TO `brand_customer_addresses`;
ALTER TABLE `mall_customer_bills` RENAME TO `brand_customer_bills`;
ALTER TABLE `mall_cart_items` RENAME TO `brand_cart_items`;
ALTER TABLE `mall_orders` RENAME TO `brand_orders`;
ALTER TABLE `mall_order_items` RENAME TO `brand_order_items`;
ALTER TABLE `mall_order_logs` RENAME TO `brand_order_logs`;
ALTER TABLE `mall_refund_orders` RENAME TO `brand_refund_orders`;
ALTER TABLE `mall_coupons` RENAME TO `brand_coupons`;
ALTER TABLE `mall_coupon_tickets` RENAME TO `brand_coupon_tickets`;
ALTER TABLE `mall_diy_pages` RENAME TO `brand_diy_pages`;

ALTER TABLE `brand_shops` RENAME INDEX `mall_shops_shop_code_key` TO `brand_shops_shop_code_key`;
ALTER TABLE `brand_shops` RENAME INDEX `mall_shops_owner_user_id_status_idx` TO `brand_shops_owner_user_id_status_idx`;
ALTER TABLE `brand_shops` RENAME INDEX `mall_shops_enterprise_id_idx` TO `brand_shops_enterprise_id_idx`;
ALTER TABLE `brand_categories` RENAME INDEX `mall_categories_shop_id_parent_id_sort_order_idx` TO `brand_categories_shop_id_parent_id_sort_order_idx`;
ALTER TABLE `brand_products` RENAME INDEX `mall_products_shop_id_status_sort_order_idx` TO `brand_products_shop_id_status_sort_order_idx`;
ALTER TABLE `brand_products` RENAME INDEX `mall_products_shop_id_category_id_idx` TO `brand_products_shop_id_category_id_idx`;
ALTER TABLE `brand_products` RENAME INDEX `mall_products_owner_user_id_idx` TO `brand_products_owner_user_id_idx`;
ALTER TABLE `brand_product_skus` RENAME INDEX `mall_product_skus_product_id_idx` TO `brand_product_skus_product_id_idx`;
ALTER TABLE `brand_product_skus` RENAME INDEX `mall_product_skus_shop_id_unique_id_idx` TO `brand_product_skus_shop_id_unique_id_idx`;
ALTER TABLE `brand_express_companies` RENAME INDEX `mall_express_companies_shop_id_enabled_sort_order_idx` TO `brand_express_companies_shop_id_enabled_sort_order_idx`;
ALTER TABLE `brand_product_reviews` RENAME INDEX `mall_product_reviews_shop_id_status_created_at_idx` TO `brand_product_reviews_shop_id_status_created_at_idx`;
ALTER TABLE `brand_product_reviews` RENAME INDEX `mall_product_reviews_product_id_status_idx` TO `brand_product_reviews_product_id_status_idx`;
ALTER TABLE `brand_product_reviews` RENAME INDEX `mall_product_reviews_customer_id_idx` TO `brand_product_reviews_customer_id_idx`;
ALTER TABLE `brand_customers` RENAME INDEX `mall_customers_shop_id_phone_idx` TO `brand_customers_shop_id_phone_idx`;
ALTER TABLE `brand_customers` RENAME INDEX `mall_customers_shop_id_created_at_idx` TO `brand_customers_shop_id_created_at_idx`;
ALTER TABLE `brand_customers` RENAME INDEX `mall_customers_shop_openid_uniq` TO `brand_customers_shop_openid_uniq`;
ALTER TABLE `brand_customer_addresses` RENAME INDEX `mall_customer_addresses_shop_id_customer_id_idx` TO `brand_customer_addresses_shop_id_customer_id_idx`;
ALTER TABLE `brand_customer_bills` RENAME INDEX `mall_customer_bills_shop_id_customer_id_id_idx` TO `brand_customer_bills_shop_id_customer_id_id_idx`;
ALTER TABLE `brand_cart_items` RENAME INDEX `mall_cart_items_shop_id_customer_id_idx` TO `brand_cart_items_shop_id_customer_id_idx`;
ALTER TABLE `brand_cart_items` RENAME INDEX `mall_cart_items_shop_customer_sku_uniq` TO `brand_cart_items_shop_customer_sku_uniq`;
ALTER TABLE `brand_orders` RENAME INDEX `mall_orders_order_no_key` TO `brand_orders_order_no_key`;
ALTER TABLE `brand_orders` RENAME INDEX `mall_orders_shop_id_status_created_at_idx` TO `brand_orders_shop_id_status_created_at_idx`;
ALTER TABLE `brand_orders` RENAME INDEX `mall_orders_shop_id_customer_id_id_idx` TO `brand_orders_shop_id_customer_id_id_idx`;
ALTER TABLE `brand_orders` RENAME INDEX `mall_orders_shop_id_expire_at_idx` TO `brand_orders_shop_id_expire_at_idx`;
ALTER TABLE `brand_orders` RENAME INDEX `mall_orders_owner_user_id_idx` TO `brand_orders_owner_user_id_idx`;
ALTER TABLE `brand_order_items` RENAME INDEX `mall_order_items_order_id_idx` TO `brand_order_items_order_id_idx`;
ALTER TABLE `brand_order_items` RENAME INDEX `mall_order_items_shop_id_product_id_idx` TO `brand_order_items_shop_id_product_id_idx`;
ALTER TABLE `brand_order_logs` RENAME INDEX `mall_order_logs_order_id_id_idx` TO `brand_order_logs_order_id_id_idx`;
ALTER TABLE `brand_order_logs` RENAME INDEX `mall_order_logs_shop_id_created_at_idx` TO `brand_order_logs_shop_id_created_at_idx`;
ALTER TABLE `brand_refund_orders` RENAME INDEX `mall_refund_orders_refund_no_key` TO `brand_refund_orders_refund_no_key`;
ALTER TABLE `brand_refund_orders` RENAME INDEX `mall_refund_orders_shop_id_status_created_at_idx` TO `brand_refund_orders_shop_id_status_created_at_idx`;
ALTER TABLE `brand_refund_orders` RENAME INDEX `mall_refund_orders_order_id_idx` TO `brand_refund_orders_order_id_idx`;
ALTER TABLE `brand_refund_orders` RENAME INDEX `mall_refund_orders_customer_id_idx` TO `brand_refund_orders_customer_id_idx`;
ALTER TABLE `brand_coupons` RENAME INDEX `mall_coupons_shop_id_status_created_at_idx` TO `brand_coupons_shop_id_status_created_at_idx`;
ALTER TABLE `brand_coupon_tickets` RENAME INDEX `mall_coupon_tickets_shop_id_customer_id_status_idx` TO `brand_coupon_tickets_shop_id_customer_id_status_idx`;
ALTER TABLE `brand_coupon_tickets` RENAME INDEX `mall_coupon_tickets_coupon_id_customer_id_idx` TO `brand_coupon_tickets_coupon_id_customer_id_idx`;
ALTER TABLE `brand_diy_pages` RENAME INDEX `mall_diy_pages_shop_id_type_status_idx` TO `brand_diy_pages_shop_id_type_status_idx`;

-- 场景收敛：同一主体不允许 MALL / BRAND 两名并存（令牌、凭据、出包台账都按 scene 隔离）。
UPDATE `miniprogram_apps` SET `scene` = 'BRAND' WHERE `scene` = 'MALL';
UPDATE `miniprogram_tenant_releases` SET `scene` = 'BRAND' WHERE `scene` = 'MALL';

-- 平台参数键随表域改名（旧键由电商工具早期版本写入）。
UPDATE `system_settings` SET `key` = 'brand_mall_platform_settings' WHERE `key` = 'mall_platform_settings';

-- 菜单码 mall → brand-mall：先清掉可能已由新代码种子写入的同名行，再改存量行，避免唯一键冲突。
DELETE FROM `feature_toggles` WHERE `code` = 'brand-mall';
UPDATE `feature_toggles` SET `code` = 'brand-mall' WHERE `code` = 'mall';
DELETE FROM `feature_catalog` WHERE `code` = 'brand-mall';
UPDATE `feature_catalog` SET `code` = 'brand-mall', `title` = '品牌商城', `path` = '/brand-mall', `sort_order` = 30 WHERE `code` = 'mall';
