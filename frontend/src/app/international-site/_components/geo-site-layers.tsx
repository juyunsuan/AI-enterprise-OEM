"use client";

import { Button, Space, Typography } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { TYPE_LABELS, type GeoSiteNode } from "./geo-site-elements";
import { walkTree } from "./geo-site-tree";

/**
 * 图层面板：树形列出全部节点。拖拽只能决定「落进哪个容器」，
 * 同级顺序在这里用上下箭头调，避免画布里小目标难以精确落点。
 */
export function Layers({
  nodes,
  selectedId,
  onSelect,
  onShift,
  onDuplicate,
  onRemove,
}: {
  nodes: GeoSiteNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShift: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const rows: { node: GeoSiteNode; depth: number; root: boolean }[] = [];
  walkTree(nodes, (node, depth, parentId) => {
    rows.push({ node, depth, root: !parentId && node.type === "__body" });
  });

  return (
    <div style={{ maxHeight: 260, overflow: "auto" }}>
      {rows.map(({ node, depth }) => (
        <div
          key={node.id}
          onClick={() => onSelect(node.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 6px",
            paddingLeft: 6 + depth * 12,
            borderRadius: 6,
            cursor: "pointer",
            background: selectedId === node.id ? "#eff6ff" : "transparent",
            color: selectedId === node.id ? "#1d4ed8" : "#334155",
          }}
        >
          <Typography.Text
            ellipsis
            style={{ flex: 1, minWidth: 0, fontSize: 12 }}
            title={`${TYPE_LABELS[node.type] || node.type} · ${node.name}`}
          >
            {TYPE_LABELS[node.type] || node.type}
            <span style={{ color: "#94a3b8", marginLeft: 6 }}>{node.name}</span>
          </Typography.Text>
          {node.type === "__body" ? null : (
            <Space size={0}>
              <Button
                size="small"
                type="text"
                icon={<ArrowUpOutlined aria-hidden />}
                onClick={(event) => {
                  event.stopPropagation();
                  onShift(node.id, -1);
                }}
              />
              <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined aria-hidden />}
                onClick={(event) => {
                  event.stopPropagation();
                  onShift(node.id, 1);
                }}
              />
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined aria-hidden />}
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate(node.id);
                }}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined aria-hidden />}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(node.id);
                }}
              />
            </Space>
          )}
        </div>
      ))}
    </div>
  );
}
