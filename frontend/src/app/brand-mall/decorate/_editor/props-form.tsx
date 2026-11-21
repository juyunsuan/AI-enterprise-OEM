"use client";
import { Button, ColorPicker, Input, InputNumber, Select, Space, Switch } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import type { BrandDiyComponent } from "@enterprise/contracts";
import { propBool, propNum, propStr } from "../../_components/diy-preview";
import { HtmlField } from "../../_components/html-field";
import { ImageUrlField } from "@/components/ui/image-field";
import {
  ASSIST_MODES,
  COUPON_STYLES,
  CUBE_LAYOUTS,
  GOODS_SOURCES,
  GOODS_STYLES,
  IMAGE_ADS_MODES,
  SPACER_COLORS,
  TITLE_ALIGNS,
  patchProps,
} from "./model";
import { FootItems, ImageLinkItems, NavItems } from "./item-list";
import {
  CategorySelect,
  CouponPickerModal,
  IdsPickerButton,
  ProductPickerModal,
} from "./pickers";

/**
 * 选中组件的属性面板：按 14 个白名单类型分表单。
 *
 * 属性都是受控 state（items[] 是嵌套数组，antd Form 表达起来更绕），
 * 面板本身用 `key` 随选中项重建，避免上一个组件的输入残留。
 */

type Props = Record<string, unknown>;

export function Field({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
      {extra ? (
        <div className="muted text-12" style={{ marginTop: 4 }}>
          {extra}
        </div>
      ) : null}
    </div>
  );
}

/** 尺寸类属性按小程序 750rpx 设计稿存，面板里标注单位，别让人按 px 填。 */
export function SizeField({
  label,
  value,
  min,
  max,
  step = 4,
  unit = "rpx",
  extra,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  extra?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={`${label}（${unit}）`} extra={extra}>
      <InputNumber
        size="small"
        min={min}
        max={max}
        step={step}
        style={{ width: 140 }}
        value={value}
        onChange={(next) => onChange(Number(next ?? min))}
      />
    </Field>
  );
}

function ToggleField({
  label,
  value,
  extra,
  onChange,
}: {
  label: string;
  value: boolean;
  extra?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field label={label} extra={extra}>
      <Switch size="small" checked={value} onChange={onChange} />
    </Field>
  );
}

/** 颜色：预设值（含 transparent）与自定义色板并存，transparent 交给 ColorPicker 会显示成黑色。 */
export function ColorField({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets?: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
  return (
    <Field label={label}>
      <Space wrap size={6}>
        <ColorPicker
          size="small"
          format="hex"
          showText
          disabled={!isHex}
          value={isHex ? value : "#ffffff"}
          onChangeComplete={(color) => onChange(color.toHexString())}
        />
        {presets?.length ? (
          <Select
            size="small"
            style={{ width: 150 }}
            value={presets.some((item) => item.value === value) ? value : undefined}
            placeholder="预设"
            onChange={onChange}
            options={presets}
          />
        ) : null}
        <Input
          size="small"
          style={{ width: 110 }}
          value={value}
          maxLength={30}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      </Space>
    </Field>
  );
}

const idsOf = (props: Props, key: string): number[] =>
  Array.isArray(props[key])
    ? (props[key] as unknown[])
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    : [];

/** 单个组件的属性表单入口：`onChange` 收到的是整条组件（id/type 不变，props 已合并）。 */
export function WidgetPropsForm({
  shopId,
  component,
  title,
  onChange,
}: {
  shopId: number;
  component: BrandDiyComponent;
  title: string;
  onChange: (next: BrandDiyComponent) => void;
}) {
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [couponPickerOpen, setCouponPickerOpen] = useState(false);
  const props = (component.props ?? {}) as Props;
  const set = (patch: Record<string, unknown>) => onChange(patchProps(component, patch));
  const text = (key: string, fallback = "") => propStr(props, key, fallback);
  const number = (key: string, fallback = 0) => propNum(props, key, fallback);
  const flag = (key: string, fallback = false) => propBool(props, key, fallback);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="muted text-12">
          {component.type} · 实例 id {component.id}
        </div>
      </div>

      {component.type === "searchBar" ? (
        <>
          <Field label="占位文案" extra="搜索框里的灰字，顾客端点它跳搜索页">
            <Input
              size="small"
              maxLength={20}
              value={text("placeholder", "搜索商品")}
              onChange={(event) => set({ placeholder: event.target.value })}
            />
          </Field>
          <ToggleField
            label="禁用输入"
            value={flag("disabled", true)}
            extra="开启后搜索框只展示样式、不接受输入（多数店铺会跳独立搜索页，保持开启）"
            onChange={(value) => set({ disabled: value })}
          />
          <SizeField
            label="圆角"
            value={number("radius", 28)}
            min={0}
            max={40}
            onChange={(value) => set({ radius: value })}
          />
        </>
      ) : null}

      {component.type === "imageAds" ? (
        <>
          <Field label="展示方式">
            <Select
              size="small"
              style={{ width: 160 }}
              value={text("mode", "swiper")}
              onChange={(value: string) => set({ mode: value })}
              options={IMAGE_ADS_MODES}
            />
          </Field>
          <SizeField
            label="高度"
            value={number("height", 320)}
            min={120}
            max={800}
            step={20}
            onChange={(value) => set({ height: value })}
          />
          <SizeField
            label="切换间隔"
            unit="秒"
            step={1}
            value={number("interval", 4)}
            min={1}
            max={10}
            extra="仅轮播方式生效"
            onChange={(value) => set({ interval: value })}
          />
          <SizeField
            label="左右边距"
            value={number("gutter", 16)}
            min={0}
            max={40}
            onChange={(value) => set({ gutter: value })}
          />
          <SizeField
            label="圆角"
            value={number("radius", 12)}
            min={0}
            max={40}
            onChange={(value) => set({ radius: value })}
          />
          <Field label="图片与跳转">
            <ImageLinkItems props={props} max={8} shopId={shopId} onChange={set} />
          </Field>
        </>
      ) : null}

      {component.type === "imageCube" ? (
        <>
          <Field label="布局">
            <Select
              size="small"
              style={{ width: 180 }}
              value={text("layout", "FOUR")}
              onChange={(value: string) => set({ layout: value })}
              options={CUBE_LAYOUTS}
            />
          </Field>
          <SizeField
            label="格间距"
            value={number("gutter", 8)}
            min={0}
            max={32}
            onChange={(value) => set({ gutter: value })}
          />
          <SizeField
            label="圆角"
            value={number("radius", 8)}
            min={0}
            max={40}
            onChange={(value) => set({ radius: value })}
          />
          <Field label="图片与跳转">
            <ImageLinkItems
              props={props}
              max={text("layout", "FOUR") === "FOUR" ? 4 : 2}
              shopId={shopId}
              onChange={set}
            />
          </Field>
        </>
      ) : null}

      {component.type === "nav" ? (
        <>
          <Field label="每行个数" extra="导航项按每行个数自动换行">
            <InputNumber
              size="small"
              min={2}
              max={6}
              style={{ width: 120 }}
              value={number("columns", 4)}
              onChange={(next) => set({ columns: Number(next ?? 4) })}
            />
          </Field>
          <Field label="导航项">
            <NavItems props={props} max={20} shopId={shopId} onChange={set} />
          </Field>
        </>
      ) : null}

      {component.type === "notice" ? (
        <>
          <Field label="公告文案">
            <Input
              size="small"
              maxLength={80}
              value={text("text")}
              placeholder="例如：全场满 99 包邮"
              onChange={(event) => set({ text: event.target.value })}
            />
          </Field>
          <Field label="左侧图标（图片地址）">
            <ImageUrlField
              value={text("icon")}
              size={44}
              placeholder="图标地址，留空用默认喇叭"
              onChange={(url) => set({ icon: url })}
            />
          </Field>
          <SizeField
            label="滚动速度"
            unit="秒/圈"
            step={1}
            value={number("speed", 60)}
            min={5}
            max={200}
            extra="数值越小滚得越快"
            onChange={(value) => set({ speed: value })}
          />
        </>
      ) : null}

      {component.type === "title" ? (
        <>
          <Field label="主标题">
            <Input
              size="small"
              maxLength={20}
              value={text("main", "标题")}
              onChange={(event) => set({ main: event.target.value })}
            />
          </Field>
          <Field label="副标题" extra="留空则只显示主标题">
            <Input
              size="small"
              maxLength={30}
              value={text("sub")}
              onChange={(event) => set({ sub: event.target.value })}
            />
          </Field>
          <Field label="对齐">
            <Select
              size="small"
              style={{ width: 140 }}
              value={text("align", "left")}
              onChange={(value: string) => set({ align: value })}
              options={TITLE_ALIGNS}
            />
          </Field>
          <ToggleField
            label="加粗"
            value={flag("bold", true)}
            onChange={(value) => set({ bold: value })}
          />
        </>
      ) : null}

      {component.type === "richText" ? (
        <Field
          label="富文本内容"
          extra="只保留小程序 rich-text 认得的标签；图片填地址，别贴 base64"
        >
          <HtmlField value={text("html")} onChange={(html) => set({ html })} minHeight={160} />
        </Field>
      ) : null}

      {component.type === "goodsList" ? (
        <>
          <Field label="数据来源" extra="推荐/分类/全部由小程序端现查，装修里不存商品快照">
            <Select
              size="small"
              style={{ width: 200 }}
              value={text("source", "RECOMMEND")}
              onChange={(value: string) => set({ source: value })}
              options={GOODS_SOURCES}
            />
          </Field>
          {text("source", "RECOMMEND") === "CATEGORY" ? (
            <Field label="分类" extra="选「全部分类」时取一级分类下的商品">
              <CategorySelect
                shopId={shopId}
                allowAll
                value={number("categoryId", 0)}
                onChange={(id) => set({ categoryId: id })}
              />
            </Field>
          ) : null}
          {text("source", "RECOMMEND") === "MANUAL" ? (
            <Field label="手动选品" extra="顺序不影响端上排序，端上按商品自身排序取前 N 个">
              <IdsPickerButton
                count={idsOf(props, "productIds").length}
                noun="个商品"
                onClick={() => setProductPickerOpen(true)}
              />
              <Button
                size="small"
                type="text"
                danger
                style={{ marginLeft: 6 }}
                disabled={!idsOf(props, "productIds").length}
                onClick={() => set({ productIds: [] })}
              >
                清空
              </Button>
            </Field>
          ) : null}
          <SizeField
            label="最多显示"
            unit="个"
            step={1}
            value={number("limit", 10)}
            min={1}
            max={60}
            onChange={(value) => set({ limit: value })}
          />
          <Field label="样式">
            <Select
              size="small"
              style={{ width: 180 }}
              value={text("style", "CARD")}
              onChange={(value: string) => set({ style: value })}
              options={GOODS_STYLES}
            />
          </Field>
          {text("style", "CARD") === "CARD" ? (
            <Field label="每行列数">
              <InputNumber
                size="small"
                min={1}
                max={3}
                style={{ width: 120 }}
                value={number("columns", 2)}
                onChange={(next) => set({ columns: Number(next ?? 2) })}
              />
            </Field>
          ) : null}
          <ToggleField
            label="显示商品名"
            value={flag("showTitle", true)}
            onChange={(value) => set({ showTitle: value })}
          />
          <ToggleField
            label="显示副标题"
            value={flag("showSubtitle", false)}
            onChange={(value) => set({ showSubtitle: value })}
          />
          <ToggleField
            label="显示价格"
            value={flag("showPrice", true)}
            onChange={(value) => set({ showPrice: value })}
          />
          <ToggleField
            label="显示销量"
            value={flag("showSales", true)}
            onChange={(value) => set({ showSales: value })}
          />
        </>
      ) : null}

      {component.type === "categoryLine" ? (
        <SizeField
          label="最多显示分类数"
          unit="个"
          step={1}
          value={number("limit", 10)}
          min={1}
          max={20}
          extra="取启用中的一级分类，横向滑动"
          onChange={(value) => set({ limit: value })}
        />
      ) : null}

      {component.type === "coupon" ? (
        <>
          <Field
            label="指定优惠券"
            extra="不选时小程序端自动取当前可领取的前几张"
          >
            <IdsPickerButton
              count={idsOf(props, "couponIds").length}
              noun="张券"
              onClick={() => setCouponPickerOpen(true)}
            />
            <Button
              size="small"
              type="text"
              danger
              style={{ marginLeft: 6 }}
              disabled={!idsOf(props, "couponIds").length}
              onClick={() => set({ couponIds: [] })}
            >
              清空
            </Button>
          </Field>
          <Field label="样式">
            <Select
              size="small"
              style={{ width: 180 }}
              value={text("style", "TWO")}
              onChange={(value: string) => set({ style: value })}
              options={COUPON_STYLES}
            />
          </Field>
        </>
      ) : null}

      {component.type === "storeHead" ? (
        <>
          <ToggleField
            label="显示店铺 Logo"
            value={flag("showLogo", true)}
            onChange={(value) => set({ showLogo: value })}
          />
          <ToggleField
            label="显示店铺简介"
            value={flag("showSlogan", true)}
            extra="简介内容在「店铺设置」里填，这里只控制显隐"
            onChange={(value) => set({ showSlogan: value })}
          />
          <ToggleField
            label="显示客服电话"
            value={flag("showPhone", true)}
            extra="号码同样来自「店铺设置」"
            onChange={(value) => set({ showPhone: value })}
          />
        </>
      ) : null}

      {component.type === "assist" ? (
        <>
          <Field label="辅助方式">
            <Select
              size="small"
              style={{ width: 200 }}
              value={text("mode", "PHONE")}
              onChange={(value: string) => set({ mode: value })}
              options={ASSIST_MODES}
            />
          </Field>
          <Field label="按钮文案">
            <Input
              size="small"
              maxLength={12}
              value={text("label", "联系客服")}
              onChange={(event) => set({ label: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      {component.type === "spacer" ? (
        <>
          <SizeField
            label="高度"
            value={number("height", 12)}
            min={0}
            max={200}
            step={2}
            onChange={(value) => set({ height: value })}
          />
          <ColorField
            label="颜色"
            value={text("color", "transparent")}
            presets={SPACER_COLORS}
            onChange={(value) => set({ color: value })}
          />
        </>
      ) : null}

      {component.type === "pageFoot" ? (
        <Field
          label="底部标签页"
          extra="与小程序 tabBar 同构，最多 5 项；图标建议 81×81、不超过 40KB"
        >
          <FootItems props={props} max={5} onChange={set} />
        </Field>
      ) : null}

      <ProductPickerModal
        open={productPickerOpen}
        shopId={shopId}
        selectedIds={idsOf(props, "productIds")}
        onCancel={() => setProductPickerOpen(false)}
        onOk={(ids) => {
          set({ productIds: ids });
          setProductPickerOpen(false);
        }}
      />
      <CouponPickerModal
        open={couponPickerOpen}
        shopId={shopId}
        selectedIds={idsOf(props, "couponIds")}
        onCancel={() => setCouponPickerOpen(false)}
        onOk={(ids) => {
          set({ couponIds: ids });
          setCouponPickerOpen(false);
        }}
      />
    </div>
  );
}
