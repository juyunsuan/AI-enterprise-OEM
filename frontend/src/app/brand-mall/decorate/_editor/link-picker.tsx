"use client";
import { AutoComplete, Button, Input, Select, Space } from "antd";
import { useState } from "react";
import type { BrandDiyLink, BrandLinkType } from "@enterprise/contracts";
import {
  LINK_TYPE_OPTIONS,
  PAGE_PATH_OPTIONS,
  WEBVIEW_TIP,
  emptyLink,
  linkSummary,
} from "./model";
import { CategorySelect, CouponPickerModal, ProductPickerModal } from "./pickers";

/**
 * 唯一的跳转链接选择器：`link` 形状在契约里是共享的
 * `{ type, name, path, targetId }`，图片广告/魔方/导航/活动页/底部导航都用这一份。
 *
 * PAGE 走 `path`（小程序页面路径），PRODUCT/CATEGORY/COUPON 走 `targetId` + 回填的 `name`，
 * WEBVIEW 走 `path`（完整 https 地址）。
 */
export function LinkPickerField({
  shopId,
  value,
  onChange,
}: {
  shopId: number;
  value?: BrandDiyLink;
  onChange: (link: BrandDiyLink) => void;
}) {
  const link = value ?? emptyLink();
  const [productOpen, setProductOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);

  const setType = (type: BrandLinkType) => {
    // 换类型时把不属于该类型的字段清掉，免得留下「有 id 没类型」的脏链接。
    onChange(type === "NONE" ? emptyLink() : { type, name: "", path: "", targetId: 0 });
  };

  return (
    <Space orientation="vertical" size={6} style={{ width: "100%" }}>
      <Space wrap size={6}>
        <Select
          size="small"
          style={{ width: 130 }}
          value={link.type}
          onChange={setType}
          options={LINK_TYPE_OPTIONS}
        />
        <span className="muted text-12">{linkSummary(link)}</span>
        {link.type !== "NONE" ? (
          <Button size="small" type="text" onClick={() => onChange(emptyLink())}>
            清除
          </Button>
        ) : null}
      </Space>

      {link.type === "PAGE" ? (
        <AutoComplete
          size="small"
          style={{ width: "100%" }}
          placeholder="小程序页面路径，如 pages/goods-list/index"
          value={link.path}
          options={PAGE_PATH_OPTIONS}
          onChange={(text: string) => {
            const hit = PAGE_PATH_OPTIONS.find((item) => item.value === text);
            onChange({ ...link, path: text.trim(), name: hit ? hit.label.split(" ")[0] : "" });
          }}
        />
      ) : null}

      {link.type === "WEBVIEW" ? (
        <Input
          size="small"
          placeholder="https://完整网址"
          value={link.path}
          onChange={(event) =>
            onChange({ ...link, path: event.target.value.trim(), name: "" })
          }
        />
      ) : null}

      {link.type === "PRODUCT" ? (
        <Button size="small" onClick={() => setProductOpen(true)}>
          {link.targetId ? `商品：${link.name || `#${link.targetId}`}` : "选择商品"}
        </Button>
      ) : null}

      {link.type === "COUPON" ? (
        <Button size="small" onClick={() => setCouponOpen(true)}>
          {link.targetId ? `优惠券：${link.name || `#${link.targetId}`}` : "选择优惠券"}
        </Button>
      ) : null}

      {link.type === "CATEGORY" ? (
        <CategorySelect
          shopId={shopId}
          value={link.targetId}
          placeholder="选择要跳转的分类"
          onChange={(id, name) => onChange({ ...link, targetId: id, name, path: "" })}
        />
      ) : null}

      {link.type === "WEBVIEW" ? (
        <div className="muted text-12">{WEBVIEW_TIP}</div>
      ) : null}

      <ProductPickerModal
        open={productOpen}
        shopId={shopId}
        multi={false}
        selectedIds={link.targetId ? [link.targetId] : []}
        onCancel={() => setProductOpen(false)}
        onOk={(ids, label) => {
          onChange({ type: "PRODUCT", name: label, path: "", targetId: ids[0] ?? 0 });
          setProductOpen(false);
        }}
      />
      <CouponPickerModal
        open={couponOpen}
        shopId={shopId}
        multi={false}
        selectedIds={link.targetId ? [link.targetId] : []}
        onCancel={() => setCouponOpen(false)}
        onOk={(ids, label) => {
          onChange({ type: "COUPON", name: label, path: "", targetId: ids[0] ?? 0 });
          setCouponOpen(false);
        }}
      />
    </Space>
  );
}
