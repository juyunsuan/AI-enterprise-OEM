"use client";
import { Button, Space } from "antd";
import type { BrandDiyWidgetMeta } from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { groupWidgets, widgetIcon } from "./model";

/**
 * 组件库：清单与默认属性都由 `BrandMall_diyWidgets` 下发（后端白名单是唯一真源），
 * 后端加组件时这里自动出现，编辑器不会写出白名单外的类型。
 */
export function WidgetLibrary({
  widgets,
  reachedLimit,
  loading,
  onInsert,
}: {
  widgets: BrandDiyWidgetMeta[];
  reachedLimit: boolean;
  loading: boolean;
  onInsert: (meta: BrandDiyWidgetMeta) => void;
}) {
  const groups = groupWidgets(widgets);
  return (
    <Panel title="组件库">
      {loading && !widgets.length ? (
        <div className="muted text-12">组件清单读取中…</div>
      ) : null}
      {!loading && !widgets.length ? (
        <EmptyState text="组件清单读取失败，请刷新页面或联系平台检查装修配置" />
      ) : null}
      {widgets.length ? (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          {reachedLimit ? (
            <div className="muted text-12">这份页面已到 60 个组件上限，先删掉一些再添加。</div>
          ) : null}
          {groups.map((group) => (
            <div key={group.group}>
              <div className="muted text-12" style={{ marginBottom: 6 }}>
                {group.label}
              </div>
              <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(2, 1fr)" }}>
                {group.items.map((item) => {
                  const Icon = widgetIcon(item.icon);
                  return (
                    <Button
                      key={item.type}
                      size="small"
                      block
                      disabled={reachedLimit}
                      title={`加入「${item.name}」`}
                      icon={<Icon aria-hidden />}
                      onClick={() => onInsert(item)}
                      style={{ textAlign: "left", paddingInline: 6 }}
                    >
                      {item.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </Space>
      ) : null}
    </Panel>
  );
}
