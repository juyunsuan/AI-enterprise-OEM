"use client";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Button, Space } from "antd";
import { useState } from "react";
import type { BrandDiyComponent, BrandDiyWidgetMeta } from "@enterprise/contracts";
import {
  DIY_VIEWPORT_WIDTH,
  DiyBlock,
  normalizeDiyStyles,
} from "../../_components/diy-preview";
import { widgetName } from "./model";

/**
 * 手机预览画布：375px 视口 + 外壳，渲染的是**当前草稿**（未保存也实时反映）。
 *
 * 块级工具条（选中/上下移动/复制/删除）是编辑器专属，所以这里逐块套外壳，
 * 组件本体交给 `DiyBlock` 画 —— 顾客端预览页可以整页用 `DiyPreview`，两者共用同一套渲染。
 */
export function EditorCanvas({
  components,
  styles,
  widgets,
  selectedId,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: {
  components: BrandDiyComponent[];
  styles: unknown;
  widgets: BrandDiyWidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (index: number, offset: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pageStyles = normalizeDiyStyles(styles);

  return (
    <div style={{ width: DIY_VIEWPORT_WIDTH + 20, margin: "0 auto" }}>
      <div
        style={{
          border: "10px solid #14161a",
          borderRadius: 30,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 10px 30px rgba(15,23,42,.18)",
        }}
      >
        <div
          style={{
            background: pageStyles.headerColor,
            color: "#fff",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
          }}
        >
          <span>9:41</span>
          <span className="muted text-12" style={{ color: "rgba(255,255,255,.85)" }}>
            小程序
          </span>
          {/* 微信右上角胶囊按钮的示意，纯装饰 */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(255,255,255,.55)",
              borderRadius: 12,
              padding: "1px 8px",
              color: "#fff",
            }}
          >
            <span aria-hidden>⋯</span>
            <span aria-hidden style={{ fontWeight: 700 }}>◉</span>
          </span>
        </div>
        <div
          onClick={() => onSelect(null)}
          style={{
            height: 560,
            overflowY: "auto",
            background: pageStyles.backgroundColor,
            backgroundImage: pageStyles.backgroundImage
              ? `url(${pageStyles.backgroundImage})`
              : undefined,
            backgroundSize: "100% auto",
            backgroundRepeat: "no-repeat",
            paddingTop: pageStyles.paddingTop,
            boxSizing: "border-box",
          }}
        >
          {components.length ? null : (
            <div
              style={{
                padding: "48px 20px",
                textAlign: "center",
                color: "#9aa0aa",
                fontSize: 12,
                lineHeight: 1.8,
              }}
            >
              这份页面还是空的。
              <br />
              点左侧组件库即可加入第一个组件。
            </div>
          )}
          {components.map((component, index) => {
            const selected = component.id === selectedId;
            const hovered = component.id === hoverId;
            return (
              <div
                key={component.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(component.id);
                }}
                onMouseEnter={() => setHoverId(component.id)}
                onMouseLeave={() => setHoverId((current) => (current === component.id ? null : current))}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  outline: selected
                    ? "2px solid #1677ff"
                    : hovered
                      ? "1px dashed #91b6ff"
                      : "2px solid transparent",
                  outlineOffset: -2,
                  background: selected ? "rgba(22,119,255,.05)" : undefined,
                }}
              >
                <DiyBlock component={component} mode="edit" />
                {selected ? (
                  <Space
                    size={0}
                    wrap={false}
                    style={{
                      position: "absolute",
                      right: 2,
                      top: 2,
                      zIndex: 2,
                      background: "rgba(255,255,255,.92)",
                      borderRadius: 6,
                      padding: "0 2px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.15)",
                    }}
                  >
                    <span
                      className="muted text-12"
                      style={{ padding: "0 4px", whiteSpace: "nowrap" }}
                    >
                      {widgetName(widgets, component.type)}
                    </span>
                    <Button
                      size="small"
                      type="text"
                      aria-label="上移"
                      icon={<ArrowUpOutlined aria-hidden />}
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(index, -1);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      aria-label="下移"
                      icon={<ArrowDownOutlined aria-hidden />}
                      disabled={index === components.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(index, 1);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      aria-label="复制此组件"
                      icon={<CopyOutlined aria-hidden />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDuplicate(index);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label="删除此组件"
                      icon={<DeleteOutlined aria-hidden />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(index);
                      }}
                    />
                  </Space>
                ) : null}
              </div>
            );
          })}
        </div>
        <div
          style={{
            height: 18,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              width: 110,
              height: 4,
              borderRadius: 2,
              background: "#e3e5e9",
            }}
          />
        </div>
      </div>
      <div className="muted text-12" style={{ textAlign: "center", marginTop: 8 }}>
        预览宽 {DIY_VIEWPORT_WIDTH}px（小程序 750rpx 设计稿的一半）；点组件即可在右侧改属性
      </div>
    </div>
  );
}
