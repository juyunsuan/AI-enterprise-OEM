"use client";
import { CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Select, Space, Tag } from "antd";
import type { BrandDiyPageRow, BrandMeta } from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { StatusTag } from "../../_components/brand-common";

/**
 * 页面列表条：一份店铺下的所有装修页（默认页 + 活动页）。
 *
 * 「切页」下拉与列表点击是同一个状态源（URL 上的 pageId），
 * 所以收藏链接、从上线自检跳转过来都能直接落到指定页面。
 */
export function PagesPanel({
  pages,
  currentId,
  meta,
  loading,
  onSelect,
  onCreate,
  onCopy,
  onRemove,
}: {
  pages: BrandDiyPageRow[];
  currentId: number;
  meta: BrandMeta | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onCopy: (row: BrandDiyPageRow) => void;
  onRemove: (row: BrandDiyPageRow) => void;
}) {
  return (
    <Panel
      title="页面"
      titleExtra={loading ? <span className="muted text-12">读取中…</span> : null}
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined aria-hidden />} onClick={onCreate}>
          新建页面
        </Button>
      }
    >
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <div>
          <span className="muted text-12">切页&nbsp;</span>
          <Select
            size="small"
            style={{ width: 200 }}
            value={currentId || undefined}
            placeholder="选择要编辑的页面"
            onChange={(value: number) => onSelect(value)}
            options={pages.map((row) => ({
              value: row.id,
              label: row.isDefault ? `${row.name}（默认页）` : row.name,
            }))}
          />
        </div>

        {pages.length ? (
          pages.map((row) => {
            const active = row.id === currentId;
            return (
              <div
                key={row.id}
                onClick={() => onSelect(row.id)}
                style={{
                  border: `1px solid ${active ? "#1677ff" : "var(--border, #f0f0f0)"}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: active ? "rgba(22,119,255,.06)" : undefined,
                }}
              >
                <Space wrap size={4} style={{ marginBottom: 2 }}>
                  <strong>{row.name}</strong>
                  {row.isDefault ? <Tag color="blue">默认页</Tag> : null}
                  <StatusTag meta={meta} kind="diyPageType" value={row.type} />
                  <StatusTag meta={meta} kind="diyStatus" value={row.status} />
                </Space>
                <div className="muted text-12">
                  {row.componentCount} 个组件 · 更新于 {fmtTime(row.updatedAt)}
                  <br />
                  {row.publishedAt ? `发布于 ${fmtTime(row.publishedAt)}` : "还没发布过"}
                </div>
                <Space size={0} style={{ marginTop: 4 }}>
                  <Button
                    size="small"
                    type="link"
                    icon={<CopyOutlined aria-hidden />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopy(row);
                    }}
                  >
                    复制
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    icon={<DeleteOutlined aria-hidden />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(row);
                    }}
                  >
                    删除
                  </Button>
                </Space>
              </div>
            );
          })
        ) : (
          <EmptyState
            text="这家店铺还没有装修页。建第一个页面，顾客打开小程序才不会看到空白。"
            action={
              <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={onCreate}>
                新建页面
              </Button>
            }
          />
        )}
      </Space>
    </Panel>
  );
}
