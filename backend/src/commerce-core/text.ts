/** 未知值 → 文本列：对象/数组一律回落为空串，避免 `[object Object]` 进入接口或日志。 */
export const safeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};
