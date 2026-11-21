"use client";
// 上门服务列表页的公共外壳：筛选条 + 表格（统一 loading/空态/分页口径），各页签不要再各自写一遍。
import { Space, Table } from "antd";
import type { TableProps } from "antd";
import type { ReactNode } from "react";

/** 列表筛选条：控件靠左、主操作靠右，超过一行自动折行。 */
export function FilterBar({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <Space wrap size={12} align="end">
        {children}
      </Space>
      {action ? <Space wrap size={8}>{action}</Space> : null}
    </div>
  );
}

/** 服务端分页表格：`total` 为空按「取满一页就还有下一页」处理。 */
export function DataTable<T>({
  rows,
  columns,
  total,
  page,
  pageSize = 20,
  loading,
  rowKey = "id",
  onPage,
  scroll,
  expandable,
}: {
  rows: T[];
  columns: TableProps<T>["columns"];
  total?: number;
  page: number;
  pageSize?: number;
  loading?: boolean;
  rowKey?: string | ((row: T) => string);
  onPage?: (page: number, pageSize: number) => void;
  scroll?: { x?: number | string; y?: number | string };
  expandable?: TableProps<T>["expandable"];
}) {
  const known = typeof total === "number";
  return (
    <Table<T>
      size="small"
      rowKey={rowKey}
      loading={loading}
      columns={columns}
      dataSource={rows}
      scroll={scroll ?? { x: "max-content" }}
      expandable={expandable}
      pagination={
        onPage
          ? {
              current: page,
              pageSize,
              total: known ? total : page * pageSize + (rows.length >= pageSize ? 1 : 0),
              showSizeChanger: false,
              onChange: onPage,
            }
          : false
      }
    />
  );
}

/** 详情抽屉/弹窗里的键值块：统一「标签在上、值在下」的读法。 */
export function Descriptions({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div className="muted text-12">{item.label}</div>
          <div>{item.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
