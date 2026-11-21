"use client";

type Column = { key: string; label: string };

const escape = (value: unknown): string => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** 前端直接导出当前列表为 CSV（带 BOM，Excel 打开中文不乱码）。 */
export function downloadCsv(
  fileName: string,
  rows: Record<string, unknown>[],
  columns: Column[],
) {
  const header = columns.map((column) => escape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escape(row[column.key])).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
  URL.revokeObjectURL(url);
}
