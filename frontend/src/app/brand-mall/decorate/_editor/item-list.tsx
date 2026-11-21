"use client";
import { Button, Input, Space } from "antd";
import type { ReactNode } from "react";
import { ImageUrlField } from "@/components/ui/image-field";
import { linkOf } from "../../_components/diy-preview";
import { emptyLink, listOf } from "./model";
import { LinkPickerField } from "./link-picker";

/**
 * 组件属性里的 `items[]` 编辑器：图片广告 / 图片魔方 / 图标导航 / 底部导航共用一套行外壳。
 * 顺序即小程序端的展示顺序，所以只给上下移动，不给人工填序号。
 */

type Item = Record<string, unknown>;

const txt = (item: Item, key: string): string =>
  typeof item[key] === "string" ? (item[key] as string) : "";

function ItemRow({
  index,
  total,
  title,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  total: number;
  title: string;
  onMove: (offset: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border, #f0f0f0)",
        borderRadius: 8,
        padding: 8,
        display: "grid",
        gap: 6,
      }}
    >
      <Space wrap size={4} style={{ justifyContent: "space-between", width: "100%" }}>
        <span className="muted text-12">{title}</span>
        <Space size={0}>
          <Button size="small" type="text" disabled={index === 0} onClick={() => onMove(-1)}>
            上移
          </Button>
          <Button
            size="small"
            type="text"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
          >
            下移
          </Button>
          <Button size="small" type="text" danger onClick={onRemove}>
            删除
          </Button>
        </Space>
      </Space>
      {children}
    </div>
  );
}

/** 一组带「添加」按钮的条目列表：外壳统一处理增删改与上下移动。 */
function ItemsField({
  items,
  onChange,
  max,
  addText,
  makeBlank,
  rowTitle,
  renderItem,
}: {
  items: Item[];
  onChange: (items: Item[]) => void;
  max: number;
  addText: string;
  makeBlank: () => Item;
  rowTitle: (index: number) => string;
  renderItem: (item: Item, patch: (next: Item) => void, index: number) => ReactNode;
}) {
  const patchAt = (index: number, next: Item) =>
    onChange(items.map((item, position) => (position === index ? next : item)));

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onChange(next);
  };

  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      {items.map((item, index) => (
        <ItemRow
          // 行内容是受控的，用下标做 key：拿内容当 key 会让每次敲字都重挂整行、光标乱跳。
          key={`item-${index}`}
          index={index}
          total={items.length}
          title={rowTitle(index)}
          onMove={(offset) => move(index, offset)}
          onRemove={() => onChange(items.filter((_, position) => position !== index))}
        >
          {renderItem(item, (next) => patchAt(index, next), index)}
        </ItemRow>
      ))}
      <div>
        <Button
          size="small"
          disabled={items.length >= max}
          onClick={() => onChange([...items, makeBlank()])}
        >
          {addText}
        </Button>
        <span className="muted text-12" style={{ marginLeft: 8 }}>
          已用 {items.length}/{max}，顺序即小程序端展示顺序
        </span>
      </div>
    </Space>
  );
}

/** 图片 + 跳转：图片广告与图片魔方用。 */
export function ImageLinkItems({
  props,
  onChange,
  max,
  shopId,
}: {
  props: Item;
  onChange: (patch: Record<string, unknown>) => void;
  max: number;
  shopId: number;
}) {
  const items = listOf(props, "items");
  return (
    <ItemsField
      items={items}
      max={max}
      addText="添加图片"
      makeBlank={() => ({ image: "", link: emptyLink() })}
      rowTitle={(index) => `图 ${index + 1}`}
      onChange={(next) => onChange({ items: next })}
      renderItem={(item, patch) => (
        <>
          <ImageUrlField
            value={txt(item, "image")}
            size={64}
            onChange={(url) => patch({ ...item, image: url })}
          />
          <LinkPickerField
            shopId={shopId}
            value={linkOf(item.link)}
            onChange={(link) => patch({ ...item, link })}
          />
        </>
      )}
    />
  );
}

/** 图标 + 文字 + 跳转：图标导航用。 */
export function NavItems({
  props,
  onChange,
  max,
  shopId,
}: {
  props: Item;
  onChange: (patch: Record<string, unknown>) => void;
  max: number;
  shopId: number;
}) {
  const items = listOf(props, "items");
  return (
    <ItemsField
      items={items}
      max={max}
      addText="添加导航项"
      makeBlank={() => ({ icon: "", text: "", link: emptyLink() })}
      rowTitle={(index) => `入口 ${index + 1}`}
      onChange={(next) => onChange({ items: next })}
      renderItem={(item, patch) => (
        <>
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              size="small"
              style={{ width: 120 }}
              placeholder="文字"
              maxLength={8}
              value={txt(item, "text")}
              onChange={(event) => patch({ ...item, text: event.target.value })}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ImageUrlField
                value={txt(item, "icon")}
                size={44}
                placeholder="图标地址 https://…"
                onChange={(url) => patch({ ...item, icon: url })}
              />
            </div>
          </div>
          <LinkPickerField
            shopId={shopId}
            value={linkOf(item.link)}
            onChange={(link) => patch({ ...item, link })}
          />
        </>
      )}
    />
  );
}

/**
 * 底部导航（tabBar）项：契约字段是 `pagePath / text / iconPath / selectedIconPath`，
 * 与微信小程序 app.json 的 tabBar 同构，所以这里没有 link 对象。
 */
export function FootItems({
  props,
  onChange,
  max,
}: {
  props: Item;
  onChange: (patch: Record<string, unknown>) => void;
  max: number;
}) {
  const items = listOf(props, "items");
  return (
    <ItemsField
      items={items}
      max={max}
      addText="添加标签页"
      makeBlank={() => ({
        text: "",
        pagePath: "",
        iconPath: "",
        selectedIconPath: "",
      })}
      rowTitle={(index) => `标签 ${index + 1}`}
      onChange={(next) => onChange({ items: next })}
      renderItem={(item, patch) => (
        <>
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              size="small"
              style={{ width: 100 }}
              placeholder="文字"
              maxLength={6}
              value={txt(item, "text")}
              onChange={(event) => patch({ ...item, text: event.target.value })}
            />
            <Input
              size="small"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="页面路径 pages/index/index"
              value={txt(item, "pagePath")}
              onChange={(event) => patch({ ...item, pagePath: event.target.value.trim() })}
            />
          </div>
          <ImageUrlField
            value={txt(item, "iconPath")}
            size={44}
            placeholder="未选中图标地址"
            onChange={(url) => patch({ ...item, iconPath: url })}
          />
          <ImageUrlField
            value={txt(item, "selectedIconPath")}
            size={44}
            placeholder="选中后图标地址"
            onChange={(url) => patch({ ...item, selectedIconPath: url })}
          />
        </>
      )}
    />
  );
}
