"use client";
import { Select, Space, Tag } from "antd";
import type { BrandShop } from "@enterprise/contracts";
import { BRAND_SHOP_STATUS_LABELS } from "@enterprise/contracts";

/**
 * 店铺切换器：全站唯一的 shopId 入口，页头右上角。
 * 带上状态徽标，避免切到一家被平台停服（SUSPENDED）的店后对着空列表发呆。
 */
export function ShopSwitcher({
  shops,
  value,
  onChange,
  loading = false,
}: {
  shops: BrandShop[];
  value: number;
  onChange: (shopId: number) => void;
  loading?: boolean;
}) {
  return (
    <Space size={6}>
      <span className="muted text-12">当前商城</span>
      <Select
        loading={loading}
        style={{ minWidth: 220 }}
        value={value || undefined}
        placeholder="选择商城"
        onChange={onChange}
        optionLabelProp="title"
        options={shops.map((shop) => ({
          value: shop.id,
          title: shop.name,
          label: (
            <Space size={6}>
              <span>{shop.name}</span>
              <Tag>{BRAND_SHOP_STATUS_LABELS[shop.status] ?? shop.status}</Tag>
            </Space>
          ),
        }))}
      />
    </Space>
  );
}
