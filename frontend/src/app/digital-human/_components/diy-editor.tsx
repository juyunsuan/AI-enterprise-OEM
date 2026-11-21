"use client";

// 首页装修编辑器：白名单组件的增删排序 + 分类型字段，保存时随站点设置整份提交。
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Button, Input, InputNumber, Select, Space } from "antd";
import {
  DH_DIY_WIDGET_LABELS,
  DH_DIY_WIDGET_TYPES,
  type DhDiyComponent,
  type DhDiyItem,
  type DhDiyPage,
} from "@enterprise/contracts";
import { ImageUploadField } from "./shared";

type WidgetType = (typeof DH_DIY_WIDGET_TYPES)[number];

const ITEM_WIDGETS: WidgetType[] = ["swiper", "images", "buttons"];

let seq = 0;
function newId(): string {
  seq += 1;
  return `w${Date.now().toString(36)}${seq}`;
}

function emptyComponent(type: WidgetType): DhDiyComponent {
  return {
    id: newId(),
    type,
    title: type === "title" ? "标题" : "",
    height: type === "blank" ? 24 : type === "swiper" ? 320 : 0,
    radius: 12,
    items: ITEM_WIDGETS.includes(type)
      ? [{ image: "", text: "", link: "" }]
      : [],
  };
}

function samplePage(): DhDiyPage {
  return {
    components: [
      emptyComponent("swiper"),
      emptyComponent("buttons"),
      emptyComponent("title"),
      emptyComponent("blank"),
    ],
  };
}

export function DiyEditor({
  value,
  onChange,
}: {
  value: DhDiyPage;
  onChange: (next: DhDiyPage) => void;
}) {
  const components = value.components ?? [];

  const patchAt = (index: number, next: DhDiyComponent) =>
    onChange({
      components: components.map((item, i) => (i === index ? next : item)),
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    const moved = next.splice(index, 1)[0];
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange({ components: next });
  };

  const patchItem = (
    component: DhDiyComponent,
    itemIndex: number,
    patch: Partial<DhDiyItem>,
  ) =>
    component.items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item));

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Select
          style={{ width: 150 }}
          placeholder="选择组件类型"
          options={DH_DIY_WIDGET_TYPES.map((type) => ({
            value: type,
            label: DH_DIY_WIDGET_LABELS[type],
          }))}
          value={null}
          onChange={(type: WidgetType) =>
            onChange({ components: [...components, emptyComponent(type)] })
          }
        />
        <Button size="small" onClick={() => onChange(samplePage())}>
          套用示例模板
        </Button>
        <Button
          size="small"
          disabled={!components.length}
          onClick={() => onChange({ components: [] })}
        >
          清空装修
        </Button>
      </Space>

      {components.length === 0 ? (
        <span className="muted text-12">
          未配置组件时，小程序首页按默认功能入口布局展示。
        </span>
      ) : null}

      {components.map((component, index) => (
        <div
          key={component.id}
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <Space size={8} wrap style={{ marginBottom: 8 }}>
            <strong>
              {index + 1}. {DH_DIY_WIDGET_LABELS[component.type] ?? component.type}
            </strong>
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === components.length - 1}
              onClick={() => move(index, 1)}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                onChange({ components: components.filter((_, i) => i !== index) })
              }
            />
          </Space>

          <Space size={10} wrap>
            {component.type === "title" ? (
              <label>
                标题文字
                <Input
                  value={component.title}
                  maxLength={60}
                  style={{ width: 220 }}
                  onChange={(event) =>
                    patchAt(index, { ...component, title: event.target.value })
                  }
                />
              </label>
            ) : null}
            {component.type === "blank" || component.type === "swiper" || component.type === "buttons" ? (
              <label>
                高度（rpx，0 为自适应）
                <InputNumber
                  min={0}
                  max={2000}
                  value={component.height}
                  onChange={(value) =>
                    patchAt(index, { ...component, height: Number(value ?? 0) })
                  }
                />
              </label>
            ) : null}
            {ITEM_WIDGETS.includes(component.type) ? (
              <label>
                圆角（rpx）
                <InputNumber
                  min={0}
                  max={60}
                  value={component.radius}
                  onChange={(value) =>
                    patchAt(index, { ...component, radius: Number(value ?? 0) })
                  }
                />
              </label>
            ) : null}
          </Space>

          {ITEM_WIDGETS.includes(component.type) ? (
            <Space orientation="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
              {component.items.map((item, itemIndex) => (
                <Space key={`${component.id}-${itemIndex}`} size={8} wrap align="end">
                  <label>
                    图片
                    <ImageUploadField
                      value={item.image}
                      onChange={(image) =>
                        patchAt(index, {
                          ...component,
                          items: patchItem(component, itemIndex, { image }),
                        })
                      }
                    />
                  </label>
                  {component.type === "buttons" ? (
                    <label>
                      按钮文字
                      <Input
                        value={item.text}
                        maxLength={30}
                        style={{ width: 140 }}
                        onChange={(event) =>
                          patchAt(index, {
                            ...component,
                            items: patchItem(component, itemIndex, {
                              text: event.target.value,
                            }),
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label>
                    跳转链接
                    <Input
                      value={item.link}
                      maxLength={300}
                      style={{ width: 240 }}
                      placeholder="/pages/create/create 或 https://"
                      onChange={(event) =>
                        patchAt(index, {
                          ...component,
                          items: patchItem(component, itemIndex, {
                            link: event.target.value,
                          }),
                        })
                      }
                    />
                  </label>
                  <Button
                    size="small"
                    danger
                    disabled={component.items.length <= 1}
                    onClick={() =>
                      patchAt(index, {
                        ...component,
                        items: component.items.filter((_, i) => i !== itemIndex),
                      })
                    }
                  >
                    删除
                  </Button>
                </Space>
              ))}
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={component.items.length >= 12}
                onClick={() =>
                  patchAt(index, {
                    ...component,
                    items: [...component.items, { image: "", text: "", link: "" }],
                  })
                }
              >
                添加一项
              </Button>
            </Space>
          ) : null}
        </div>
      ))}
    </Space>
  );
}
