/**
 * 产物体积的唯一显示口径：B / KB / MB / GB。
 *
 * 之前 11 个页面各写一份 `formatSize`，舍入规则并存四种：同一个代码包在工具发布页
 * 显示 3.2 MB、在平台后台台账显示 3.20 MB、在数字人页对不足 1KB 的文件显示「0 KB」
 * （看起来像出包失败）。显示口径不该由各页自己决定，所以收成一份。
 *
 * 「—」专用于「还没有体积这回事」（空台账、模板目录缺失），与真实的 0 区分开。
 * 计费口径的字节单位换算不在这里，那是 `lib/tool-launch` 的 `formatBytes`（按量价目用它自己的档位）。
 */
export function formatBytes(bytes: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
